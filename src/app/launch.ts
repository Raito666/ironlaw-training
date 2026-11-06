import type { AppData } from '../domain/types';

export function waitForLaunchStyles() {
  const pending = document.querySelectorAll('link[data-launch-style][media="print"]');
  return Promise.all(Array.from(pending, (link) =>
    new Promise<void>((resolve) => link.addEventListener('load', () => resolve(), { once: true })),
  ));
}

export function applyLaunchTheme(theme: AppData['settings']['theme']) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#F4F2EB' : '#080A08');
  try {
    // The database remains the source of truth. This hint is only for the next first paint.
    localStorage.setItem('jianlibao-launch-theme', theme);
  } catch {
    // A blocked or full localStorage must not prevent the app from opening.
  }
}

export function dismissLaunch() {
  const launch = document.getElementById('app-launch');
  if (!launch || launch.hasAttribute('data-dismissed')) return;
  launch.setAttribute('aria-hidden', 'true');
  launch.setAttribute('data-dismissed', '');
}
