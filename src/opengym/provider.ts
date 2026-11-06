import { useEffect, useState } from 'react';
import { isNativeApp } from '../platform/native';
import { readProvider, writeProvider } from './store';
import type { SyncProvider } from './types';
export type { SyncProvider } from './types';

const LOCK = 'jianlibao-cloud-sync'; // Existing Netlify lock: both providers share the boundary.
/** Lifecycle writes must wait for the same lock used by all synchronization. */
export async function runWithSyncLock<T>(work: () => Promise<T>): Promise<T> {
  if (isNativeApp() || typeof navigator === 'undefined' || !navigator.locks)
    throw new Error('这台设备暂不能安全修改自托管连接');
  return navigator.locks.request(LOCK, work);
}
const listeners = new Set<() => void>();
const stoppers = new Set<() => Promise<void>>();
let switching = false;
export function registerProviderStopper(stop: () => Promise<void>) {
  stoppers.add(stop);
  return () => {
    stoppers.delete(stop);
  };
}
export async function runWithProvider<T>(
  provider: Exclude<SyncProvider, 'none'>,
  work: () => Promise<T>,
): Promise<T | undefined> {
  if (switching) return undefined;
  if (isNativeApp()) return provider === 'netlify' ? work() : undefined;
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request(LOCK, { ifAvailable: true }, async (lock) => {
      if (!lock || switching || (await readProvider()) !== provider) return undefined;
      return work();
    });
  // Preserve legacy support where Web Locks is missing; self-hosted mode fails closed there.
  if (provider === 'netlify' && (await readProvider()) === 'netlify') return work();
  return undefined;
}
export async function selectProvider(provider: SyncProvider): Promise<boolean> {
  if (switching || !['netlify', 'opengym', 'none'].includes(provider)) return false;
  if (isNativeApp()) return provider === 'netlify';
  if (provider === 'opengym' && (typeof navigator === 'undefined' || !navigator.locks)) return false;
  switching = true;
  try {
    await Promise.all([...stoppers].map((stop) => stop()));
    const write = async () => {
      await writeProvider(provider);
    };
    if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(LOCK, write);
    else await write();
    listeners.forEach((fn) => fn());
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('ironlaw-sync-provider');
      channel.postMessage('changed');
      channel.close();
    }
    return true;
  } finally {
    switching = false;
  }
}
export function useSyncProvider() {
  const [provider, setValue] = useState<SyncProvider>('netlify'),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const reload = () => {
      void readProvider()
        .then((value) => {
          if (alive) {
            setValue(value);
            setReady(true);
            setError('');
          }
        })
        .catch(() => {
          if (alive) {
            setValue('none');
            setReady(true);
            setError('同步方式读取失败，自动同步已停止');
          }
        });
    };
    listeners.add(reload);
    reload();
    const channel =
      !isNativeApp() && typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('ironlaw-sync-provider')
        : null;
    if (channel) channel.onmessage = reload;
    const focus = () => reload();
    if (typeof window !== 'undefined') window.addEventListener('focus', focus);
    return () => {
      alive = false;
      listeners.delete(reload);
      channel?.close();
      if (typeof window !== 'undefined') window.removeEventListener('focus', focus);
    };
  }, []);
  return {
    provider,
    ready,
    error,
    setProvider: async (mode: SyncProvider) => {
      try {
        const success = await selectProvider(mode);
        if (!success) setError('这台设备暂不能安全切换自托管同步；可继续使用本地记录或加密云同步');
        else {
          setValue(mode);
          setError('');
        }
        return success;
      } catch {
        setError('同步方式未保存，请重试');
        return false;
      }
    },
  };
}
