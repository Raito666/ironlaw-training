#!/usr/bin/env node
// Local, byte-preserving import only. No upstream code, network, pixel decoding, or transcoding.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PINNED_REVISION = 'b6cfe2bbd3f099523ffbf2677438864e9a09a06f';
const MEDIA_URL = '/exercise-opengym-media/v1';
const MANIFEST_URL = '/exercise-catalogue/opengym-media.json';
const fail = message => { throw new Error(message); };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value) + '\n');

function resolveInput(value) {
  if (value.split(/[\\/]/).includes('..')) fail(`Path traversal is not allowed: ${value}`);
  return path.resolve(value);
}

function safePath(root, ...segments) {
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + path.sep)) fail(`Path escapes root: ${target}`);
  return target;
}

// Check each existing ancestor too, so a junction cannot redirect a read or write.
function assertNoLinks(target) {
  const parsed = path.parse(target);
  let current = parsed.root;
  for (const part of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) fail(`Symbolic link is not allowed: ${current}`);
  }
}

function directoryFiles(directory, pattern) {
  assertNoLinks(directory);
  if (!fs.statSync(directory).isDirectory()) fail(`Not a directory: ${directory}`);
  return fs.readdirSync(directory, { withFileTypes: true }).map(entry => {
    if (entry.isSymbolicLink()) fail(`Symbolic link is not allowed: ${entry.name}`);
    if (!entry.isFile() || !pattern.test(entry.name)) fail(`Unexpected source file: ${directory}/${entry.name}`);
    return entry.name;
  }).sort();
}

function readRegular(file) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) fail(`Symbolic link is not allowed: ${file}`);
  if (!stat.isFile()) fail(`Not a regular file: ${file}`);
  return fs.readFileSync(file);
}

export function webpMetadata(bytes, label = '') {
  const invalid = () => fail(`Invalid WebP metadata: ${label}`);
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) invalid();
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) invalid();
    let width; let height;
    if (type === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
      const bits = bytes.readUInt32LE(start + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (type === 'VP8X' && size >= 10) {
      width = bytes.readUIntLE(start + 4, 3) + 1;
      height = bytes.readUIntLE(start + 7, 3) + 1;
    } else if (type === 'VP8 ' && size >= 10 && bytes.toString('hex', start + 3, start + 6) === '9d012a') {
      width = bytes.readUInt16LE(start + 6) & 0x3fff;
      height = bytes.readUInt16LE(start + 8) & 0x3fff;
    }
    if (width > 0 && height > 0) return { width, height };
    offset = start + size + (size % 2);
  }
  return invalid();
}

function mp4Boxes(bytes, start, end, label) {
  const boxes = [];
  for (let offset = start; offset < end;) {
    if (offset + 8 > end) fail(`Invalid MP4 box header: ${label}`);
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) fail(`Invalid MP4 extended box: ${label}`);
      const extended = bytes.readBigUInt64BE(offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) fail(`Oversized MP4 box: ${label}`);
      size = Number(extended); header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header || offset + size > end) fail(`Invalid MP4 box bounds: ${label}`);
    boxes.push({ type, start: offset + header, end: offset + size });
    offset += size;
  }
  return boxes;
}

export function mp4Metadata(bytes, label = '') {
  const top = mp4Boxes(bytes, 0, bytes.length, label);
  if (!top.some(box => box.type === 'ftyp')) fail(`Missing MP4 file type: ${label}`);
  const movie = top.find(box => box.type === 'moov');
  if (!movie) fail(`Missing MP4 movie metadata: ${label}`);
  const children = mp4Boxes(bytes, movie.start, movie.end, label);
  const header = children.find(box => box.type === 'mvhd');
  if (!header) fail(`Missing MP4 duration: ${label}`);
  const version = bytes[header.start];
  const durationEnd = version === 1 ? 32 : 20;
  if (![0, 1].includes(version) || header.end - header.start < durationEnd) fail(`Invalid MP4 movie header: ${label}`);
  const timescale = bytes.readUInt32BE(header.start + (version === 1 ? 20 : 12));
  const ticks = version === 1 ? Number(bytes.readBigUInt64BE(header.start + 24)) : bytes.readUInt32BE(header.start + 16);
  const duration = Math.round(ticks / timescale * 1e6) / 1e6;
  if (!Number.isFinite(duration) || duration <= 0) fail(`Invalid MP4 duration: ${label}`);
  for (const track of children.filter(box => box.type === 'trak')) {
    const trackChildren = mp4Boxes(bytes, track.start, track.end, label);
    const media = trackChildren.find(box => box.type === 'mdia');
    const trackHeader = trackChildren.find(box => box.type === 'tkhd');
    if (!media || !trackHeader) continue;
    const handler = mp4Boxes(bytes, media.start, media.end, label).find(box => box.type === 'hdlr');
    if (!handler || handler.end - handler.start < 12 || bytes.toString('ascii', handler.start + 8, handler.start + 12) !== 'vide') continue;
    if (trackHeader.end - trackHeader.start < 84) fail(`Invalid MP4 track header: ${label}`);
    const width = bytes.readUInt32BE(trackHeader.end - 8) / 65536;
    const height = bytes.readUInt32BE(trackHeader.end - 4) / 65536;
    if (!(width > 0 && height > 0)) fail(`Invalid MP4 dimensions: ${label}`);
    return { width, height, duration };
  }
  fail(`Missing MP4 video track: ${label}`);
}

