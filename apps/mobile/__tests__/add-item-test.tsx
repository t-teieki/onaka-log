// 食事の詳細から食品を追加（画面設計 3-2・3-5・3-6、F-030-08〜12、Q-32）。
// 手入力の画面を追加モードで開き、POST …/meals/{meal_id}/items に送る
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import threeMeals from '../../../contracts/api/examples/valid/DaySummary-three-meals.json';
import { ApiProvider } from '@/api/api-context';
import { createApiClient, type Meal } from '@/api/client';
import { MealDetailScreen } from '@/features/meal/meal-detail-screen';
import { mealQueryKey } from '@/features/meal/use-meal';
import { ManualEntryScreen } from '@/features/record/manual-entry-screen';
import { manualItem } from '@/features/record/manual-input';

const MEAL = threeMeals.meals[1] as Meal; // カップ麺だけの食事、版 1
const DATE = MEAL.record_date;
const MEAL_PATH = `/v1/days/${DATE}/meals/${MEAL.meal_id}`;
const ITEM_ID = '0190f3a2-7c1e-7a01-8b2c-0000000000aa';
const NOW = new Date('2026-11-13T20:00:00+09:00');

const ADDED = manualItem(ITEM_ID, {
  name: '味付け卵',
  nutrients: { energy_kcal: 80, protein_g: 6.5, fat_g: 5, carbohydrate_g: 0.5 },
});
const AFTER_ADD: Meal = {
  ...MEAL,
  version: 2,
  items: [...MEAL.items, { ...ADDED, nutrients: ADDED.reference.nutrients, portion: { ...ADDED.portion, multiplier: 1 } }],
};

type Reply = { status: number; body?: unknown };
type Sent = { method: string; path: string; body: unknown };

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

