import { COMPACT_LAYOUT_QUERY, isCompactViewport } from "../platform/compact-layout";
import { muscleLabel } from "../content/body-map";
import Presence from "../motion/Presence";
import RestPanel from "./workout/RestPanel";
import ExerciseNav from "./workout/ExerciseNav";
import SessionReview from "./workout/SessionReview";
import SetTable from "./workout/SetTable";
import { formatClock, useNow } from "./workout/clock";
import type { Update } from "./workout/types";
export { default as SetTable } from "./workout/SetTable";
export { default as Summary } from "./workout/Summary";
export { formatClock, useNow } from "./workout/clock";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppData, Exercise, Session } from "../domain/types";
import {
  pauseSession,
  resumeSession,
  reviewSession,
  sessionStats,
  uid,
} from "../domain/training";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import ExerciseDetails from "./ExerciseDetails";
import { exerciseSetHistory, nextSuggestedSet } from "./workout/performance";
import ExercisePicker from "../components/ExercisePicker";
import ReplacementPicker from "./workout/ReplacementPicker";
import { presetAlternativeIds, presetExerciseById } from "../content/training-presets";
import TrainingTools from "./training-tools/TrainingTools";
import type { useRestReminder } from "./workout/useRestReminder";
export { displayWeight, fromWeight } from "../domain/units";

