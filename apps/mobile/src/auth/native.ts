// 端末の部品（expo-auth-session・expo-secure-store）とのつなぎ。ここは薄く保ち、規則は session.ts に置く（テストは session.ts と auth-gate）
import { AuthRequest, makeRedirectUri, ResponseType } from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

import type { SignInResult } from '@/features/auth/sign-in-screen';

import { authorizationEndpoint, type CognitoConfig } from './cognito';
import type { AuthSession, SecureStorage } from './session';

// Android でブラウザから戻ったときに認証の画面を閉じる
WebBrowser.maybeCompleteAuthSession();

export const secureStorage: SecureStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};

/** サインイン後の戻り先。開発ビルドは onakalog://auth/callback、Expo Go は exp://<IP>:8081/--/auth/callback（F-001-06） */
export function redirectUri(): string {
  return makeRedirectUri({ scheme: 'onakalog', path: 'auth/callback' });
}

/** Google でサインイン（Cognito のマネージドログインを identity_provider=Google で開く。F-001-06〜08） */
export async function signInWithGoogle(config: CognitoConfig, session: AuthSession): Promise<SignInResult> {
  const uri = redirectUri();
  const request = new AuthRequest({
    clientId: config.clientId,
    redirectUri: uri,
    responseType: ResponseType.Code,
    scopes: ['openid', 'email', 'profile'],
    usePKCE: true,
    extraParams: { identity_provider: 'Google' },
  });
  // コードの交換は session.ts で行うので、ここでは認可のエンドポイントだけを渡す
  const result = await request.promptAsync({ authorizationEndpoint: authorizationEndpoint(config) });
  if (result.type !== 'success') return result.type === 'error' ? 'error' : 'cancel';
  const code = result.params.code;
  if (!code || !request.codeVerifier) return 'error';
  try {
    await session.exchangeCode({ code, codeVerifier: request.codeVerifier, redirectUri: uri });
    return 'success';
  } catch {
    return 'error';
  }
}
