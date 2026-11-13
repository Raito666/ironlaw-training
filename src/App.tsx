import { isWarmupTemplateItem } from './domain/sets';
import { ensurePresetExercises, presetExerciseById, resolvePresetDay } from './content/training-presets';
import { TrainingReminder } from './features/plans/TrainingSchedule';
import { indexScheduledSessions, type TrainingDate } from './features/plans/schedule';
import { useTrainingSchedule } from './features/plans/useTrainingSchedule';
import { withScheduleLinks } from './data/migrations';
import Presence from './motion/Presence';
import AppShell from './app/AppShell';
import BrandMark from './components/BrandMark';
import { flushSync } from 'react-dom';
import { withViewTransition } from './motion/transition';
import { useRestReminder } from './features/workout/useRestReminder';
import Toast from './components/Toast';
import { getPage, type Page } from './app/navigation';
import { applyLaunchTheme, dismissLaunch } from './app/launch';
import TodayPage from './features/today/TodayPage';
import PlansPage from './features/plans/PlansPage';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AppData, Exercise, Session, WorkoutTemplate } from './domain/types';
import { isRetiredStarterTemplate } from './domain/seed';
import { completeSession, createRepeatedSession, createSession, reviewSession, sessionStats, uid } from './domain/training';
import { useWorkspace } from './hooks/useWorkspace';
import { useCloudSync } from './sync/useCloudSync';
import Icon from './components/Icon';
import Modal from './components/Modal';
import { ExerciseEditor, TemplateEditor } from './features/Editors';
import Workout, { ExerciseInfo } from './features/Workout';
import History, { localDate } from './features/History';
import ExerciseLibrary from './features/ExerciseLibrary';
import BackupSettings, { downloadBackup } from './features/BackupSettings';
import { useNativeInterface } from './platform/useNativeInterface';
import { ensureExercises } from './content/opengym-catalogue';
import { useSyncProvider } from './opengym/provider';
import { useOpenGymSync } from './opengym/useOpenGymSync';
import { addToTraining, insertWarmups } from './features/workout/catalogue-actions';
import { usePendingMutation } from './features/pending-mutation';

const isDraft = (s: Session) => ['active', 'paused', 'review'].includes(s.status);
const templateForSchedule = (entry: TrainingDate, templates: WorkoutTemplate[]) =>
  resolvePresetDay(entry.templateId, templates.find((template) => template.id === entry.templateId), entry.choices);

