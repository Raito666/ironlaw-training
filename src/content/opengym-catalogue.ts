import type { AppData, Exercise, ExerciseKind } from '../domain/types';
import { validateAppData } from '../data/backup';

export type OpenGymBodyId =
  | 'chest'
  | 'delts'
  | 'biceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'quads'
  | 'adductors'
  | 'calves'
  | 'upperback'
  | 'reardelts'
  | 'triceps'
  | 'lats'
  | 'lowerback'
  | 'glutes'
  | 'hamstrings';
export interface OpenGymEntry {
  id: string;
  canonicalId: string;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  instructionsZh: string[];
  instructionsEn: string[];
  category: string;
  bodyPart: string;
  equipment: string;
  equipmentEn: string;
  kind: ExerciseKind;
  targetEn: string;
  targetZh: string;
  primaryTarget: OpenGymBodyId | null;
  primaryTargets: OpenGymBodyId[];
  secondaryTargets: OpenGymBodyId[];
  secondaryMusclesEn: string[];
  hold: boolean;
  needs: string[];
  variants: { femaleId: string | null; maleId: string | null };
  sourceMuscleMap: {
    bodyPart?: string;
    primaries?: string[];
    secondaries?: string[];
    weights?: Record<string, number>;
  } | null;
  provenance: {
    textSource: 'exercisedb' | 'opengym';
    originalTextLicense: 'MIT' | 'AGPL-3.0-or-later';
    additionalTextLicense: 'AGPL-3.0-or-later';
  };
}
export interface OpenGymCatalogue {
  formatVersion: 1;
  source: { project: 'openGym'; revision: string; noticePath: string; contentSha256: string };
  counts: {
    sourceRecords: number;
    canonicalEntries: number;
    variantAliases: number;
    translatedNames: number;
    translatedInstructions: number;
  };
  entries: OpenGymEntry[];
  aliases: Record<string, string>;
}
export const OPENGYM_CATALOGUE_URL = '/exercise-catalogue/opengym.json';
export const OPENGYM_TEXT_CACHE = 'ironlaw-opengym-text-v1';

