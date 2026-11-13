import type { AppData, LegacyAppData, TrainingDate } from '../domain/types';

/** Pure payload migration, called only after the strict v1 validator succeeds. */
export function migrateAppDataV1(data: LegacyAppData): AppData {
  return { ...data, schemaVersion: 2, bodyMetrics: [], settings: { ...data.settings, showRpe: false } };
}

/** Upgrade on the first schedule write or import. Older workspaces remain valid v2. */
export function withTrainingSchedule(data: AppData, trainingSchedule: TrainingDate[]): AppData {
  return { ...data, schemaVersion: data.schemaVersion === 4 ? 4 : 3, trainingSchedule };
}

/** Only a workspace with an explicit session-to-schedule link needs v4. */
export function withScheduleLinks(data: AppData): AppData {
  return { ...data, schemaVersion: 4, trainingSchedule: data.trainingSchedule ?? [] };
}

export function migrateLocalSchedule(data: AppData, legacy: TrainingDate[]): AppData {
  const current = data.trainingSchedule ?? [];
  const known = new Set(current.map((entry) => entry.id));
  const added = legacy.filter((entry) => !known.has(entry.id));
  return added.length ? withTrainingSchedule(data, [...current, ...added]) : data;
}
