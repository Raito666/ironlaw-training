import type { Session, TrainingDate, WorkoutTemplate } from '../../domain/types';
import { trainingReminderLeads, validateTrainingSchedule } from '../../data/backup';
export type { TrainingDate } from '../../domain/types';
export type ScheduledTraining = { entry: TrainingDate; template: WorkoutTemplate };

export function indexScheduledSessions(sessions: Session[]) {
  const links = new Map<string, Session>();
  const byDate = new Map<string, Session>();
  for (const session of sessions) {
    if (!session.templateId || session.status === 'cancelled') continue;
    const index = session.scheduleId ? links : byDate;
    const key = session.scheduleId ?? `${session.date}/${session.templateId}`;
    const existing = index.get(key);
    if (!existing || (existing.status !== 'completed' && session.status === 'completed')) index.set(key, session);
  }
  return (entry: TrainingDate) => {
    const linked = links.get(entry.id);
    return linked?.templateId === entry.templateId ? linked : byDate.get(`${entry.date}/${entry.templateId}`);
  };
}

export const trainingScheduleKey = 'jianlibao.training-schedule.v1';
export const reminderLeads = trainingReminderLeads;

export function localTrainingDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function startTime({ date, time }: TrainingDate): Date {
  if (!/^\d{4}-\d\d-\d\d$/.test(date) || !/^\d\d:\d\d$/.test(time)) throw new Error('请选择训练日期与时间。');
  const start = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(+start) || localTrainingDate(start) !== date ||
    `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}` !== time) {
    throw new Error('这个日期或时间无效，请重新选择。');
  }
  return start;
}

export function upsertTrainingDate(entries: TrainingDate[], entry: TrainingDate, now = new Date()): TrainingDate[] {
  if (+startTime(entry) <= +now) throw new Error('请选择还没到的训练时间。');
  if (!reminderLeads.some((lead) => lead === entry.lead)) throw new Error('请选择提醒时间。');
  const existing = entries.find((item) => item.templateId === entry.templateId && item.date === entry.date);
  const next = existing ? entries.map((item) => item.id === existing.id ? { ...entry, id: item.id } : item) : [...entries, entry];
  return next.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

export function shiftTrainingDate(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function scheduleSeries(entries: TrainingDate[], firstWeek: TrainingDate[], weeks: number, now = new Date()): TrainingDate[] {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12 || !firstWeek.length) throw new Error('请选择 1 至 12 周。');
  const first = firstWeek[0].date;
  if (firstWeek.some((entry, index) => entry.date < first || entry.date > shiftTrainingDate(first, 6) ||
    (index > 0 && entry.date <= firstWeek[index - 1].date))) throw new Error('首周各训练日须按顺序排在同一轮的 7 天内。');
  let next = entries;
  for (let week = 0; week < weeks; week++) {
    for (const entry of firstWeek) {
      next = upsertTrainingDate(next, week ? { ...entry, id: `${entry.id}-${week}`, date: shiftTrainingDate(entry.date, week * 7) } : entry, now);
    }
  }
  return next;
}

export function rescheduleTrainingDate(entries: TrainingDate[], entry: TrainingDate, now = new Date()): TrainingDate[] {
  const current = entries.find((item) => item.id === entry.id);
  if (!current) throw new Error('这场排期已不存在，请重新选择。');
  const others = entries.filter((item) => item.id !== entry.id);
  if (others.some((item) => item.templateId === current.templateId && item.date === entry.date)) throw new Error('同一天已有这份模板的排期，请选其他日期。');
  return upsertTrainingDate(others, { ...current, date: entry.date, time: entry.time, lead: entry.lead }, now);
}

export function isTrainingDue(entry: TrainingDate, now = new Date()): boolean {
  const start = new Date(`${entry.date}T${entry.time}:00`);
  return entry.date >= localTrainingDate(now) && +now >= +start - entry.lead * 60_000;
}

export function readTrainingSchedule(storage: Pick<Storage, 'getItem'>): TrainingDate[] {
  const raw = storage.getItem(trainingScheduleKey);
  if (raw === null) return [];
  return validateTrainingSchedule(JSON.parse(raw));
}

const calendarTimestamp = (date: Date) => date.toISOString().replace(/[-:]|\.\d{3}/g, '');
const calendarTitle = (title: string) => `铁律 · ${title}`;
const calendarDescription = '打开铁律的计划页，从训练排期开始。';
const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[,;]/g, '\\$&');
const encoder = new TextEncoder();

function foldCalendarLine(line: string): string {
  let result = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      result += '\r\n ';
      bytes = 1;
    }
    result += char;
    bytes += size;
  }
  return result;
}

export function calendarFile(entry: TrainingDate, title: string, now = new Date()): string {
  const start = new Date(`${entry.date}T${entry.time}:00`);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IRONLAW//Training Schedule//ZH',
    'BEGIN:VEVENT', `UID:${entry.id}@jianlibao`, `DTSTAMP:${calendarTimestamp(now)}`,
    `DTSTART:${calendarTimestamp(start)}`, 'DURATION:PT1H',
    `SUMMARY:${escapeText(calendarTitle(title))}`, `DESCRIPTION:${escapeText(calendarDescription)}`,
    'BEGIN:VALARM', `TRIGGER:${entry.lead ? `-PT${entry.lead}M` : 'PT0S'}`, 'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(calendarTitle(title))}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', '',
  ].map(foldCalendarLine).join('\r\n');
}

export function googleCalendarLink(entry: TrainingDate, title: string): string {
  const start = new Date(`${entry.date}T${entry.time}:00`);
  const params = new URLSearchParams({ action: 'TEMPLATE', text: calendarTitle(title),
    dates: `${calendarTimestamp(start)}/${calendarTimestamp(new Date(+start + 3_600_000))}`,
    details: calendarDescription });
  return `https://calendar.google.com/calendar/render?${params}`;
}
