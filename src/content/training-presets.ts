import type { AppData, WorkoutTemplate } from '../domain/types';
import { warmupTemplateItemId } from '../domain/sets';
import { ensureExercises } from './opengym-catalogue';
import { additionalTrainingPresets, referenceTrainingExercises } from './reference-training';

type Movement = [exerciseId: string, sets: number, reps: number, seconds?: number];
type TrainingDay = { key: string; title: string; note: string; movements: Movement[]; warmups?: Movement[]; alternatives?: Record<string, string[]> };
export type TrainingPreset = {
  id: string;
  division: 1 | 2 | 3 | 5;
  label: string;
  rhythm: string;
  source?: { label: string; url: string };
  restSeconds?: number;
  templatePrefix?: string;
  days: TrainingDay[];
};

export const trainingPresets: readonly TrainingPreset[] = [
  {
    id: 'full', division: 1, label: '全身基础',
    rhythm: '每次练全身，可从每周 2 次开始，中间留休息日。',
    days: [
      { key: 'full', title: '全身', note: '一次覆盖蹲、推、拉、髋铰链和核心。', movements: [
        ['catalog-goblet-squat', 3, 10], ['catalog-machine-chest-press', 3, 10],
        ['catalog-seated-row', 3, 10], ['ex-rdl', 2, 10], ['ex-plank', 2, 0, 30],
      ] },
    ],
  },
  {
    id: 'upper-lower', division: 2, label: '上肢／下肢',
    rhythm: '上肢、下肢轮换。有每周 4 次的时间时，可各安排 2 次。',
    days: [
      { key: 'upper', title: '上肢', note: '先做卧推和两种拉，再补肩中束。', movements: [
        ['ex-bench', 3, 8], ['ex-lat', 3, 10], ['catalog-seated-row', 3, 10],
        ['catalog-lateral-raise', 2, 12],
      ] },
      { key: 'lower', title: '下肢', note: '用深蹲和髋铰链打底，补腿后侧、小腿和核心。', movements: [
        ['ex-squat', 3, 8], ['ex-rdl', 3, 8], ['catalog-lying-leg-curl', 2, 12],
        ['catalog-standing-calf-raise', 2, 12], ['ex-plank', 2, 0, 30],
      ] },
    ],
  },
  {
    id: 'photo', division: 3, label: '胸臂／背臂／肩腿',
    rhythm: '保留参考图里的三个训练日搭配。每轮含 3 个训练日，可按恢复情况穿插休息。',
    source: { label: '谭成义的公开三分化内容', url: 'https://jingxuan.douyin.com/m/video/7595410750903198075' },
    days: [
      { key: 'chest', title: '胸＋肩中束＋二头', note: '保留平板与上斜推，侧平举和弯举各挑一个。', movements: [
        ['ex-bench', 3, 8], ['catalog-incline-dumbbell-press', 2, 10],
        ['catalog-lateral-raise', 2, 12], ['ex-curl', 2, 12],
      ] },
      { key: 'back', title: '背＋三头', note: '一项下拉、一项划船，再练肩后束和三头。', movements: [
        ['ex-lat', 3, 10], ['catalog-seated-row', 3, 10],
        ['catalog-reverse-pec-deck', 2, 12], ['catalog-skull-crusher', 2, 12],
      ] },
      { key: 'shoulder-legs', title: '肩＋腿', note: '保加利亚分腿蹲左右各 2 组，每组记录当侧次数。', movements: [
        ['catalog-hack-squat', 3, 10], ['catalog-overhead-press', 2, 10],
        ['catalog-lateral-raise', 2, 12], ['catalog-lying-leg-curl', 2, 12],
        ['catalog-bulgarian-split-squat', 4, 8],
      ] },
    ],
  },
  {
    id: 'push-pull-legs', division: 3, label: '推／拉／腿',
    rhythm: '参考凯圣王和谭成义联名系列的推、拉、腿安排，按轮次选择训练日。',
    source: { label: '凯圣王 × 谭成义联名训练计划', url: 'https://jingxuan.douyin.com/m/video/7623732958012198179' },
    days: [
      { key: 'push', title: '推', note: '胸、肩中束和三头同日训练。', movements: [
        ['ex-bench', 3, 8], ['catalog-incline-dumbbell-press', 2, 10],
        ['catalog-lateral-raise', 2, 12], ['catalog-rope-tricep-pushdown', 2, 12],
      ] },
      { key: 'pull', title: '拉', note: '先做垂直拉和水平拉，再练肩后束与二头。', movements: [
        ['ex-lat', 3, 10], ['catalog-seated-row', 3, 10],
        ['catalog-reverse-pec-deck', 2, 12], ['ex-curl', 2, 12],
      ] },
      { key: 'legs', title: '腿', note: '优先蹲和髋铰链，用腿弯举和提踵补足。', movements: [
        ['catalog-goblet-squat', 3, 10], ['ex-rdl', 3, 8],
        ['catalog-lying-leg-curl', 2, 12], ['catalog-standing-calf-raise', 2, 12],
      ] },
    ],
  },
  {
    id: 'five-day', division: 5, label: '胸／背／腿／肩／臂',
    rhythm: '每轮 5 个训练日，适合能稳定安排较多训练日的人，可按恢复情况插入休息。',
    days: [
      { key: 'chest', title: '胸', note: '两个推的角度，加一项夹胸。', movements: [
        ['ex-bench', 3, 8], ['catalog-incline-dumbbell-press', 3, 10], ['catalog-pec-deck', 2, 12],
      ] },
      { key: 'back', title: '背', note: '先下拉和划船，最后用轻重量做直臂下压。', movements: [
        ['ex-lat', 3, 10], ['catalog-seated-row', 3, 10], ['catalog-straight-arm-pulldown', 2, 12],
      ] },
      { key: 'legs', title: '腿', note: '一次覆盖腿前侧、腿后侧和小腿。', movements: [
        ['ex-squat', 3, 8], ['ex-rdl', 3, 8], ['catalog-lying-leg-curl', 2, 12],
        ['catalog-standing-calf-raise', 2, 12],
      ] },
      { key: 'shoulders', title: '肩', note: '推举、侧平举和反向飞鸟各保留一项。', movements: [
        ['ex-press', 3, 10], ['catalog-lateral-raise', 3, 12], ['catalog-reverse-pec-deck', 2, 12],
      ] },
      { key: 'arms', title: '手臂', note: '各选两项肘屈、肘伸动作，优先稳住上臂。', movements: [
        ['ex-curl', 3, 10], ['catalog-rope-tricep-pushdown', 3, 12],
        ['catalog-hammer-curl', 2, 12], ['catalog-skull-crusher', 2, 12],
      ] },
    ],
  },
  ...additionalTrainingPresets,
];

