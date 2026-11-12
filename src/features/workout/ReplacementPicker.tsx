import { useMemo, useState } from 'react';
import type { Exercise } from '../../domain/types';
import { useExerciseOptions } from '../../content/use-exercise-options';
import { openGymEntryFor } from '../../content/opengym-catalogue';
import { guideFor } from '../../content/catalog';
import Icon from '../../components/Icon';

export default function ReplacementPicker({ saved, original, alternatives, blocked, onPick }: {
  saved: Exercise[];
  original: Exercise;
  alternatives: Exercise[];
  blocked: boolean;
  onPick: (exercise: Exercise) => void;
}) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(24);
  const { exercises, loading, error, retry } = useExerciseOptions(saved);
  const matches = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const options = new Map([...alternatives, ...exercises].map((exercise) => [exercise.id, exercise]));
    options.delete(original.id);
    if (!words.length) {
      return [...alternatives, ...saved.filter((exercise) =>
        exercise.id !== original.id && exercise.muscle === original.muscle && exercise.kind === original.kind
        && !alternatives.some(({ id }) => id === exercise.id))];
    }
    return [...options.values()].filter((exercise) => {
      const searchable = `${exercise.name} ${exercise.equipment} ${exercise.muscle} ${guideFor(exercise)?.english ?? openGymEntryFor(exercise.id)?.nameEn ?? ''}`.toLowerCase();
      return words.every((word) => searchable.includes(word));
    });
  }, [query, saved, original, alternatives, exercises]);

  return (
    <div className="workout-replacements">
      <label className="field">
        搜索替代动作
        <input className="form-input" type="search" value={query} disabled={blocked}
          placeholder="动作名称、器械或肌群" onChange={(event) => { setQuery(event.target.value); setLimit(24); }} />
      </label>
      {matches.length > 0 ? (
        <ul className="workout-replacement-list" aria-label="可替换动作">
          {matches.slice(0, limit).map((exercise) => (
            <li key={exercise.id}>
              <button className="btn btn-secondary" type="button" disabled={blocked} onClick={() => onPick(exercise)}>
                <span><strong>{exercise.name}</strong><small>{alternatives.some(({ id }) => id === exercise.id) ? '模板替代 · ' : ''}{exercise.equipment}</small></span>
                <Icon name="arrow" size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="muted">{query.trim() && loading ? '正在载入动作库…' : query.trim() ? '没找到匹配的动作。' : '搜索动作库以选择替代动作。'}</p>}
      {matches.length > limit && <button type="button" className="btn btn-secondary" disabled={blocked} onClick={() => setLimit(limit + 24)}>显示更多动作</button>}
      {error && <p role="status">{error} <button className="text-button" type="button" onClick={retry}>重试目录</button></p>}
    </div>
  );
}
