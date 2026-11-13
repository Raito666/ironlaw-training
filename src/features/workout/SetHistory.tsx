import type { Exercise, SetRecord } from '../../domain/types';
import { setTypeLabels } from '../../domain/sets';
import { canCopyHistorySet, formatSetValue, type ExerciseSetHistory } from './performance';

export default function SetHistory({ history, kind, unit, target, onCopy }: {
  history: ExerciseSetHistory[];
  kind: Exercise['kind'];
  unit: 'kg' | 'lb';
  target?: SetRecord;
  onCopy?: (source: SetRecord) => void;
}) {
  return <details className="set-history">
    <summary>逐组历史</summary>
    {history.length ? <ul className="set-history-sessions">
      {history.slice(0, 3).map((entry) => <li key={entry.id}>
        <h3 className="wrap-cjk">{entry.date} · {entry.name}</h3>
        {entry.exercises.map((item) => {
          const ranks = { warmup: 0, work: 0, drop: 0, failure: 0 };
          return <div key={item.id}>
            {item.note && <p className="muted wrap-cjk">{item.note}</p>}
            <ul className="workout-set-list">
              {item.sets.map((set) => {
                const rank = ++ranks[set.type];
                const label = `${setTypeLabels[set.type]}第${rank}组`;
                if (set.status !== 'completed') return null;
                return <li key={set.id}>
                  <span>{label}</span>
                  <span className="workout-set-result">{formatSetValue(set, kind, unit)}{set.rpe !== undefined && ` · RPE ${set.rpe}`}</span>
                  {target && onCopy && canCopyHistorySet(kind, target, set) && <button type="button" className="btn btn-ghost"
                    aria-label={`填入历史${label}`} onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      onCopy(set);
                    }}>填入本组</button>}
                </li>;
              })}
            </ul>
          </div>;
        })}
      </li>)}
    </ul> : <p className="muted">这个动作还没有已完成的分组记录。</p>}
  </details>;
}
