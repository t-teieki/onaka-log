import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ConfirmScreen } from '@/features/confirm/confirm-screen';
import { PhotoCaptureScreen, type FoodItemDraft } from '@/features/photo/photo-capture-screen';

// 写真 → 確認・修正 → 保存（画面設計 2・3-4・3-5、F-013-15〜21、F-020-08）。
// mealId があれば追加モード（食事の詳細の「食品を追加」から、F-030-08）。品目はまとめて足す（F-013-21）
export default function PhotoRecord() {
  const { recordDate, mealId } = useLocalSearchParams<{ recordDate?: string; mealId?: string }>();
  const addTo = recordDate && mealId ? { recordDate, mealId } : undefined;
  const [candidates, setCandidates] = useState<FoodItemDraft[] | null>(null);

  if (candidates) {
    return (
      <ConfirmScreen
        drafts={candidates}
        recordDate={recordDate}
        addTo={addTo}
        onSaved={() => router.back()}
        onClose={() => router.back()}
      />
    );
  }
  return (
    <PhotoCaptureScreen
      onCandidates={setCandidates}
      // 判別できない・カメラが使えないときは手入力へ（同じ記録日・追加先のまま）
      onManual={() => router.replace({ pathname: '/record/manual', params: { recordDate, mealId } })}
      onBack={() => router.back()}
    />
  );
}
