import type { AppData, BodyMetric, Exercise, WorkoutTemplate } from '../domain/types';
import { validateAppData } from '../data/backup';
import { uid } from '../domain/training';

export interface SharedTemplate {
  format: 'ironlaw-template';
  version: 1;
  template: WorkoutTemplate;
  exercises: Exercise[];
}
export function exportTemplate(template: WorkoutTemplate, exercises: Exercise[]): string {
  const used = new Set(template.items.map((item) => item.exerciseId));
  return JSON.stringify(
    {
      format: 'ironlaw-template',
      version: 1,
      template,
      exercises: exercises.filter((exercise) => used.has(exercise.id)),
    },
    null,
    2,
  );
}
export function parseTemplate(text: string, data: AppData): SharedTemplate {
  if (new TextEncoder().encode(text).length > 1024 * 1024) throw new Error('模板文件不能超过1 MB');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('模板不是有效的 JSON 文件');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('模板格式无效');
  const file = value as Record<string, unknown>;
  if (
    Object.keys(file).sort().join(',') !== 'exercises,format,template,version' ||
    file.format !== 'ironlaw-template' ||
    file.version !== 1
  )
    throw new Error('请选择铁律导出的训练模板文件，完整备份请在“我”中导入');
  const validated = validateAppData({
    ...data,
    exercises: file.exercises,
    templates: [file.template],
    sessions: [],
    bodyMetrics: [],
    settings: { ...data.settings, favoriteExerciseIds: [] },
  });
  const template = validated.templates[0];
  if (!template.items.length || template.items.length > 30 || template.items.some((item) => item.sets > 30))
    throw new Error('模板最多30个动作，每个动作最多30组');
  const used = new Set(template.items.map((item) => item.exerciseId));
  if (validated.exercises.some((exercise) => !used.has(exercise.id))) throw new Error('模板含有未使用的动作');
  return { format: 'ironlaw-template', version: 1, template, exercises: validated.exercises };
}
const sameExercise = (a: Exercise, b: Exercise) =>
  ['id', 'name', 'muscle', 'equipment', 'kind', 'description'].every(
    (key) => a[key as keyof Exercise] === b[key as keyof Exercise],
  );
export function importTemplate(data: AppData, shared: SharedTemplate, makeId = uid): AppData {
  const exercises = [...data.exercises];
  const mapped = new Map<string, string>();
  for (const exercise of shared.exercises) {
    const existing = exercises.find((item) => item.id === exercise.id);
    const id = existing && !sameExercise(existing, exercise) ? makeId() : exercise.id;
    mapped.set(exercise.id, id);
    if (!existing || id !== existing.id) exercises.push({ ...exercise, id });
  }
  const template: WorkoutTemplate = {
    ...shared.template,
    id: makeId(),
    archived: false,
    updatedAt: new Date().toISOString(),
    items: shared.template.items.map((item) => ({
      ...item,
      id: makeId(),
      exerciseId: mapped.get(item.exerciseId)!,
    })),
  };
  const next = { ...data, exercises, templates: [...data.templates, template] };
  validateAppData(next);
  return next;
}
const escapeHtml = (text: string | number) =>
  String(text).replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
export function printableTemplate(template: WorkoutTemplate, exercises: Exercise[]): string {
  const rows = template.items
    .map((item, index) => {
      const exercise = exercises.find((candidate) => candidate.id === item.exerciseId);
      return `<tr><td>${index + 1}</td><td>${escapeHtml(exercise?.name ?? '动作已移除')}<small>${escapeHtml(exercise?.equipment ?? '')}</small></td><td>${item.sets}</td><td>${escapeHtml(exercise?.kind === 'duration' ? `${item.durationSeconds} 秒` : `${item.reps} 次`)}</td><td>${exercise?.kind === 'weight-reps' ? `${item.weightKg} kg` : '—'}</td><td>□ □ □ □ □</td></tr>`;
    })
    .join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(template.name)} · 铁律训练模板</title><style>body{font:16px/1.75 system-ui,sans-serif;color:#172019;background:#fff;max-width:960px;margin:32px auto;padding:16px}h1{font-size:26px}p{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{padding:12px 8px;border-bottom:1px solid #999;text-align:left;overflow-wrap:anywhere}small{display:block;color:#555}footer{margin-top:32px}@media print{body{margin:0;padding:0}tr{break-inside:avoid}}@media(max-width:480px){body{font-size:13px}td,th{padding:8px 4px}}</style><h1>${escapeHtml(template.name)}</h1><p>${escapeHtml(template.description)}</p><p>组间休息 ${template.restSeconds} 秒 · 日期 __________</p><table><thead><tr><th>序</th><th>动作</th><th>组数</th><th>目标</th><th>总负重</th><th>记录</th></tr></thead><tbody>${rows}</tbody></table><footer>铁律 · 目标不代表实际完成。双哑铃按两只合计的总外部负重记录。<br>在浏览器中选择“打印”即可打印或保存为 PDF。此文件不含训练历史和身体数据。</footer></html>`;
}
function csvCell(value: string | number | undefined): string {
  let text = value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function bodyMetricsCsv(records: BodyMetric[]): string {
  const rows = [...records]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((record) =>
      [
        record.date,
        record.weightKg,
        record.bodyFatPct,
        ...(['chest', 'waist', 'hip', 'arm', 'thigh'] as const).map((key) => record.measurements?.[key]),
        record.note,
      ]
        .map(csvCell)
        .join(','),
    );
  return (
    '\uFEFF日期,体重(kg),体脂率(%),胸围(cm),腰围(cm),臀围(cm),臂围(cm),腿围(cm),备注\r\n' +
    rows.join('\r\n') +
    '\r\n'
  );
}
