import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const generator = resolve('scripts/import-opengym-media.mjs');
const temporary: string[] = [];
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function box(type: string, data: Buffer) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length + 8);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, data]);
}

// Synthetic metadata fixtures: no source images or video frames are decoded by these tests.
function webp(width: number, height: number) {
  const data = Buffer.alloc(5);
  data[0] = 0x2f;
  data.writeUInt32LE((width - 1) | ((height - 1) << 14), 1);
  const chunk = Buffer.concat([Buffer.from('VP8L'), Buffer.from([5, 0, 0, 0]), data, Buffer.alloc(1)]);
  const header = Buffer.alloc(12);
  header.write('RIFF');
  header.writeUInt32LE(chunk.length + 4, 4);
  header.write('WEBP', 8);
  return Buffer.concat([header, chunk]);
}

function mp4(width: number, height: number) {
  const movie = Buffer.alloc(100);
  movie.writeUInt32BE(1000, 12);
  movie.writeUInt32BE(2750, 16);
  const track = Buffer.alloc(84);
  track.writeUInt32BE(width * 65536, 76);
  track.writeUInt32BE(height * 65536, 80);
  const handler = Buffer.alloc(12);
  handler.write('vide', 8);
  return Buffer.concat([
    box('ftyp', Buffer.from('isom0000')),
    box('moov', Buffer.concat([
      box('mvhd', movie),
      box('trak', Buffer.concat([box('tkhd', track), box('mdia', box('hdlr', handler))])),
    ])),
    box('mdat', Buffer.from('fixture payload remains byte identical')),
  ]);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ironlaw-media-'));
  temporary.push(root);
  const source = join(root, 'catalogue');
  const output = join(root, 'output');
  for (const directory of ['exercises', 'media/still', 'media/clip']) {
    mkdirSync(join(source, directory), { recursive: true });
  }
  writeFileSync(join(root, 'NOTICE.md'), 'Exercise media have a separate limited license, not AGPL.\n');
  const still = webp(180, 160);
  const clip = mp4(180, 160);
  for (const id of ['0025', '2440']) {
    writeFileSync(join(source, 'exercises', `${id}.json`), JSON.stringify(
      id === '2440' ? { id, variantOf: '0025' } : { id, name: 'Example' },
    ));
    writeFileSync(join(source, 'media/still', `${id}.webp`), still);
    writeFileSync(join(source, 'media/clip', `${id}.mp4`), clip);
  }
  return { root, source, output, still, clip };
}

function run(source: string, output: string, ...args: string[]) {
  return spawnSync(process.execPath, [generator, '--source', source, '--out', output, ...args], {
    encoding: 'utf8',
  });
}

function manifest(output: string) {
  return JSON.parse(readFileSync(join(output, 'public/exercise-catalogue/opengym-media.json'), 'utf8'));
}

