import { router, useLocalSearchParams } from 'expo-router';

import { MealDetailScreen } from '@/features/meal/meal-detail-screen';

// 食事の詳細（画面設計 3-6）。/meals/<記録日>/<食事 ID>
export default function MealDetail() {
  const { recordDate, mealId } = useLocalSearchParams<{ recordDate: string; mealId: string }>();
  return (
    <MealDetailScreen
      recordDate={recordDate}
      mealId={mealId}
      onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onAddItem={(method) => {
        // 写真はまだない（シートで押せない、IMP-08）
        if (method === 'manual') router.push({ pathname: '/record/manual', params: { recordDate, mealId } });
        if (method === 'barcode') router.push({ pathname: '/record/barcode', params: { recordDate, mealId } });
        if (method === 'label') router.push({ pathname: '/record/label', params: { recordDate, mealId } });
      }}
    />
  );
}
