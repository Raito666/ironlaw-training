import { expect, test } from '@playwright/test';
import { choiceTrigger } from './choice-helpers';
import { storedWorkspace } from './helpers';

test('页内筛选可用键盘选值与返回焦点，同时只展开一个面板', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/mobile/#/exercises');
  await expect(page.locator('.library-filter-line strong')).toHaveText('5934');
  const original = await storedWorkspace(page);
  const equipment = choiceTrigger(page, '器械');
  await equipment.press('ArrowDown');
  const listbox = page.getByRole('listbox', { name: '器械', exact: true });
  await expect(listbox.getByRole('option', { selected: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const next = page.locator(':focus');
  const label = await next.locator('.choice-option-copy strong').innerText();
  expect(label).not.toBe('不限器械');
  await page.keyboard.press('Enter');
  await expect(equipment).toHaveAccessibleName(`器械：${label}`);
  await expect(equipment).toBeFocused();
  await expect(listbox).toHaveCount(0);

  await equipment.click();
  const difficulty = choiceTrigger(page, '技术难度');
  await difficulty.click();
  await expect(equipment).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('listbox')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(difficulty).toHaveAttribute('aria-expanded', 'false');
  await expect(difficulty).toBeFocused();
  expect(await storedWorkspace(page)).toEqual(original);
});

test('窄屏在底部打开筛选时，标题移入导航上方并可点选', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 650 });
  await page.goto('/mobile/#/exercises');
  await expect(page.locator('.library-filter-line strong')).toHaveText('5934');
  const equipment = choiceTrigger(page, '器械');
  await equipment.evaluate((element) => {
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
    const nav = document.querySelector('.mobile-nav')!.getBoundingClientRect();
    window.scrollBy({ top: element.getBoundingClientRect().bottom - nav.top + 12, behavior: 'instant' });
  });
  await equipment.click();
  const panel = page.getByRole('region', { name: '器械', exact: true });
  await expect.poll(() => panel.locator('.choice-inline-heading').evaluate((heading) => {
    const bounds = heading.getBoundingClientRect();
    const nav = document.querySelector('.mobile-nav')!.getBoundingClientRect();
    return bounds.top >= 0 && bounds.bottom <= nav.top;
  })).toBe(true);
  await panel.getByRole('searchbox', { name: '搜索器械', exact: true }).fill('哑铃');
  await panel.getByRole('option', { name: '哑铃', exact: true }).click();
  await expect(equipment).toHaveAccessibleName('器械：哑铃');
});
