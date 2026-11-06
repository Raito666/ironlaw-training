import { expect, test } from '@playwright/test';

for (const name of ['平板支撑', '引体向上']) {
  test(`扩展动作全部载入后，精确搜索 ${name} 仍优先显示原动作`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/mobile/#/exercises');
    await expect(page.locator('.library-filter-line strong')).toHaveText('5934');
    await page.getByLabel('搜索动作', { exact: true }).fill(name);
    await expect.poll(async () => Number(await page.locator('.library-filter-line strong').innerText())).toBeGreaterThan(24);
    const first = page.locator('.movement-card').first();
    await expect(first.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(first.getByRole('button', { name: `查看${name}讲解`, exact: true })).toBeVisible();
  });
}
