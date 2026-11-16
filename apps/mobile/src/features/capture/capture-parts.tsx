// 撮影・読み取りの画面で共通に使う部品: エラーダイアログ（画面設計 4-1）、カメラの許可（画面設計 4）、ボタン
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

export type DialogAction = { label: string; onPress: () => void; primary?: boolean };

/** 画面の上に重ねるダイアログ（タイトル・本文・ボタン） */
export function ErrorDialog({ title, body, actions }: { title: string; body?: string; actions: DialogAction[] }) {
  return (
    <View style={styles.backdrop}>
      <View style={styles.dialog} accessibilityRole="alert">
        <Text style={styles.title}>{title}</Text>
        {body && <Text style={styles.body}>{body}</Text>}
        {actions.map((a) => (
          <ActionButton key={a.label} {...a} />
        ))}
      </View>
    </View>
  );
}

export function ActionButton({ label, onPress, primary = false }: DialogAction) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, primary && styles.buttonPrimary]}>
      <Text style={[styles.buttonText, primary && styles.buttonPrimaryText]}>{label}</Text>
    </Pressable>
  );
}

type Permission = { granted: boolean; canAskAgain: boolean };

/** カメラの許可がないとき（画面設計 4）。もう聞けなければ設定アプリを開く。手入力へも進める */
export function CameraPermissionView({
  permission,
  reason,
  requestPermission,
  onManual,
}: {
  permission: Permission;
  reason: string;
  requestPermission: () => unknown;
  onManual: () => void;
}) {
  return (
    <View style={styles.permission}>
      <Text style={styles.reason}>{reason}</Text>
      {permission.canAskAgain ? (
        <ActionButton label="カメラを許可する" onPress={() => void requestPermission()} primary />
      ) : (
        <ActionButton label="設定を開く" onPress={() => void Linking.openSettings()} primary />
      )}
      <ActionButton label="手入力する" onPress={onManual} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dialog: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { color: '#333', marginBottom: 6 },
  button: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  buttonPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  buttonText: { fontSize: 16, color: '#1f2937' },
  buttonPrimaryText: { color: '#fff', fontWeight: '600' },
  permission: { flex: 1, justifyContent: 'center', gap: 12, padding: 24, backgroundColor: '#fff' },
  reason: { textAlign: 'center', color: '#333', marginBottom: 8 },
});
