// 栄養成分表示の撮影と読み取り（画面設計 3-4・4・4-1、F-012-15・17〜20）。カメラは偽物、画像の下ごしらえは差し替える
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import twoColumns from '../../../contracts/api/examples/valid/LabelEstimateResponse-ok-two-columns.json';
import unreadable from '../../../contracts/api/examples/valid/LabelEstimateResponse-unreadable.json';
import { ApiProvider } from '@/api/api-context';
import { createApiClient } from '@/api/client';
import { LabelCaptureScreen } from '@/features/label/label-capture-screen';
import type { PreparedImage } from '@/features/capture/prepare-image';

const PICTURE = { uri: 'file:///cache/photo.jpg', width: 4032, height: 3024 };
const mockTakePicture = jest.fn(async (_options?: unknown) => PICTURE);
let mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
jest.mock('expo-camera', () => {
  const { View } = jest.requireActual('react-native');
  const { forwardRef: fr, useImperativeHandle: uih } = jest.requireActual('react');
  return {
    CameraView: fr((_props: unknown, ref: unknown) => {
      uih(ref, () => ({ takePictureAsync: mockTakePicture }));
      return <View testID="camera" />;
    }),
    useCameraPermissions: () => [mockPermission, jest.fn()],
  };
});

const mockLaunchLibrary = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (options?: unknown) => mockLaunchLibrary(options),
}));

const IMAGE: PreparedImage = { media_type: 'image/jpeg', data_base64: 'QkFTRTY0' };

type Reply = { status: number; body: unknown };
type Sent = { body: unknown; signal: AbortSignal };

const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  mockTakePicture.mockClear();
  mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
});

async function setup(replies: (Reply | Promise<Reply>)[]) {
  const sent: Sent[] = [];
  const fakeFetch = async (input: Request) => {
    sent.push({ body: JSON.parse(await input.text()), signal: input.signal });
    const reply = await (replies.shift() ?? { status: 500, body: {} });
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const api = createApiClient({ baseUrl: 'https://api.test', getToken: async () => 'token-1', fetch: fakeFetch });
  const queryClient = new QueryClient();
  clients.push(queryClient);
  const prepare = jest.fn(async () => IMAGE);
  const onCandidates = jest.fn();
  const onManual = jest.fn();
  const onBack = jest.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>{children}</ApiProvider>
    </QueryClientProvider>
  );
  await render(
    <LabelCaptureScreen onCandidates={onCandidates} onManual={onManual} onBack={onBack} prepare={prepare} />,
    { wrapper },
  );
  return { sent, prepare, onCandidates, onManual, onBack };
}

const shoot = () => fireEvent.press(screen.getByRole('button', { name: '撮影する' }));
const errorBody = (code: string) => ({ error: { code, message: code } });
const REQUEST = { image: IMAGE, locale: 'ja-JP' };

describe('栄養成分表示の撮影（F-012-15〜18）', () => {
  it('[F-012-15] 上部に「栄養成分表示を撮る」と撮り方の案内を出す', async () => {
    await setup([]);
    expect(screen.getByText('栄養成分表示を撮る')).toBeOnTheScreen();
    expect(screen.getByText('正面から・近づけて・表示全体が入るように撮ってください')).toBeOnTheScreen();
  });

  it('[F-013-22] 栄養成分表示では「画像を選ぶ」を出さない（写真推定だけ）', async () => {
    await setup([]);
    expect(screen.queryByRole('button', { name: '画像を選ぶ' })).toBeNull();
  });

  it('[F-012-15] カメラの許可がなければ理由と「手入力する」を出す', async () => {
    mockPermission = { granted: false, canAskAgain: true, status: 'undetermined' };
    const { onManual } = await setup([]);
    expect(screen.getByText('栄養成分表示を読み取るためにカメラを使います')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '手入力する' }));
    expect(onManual).toHaveBeenCalled();
  });

  it('[F-012-16][F-012-18] 撮影した画像を下ごしらえして送り、読めたら候補を渡す', async () => {
    const { sent, prepare, onCandidates } = await setup([{ status: 200, body: twoColumns }]);
    await shoot();
    expect(mockTakePicture).toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledWith(PICTURE);
    expect(sent.map((s) => s.body)).toEqual([REQUEST]);
    expect(onCandidates).toHaveBeenCalledWith(twoColumns.candidates);
  });

  it('[F-012-17] 読み取り中は「読み取り中…」。キャンセルしたら要求をやめ、結果を使わず撮影に戻る', async () => {
    let reply: (r: Reply) => void = () => {};
    const { sent, onCandidates } = await setup([new Promise<Reply>((r) => (reply = r))]);
    await shoot();
    expect(screen.getByText('読み取り中…')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'キャンセル' }));
    expect(sent[0]!.signal.aborted).toBe(true);
    expect(screen.queryByText('読み取り中…')).toBeNull();
    expect(screen.getByRole('button', { name: '撮影する' })).toBeOnTheScreen();
    await act(async () => reply({ status: 200, body: twoColumns }));
    expect(onCandidates).not.toHaveBeenCalled();
  });
});