export const divisionLabels = { 1: '一分化', 2: '二分化', 3: '三分化', 5: '五分化' };

export const presetExerciseById = new Map(referenceTrainingExercises.map((exercise) => [exercise.id, exercise]));

export function presetTemplates(preset: TrainingPreset, updatedAt = new Date().toISOString(), choices: Record<string, string> = {}): WorkoutTemplate[] {
  return preset.days.map(({ key, title, note, movements, warmups = [], alternatives }) => {
    const id = 'preset-' + preset.id + '-' + key;
    return {
      id, updatedAt, name: (preset.templatePrefix ?? divisionLabels[preset.division]) + ' · ' + title,
      description: note + ' 主项先做轻重量热身，正式组留约 2–3 次余力。',
      restSeconds: preset.restSeconds ?? 120,
      items: [...warmups, ...movements].map(([exerciseId, sets, reps, durationSeconds = 0], index) => {
        const itemId = id + '-' + (index + 1);
        const choice = choices[`${id}/${exerciseId}`];
        return {
          id: index < warmups.length ? warmupTemplateItemId(itemId) : itemId,
          exerciseId: choice && alternatives?.[exerciseId]?.includes(choice) ? choice : exerciseId,
          sets, reps, durationSeconds, weightKg: 0,
        };
      }),
    };
  });
}

export function ensurePresetExercises(data: AppData, templates: WorkoutTemplate[]): AppData {
  const additions = templates.flatMap(({ items }) => items.flatMap(({ exerciseId }) => {
    const exercise = presetExerciseById.get(exerciseId);
    return exercise ? [exercise] : [];
  }));
  return ensureExercises(data, additions);
}

