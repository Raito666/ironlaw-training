import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInitialData } from '../../src/domain/seed';
import { validateAppData } from '../../src/data/backup';
import { createSession, createSessionExercise } from '../../src/domain/training';
import type { Exercise } from '../../src/domain/types';
import {
  validateOpenGymCatalogue,
  materializeOpenGym,
  ensureExercises,
  isOpenGymExercise,
} from '../../src/content/opengym-catalogue';

const raw = readFileSync('public/exercise-catalogue/opengym.json', 'utf8');
const data = () => JSON.parse(raw);
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('openGym text catalogue contract', () => {
  it('validates real counts, variants and incomplete Chinese translations', () => {
    const catalogue = validateOpenGymCatalogue(data());
    expect(catalogue.entries).toHaveLength(5632);
    expect(Object.keys(catalogue.aliases)).toHaveLength(922);
    const bench = catalogue.entries.find((entry) => entry.canonicalId === '0025')!;
    expect(bench).toMatchObject({
      id: 'og:0025',
      nameZh: '杠铃卧推',
      primaryTarget: 'chest',
      kind: 'weight-reps',
    });
    expect(bench.instructionsZh.length).toBeGreaterThan(0);
    const untranslated = catalogue.entries.find(
      (entry) => entry.provenance.textSource === 'opengym' && entry.instructionsZh.length === 0,
    )!;
    expect(untranslated.nameZh).not.toBe('');
    expect(untranslated.instructionsEn.length).toBeGreaterThan(0);
    expect(untranslated.descriptionEn).not.toBe('');
    expect(untranslated.descriptionZh).toBe('');
    expect(catalogue.entries.find((entry) => entry.canonicalId === '0356')!.variants.femaleId).toBe('2690');
    expect(catalogue.entries.some((entry) => entry.canonicalId === '2690')).toBe(true);
    expect(catalogue.aliases['2690']).toBeUndefined();
  });
  it('rejects invalid ids, dangling/chained aliases, bad counts, unsafe fields and variants', () => {
    for (const change of [
      (v: any) => {
        v.entries[0].id = 'og:unknown';
      },
      (v: any) => {
        v.entries[0].kind = 'calories';
      },
      (v: any) => {
        v.aliases['2440'] = '99999';
      },
      (v: any) => {
        v.aliases['2440'] = Object.keys(v.aliases).find((id) => id !== '2440');
      },
      (v: any) => {
        v.counts.canonicalEntries++;
      },
      (v: any) => {
        v.entries[0].media = { clip: '/restricted.mp4' };
      },
      (v: any) => {
        v.entries[0].primaryTargets = ['neck'];
      },
      (v: any) => {
        v.entries[0].variants.femaleId = '99999';
      },
    ]) {
      const value = data();
      change(value);
      expect(() => validateOpenGymCatalogue(value)).toThrow(/目录/);
    }
  });
  it('seeds explicit holds/cardio, self-weight, assisted movement and external loads without category guesses', () => {
    const entries = validateOpenGymCatalogue(data()).entries;
    expect(entries.filter((entry) => entry.kind === 'duration')).toHaveLength(301);
    expect(entries.every((entry) => !entry.hold || entry.kind === 'duration')).toBe(true);
    expect(
      entries.filter((entry) => entry.category === 'isometric' && !entry.hold && entry.kind !== 'duration')
        .length,
    ).toBeGreaterThan(0);
    expect(entries.find((entry) => entry.canonicalId === '0001')!.kind).toBe('reps');
    expect(entries.find((entry) => entry.canonicalId === '0009')!.kind).toBe('reps');
    expect(entries.find((entry) => entry.canonicalId === '1027')!.kind).toBe('weight-reps');
    expect(entries.find((entry) => entry.canonicalId === '0025')!.kind).toBe('weight-reps');
    expect(entries.some((entry) => entry.primaryTarget === null)).toBe(true);
  });
  it('materializes only the six strict Exercise fields, compatible with old backups and template references', () => {
    const entry = validateOpenGymCatalogue(data()).entries.find((entry) => entry.canonicalId === '0025')!;
    const exercise = materializeOpenGym(entry);
    expect(Object.keys(exercise).sort()).toEqual([
      'description',
      'equipment',
      'id',
      'kind',
      'muscle',
      'name',
    ]);
    const old = createInitialData();
    const original = structuredClone(old);
    const next = ensureExercises(old, [exercise, exercise]);
    expect(next.exercises).toHaveLength(old.exercises.length + 1);
    expect(old).toEqual(original);
    expect(validateAppData(next)).toEqual(next);
    expect(ensureExercises(next, [{ ...exercise, name: 'changed upstream' }])).toBe(next);
    expect(next.exercises.at(-1)!.name).toBe('杠铃卧推');
    expect(ensureExercises(old, [])).toBe(old);
    expect(ensureExercises(old, [old.exercises[0]])).toBe(old);
    const fromTemplate = createSession(
      {
        id: 'new-template',
        name: 'test',
        description: '',
        restSeconds: 60,
        updatedAt: new Date().toISOString(),
        items: [{ id: 'item', exerciseId: exercise.id, sets: 1, weightKg: 0, reps: 5, durationSeconds: 30 }],
      },
      next.exercises,
    );
    expect(fromTemplate.exercises[0].exercise.id).toBe(exercise.id);
  });
  it('enforces the existing 5000 saved-exercise boundary and does not rewrite any old identity/snapshot', () => {
    const base = createInitialData();
    const exercise = materializeOpenGym(validateOpenGymCatalogue(data()).entries[0]);
    const old: Exercise = { ...exercise, id: '2440', name: 'old user label' };
    const session = createSession(null, []);
    session.exercises = [createSessionExercise(old)];
    base.exercises.push(old);
    base.sessions.push(session);
    const next = ensureExercises(base, [exercise]);
    expect(next.sessions).toBe(base.sessions);
    expect(next.sessions[0].exercises[0].exercise).toEqual(old);
    expect(next.exercises.find((entry) => entry.id === '2440')).toEqual(old);
    const full = {
      ...base,
      templates: [],
      exercises: Array.from({ length: 5000 }, (_, index) => ({ ...exercise, id: `saved-${index}` })),
    };
    expect(() => ensureExercises(full, [exercise])).toThrow(/5000/);
    expect(isOpenGymExercise('og:0025')).toBe(true);
    expect(isOpenGymExercise('0025')).toBe(false);
    expect(isOpenGymExercise('user-custom')).toBe(false);
  });
});

