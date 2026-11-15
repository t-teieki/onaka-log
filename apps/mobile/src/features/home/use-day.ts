import { useQuery } from '@tanstack/react-query';

import { useApi } from '@/api/api-context';
import type { DaySummary } from '@/api/client';

/** 1日分（GET /v1/days/{record_date}、F-031） */
export function useDay(recordDate: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['day', recordDate],
    queryFn: async (): Promise<DaySummary> => {
      const { data, error, response } = await api.GET('/v1/days/{record_date}', {
        params: { path: { record_date: recordDate } },
      });
      if (error || !data) throw new Error(`days の取得に失敗（${response.status}）`);
      return data;
    },
  });
}
