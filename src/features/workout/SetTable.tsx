import { useRef, type ReactNode } from "react";
import type { Session, SetRecord } from "../../domain/types";
import { setTypeLabels } from "../../domain/sets";
import { toggleSet } from "../../domain/training";
import { displayWeight, fromWeight } from "../../domain/units";
import CompletionMark from "../../components/CompletionMark";
import NumericStepper from "../../components/NumericStepper";
import { adjustWeight, adjustCount, copyPrevious, copyHistorySet, formatSetValue, previousSetsByGroup, type ExerciseSetHistory } from "./performance";
import type { Update } from "./types";
import { nativeFeedback } from "../../platform/native";
import RpeSelect from "../../components/RpeSelect";
import ChoiceSelect from "../../components/ChoiceSelect";
import InlineChoiceScope, { InlineChoiceRow } from "../../components/InlineChoiceScope";
import SetHistory from './SetHistory';

type CompactEntry = {
  focusedSetId?: string;
  select: (id: string) => void;
  footer: (record?: ReactNode) => ReactNode;
};

export default function SetTable({
  session,
  exerciseIndex,
  unit,
  update,
  disabled = false,
  readOnly = false,
  autoRest = true,
  showRpe = false,
  history,
  compact,
}: {
  session: Session;
  exerciseIndex: number;
  unit: "kg" | "lb";
  update: Update;
  disabled?: boolean;
  readOnly?: boolean;
  autoRest?: boolean;
  showRpe?: boolean;
  history?: ExerciseSetHistory[];
  compact?: CompactEntry;
}) {
  const item = session.exercises[exerciseIndex];
  const kind = item.exercise.kind;
  const weightLabel = `总重量 ${unit}`;
  const countLabel = kind === "duration" ? "时长 秒" : "次数";
  const nextSet = item.sets.find((set) => set.status === "pending");
  const previous = history ? previousSetsByGroup(history, item) : [];
  const fields = useRef<HTMLDivElement>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const displayRpe =
    showRpe || (readOnly && item.sets.some((set) => set.rpe !== undefined));
  function change(setId: string, patch: Partial<SetRecord>) {
    void update((s) => ({
      ...s,
      updatedAt: new Date().toISOString(),
      exercises: s.exercises.map((ex) =>
        ex.id !== item.id
          ? ex
          : {
              ...ex,
              sets: ex.sets.map((set) =>
                set.id === setId ? { ...set, ...patch } : set,
              ),
            },
      ),
    }));
  }
  function adjust(
    setId: string,
    field: "weightKg" | "reps" | "durationSeconds",
    direction: 1 | -1,
  ) {
    if (disabled || readOnly) return;
    void update((s) => ({
      ...s,
      updatedAt: new Date().toISOString(),
      exercises: s.exercises.map((ex) =>
        ex.id !== item.id
          ? ex
          : {
              ...ex,
              sets: ex.sets.map((set) =>
                set.id !== setId || set.status === "completed"
                  ? set
                  : {
                      ...set,
                      [field]:
                        field === "weightKg"
                          ? adjustWeight(set.weightKg, unit, direction)
                          : adjustCount(
                              set[field],
                              direction,
                              field === "reps" ? 1000 : 86400,
                            ),
                    },
              ),
            },
      ),
    }));
  }

  function complete(set: SetRecord, inputs: ParentNode | null, detail: number) {
    if (disabled || readOnly || (detail > 1 && (!compact || set.status !== 'pending'))) return;
    if (Array.from(inputs?.querySelectorAll('input') ?? []).some((input) => !input.reportValidity())) return;
    if (compact && set.status === 'pending') {
      const now = performance.now();
      // The same fixed button immediately becomes the next group's button.
      if (lastTap.current && lastTap.current.id !== set.id && now - lastTap.current.at < 350) return;
      lastTap.current = { id: set.id, at: now };
    }
    void update((current) => {
      const stored = current.exercises.find(({ id }) => id === item.id)?.sets.find(({ id }) => id === set.id);
      if (stored?.status !== set.status) return current;
      const next = toggleSet(current, item.id, set.id);
      return autoRest ? next : { ...next, restUntil: null };
    }).then((ok) => {
      if (ok) void nativeFeedback('impact');
    });
  }

  function typeControl(set: SetRecord, i: number) {
    return <ChoiceSelect label={`${item.exercise.name}第${i + 1}组类型`} compact className="set-type"
      value={set.type} disabled={disabled || readOnly} onChange={(next) => change(set.id, { type: next as SetRecord['type'] })}
      options={(['work', 'warmup', 'drop', 'failure'] as const).map((value) => ({ value, label: setTypeLabels[value] }))} />;
  }

  function weightControl(set: SetRecord, i: number) {
    return <NumericStepper label={`${item.exercise.name}第${i + 1}组总重量`} value={displayWeight(set.weightKg, unit)}
      max={unit === 'kg' ? 1000 : 2204.62} disabled={disabled || readOnly || set.status === 'completed'}
      onChange={(weight) => change(set.id, { weightKg: fromWeight(weight, unit) })}
      onStep={(direction) => adjust(set.id, 'weightKg', direction)} />;
  }

  function countControl(set: SetRecord, i: number) {
    const duration = kind === 'duration';
    return <NumericStepper label={`${item.exercise.name}第${i + 1}组${duration ? '时长' : '次数'}`}
      value={duration ? set.durationSeconds : set.reps} min={1} max={duration ? 86400 : 1000} step={1}
      disabled={disabled || readOnly || set.status === 'completed'}
      onChange={(value) => change(set.id, duration ? { durationSeconds: value } : { reps: value })}
      onStep={(direction) => adjust(set.id, duration ? 'durationSeconds' : 'reps', direction)} />;
  }

  function rpeControl(set: SetRecord, i: number) {
    return readOnly ? (set.rpe ?? '未记录') : <RpeSelect value={set.rpe} disabled={disabled}
      label={`${item.exercise.name}第${i + 1}组RPE`} onChange={(rpe) => change(set.id, { rpe })} />;
  }

  function skipControl(set: SetRecord, i: number) {
    return <button type="button" className="skip-btn" disabled={disabled}
      aria-label={`${set.status === 'skipped' ? '恢复' : '跳过'}${item.exercise.name}第${i + 1}组`}
      onClick={() => change(set.id, { status: set.status === 'skipped' ? 'pending' : 'skipped' })}>
      {set.status === 'skipped' ? '恢复' : '跳过'}
    </button>;
  }

  function copyControl(set: SetRecord, i: number) {
    return <button type="button" className="btn btn-ghost set-copy" disabled={disabled || i === 0 || set.status === 'completed'}
      aria-label={`复制${item.exercise.name}第${i}组到第${i + 1}组`}
      onClick={() => void update((s) => ({
        ...s, updatedAt: new Date().toISOString(),
        exercises: s.exercises.map((ex) => ex.id === item.id ? copyPrevious(ex, set.id) : ex),
      }))}>复制上一组</button>;
  }

  function useHistory(targetId: string, source: SetRecord) {
    if (disabled || readOnly) return;
    if (document.activeElement instanceof HTMLInputElement && fields.current?.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    void update((s) => ({
      ...s, updatedAt: new Date().toISOString(),
      exercises: s.exercises.map((ex) => ex.id === item.id ? copyHistorySet(ex, targetId, source) : ex),
    }));
  }

  function historyReference(set: SetRecord, index: number) {
    const source = previous[index];
    if (!source || set.status !== 'pending' || readOnly) return null;
    return <button type="button" className="btn btn-ghost set-history-reference" disabled={disabled}
      aria-label={`用上次${item.exercise.name}第${index + 1}组成绩`} onClick={() => useHistory(set.id, source)}>
      <span>上次 {formatSetValue(source, kind, unit)}</span><b>填入</b>
    </button>;
  }

  if (compact) {
    const set = item.sets.find(({ id }) => id === compact.focusedSetId);
    const index = set ? item.sets.indexOf(set) : -1;
    return (
      <div className="workout-set-recorder">
        {set ? <section className="workout-set-current" aria-label="当前待记组">
          <div className="workout-set-heading">
            <h3>第 {index + 1} / {item.sets.length} 组</h3>
            {historyReference(set, index)}
          </div>
          <div className="workout-set-fields" ref={fields} key={`${set.id}-${unit}`}>
            {kind === 'weight-reps' && <div><span>{weightLabel}</span>{weightControl(set, index)}</div>}
            <div><span>{countLabel}</span>{countControl(set, index)}</div>
          </div>
          <details key={set.id} className="workout-set-options">
            <summary>{setTypeLabels[set.type]} · 组设置</summary>
            <InlineChoiceScope>
              <div className="row wrap">
                {typeControl(set, index)}
                {displayRpe && rpeControl(set, index)}
                {index > 0 && copyControl(set, index)}
                {skipControl(set, index)}
              </div>
            </InlineChoiceScope>
          </details>
        </section> : <p className="workout-set-heading">本动作已记完</p>}
        {compact.footer(set && <button type="button" className="btn btn-primary workout-complete" disabled={disabled}
          aria-label={`完成${item.exercise.name}第${index + 1}组`} onClick={(event) => complete(set, fields.current, event.detail)}>
          完成第 {index + 1} 组
        </button>)}
        <ul className="workout-set-list" aria-label="分组记录">
          {item.sets.map((group, i) => group !== set && <li key={group.id} data-status={group.status}>
            <span>{i + 1} 组 · {group.status === 'skipped' ? '已跳过' : setTypeLabels[group.type]}</span>
            <span className="workout-set-result">{formatSetValue(group, kind, unit)}{group.rpe !== undefined && ` · RPE ${group.rpe}`}</span>
            {group.status === 'completed' ? <button type="button" className="btn btn-ghost" disabled={disabled}
              aria-label={`撤销${item.exercise.name}第${i + 1}组`} onClick={(event) => {
                if (event.detail > 1) return;
                complete(group, null, event.detail);
                compact.select(group.id);
              }}>撤销</button>
              : group.status === 'skipped' ? skipControl(group, i)
              : <button type="button" className="btn btn-ghost" disabled={disabled} aria-label={`编辑${item.exercise.name}第${i + 1}组`}
                onClick={() => compact.select(group.id)}>编辑</button>}
          </li>)}
        </ul>
        {history && <SetHistory history={history} kind={kind} unit={unit} target={disabled ? undefined : set}
          onCopy={set ? (source) => { useHistory(set.id, source); compact.select(set.id); } : undefined} />}
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="set-table set-entry-table">
        <thead>
          <tr>
            <th>组</th>
            <th>类型</th>
            {item.exercise.kind === "weight-reps" && <th>总重量 {unit}</th>}
            <th>{item.exercise.kind === "duration" ? "时长 秒" : "次数"}</th>
            {displayRpe && <th>RPE</th>}
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {item.sets.map((set, i) => (
            <InlineChoiceRow
              key={`${set.id}-${unit}`}
              columns={
                4 +
                Number(item.exercise.kind === "weight-reps") +
                Number(displayRpe)
              }
            >
              <tr className={`set-row ${set.status}`}>
                <td data-label="组">
                  {i + 1}
                  <span className="set-number-label">组</span>
                  {historyReference(set, i)}
                </td>
                <td data-label="类型">{typeControl(set, i)}</td>
                {kind === 'weight-reps' && <td data-field="weight" data-label={weightLabel}>{weightControl(set, i)}</td>}
                <td data-field="count" data-label={countLabel}>{countControl(set, i)}</td>
                {displayRpe && (
                  <td data-field="rpe" data-label="主观用力 RPE">{rpeControl(set, i)}</td>
                )}
                <td>
                  {readOnly ? (
                    <span>
                      {set.status === "completed"
                        ? "完成"
                        : set.status === "skipped"
                          ? "跳过"
                          : "未完成"}
                    </span>
                  ) : (
                    <div className="set-actions">
                      <div className="set-state-actions">
                        <button
                          type="button"
                          className={`complete-btn ${set.status === "completed" ? "completed" : ""}`}
                          disabled={disabled}
                          aria-pressed={set.status === "completed"}
                          aria-label={`${set.status === "completed" ? "撤销" : "完成"}${item.exercise.name}第${i + 1}组`}
                          onClick={(e) => complete(set, e.currentTarget.closest('tr'), e.detail)}
                        >
                          <CompletionMark
                            completed={set.status === "completed"}
                          />
                          <span>
                            {set.status === "completed" ? "已完成" : "完成本组"}
                          </span>
                        </button>
                        {skipControl(set, i)}
                      </div>
                      {copyControl(set, i)}
                    </div>
                  )}
                </td>
              </tr>
            </InlineChoiceRow>
          ))}
        </tbody>
      </table>
      {history && <SetHistory history={history} kind={kind} unit={unit} target={disabled ? undefined : nextSet}
        onCopy={nextSet ? (source) => useHistory(nextSet.id, source) : undefined} />}
    </div>
  );
}
