import { useId, useMemo, useState } from "react";
import type { Exercise } from "../domain/types";
import { useExerciseOptions } from "../content/use-exercise-options";
import { openGymEntryFor } from "../content/opengym-catalogue";
import { guideFor } from "../content/catalog";
import ChoiceSelect from "./ChoiceSelect";

/** Native selection remains keyboard accessible; the DOM is bounded even with a large directory. */
export default function ExercisePicker({
  saved,
  value,
  onChange,
  label = "选择动作",
}: {
  saved: Exercise[];
  value: Exercise | null;
  onChange: (exercise: Exercise | null) => void;
  label?: string;
}) {
  const { exercises, error, retry } = useExerciseOptions(saved);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const id = useId();
  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return exercises.filter((exercise) => {
      const text =
        `${exercise.name} ${exercise.muscle} ${exercise.equipment} ${guideFor(exercise)?.english ?? openGymEntryFor(exercise.id)?.nameEn ?? ""}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [query, exercises]);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 24) - 1),
  );
  const visible = filtered.slice(currentPage * 24, (currentPage + 1) * 24);
  const options =
    value && !visible.some((exercise) => exercise.id === value.id)
      ? [value, ...visible]
      : visible;
  return (
    <div className="exercise-picker">
      <label className="field" htmlFor={`${id}-search`}>
        搜索可选动作
        <input
          id={`${id}-search`}
          className="form-input"
          type="search"
          value={query}
          placeholder="中文名、英文名、器械或肌群"
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
            onChange(null);
          }}
        />
      </label>
      <div className="field">
        {label}
        <ChoiceSelect
          label={label}
          icon="dumbbell"
          value={value?.id ?? ""}
          onChange={(next) => {
            const exercise = options.find((item) => item.id === next);
            if (exercise) onChange(exercise);
          }}
          options={[
            ...(!value
              ? [{ value: "", label: "请选择一个动作", disabled: true }]
              : []),
            ...options.map((exercise) => ({
              value: exercise.id,
              label: exercise.name,
              description: exercise.equipment,
            })),
          ]}
        />
      </div>
      <div className="row wrap picker-pagination">
        <span className="muted" aria-live="polite">
          {filtered.length} 项 · 第 {currentPage + 1} /{" "}
          {Math.max(1, Math.ceil(filtered.length / 24))} 页
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          上一页动作
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={(currentPage + 1) * 24 >= filtered.length}
          onClick={() => setPage(currentPage + 1)}
        >
          下一页动作
        </button>
      </div>
      {error && (
        <p role="status">
          {error}{" "}
          <button type="button" className="text-button" onClick={retry}>
            重试目录
          </button>
        </p>
      )}
    </div>
  );
}
