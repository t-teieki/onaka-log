import { router } from 'expo-router';

import { HomeScreen } from '@/features/home/home-screen';

export default function Index() {
  return (
    <HomeScreen
      onSelectMethod={(method, recordDate) => {
        if (method === 'photo') router.push({ pathname: '/record/photo', params: { recordDate } });
        if (method === 'manual') router.push({ pathname: '/record/manual', params: { recordDate } });
        if (method === 'barcode') router.push({ pathname: '/record/barcode', params: { recordDate } });
        if (method === 'label') router.push({ pathname: '/record/label', params: { recordDate } });
      }}
      onOpenMeal={(recordDate, mealId) =>
        router.push({ pathname: '/meals/[recordDate]/[mealId]', params: { recordDate, mealId } })
      }
      onOpenSettings={() => router.push('/settings')}
    />
  );
}
