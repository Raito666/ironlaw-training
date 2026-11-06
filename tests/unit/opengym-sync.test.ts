import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInitialData } from '../../src/domain/seed';
import { createSession } from '../../src/domain/training';
import { snapshotOf, applySnapshot } from '../../src/sync/model';
import { synchronize } from '../../src/sync/engine';
import { decodeSnapshot, encodeSnapshot } from '../../src/opengym/state-map';
import { createOpenGymApi, normalizeServer, serializeCredential } from '../../src/opengym/api';
import { openGymTransport } from '../../src/opengym/transport';

afterEach(() => vi.unstubAllGlobals());
describe('openGym lossless namespace', () => {
  it('round trips every local record and keeps drafts, preferences and local revision outside the state', () => {
    const data = createInitialData();
    data.revision = 91;
    data.settings.unit = 'lb';
    data.settings.theme = 'light';
    const draft = createSession(null, data.exercises, Date.now());
    const archived = structuredClone(draft);
    archived.id = 'history';
    archived.status = 'cancelled';
    archived.exercises = [
      {
        id: 'entry',
        exercise: { ...data.exercises[0], name: '历史快照' },
        note: '说明',
        sets: [
          {
            id: 'set',
            type: 'failure',
            rpe: 9.5,
            status: 'skipped',
            weightKg: 33.25,
            reps: 8,
            durationSeconds: 13,
          },
        ],
      },
    ];
    data.sessions = [draft, archived];
    data.bodyMetrics = [
      {
        id: 'body',
        date: '2026-11-02',
        bodyFatPct: 21.5,
        measurements: { arm: 30.3, thigh: 55 },
        note: '完整身体记录',
      },
    ];
    const shared = snapshotOf(data);
    shared.tombstones = ['sessions:removed'];
    const original = {
      _rev: 7,
      _wid: 'abc',
      _wids: ['old'],
      _ts: 100,
      edited: { queue: 99 },
      deleted: { workouts: { gone: 98 } },
      workouts: [{ id: 'native', entries: [{ _f: { note: 8 }, strange: [1, 2] }] }],
      routines: [],
      future: { retain: true },
      jianlibao: { futureField: 42, version: 1, snapshot: shared },
    };
    const next = encodeSnapshot(shared, original, 200);
    expect(decodeSnapshot(next)).toEqual(shared);
    expect(next.workouts).toEqual(original.workouts);
    expect(next.future).toEqual(original.future);
    expect(next.jianlibao).toMatchObject({ futureField: 42 });
    expect(original._ts).toBe(100);
    expect(next._ts).toBe(200);
    expect(next).not.toHaveProperty('active');
    expect(next).not.toHaveProperty('_rev');
    const applied = applySnapshot(data, decodeSnapshot(next)!);
    expect(applied.revision).toBe(91);
    expect(applied.settings).toEqual(data.settings);
    expect(applied.sessions.find((s) => s.id === draft.id)).toEqual(draft);
  });
  it('rejects invalid namespace versions and preserves absence as null', () => {
    expect(decodeSnapshot({ workouts: [] })).toBeNull();
    expect(() => decodeSnapshot({ jianlibao: { version: 2 } })).toThrow(/版本/);
  });
});
describe('openGym API transport', () => {
  it('refuses insecure nonlocal server URLs and strips no token into errors', async () => {
    expect(() => normalizeServer('http://remote.example')).toThrow(/HTTPS/);
    expect(() => normalizeServer('https://user:secret@example.test')).toThrow();
    expect(normalizeServer('http://127.0.0.1:3900/')).toBe('http://127.0.0.1:3900');
    const api = createOpenGymApi({
      server: 'http://127.0.0.1:3900',
      token: 'DO-NOT-LOG',
      fetch: async () => Response.json({ error: 'DO-NOT-LOG', token: 'DO-NOT-LOG' }, { status: 401 }),
    });
    try {
      await api.get('/api/me');
      throw new Error('unexpected');
    } catch (e) {
      expect(String(e)).not.toContain('DO-NOT-LOG');
    }
  });
  it('omits cookies with paired bearer and refuses HTML masquerading as API data', async () => {
    const seen: RequestInit[] = [];
    const api = createOpenGymApi({
      server: 'http://localhost:3900',
      token: 'synthetic',
      fetch: async (_url, init) => {
        seen.push(init!);
        return new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } });
      },
    });
    await expect(api.get('/api/me')).rejects.toThrow(/接口/);
    expect(seen[0].credentials).toBe('omit');
    expect(seen[0].redirect).toBe('error');
  });
  it('serializes WebAuthn binary response without losing transports', () => {
    const raw = new Uint8Array([255, 1]).buffer;
    expect(
      serializeCredential({
        id: 'id',
        rawId: raw,
        type: 'public-key',
        response: { clientDataJSON: raw, attestationObject: raw, getTransports: () => ['internal'] },
        getClientExtensionResults: () => ({}),
      } as unknown as PublicKeyCredential),
    ).toMatchObject({ rawId: '_wE', response: { attestationObject: '_wE', transports: ['internal'] } });
  });
  it('retries 409 with the returned rev and wid without erasing native fields or late edits', async () => {
    let local = createInitialData(),
      rev = 3,
      state = encodeSnapshot(
        snapshotOf(local),
        { workouts: [{ id: 'native' }], routines: [], unknown: 9 },
        1,
      );
    state._wid = 'first';
    state._rev = 3;
    const bodies: Record<string, unknown>[] = [];
    let first = true;
    const api = createOpenGymApi({
      server: 'http://localhost:3900',
      fetch: async (_url, init) => {
        if (init?.method !== 'PUT') return Response.json({ state, rev });
        const body = JSON.parse(String(init.body));
        bodies.push(body);
        if (first) {
          first = false;
          rev = 4;
          state._wid = 'changed';
          state._rev = 4;
          return Response.json({ error: 'conflict', state, rev }, { status: 409 });
        }
        state = body.state;
        rev++;
        state._wid = 'saved';
        state._rev = rev;
        local = { ...local, bodyMetrics: [{ id: 'late', date: '2026-11-02', weightKg: 72 }] };
        return Response.json({ ok: true, rev, wid: 'saved', ts: state._ts });
      },
    });
    local.bodyMetrics = [{ id: 'before', date: '2026-11-01', weightKg: 70 }];
    const remote = openGymTransport(api);
    const result = await synchronize(
      { base: null, lastSuccess: null },
      {
        ...remote,
        getLocal: () => local,
        active: () => true,
        apply: async (fn) => {
          local = fn(local);
          return true;
        },
      },
    );
    expect(result.conflicts).toEqual([]);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ baseRev: 3, baseWid: 'first', stamped: true });
    expect(bodies[1]).toMatchObject({ baseRev: 4, baseWid: 'changed' });
    expect(state.workouts).toEqual([{ id: 'native' }]);
    expect(state.unknown).toBe(9);
    expect(local.bodyMetrics.some((b) => b.id === 'late')).toBe(true);
  });
});
