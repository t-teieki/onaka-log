// 料理の撮影と推定（画面設計 3-4・4・4-1、F-013-15〜20）。カメラは偽物、画像の下ごしらえは差し替える
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import notFood from '../../../contracts/api/examples/valid/PhotoEstimateResponse-not-food.json';
import photoOk from '../../../contracts/api/examples/valid/PhotoEstimateResponse-ok.json';
import { ApiProvider } from '@/api/api-context';
import { createApiClient } from '@/api/client';
import type { PreparedImage } from '@/features/capture/prepare-image';
import { PhotoCaptureScreen } from '@/features/photo/photo-capture-screen';

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

const IMAGE: PreparedImage = { media_type: 'image/jpeg', data_base64: 'QkFTRTY0' };

type Reply = { status: number; body: unknown };
type Sent = { path: string; body: unknown; signal: AbortSignal };

const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  mockTakePicture.mockClear();
  mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
});

async function setup(replies: (Reply | Promise<Reply>)[]) {
  const sent: Sent[] = [];
  const fakeFetch = async (input: Request) => {
    sent.push({ path: new URL(input.url).pathname, body: JSON.parse(await input.text()), signal: input.signal });
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
    <PhotoCaptureScreen onCandidates={onCandidates} onManual={onManual} onBack={onBack} prepare={prepare} />,
    { wrapper },
  );
  return { sent, prepare, onCandidates, onManual, onBack };
}

const shoot = () => fireEvent.press(screen.getByRole('button', { name: '撮影する' }));
const errorBody = (code: string) => ({ error: { code, message: code } });
const REQUEST = { image: IMAGE, locale: 'ja-JP' };

describe('料理の撮影（F-013-15〜18）', () => {
  it('[F-013-15] 上部に「料理を撮る」を出す（栄養成分表示の撮り方の案内は出さない）', async () => {
    await setup([]);
    expect(screen.getByText('料理を撮る')).toBeOnTheScreen();
    expect(screen.queryByText('正面から・近づけて・表示全体が入るように撮ってください')).toBeNull();
  });

  it('[F-013-15] カメラの許可がなければ理由と「手入力する」を出す', async () => {
    mockPermission = { granted: false, canAskAgain: true, status: 'undetermined' };
    const { onManual } = await setup([]);
    expect(screen.getByText('料理の栄養を推定するためにカメラを使います')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '手入力する' }));
    expect(onManual).toHaveBeenCalled();
  });

  it('[F-013-16][F-013-18] 撮影した画像を下ごしらえして写真の推定に送り、品目ごとの候補を渡す', async () => {
    const { sent, prepare, onCandidates } = await setup([{ status: 200, body: photoOk }]);
    await shoot();
    expect(prepare).toHaveBeenCalledWith(PICTURE);
    expect(sent.map((s) => [s.path, s.body])).toEqual([['/v1/estimates/photo', REQUEST]]);
    expect(onCandidates).toHaveBeenCalledWith(photoOk.items);
  });

  it('[F-013-17] 推定中は「推定中…」。キャンセルしたら要求をやめ、結果を使わず撮影に戻る', async () => {
    let reply: (r: Reply) => void = () => {};
    const { sent, onCandidates } = await setup([new Promise<Reply>((r) => (reply = r))]);
    await shoot();
    expect(screen.getByText('推定中…')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'キャンセル' }));
    expect(sent[0]!.signal.aborted).toBe(true);
    expect(screen.queryByText('推定中…')).toBeNull();
    expect(screen.getByRole('button', { name: '撮影する' })).toBeOnTheScreen();
    await act(async () => reply({ status: 200, body: photoOk }));
    expect(onCandidates).not.toHaveBeenCalled();
  });
});

describe('推定できなかったとき（F-013-19・20）', () => {
  it('[F-013-19] 食べ物でなければ、撮り直す・入力方法の選択に戻るを出す', async () => {
    const { onBack } = await setup([{ status: 200, body: notFood }]);
    await shoot();
    expect(screen.getByText('食べ物が見つかりません')).toBeOnTheScreen();
    expect(screen.getByText('料理全体が入るように撮ってください')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '手入力する' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '入力方法の選択に戻る' }));
    expect(onBack).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '撮り直す' }));
    expect(screen.getByRole('button', { name: '撮影する' })).toBeOnTheScreen();
  });

  it('[F-013-19] 判別できなければ、撮り直す・手入力する・入力方法の選択に戻るを出す', async () => {
    const { onManual } = await setup([{ status: 200, body: { ...notFood, status: 'unrecognizable', notes: null } }]);
    await shoot();
    expect(screen.getByText('料理を判別できませんでした')).toBeOnTheScreen();
    expect(screen.getByText('明るい場所で、料理全体が入るように撮り直してください')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '撮り直す' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '入力方法の選択に戻る' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '手入力する' }));
    expect(onManual).toHaveBeenCalled();
  });

  it('[F-013-20] 失敗したら「もう一度」で同じ画像を送り直す（撮り直さない）', async () => {
    const { sent, prepare, onCandidates } = await setup([
      { status: 502, body: errorBody('upstream_unavailable') },
      { status: 200, body: photoOk },
    ]);
    await shoot();
    expect(screen.getByText('うまくいきませんでした')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'もう一度' }));
    expect(sent.map((s) => s.body)).toEqual([REQUEST, REQUEST]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(mockTakePicture).toHaveBeenCalledTimes(1);
    expect(onCandidates).toHaveBeenCalledWith(photoOk.items);
  });

  it('[F-013-20] 429 なら「少し時間をおいてください」、413 なら「画像が大きすぎます」', async () => {
    await setup([
      { status: 429, body: errorBody('rate_limited') },
      { status: 413, body: errorBody('payload_too_large') },
    ]);
    await shoot();
    expect(screen.getByText('少し時間をおいてください')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '閉じる' }));
    await shoot();
    expect(screen.getByText('画像が大きすぎます')).toBeOnTheScreen();
  });
});
