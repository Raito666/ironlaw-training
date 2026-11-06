import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData } from '../domain/types';
import { normalizeSecret } from './crypto';
import { synchronize, type Decisions } from './engine';
import { type SyncConflict } from './model';
import { readSyncState, writeSyncState, connectSyncState, MissingSyncKeyError, type SyncConnection } from './store';
import { cloudTransport } from './transport';
import { isIos, watchNativeActivity } from '../platform/native';
import { registerProviderStopper, runWithProvider } from '../opengym/provider';

type Options = { data: AppData | null; status: string; writable: boolean; enabled?: boolean; mutate: (fn: (d: AppData) => AppData) => Promise<boolean> };
export function useCloudSync(options: Options) {
  const latest = useRef(options); latest.current = options;
  const connectionRef = useRef<SyncConnection | null>(null);
  const [connection, setConnection] = useState<SyncConnection | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const running = useRef<Promise<void> | null>(null), generation = useRef(0), controller = useRef<AbortController | null>(null);
  const transport = useRef<ReturnType<typeof cloudTransport> | null>(null);
  const alive = useRef(true);
  const readyRef = useRef(false), foreground = useRef(true);
  const loading = useRef<Promise<void> | null>(null), reloadSettings = useRef<() => Promise<void>>(async () => {});
  const stop = useCallback(async () => {
    generation.current++; controller.current?.abort(); transport.current = null;
    await running.current;
  }, []);
  useEffect(() => registerProviderStopper(stop), [stop]);
  useEffect(() => { if (options.enabled === false) void stop(); }, [options.enabled, stop]);
  useEffect(() => {
    alive.current = true;
    const load = () => {
      if (loading.current) return loading.current;
      loading.current = readSyncState().then(state => {
        if (!alive.current) return;
        connectionRef.current = state.connection; setConnection(state.connection); readyRef.current = true; setReady(true); setError('');
      }).catch(e => {
        if (!alive.current) return;
        setError(e instanceof Error ? e.message : '无法读取同步设置');
        const recoverable = e instanceof MissingSyncKeyError;
        if (recoverable) { connectionRef.current = null; setConnection(null); transport.current = null; }
        readyRef.current = recoverable; setReady(recoverable);
      }).finally(() => { loading.current = null; });
      return loading.current;
    };
    reloadSettings.current = load; void load();
    return () => { alive.current = false; generation.current++; controller.current?.abort(); };
  }, []);
  const sync = useCallback((decisions: Decisions = {}) => {
    if (running.current) return running.current;
    const current = connectionRef.current, start = latest.current;
    if (start.enabled === false || !current || !readyRef.current || !foreground.current || !start.data || !start.writable || start.status !== 'saved' || !navigator.onLine) return Promise.resolve();
    const epoch = generation.current;
    if (!transport.current) {
      controller.current = new AbortController();
      transport.current = cloudTransport(current.secret, controller.current.signal);
    }
    const remote = transport.current;
    setBusy(true); setError('');
    const work = async () => {
      const active = () => latest.current.enabled !== false && alive.current && foreground.current && epoch === generation.current && latest.current.writable && connectionRef.current?.secret === current.secret;
      try {
        const execute = async () => {
          const result = await synchronize(current, {
            getLocal: () => {
              if (latest.current.status !== 'saved') throw new Error('本地记录正在保存，请保存成功后重试同步');
              return latest.current.data!;
            }, apply: fn => latest.current.mutate(fn),
            pull: remote.pull, push: remote.push, active,
          }, decisions);
          if (!active()) return;
          if (result.conflicts.length) { setConflicts(result.conflicts); return; }
          if (result.connection) {
            await writeSyncState({ version: 1, connection: result.connection });
            if (!active()) return;
            connectionRef.current = result.connection; setConnection(result.connection); setConflicts([]);
          }
        };
        await runWithProvider('netlify', execute);
      } catch (e) { if (active()) setError(e instanceof Error ? e.message : '同步未成功，本地记录已保留'); }
      finally { if (alive.current) setBusy(false); running.current = null; }
    };
    running.current = work(); return running.current;
  }, []);
  const connect = useCallback(async (secret: string, create: boolean) => {
    if (latest.current.enabled === false || running.current || !latest.current.writable) return false;
    setError(''); setBusy(true);
    try {
      return await runWithProvider('netlify', async () => {
        const normalized = normalizeSecret(secret);
        if (!navigator.onLine) throw new Error('请联网后连接同步空间，本地记录可以继续使用');
        // Joining a mistyped key must never silently create a different empty vault.
        if (!create && !(await cloudTransport(normalized).pull()).snapshot) throw new Error('未找到这个同步空间，请核对完整密钥；首次使用请选择创建');
        if (latest.current.enabled === false) return false;
        const next = await connectSyncState(normalized);
        generation.current++; transport.current = null; connectionRef.current = next; setConnection(next); setConflicts([]);
        return true;
      }) ?? false;
    } catch (e) { setError(e instanceof Error ? e.message : '连接失败'); return false; }
    finally { setBusy(false); }
  }, []);
  const disconnect = useCallback(async () => {
    generation.current++; controller.current?.abort(); transport.current = null;
    await running.current;
    try {
      await writeSyncState({ version: 1, connection: null });
      connectionRef.current = null; transport.current = null; setConnection(null); setConflicts([]); setError('');
    } catch { setError('断开设置未保存，请重试；本地记录未改动'); }
  }, []);
  // No scheduled keep-alive. Requests follow local commits, foregrounding, reconnecting,
  // or explicit user action. A closed/idle application sends no traffic.
  useEffect(() => {
    if (options.enabled === false || !ready || !connection || options.status !== 'saved' || !options.writable || conflicts.length) return;
    const timer = setTimeout(() => { void sync(); }, 1800);
    return () => clearTimeout(timer);
  }, [ready, connection?.secret, options.data?.revision, options.status, options.writable, options.enabled, conflicts.length, sync]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void sync(); };
    window.addEventListener('online', refresh); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [sync]);
  useEffect(() => {
    if (!isIos()) return;
    return watchNativeActivity(active => {
      foreground.current = active;
      if (!active) { generation.current++; controller.current?.abort(); transport.current = null; return; }
      // Reload the durable reference after unlock or an interrupted metadata write.
      void (async () => {
        await running.current;
        if (!alive.current || !foreground.current) return;
        await reloadSettings.current();
        if (alive.current && foreground.current) await sync();
      })();
    });
  }, [sync]);
  return { ready, busy, error, conflicts, connected: !!connection, secret: connection?.secret ?? '', lastSuccess: connection?.lastSuccess ?? null, sync, connect, disconnect };
}
export type CloudSyncController = ReturnType<typeof useCloudSync>;
