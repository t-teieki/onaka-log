// サインイン（画面設計 3-8、F-001-06・08）。当面は Google だけ（Apple は Apple Developer Program に登録してから）
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** success: サインインできた / cancel: 利用者がブラウザを閉じた / error: 失敗 */
export type SignInResult = 'success' | 'cancel' | 'error';

export function SignInScreen({ signIn }: { signIn: () => Promise<SignInResult> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await signIn().catch((): SignInResult => 'error');
    setBusy(false);
    setFailed(result === 'error');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>おなかログ</Text>
        <Text style={styles.lead}>食べたもののカロリーと PFC を記録します</Text>
      </View>
      <View style={styles.footer}>
        <Pressable
          testID="sign-in-google"
          accessibilityRole="button"
          accessibilityLabel="Google でサインイン"
          accessibilityHint="ブラウザで Google のサインインを開きます"
          disabled={busy}
          // 押した操作はすぐ返し、サインインの完了は待たない（ブラウザを開いている間も画面は動く）
          onPress={() => void start()}
          style={[styles.button, busy && styles.buttonBusy]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Google でサインイン</Text>}
        </Pressable>
        {failed && <Text style={styles.error}>サインインできませんでした。もう一度お試しください</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 28, fontWeight: '700' },
  lead: { color: '#555', textAlign: 'center' },
  footer: { padding: 24, gap: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonBusy: { backgroundColor: '#93c5fd' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  error: { color: '#dc2626', textAlign: 'center' },
});
