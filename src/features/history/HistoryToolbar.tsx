import type { Exercise } from "../../domain/types";
import Icon from "../../components/Icon";
import ChoiceSelect from "../../components/ChoiceSelect";
import InlineChoiceScope from "../../components/InlineChoiceScope";

export default function HistoryToolbar({
  search,
  setSearch,
  historyExercise,
  setHistoryExercise,
  trained,
}: {
  search: string;
  setSearch: (value: string) => void;
  historyExercise: string;
  setHistoryExercise: (value: string) => void;
  trained: Exercise[];
}) {
  return (
    <InlineChoiceScope className="history-toolbar control-panel control-panel-search">
      <label className="library-search">
        <Icon name="search" size={16} />
        <span className="sr-only">搜索训练历史</span>
        <input
          type="search"
          aria-label="搜索训练历史"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索训练、动作或备注…"
        />
      </label>
      <ChoiceSelect
        label="历史动作筛选"
        icon="calendar"
        value={historyExercise}
        onChange={setHistoryExercise}
        active={historyExercise !== "all"}
        options={[
          { value: "all", label: "全部动作" },
          ...trained.map((ex) => ({ value: ex.id, label: ex.name })),
        ]}
      />
    </InlineChoiceScope>
  );
}
