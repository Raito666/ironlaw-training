import { selectChoice } from './choice-helpers';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, appendFile } from 'node:fs/promises';
import { join as joinPath } from 'node:path';
import { getE2ERunDirectory } from '../../scripts/e2e-output.mjs';
import { createSyncHandler } from '../../netlify/functions/lib/sync-handler.mjs';
import { credentials } from '../../src/sync/crypto';
import { storedWorkspace, backupFile } from './helpers';
import { trainingScheduleKey } from '../../src/features/plans/schedule';

const folder = joinPath(getE2ERunDirectory(), 'cloud-sync');
const live = process.env.JLB_CLOUD_LIVE === '1';
// Playwright cannot intercept Service Worker-owned requests in WebKit. Block it
// only in this local mocked-API lane; the live cloud lane retains the real SW.
const serviceWorkers = live ? 'allow' : 'block';
test.use({ serviceWorkers });
type Saved = { data: unknown; etag: string; metadata: Record<string, unknown> };
function fakeCloud() {
  const values = new Map<string, Saved>(); let sequence = 0;
  return createSyncHandler(() => ({
    async getWithMetadata(key: string) { return values.get(key) ?? null; },
    async setJSON(key: string, data: unknown, options: { onlyIfNew?: boolean; onlyIfMatch?: string }) {
      const previous = values.get(key);
      if (options.onlyIfNew ? !!previous : previous?.etag !== options.onlyIfMatch) return { modified: false };
      const etag = `"test-${++sequence}"`; values.set(key, { data, etag, metadata: {} }); return { modified: true, etag };
    },
  }));
}
async function route(context: BrowserContext, handler: ReturnType<typeof fakeCloud>) {
  if (live) return;
  await context.route('**/.netlify/functions/sync', async intercepted => {
    const req = intercepted.request();
    const response = await handler(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.postData() ? { body: req.postData()! } : {}) }));
    await intercepted.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
}
async function settings(page: Page) {
  await page.goto('/#/settings');
  await expect(page.getByRole('button', { name: '创建加密同步', exact: true })).toBeEnabled();
}
async function create(page: Page) {
  await page.getByRole('button', { name: '创建加密同步', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '创建加密同步', exact: true });
  const key = await dialog.getByLabel('同步密钥', { exact: true }).inputValue();
  if (live) { await mkdir(folder, { recursive: true }); await appendFile(`${folder}/synthetic-vault-cleanup.jsonl`, JSON.stringify({ key: `vault-${(await credentials(key)).id}` }) + '\n'); }
  await dialog.getByRole('checkbox', { name: '我已将同步密钥保存在安全位置' }).check();
  await dialog.getByRole('button', { name: '开启同步', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await sync(page); return key;
}
async function join(page: Page, key: string) {
  await settings(page);
  await page.getByRole('button', { name: '连接已有同步', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '连接已有同步', exact: true });
  await dialog.getByLabel('同步密钥', { exact: true }).fill(key);
  await dialog.getByRole('button', { name: '连接并合并', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await sync(page);
}
async function sync(page: Page) {
  const button = page.getByRole('button', { name: '立即同步', exact: true });
  await expect(button).toBeEnabled(); await button.click();
  await expect(page.locator('.cloud-status')).toContainText('最近同步', { timeout: 25000 });
  await expect(page.locator('.cloud-sync [role=alert]')).toHaveCount(0);
}
async function body(page: Page, weight: number, date = '2026-10-26') {
  const data = await storedWorkspace(page);
  if (data.bodyMetrics.some(m => m.date === date)) await page.getByRole('button', { name: `编辑${date}身体记录`, exact: true }).click();
  else await page.getByRole('button', { name: '记录身体数据', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /身体记录|身体数据/ });
  await dialog.getByLabel('记录日期', { exact: true }).fill(date);
  await dialog.getByLabel('体重 (kg)', { exact: true }).fill(String(weight));
  await dialog.getByLabel('备注（可选）', { exact: true }).fill('加密同步回归；正文保留在私人空间');
  await dialog.getByRole('button', { name: '保存身体记录', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await storedWorkspace(page)).bodyMetrics.find(m => m.date === date)?.weightKg).toBe(weight);
}

test('排期双设备迁移、整套每周重复、改期和取消同步', async ({ browser, baseURL }) => {
  test.setTimeout(150000);
  const handler = fakeCloud();
  const a = await browser.newContext({ baseURL, serviceWorkers, viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Shanghai' });
  const b = await browser.newContext({ baseURL, serviceWorkers, viewport: { width: 320, height: 760 }, hasTouch: true, timezoneId: 'Asia/Shanghai' });
  await route(a, handler); await route(b, handler);
  const pa = await a.newPage(), pb = await b.newPage();
  const oldEntry = { id: 'legacy-schedule-01', templateId: 'preset-full-full', date: '2030-02-01', time: '18:00', lead: 15, choices: {} };
  const plans = '/mobile/#/plans?preset=photo-complete';
  const count = (page: Page) => expect.poll(async () => (await storedWorkspace(page)).trainingSchedule?.length ?? 0, { timeout: 30_000 });
  const finishSync = async (page: Page) => {
    await page.goto('/#/settings');
    await sync(page);
    await expect(page.getByRole('button', { name: '立即同步', exact: true })).toBeEnabled();
  };
  try {
    await settings(pa); await body(pa, 70); const key = await create(pa); await join(pb, key);
    await pa.evaluate(([key, entry]) => localStorage.setItem(key as string, JSON.stringify([entry])), [trainingScheduleKey, oldEntry]);
    await pa.goto(plans);
    await count(pa).toBe(1);
    await expect.poll(() => pa.evaluate((key) => localStorage.getItem(key), trainingScheduleKey)).toBeNull();
    const panel = pa.getByRole('region', { name: '精选分化模板' });
    await panel.getByRole('button', { name: '弹力带平推', exact: true }).click();
    await panel.getByText('安排整套模板', { exact: true }).click();
    const form = panel.getByRole('form', { name: '安排整套模板' });
    await form.getByLabel(/首周第 1 天/).fill('2030-02-04');
    await form.getByLabel(/首周第 2 天/).fill('2030-02-07');
    await form.getByLabel(/每周重复/).selectOption('2');
    await form.getByRole('button', { name: '保存排期' }).click();
    await expect(form.getByRole('status')).toContainText('已安排 6 场训练');
    await count(pa).toBe(7);
    await finishSync(pa); await finishSync(pb); await count(pb).toBe(7);
    const records = (await storedWorkspace(pb)).trainingSchedule!;
    const first = records.find((entry) => entry.date === '2030-02-04')!;
    expect(first.choices).toEqual({ 'preset-photo-complete-chest/reference-high-cable-chest-press': 'reference-band-chest-press' });
    expect(records.map(({ date }) => date).sort()).toEqual(['2030-02-01', '2030-02-04', '2030-02-07', '2030-02-08', '2030-02-11', '2030-02-14', '2030-02-15']);
    await pb.goto(plans);
    const schedule = pb.getByRole('region', { name: '训练排期' });
    const firstCard = schedule.getByRole('listitem').filter({ hasText: '2030-02-04' });
    await firstCard.getByText('改期', { exact: true }).click();
    await firstCard.getByLabel('训练日期', { exact: true }).fill('2030-02-05');
    expect(await schedule.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await firstCard.getByRole('button', { name: '保存改期' }).click();
    await expect(schedule.getByText('2030-02-05 · 19:00 · 提前 15 分钟提醒')).toBeVisible();
    await schedule.getByRole('listitem').filter({ hasText: '2030-02-14' }).getByRole('button', { name: '取消这场排期' }).click();
    await count(pb).toBe(6);
    await finishSync(pb); await finishSync(pa); await count(pa).toBe(6);
    const desktop = await storedWorkspace(pa);
    expect(desktop.trainingSchedule?.find(({ id }) => id === first.id)).toEqual({ ...first, date: '2030-02-05' });
    expect(desktop.trainingSchedule?.some(({ date }) => date === '2030-02-14')).toBe(false);
    expect(desktop.bodyMetrics[0]?.weightKg).toBe(70);
    await pa.reload(); await count(pa).toBe(6);
  } finally { await a.close(); await b.close(); }
});

test('两台设备往返同步、刷新恢复和密钥隔离', async ({ browser, baseURL }) => {
  test.setTimeout(90000);
  const handler = fakeCloud(), a = await browser.newContext({ baseURL, serviceWorkers, viewport: { width: 390, height: 844 }, hasTouch: true }), b = await browser.newContext({ baseURL, serviceWorkers, viewport: { width: 320, height: 700 }, hasTouch: true });
  await route(a, handler); await route(b, handler);
  const pa = await a.newPage(), pb = await b.newPage();
  try {
    await settings(pa); await body(pa, 70); const secret = await create(pa);
    await join(pb, secret);
    await expect.poll(async () => (await storedWorkspace(pb)).bodyMetrics[0]?.weightKg).toBe(70);
    await body(pb, 71); await sync(pb); await sync(pa);
    await expect.poll(async () => (await storedWorkspace(pa)).bodyMetrics[0]?.weightKg).toBe(71);
    const original = await storedWorkspace(pa); await pa.reload();
    await expect(pa.getByRole('button', { name: '立即同步', exact: true })).toBeEnabled();
    expect(await storedWorkspace(pa)).toEqual(original);
    const download = pa.waitForEvent('download'); await pa.getByRole('button', { name: '导出备份', exact: true }).click();
    const file = await download, text = await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8');
    expect(text).not.toContain(secret); expect(JSON.parse(text).formatVersion).toBe(2);
    const outsider = await browser.newContext({ baseURL, serviceWorkers }); await route(outsider, handler);
    const pc = await outsider.newPage(); await settings(pc); await create(pc);
    expect((await storedWorkspace(pc)).bodyMetrics).toEqual([]); await outsider.close();
    await mkdir(`${folder}/${live ? 'live' : 'local'}`, { recursive: true });
    await pa.screenshot({ path: `${folder}/${live ? 'live' : 'local'}/two-device-sync.png`, fullPage: true });
  } finally { await a.close(); await b.close(); }
});

test('离线编辑互不覆盖，冲突逐条选择并保留删除语义', async ({ browser, baseURL }) => {
  test.setTimeout(120000);
  const handler = fakeCloud(), a = await browser.newContext({ baseURL, serviceWorkers }), b = await browser.newContext({ baseURL, serviceWorkers });
  await route(a, handler); await route(b, handler);
  const pa = await a.newPage(), pb = await b.newPage();
  try {
    await settings(pa); await body(pa, 70); const key = await create(pa); await join(pb, key);
    await a.setOffline(true); await b.setOffline(true);
    await body(pa, 72); await body(pb, 74);
    await a.setOffline(false); await sync(pa); await b.setOffline(false);
    await pb.getByRole('button', { name: '立即同步', exact: true }).click();
    await expect(pb.locator('.cloud-status')).toContainText('需要选择版本');
    expect((await storedWorkspace(pb)).bodyMetrics[0].weightKg).toBe(74);
    expect((await storedWorkspace(pa)).bodyMetrics[0].weightKg).toBe(72);
    await selectChoice(pb, '2026-10-26 身体记录 保留版本', 'local');
    await pb.getByRole('button', { name: '合并并同步', exact: true }).click();
    await expect(pb.locator('.cloud-status')).toContainText('最近同步'); await sync(pa);
    expect((await storedWorkspace(pa)).bodyMetrics[0].weightKg).toBe(74);
    await pb.getByRole('button', { name: '删除2026-10-26身体记录', exact: true }).click();
    const remove = pb.getByRole('dialog'); await remove.getByRole('button', { name: '确认删除身体记录', exact: true }).click();
    await expect(remove).not.toBeVisible(); await sync(pb); await sync(pa);
    expect((await storedWorkspace(pa)).bodyMetrics).toEqual([]);
    // A newly connected old backup has no common base: cloud deletion evidence
    // must still prevent silent resurrection.
    const c = await browser.newContext({ baseURL, serviceWorkers }); await route(c, handler);
    try {
      const pc = await c.newPage(); await settings(pc); await body(pc, 69);
      await pc.getByRole('button', { name: '连接已有同步', exact: true }).click();
      const dialog = pc.getByRole('dialog'); await dialog.getByLabel('同步密钥', { exact: true }).fill(key);
      await dialog.getByRole('button', { name: '连接并合并', exact: true }).click();
      await expect(dialog).not.toBeVisible(); await pc.getByRole('button', { name: '立即同步', exact: true }).click();
      await expect(pc.locator('.cloud-status')).toContainText('需要选择版本');
      expect((await storedWorkspace(pc)).bodyMetrics[0].weightKg).toBe(69);
      await selectChoice(pc, '2026-10-26 身体记录 保留版本', 'remote');
      await pc.getByRole('button', { name: '合并并同步', exact: true }).click();
      await expect.poll(async () => (await storedWorkspace(pc)).bodyMetrics.length).toBe(0);
    } finally { await c.close(); }
  } finally { await a.close(); await b.close(); }
});

test('断开保留记录，错误密钥不会创建新空间，取消连接不修改数据', async ({ page, context }) => {
  const handler = fakeCloud(); await route(context, handler); await settings(page); await body(page, 73);
  const before = await storedWorkspace(page);
  await page.getByRole('button', { name: '连接已有同步', exact: true }).click();
  let dialog = page.getByRole('dialog'); await dialog.getByLabel('同步密钥', { exact: true }).fill('JLB1-' + 'A'.repeat(43));
  await dialog.getByRole('button', { name: '连接并合并', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('未找到');
  await dialog.getByRole('button', { name: '取消', exact: true }).click(); expect(await storedWorkspace(page)).toEqual(before);
  await create(page);
  await page.getByRole('button', { name: '断开本机同步', exact: true }).click();
  dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: '确认断开', exact: true }).click();
  await expect(page.getByRole('button', { name: '创建加密同步', exact: true })).toBeEnabled();
  expect(await storedWorkspace(page)).toEqual(before); await page.reload();
  await expect(page.getByRole('button', { name: '创建加密同步', exact: true })).toBeEnabled();
});

test('归档训练、动作和模板完整同步，接收设备的草稿和偏好保持', async ({ browser, baseURL }) => {
  test.setTimeout(90000);
  const handler = fakeCloud(), a = await browser.newContext({ baseURL, serviceWorkers }), b = await browser.newContext({ baseURL, serviceWorkers });
  await route(a, handler); await route(b, handler);
  const pa = await a.newPage(), pb = await b.newPage();
  try {
    await settings(pa); const key = await create(pa);
    await pa.goto('/'); await pa.getByRole('button', { name: '开始今天的训练', exact: true }).click();
    await pa.getByRole('button', { name: '确认开始训练', exact: true }).click();
    await pa.getByLabel('杠铃深蹲第1组总重量', { exact: true }).fill('60');
    await pa.getByLabel('杠铃深蹲第1组次数', { exact: true }).fill('10');
    await pa.getByRole('button', { name: '完成杠铃深蹲第1组', exact: true }).click();
    await pa.getByRole('button', { name: '提前回顾', exact: true }).click();
    await pa.getByRole('button', { name: '保存训练', exact: true }).click();
    await expect.poll(async () => (await storedWorkspace(pa)).sessions[0]?.status).toBe('completed');
    await pa.goto('/#/settings');
    const incoming = await storedWorkspace(pa);
    incoming.exercises.push({ ...incoming.exercises[0], id: 'sync-custom', name: '同步验证动作' });
    incoming.templates.push({ ...incoming.templates[0], id: 'sync-template', name: '同步验证模板', items: [{ ...incoming.templates[0].items[0], exerciseId: 'sync-custom' }] });
    await pa.getByLabel('选择健力宝备份文件').setInputFiles(backupFile(incoming));
    await pa.getByRole('button', { name: '确认导入', exact: true }).click();
    await expect(pa.getByRole('dialog')).not.toBeVisible(); await sync(pa);
    const original = await storedWorkspace(pa);
    await pb.goto('/'); await pb.getByRole('button', { name: '开始今天的训练', exact: true }).click();
    await pb.getByRole('button', { name: '确认开始训练', exact: true }).click();
    const beforeJoin = await storedWorkspace(pb), draft = beforeJoin.sessions[0];
    await join(pb, key);
    const received = await storedWorkspace(pb);
    expect(received.sessions.find(s => s.id === original.sessions[0].id)).toEqual(original.sessions[0]);
    expect(received.sessions.find(s => s.id === draft.id)).toEqual(draft);
    expect(received.exercises).toContainEqual(incoming.exercises.at(-1));
    expect(received.templates).toContainEqual(incoming.templates.at(-1));
    expect(received.settings).toEqual(beforeJoin.settings);
    await pb.reload(); expect((await storedWorkspace(pb)).sessions).toEqual(received.sessions);
  } finally { await a.close(); await b.close(); }
});

for (const width of [320, 390, 768, 1440]) for (const theme of ['dark', 'light'] as const) {
  test(`云同步入口和密钥对话框 ${width}px ${theme}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 }); await route(context, fakeCloud()); await settings(page);
    await selectChoice(page, '界面主题', theme);
    const section = page.locator('.cloud-sync'); await section.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const button of await section.getByRole('button').all()) {
      const box = (await button.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await mkdir(`${folder}/matrix`, { recursive: true });
    await page.screenshot({ path: `${folder}/matrix/${width}-${theme}-settings.png`, fullPage: true });
    await page.getByRole('button', { name: '创建加密同步', exact: true }).click();
    const dialog = page.getByRole('dialog'), input = dialog.getByLabel('同步密钥', { exact: true });
    await expect.poll(() => dialog.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    const box = (await input.boundingBox())!, area = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(area.x); expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
    await expect(dialog.getByRole('button', { name: '开启同步', exact: true })).toBeDisabled();
    await page.screenshot({ path: `${folder}/matrix/${width}-${theme}-key.png` });
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    expect((await storedWorkspace(page)).bodyMetrics).toEqual([]);
  });
}
