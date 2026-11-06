// WebAuthn wire format adapted from openGym frontend/src/lib/api.js
// upstream b6cfe2bbd3f099523ffbf2677438864e9a09a06f, AGPL-3.0-or-later.
import { record } from './state-map';
import type { OpenGymUser, OwnerProof, ServerConfig } from './types';

const localHost = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
export function normalizeServer(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('请输入完整的服务器地址');
  }
  if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol))
    throw new Error('服务器地址不能含账号、密钥、查询或片段');
  if (url.protocol !== 'https:' && !localHost(url.hostname))
    throw new Error('远程服务器需要 HTTPS；本机可使用 http://localhost');
  return url.href.replace(/\/+$/, '');
}
export class OpenGymApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public document?: unknown,
  ) {
    super(
      status === 401
        ? '登录已失效，请重新登录；本机记录已保留'
        : status === 409
          ? '服务器已有更新，请重试或处理记录冲突'
          : status === 429
            ? '操作较频繁，请稍后重试'
            : status === 413
              ? '同步记录超过服务器 5 MiB 上限，请导出备份'
              : code === 'origin-mismatch'
                ? '服务器地址与 ORIGIN / RP_ID 配置不一致'
                : status === 403
                  ? '服务器拒绝操作，请核对当前密码、通行密钥或邀请代码'
                  : status >= 500
                    ? '自托管服务器暂不可用，本机记录正常保存'
                    : '自托管接口未接受操作，请核对输入与服务器配置',
    );
    this.name = 'OpenGymApiError';
  }
}
export function parseUser(value: unknown): OpenGymUser {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.name !== 'string' ||
    typeof value.admin !== 'boolean'
  )
    throw new Error('自托管账号响应无效');
  return {
    id: value.id,
    name: value.name,
    admin: value.admin,
    ...(value.owner === true ? { owner: true } : {}),
  };
}
export function createOpenGymApi(options: {
  server: string;
  token?: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}) {
  const server = normalizeServer(options.server);
  const request = async (path: string, method = 'GET', body?: unknown): Promise<Record<string, unknown>> => {
    if (!/^\/api\/[a-zA-Z0-9/-]+$/.test(path)) throw new Error('自托管接口路径无效');
    const controller = new AbortController(),
      abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(abort, method === 'GET' ? 20000 : 60000);
    try {
      const text = body === undefined ? undefined : JSON.stringify(body);
      if (text && new TextEncoder().encode(text).byteLength > 5 * 1024 * 1024)
        throw new OpenGymApiError(413, 'too-large');
      let response: Response;
      try {
        response = await (options.fetch ?? fetch)(server + path, {
          method,
          credentials: options.token ? 'omit' : 'same-origin',
          redirect: 'error',
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            ...(text ? { 'Content-Type': 'application/json' } : {}),
            ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          },
          ...(text ? { body: text } : {}),
        });
      } catch {
        throw new Error('无法连接自托管服务器或连接已取消，本机记录已保留');
      }
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        throw new Error('该地址没有返回自托管接口数据，请检查 /api 代理');
      }
      if (!record(value)) throw new Error('自托管接口返回的数据无效');
      if (!response.ok)
        throw new OpenGymApiError(
          response.status,
          typeof value.code === 'string' && /^[a-z-]{1,40}$/.test(value.code) ? value.code : 'http',
          response.status === 409 ? { rev: value.rev, state: value.state } : undefined,
        );
      return value;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  };
  return {
    server,
    get: (path: string) => request(path),
    post: (path: string, body: unknown = {}) => request(path, 'POST', body),
    put: (path: string, body: unknown) => request(path, 'PUT', body),
    async config(): Promise<ServerConfig> {
      const v = await request('/api/config');
      if (typeof v.invite_only !== 'boolean' || typeof v.allow_guest !== 'boolean')
        throw new Error('该地址不是受支持的 openGym 服务器');
      return {
        invite_only: v.invite_only,
        allow_guest: v.allow_guest,
        password_login: v.password_login === true,
      };
    },
  };
}
export type OpenGymApi = ReturnType<typeof createOpenGymApi>;
const b64 = (value: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const unb64 = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (x) => x.charCodeAt(0)).buffer;
export function serializeCredential(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: b64(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? null,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
    response: {
      clientDataJSON: b64(response.clientDataJSON),
      ...(response.attestationObject
        ? {
            attestationObject: b64(response.attestationObject),
            transports: response.getTransports?.() ?? ['internal'],
          }
        : {}),
      ...(response.authenticatorData
        ? {
            authenticatorData: b64(response.authenticatorData),
            signature: b64(response.signature),
            userHandle: response.userHandle ? b64(response.userHandle) : null,
          }
        : {}),
    },
  };
}
function sameOrigin(api: OpenGymApi) {
  if (typeof location === 'undefined' || new URL(api.server).origin !== location.origin)
    throw new Error('密码和通行密钥请在服务器自己的网页登录；此处连接其他地址请使用配对代码');
}
export async function passkeyAssertion(api: OpenGymApi, signal?: AbortSignal): Promise<OwnerProof> {
  sameOrigin(api);
  const value = await api.post('/api/login/options');
  if (typeof value.cid !== 'string' || !record(value.options)) throw new Error('通行密钥选项无效');
  const o = value.options;
  const credential = await navigator.credentials.get({
    publicKey: {
      ...o,
      challenge: unb64(String(o.challenge)),
      allowCredentials: Array.isArray(o.allowCredentials)
        ? o.allowCredentials.map((c) => ({ ...c, id: unb64(c.id) }))
        : [],
    } as PublicKeyCredentialRequestOptions,
    signal,
  });
  if (!credential) throw new Error('未完成通行密钥验证');
  return { cid: value.cid, credential: serializeCredential(credential as PublicKeyCredential) };
}
export async function authenticate(
  api: OpenGymApi,
  mode: 'password-login' | 'password-register' | 'passkey-login' | 'passkey-register',
  input: { name?: string; password?: string; code?: string },
  signal?: AbortSignal,
): Promise<OpenGymUser> {
  sameOrigin(api);
  if (mode.startsWith('password')) {
    if (!(await api.config()).password_login) throw new Error('这台服务器未启用密码登录，请使用通行密钥');
    return parseUser(
      (await api.post(mode === 'password-login' ? '/api/login/password' : '/api/register/password', input))
        .user,
    );
  }
  if (mode === 'passkey-login')
    return parseUser((await api.post('/api/login/verify', await passkeyAssertion(api, signal))).user);
  const value = await api.post('/api/register/options', { name: input.name, code: input.code ?? '' });
  if (typeof value.cid !== 'string' || !record(value.options) || !record(value.options.user))
    throw new Error('通行密钥选项无效');
  const o = value.options,
    user = value.options.user as Record<string, unknown>;
  const credential = await navigator.credentials.create({
    publicKey: {
      ...o,
      challenge: unb64(String(o.challenge)),
      user: { ...user, id: unb64(String(user.id)) },
      excludeCredentials: Array.isArray(o.excludeCredentials)
        ? o.excludeCredentials.map((c) => ({ ...c, id: unb64(c.id) }))
        : [],
    } as PublicKeyCredentialCreationOptions,
    signal,
  });
  if (!credential) throw new Error('未完成通行密钥注册');
  return parseUser(
    (
      await api.post('/api/register/verify', {
        cid: value.cid,
        credential: serializeCredential(credential as PublicKeyCredential),
      })
    ).user,
  );
}
