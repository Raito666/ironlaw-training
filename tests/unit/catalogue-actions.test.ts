import { expect, it } from 'vitest';
import { createInitialData } from '../../src/domain/seed';
import { createSession, sessionStats } from '../../src/domain/training';
import { addToTraining, insertWarmups } from '../../src/features/workout/catalogue-actions';

it('keeps completed sets and the original note when substituting the remaining sets', () => {
  const data = createInitialData();
  const session = createSession(data.templates[0], data.exercises);
  const original = session.exercises[0];
  original.note = '杠铃架 5 档';
  original.sets[0] = { ...original.sets[0], status: 'completed', weightKg: 65, reps: 8 };
  original.sets[1] = { ...original.sets[1], type: 'warmup' };
  const alternative = data.exercises.find((exercise) => exercise.kind === 'duration')!;
  const next = addToTraining(session, alternative, [], original.id);
  expect(next.exercises[0]).toEqual({ ...original, sets: [original.sets[0]] });
  expect(next.exercises[1].exercise.id).toBe(alternative.id);
  expect(next.exercises[1].sets.map(({ status, type }) => ({ status, type }))).toEqual(
    original.sets.slice(1).map(({ type }) => ({ status: 'pending', type })),
  );
  expect(next.exercises[1].sets.every(({ durationSeconds }) => durationSeconds > 0)).toBe(true);
  expect(next.exercises.slice(2)).toEqual(session.exercises.slice(1));
  expect(sessionStats(next).volumeKg).toBe(520);
});

it('preserves an exercise note before the first group and does not copy a work load to a replacement warmup', () => {
  const data = createInitialData();
  const session = createSession(data.templates[0], data.exercises);
  const original = session.exercises[0];
  original.note = '架子偏低';
  original.sets[0] = { ...original.sets[0], type: 'warmup', reps: 6 };
  const alternative = data.exercises.find(({ id }) => id === 'ex-bench')!;
  const history = createSession(data.templates[0], data.exercises);
  history.status = 'completed';
  history.exercises[1].sets[0] = { ...history.exercises[1].sets[0], status: 'completed', weightKg: 70, reps: 8 };
  const next = addToTraining(session, alternative, [history], original.id);
  expect(next.exercises[0]).toEqual({ ...original, sets: [] });
  expect(next.exercises[1].sets[0]).toMatchObject({ type: 'warmup', weightKg: 0, reps: 6 });
  expect(next.exercises[1].sets[1]).toMatchObject({ type: 'work', weightKg: 70, reps: 8 });
});
it('inserts only pending warmups and retains completed evidence without rewriting it', () => {
  const data = createInitialData(),
    session = createSession(data.templates[0], data.exercises);
  session.exercises[0].sets[0].status = 'completed';
  const before = structuredClone(session);
  let n = 0;
  const next = insertWarmups(
    session,
    session.exercises[0].id,
    [{ weightKg: 20, reps: 5 }],
    () => `warmup-${++n}`,
  );
  expect(next.exercises[0].sets[0]).toMatchObject({
    id: 'warmup-1',
    type: 'warmup',
    status: 'pending',
    weightKg: 20,
    reps: 5,
  });
  expect(next.exercises[0].sets.slice(1)).toEqual(before.exercises[0].sets);
  expect(session).toEqual(before);
});
it('rechecks current status, identity, group and action caps at the transaction boundary', () => {
  const data = createInitialData(),
    session = createSession(data.templates[0], data.exercises);
  expect(() =>
    insertWarmups({ ...session, status: 'paused' }, session.exercises[0].id, [{ weightKg: 10, reps: 5 }]),
  ).toThrow();
  expect(() => insertWarmups(session, 'missing', [{ weightKg: 10, reps: 5 }])).toThrow();
  expect(() => insertWarmups(session, session.exercises[0].id, [{ weightKg: -1, reps: 5 }])).toThrow();
  session.exercises[0].sets = Array.from({ length: 30 }, (_, i) => ({
    ...session.exercises[0].sets[0],
    id: `set-${i}`,
  }));
  expect(() => insertWarmups(session, session.exercises[0].id, [{ weightKg: 10, reps: 5 }])).toThrow();
  expect(() => addToTraining({ ...session, status: 'review' }, data.exercises[0], data.sessions)).toThrow();
  expect(() => addToTraining(session, data.exercises[0], data.sessions, 'missing')).toThrow();
  session.exercises = Array.from({ length: 30 }, (_, i) => ({ ...session.exercises[0], id: `item-${i}` }));
  expect(() => addToTraining(session, data.exercises[0], data.sessions)).toThrow();
});
