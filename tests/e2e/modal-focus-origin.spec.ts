import { expect, test } from '@playwright/test';

test('鼠标开启弹窗后恢复真正的开启按钮，包括图标子节点点击', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: '开始今天的训练', exact: true });
  await expect(opener).toBeEnabled();
  await opener.locator('svg').click();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await expect(opener).toBeFocused();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('键盘开启与关闭弹窗后恢复键盘开启按钮', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: '开始今天的训练', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});
