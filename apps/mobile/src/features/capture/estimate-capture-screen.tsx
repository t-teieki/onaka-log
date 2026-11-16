// 撮影と推定（画面設計 3-4）。栄養成分表示（F-012-15〜20）と料理の写真（F-013-15〜20）で共通。
// 撮って（写真推定は端末の画像を選んでも、F-013-22）縮小し、推定 API に送って候補を渡す
import { CameraView, useCameraPermissions } from 'expo-camera';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApi } from '@/api/api-context';
import type { ApiClient } from '@/api/client';
import type { components } from '@/api/schema';

import { ActionButton, CameraPermissionView, ErrorDialog } from './capture-parts';
import { prepareImage, type Picture, type PreparedImage } from './prepare-image';

export type FoodItemDraft = components['schemas']['FoodItemDraft'];

/** 栄養成分表示（label）か料理の写真（photo）か */
export type EstimateKind = 'label' | 'photo';

export type CaptureProps = {
  /** 推定できたとき（栄養成分表示は列ごと、写真は品目ごとの候補。1件以上） */
  onCandidates: (candidates: FoodItemDraft[]) => void;
  onManual: () => void;
  /** 入力方法の選択（前の画面）に戻る */
  onBack: () => void;
  /** 画像の下ごしらえ（テストで差し替える） */
  prepare?: (picture: Picture) => Promise<PreparedImage>;
};

type Failure = 'unreadable' | 'not_label' | 'not_food' | 'unrecognizable' | 'error' | 'rate_limited' | 'too_large';
type Outcome = { kind: 'ok'; candidates: FoodItemDraft[] } | { kind: Failure } | { kind: 'cancelled' };

/** 推定 API を呼び、結果を画面で扱う形にする */
async function request(api: ApiClient, kind: EstimateKind, image: PreparedImage, signal: AbortSignal) {
  const body = { image, locale: 'ja-JP' as const };
  if (kind === 'label') {
    const { data, response } = await api.POST('/v1/estimates/label', { body, signal });
    if (!data) return response.status;
    if (data.status === 'ok' && data.candidates.length > 0) return { kind: 'ok' as const, candidates: data.candidates };
    return { kind: data.status === 'not_nutrition_label' ? ('not_label' as const) : ('unreadable' as const) };
  }
  const { data, response } = await api.POST('/v1/estimates/photo', { body, signal });
  if (!data) return response.status;
  if (data.status === 'ok' && data.items.length > 0) return { kind: 'ok' as const, candidates: data.items };
  return { kind: data.status === 'not_food' ? ('not_food' as const) : ('unrecognizable' as const) };
}

async function estimate(
  api: ApiClient,
  kind: EstimateKind,
  image: PreparedImage,
  signal: AbortSignal,
): Promise<Outcome> {
  try {
    const result = await request(api, kind, image, signal);
    if (typeof result !== 'number') return result;
    if (result === 429) return { kind: 'rate_limited' };
    if (result === 413) return { kind: 'too_large' };
    return { kind: 'error' };
  } catch {
    return signal.aborted ? { kind: 'cancelled' } : { kind: 'error' };
  }
}

/** 方式ごとの文言（画面設計 3-4・4） */
const TEXTS: Record<EstimateKind, { title: string; guide: string | null; reason: string; busy: string }> = {
  label: {
    title: '栄養成分表示を撮る',
    guide: '正面から・近づけて・表示全体が入るように撮ってください',
    reason: '栄養成分表示を読み取るためにカメラを使います',
    busy: '読み取り中…',
  },
  photo: {
    title: '料理を撮る',
    guide: null,
    reason: '料理の栄養を推定するためにカメラを使います',
    busy: '推定中…',
  },
};

type State = { kind: 'camera' } | { kind: 'reading' } | { kind: 'dialog'; failure: Failure };

