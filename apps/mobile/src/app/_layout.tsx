import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

import { ApiProvider } from '@/api/api-context';
import { createApiClient } from '@/api/client';
import { apiBaseUrl } from '@/config';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  // サインイン（F-001）を作るまでは、トークンなしでローカルのバックエンド（ONAKA_LOCAL_USER_ID）につなぐ
  const [api] = useState(() => createApiClient({ baseUrl: apiBaseUrl(), getToken: async () => null }));
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </ApiProvider>
    </QueryClientProvider>
  );
}
