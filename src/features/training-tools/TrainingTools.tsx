import { useEffect, useMemo, useRef, useState } from "react";
import InlinePanel from "../../components/InlinePanel";
import type { BodyMetric, Session, SessionExercise } from "../../domain/types";
import { displayWeight, fromWeight } from "../../domain/units";
import {
  buildWarmupPreview,
  calculatePlateLoad,
  relativeStrengthSeries,
  suggestTarget,
  type WarmupRow,
  type WeightUnit,
} from "./calculations";

export interface TrainingToolsProps {
  exercise: SessionExercise;
  sessionDate: string;
  sessions: Session[];
  bodyMetrics: BodyMetric[];
  unit: WeightUnit;
  writable: boolean;
  onInsertWarmups: (rows: WarmupRow[]) => Promise<boolean>;
  onClose: () => void;
}

type Tool = "plates" | "warmups" | "relative" | "trial";
const numeric = (text: string) => (text.trim() ? Number(text) : NaN);
const tools: Array<{ id: Tool; label: string }> = [
  { id: "plates", label: "配片" },
  { id: "warmups", label: "热身" },
  { id: "relative", label: "相对负重" },
  { id: "trial", label: "下次试算" },
];

function NumberInput({
  label,
  value,
  onChange,
  integer = false,
  min = 0,
  max = 5000,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  integer?: boolean;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <label className="training-tools-field">
      <span>{label}</span>
      <input
        className="form-input"
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        enterKeyHint="next"
        min={min}
        max={max}
        step={integer ? 1 : "any"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

export default function TrainingTools({
  exercise,
  sessionDate,
  sessions,
  bodyMetrics,
  unit,
  writable,
  onInsertWarmups,
  onClose,
}: TrainingToolsProps) {
  const weighted = exercise.exercise.kind === "weight-reps";
  const timed = exercise.exercise.kind === "duration";
  const seed =
    exercise.sets.find((set) => set.type === "work") ?? exercise.sets[0];
  const [tool, setTool] = useState<Tool>(weighted ? "plates" : "trial");
  const [total, setTotal] = useState(
    String(displayWeight(seed?.weightKg ?? 0, unit)),
  );
  const [bar, setBar] = useState("");
  const [inventory, setInventory] = useState(() =>
    (unit === "kg" ? [20, 10, 5, 2.5, 1.25] : [45, 25, 10, 5, 2.5]).map(
      (weight) => ({
        weight: String(weight),
        count: "0",
      }),
    ),
  );
  const [workWeight, setWorkWeight] = useState(
    String(displayWeight(seed?.weightKg ?? 0, unit)),
  );
  const [reps, setReps] = useState(String(seed?.reps || 10));
  const [warmupCount, setWarmupCount] = useState("3");
  const [increment, setIncrement] = useState(unit === "kg" ? "2.5" : "5");
  const [floor, setFloor] = useState(
    /杠铃|曲杆/.test(exercise.exercise.equipment) ? "" : "0",
  );
  const [goalSets, setGoalSets] = useState(
    String(
      Math.max(1, exercise.sets.filter((set) => set.type === "work").length),
    ),
  );
  const [goalValue, setGoalValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [inserted, setInserted] = useState("");
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const plates = useMemo(
    () =>
      calculatePlateLoad({
        total: numeric(total),
        bar: numeric(bar),
        unit,
        inventory: inventory.map((item) => ({
          weight: numeric(item.weight),
          count: numeric(item.count),
        })),
      }),
    [total, bar, unit, inventory],
  );
  const warmups = useMemo(
    () =>
      buildWarmupPreview({
        workWeightKg: fromWeight(numeric(workWeight), unit),
        reps: numeric(reps),
        count: numeric(warmupCount),
        incrementKg: fromWeight(numeric(increment), unit),
        barFloorKg: fromWeight(numeric(floor), unit),
      }),
    [workWeight, reps, warmupCount, increment, floor, unit],
  );
  const relative = useMemo(
    () =>
      relativeStrengthSeries({
        exercise: exercise.exercise,
        sessions: sessions.filter((session) => session.date <= sessionDate),
        bodyMetrics,
      }),
    [exercise.exercise, sessions, bodyMetrics, sessionDate],
  );
  const trial = useMemo(
    () =>
      suggestTarget({
        exercise,
        goal: {
          sets: numeric(goalSets),
          ...(timed
            ? { durationSeconds: numeric(goalValue) }
            : { reps: numeric(goalValue) }),
        },
        incrementKg: fromWeight(numeric(increment), unit),
      }),
    [exercise, goalSets, goalValue, timed, increment, unit],
  );
  const previewKey = JSON.stringify(warmups.rows);
  const alreadyInserted = inserted === previewKey;
  function close() {
    if (!saving.current) onClose();
  }
  async function insertWarmups() {
    if (saving.current || !writable || !warmups.rows.length || alreadyInserted)
      return;
    saving.current = true;
    setBusy(true);
    setSaveError("");
    try {
      const saved = await onInsertWarmups(
        warmups.rows.map((row) => ({ ...row })),
      );
      if (mounted.current) {
        if (saved) setInserted(previewKey);
        else setSaveError("热身组未保存，预览与输入已保留。请重试。");
      }
    } catch {
      if (mounted.current)
        setSaveError("热身组未保存，预览与输入已保留。请重试。");
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <InlinePanel
      title="训练工具"
      onClose={close}
      busy={busy}
      footer={
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={close}
        >
          返回训练
        </button>
      }
    >
      <div className="training-tools" data-ios-input-scope="" aria-busy={busy}>
        <p className="training-tools-context">
          {exercise.exercise.name} · {sessionDate}
        </p>
        <p className="training-tools-note">
          输入仅用于这次试算。只有“插入热身组”会保存到本场训练。
        </p>
        <div
          className="training-tools-nav"
          role="group"
          aria-label="选择训练工具"
        >
          {tools.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={tool === item.id}
              onClick={() => setTool(item.id)}
              disabled={busy}
            >
              {item.label}
            </button>
          ))}
        </div>
        <form onSubmit={(event) => event.preventDefault()}>
          {tool === "plates" && (
            <section
              className="training-tools-section"
              aria-label="左右对称配片"
            >
              <h3>左右对称配片</h3>
              <p className="training-tools-note">
                用于两端对称装片的杠。填写实际杠重和现场可用片数；史密斯机请先确认有效杠重。
              </p>
              <div className="training-tools-grid">
                <NumberInput
                  label={`目标总重量（${unit}）`}
                  value={total}
                  onChange={setTotal}
                  disabled={busy}
                />
                <NumberInput
                  label={`实际杠重（${unit}）`}
                  value={bar}
                  onChange={setBar}
                  disabled={busy}
                />
              </div>
              <fieldset className="training-tools-inventory">
                <legend>可用杠铃片 · 数量为两边合计</legend>
                <p className="training-tools-note">
                  片型可修改，数量从 0 开始。左右对称所用的总片数须为偶数。
                </p>
                {inventory.map((item, index) => (
                  <div className="training-tools-stock" key={index}>
                    <NumberInput
                      label={`片型 ${index + 1} 重量（${unit}）`}
                      value={item.weight}
                      min={0.25}
                      max={1000}
                      onChange={(value) =>
                        setInventory((items) =>
                          items.map((stock, at) =>
                            at === index ? { ...stock, weight: value } : stock,
                          ),
                        )
                      }
                      disabled={busy}
                    />
                    <NumberInput
                      label="可用片数"
                      value={item.count}
                      integer
                      max={40}
                      onChange={(value) =>
                        setInventory((items) =>
                          items.map((stock, at) =>
                            at === index ? { ...stock, count: value } : stock,
                          ),
                        )
                      }
                      disabled={busy}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`移除片型 ${index + 1}`}
                      onClick={() =>
                        setInventory((items) =>
                          items.filter((_, at) => at !== index),
                        )
                      }
                      disabled={busy}
                    >
                      移除
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setInventory((items) => [
                      ...items,
                      { weight: "", count: "0" },
                    ])
                  }
                  disabled={busy || inventory.length >= 24}
                >
                  增加片型
                </button>
              </fieldset>
              <div className="training-tools-result" aria-live="polite">
                <p>{plates.reason}</p>
                {(plates.status === "exact" ||
                  plates.status === "unachievable") && (
                  <>
                    <p>
                      <strong>每侧：</strong>
                      {plates.plates.length
                        ? plates.plates
                            .map((weight) => `${weight} ${unit}`)
                            .join(" + ")
                        : "不加片"}
                    </p>
                    <p>
                      <strong>
                        可配总重量 {plates.achievableTotal} {unit}
                      </strong>
                      {plates.missing > 0 &&
                        ` · 距目标还差 ${plates.missing} ${unit}`}
                    </p>
                  </>
                )}
              </div>
            </section>
          )}
          {tool === "warmups" && (
            <section className="training-tools-section" aria-label="热身组预览">
              <h3>热身组预览</h3>
              {!weighted ? (
                <p className="training-tools-note">
                  这个动作按{timed ? "时长" : "次数"}记录，暂不生成负重热身组。
                </p>
              ) : (
                <>
                  <p className="training-tools-note">
                    以你填写的正式重量试算，逐组靠近目标。热身方式和次数请按自己的状态调整。
                  </p>
                  <div className="training-tools-grid">
                    <NumberInput
                      label={`正式总重量（${unit}）`}
                      value={workWeight}
                      onChange={setWorkWeight}
                      max={displayWeight(1000, unit)}
                      disabled={busy}
                    />
                    <NumberInput
                      label={`空杠 / 起始重量（${unit}）`}
                      value={floor}
                      onChange={setFloor}
                      max={displayWeight(1000, unit)}
                      disabled={busy}
                    />
                    <NumberInput
                      label={`重量步长（${unit}）`}
                      value={increment}
                      onChange={setIncrement}
                      min={0.01}
                      max={displayWeight(1000, unit)}
                      disabled={busy}
                    />
                    <NumberInput
                      label="热身组数（1–5）"
                      value={warmupCount}
                      onChange={setWarmupCount}
                      integer
                      min={1}
                      max={5}
                      disabled={busy}
                    />
                    <NumberInput
                      label="每组次数"
                      value={reps}
                      onChange={setReps}
                      integer
                      min={1}
                      max={1000}
                      disabled={busy}
                    />
                  </div>
                  <p className="training-tools-note">{warmups.reason}</p>
                  {!!warmups.rows.length && (
                    <ol className="training-tools-warmups">
                      {warmups.rows.map((row, index) => (
                        <li key={index}>
                          <span>热身 {index + 1}</span>
                          <strong>
                            {displayWeight(row.weightKg, unit)} {unit} ×{" "}
                            {row.reps} 次
                          </strong>
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className="training-tools-note">
                    插入后均为未完成热身组，原正式组保留；热身不计入正式容量。
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={
                      !writable ||
                      busy ||
                      !warmups.rows.length ||
                      alreadyInserted
                    }
                    onClick={() => void insertWarmups()}
                  >
                    {busy
                      ? "正在保存…"
                      : alreadyInserted
                        ? "已插入热身组"
                        : `插入 ${warmups.rows.length || ""} 个热身组`}
                  </button>
                  {!writable && (
                    <p className="training-tools-note">
                      当前记录不可写，仍可查看和调整预览。
                    </p>
                  )}
                  {saveError && (
                    <p role="alert" className="error-text">
                      {saveError}
                    </p>
                  )}
                  {alreadyInserted && (
                    <p className="training-tools-note" role="status">
                      已保存到本场训练，可返回后调整。
                    </p>
                  )}
                </>
              )}
            </section>
          )}
          {tool === "relative" && (
            <section
              className="training-tools-section"
              aria-label="相对外部负重"
            >
              <h3>相对外部负重</h3>
              <p className="training-tools-note">{relative.reason}</p>
              <p className="training-tools-note">
                这是总外部负重与体重的比例，不代表力量等级，也不是估算 1RM。
              </p>
              {!!relative.points.length && (
                <div className="training-tools-table">
                  <table>
                    <caption>
                      最近 {Math.min(relative.points.length, 8)} 场 · 只读历史
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">训练 / 体重日期</th>
                        <th scope="col">负重 / 体重</th>
                        <th scope="col">比例</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relative.points
                        .slice(-8)
                        .reverse()
                        .map((point) => (
                          <tr key={point.sessionId}>
                            <td>
                              {point.date}
                              <small>体重 {point.bodyWeightDate}</small>
                            </td>
                            <td>
                              {displayWeight(point.loadKg, unit)} /{" "}
                              {displayWeight(point.bodyWeightKg, unit)} {unit}
                            </td>
                            <td>{point.ratio.toFixed(2)}×</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {tool === "trial" && (
            <section
              className="training-tools-section"
              aria-label="明确目标试算"
            >
              <h3>按本次表现试算下次目标</h3>
              <p className="training-tools-note">
                填写你要对照的目标，再查看本场前几个已完成正式组。结果仅供手动参考，不自动修改计划，不判断过去是否停滞。
              </p>
              <div className="training-tools-grid">
                <NumberInput
                  label="对照正式组数"
                  value={goalSets}
                  onChange={setGoalSets}
                  integer
                  min={1}
                  max={100}
                  disabled={busy}
                />
                <NumberInput
                  label={timed ? "每组目标时长（秒）" : "每组目标次数"}
                  value={goalValue}
                  onChange={setGoalValue}
                  integer
                  min={1}
                  max={timed ? 86400 : 1000}
                  disabled={busy}
                />
                {weighted && (
                  <NumberInput
                    label={`加重步长（${unit}）`}
                    value={increment}
                    onChange={setIncrement}
                    min={0.01}
                    max={displayWeight(1000, unit)}
                    disabled={busy}
                  />
                )}
              </div>
              <div className="training-tools-result" aria-live="polite">
                <p>{trial.reason}</p>
                {trial.status === "trial" && (
                  <p>
                    <strong>
                      下次可试：
                      {trial.weightKg !== undefined &&
                        `${displayWeight(trial.weightKg, unit)} ${unit} × `}
                      {trial.durationSeconds !== undefined
                        ? `${trial.durationSeconds} 秒`
                        : `${trial.reps} 次`}{" "}
                      / 组
                    </strong>
                  </p>
                )}
              </div>
            </section>
          )}
        </form>
      </div>
    </InlinePanel>
  );
}
