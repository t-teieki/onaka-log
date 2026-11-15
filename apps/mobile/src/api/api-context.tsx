import { createContext, useContext, type ReactNode } from 'react';

import type { ApiClient } from './client';

const ApiContext = createContext<ApiClient | null>(null);

/** 画面から使う API クライアントを渡す（テストでは偽の fetch を使うクライアントに差し替える） */
export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('ApiProvider の外で useApi を使っている');
  return client;
}