function makeClient(sent: Sent[], respond: (method: string) => Reply) {
  const fakeFetch = async (input: Request) => {
    const url = new URL(input.url);
    sent.push({ method: input.method, path: url.pathname, body: JSON.parse((await input.text()) || 'null') });
    const { status, body } = respond(input.method);
    return new Response(JSON.stringify(body ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
  };
  const api = createApiClient({ baseUrl: 'https://api.test', getToken: async () => 'token-1', fetch: fakeFetch });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(queryClient);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>{children}</ApiProvider>
    </QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** 追加モードの手入力。cached なら詳細で読んだ食事が手元にある状態で開く */
async function setupAdd(respond: (method: string) => Reply, { cached = true }: { cached?: boolean } = {}) {
  const sent: Sent[] = [];
  const { queryClient, wrapper } = makeClient(sent, respond);
  if (cached) queryClient.setQueryData(mealQueryKey(DATE, MEAL.meal_id), MEAL);
  const onSaved = jest.fn();
  await render(
    <ManualEntryScreen
      now={() => NOW}
      newId={() => ITEM_ID}
      addTo={{ recordDate: DATE, mealId: MEAL.meal_id }}
      onSaved={onSaved}
      onClose={() => {}}
    />,
    { wrapper },
  );
  return { sent, onSaved, queryClient };
}

async function fillEgg() {
  await fireEvent.changeText(screen.getByLabelText('食品名'), '味付け卵');
  await fireEvent.changeText(screen.getByLabelText('kcal'), '80');
  await fireEvent.changeText(screen.getByLabelText('たんぱく質（g）'), '6.5');
  await fireEvent.changeText(screen.getByLabelText('脂質（g）'), '5');
  await fireEvent.changeText(screen.getByLabelText('炭水化物（g）'), '0.5');
}

const save = () => fireEvent.press(screen.getByRole('button', { name: '保存する' }));
const posts = (sent: Sent[]) => sent.filter((s) => s.method === 'POST');
const errorBody = (code: string) => ({ error: { code, message: code } });

describe('食事の詳細の「食品を追加」（F-030-08）', () => {
  it('[F-030-08] 「＋ 食品を追加」で入力方式の選択を開き、手入力を選ぶと追加へ進む', async () => {
    const { wrapper } = makeClient([], () => ({ status: 200, body: MEAL }));
    const onAddItem = jest.fn();
    await render(
      <MealDetailScreen recordDate={DATE} mealId={MEAL.meal_id} onClose={() => {}} onAddItem={onAddItem} />,
      { wrapper },
    );
    await screen.findByText(MEAL.items[0]!.name);
    await fireEvent.press(screen.getByRole('button', { name: '＋ 食品を追加' }));
    await fireEvent.press(await screen.findByRole('button', { name: /手入力/ }));
    expect(onAddItem).toHaveBeenCalledWith('manual');
    expect(screen.queryByText('入力方法を選ぶ')).toBeNull();
  });
});

describe('手入力の追加モード（F-030-09〜12）', () => {
  it('[F-030-09] 見出しは「食品を追加」で、食べた日時の行は出さない', async () => {
    await setupAdd(() => ({ status: 200, body: AFTER_ADD }));
    expect(screen.getByText('食品を追加')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^食べた日時/)).toBeNull();
    expect(screen.getByLabelText('食品名')).toBeOnTheScreen();
  });

  it('[F-030-10] 手元の版と、開いたときに決めた食品 ID で送り、応答の食事を手元に置いて戻る', async () => {
    const { sent, onSaved, queryClient } = await setupAdd(() => ({ status: 200, body: AFTER_ADD }));
    await fillEgg();
    await save();
    expect(posts(sent)).toEqual([
      { method: 'POST', path: `${MEAL_PATH}/items`, body: { expected_version: 1, item: ADDED } },
    ]);
    expect(onSaved).toHaveBeenCalledWith(DATE);
    expect(queryClient.getQueryData<Meal>(mealQueryKey(DATE, MEAL.meal_id))?.version).toBe(2);
  });

  it('[F-030-10] 手元に食事がなければ読んでから、その版で送る', async () => {
    const { sent, onSaved } = await setupAdd(
      (method) => (method === 'GET' ? { status: 200, body: MEAL } : { status: 200, body: AFTER_ADD }),
      { cached: false },
    );
    await fillEgg();
    await save();
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([`GET ${MEAL_PATH}`, `POST ${MEAL_PATH}/items`]);
    expect(posts(sent)[0]!.body).toMatchObject({ expected_version: 1 });
    expect(onSaved).toHaveBeenCalledWith(DATE);
  });

  it('[F-030-11] 409 item_already_exists は再送なので成功として戻る', async () => {
    const { onSaved } = await setupAdd((method) =>
      method === 'POST' ? { status: 409, body: errorBody('item_already_exists') } : { status: 200, body: AFTER_ADD },
    );
    await fillEgg();
    await save();
    expect(onSaved).toHaveBeenCalledWith(DATE);
  });

  it('[F-030-12] 409 version_conflict なら読み直して知らせ、もう一度保存すると新しい版で送る', async () => {
    const latest = { ...MEAL, version: 3 };
    let conflict = true;
    const { sent, onSaved } = await setupAdd((method) => {
      if (method === 'GET') return { status: 200, body: latest };
      if (conflict) {
        conflict = false;
        return { status: 409, body: errorBody('version_conflict') };
      }
      return { status: 200, body: { ...AFTER_ADD, version: 4 } };
    });
    await fillEgg();
    await save();
    expect(await screen.findByText('ほかの変更と重なりました。もう一度保存してください')).toBeOnTheScreen();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('食品名')).toHaveDisplayValue('味付け卵');
    await save();
    expect(posts(sent).map((p) => (p.body as { expected_version: number }).expected_version)).toEqual([1, 3]);
    expect(onSaved).toHaveBeenCalledWith(DATE);
  });

  it('[F-030-12] 404 なら「この食事は削除されています」', async () => {
    const { onSaved } = await setupAdd(() => ({ status: 404, body: errorBody('not_found') }));
    await fillEgg();
    await save();
    expect(await screen.findByText('この食事は削除されています')).toBeOnTheScreen();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('[F-030-12] そのほかの失敗は「保存できませんでした」で、入力は残す', async () => {
    const { onSaved } = await setupAdd(() => ({ status: 500, body: errorBody('internal_error') }));
    await fillEgg();
    await save();
    expect(await screen.findByText('保存できませんでした。もう一度お試しください')).toBeOnTheScreen();
    expect(screen.getByLabelText('kcal')).toHaveDisplayValue('80');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
