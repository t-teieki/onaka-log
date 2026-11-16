// バーコードの読み取りと照合（画面設計 3-3、F-011-13〜18）。読めたら照合 API を呼び、見つかれば候補を渡す
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApi } from '@/api/api-context';
import type { ApiClient } from '@/api/client';
import type { components } from '@/api/schema';
import { CameraPermissionView, ErrorDialog } from '@/features/capture/capture-parts';

export type FoodItemDraft = components['schemas']['FoodItemDraft'];

type Props = {
  onFound: (draft: FoodItemDraft) => void;
  onManual: () => void;
  /** 見つからないときの「栄養成分表示を撮る」（F-011-17） */
  onTakeLabel: () => void;
  /** 入力方法の選択（前の画面）に戻る */
  onBack: () => void;
};

/** JAN（EAN-13・EAN-8）と、その元になった UPC（F-011-15） */
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

type Failure = { kind: 'not_found' } | { kind: 'rate_limited' } | { kind: 'error' };
type Outcome = { kind: 'found'; draft: FoodItemDraft } | Failure;

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

type State = { kind: 'scanning' } | { kind: 'looking' } | { kind: 'dialog'; failure: Failure; code: string };

export function BarcodeScanScreen({ onFound, onManual, onTakeLabel, onBack }: Props) {
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
    setState({ kind: 'dialog', failure: outcome, code });
  };

  const resume = () => {
    busy.current = false;
    setState({ kind: 'scanning' });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="読み取りをやめる"
          onPress={onBack}
          style={styles.close}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <Text style={styles.title}>バーコード</Text>
        <View style={styles.close} />
      </View>

      {!permission ? (
        <ActivityIndicator style={styles.loading} />
      ) : !permission.granted ? (
        <CameraPermissionView
          permission={permission}
          reason="バーコードを読み取るためにカメラを使います"
          requestPermission={requestPermission}
          onManual={onManual}
        />
      ) : (
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
      )}

      {state.kind === 'dialog' && state.failure.kind === 'not_found' && (
        <ErrorDialog
          title="商品が見つかりません"
          body="栄養成分表示を撮ると記録できます"
          actions={[
            { label: '栄養成分表示を撮る', onPress: onTakeLabel, primary: true },
            { label: '手入力する', onPress: onManual },
            { label: '入力方法の選択に戻る', onPress: onBack },
          ]}
        />
      )}
      {state.kind === 'dialog' && state.failure.kind === 'rate_limited' && (
        <ErrorDialog
          title="少し時間をおいてください"
          body="短時間に多く使われたため、一時的に止めています"
          actions={[{ label: '閉じる', onPress: resume, primary: true }]}
        />
      )}
      {state.kind === 'dialog' && state.failure.kind === 'error' && (
        <ErrorDialog
          title="うまくいきませんでした"
          body="時間をおいてもう一度お試しください"
          actions={[
            { label: 'もう一度', onPress: () => void check(state.code), primary: true },
            { label: '入力方法の選択に戻る', onPress: onBack },
          ]}
        />
      )}
    </SafeAreaView>
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
  loading: { flex: 1, backgroundColor: '#fff' },
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
});
