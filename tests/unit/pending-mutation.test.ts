import { expect, it } from 'vitest';
import { createInitialData } from '../../src/domain/seed';
import { validateAppData } from '../../src/data/backup';
import type { AppData } from '../../src/domain/types';
import { createPendingMutation } from '../../src/features/pending-mutation';

function workspace() {
  let current = createInitialData(),
    disk = structuredClone(current),
    blocked = false,
    owner = true;
  const initial = structuredClone(current);
  let writes = 0;
  const mutate = async (fn: (data: AppData) => AppData) => {
    if (!owner) return false;
    try {
      current = validateAppData(fn(current));
    } catch {
      return false;
    }
    if (!blocked) {
      ++writes;
      blocked = true;
      return false;
    }
    return false;
  };
  const retry = async () => {
    if (!owner) return false;
    disk = structuredClone(current);
    blocked = false;
    return true;
  };
  return {
    action: createPendingMutation(mutate, retry),
    initial,
    mutate,
    retry,
    current: () => current,
    disk: () => disk,
    writes: () => writes,
    own: (value: boolean) => {
      owner = value;
    },
  };
}
const append =
  (id: string, name = id) =>
  (data: AppData): AppData => ({
    ...data,
    templates: [...data.templates, { ...structuredClone(data.templates[0]), id, name }],
  });

it('failed append remains optimistic; explicit retry replaces its own intent and writes only one item', async () => {
  const w = workspace();
  expect(await w.action.run(append('first'))).toBe(false);
  expect(w.current().templates).toHaveLength(w.initial.templates.length + 1);
  expect(w.disk()).toEqual(w.initial);
  expect(await w.action.run(append('second'))).toBe(true);
  expect(w.disk().templates).toHaveLength(w.initial.templates.length + 1);
  expect(w.disk().templates.at(-1)?.id).toBe('second');
  expect(w.action.hasPending()).toBe(false);
});
it('cancel restores the intent in memory even when persistence remains blocked; global retry cannot commit it', async () => {
  const w = workspace();
  await w.action.run(append('cancel-me'));
  expect(await w.action.cancel()).toBe(true);
  expect(w.action.hasPending()).toBe(false);
  await w.retry();
  expect(w.disk()).toEqual(w.initial);
});
it('a changed preview replaces, rather than accumulates, the failed preview', async () => {
  const w = workspace();
  await w.action.run(append('id-one', 'old preview'));
  await w.action.run(append('id-two', 'new preview'));
  expect(
    w
      .disk()
      .templates.filter((t) => /preview/.test(t.name))
      .map((t) => t.name),
  ).toEqual(['new preview']);
});
it('rollback preserves unrelated records and latest settings/revision', async () => {
  const w = workspace();
  await w.action.run(append('mine'));
  await w.mutate((data) => ({
    ...append('unrelated')(data),
    revision: data.revision + 3,
    settings: { ...data.settings, theme: 'light' },
  }));
  expect(await w.action.cancel()).toBe(true);
  await w.retry();
  expect(w.disk().templates.map((t) => t.id)).toEqual([...w.initial.templates.map((t) => t.id), 'unrelated']);
  expect(w.disk().settings.theme).toBe('light');
  expect(w.disk().revision).toBe(w.initial.revision + 3);
});
it('ownership refusal retains the undo until cancellation can actually be applied', async () => {
  const w = workspace();
  await w.action.run(append('mine'));
  w.own(false);
  expect(await w.action.cancel()).toBe(false);
  expect(w.action.hasPending()).toBe(true);
  expect(await w.action.run(append('second'))).toBe(false);
  w.own(true);
  expect(await w.action.cancel()).toBe(true);
  await w.retry();
  expect(w.disk()).toEqual(w.initial);
});
it('invalid replacement retains the old rollback instead of forgetting the failed append', async () => {
  const w = workspace();
  await w.action.run(append('mine'));
  expect(await w.action.run((data) => ({ ...data, templates: [...data.templates, data.templates[0]] }))).toBe(
    false,
  );
  expect(w.action.hasPending()).toBe(true);
  expect(await w.action.cancel()).toBe(true);
  await w.retry();
  expect(w.disk()).toEqual(w.initial);
});
it('a subsequent edit of an owned record is never overwritten by cancellation', async () => {
  const w = workspace();
  await w.action.run(append('mine'));
  await w.mutate((data) => ({
    ...data,
    templates: data.templates.map((t) => (t.id === 'mine' ? { ...t, name: 'external edit' } : t)),
  }));
  expect(await w.action.cancel()).toBe(false);
  expect(w.action.hasPending()).toBe(true);
  expect(w.current().templates.at(-1)?.name).toBe('external edit');
});
it('object property order is not a competing edit and never blocks cancellation', async () => {
  const w = workspace();
  await w.action.run(append('mine'));
  await w.mutate((data) => ({
    ...data,
    templates: data.templates.map((template) => {
      const { id, ...rest } = template;
      return { ...rest, id };
    }),
  }));
  expect(await w.action.cancel()).toBe(true);
  await w.retry();
  expect(w.disk()).toEqual(w.initial);
});
it('in-flight double submission is refused and cancel waits for the accepted operation', async () => {
  const initial = createInitialData();
  let current = initial;
  let release!: (value: boolean) => void;
  const action = createPendingMutation(
    async (fn) => {
      current = fn(current);
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    async () => true,
  );
  const first = action.run(append('one'));
  expect(await action.run(append('two'))).toBe(false);
  const cancel = action.cancel();
  release(true);
  expect(await first).toBe(true);
  expect(await cancel).toBe(true);
  expect(current.templates.map((t) => t.id)).toEqual([...initial.templates.map((t) => t.id), 'one']);
});
