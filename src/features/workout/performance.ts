import type { Exercise, Session, SessionExercise, SetRecord, SetType } from '../../domain/types';
import { displayWeight, fromWeight } from '../../domain/units';
import { isWorkSet, setTypeLabels } from '../../domain/sets';

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function validValues(set: SetRecord, kind: Exercise['kind']): boolean {
  return Number.isFinite(set.weightKg) && set.weightKg >= 0 && set.weightKg <= 1000
    && Number.isInteger(set.reps) && set.reps >= (kind === 'duration' ? 0 : 1) && set.reps <= 1000
    && Number.isInteger(set.durationSeconds) && set.durationSeconds >= (kind === 'duration' ? 1 : 0) && set.durationSeconds <= 86400;
}

function values(set: SetRecord): Pick<SetRecord, 'weightKg' | 'reps' | 'durationSeconds'> {
  return { weightKg: set.weightKg, reps: set.reps, durationSeconds: set.durationSeconds };
}

function completedBefore(history: Session[], beforeDate: string, excludeId?: string) {
  if (!validDate(beforeDate)) return [];
  return history
    .filter((session) => session.status === 'completed' && session.id !== excludeId
      && validDate(session.date) && session.date <= beforeDate && Number.isFinite(Date.parse(session.startedAt)))
    .sort((a, b) => b.date.localeCompare(a.date) || Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export type ExerciseSetHistory = Pick<Session, 'id' | 'name' | 'date' | 'exercises'>;

export function exerciseSetHistory(history: Session[], exercise: Exercise, beforeDate = today(), excludeId?: string): ExerciseSetHistory[] {
  return completedBefore(history, beforeDate, excludeId).flatMap(({ id, name, date, exercises }) => {
    const matches = exercises.filter((item) => item.exercise.id === exercise.id && item.exercise.kind === exercise.kind
      && item.sets.some((set) => set.status === 'completed'));
    return matches.length ? [{ id, name, date, exercises: matches }] : [];
  });
}

export function previousSetsByGroup(history: ExerciseSetHistory[], item: SessionExercise) {
  const typeSets = new Map<SetType, SetRecord[]>();
  const types = Object.keys(setTypeLabels) as SetType[];
  for (const entry of history) {
    const sets = entry.exercises.flatMap((exercise) => exercise.sets);
    for (const type of types) {
      if (typeSets.has(type)) continue;
      const matching = sets.filter((set) => set.type === type);
      if (matching.some((set) => set.status === 'completed' && validValues(set, item.exercise.kind))) typeSets.set(type, matching);
    }
    if (typeSets.size === types.length) break;
  }
  const counts = { warmup: 0, work: 0, drop: 0, failure: 0 };
  return item.sets.map(({ type }) => {
    const rank = counts[type]++;
    const candidate = typeSets.get(type)?.[rank];
    if (candidate?.status === 'completed' && validValues(candidate, item.exercise.kind)) return candidate;
    return undefined;
  });
}

export function canCopyHistorySet(kind: Exercise['kind'], target: SetRecord, source: SetRecord) {
  return target.status === 'pending' && source.type === target.type && source.status === 'completed' && validValues(source, kind);
}

export function copyHistorySet(item: SessionExercise, targetId: string, source: SetRecord): SessionExercise {
  return { ...item, sets: item.sets.map((set) => set.id === targetId && canCopyHistorySet(item.exercise.kind, set, source)
    ? { ...set, ...values(source) } : set) };
}

export function formatSetValue(set: SetRecord, kind: Exercise['kind'], unit: 'kg' | 'lb') {
  if (kind === 'duration') return `${set.durationSeconds} 秒`;
  if (kind === 'weight-reps') return `${displayWeight(set.weightKg, unit)} ${unit} × ${set.reps}`;
  return `${set.reps} 次`;
}

export function lastWorkSet(history: Session[], exercise: Exercise, beforeDate = today(), excludeId?: string): SetRecord | undefined {
  const sessions = completedBefore(history, beforeDate, excludeId);
  let fallback: SetRecord | undefined;
  for (const session of sessions) {
    for (let exerciseIndex = session.exercises.length - 1; exerciseIndex >= 0; exerciseIndex--) {
      const item = session.exercises[exerciseIndex];
      if (item.exercise.id !== exercise.id || item.exercise.kind !== exercise.kind) continue;
      for (let setIndex = item.sets.length - 1; setIndex >= 0; setIndex--) {
        const set = item.sets[setIndex];
        if (set.type === 'work' && set.status === 'completed' && validValues(set, exercise.kind)) return { ...set };
        if (!fallback && isWorkSet(set) && set.status === 'completed' && validValues(set, exercise.kind)) fallback = { ...set };
      }
    }
  }
  return fallback;
}

export function seedExercise(item: SessionExercise, history: Session[], beforeDate?: string, excludeId?: string): SessionExercise {
  const previous = lastWorkSet(history, item.exercise, beforeDate, excludeId);
  if (!previous) return item;
  return { ...item, sets: item.sets.map((set) => set.status === 'pending' ? { ...set, ...values(previous) } : set) };
}

export function nextSuggestedSet(item: SessionExercise, history: Session[], newId: string, beforeDate?: string, excludeId?: string): SetRecord {
  const latest = (status: SetRecord['status']) => {
    for (let index = item.sets.length - 1; index >= 0; index--) {
      const set = item.sets[index];
      if (set.status === status && validValues(set, item.exercise.kind)) return set;
    }
    return undefined;
  };
  const source = latest('completed') ?? lastWorkSet(history, item.exercise, beforeDate, excludeId) ?? latest('pending');
  const { rpe: _rpe, ...suggestion } = source ?? { type: 'work' as const, weightKg: 0, reps: 10, durationSeconds: 30 };
  return { ...suggestion, id: newId, status: 'pending' };
}

export function copyPrevious(item: SessionExercise, setId: string): SessionExercise {
  const index = item.sets.findIndex((set) => set.id === setId);
  if (index <= 0 || item.sets[index].status === 'completed') return item;
  return { ...item, sets: item.sets.map((set, setIndex) => setIndex === index ? { ...set, ...values(item.sets[index - 1]) } : set) };
}

export function adjustWeight(kg: number, unit: 'kg' | 'lb', direction: 1 | -1): number {
  const current = Number.isFinite(kg) ? kg : 0;
  const next = Math.min(1000, Math.max(0, current + direction * fromWeight(unit === 'lb' ? 5 : 2.5, unit)));
  return Math.round(next * 1_000_000) / 1_000_000;
}

export function adjustCount(value: number, direction: 1 | -1, max = 1000): number {
  const upper = Number.isFinite(max) ? Math.max(1, Math.floor(max)) : 1000;
  const current = Number.isFinite(value) ? Math.round(value) : 1;
  return Math.min(upper, Math.max(1, current + direction));
}
