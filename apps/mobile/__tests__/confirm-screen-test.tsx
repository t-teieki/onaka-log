// 確認・修正の画面（画面設計 3-5、F-020-01〜06）。バーコードの候補（ProductLookupResponse の例）を使う
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import threeMeals from '../../../contracts/api/examples/valid/DaySummary-three-meals.json';
import twoColumns from '../../../contracts/api/examples/valid/LabelEstimateResponse-ok-two-columns.json';
import found from '../../../contracts/api/examples/valid/ProductLookupResponse-found.json';
import { ApiProvider } from '@/api/api-context';
import { createApiClient, type Meal } from '@/api/client';
import { ConfirmScreen, type FoodItemDraft } from '@/features/confirm/confirm-screen';
import { mealQueryKey } from '@/features/meal/use-meal';

// OS 標準の日時ピッカーは描けないので空の View にする
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: () => <View testID="picker" /> };
});

const DRAFT = found.item as FoodItemDraft; // カップ麺: 100g 当たり 450kcal、内容量 78g
const NOW = new Date('2026-11-13T12:30:00+09:00');
const MEAL_ID = '0190f3a2-7c1e-7a01-8b2c-0000000000b1';
const ITEM_ID = '0190f3a2-7c1e-7a01-8b2c-0000000000b2';
const MEAL = threeMeals.meals[2] as Meal; // 追加先の食事（版 1）

type Sent = { method: string; path: string; body: unknown };

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

async function setup({
  draft = DRAFT,
  columns,
  addTo,
  status = 201,
  onTakeLabel,
}: {
  draft?: FoodItemDraft;
  columns?: FoodItemDraft[];
  addTo?: { recordDate: string; mealId: string };
  status?: number;
  onTakeLabel?: () => void;
} = {}) {
  const sent: Sent[] = [];
  const fakeFetch = async (input: Request) => {
    const url = new URL(input.url);
    sent.push({ method: input.method, path: url.pathname, body: JSON.parse((await input.text()) || 'null') });
    const body = addTo ? { ...MEAL, version: 2 } : {};
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  const api = createApiClient({ baseUrl: 'https://api.test', getToken: async () => 'token-1', fetch: fakeFetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(queryClient);
  if (addTo) queryClient.setQueryData(mealQueryKey(addTo.recordDate, addTo.mealId), MEAL);
  const ids = addTo ? [ITEM_ID] : [MEAL_ID, ITEM_ID];
  const newId = jest.fn(() => ids.shift() ?? 'extra');
  const onSaved = jest.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>{children}</ApiProvider>
    </QueryClientProvider>
  );
  await render(
    <ConfirmScreen
      drafts={columns ? undefined : [draft]}
      columns={columns}
      addTo={addTo}
      now={() => NOW}
      newId={newId}
      onSaved={onSaved}
      onClose={() => {}}
      onTakeLabel={onTakeLabel}
    />,
    { wrapper },
  );
  return { sent, onSaved };
}

const saveButton = (name = '保存する') => screen.getByRole('button', { name });

describe('確認・修正の画面（F-020）', () => {
  it('[F-020-01] 食品名・出どころ・基準と内容量を出す', async () => {
    await setup();
    expect(screen.getByLabelText('食品名')).toHaveDisplayValue('カップ麺（しょうゆ味）');
    expect(screen.getByText('Open Food Facts')).toBeOnTheScreen();
    expect(screen.getByText('100g当たり・内容量 78g')).toBeOnTheScreen();
  });

  it('[F-020-01] 内容量が分からなければ「内容量：不明」', async () => {
    await setup({
      draft: {
        ...DRAFT,
        reference: { ...DRAFT.reference, net_content: { status: 'unknown', amount: null, unit: null, pieces: null } },
      },
    });
    expect(screen.getByText('100g当たり・内容量：不明')).toBeOnTheScreen();
    expect(screen.getAllByText('450 kcal').length).toBeGreaterThan(0);
  });

  it('[F-020-02] 分量のボタンを出し、既定（全部）を選んだ状態で開く', async () => {
    await setup();
    for (const label of ['全部', '3/4', '1/2', '1/4']) {
      expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: '全部' })).toBeSelected();
    expect(screen.getByRole('button', { name: '1/2' })).not.toBeSelected();
  });

  it('[F-020-03] 選んだ分量での値と合計を出す（kcal は整数、PFC は小数第1位）', async () => {
    await setup();
    expect(screen.getByText('351 kcal')).toBeOnTheScreen();
    expect(screen.getByText('P 9.8g  F 14.6g  C 44.8g')).toBeOnTheScreen();
    expect(screen.getByText('合計 351 kcal')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '1/2' }));
    expect(screen.getByRole('button', { name: '1/2' })).toBeSelected();
    expect(screen.getByText('176 kcal')).toBeOnTheScreen();
    expect(screen.getByText('P 4.9g  F 7.3g  C 22.4g')).toBeOnTheScreen();
    expect(screen.getByText('合計 176 kcal')).toBeOnTheScreen();
  });

  it('[F-020-03] 不明な栄養素は「—」、合計に「一部不明」', async () => {
    await setup({
      draft: { ...DRAFT, reference: { ...DRAFT.reference, nutrients: { ...DRAFT.reference.nutrients, fat_g: null } } },
    });
    expect(screen.getByText('P 9.8g  F —  C 44.8g')).toBeOnTheScreen();
    expect(screen.getByText('一部不明')).toBeOnTheScreen();
  });

  it('[F-020-04] 新しい記録では食べた日時の行を出す', async () => {
    await setup();
    expect(screen.getByLabelText(/^食べた日時/)).toBeOnTheScreen();
  });

  it('[F-020-05] 名前と分量を直して保存すると、候補の値をそのまま付けて送る', async () => {
    const { sent, onSaved } = await setup();
    await fireEvent.changeText(screen.getByLabelText('食品名'), 'カップ麺');
    await fireEvent.press(screen.getByRole('button', { name: '1/2' }));
    await fireEvent.press(saveButton());
    expect(sent).toEqual([
      {
        method: 'POST',
        path: '/v1/meals',
        body: {
          meal_id: MEAL_ID,
          eaten_at: '2026-11-13T12:30:00+09:00',
          items: [
            {
              item_id: ITEM_ID,
              name: 'カップ麺',
              source: DRAFT.source,
              reference: DRAFT.reference,
              estimate_detail: null,
              portion: { mode: 'fraction', fraction: 0.5, pieces: null },
            },
          ],
        },
      },
    ]);
    expect(onSaved).toHaveBeenCalledWith('2026-11-13');
  });

  it('[F-020-01] 食品名が空なら保存できない', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText('食品名'), '  ');
    expect(saveButton()).toBeDisabled();
  });

  it('[F-020-04][F-020-05] 追加モードは日時の行を出さず、「食事に追加」で食事に足す', async () => {
    const addTo = { recordDate: MEAL.record_date, mealId: MEAL.meal_id };
    const { sent, onSaved } = await setup({ addTo, status: 200 });
    expect(screen.queryByLabelText(/^食べた日時/)).toBeNull();
    await fireEvent.press(saveButton('食事に追加'));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      method: 'POST',
      path: `/v1/days/${MEAL.record_date}/meals/${MEAL.meal_id}/items`,
      body: { expected_version: 1, item: { item_id: ITEM_ID, portion: { mode: 'whole', fraction: null, pieces: null } } },
    });
    expect(onSaved).toHaveBeenCalledWith(MEAL.record_date);
  });

  it('[F-020-05] 保存に失敗したら知らせ、選んだ内容は残す', async () => {
    const { onSaved } = await setup({ status: 500 });
    await fireEvent.press(screen.getByRole('button', { name: '1/4' }));
    await fireEvent.press(saveButton());
    expect(await screen.findByText('保存できませんでした。もう一度お試しください')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '1/4' })).toBeSelected();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('[F-020-06] バーコードの候補には「栄養成分表示を撮る」を出し、押すと撮影へ', async () => {
    const onTakeLabel = jest.fn();
    await setup({ onTakeLabel });
    await fireEvent.press(screen.getByRole('button', { name: '栄養成分表示を撮る' }));
    expect(onTakeLabel).toHaveBeenCalled();
  });

  it('[F-020-06] バーコード以外の候補には「栄養成分表示を撮る」を出さない', async () => {
    await setup({ columns: twoColumns.candidates as FoodItemDraft[] });
    expect(screen.queryByRole('button', { name: '栄養成分表示を撮る' })).toBeNull();
  });
});

