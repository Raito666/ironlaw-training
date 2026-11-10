import { useEffect, useRef, useState } from 'react';
import type { AppData } from '../../domain/types';
import { migrateLocalSchedule, withTrainingSchedule } from '../../data/migrations';
import { readTrainingSchedule, rescheduleTrainingDate, scheduleSeries, trainingScheduleKey, type TrainingDate } from './schedule';

type Workspace = {
  data: AppData | null;
  status: string;
  writable: boolean;
  mutate: (fn: (data: AppData) => AppData) => Promise<boolean>;
};

export function useTrainingSchedule({ data, status, writable, mutate }: Workspace) {
  const migrating = useRef(false);
  const [migrationError, setMigrationError] = useState('');
  useEffect(() => {
    if (!data || status !== 'saved' || !writable || migrating.current) return;
    let raw: string | null;
    let legacy: TrainingDate[];
    try {
      raw = window.localStorage.getItem(trainingScheduleKey);
      if (raw === null) return;
      legacy = readTrainingSchedule(window.localStorage);
    } catch {
      setMigrationError('旧排期暂时无法读取，原内容已保留。');
      return;
    }
    migrating.current = true;
    void (async () => {
      try {
        const unchanged = migrateLocalSchedule(data, legacy) === data;
        if (!unchanged && !await mutate((latest) => migrateLocalSchedule(latest, legacy))) {
          setMigrationError('旧排期还未成功迁移，请在本地保存恢复后重试。');
          return;
        }
        if (window.localStorage.getItem(trainingScheduleKey) === raw) window.localStorage.removeItem(trainingScheduleKey);
        setMigrationError('');
      } catch { setMigrationError('旧排期迁移暂未完成，原内容已保留。'); }
      finally { migrating.current = false; }
    })();
  }, [data, status, writable, mutate]);

  async function write(update: (entries: TrainingDate[]) => TrainingDate[]) {
    if (!writable || status !== 'saved') throw new Error('请等本机保存完成后再修改排期。');
    let failure: unknown;
    const saved = await mutate((latest) => {
      try { return withTrainingSchedule(latest, update(latest.trainingSchedule ?? [])); }
      catch (error) { failure = error; throw error; }
    });
    if (!saved) throw failure ?? new Error('排期尚未保存，请在顶部重试本地保存。');
  }

  return {
    entries: [...(data?.trainingSchedule ?? [])].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)),
    writable: writable && status === 'saved',
    migrationError,
    save: (entries: TrainingDate[], weeks: number) => write((current) => scheduleSeries(current, entries, weeks)),
    move: (entry: TrainingDate) => write((current) => rescheduleTrainingDate(current, entry)),
    remove: (id: string) => write((entries) => entries.filter((entry) => entry.id !== id)),
  };
}

export type TrainingScheduleController = ReturnType<typeof useTrainingSchedule>;
