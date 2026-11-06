import { validReferenceResponse, rangeResponse } from './reference-worker.mjs';

export const OPENGYM_MEDIA_CACHE = 'ironlaw-opengym-media-v1';
export const OPENGYM_MEDIA_MANIFEST_CACHE = 'ironlaw-opengym-media-index-v1';
export const OPENGYM_MEDIA_PREFIX = '/exercise-opengym-media/v1/';

function mediaInvalid(field) {
  throw new Error(`openGym 媒体目录校验失败：${field}`);
}
function mediaObject(value, keys, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value, key))) mediaInvalid(field);
  return value;
}
function mediaInteger(value, max, field) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) mediaInvalid(field);
}
function mediaId(value) {
  if (typeof value !== 'string' || !/^\d{4,5}$/.test(value)) mediaInvalid('编号');
  return value;
}
function validateMediaAsset(value, id, clip) {
  const asset = mediaObject(value,
    ['url', 'mime', 'bytes', 'sha256', 'width', 'height', ...(clip ? ['duration'] : [])], '文件字段');
  if (asset.url !== `${OPENGYM_MEDIA_PREFIX}${clip ? 'clip' : 'still'}/${id}.${clip ? 'mp4' : 'webp'}` ||
      asset.mime !== (clip ? 'video/mp4' : 'image/webp') ||
      typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) mediaInvalid('文件路径、类型或摘要');
  mediaInteger(asset.bytes, 512 * 1024 * 1024, '文件大小');
  mediaInteger(asset.width, 16384, '宽度');
  mediaInteger(asset.height, 16384, '高度');
  if (clip && (typeof asset.duration !== 'number' || !Number.isFinite(asset.duration) ||
      asset.duration <= 0 || asset.duration > 3600)) mediaInvalid('时长');
}

/** Shared with the page. Paths are exact local source IDs, never a guessed old-exercise match. */
export function validateOpenGymMediaManifest(value) {
  const manifest = mediaObject(value, ['formatVersion', 'source', 'entries'], '目录字段');
  if (manifest.formatVersion !== 1) mediaInvalid('版本');
  const source = mediaObject(manifest.source, ['project', 'revision', 'noticePath'], '来源字段');
  if (source.project !== 'openGym' || typeof source.revision !== 'string' ||
      !/^[a-f0-9]{40}$/.test(source.revision) ||
      source.noticePath !== '/exercise-catalogue/opengym-NOTICE.md') mediaInvalid('来源');
  if (!Array.isArray(manifest.entries) || !manifest.entries.length || manifest.entries.length > 20000)
    mediaInvalid('条目数量');
  const entries = new Map();
  for (const value of manifest.entries) {
    const entry = mediaObject(value, ['id', 'canonicalId', 'still', 'clip'], '条目字段');
    const id = mediaId(entry.id);
    mediaId(entry.canonicalId);
    if (entries.has(id)) mediaInvalid('重复编号');
    validateMediaAsset(entry.still, id, false);
    validateMediaAsset(entry.clip, id, true);
    entries.set(id, entry);
  }
  for (const entry of entries.values()) {
    const canonical = entries.get(entry.canonicalId);
    if (!canonical || canonical.id !== canonical.canonicalId) mediaInvalid('变体引用');
  }
  return manifest;
}

export function validateOpenGymMediaIndex(value) {
  const index = mediaObject(value, ['url', 'bytes', 'sha256', 'sourceRecords', 'stills', 'clips', 'totalBytes'], '索引字段');
  if (index.url !== '/exercise-catalogue/opengym-media.json' || typeof index.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(index.sha256)) mediaInvalid('索引路径或摘要');
  mediaInteger(index.bytes, 32 * 1024 * 1024, '目录大小');
  mediaInteger(index.sourceRecords, 20000, '来源条数');
  if (index.stills !== index.sourceRecords || index.clips !== index.sourceRecords) mediaInvalid('文件数量');
  mediaInteger(index.totalBytes, Number.MAX_SAFE_INTEGER, '总大小');
  return index;
}

