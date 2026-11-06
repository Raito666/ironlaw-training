import type { BodyMetric, Exercise, Session, SessionExercise } from '../../domain/types';
import { guideFor } from '../../content/catalog';

/**
 * Adapted ideas/algorithms from the local openGym source snapshot (AGPL-3.0):
 * frontend/src/lib/plates.js (plateStack), history.js (insertWarmupRow),
 * relative-strength.js (relativeSeries). Snapshot commit
 * b6cfe2bbd3f099523ffbf2677438864e9a09a06f; provenance is
 * recorded in docs/engineering/OPENGYM-TRAINING-TOOLS-2026-11-02.md.
 * This TypeScript adapter uses this project's kg records and does not import
 * upstream state, target snapshots, media, storage, or automatic progression.
 */

export type WeightUnit = 'kg' | 'lb';
export interface PlateStock {
  weight: number;
  count: number;
}
export interface PlateLoadInput {
  total: number;
  bar: number;
  unit: WeightUnit;
  inventory: PlateStock[];
}
export interface PlateLoadResult {
  status: 'exact' | 'unachievable' | 'below-bar' | 'unequal-inventory' | 'invalid';
  perSide: number;
  plates: number[];
  achievableTotal: number;
  missing: number;
  reason: string;
}
export interface WarmupRow {
  weightKg: number;
  reps: number;
}
export interface WarmupInput {
  workWeightKg: number;
  reps: number;
  count: number;
  incrementKg: number;
  barFloorKg: number;
}
export interface RelativeStrengthPoint {
  date: string;
  sessionId: string;
  ratio: number;
  loadKg: number;
  bodyWeightKg: number;
  bodyWeightDate: string;
}
export interface RelativeStrengthInput {
  exercise: Exercise;
  sessions: Session[];
  bodyMetrics: BodyMetric[];
  maxGapDays?: number;
}
export interface TrialInput {
  exercise: SessionExercise;
  goal: { sets: number; reps?: number; durationSeconds?: number };
  incrementKg: number;
}
export interface TargetTrial {
  status: 'trial' | 'unavailable';
  weightKg?: number;
  reps?: number;
  durationSeconds?: number;
  reason: string;
}

const finite = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;
const integer = (value: number, min: number, max: number) =>
  Number.isInteger(value) && finite(value, min, max);
const rounded = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export function calculatePlateLoad({ total, bar, unit, inventory }: PlateLoadInput): PlateLoadResult {
  const invalid = (status: PlateLoadResult['status'], reason: string): PlateLoadResult => ({
    status,
    perSide: 0,
    plates: [],
    achievableTotal: 0,
    missing: 0,
    reason,
  });
  if (
    !finite(total, 0, 5000) ||
    !finite(bar, 0, 5000) ||
    !['kg', 'lb'].includes(unit) ||
    !Array.isArray(inventory) ||
    inventory.length > 24
  )
    return invalid('invalid', '总重量和杠重须为 0–5000 之间的数值，片型不超过 24 种。');
  const seen = new Set<number>();
  for (const item of inventory) {
    if (
      !item ||
      !finite(item.weight, 0.25, 1000) ||
      Math.abs(item.weight * 4 - Math.round(item.weight * 4)) > 1e-6 ||
      !integer(item.count, 0, 40) ||
      seen.has(item.weight)
    )
      return invalid('invalid', '每种片重须为 0.25 的倍数且不重复，数量须为 0–40 的整数。');
    seen.add(item.weight);
    if (item.count % 2) return invalid('unequal-inventory', '可用片数是两边合计，须为偶数才能左右对称配片。');
  }
  if (total < bar) return invalid('below-bar', '目标总重量小于实际杠重，请先核对两项数值。');
  const perSide = (total - bar) / 2;
  const items = inventory
    .filter((item) => item.count > 0)
    .map((item) => ({ weight: item.weight, count: item.count / 2 }))
    .sort((a, b) => b.weight - a.weight);
  // The 5000-unit input cap bounds this table at 10,001 cells per row.
  const target = Math.floor(perSide * 4 + 1e-8);
  const unreachable = 1_000_000;
  const table = Array.from({ length: items.length + 1 }, () => new Int32Array(target + 1).fill(unreachable));
  table[items.length][0] = 0;
  for (let index = items.length - 1; index >= 0; index--) {
    const size = Math.round(items[index].weight * 4);
    for (let sum = 0; sum <= target; sum++) {
      let best = table[index + 1][sum];
      for (let count = 1; count <= items[index].count && count * size <= sum; count++)
        best = Math.min(best, table[index + 1][sum - count * size] + count);
      table[index][sum] = best;
    }
  }
  let achieved = target;
  while (achieved > 0 && table[0][achieved] >= unreachable) achieved--;
  const plates: number[] = [];
  let left = achieved;
  for (let index = 0; index < items.length; index++) {
    const size = Math.round(items[index].weight * 4);
    for (let count = Math.min(items[index].count, Math.floor(left / size)); count >= 0; count--) {
      if (table[index + 1][left - count * size] + count === table[index][left]) {
        plates.push(...Array<number>(count).fill(items[index].weight));
        left -= count * size;
        break;
      }
    }
  }
  const achievableTotal = rounded(bar + achieved / 2);
  const missing = rounded(total - achievableTotal);
  return {
    status: missing < 1e-6 ? 'exact' : 'unachievable',
    perSide: rounded(perSide),
    plates,
    achievableTotal,
    missing,
    reason:
      missing < 1e-6
        ? plates.length
          ? '以下为每一侧的配片，两侧使用相同组合。'
          : '只需空杠，无需加片。'
        : '现有片数不能精确达到目标，以下为不超过目标的可配重量。',
  };
}

