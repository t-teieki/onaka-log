import { router } from 'expo-router';

import { HomeScreen } from '@/features/home/home-screen';

export default function Index() {
  return (
    <HomeScreen
      onSelectMethod={(method) => {
        // バーコード・栄養成分表示・写真はまだない（シートで押せない）
        if (method === 'manual') router.push('/record/manual');
      }}
    />
  );
}
