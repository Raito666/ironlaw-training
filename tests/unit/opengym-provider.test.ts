import 'fake-indexeddb/auto';
import { expect, it, vi, afterEach } from 'vitest';
import { readProvider, writeSaved, readSaved, readToken } from '../../src/opengym/store';
import { selectProvider, runWithProvider, registerProviderStopper } from '../../src/opengym/provider';
import { sameConnection } from '../../src/opengym/connection-events';

afterEach(() => vi.unstubAllGlobals());
function locks() {
  let tail = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, options: unknown, fn?: (lock: object) => Promise<unknown>) => {
        const work = typeof options === 'function' ? options : fn!;
        const next = tail.then(() => work({}));
        tail = next.then(() => undefined);
        return next;
      },
    },
  });
}
it('defaults to the existing provider, excludes every disabled provider and waits for cancellation before switching', async () => {
  locks();
  expect(await readProvider()).toBe('netlify');
  const network = vi.fn(async () => 1);
  await runWithProvider('opengym', network);
  expect(network).not.toHaveBeenCalled();
  let stopped = false;
  const remove = registerProviderStopper(async () => {
    stopped = true;
  });
  expect(await selectProvider('opengym')).toBe(true);
  expect(stopped).toBe(true);
  await runWithProvider('netlify', network);
  expect(network).not.toHaveBeenCalled();
  await runWithProvider('opengym', network);
  expect(network).toHaveBeenCalledTimes(1);
  await selectProvider('none');
  await runWithProvider('opengym', network);
  expect(network).toHaveBeenCalledTimes(1);
  remove();
  await selectProvider('netlify');
});
it('keeps bearer and raw sidecar outside workspace data and removes bearer on disconnect', async () => {
  await writeSaved(
    {
      version: 1,
      connection: {
        server: 'http://localhost:3900',
        user: { id: 'synthetic', name: 'test', admin: false },
        auth: 'bearer',
        base: null,
        lastSuccess: null,
      },
      remote: { state: { unknown: { keep: true } }, rev: 8 },
    },
    'SYNTHETIC-TOKEN',
  );
  expect(JSON.stringify(await readSaved())).not.toContain('SYNTHETIC-TOKEN');
  expect(await readToken()).toBe('SYNTHETIC-TOKEN');
  expect((await readSaved()).remote?.state?.unknown).toEqual({ keep: true });
  await writeSaved({ version: 1, connection: null, remote: null }, null);
  expect(await readToken()).toBeNull();
});
it('refuses openGym without an exclusive browser lock instead of running two providers', async () => {
  vi.stubGlobal('navigator', {});
  expect(await selectProvider('opengym')).toBe(false);
});
it('preserves connection epochs outside AppData and distinguishes reconnects of the same account', async () => {
  const connection = {
    server: 'http://localhost:3900',
    user: { id: 'same', name: 'local', admin: false },
    auth: 'cookie' as const,
    base: null,
    lastSuccess: null,
  };
  await writeSaved({ version: 1, connection, remote: null });
  expect((await readSaved()).connection).toEqual(connection);
  expect(sameConnection(connection, { ...connection })).toBe(true);
  const fresh = { ...connection, epoch: 'new-login-identity' };
  await writeSaved({ version: 1, connection: fresh, remote: null });
  expect((await readSaved()).connection?.epoch).toBe(fresh.epoch);
  expect(sameConnection(connection, fresh)).toBe(false);
  expect(sameConnection(fresh, { ...fresh, epoch: 'reconnected' })).toBe(false);
  expect(sameConnection(fresh, null)).toBe(false);
  await writeSaved({ version: 1, connection: null, remote: null }, null);
});
