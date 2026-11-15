import { router, useLocalSearchParams } from 'expo-router';

import { ManualEntryScreen } from '@/features/record/manual-entry-screen';

export default function ManualEntry() {
  // ホームで表示していた記録日（食べた日時の既定に使う、画面設計 3-1）
  const { recordDate } = useLocalSearchParams<{ recordDate?: string }>();
  // 保存したらホームへ戻る（画面遷移: 確認・修正 → 保存 → ホーム）。ホームは保存した日の一覧を読み直す
  return <ManualEntryScreen recordDate={recordDate} onSaved={() => router.back()} onClose={() => router.back()} />;
}
