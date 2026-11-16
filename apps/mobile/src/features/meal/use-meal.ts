import { useQuery } from '@tanstack/react-query';

import { useApi } from '@/api/api-context';
import type { ApiClient, Meal } from '@/api/client';

export const mealQueryKey = (recordDate: string, mealId: string) => ['meal', recordDate, mealId];

/** 見つからない（404、F-031-10） */
export class MealNotFoundError extends Error {}

/** 食事1件を読む（GET /v1/days/{record_date}/meals/{meal_id}、F-031-04） */
export async function fetchMeal(api: ApiClient, recordDate: string, mealId: string): Promise<Meal> {
  const { data, response } = await api.GET('/v1/days/{record_date}/meals/{meal_id}', {
    params: { path: { record_date: recordDate, meal_id: mealId } },
  });
  if (response.status === 404) throw new MealNotFoundError('食事が見つからない');
  if (!data) throw new Error(`meal の取得に失敗（${response.status}）`);
  return data;
}

/** 食事1件（F-031-08） */
export function useMeal(recordDate: string, mealId: string) {
  const api = useApi();
  return useQuery({
    queryKey: mealQueryKey(recordDate, mealId),
    queryFn: () => fetchMeal(api, recordDate, mealId),
  });
}