export function buildMedia(source, revision = PINNED_REVISION) {
  if (!/^[a-f0-9]{40}$/.test(revision)) fail('Invalid pinned revision: expected a full commit hash');
  assertNoLinks(source);
  const exerciseDirectory = safePath(source, 'exercises');
  const records = directoryFiles(exerciseDirectory, /^\d{4,5}\.json$/).map(name => {
    const record = JSON.parse(readRegular(safePath(exerciseDirectory, name)).toString('utf8').replace(/^\uFEFF/, ''));
    if (typeof record.id !== 'string' || !/^\d{4,5}$/.test(record.id) || `${record.id}.json` !== name) fail(`Source id mismatch: ${name}`);
    if (record.variantOf !== undefined && (typeof record.variantOf !== 'string' || !/^\d{4,5}$/.test(record.variantOf))) fail(`Invalid variant alias: ${record.id}`);
    return { id: record.id, canonicalId: record.variantOf ?? record.id, alias: record.variantOf !== undefined };
  });
  if (!records.length) fail('No source exercises found');
  const byId = new Map(records.map(record => [record.id, record]));
  for (const record of records) {
    const canonical = byId.get(record.canonicalId);
    if (!canonical || canonical.alias) fail(`Dangling or chained variant alias: ${record.id}`);
  }
  const locations = {};
  for (const [kind, extension] of [['still', 'webp'], ['clip', 'mp4']]) {
    const directory = safePath(source, 'media', kind);
    const names = directoryFiles(directory, new RegExp(`^\\d{4,5}\\.${extension}$`));
    const ids = new Set(names.map(name => name.slice(0, -(extension.length + 1))));
    for (const id of byId.keys()) if (!ids.has(id)) fail(`Missing ${kind} for source id ${id}`);
    for (const id of ids) if (!byId.has(id)) fail(`Unmatched ${kind} id ${id}`);
    locations[kind] = { directory, extension };
  }
  const files = [];
  const entries = records.map(record => {
    const entry = { id: record.id, canonicalId: record.canonicalId };
    for (const kind of ['still', 'clip']) {
      const { directory, extension } = locations[kind];
      const sourceFile = safePath(directory, `${record.id}.${extension}`);
      const bytes = readRegular(sourceFile);
      const metadata = kind === 'still' ? webpMetadata(bytes, record.id) : mp4Metadata(bytes, record.id);
      const item = {
        url: `${MEDIA_URL}/${kind}/${record.id}.${extension}`,
        mime: kind === 'still' ? 'image/webp' : 'video/mp4',
        bytes: bytes.length, sha256: sha256(bytes), ...metadata,
      };
      entry[kind] = item;
      files.push({ sourceFile, ...item });
    }
    return entry;
  });
  const sourceNoticePath = path.resolve(source, '..', 'NOTICE.md');
  assertNoLinks(sourceNoticePath);
  const sourceNotice = readRegular(sourceNoticePath);
  const notice = Buffer.concat([Buffer.from(
    '# Local openGym exercise media\n\n' +
    'These files were copied byte for byte from user-provided local openGym content for this local integration. ' +
    'No upload, publication, external redistribution, transcoding, or license assurance is performed by this importer.\n\n' +
    'Media credit: © Aliaksandr Makatserchyk, Gym visual, gymvisual.com. ' +
    'The media have a separate limited license; openGym AGPL and exercise-text licenses do not grant media rights. ' +
    'The upstream notice restricts media reuse to openGym, permits unmodified 180 px media in a non-commercial openGym fork with the notice, ' +
    'and requires a separate Gym visual license for other uses. The media must not be fed to AI systems. ' +
    'Local copying does not change or resolve these restrictions.\n\n' +
    `Source revision recorded by the existing catalogue integration: ${revision}.\n\n` +
    'The complete upstream NOTICE follows unchanged.\n\n---\n\n'), sourceNotice]);
  const manifest = { formatVersion: 1, source: { project: 'openGym', revision, noticePath: '/exercise-catalogue/opengym-NOTICE.md' }, entries };
  const manifestBytes = jsonBytes(manifest);
  const index = {
    url: MANIFEST_URL, bytes: manifestBytes.length, sha256: sha256(manifestBytes),
    sourceRecords: records.length, stills: records.length, clips: records.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
  };
  return { manifest, manifestBytes, index, notice, sourceNoticeSha256: sha256(sourceNotice), files };
}

