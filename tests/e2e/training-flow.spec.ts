import { expect, test } from '@playwright/test';
import { enableStarterTemplate, expectPersisted, storedWorkspace } from './helpers';

test.use({ viewport: { width: 320, height: 568 }, hasTouch: true });

test('原图训练一键开练，轻量计时，换掉剩余组，重开续练并保存', async ({ page }, info) => {
  await page.goto('/mobile/#/plans?preset=photo-complete');
  await page.getByRole('button', { name: '开始第 1 天', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectPersisted(page, ({ sessions }) => sessions.length === 1 && sessions[0].exercises.length === 11);
  await page.getByRole('button', { name: '动作 1/11', exact: true }).tap();
  await page.locator('#workout-queue').getByRole('button', { name: /小龙门架平推/ }).tap();
  await expect(page.getByRole('heading', { name: '小龙门架平推', exact: true })).toBeVisible();
  await page.getByLabel('动作备注').fill('热身，滑轮档位 2');
  const rest = page.getByRole('region', { name: '组间休息' });
  const beforeRest = (await rest.boundingBox())!.height;
  await page.getByRole('button', { name: '完成小龙门架平推第1组', exact: true }).tap();
  await expect(rest).toHaveAttribute('data-rest-running', 'true');
  expect((await rest.boundingBox())!.height).toBeCloseTo(beforeRest, 0);
  await page.screenshot({ path: info.outputPath('320-timer.png'), animations: 'disabled' });
  await rest.getByRole('button', { name: '跳过休息', exact: true }).tap();
  await expect(rest).toHaveAttribute('data-rest-running', 'false');
  await expectPersisted(page, ({ sessions }) => sessions[0].exercises.some((item) => item.note === '热身，滑轮档位 2' && item.sets[0].status === 'completed'));
  const before = (await storedWorkspace(page)).sessions[0];
  const original = before.exercises.find(({ exercise }) => exercise.name === '小龙门架平推')!;
  await page.reload();
  await expect(page.getByRole('heading', { name: '小龙门架平推', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '换动作', exact: true }).tap();
  const picker = page.getByRole('dialog', { name: '替换剩余组', exact: true });
  await expect(picker).toContainText(/保留已完成 1 组/);
  await picker.getByRole('button', { name: /^弹力带平推.*模板替代/ }).tap();
  await expect(page.getByRole('heading', { name: '弹力带平推', exact: true })).toBeVisible();
  await expectPersisted(page, ({ sessions }) => sessions[0].exercises.length === before.exercises.length + 1);
  const replaced = (await storedWorkspace(page)).sessions[0];
  const index = replaced.exercises.findIndex(({ id }) => id === original.id);
  expect(replaced.exercises[index]).toEqual({ ...original, sets: [original.sets[0]] });
  expect(replaced.exercises[index + 1].sets).toHaveLength(original.sets.length - 1);
  expect(replaced.exercises[index + 1].sets.every(({ type, status }) => type === 'warmup' && status === 'pending')).toBe(true);
  await page.getByRole('button', { name: '结束训练', exact: true }).tap();
  await page.getByRole('button', { name: '保存已完成 1 组', exact: true }).tap();
  await expect(page).toHaveURL(/#\/progress$/);
  await expect(page.getByRole('region', { name: '本次训练' })).toContainText('完成 1 组');
  await expectPersisted(page, ({ sessions }) => sessions.length === 1 && sessions[0].status === 'completed');
  await page.getByText('补写训练备注', { exact: true }).tap();
  await page.getByRole('region', { name: '本次训练' }).getByLabel('训练备注').fill('下次继续这个重量');
  await page.getByRole('button', { name: '保存备注', exact: true }).tap();
  await expectPersisted(page, ({ sessions }) => sessions[0].note === '下次继续这个重量');
});

test('结束写入失败时保留草稿，重试只归档一场', async ({ page }) => {
  await page.goto('/mobile/#/plans?preset=photo-complete');
  await page.getByRole('button', { name: '开始第 1 天', exact: true }).tap();
  await page.getByRole('button', { name: '完成弹力带绕肩第1组', exact: true }).tap();
  await expectPersisted(page, ({ sessions }) => sessions[0].exercises[0].sets[0].status === 'completed');
  const before = (await storedWorkspace(page)).sessions[0];
  await page.getByRole('button', { name: '结束训练', exact: true }).tap();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name !== 'jianlibao') return put.apply(this, args);
      IDBObjectStore.prototype.put = put;
      throw new DOMException('Synthetic full disk', 'QuotaExceededError');
    };
  });
  const dialog = page.getByRole('dialog', { name: '结束训练', exact: true });
  const save = dialog.getByRole('button', { name: '保存已完成 1 组', exact: true });
  await save.tap();
  await expect(dialog.getByRole('alert')).toContainText('记录还在');
  expect((await storedWorkspace(page)).sessions).toEqual([before]);
  await save.tap();
  await expect(page).toHaveURL(/#\/progress$/);
  await expectPersisted(page, ({ sessions }) => sessions.length === 1 && sessions[0].id === before.id && sessions[0].status === 'completed');
});

test('今天展示排期，保留排期的替代动作并直接开始', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T08:00:00Z'));
  await page.goto('/mobile/#/plans?preset=photo-complete');
  await page.getByRole('button', { name: '弹力带平推', exact: true }).tap();
  await page.getByText('安排训练日期', { exact: true }).first().tap();
  const form = page.getByRole('form', { name: '安排原图三分化 · 胸＋肩中束＋二头' });
  await form.getByLabel('训练日期').fill('2026-11-11');
  await form.getByLabel('开始时间').fill('19:30');
  await form.getByRole('button', { name: '保存排期', exact: true }).tap();
  await expect(form.getByRole('status')).toContainText('已安排 2026-11-11 19:30');
  await page.getByRole('navigation', { name: '移动端导航' }).getByRole('button', { name: '今天' }).tap();
  await expect(page.getByText('今日排期 · 19:30', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始今天的训练', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectPersisted(page, ({ sessions }) => sessions.length === 1 &&
    sessions[0].exercises.some((item) => item.exercise.name === '弹力带平推' && item.sets.every(({ type }) => type === 'warmup')));
});

test('补练只结清选中的场次，今天的同模板排期仍可开练', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2026-11-12T08:00:00Z'));
  await enableStarterTemplate(page);
  const data = await storedWorkspace(page);
  const original = data.templates[0];
  original.items = [{ ...original.items[0], sets: 1 }];
  const second = { ...original, id: 'test-evening-template', name: '手臂训练' };
  data.templates = [original, second];
  data.schemaVersion = 3;
  data.trainingSchedule = [
    { id: 'test-missed', templateId: original.id, date: '2026-11-11', time: '19:00', choices: {}, lead: 15 },
    { id: 'test-today', templateId: original.id, date: '2026-11-12', time: '18:00', choices: {}, lead: 15 },
    { id: 'test-evening', templateId: second.id, date: '2026-11-12', time: '20:00', choices: {}, lead: 15 },
  ];
  await page.evaluate((workspace) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('jianlibao', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put(workspace, 'main');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), data);
  await page.reload();
  const upcoming = page.getByRole('region', { name: '训练安排' });
  await expect(upcoming).toContainText('20:00');
  await upcoming.getByRole('button', { name: '补练', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout$/);
  await expectPersisted(page, (latest) => latest.sessions[0]?.scheduleId === 'test-missed');
  await page.reload();
  await page.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).tap();
  await page.getByRole('button', { name: '结束训练', exact: true }).tap();
  await expect(page).toHaveURL(/#\/progress$/);
  const result = page.getByRole('region', { name: '本次训练' });
  await expect(result).toContainText('18:00');
  await result.getByRole('button', { name: '查看排期', exact: true }).tap();
  const schedule = page.getByRole('region', { name: '训练排期', exact: true });
  await expect(schedule.getByText('2026-11-11 · 19:00 · 已补练')).toBeInViewport();
  await expect(schedule.getByRole('button', { name: '补练', exact: true })).toHaveCount(0);
  await expect(schedule.getByText('2026-11-12 · 18:00 · 提前 15 分钟提醒')).toBeVisible();
  await page.screenshot({ path: info.outputPath('320-missed-session-completed.png'), animations: 'disabled' });
  await expectPersisted(page, (latest) => latest.schemaVersion === 4 && latest.sessions.length === 1 &&
    latest.sessions[0].status === 'completed' && latest.sessions[0].date === '2026-11-12' && latest.sessions[0].scheduleId === 'test-missed');
  expect((await storedWorkspace(page)).trainingSchedule).toEqual(data.trainingSchedule);
  const previous = await page.evaluate(() => new Promise<unknown>((resolve, reject) => {
    const open = indexedDB.open('jianlibao', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('workspace', 'readonly');
      const get = tx.objectStore('workspace').get('pre-schema-v4');
      tx.oncomplete = () => { db.close(); resolve(get.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
  expect(previous).toEqual(data);
  await schedule.getByRole('button', { name: '查看训练记录', exact: true }).tap();
  await expect(page.getByRole('dialog')).toContainText('杠铃深蹲');
  await page.goto('/mobile/#/plans?schedule=1');
  const next = schedule.getByRole('listitem').filter({ hasText: '2026-11-12 · 18:00' });
  await next.getByRole('button', { name: '按排期开练', exact: true }).tap();
  await expectPersisted(page, (latest) => latest.sessions.length === 2 && latest.sessions[1].scheduleId === 'test-today');
});