export function buildWarmupPreview({ workWeightKg, reps, count, incrementKg, barFloorKg }: WarmupInput): {
  rows: WarmupRow[];
  reason: string;
} {
  if (
    !finite(workWeightKg, 0.000001, 1000) ||
    !integer(reps, 1, 1000) ||
    !integer(count, 1, 5) ||
    !finite(incrementKg, 0.000001, 1000) ||
    !finite(barFloorKg, 0, workWeightKg)
  )
    return { rows: [], reason: '填写有效正式重量、1–5 组、1–1000 次和正步长；起始重量不能高于正式重量。' };
  const rows: WarmupRow[] = [];
  let previous = 0;
  for (let index = 0; index < count; index++) {
    const ramp = Math.floor((previous + (workWeightKg - previous) / 2) / incrementKg + 1e-9) * incrementKg;
    const weightKg = Math.min(workWeightKg, rounded(Math.max(barFloorKg, ramp)));
    rows.push({ weightKg, reps });
    previous = weightKg;
  }
  return { rows, reason: '按逐次缩小差距的方式试算，向下取整并保留起始重量。可按实际热身需要调整。' };
}

function dayTime(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time : null;
}

function knownExternalLift(exercise: Exercise): boolean {
  const guide = guideFor(exercise);
  return (
    exercise.kind === 'weight-reps' &&
    !!guide &&
    ['杠铃', '哑铃', '壶铃', '曲杆'].includes(exercise.equipment) &&
    !['pushup', 'pullup', 'dip'].includes(guide.profile) &&
    !/assisted|weighted-pull|weighted-chin|weighted-dip/.test(guide.slug)
  );
}

