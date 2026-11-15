import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useApi } from '@/api/api-context';
import type { components } from '@/api/schema';
import { recordDateOf } from '@/lib/record-date';

export type MealCreateRequest = components['schemas']['MealCreateRequest'];

/** 食事の保存（POST /v1/meals、F-030）。保存したらその記録日の一覧を読み直す */
export function useCreateMeal() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: MealCreateRequest): Promise<string> => {
      const { error, response } = await api.POST('/v1/meals', { body });
      const code = (error as { error?: { code?: string } } | undefined)?.error?.code;
      // 409 meal_already_exists は再送（前の送信が届いていた）なので成功として扱う（画面設計 4-1）
      if (!response.ok && !(response.status === 409 && code === 'meal_already_exists')) {
        throw new Error(`meals の保存に失敗（${response.status} ${code ?? ''}）`);
      }
      // 記録日は eaten_at から決まる（DM-01）。応答ではなく送った値から求める（409 のときは本文に食事がない）
      return recordDateOf(new Date(body.eaten_at));
    },
    onSuccess: (recordDate) => queryClient.invalidateQueries({ queryKey: ['day', recordDate] }),
  });
}
