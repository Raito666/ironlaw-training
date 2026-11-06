#!/usr/bin/env node
// Text-only importer. Its input allowlist never enters catalogue/media or executes upstream code.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PINNED_REVISION = 'b6cfe2bbd3f099523ffbf2677438864e9a09a06f';
const BODY_LABELS = { chest: '胸部', delts: '肩部', biceps: '肱二头肌', forearms: '前臂', abs: '腹部', obliques: '侧腹', quads: '大腿前侧', adductors: '大腿内侧', calves: '小腿', upperback: '上背', reardelts: '肩后侧', triceps: '肱三头肌', lats: '背阔肌', lowerback: '下背', glutes: '臀部', hamstrings: '大腿后侧' };
const TARGETS = { abs: 'abs', pectorals: 'chest', biceps: 'biceps', glutes: 'glutes', delts: 'delts', triceps: 'triceps', 'upper back': 'upperback', lats: 'lats', calves: 'calves', quads: 'quads', forearms: 'forearms', hamstrings: 'hamstrings', spine: 'lowerback', traps: 'upperback', adductors: 'adductors' };
const MUSCLES = { ...TARGETS, shoulders: 'delts', deltoids: 'delts', 'rear deltoids': 'reardelts', chest: 'chest', 'upper chest': 'chest', forearm: 'forearms', 'wrist flexors': 'forearms', 'wrist extensors': 'forearms', 'grip muscles': 'forearms', quadriceps: 'quads', abdominals: 'abs', 'lower abs': 'abs', obliques: 'obliques', 'lower back': 'lowerback', 'lower-back': 'lowerback', 'upper-back': 'upperback', rhomboids: 'upperback', trapezius: 'upperback', 'latissimus dorsi': 'lats', gluteal: 'glutes', hamstring: 'hamstrings', 'inner thighs': 'adductors', soleus: 'calves' };
const TARGET_ZH = { ...Object.fromEntries(Object.entries(TARGETS).map(([key, value]) => [key, BODY_LABELS[value]])), 'serratus anterior': '前锯肌', 'levator scapulae': '肩胛提肌', 'cardiovascular system': '心肺', abductors: '髋外展肌群' };
const EQUIPMENT = { 'body weight': '自重', dumbbell: '哑铃', cable: '绳索', barbell: '杠铃', 'leverage machine': '固定器械', band: '弹力带', 'smith machine': '史密斯机', kettlebell: '壶铃', weighted: '附加负重', 'stability ball': '健身球', 'ez barbell': '曲杆杠铃', assisted: '辅助器械', 'sled machine': '滑橇器械', 'medicine ball': '药球', rope: '绳', roller: '滚轴', 'massage ball': '按摩球', 'resistance band': '阻力带', 'bosu ball': '半球平衡球', 'olympic barbell': '奥林匹克杠铃', 'wheel roller': '健腹轮', 'upper body ergometer': '上肢功率车', 'skierg machine': '滑雪机', hammer: '锤', 'stationary bike': '固定自行车', tire: '轮胎', 'trap bar': '六角杠铃', 'elliptical machine': '椭圆机', 'stepmill machine': '爬楼机', 'suspension trainer': '悬吊训练带', sandbag: '沙袋', landmine: '地雷杆', 'weight plate': '杠铃片', clubbell: '棒铃', macebell: '长柄铃' };
const NO_LOAD = new Set(['body weight', 'band', 'resistance band', 'assisted', 'stability ball', 'bosu ball', 'wheel roller', 'roller', 'massage ball', 'suspension trainer', 'rope', 'upper body ergometer', 'stationary bike', 'elliptical machine', 'skierg machine', 'stepmill machine']);
// These entries explicitly describe a machine supporting the trainee's body. Its stack is not lifted external load.
const ASSISTANCE_REPS = new Set(['0009', '0015', '0017', '0019', '0572', '1431', '1432', '2364']);
const ALLOWED_KEYS = new Set(['id', 'name', 'bodyPart', 'equipment', 'target', 'secondaryMuscles', 'category', 'hold', 'needs', 'description', 'instructions', 'muscleMap', 'femaleVariant', 'maleVariant', 'variantOf', 'textSource']);
const fail = message => { throw new Error(message); };
const text = (v, field, empty = false) => typeof v === 'string' && (empty || v.trim()) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v) ? v : fail(`Invalid text ${field}`);
const strings = (v, field) => Array.isArray(v) && v.length <= 200 ? v.map(x => text(x, field)) : fail(`Invalid list ${field}`);
const unique = values => [...new Set(values)];
const own = (value, key) => Object.hasOwn(value, key);
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

