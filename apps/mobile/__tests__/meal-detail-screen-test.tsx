// 食事の詳細（画面設計 3-6、F-031-08〜10）と、削除と「元に戻す」（3-9、F-032-06〜12）。
// 削除の待ち合わせはアプリ全体で1つ（DeleteQueueRoot）を使い、API は偽の fetch で受ける
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import threeMeals from '../../../contracts/api/examples/valid/DaySummary-three-meals.json';
import { ApiProvider } from '@/api/api-context';
import { createApiClient, type Meal } from '@/api/client';
import { DeleteQueueRoot } from '@/features/delete/delete-context';
import { CONFLICT_MESSAGE } from '@/features/delete/delete-queue';
import { MealDetailScreen } from '@/features/meal/meal-detail-screen';

const MEAL = threeMeals.meals[0] as Meal; // ドーナツ（チョコ）と野菜ジュース、版 1
const [DONUT, JUICE] = MEAL.items as [Meal['items'][number], Meal['items'][number]];
const DATE = MEAL.record_date;
const MEAL_PATH = `/v1/days/${DATE}/meals/${MEAL.meal_id}`;

type Reply = { status: number; body?: unknown };
type Responder = (method: string, url: URL) => Reply | undefined;

const clients: QueryClient[] = [];
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function setup(respond: Responder = () => undefined, meal: Meal = MEAL) {
  const requested: string[] = [];
  const fakeFetch = async (input: Request) => {
    const url = new URL(input.url);
    requested.push(`${input.method} ${url.pathname}${url.search}`);
    const reply = respond(input.method, url) ?? (input.method === 'GET' ? { status: 200, body: meal } : undefined);
    if (!reply) throw new Error(`想定していない要求: ${input.method} ${url.pathname}`);
    if (reply.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const api = createApiClient({ baseUrl: 'https://api.test', getToken: async () => 'token-1', fetch: fakeFetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(queryClient);
  const onClose = jest.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <DeleteQueueRoot>{children}</DeleteQueueRoot>
      </ApiProvider>
    </QueryClientProvider>
  );
  await render(<MealDetailScreen recordDate={DATE} mealId={meal.meal_id} onClose={onClose} />, { wrapper });
  return { requested, onClose };
}

const deletes = (requested: string[]) => requested.filter((r) => r.startsWith('DELETE'));
const wait = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

describe('食事の詳細（F-031）', () => {
  it('[F-031-08] 食べた日時・食事の合計・食品ごとの値を出す。不明は「—」', async () => {
    const { requested } = await setup();
    expect(await screen.findByText('11月13日（金） 10:05')).toBeOnTheScreen();
    expect(requested).toEqual([`GET ${MEAL_PATH}`]);
    expect(screen.getByText('357 kcal')).toBeOnTheScreen();
    expect(screen.getByText('P 2.9g  F 26.1g  C 27.5g')).toBeOnTheScreen();
    expect(screen.getByText('一部不明')).toBeOnTheScreen();
    expect(screen.getByText(DONUT.name)).toBeOnTheScreen();
    expect(screen.getByText(JUICE.name)).toBeOnTheScreen();
    expect(screen.getByText('289 kcal')).toBeOnTheScreen();
    expect(screen.getByText('P 1.2g  F —  C 15.8g')).toBeOnTheScreen();
  });

  it('[F-031-09] 出どころ・基準・分量（全部以外）・内容量不明を出す', async () => {
    const juiceUnknown = {
      ...JUICE,
      reference: { ...JUICE.reference, net_content: { status: 'unknown', amount: null, unit: null, pieces: null } },
    } as Meal['items'][number];
    await setup(undefined, { ...MEAL, items: [DONUT, juiceUnknown] });
    await screen.findByText(DONUT.name);
    expect(screen.getAllByText('栄養成分表示')).toHaveLength(2);
    expect(screen.getByText('1個当たり')).toBeOnTheScreen();
    expect(screen.getByText('1個')).toBeOnTheScreen();
    expect(screen.getByText('1本（200ml）当たり')).toBeOnTheScreen();
    expect(screen.getByText('内容量：不明')).toBeOnTheScreen();
  });

  it('[F-031-10] 見つからなければ「この食事は見つかりません」', async () => {
    await setup(() => ({ status: 404, body: { code: 'not_found', message: 'not found' } }));
    expect(await screen.findByText('この食事は見つかりません')).toBeOnTheScreen();
  });

  it('[F-031-10] 読み込めなければ「再読み込み」で読み直せる', async () => {
    let fail = true;
    const { requested } = await setup((method) => (method === 'GET' && fail ? { status: 500 } : undefined));
    expect(await screen.findByText('読み込めませんでした')).toBeOnTheScreen();
    fail = false;
    await fireEvent.press(screen.getByText('再読み込み'));
    expect(await screen.findByText(DONUT.name)).toBeOnTheScreen();
    expect(requested).toHaveLength(2);
  });

  it('「戻る」で閉じる', async () => {
    const { onClose } = await setup();
    await screen.findByText(DONUT.name);
    await fireEvent.press(screen.getByLabelText('戻る'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('食事の詳細での削除と「元に戻す」（F-032）', () => {
  it('[F-032-06] 食品を消すと確認なしで表示から消え、合計もそれを除く。まだ送らない', async () => {
    const { requested } = await setup();
    await screen.findByText(DONUT.name);
    await fireEvent.press(screen.getByLabelText(`${DONUT.name}を削除`));
    expect(screen.queryByText(DONUT.name)).not.toBeOnTheScreen();
    expect(screen.getByText('削除しました')).toBeOnTheScreen();
    expect(screen.getAllByText('68 kcal')).toHaveLength(2); // 食事の合計と、残った野菜ジュース
    expect(deletes(requested)).toEqual([]);
  });

  it('[F-032-07] 「元に戻す」なら送らず表示を戻す', async () => {
    const { requested } = await setup();
    await screen.findByText(DONUT.name);
    await fireEvent.press(screen.getByLabelText(`${DONUT.name}を削除`));
    await fireEvent.press(screen.getByText('元に戻す'));
    expect(screen.getByText(DONUT.name)).toBeOnTheScreen();
    expect(screen.queryByText('削除しました')).not.toBeOnTheScreen();
    await wait(10_000);
    expect(deletes(requested)).toEqual([]);
  });

  it('[F-032-08][F-032-11] 5秒たったら手元の版を付けて送り、食事を読み直す', async () => {
    const remaining = { ...MEAL, items: [JUICE], version: 2 };
    const { requested } = await setup((method) =>
      method === 'DELETE' ? { status: 200, body: { meal_deleted: false, meal: remaining } } : undefined,
    );
    await screen.findByText(DONUT.name);
    await fireEvent.press(screen.getByLabelText(`${DONUT.name}を削除`));
    await wait(5_000);
    expect(deletes(requested)).toEqual([`DELETE ${MEAL_PATH}/items/${DONUT.item_id}?expected_version=1`]);
    expect(requested.filter((r) => r.startsWith('GET'))).toHaveLength(2);
    expect(screen.queryByText('削除しました')).not.toBeOnTheScreen();
  });

  it('[F-032-08] アプリがバックグラウンドに移ったらすぐ送る', async () => {
    const handlers: ((s: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      handlers.push(handler as (s: AppStateStatus) => void);
      return { remove: () => {} };
    });
    const { requested } = await setup((method) =>
      method === 'DELETE' ? { status: 200, body: { meal_deleted: false, meal: { ...MEAL, version: 2 } } } : undefined,
    );
    await screen.findByText(DONUT.name);
    await fireEvent.press(screen.getByLabelText(`${DONUT.name}を削除`));
    await act(async () => handlers.forEach((h) => h('background')));
    await wait(0);
    expect(deletes(requested)).toHaveLength(1);
  });

  it('[F-032-10][F-032-11] 続けて最後の食品を消すと、前の応答の版で送り、ホームに戻る', async () => {
    const remaining = { ...MEAL, items: [JUICE], version: 2 };
    const { requested, onClose } = await setup((method, url) => {
      if (method !== 'DELETE') return undefined;
      return url.pathname.endsWith(DONUT.item_id)
        ? { status: 200, body: { meal_deleted: false, meal: remaining } }
        : { status: 200, body: { meal_deleted: true, meal: null } };
    });
    await screen.findByText(DONUT.name);
    await fireEvent.press(screen.getByLabelText(`${DONUT.name}を削除`));
    await fireEvent.press(screen.getByLabelText(`${JUICE.name}を削除`));
    expect(onClose).toHaveBeenCalled();
    await wait(5_000);
    expect(deletes(requested)).toEqual([
      `DELETE ${MEAL_PATH}/items/${DONUT.item_id}?expected_version=1`,
      `DELETE ${MEAL_PATH}/items/${JUICE.item_id}?expected_version=2`,
    ]);
  });

  it('[F-032-10] 「この食事を削除」でホームに戻り、5秒後に食事の削除を送る', async () => {
    const { requested, onClose } = await setup((method) => (method === 'DELETE' ? { status: 204 } : undefined));
    await screen.findByText(DONUT.name);
    await fireEvent.press(screen.getByText('この食事を削除'));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText('削除しました')).toBeOnTheScreen();
    await wait(5_000);
    expect(deletes(requested)).toEqual([`DELETE ${MEAL_PATH}`]);
  });

  it('[F-032-12] 409 なら重なったことを出し、読み直して表示を戻す', async () => {
    await setup((method) =>
      method === 'DELETE' ? { status: 409, body: { code: 'version_conflict', message: 'conflict' } } : undefined,
    );
    await screen.findByText(DONUT.name);
    await fireEvent.press(screen.getByLabelText(`${DONUT.name}を削除`));
    await wait(5_000);
    expect(screen.getByText(CONFLICT_MESSAGE)).toBeOnTheScreen();
    expect(await screen.findByText(DONUT.name)).toBeOnTheScreen();
  });

  it('[F-032-12] 404 はもう消えているので失敗を出さない', async () => {
    await setup((method) =>
      method === 'DELETE' ? { status: 404, body: { code: 'not_found', message: 'not found' } } : undefined,
    );
    await screen.findByText(DONUT.name);
    await fireEvent.press(screen.getByLabelText(`${DONUT.name}を削除`));
    await wait(5_000);
    expect(screen.queryByText('削除できませんでした')).not.toBeOnTheScreen();
    expect(screen.queryByText(CONFLICT_MESSAGE)).not.toBeOnTheScreen();
  });
});
