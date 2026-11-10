import type { Exercise } from '../domain/types';
import type { TrainingPreset } from './training-presets';

const reference = (id: string, name: string, muscle: string, equipment: string, kind: Exercise['kind'], description: string): Exercise =>
  ({ id: `reference-${id}`, name, muscle, equipment, kind, description });

export const referenceTrainingExercises = [
  reference('wall-angel', '墙天使', '肩部', '自重', 'reps', '靠墙站稳，手肘弯曲，在肩部舒适的范围内沿墙缓慢上滑再还原。前臂不必强行贴墙。'),
  reference('shoulder-activation', '肩膀激活（轻哑铃）', '肩部', '哑铃', 'weight-reps', '双手对握轻哑铃，保持躯干稳定，在舒适范围内缓慢上举。用轻重量练习轨迹，保持呼吸。'),
  reference('foam-roll-wall-press', '靠墙向后推（泡沫轴）', '背部', '泡沫轴', 'reps', '前臂轻压墙上的泡沫轴，保持躯干稳定，向前施力并小幅向上滚动，再控制还原。'),
  reference('kneeling-elbow-extension', '跪姿肘屈伸', '肩部', '训练凳', 'reps', '跪稳并把肘部支撑在训练凳上，缓慢屈伸手肘。上臂与肩胛位置保持稳定。'),
  reference('standing-elbow-extension', '站姿肘屈伸（热身）', '肩部', '训练凳', 'reps', '站稳后俯身，让肘部在稳定支撑上缓慢屈伸。控制动作范围，避免耸肩或压腰。'),
  reference('high-cable-chest-press', '小龙门架平推', '胸部', '绳索', 'weight-reps', '将两侧滑轮调到胸肩附近，前后站稳，轻负荷水平推向前方，再缓慢收回。'),
  reference('band-chest-press', '弹力带平推', '胸部', '弹力带', 'reps', '确认弹力带固定牢靠，从胸前向前推出，保持肩部舒适，并控制回程。'),
  reference('internal-rotation-pushup', '内旋位俯卧撑', '胸部', '自重', 'reps', '使用稳定支撑，按舒适的手位做轻量俯卧撑。可抬高支撑减轻负荷，避免强拧手腕或肩部。'),
  reference('reverse-grip-pulldown', '反手高位下拉', '背部', '绳索', 'weight-reps', '反手握横杆，坐稳后向胸前下拉，再控制上送，避免用后仰带动。'),
  reference('close-neutral-seated-row', '窄距对握坐姿划船', '背部', '绳索', 'weight-reps', '用窄距对握把，坐稳，沿躯干两侧把手柄拉向腹部，再缓慢伸臂。'),
  reference('elbows-out-seated-row', '开肘坐姿划船', '背部', '绳索', 'weight-reps', '选择允许手肘自然外展的握把，向胸腹之间拉动，回程保持躯干稳定。'),
  reference('bent-over-barbell-high-row', '俯身杠铃提拉', '肩部', '杠铃', 'weight-reps', '轻负荷俯身并固定躯干，让手肘向外带动杠铃上行。以肩部舒适幅度为限，避免甩杠。'),
  reference('seated-cable-biceps-curl', '坐姿绳索弯举（偏二头）', '手臂', '绳索', 'weight-reps', '坐稳，把上臂支撑在大腿内侧附近，屈肘卷起握把，再缓慢伸肘。单侧分别记录。'),
  reference('seated-cable-brachialis-curl', '坐姿绳索弯举（偏肱肌）', '手臂', '绳索', 'weight-reps', '坐稳并固定上臂角度，以舒适握姿轻量屈肘。控制回程，不借躯干摆动。'),
  { id: 'og:8365', name: '弹力带绕肩', muscle: '肩部', equipment: '弹力带', kind: 'reps', description: '宽握轻弹力带，由身前沿舒适幅度绕过头顶，前后为一次。保持躯干稳定。' },
  { id: 'og:5089', name: '站姿龙门架内旋', muscle: '肩部', equipment: '绳索', kind: 'weight-reps', description: '侧对绳索，轻负荷屈肘做肩内旋。上臂位置稳定，左右分别记录。' },
] satisfies Exercise[];

