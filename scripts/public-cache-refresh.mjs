// User-authorized one-time public cache refresh. Never opens user databases or storage keys.
export function publicCacheRefreshSource() {
  return `const PUBLIC_REFRESH = 'choice-controls-20261104';
const PUBLIC_REFRESH_CACHE = 'ironlaw-public-cache-maintenance-v1';
const PUBLIC_REFRESH_KEY = '/.ironlaw-cache-maintenance/' + PUBLIC_REFRESH;
async function publicRefreshComplete() {
  try {
    if (!(await caches.keys()).includes(PUBLIC_REFRESH_CACHE)) return false;
    return !!(await (await caches.open(PUBLIC_REFRESH_CACHE)).match(PUBLIC_REFRESH_KEY));
  } catch { return false; }
}
async function refreshPreviousPublicCaches() {
  if (await publicRefreshComplete()) return;
  const names = await caches.keys();
  const obsolete = names.filter(name => name !== CACHE && name !== PUBLIC_REFRESH_CACHE &&
    (name.startsWith('jianlibao-') || name.startsWith('ironlaw-opengym-')));
  await Promise.all(obsolete.map(name => caches.delete(name)));
  await (await caches.open(PUBLIC_REFRESH_CACHE)).put(PUBLIC_REFRESH_KEY,
    new Response(PUBLIC_REFRESH, { headers: { 'Content-Type': 'text/plain' } }));
}
`;
}
