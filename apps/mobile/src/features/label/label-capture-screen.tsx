// 栄養成分表示の撮影と読み取り（画面設計 3-4、F-012-15〜20）。撮って縮小し、推定 API に送って候補を渡す
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApi } from '@/api/api-context';
import type { ApiClient } from '@/api/client';
import type { components } from '@/api/schema';
import { ActionButton, CameraPermissionView, ErrorDialog } from '@/features/capture/capture-parts';

import { prepareImage, type Picture, type PreparedImage } from './prepare-image';

export type FoodItemDraft = components['schemas']['FoodItemDraft'];

type Props = {
  /** 読めたとき（列ごとの候補。1件以上） */
  onCandidates: (candidates: FoodItemDraft[]) => void;
  onManual: () => void;
  /** 入力方法の選択（前の画面）に戻る */
  onBack: () => void;
  /** 画像の下ごしらえ（テストで差し替える） */
  prepare?: (picture: Picture) => Promise<PreparedImage>;
};

type Failure = 'unreadable' | 'not_label' | 'error' | 'rate_limited' | 'too_large';
type Outcome = { kind: 'ok'; candidates: FoodItemDraft[] } | { kind: Failure } | { kind: 'cancelled' };

async function estimate(api: ApiClient, image: PreparedImage, signal: AbortSignal): Promise<Outcome> {
  try {
    const { data, response } = await api.POST('/v1/estimates/label', {
      body: { image, locale: 'ja-JP' },
      signal,
    });
    if (data) {
      if (data.status === 'ok' && data.candidates.length > 0) return { kind: 'ok', candidates: data.candidates };
      return { kind: data.status === 'not_nutrition_label' ? 'not_label' : 'unreadable' };
    }
    if (response.status === 429) return { kind: 'rate_limited' };
    if (response.status === 413) return { kind: 'too_large' };
    return { kind: 'error' };
  } catch {
    return signal.aborted ? { kind: 'cancelled' } : { kind: 'error' };
  }
}

type State = { kind: 'camera' } | { kind: 'reading' } | { kind: 'dialog'; failure: Failure };

export function LabelCaptureScreen({ onCandidates, onManual, onBack, prepare = prepareImage }: Props) {
  const api = useApi();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [state, setState] = useState<State>({ kind: 'camera' });
  // 縮小した画像は、この画面にいる間だけメモリに持つ（「もう一度」で送り直す、F-012-20）。端末には保存しない
  const image = useRef<PreparedImage | null>(null);
  const request = useRef<AbortController | null>(null);

  const send = async (img: PreparedImage) => {
    const controller = new AbortController();
    request.current = controller;
    setState({ kind: 'reading' });
    const outcome = await estimate(api, img, controller.signal);
    if (request.current !== controller || outcome.kind === 'cancelled') return; // キャンセル済み（F-012-17）
    request.current = null;
    if (outcome.kind === 'ok') {
      onCandidates(outcome.candidates);
      return;
    }
    setState({ kind: 'dialog', failure: outcome.kind });
  };

  const shoot = async () => {
    if (state.kind !== 'camera') return;
    setState({ kind: 'reading' });
    try {
      const picture = await camera.current?.takePictureAsync({ shutterSound: false });
      if (!picture) throw new Error('撮影できなかった');
      image.current = await prepare(picture);
    } catch {
      image.current = null;
      setState({ kind: 'dialog', failure: 'error' });
      return;
    }
    await send(image.current);
  };

  const cancel = () => {
    request.current?.abort();
    request.current = null;
    setState({ kind: 'camera' });
  };

  const retake = () => {
    image.current = null;
    setState({ kind: 'camera' });
  };

  // 「もう一度」: 画像があれば送り直す。撮影でつまずいたときは撮影に戻る
  const retry = () => (image.current ? void send(image.current) : retake());

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="撮影をやめる" onPress={onBack} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <Text style={styles.title}>栄養成分表示を撮る</Text>
        <View style={styles.close} />
      </View>

      {!permission ? (
        <ActivityIndicator style={styles.loading} />
      ) : !permission.granted ? (
        <CameraPermissionView
          permission={permission}
          reason="栄養成分表示を読み取るためにカメラを使います"
          requestPermission={requestPermission}
          onManual={onManual}
        />
      ) : (
        <>
          <View style={styles.cameraBox}>
            <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
            <Text style={styles.guide}>正面から・近づけて・表示全体が入るように撮ってください</Text>
          </View>
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="撮影する"
              disabled={state.kind !== 'camera'}
              onPress={() => void shoot()}
              style={styles.shutter}
            >
              <View style={styles.shutterInner} />
            </Pressable>
          </View>
        </>
      )}

      {state.kind === 'reading' && (
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.overlayText}>読み取り中…</Text>
          <View style={styles.cancel}>
            <ActionButton label="キャンセル" onPress={cancel} />
          </View>
        </View>
      )}
      {state.kind === 'dialog' && (
        <FailureDialog failure={state.failure} retake={retake} retry={retry} onManual={onManual} onBack={onBack} />
      )}
    </SafeAreaView>
  );
}

/** 読み取れなかったときのダイアログ（画面設計 4-1、F-012-19・20） */
function FailureDialog({
  failure,
  ...a
}: {
  failure: Failure;
  retake: () => void;
  retry: () => void;
  onManual: () => void;
  onBack: () => void;
}) {
  const back = { label: '入力方法の選択に戻る', onPress: a.onBack };
  switch (failure) {
    case 'unreadable':
      return (
        <ErrorDialog
          title="読み取れませんでした"
          body="栄養成分表示を正面から、近づけて撮り直してください"
          actions={[
            { label: '撮り直す', onPress: a.retake, primary: true },
            { label: '手入力する', onPress: a.onManual },
            back,
          ]}
        />
      );
    case 'not_label':
      return (
        <ErrorDialog
          title="栄養成分表示が見つかりません"
          body="栄養成分表示の部分を撮ってください"
          actions={[{ label: '撮り直す', onPress: a.retake, primary: true }, back]}
        />
      );
    case 'rate_limited':
      return (
        <ErrorDialog
          title="少し時間をおいてください"
          body="短時間に多く使われたため、一時的に止めています"
          actions={[{ label: '閉じる', onPress: a.retake, primary: true }]}
        />
      );
    case 'too_large':
      return (
        <ErrorDialog
          title="画像が大きすぎます"
          body="もう一度撮影してください"
          actions={[{ label: '撮り直す', onPress: a.retake, primary: true }]}
        />
      );
    default:
      return (
        <ErrorDialog
          title="うまくいきませんでした"
          body="時間をおいてもう一度お試しください"
          actions={[{ label: 'もう一度', onPress: a.retry, primary: true }, back]}
        />
      );
  }
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
  guide: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    textAlign: 'center',
    color: '#fff',
    fontSize: 13,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  footer: { alignItems: 'center', paddingVertical: 20, backgroundColor: '#000' },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayText: { color: '#fff', fontSize: 18 },
  cancel: { width: 200 },
});
