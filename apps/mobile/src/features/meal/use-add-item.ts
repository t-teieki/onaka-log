// 食事に食品を足す（POST …/meals/{meal_id}/items、F-030-10〜12、Q-32）
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useApi } from '@/api/api-context';
import type { FoodItemInput } from '@/features/record/manual-input';

import { fetchMeal, MealNotFoundError, mealQueryKey } from './use-meal';

export type AddItemFailure = 'conflict' | 'not_found' | 'error';

/** 足せなかった理由（画面の文言を決める） */
export class AddItemError extends Error {
  constructor(readonly reason: AddItemFailure) {
    super(`食品の追加に失敗（${reason}）`);
  }
}

export type AddTarget = { recordDate: string; mealId: string };

/** 足す先の食事。target がなければ（新しい食事の記録では）使わない */
export function useAddMealItem(target: AddTarget | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: FoodItemInput): Promise<string> => {
      if (!target) throw new AddItemError('error');
      const { recordDate, mealId } = target;
      const key = mealQueryKey(recordDate, mealId);
      const refresh = () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: key }),
          queryClient.invalidateQueries({ queryKey: ['day', recordDate] }),
        ]);

      // 送る時点で手元にある版（詳細で読んだ食事。なければ・読み直しが要るときは読む）
      const meal = await queryClient
        .fetchQuery({ queryKey: key, queryFn: () => fetchMeal(api, recordDate, mealId), staleTime: Infinity })
        .catch((e: unknown) => {
          throw new AddItemError(e instanceof MealNotFoundError ? 'not_found' : 'error');
        });

      const { data, error, response } = await api.POST('/v1/days/{record_date}/meals/{meal_id}/items', {
        params: { path: { record_date: recordDate, meal_id: mealId } },
        body: { expected_version: meal.version, item },
      });
      if (data) {
        queryClient.setQueryData(key, data);
        await queryClient.invalidateQueries({ queryKey: ['day', recordDate] });
        return recordDate;
      }
      const code = (error as { error?: { code?: string } } | undefined)?.error?.code;
      // 前の送信が届いていた（再送）。同じ食品 ID なので二重には足されない（F-030-11）
      if (response.status === 409 && code === 'item_already_exists') {
        await refresh();
        return recordDate;
      }
      if (response.status === 409) {
        // 次の保存で新しい版を使えるよう読み直す（F-030-12）
        await refresh();
        throw new AddItemError('conflict');
      }
      throw new AddItemError(response.status === 404 ? 'not_found' : 'error');
    },
  });
}

const SAVE_FAILED = '保存できませんでした。もう一度お試しください';

/** 保存（新しい記録・追加）に失敗したときの文言（F-030-12）。失敗していなければ null */
export function saveErrorMessage(error: Error | null): string | null {
  if (!error) return null;
  if (!(error instanceof AddItemError)) return SAVE_FAILED;
  if (error.reason === 'conflict') return 'ほかの変更と重なりました。もう一度保存してください';
  if (error.reason === 'not_found') return 'この食事は削除されています';
  return SAVE_FAILED;
}
