// Protocol derived from openGym api/openapi.yaml and api/sync-stamps.js
// upstream b6cfe2bbd3f099523ffbf2677438864e9a09a06f, AGPL-3.0-or-later.
import { validateSnapshot, type Snapshot } from '../sync/model';
import type { OpenGymState, OpenGymDocument } from './types';

export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function parseDocument(value: unknown): OpenGymDocument {
  if (
    !record(value) ||
    !Number.isSafeInteger(value.rev) ||
    Number(value.rev) < 0 ||
    !(value.state === null || record(value.state))
  )
    throw new Error('自托管接口返回的记录格式无效，本机记录未改动');
  if (record(value.state) && value.state._wid !== undefined && typeof value.state._wid !== 'string')
    throw new Error('自托管写入标识无效');
  return { state: value.state, rev: Number(value.rev) };
}
export function decodeSnapshot(state: OpenGymState | null): Snapshot | null {
  if (!state || !Object.hasOwn(state, 'jianlibao')) return null;
  const namespace = state.jianlibao;
  if (!record(namespace) || namespace.version !== 1)
    throw new Error('不支持的铁律同步数据版本，本机记录已保留');
  return validateSnapshot(namespace.snapshot);
}
function highestStamp(state: OpenGymState): number {
  let highest = 0;
  const see = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) highest = Math.max(highest, Math.abs(value));
  };
  const stamps = (value: unknown) => {
    if (record(value)) Object.values(value).forEach(see);
  };
  see(state._ts);
  see(state.resetAt);
  if (record(state.unitSet)) see(state.unitSet.at);
  stamps(state.edited);
  if (record(state.deleted)) Object.values(state.deleted).forEach(stamps);
  for (const field of ['workouts', 'routines', 'customEx', 'equipProfiles', 'gymCards'])
    if (Array.isArray(state[field]))
      for (const item of state[field])
        if (record(item)) {
          see(item._ts);
          stamps(item._f);
        }
  for (const field of [
    'balanceOverrides',
    'loadKind',
    'plates',
    'dbLoad',
    'dumbbells',
    'stackWeights',
    'dayNotes',
    'dayPhotos',
  ])
    if (record(state[field])) for (const item of Object.values(state[field])) if (record(item)) see(item._ts);
  return highest;
}
export function encodeSnapshot(
  snapshot: Snapshot,
  remote: OpenGymState | null,
  wall = Date.now(),
): OpenGymState {
  const shared = validateSnapshot(snapshot),
    next = structuredClone(remote ?? { workouts: [], routines: [] });
  const now = Math.max(wall, highestStamp(next) + 1);
  if (!Number.isSafeInteger(now) || now >= Number.MAX_SAFE_INTEGER) throw new Error('自托管同步时间标记无效');
  next.jianlibao = { ...(record(next.jianlibao) ? next.jianlibao : {}), version: 1, snapshot: shared };
  next.edited = { ...(record(next.edited) ? next.edited : {}), jianlibao: now };
  next._ts = now;
  // Only server-owned counters are removed. All native data, stamps and future fields stay.
  for (const field of ['active', '_rev', '_wid', '_wids', '_unstamped', '_prior']) delete next[field];
  return next;
}