describe('読み取れなかったとき（F-012-19・20）', () => {
  it('[F-012-19] 読み取れなければ、撮り直す・手入力する・入力方法の選択に戻るを出す', async () => {
    const { onManual, onBack } = await setup([{ status: 200, body: unreadable }]);
    await shoot();
    expect(screen.getByText('読み取れませんでした')).toBeOnTheScreen();
    expect(screen.getByText('栄養成分表示を正面から、近づけて撮り直してください')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '手入力する' }));
    expect(onManual).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '入力方法の選択に戻る' }));
    expect(onBack).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '撮り直す' }));
    expect(screen.queryByText('読み取れませんでした')).toBeNull();
    expect(screen.getByRole('button', { name: '撮影する' })).toBeOnTheScreen();
  });

  it('[F-012-19] 栄養成分表示でなければ、撮り直す・入力方法の選択に戻るを出す', async () => {
    await setup([{ status: 200, body: { ...unreadable, status: 'not_nutrition_label', issues: [], notes: null } }]);
    await shoot();
    expect(screen.getByText('栄養成分表示が見つかりません')).toBeOnTheScreen();
    expect(screen.getByText('栄養成分表示の部分を撮ってください')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '撮り直す' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '手入力する' })).toBeNull();
  });

  it('[F-012-20] 失敗したら「もう一度」で同じ画像を送り直す（撮り直さない）', async () => {
    const { sent, prepare, onCandidates } = await setup([
      { status: 502, body: errorBody('upstream_unavailable') },
      { status: 200, body: twoColumns },
    ]);
    await shoot();
    expect(screen.getByText('うまくいきませんでした')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'もう一度' }));
    expect(sent.map((s) => s.body)).toEqual([REQUEST, REQUEST]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(mockTakePicture).toHaveBeenCalledTimes(1);
    expect(onCandidates).toHaveBeenCalled();
  });

  it('[F-012-20] 422 も「うまくいきませんでした」', async () => {
    await setup([{ status: 422, body: errorBody('estimation_failed') }]);
    await shoot();
    expect(screen.getByText('うまくいきませんでした')).toBeOnTheScreen();
  });

  it('[F-012-20] 429 なら「少し時間をおいてください」。閉じると撮影に戻る', async () => {
    await setup([{ status: 429, body: errorBody('rate_limited') }]);
    await shoot();
    expect(screen.getByText('少し時間をおいてください')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.getByRole('button', { name: '撮影する' })).toBeOnTheScreen();
  });

  it('[F-012-20] 413 なら「画像が大きすぎます」と「撮り直す」', async () => {
    await setup([{ status: 413, body: errorBody('payload_too_large') }]);
    await shoot();
    expect(screen.getByText('画像が大きすぎます')).toBeOnTheScreen();
    expect(screen.getByText('もう一度撮影してください')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '撮り直す' }));
    expect(screen.getByRole('button', { name: '撮影する' })).toBeOnTheScreen();
  });

  it('撮影や下ごしらえに失敗したら「うまくいきませんでした」', async () => {
    mockTakePicture.mockRejectedValueOnce(new Error('camera'));
    const { sent } = await setup([]);
    await shoot();
    expect(screen.getByText('うまくいきませんでした')).toBeOnTheScreen();
    expect(sent).toEqual([]);
  });
});
