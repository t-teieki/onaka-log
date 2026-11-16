// 確認・修正の画面（画面設計 3-5、F-020-01〜08）。バーコード・栄養成分表示・写真の候補（API の例）を使う
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import threeMeals from '../../../contracts/api/examples/valid/DaySummary-three-meals.json';
import twoColumns from '../../../contracts/api/examples/valid/LabelEstimateResponse-ok-two-columns.json';
import photoOk from '../../../contracts/api/examples/valid/PhotoEstimateResponse-ok.json';
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
const ITEM_IDS = [ITEM_ID, '0190f3a2-7c1e-7a01-8b2c-0000000000b3', '0190f3a2-7c1e-7a01-8b2c-0000000000b4'];
const MEAL = threeMeals.meals[2] as Meal; // 追加先の食事（版 1）

type Sent = { method: string; path: string; body: unknown };

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

async function setup({
  draft = DRAFT,
  drafts = [draft],
  columns,
  addTo,
  status = 201,
  statuses = [],
  onTakeLabel,
}: {
  draft?: FoodItemDraft;
  drafts?: FoodItemDraft[];
  columns?: FoodItemDraft[];
  addTo?: { recordDate: string; mealId: string };
  status?: number;
  /** POST ごとの応答の status（尽きたら status）。409 は item_already_exists */
  statuses?: number[];
  onTakeLabel?: () => void;
} = {}) {
  const sent: Sent[] = [];
  let version = MEAL.version;
  const fakeFetch = async (input: Request) => {
    const url = new URL(input.url);
    sent.push({ method: input.method, path: url.pathname, body: JSON.parse((await input.text()) || 'null') });
    const json = (body: unknown, code: number) =>
      new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
    if (input.method === 'GET') return json({ ...MEAL, version }, 200);
    const code = statuses.shift() ?? status;
    if (code === 409) return json({ error: { code: 'item_already_exists', message: 'exists' } }, 409);
    if (code >= 300) return json({}, code);
    if (!addTo) return json({}, code);
    version += 1;
    return json({ ...MEAL, version }, code);
  };
  const api = createApiClient({ baseUrl: 'https://api.test', getToken: async () => 'token-1', fetch: fakeFetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(queryClient);
  if (addTo) queryClient.setQueryData(mealQueryKey(addTo.recordDate, addTo.mealId), MEAL);
  const ids = addTo ? [...ITEM_IDS] : [MEAL_ID, ...ITEM_IDS];
  const newId = jest.fn(() => ids.shift() ?? 'extra');
  const onSaved = jest.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>{children}</ApiProvider>
    </QueryClientProvider>
  );
  await render(
    <ConfirmScreen
      drafts={columns ? undefined : drafts}
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

describe('写真推定の品目（F-020-08）', () => {
  const items = photoOk.items as FoodItemDraft[]; // ご飯 302・ハンバーグ 330・味噌汁 70 kcal（どれも medium）
  const names = () => screen.getAllByLabelText('食品名').map((input) => input.props.value as string);

  it('[F-020-08] 上部に「写真からの推定（目安）です」を出し、品目ごとにカードを出す', async () => {
    await setup({ drafts: items });
    expect(screen.getByText('写真からの推定（目安）です')).toBeOnTheScreen();
    expect(names()).toEqual(['ご飯', 'ハンバーグ（ソース付き）', '豆腐と玉ねぎの味噌汁']);
    expect(screen.getAllByText('写真（目安）')).toHaveLength(3);
    expect(screen.getByText('302 kcal')).toBeOnTheScreen();
    expect(screen.getByText('330 kcal')).toBeOnTheScreen();
    expect(screen.getByText('70 kcal')).toBeOnTheScreen();
    expect(screen.getByText('合計 702 kcal')).toBeOnTheScreen();
    expect(screen.queryByText('目安')).toBeNull();
  });

  it('[F-020-08] 信頼度が low の品目にだけ「目安」の印を付ける', async () => {
    const low = { ...items[1]!, source: { ...items[1]!.source, confidence: 'low' as const } };
    await setup({ drafts: [items[0]!, low, items[2]!] });
    expect(screen.getAllByText('目安')).toHaveLength(1);
  });

  it('[F-020-08] × で品目を外すと、合計と保存する品目から除く', async () => {
    const { sent } = await setup({ drafts: items });
    await fireEvent.press(screen.getByRole('button', { name: 'ハンバーグ（ソース付き）を外す' }));
    expect(names()).toEqual(['ご飯', '豆腐と玉ねぎの味噌汁']);
    expect(screen.getByText('合計 372 kcal')).toBeOnTheScreen();
    await fireEvent.press(saveButton());
    const body = sent[0]!.body as { items: { item_id: string; name: string }[] };
    expect(body.items.map((i) => [i.item_id, i.name])).toEqual([
      [ITEM_IDS[0], 'ご飯'],
      [ITEM_IDS[2], '豆腐と玉ねぎの味噌汁'],
    ]);
  });

  it('[F-020-08] 品目がすべて外れたら保存できない', async () => {
    await setup({ drafts: items });
    for (const name of ['ご飯', 'ハンバーグ（ソース付き）', '豆腐と玉ねぎの味噌汁']) {
      await fireEvent.press(screen.getByRole('button', { name: `${name}を外す` }));
    }
    expect(saveButton()).toBeDisabled();
  });

  it('[F-020-08] 写真以外の候補には × を出さない', async () => {
    await setup();
    expect(screen.queryByRole('button', { name: /を外す$/ })).toBeNull();
    expect(screen.queryByText('写真からの推定（目安）です')).toBeNull();
  });

  it('[F-020-05] 追加モードでは品目を1件ずつ順に送り、前の応答の版を使う', async () => {
    const addTo = { recordDate: MEAL.record_date, mealId: MEAL.meal_id };
    const { sent, onSaved } = await setup({ drafts: items, addTo, status: 200 });
    await fireEvent.press(saveButton('食事に追加'));
    await screen.findByRole('button', { name: '食事に追加' });
    const posts = sent.filter((s) => s.method === 'POST');
    expect(posts.map((s) => s.body)).toMatchObject([
      { expected_version: 1, item: { item_id: ITEM_IDS[0], name: 'ご飯' } },
      { expected_version: 2, item: { item_id: ITEM_IDS[1], name: 'ハンバーグ（ソース付き）' } },
      { expected_version: 3, item: { item_id: ITEM_IDS[2], name: '豆腐と玉ねぎの味噌汁' } },
    ]);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(MEAL.record_date);
  });

  it('[F-020-05] 追加の途中で失敗して押し直すと、送り済みの品目は二重にならず残りを送る', async () => {
    const addTo = { recordDate: MEAL.record_date, mealId: MEAL.meal_id };
    const { sent, onSaved } = await setup({ drafts: [items[0]!, items[2]!], addTo, statuses: [200, 500, 409, 200] });
    await fireEvent.press(saveButton('食事に追加'));
    expect(await screen.findByText('保存できませんでした。もう一度お試しください')).toBeOnTheScreen();
    expect(onSaved).not.toHaveBeenCalled();
    await fireEvent.press(saveButton('食事に追加'));
    await screen.findByRole('button', { name: '食事に追加' });
    const posted = sent.filter((s) => s.method === 'POST').map((s) => (s.body as { item: { item_id: string } }).item.item_id);
    expect(posted).toEqual([ITEM_IDS[0], ITEM_IDS[1], ITEM_IDS[0], ITEM_IDS[1]]);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
