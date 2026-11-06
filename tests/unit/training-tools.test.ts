import { describe, expect, it } from 'vitest';
import {
  calculatePlateLoad,
  buildWarmupPreview,
  relativeStrengthSeries,
  suggestTarget,
} from '../../src/features/training-tools/calculations';
import { builtinExercises } from '../../src/content/catalog';
import { createSession, createSessionExercise } from '../../src/domain/training';
import type { BodyMetric, Exercise, Session } from '../../src/domain/types';

const bench = builtinExercises.find((exercise) => exercise.id === 'ex-bench')!;
const inventory = [
  { weight: 20, count: 4 },
  { weight: 1.25, count: 2 },
];

describe('temporary symmetric plate loading', () => {
  it('includes the actual bar and uses the inventory once per side', () => {
    expect(calculatePlateLoad({ total: 62.5, bar: 20, unit: 'kg', inventory })).toMatchObject({
      status: 'exact',
      perSide: 21.25,
      plates: [20, 1.25],
      achievableTotal: 62.5,
      missing: 0,
    });
  });
  it('finds an exact non-greedy fit with bounded stock', () => {
    expect(
      calculatePlateLoad({
        total: 44,
        bar: 20,
        unit: 'kg',
        inventory: [
          { weight: 6, count: 2 },
          { weight: 4, count: 6 },
        ],
      }),
    ).toMatchObject({ status: 'exact', plates: [4, 4, 4], achievableTotal: 44 });
  });
  it('returns the closest lower symmetric load and the total missing weight', () => {
    expect(
      calculatePlateLoad({ total: 65, bar: 20, unit: 'kg', inventory: [{ weight: 20, count: 2 }] }),
    ).toMatchObject({ status: 'unachievable', plates: [20], achievableTotal: 60, missing: 5 });
  });
  it('calculates pounds in their own inventory without kilogram rounding', () => {
    expect(
      calculatePlateLoad({
        total: 137.5,
        bar: 45,
        unit: 'lb',
        inventory: [
          { weight: 45, count: 2 },
          { weight: 1.25, count: 2 },
        ],
      }),
    ).toMatchObject({ status: 'exact', plates: [45, 1.25], achievableTotal: 137.5 });
  });
  it('distinguishes a target below the bar from a valid empty bar', () => {
    expect(calculatePlateLoad({ total: 15, bar: 20, unit: 'kg', inventory: [] }).status).toBe('below-bar');
    expect(calculatePlateLoad({ total: 20, bar: 20, unit: 'kg', inventory: [] })).toMatchObject({
      status: 'exact',
      plates: [],
      achievableTotal: 20,
    });
  });
  it('refuses odd physical plate counts instead of prescribing unequal sides', () => {
    expect(
      calculatePlateLoad({ total: 60, bar: 20, unit: 'kg', inventory: [{ weight: 20, count: 3 }] }).status,
    ).toBe('unequal-inventory');
  });
  it.each([NaN, Infinity, -1, 5001])('bounds invalid total %s before any search allocation', (total) => {
    expect(calculatePlateLoad({ total, bar: 20, unit: 'kg', inventory }).status).toBe('invalid');
  });
  it('rejects invalid inventories and does not mutate a valid one', () => {
    expect(
      calculatePlateLoad({ total: 60, bar: 20, unit: 'kg', inventory: [{ weight: 0, count: 2 }] }).status,
    ).toBe('invalid');
    expect(
      calculatePlateLoad({ total: 60, bar: 20, unit: 'kg', inventory: [{ weight: 20, count: 42 }] }).status,
    ).toBe('invalid');
    const source = structuredClone(inventory);
    calculatePlateLoad({ total: 62.5, bar: 20, unit: 'kg', inventory });
    expect(inventory).toEqual(source);
  });
  it('bounds absent bars and duplicate, fractional or overlong inventories', () => {
    expect(calculatePlateLoad({ total: 60, bar: NaN, unit: 'kg', inventory }).status).toBe('invalid');
    expect(
      calculatePlateLoad({ total: 60, bar: 20, unit: 'kg', inventory: [...inventory, inventory[0]] }).status,
    ).toBe('invalid');
    expect(
      calculatePlateLoad({ total: 60, bar: 20, unit: 'kg', inventory: [{ weight: 1.1, count: 2 }] }).status,
    ).toBe('invalid');
    expect(
      calculatePlateLoad({
        total: 60,
        bar: 20,
        unit: 'kg',
        inventory: Array.from({ length: 25 }, (_, index) => ({ weight: index + 1, count: 2 })),
      }).status,
    ).toBe('invalid');
  });
  it('never rounds an unachievable fractional request up above the target', () => {
    expect(calculatePlateLoad({ total: 60.1, bar: 20, unit: 'kg', inventory })).toMatchObject({
      status: 'unachievable',
      achievableTotal: 60,
      missing: 0.1,
    });
  });
});

