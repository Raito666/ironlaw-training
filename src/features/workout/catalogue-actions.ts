import type { Exercise, Session } from '../../domain/types';
import { createSessionExercise, uid } from '../../domain/training';
import { seedExercise } from './performance';

export function addToTraining(
  session: Session,
  exercise: Exercise,
  history: Session[],
  replaceId?: string,
): Session {
  if (session.status !== 'active') throw new Error('请先恢复当前训练，再加入动作');
  if (replaceId && !session.exercises.some((item) => item.id === replaceId))
    throw new Error('当前动作已变化，请重新选择');
  if (!replaceId && session.exercises.length >= 30) throw new Error('单场最多30个动作');
  const item = seedExercise(createSessionExercise(exercise), history, session.date, session.id);
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    exercises: replaceId
      ? session.exercises.map((current) => (current.id === replaceId ? item : current))
      : [...session.exercises, item],
  };
}
export function insertWarmups(
  session: Session,
  exerciseId: string,
  rows: Array<{ weightKg: number; reps: number }>,
  makeId = uid,
): Session {
  const exercise = session.exercises.find((item) => item.id === exerciseId);
  if (!exercise || session.status !== 'active') throw new Error('当前动作已变化，请重新打开训练辅助');
  if (
    exercise.exercise.kind !== 'weight-reps' ||
    !rows.length ||
    rows.length > 5 ||
    rows.some(
      (row) =>
        !Number.isFinite(row.weightKg) ||
        row.weightKg < 0 ||
        row.weightKg > 1000 ||
        !Number.isSafeInteger(row.reps) ||
        row.reps < 1 ||
        row.reps > 1000,
    )
  )
    throw new Error('热身预览数值无效');
  if (exercise.sets.length + rows.length > 30) throw new Error('单个动作最多30组，请先移除不用的待完成组');
  const warmups = rows.map((row) => ({
    id: makeId(),
    type: 'warmup' as const,
    weightKg: row.weightKg,
    reps: row.reps,
    durationSeconds: 0,
    status: 'pending' as const,
  }));
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    exercises: session.exercises.map((item) =>
      item.id === exerciseId ? { ...item, sets: [...warmups, ...item.sets] } : item,
    ),
  };
}
