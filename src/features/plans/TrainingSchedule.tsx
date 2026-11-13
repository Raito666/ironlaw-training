import { useEffect, useState } from 'react';
import type { Session, WorkoutTemplate } from '../../domain/types';
import { uid } from '../../domain/training';
import Icon from '../../components/Icon';
import { exportTextFile } from '../../platform/native';
import { calendarFile, googleCalendarLink, isTrainingDue, localTrainingDate, reminderLeads, shiftTrainingDate, type TrainingDate } from './schedule';
import type { TrainingScheduleController } from './useTrainingSchedule';

type ScheduleTarget = { template: WorkoutTemplate; choices?: Record<string, string> };

export function TrainingDateForm({ template, choices = {}, schedule, whole, edit }: {
  template: WorkoutTemplate;
  choices?: Record<string, string>;
  schedule: TrainingScheduleController;
  whole?: ScheduleTarget[];
  edit?: TrainingDate;
}) {
  const [date, setDate] = useState(edit?.date ?? '');
  const [time, setTime] = useState(edit?.time ?? '19:00');
  const [lead, setLead] = useState(edit?.lead ?? 15);
  const [weeks, setWeeks] = useState(1);
  const [otherDates, setOtherDates] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const targets = whole ?? [{ template, choices }];
  const day = (index: number) => index === 0 || !date ? date : otherDates[index] ?? shiftTrainingDate(date, index * (targets.length === 2 ? 3 : targets.length === 3 ? 2 : 1));
  const title = edit ? '改期' : whole ? '安排整套模板' : '安排训练日期';
  return (
    <details className="training-date-form">
      <summary>{title}</summary>
      <form aria-label={edit ? `改期${template.name}` : whole ? '安排整套模板' : `安排${template.name}`} onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          if (edit) await schedule.move({ ...edit, date, time, lead });
          else await schedule.save(targets.map((target, index) => ({ id: uid(), templateId: target.template.id, date: day(index), time, lead, choices: target.choices ?? {} })), weeks);
          setFeedback(edit ? `已改期到 ${date} ${time}。已导入的日历提醒请在日历里更新。` :
            whole || weeks > 1 ? `已安排 ${targets.length * weeks} 场训练。可在「训练排期」查看。` : `已安排 ${date} ${time}。可在「训练排期」加入手机日历。`);
          setError(false);
        } catch (cause) {
          setFeedback(cause instanceof Error ? cause.message : '暂时无法保存排期。');
          setError(true);
        } finally { setBusy(false); }
      }}>
        <div className="training-date-fields">
          {targets.map((target, index) => (
            <label className="field" key={target.template.id}>
              {whole ? `首周第 ${index + 1} 天` : '训练日期'}
              {whole && <small>{target.template.name}</small>}
              <input type="date" className="form-input" value={day(index)} min={index ? date : localTrainingDate()}
                max={index && date ? shiftTrainingDate(date, 6) : undefined} required onChange={(event) => {
                  if (index === 0) { setDate(event.target.value); setOtherDates({}); }
                  else setOtherDates((previous) => ({ ...previous, [index]: event.target.value }));
                }} />
            </label>
          ))}
          <label className="field">开始时间<input type="time" className="form-input" value={time} required onChange={(event) => setTime(event.target.value)} /></label>
          <label className="field">提醒时间<select className="form-select" value={lead} onChange={(event) => setLead(Number(event.target.value))}>
            {reminderLeads.map((value) => <option key={value} value={value}>{value ? `提前 ${value} 分钟` : '到点提醒'}</option>)}
          </select></label>
          {!edit && <label className="field">每周重复<select className="form-select" value={weeks} onChange={(event) => setWeeks(Number(event.target.value))}>
            {[1, 2, 3, 4, 6, 8, 12].map((value) => <option value={value} key={value}>{value === 1 ? '只安排一周' : `共 ${value} 周（含首周）`}</option>)}
          </select></label>}
        </div>
        <button type="submit" className="btn btn-secondary" disabled={!schedule.writable || busy}>{edit ? '保存改期' : '保存排期'}</button>
        {feedback && <p role={error ? 'alert' : 'status'} className={error ? 'error-text' : 'muted'}>{feedback}</p>}
      </form>
    </details>
  );
}