export function addPresetTemplates(data: AppData, preset: TrainingPreset, choices: Record<string, string> = {}): AppData {
  const ids = new Set(data.templates.map((template) => template.id));
  const additions = presetTemplates(preset, undefined, choices).filter((template) => !ids.has(template.id));
  return additions.length ? { ...ensurePresetExercises(data, additions), templates: [...data.templates, ...additions] } : data;
}

export function resolvePresetDay(templateId: string, saved: WorkoutTemplate | undefined, choices: Record<string, string>) {
  const preset = trainingPresets.find((plan) => plan.days.some((day) => `preset-${plan.id}-${day.key}` === templateId));
  if (!preset || (saved && !Object.keys(choices).length)) return saved;
  const index = preset.days.findIndex((day) => `preset-${preset.id}-${day.key}` === templateId);
  const selected = presetTemplates(preset, undefined, choices)[index];
  if (!saved) return selected;
  const original = presetTemplates(preset)[index];
  const overrides = new Map(original.items.flatMap((item, i) =>
    choices[`${templateId}/${item.exerciseId}`] === selected.items[i].exerciseId
      ? [[item.id, selected.items[i].exerciseId] as const] : []));
  return { ...saved, items: saved.items.map((item) => ({ ...item, exerciseId: overrides.get(item.id) ?? item.exerciseId })) };
}

export function presetAlternativeIds(templateId: string | undefined, exerciseId: string): string[] {
  for (const preset of trainingPresets) {
    const day = preset.days.find(({ key }) => `preset-${preset.id}-${key}` === templateId);
    if (!day) continue;
    for (const [original, alternatives] of Object.entries(day.alternatives ?? {})) {
      const group = [original, ...alternatives];
      if (group.includes(exerciseId)) return group.filter((id) => id !== exerciseId);
    }
    break;
  }
  return [];
}

export const presetGuides: Record<string, readonly [string, string, string]> = {
  full: ['适合每周练 2 次、想熟悉基本动作的人。', '两次全身训练之间留休息日。先蹲、推、拉，再做硬拉变式与核心。', '先练稳定的幅度和节奏，动作和目标次数都稳定后再小幅加重。'],
  'upper-lower': ['适合每周能安排 3–4 次训练的人。', '上肢与下肢交替。若每周 4 次，可排上、下、休、上、下。', '主项先热身。上肢优先推拉动作，下肢先蹲与髋铰链。'],
  photo: ['适合想体验原图分组、希望控制单次训练量的人。', '按胸臂、背臂、肩腿轮换，按恢复情况插入休息日。', '主项使用轻重量预演，正式组保持动作稳定。需要原图的热身与全部动作时可切换到完整版。'],
  'push-pull-legs': ['适合有健身房器械、希望把推拉动作分天练的人。', '一轮按推、拉、腿安排，训练间可以加休息日。', '每次先做复合动作。调整重量时先满足当前组次和动作幅度。'],
  'five-day': ['适合训练频率稳定、能安排 5 种训练日的人。', '按胸、背、腿、肩、手臂轮换，胸肩臂之间可穿插休息。', '留意相邻训练日的肌群重叠。恢复不足时先减少辅助动作组数。'],
  'photo-complete': ['适合已熟悉器械和动作、能承受较高单次训练量的人。三个训练日依次是胸肩中束二头、背三头、肩腿。', '每次先按列表做热身与激活，再做正式动作。划船、蹲类和胸日所列替代可在本次开练或排期前切换。', '先用能稳控的重量，组末留约 2–3 次余力。原图两项力竭热身默认轻量 10 次。保加利亚分腿蹲四组按左右各两组。'],
  'evidence-foundation': ['适合初学或停练后重新开始的健康成年人。A、B 两天都覆盖蹲、推、拉、髋铰链与核心。', '例如周一 A、周四 B。先做列表里的轻量热身，首个负重动作再用轻重量预演。', '正式动作多为 2 组 × 10 次。连续几次都能稳定完成目标、组末仍有余力时，再使用下一档重量。'],
  'evidence-strength': ['适合已掌握深蹲、卧推和硬拉动作的人，目标偏力量。', '两天中间至少留一个休息日。主项先做，随负重逐级热身；正式组默认休息 3 分钟。', '主项以 3 组 × 5 次为起点，辅助动作保持可控。训练重量由你按当天表现选择。'],
};
