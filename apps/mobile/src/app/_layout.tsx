import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { ApiProvider } from '@/api/api-context';
import { createApiClient } from '@/api/client';
import { AuthGate } from '@/auth/auth-gate';
import { cognitoConfig } from '@/auth/cognito';
import { secureStorage, signInWithGoogle } from '@/auth/native';
import { AuthSession } from '@/auth/session';
import { apiBaseUrl } from '@/config';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  // Cognito の設定がなければサインインを使わず、トークンなしでローカルのバックエンド（ONAKA_LOCAL_USER_ID）につなぐ（F-001-04）
  const [config] = useState(() => cognitoConfig());
  const [session] = useState(() => (config ? new AuthSession({ config, storage: secureStorage }) : null));
  const [api] = useState(() =>
    createApiClient({
      baseUrl: apiBaseUrl(),
      getToken: async () => (session ? session.getAccessToken() : null),
      onUnauthorized: session ? () => session.refresh() : undefined,
    }),
  );

  useEffect(() => {
    void session?.restore();
    // サインインし直したときに前の利用者の記録が残らないよう、サインアウトしたら読んだデータを消す
    return session?.subscribe(() => {
      if (session.status === 'signedOut') queryClient.clear();
    });
  }, [session, queryClient]);

  const signIn = async () => (config && session ? signInWithGoogle(config, session) : ('error' as const));

  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <StatusBar style="auto" />
        <AuthGate session={session} signIn={signIn}>
          <Stack screenOptions={{ headerShown: false }} />
        </AuthGate>
      </ApiProvider>
    </QueryClientProvider>
  );
}
