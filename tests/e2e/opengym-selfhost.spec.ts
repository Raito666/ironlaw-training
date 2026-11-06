import { selectChoice } from './choice-helpers';
import { test, expect, type Page } from '@playwright/test';
import { createServer, request as proxyRequest, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { listenForBrowser, storedWorkspace, expectPersisted } from './helpers';

let server: Server,
  child: ChildProcess,
  origin = '',
  directory = '',
  apiPort = 0;
const artifactRoot = path.resolve('artifacts/qa/opengym-browser');
const password = 'Synthetic-Browser-49372!';
test.beforeAll(async () => {
  await mkdir(artifactRoot, { recursive: true });
  directory = await mkdtemp(path.join(artifactRoot, 'synthetic-'));
  const dist = path.resolve(process.env.JLB_TEST_DIST ?? 'dist');
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      if (!apiPort) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      const upstream = proxyRequest(
        { hostname: '127.0.0.1', port: apiPort, method: req.method, path: req.url, headers: req.headers },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(res);
        },
      );
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
      return;
    }
    if (url.pathname.startsWith('/.netlify/')) {
      res.writeHead(503);
      res.end();
      return;
    }
    let file = path.resolve(
      dist,
      '.' + decodeURIComponent(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname),
    );
    if (!file.startsWith(dist + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error();
      const types: Record<string, string> = {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.mp4': 'video/mp4',
        '.md': 'text/plain',
      };
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  origin = await listenForBrowser(server);
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve('server/opengym/api'),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
    env: {
      ...process.env,
      PORT: '0',
      DATA_DIR: directory,
      ORIGIN: origin,
      RP_ID: '127.0.0.1',
      PASSWORD_LOGIN: '1',
      MEDIA_UPLOADS: '0',
      AUDIT_LOG: '0',
    },
  });
  child.stdout?.on('data', (chunk) => {
    const match = String(chunk).match(/gym-api on :(\d+)/);
    if (match) apiPort = Number(match[1]);
  });
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(origin + '/api/health')).status;
        } catch {
          return 0;
        }
      },
      { timeout: 15000 },
    )
    .toBe(200);
});
test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
  if (directory.startsWith(artifactRoot + path.sep) && path.basename(directory).startsWith('synthetic-'))
    await rm(directory, { recursive: true, force: true });
});
async function account(page: Page) {
  await page.goto(origin + '/#/settings');
  await selectChoice(page, '当前同步方式', 'opengym');
  await expect(page.getByRole('button', { name: '检查服务器', exact: true })).toBeEnabled();
}
async function sync(page: Page) {
  const button = page.getByRole('button', { name: '立即同步自托管记录', exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator('.opengym-status')).toContainText('最近同步', { timeout: 15000 });
  await expect(page.locator('.opengym-connection [role=alert]')).toHaveCount(0);
}
async function body(page: Page, note: string) {
  const record = (await storedWorkspace(page)).bodyMetrics.find((metric) => metric.date === '2026-11-02');
  await page
    .getByRole('button', { name: record ? '编辑2026-11-02身体记录' : '记录身体数据', exact: true })
    .click();
  await page.getByLabel('记录日期', { exact: true }).fill('2026-11-02');
  await page.getByLabel('体重 (kg)', { exact: true }).fill('72');
  await page.getByLabel('备注（可选）', { exact: true }).fill(note);
  await page.getByRole('button', { name: '保存身体记录', exact: true }).click();
  await expectPersisted(page, (data) => data.bodyMetrics.some((metric) => metric.note === note));
}
test('实际自托管API：注册、双环境配对、离线冲突、重开与同步方式互斥', async ({ browser }) => {
  test.setTimeout(120000);
  const a = await browser.newContext(),
    b = await browser.newContext();
  try {
    const pa = await a.newPage(),
      pb = await b.newPage();
    await account(pa);
    await pa.getByRole('button', { name: '检查服务器', exact: true }).click();
    await expect(pa.locator('.opengym-connection')).toContainText('服务器可用');
    await pa.getByLabel('创建新账号', { exact: true }).check();
    await pa.getByLabel('账号名称', { exact: true }).fill('Synthetic browser owner');
    await pa.getByLabel('密码', { exact: true }).fill(password);
    await pa.getByRole('button', { name: '用密码注册并连接', exact: true }).click();
    await sync(pa);
    await body(pa, '原始记录');
    await sync(pa);
    await pa.getByText('连接另一台设备', { exact: true }).click();
    await pa.getByLabel('当前账号密码', { exact: true }).fill(password);
    await pa.getByRole('button', { name: '用密码生成配对代码', exact: true }).click();
    const code = await pa.getByLabel('一次性配对代码', { exact: true }).textContent();
    expect(code).toBeTruthy();
    await account(pb);
    await pb.getByText('已有配对代码', { exact: true }).click();
    await pb.getByLabel('一次性配对代码', { exact: true }).fill(code!);
    await pb.getByRole('button', { name: '配对并合并记录', exact: true }).click();
    await sync(pb);
    await expectPersisted(pb, (data) => data.bodyMetrics.some((metric) => metric.note === '原始记录'));
    await b.setOffline(true);
    await body(pb, '离线改动');
    await body(pa, '在线改动');
    await sync(pa);
    await b.setOffline(false);
    await pb.getByRole('button', { name: '立即同步自托管记录', exact: true }).click();
    await expect(pb.locator('.opengym-status')).toContainText('需要选择版本', { timeout: 15000 });
    await expect(pb.locator('.opengym-versions')).toContainText('本机版本');
    await selectChoice(pb, '2026-11-02 身体记录 保留版本', 'local');
    await pb.getByRole('button', { name: '合并并同步', exact: true }).click();
    await sync(pb);
    await sync(pa);
    await expectPersisted(pa, (data) => data.bodyMetrics.some((metric) => metric.note === '离线改动'));
    await pb.reload();
    await expect(pb.locator('.opengym-status')).toContainText('最近同步', { timeout: 15000 });
    await expectPersisted(pb, (data) => data.bodyMetrics.some((metric) => metric.note === '离线改动'));
    const cacheKeys = await pb.evaluate(async () =>
      (
        await Promise.all(
          (await caches.keys()).map(async (name) =>
            (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname),
          ),
        )
      ).flat(),
    );
    expect(cacheKeys.some((key) => key.startsWith('/api/'))).toBe(false);
    await selectChoice(pb, '当前同步方式', 'netlify');
    await expect(pb.locator('.opengym-body')).toHaveCount(0);
    await expect(pb.locator('.cloud-sync')).toBeVisible();
    await expectPersisted(pb, (data) => data.bodyMetrics.some((metric) => metric.note === '离线改动'));
  } finally {
    await a.close();
    await b.close();
  }
});
for (const broadcast of [true, false])
  test(`同一浏览器断开后旧标签页不能恢复连接或上传，广播=${broadcast}`, async ({ browser }) => {
    test.setTimeout(60000);
    const context = await browser.newContext();
    try {
      const a = await context.newPage();
      await account(a);
      await a.getByRole('button', { name: '检查服务器', exact: true }).click();
      await a.getByLabel('创建新账号', { exact: true }).check();
      await a.getByLabel('账号名称', { exact: true }).fill(`Disconnect owner ${broadcast}`);
      await a.getByLabel('密码', { exact: true }).fill(password);
      await a.getByRole('button', { name: '用密码注册并连接', exact: true }).click();
      await sync(a);
      await body(a, `保留本机 ${broadcast}`);
      await sync(a);
      const original = await storedWorkspace(a);
      const b = await context.newPage();
      if (!broadcast)
        await b.addInitScript(() => {
          Object.defineProperty(window, 'BroadcastChannel', { value: undefined });
        });
      await b.goto(origin + '/#/settings');
      await expect(b.getByRole('button', { name: '断开本机连接', exact: true })).toBeVisible();
      await expect(b.locator('.readonly-banner')).toBeVisible();
      await a.getByRole('button', { name: '断开本机连接', exact: true }).click();
      await expect(a.getByRole('button', { name: '检查服务器', exact: true })).toBeVisible();
      const requests: string[] = [];
      b.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/'))
          requests.push(request.method() + ' ' + new URL(request.url()).pathname);
      });
      if (broadcast) await expect(b.getByRole('button', { name: '检查服务器', exact: true })).toBeVisible();
      await a.close();
      await b.bringToFront();
      await b.getByRole('button', { name: '在此页编辑', exact: true }).click();
      await expect(b.locator('.readonly-banner')).toHaveCount(0);
      await body(b, `断开后本机编辑 ${broadcast}`);
      // Wait beyond the real automatic-sync debounce; no /api request may escape after disconnect.
      await b.waitForTimeout(2100);
      await expect(b.getByRole('button', { name: '立即同步自托管记录', exact: true })).toHaveCount(0);
      expect(requests).toEqual([]);
      const durable = await b.evaluate(
        () =>
          new Promise<unknown>((resolve, reject) => {
            const request = indexedDB.open('ironlaw-opengym', 1);
            request.onsuccess = () => {
              const db = request.result,
                tx = db.transaction('metadata');
              const read = tx.objectStore('metadata').get('connection');
              tx.oncomplete = () => {
                resolve(read.result);
                db.close();
              };
              tx.onerror = () => reject(tx.error);
            };
          }),
      );
      expect(durable).toMatchObject({ connection: null, remote: null });
      const after = await storedWorkspace(b);
      expect(after.sessions).toEqual(original.sessions);
      expect(after.templates).toEqual(original.templates);
      expect(after.bodyMetrics).toHaveLength(original.bodyMetrics.length);
      await b.reload();
      await expect(b.getByRole('button', { name: '检查服务器', exact: true })).toBeVisible();
      await expectPersisted(b, (data) =>
        data.bodyMetrics.some((metric) => metric.note === `断开后本机编辑 ${broadcast}`),
      );
    } finally {
      await context.close();
    }
  });