export function TrainingReminder({ entries, findSession, onOpen }: {
  entries: TrainingDate[];
  findSession: (entry: TrainingDate) => Session | undefined;
  onOpen: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const due = entries.filter((entry) => !findSession(entry) && isTrainingDue(entry, now));
  return due.length > 0 && (
    <aside className="card training-reminder" aria-label="训练提醒" aria-live="polite">
      <p><strong>训练提醒</strong> · 有 {due.length} 场训练到了提醒时间。</p>
      <button type="button" className="btn btn-secondary" onClick={onOpen}>查看训练排期</button>
    </aside>
  );
}

export function TrainingSchedulePanel({ schedule, findSession, resolveTemplate, openStart, onView, writable }: {
  schedule: TrainingScheduleController;
  findSession: (entry: TrainingDate) => Session | undefined;
  resolveTemplate: (entry: TrainingDate) => WorkoutTemplate | undefined;
  openStart: (template: WorkoutTemplate, scheduleId: string) => void;
  onView: (session: Session) => void;
  writable: boolean;
}) {
  const [feedback, setFeedback] = useState('');
  if (!schedule.entries.length && !schedule.migrationError) return null;
  const today = localTrainingDate();
  return (
    <section id="training-schedule" className="card training-schedule" aria-labelledby="training-schedule-heading">
      <h2 id="training-schedule-heading"><Icon name="calendar" size={20} /> 训练排期</h2>
      <details className="schedule-help">
        <summary>提醒与同步说明</summary>
        <p className="muted">网页打开时会显示到点提示。关闭网页后的提醒由手机日历负责，需要先把事件加入日历。</p>
        <p className="muted">手机和电脑连接同一云同步空间后，会共享排期、改期与取消结果。</p>
        <p className="muted">使用 Google 日历时，在保存事件前设置所选的提醒时间。</p>
      </details>
      {schedule.migrationError && <p role="alert">{schedule.migrationError}</p>}
      <ul>
        {schedule.entries.map((entry) => {
          const template = resolveTemplate(entry);
          const session = findSession(entry);
          const completed = session?.status === 'completed';
          const missed = entry.date < today;
          const archived = !template || template.archived;
          const reminder = entry.lead ? `提前 ${entry.lead} 分钟提醒` : '到点提醒';
          const status = completed ? (session.date > entry.date ? '已补练' : '已完成') : session ? '训练进行中' : missed ? '待补练' : reminder;
          return (
            <li key={entry.id}>
              <h3 className="wrap-cjk">{template?.name ?? session?.name ?? '原模板暂不可用'}</h3>
              <p className="muted">{entry.date} · {entry.time} · {status}</p>
              <div className="row wrap training-schedule-actions">
                {completed && <button type="button" className="btn btn-secondary" onClick={() => onView(session)}>查看训练记录</button>}
                {template && !archived && !completed && <button type="button" className="btn btn-primary" disabled={!writable} onClick={() => openStart(template, entry.id)}>
                  {session ? '继续这场训练' : missed ? '补练' : '按排期开练'}
                </button>}
                {template && !archived && !session && !missed && <>
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setFeedback('');
                    void exportTextFile({ name: '铁律训练.ics', text: calendarFile(entry, template.name), type: 'text/calendar;charset=utf-8' })
                      .then((result) => setFeedback(result === 'cancelled' ? '已取消导出。' : result === 'busy' ? '请先完成当前分享。' : '请在支持的日历应用中打开文件并确认提醒。'))
                      .catch(() => setFeedback('日历文件未能导出，请重试。'));
                  }}>下载日历提醒</button>
                  <a className="btn btn-secondary" href={googleCalendarLink(entry, template.name)} target="_blank" rel="noreferrer">用 Google 日历添加</a>
                </>}
                <button type="button" className="btn btn-ghost" disabled={!schedule.writable} onClick={async () => {
                  try {
                    await schedule.remove(entry.id);
                    setFeedback('已移除排期。已加入系统日历的事件可在日历内删除。');
                  } catch { setFeedback('排期未能移除，请重试。'); }
                }}>{completed ? '移除这条排期' : '取消这场排期'}</button>
              </div>
              {template && !archived && !session && <TrainingDateForm template={template} schedule={schedule} edit={entry} />}
            </li>
          );
        })}
      </ul>
      {feedback && <p role="status">{feedback}</p>}
    </section>
  );
}
