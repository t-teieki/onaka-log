import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ConfirmScreen } from '@/features/confirm/confirm-screen';
import { LabelCaptureScreen, type FoodItemDraft } from '@/features/label/label-capture-screen';

// 栄養成分表示 → 確認・修正 → 保存（画面設計 2・3-4・3-5、F-012-15〜20、F-020-07）。
// mealId があれば追加モード（食事の詳細の「食品を追加」から、F-030-08）
export default function LabelRecord() {
  const { recordDate, mealId } = useLocalSearchParams<{ recordDate?: string; mealId?: string }>();
  const addTo = recordDate && mealId ? { recordDate, mealId } : undefined;
  const [candidates, setCandidates] = useState<FoodItemDraft[] | null>(null);

  if (candidates) {
    return (
      <ConfirmScreen
        columns={candidates}
        recordDate={recordDate}
        addTo={addTo}
        onSaved={() => router.back()}
        onClose={() => router.back()}
      />
    );
  }
  return (
    <LabelCaptureScreen
      onCandidates={setCandidates}
      // 読み取れない・カメラが使えないときは手入力へ（同じ記録日・追加先のまま）
      onManual={() => router.replace({ pathname: '/record/manual', params: { recordDate, mealId } })}
      onBack={() => router.back()}
    />
  );
}
