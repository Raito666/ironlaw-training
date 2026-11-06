import { expect, it } from 'vitest';
import { createInitialData } from '../../src/domain/seed';
import { createSession } from '../../src/domain/training';
import { addToTraining, insertWarmups } from '../../src/features/workout/catalogue-actions';
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
