import { router, useLocalSearchParams } from 'expo-router';

import { ManualEntryScreen } from '@/features/record/manual-entry-screen';

export default function ManualEntry() {
  // recordDate: ホームで表示していた記録日（食べた日時の既定に使う、画面設計 3-1）
  // mealId があれば、その食事に食品を足す追加モード（食事の詳細の「食品を追加」から、F-030-08）
  const { recordDate, mealId } = useLocalSearchParams<{ recordDate?: string; mealId?: string }>();
  const addTo = recordDate && mealId ? { recordDate, mealId } : undefined;
  // 保存したら前の画面（ホーム、または食事の詳細）へ戻る。戻った先は保存した日・食事を読み直す
  return (
    <ManualEntryScreen
      recordDate={recordDate}
      addTo={addTo}
      onSaved={() => router.back()}
      onClose={() => router.back()}
    />
  );
}
