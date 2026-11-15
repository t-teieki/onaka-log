// 確認・修正の入力モード（手入力、F-014・F-020、画面設計 3-5）と保存（POST /v1/meals、F-030）
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import manualMeal from '../../../contracts/domain/examples/valid/meal-manual.json';
import { ApiProvider } from '@/api/api-context';
import { createApiClient } from '@/api/client';
import { ManualEntryScreen } from '@/features/record/manual-entry-screen';

// OS 標準の日時ピッカーは描けないので、受け取った props を記録する偽物に差し替える
type PickerProps = {
  value: Date;
  mode?: string;
  maximumDate?: Date;
  timeZoneName?: string;
  onChange: (event: { type: string; nativeEvent: { timestamp: number } }, date?: Date) => void;
};
const mockPickers: PickerProps[] = [];
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: PickerProps) => {
      mockPickers.push(props);
      return <View testID={`picker-${props.mode ?? 'date'}`} />;
    },
  };
});
const lastPicker = () => mockPickers[mockPickers.length - 1];
const pick = async (type: 'set' | 'dismissed', date?: Date) =>
  act(async () => lastPicker().onChange({ type, nativeEvent: { timestamp: date?.getTime() ?? 0 } }, date));

const NOW = new Date('2026-11-13T08:00:00+09:00');
const MEAL_ID = manualMeal.meal_id;
const ITEM_ID = manualMeal.items[0].item_id;

type Sent = { method: string; path: string; body: unknown };
type Responder = () => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;

const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  mockPickers.splice(0);
});

