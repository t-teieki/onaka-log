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
  /** 401 のとき。トークンを更新して返す（できなければ null）。返ったら同じ要求を1回だけ送り直す（F-001-12） */
  onUnauthorized?: () => Promise<string | null>;
  fetch?: (input: Request) => Promise<Response>;
};

export function createApiClient({ baseUrl, getToken, onUnauthorized, fetch }: Options): ApiClient {
  const send = fetch ?? ((input: Request) => globalThis.fetch(input));

  const withToken = (request: Request, token: string | null) => {
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  };

  const authedFetch = async (input: Request): Promise<Response> => {
    // 送り直すために、本文を読む前に写しを取っておく
    const retry = onUnauthorized ? input.clone() : null;
    const res = await send(withToken(input, await getToken()));
    if (res.status !== 401 || !retry || !onUnauthorized) return res;
    const token = await onUnauthorized();
    if (!token) return res;
    return send(withToken(retry, token));
  };

  return createClient<paths>({ baseUrl, fetch: authedFetch });
}