const acsm = { label: 'ACSM 2026 抗阻训练立场声明', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/' };

export const additionalTrainingPresets: readonly TrainingPreset[] = [
  {
    id: 'photo-complete', division: 3, label: '谭成义三分化 · 原图完整版', templatePrefix: '原图三分化',
    rhythm: '依照你提供的三张参考图录入。训练量较高，可按恢复情况穿插休息。原图两项力竭热身在这里改为轻量 10 次。',
    source: { label: '谭成义的公开三分化系列', url: 'https://jingxuan.douyin.com/m/video/7595410750903198075' },
    days: [
      { key: 'chest', title: '胸＋肩中束＋二头', note: '夹胸第一项是激活，后续绳索夹胸是正式组。两项坐姿绳索弯举的侧重点分开记录。',
        warmups: [['og:8365', 2, 10], ['catalog-band-pull-apart', 2, 10], ['reference-high-cable-chest-press', 2, 10], ['catalog-pec-deck', 3, 12]],
        movements: [['ex-bench', 4, 12], ['catalog-incline-dumbbell-press', 4, 12], ['catalog-dip', 4, 12], ['catalog-cable-fly', 4, 12], ['catalog-lateral-raise', 4, 15], ['reference-seated-cable-biceps-curl', 4, 12], ['reference-seated-cable-brachialis-curl', 4, 15]],
        alternatives: { 'reference-high-cable-chest-press': ['reference-internal-rotation-pushup', 'reference-band-chest-press'], 'catalog-dip': ['catalog-cable-fly'] },
      },
      { key: 'back', title: '背＋三头', note: '绳索内旋左右练习，填写当侧次数。开肘划船和 T 杠划船任选一个。',
        warmups: [['reference-foam-roll-wall-press', 2, 15], ['reference-kneeling-elbow-extension', 2, 15], ['reference-standing-elbow-extension', 2, 15], ['og:5089', 2, 20]],
        movements: [['catalog-close-grip-lat-pulldown', 4, 12], ['reference-reverse-grip-pulldown', 4, 12], ['reference-close-neutral-seated-row', 4, 12], ['reference-elbows-out-seated-row', 4, 12], ['catalog-reverse-pec-deck', 4, 12], ['catalog-bench-dip', 4, 12], ['catalog-skull-crusher', 4, 12]],
        alternatives: { 'reference-elbows-out-seated-row': ['catalog-t-bar-row'] },
      },
      { key: 'shoulder-legs', title: '肩＋腿', note: '犀牛蹲用腰带深蹲条目记录，也可换地雷杆深蹲。保加利亚分腿蹲左右各 2 组，每组填当侧次数。',
        warmups: [['catalog-band-pull-apart', 2, 10], ['og:8365', 2, 10], ['reference-wall-angel', 2, 10], ['reference-shoulder-activation', 3, 10]],
        movements: [['catalog-overhead-press', 4, 12], ['reference-bent-over-barbell-high-row', 4, 12], ['catalog-lateral-raise', 4, 15], ['catalog-lying-leg-curl', 4, 15], ['catalog-belt-squat', 4, 12], ['catalog-bulgarian-split-squat', 4, 12]],
        alternatives: { 'catalog-belt-squat': ['catalog-landmine-squat'] },
      },
    ],
  },
  {
    id: 'evidence-foundation', division: 2, label: '循证入门 · 全身 A／B', templatePrefix: '循证入门',
    rhythm: '铁律依据 ACSM 2026 编排。每周选两个不连续的训练日，A、B 各一次；每次都覆盖主要动作模式。', source: acsm,
    days: [
      { key: 'a', title: '全身 A · 蹲和推', note: '主项先试轻重量。所有正式组都能稳定完成后，再小幅加重。',
        warmups: [['catalog-bodyweight-squat', 1, 10], ['catalog-band-pull-apart', 1, 12]],
        movements: [['catalog-goblet-squat', 2, 10], ['catalog-machine-chest-press', 2, 10], ['catalog-seated-row', 2, 10], ['catalog-dumbbell-romanian-deadlift', 2, 10], ['ex-plank', 2, 0, 25]], },
      { key: 'b', title: '全身 B · 髋和拉', note: '先练髋铰链与下拉，再做腿举、上斜推和核心。',
        warmups: [['catalog-glute-bridge', 1, 10], ['catalog-banded-row', 1, 12]],
        movements: [['catalog-dumbbell-romanian-deadlift', 2, 10], ['ex-lat', 2, 10], ['catalog-leg-press', 2, 10], ['catalog-incline-dumbbell-press', 2, 10], ['catalog-dead-bug', 2, 10]], },
    ],
  },
  {
    id: 'evidence-strength', division: 2, label: '循证力量 · 全身 A／B', templatePrefix: '循证力量',
    rhythm: '铁律依据 ACSM 2026 编排，适合已熟悉杠铃动作的人。每周选两个不连续的训练日，重组前逐步加重热身。', source: acsm, restSeconds: 180,
    days: [
      { key: 'a', title: '力量 A · 深蹲和卧推', note: '深蹲与卧推使用合适的保护设置；重量由当天动作稳定性决定。',
        warmups: [['ex-squat', 1, 8], ['ex-bench', 1, 8]],
        movements: [['ex-squat', 3, 5], ['ex-bench', 3, 5], ['catalog-seated-row', 2, 8], ['ex-rdl', 2, 8]], },
      { key: 'b', title: '力量 B · 硬拉和推举', note: '优先完成硬拉，再做推举、下拉、腿举和上斜推。',
        warmups: [['catalog-glute-bridge', 1, 10], ['catalog-trap-bar-deadlift', 1, 6], ['catalog-overhead-press', 1, 8]],
        movements: [['catalog-trap-bar-deadlift', 3, 5], ['catalog-overhead-press', 3, 5], ['ex-lat', 2, 8], ['catalog-leg-press', 2, 8], ['catalog-incline-dumbbell-press', 2, 8]], },
    ],
  },
];
