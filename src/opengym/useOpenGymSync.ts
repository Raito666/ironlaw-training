import { useCallback, useEffect, useRef, useState } from 'react';
import { isNativeApp } from '../platform/native';
import { synchronize, type Decisions } from '../sync/engine';
import type { SyncConflict } from '../sync/model';
import {
  authenticate,
  createOpenGymApi,
  normalizeServer,
  parseUser,
  passkeyAssertion,
  type OpenGymApi,
} from './api';
import { registerProviderStopper, runWithProvider, runWithSyncLock } from './provider';
import { connectionChanged, onConnectionChange, sameConnection } from './connection-events';
import { readSaved, readToken, writeSaved } from './store';
import { openGymTransport } from './transport';
import type { OpenGymConnection, OwnerProof, ServerConfig, Workspace } from './types';

export function useOpenGymSync(workspace: Workspace, enabled: boolean) {
  const latest = useRef({ workspace, enabled });
  latest.current = { workspace, enabled };
  const [connection, setConnection] = useState<OpenGymConnection | null>(null),
    saved = useRef<OpenGymConnection | null>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [config, setConfig] = useState<ServerConfig | null>(null),
    [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const supported = !isNativeApp(),
    alive = useRef(true),
    generation = useRef(0),
    running = useRef<Promise<unknown> | null>(null),
    controller = useRef<AbortController | null>(null);
  const disconnecting = useRef(false),
    loadTicket = useRef(0);
  const stop = useCallback(async () => {
    generation.current++;
    controller.current?.abort();
    await running.current;
  }, []);
  useEffect(() => registerProviderStopper(stop), [stop]);
  useEffect(() => {
    if (!enabled) void stop();
  }, [enabled, stop]);
  useEffect(() => {
    alive.current = true;
    let disposed = false;
    if (!supported) {
      setReady(true);
      return;
    }
    const reload = () => {
      const ticket = ++loadTicket.current;
      void readSaved()
        .then((value) => {
          if (!disposed && ticket === loadTicket.current) {
            if (!sameConnection(saved.current, value.connection)) {
              generation.current++;
              controller.current?.abort();
              setConflicts([]);
            }
            saved.current = value.connection;
            setConnection(value.connection);
            setReady(true);
          }
        })
        .catch(() => {
          if (!disposed && ticket === loadTicket.current) {
            setError('自托管设置读取失败，请重试；本机记录未改动');
            setReady(true);
          }
        });
    };
    reload();
    const unsubscribe = onConnectionChange((change) => {
      if (change === 'stop') {
        void stop();
        return;
      }
      reload();
    });
    window.addEventListener('focus', reload);
    return () => {
      disposed = true;
      unsubscribe();
      window.removeEventListener('focus', reload);
      alive.current = false;
      generation.current++;
      controller.current?.abort();
    };
  }, [supported, stop]);
  const operate = useCallback(
    async <T>(work: (signal: AbortSignal, active: () => boolean) => Promise<T>): Promise<T | undefined> => {
      if (!latest.current.enabled || isNativeApp() || running.current || disconnecting.current) return undefined;
      const epoch = generation.current;
      const ctl = new AbortController();
      controller.current = ctl;
      const active = () =>
        alive.current && latest.current.enabled && epoch === generation.current && !ctl.signal.aborted;
      setBusy(true);
      setError('');
      const operation = runWithProvider('opengym', async () => {
        if (!active()) return undefined;
        try {
          return await work(ctl.signal, active);
        } catch (e) {
          if (active()) setError(e instanceof Error ? e.message : '自托管操作未成功，本机记录已保留');
          return undefined;
        }
      }).catch(() => {
        if (active()) setError('自托管设置不可用，本机记录已保留');
        return undefined;
      });
      running.current = operation;
      try {
        return await operation;
      } finally {
        if (running.current === operation) running.current = null;
        if (alive.current) setBusy(false);
      }
    },
    [],
  );
  const inspectServer = useCallback(
    async (server: string) =>
      !!(await operate(async (signal, active) => {
        const next = await createOpenGymApi({ server, signal }).config();
        if (!active()) return false;
        setConfig(next);
        return true;
      })),
    [operate],
  );
  const signIn = useCallback(
    async (
      server: string,
      mode: 'password-login' | 'password-register' | 'passkey-login' | 'passkey-register',
      input: { name?: string; password?: string; code?: string },
    ) =>
      !!(await operate(async (signal, active) => {
        const api = createOpenGymApi({ server, signal }),
          user = await authenticate(api, mode, input, signal);
        if (!active()) return false;
        const next: OpenGymConnection = {
          epoch: crypto.randomUUID(),
          server: api.server,
          user,
          auth: 'cookie',
          base: null,
          lastSuccess: null,
        };
        await writeSaved({ version: 1, connection: next, remote: null }, null);
        if (!active()) return false;
        saved.current = next;
        setConnection(next);
        setConflicts([]);
        connectionChanged('changed');
        return true;
      })),
    [operate],
  );
  const pair = useCallback(
    async (server: string, code: string) =>
      !!(await operate(async (signal, active) => {
        const api = createOpenGymApi({ server, signal });
        const result = await api.post('/api/pair/redeem', { code: code.trim().toUpperCase() });
        const user = parseUser(result.user);
        if (typeof result.token !== 'string' || !result.token || result.token.length > 8192)
          throw new Error('服务器没有返回有效配对，请重新生成代码');
        if (!active()) return false;
        const next: OpenGymConnection = {
          epoch: crypto.randomUUID(),
          server: api.server,
          user,
          auth: 'bearer',
          base: null,
          lastSuccess: null,
        };
        await writeSaved({ version: 1, connection: next, remote: null }, result.token);
        if (!active()) return false;
        saved.current = next;
        setConnection(next);
        setConflicts([]);
        connectionChanged('changed');
        return true;
      })),
    [operate],
  );
  const connectedApi = useCallback(
    async (signal: AbortSignal): Promise<{ api: OpenGymApi; current: OpenGymConnection }> => {
      // The durable identity is authoritative, including cookie-authenticated tabs.
      const durable = await readSaved();
      if (!sameConnection(saved.current, durable.connection)) {
        saved.current = durable.connection;
        setConnection(durable.connection);
        setConflicts([]);
        throw new Error('自托管连接已在其他页面改变，请重新操作');
      }
      const current = durable.connection;
      if (!current) throw new Error('请先登录或配对服务器，本机记录可以独立使用');
      let token = current.auth === 'bearer' ? await readToken() : null;
      if (current.auth === 'bearer' && !token) throw new Error('本机配对令牌缺失，请重新配对');
      let api = createOpenGymApi({ server: current.server, token: token ?? undefined, signal });
      const me = await api.get('/api/me'),
        user = parseUser(me.user);
      if (user.id !== current.user.id) throw new Error('服务器当前账号已改变，请先断开，再连接正确账号');
      if (current.auth === 'bearer' && typeof me.token === 'string') {
        const durable = await readSaved();
        if (!sameConnection(durable.connection, current)) throw new Error('自托管连接已变化，请重试');
        await writeSaved(durable, me.token);
        token = me.token;
        api = createOpenGymApi({ server: current.server, token, signal });
      }
      return { api, current };
    },
    [],
  );
  const sync = useCallback(
    async (decisions: Decisions = {}) => {
      const w = latest.current.workspace;
      if (!ready || !w.data || !w.writable || w.status !== 'saved' || !saved.current || !navigator.onLine)
        return;
      await operate(async (signal, active) => {
        const { api, current } = await connectedApi(signal),
          remote = openGymTransport(api);
        const result = await synchronize(
          current,
          {
            ...remote,
            active: () => active() && latest.current.workspace.writable,
            getLocal: () => {
              const currentWorkspace = latest.current.workspace;
              if (!currentWorkspace.data || currentWorkspace.status !== 'saved')
                throw new Error('请等待本机记录保存成功后再同步');
              return currentWorkspace.data;
            },
            apply: (fn) => latest.current.workspace.mutate(fn),
          },
          decisions,
        );
        if (!active()) return;
        if (result.conflicts.length) {
          setConflicts(result.conflicts);
          return;
        }
        if (result.connection) {
          if (!sameConnection((await readSaved()).connection, current))
            throw new Error('自托管连接已变化，本次同步已停止');
          if (!active()) return;
          await writeSaved({ version: 1, connection: result.connection, remote: remote.remote() });
          if (!active()) return;
          saved.current = result.connection;
          setConnection(result.connection);
          setConflicts([]);
        }
      });
    },
    [connectedApi, operate, ready],
  );
  const createPairCode = useCallback(
    async (proof: OwnerProof | 'passkey'): Promise<string | null> =>
      (await operate(async (signal, active) => {
        const { api } = await connectedApi(signal);
        const body = proof === 'passkey' ? await passkeyAssertion(api, signal) : proof;
        const result = await api.post('/api/pair/create', body);
        if (!active()) return null;
        if (typeof result.code !== 'string' || !/^[A-Z0-9-]{4,32}$/.test(result.code))
          throw new Error('服务器没有返回有效配对代码');
        return result.code;
      })) ?? null,
    [connectedApi, operate],
  );
  const disconnect = useCallback(async () => {
    if (disconnecting.current) return false;
    disconnecting.current = true;
    setBusy(true);
    connectionChanged('stop');
    await stop();
    try {
      await runWithSyncLock(async () => {
        await writeSaved({ version: 1, connection: null, remote: null }, null);
        ++loadTicket.current;
      });
      saved.current = null;
      setConnection(null);
      setConflicts([]);
      setConfig(null);
      setError('');
      connectionChanged('changed');
      return true;
    } catch {
      setError('断开设置未保存，请重试；本机记录仍保留');
      return false;
    } finally {
      disconnecting.current = false;
      if (alive.current) setBusy(false);
    }
  }, [stop]);
  const logoutEverywhere = useCallback(async () => {
    const success = await operate(async (signal) => {
      const { api } = await connectedApi(signal);
      await api.post('/api/logout/all');
      return true;
    });
    if (success) return disconnect();
    return false;
  }, [connectedApi, disconnect, operate]);
  useEffect(() => {
    if (
      !enabled ||
      !ready ||
      !connection ||
      workspace.status !== 'saved' ||
      !workspace.writable ||
      conflicts.length
    )
      return;
    const timer = setTimeout(() => {
      void sync();
    }, 1800);
    return () => clearTimeout(timer);
  }, [
    enabled,
    ready,
    connection?.server,
    connection?.user.id,
    workspace.data?.revision,
    workspace.status,
    workspace.writable,
    conflicts.length,
    sync,
  ]);
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [sync]);
  return {
    ready,
    busy,
    error,
    config,
    conflicts,
    supported,
    connected: !!connection,
    user: connection?.user ?? null,
    server: connection?.server ?? '',
    lastSuccess: connection?.lastSuccess ?? null,
    inspectServer,
    signIn,
    pair,
    createPairCode,
    sync,
    disconnect,
    logoutEverywhere,
    normalizeServer,
  };
}
export type OpenGymSyncController = ReturnType<typeof useOpenGymSync>;