export function relativeStrengthSeries({
  exercise,
  sessions,
  bodyMetrics,
  maxGapDays = 30,
}: RelativeStrengthInput): { points: RelativeStrengthPoint[]; reason: string } {
  if (!knownExternalLift(exercise))
    return {
      points: [],
      reason: '仅计算已确认负重口径的杠铃、哑铃和壶铃动作；自重、辅助器械或未知口径暂不试算。',
    };
  if (!integer(maxGapDays, 0, 30)) return { points: [], reason: '体重参考范围须在 0–30 天内。' };
  const weights = bodyMetrics
    .filter((record) => dayTime(record.date) !== null && finite(record.weightKg ?? NaN, 0.000001, 1000))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const points: RelativeStrengthPoint[] = [];
  for (const session of sessions) {
    const time = dayTime(session.date);
    if (session.status !== 'completed' || time === null) continue;
    const body = weights.find(
      (record) => record.date <= session.date && time - dayTime(record.date)! <= maxGapDays * 86_400_000,
    );
    if (!body?.weightKg) continue;
    let loadKg = 0;
    for (const item of session.exercises) {
      if (item.exercise.id !== exercise.id || !knownExternalLift(item.exercise)) continue;
      for (const set of item.sets)
        if (
          set.status === 'completed' &&
          set.type !== 'warmup' &&
          integer(set.reps, 1, 100_000) &&
          finite(set.weightKg, 0.000001, 5000)
        )
          loadKg = Math.max(loadKg, set.weightKg);
    }
    if (loadKg > 0)
      points.push({
        date: session.date,
        sessionId: session.id,
        ratio: loadKg / body.weightKg,
        loadKg,
        bodyWeightKg: body.weightKg,
        bodyWeightDate: body.date,
      });
  }
  points.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
  return {
    points,
    reason: points.length
      ? `每场取已完成工作组的最高总外部负重，除以当天或此前 ${maxGapDays} 天内最近的体重。`
      : `需要已完成的负重工作组，以及当天或此前 ${maxGapDays} 天内的体重记录。`,
  };
}

export function suggestTarget({ exercise, goal, incrementKg }: TrialInput): TargetTrial {
  const unavailable = (reason: string): TargetTrial => ({ status: 'unavailable', reason });
  if (!integer(goal.sets, 1, 100) || !finite(incrementKg, 0.000001, 1000))
    return unavailable('目标组数须为 1–100，重量步长须大于 0。');
  const timed = exercise.exercise.kind === 'duration';
  const target = timed ? (goal.durationSeconds ?? NaN) : (goal.reps ?? NaN);
  if (!integer(target, 1, timed ? 86400 : 1000))
    return unavailable(timed ? '请填写 1–86400 秒的目标时长。' : '请填写 1–1000 次的明确目标。');
  const work = exercise.sets.filter((set) => set.type === 'work' && set.status === 'completed');
  if (work.length < goal.sets)
    return unavailable(`本次已完成 ${work.length} 个正式组，未达到试算所需的 ${goal.sets} 组。`);
  const evidence = work.slice(0, goal.sets);
  if (evidence.some((set) => !integer(timed ? set.durationSeconds : set.reps, 1, timed ? 604800 : 100000)))
    return unavailable('正式组数据无效，暂时不能进行目标试算。');
  const reached = evidence.every((set) => (timed ? set.durationSeconds : set.reps) >= target);
  if (timed)
    return target + (reached ? 5 : 0) <= 86400
      ? {
          status: 'trial',
          durationSeconds: target + (reached ? 5 : 0),
          reason: reached
            ? '本次前几个正式组均达到你填写的时长，下次可试加 5 秒。'
            : '本次未全部达到你填写的时长，可先重复这一目标。',
        }
      : unavailable('目标时长已到试算上限。');
  if (exercise.exercise.kind === 'reps')
    return target + (reached ? 1 : 0) <= 1000
      ? {
          status: 'trial',
          reps: target + (reached ? 1 : 0),
          reason: reached
            ? '本次前几个正式组均达到你填写的次数，下次可试加 1 次。'
            : '本次未全部达到你填写的次数，可先重复这一目标。',
        }
      : unavailable('目标次数已到试算上限。');
  const weightKg = evidence[0].weightKg;
  if (!knownExternalLift(exercise.exercise)) return unavailable('动作负重口径尚未确认，暂不提供加重量试算。');
  if (
    !finite(weightKg, 0.000001, 1000) ||
    evidence.some((set) => Math.abs(set.weightKg - weightKg) > 1e-6 || !Number.isFinite(set.weightKg))
  )
    return unavailable('需要正式组使用相同的有效负重；不同负重不能合成一个加重目标。');
  const next = rounded(weightKg + (reached ? incrementKg : 0));
  if (next > 1000) return unavailable('试算重量超出 1000 kg 上限。');
  return {
    status: 'trial',
    weightKg: next,
    reps: target,
    reason: reached
      ? '本次前几个正式组均达到你填写的次数，下次可试增加一个步长。'
      : '本次未全部达到你填写的次数，可先重复本次负重和这一目标。',
  };
}
