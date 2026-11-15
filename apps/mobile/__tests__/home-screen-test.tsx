// ホーム（画面設計 3-1、F-031）。応答は contracts/api/examples の DaySummary をそのまま使う
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import emptyDay from '../../../contracts/api/examples/valid/DaySummary-empty.json';
import threeMeals from '../../../contracts/api/examples/valid/DaySummary-three-meals.json';
import { ApiProvider } from '@/api/api-context';
import { createApiClient } from '@/api/client';
import { HomeScreen } from '@/features/home/home-screen';

const NOW = new Date('2026-11-13T20:00:00+09:00'); // 記録日 2026-11-13（金）

type Responder = (url: URL) => { status: number; body: unknown };

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

async function setup(respond: Responder) {
  const requested: string[] = [];
  const fakeFetch = async (input: Request) => {
    const url = new URL(input.url);
    requested.push(url.pathname);
    const { status, body } = respond(url);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  const api = createApiClient({ baseUrl: 'https://api.test', getToken: async () => 'token-1', fetch: fakeFetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(queryClient);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>{children}</ApiProvider>
    </QueryClientProvider>
  );
  await render(<HomeScreen now={() => NOW} />, { wrapper });
  return { requested };
}

const dayOf = (url: URL) => url.pathname.split('/').pop() ?? '';

describe('ホーム（F-031）', () => {
  it('今日の記録日を開き、日次合計を出す（kcal は整数、PFC は小数第1位）', async () => {
    const { requested } = await setup(() => ({ status: 200, body: threeMeals }));
    expect(await screen.findByText('898 kcal')).toBeOnTheScreen();
    expect(screen.getByText('11月13日（金）')).toBeOnTheScreen();
    expect(screen.getByText('P 23.7g  F 53.7g  C 78.3g')).toBeOnTheScreen();
    expect(requested).toEqual(['/v1/days/2026-11-13']);
  });

  it('不明を含む栄養素があれば「一部不明」を出す（DM-02）', async () => {
    await setup(() => ({ status: 200, body: threeMeals }));
    expect(await screen.findByText('一部不明')).toBeOnTheScreen();
  });

  it('食事を時刻順に1行ずつ出す（時刻・食品名・kcal）', async () => {
    await setup(() => ({ status: 200, body: threeMeals }));
    await screen.findByText('898 kcal');
    const first = threeMeals.meals[0];
    expect(screen.getByText(first.eaten_at.slice(11, 16))).toBeOnTheScreen();
    expect(screen.getByText(first.items.map((i) => i.name).join('、'))).toBeOnTheScreen();
    expect(screen.getAllByTestId('meal-row')).toHaveLength(threeMeals.meals.length);
  });

  it('記録がない日は「まだ記録がありません」（F-031-03）', async () => {
    await setup(() => ({ status: 200, body: emptyDay }));
    expect(await screen.findByText('まだ記録がありません')).toBeOnTheScreen();
    expect(screen.getByText('0 kcal')).toBeOnTheScreen();
  });

  it('前日へ移動でき、今日より先には進めない', async () => {
    const { requested } = await setup((url) => ({
      status: 200,
      body: { ...emptyDay, record_date: dayOf(url) },
    }));
    await screen.findByText('まだ記録がありません');
    expect(screen.getByLabelText('翌日')).toBeDisabled();

    fireEvent.press(screen.getByLabelText('前日'));
    expect(await screen.findByText('11月12日（木）')).toBeOnTheScreen();
    expect(requested).toContain('/v1/days/2026-11-12');
    expect(screen.getByLabelText('翌日')).toBeEnabled();
  });

  it('読み込めなければ再読み込みのボタンを出す', async () => {
    let fail = true;
    await setup(() =>
      fail
        ? { status: 502, body: { error: { code: 'upstream_unavailable', message: 'x' } } }
        : { status: 200, body: emptyDay },
    );
    expect(await screen.findByText('読み込めませんでした')).toBeOnTheScreen();
    fail = false;
    fireEvent.press(screen.getByText('再読み込み'));
    expect(await screen.findByText('まだ記録がありません')).toBeOnTheScreen();
  });

  it('「記録する」ボタンを画面に出す（押した先は次の段階で作る）', async () => {
    await setup(() => ({ status: 200, body: emptyDay }));
    await screen.findByText('まだ記録がありません');
    expect(screen.getByRole('button', { name: '＋ 記録する' })).toBeOnTheScreen();
  });
});

describe('API クライアント', () => {
  it('Authorization にトークンを付ける', async () => {
    let auth: string | null = null;
    const api = createApiClient({
      baseUrl: 'https://api.test',
      getToken: async () => 'token-1',
      fetch: async (req: Request) => {
        auth = req.headers.get('Authorization');
        return new Response(JSON.stringify(emptyDay), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });
    await api.GET('/v1/days/{record_date}', { params: { path: { record_date: '2026-11-13' } } });
    expect(auth).toBe('Bearer token-1');
  });

  it('トークンがなければ Authorization を付けない（ローカルのバックエンド）', async () => {
    let auth: string | null = 'unset';
    const api = createApiClient({
      baseUrl: 'https://api.test',
      getToken: async () => null,
      fetch: async (req: Request) => {
        auth = req.headers.get('Authorization');
        return new Response(JSON.stringify(emptyDay), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });
    await api.GET('/v1/days/{record_date}', { params: { path: { record_date: '2026-11-13' } } });
    expect(auth).toBeNull();
  });
});
