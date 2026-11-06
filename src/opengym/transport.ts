import { decodeSnapshot, encodeSnapshot, parseDocument } from './state-map';
import { OpenGymApiError, type OpenGymApi } from './api';
import type { Snapshot } from '../sync/model';
import type { OpenGymDocument } from './types';

const version = (doc: OpenGymDocument) => JSON.stringify([doc.rev, doc.state?._wid ?? null]);
export function openGymTransport(api: OpenGymApi) {
  let cached: OpenGymDocument | null = null;
  return {
    async pull() {
      cached = parseDocument(await api.get('/api/data'));
      return { snapshot: decodeSnapshot(cached.state), etag: version(cached) };
    },
    async push(snapshot: Snapshot, etag: string | null) {
      if (!cached || etag !== version(cached)) throw new Error('请先读取服务器版本再同步');
      const state = encodeSnapshot(snapshot, cached.state);
      try {
        const saved = await api.put('/api/data', {
          state,
          baseRev: cached.rev,
          ...(typeof cached.state?._wid === 'string' ? { baseWid: cached.state._wid } : {}),
          stamped: true,
        });
        if (
          saved.ok !== true ||
          !Number.isSafeInteger(saved.rev) ||
          Number(saved.rev) <= cached.rev ||
          typeof saved.wid !== 'string' ||
          !saved.wid
        )
          throw new Error('服务器没有确认安全保存，本机记录已保留');
        // Read the actual stored state, including server-owned ancestry and any normalization.
        // A response can be lost after acceptance; a later retry still uses CAS and three-way merge.
        cached = parseDocument(await api.get('/api/data'));
        decodeSnapshot(cached.state);
        if (cached.rev < Number(saved.rev) || !cached.state)
          throw new Error('服务器保存后的版本无法确认，请稍后重试');
        return version(cached);
      } catch (e) {
        if (e instanceof OpenGymApiError && e.status === 409) {
          cached = parseDocument(e.document);
          return null;
        }
        throw e;
      }
    },
    remote: () => (cached ? structuredClone(cached) : null),
  };
}
