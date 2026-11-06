import type { Exercise } from "../domain/types";
import { catalogEntries } from "./catalog";
import { openGymEntryFor } from "./opengym-catalogue";

export const difficultyLevels = ["基础", "进阶", "高阶", "未标注"] as const;
export type ExerciseDifficulty = (typeof difficultyLevels)[number];
const originals = new Map(catalogEntries.map((entry) => [entry.id, entry]));
const equipmentNames: Record<string, string> = {
  器械: "leverage machine",
  固定器械: "leverage machine",
  史密斯机: "smith machine",
  辅助器械: "assisted",
  健身球: "stability ball",
  半球平衡球: "bosu ball",
  悬吊训练带: "suspension trainer",
  自重: "body weight",
};
export const difficultyDefinitions: Record<
  ExerciseDifficulty,
  { label: string; description: string }
> = {
  基础: {
    label: "基础",
    description: "支撑较稳定、动作路线较明确，适合先熟悉姿势与节奏。",
  },
  进阶: {
    label: "进阶",
    description: "需要更多躯干控制、单侧平衡或多关节配合。",
  },
  高阶: {
    label: "高阶",
    description: "涉及复杂技术、倒立支撑、爆发接续或较高的全身协调要求。",
  },
  未标注: {
    label: "待评估",
    description: "个人或专项动作没有足够信息，不自动给出等级。",
  },
};

export interface DifficultyInfo {
  level: ExerciseDifficulty;
  source:
    | "project-reference"
    | "catalogue-reference"
    | "general-reference"
    | "unrated";
  reason: string;
  cues: readonly string[];
}
type Movement = { name: string; equipment: string; category: string };
type Rule = {
  level: ExerciseDifficulty;
  matches: (movement: Movement) => boolean;
  reason: string;
  cues: readonly string[];
};
const controlled = [
  "先阅读完整步骤，确认起始姿势、动作路线和结束方式。",
  "使用能保持动作控制的范围与节奏，先熟悉动作再增加训练量。",
  "每次回到稳定位置后再继续，不用完成数量代替动作质量。",
];
const mobility = [
  "先摆好支撑位置，缓慢进入能够控制的活动范围。",
  "保持自然呼吸，不靠反弹或突然拉扯追求更大幅度。",
  "平稳退出动作，再按训练安排重复或换侧。",
];
const isolation = [
  "先调整支撑、握把或身体位置，确认目标关节能舒适活动。",
  "让目标部位带动动作，尽量避免躯干摆动借力。",
  "回程保持控制，回到稳定起点后继续下一次。",
];
const rules: Rule[] = [
  {
    level: "高阶",
    matches: ({ name }) =>
      /\b(muscle ?up|planche|front lever|back lever|human flag|iron cross|handstand|headstand|pistol|l sit|dragon flag)\b/.test(
        name,
      ) ||
      /\b(one arm|one hand|single arm|single hand)\b.*\b(pull ?up|chin ?up|push ?up)\b/.test(
        name,
      ),
    reason: "此类动作包含复杂支撑、悬垂或较高的全身协调要求，按高阶技术参考。",
    cues: [
      "先掌握稳定支撑和更容易的分解版本。",
      "进入与退出姿势都保持可控，不只追求最终造型。",
      "先完成少量规范重复或短时保持，再逐步增加。",
    ],
  },
  {
    level: "高阶",
    matches: ({ name, category }) =>
      category === "olympic" ||
      /\b(snatch(?! grip)|clean and (jerk|press)|power clean|hang clean|split jerk|turkish get ?up)\b/.test(
        name,
      ),
    reason: "包含分阶段的爆发、接住器械或连续姿势转换，按高阶技术参考。",
    cues: [
      "先熟悉各阶段的分解动作及稳定结束的位置。",
      "从可控的技术负荷开始，再衔接完整动作。",
      "每次完成后稳定并重置起点，不在失控时强行接续。",
    ],
  },
  {
    level: "进阶",
    matches: ({ name }) =>
      /\b(over ?split|front split|middle split|backbend|wheel pose)\b/.test(
        name,
      ),
    reason: "动作对活动范围与进入、退出姿势的控制要求较高，按进阶参考。",
    cues: mobility,
  },
  {
    level: "基础",
    matches: ({ name, category }) =>
      ["mobility", "stretching"].includes(category) || /\bstretch\b/.test(name),
    reason:
      "以缓慢活动或拉伸为主；基础指动作组织较简单，不表示必须达到示范幅度。",
    cues: mobility,
  },
  {
    level: "进阶",
    matches: ({ name, category }) =>
      ["plyometrics", "combat"].includes(category) ||
      /\b(burpee|box jump|depth jump|clapping|jump rope|double under|sprint|thruster)\b/.test(
        name,
      ),
    reason: "需要协调节奏、连续转换或控制起落，按进阶技术参考。",
    cues: [
      "先熟悉单次动作及稳定结束的位置，再连续重复。",
      "保持动作路线与落点可控，不急着提高速度。",
      "节奏或姿势开始失去控制时，先降低重复数量。",
    ],
  },
  {
    level: "进阶",
    matches: ({ name, equipment }) =>
      /\b(bosu|stability ball|swiss ball|suspension|rings|trx|wobble|balance board|side plank|walking plank)\b/.test(
        `${name} ${equipment}`,
      ),
    reason: "不稳定支撑会增加平衡与躯干控制要求，按进阶参考。",
    cues: [
      "先确认支撑或悬吊固定点稳定，找到能够控制的起始位置。",
      "在身体保持稳定的范围内移动，不用大幅摆动完成。",
      "回程保持支撑，再开始下一次或换侧。",
    ],
  },
  {
    level: "基础",
    matches: ({ equipment, name }) =>
      /^(leverage machine|smith machine|sled machine|assisted)$/.test(
        equipment,
      ) || /\b(machine|assisted)\b/.test(name),
    reason:
      "器械轨迹或辅助支撑较明确，按基础技术参考；仍需先调整座椅、挡位和握持位置。",
    cues: isolation,
  },
  {
    level: "进阶",
    matches: ({ name }) =>
      /\b(single leg|one leg|bulgarian|split squat|lunge|step ?up|hanging|pull ?up|chin ?up|dip|windmill)\b/.test(
        name,
      ) || /\b(single arm|one arm)\b.*\b(row|press|swing|carry)\b/.test(name),
    reason: "包含单侧控制、悬垂或较明显的重心转换，按进阶技术参考。",
    cues: controlled,
  },
  {
    level: "基础",
    matches: ({ name, category }) =>
      category === "cardio" && !/\b(row|rowing|ski|rope)\b/.test(name),
    reason: "以重复的周期性活动为主，技术组织相对简单；不代表运动强度较低。",
    cues: [
      "先选择能够保持稳定姿态与节奏的方式。",
      "动作保持连贯，逐步调整节奏与持续时间。",
      "按训练安排记录时长，不以出汗多少判断动作质量。",
    ],
  },
  {
    level: "基础",
    matches: ({ name }) =>
      /\b(crunch|sit ?up|dead bug|bird dog|glute bridge|heel toucher|plank|calf raise|air bike|wall push ?up|knee push ?up|incline push ?up)\b/.test(
        name,
      ) || /\b(body ?weight|body weight)\b.*\bsquat\b/.test(name),
    reason:
      "支撑点与动作路线相对明确，按基础技术参考；难易仍会随动作版本改变。",
    cues: [
      "先摆好躯干与支撑点，找到稳定的起始位置。",
      "以能够控制的幅度完成，避免突然甩动。",
      "配合自然呼吸，平稳回位或结束保持。",
    ],
  },
  {
    level: "基础",
    matches: ({ name }) =>
      /\b(curl|raise|fly|shrug|kickback|pushdown|wrist|extension|adduction|abduction|supination|pronation)\b/.test(
        name,
      ),
    reason:
      "以较明确的局部动作路线为主，按基础技术参考；不表示可以直接使用大负重。",
    cues: isolation,
  },
  {
    level: "进阶",
    matches: ({ name }) =>
      /\b(squat|deadlift|row|press|push ?up|good morning|swing|pullover|carry|yoga|pilates)\b/.test(
        name,
      ),
    reason: "需要协调躯干、支撑与多个关节的动作路线，按进阶技术参考。",
    cues: controlled,
  },
];
const assessed = new WeakMap<object, DifficultyInfo>();
const personal: DifficultyInfo = {
  level: "未标注",
  source: "unrated",
  reason: "个人动作没有足够的目录资料，暂不自动分级。",
  cues: controlled,
};

