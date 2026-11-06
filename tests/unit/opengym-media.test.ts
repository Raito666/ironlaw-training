import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  OPENGYM_MEDIA_CACHE,
  OPENGYM_MEDIA_MANIFEST_CACHE,
  OPENGYM_MEDIA_INDEX,
  canLoadOpenGymVideo,
  isOpenGymMediaResponse,
  openGymMediaCacheState,
  openGymMediaOfflineAvailable,
  openGymMediaVariants,
  openGymStillUrl,
  prepareOpenGymMedia,
} from '../../src/content/opengym-media';
import {
  validateOpenGymMediaManifest,
  readPinnedOpenGymMediaManifest,
  type OpenGymMediaEntry,
  type OpenGymMediaManifest,
  type OpenGymMediaIndex,
  type OpenGymMediaStorage,
} from '../../scripts/opengym-media-worker.mjs';

const still = 'source still bytes', clip = 'source video bytes';
const hash = (body: string) => createHash('sha256').update(body).digest('hex');
const response = (body: string, mime: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': mime } });
function entry(id = '0001', canonicalId = id): OpenGymMediaEntry {
  return { id, canonicalId,
    still: { url: `/exercise-opengym-media/v1/still/${id}.webp`, mime: 'image/webp',
      bytes: Buffer.byteLength(still), sha256: hash(still), width: 320, height: 320 },
    clip: { url: `/exercise-opengym-media/v1/clip/${id}.mp4`, mime: 'video/mp4',
      bytes: Buffer.byteLength(clip), sha256: hash(clip), width: 320, height: 320, duration: 2.5 },
  };
}
function document(entries = [entry()]): OpenGymMediaManifest {
  return { formatVersion: 1, source: { project: 'openGym', revision: 'a'.repeat(40),
    noticePath: '/exercise-catalogue/opengym-NOTICE.md' }, entries };
}
function pinned(manifest: OpenGymMediaManifest) {
  const raw = JSON.stringify(manifest);
  const index: OpenGymMediaIndex = { url: '/exercise-catalogue/opengym-media.json', bytes: Buffer.byteLength(raw),
    sha256: hash(raw), sourceRecords: manifest.entries.length, stills: manifest.entries.length,
    clips: manifest.entries.length, totalBytes: manifest.entries.reduce((sum, value) => sum + value.still.bytes + value.clip.bytes, 0) };
  return { raw, index };
}
function memoryStorage() {
  const buckets = new Map<string, Map<string, Response>>();
  const storage: OpenGymMediaStorage = { open: async name => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    const values = buckets.get(name)!;
    return { match: async url => values.get(url)?.clone(), put: async (url, value) => { values.set(url, value.clone()); } };
  } };
  return { storage, buckets };
}
beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('independent openGym source media contract', () => {
  it('keeps every source variant reachable only within its own namespace', () => {
    const manifest = validateOpenGymMediaManifest(document([entry('0001'), entry('1001', '0001'), entry('0002')]));
    expect(openGymMediaVariants(manifest, 'og:0001').map(value => value.id)).toEqual(['0001', '1001']);
    expect(openGymMediaVariants(manifest, 'og:1001').map(value => value.id)).toEqual(['0001', '1001']);
    for (const id of ['0001', 'ex-bench', 'custom-1001', 'og:9999']) expect(openGymMediaVariants(manifest, id)).toEqual([]);
  });
  it('rejects unsafe paths, MIME, digests, dimensions, duplicate IDs and chained/dangling aliases', () => {
    const changes = [
      (v: any) => { v.entries[0].still.url = 'https://other.test/0001.webp'; },
      (v: any) => { v.entries[0].still.url = '/exercise-opengym-media/v1/still/../0001.webp'; },
      (v: any) => { v.entries[0].still.mime = 'image/svg+xml'; },
      (v: any) => { v.entries[0].clip.sha256 = 'a'.repeat(63); },
      (v: any) => { v.entries[0].still.bytes = 0; },
      (v: any) => { v.entries[0].still.width = 0; },
      (v: any) => { v.entries[0].clip.duration = Infinity; },
      (v: any) => { v.entries[0].canonicalId = '9999'; },
      (v: any) => { v.entries[0].media = '/other.mp4'; },
      (v: any) => { v.entries.push(entry()); },
      (v: any) => { v.entries.push(entry('1001', '0001')); v.entries[0].canonicalId = '1001'; },
    ];
    for (const change of changes) {
      const value = document(); change(value);
      expect(() => validateOpenGymMediaManifest(value)).toThrow(/校验/);
    }
  });
  it('builds deterministic card paths without fetching or adopting original/custom identities', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(openGymStillUrl('og:0001')).toBe('/exercise-opengym-media/v1/still/0001.webp');
    expect(openGymStillUrl('og:2440')).toBe('/exercise-opengym-media/v1/still/2440.webp');
    for (const id of ['0001', 'ex-bench', 'custom', 'og:../a']) expect(openGymStillUrl(id)).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('pinned lazy manifest and next-launch offline recovery', () => {
  it('pins exact manifest MIME, length, SHA and index counts before caching', async () => {
    const { raw, index } = pinned(document());
    for (const value of [response(raw, 'text/html'), response(raw, 'application/json', 206),
      response(raw.slice(0, -1), 'application/json'), response(raw.replace('aaaa', 'bbbb'), 'application/json')]) {
      const { storage, buckets } = memoryStorage();
      await expect(readPinnedOpenGymMediaManifest(index, { storage, fetcher: async () => value })).rejects.toThrow(/校验/);
      expect(buckets.get(OPENGYM_MEDIA_MANIFEST_CACHE)!.size).toBe(0);
    }
    const { storage } = memoryStorage();
    await expect(readPinnedOpenGymMediaManifest({ ...index, totalBytes: index.totalBytes + 1 }, {
      storage, fetcher: async () => response(raw, 'application/json'),
    })).rejects.toThrow(/索引计数/);
  });
  it('can read a complete verified manifest from its own cache without any network', async () => {
    const { raw, index } = pinned(document());
    const { storage, buckets } = memoryStorage();
    await (await storage.open(OPENGYM_MEDIA_MANIFEST_CACHE)).put(index.url, response(raw, 'application/json'));
    const fetcher = vi.fn(async () => { throw Error('offline'); });
    expect((await readPinnedOpenGymMediaManifest(index, { storage, fetcher })).entries).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(buckets.size).toBe(1);
  });
  it('repairs a corrupt pinned manifest without deleting other caches', async () => {
    const { raw, index } = pinned(document());
    const { storage, buckets } = memoryStorage();
    await (await storage.open(OPENGYM_MEDIA_MANIFEST_CACHE)).put(index.url, response('<html>offline shell</html>', 'text/html'));
    await (await storage.open('jianlibao-reference-existing')).put('/keep', response(clip, 'video/mp4'));
    await readPinnedOpenGymMediaManifest(index, { storage, fetcher: async () => response(raw, 'application/json') });
    expect(await (await storage.open(OPENGYM_MEDIA_MANIFEST_CACHE)).match(index.url).then(value => value!.text())).toBe(raw);
    expect(buckets.get('jianlibao-reference-existing')!.size).toBe(1);
  });
  it('coalesces a pinned lazy document, and a cache denial leaves local reading usable', async () => {
    const { raw, index } = pinned(document());
    const fetcher = vi.fn(async () => response(raw, 'application/json'));
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('caches', { open: async () => { throw Error('denied'); } });
    vi.doMock('../../src/content/opengym-media-index.json', () => ({ default: index }));
    try {
      const api = await import('../../src/content/opengym-media');
      expect(fetcher).not.toHaveBeenCalled();
      const one = api.loadOpenGymMediaManifest(), two = api.loadOpenGymMediaManifest();
      expect(one).toBe(two);
      expect((await one).entries).toEqual(document().entries);
      expect(await api.loadOpenGymMediaManifest()).toBe(await one);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock('../../src/content/opengym-media-index.json');
    }
  });
});

describe('selected pair preparation and truthful failures', () => {
  it('accepts exact bytes and rejects wrong MIME, partial content, truncation and same-size corruption', async () => {
    const asset = entry().clip;
    expect(await isOpenGymMediaResponse(response(clip, asset.mime), asset)).toBe(true);
    for (const value of [response(clip, 'text/html'), response(clip, asset.mime, 206),
      response(clip.slice(0, -1), asset.mime), response(clip.replace('video', 'xxxxx'), asset.mime)])
      expect(await isOpenGymMediaResponse(value, asset)).toBe(false);
  });
  it('saves only the selected pair, resumes verified files and verifies persistence after writes', async () => {
    const { storage, buckets } = memoryStorage(); const selected = entry();
    await (await storage.open(OPENGYM_MEDIA_CACHE)).put(selected.still.url, response(still, selected.still.mime));
    const requested: string[] = [];
    const fetcher = async (url: string) => { requested.push(url); return response(clip, 'video/mp4'); };
    expect(await prepareOpenGymMedia(selected, { storage, fetcher })).toEqual({ ready: true, cached: 2, available: true });
    expect(requested).toEqual([selected.clip.url]);
    expect((await openGymMediaCacheState(selected, storage)).ready).toBe(true);
    expect(buckets.get(OPENGYM_MEDIA_CACHE)!.size).toBe(2);
    const dropped = { open: async () => ({ match: async () => undefined, put: async () => {} }) };
    await expect(prepareOpenGymMedia(selected, { storage: dropped, fetcher: async () => response(still, 'image/webp') })).rejects.toThrow(/写入/);
  });
  it('keeps a valid still after clip failure or quota exhaustion and never reports complete readiness', async () => {
    for (const fault of ['network', 'quota']) {
      const { storage } = memoryStorage(); const selected = entry();
      await (await storage.open(OPENGYM_MEDIA_CACHE)).put(selected.still.url, response(still, 'image/webp'));
      const target = fault === 'quota' ? { open: async (name: string) => {
        const cache = await storage.open(name); return { ...cache, put: async () => { throw new DOMException('full', 'QuotaExceededError'); } };
      } } : storage;
      await expect(prepareOpenGymMedia(selected, { storage: target, fetcher: async () => {
        if (fault === 'network') throw Error('offline'); return response(clip, 'video/mp4');
      } })).rejects.toThrow();
      expect(await openGymMediaCacheState(selected, storage)).toEqual({ ready: false, cached: 1, available: true });
    }
  });
  it('cancels a late response before it can become a stored file or a ready badge', async () => {
    const { storage, buckets } = memoryStorage(); const abort = new AbortController();
    await expect(prepareOpenGymMedia(entry(), { storage, signal: abort.signal, fetcher: async () => {
      abort.abort(); return response(still, 'image/webp');
    } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(buckets.get(OPENGYM_MEDIA_CACHE)!.size).toBe(0);
  });
  it('verifies native bundled files with no CacheStorage and no remote URL', async () => {
    vi.stubGlobal('caches', undefined); const urls: string[] = [];
    expect(await prepareOpenGymMedia(entry(), { bundled: true, fetcher: async url => {
      urls.push(url); return url.endsWith('.webp') ? response(still, 'image/webp') : response(clip, 'video/mp4');
    } })).toMatchObject({ ready: true, cached: 2 });
    expect(urls).toEqual([entry().still.url, entry().clip.url]);
    expect(await canLoadOpenGymVideo(entry(), { bundled: true, online: false })).toBe(true);
    expect(await openGymMediaCacheState(entry())).toEqual({ ready: false, cached: 0, available: false });
  });
});

describe('current-worker offline capability proof', () => {
  it('requires the exact manifest pin and selected file hashes', async () => {
    const selected = entry();
    expect(await openGymMediaOfflineAvailable(selected, null, 10)).toBe(false);
    for (const kind of ['correct', 'old-pin', 'wrong-proof']) {
      const controller = { postMessage: (message: any, ports: Transferable[]) => {
        (ports[0] as MessagePort).postMessage({ type: 'ironlaw-opengym-media-ready', cache: OPENGYM_MEDIA_CACHE,
          manifest: kind === 'old-pin' ? 'old' : OPENGYM_MEDIA_INDEX.sha256,
          proof: kind === 'wrong-proof' ? [] : message.proof });
      } };
      expect(await openGymMediaOfflineAvailable(selected, controller, 100)).toBe(kind === 'correct');
    }
    expect(await openGymMediaOfflineAvailable(selected, { postMessage: () => {} }, 10)).toBe(false);
    expect(await openGymMediaOfflineAvailable(selected, { postMessage: () => { throw Error('detached'); } }, 10)).toBe(false);
  });
});
