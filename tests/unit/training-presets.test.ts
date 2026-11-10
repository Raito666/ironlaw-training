import { expect, test } from 'vitest';
import { validateAppData } from '../../src/data/backup';
import { createInitialData, isRetiredStarterTemplate } from '../../src/domain/seed';
import { createSession } from '../../src/domain/training';
import { isWarmupTemplateItem } from '../../src/domain/sets';
import { exportTemplate, importTemplate, parseTemplate } from '../../src/features/portable-content';
import { addPresetTemplates, presetTemplates, trainingPresets } from '../../src/content/training-presets';

test('only the original starter templates are retired', () => {
  const { templates } = createInitialData();
  expect(templates.filter(isRetiredStarterTemplate).map((template) => template.id)).toEqual([
    'template-full', 'template-upper', 'template-lower',
  ]);
  const original = templates[0];
  for (const template of [
    { ...original, id: 'my-own-template' },
    { ...original, name: '我的全身训练' },
    { ...original, updatedAt: '2026-11-08T00:00:00.000Z' },
    { ...original, items: original.items.slice(1) },
    ...presetTemplates(trainingPresets[0]),
  ]) expect(isRetiredStarterTemplate(template)).toBe(false);
});

test('each split has the advertised training days and startable workouts', () => {
  expect(trainingPresets.slice(0, 5).map((preset) => preset.division)).toEqual([1, 2, 3, 3, 5]);
  const data = createInitialData();
  for (const preset of trainingPresets) {
    const templates = presetTemplates(preset);
    expect(templates).toHaveLength(preset.division);
    const saved = validateAppData(addPresetTemplates(data, preset));
    for (const template of templates) {
      expect(template.items.length).toBeGreaterThanOrEqual(3);
      expect(template.items.length).toBeLessThanOrEqual(preset.templatePrefix ? 30 : 5);
      expect(new Set(template.items.map((item) => `${item.exerciseId}/${isWarmupTemplateItem(item)}`)).size).toBe(template.items.length);
      const session = createSession(template, saved.exercises);
      expect(session.exercises).toHaveLength(template.items.length);
      expect(session.exercises.every((item) => item.sets.every((set) => set.weightKg === 0))).toBe(true);
    }
  }
  expect(presetTemplates(trainingPresets[2]).map((template) => template.name)).toEqual([
    '三分化 · 胸＋肩中束＋二头', '三分化 · 背＋三头', '三分化 · 肩＋腿',
  ]);
});

test('the full reference plan saves all 32 rows and records the 12 preparation rows as warmups', () => {
  const data = createInitialData();
  const preset = trainingPresets.find(({ id }) => id === 'photo-complete');
  expect(preset).toBeDefined();
  const saved = validateAppData(addPresetTemplates(data, preset!));
  const days = saved.templates.filter(({ id }) => id.startsWith('preset-photo-complete-'));
  expect(days.map(({ items }) => items.length)).toEqual([11, 11, 10]);
  expect(days.map((day) => createSession(day, saved.exercises).exercises.filter((ex) => ex.sets.every((set) => set.type === 'warmup')).length))
    .toEqual([4, 4, 4]);
  expect(addPresetTemplates(saved, preset!)).toBe(saved);
});

test('reference substitutions and warmup roles survive saving and shared template import', () => {
  const data = createInitialData();
  const preset = trainingPresets.find(({ id }) => id === 'photo-complete')!;
  const saved = addPresetTemplates(data, preset, {
    'preset-photo-complete-chest/reference-high-cable-chest-press': 'reference-band-chest-press',
    'preset-photo-complete-back/reference-elbows-out-seated-row': 'catalog-t-bar-row',
    'preset-photo-complete-shoulder-legs/catalog-belt-squat': 'catalog-landmine-squat',
  });
  const [chest, back, legs] = saved.templates.slice(-3);
  expect(chest.items[2]).toMatchObject({ exerciseId: 'reference-band-chest-press', reps: 10 });
  expect(back.items.some((item) => item.exerciseId === 'catalog-t-bar-row')).toBe(true);
  expect(legs.items.some((item) => item.exerciseId === 'catalog-landmine-squat')).toBe(true);
  const shared = parseTemplate(exportTemplate(chest, saved.exercises), data);
  const imported = importTemplate(data, shared).templates.at(-1)!;
  expect(imported.items.filter(isWarmupTemplateItem)).toHaveLength(4);
});

test('adding a split fills only missing days and preserves edits and archives on retry', () => {
  const data = createInitialData();
  const preset = trainingPresets[2];
  const [first] = presetTemplates(preset);
  const edited = { ...first, name: '自己的胸部日', archived: true };
  const before = { ...data, templates: [...data.templates, edited] };
  const result = addPresetTemplates(before, preset);
  expect(result.templates).toHaveLength(data.templates.length + 3);
  expect(result.templates.slice(0, before.templates.length)).toEqual(before.templates);
  expect(result.exercises).toBe(data.exercises);
  expect(result.sessions).toBe(data.sessions);
  expect(addPresetTemplates(result, preset)).toBe(result);
});