describe('栄養成分表示の列の選択（F-020-07）', () => {
  const columns = twoColumns.candidates as FoodItemDraft[]; // シュガー・チョコ、どちらも 1個当たり・4個入り

  it('[F-020-07] 列のボタンを出し、先頭の列を選んだ状態で開く（個数売りは1個）', async () => {
    await setup({ columns });
    expect(screen.getByRole('button', { name: 'シュガー' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'チョコ' })).not.toBeSelected();
    expect(screen.getByLabelText('食品名')).toHaveDisplayValue('ドーナツ（シュガー）');
    expect(screen.getByText('栄養成分表示')).toBeOnTheScreen();
    expect(screen.getByText('1個当たり・内容量 4個')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '1個' })).toBeSelected();
    expect(screen.getByText('250 kcal')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('食品名')).toHaveLength(1);
  });

  it('[F-020-07] 列を変えると名前・値・分量をその列に合わせ、その列で保存する', async () => {
    const { sent } = await setup({ columns });
    await fireEvent.press(screen.getByRole('button', { name: '2個' }));
    await fireEvent.press(screen.getByRole('button', { name: 'チョコ' }));
    expect(screen.getByRole('button', { name: 'チョコ' })).toBeSelected();
    expect(screen.getByLabelText('食品名')).toHaveDisplayValue('ドーナツ（チョコ）');
    expect(screen.getByRole('button', { name: '1個' })).toBeSelected();
    expect(screen.getByText('289 kcal')).toBeOnTheScreen();
    await fireEvent.press(saveButton());
    const body = sent[0]!.body as { items: { name: string; source: { column_index: number } }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ name: 'ドーナツ（チョコ）', source: { column_index: 1 } });
  });

  it('[F-020-07] 見出しがなければ「1列目」「2列目」', async () => {
    await setup({
      columns: columns.map((c) => ({ ...c, source: { ...c.source, column_heading: null } })),
    });
    expect(screen.getByRole('button', { name: '1列目' })).toBeSelected();
    expect(screen.getByRole('button', { name: '2列目' })).toBeOnTheScreen();
  });
});
