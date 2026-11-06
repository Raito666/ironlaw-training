import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.JLB_PREVIEW_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local preview port');
const server = await preview({
  root,
  preview: { host: '127.0.0.1', port, strictPort: true, open: process.argv.includes('--open') },
  plugins: [
    {
      name: 'ironlaw-local-preview-version',
      configurePreviewServer(server) {
        server.middlewares.use(async (request, response, next) => {
          // Explicit local preview only: let a verified build leave the old
          // waiting worker, without reloading a tab or touching IndexedDB.
          if (request.url?.split('?')[0] === '/sw.js') {
          let worker;
          try { worker = await readFile(path.join(root, 'dist/sw.js'), 'utf8'); }
          catch {
            response.statusCode = 503;
            response.setHeader('Cache-Control', 'no-store');
            response.end('Build in progress; keep the current offline version until the build completes.');
            return;
          }
            response.setHeader('Content-Type', 'application/javascript');
            response.setHeader('Cache-Control', 'no-store');
            response.end(
              worker + '\nself.addEventListener("install", event => event.waitUntil(self.skipWaiting()));\n',
            );
            return;
          }
          if (request.url?.split('?')[0] !== '/__ironlaw-preview/version') return next();
          try {
            const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(
              JSON.stringify({
                title: html.match(/<title>(.*?)<\/title>/)?.[1],
                script: html.match(/<script[^>]+src="([^"]+)"/)?.[1],
                stylesheet: html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/)?.[1],
                htmlSha256: createHash('sha256').update(html).digest('hex'),
              }),
            );
          } catch {
            response.statusCode = 503;
            response.end('Current Web build is unavailable; build before previewing.');
          }
        });
      },
    },
  ],
});
server.printUrls();
