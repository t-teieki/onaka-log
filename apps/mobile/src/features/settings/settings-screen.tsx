// 設定（画面設計 3-7、F-001-13〜16）: サインアウトとアプリの版
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDeleteQueue } from '@/features/delete/delete-context';

type Props = {
  /** アプリの版（app.json の version） */
  version: string;
  /** サインアウト。サインインを使っていなければ null（F-001-16） */
  signOut: (() => Promise<void>) | null;
  onClose: () => void;
};

export function SettingsScreen({ version, signOut, onClose }: Props) {
  const queue = useDeleteQueue();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (!signOut || busy) return;
    setBusy(true);
    try {
      // 削除を待っていれば、トークンがあるうちに先に送る（F-001-14、F-032-08）
      if (queue) {
        queue.flush();
        await queue.idle();
      }
      await signOut();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="戻る" onPress={onClose} style={styles.back}>
          <Text style={styles.backText}>◀ 戻る</Text>
        </Pressable>
        <Text style={styles.title}>設定</Text>
        <View style={styles.back} />
      </View>

      <View style={styles.body}>
        {signOut ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="サインアウト"
            disabled={busy}
            accessibilityState={{ disabled: busy }}
            // 押した操作はすぐ返す（完了はサインイン画面への切り替えでわかる）
            onPress={() => void start()}
            style={[styles.row, busy && styles.rowBusy]}
          >
            <Text style={styles.signOut}>サインアウト</Text>
            {busy && <ActivityIndicator />}
          </Pressable>
        ) : (
          <Text style={styles.note}>サインインを使っていません（ローカルのバックエンド）</Text>
        )}
      </View>

      <Text style={styles.version}>{`バージョン ${version}`}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  back: { padding: 12, minWidth: 88 },
  backText: { fontSize: 16, color: '#2563eb' },
  title: { fontSize: 18, fontWeight: '600' },
  body: { flex: 1, paddingTop: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  rowBusy: { opacity: 0.5 },
  signOut: { fontSize: 16, color: '#dc2626' },
  note: { paddingHorizontal: 16, color: '#555' },
  version: { textAlign: 'center', color: '#888', padding: 16 },
});
