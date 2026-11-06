import { useState } from "react";
import type { AppData, Exercise, WorkoutTemplate } from "../domain/types";
import { uid } from "../domain/training";
import Modal from "../components/Modal";
import Icon from "../components/Icon";
import { muscleGroups } from "../content/body-map";
import ExercisePicker from "../components/ExercisePicker";
import ChoiceSelect from "../components/ChoiceSelect";

export function TemplateEditor({
  data,
  template,
  onSave,
  onClose,
}: {
  data: AppData;
  template?: WorkoutTemplate;
  onSave: (t: WorkoutTemplate, additions: Exercise[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<WorkoutTemplate>(() =>
    template
      ? structuredClone(template)
      : {
          id: uid(),
          name: "",
          description: "",
          restSeconds: data.settings.defaultRest,
          updatedAt: new Date().toISOString(),
          items: [],
        },
  );
  const [selected, setSelected] = useState<Exercise | null>(
    data.exercises[0] ?? null,
  );
  const [additions, setAdditions] = useState<Exercise[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const changeItem = (index: number, key: string, value: number) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    }));
  function move(index: number, offset: number) {
    setDraft((d) => {
      const items = [...d.items];
      [items[index], items[index + offset]] = [
        items[index + offset],
        items[index],
      ];
      return { ...d, items };
    });
  }
  return (
    <Modal
      title={template ? "编辑训练日模板" : "新建训练日模板"}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.name.trim()) {
            setError("请填写模板名称");
            return;
          }
          if (!draft.items.length) {
            setError("请先加入至少一个动作");
            return;
          }
          setBusy(true);
          const used = new Set(draft.items.map((item) => item.exerciseId));
          if (
            await onSave(
              {
                ...draft,
                name: draft.name.trim(),
                updatedAt: new Date().toISOString(),
              },
              additions.filter((exercise) => used.has(exercise.id)),
            )
          )
            onClose();
          else setError("模板尚未保存。输入已保留，可以重试或取消这次修改。");
          setBusy(false);
        }}
      >
        <div className="form-grid">
          <label className="field">
            模板名称
            <input
              className="form-input"
              required
              maxLength={80}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例如：我的推部训练"
            />
          </label>
          <label className="field">
            组间休息（秒）
            <input
              className="form-input"
              type="number"
              inputMode="numeric"
              enterKeyHint="next"
              min={0}
              max={3600}
              step={1}
              required
              value={draft.restSeconds}
              onChange={(e) =>
                setDraft({ ...draft, restSeconds: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <label className="field">
          安排说明
          <textarea
            className="form-textarea"
            maxLength={1000}
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
            placeholder="可填写训练目标和自己的安排"
          />
        </label>
        <div className="notice">
          重量按两只合计的总外部负重填写，单位为
          kg。目标值不会自动算作已完成结果。
        </div>
        <div className="stack">
          {draft.items.map((item, index) => {
            const exercise = [...data.exercises, ...additions].find(
              (x) => x.id === item.exerciseId,
            );
            return (
              <section className="card template-item" key={item.id}>
                <div className="section-heading">
                  <h3 className="line-clamp-2 wrap-cjk">
                    {index + 1}. {exercise?.name}
                  </h3>
                  <div className="row">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`上移${exercise?.name}`}
                      disabled={!index}
                      onClick={() => move(index, -1)}
                    >
                      <Icon name="up" />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`下移${exercise?.name}`}
                      disabled={index === draft.items.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <Icon name="down" />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`移除${exercise?.name}`}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          items: d.items.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="field">
                    组数
                    <input
                      className="form-input"
                      type="number"
                      inputMode="numeric"
                      enterKeyHint="next"
                      min={1}
                      max={30}
                      required
                      value={item.sets}
                      onChange={(e) =>
                        changeItem(index, "sets", Number(e.target.value))
                      }
                    />
                  </label>
                  {exercise?.kind === "duration" ? (
                    <label className="field">
                      每组时长（秒）
                      <input
                        className="form-input"
                        type="number"
                        inputMode="numeric"
                        enterKeyHint="next"
                        min={1}
                        max={86400}
                        required
                        value={item.durationSeconds}
                        onChange={(e) =>
                          changeItem(
                            index,
                            "durationSeconds",
                            Number(e.target.value),
                          )
                        }
                      />
                    </label>
                  ) : (
                    <label className="field">
                      目标次数
                      <input
                        className="form-input"
                        type="number"
                        inputMode="numeric"
                        enterKeyHint="next"
                        min={1}
                        max={1000}
                        required
                        value={item.reps}
                        onChange={(e) =>
                          changeItem(index, "reps", Number(e.target.value))
                        }
                      />
                    </label>
                  )}
                  {exercise?.kind === "weight-reps" && (
                    <label className="field">
                      总重量（kg）
                      <input
                        className="form-input"
                        type="number"
                        inputMode="decimal"
                        enterKeyHint="next"
                        min={0}
                        max={1000}
                        step="any"
                        required
                        value={item.weightKg}
                        onChange={(e) =>
                          changeItem(index, "weightKg", Number(e.target.value))
                        }
                      />
                    </label>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        <div className="search-row">
          <ExercisePicker
            saved={data.exercises}
            value={selected}
            onChange={setSelected}
            label="选择加入模板的动作"
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!selected || draft.items.length >= 30}
            onClick={() => {
              if (!selected) return;
              setAdditions((current) =>
                current.some((exercise) => exercise.id === selected.id)
                  ? current
                  : [...current, selected],
              );
              setDraft((d) => ({
                ...d,
                items: [
                  ...d.items,
                  {
                    id: uid(),
                    exerciseId: selected.id,
                    sets: 3,
                    weightKg: 0,
                    reps: 10,
                    durationSeconds: 30,
                  },
                ],
              }));
            }}
          >
            <Icon name="plus" />
            加入动作
          </button>
        </div>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button className="btn btn-primary" disabled={busy}>
            保存模板
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ExerciseEditor({
  onSave,
  onClose,
}: {
  onSave: (exercise: Exercise) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Exercise>({
    id: uid(),
    name: "",
    muscle: "",
    equipment: "自重",
    kind: "reps",
    description: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="创建自定义动作"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.muscle) {
            setError("请选择主要肌群");
            return;
          }
          if (!draft.name.trim() || !draft.equipment.trim()) return;
          setBusy(true);
          if (
            await onSave({
              ...draft,
              name: draft.name.trim(),
              equipment: draft.equipment.trim(),
            })
          )
            onClose();
          else setError("动作尚未保存。输入已保留，可以重试或取消这次修改。");
          setBusy(false);
        }}
      >
        <label className="field">
          动作名称
          <input
            className="form-input"
            required
            maxLength={80}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <div className="form-grid">
          <div className="field">
            主要部位
            <ChoiceSelect
              label="主要部位"
              icon="user"
              value={draft.muscle}
              onChange={(next) => setDraft({ ...draft, muscle: next })}
              options={[
                { value: "", label: "请选择主要肌群", disabled: true },
                ...muscleGroups.map((group) => ({
                  value: group.label,
                  label: group.label,
                })),
              ]}
            />
          </div>
          <label className="field">
            器械
            <input
              className="form-input"
              required
              maxLength={80}
              value={draft.equipment}
              onChange={(e) =>
                setDraft({ ...draft, equipment: e.target.value })
              }
            />
          </label>
        </div>
        <div className="field">
          记录方式
          <ChoiceSelect
            label="记录方式"
            icon="edit"
            value={draft.kind}
            onChange={(next) =>
              setDraft({ ...draft, kind: next as Exercise["kind"] })
            }
            options={[
              { value: "weight-reps", label: "总重量 × 次数" },
              { value: "reps", label: "仅次数（自重 / 辅助动作）" },
              { value: "duration", label: "时长" },
            ]}
          />
        </div>
        <label className="field">
          个人备注
          <textarea
            className="form-textarea"
            maxLength={2000}
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </label>
        <p className="muted">
          自重与辅助动作按次数单独记录，不自动估算有效负重。
        </p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button className="btn btn-primary" disabled={busy}>
            创建动作
          </button>
        </div>
      </form>
    </Modal>
  );
}
