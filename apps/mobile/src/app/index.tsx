import { router } from 'expo-router';

import { HomeScreen } from '@/features/home/home-screen';

export default function Index() {
  return (
    <HomeScreen
      onSelectMethod={(method, recordDate) => {
        // バーコード・栄養成分表示・写真はまだない（シートで押せない）
        if (method === 'manual') router.push({ pathname: '/record/manual', params: { recordDate } });
      }}
      onOpenMeal={(recordDate, mealId) =>
        router.push({ pathname: '/meals/[recordDate]/[mealId]', params: { recordDate, mealId } })
      }
      onOpenSettings={() => router.push('/settings')}
    />
  );
}