export default function Workout({
  data,
  session,
  update,
  finish,
  cancel,
  writable,
  online,
  goHome,
  restReminder,
  addExercise,
  insertWarmups,
  cancelPendingAction,
  hasPendingAction,
}: {
  data: AppData;
  session: Session;
  update: Update;
  finish: () => Promise<boolean>;
  cancel: () => Promise<boolean>;
  writable: boolean;
  online: boolean;
  goHome: () => void;
  restReminder: ReturnType<typeof useRestReminder>;
  addExercise: (exercise: Exercise, replaceId?: string) => Promise<string | null>;
  insertWarmups: (
    itemId: string,
    rows: Array<{ weightKg: number; reps: number }>,
  ) => Promise<boolean>;
  cancelPendingAction: () => Promise<boolean>;
  hasPendingAction: boolean;
}) {
  const now = useNow();
  const positionKey = "jianlibao.training-position";
  const [position, setPosition] = useState(() => {
    const initial = session.exercises.find((item) => item.sets.some((set) => set.status === "pending"));
    try {
      const stored = localStorage.getItem(positionKey);
      const id = stored?.startsWith(`${session.id}/`) ? stored.slice(session.id.length + 1) : undefined;
      const selected = session.exercises.find((item) => item.id === id);
      const hasPending = selected?.sets.some((set) => set.status === "pending");
      return (hasPending ? selected : initial ?? selected ?? session.exercises[0])?.id ?? "";
    } catch {
      return (initial ?? session.exercises[0])?.id ?? "";
    }
  });
  const [compact, setCompact] = useState(isCompactViewport);
  const [chosenSetId, setChosenSetId] = useState<string>();
  useEffect(() => {
    const media = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const change = () => setCompact(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const [queueOpen, setQueueOpen] = useState(false);
  const queueOrigin = useRef(0);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [adding, setAdding] = useState<"add" | "replace" | null>(null);
  // The optimistic result can change the current item before the repository responds.
  const replacing = useRef<Session["exercises"][number] | null>(null);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionBusy = useRef(false);
  const [addError, setAddError] = useState("");
  const closeAdding = () => {
    if (!actionBusy.current)
      void cancelPendingAction().then((ok) => {
        if (ok) {
          setAddError("");
          setSelected(null);
          setAdding(null);
        }
      });
  };
  const [restCollapsed, setRestCollapsed] = useState(true);
  const view = useRef<HTMLDivElement>(null);
  const toggleQueue = () => {
    if (queueOpen) {
      setQueueOpen(false);
      requestAnimationFrame(() => view.current?.scrollTo({ top: queueOrigin.current, behavior: "instant" }));
    } else {
      queueOrigin.current = view.current?.scrollTop ?? 0;
      setQueueOpen(true);
      view.current?.scrollTo({ top: 0, behavior: "instant" });
    }
  };
  const stats = sessionStats(session, now);
  const count = session.exercises.reduce((n, e) => n + e.sets.length, 0);
  const remaining = session.exercises.reduce((n, e) => n + e.sets.filter((set) => set.status === "pending").length, 0);
  const disabled =
    !writable || session.status === "paused" || session.status === "review";
  const rest = session.restUntil
    ? Math.max(0, Math.ceil((session.restUntil - now) / 1000))
    : 0;
  const index = session.exercises.findIndex(({ id }) => id === position);
  const current = index < 0 ? Math.max(0, session.exercises.findIndex((ex) => ex.sets.some((set) => set.status === "pending"))) : index;
  const item = session.exercises[current];
  const selectItem = (id: string) => {
    setChosenSetId(undefined);
    setPosition(id);
    try {
      localStorage.setItem(positionKey, `${session.id}/${id}`);
    } catch {
      // Recording remains available when position storage is disabled.
    }
  };
  const setCurrent = (next: number) => {
    if (session.exercises[next]) selectItem(session.exercises[next].id);
  };
  const exercise = item?.exercise;
  const setHistory = useMemo(() => exercise ? exerciseSetHistory(data.sessions, exercise, session.date, session.id) : [],
    [data.sessions, exercise, session.date, session.id]);
  useLayoutEffect(() => {
    const root = view.current;
    if (!root) return;
    const panels = [
      ...root.querySelectorAll<HTMLElement>(".rest-panel,.workout-footer"),
    ];
    const measure = () => {
      const mobile = isCompactViewport();
      const footer =
        root.querySelector<HTMLElement>(".workout-footer")?.offsetHeight ?? 0;
      const restPanel =
        root.querySelector<HTMLElement>(".rest-panel")?.offsetHeight ?? 0;
      root.style.setProperty(
        "--workout-action-height",
        `${Math.ceil(footer / 4) * 4}px`,
      );
      root.style.setProperty(
        "--workout-dock-height",
        `${mobile && (footer || restPanel) ? Math.ceil((footer + restPanel + 32) / 4) * 4 : 0}px`,
      );
      root
        .closest<HTMLElement>(".app-shell")
        ?.style.setProperty(
          "--training-dock-height",
          root.style.getPropertyValue("--workout-dock-height"),
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    panels.forEach((panel) => observer.observe(panel));
    const resize = () => {
      if (
        isCompactViewport() &&
        (window.visualViewport?.height ?? innerHeight) < 600
      )
        setRestCollapsed(true);
      measure();
    };
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      root
        .closest<HTMLElement>(".app-shell")
        ?.style.removeProperty("--training-dock-height");
    };
  }, [session.status, item?.id, compact]);
  useLayoutEffect(() => {
    view.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [item?.id, session.status === "review"]);
  const pending = item?.sets.findIndex((set) => set.status === "pending") ?? -1;
  const focused = item?.sets.findIndex((set) => set.id === chosenSetId && set.status === 'pending') ?? -1;
  const entryIndex = compact && focused >= 0 ? focused : pending;
  const nextPendingMove = session.exercises.findIndex((move, index) => index > current && move.sets.some((set) => set.status === 'pending'));
  const pendingMove = nextPendingMove >= 0 ? nextPendingMove : session.exercises.findIndex((move) => move.sets.some((set) => set.status === 'pending'));
  const openPicker = (mode: "add" | "replace") => {
    replacing.current = mode === "replace" ? item : null;
    setSelected(null);
    setAddError("");
    setAdding(mode);
  };
  const submitMovement = async (exercise: Exercise) => {
    if (disabled || actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setSelected(exercise);
    try {
      const id = await addExercise(exercise, replacing.current?.id);
      if (id) {
        selectItem(id);
        setAdding(null);
      } else {
        setAddError("动作尚未保存，可重试或取消。");
      }
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  };
  const saveWorkout = async () => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setFinishError("");
    try {
      if (await finish()) setConfirmFinish(false);
      else {
        setFinishError("保存未成功，记录还在，可再次保存。");
        setConfirmFinish(true);
      }
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  };
  const endWorkout = () => {
    setFinishError("");
    if (remaining || !stats.completedSets) setConfirmFinish(true);
    else void saveWorkout();
  };
  function renderFooter(record?: ReactNode) {
    const following = current < session.exercises.length - 1 ? current + 1 : -1;
    const next = compact && !record ? pendingMove : following;
    const nextLabel = next < 0 ? '完成本次训练' : next < current ? '回到待练动作' : '下一动作';
    return <div className="workout-footer">
      <button className="btn btn-secondary" disabled={!current} onClick={() => setCurrent(current - 1)} aria-label="上一动作">
        <Icon name="back" size={16} />
        <span className="workout-previous-label">上一动作</span>
      </button>
      <button type="button" className="btn btn-secondary workout-queue-mobile" aria-controls="workout-queue"
        aria-expanded={queueOpen} aria-label={`动作 ${current + 1}/${session.exercises.length}`} onClick={toggleQueue}>
        {current + 1}/{session.exercises.length} <span>动作</span>
      </button>
      {record}
      {(!record || next >= 0) && <button className={`btn ${record ? 'btn-secondary workout-next' : 'btn-primary'}`}
        aria-label={nextLabel} onClick={() => next >= 0 ? setCurrent(next) : endWorkout()}
        disabled={!writable || session.status === "paused" || busy}>
        {!record && nextLabel}
        <Icon name="arrow" size={16} />
      </button>}
    </div>;
  }
  const waitingMove = entryIndex >= 0 ? item : session.exercises[pendingMove];
  const waitingIndex = entryIndex >= 0 ? entryIndex : waitingMove?.sets.findIndex((set) => set.status === 'pending');
  const nextGroup = waitingMove && waitingIndex !== undefined ? `${waitingMove.exercise.name} · 第${waitingIndex + 1}组`
    : item ? '本次训练各组已处理' : '先加入一个动作';
  const original = replacing.current;
  const alternatives = original && adding === "replace"
    ? presetAlternativeIds(session.templateId, original.exercise.id).flatMap((id) => {
      const exercise = data.exercises.find((candidate) => candidate.id === id) ?? presetExerciseById.get(id);
      return exercise ? [exercise] : [];
    })
    : [];
  const setNote = (note: string) =>
    void update((s) => ({ ...s, note, updatedAt: new Date().toISOString() }));
  return (
    <div
      className={`workout-view${compact && item && session.status !== 'review' ? ' workout-focus' : ''}`}
      data-ios-input-scope=""
      ref={view}
      onFocusCapture={(event) => {
        if (
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLSelectElement ||
          event.target instanceof HTMLTextAreaElement
        )
          setRestCollapsed(true);
      }}
    >
      <div className="workout-header">
        <div>
          <h1
            className={session.status === "review" ? "wrap-cjk" : "truncate"}
            title={session.name}
          >
            {session.status === "review"
              ? "把今天的努力留下来。"
              : session.name}
          </h1>
          <p className="muted">
            <span className="workout-session-date">{session.date} · </span>
            {session.status === "paused"
              ? "已暂停"
              : session.status === "review"
                ? "待归档"
                : compact && !online
                  ? <span title="当前离线，记录继续保存在本机">离线</span>
                  : "训练中"}{" "}
            · {formatClock(stats.activeSeconds)}
          </p>
        </div>
        <div className="workout-header-actions">
          <button className="btn btn-secondary" onClick={goHome} disabled={busy} aria-label="返回今天">
            <Icon name="back" />
            <span className="workout-return-label">返回今天</span>
          </button>
          {session.status !== "review" && (
            <button className={`btn ${compact && item ? 'btn-secondary' : 'btn-primary'} workout-end`} onClick={endWorkout} disabled={!writable || busy || hasPendingAction}>
              结束训练
            </button>
          )}
        </div>
      </div>
      {session.status === "review" ? (
        <SessionReview
          data={data}
          session={session}
          now={now}
          stats={stats}
          writable={writable}
          busy={busy}
          setBusy={setBusy}
          update={update}
          finish={finish}
          setNote={setNote}
        />
      ) : (
        <>
          <div className="section-heading workout-progress">
            <div className="workout-progress-copy">
              {item && <button type="button" className="btn btn-secondary workout-queue-toggle" aria-controls="workout-queue" aria-expanded={queueOpen}
                onClick={toggleQueue}>
                动作 {current + 1}/{session.exercises.length}
              </button>}
              <p className="muted">已完成 {stats.completedSets} / {count} 组</p>
            </div>
            <span className="tag">
              {!session.exercises.some(
                (ex) => ex.exercise.kind === "weight-reps",
              )
                ? "重量容量不适用"
                : stats.volumeKg.toLocaleString("zh-CN", {
                    maximumFractionDigits: 1,
                  }) + " kg·次"}
            </span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="训练完成进度"
            aria-valuenow={stats.completedSets}
            aria-valuemin={0}
            aria-valuemax={count || 1}
            aria-valuetext={`已完成 ${stats.completedSets} / ${count} 组`}
          >
            <div
              className="progress-fill"
              style={{
                transform: `scaleX(${count ? stats.completedSets / count : 0})`,
              }}
            />
          </div>
          <div id="workout-queue" hidden={!queueOpen}>
            {queueOpen && <ExerciseNav session={session} current={current} setCurrent={(next) => {
              setCurrent(next);
              setQueueOpen(false);
            }} />}
          </div>
          <div className="workout-grid">
            <div className="workout-main">
              {session.status === "paused" && (
                <div className="notice">
                  <strong>训练已暂停</strong>
                  <p>暂停时间不计入训练时长。点击继续后记录。</p>
                  <button
                    className="btn btn-primary"
                    disabled={!writable}
                    onClick={() => void update((s) => resumeSession(s))}
                  >
                    继续训练
                  </button>
                </div>
              )}
              {item ? (
                <section className="card exercise-card current">
                  <div className="exercise-heading">
                    <div>
                      <p className="exercise-position truncate">
                        动作 {current + 1} / {session.exercises.length} ·{" "}
                        {muscleLabel(item.exercise)}
                      </p>
                      <h2
                        className="line-clamp-2 wrap-cjk"
                        title={item.exercise.name}
                      >
                        {item.exercise.name}
                      </h2>
                      <p className="muted workout-exercise-meta">
                        {item.exercise.equipment}
                        {!compact && (item.exercise.kind === "weight-reps"
                          ? " · 总外部负重；双哑铃两只合计"
                          : item.exercise.kind === "duration"
                            ? " · 按实际秒数记录"
                            : " · 按次数记录，不估算有效负重")}
                      </p>
                    </div>
                    <div className="workout-exercise-actions"><button
                      className="btn btn-ghost"
                      aria-label="动作说明 ↗"
                      onClick={() => setDetail(item.exercise)}
                    >
                      {compact ? '讲解' : '动作说明 ↗'}
                    </button>
                    {pending >= 0 && <button type="button" className="btn btn-secondary"
                      disabled={disabled || busy || (session.exercises.length >= 30 && (!!item.note || item.sets.some((set) => set.status !== "pending")))}
                      onClick={() => openPicker("replace")}>换动作</button>}
                    </div>
                  </div>
                  <SetTable
                    key={item.id}
                    session={session}
                    exerciseIndex={current}
                    unit={data.settings.unit}
                    update={update}
                    disabled={disabled}
                    autoRest={data.settings.autoRest}
                    showRpe={data.settings.showRpe}
                    history={setHistory}
                    compact={compact ? {
                      focusedSetId: item.sets[entryIndex]?.id,
                      select: (id) => {
                        setChosenSetId(id);
                        view.current?.scrollTo({ top: 0, behavior: 'instant' });
                      },
                      footer: renderFooter,
                    } : undefined}
                  />
                  {!compact && <p className="set-help">待完成组为建议值，确认后才计入记录。</p>}
                  {data.settings.showRpe && (
                    <p className="set-help">
                      递减、力竭计入工作组，热身不计容量。RPE 为可选主观用力：6
                      较轻松，10 已尽力。
                    </p>
                  )}
                  <div className="row wrap">
                    <button
                      className="btn btn-ghost"
                      disabled={disabled || item.sets.length >= 30}
                      onClick={() => {
                        void update((s) => ({
                          ...s,
                          exercises: s.exercises.map((ex) =>
                            ex.id === item.id
                              ? {
                                  ...ex,
                                  sets: [
                                    ...ex.sets,
                                    nextSuggestedSet(
                                      ex,
                                      data.sessions,
                                      uid(),
                                      s.date,
                                      s.id,
                                    ),
                                  ],
                                }
                              : ex,
                          ),
                          updatedAt: new Date().toISOString(),
                        }));
                        if (compact && pending < 0) view.current?.scrollTo({ top: 0, behavior: 'instant' });
                      }}
                    >
                      <Icon name="plus" />
                      增加一组
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={disabled}
                      onClick={() => openPicker("add")}
                    >
                      添加动作
                    </button>
                    <button
                      className="btn btn-ghost"
                      aria-expanded={toolsOpen}
                      disabled={disabled}
                      onClick={() => setToolsOpen(true)}
                    >
                      训练辅助
                    </button>
                  </div>
                  <Presence interruptKey={item?.id}>
                    {toolsOpen && item && (
                      <TrainingTools
                        key={`${item.id}-${data.settings.unit}`}
                        exercise={item}
                        sessionDate={session.date}
                        sessions={data.sessions}
                        bodyMetrics={data.bodyMetrics}
                        unit={data.settings.unit}
                        writable={!disabled}
                        onClose={() => {
                          void cancelPendingAction().then((ok) => {
                            if (ok) setToolsOpen(false);
                          });
                        }}
                        onInsertWarmups={(rows) => insertWarmups(item.id, rows)}
                      />
                    )}
                  </Presence>
                  <label className="field">
                    动作备注
                    <input
                      className="form-input"
                      maxLength={1000}
                      value={item.note}
                      disabled={disabled}
                      onChange={(e) => {
                        const value = e.target.value;
                        void update((s) => ({
                          ...s,
                          exercises: s.exercises.map((ex) =>
                            ex.id === item.id ? { ...ex, note: value } : ex,
                          ),
                          updatedAt: new Date().toISOString(),
                        }));
                      }}
                      placeholder="器械档位、个人提示…"
                    />
                  </label>
                  {!compact && renderFooter()}
                </section>
              ) : (
                <section className="card empty-state">
                  <Icon name="dumbbell" size={24} />
                  <h2>按自己的节奏，开始自由训练。</h2>
                  <p>加入第一个动作，记录今天的第一组。</p>
                  <button
                    className="btn btn-primary"
                    disabled={disabled}
                    onClick={() => openPicker("add")}
                  >
                    添加动作
                  </button>
                </section>
              )}
            </div>
            <aside className="workout-side">
              <RestPanel
                rest={rest}
                disabled={disabled}
                update={update}
                reminder={restReminder}
                collapsed={restCollapsed}
                setCollapsed={setRestCollapsed}
                nextGroup={nextGroup}
              />
              <div className="row wrap">
                <button
                  className="btn btn-secondary"
                  disabled={disabled}
                  onClick={() => void update((s) => pauseSession(s))}
                >
                  <Icon name="pause" />
                  暂停训练
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={!writable}
                  onClick={() => void update((s) => reviewSession(s))}
                >
                  提前回顾
                </button>
              </div>
            </aside>
          </div>
        </>
      )}
      <button
        className="btn btn-ghost danger-text"
        disabled={!writable}
        onClick={() => setConfirmCancel(true)}
      >
        取消这场训练
      </button>
      <Presence interruptKey={item?.id}>
        {detail && (
          <ExerciseInfo
            exercise={detail}
            data={data}
            onClose={() => setDetail(null)}
          />
        )}
      </Presence>
      <Presence interruptKey={session.id}>
        {adding && (
          <Modal
            title={adding === "replace" ? "替换剩余组" : "加入训练的动作"}
            onClose={closeAdding}
            footer={
              <>
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={closeAdding}
                >
                  取消
                </button>
                {(adding === "add" || addError) && <button
                  className="btn btn-primary"
                  disabled={
                    disabled ||
                    (adding === "add" && session.exercises.length >= 30 && !hasPendingAction) ||
                    !selected ||
                    busy
                  }
                  onClick={() => { if (selected) void submitMovement(selected); }}
                >
                  {addError ? "重试保存动作" : "加入训练"}
                </button>}
              </>
            }
          >
            {adding === "replace" && original ? (
              <>
                <p className="notice">
                  {original.exercise.name} · 保留已完成 {original.sets.filter((set) => set.status === "completed").length} 组，
                  替换剩余 {original.sets.filter((set) => set.status === "pending").length} 组。
                </p>
                <ReplacementPicker saved={data.exercises} original={original.exercise} alternatives={alternatives}
                  blocked={busy || !!addError || disabled} onPick={(exercise) => void submitMovement(exercise)} />
              </>
            ) : <ExercisePicker saved={data.exercises} value={selected} onChange={setSelected} />}
            {addError && (
              <p role="alert" className="error-text">
                {addError}
              </p>
            )}
          </Modal>
        )}
      </Presence>
      <Presence interruptKey={session.id}>
        {confirmFinish && (
          <Modal title="结束训练" onClose={() => { if (!busy) setConfirmFinish(false); }}
            footer={<>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmFinish(false)}>继续训练</button>
              {stats.completedSets > 0 ? (
                <button type="button" className="btn btn-primary" disabled={!writable || busy} onClick={() => void saveWorkout()}>
                  {busy ? "正在保存…" : `保存已完成 ${stats.completedSets} 组`}
                </button>
              ) : (
                <button type="button" className="btn btn-danger" disabled={!writable} onClick={() => {
                  setConfirmFinish(false);
                  setConfirmCancel(true);
                }}>放弃草稿</button>
              )}
            </>}>
            <p>已完成 <strong>{stats.completedSets}</strong> 组 · 剩余 <strong>{remaining}</strong> 组</p>
            {stats.completedSets > 0 && remaining > 0 && <p className="muted">未完成组不会计入训练量。</p>}
            {finishError && <p role="alert" className="error-text">{finishError}</p>}
          </Modal>
        )}
      </Presence>
      <Presence interruptKey={item?.id}>
        {confirmCancel && (
          <Modal
            title="取消这场训练？"
            onClose={() => setConfirmCancel(false)}
            footer={
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => setConfirmCancel(false)}
                >
                  继续保留
                </button>
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (await cancel()) setConfirmCancel(false);
                  }}
                >
                  确认取消训练
                </button>
              </>
            }
          >
            <p>
              这场草稿会标为已取消，不计入完成历史。已归档的其他训练不受影响。
            </p>
          </Modal>
        )}
      </Presence>
    </div>
  );
}

export function ExerciseInfo(props: {
  exercise: Exercise;
  data?: AppData;
  onClose: () => void;
}) {
  return <ExerciseDetails {...props} />;
}
