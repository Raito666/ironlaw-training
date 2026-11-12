import { selectChoice } from './choice-helpers';
import { expect, test, type Page } from '@playwright/test';
import { enableStarterTemplate, expectPersisted, storedWorkspace } from './helpers';
import { readFile } from 'node:fs/promises';
import { exportTemplate } from '../../src/features/portable-content';

async function failWorkspaceWrite(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name !== 'jianlibao') return put.apply(this, args);
      IDBObjectStore.prototype.put = put;
      throw new DOMException('Synthetic full disk', 'QuotaExceededError');
    };
  });
}

async function ready(page: Page) {
  await enableStarterTemplate(page);
}
async function nav(page: Page, name: string) {
  await page
    .getByRole('navigation', {
      name: page.viewportSize()!.width < 768 ? '移动端导航' : '主导航',
      exact: true,
    })
    .getByRole('button', { name, exact: true })
    .click();
}
test('大目录只读浏览、准确文字讲解、收藏按需保存和离线重开', async ({ page, context }) => {
  await ready(page);
  const original = await storedWorkspace(page);
  await nav(page, '动作');
  await expect(page.locator('.library-intro')).toContainText('5632 个扩展动作');
  expect((await storedWorkspace(page)).exercises).toEqual(original.exercises);
  await expect(page.locator('.movement-card')).toHaveCount(24);
  await page.getByLabel('搜索动作', { exact: true }).fill('3/4 sit-up');
  await page.getByRole('button', { name: '查看3/4仰卧起坐讲解', exact: true }).click();
  await expect(page.locator('.opengym-explanation')).toContainText('动作要点');
  await expect(page.locator('.opengym-explanation li')).toHaveCount(3);
  await expect(page.locator('.opengym-explanation img, .opengym-explanation video')).toHaveCount(0);
  await page.getByRole('tab', { name: '详细讲解', exact: true }).click();
  await expect(page.locator('.content-attribution')).toContainText('MIT');
  await page.getByRole('button', { name: '收藏动作', exact: true }).click();
  await expectPersisted(
    page,
    (data) =>
      data.exercises.length === original.exercises.length + 1 &&
      data.settings.favoriteExerciseIds!.includes('og:0001'),
  );
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.library-intro')).toContainText('5632 个扩展动作');
  await page.getByLabel('搜索动作', { exact: true }).fill('3/4 sit-up');
  await page.getByRole('button', { name: '查看3/4仰卧起坐讲解', exact: true }).click();
  await expect(page.locator('.opengym-explanation li').first()).toBeVisible();
  expect((await storedWorkspace(page)).sessions).toEqual(original.sessions);
});
test('扩展动作加入模板、取消不落盘、保存训练快照并刷新保留', async ({ page }) => {
  await ready(page);
  const original = await storedWorkspace(page);
  await nav(page, '计划');
  await page.getByRole('button', { name: '新建模板', exact: true }).click();
  await page.getByLabel('模板名称', { exact: true }).fill('扩展目录训练');
  await page.getByLabel('搜索可选动作', { exact: true }).fill('3/4 sit-up');
  await expect(page.getByRole('button', { name: '加入动作', exact: true })).toBeDisabled();
  await selectChoice(page, '选择加入模板的动作', 'og:0001');
  await page.getByRole('button', { name: '加入动作', exact: true }).click();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  expect((await storedWorkspace(page)).exercises).toEqual(original.exercises);
  await page.getByRole('button', { name: '新建模板', exact: true }).click();
  await page.getByLabel('模板名称', { exact: true }).fill('扩展目录训练');
  await page.getByLabel('搜索可选动作', { exact: true }).fill('3/4 sit-up');
  await selectChoice(page, '选择加入模板的动作', 'og:0001');
  await page.getByRole('button', { name: '加入动作', exact: true }).click();
  await page.getByRole('button', { name: '保存模板', exact: true }).click();
  await expectPersisted(
    page,
    (data) =>
      data.templates.some((template) => template.name === '扩展目录训练') &&
      data.exercises.some((exercise) => exercise.id === 'og:0001'),
  );
  await page.getByRole('button', { name: '开练 · 扩展目录训练', exact: true }).click();
  await page.getByRole('button', { name: '完成3/4仰卧起坐第1组', exact: true }).click();
  await expectPersisted(page, (data) => data.sessions[0]?.exercises[0]?.sets[0]?.status === 'completed');
  await page.reload();
  await expectPersisted(
    page,
    (data) =>
      data.sessions[0]?.exercises[0]?.exercise.id === 'og:0001' &&
      data.sessions[0].exercises[0].sets[0].status === 'completed',
  );
});
test('训练工具预览不写数据，显式插入只增加待确认热身组', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '开始今天的训练', exact: true }).click();
  await page.getByLabel('杠铃深蹲第1组总重量', { exact: true }).fill('80');
  const before = await storedWorkspace(page);
  await page.getByRole('button', { name: '训练辅助', exact: true }).click();
  await page.getByRole('button', { name: '热身', exact: true }).click();
  await page.getByLabel('正式总重量（kg）', { exact: true }).fill('80');
  await page.getByLabel('空杠 / 起始重量（kg）', { exact: true }).fill('20');
  expect((await storedWorkspace(page)).sessions).toEqual(before.sessions);
  await page.getByRole('button', { name: '插入 3 个热身组', exact: true }).click();
  await expectPersisted(
    page,
    (data) => data.sessions[0].exercises[0].sets.filter((set) => set.type === 'warmup').length === 3,
  );
  const after = (await storedWorkspace(page)).sessions[0].exercises[0].sets;
  expect(after.slice(3)).toEqual(before.sessions[0].exercises[0].sets);
  expect(after.slice(0, 3).every((set) => set.status === 'pending')).toBe(true);
});
test('模板分享可往返导入，打印版无脚本及远程依赖', async ({ page }) => {
  await ready(page);
  await nav(page, '计划');
  const original = await storedWorkspace(page);
  const card = page.locator('.template-card').first();
  const pending = page.waitForEvent('download');
  await card.getByRole('button', { name: '分享模板', exact: true }).click();
  const file = await pending;
  const path = await file.path();
  const json = await readFile(path!, 'utf8');
  expect(JSON.parse(json).template).toEqual(original.templates[0]);
  await page
    .getByLabel('导入训练模板文件', { exact: true })
    .setInputFiles({ name: 'template.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.getByRole('button', { name: '作为新模板导入', exact: true }).click();
  await expectPersisted(
    page,
    (data) =>
      data.templates.length === original.templates.length + 1 &&
      JSON.stringify(data.sessions) === JSON.stringify(original.sessions),
  );
  const printPending = page.waitForEvent('download');
  await card.getByRole('button', { name: '导出打印版', exact: true }).click();
  const print = await printPending;
  expect(await readFile((await print.path())!, 'utf8')).toContain('@media print');
});
for (const operation of ['warmups', 'exercise', 'replace', 'import'] as const)
  for (const outcome of ['retry', 'cancel'] as const)
    test(`写盘失败后${operation}的${outcome}不重复、不偷偷提交，重开保留`, async ({ page }) => {
      await ready(page);
      if (operation === 'import') await nav(page, '计划');
      else {
        await page.getByRole('button', { name: '开始今天的训练', exact: true }).click();
        await expectPersisted(page, (data) => data.sessions.length === 1);
      }
      const before = await storedWorkspace(page);
      if (operation === 'warmups') {
        await page.getByRole('button', { name: '训练辅助', exact: true }).click();
        await page.getByRole('button', { name: '热身', exact: true }).click();
        await page.getByLabel('正式总重量（kg）', { exact: true }).fill('80');
        await page.getByLabel('空杠 / 起始重量（kg）', { exact: true }).fill('20');
      } else if (operation === 'exercise') {
        await page.getByRole('button', { name: '添加动作', exact: true }).click();
        await page.getByLabel('搜索可选动作', { exact: true }).fill('3/4 sit-up');
        await selectChoice(page, '选择动作', 'og:0001');
      } else if (operation === 'replace') {
        await page.getByRole('button', { name: '换动作', exact: true }).click();
        await page.getByLabel('搜索替代动作', { exact: true }).fill('3/4 sit-up');
      } else {
        await page.getByLabel('导入训练模板文件', { exact: true }).setInputFiles({
          name: 'synthetic-template.json',
          mimeType: 'application/json',
          buffer: Buffer.from(exportTemplate(before.templates[0], before.exercises)),
        });
      }
      const submit = page.getByRole('button', {
        name:
          operation === 'warmups'
            ? '插入 3 个热身组'
            : operation === 'exercise'
              ? '加入训练'
              : operation === 'replace'
                ? /^3\/4仰卧起坐\s/
                : '作为新模板导入',
        exact: true,
      });
      await failWorkspaceWrite(page);
      await submit.click();
      const panel = operation === 'warmups'
        ? page.getByRole('region', { name: '训练工具', exact: true })
        : page.getByRole('dialog');
      await expect(panel.getByRole('alert')).toContainText('未保存');
      expect(await storedWorkspace(page)).toEqual(before);
      if (outcome === 'retry') {
        await (operation === 'exercise' || operation === 'replace'
          ? panel.getByRole('button', { name: '重试保存动作', exact: true })
          : submit).click();
        await expectPersisted(page, (data) =>
          operation === 'warmups'
            ? data.sessions[0].exercises[0].sets.length === before.sessions[0].exercises[0].sets.length + 3
            : operation === 'exercise'
              ? data.sessions[0].exercises.length === before.sessions[0].exercises.length + 1
              : operation === 'replace'
                ? data.sessions[0].exercises[0].exercise.id === 'og:0001'
                : data.templates.length === before.templates.length + 1,
        );
        const after = await storedWorkspace(page);
        expect(after.bodyMetrics).toEqual(before.bodyMetrics);
        if (operation === 'warmups')
          expect(after.sessions[0].exercises[0].sets.slice(3)).toEqual(before.sessions[0].exercises[0].sets);
        if (operation === 'exercise') {
          expect(after.sessions[0].exercises.slice(0, -1)).toEqual(before.sessions[0].exercises);
          expect(after.exercises.filter((exercise) => exercise.id === 'og:0001')).toHaveLength(1);
        }
        if (operation === 'replace') {
          expect(after.sessions[0].exercises).toHaveLength(before.sessions[0].exercises.length);
          expect(after.sessions[0].exercises.slice(1)).toEqual(before.sessions[0].exercises.slice(1));
        }
        if (operation === 'exercise' || operation === 'replace') {
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await expect(page.getByRole('heading', { name: '3/4仰卧起坐', exact: true })).toBeVisible();
          await expect(page.getByLabel('3/4仰卧起坐第1组次数', { exact: true })).toHaveValue('10');
        }
        if (operation === 'import') {
          expect(after.sessions).toEqual(before.sessions);
          expect(after.templates.slice(0, -1)).toEqual(before.templates);
        }
        await page.reload();
        expect(await storedWorkspace(page)).toEqual(after);
      } else {
        await panel.getByRole('button', { name: operation === 'warmups' ? '收起训练工具' : '关闭弹窗', exact: true }).click();
        await expect(panel).toHaveCount(0);
        await page.getByRole('button', { name: '重试保存', exact: true }).click();
        await expect
          .poll(async () => {
            const data = await storedWorkspace(page);
            return { sessions: data.sessions, templates: data.templates, exercises: data.exercises };
          })
          .toEqual({ sessions: before.sessions, templates: before.templates, exercises: before.exercises });
        await page.reload();
        const after = await storedWorkspace(page);
        expect(after.sessions).toEqual(before.sessions);
        expect(after.templates).toEqual(before.templates);
        expect(after.exercises).toEqual(before.exercises);
        expect(after.bodyMetrics).toEqual(before.bodyMetrics);
      }
    });
for (const width of [320, 390, 768, 1440])
  for (const theme of ['dark', 'light'] as const) {
    test(`IRONLAW四模块与扩展目录 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 980 });
      await ready(page);
      if (theme === 'light') await page.getByRole('button', { name: '切换主题', exact: true }).click();
      for (const [name, file] of [
        ['今天', 'today'],
        ['动作', 'library'],
        ['进步', 'progress'],
        ['我', 'body'],
      ] as const) {
        await nav(page, name);
        if (name === '动作') await expect(page.locator('.library-intro')).toContainText('5632');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({
          path: info.outputPath(`${width}-${theme}-${file}.png`),
          animations: 'disabled',
        });
        if (name === '进步') {
          await page.getByRole('button', { name: '统计总览', exact: true }).click();
          await page.screenshot({
            path: info.outputPath(`${width}-${theme}-statistics.png`),
            animations: 'disabled',
          });
        }
      }
      expect(await page.locator('button.choice-trigger').count()).toBeGreaterThan(0);
      const capture = async (name: string) => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        if (await page.getByRole('dialog').count()) {
          const box = await page.getByRole('dialog').boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(-1);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
          expect(box!.y).toBeGreaterThanOrEqual(-1);
          expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
        }
        await page.screenshot({
          path: info.outputPath(`${width}-${theme}-${name}.png`),
          animations: 'disabled',
        });
      };
      await selectChoice(page, '当前同步方式', 'opengym');
      await expect(page.locator('.opengym-body')).toBeVisible();
      await page.locator('.opengym-connection').scrollIntoViewIfNeeded();
      await capture('selfhost');
      await selectChoice(page, '当前同步方式', 'netlify');
      await nav(page, '今天');
      await page.getByRole('button', { name: '开始今天的训练', exact: true }).click();
      await expect(page.locator('.workout-view')).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await capture('workout');
      await page.getByRole('button', { name: '训练辅助', exact: true }).click();
      await page.getByRole('button', { name: '热身', exact: true }).click();
      await page.getByLabel('正式总重量（kg）', { exact: true }).fill('80');
      await page.getByLabel('空杠 / 起始重量（kg）', { exact: true }).fill('20');
      await capture('warmups');
      await page.getByRole('button', { name: '收起训练工具', exact: true }).click();
      await page.getByRole('button', { name: '添加动作', exact: true }).click();
      await page.getByLabel('搜索可选动作', { exact: true }).fill('3/4 sit-up');
      await selectChoice(page, '选择动作', 'og:0001');
      await capture('picker');
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await page.getByRole('button', { name: '返回今天', exact: true }).click();
      await nav(page, '动作');
      await page.getByLabel('搜索动作', { exact: true }).fill('3/4 sit-up');
      await page.getByRole('button', { name: '查看3/4仰卧起坐讲解', exact: true }).click();
      await page.getByRole('tab', { name: '详细讲解', exact: true }).click();
      await capture('text-explanation');
    });
  }