async function setup(
  respond: Responder = () => ({ status: 201, body: manualMeal }),
  props: { recordDate?: string } = {},
) {
  const sent: Sent[] = [];
  const fakeFetch = async (input: Request) => {
    const url = new URL(input.url);
    sent.push({ method: input.method, path: url.pathname, body: JSON.parse((await input.text()) || 'null') });
    const { status, body } = await respond();
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  const api = createApiClient({ baseUrl: 'https://api.test', getToken: async () => null, fetch: fakeFetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(queryClient);
  const ids = [MEAL_ID, ITEM_ID];
  let n = 0;
  const newId = jest.fn(() => ids[n++] ?? `extra-${n}`);
  const onSaved = jest.fn();
  const onClose = jest.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>{children}</ApiProvider>
    </QueryClientProvider>
  );
  await render(<ManualEntryScreen now={() => NOW} newId={newId} onSaved={onSaved} onClose={onClose} {...props} />, { wrapper });
  return { sent, onSaved, onClose, newId, queryClient };
}

async function fillAll() {
  await fireEvent.changeText(screen.getByLabelText('食品名'), '職場のお菓子');
  await fireEvent.changeText(screen.getByLabelText('kcal'), '150');
  await fireEvent.changeText(screen.getByLabelText('たんぱく質（g）'), '2');
  await fireEvent.changeText(screen.getByLabelText('脂質（g）'), '7.5');
  await fireEvent.changeText(screen.getByLabelText('炭水化物（g）'), '19');
}

const saveButton = () => screen.getByRole('button', { name: '保存する' });

describe('手入力（F-014）', () => {
  it('食べた日時（既定は開いた時刻）と、5つの入力欄を出す', async () => {
    await setup();
    expect(screen.getByText('11/13 08:00')).toBeOnTheScreen();
    for (const label of ['食品名', 'kcal', 'たんぱく質（g）', '脂質（g）', '炭水化物（g）']) {
      expect(screen.getByLabelText(label)).toBeOnTheScreen();
    }
  });

  it('5項目すべて入れるまで保存できない（Q-38）', async () => {
    await setup();
    expect(saveButton()).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('食品名'), '職場のお菓子');
    await fireEvent.changeText(screen.getByLabelText('kcal'), '150');
    await fireEvent.changeText(screen.getByLabelText('たんぱく質（g）'), '2');
    await fireEvent.changeText(screen.getByLabelText('脂質（g）'), '7.5');
    expect(saveButton()).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('炭水化物（g）'), '19');
    expect(saveButton()).toBeEnabled();
  });

  it('小数第2位まで入れると理由を出し、保存できない', async () => {
    await setup();
    await fillAll();
    await fireEvent.changeText(screen.getByLabelText('脂質（g）'), '7.55');
    expect(screen.getByText('小数第1位までで入力してください')).toBeOnTheScreen();
    expect(saveButton()).toBeDisabled();
  });

  it('保存すると POST /v1/meals に手入力の食品1件を送り、記録日を添えて閉じる（F-030）', async () => {
    const { sent, onSaved } = await setup();
    await fillAll();
    await fireEvent.press(saveButton());
    await act(async () => {});
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('POST');
    expect(sent[0].path).toBe('/v1/meals');
    expect(sent[0].body).toEqual({
      meal_id: MEAL_ID,
      eaten_at: '2026-11-13T08:00:00+09:00',
      items: [
        {
          item_id: ITEM_ID,
          name: '職場のお菓子',
          source: manualMeal.items[0].source,
          reference: manualMeal.items[0].reference,
          estimate_detail: null,
          portion: { mode: 'whole', fraction: null, pieces: null },
        },
      ],
    });
    expect(onSaved).toHaveBeenCalledWith('2026-11-13');
  });

  it('保存したらその日の一覧を読み直す（ホームに戻ったとき新しい記録が出る）', async () => {
    const { queryClient } = await setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await fillAll();
    await fireEvent.press(saveButton());
    await act(async () => {});
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['day', '2026-11-13'] });
  });

  it('保存中は二度押しできない', async () => {
    let release: () => void = () => {};
    const { sent } = await setup(
      () => new Promise((resolve) => (release = () => resolve({ status: 201, body: manualMeal }))),
    );
    await fillAll();
    await fireEvent.press(saveButton());
    await act(async () => {});
    await fireEvent.press(screen.getByTestId('save-button'));
    expect(sent).toHaveLength(1);
    await act(async () => release());
  });

  it('保存に失敗したら入力を残してメッセージを出し、再送は同じ meal_id で送る', async () => {
    let fail = true;
    const { sent, onSaved } = await setup(() =>
      fail
        ? { status: 502, body: { error: { code: 'upstream_unavailable', message: 'x' } } }
        : { status: 201, body: manualMeal },
    );
    await fillAll();
    await fireEvent.press(saveButton());
    expect(await screen.findByText('保存できませんでした。もう一度お試しください')).toBeOnTheScreen();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('食品名')).toHaveDisplayValue('職場のお菓子');

    fail = false;
    await fireEvent.press(saveButton());
    await act(async () => {});
    expect(sent).toHaveLength(2);
    expect((sent[1].body as { meal_id: string }).meal_id).toBe(MEAL_ID);
    expect(onSaved).toHaveBeenCalledWith('2026-11-13');
  });

  it('409 meal_already_exists は再送なので成功として扱う（画面設計 4-1）', async () => {
    const { onSaved } = await setup(() => ({
      status: 409,
      body: { error: { code: 'meal_already_exists', message: 'x' } },
    }));
    await fillAll();
    await fireEvent.press(saveButton());
    await act(async () => {});
    expect(onSaved).toHaveBeenCalledWith('2026-11-13');
  });

  it('× で保存せずに閉じる', async () => {
    const { sent, onClose } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});