const BODY_LABELS: Record<OpenGymBodyId, string> = {
  chest: '胸部',
  delts: '肩部',
  biceps: '肱二头肌',
  forearms: '前臂',
  abs: '腹部',
  obliques: '侧腹',
  quads: '大腿前侧',
  adductors: '大腿内侧',
  calves: '小腿',
  upperback: '上背',
  reardelts: '肩后侧',
  triceps: '肱三头肌',
  lats: '背阔肌',
  lowerback: '下背',
  glutes: '臀部',
  hamstrings: '大腿后侧',
};
const ENTRY_KEYS = [
  'id',
  'canonicalId',
  'nameZh',
  'nameEn',
  'descriptionZh',
  'descriptionEn',
  'instructionsZh',
  'instructionsEn',
  'category',
  'bodyPart',
  'equipment',
  'equipmentEn',
  'kind',
  'targetEn',
  'targetZh',
  'primaryTarget',
  'primaryTargets',
  'secondaryTargets',
  'secondaryMusclesEn',
  'hold',
  'needs',
  'variants',
  'sourceMuscleMap',
  'provenance',
];
const MAX_TEXT_LENGTH = 24 * 1024 * 1024;
type RecordValue = Record<string, unknown>;
function invalid(field: string): never {
  throw new Error(`动作文字目录格式无效：${field}`);
}
function object(value: unknown, field: string, keys?: string[], optional: string[] = []): RecordValue {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid(field);
  const result = value as RecordValue;
  if (keys) {
    if (Object.keys(result).some((key) => !keys.includes(key) && !optional.includes(key)))
      invalid(`${field}.未知字段`);
    if (keys.some((key) => !Object.hasOwn(result, key))) invalid(`${field}.缺少字段`);
  }
  return result;
}
function text(value: unknown, field: string, max = 5000, nonempty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (nonempty && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    invalid(field);
  return value;
}
function strings(value: unknown, field: string, max = 200): string[] {
  if (!Array.isArray(value) || value.length > max) invalid(field);
  return value.map((item) => text(item, field, 5000, true));
}
function sourceId(value: unknown, field: string): string {
  const id = text(value, field, 5, true);
  if (!/^\d{4,5}$/.test(id)) invalid(field);
  return id;
}
function bodyIds(value: unknown, field: string): string[] {
  const list = strings(value, field, 16);
  if (new Set(list).size !== list.length || list.some((id) => !Object.hasOwn(BODY_LABELS, id)))
    invalid(field);
  return list;
}

/** Validate the independent content document without adding anything to saved AppData. */
export function validateOpenGymCatalogue(value: unknown): OpenGymCatalogue {
  const catalogue = object(value, 'root', ['formatVersion', 'source', 'counts', 'entries', 'aliases']);
  if (catalogue.formatVersion !== 1) invalid('formatVersion');
  const source = object(catalogue.source, 'source', ['project', 'revision', 'noticePath', 'contentSha256']);
  if (
    source.project !== 'openGym' ||
    !/^[a-f0-9]{40}$/.test(text(source.revision, 'revision', 40)) ||
    !/^[a-f0-9]{64}$/.test(text(source.contentSha256, 'contentSha256', 64)) ||
    source.noticePath !== '/exercise-catalogue/opengym-NOTICE.md'
  )
    invalid('source');
  const counts = object(catalogue.counts, 'counts', [
    'sourceRecords',
    'canonicalEntries',
    'variantAliases',
    'translatedNames',
    'translatedInstructions',
  ]);
  for (const [key, count] of Object.entries(counts))
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > 20000)
      invalid(`counts.${key}`);
  if (!Array.isArray(catalogue.entries) || !catalogue.entries.length || catalogue.entries.length > 10000)
    invalid('entries');
  const ids = new Set<string>();
  let translatedNames = 0;
  let translatedInstructions = 0;
  for (const value of catalogue.entries) {
    const entry = object(value, 'entry', ENTRY_KEYS);
    const id = sourceId(entry.canonicalId, 'canonicalId');
    if (entry.id !== `og:${id}` || ids.has(id)) invalid(`id:${id}`);
    ids.add(id);
    for (const key of ['nameZh', 'nameEn']) text(entry[key], key, 120, key === 'nameEn');
    for (const key of ['descriptionZh', 'descriptionEn']) text(entry[key], key);
    for (const key of ['category', 'bodyPart', 'equipment', 'equipmentEn', 'targetEn', 'targetZh'])
      text(entry[key], key, 80, true);
    if (!['weight-reps', 'reps', 'duration'].includes(String(entry.kind)) || typeof entry.hold !== 'boolean')
      invalid(`recording:${id}`);
    if (entry.hold && entry.kind !== 'duration') invalid(`hold:${id}`);
    if ((entry.bodyPart === 'cardio' || entry.category === 'cardio') && entry.kind !== 'duration')
      invalid(`cardio:${id}`);
    const zhInstructions = strings(entry.instructionsZh, 'instructionsZh');
    strings(entry.instructionsEn, 'instructionsEn');
    strings(entry.secondaryMusclesEn, 'secondaryMusclesEn', 80);
    strings(entry.needs, 'needs', 20);
    if (entry.nameZh) translatedNames++;
    if (zhInstructions.length) translatedInstructions++;
    const primary = bodyIds(entry.primaryTargets, 'primaryTargets');
    const secondary = bodyIds(entry.secondaryTargets, 'secondaryTargets');
    if (entry.primaryTarget !== (primary[0] ?? null) || secondary.some((id) => primary.includes(id)))
      invalid(`muscles:${id}`);
    const variants = object(entry.variants, 'variants', ['femaleId', 'maleId']);
    for (const key of ['femaleId', 'maleId']) if (variants[key] !== null) sourceId(variants[key], key);
    const provenance = object(entry.provenance, 'provenance', [
      'textSource',
      'originalTextLicense',
      'additionalTextLicense',
    ]);
    if (
      !['exercisedb', 'opengym'].includes(String(provenance.textSource)) ||
      provenance.originalTextLicense !==
        (provenance.textSource === 'exercisedb' ? 'MIT' : 'AGPL-3.0-or-later') ||
      provenance.additionalTextLicense !== 'AGPL-3.0-or-later'
    )
      invalid(`provenance:${id}`);
    if (entry.sourceMuscleMap !== null) {
      const map = object(
        entry.sourceMuscleMap,
        'sourceMuscleMap',
        [],
        ['bodyPart', 'primaries', 'secondaries', 'weights'],
      );
      if (map.bodyPart !== undefined) text(map.bodyPart, 'muscleMap.bodyPart', 80, true);
      for (const key of ['primaries', 'secondaries']) if (map[key] !== undefined) strings(map[key], key, 80);
      if (map.weights !== undefined)
        for (const [name, weight] of Object.entries(object(map.weights, 'weights'))) {
          text(name, 'weightName', 80, true);
          if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 1)
            invalid('weight');
        }
    }
  }
  const aliases = object(catalogue.aliases, 'aliases');
  for (const [alias, target] of Object.entries(aliases)) {
    sourceId(alias, 'alias');
    const canonical = sourceId(target, 'aliasTarget');
    if (ids.has(alias) || !ids.has(canonical)) invalid(`variant alias:${alias}`);
  }
  for (const value of catalogue.entries) {
    const entry = value as OpenGymEntry;
    for (const target of [entry.variants.femaleId, entry.variants.maleId])
      if (target !== null && !ids.has(target) && !Object.hasOwn(aliases, target))
        invalid(`variant:${entry.id}`);
  }
  if (
    counts.canonicalEntries !== ids.size ||
    counts.variantAliases !== Object.keys(aliases).length ||
    counts.sourceRecords !== ids.size + Object.keys(aliases).length ||
    counts.translatedNames !== translatedNames ||
    counts.translatedInstructions !== translatedInstructions
  )
    invalid('counts');
  return value as OpenGymCatalogue;
}

