import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [{
    name: 'inline-launch-icon',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Let the inline launch screen paint while the app stylesheet is still downloading.
        return html
          .replace('<!-- launch-icon -->', () => readFileSync(new URL('./public/icon.svg', import.meta.url), 'utf8'))
          .replaceAll('<link rel="stylesheet" ', '<link rel="stylesheet" data-launch-style media="print" onload="this.media=\'all\'" ');
      },
    },
  }],
  // Keep min/max media queries usable on older iPhone and Android WebViews.
  build: { cssTarget: ['safari15.4', 'chrome90'] },
  server: { host: '127.0.0.1', port: 4173, strictPort: true,
    proxy: { '/api': { target: process.env.OPENGYM_DEV_API ?? 'http://127.0.0.1:3000', changeOrigin: false } } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
