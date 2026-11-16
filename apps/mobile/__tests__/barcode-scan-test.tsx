// バーコードの読み取りと照合（画面設計 3-3・4・4-1、F-011-14〜18）。カメラは偽物に差し替え、読めたことにする
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';

import found from '../../../contracts/api/examples/valid/ProductLookupResponse-found.json';
import notFound from '../../../contracts/api/examples/valid/ProductLookupResponse-not-found.json';
import { ApiProvider } from '@/api/api-context';
import { createApiClient } from '@/api/client';
import { BarcodeScanScreen } from '@/features/barcode/barcode-scan-screen';

type ScanEvent = { type: string; data: string };
type CameraProps = { barcodeScannerSettings?: { barcodeTypes: string[] }; onBarcodeScanned?: (e: ScanEvent) => void };
type Permission = { granted: boolean; canAskAgain: boolean; status: string };

const mockCamera: { props: CameraProps | null } = { props: null };
let mockPermission: Permission | null = { granted: true, canAskAgain: true, status: 'granted' };
const mockRequestPermission = jest.fn();
jest.mock('expo-camera', () => {
  const { View } = jest.requireActual('react-native');
  return {
    CameraView: (props: CameraProps) => {
      mockCamera.props = props;
      return <View testID="camera" />;
    },
    useCameraPermissions: () => [mockPermission, mockRequestPermission],
  };
});

const CODE = found.item.source.product_code;
const scan = (data: string = CODE, type = 'ean13') =>
  act(async () => mockCamera.props?.onBarcodeScanned?.({ type, data }));

type Reply = { status: number; body: unknown };

const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  mockCamera.props = null;
  mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
  jest.restoreAllMocks();
});

async function setup(replies: (Reply | Promise<Reply>)[]) {
  const requested: string[] = [];
  const fakeFetch = async (input: Request) => {
    requested.push(new URL(input.url).pathname);
    const reply = await (replies.shift() ?? { status: 500, body: {} });
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const api = createApiClient({ baseUrl: 'https://api.test', getToken: async () => 'token-1', fetch: fakeFetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  const onFound = jest.fn();
  const onManual = jest.fn();
  const onBack = jest.fn();
  const onTakeLabel = jest.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>{children}</ApiProvider>
    </QueryClientProvider>
  );
  await render(
    <BarcodeScanScreen onFound={onFound} onManual={onManual} onBack={onBack} onTakeLabel={onTakeLabel} />,
    { wrapper },
  );
  return { requested, onFound, onManual, onBack, onTakeLabel };
}

const errorBody = (code: string) => ({ error: { code, message: code } });

describe('カメラの許可（F-011-14）', () => {
  it('[F-011-14] 許可がなければ理由と「カメラを許可する」「手入力する」を出す', async () => {
    mockPermission = { granted: false, canAskAgain: true, status: 'undetermined' };
    const { onManual } = await setup([]);
    expect(screen.getByText('バーコードを読み取るためにカメラを使います')).toBeOnTheScreen();
    expect(screen.queryByTestId('camera')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'カメラを許可する' }));
    expect(mockRequestPermission).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '手入力する' }));
    expect(onManual).toHaveBeenCalled();
  });

  it('[F-011-14] もう聞けないときは「設定を開く」', async () => {
    mockPermission = { granted: false, canAskAgain: false, status: 'denied' };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await setup([]);
    await fireEvent.press(screen.getByRole('button', { name: '設定を開く' }));
    expect(openSettings).toHaveBeenCalled();
  });
});

describe('読み取りと照合（F-011-15〜18）', () => {
  it('[F-011-15] JAN の種類だけを読む', async () => {
    await setup([]);
    expect(mockCamera.props?.barcodeScannerSettings?.barcodeTypes).toEqual(['ean13', 'ean8', 'upc_a', 'upc_e']);
  });

  it('[F-011-15][F-011-16] 読めたら照合し、見つかれば候補を渡す', async () => {
    const { requested, onFound } = await setup([{ status: 200, body: found }]);
    await scan();
    expect(requested).toEqual([`/v1/products/${CODE}`]);
    expect(onFound).toHaveBeenCalledWith(found.item);
  });

  it('[F-011-15] 照合中は「照合中…」を出し、続けて読んでも呼ばない', async () => {
    let reply: (r: Reply) => void = () => {};
    const { requested, onFound } = await setup([new Promise<Reply>((r) => (reply = r))]);
    await scan();
    expect(screen.getByText('照合中…')).toBeOnTheScreen();
    await scan();
    await scan('4901234567801');
    expect(requested).toHaveLength(1);
    await act(async () => reply({ status: 200, body: found }));
    expect(onFound).toHaveBeenCalledTimes(1);
  });

  it('[F-011-17] 見つからなければ理由と、栄養成分表示を撮る・手入力・入力方法の選択に戻るを出す', async () => {
    const { onManual, onBack, onFound, onTakeLabel } = await setup([{ status: 200, body: notFound }]);
    await scan();
    expect(screen.getByText('商品が見つかりません')).toBeOnTheScreen();
    expect(screen.getByText('栄養成分表示を撮ると記録できます')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '栄養成分表示を撮る' }));
    expect(onTakeLabel).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '手入力する' }));
    expect(onManual).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '入力方法の選択に戻る' }));
    expect(onBack).toHaveBeenCalled();
    expect(onFound).not.toHaveBeenCalled();
  });

  it('[F-011-18] 失敗したら「もう一度」で同じ番号を照合し直す', async () => {
    const { requested, onFound } = await setup([
      { status: 502, body: errorBody('upstream_unavailable') },
      { status: 200, body: found },
    ]);
    await scan();
    expect(screen.getByText('うまくいきませんでした')).toBeOnTheScreen();
    expect(screen.getByText('時間をおいてもう一度お試しください')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'もう一度' }));
    expect(requested).toEqual([`/v1/products/${CODE}`, `/v1/products/${CODE}`]);
    expect(onFound).toHaveBeenCalledWith(found.item);
  });

  it('[F-011-18] 429 なら「少し時間をおいてください」。閉じたら読み取りを再開する', async () => {
    const { requested, onFound } = await setup([
      { status: 429, body: errorBody('rate_limited') },
      { status: 200, body: found },
    ]);
    await scan();
    expect(screen.getByText('少し時間をおいてください')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByText('少し時間をおいてください')).toBeNull();
    await scan();
    expect(requested).toHaveLength(2);
    expect(onFound).toHaveBeenCalled();
  });

  it('「×」（読み取りをやめる）で戻る', async () => {
    const { onBack } = await setup([]);
    await fireEvent.press(screen.getByLabelText('読み取りをやめる'));
    expect(onBack).toHaveBeenCalled();
  });
});
