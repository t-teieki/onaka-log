// 確認・修正の入力モード（手入力、F-014・F-020、画面設計 3-5）と保存（POST /v1/meals、F-030）
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import manualMeal from '../../../contracts/domain/examples/valid/meal-manual.json';
import { ApiProvider } from '@/api/api-context';
import { createApiClient } from '@/api/client';
import { ManualEntryScreen } from '@/features/record/manual-entry-screen';

const NOW = new Date('2026-11-13T08:00:00+09:00');
const MEAL_ID = manualMeal.meal_id;
const ITEM_ID = manualMeal.items[0].item_id;

type Sent = { method: string; path: string; body: unknown };
type Responder = () => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

async function setup(respond: Responder = () => ({ status: 201, body: manualMeal })) {
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
  await render(<ManualEntryScreen now={() => NOW} newId={newId} onSaved={onSaved} onClose={onClose} />, { wrapper });
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
