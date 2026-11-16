// バーコードの読み取りと照合（画面設計 3-3、F-011-13〜18）。読めたら照合 API を呼び、見つかれば候補を渡す
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApi } from '@/api/api-context';
import type { ApiClient } from '@/api/client';
import type { components } from '@/api/schema';

export type FoodItemDraft = components['schemas']['FoodItemDraft'];

type Props = {
  onFound: (draft: FoodItemDraft) => void;
  onManual: () => void;
  /** 入力方法の選択（前の画面）に戻る */
  onBack: () => void;
};

/** JAN（EAN-13・EAN-8）と、その元になった UPC（F-011-15） */
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

type Outcome =
  { kind: 'found'; draft: FoodItemDraft } | { kind: 'not_found' } | { kind: 'rate_limited' } | { kind: 'error' };

async function lookup(api: ApiClient, code: string): Promise<Outcome> {
  try {
    const { data, response } = await api.GET('/v1/products/{product_code}', {
      params: { path: { product_code: code } },
    });
    if (data) return data.status === 'found' && data.item ? { kind: 'found', draft: data.item } : { kind: 'not_found' };
    return response.status === 429 ? { kind: 'rate_limited' } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

type State =
  | { kind: 'scanning' }
  | { kind: 'looking' }
  | { kind: 'dialog'; outcome: Exclude<Outcome, { kind: 'found' }>; code: string };

export function BarcodeScanScreen({ onFound, onManual, onBack }: Props) {
  const api = useApi();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<State>({ kind: 'scanning' });
  // 照合中に続けて読んでも呼ばない（再描画の前に届いたイベントも止める、F-011-15）
  const busy = useRef(false);

  const check = async (code: string) => {
    busy.current = true;
    setState({ kind: 'looking' });
    const outcome = await lookup(api, code);
    if (outcome.kind === 'found') {
      onFound(outcome.draft);
      return;
    }
    setState({ kind: 'dialog', outcome, code });
  };

  const resume = () => {
    busy.current = false;
    setState({ kind: 'scanning' });
  };

  const header = (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="読み取りをやめる" onPress={onBack} style={styles.close}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
      <Text style={styles.title}>バーコード</Text>
      <View style={styles.close} />
    </View>
  );

  if (!permission) {
    return (
      <SafeAreaView style={styles.screen}>
        {header}
        <ActivityIndicator style={styles.center} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    // カメラの許可がない（画面設計 4、F-011-14）
    return (
      <SafeAreaView style={styles.screen}>
        {header}
        <View style={styles.center}>
          <Text style={styles.message}>バーコードを読み取るためにカメラを使います</Text>
          {permission.canAskAgain ? (
            <Button label="カメラを許可する" onPress={() => void requestPermission()} primary />
          ) : (
            <Button label="設定を開く" onPress={() => void Linking.openSettings()} primary />
          )}
          <Button label="手入力する" onPress={onManual} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      {header}
      <View style={styles.cameraBox}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={
            state.kind === 'scanning'
              ? ({ data }) => {
                  if (busy.current) return;
                  void check(data);
                }
              : undefined
          }
        />
        {state.kind === 'scanning' && <Text style={styles.hint}>バーコードを枠の中に映してください</Text>}
        {state.kind === 'looking' && (
          <View style={styles.overlay}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.overlayText}>照合中…</Text>
          </View>
        )}
      </View>
      {state.kind === 'dialog' && (
        <Dialog
          outcome={state.outcome}
          onRetry={() => void check(state.code)}
          onClose={resume}
          onManual={onManual}
          onBack={onBack}
        />
      )}
    </SafeAreaView>
  );
}

/** エラーダイアログ（画面設計 4-1） */
function Dialog({
  outcome,
  onRetry,
  onClose,
  onManual,
  onBack,
}: {
  outcome: Exclude<Outcome, { kind: 'found' }>;
  onRetry: () => void;
  onClose: () => void;
  onManual: () => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.dialogBackdrop}>
      <View style={styles.dialog} accessibilityRole="alert">
        {outcome.kind === 'not_found' ? (
          <>
            <Text style={styles.dialogTitle}>商品が見つかりません</Text>
            <Text style={styles.dialogBody}>栄養成分表示を撮ると記録できます</Text>
            {/* OCR（IMP-07）を作るまでは押せない（F-011-17） */}
            <Pressable
              accessibilityRole="button"
              disabled
              accessibilityState={{ disabled: true }}
              style={[styles.button, styles.buttonDisabled]}
            >
              <Text style={[styles.buttonText, styles.disabledText]}>栄養成分表示を撮る</Text>
              <Text style={styles.badge}>準備中</Text>
            </Pressable>
            <Button label="手入力する" onPress={onManual} primary />
            <Button label="入力方法の選択に戻る" onPress={onBack} />
          </>
        ) : outcome.kind === 'rate_limited' ? (
          <>
            <Text style={styles.dialogTitle}>少し時間をおいてください</Text>
            <Text style={styles.dialogBody}>短時間に多く使われたため、一時的に止めています</Text>
            <Button label="閉じる" onPress={onClose} primary />
          </>
        ) : (
          <>
            <Text style={styles.dialogTitle}>うまくいきませんでした</Text>
            <Text style={styles.dialogBody}>時間をおいてもう一度お試しください</Text>
            <Button label="もう一度" onPress={onRetry} primary />
            <Button label="入力方法の選択に戻る" onPress={onBack} />
          </>
        )}
      </View>
    </View>
  );
}

function Button({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, primary && styles.buttonPrimary]}>
      <Text style={[styles.buttonText, primary && styles.buttonPrimaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    backgroundColor: '#fff',
  },
  close: { width: 48, padding: 12 },
  closeText: { fontSize: 22 },
  title: { fontSize: 18, fontWeight: '600' },
  center: { flex: 1, alignItems: 'stretch', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: '#fff' },
  message: { textAlign: 'center', color: '#333', marginBottom: 8 },
  cameraBox: { flex: 1 },
  hint: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayText: { color: '#fff', fontSize: 16 },
  dialogBackdrop: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dialog: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 10 },
  dialogTitle: { fontSize: 18, fontWeight: '700' },
  dialogBody: { color: '#333', marginBottom: 6 },
  button: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 14,
  },
  buttonPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  buttonDisabled: { borderColor: '#e2e8f0' },
  buttonText: { fontSize: 16, color: '#1f2937' },
  buttonPrimaryText: { color: '#fff', fontWeight: '600' },
  disabledText: { color: '#9ca3af' },
  badge: { fontSize: 12, color: '#6b7280', backgroundColor: '#f3f4f6', paddingHorizontal: 6, borderRadius: 4 },
});
