import { isNativeApp } from '../platform/native';
import { validateSnapshot } from '../sync/model';
import { normalizeServer, parseUser } from './api';
import { parseDocument, record } from './state-map';
import type { OpenGymSaved, SyncProvider } from './types';

async function database(): Promise<IDBDatabase> {
  if (isNativeApp()) throw new Error('自托管账号目前仅支持 Web；原生应用可继续使用加密云同步');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ironlaw-opengym', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('metadata');
      request.result.createObjectStore('credentials');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () =>
      reject(new Error('无法读取自托管设置，请关闭其他旧页面后重试'));
  });
}
async function read(key: string, store = 'metadata'): Promise<unknown> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly'),
      request = tx.objectStore(store).get(key);
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error('自托管设置读取失败'));
    };
  });
}
function validate(value: unknown): OpenGymSaved {
  if (value === undefined) return { version: 1, connection: null, remote: null };
  if (!record(value) || value.version !== 1 || !(value.connection === null || record(value.connection)))
    throw new Error('自托管设置格式无效，本机记录未改动');
  if (value.connection === null) return { version: 1, connection: null, remote: null };
  const c = value.connection;
  if (
    !(c.epoch === undefined || (typeof c.epoch === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(c.epoch))) ||
    typeof c.server !== 'string' ||
    !['cookie', 'bearer'].includes(String(c.auth)) ||
    !(
      c.lastSuccess === null ||
      (typeof c.lastSuccess === 'string' && Number.isFinite(Date.parse(c.lastSuccess)))
    )
  )
    throw new Error('自托管连接设置无效');
  return {
    version: 1,
    connection: {
      ...(c.epoch === undefined ? {} : { epoch: c.epoch as string }),
      server: normalizeServer(c.server),
      user: parseUser(c.user),
      auth: c.auth as 'cookie' | 'bearer',
      base: c.base === null ? null : validateSnapshot(c.base),
      lastSuccess: c.lastSuccess as string | null,
    },
    remote: value.remote === null ? null : parseDocument(value.remote),
  };
}
export async function readSaved(): Promise<OpenGymSaved> {
  return validate(await read('connection'));
}
export async function readToken(): Promise<string | null> {
  const value = await read('bearer', 'credentials');
  if (value === undefined) return null;
  if (typeof value !== 'string' || !value || value.length > 8192)
    throw new Error('自托管配对令牌无效，请重新配对');
  return value;
}
export async function writeSaved(value: OpenGymSaved, token?: string | null): Promise<void> {
  const saved = validate(value),
    db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['metadata', 'credentials'], 'readwrite');
    tx.objectStore('metadata').put(saved, 'connection');
    if (token === null) tx.objectStore('credentials').delete('bearer');
    else if (token !== undefined) tx.objectStore('credentials').put(token, 'bearer');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error('自托管设置未保存，请重试'));
    };
  });
}
export async function readProvider(): Promise<SyncProvider> {
  if (isNativeApp()) return 'netlify';
  const value = await read('provider');
  if (value === undefined) return 'netlify';
  if (value !== 'netlify' && value !== 'opengym' && value !== 'none')
    throw new Error('同步方式设置无效，已停止自动同步');
  return value;
}
export async function writeProvider(provider: SyncProvider): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('metadata', 'readwrite');
    tx.objectStore('metadata').put(provider, 'provider');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error('同步方式未保存'));
    };
  });
}
