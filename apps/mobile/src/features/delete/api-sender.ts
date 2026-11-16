// 削除 API を送る（F-032-10〜12）。食品の削除は送る時点の最新の版を付け、応答の食事で手元の版を更新する
import type { QueryClient } from '@tanstack/react-query';

import type { ApiClient, DaySummary, Meal } from '@/api/client';
import { mealQueryKey } from '@/features/meal/use-meal';

import type { DeleteTarget, SendResult } from './delete-queue';

const dayKey = (recordDate: string) => ['day', recordDate];

/** 手元に読んである版（詳細で読んだ食事、なければ日の一覧） */
function cachedVersion(queryClient: QueryClient, t: DeleteTarget): number | undefined {
  const meal = queryClient.getQueryData<Meal>(mealQueryKey(t.recordDate, t.mealId));
  if (meal) return meal.version;
  return queryClient.getQueryData<DaySummary>(dayKey(t.recordDate))?.meals.find((m) => m.meal_id === t.mealId)?.version;
}

function resultOf(status: number): SendResult {
  // 404 はもう消えているので成功と同じ（F-032-12）
  if (status < 300 || status === 404) return 'ok';
  return status === 409 ? 'conflict' : 'error';
}

export function createDeleteSender(api: ApiClient, queryClient: QueryClient) {
  // 削除の応答で知った版。版は増えるだけなので、読み直しが古い版を返しても（結果整合の読み取りなど）大きい方を使う
  const knownVersions = new Map<string, number>();
  const latestVersion = (t: DeleteTarget): number | undefined => {
    const cached = cachedVersion(queryClient, t);
    const known = knownVersions.get(t.mealId);
    if (cached === undefined) return known;
    return known === undefined ? cached : Math.max(cached, known);
  };

  const send = async (t: DeleteTarget): Promise<SendResult> => {
    const path = { record_date: t.recordDate, meal_id: t.mealId };
    if (t.kind === 'meal') {
      const { response } = await api.DELETE('/v1/days/{record_date}/meals/{meal_id}', { params: { path } });
      return resultOf(response.status);
    }
    const version = latestVersion(t);
    if (version === undefined) return 'error';
    const { data, response } = await api.DELETE('/v1/days/{record_date}/meals/{meal_id}/items/{item_id}', {
      params: { path: { ...path, item_id: t.itemId }, query: { expected_version: version } },
    });
    // 次の削除が新しい版で送れるよう、応答の食事を手元に置く（F-032-11）
    if (data?.meal) {
      knownVersions.set(t.mealId, data.meal.version);
      queryClient.setQueryData(mealQueryKey(t.recordDate, t.mealId), data.meal);
    }
    return resultOf(response.status);
  };

  /** 送り終えたら、その日と食事を読み直す（F-032-09・12） */
  const afterSend = async (t: DeleteTarget): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: dayKey(t.recordDate) }),
      queryClient.invalidateQueries({ queryKey: mealQueryKey(t.recordDate, t.mealId) }),
    ]);
  };

  return { send, afterSend };
}
