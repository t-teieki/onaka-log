// Cognito の設定（.env の EXPO_PUBLIC_COGNITO_*）。どちらも秘密ではない（アプリに埋め込まれて読める）
export type CognitoConfig = {
  /** マネージドログインのドメイン。例 https://onaka-log-dev-123.auth.ap-northeast-1.amazoncognito.com */
  domain: string;
  /** アプリクライアント ID（秘密なし。PKCE を使う） */
  clientId: string;
};

type Env = Record<string, string | undefined>;

/** 設定がなければ null（サインインを使わず、トークンなしで API を呼ぶ。F-001-04） */
export function cognitoConfig(env: Env = process.env): CognitoConfig | null {
  const domain = env.EXPO_PUBLIC_COGNITO_DOMAIN?.trim().replace(/\/+$/, '');
  const clientId = env.EXPO_PUBLIC_COGNITO_CLIENT_ID?.trim();
  if (!domain || !clientId) return null;
  return { domain, clientId };
}

export function authorizationEndpoint(config: CognitoConfig): string {
  return `${config.domain}/oauth2/authorize`;
}

export function tokenEndpoint(config: CognitoConfig): string {
  return `${config.domain}/oauth2/token`;
}
