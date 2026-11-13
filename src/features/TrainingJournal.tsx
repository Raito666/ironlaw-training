import { COMPACT_LAYOUT_QUERY, isCompactViewport } from '../platform/compact-layout';
import { isWorkSet } from '../domain/sets';
import Presence from '../motion/Presence';
import { useEffect, useState } from 'react';
import type { AppData, Session, Exercise } from '../domain/types';
import { dayKey, inPeriod, totals, trainingStreak, csvRecords } from '../domain/analytics';
import { displayWeight } from '../domain/units';
import Icon from '../components/Icon';
import SessionDetails from './SessionDetails';
import Statistics from './Statistics';
import ManualSession from './ManualSession';
import HistoryCalendar from './history/HistoryCalendar';
import SessionList from './history/SessionList';
import HistoryToolbar from './history/HistoryToolbar';
import { exportTextFile } from '../platform/native';
import type { ScheduledTraining } from './plans/schedule';

export function downloadCsv(sessions: Session[]) {
  return exportTextFile({
    text: csvRecords(sessions),
    name: `铁律训练明细-${dayKey(new Date())}.csv`,
    type: 'text/csv;charset=utf-8',
  });
}
export default function TrainingJournal({
  data,
  writable,
  mutate,
  notify,
  onRepeat,
  onTrain,
  onExercise,
  savedSessionId,
  onDismissSaved,
  nextScheduled,
  onSchedule,
}: {
  data: AppData;
  writable: boolean;
  mutate: (fn: (d: AppData) => AppData) => Promise<boolean>;
  notify: (message: string) => void;
  onRepeat: (s: Session) => void;
  onTrain: () => void;
  onExercise: (ex: Exercise) => void;
  savedSessionId?: string;
  onDismissSaved: () => void;
  nextScheduled?: ScheduledTraining;
  onSchedule: () => void;
}) {
  const [manual, setManual] = useState(false);
  const today = dayKey(new Date());
  const [tab, setTab] = useState('history');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [allHistory, setAllHistory] = useState(false);
  const [historyExercise, setHistoryExercise] = useState('all');
  const [selected, setSelected] = useState<Session | null>(() => {
    const id = new URLSearchParams(location.hash.split('?')[1]).get('session');
    return id ? data.sessions.find((session) => session.id === id && session.status === 'completed') ?? null : null;
  });
  const [calendarOpen, setCalendarOpen] = useState(() => !isCompactViewport());
  useEffect(() => {
    const media = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const change = () => setCalendarOpen(!media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const sessions = inPeriod(data.sessions, '1970-01-01', '2100-01-01');
  const savedSession = sessions.find(({ id }) => id === savedSessionId);
  const lifetime = totals(sessions);
  const trained = [
    ...new Map(
      [...sessions]
        .reverse()
        .flatMap((s) =>
          s.exercises
            .filter((ex) => ex.sets.some((set) => set.status === 'completed' && isWorkSet(set)))
            .map((ex) => [ex.exercise.id, ex.exercise] as const),
        ),
    ).values(),
  ];
  const volume = (kg: number) =>
    `${displayWeight(kg, data.settings.unit).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} ${data.settings.unit}·次`;
  const list = sessions.filter(
    (s) =>
      (date ? s.date === date : allHistory || s.date.startsWith(month)) &&
      (!search.trim() ||
        `${s.name} ${s.note} ${s.exercises.map((ex) => ex.exercise.name).join(' ')}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())) &&
      (historyExercise === 'all' || s.exercises.some((ex) => ex.exercise.id === historyExercise)),
  );
  const monthDate = new Date(`${month}-01T12:00:00Z`);
  const offset = (monthDate.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  function moveMonth(n: number) {
    const d = new Date(`${month}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
    setDate('');
    setAllHistory(false);
  }
  function viewDate(key: string) {
    setDate(key);
    setMonth(key.slice(0, 7));
    setAllHistory(false);
    setTab('history');
    setSearch('');
    setHistoryExercise('all');
  }
  return (
    <div className="progress-page">
      {savedSession && (
        <section className="card saved-workout" aria-label="本次训练">
          <div className="section-heading">
            <div><h2>训练已保存</h2><p className="muted">{savedSession.name} · 完成 {savedSession.exercises.reduce((n, item) => n + item.sets.filter((set) => set.status === 'completed').length, 0)} 组</p></div>
            <button type="button" className="btn btn-ghost" onClick={onDismissSaved}>收起</button>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setSelected(savedSession)}>查看本次训练</button>
          {nextScheduled && <div className="saved-next-training">
            <div className="wrap-cjk"><strong>下一场 · {nextScheduled.template.name}</strong>
              <p className="muted">{nextScheduled.entry.date === today ? '今天' : nextScheduled.entry.date} · {nextScheduled.entry.time}</p></div>
            <button type="button" className="btn btn-ghost" onClick={onSchedule}>查看排期</button>
          </div>}
          <details>
            <summary>补写训练备注</summary>
            <form onSubmit={async (event) => {
              event.preventDefault();
              const note = String(new FormData(event.currentTarget).get('note') ?? '');
              const ok = await mutate((latest) => ({
                ...latest,
                sessions: latest.sessions.map((session) => session.id === savedSession.id && session.status === 'completed'
                  ? { ...session, note, updatedAt: new Date().toISOString() } : session),
              }));
              if (ok) notify('训练备注已保存');
            }}>
              <label className="field">训练备注<textarea className="form-textarea" name="note" defaultValue={savedSession.note} maxLength={2000} disabled={!writable} /></label>
              <button type="submit" className="btn btn-primary" disabled={!writable}>保存备注</button>
            </form>
          </details>
        </section>
      )}
      <div className="progress-masthead">
        <div>
          <p>
            累计 <strong>{lifetime.sessions}</strong> 场训练 · <strong>{lifetime.days}</strong> 个训练日
          </p>
        </div>
        <p className="journal-intro-note">回看记录，了解进步。</p>
      </div>
      <div className="progress-tabbar">
        <div className="segmented" role="group" aria-label="历史与统计视图">
          {[
            ['history', '训练历史'],
            ['stats', '统计总览'],
            ['exercise', '动作追踪'],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              className={tab === id ? 'active' : ''}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="btn btn-secondary" disabled={!writable} onClick={() => setManual(true)}>
          <Icon name="plus" size={16} />
          补记训练
        </button>
        {tab === 'history' && (
          <button
            className="btn btn-ghost"
            disabled={!list.length}
            onClick={async () => {
              try {
                const result = await downloadCsv(list);
                notify(
                  result === 'shared'
                    ? '训练明细已交给系统分享，请确认保存到所选位置'
                    : result === 'cancelled'
                      ? '已取消分享，记录仍保存在本机'
                      : result === 'busy'
                        ? '请先完成当前分享'
                        : '训练明细 CSV 已生成，请确认下载完成',
                );
              } catch (error) {
                notify(error instanceof Error ? error.message : '导出失败，请重试');
              }
            }}
          >
            <Icon name="download" size={16} />
            导出明细 CSV
          </button>
        )}
      </div>
      {tab === 'history' ? (
        <div className="journal-layout">
          <aside className="journal-sidebar">
            <HistoryCalendar
              calendarOpen={calendarOpen}
              setCalendarOpen={setCalendarOpen}
              date={date}
              month={month}
              moveMonth={moveMonth}
              offset={offset}
              days={days}
              sessions={sessions}
              today={today}
              setDate={setDate}
              setMonth={setMonth}
              setAllHistory={setAllHistory}
            />
            <section className="journal-side-note">
              <Icon name="book" size={24} />
              <h3>记录，就是自己的参考书。</h3>
              <p>回看每组结果、修正记录，或把熟悉的安排存成下次的模板。</p>
              <div>
                <strong>{trainingStreak(sessions, today)}</strong>
                <span>
                  连续训练周<small>按自然周统计，给休息留出空间。</small>
                </span>
              </div>
            </section>
          </aside>
          <div className="journal-main">
            <HistoryToolbar
              search={search}
              setSearch={setSearch}
              historyExercise={historyExercise}
              setHistoryExercise={setHistoryExercise}
              trained={trained}
            />
            <div className="history-heading">
              <div>
                <h3>{date || (allHistory ? '全部训练' : `${month} 的训练`)}</h3>
                <p>
                  {list.length} 场 · {totals(list).sets} 个正式组 · {volume(totals(list).volumeKg)}
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setAllHistory(!allHistory);
                  setDate('');
                }}
              >
                {allHistory ? '按月查看' : '查看全部'}
              </button>
            </div>
            <SessionList
              list={list}
              sessions={sessions}
              setSelected={setSelected}
              volume={volume}
              setSearch={setSearch}
              setDate={setDate}
              setHistoryExercise={setHistoryExercise}
              setAllHistory={setAllHistory}
              onTrain={onTrain}
            />
          </div>
        </div>
      ) : (
        <Statistics
          notify={notify}
          data={data}
          view={tab}
          sessions={sessions}
          trained={trained}
          onSession={setSelected}
          onDate={viewDate}
          onExercise={onExercise}
          onTrain={onTrain}
          onView={setTab}
        />
      )}
      <Presence>
        {manual && (
          <ManualSession
            data={data}
            writable={writable}
            mutate={mutate}
            notify={notify}
            onClose={() => setManual(false)}
          />
        )}
      </Presence>
      <Presence>
        {selected && (
          <SessionDetails
            key={selected.id}
            session={selected}
            data={data}
            writable={writable}
            mutate={mutate}
            onClose={() => setSelected(null)}
            onRepeat={onRepeat}
            notify={notify}
          />
        )}
      </Presence>
    </div>
  );
}