let loaded: OpenGymCatalogue | undefined;
let pending: Promise<OpenGymCatalogue> | undefined;
const entriesById = new Map<string, OpenGymEntry>();

function parseText(contents: string): OpenGymCatalogue {
  if (contents.length > MAX_TEXT_LENGTH) invalid('目录文件过大');
  return validateOpenGymCatalogue(JSON.parse(contents));
}
async function readCatalogue(): Promise<OpenGymCatalogue> {
  let problem: unknown;
  try {
    const response = await fetch(OPENGYM_CATALOGUE_URL, { cache: 'no-cache', credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contents = await response.text();
    const catalogue = parseText(contents);
    if (typeof caches !== 'undefined') {
      try {
        await (
          await caches.open(OPENGYM_TEXT_CACHE)
        ).put(
          OPENGYM_CATALOGUE_URL,
          new Response(contents, { headers: { 'Content-Type': 'application/json' } }),
        );
      } catch {
        /* Reading remains usable if storage is full or disabled. */
      }
    }
    return catalogue;
  } catch (error) {
    problem = error;
  }
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(OPENGYM_TEXT_CACHE);
      const cached = await cache.match(OPENGYM_CATALOGUE_URL);
      if (cached) {
        try {
          return parseText(await cached.text());
        } catch (error) {
          problem = error;
          await cache.delete(OPENGYM_CATALOGUE_URL);
        }
      }
    } catch {
      /* An unavailable cache must not hide the actionable load error. */
    }
  }
  throw new Error(
    `动作文字目录暂时无法读取，请重试。${problem instanceof Error ? `（${problem.message}）` : ''}`,
  );
}

/** One lazy, coalesced local request. Failed attempts are retryable; no catalogue is saved as user data. */
export function loadOpenGymCatalogue(): Promise<OpenGymCatalogue> {
  if (loaded) return Promise.resolve(loaded);
  if (!pending)
    pending = readCatalogue()
      .then((catalogue) => {
        loaded = catalogue;
        for (const entry of catalogue.entries) entriesById.set(entry.canonicalId, entry);
        return catalogue;
      })
      .finally(() => {
        pending = undefined;
      });
  return pending;
}

/** For resolving a newly selected catalogue item only. Never pass saved records through this helper. */
export function canonicalOpenGymId(id: string): string {
  const prefixed = isOpenGymExercise(id);
  const raw = prefixed ? id.slice(3) : id;
  const canonical = loaded && Object.hasOwn(loaded.aliases, raw) ? loaded.aliases[raw] : raw;
  return prefixed ? `og:${canonical}` : canonical;
}
export function isOpenGymExercise(id: string): boolean {
  return /^og:\d{4,5}$/.test(id);
}
export function openGymEntryFor(id: string): OpenGymEntry | undefined {
  // Raw numeric ids can belong to old/custom records. Only this integration's namespace opts in.
  if (!isOpenGymExercise(id)) return undefined;
  const canonical = canonicalOpenGymId(id);
  return entriesById.get(canonical.slice(3));
}
export function materializeOpenGym(entry: OpenGymEntry): Exercise {
  return {
    id: entry.id,
    name: entry.nameZh || entry.nameEn,
    muscle: entry.primaryTarget ? BODY_LABELS[entry.primaryTarget] : entry.targetZh,
    equipment: entry.equipment,
    kind: entry.kind,
    description: entry.descriptionZh || entry.descriptionEn,
  };
}

/** Pure transaction helper: preserve saved definitions and snapshots; append selected missing ids only. */
export function ensureExercises(data: AppData, selected: Exercise[]): AppData {
  const ids = new Set(data.exercises.map((exercise) => exercise.id));
  const additions: Exercise[] = [];
  for (const exercise of selected)
    if (!ids.has(exercise.id)) {
      ids.add(exercise.id);
      additions.push(exercise);
    }
  if (!additions.length) return data;
  if (ids.size > 5000)
    throw new Error('已保存动作最多5000个，请先整理个人动作库；浏览文字目录不占用此数量。');
  const next = { ...data, exercises: [...data.exercises, ...additions] };
  validateAppData(next);
  return next;
}