export function EstimateCaptureScreen({
  kind,
  onCandidates,
  onManual,
  onBack,
  prepare = prepareImage,
}: CaptureProps & { kind: EstimateKind }) {
  const texts = TEXTS[kind];
  const api = useApi();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [state, setState] = useState<State>({ kind: 'camera' });
  // 縮小した画像は、この画面にいる間だけメモリに持つ（「もう一度」で送り直す、F-012-20）。端末には保存しない
  const image = useRef<PreparedImage | null>(null);
  const request = useRef<AbortController | null>(null);
  // 撮影・選択を始めてから読み取りに入るまでの二度押しを防ぐ
  const busy = useRef(false);

  const send = async (img: PreparedImage) => {
    const controller = new AbortController();
    request.current = controller;
    setState({ kind: 'reading' });
    const outcome = await estimate(api, kind, img, controller.signal);
    if (request.current !== controller || outcome.kind === 'cancelled') return; // キャンセル済み（F-012-17）
    request.current = null;
    if (outcome.kind === 'ok') {
      onCandidates(outcome.candidates);
      return;
    }
    setState({ kind: 'dialog', failure: outcome.kind });
  };

  /** 画像を得て（null なら選ばなかった）、下ごしらえして送る */
  const start = async (obtain: () => Promise<Picture | null>) => {
    if (state.kind !== 'camera' || busy.current) return;
    busy.current = true;
    try {
      const picture = await obtain();
      if (!picture) return;
      setState({ kind: 'reading' });
      image.current = await prepare(picture);
    } catch {
      image.current = null;
      setState({ kind: 'dialog', failure: 'error' });
      return;
    } finally {
      busy.current = false;
    }
    await send(image.current);
  };

  const shoot = () =>
    start(async () => {
      const picture = await camera.current?.takePictureAsync({ shutterSound: false });
      if (!picture) throw new Error('撮影できなかった');
      return picture;
    });

  // OS の画像の選択（写真の許可は要らない）。元の画像は変えない（F-013-22）
  const pick = () =>
    start(async () => {
      const result = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
      const asset = result.canceled ? null : result.assets[0];
      return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
    });

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
        <Text style={styles.title}>{texts.title}</Text>
        <View style={styles.close} />
      </View>

      {!permission ? (
        <ActivityIndicator style={styles.loading} />
      ) : !permission.granted ? (
        <CameraPermissionView
          permission={permission}
          reason={texts.reason}
          requestPermission={requestPermission}
          onManual={onManual}
          onPick={kind === 'photo' ? () => void pick() : undefined}
        />
      ) : (
        <>
          <View style={styles.cameraBox}>
            <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
            {texts.guide && <Text style={styles.guide}>{texts.guide}</Text>}
          </View>
          <View style={styles.footer}>
            <View style={styles.side}>
              {kind === 'photo' && (
                <Pressable
                  accessibilityRole="button"
                  disabled={state.kind !== 'camera'}
                  onPress={() => void pick()}
                  style={styles.pick}
                >
                  <Text style={styles.pickText}>画像を選ぶ</Text>
                </Pressable>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="撮影する"
              disabled={state.kind !== 'camera'}
              onPress={() => void shoot()}
              style={styles.shutter}
            >
              <View style={styles.shutterInner} />
            </Pressable>
            <View style={styles.side} />
          </View>
        </>
      )}

      {state.kind === 'reading' && (
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.overlayText}>{texts.busy}</Text>
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

/** 推定できなかったときのダイアログ（画面設計 4-1、F-012-19・20、F-013-19・20） */
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
    case 'unrecognizable':
      return (
        <ErrorDialog
          title="料理を判別できませんでした"
          body="明るい場所で、料理全体が入るように撮り直してください"
          actions={[
            { label: '撮り直す', onPress: a.retake, primary: true },
            { label: '手入力する', onPress: a.onManual },
            back,
          ]}
        />
      );
    case 'not_food':
      return (
        <ErrorDialog
          title="食べ物が見つかりません"
          body="料理全体が入るように撮ってください"
          actions={[{ label: '撮り直す', onPress: a.retake, primary: true }, back]}
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: '#000',
  },
  side: { flex: 1, alignItems: 'flex-start' },
  pick: { borderWidth: 1, borderColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  pickText: { color: '#fff', fontSize: 14 },
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
