import { router } from 'expo-router';

import { HomeScreen } from '@/features/home/home-screen';

export default function Index() {
  return (
    <HomeScreen
      onSelectMethod={(method, recordDate) => {
        // 栄養成分表示・写真はまだない（シートで押せない）
        if (method === 'manual') router.push({ pathname: '/record/manual', params: { recordDate } });
        if (method === 'barcode') router.push({ pathname: '/record/barcode', params: { recordDate } });
      }}
      onOpenMeal={(recordDate, mealId) =>
        router.push({ pathname: '/meals/[recordDate]/[mealId]', params: { recordDate, mealId } })
      }
      onOpenSettings={() => router.push('/settings')}
    />
  );
}