describe('食べた日時の変更（Q-33・Q-44、画面設計 3-5）', () => {
  const sentEatenAt = (sent: Sent[]) => (sent[0].body as { eaten_at: string }).eaten_at;

  async function saveWith(sent: Sent[]) {
    await fillAll();
    await fireEvent.press(saveButton());
    await act(async () => {});
    return sentEatenAt(sent);
  }

  it('過去の日を表示中に開いたときは、その日の今の時刻が既定', async () => {
    await setup(undefined, { recordDate: '2026-11-10' });
    expect(screen.getByText('11/10 08:00')).toBeOnTheScreen();
  });

  it('タップするまでピッカーは出さない', async () => {
    await setup();
    expect(mockPickers).toHaveLength(0);
  });

  describe('iOS: 日時のホイールと「完了」', () => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', 'ios'));

    it('今の値・上限は今・日本時間でピッカーを開く', async () => {
      await setup();
      await fireEvent.press(screen.getByRole('button', { name: /食べた日時/ }));
      expect(lastPicker().mode).toBe('datetime');
      expect(lastPicker().value).toEqual(NOW);
      expect(lastPicker().maximumDate).toEqual(NOW);
      expect(lastPicker().timeZoneName).toBe('Asia/Tokyo');
    });

    it('選んで「完了」を押すと日時が変わり、その日時で保存して、その記録日を返す', async () => {
      const { sent, onSaved } = await setup();
      await fireEvent.press(screen.getByRole('button', { name: /食べた日時/ }));
      await pick('set', new Date('2026-11-12T01:30:00+09:00'));
      await fireEvent.press(screen.getByRole('button', { name: '完了' }));
      expect(screen.getByText('11/12 01:30')).toBeOnTheScreen();
      expect(screen.queryByTestId('picker-datetime')).toBeNull();
      expect(await saveWith(sent)).toBe('2026-11-12T01:30:00+09:00');
      expect(onSaved).toHaveBeenCalledWith('2026-11-11'); // 4:00 より前は前日の記録（DM-01）
    });

    it('「キャンセル」なら変えない', async () => {
      const { sent } = await setup();
      await fireEvent.press(screen.getByRole('button', { name: /食べた日時/ }));
      await pick('set', new Date('2026-11-12T01:30:00+09:00'));
      await fireEvent.press(screen.getByRole('button', { name: 'キャンセル' }));
      expect(screen.getByText('11/13 08:00')).toBeOnTheScreen();
      expect(await saveWith(sent)).toBe('2026-11-13T08:00:00+09:00');
    });

    it('未来を返されたら今に丸める', async () => {
      const { sent } = await setup();
      await fireEvent.press(screen.getByRole('button', { name: /食べた日時/ }));
      await pick('set', new Date('2026-11-13T09:00:00+09:00'));
      await fireEvent.press(screen.getByRole('button', { name: '完了' }));
      expect(await saveWith(sent)).toBe('2026-11-13T08:00:00+09:00');
    });
  });

  describe('Android: 日付 → 時刻のダイアログ', () => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));

    it('日付を選ぶと時刻のダイアログに進み、両方選ぶと変わる', async () => {
      const { sent } = await setup();
      await fireEvent.press(screen.getByRole('button', { name: /食べた日時/ }));
      expect(lastPicker().mode).toBe('date');
      expect(lastPicker().maximumDate).toEqual(NOW);
      expect(lastPicker().timeZoneName).toBe('Asia/Tokyo');
      await pick('set', new Date('2026-11-11T08:00:00+09:00'));
      expect(lastPicker().mode).toBe('time');
      expect(lastPicker().value).toEqual(new Date('2026-11-11T08:00:00+09:00'));
      await pick('set', new Date('2026-11-11T19:45:00+09:00'));
      expect(screen.queryByTestId('picker-time')).toBeNull();
      expect(screen.getByText('11/11 19:45')).toBeOnTheScreen();
      expect(await saveWith(sent)).toBe('2026-11-11T19:45:00+09:00');
    });

    it('日付のダイアログを閉じたら変えない', async () => {
      await setup();
      await fireEvent.press(screen.getByRole('button', { name: /食べた日時/ }));
      await pick('dismissed');
      expect(screen.queryByTestId('picker-date')).toBeNull();
      expect(screen.queryByTestId('picker-time')).toBeNull();
      expect(screen.getByText('11/13 08:00')).toBeOnTheScreen();
    });

    it('時刻のダイアログを閉じたら、日付も変えない', async () => {
      await setup();
      await fireEvent.press(screen.getByRole('button', { name: /食べた日時/ }));
      await pick('set', new Date('2026-11-11T08:00:00+09:00'));
      await pick('dismissed');
      expect(screen.queryByTestId('picker-time')).toBeNull();
      expect(screen.getByText('11/13 08:00')).toBeOnTheScreen();
    });

    it('今日の日付で未来の時刻を選んだら今に丸める', async () => {
      const { sent } = await setup();
      await fireEvent.press(screen.getByRole('button', { name: /食べた日時/ }));
      await pick('set', NOW);
      await pick('set', new Date('2026-11-13T23:00:00+09:00'));
      expect(await saveWith(sent)).toBe('2026-11-13T08:00:00+09:00');
    });
  });
});
