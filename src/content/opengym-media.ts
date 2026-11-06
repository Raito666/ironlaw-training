import pinned from './opengym-media-index.json';
import {
  OPENGYM_MEDIA_CACHE,
  OPENGYM_MEDIA_MANIFEST_CACHE,
  readPinnedOpenGymMediaManifest,
  validateOpenGymMediaIndex,
  validateOpenGymMediaManifest,
  type OpenGymMediaEntry,
  type OpenGymMediaManifest,
  type OpenGymMediaStorage,
} from '../../scripts/opengym-media-worker.mjs';
import { validReferenceResponse } from '../../scripts/reference-worker.mjs';
import { isOpenGymExercise, openGymEntryFor } from './opengym-catalogue';

export { OPENGYM_MEDIA_CACHE, OPENGYM_MEDIA_MANIFEST_CACHE, validateOpenGymMediaManifest };
export type { OpenGymMediaEntry, OpenGymMediaManifest, OpenGymMediaStorage };
export const OPENGYM_MEDIA_INDEX = validateOpenGymMediaIndex(pinned);
export const isOpenGymMediaResponse = validReferenceResponse;

export function openGymMediaStorage(): OpenGymMediaStorage | undefined {
  return typeof caches === 'undefined' ? undefined : caches;
}

let loaded: OpenGymMediaManifest | undefined;
let pending: Promise<OpenGymMediaManifest> | undefined;
/** Loaded only by an opened detail view, once per page; never stored in AppData/backups. */
export function loadOpenGymMediaManifest(): Promise<OpenGymMediaManifest> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= readPinnedOpenGymMediaManifest(OPENGYM_MEDIA_INDEX, { storage: openGymMediaStorage() })
    .then((manifest) => {
      loaded = manifest;
      return manifest;
    })
    .catch((error) => {
      throw new Error(
        `本机示范目录暂不可用，请重试。${error instanceof Error ? `（${error.message}）` : ''}`,
      );
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

/** Every source alias remains reachable; this helper never adopts a legacy/custom exercise ID. */
export function openGymMediaVariants(
  manifest: OpenGymMediaManifest,
  exerciseId: string,
): OpenGymMediaEntry[] {
  if (!isOpenGymExercise(exerciseId)) return [];
  const raw = exerciseId.slice(3);
  const selected = manifest.entries.find((entry) => entry.id === raw);
  if (!selected) return [];
  return manifest.entries
    .filter((entry) => entry.canonicalId === selected.canonicalId)
    .sort(
      (a, b) =>
        Number(b.id === selected.canonicalId) - Number(a.id === selected.canonicalId) ||
        a.id.localeCompare(b.id),
    );
}

/** A deterministic still path; catalogue cards never download the large media manifest. */
export function openGymStillUrl(exerciseId: string): string | undefined {
  if (!isOpenGymExercise(exerciseId)) return undefined;
  const id = openGymEntryFor(exerciseId)?.canonicalId ?? exerciseId.slice(3);
  return `/exercise-opengym-media/v1/still/${id}.webp`;
}

export async function openGymMediaCacheState(entry: OpenGymMediaEntry, storage = openGymMediaStorage()) {
  if (!storage) return { available: false, ready: false, cached: 0 };
  const cache = await storage.open(OPENGYM_MEDIA_CACHE);
  let cached = 0;
  for (const asset of [entry.still, entry.clip])
    if (await validReferenceResponse(await cache.match(asset.url, { ignoreVary: true }), asset)) cached++;
  return { available: true, ready: cached === 2, cached };
}

export async function openGymMediaManifestCacheReady(storage = openGymMediaStorage()): Promise<boolean> {
  if (!storage) return false;
  try {
    const cache = await storage.open(OPENGYM_MEDIA_MANIFEST_CACHE);
    return validReferenceResponse(await cache.match(OPENGYM_MEDIA_INDEX.url, { ignoreVary: true }), {
      ...OPENGYM_MEDIA_INDEX,
      mime: 'application/json',
    });
  } catch {
    return false;
  }
}

/** Explicit preparation includes a persistent, pinned manifest for the next offline app launch. */
export async function ensureOpenGymMediaManifestOffline(signal?: AbortSignal) {
  const storage = openGymMediaStorage();
  if (!storage) throw new Error('当前浏览器无法保存离线示范目录。');
  signal?.throwIfAborted();
  await readPinnedOpenGymMediaManifest(OPENGYM_MEDIA_INDEX, { storage, signal });
  signal?.throwIfAborted();
  if (!(await openGymMediaManifestCacheReady(storage)))
    throw new Error('离线示范目录未能保存，请检查可用空间并重试。');
}

export async function prepareOpenGymMedia(
  entry: OpenGymMediaEntry,
  options: {
    storage?: OpenGymMediaStorage;
    fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
    signal?: AbortSignal;
    onProgress?: (cached: number) => void;
    bundled?: boolean;
  } = {},
) {
  const storage = options.storage ?? openGymMediaStorage();
  if (!options.bundled && !storage) throw new Error('当前浏览器无法保存离线示范，请保持本机服务运行后查看。');
  const cache = options.bundled ? undefined : await storage!.open(OPENGYM_MEDIA_CACHE);
  let cached = 0;
  for (const asset of [entry.still, entry.clip]) {
    options.signal?.throwIfAborted();
    const existing = cache ? await cache.match(asset.url, { ignoreVary: true }) : undefined;
    if (!(await validReferenceResponse(existing, asset))) {
      const response = await (options.fetcher ?? fetch)(asset.url, {
        cache: 'reload',
        credentials: 'omit',
        redirect: 'error',
        signal: options.signal,
      });
      options.signal?.throwIfAborted();
      if (!(await validReferenceResponse(response, asset)))
        throw new Error(
          `来源编号 ${entry.id} 的${asset === entry.still ? '图片' : '视频'}校验失败，请重试。`,
        );
      options.signal?.throwIfAborted();
      if (cache) {
        await cache.put(asset.url, response);
        // A write that was silently dropped must not become an offline-ready badge.
        if (!(await validReferenceResponse(await cache.match(asset.url, { ignoreVary: true }), asset)))
          throw new Error('离线文件写入后无法读取，请检查可用空间并重试。');
      }
    }
    options.signal?.throwIfAborted();
    cached++;
    options.onProgress?.(cached);
  }
  options.signal?.throwIfAborted();
  if (cache && !(await openGymMediaCacheState(entry, storage)).ready)
    throw new Error('示范保存期间文件被移除，请重试完整保存。');
  return { available: true, ready: true, cached };
}

type WorkerController = { postMessage(message: unknown, transfer: Transferable[]): void };
/** CacheStorage is insufficient: prove that the current worker knows these exact pinned files. */
export function openGymMediaOfflineAvailable(
  entry: OpenGymMediaEntry,
  controller: WorkerController | null = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker.controller
    : null,
  timeoutMs = 1200,
): Promise<boolean> {
  if (!controller || typeof MessageChannel === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const proof = [entry.still, entry.clip].map((asset) => [asset.url, asset.sha256]);
    let finished = false;
    const finish = (available: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      resolve(available);
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    channel.port1.onmessage = (event) =>
      finish(
        event.data?.type === 'ironlaw-opengym-media-ready' &&
          event.data.cache === OPENGYM_MEDIA_CACHE &&
          event.data.manifest === OPENGYM_MEDIA_INDEX.sha256 &&
          JSON.stringify(event.data.proof) === JSON.stringify(proof),
      );
    try {
      controller.postMessage({ type: 'ironlaw-opengym-media-capability', proof }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

export async function canLoadOpenGymVideo(
  entry: OpenGymMediaEntry,
  options: {
    online: boolean;
    bundled: boolean;
    storage?: OpenGymMediaStorage;
  },
): Promise<boolean> {
  if (options.bundled || options.online) return true;
  try {
    const [cache, worker, manifest] = await Promise.all([
      openGymMediaCacheState(entry, options.storage),
      openGymMediaOfflineAvailable(entry),
      openGymMediaManifestCacheReady(options.storage),
    ]);
    return cache.ready && worker && manifest;
  } catch {
    return false;
  }
}