/** The complete manifest is pinned by bytes+SHA, independently of application/user data. */
export async function readPinnedOpenGymMediaManifest(index, options = {}) {
  validateOpenGymMediaIndex(index);
  const storage = options.storage;
  const spec = { ...index, mime: 'application/json' };
  const parse = async response => {
    if (!(await validReferenceResponse(response, spec))) mediaInvalid('目录文件完整性');
    const manifest = validateOpenGymMediaManifest(JSON.parse(await response.text()));
    const total = manifest.entries.reduce((sum, entry) => sum + entry.still.bytes + entry.clip.bytes, 0);
    if (manifest.entries.length !== index.sourceRecords || total !== index.totalBytes) mediaInvalid('索引计数');
    return manifest;
  };
  let cache;
  if (storage) {
    try {
      cache = await storage.open(OPENGYM_MEDIA_MANIFEST_CACHE);
      const cached = await cache.match(index.url, { ignoreVary: true });
      if (cached) {
        try { return await parse(cached); } catch { /* A stale snapshot must not delete a concurrent repair. */ }
      }
    } catch { /* Reading bundled/local files still works without browser storage. */ }
  }
  const response = await (options.fetcher ?? fetch)(index.url,
    { cache: 'no-cache', credentials: 'omit', redirect: 'error', signal: options.signal });
  const manifest = await parse(response.clone());
  if (cache) {
    try { await cache.put(index.url, response); } catch { /* Explicit preparation reports storage failures. */ }
  }
  return manifest;
}

/** Embed only the small pinned index; the 13k asset lookup is built lazily in memory. */
export function openGymMediaWorkerSource(input) {
  const index = validateOpenGymMediaIndex(input);
  return `
const OPENGYM_MEDIA_CACHE = ${JSON.stringify(OPENGYM_MEDIA_CACHE)};
const OPENGYM_MEDIA_MANIFEST_CACHE = ${JSON.stringify(OPENGYM_MEDIA_MANIFEST_CACHE)};
const OPENGYM_MEDIA_PREFIX = ${JSON.stringify(OPENGYM_MEDIA_PREFIX)};
const OPENGYM_MEDIA_INDEX = ${JSON.stringify(index)};
${mediaInvalid.toString()}
${mediaObject.toString()}
${mediaInteger.toString()}
${mediaId.toString()}
${validateMediaAsset.toString()}
${validateOpenGymMediaManifest.toString()}
${validateOpenGymMediaIndex.toString()}
${readPinnedOpenGymMediaManifest.toString()}
${validReferenceResponse.toString()}
${rangeResponse.toString()}
let openGymMediaLookup, openGymMediaPending;
async function openGymMediaAssets() {
  if (openGymMediaLookup) return openGymMediaLookup;
  if (!openGymMediaPending) openGymMediaPending = readPinnedOpenGymMediaManifest(OPENGYM_MEDIA_INDEX, { storage: caches }).then(manifest => {
    openGymMediaLookup = new Map(manifest.entries.flatMap(entry => [entry.still, entry.clip]).map(asset => [asset.url, asset]));
    return openGymMediaLookup;
  }).finally(() => { openGymMediaPending = undefined; });
  return openGymMediaPending;
}
function handlesOpenGymMediaRequest(request) {
  const url = new URL(request.url);
  return request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith(OPENGYM_MEDIA_PREFIX);
}
async function openGymMediaFetch(request) {
  if (!handlesOpenGymMediaRequest(request)) return new Response('Unknown local media request', { status: 404 });
  let assets;
  try { assets = await openGymMediaAssets(); }
  catch { return new Response('openGym local media index unavailable', { status: 503 }); }
  const key = new URL(request.url).pathname, asset = assets.get(key);
  if (!asset) return new Response('Unknown openGym source file', { status: 404 });
  let cache;
  try {
    cache = await caches.open(OPENGYM_MEDIA_CACHE);
    const cached = await cache.match(key, { ignoreVary: true });
    if (await validReferenceResponse(cached, asset)) {
      const range = request.headers.get('range');
      return range ? rangeResponse(cached, range) : cached;
    }
  } catch { /* A local/native network fetch can remain usable if cache access is denied. */ }
  const response = await fetch(request, { credentials: 'omit', redirect: 'error' });
  if (request.headers.has('range')) return response;
  if (!(await validReferenceResponse(response, asset))) return new Response('openGym file integrity check failed', { status: 502 });
  if (cache) {
    try { await cache.put(key, response.clone()); } catch { /* Explicit preparation reports quota failures. */ }
  }
  return response;
}
self.addEventListener('message', event => {
  if (event.data?.type !== 'ironlaw-opengym-media-capability') return;
  const operation = openGymMediaAssets().then(assets => {
    const proof = event.data.proof;
    const verified = Array.isArray(proof) && proof.length > 0 && proof.every(item => Array.isArray(item) && item.length === 2 && assets.get(item[0])?.sha256 === item[1]);
    event.ports?.[0]?.postMessage({ type: 'ironlaw-opengym-media-ready', cache: OPENGYM_MEDIA_CACHE, manifest: OPENGYM_MEDIA_INDEX.sha256, proof: verified ? proof : null });
  }).catch(() => event.ports?.[0]?.postMessage({ type: 'ironlaw-opengym-media-unavailable' }));
  event.waitUntil?.(operation);
});
`;
}
