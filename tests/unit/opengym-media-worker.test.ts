import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import {
  OPENGYM_MEDIA_CACHE,
  OPENGYM_MEDIA_MANIFEST_CACHE,
  openGymMediaWorkerSource,
  type OpenGymMediaEntry,
  type OpenGymMediaIndex,
} from '../../scripts/opengym-media-worker.mjs';

const hash = (body: string) => createHash('sha256').update(body).digest('hex');
const movie = '0123456789', still = 'source still';
const entry: OpenGymMediaEntry = { id: '0001', canonicalId: '0001',
  still: { url: '/exercise-opengym-media/v1/still/0001.webp', mime: 'image/webp', bytes: still.length,
    sha256: hash(still), width: 320, height: 320 },
  clip: { url: '/exercise-opengym-media/v1/clip/0001.mp4', mime: 'video/mp4', bytes: movie.length,
    sha256: hash(movie), width: 320, height: 320, duration: 2 },
};
const raw = JSON.stringify({ formatVersion: 1, source: { project: 'openGym', revision: 'a'.repeat(40),
  noticePath: '/exercise-catalogue/opengym-NOTICE.md' }, entries: [entry] });
const index: OpenGymMediaIndex = { url: '/exercise-catalogue/opengym-media.json', bytes: raw.length,
  sha256: hash(raw), sourceRecords: 1, stills: 1, clips: 1, totalBytes: movie.length + still.length };
const response = (body: string, mime: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': mime } });
// Exercise the real Node-generated classic Worker, not Vitest's SSR-rewritten
// imported function references (which do not exist in an actual Worker).
const generatedSource = execFileSync(process.execPath, ['--input-type=module', '-e',
  "import {openGymMediaWorkerSource} from './scripts/opengym-media-worker.mjs'; process.stdout.write(openGymMediaWorkerSource(JSON.parse(process.argv[1])));",
  JSON.stringify(index)], { encoding: 'utf8' });
function setup(fetcher: (request: Request | string, init?: RequestInit) => Promise<Response>) {
  const buckets = new Map<string, Map<string, Response>>();
  const caches = { open: async (name: string) => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    return { match: async (url: string) => buckets.get(name)!.get(url)?.clone(),
      put: async (url: string, value: Response) => { buckets.get(name)!.set(url, value.clone()); } };
  } };
  const listeners = new Map<string, (event: any) => void>();
  const source = generatedSource;
  const api = runInNewContext(source + '\n({ fetch: openGymMediaFetch, handles: handlesOpenGymMediaRequest })', {
    self: { location: { origin: 'https://local.test' }, addEventListener: (name: string, handler: (event: any) => void) => listeners.set(name, handler) },
    caches, fetch: fetcher, Response, URL, crypto, console,
  }) as { fetch: (request: Request) => Promise<Response>; handles: (request: Request) => boolean };
  return { source, api, caches, buckets, listeners };
}

