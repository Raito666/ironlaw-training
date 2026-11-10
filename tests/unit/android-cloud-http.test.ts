import { Capacitor } from '@capacitor/core';
import { afterEach, expect, test, vi } from 'vitest';
import { NATIVE_CLOUD_URL, requestCloud } from '../../src/sync/network';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../src/platform/native-runtime', () => ({ http: { request } }));
afterEach(() => vi.restoreAllMocks());

test('Android sends encrypted sync over the fixed native HTTPS transport', async () => {
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
  const webFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected WebView fetch'));
  request.mockResolvedValue({ status: 200, url: NATIVE_CLOUD_URL, headers: {}, data: '{}' });
  await requestCloud({ method: 'PUT', headers: { Authorization: 'Bearer synthetic' },
    body: '{"ciphertext":"opaque"}', signal: new AbortController().signal });
  expect(webFetch).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: NATIVE_CLOUD_URL,
    method: 'PUT', data: '{"ciphertext":"opaque"}', disableRedirects: true }));
});