function existingFile(file) {
  try { return fs.lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function verifyMedia(file, expected, required) {
  const stat = existingFile(file);
  if (!stat) {
    if (required) fail(`Missing output media: ${file}`);
    return false;
  }
  if (stat.isSymbolicLink()) fail(`Symbolic link is not allowed: ${file}`);
  if (!stat.isFile() || stat.size !== expected.bytes || sha256(fs.readFileSync(file)) !== expected.sha256) {
    fail(`Conflicting media; existing bytes preserved: ${file}`);
  }
  return true;
}

function atomicWrite(file, bytes) {
  assertNoLinks(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (existingFile(file) && readRegular(file).equals(bytes)) return;
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, bytes, { flag: 'wx' });
  fs.renameSync(temporary, file);
}

export function importMedia(source, output, { check = false, revision = PINNED_REVISION } = {}) {
  const generated = buildMedia(source, revision);
  assertNoLinks(output);
  const destinations = generated.files.map(file => ({ ...file, target: safePath(output, 'public', file.url.slice(1)) }));
  // Validate all existing destination bytes before creating anything. Never delete/replace conflicting media.
  for (const kind of ['still', 'clip']) {
    const directory = safePath(output, 'public', MEDIA_URL.slice(1), kind);
    assertNoLinks(directory);
    if (existingFile(directory)) {
      const expected = new Set(destinations.filter(file => file.target.startsWith(directory + path.sep)).map(file => path.basename(file.target)));
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) fail(`Symbolic link is not allowed: ${directory}/${entry.name}`);
        if (!entry.isFile() || !expected.has(entry.name)) fail(`Unexpected existing media; preserved: ${directory}/${entry.name}`);
      }
    }
  }
  for (const file of destinations) {
    assertNoLinks(file.target);
    file.exists = verifyMedia(file.target, file, check);
  }
  const outputs = [
    [safePath(output, 'public', MANIFEST_URL.slice(1)), generated.manifestBytes],
    [safePath(output, 'src/content/opengym-media-index.json'), jsonBytes(generated.index)],
    [safePath(output, 'public', MEDIA_URL.slice(1), 'NOTICE.md'), generated.notice],
  ];
  for (const [file, bytes] of outputs) {
    assertNoLinks(file);
    if (check && (!existingFile(file) || !readRegular(file).equals(bytes))) fail(`Output missing or stale: ${file}`);
  }
  if (!check) {
    for (const file of destinations.filter(file => !file.exists)) {
      fs.mkdirSync(path.dirname(file.target), { recursive: true });
      const temporary = `${file.target}.${randomUUID()}.tmp`;
      fs.copyFileSync(file.sourceFile, temporary, fs.constants.COPYFILE_EXCL);
      verifyMedia(temporary, file, true);
      fs.renameSync(temporary, file.target);
    }
    for (const [file, bytes] of outputs) atomicWrite(file, bytes);
  }
  for (const file of destinations) verifyMedia(file.target, file, true);
  const dimensions = kind => Object.fromEntries([...new Set(generated.manifest.entries.map(entry => `${entry[kind].width}x${entry[kind].height}`))].sort().map(size => [size, generated.manifest.entries.filter(entry => `${entry[kind].width}x${entry[kind].height}` === size).length]));
  const durations = generated.manifest.entries.map(entry => entry.clip.duration);
  return {
    mode: check ? 'check' : 'write', revision, ...generated.index,
    canonicalEntries: generated.manifest.entries.filter(entry => entry.id === entry.canonicalId).length,
    variantAliases: generated.manifest.entries.filter(entry => entry.id !== entry.canonicalId).length,
    stillBytes: generated.files.filter(file => file.mime === 'image/webp').reduce((sum, file) => sum + file.bytes, 0),
    clipBytes: generated.files.filter(file => file.mime === 'video/mp4').reduce((sum, file) => sum + file.bytes, 0),
    stillDimensions: dimensions('still'), clipDimensions: dimensions('clip'),
    clipDurationSeconds: { minimum: Math.min(...durations), maximum: Math.max(...durations) },
    sourceNoticeSha256: generated.sourceNoticeSha256,
    verifiedMedia: destinations.length, verification: 'all destination bytes checked against source SHA-256',
    limitations: ['Header metadata only; no pixel/frame decoding or visual review.', 'Recorded revision is inherited from the existing text integration; the local source export is not a signed provenance assertion.', 'Media restrictions remain separate from AGPL; local copying provides no external redistribution or license assurance.'],
  };
}

export function main() {
  const options = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') options.check = true;
    else if (['--source', '--out', '--revision'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[args[i].slice(2)] = args[++i];
    else fail(`Unknown or incomplete argument: ${args[i]}`);
  }
  if (!options.source) fail('Usage: node scripts/import-opengym-media.mjs --source <local catalogue directory> [--out <project root>] [--revision <40-hex>] [--check]');
  const source = resolveInput(options.source);
  const output = resolveInput(options.out ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  if (source === output || output.startsWith(source + path.sep) || source.startsWith(output + path.sep)) fail('Source and output roots must be separate');
  console.log(JSON.stringify(importMedia(source, output, options)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
