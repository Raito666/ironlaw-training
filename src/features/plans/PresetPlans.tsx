import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import {
  addPresetTemplates,
  divisionLabels,
  presetExerciseById,
  presetGuides,
  presetTemplates,
  resolvePresetDay,
  trainingPresets,
} from '../../content/training-presets';
import { isWarmupTemplateItem } from '../../domain/sets';
import type { AppData, TemplateItem, WorkoutTemplate } from '../../domain/types';
import { usePendingMutation } from '../pending-mutation';
import { TrainingDateForm } from './TrainingSchedule';
import type { TrainingScheduleController } from './useTrainingSchedule';

const divisions = [1, 2, 3, 5] as const;
const presetFromUrl = () => {
  const id = new URLSearchParams(location.hash.split('?')[1]).get('preset');
  return trainingPresets.find((plan) => plan.id === id);
};

type Props = {
  data: AppData;
  writable: boolean;
  mutate: (fn: (data: AppData) => AppData) => Promise<boolean>;
  retry: () => Promise<boolean>;
  openStart: (template: WorkoutTemplate) => void;
  schedule: TrainingScheduleController;
};

export default function PresetPlans({ data, writable, mutate, retry, openStart, schedule }: Props) {
  const [preset, setPreset] = useState(() => presetFromUrl() ?? trainingPresets[0]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle');
  useEffect(() => {
    const select = () => {
      const target = presetFromUrl();
      if (target && state === 'idle') setPreset(target);
    };
    window.addEventListener('hashchange', select);
    return () => window.removeEventListener('hashchange', select);
  }, [state]);
  const pending = usePendingMutation(mutate, retry);
  const options = trainingPresets.filter((item) => item.division === preset.division);
  const originals = presetTemplates(preset);
  const days = presetTemplates(preset, undefined, choices);
  const saved = new Map(data.templates.map((template) => [template.id, template]));
  const missing = days.filter((day) => !saved.has(day.id)).length;
  const exercises = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
  const exerciseName = (id: string) => (exercises.get(id) ?? presetExerciseById.get(id))?.name ?? '动作暂不可用';
  const choicesFor = (id: string) => Object.fromEntries(Object.entries(choices).filter(([key]) => key.startsWith(`${id}/`)));
  const scheduleTargets = days.map((day) => ({ template: saved.get(day.id) ?? day, choices: choicesFor(day.id) }));

  async function save() {
    setState('saving');
    try {
      setState((await pending.run((latest) => addPresetTemplates(latest, preset, choices))) ? 'idle' : 'failed');
    } catch {
      setState('failed');
    }
  }

  return (
    <section className="card preset-plans" aria-labelledby="preset-plans-title">
      <div>
        <h2 id="preset-plans-title">精选分化模板</h2>
        <p className="muted">选分化后展开训练日，可以直接开练，也可整套加入我的模板。</p>
      </div>
      <div className="segmented preset-divisions" role="group" aria-label="训练分化">
        {divisions.map((division) => (
          <button
            key={division}
            type="button"
            className={preset.division === division ? 'active' : undefined}
            aria-pressed={preset.division === division}
            disabled={state !== 'idle'}
            onClick={() => {
              if (preset.division !== division)
                setPreset(trainingPresets.find((item) => item.division === division)!);
            }}
          >
            {divisionLabels[division]}
          </button>
        ))}
      </div>
      {options.length > 1 && (
        <div className="segmented preset-variants" role="group" aria-label={`${divisionLabels[preset.division]}方案`}>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={preset.id === option.id ? 'active' : undefined}
              aria-pressed={preset.id === option.id}
              disabled={state !== 'idle'}
              onClick={() => setPreset(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <div className="preset-overview">
        <div>
          <h3>{preset.label}</h3>
          <p className="muted">{preset.rhythm}</p>
          {preset.source && (
            <a href={preset.source.url} target="_blank" rel="noreferrer">{preset.source.label}</a>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!writable || state === 'saving' || (!missing && state === 'idle')}
          onClick={() => void save()}
        >
          {state === 'saving' ? '正在保存…' : state === 'failed' ? '重试加入模板' :
            missing ? '加入我的模板' : '已加入我的模板'}
        </button>
      </div>
      <details className="preset-guide" key={preset.id}>
        <summary>查看这套模板的详细说明</summary>
        <dl>
          {['适合谁', '怎么安排', '怎么进阶'].map((label, index) => (
            <div key={label}><dt>{label}</dt><dd>{presetGuides[preset.id][index]}</dd></div>
          ))}
        </dl>
      </details>
      {scheduleTargets.every(({ template }) => !template.archived) && (
        <TrainingDateForm template={scheduleTargets[0].template} schedule={schedule} whole={scheduleTargets} key={`schedule-${preset.id}`} />
      )}
      {state === 'failed' && (
        <p className="error-text" role="alert">这套模板尚未保存，可重试加入。</p>
      )}
      <div className="preset-days" key={preset.id}>
        {days.map((day, index) => {
          const template = saved.get(day.id);
          const dayChoices = choicesFor(day.id);
          const selected = template ? resolvePresetDay(day.id, template, dayChoices)! : day;
          const items = selected.items;
          const warmups = items.filter(isWarmupTemplateItem);
          const work = items.filter((item) => !isWarmupTemplateItem(item));
          const info = preset.days[index];
          const renderItem = (item: TemplateItem) => {
            const original = originals[index].items.find(({ id }) => id === item.id)?.exerciseId;
            const alternatives = original && info.alternatives?.[original];
            return (
              <li key={item.id}>
                <span>{exerciseName(item.exerciseId)}</span>
                <span className="muted">{item.sets} 组 × {item.durationSeconds ? `${item.durationSeconds} 秒` : `${item.reps} 次`}</span>
                {original && alternatives && (
                  <div className="preset-alternatives" role="group" aria-label={`${exerciseName(original)}备选动作`}>
                    {[original, ...alternatives].map((id) => (
                      <button type="button" className="btn btn-ghost" key={id} disabled={state !== 'idle' || template?.archived}
                        aria-pressed={item.exerciseId === id}
                        onClick={() => setChoices((previous) => ({ ...previous, [`${day.id}/${original}`]: id }))}>
                        {exerciseName(id)}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          };
          return (
            <details className="preset-day" key={day.id} open={index === 0}>
              <summary>
                <strong>第 {index + 1} 天 · {info.title}</strong>
                <span className="muted">{warmups.length > 0 ? `${warmups.length} 热身 · ${work.length} 正式` : `${work.length} 个动作`}</span>
              </summary>
              {!template?.archived && (
                <button type="button" className="btn btn-primary preset-start" disabled={!writable || state !== 'idle'} onClick={() => openStart(selected)}>
                  开始第 {index + 1} 天 <Icon name="arrow" size={16} />
                </button>
              )}
              {warmups.length > 0 && <><h4>热身与激活</h4><ol>{warmups.map(renderItem)}</ol><h4>正式动作</h4></>}
              <ol>{work.map(renderItem)}</ol>
              <p className="muted">{info.note}</p>
              {template?.archived && <p className="muted">此训练日已归档，可在下方恢复。</p>}
              {!template?.archived && <TrainingDateForm template={selected} choices={dayChoices} schedule={schedule} />}
            </details>
          );
        })}
      </div>
      <p className="muted">预览为初始建议。主项先做轻重量热身，正式组留约 2–3 次余力。</p>
    </section>
  );
}