function mapParts(entry) {
  const explicit = entry.muscleMap;
  const primaryNames = explicit?.primaries ?? [entry.target];
  const secondaryNames = explicit?.secondaries ?? entry.secondaryMuscles;
  const mapped = names => unique(names.filter(name => explicit?.weights?.[name] !== 0).map(name => MUSCLES[name]).filter(Boolean));
  const primaryTargets = mapped(primaryNames);
  return { primaryTarget: primaryTargets[0] ?? null, primaryTargets, secondaryTargets: mapped(secondaryNames).filter(id => !primaryTargets.includes(id)) };
}

function validateSourceEntry(entry, filename) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`Invalid entry ${filename}`);
  if (!/^\d{4,5}$/.test(entry.id) || filename !== `${entry.id}.json`) fail(`Entry id mismatch: ${filename}`);
  for (const key of Object.keys(entry)) if (!ALLOWED_KEYS.has(key)) fail(`Unknown source field ${filename}:${key}`);
  if (entry.variantOf) {
    if (!/^\d{4,5}$/.test(entry.variantOf) || Object.keys(entry).some(key => !['id', 'variantOf'].includes(key))) fail(`Invalid variant alias ${entry.id}`);
    return;
  }
  for (const key of ['name', 'bodyPart', 'equipment', 'target', 'category']) text(entry[key], `${entry.id}.${key}`);
  text(entry.description, `${entry.id}.description`, true); strings(entry.instructions, `${entry.id}.instructions`); strings(entry.secondaryMuscles, `${entry.id}.secondaryMuscles`);
  if (!own(EQUIPMENT, entry.equipment) || !own(TARGET_ZH, entry.target)) fail(`Unsupported mapping ${entry.id}`);
  if (entry.hold !== undefined && entry.hold !== true) fail(`Invalid hold ${entry.id}`);
  if (entry.needs) strings(entry.needs, `${entry.id}.needs`);
  if (entry.textSource !== undefined && !['exercisedb', 'opengym'].includes(entry.textSource)) fail(`Invalid textSource ${entry.id}`);
  if (entry.muscleMap) {
    if (typeof entry.muscleMap !== 'object' || Array.isArray(entry.muscleMap) || Object.keys(entry.muscleMap).some(key => !['bodyPart', 'primaries', 'secondaries', 'weights'].includes(key))) fail(`Invalid muscleMap ${entry.id}`);
    for (const key of ['primaries', 'secondaries']) if (entry.muscleMap[key] !== undefined) strings(entry.muscleMap[key], `${entry.id}.muscleMap.${key}`);
    for (const weight of Object.values(entry.muscleMap.weights ?? {})) if (typeof weight !== 'number' || weight < 0 || weight > 1) fail(`Invalid muscle weight ${entry.id}`);
  }
}