describe('lazy pinned openGym worker', () => {
  it('embeds no media URL table and performs zero eager network/cache work', () => {
    let fetched = 0;
    const scope = setup(async () => { fetched++; throw Error('unexpected'); });
    expect(fetched).toBe(0); expect(scope.buckets.size).toBe(0);
    expect(scope.source).not.toContain(entry.clip.url);
    expect(scope.source.length).toBeLessThan(15000);
  });
  it('serves exact byte ranges after an offline cold start using its pinned manifest cache', async () => {
    const scope = setup(async () => { throw Error('offline'); });
    await (await scope.caches.open(OPENGYM_MEDIA_MANIFEST_CACHE)).put(index.url, response(raw, 'application/json'));
    await (await scope.caches.open(OPENGYM_MEDIA_CACHE)).put(entry.clip.url, response(movie, 'video/mp4'));
    for (const [range, content, expected] of [
      ['bytes=0-3', '0123', 'bytes 0-3/10'], ['bytes=5-', '56789', 'bytes 5-9/10'],
      ['bytes=-4', '6789', 'bytes 6-9/10'], ['bytes=2-99', '23456789', 'bytes 2-9/10'],
    ]) {
      const result = await scope.api.fetch(new Request(`https://local.test${entry.clip.url}`, { headers: { Range: range } }));
      expect(result.status).toBe(206); expect(result.headers.get('Content-Range')).toBe(expected);
      expect(result.headers.get('Content-Type')).toBe('video/mp4'); expect(await result.text()).toBe(content);
    }
    for (const range of ['bytes=20-', 'bytes=9-1', 'bytes=-0', 'bytes=0-1,5-6']) {
      const result = await scope.api.fetch(new Request(`https://local.test${entry.clip.url}`, { headers: { Range: range } }));
      expect(result.status).toBe(416); expect(result.headers.get('Content-Range')).toBe('bytes */10');
    }
  });
  it('loads the manifest once and caches only the requested verified complete asset', async () => {
    const requested: string[] = [];
    const scope = setup(async request => {
      const url = typeof request === 'string' ? request : new URL(request.url).pathname;
      requested.push(url);
      return url === index.url ? response(raw, 'application/json') : response(still, 'image/webp');
    });
    const request = new Request(`https://local.test${entry.still.url}`);
    expect(await (await scope.api.fetch(request)).text()).toBe(still);
    expect(await (await scope.api.fetch(request)).text()).toBe(still);
    expect(requested).toEqual([index.url, entry.still.url]);
    expect(scope.buckets.get(OPENGYM_MEDIA_CACHE)!.has(entry.clip.url)).toBe(false);
  });
  it('does not cache partial network responses and rejects a corrupt full-file response', async () => {
    const scope = setup(async request => {
      if (typeof request === 'string') return response(raw, 'application/json');
      return request.headers.has('range') ? response('012', 'video/mp4', 206) : response('corruption', 'video/mp4');
    });
    expect((await scope.api.fetch(new Request(`https://local.test${entry.clip.url}`, { headers: { Range: 'bytes=0-2' } }))).status).toBe(206);
    expect((await scope.api.fetch(new Request(`https://local.test${entry.clip.url}`))).status).toBe(502);
    expect(scope.buckets.get(OPENGYM_MEDIA_CACHE)!.size).toBe(0);
  });
  it('fails closed for an unavailable/corrupt manifest, but permits a later retry', async () => {
    let calls = 0;
    const scope = setup(async request => {
      if (typeof request === 'string') return ++calls === 1 ? response('<html>shell</html>', 'text/html') : response(raw, 'application/json');
      return response(movie, 'video/mp4');
    });
    const request = new Request(`https://local.test${entry.clip.url}`);
    expect((await scope.api.fetch(request)).status).toBe(503);
    expect(await (await scope.api.fetch(request)).text()).toBe(movie);
    expect(calls).toBe(2);
  });
  it('never routes remote origins, custom paths or writes; unknown source IDs receive a real 404', async () => {
    const scope = setup(async request => {
      if (typeof request !== 'string') throw Error('unknown file must not fetch');
      return response(raw, 'application/json');
    });
    expect(scope.api.handles(new Request(`https://remote.test${entry.clip.url}`))).toBe(false);
    expect(scope.api.handles(new Request('https://local.test/api/private'))).toBe(false);
    expect(scope.api.handles(new Request(`https://local.test${entry.clip.url}`, { method: 'POST' }))).toBe(false);
    expect((await scope.api.fetch(new Request('https://local.test/exercise-opengym-media/v1/clip/9999.mp4'))).status).toBe(404);
  });
  it('acknowledges only the exact selected asset proof after lazy manifest validation', async () => {
    const scope = setup(async () => response(raw, 'application/json'));
    for (const proof of [[[entry.clip.url, entry.clip.sha256]], [[entry.clip.url, 'wrong']]]) {
      let waiting: Promise<void> | undefined, reply: any;
      scope.listeners.get('message')!({ data: { type: 'ironlaw-opengym-media-capability', proof },
        ports: [{ postMessage: (value: unknown) => { reply = value; } }], waitUntil: (task: Promise<void>) => { waiting = task; } });
      await waiting;
      expect(reply.manifest).toBe(index.sha256);
      expect(reply.proof).toEqual(proof[0][1] === entry.clip.sha256 ? proof : null);
    }
  });
});