describe('warm-up preview only', () => {
  it('ramps 50%, 75%, 87.5% downward on the actual increment', () => {
    expect(
      buildWarmupPreview({ workWeightKg: 100, reps: 5, count: 3, incrementKg: 2.5, barFloorKg: 20 }).rows,
    ).toEqual([
      { weightKg: 50, reps: 5 },
      { weightKg: 75, reps: 5 },
      { weightKg: 87.5, reps: 5 },
    ]);
  });
  it('respects the bar floor without exceeding the work target or inventing ids/statuses', () => {
    expect(
      buildWarmupPreview({ workWeightKg: 22.5, reps: 8, count: 3, incrementKg: 2.5, barFloorKg: 20 }).rows,
    ).toEqual([
      { weightKg: 20, reps: 8 },
      { weightKg: 20, reps: 8 },
      { weightKg: 20, reps: 8 },
    ]);
  });
  it.each([
    { workWeightKg: 15, reps: 5, count: 3, incrementKg: 2.5, barFloorKg: 20 },
    { workWeightKg: 100, reps: 5, count: 6, incrementKg: 2.5, barFloorKg: 20 },
    { workWeightKg: 100, reps: 5, count: 3, incrementKg: 0, barFloorKg: 20 },
    { workWeightKg: NaN, reps: 5, count: 3, incrementKg: 2.5, barFloorKg: 20 },
  ])('does not generate a preview from invalid settings %#', (input) => {
    const preview = buildWarmupPreview(input);
    expect(preview.rows).toEqual([]);
    expect(preview.reason.length).toBeGreaterThan(0);
  });
});

function recorded(date: string, weight = 60): Session {
  const session = createSession(null, [], Date.parse(`${date}T02:00:00Z`));
  session.status = 'completed';
  session.date = date;
  const item = createSessionExercise(bench, 3, weight, 8);
  item.sets[0].status = 'completed';
  item.sets[1] = { ...item.sets[1], type: 'warmup', status: 'completed', weightKg: 200 };
  session.exercises = [item];
  return session;
}
const bodyMetrics: BodyMetric[] = [
  { id: 'earlier', date: '2026-10-01', weightKg: 75 },
  { id: 'later', date: '2026-10-11', weightKg: 50 },
];

describe('external load relative to a known prior bodyweight', () => {
  it('uses actual completed work and prior bodyweight without reading future measurements', () => {
    const session = recorded('2026-10-10');
    const snapshot = structuredClone({ session, bodyMetrics });
    expect(relativeStrengthSeries({ exercise: bench, sessions: [session], bodyMetrics }).points).toEqual([
      {
        date: '2026-10-10',
        sessionId: session.id,
        loadKg: 60,
        bodyWeightKg: 75,
        bodyWeightDate: '2026-10-01',
        ratio: 0.8,
      },
    ]);
    expect({ session, bodyMetrics }).toEqual(snapshot);
  });
  it('accepts day 30 but leaves out day 31 and never carries a future-only weigh-in backwards', () => {
    const sessions = [recorded('2026-10-31'), recorded('2026-11-01')];
    expect(
      relativeStrengthSeries({ exercise: bench, sessions, bodyMetrics: [bodyMetrics[0]] }).points.map(
        (point) => point.date,
      ),
    ).toEqual(['2026-10-31']);
    expect(
      relativeStrengthSeries({ exercise: bench, sessions: [recorded('2026-09-30')], bodyMetrics }).points,
    ).toEqual([]);
  });
  it('uses same-day bodyweight and aggregates repeated exercise blocks once per session', () => {
    const session = recorded('2026-10-01');
    const extra = createSessionExercise(bench, 1, 90, 3);
    extra.sets[0].status = 'completed';
    session.exercises.push(extra);
    expect(
      relativeStrengthSeries({ exercise: bench, sessions: [session], bodyMetrics }).points,
    ).toMatchObject([{ loadKg: 90, bodyWeightKg: 75, ratio: 1.2 }]);
  });
  it('excludes drafts, pending sets, selfweight/assisted and unknown exercise semantics', () => {
    const draft = { ...recorded('2026-10-01'), status: 'active' as const };
    expect(relativeStrengthSeries({ exercise: bench, sessions: [draft], bodyMetrics }).points).toEqual([]);
    const unknown: Exercise = { ...bench, id: 'custom-unknown' };
    expect(relativeStrengthSeries({ exercise: unknown, sessions: [], bodyMetrics }).points).toEqual([]);
    for (const id of ['ex-pushup', 'catalog-weighted-pull-up', 'catalog-assisted-pull-up']) {
      const exercise = builtinExercises.find((item) => item.id === id)!;
      const session = recorded('2026-10-01');
      session.exercises[0].exercise = exercise;
      expect(relativeStrengthSeries({ exercise, sessions: [session], bodyMetrics }).points).toEqual([]);
    }
  });
  it('ignores invalid body dates/values and rejects a window beyond 30 days', () => {
    const records = [
      { id: 'bad-date', date: '2026-09-31', weightKg: 40 },
      { id: 'bad-weight', date: '2026-10-01', weightKg: NaN },
    ];
    expect(
      relativeStrengthSeries({ exercise: bench, sessions: [recorded('2026-10-02')], bodyMetrics: records })
        .points,
    ).toEqual([]);
    expect(
      relativeStrengthSeries({
        exercise: bench,
        sessions: [recorded('2026-10-31')],
        bodyMetrics,
        maxGapDays: 31,
      }).points,
    ).toEqual([]);
  });
});