export function buildCatalogue(source, revision = PINNED_REVISION) {
  if (!/^[a-f0-9]{40}$/.test(revision)) fail('Invalid pinned revision: expected a full commit hash');
  const names = fs.readdirSync(path.join(source, 'exercises')).filter(file => file.endsWith('.json')).sort();
  if (!names.length) fail('No exercise JSON found');
  const digest = createHash('sha256');
  const all = names.map(filename => {
    const contents = fs.readFileSync(path.join(source, 'exercises', filename), 'utf8'); digest.update(filename + '\n' + contents + '\n');
    const entry = JSON.parse(contents.replace(/^\uFEFF/, '')); validateSourceEntry(entry, filename); return entry;
  });
  const byId = new Map(all.map(entry => [entry.id, entry]));
  if (byId.size !== all.length) fail('Duplicate catalogue id');
  const zhFile = path.join(source, 'i18n', 'zh.json'); const zh = json(zhFile);
  digest.update('i18n/zh.json\n' + fs.readFileSync(zhFile, 'utf8'));
  for (const [id, translation] of Object.entries(zh)) {
    if (!byId.has(id) || byId.get(id).variantOf) fail(`Translation references noncanonical id ${id}`);
    if (!translation || typeof translation !== 'object' || Object.keys(translation).some(key => !['name', 'description', 'instructions'].includes(key))) fail(`Invalid translation ${id}`);
    for (const key of ['name', 'description']) if (translation[key] !== undefined) text(translation[key], `${id}.zh.${key}`, true);
    if (translation.instructions !== undefined) strings(translation.instructions, `${id}.zh.instructions`);
  }
  const aliases = Object.fromEntries(all.filter(entry => entry.variantOf).map(entry => {
    const target = byId.get(entry.variantOf);
    if (!target || target.variantOf) fail(`Dangling or chained variant alias ${entry.id}`);
    return [entry.id, entry.variantOf];
  }));
  const entries = all.filter(entry => !entry.variantOf).map(entry => {
    for (const key of ['femaleVariant', 'maleVariant']) if (entry[key] && !byId.has(entry[key])) fail(`Dangling variant ${entry.id}.${key}`);
    const translated = zh[entry.id] ?? {};
    const kind = entry.hold || entry.bodyPart === 'cardio' || entry.category === 'cardio' ? 'duration' : NO_LOAD.has(entry.equipment) || ASSISTANCE_REPS.has(entry.id) ? 'reps' : 'weight-reps';
    return {
      id: `og:${entry.id}`, canonicalId: entry.id, nameZh: translated.name ?? '', nameEn: entry.name,
      descriptionZh: translated.description ?? '', descriptionEn: entry.description,
      instructionsZh: translated.instructions ?? [], instructionsEn: entry.instructions,
      category: entry.category, bodyPart: entry.bodyPart, equipment: EQUIPMENT[entry.equipment], equipmentEn: entry.equipment, kind,
      targetEn: entry.target, targetZh: TARGET_ZH[entry.target], ...mapParts(entry), secondaryMusclesEn: entry.secondaryMuscles,
      hold: !!entry.hold, needs: entry.needs ?? [], variants: { femaleId: entry.femaleVariant ?? null, maleId: entry.maleVariant ?? null },
      sourceMuscleMap: entry.muscleMap ?? null,
      provenance: { textSource: entry.textSource === 'exercisedb' ? 'exercisedb' : 'opengym', originalTextLicense: entry.textSource === 'exercisedb' ? 'MIT' : 'AGPL-3.0-or-later', additionalTextLicense: 'AGPL-3.0-or-later' },
    };
  });
  return {
    formatVersion: 1,
    source: { project: 'openGym', revision, noticePath: '/exercise-catalogue/opengym-NOTICE.md', contentSha256: digest.digest('hex') },
    counts: { sourceRecords: all.length, canonicalEntries: entries.length, variantAliases: Object.keys(aliases).length, translatedNames: entries.filter(entry => entry.nameZh).length, translatedInstructions: entries.filter(entry => entry.instructionsZh.length).length },
    entries, aliases,
  };
}

export function main() {
  const args = process.argv.slice(2); const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--check', '--dry-run'].includes(arg)) options[arg] = true;
    else if (['--source', '--out', '--revision'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) options[arg] = args[++i];
    else fail(`Unknown or incomplete argument ${arg}`);
  }
  if (!options['--source']) fail('Usage: node import-catalogue.mjs --source <catalogue directory> [--out directory] [--check|--dry-run]');
  if (options['--check'] && options['--dry-run']) fail('Choose --check or --dry-run');
  const source = path.resolve(options['--source']);
  const out = path.resolve(options['--out'] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/exercise-catalogue'));
  const catalogue = buildCatalogue(source, options['--revision'] ?? PINNED_REVISION);
  const notice = '# openGym exercise text catalogue\n\nSource: DuarteSantos8/openGym, revision ' + catalogue.source.revision + '.\n\nThis document covers the text catalogue. Companion user-supplied local media retain their separate Gym visual notice at /exercise-opengym-media/v1/NOTICE.md; no AGPL media relicensing or external redistribution rights are asserted. Original ExerciseDB-derived names/muscles/instructions marked exercisedb retain the MIT notice below; openGym additions, all descriptions, translations and catalogue corrections are AGPL-3.0-or-later.\n\nThe upstream notice is preserved below, including its separate media restrictions.\n\n---\n\n' + fs.readFileSync(path.join(source, '../NOTICE.md'), 'utf8');
  const outputs = { 'opengym.json': JSON.stringify(catalogue) + '\n', 'opengym-NOTICE.md': notice, 'opengym-LICENSE-AGPL-3.0.txt': fs.readFileSync(path.join(source, '../LICENSE'), 'utf8') };
  if (options['--check']) {
    for (const [name, contents] of Object.entries(outputs)) if (!fs.existsSync(path.join(out, name)) || fs.readFileSync(path.join(out, name), 'utf8') !== contents) fail(`Output missing or stale: ${name}`);
  } else if (!options['--dry-run']) {
    fs.mkdirSync(out, { recursive: true });
    for (const [name, contents] of Object.entries(outputs)) {
      const target = path.join(out, name); const temporary = target + '.tmp';
      fs.writeFileSync(temporary, contents); fs.renameSync(temporary, target);
    }
  }
  console.log(JSON.stringify({ ...catalogue.counts, contentSha256: catalogue.source.contentSha256, mode: options['--dry-run'] ? 'dry-run' : options['--check'] ? 'check' : 'write' }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
