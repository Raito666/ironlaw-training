import { selectChoice } from './choice-helpers';
import { expect, test } from '@playwright/test';
import { storedWorkspace } from './helpers';
import { overflowFindings } from './overflow-helpers';

for (const width of [320, 390, 768, 1440])
  for (const theme of ['dark', 'light']) {
    test(`${width}px ${theme}: body selector stays visible and the complete media catalogue is discoverable`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 980 });
      await page.goto('/#/settings');
      await selectChoice(page, '界面主题', theme);
      const before = await storedWorkspace(page);
      await page.goto('/#/exercises');
      await expect(page.locator('.library-catalogue-status')).toContainText('6554');
      await expect(page.locator('.library-catalogue-status')).toContainText('922');
      await expect(page.locator('.body-atlas')).toBeVisible();
      await expect(page.getByRole('button', { name: /^(男性|女性)$/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /按身体部位筛选/ })).toHaveCount(0);
      await page.getByRole('button', { name: '背面', exact: true }).click();
      await expect(page.locator('.atlas-stage')).toHaveAttribute('data-side', 'back');
      await page.getByRole('button', { name: '正面', exact: true }).click();
      await expect(page.locator('.atlas-stage')).toHaveAttribute('data-side', 'front');
      await page.locator('.atlas-visual').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`body-always-${width}-${theme}.png`),
        animations: 'disabled',
      });
      await selectChoice(page, '动作来源', 'extended');
      await expect(page.locator('.library-filter-line strong')).toHaveText('5632');
      await expect(page.locator('.movement-card')).toHaveCount(24);
      await expect(page.locator('.movement-card .opengym-thumbnail')).toHaveCount(24);
      const first = await page.locator('.opengym-thumbnail img').first().getAttribute('src');
      await page.getByRole('button', { name: '继续浏览 · 下一页', exact: true }).click();
      await expect(page.locator('.opengym-thumbnail img').first()).not.toHaveAttribute('src', first!);
      await selectChoice(page, '动作来源', 'original');
      await expect(page.locator('.library-filter-line strong')).toHaveText('302');
      await expect(page.locator('.opengym-thumbnail')).toHaveCount(0);
      await selectChoice(page, '动作来源', 'all');
      await expect(page.locator('.library-filter-line strong')).toHaveText('5934');
      await expect(page.locator('.movement-card .opengym-thumbnail')).toHaveCount(24);
      await page.locator('.movement-card').first().scrollIntoViewIfNeeded();
      expect(await overflowFindings(page)).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`all-actions-${width}-${theme}.png`),
        animations: 'disabled',
      });
      await page.setViewportSize({ width: width < 768 ? 1440 : 390, height: 980 });
      await expect(page.locator('.body-atlas')).toBeVisible();
      expect(await storedWorkspace(page)).toEqual(before);
    });
  }
