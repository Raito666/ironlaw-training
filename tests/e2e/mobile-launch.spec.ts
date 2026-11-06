import { expect, test } from '@playwright/test';
import { expectPersisted } from './helpers';

// Keep the real built stylesheet gate visible to Playwright's network route.
test.use({ serviceWorkers: 'block' });

for (const theme of ['dark', 'light'] as const) {
  test(`手机首开 ${theme}：慢样式期间显示品牌，首页就绪后只有一个主区域`, async ({ page, context }, info) => {
    const width = theme === 'dark' ? 320 : 390;
    await page.setViewportSize({ width, height: 844 });
    if (theme === 'light') {
      const previous = await context.newPage();
      await previous.goto('/mobile/#/today');
      await previous.getByRole('button', { name: '切换主题', exact: true }).click();
      await expectPersisted(previous, (data) => data.settings.theme === 'light');
      await previous.close();
    }
    let releaseStyles!: () => void;
    const styles = new Promise<void>((resolve) => { releaseStyles = resolve; });
    await page.route('**/assets/*.css', async (route) => {
      await styles;
      await route.continue();
    });
    try {
      await page.goto('/mobile/#/today', { waitUntil: 'commit' });
      const launch = page.locator('#app-launch');
      await expect(launch.locator('svg')).toBeVisible();
      const background = theme === 'light' ? 'rgb(244, 242, 235)' : 'rgb(8, 10, 8)';
      await expect(launch).toHaveCSS('background-color', background);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('#main-content')).toHaveCount(0);
      await expect(launch.getByRole('status')).toContainText('正在打开本机训练记录');

      releaseStyles();
      const start = page.getByRole('button', { name: '开始今天的训练', exact: true });
      await expect(start).toBeEnabled();
      await expect(launch).toBeHidden();
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('#main-content')).toHaveAttribute('data-page-motion', 'initial');
      await expect(page.locator('body')).toHaveCSS('background-color', background);
      await expect(page.locator('.readonly-banner')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath(`launch-home-${theme}.png`) });
    } finally {
      releaseStyles();
    }
  });
}

test('编辑权限未返回时保留启动页，有真实并发编辑时直接呈现只读状态', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const locks = navigator.locks;
    const request = locks.request.bind(locks);
    const ready = new Promise<void>((resolve) => {
      window.addEventListener('launch-test-access', () => resolve(), { once: true });
    });
    locks.request = (<T>(name: string, options: LockOptions, callback: LockGrantedCallback<T>) => {
      document.documentElement.dataset.launchTestAccess = 'pending';
      return ready.then(() => request(name, options, callback));
    }) as typeof locks.request;
  });
  const editor = await context.newPage();
  try {
    await editor.goto('/mobile/#/today');
    await expect(editor.getByRole('button', { name: '开始今天的训练', exact: true })).toBeEnabled();
    await page.goto('/mobile/#/today');
    await expect(page.locator('html')).toHaveAttribute('data-launch-test-access', 'pending');
    await expect(page.locator('#app-launch')).toBeVisible();
    await expect(page.locator('#main-content')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('launch-test-access')));
    await expect(page.locator('#app-launch')).toBeHidden();
    await expect(page.locator('.readonly-banner')).toContainText('另一个页面正在编辑');
    await expect(page.getByRole('button', { name: '开始今天的训练', exact: true })).toBeDisabled();
  } finally {
    await editor.close();
  }
});

test('上一页刚退出时，短暂的编辑锁释放后首页可直接编辑', async ({ page, context }) => {
  const previous = await context.newPage();
  await previous.route('**/__qa/editor-lock', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Temporary editor lock</title>',
  }));
  await previous.goto('/__qa/editor-lock');
  await previous.evaluate(() => new Promise<void>((resolve) => {
    void navigator.locks.request('jianlibao-editor', () => {
      resolve();
      return new Promise<void>((release) => {
        window.addEventListener('launch-test-release', () => release(), { once: true });
      });
    });
  }));
  await page.exposeFunction('releasePreviousEditor', () =>
    previous.evaluate(() => window.dispatchEvent(new Event('launch-test-release'))),
  );
  await page.addInitScript(() => {
    const locks = navigator.locks;
    const request = locks.request.bind(locks);
    locks.request = (<T>(name: string, options: LockOptions, callback: LockGrantedCallback<T>) => {
      setTimeout(() => { void Reflect.get(window, 'releasePreviousEditor')(); }, 60);
      return request(name, options, callback);
    }) as typeof locks.request;
  });
  try {
    await page.goto('/mobile/#/today');
    await expect(page.getByRole('button', { name: '开始今天的训练', exact: true })).toBeEnabled();
    await expect(page.locator('.readonly-banner')).toHaveCount(0);
  } finally {
    await previous.close();
  }
});

test('浏览器延迟调度时，空闲编辑锁仍可获得', async ({ page }) => {
  await page.addInitScript(() => {
    const locks = navigator.locks;
    const request = locks.request.bind(locks);
    let first = true;
    locks.request = (<T>(name: string, options: LockOptions, callback: LockGrantedCallback<T>) => {
      if (options.ifAvailable && first) {
        first = false;
        return Promise.resolve(callback(null));
      }
      if (!options.signal) return request(name, options, callback);
      return new Promise<void>((resolve) => setTimeout(resolve, 350))
        .then(() => request(name, options, callback));
    }) as typeof locks.request;
  });
  await page.goto('/mobile/#/today');
  await expect(page.getByRole('button', { name: '开始今天的训练', exact: true })).toBeEnabled();
  await expect(page.locator('.readonly-banner')).toHaveCount(0);
});
