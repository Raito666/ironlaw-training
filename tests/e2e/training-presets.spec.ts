import { expect, test } from '@playwright/test';
import { expectPersisted, storedWorkspace } from './helpers';

test('参考图三分化加入后可重开和开始训练，旧内置模板不再显示', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/mobile/#/plans');
  const presets = page.getByRole('region', { name: '精选分化模板' });
  const add = presets.getByRole('button', { name: '加入我的模板', exact: true });
  await expect(add).toBeEnabled();
  const before = await storedWorkspace(page);
  await expect(page.locator('.template-card')).toHaveCount(0);
  await page.getByRole('button', { name: '查看已归档模板' }).click();
  await expect(page.locator('.template-card')).toHaveCount(0);
  await page.getByRole('button', { name: '隐藏已归档模板' }).click();

  await presets.getByRole('button', { name: '三分化', exact: true }).click();
  await expect(presets.getByText('第 1 天 · 胸＋肩中束＋二头', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1050 });
  await presets.screenshot({ path: info.outputPath('reference-three-day-390.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await presets.getByRole('button', { name: '推／拉／腿', exact: true }).click();
  await expect(presets.getByText('第 1 天 · 推', { exact: true })).toBeVisible();
  await presets.getByRole('button', { name: '胸臂／背臂／肩腿', exact: true }).click();
  await add.click();
  await expect(presets.getByRole('button', { name: '已加入我的模板' })).toBeDisabled();
  await expectPersisted(page, (data) => data.templates.length === before.templates.length + 3);
  expect((await storedWorkspace(page)).templates.slice(0, before.templates.length)).toEqual(before.templates);

  await page.reload();
  await presets.getByRole('button', { name: '三分化', exact: true }).click();
  await expect(presets.getByRole('button', { name: '已加入我的模板' })).toBeDisabled();
  await presets.getByRole('button', { name: '开始第 1 天' }).click();
  await expect(page.getByRole('dialog', { name: '三分化 · 胸＋肩中束＋二头' })).toBeVisible();
  await page.getByRole('button', { name: '确认开始训练', exact: true }).click();
  await expect(page).toHaveURL(/#\/workout$/);
  await expectPersisted(page, (data) => data.sessions.some((session) =>
    session.templateId === 'preset-photo-chest' && session.exercises.length === 4));
});

test('手机预览可不保存模板直接开练', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/mobile/#/plans');
  const presets = page.getByRole('region', { name: '精选分化模板' });
  await presets.getByRole('button', { name: '二分化', exact: true }).click();
  const before = await storedWorkspace(page);
  await presets.getByRole('button', { name: '开始第 1 天', exact: true }).click();
  await page.getByRole('button', { name: '确认开始训练', exact: true }).click();
  await expect(page).toHaveURL(/#\/workout$/);
  await expectPersisted(page, (data) => data.sessions.length === 1 && data.sessions[0].exercises.length > 0);
  expect((await storedWorkspace(page)).templates).toEqual(before.templates);
});

test('320px 原图完整版可预览热身、选择替代动作、加入并开练', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/mobile/#/plans');
  const panel = page.getByRole('region', { name: '精选分化模板' });
  await panel.getByRole('button', { name: '三分化', exact: true }).click();
  await panel.getByRole('button', { name: '谭成义三分化 · 原图完整版', exact: true }).click();
  await expect(panel.getByRole('heading', { name: '热身与激活' })).toBeVisible();
  await expect(panel.getByText('4 热身 · 7 正式', { exact: true }).first()).toBeVisible();
  await panel.getByRole('button', { name: '弹力带平推', exact: true }).click();
  await expect(panel.getByRole('button', { name: '弹力带平推', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await panel.screenshot({ path: info.outputPath('photo-complete-320.png'), animations: 'disabled' });
  await panel.getByRole('button', { name: '加入我的模板' }).click();
  await expectPersisted(page, (data) => data.templates.some((template) => template.id === 'preset-photo-complete-chest' && template.items[2].exerciseId === 'reference-band-chest-press'));
  await panel.getByRole('button', { name: '开始第 1 天' }).click();
  await page.getByRole('button', { name: '确认开始训练', exact: true }).click();
  await expect(page).toHaveURL(/#\/workout$/);
  await expectPersisted(page, (data) => data.sessions.some((session) => session.templateId === 'preset-photo-complete-chest' &&
    session.exercises.length === 11 && session.exercises[2].sets.every((set) => set.type === 'warmup') &&
    session.exercises[4].sets.every((set) => set.type === 'work')));
});

test('二分化可切换循证入门和力量 A／B', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/mobile/#/plans');
  const panel = page.getByRole('region', { name: '精选分化模板' });
  await panel.getByRole('button', { name: '二分化', exact: true }).click();
  await panel.getByRole('button', { name: '循证入门 · 全身 A／B', exact: true }).click();
  await expect(panel.getByText('第 1 天 · 全身 A · 蹲和推', { exact: true })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'ACSM 2026 抗阻训练立场声明' })).toBeVisible();
  await panel.getByRole('button', { name: '加入我的模板', exact: true }).click();
  await expectPersisted(page, (data) => data.templates.filter((template) => template.id.startsWith('preset-evidence-foundation-')).length === 2);
  await panel.getByRole('button', { name: '循证力量 · 全身 A／B', exact: true }).click();
  await panel.getByText('第 2 天 · 力量 B · 硬拉和推举', { exact: true }).click();
  await panel.getByRole('button', { name: '开始第 2 天' }).click();
  await page.getByRole('button', { name: '确认开始训练', exact: true }).click();
  await expect(page).toHaveURL(/#\/workout$/);
  await expectPersisted(page, (data) => data.sessions.some((session) => session.templateId === 'preset-evidence-strength-b' && session.restDuration === 180));
});

test('原图直达、详细说明和手机训练排期可重开、提醒并按备选开练', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.clock.setFixedTime(new Date('2026-11-11T08:00:00Z'));
  await page.goto('/mobile/#/plans?preset=photo-complete');
  const panel = page.getByRole('region', { name: '精选分化模板' });
  await expect(panel.getByRole('button', { name: '谭成义三分化 · 原图完整版' })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByText('查看这套模板的详细说明', { exact: true }).click();
  await expect(panel.getByText('怎么进阶', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '弹力带平推', exact: true }).click();
  await panel.getByText('安排训练日期', { exact: true }).first().click();
  const form = panel.getByRole('form', { name: '安排原图三分化 · 胸＋肩中束＋二头' });
  await form.getByLabel('训练日期').fill('2026-11-11');
  await form.getByLabel('开始时间').fill('19:30');
  await form.getByLabel('提醒时间').selectOption('30');
  expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await form.getByRole('button', { name: '保存排期' }).click();
  await expect(form.getByRole('status')).toContainText('已安排 2026-11-11 19:30');
  await page.clock.setFixedTime(new Date('2026-11-11T11:00:00Z'));
  await page.reload();
  await expect(page.getByRole('complementary', { name: '训练提醒' })).toBeVisible();
  const schedule = page.getByRole('region', { name: '训练排期' });
  await expect(schedule.getByText('2026-11-11 · 19:30 · 提前 30 分钟提醒')).toBeVisible();
  await expect(schedule.getByRole('link', { name: '用 Google 日历添加' })).toHaveAttribute('href', /calendar\.google\.com.*20261111T113000Z/);
  if (browserName === 'chromium') {
    const download = page.waitForEvent('download');
    await schedule.getByRole('button', { name: '下载日历提醒' }).click();
    expect((await download).suggestedFilename()).toBe('铁律训练.ics');
  }
  await schedule.getByRole('button', { name: '按排期开练' }).click();
  await page.getByRole('button', { name: '确认开始训练', exact: true }).click();
  await expect(page).toHaveURL(/#\/workout$/);
  await expectPersisted(page, (data) => data.sessions.some((session) => session.templateId === 'preset-photo-complete-chest' &&
    session.exercises[2].exercise.id === 'reference-band-chest-press' && session.exercises[2].sets.every((set) => set.type === 'warmup')));
  await page.goto('/mobile/#/plans?preset=photo-complete');
  await expect(page.getByRole('complementary', { name: '训练提醒' })).toHaveCount(0);
  await expect(schedule.getByText('2026-11-11 · 19:30 · 当天已有训练')).toBeVisible();
  await schedule.getByRole('button', { name: '取消这场排期' }).click();
  await expect(schedule).toHaveCount(0);
});

test('四宽度深浅主题下可预览五分化，分化按钮保留触控区域', async ({ page }, info) => {
  await page.goto('/#/plans');
  const presets = page.getByRole('region', { name: '精选分化模板' });
  const five = presets.getByRole('button', { name: '五分化', exact: true });
  await five.click();
  await expect(presets.getByText('第 5 天 · 手臂', { exact: true })).toBeVisible();
  for (const theme of ['dark', 'light']) {
    const root = page.locator('html');
    if (await root.getAttribute('data-theme') !== theme) {
      await page.getByRole('button', { name: '切换主题', exact: true }).click();
    }
    await expect(root).toHaveAttribute('data-theme', theme);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(five).toHaveAttribute('aria-pressed', 'true');
      expect((await five.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      const overflow = await presets.evaluate((section) => section.scrollWidth - section.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await presets.screenshot({ path: info.outputPath('presets-' + width + '-' + theme + '.png'), animations: 'disabled' });
    }
  }
});