export default function App() {
  useNativeInterface();
  const workspace = useWorkspace();
  const schedule = useTrainingSchedule(workspace);
  const syncProvider = useSyncProvider();
  const cloud = useCloudSync({
    ...workspace,
    enabled: syncProvider.ready && syncProvider.provider === 'netlify',
  });
  const openGym = useOpenGymSync(workspace, syncProvider.ready && syncProvider.provider === 'opengym');
  const { data, status, error, writable, accessReady, mutate } = workspace;
  const opening = status === 'loading' || (data !== null && !accessReady);
  const pendingAction = usePendingMutation(mutate, workspace.retry);
  const [page, setPage] = useState<Page>(getPage);
  const [pageMotion, setPageMotion] = useState<'initial' | 'native' | 'fallback'>('initial');
  const intendedPage = useRef(page);
  const mainRef = useRef<HTMLElement>(null);
  const previousPage = useRef(page);
  useEffect(() => {
    if (previousPage.current !== page) {
      void pendingAction.cancel();
      previousPage.current = page;
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [page]);
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [templateEditor, setTemplateEditor] = useState<WorkoutTemplate | 'new' | null>(null);
  const [exerciseEditor, setExerciseEditor] = useState(false);
  const [exerciseInfo, setExerciseInfo] = useState<Exercise | null>(null);
  const [startRequest, setStartRequest] = useState<{ template: WorkoutTemplate | 'free'; scheduleId?: string; repeat?: Session } | null>(null);
  const startTemplate = startRequest?.template;
  const starting = useRef(false);
  const [finishing, setFinishing] = useState<Session | null>(null);
  const [savedSessionId, setSavedSessionId] = useState('');
  const [archiveTemplate, setArchiveTemplate] = useState<WorkoutTemplate | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const notify = (message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 4500);
  };
  const restReminder = useRestReminder(data?.sessions.find(isDraft), writable, () =>
    notify('休息结束，可以开始下一组。'),
  );
  const go = (next: Page) => {
    location.hash = `/${next}`;
    navigate(next);
  };
  const goSchedule = () => {
    if (page === 'plans') document.getElementById('training-schedule')?.scrollIntoView({ block: 'start' });
    else {
      location.hash = '/plans?schedule=1';
      navigate('plans');
    }
  };
  function navigate(next: Page) {
    if (intendedPage.current === next) {
      return;
    }
    intendedPage.current = next;
    let motion: 'native' | 'fallback' = 'native';
    withViewTransition(
      () => {
        // Select entry roles against the destination's first viewport, also in the synchronous fallback.
        window.scrollTo({ top: 0, behavior: 'instant' });
        flushSync(() => {
          setPageMotion(motion);
          setPage(next);
        });
      },
      () => {
        motion = 'fallback';
      },
    );
  }
  useEffect(() => {
    const change = () => {
      navigate(getPage());
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const theme = data?.settings.theme;
  useLayoutEffect(() => {
    if (theme) applyLaunchTheme(theme);
  }, [theme]);
  useLayoutEffect(() => {
    if (!opening) dismissLaunch();
  }, [opening]);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener('online', change);
    window.addEventListener('offline', change);
    return () => {
      window.removeEventListener('online', change);
      window.removeEventListener('offline', change);
    };
  }, []);

  if (opening) return null;
  if (!data)
    return (
      <main className="main loading-screen">
        <BrandMark size={64} className="loading-brand" />
        <h1>铁律</h1>
        <p className="loading-kicker">IRONLAW · 力量训练档案</p>
        <p role="alert" className="error-text">
          {error}
        </p>
        <p>未改动现有数据。请确认浏览器允许本地存储后重试。</p>
        <button className="btn btn-primary" onClick={() => void workspace.reload()}>
          重新打开本地数据
        </button>
      </main>
    );
  const active = data.sessions.find(isDraft);
  const workout = active ?? finishing;
  const completed = data.sessions
    .filter((s) => s.status === 'completed')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const templates = data.templates.filter((t) => !t.archived && !isRetiredStarterTemplate(t));
  const date = new Date();
  const today = localDate(date);
  const findScheduledSession = indexScheduledSessions(data.sessions);
  const waiting = schedule.entries.flatMap((entry) => {
    if (findScheduledSession(entry)) return [];
    const template = templateForSchedule(entry, data.templates);
    return template && !template.archived ? [{ entry, template }] : [];
  });
  const todaySchedule = waiting.filter(({ entry }) => entry.date === today);
  const missedSchedule = waiting.filter(({ entry }) => entry.date < today).slice(-3).reverse();
  const nextScheduled = waiting.find(({ entry }) => entry.date > today);
  const monthSessions = completed.filter((s) => s.date.startsWith(localDate(date).slice(0, 7)));
  const monthlySeconds = monthSessions.reduce((n, s) => n + sessionStats(s).activeSeconds, 0);
  const monthlySets = monthSessions.reduce((n, s) => n + sessionStats(s).completedSets, 0);
  const updateSession = (fn: (session: Session) => Session, additions: Exercise[] = []) =>
    mutate((d) => {
      const latest = d.sessions.find((s) => s.id === active?.id);
      if (!latest || !isDraft(latest)) throw new Error('这场训练已归档，请到历史查看');
      return {
        ...ensureExercises(d, additions),
        sessions: d.sessions.map((s) => (s.id === latest.id ? fn(s) : s)),
      };
    });
  const updatePendingSession = (
    fn: (session: Session, current: AppData) => Session,
    additions: Exercise[] = [],
  ) =>
    pendingAction.run((d) => {
      const latest = d.sessions.find((s) => s.id === active?.id);
      if (!latest || !isDraft(latest)) throw new Error('这场训练已归档，请到历史查看');
      return {
        ...ensureExercises(d, additions),
        sessions: d.sessions.map((s) => (s.id === latest.id ? fn(s, d) : s)),
      };
    });
  const begin = async (target: WorkoutTemplate | 'free', scheduleId?: string, repeat?: Session) => {
    if (!writable || starting.current) return;
    if (active) {
      setStartRequest(null);
      go('workout');
      return;
    }
    starting.current = true;
    let scheduleChanged = false;
    try {
      const ok = await mutate((d) => {
        if (d.sessions.some(isDraft)) throw new Error('请先继续已有草稿');
        let template = target === 'free' ? null : target;
        if (scheduleId) {
          const entry = d.trainingSchedule?.find(({ id }) => id === scheduleId);
          const latest = entry ? templateForSchedule(entry, d.templates) : undefined;
          if (!entry || !latest || latest.archived || indexScheduledSessions(d.sessions)(entry)) {
            scheduleChanged = true;
            throw new Error('这场排期已变更，请返回排期查看');
          }
          template = latest;
        }
        const next = template && !repeat ? ensurePresetExercises(d, [template]) : d;
        const session = repeat ? createRepeatedSession(repeat) : createSession(template, next.exercises);
        if (scheduleId) session.scheduleId = scheduleId;
        if (!template) session.restDuration = d.settings.defaultRest;
        return { ...(scheduleId ? withScheduleLinks(next) : next), onboarded: true, sessions: [...next.sessions, session] };
      });
      setStartRequest(null);
      if (ok) go('workout');
      else notify(scheduleChanged ? '这场排期已变更，请返回排期查看。' : '训练草稿尚未写入，请重试本机保存。');
    } finally {
      starting.current = false;
    }
  };
  const quickStart = (target: WorkoutTemplate | 'free', scheduleId?: string) => {
    if (starting.current) return;
    if (active && (!scheduleId || active.scheduleId !== scheduleId)) setStartRequest({ template: target, scheduleId });
    else void begin(target, scheduleId);
  };
  const exportCurrent = async () => {
    try {
      const result = await downloadBackup(data);
      if (result === 'cancelled' || result === 'busy') {
        notify(result === 'cancelled' ? '已取消分享，记录仍保存在本机' : '请先完成当前分享');
        return;
      }
      if (result === 'shared') {
        notify('备份已交给系统分享，请确认保存到所选位置');
        return;
      }
      notify(
        status === 'error' || status === 'conflict'
          ? '当前页面记录已导出，请确认下载完成'
          : '备份已生成，请确认下载完成',
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const openStart = (t: WorkoutTemplate | 'free', scheduleId?: string) => {
    setToast('');
    setStartRequest({ template: t, scheduleId });
  };
  async function useExercise(exercise: Exercise): Promise<boolean> {
    if (active) {
      if (active.status !== 'active') {
        go('workout');
        notify('先恢复或归档当前训练，再加入动作');
        return false;
      }
      if (active.exercises.length >= 30 && !pendingAction.hasPending()) {
        notify('单场最多30个动作，请先完成当前训练');
        return false;
      }
      const ok = await updatePendingSession(
        (s, current) => addToTraining(s, exercise, current.sessions),
        [exercise],
      );
      if (!ok) return false;
      go('workout');
      return true;
    }
    if (!(await pendingAction.run((d) => ensureExercises(d, [exercise])))) return false;
    openStart({
      id: uid(),
      name: exercise.name,
      description: '从这个动作开始，可继续添加其他动作。',
      restSeconds: data!.settings.defaultRest,
      updatedAt: new Date().toISOString(),
      items: [{ id: uid(), exerciseId: exercise.id, sets: 3, weightKg: 0, reps: 10, durationSeconds: 30 }],
    });
    return true;
  }
  async function repeatSession(session: Session) {
    if (active) {
      openStart('free');
      return;
    }
    const items = session.exercises.filter((ex) => ex.sets.some((s) => s.status === 'completed'));
    const snapshots = [...new Map(items.map((ex) => [ex.exercise.id, ex.exercise])).values()];
    if (items.some((ex) => !data!.exercises.some((e) => e.id === ex.exercise.id))) {
      const ok = await mutate((d) => ({
        ...d,
        exercises: [...d.exercises, ...snapshots.filter((ex) => !d.exercises.some((e) => e.id === ex.id))],
      }));
      if (!ok) return;
    }
    setToast('');
    setStartRequest({
      repeat: session,
      template: {
        id: uid(), name: `${session.name.slice(0, 100)} · 复练`,
        description: `来自 ${session.date}。逐组带入已完成的训练值和组类型，开始后可调整。`,
        restSeconds: session.restDuration, updatedAt: new Date().toISOString(),
        items: items.map((ex) => {
          const recorded = ex.sets.filter((set) => set.status === 'completed');
          const { weightKg, reps, durationSeconds } = recorded[0];
          return { id: uid(), exerciseId: ex.exercise.id, sets: recorded.length, weightKg, reps, durationSeconds };
        }),
      },
    });
  }

  return (
    <AppShell
      pageMotion={pageMotion}
      page={page}
      active={active}
      data={data}
      online={online}
      workspace={workspace}
      mainRef={mainRef}
      go={go}
      exportCurrent={exportCurrent}
      onReload={() => setConfirmReload(true)}
      overlays={
        <>
          <Presence interruptKey={page}>
            {startTemplate && (
              <Modal
                title={
                  active ? '继续已有训练' : startTemplate === 'free' ? '开始自由训练' : startTemplate.name
                }
                onClose={() => setStartRequest(null)}
                footer={
                  <>
                    <button className="btn btn-secondary" onClick={() => setStartRequest(null)}>
                      暂不开始
                    </button>
                    <button className="btn btn-primary" disabled={!writable} onClick={() => void begin(startTemplate, startRequest?.scheduleId, startRequest?.repeat)}>
                      {active ? '继续已有训练' : '确认开始训练'}
                      <Icon name="arrow" />
                    </button>
                  </>
                }
              >
                {active ? (
                  <p>本机有未完成的“{active.name}”。先继续、归档或明确取消它，再开始另一场。</p>
                ) : startTemplate === 'free' ? (
                  <p>自由加入动作，按实际情况记录。有效修改会自动保存到本机。</p>
                ) : (
                  <>
                    <p className="muted">{startTemplate.description}</p>
                    <div className="exercise-list">
                      {startTemplate.items.map((item) => (
                        <div className="exercise-row" key={item.id}>
                          <strong>{(data.exercises.find((e) => e.id === item.exerciseId) ?? presetExerciseById.get(item.exerciseId))?.name}</strong>
                          <span>{isWarmupTemplateItem(item) ? '热身 · ' : ''}{item.sets} 组</span>
                        </div>
                      ))}
                    </div>
                    <p className="notice">
                      模板是起点：训练中可以临时调整动作、组数与重量。请按自己的实际能力记录，目标不会自动算成完成。
                    </p>
                  </>
                )}
              </Modal>
            )}
          </Presence>
          <Presence interruptKey={page}>
            {templateEditor && (
              <TemplateEditor
                data={data}
                template={templateEditor === 'new' ? undefined : templateEditor}
                onClose={() => {
                  void pendingAction.cancel().then((ok) => {
                    if (ok) setTemplateEditor(null);
                  });
                }}
                onSave={(t, additions) =>
                  pendingAction.run((d) => ({
                    ...ensureExercises(d, additions),
                    templates: d.templates.some((x) => x.id === t.id)
                      ? d.templates.map((x) => (x.id === t.id ? t : x))
                      : [...d.templates, t],
                  }))
                }
              />
            )}
          </Presence>
          <Presence interruptKey={page}>
            {exerciseEditor && (
              <ExerciseEditor
                onClose={() => {
                  void pendingAction.cancel().then((ok) => {
                    if (ok) setExerciseEditor(false);
                  });
                }}
                onSave={(ex) => {
                  if (
                    data.exercises.some(
                      (e) => e.id !== ex.id && e.name.toLowerCase() === ex.name.toLowerCase(),
                    )
                  ) {
                    notify('已有同名动作，请用器械或动作形式区分名称');
                    return Promise.resolve(false);
                  }
                  return pendingAction.run((d) => ({ ...d, exercises: [...d.exercises, ex] }));
                }}
              />
            )}
          </Presence>
          <Presence interruptKey={page}>
            {exerciseInfo && (
              <ExerciseInfo exercise={exerciseInfo} data={data} onClose={() => setExerciseInfo(null)} />
            )}
          </Presence>
          <Presence interruptKey={page}>
            {archiveTemplate && (
              <Modal
                title="归档这个模板？"
                onClose={() => setArchiveTemplate(null)}
                footer={
                  <>
                    <button className="btn btn-secondary" onClick={() => setArchiveTemplate(null)}>
                      取消
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={async () => {
                        if (
                          await mutate((d) => ({
                            ...d,
                            templates: d.templates.map((t) =>
                              t.id === archiveTemplate.id
                                ? { ...t, archived: true, updatedAt: new Date().toISOString() }
                                : t,
                            ),
                          }))
                        )
                          setArchiveTemplate(null);
                      }}
                    >
                      确认归档模板
                    </button>
                  </>
                }
              >
                <p>
                  从可选训练中移除“{archiveTemplate.name}”。已有历史和本场训练不受影响，可从“已归档模板”恢复。
                </p>
              </Modal>
            )}
          </Presence>
          <Presence interruptKey={page}>
            {confirmReload && (
              <Modal
                title="载入已保存版本？"
                onClose={() => setConfirmReload(false)}
                footer={
                  <>
                    <button className="btn btn-secondary" onClick={() => setConfirmReload(false)}>
                      返回并保留当前输入
                    </button>
                    <button className="btn btn-secondary" onClick={exportCurrent}>
                      先导出当前记录
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={async () => {
                        await workspace.reload();
                        setConfirmReload(false);
                      }}
                    >
                      确认载入
                    </button>
                  </>
                }
              >
                <p>
                  当前页面中尚未成功写入的修改会被替换。建议先导出当前记录，再载入本机最近成功保存的版本。
                </p>
              </Modal>
            )}
          </Presence>
          <Toast message={toast} />
        </>
      }
    >
      {page !== 'workout' && schedule.entries.length > 0 && <TrainingReminder entries={schedule.entries} findSession={findScheduledSession} onOpen={goSchedule} />}
      {page === 'today' && (
        <TodayPage
          data={data}
          active={active}
          completed={completed}
          templates={templates}
          monthSessions={monthSessions}
          monthlySeconds={monthlySeconds}
          monthlySets={monthlySets}
          writable={writable}
          go={go}
          openStart={openStart}
          quickStart={quickStart}
          todaySchedule={todaySchedule}
          missedSchedule={missedSchedule}
          nextScheduled={nextScheduled}
          onSchedule={goSchedule}
          setTemplateEditor={setTemplateEditor}
          onExercise={setExerciseInfo}
        />
      )}
      {page === 'plans' && (
        <PlansPage
          data={data}
          templates={templates}
          showArchived={showArchived}
          writable={writable}
          mutate={mutate}
          retry={workspace.retry}
          openStart={quickStart}
          preview={openStart}
          setTemplateEditor={setTemplateEditor}
          setArchiveTemplate={setArchiveTemplate}
          setShowArchived={setShowArchived}
          schedule={schedule}
          findScheduledSession={findScheduledSession}
          onScheduledHistory={(session) => {
            location.hash = `/progress?session=${encodeURIComponent(session.id)}`;
            navigate('progress');
          }}
        />
      )}
      {page === 'exercises' && (
        <ExerciseLibrary
          data={data}
          writable={writable}
          mutate={mutate}
          onCreate={() => setExerciseEditor(true)}
          onUse={useExercise}
          onCancelUse={() => pendingAction.cancel()}
        />
      )}
      {page === 'progress' && (
        <History
          data={data}
          writable={writable}
          notify={notify}
          mutate={mutate}
          onRepeat={repeatSession}
          onTrain={() => go('plans')}
          onExercise={setExerciseInfo}
          savedSessionId={savedSessionId}
          onDismissSaved={() => setSavedSessionId('')}
          nextScheduled={todaySchedule[0] ?? nextScheduled}
          onSchedule={goSchedule}
        />
      )}
      {page === 'settings' && (
        <BackupSettings
          data={data}
          writable={writable}
          mutate={mutate}
          retry={workspace.retry}
          notify={notify}
          cloud={cloud}
          openGym={openGym}
          syncProvider={syncProvider.provider}
          onProviderChange={syncProvider.setProvider}
        />
      )}
      {page === 'workout' &&
        (workout ? (
          <Workout
            restReminder={restReminder}
            key={`${workout.id}-${workspace.loadEpoch}`}
            data={data}
            session={workout}
            writable={writable}
            online={online}
            update={updateSession}
            addExercise={async (exercise, replaceId) => {
              let insertedId: string | undefined;
              const ok = await updatePendingSession(
                (s, current) => {
                  const next = addToTraining(s, exercise, current.sessions, replaceId);
                  insertedId = next.exercises.find((item) => !s.exercises.some(({ id }) => id === item.id))?.id;
                  return next;
                },
                [exercise],
              );
              return ok ? insertedId ?? replaceId ?? null : null;
            }}
            insertWarmups={(itemId, rows) => updatePendingSession((s) => insertWarmups(s, itemId, rows))}
            cancelPendingAction={() => pendingAction.cancel()}
            hasPendingAction={pendingAction.hasPending()}
            goHome={() => go('today')}
            finish={async () => {
              if (!active || finishing || pendingAction.hasPending()) return false;
              const id = active.id;
              setFinishing(active);
              try {
                if (status === 'error' && workspace.dirty && !(await workspace.retry())) {
                  notify('本机暂时无法保存，训练仍在草稿中。');
                  return false;
                }
                const ok = await updatePendingSession((s) => completeSession(reviewSession(s)));
                if (ok) {
                  setSavedSessionId(id);
                  go('progress');
                  notify('训练已保存到本机，历史与统计已更新');
                } else {
                  await pendingAction.cancel();
                  notify('本机暂时无法保存，训练仍在草稿中。');
                }
                return ok;
              } finally {
                setFinishing(null);
              }
            }}
            cancel={async () => {
              const ok = await updateSession((s) => {
                return { ...reviewSession(s), status: 'cancelled' };
              });
              if (ok) {
                go('today');
                notify('训练已取消，其他历史记录保留');
              }
              return ok;
            }}
          />
        ) : (
          <section className="card empty-state">
            <h2>还没有进行中的训练</h2>
            <p>选择模板，或从自由训练开始。</p>
            <button className="btn btn-primary" onClick={() => go('plans')}>
              选择训练
            </button>
          </section>
        ))}
    </AppShell>
  );
}