function memoryCache(initial?: Response) {
  let saved = initial;
  const cache = {
    match: vi.fn(async () => saved?.clone()),
    put: vi.fn(async (_key: string, response: Response) => {
      saved = response.clone();
    }),
    delete: vi.fn(async () => {
      saved = undefined;
      return true;
    }),
  };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  return cache;
}

describe('lazy local text loading and offline recovery', () => {
  it('coalesces concurrent loads, indexes aliases synchronously after load, and never requests remote media', async () => {
    const cache = memoryCache();
    const fetcher = vi.fn(async () => new Response(raw));
    vi.stubGlobal('fetch', fetcher);
    const api = await import('../../src/content/opengym-catalogue');
    expect(api.openGymEntryFor('og:0025')).toBeUndefined();
    const one = api.loadOpenGymCatalogue();
    const two = api.loadOpenGymCatalogue();
    expect(one).toBe(two);
    const catalogue = await one;
    expect(catalogue.entries).toHaveLength(5632);
    expect(await api.loadOpenGymCatalogue()).toBe(catalogue);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/exercise-catalogue/opengym.json');
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(api.openGymEntryFor('og:2440')).toBe(api.openGymEntryFor('og:0025'));
    expect(api.openGymEntryFor('2440')).toBeUndefined(); // A legacy/custom raw id is never adopted as catalogue data.
    expect(api.canonicalOpenGymId('og:2440')).toBe('og:0025');
    expect(api.canonicalOpenGymId('2440')).toBe('0025');
    expect(api.canonicalOpenGymId('user-2440')).toBe('user-2440');
  });
  it('returns a validated separate text-cache copy when the local fetch fails', async () => {
    const cache = memoryCache(new Response(raw));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const api = await import('../../src/content/opengym-catalogue');
    expect((await api.loadOpenGymCatalogue()).counts.canonicalEntries).toBe(5632);
    expect(cache.match).toHaveBeenCalledTimes(1);
  });
  it('reports unavailable or corrupt text explicitly, then permits a retry after recovery', async () => {
    const cache = memoryCache(new Response('{broken'));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(raw));
    vi.stubGlobal('fetch', fetcher);
    const api = await import('../../src/content/opengym-catalogue');
    await expect(api.loadOpenGymCatalogue()).rejects.toThrow(/动作文字目录/);
    expect(api.openGymEntryFor('og:0025')).toBeUndefined();
    expect(cache.delete).toHaveBeenCalledTimes(1);
    expect((await api.loadOpenGymCatalogue()).entries).toHaveLength(5632);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('keeps a successful readable catalogue available when browser caching is denied', async () => {
    vi.stubGlobal('caches', {
      open: vi.fn(async () => {
        throw new Error('cache denied');
      }),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(raw)),
    );
    const api = await import('../../src/content/opengym-catalogue');
    expect((await api.loadOpenGymCatalogue()).entries).toHaveLength(5632);
  });
});
