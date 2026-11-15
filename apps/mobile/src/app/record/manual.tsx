import { router } from 'expo-router';

import { ManualEntryScreen } from '@/features/record/manual-entry-screen';

export default function ManualEntry() {
  // 保存したらホームへ戻る（画面遷移: 確認・修正 → 保存 → ホーム）。ホームは保存した日の一覧を読み直す
  return <ManualEntryScreen onSaved={() => router.back()} onClose={() => router.back()} />;
}
