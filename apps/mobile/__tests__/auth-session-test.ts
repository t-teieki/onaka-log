// サインインのセッション（F-001 アプリ側）: トークンの取得・保管・更新・失効
import { cognitoConfig } from '@/auth/cognito';
import { AuthSession, REFRESH_TOKEN_KEY, type SecureStorage } from '@/auth/session';

const CONFIG = { domain: 'https://onaka.auth.test', clientId: 'client-1' };
const T0 = Date.parse('2026-11-16T12:00:00+09:00');

type Call = { url: string; body: Record<string, string> };

function memoryStorage(initial: Record<string, string> = {}): SecureStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (k) => data[k] ?? null,
    setItem: async (k, v) => {
      data[k] = v;
    },
    deleteItem: async (k) => {
      delete data[k];
    },
  };
}

type Reply = { status: number; body: unknown } | Error;

function setup({ stored, replies = [] }: { stored?: string; replies?: Reply[] } = {}) {
  const storage = memoryStorage(stored ? { [REFRESH_TOKEN_KEY]: stored } : {});
  const calls: Call[] = [];
  let now = T0;
  const fetch = jest.fn(async (url: string, init: { body: string }) => {
    calls.push({ url, body: Object.fromEntries(new URLSearchParams(init.body)) });
    const reply = replies.shift();
    if (!reply) throw new Error('予定にない通信');
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  const session = new AuthSession({ config: CONFIG, storage, fetch, now: () => now });
  return { session, storage, calls, fetch, advance: (ms: number) => (now += ms) };
}

const tokens = (n: number, withRefresh = true) => ({
  status: 200,
  body: {
    access_token: `access-${n}`,
    id_token: `id-${n}`,
    ...(withRefresh ? { refresh_token: `refresh-${n}` } : {}),
    expires_in: 3600,
    token_type: 'Bearer',
  },
});

describe('cognitoConfig', () => {
  it('[F-001-04] ドメインかクライアント ID がなければ null（サインインを使わない）', () => {
    expect(cognitoConfig({})).toBeNull();
    expect(cognitoConfig({ EXPO_PUBLIC_COGNITO_DOMAIN: 'https://onaka.auth.test' })).toBeNull();
    expect(cognitoConfig({ EXPO_PUBLIC_COGNITO_CLIENT_ID: 'client-1' })).toBeNull();
  });

  it('[F-001-04] 両方あれば設定を返す（ドメインの末尾の / は取る）', () => {
    expect(
      cognitoConfig({ EXPO_PUBLIC_COGNITO_DOMAIN: 'https://onaka.auth.test/', EXPO_PUBLIC_COGNITO_CLIENT_ID: 'client-1' }),
    ).toEqual(CONFIG);
  });
});

describe('AuthSession', () => {
  it('[F-001-05] 保存したトークンがなければ、起動時はサインインしていない', async () => {
    const { session } = setup();
    expect(session.status).toBe('loading');
    await session.restore();
    expect(session.status).toBe('signedOut');
  });

  it('[F-001-09] 保存したリフレッシュトークンがあれば、通信せずにサインイン済みで始め、最初の API の前に更新する', async () => {
    const { session, calls } = setup({ stored: 'refresh-0', replies: [tokens(1, false)] });
    await session.restore();
    expect(session.status).toBe('signedIn');
    expect(calls).toHaveLength(0);
    expect(await session.getAccessToken()).toBe('access-1');
    expect(calls[0]).toEqual({
      url: 'https://onaka.auth.test/oauth2/token',
      body: { grant_type: 'refresh_token', client_id: 'client-1', refresh_token: 'refresh-0' },
    });
  });

  it('[F-001-07] 認可コードをトークンに換え、リフレッシュトークンだけを保管する', async () => {
    const { session, storage, calls } = setup({ replies: [tokens(1)] });
    await session.restore();
    const listener = jest.fn();
    session.subscribe(listener);
    await session.exchangeCode({ code: 'code-1', codeVerifier: 'verifier-1', redirectUri: 'exp://x/--/auth/callback' });
    expect(calls[0]).toEqual({
      url: 'https://onaka.auth.test/oauth2/token',
      body: {
        grant_type: 'authorization_code',
        client_id: 'client-1',
        code: 'code-1',
        code_verifier: 'verifier-1',
        redirect_uri: 'exp://x/--/auth/callback',
      },
    });
    expect(storage.data).toEqual({ [REFRESH_TOKEN_KEY]: 'refresh-1' });
    expect(session.status).toBe('signedIn');
    expect(listener).toHaveBeenCalled();
    expect(await session.getAccessToken()).toBe('access-1');
    expect(calls).toHaveLength(1);
  });

  it('[F-001-07] コードを換えられなければ失敗を投げ、サインインしていないまま', async () => {
    const { session, storage } = setup({ replies: [{ status: 400, body: { error: 'invalid_grant' } }] });
    await session.restore();
    await expect(
      session.exchangeCode({ code: 'bad', codeVerifier: 'v', redirectUri: 'exp://x/--/auth/callback' }),
    ).rejects.toThrow();
    expect(session.status).toBe('signedOut');
    expect(storage.data).toEqual({});
  });

  it('[F-001-10] 期限まで60秒を切ったら更新する。新しいリフレッシュトークンが来たら保管し直す', async () => {
    const { session, storage, calls, advance } = setup({ replies: [tokens(1), tokens(2)] });
    await session.restore();
    await session.exchangeCode({ code: 'c', codeVerifier: 'v', redirectUri: 'r' });
    advance(3600_000 - 61_000);
    expect(await session.getAccessToken()).toBe('access-1');
    advance(2_000);
    expect(await session.getAccessToken()).toBe('access-2');
    expect(calls[1].body).toEqual({ grant_type: 'refresh_token', client_id: 'client-1', refresh_token: 'refresh-1' });
    expect(storage.data[REFRESH_TOKEN_KEY]).toBe('refresh-2');
  });

  it('[F-001-10] 同時に呼ばれても更新は1回だけ', async () => {
    const { session, calls } = setup({ stored: 'refresh-0', replies: [tokens(1, false)] });
    await session.restore();
    const got = await Promise.all([session.getAccessToken(), session.getAccessToken(), session.getAccessToken()]);
    expect(got).toEqual(['access-1', 'access-1', 'access-1']);
    expect(calls).toHaveLength(1);
  });

  it('[F-001-11] 更新が拒否されたら保管したトークンを消してサインインしていない状態にする', async () => {
    const { session, storage } = setup({ stored: 'refresh-0', replies: [{ status: 400, body: { error: 'invalid_grant' } }] });
    await session.restore();
    expect(await session.getAccessToken()).toBeNull();
    expect(session.status).toBe('signedOut');
    expect(storage.data).toEqual({});
  });

  it('[F-001-11] 通信に失敗したときはトークンを消さず、次にもう一度更新する', async () => {
    const { session, storage } = setup({
      stored: 'refresh-0',
      replies: [new TypeError('Network request failed'), tokens(1, false)],
    });
    await session.restore();
    await expect(session.getAccessToken()).rejects.toThrow('Network request failed');
    expect(session.status).toBe('signedIn');
    expect(storage.data[REFRESH_TOKEN_KEY]).toBe('refresh-0');
    expect(await session.getAccessToken()).toBe('access-1');
  });

  it('[F-001-12] refresh() は期限に関係なく更新して新しいアクセストークンを返す', async () => {
    const { session } = setup({ replies: [tokens(1), tokens(2)] });
    await session.restore();
    await session.exchangeCode({ code: 'c', codeVerifier: 'v', redirectUri: 'r' });
    expect(await session.refresh()).toBe('access-2');
    expect(await session.getAccessToken()).toBe('access-2');
  });

  it('[F-001-11] サインインしていないときは更新せず null', async () => {
    const { session, fetch } = setup();
    await session.restore();
    expect(await session.getAccessToken()).toBeNull();
    expect(await session.refresh()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('サインアウト（F-001-14・15）', () => {
  it('[F-001-14] リフレッシュトークンを /oauth2/revoke で失効させ、端末のトークンを消す', async () => {
    const { session, storage, calls } = setup({ stored: 'refresh-0', replies: [{ status: 200, body: {} }] });
    await session.restore();
    await session.signOut();
    expect(calls).toEqual([{ url: 'https://onaka.auth.test/oauth2/revoke', body: { token: 'refresh-0', client_id: 'client-1' } }]);
    expect(storage.data[REFRESH_TOKEN_KEY]).toBeUndefined();
    expect(session.status).toBe('signedOut');
    expect(await session.getAccessToken()).toBeNull();
  });

  it('[F-001-15] 失効の要求が失敗しても（通信の失敗・拒否）、端末のトークンは消す', async () => {
    for (const reply of [new Error('offline'), { status: 400, body: { error: 'unsupported_token_type' } }]) {
      const { session, storage } = setup({ stored: 'refresh-0', replies: [reply] });
      await session.restore();
      await session.signOut();
      expect(storage.data[REFRESH_TOKEN_KEY]).toBeUndefined();
      expect(session.status).toBe('signedOut');
    }
  });

  it('[F-001-14] サインインしていなければ通信しない', async () => {
    const { session, fetch } = setup();
    await session.restore();
    await session.signOut();
    expect(fetch).not.toHaveBeenCalled();
    expect(session.status).toBe('signedOut');
  });
});