describe('explicit current-session goal trial', () => {
  function completed(reps = 8) {
    const exercise = createSessionExercise(bench, 3, 60, reps);
    exercise.sets.forEach((set) => {
      set.status = 'completed';
    });
    return exercise;
  }
  it('proposes one increment only after the explicitly entered goal is met', () => {
    const exercise = completed();
    const snapshot = structuredClone(exercise);
    expect(suggestTarget({ exercise, goal: { sets: 3, reps: 8 }, incrementKg: 2.5 })).toMatchObject({
      status: 'trial',
      weightKg: 62.5,
      reps: 8,
    });
    expect(exercise).toEqual(snapshot);
  });
  it('repeats the current load if the explicit rep goal is not met', () => {
    const exercise = completed();
    exercise.sets[1].reps = 6;
    expect(suggestTarget({ exercise, goal: { sets: 3, reps: 8 }, incrementKg: 2.5 })).toMatchObject({
      status: 'trial',
      weightKg: 60,
      reps: 8,
    });
  });
  it('does not treat warmups or unfinished work as evidence of goal completion', () => {
    const exercise = completed();
    exercise.sets[0].type = 'warmup';
    expect(suggestTarget({ exercise, goal: { sets: 3, reps: 8 }, incrementKg: 2.5 }).status).toBe(
      'unavailable',
    );
    exercise.sets[0].type = 'work';
    exercise.sets[2].status = 'pending';
    expect(suggestTarget({ exercise, goal: { sets: 3, reps: 8 }, incrementKg: 2.5 }).status).toBe(
      'unavailable',
    );
  });
  it('refuses a single-load prescription for mixed work weights or invalid goals', () => {
    const exercise = completed();
    exercise.sets[1].weightKg = 50;
    expect(suggestTarget({ exercise, goal: { sets: 3, reps: 8 }, incrementKg: 2.5 }).status).toBe(
      'unavailable',
    );
    expect(
      suggestTarget({ exercise: completed(), goal: { sets: 0, reps: 8 }, incrementKg: 2.5 }).status,
    ).toBe('unavailable');
  });
  it('refuses malformed completed evidence rather than treating it as a missed goal', () => {
    const exercise = completed();
    exercise.sets[1].reps = NaN;
    expect(suggestTarget({ exercise, goal: { sets: 3, reps: 8 }, incrementKg: 2.5 }).status).toBe(
      'unavailable',
    );
  });
  it('trials reps or time without inventing external bodyweight load', () => {
    const reps = completed(10);
    reps.exercise = builtinExercises.find((item) => item.id === 'ex-pushup')!;
    expect(suggestTarget({ exercise: reps, goal: { sets: 3, reps: 10 }, incrementKg: 2.5 })).toMatchObject({
      status: 'trial',
      reps: 11,
    });
    const time = completed();
    time.exercise = builtinExercises.find((item) => item.id === 'ex-plank')!;
    time.sets.forEach((set) => {
      set.durationSeconds = 30;
    });
    expect(
      suggestTarget({ exercise: time, goal: { sets: 3, durationSeconds: 30 }, incrementKg: 2.5 }),
    ).toMatchObject({ status: 'trial', durationSeconds: 35 });
  });
});
