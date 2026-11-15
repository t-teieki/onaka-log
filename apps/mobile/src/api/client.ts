// API クライアント。型は contracts/api/openapi.yaml から生成した schema.d.ts（npm run gen:api）を使い、手で型を書かない
import createClient from 'openapi-fetch';

import type { components, paths } from './schema';

export type DaySummary = components['schemas']['DaySummary'];
export type Meal = components['schemas']['meal.schema'];
export type ApiClient = ReturnType<typeof createClient<paths>>;

type Options = {
  /** 例 https://xxxx.execute-api.ap-northeast-1.amazonaws.com（/v1 は含めない） */
  baseUrl: string;
  /** Cognito のアクセストークン。null ならヘッダーを付けない（ローカルのバックエンド） */
  getToken: () => Promise<string | null>;
  fetch?: (input: Request) => Promise<Response>;
};

export function createApiClient({ baseUrl, getToken, fetch }: Options): ApiClient {
  const client = createClient<paths>({ baseUrl, ...(fetch ? { fetch } : {}) });
  client.use({
    async onRequest({ request }) {
      const token = await getToken();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      return request;
    },
  });
  return client;
}