/** Read-only product references, not source-author ratings, fitness scores or saved training fields. */
export function exerciseDifficultyInfo(exercise: Exercise): DifficultyInfo {
  const original = originals.get(exercise.id);
  const extended = openGymEntryFor(exercise.id);
  const entry = extended ?? original;
  if (!entry) return personal;
  const cached = assessed.get(entry);
  if (cached) return cached;
  const movement = {
    name: (extended?.nameEn ?? original?.english ?? exercise.name)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    equipment: (
      extended?.equipmentEn ??
      equipmentNames[exercise.equipment] ??
      exercise.equipment
    ).toLowerCase(),
    category:
      extended?.category ?? (original?.stretch ? "stretching" : "strength"),
  };
  let result: DifficultyInfo;
  if (movement.category === "rehab") {
    result = {
      level: "未标注",
      source: "unrated",
      reason:
        "此条目录属于专项练习，适用条件不能仅靠技术等级表达，暂不自动分级。",
      cues: controlled,
    };
  } else {
    const rule = rules.find((item) => item.matches(movement));
    result = rule
      ? {
          level: rule.level,
          source: "project-reference",
          reason: rule.reason,
          cues: rule.cues,
        }
      : original && ["基础", "进阶", "高阶"].includes(original.level)
        ? {
            level: original.level as ExerciseDifficulty,
            source: "catalogue-reference",
            reason: "沿用原动作目录的参考分级，具体要求请结合完整讲解。",
            cues: controlled,
          }
        : {
            level: "进阶",
            source: "general-reference",
            reason:
              "源目录没有难度字段，且未命中明确动作类型，暂列进阶参考；此项尚未逐条人工审定。",
            cues: controlled,
          };
  }
  assessed.set(entry, result);
  return result;
}

export function exerciseDifficulty(exercise: Exercise): ExerciseDifficulty {
  return exerciseDifficultyInfo(exercise).level;
}