describe('local openGym media generator', () => {
  it('matches every raw identity including aliases, preserves bytes, and pins manifest metadata', () => {
    const f = fixture();
    const result = run(f.source, f.output);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const value = manifest(f.output);
    expect(value.entries.map((entry: { id: string; canonicalId: string }) => [entry.id, entry.canonicalId]))
      .toEqual([['0025', '0025'], ['2440', '0025']]);
    expect(value.entries[0].still).toEqual({
      url: '/exercise-opengym-media/v1/still/0025.webp', mime: 'image/webp',
      bytes: f.still.length, sha256: hash(f.still), width: 180, height: 160,
    });
    expect(value.entries[1].clip).toEqual({
      url: '/exercise-opengym-media/v1/clip/2440.mp4', mime: 'video/mp4',
      bytes: f.clip.length, sha256: hash(f.clip), width: 180, height: 160, duration: 2.75,
    });
    for (const id of ['0025', '2440']) {
      expect(readFileSync(join(f.output, `public/exercise-opengym-media/v1/still/${id}.webp`))).toEqual(f.still);
      expect(readFileSync(join(f.output, `public/exercise-opengym-media/v1/clip/${id}.mp4`))).toEqual(f.clip);
    }
    const bytes = readFileSync(join(f.output, 'public/exercise-catalogue/opengym-media.json'));
    expect(JSON.parse(readFileSync(join(f.output, 'src/content/opengym-media-index.json'), 'utf8'))).toEqual({
      url: '/exercise-catalogue/opengym-media.json', bytes: bytes.length, sha256: hash(bytes),
      sourceRecords: 2, stills: 2, clips: 2, totalBytes: (f.still.length + f.clip.length) * 2,
    });
    expect(readFileSync(join(f.output, 'public/exercise-opengym-media/v1/NOTICE.md'), 'utf8'))
      .toContain('Exercise media have a separate limited license, not AGPL.');
  });

  it('fails before writing when a clip is missing or a media identity has no source record', () => {
    const f = fixture();
    rmSync(join(f.source, 'media/clip/2440.mp4'));
    expect(run(f.source, f.output).stderr).toMatch(/missing clip.*2440/i);
    expect(existsSync(f.output)).toBe(false);
    writeFileSync(join(f.source, 'media/clip/2440.mp4'), f.clip);
    writeFileSync(join(f.source, 'media/still/9999.webp'), f.still);
    expect(run(f.source, f.output).stderr).toMatch(/unmatched still.*9999/i);
    expect(existsSync(f.output)).toBe(false);
  });

  it('rejects dangling aliases, traversal ids, symlink inputs, and corrupt metadata', () => {
    const f = fixture();
    writeFileSync(join(f.source, 'exercises/2440.json'), JSON.stringify({ id: '2440', variantOf: '9999' }));
    expect(run(f.source, f.output).stderr).toMatch(/dangling.*alias/i);
    writeFileSync(join(f.source, 'exercises/2440.json'), JSON.stringify({ id: '2440', variantOf: '2440' }));
    expect(run(f.source, f.output).stderr).toMatch(/chained.*alias/i);
    writeFileSync(join(f.source, 'exercises/2440.json'), JSON.stringify({ id: '../2440' }));
    expect(run(f.source, f.output).stderr).toMatch(/id mismatch/i);
    writeFileSync(join(f.source, 'exercises/2440.json'), JSON.stringify({ id: '2440', variantOf: '0025' }));
    writeFileSync(join(f.source, 'media/still/0025.webp'), Buffer.from('not webp'));
    expect(run(f.source, f.output).stderr).toMatch(/invalid webp/i);
    writeFileSync(join(f.source, 'media/still/0025.webp'), f.still);
    const linked = join(f.root, 'linked-catalogue');
    symlinkSync(f.source, linked, 'junction');
    expect(run(linked, f.output).stderr).toMatch(/symbolic link/i);
    expect(existsSync(f.output)).toBe(false);
  });

  it('keeps check read-only and detects modified copies without overwriting them', () => {
    const f = fixture();
    expect(run(f.source, f.output, '--check').status).not.toBe(0);
    expect(existsSync(f.output)).toBe(false);
    expect(run(f.source, f.output).status).toBe(0);
    const file = join(f.output, 'public/exercise-opengym-media/v1/clip/0025.mp4');
    const before = statSync(file).mtimeMs;
    expect(run(f.source, f.output, '--check').status).toBe(0);
    expect(statSync(file).mtimeMs).toBe(before);
    const changed = Buffer.concat([f.clip, Buffer.from('local modification')]);
    writeFileSync(file, changed);
    expect(run(f.source, f.output, '--check').stderr).toMatch(/conflicting media/i);
    expect(run(f.source, f.output).stderr).toMatch(/conflicting media/i);
    expect(readFileSync(file)).toEqual(changed);
    expect(readdirSync(join(f.output, 'public/exercise-opengym-media/v1/clip'))).toHaveLength(2);
  });
});
