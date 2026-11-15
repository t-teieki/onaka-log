// サインインのセッション（F-001-05〜12）。リフレッシュトークンだけを安全な保管場所に置き、アクセストークンはメモリに持つ
import { tokenEndpoint, type CognitoConfig } from './cognito';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

/** expo-secure-store の形（テストでは差し替える） */
export type SecureStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  deleteItem: (key: string) => Promise<void>;
};

type FetchLike = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<Response>;

type Options = {
  config: CognitoConfig;
  storage: SecureStorage;
  fetch?: FetchLike;
  now?: () => number;
};

export const REFRESH_TOKEN_KEY = 'onaka.auth.refreshToken';
/** 期限の少し前に更新する（F-001-10） */
const EXPIRY_MARGIN_MS = 60_000;

/** トークンのエンドポイントが要求を拒否した（invalid_grant など）。通信の失敗とは分ける（F-001-11） */
class TokenRejectedError extends Error {}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

export class AuthSession {
  status: AuthStatus = 'loading';

  private readonly config: CognitoConfig;
  private readonly storage: SecureStorage;
  private readonly fetch: FetchLike;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private refreshToken: string | null = null;
  private access: { token: string; expiresAt: number } | null = null;
  private refreshing: Promise<string | null> | null = null;

  constructor({ config, storage, fetch = (url, init) => globalThis.fetch(url, init), now = Date.now }: Options) {
    this.config = config;
    this.storage = storage;
    this.fetch = fetch;
    this.now = now;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 起動時。保存したリフレッシュトークンがあれば通信せずにサインイン済みで始める（F-001-09） */
  async restore(): Promise<void> {
    this.refreshToken = await this.storage.getItem(REFRESH_TOKEN_KEY);
    this.setStatus(this.refreshToken ? 'signedIn' : 'signedOut');
  }

  /** 認可コードをトークンに換える（F-001-07）。失敗したら投げる */
  async exchangeCode({ code, codeVerifier, redirectUri }: { code: string; codeVerifier: string; redirectUri: string }) {
    const res = await this.requestToken({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    });
    if (!res.refresh_token) throw new Error('リフレッシュトークンが返らなかった');
    await this.storage.setItem(REFRESH_TOKEN_KEY, res.refresh_token);
    this.refreshToken = res.refresh_token;
    this.keepAccess(res);
    this.setStatus('signedIn');
  }

  /** API を呼ぶ前に使う。期限が近ければ更新する（F-001-10）。サインインしていなければ null */
  async getAccessToken(): Promise<string | null> {
    if (this.access && this.access.expiresAt - EXPIRY_MARGIN_MS > this.now()) return this.access.token;
    return this.refresh();
  }

  /**
   * 期限に関係なく更新する（401 のとき、F-001-12）。同時に呼ばれても1回だけ送る。
   * 拒否されたらトークンを消して null（F-001-11）。通信の失敗は投げる（トークンは残す）
   */
  refresh(): Promise<string | null> {
    if (!this.refreshToken) return Promise.resolve(null);
    this.refreshing ??= this.doRefresh(this.refreshToken).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** 端末の中のサインインを消す（サーバー側の失効は設定画面のサインアウトで足す） */
  async signOutLocally(): Promise<void> {
    this.refreshToken = null;
    this.access = null;
    await this.storage.deleteItem(REFRESH_TOKEN_KEY);
    this.setStatus('signedOut');
  }

  private async doRefresh(refreshToken: string): Promise<string | null> {
    try {
      const res = await this.requestToken({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        refresh_token: refreshToken,
      });
      if (res.refresh_token && res.refresh_token !== refreshToken) {
        await this.storage.setItem(REFRESH_TOKEN_KEY, res.refresh_token);
        this.refreshToken = res.refresh_token;
      }
      this.keepAccess(res);
      return res.access_token;
    } catch (e) {
      if (!(e instanceof TokenRejectedError)) throw e;
      await this.signOutLocally();
      return null;
    }
  }

  private async requestToken(params: Record<string, string>): Promise<TokenResponse> {
    const res = await this.fetch(tokenEndpoint(this.config), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    if (!res.ok) {
      // 4xx は要求の拒否（invalid_grant など）、5xx は一時的な失敗として扱う
      if (res.status >= 400 && res.status < 500) throw new TokenRejectedError(`token: ${res.status}`);
      throw new Error(`token: ${res.status}`);
    }
    const body = (await res.json()) as Partial<TokenResponse>;
    if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
      throw new Error('token: 応答の形が違う');
    }
    return body as TokenResponse;
  }

  private keepAccess(res: TokenResponse) {
    this.access = { token: res.access_token, expiresAt: this.now() + res.expires_in * 1000 };
  }

  private setStatus(next: AuthStatus) {
    this.status = next;
    this.listeners.forEach((l) => l());
  }
}
