import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppData, Exercise, ExerciseKind, Session, WorkoutTemplate } from '../../domain/types';
import { sessionStats } from '../../domain/training';
import { localDate } from '../History';
import type { Page } from '../../app/navigation';
import Icon from '../../components/Icon';
import { prefersReducedMotion, subscribeReducedMotion } from '../../motion/reduced-motion';
import TodayDial, { type DialSegment } from './TodayDial';

type Props = {
  data: AppData;
  active?: Session;
  completed: Session[];
  templates: WorkoutTemplate[];
  monthSessions: Session[];
  monthlySeconds: number;
  monthlySets: number;
  writable: boolean;
  go: (page: Page) => void;
  openStart: (template: WorkoutTemplate | 'free') => void;
  setTemplateEditor: (template: WorkoutTemplate | 'new') => void;
  onExercise: (exercise: Exercise) => void;
};

type PlanRow = {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  kind: ExerciseKind;
  sets: number;
  reps: number;
  durationSeconds: number;
  exercise: Exercise;
  done?: number;
};

function useAnimatedNumber(value: number, decimals = 0) {
  const [display, setDisplay] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const factor = 10 ** decimals;
    const from = Math.round(current.current * factor);
    const to = Math.round((Number.isFinite(value) ? value : 0) * factor);
    if (prefersReducedMotion() || from === to || typeof requestAnimationFrame !== 'function') {
      current.current = to / factor;
      setDisplay(to / factor);
      return;
    }
    const started = performance.now();
    const duration = 720;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (to - from) * eased) / factor;
      current.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, decimals]);
  return display;
}

function formatRowMeta(row: PlanRow) {
  const unit = row.kind === 'duration' ? `${row.durationSeconds} 秒` : `${row.reps} 次`;
  if (row.done !== undefined) return `${row.done}/${row.sets} 组 · ${unit}`;
  return `${row.sets} 组 × ${unit}`;
}

function shortExerciseLabel(name: string) {
  const stripped = name.replace(/^(杠铃|哑铃|器械|绳索|壶铃|固定器械)/, '');
  return stripped.slice(0, 2) || name.slice(0, 2);
}

function exerciseGlyph(kind: ExerciseKind) {
  if (kind === 'duration') return 'clock';
  if (kind === 'reps') return 'target';
  return 'dumbbell';
}

