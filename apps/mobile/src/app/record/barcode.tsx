import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { BarcodeScanScreen, type FoodItemDraft } from '@/features/barcode/barcode-scan-screen';
import { ConfirmScreen } from '@/features/confirm/confirm-screen';

// バーコード → 確認・修正 → 保存（画面設計 2・3-3・3-5、F-011-13〜16）。
// mealId があれば追加モード（食事の詳細の「食品を追加」から、F-030-08）
export default function BarcodeRecord() {
  const { recordDate, mealId } = useLocalSearchParams<{ recordDate?: string; mealId?: string }>();
  const addTo = recordDate && mealId ? { recordDate, mealId } : undefined;
  const [draft, setDraft] = useState<FoodItemDraft | null>(null);
  // 見つからない・登録ミスのときは栄養成分表示の撮影へ（同じ記録日・追加先のまま、F-011-17・F-020-06）
  const takeLabel = () => router.replace({ pathname: '/record/label', params: { recordDate, mealId } });

  if (draft) {
    return (
      <ConfirmScreen
        drafts={[draft]}
        recordDate={recordDate}
        addTo={addTo}
        onSaved={() => router.back()}
        onClose={() => router.back()}
        onTakeLabel={takeLabel}
      />
    );
  }
  return (
    <BarcodeScanScreen
      onFound={setDraft}
      // 見つからない・カメラが使えないときは手入力へ（同じ記録日・追加先のまま）
      onManual={() => router.replace({ pathname: '/record/manual', params: { recordDate, mealId } })}
      onTakeLabel={takeLabel}
      onBack={() => router.back()}
    />
  );
}
