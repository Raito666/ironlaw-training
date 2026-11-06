import { describe, expect, it } from 'vitest';
import { createInitialData } from '../../src/domain/seed';
import {
  bodyMetricsCsv,
  exportTemplate,
  parseTemplate,
  importTemplate,
  printableTemplate,
} from '../../src/features/portable-content';
import { validateAppData } from '../../src/data/backup';

describe('portable user content', () => {
  it('exports only a template and its referenced exercises, without history or personal measurements', () => {
    const data = createInitialData();
    const file = JSON.parse(exportTemplate(data.templates[0], data.exercises));
    expect(Object.keys(file).sort()).toEqual(['exercises', 'format', 'template', 'version']);
    expect(file.exercises).toHaveLength(new Set(data.templates[0].items.map((item) => item.exerciseId)).size);
    expect(parseTemplate(JSON.stringify(file), data).template).toEqual(data.templates[0]);
  });
  it('imports with new template/item identifiers and preserves all original data', () => {
    const data = createInitialData();
    const before = structuredClone(data);
    let n = 0;
    const incoming = parseTemplate(exportTemplate(data.templates[0], data.exercises), data);
    const next = importTemplate(data, incoming, () => `shared-${++n}`);
    expect(next.templates).toHaveLength(data.templates.length + 1);
    expect(next.templates.at(-1)?.id).not.toBe(data.templates[0].id);
    expect(next.templates.at(-1)?.items[0].id).not.toBe(data.templates[0].items[0].id);
    expect(next.sessions).toBe(data.sessions);
    expect(next.bodyMetrics).toBe(data.bodyMetrics);
    expect(data).toEqual(before);
    expect(validateAppData(next)).toEqual(next);
  });
  it('remaps a colliding exercise instead of overwriting a snapshot or existing exercise', () => {
    const data = createInitialData();
    const incoming = parseTemplate(exportTemplate(data.templates[0], data.exercises), data);
    incoming.exercises[0].name = '同 ID 的另一动作';
    let n = 0;
    const next = importTemplate(data, incoming, () => `shared-${++n}`);
    expect(next.exercises[0]).toEqual(data.exercises[0]);
    expect(next.exercises.find((exercise) => exercise.name === '同 ID 的另一动作')?.id).not.toBe(
      incoming.exercises[0].id,
    );
    expect(validateAppData(next)).toEqual(next);
  });
  it('rejects malformed, oversized, unknown-field, unsafe and broken-reference imports', () => {
    const data = createInitialData();
    const file = JSON.parse(exportTemplate(data.templates[0], data.exercises));
    expect(() => parseTemplate('{', data)).toThrow();
    expect(() => parseTemplate('中'.repeat(400000), data)).toThrow();
    expect(() => parseTemplate(JSON.stringify({ ...file, sessions: [] }), data)).toThrow();
    expect(() => parseTemplate(JSON.stringify({ ...file, format: 'other' }), data)).toThrow();
    file.template.items[0].exerciseId = 'missing';
    expect(() => parseTemplate(JSON.stringify(file), data)).toThrow();
  });
  it('escapes every user field in a standalone offline printable document', () => {
    const data = createInitialData();
    const template = {
      ...data.templates[0],
      name: '<img src=x onerror=alert(1)>',
      description: '<script>bad()</script>',
    };
    const html = printableTemplate(template, data.exercises);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('https://');
    expect(html).toContain('@media print');
    expect(html).toContain('kg');
  });
  it('exports chronological body CSV with explicit units, quotes and formula protection', () => {
    const csv = bodyMetricsCsv([
      { id: 'b2', date: '2026-11-02', weightKg: 72, measurements: { waist: 80 }, note: '=HYPERLINK("x")' },
      { id: 'b1', date: '2026-11-01', bodyFatPct: 18.5, note: '第一行\n第二行,"备注"' },
    ]);
    expect(csv.startsWith('\uFEFF日期,体重(kg),体脂率(%)')).toBe(true);
    expect(csv.indexOf('2026-11-01')).toBeLessThan(csv.indexOf('2026-11-02'));
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('第一行\n第二行,""备注""');
    expect(csv).toContain('72');
  });
});
