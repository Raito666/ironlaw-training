import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const generator = resolve('scripts/import-opengym-catalogue.mjs');
const manifest = resolve('public/exercise-catalogue/opengym.json');
const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ironlaw-catalogue-'));
  temporary.push(root);
  const source = join(root, 'catalogue');
  const output = join(root, 'output');
  mkdirSync(join(source, 'exercises'), { recursive: true });
  mkdirSync(join(source, 'i18n'));
  writeFileSync(join(root, 'NOTICE.md'), 'Exercise text: MIT and AGPL. Exercise media are excluded.');
  writeFileSync(join(root, 'LICENSE'), 'GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3');
  const entry = {
    id: '0025',
    name: 'barbell bench press',
    bodyPart: 'chest',
    equipment: 'barbell',
    target: 'pectorals',
    secondaryMuscles: ['triceps', 'shoulders'],
    category: 'strength',
    description: 'A bench press.',
    instructions: ['Lie down.', 'Press up.'],
    textSource: 'exercisedb',
    femaleVariant: '2440',
  };
  writeFileSync(join(source, 'exercises/0025.json'), JSON.stringify(entry));
  writeFileSync(join(source, 'exercises/2440.json'), JSON.stringify({ id: '2440', variantOf: '0025' }));
  writeFileSync(
    join(source, 'i18n/zh.json'),
    JSON.stringify({ '0025': { name: '杠铃卧推', instructions: ['躺稳。', '推起。'] } }),
  );
  return { root, source, output, entry };
}
function run(source: string, output: string, ...args: string[]) {
  return spawnSync(process.execPath, [generator, '--source', source, '--out', output, ...args], {
    encoding: 'utf8',
  });
}

describe('deterministic text-only openGym catalogue generation', () => {
  it('ships a dedicated generator and audited text manifest', () => {
    expect(existsSync(generator)).toBe(true);
    expect(existsSync(manifest)).toBe(true);
    expect(existsSync(resolve('src/content/opengym-catalogue.ts'))).toBe(true);
  });
  it('preserves all 6554 source identities while listing canonical entries once', () => {
    const value = JSON.parse(readFileSync(manifest, 'utf8'));
    expect(value.counts).toEqual({
      sourceRecords: 6554,
      canonicalEntries: 5632,
      variantAliases: 922,
      translatedNames: 5632,
      translatedInstructions: 1324,
    });
    expect(value.entries).toHaveLength(5632);
    expect(Object.keys(value.aliases)).toHaveLength(922);
    expect(value.entries.find((e: { canonicalId: string }) => e.canonicalId === '0025')).toMatchObject({
      nameZh: '杠铃卧推',
      kind: 'weight-reps',
      primaryTarget: 'chest',
    });
    expect(JSON.stringify(value)).not.toMatch(/https?:|exercise-media|\.webp|\.mp4|\/still\/|\/clip\//i);
  });
  it('does not touch even an unreadable media location, and emits deterministic text', () => {
    const f = fixture();
    writeFileSync(join(f.source, 'media'), 'not a directory: never inspect this path');
    expect(run(f.source, f.output).status).toBe(0);
    const first = readFileSync(join(f.output, 'opengym.json'), 'utf8');
    expect(run(f.source, f.output, '--check').status).toBe(0);
    expect(run(f.source, f.output).status).toBe(0);
    expect(readFileSync(join(f.output, 'opengym.json'), 'utf8')).toBe(first);
    const data = JSON.parse(first);
    expect(data.aliases).toEqual({ '2440': '0025' });
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].provenance).toMatchObject({
      originalTextLicense: 'MIT',
      additionalTextLicense: 'AGPL-3.0-or-later',
    });
  });
  it('rejects dangling/chain aliases and id mismatches instead of guessing', () => {
    const f = fixture();
    writeFileSync(join(f.source, 'exercises/2440.json'), JSON.stringify({ id: '2440', variantOf: '9999' }));
    const result = run(f.source, f.output);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/variant|alias/i);
    expect(existsSync(f.output)).toBe(false);
    writeFileSync(join(f.source, 'exercises/2440.json'), JSON.stringify({ id: '2440', variantOf: '2441' }));
    writeFileSync(join(f.source, 'exercises/2441.json'), JSON.stringify({ id: '2441', variantOf: '0025' }));
    expect(run(f.source, f.output).stderr).toMatch(/chained variant alias/i);
    writeFileSync(join(f.source, 'exercises/2440.json'), JSON.stringify({ id: 'wrong', variantOf: '0025' }));
    expect(run(f.source, f.output).stderr).toMatch(/id/i);
  });
  it('rejects invalid revisions, control characters and unknown anatomical metadata before writing', () => {
    const f = fixture();
    expect(run(f.source, f.output, '--revision', 'bad').status).not.toBe(0);
    writeFileSync(
      join(f.source, 'exercises/0025.json'),
      JSON.stringify({ ...f.entry, instructions: ['bad\u0000step'] }),
    );
    expect(run(f.source, f.output).status).not.toBe(0);
    writeFileSync(
      join(f.source, 'exercises/0025.json'),
      JSON.stringify({ ...f.entry, muscleMap: { invented: 'chest' } }),
    );
    expect(run(f.source, f.output).status).not.toBe(0);
    expect(existsSync(f.output)).toBe(false);
  });
  it('keeps dry-run free of output writes and check fails on missing output', () => {
    const f = fixture();
    expect(run(f.source, f.output, '--dry-run').status).toBe(0);
    expect(existsSync(f.output)).toBe(false);
    expect(run(f.source, f.output, '--check').status).not.toBe(0);
    expect(existsSync(f.output)).toBe(false);
  });
});
