// Local synthetic account only. No production address, profile or personal credentials.
import { afterAll, beforeAll, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { createInitialData } from '../../src/domain/seed';
import { snapshotOf } from '../../src/sync/model';
import { createOpenGymApi, OpenGymApiError } from '../../src/opengym/api';
import { encodeSnapshot, decodeSnapshot } from '../../src/opengym/state-map';
import { openGymTransport } from '../../src/opengym/transport';

let child: ChildProcess | undefined,
  dataDir = '',
  base = '',
  cookie = '',
  token = '';
let startupError = '';
let bound = false,
  lastHealthError = '';
const artifactRoot = path.resolve('artifacts/qa/opengym-runtime');
const password = 'Synthetic-Protocol-49372!';
async function exchange(route: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
  return fetch(base + route, {
    method,
    headers: { Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeAll(async () => {
  await mkdir(artifactRoot, { recursive: true });
  dataDir = await mkdtemp(path.join(artifactRoot, 'synthetic-'));
  const port = await new Promise<number>((resolve) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address() as net.AddressInfo;
      probe.close(() => resolve(address.port));
    });
  });
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve('server/opengym/api'),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ORIGIN: base,
      RP_ID: '127.0.0.1',
      PASSWORD_LOGIN: '1',
      MEDIA_UPLOADS: '0',
      AUDIT_LOG: '0',
    },
  });
  child.on('error', (error) => {
    startupError = error.message;
  });
  // Startup diagnostics precede creation of any test account or credential.
  child.stderr?.on('data', (chunk) => {
    if (!cookie) startupError = (startupError + String(chunk)).slice(-3000);
  });
  child.stdout?.on('data', (chunk) => {
    if (/gym-api on :\d+/.test(String(chunk))) bound = true;
  });
  let healthy = false;
  // Windows cold module loading measured 14.2s (child entry 70ms). This is fixture
  // readiness, not an application response-time assertion. Keep health/auth/CAS assertions intact.
  const startupStarted = Date.now(),
    startupDeadline = startupStarted + 20000;
  while (Date.now() < startupDeadline) {
    try {
      const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(500) });
      healthy = response.ok;
      lastHealthError = `HTTP ${response.status}`;
      if (healthy) break;
    } catch (error) {
      lastHealthError = error instanceof Error ? error.message : 'connection failed';
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(
    healthy,
    `isolated local API starts (runtime ${process.version}, elapsed ${Date.now() - startupStarted}ms, exit ${child.exitCode}, bound ${bound}, health ${lastHealthError}): ${startupError}`,
  ).toBe(true);
  const registered = await exchange('/api/register/password', 'POST', {
    name: 'Synthetic protocol test',
    password,
  });
  expect(registered.status).toBe(200);
  cookie = registered.headers.get('set-cookie')!.split(';')[0];
  const pairing = await exchange('/api/pair/create', 'POST', { current: password }, { Cookie: cookie });
  expect(pairing.status).toBe(200);
  const { code } = await pairing.json();
  const paired = await exchange('/api/pair/redeem', 'POST', { code });
  expect(paired.status).toBe(200);
  token = (await paired.json()).token;
  expect((await exchange('/api/pair/redeem', 'POST', { code })).status).toBe(400);
}, 30000);
afterAll(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([
      new Promise((resolve) => child!.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
  // A generated, absolute child under the test-owned artifacts directory is the only deletion.
  if (dataDir.startsWith(artifactRoot + path.sep) && path.basename(dataDir).startsWith('synthetic-'))
    await rm(dataDir, { recursive: true, force: true });
});
it('authenticates both cookie and paired bearer against the actual API, with media disabled', async () => {
  expect((await exchange('/api/me', 'GET', undefined, { Cookie: cookie })).status).toBe(200);
  const api = createOpenGymApi({ server: base, token });
  expect((await api.get('/api/me')).user).toMatchObject({ name: 'Synthetic protocol test' });
  expect(await api.config()).toMatchObject({ password_login: true });
  expect(await api.get('/api/config')).not.toHaveProperty('media');
  expect(
    (await exchange('/api/media/missing', 'POST', { hashes: [] }, { Authorization: `Bearer ${token}` }))
      .status,
  ).toBe(404);
});
it('retains actual server-native entries/unknown stamps and conditions a namespace write on rev AND wid', async () => {
  const api = createOpenGymApi({ server: base, token });
  const native = {
    id: 'native',
    d: '2026-11-02',
    start: 1,
    end: 2,
    entries: [{ id: 'native-exercise', sets: [{ w: 30, r: 5, done: true, future: 12 }] }],
    _ts: 10,
    _f: { entries: 10 },
  };
  const original = {
    workouts: [native],
    routines: [],
    customEx: [],
    unknown: { nested: ['retain', 42] },
    edited: { queue: 10 },
    _ts: 10,
  };
  const accepted = await api.put('/api/data', { state: original, baseRev: 0, stamped: true });
  expect(accepted.rev).toBe(1);
  expect(typeof accepted.wid).toBe('string');
  await expect(
    api.put('/api/data', { state: original, baseRev: 1, baseWid: 'different-document', stamped: true }),
  ).rejects.toBeInstanceOf(OpenGymApiError);
  const transport = openGymTransport(api),
    pulled = await transport.pull();
  expect(pulled.snapshot).toBeNull();
  const snapshot = snapshotOf(createInitialData());
  snapshot.bodyMetrics = [
    { id: 'body', date: '2026-11-02', measurements: { arm: 31 }, bodyFatPct: 20, note: 'synthetic' },
  ];
  expect(await transport.push(snapshot, pulled.etag)).toBeTruthy();
  const stored = transport.remote()!;
  expect(stored.rev).toBe(2);
  expect(stored.state?.workouts).toEqual([native]);
  expect(stored.state?.unknown).toEqual(original.unknown);
  expect(stored.state?._wids).toContain(accepted.wid);
  expect(decodeSnapshot(stored.state)).toEqual(snapshot);
  const beforeConflict = await transport.pull();
  const stale = encodeSnapshot(snapshot, stored.state);
  await api.put('/api/data', {
    state: stale,
    baseRev: stored.rev,
    baseWid: stored.state?._wid,
    stamped: true,
  });
  expect(await transport.push(snapshot, beforeConflict.etag)).toBeNull();
});
it('rejects invalid bearer and password, revokes paired sessions on logout all', async () => {
  expect(
    (
      await exchange('/api/login/password', 'POST', {
        name: 'Synthetic protocol test',
        password: 'wrong-synthetic-password',
      })
    ).status,
  ).toBe(401);
  expect(
    (await exchange('/api/me', 'GET', undefined, { Authorization: 'Bearer invalid-synthetic' })).status,
  ).toBe(401);
  const api = createOpenGymApi({ server: base, token });
  expect(await api.post('/api/logout/all')).toMatchObject({ ok: true });
  await expect(api.get('/api/me')).rejects.toMatchObject({ status: 401 });
});
