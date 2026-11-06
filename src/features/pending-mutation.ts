import { useEffect, useRef } from 'react';
import type { AppData } from '../domain/types';
import { validateAppData } from '../data/backup';

type Mutate = (fn: (data: AppData) => AppData) => Promise<boolean>;
type Collection = 'exercises' | 'templates' | 'sessions' | 'bodyMetrics';
type Entity = { id: string };
type Change = { key: Collection; id: string; before?: Entity; after?: Entity; index: number };
const collections: Collection[] = ['exercises', 'templates', 'sessions', 'bodyMetrics'];
function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => equal(item, b[index]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]))
  );
}

function changes(before: AppData, after: AppData): Change[] {
  return collections.flatMap((key) => {
    const old = before[key] as Entity[],
      next = after[key] as Entity[];
    const oldById = new Map(old.map((record, index) => [record.id, { record, index }]));
    const nextById = new Map(next.map((record) => [record.id, record]));
    const ids = new Set([...old, ...next].map((record) => record.id));
    return [...ids].flatMap((id) => {
      const previous = oldById.get(id),
        a = previous?.record,
        b = nextById.get(id);
      return equal(a, b) ? [] : [{ key, id, before: a, after: b, index: previous?.index ?? -1 }];
    });
  });
}
function undo(latest: AppData, patch: Change[]): AppData {
  const next = { ...latest };
  for (const key of collections) {
    const records = [...latest[key]] as Entity[];
    for (const change of patch.filter((change) => change.key === key)) {
      const index = records.findIndex((record) => record.id === change.id);
      if (!equal(index < 0 ? undefined : records[index], change.after))
        throw new Error('未保存内容已被其他操作修改，请先导出当前记录并处理保存错误');
      if (change.before) {
        if (index < 0) records.splice(Math.max(0, change.index), 0, change.before);
        else records[index] = change.before;
      } else if (index >= 0) records.splice(index, 1);
    }
    // The union is intentionally assigned through an object spread, then fully validated below.
    Object.assign(next, { [key]: records });
  }
  return validateAppData(next);
}

/** UI intent boundary for optimistic workspace writes. Never changes persistence or backup formats. */
export function createPendingMutation(mutate: Mutate, retry: () => Promise<boolean>) {
  let pending: Change[] | null = null;
  let running: Promise<boolean> | null = null;
  let cancelling: Promise<boolean> | null = null;
  const api = {
    hasPending: () => pending !== null,
    async run(makeNext: (data: AppData) => AppData): Promise<boolean> {
      if (running || cancelling) return false;
      const repeating = pending !== null;
      let applied = false;
      const work = (async () => {
        const success = await mutate((latest) => {
          const base = pending ? undo(latest, pending) : latest;
          // Validate before replacing the old pending intent: a rejected preview must retain its undo.
          const next = validateAppData(makeNext(base));
          const patch = changes(base, next);
          // These controllers are for collection edits, not preferences/schema migrations.
          if (
            !equal(base.settings, next.settings) ||
            base.onboarded !== next.onboarded ||
            base.schemaVersion !== next.schemaVersion
          )
            throw new Error('此操作不属于可重试的新增内容');
          pending = structuredClone(patch);
          applied = true;
          return next;
        });
        const saved = success || (repeating && applied && (await retry()));
        if (saved) pending = null;
        return saved;
      })();
      running = work;
      try {
        return await work;
      } finally {
        if (running === work) running = null;
      }
    },
    async cancel(): Promise<boolean> {
      if (cancelling) return cancelling;
      const work = (async () => {
        if (running) await running;
        if (!pending) return true;
        let applied = false;
        await mutate((latest) => {
          const next = undo(latest, pending!);
          applied = true;
          return next;
        });
        // A failed disk write still installs the rollback in memory. Global retry must save that rollback.
        if (applied) pending = null;
        return applied;
      })();
      cancelling = work;
      try {
        return await work;
      } finally {
        if (cancelling === work) cancelling = null;
      }
    },
  };
  return api;
}

export function usePendingMutation(mutate: Mutate, retry: () => Promise<boolean>) {
  const latest = useRef({ mutate, retry });
  latest.current = { mutate, retry };
  const controller = useRef<ReturnType<typeof createPendingMutation> | null>(null);
  if (!controller.current)
    controller.current = createPendingMutation(
      (fn) => latest.current.mutate(fn),
      () => latest.current.retry(),
    );
  useEffect(
    () => () => {
      void controller.current?.cancel();
    },
    [],
  );
  return controller.current;
}