export default function TodayPage({
  data,
  active,
  completed,
  templates,
  monthSessions,
  monthlySeconds,
  monthlySets,
  writable,
  go,
  openStart,
  setTemplateEditor,
  onExercise,
}: Props) {
  const heroRef = useRef<HTMLElement>(null);
  const dialRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const template = templates[0];
  const activeStats = active ? sessionStats(active) : null;

  const planRows: PlanRow[] = active
    ? active.exercises.map((item) => ({
        id: item.id,
        name: item.exercise.name,
        muscle: item.exercise.muscle,
        equipment: item.exercise.equipment,
        kind: item.exercise.kind,
        sets: item.sets.length,
        reps: item.sets[0]?.reps ?? 0,
        durationSeconds: item.sets[0]?.durationSeconds ?? 0,
        exercise: item.exercise,
        done: item.sets.filter((set) => set.status === 'completed').length,
      }))
    : (template?.items.flatMap((item) => {
        const exercise = data.exercises.find((candidate) => candidate.id === item.exerciseId);
        if (!exercise) return [];
        return [{
          id: item.id,
          name: exercise.name,
          muscle: exercise.muscle,
          equipment: exercise.equipment,
          kind: exercise.kind,
          sets: item.sets,
          reps: item.reps,
          durationSeconds: item.durationSeconds,
          exercise,
        }];
      }) ?? []);

  const plannedSets = planRows.reduce((total, row) => total + row.sets, 0);
  const completedSets = planRows.reduce((total, row) => total + (row.done ?? 0), 0);
  const dialSegments: DialSegment[] = planRows.length
    ? planRows.map((row) => ({ id: row.id, label: shortExerciseLabel(row.name), done: row.done ?? 0, total: row.sets }))
    : [{ id: 'free', label: '自由', done: 0, total: 1 }];

  const weekBuckets = Array.from({ length: 5 }, () => ({ sessions: 0, sets: 0, seconds: 0 }));
  monthSessions.forEach((session) => {
    const day = Number(session.date.slice(8, 10));
    const week = Math.min(4, Math.max(0, Math.floor((day - 1) / 7)));
    const stats = sessionStats(session);
    weekBuckets[week].sessions += 1;
    weekBuckets[week].sets += stats.completedSets;
    weekBuckets[week].seconds += stats.activeSeconds;
  });
  const normalizeWeeks = (values: number[]) => {
    const max = Math.max(...values, 1);
    return values.map((value) => value / max);
  };
  const sessionSpark = normalizeWeeks(weekBuckets.map((week) => week.sessions));
  const setSpark = normalizeWeeks(weekBuckets.map((week) => week.sets));
  const timeSpark = normalizeWeeks(weekBuckets.map((week) => week.seconds));
  const sparkStyle = (index: number, value: number) => ({
    ['--h']: String(Math.max(0.08, value)),
    ['--i']: String(index),
  } as CSSProperties);

  const sessionCount = useAnimatedNumber(monthSessions.length);
  const hourCount = useAnimatedNumber(Math.round(monthlySeconds / 360) / 10, 1);
  const setCount = useAnimatedNumber(monthlySets);

  const now = new Date();
  const weekday = '日一二三四五六'[now.getDay()];
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 · 周${weekday}`;
  const headlineLines = active ? ['把这一场', '练好。'] : ['把今天', '练好。'];

  useEffect(() => {
    const hero = heroRef.current;
    const dial = dialRef.current;
    const cta = ctaRef.current;
    if (!hero || typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || prefersReducedMotion()) return;

    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    const render = () => {
      frame = 0;
      if (dial) dial.style.transform = `translate3d(${targetX * 11}px, ${targetY * 9}px, 0)`;
    };
    const onHeroMove = (event: PointerEvent) => {
      const rect = hero.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      hero.style.setProperty('--spot-x', `${x * 100}%`);
      hero.style.setProperty('--spot-y', `${y * 100}%`);
      targetX = x - 0.5;
      targetY = y - 0.5;
      if (!frame) frame = requestAnimationFrame(render);
    };
    const settle = (element: HTMLElement | null) => {
      if (!element) return;
      const current = element.style.transform;
      if (typeof element.animate !== 'function') {
        element.style.transform = '';
        return;
      }
      element.animate(
        [{ transform: current || 'none' }, { transform: 'none' }],
        { duration: 280, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      ).finished.then(() => { element.style.transform = ''; }).catch(() => undefined);
    };
    const onHeroLeave = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      targetX = 0;
      targetY = 0;
      hero.style.setProperty('--spot-x', '50%');
      hero.style.setProperty('--spot-y', '50%');
      settle(dial);
    };
    const onCtaMove = (event: PointerEvent) => {
      if (!cta) return;
      const rect = cta.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, ((event.clientX - (rect.left + rect.width / 2)) / rect.width) * 2));
      const y = Math.max(-1, Math.min(1, ((event.clientY - (rect.top + rect.height / 2)) / rect.height) * 2));
      cta.style.transform = `translate3d(${x * 4}px, ${y * 3}px, 0)`;
    };
    const onCtaLeave = () => settle(cta);
    const unsubscribe = subscribeReducedMotion((reduced) => {
      if (!reduced) return;
      onHeroLeave();
      settle(cta);
    });
    hero.addEventListener('pointermove', onHeroMove);
    hero.addEventListener('pointerleave', onHeroLeave);
    cta?.addEventListener('pointermove', onCtaMove);
    cta?.addEventListener('pointerleave', onCtaLeave);
    return () => {
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
      hero.removeEventListener('pointermove', onHeroMove);
      hero.removeEventListener('pointerleave', onHeroLeave);
      cta?.removeEventListener('pointermove', onCtaMove);
      cta?.removeEventListener('pointerleave', onCtaLeave);
    };
  }, []);

  return (
    <>
      {active && (
        <section className="recovery-banner today-recovery" aria-label="未完成训练">
          <div>
            <span className="today-status-pill">
              <span className="today-status-dot" />
              训练进行中
            </span>
            <h2 className="truncate" title={active.name}>{active.name}</h2>
            <p>
              {activeStats?.completedSets ?? 0} 组已完成 · 上次更新{' '}
              {new Date(active.updatedAt).toLocaleString('zh-CN')}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => go('workout')}>
            继续训练
            <Icon name="arrow" />
          </button>
        </section>
      )}

      <div className="today-layout">
        <section className="hero today-hero" ref={heroRef}>
          <span className="today-hero-ruler" aria-hidden="true" />
          <span className="today-hero-frame" aria-hidden="true">
            <i className="today-hero-corner tl" />
            <i className="today-hero-corner tr" />
            <i className="today-hero-corner bl" />
            <i className="today-hero-corner br" />
          </span>
          <div className="today-hero-spot" aria-hidden="true" />
          <div className="today-hero-grain" aria-hidden="true" />
          <div className="hero-copy today-hero-copy">
            <div className="today-kicker">
              <span className="today-live-dot" aria-hidden="true" />
              <span>{dateLabel}</span>
              <span className="today-kicker-sep" aria-hidden="true" />
              <span>{active ? '训练进行中' : template ? '当前模板' : '自由训练'}</span>
            </div>
            <h2>
              {headlineLines.map((line) => (
                <span className="today-display-line" key={line}>{line}</span>
              ))}
            </h2>
            <p className="today-hero-sub">
              {active
                ? `${active.name} · 记录还在，随时继续`
                : template
                  ? `${template.name} · ${template.items.length} 个动作 · 组间休息 ${template.restSeconds} 秒`
                  : '从自由训练开始，留下第一组。'}
            </p>
            <div className="today-hero-actions">
              <div className="today-cta-shell" ref={ctaRef}>
                <button
                  className="btn btn-primary today-cta"
                  data-haptic="selection"
                  disabled={!writable}
                  onClick={() => (active ? go('workout') : openStart(template ?? 'free'))}
                >
                  <span>{active ? '继续未完成训练' : template ? '开始今天的训练' : '开始自由训练'}</span>
                  <span className="today-cta-icon">
                    <Icon name="arrow" size={18} />
                  </span>
                </button>
              </div>
              <button className="hero-link today-hero-link" onClick={() => go('plans')}>
                查看 / 调整训练模板
                <span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="today-hero-meta" aria-label="今日训练概况">
              <span><b>{planRows.length || '自由'}</b> 动作</span>
              <span><b>{planRows.length ? plannedSets : 0}</b> 组</span>
              <span><b>{active?.restDuration ?? template?.restSeconds ?? 90}</b> 秒休息</span>
            </div>
          </div>
          <div className="today-dial-wrap" ref={dialRef} aria-hidden="true">
            <TodayDial
              segments={dialSegments}
              centerValue={active ? completedSets : planRows.length ? plannedSets : 0}
              centerLabel={active ? '组 · 已完成' : planRows.length ? '组 · 今日计划' : '组 · 自由训练'}
              centerDetail={planRows.length ? `${planRows.length} 个动作` : '无固定动作'}
            />
            <span className="today-dial-note">SESSION MAP</span>
          </div>
        </section>

        <section className="stats today-stats" aria-label="本月训练概览">
          <div className="stat">
            <span className="today-stat-index">01</span>
            <strong className="stat-value">
              {Math.round(sessionCount)}
              <small>次</small>
            </strong>
            <span className="stat-label" title="本月完成训练">本月完成训练</span>
            <span className="today-stat-spark" aria-hidden="true">
              {sessionSpark.map((value, index) => (
                <i key={index} style={sparkStyle(index, value)}><span /></i>
              ))}
            </span>
          </div>
          <div className="stat">
            <span className="today-stat-index">02</span>
            <strong className="stat-value">
              {hourCount === 0 ? '0' : hourCount.toFixed(1)}
              <small>小时</small>
            </strong>
            <span className="stat-label" title="实际训练时长">实际训练时长</span>
            <span className="today-stat-spark" aria-hidden="true">
              {timeSpark.map((value, index) => (
                <i key={index} style={sparkStyle(index, value)}><span /></i>
              ))}
            </span>
          </div>
          <div className="stat">
            <span className="today-stat-index">03</span>
            <strong className="stat-value">
              {Math.round(setCount)}
              <small>组</small>
            </strong>
            <span className="stat-label" title="本月完成组">本月完成组</span>
            <span className="today-stat-spark" aria-hidden="true">
              {setSpark.map((value, index) => (
                <i key={index} style={sparkStyle(index, value)}><span /></i>
              ))}
            </span>
          </div>
        </section>

        <div className="home-grid today-grid">
          <div className="home-main">
            <section className="today-plan" aria-labelledby="today-plan-title">
              <div className="section-heading today-plan-head">
                <div>
                  <p className="today-eyebrow"><span>01</span> 今日训练单</p>
                  <h2 id="today-plan-title" className="truncate" title={active?.name ?? template?.name ?? '我的第一份模板'}>
                    {active?.name ?? template?.name ?? '我的第一份模板'}
                  </h2>
                </div>
                <button className="btn btn-ghost today-plan-link" onClick={() => go('plans')}>
                  更换模板
                  <Icon name="arrow" size={16} />
                </button>
              </div>
              {planRows.length ? (
                <div className="today-plan-list">
                  {planRows.map((row, index) => (
                    <button
                      type="button"
                      className="exercise-row today-exercise"
                      key={row.id}
                      style={{ ['--row']: String(index) } as CSSProperties}
                      title={`查看${row.name}讲解`}
                      data-haptic="selection"
                      onClick={() => onExercise(row.exercise)}
                    >
                      <span className="today-exercise-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                      <span className="exercise-icon">
                        <Icon name={exerciseGlyph(row.kind)} />
                      </span>
                      <span className="today-exercise-copy">
                        <strong className="truncate" title={row.name}>{row.name}</strong>
                        <small>{row.muscle} · {row.equipment}</small>
                      </span>
                      <span className="exercise-meta">{formatRowMeta(row)}</span>
                      <span className="today-row-cta" aria-hidden="true">
                        <Icon name="arrow" size={16} />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>先创建一份适合自己的训练日模板。</p>
                  <button className="btn btn-secondary" disabled={!writable} onClick={() => setTemplateEditor('new')}>
                    新建模板
                  </button>
                </div>
              )}
              <div className="today-plan-foot">
                <span>
                  <Icon name="shield" size={16} />
                  本机保存，数据可带走
                </span>
                <button className="today-text-link" onClick={() => go('settings')}>数据与备份 ↗</button>
              </div>
            </section>
          </div>

          <aside className="home-side today-side">
            <Week sessions={completed} />
            <button className="home-atlas-link today-atlas" onClick={() => go('exercises')}>
              <span className="today-atlas-mark">
                <Icon name="target" size={26} />
              </span>
              <span className="today-atlas-copy">
                <strong>按身体部位找动作</strong>
                <small>点选肌群 · 查看要点 · 加入训练</small>
              </span>
              <Icon name="arrow" size={18} />
            </button>
            <section className="card today-recent" aria-label="最近训练">
              <div className="section-heading">
                <h3><span className="today-card-code">03</span> 最近训练</h3>
                {completed[0] && <span className="today-recent-date">{completed[0].date}</span>}
              </div>
              {completed[0] ? (
                <>
                  <h2 className="truncate" title={completed[0].name}>{completed[0].name}</h2>
                  <p className="today-recent-meta">
                    {sessionStats(completed[0]).completedSets} 组 ·{' '}
                    {Math.floor(sessionStats(completed[0]).activeSeconds / 60)} 分钟
                  </p>
                  <button className="today-text-link" onClick={() => go('progress')}>
                    回看训练记录 ↗
                  </button>
                </>
              ) : (
                <div className="today-recent-empty">
                  <span className="today-recent-mark" aria-hidden="true">
                    <Icon name="chart" size={22} />
                  </span>
                  <strong>第一场，从今天开始。</strong>
                  <p>完成并保存后，这里会出现最近一次训练。</p>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}

function Week({ sessions }: { sessions: Session[] }) {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return day;
  });
  const count = sessions.filter((session) => session.date >= localDate(days[0]) && session.date <= localDate(days[6])).length;
  return (
    <section className="card today-week" aria-label="本周训练节奏">
      <div className="section-heading">
        <h3><span className="today-card-code">02</span> 本周节奏</h3>
        <span className="today-week-range">
          {days[0].getMonth() + 1}.{days[0].getDate()} — {days[6].getMonth() + 1}.{days[6].getDate()}
        </span>
      </div>
      <div className="week-grid">
        {days.map((day, i) => {
          const done = sessions.some((session) => session.date === localDate(day));
          const isToday = localDate(day) === localDate(today);
          return (
            <div
              className={`week-day${isToday ? ' active' : ''}${done ? ' done' : ''}`}
              key={i}
              style={{ ['--i']: String(i) } as CSSProperties}
              aria-label={`${day.getMonth() + 1}月${day.getDate()}日${done ? '，已训练' : ''}${isToday ? '，今天' : ''}`}
            >
              <span>{'一二三四五六日'[i]}</span>
              <strong>{day.getDate()}</strong>
            </div>
          );
        })}
      </div>
      <div className="today-week-foot">
        <span>本周已完成</span>
        <strong>{count} 场训练</strong>
      </div>
    </section>
  );
}
