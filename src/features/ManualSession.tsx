import { useState } from "react";
import type { AppData } from "../domain/types";
import { dayKey } from "../domain/analytics";
import {
  createSession,
  createSessionExercise,
  sessionStats,
} from "../domain/training";
import Modal from "../components/Modal";
import ChoiceSelect from "../components/ChoiceSelect";
import InlineChoiceScope from "../components/InlineChoiceScope";
import Icon from "../components/Icon";
import { SetTable } from "./Workout";

export default function ManualSession({
  data,
  writable,
  mutate,
  onClose,
  notify,
}: {
  data: AppData;
  writable: boolean;
  mutate: (fn: (d: AppData) => AppData) => Promise<boolean>;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const today = dayKey(new Date());
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState("45");
  const [templateId, setTemplateId] = useState("");
  const [draft, setDraft] = useState(() => createSession(null, data.exercises));
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const completed = sessionStats(draft).completedSets;
  const selectedExercise = data.exercises.find(
    (exercise) => exercise.id === chosen,
  );
  async function save() {
    if (!writable || busy) return;
    setError("");
    if (!completed) {
      setError("请先完成至少一组实际记录；未完成组不会自动计入。");
      return;
    }
    const start = new Date(`${date}T00:00:00`).getTime();
    const duration = Number(minutes) * 60000;
    if (
      !Number.isFinite(start) ||
      date > today ||
      date < "1970-01-01" ||
      !Number.isInteger(Number(minutes)) ||
      duration < 60000 ||
      duration > 86400000
    ) {
      setError("请检查训练日期和1–1440分钟的时长。");
      return;
    }
    if (start + duration > Date.now()) {
      setError("所填时长超出该日期已经过的时间，请核对日期或时长。");
      return;
    }
    setBusy(true);
    try {
      const ok = await mutate((d) => {
        if (d.sessions.some((s) => s.id === draft.id))
          throw new Error("这场记录已经保存");
        return {
          ...d,
          onboarded: true,
          sessions: [
            ...d.sessions,
            {
              ...draft,
              name: draft.name.trim() || "补记训练",
              date,
              startedAt: new Date(start).toISOString(),
              finishedAt: new Date(start + duration).toISOString(),
              updatedAt: new Date().toISOString(),
              pausedMs: 0,
              status: "completed",
              restUntil: null,
              recordedManually: true,
            },
          ],
        };
      });
      if (ok) {
        notify("补记训练已保存，历史与统计已更新");
        onClose();
      } else {
        setError("暂时无法保存，填写内容已保留。请重试。");
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "暂时无法保存，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="补记一场训练"
      wide
      className="manual-session-modal"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <span className="manual-completed" role="status">
            {completed ? `已完成 ${completed} 组` : "完成至少一组后即可保存"}
          </span>
          {error && (
            <p className="manual-save-error error-text" role="alert">
              {error}
            </p>
          )}
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消补记
          </button>
          <button
            className="btn btn-primary"
            disabled={!writable || busy || !completed}
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "保存补记"}
          </button>
        </>
      }
    >
      <fieldset className="manual-form" disabled={busy} data-ios-input-scope="">
        <legend className="sr-only">补记训练内容</legend>
        <section className="manual-section" aria-label="训练信息">
          <h3>训练信息</h3>
          <p className="manual-hint">填入训练当天的日期和实际时长。</p>
          <div className="form-grid">
            <label className="field">
              训练日期
              <input
                className="form-input"
                type="date"
                min="1970-01-01"
                max={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="field">
              实际时长（分钟）
              <input
                className="form-input"
                type="number"
                inputMode="numeric"
                enterKeyHint="next"
                min={1}
                max={1440}
                step={1}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            训练名称
            <input
              className="form-input"
              maxLength={120}
              placeholder="例如，上肢力量训练"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
        </section>
        <section className="manual-section" aria-label="动作与组数">
          <h3>动作与组数</h3>
          <p className="manual-hint">
            可从模板带入动作，也可逐个添加。填好每组实际结果后，点「完成」。
          </p>
          <div className="field">
            从模板填入动作
            <ChoiceSelect
              label="从模板填入动作"
              icon="plans"
              value={templateId}
              describedBy="manual-template-help"
              disabled={!!completed}
              onChange={(id) => {
                if (id === templateId) return;
                setTemplateId(id);
                const t = data.templates.find((t) => t.id === id);
                setDraft(createSession(t ?? null, data.exercises));
              }}
              options={[
                { value: "", label: "自由选择动作" },
                ...data.templates
                  .filter((t) => !t.archived)
                  .map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
            <small id="manual-template-help">
              {completed
                ? "已有完成组，模板已锁定。"
                : "切换模板会重置本次填写的名称、动作、组数和备注。"}
            </small>
          </div>
          <div className="manual-picker">
            <InlineChoiceScope className="manual-picker-controls">
              <ChoiceSelect
                label="选择动作"
                searchPlaceholder="按动作名称或器械搜索…"
                icon="dumbbell"
                value={chosen}
                onChange={setChosen}
                options={[
                  { value: "", label: "选择一个动作" },
                  ...data.exercises.map((ex) => ({
                    value: ex.id,
                    label: ex.name,
                    description: ex.equipment,
                  })),
                ]}
              />
              <button
                className="btn btn-secondary"
                type="button"
                disabled={!selectedExercise || draft.exercises.length >= 30}
                onClick={() => {
                  if (!selectedExercise || draft.exercises.length >= 30) return;
                  const exercise = createSessionExercise(selectedExercise);
                  setDraft((current) => ({
                    ...current,
                    exercises: [...current.exercises, exercise],
                  }));
                }}
              >
                <Icon name="plus" size={16} />
                添加动作
              </button>
            </InlineChoiceScope>
          </div>
          {!draft.exercises.length && (
            <p className="manual-hint manual-empty">
              添加动作后，就可以填写组数与结果。
            </p>
          )}
          {draft.exercises.map((ex, i) => (
            <section className="manual-exercise" key={ex.id}>
              <div className="section-heading">
                <h4 className="wrap-cjk">{ex.exercise.name}</h4>
                <button
                  className="icon-button danger-text"
                  aria-label={`移除补录${ex.exercise.name}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      exercises: draft.exercises.filter((x) => x.id !== ex.id),
                    })
                  }
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              <SetTable
                session={draft}
                exerciseIndex={i}
                unit={data.settings.unit}
                disabled={!writable || busy}
                autoRest={false}
                showRpe={data.settings.showRpe}
                update={async (fn) => {
                  try {
                    setDraft(fn(draft));
                    return true;
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "本组输入无效");
                    return false;
                  }
                }}
              />
            </section>
          ))}
        </section>
        <section className="manual-section" aria-label="备注">
          <h3>备注</h3>
          <label className="field">
            训练备注（选填）
            <textarea
              className="form-textarea"
              maxLength={2000}
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </label>
          <p className="manual-hint">
            补记保存所填日期与时长，不把系统记账时间显示为真实开练时间。
          </p>
        </section>
      </fieldset>
    </Modal>
  );
}
