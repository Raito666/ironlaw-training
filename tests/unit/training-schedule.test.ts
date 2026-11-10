import { expect, test } from 'vitest';
import { calendarFile, isTrainingDue, upsertTrainingDate, scheduleSeries, rescheduleTrainingDate, type TrainingDate } from '../../src/features/plans/schedule';
import { createInitialData } from '../../src/domain/seed';
import { migrateLocalSchedule, withTrainingSchedule } from '../../src/data/migrations';
import { exportBackup, parseBackup } from '../../src/data/backup';
import { applySnapshot, emptySnapshot, mergeSnapshots, snapshotOf, validateSnapshot } from '../../src/sync/model';

const entry: TrainingDate = { id: 'jlb-date-1', templateId: 'preset-photo-complete-chest', date: '2026-11-10', time: '18:30', lead: 15, choices: {} };

test('same template and local date update instead of duplicating, with future and due states', () => {
  const now = new Date('2026-11-10T17:00:00');
  const first = upsertTrainingDate([], entry, now);
  const updated = upsertTrainingDate(first, { ...entry, id: 'other', time: '19:30' }, now);
  expect(updated).toEqual([{ ...entry, time: '19:30' }]);
  expect(isTrainingDue(entry, new Date('2026-11-10T18:14:59'))).toBe(false);
  expect(isTrainingDue(entry, new Date('2026-11-10T18:15:00'))).toBe(true);
  expect(isTrainingDue(entry, new Date('2026-11-11T00:00:00'))).toBe(false);
  expect(() => upsertTrainingDate([], { ...entry, date: '2026-02-30' }, now)).toThrow();
  expect(() => upsertTrainingDate([], { ...entry, time: '16:00' }, now)).toThrow();
});

test('whole templates repeat by calendar week and rescheduling keeps the original event id', () => {
  const now = new Date('2026-11-09T12:00:00');
  const entries = scheduleSeries([], [entry, { ...entry, id: 'jlb-date-2', templateId: 'preset-photo-complete-back', date: '2026-11-12' }], 2, now);
  expect(entries.map(({ date }) => date)).toEqual(['2026-11-10', '2026-11-12', '2026-11-17', '2026-11-19']);
  const changed = rescheduleTrainingDate(entries, { ...entries[0], date: '2026-11-13' }, now);
  expect(changed.find(({ id }) => id === entry.id)?.date).toBe('2026-11-13');
  expect(changed).toHaveLength(4);
});

test('schedule upgrades and restores backups, then syncs edits and deletions without losing training data', () => {
  const old = createInitialData();
  const initial = withTrainingSchedule(old, [entry]);
  expect(initial.schemaVersion).toBe(3);
  expect(parseBackup(exportBackup(initial)).trainingSchedule).toEqual([entry]);
  expect(parseBackup(exportBackup(old)).schemaVersion).toBe(2);
  const base = validateSnapshot(snapshotOf(initial));
  expect(applySnapshot(old, base)).toEqual(initial);
  const revised = snapshotOf(withTrainingSchedule(old, [{ ...entry, date: '2026-11-13' }]));
  const removed = snapshotOf(withTrainingSchedule(old, []));
  const result = mergeSnapshots(base, revised, removed);
  expect(result.conflicts[0]?.key).toBe(`trainingSchedule:${entry.id}`);
  const accepted = validateSnapshot(mergeSnapshots(base, revised, removed, { [`trainingSchedule:${entry.id}`]: 'remote' }).snapshot);
  expect(accepted.tombstones).toContain(`trainingSchedule:${entry.id}`);
  expect(applySnapshot(initial, accepted).trainingSchedule).toEqual([]);
  expect(mergeSnapshots(emptySnapshot(), base, emptySnapshot()).conflicts).toEqual([]);
});

test('migration keeps durable records and imports legacy browser dates exactly once', () => {
  const old = createInitialData();
  const durable = { ...entry, time: '20:00' };
  const another = { ...entry, id: 'legacy-2', date: '2026-11-12' };
  const migrated = migrateLocalSchedule(withTrainingSchedule(old, [durable]), [entry, another]);
  expect(migrated.trainingSchedule).toEqual([durable, another]);
  expect(migrateLocalSchedule(migrated, [entry, another])).toBe(migrated);
  expect(migrated.sessions).toBe(old.sessions);
});

test('iCalendar has a stable UID, escaped text and a 15-minute alarm', () => {
  const text = calendarFile(entry, '胸肩，热身;今日\n下一行', new Date('2026-11-10T17:00:00'));
  expect(text).toContain('UID:jlb-date-1@jianlibao\r\n');
  expect(text).toContain('BEGIN:VALARM\r\nTRIGGER:-PT15M\r\nACTION:DISPLAY');
  expect(text).toContain('SUMMARY:铁律 · 胸肩，热身\\;今日\\n下一行');
  expect(text).toMatch(/DTSTART:\d{8}T\d{6}Z\r\n/);
  expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
  expect(text.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
});
