// サインインの関門とサインイン画面（F-001 アプリ側、画面設計 3-8）・API の 401（F-001-12）
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { createApiClient } from '@/api/client';
import { AuthGate } from '@/auth/auth-gate';
import type { AuthStatus } from '@/auth/session';

type Listener = () => void;

/** 画面のテスト用の、状態だけを持つ偽のセッション */
function fakeSession(initial: AuthStatus) {
  const listeners = new Set<Listener>();
  const s = {
    status: initial,
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    set(next: AuthStatus) {
      s.status = next;
      listeners.forEach((l) => l());
    },
  };
  return s;
}

const Home = () => <Text>ホーム</Text>;

describe('AuthGate', () => {
  it('[F-001-04] Cognito の設定がなければ（session が null）そのまま画面を出す', async () => {
    await render(
      <AuthGate session={null} signIn={jest.fn()}>
        <Home />
      </AuthGate>,
    );
    expect(screen.getByText('ホーム')).toBeOnTheScreen();
  });

  it('[F-001-05] サインインしていなければサインイン画面だけを出す', async () => {
    await render(
      <AuthGate session={fakeSession('signedOut')} signIn={jest.fn()}>
        <Home />
      </AuthGate>,
    );
    expect(screen.getByRole('button', { name: 'Google でサインイン' })).toBeOnTheScreen();
    expect(screen.queryByText('ホーム')).toBeNull();
  });

  it('[F-001-09] 起動時の確認中はどちらも出さない', async () => {
    await render(
      <AuthGate session={fakeSession('loading')} signIn={jest.fn()}>
        <Home />
      </AuthGate>,
    );
    expect(screen.queryByText('ホーム')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Google でサインイン' })).toBeNull();
  });

  it('[F-001-06] サインインできたらホームに切り替わる', async () => {
    const session = fakeSession('signedOut');
    const signIn = jest.fn(async () => {
      session.set('signedIn');
      return 'success' as const;
    });
    await render(
      <AuthGate session={session} signIn={signIn}>
        <Home />
      </AuthGate>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Google でサインイン' }));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('ホーム')).toBeOnTheScreen();
  });

  it('[F-001-11] サインイン済みからトークンが失効したらサインイン画面に戻る', async () => {
    const session = fakeSession('signedIn');
    await render(
      <AuthGate session={session} signIn={jest.fn()}>
        <Home />
      </AuthGate>,
    );
    expect(screen.getByText('ホーム')).toBeOnTheScreen();
    await act(async () => session.set('signedOut'));
    expect(screen.getByRole('button', { name: 'Google でサインイン' })).toBeOnTheScreen();
  });

  it('[F-001-08] キャンセルなら何も出さない', async () => {
    await render(
      <AuthGate session={fakeSession('signedOut')} signIn={jest.fn(async () => 'cancel' as const)}>
        <Home />
      </AuthGate>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Google でサインイン' }));
    await act(async () => {});
    expect(screen.queryByText('サインインできませんでした。もう一度お試しください')).toBeNull();
  });

  it('[F-001-08] 失敗したらメッセージを出す', async () => {
    await render(
      <AuthGate session={fakeSession('signedOut')} signIn={jest.fn(async () => 'error' as const)}>
        <Home />
      </AuthGate>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Google でサインイン' }));
    expect(await screen.findByText('サインインできませんでした。もう一度お試しください')).toBeOnTheScreen();
  });

  it('[F-001-08] サインイン中は二度押しできない', async () => {
    let finish: (v: 'success') => void = () => {};
    const signIn = jest.fn(() => new Promise<'success'>((resolve) => (finish = resolve)));
    await render(
      <AuthGate session={fakeSession('signedOut')} signIn={signIn}>
        <Home />
      </AuthGate>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Google でサインイン' }));
    await fireEvent.press(screen.getByTestId('sign-in-google'));
    expect(signIn).toHaveBeenCalledTimes(1);
    await act(async () => finish('success'));
  });
});

describe('API クライアントの 401（F-001-12）', () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('[F-001-12] 401 ならトークンを1回だけ更新し、同じ要求を新しいトークンで送り直す', async () => {
    const seen: { auth: string | null; body: string }[] = [];
    const onUnauthorized = jest.fn(async () => 'token-2');
    const api = createApiClient({
      baseUrl: 'https://api.test',
      getToken: async () => 'token-1',
      onUnauthorized,
      fetch: async (req: Request) => {
        seen.push({ auth: req.headers.get('Authorization'), body: await req.text() });
        return seen.length === 1 ? json(401, { error: { code: 'unauthorized', message: 'x' } }) : json(201, {});
      },
    });
    const { response } = await api.POST('/v1/meals', {
      body: { meal_id: 'm', eaten_at: '2026-11-16T12:00:00+09:00', items: [] },
    });
    expect(response.status).toBe(201);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(seen.map((s) => s.auth)).toEqual(['Bearer token-1', 'Bearer token-2']);
    expect(seen[1].body).toBe(seen[0].body);
  });

  it('[F-001-12] 更新できなければ 401 をそのまま返す（送り直さない）', async () => {
    let sent = 0;
    const api = createApiClient({
      baseUrl: 'https://api.test',
      getToken: async () => 'token-1',
      onUnauthorized: async () => null,
      fetch: async () => {
        sent += 1;
        return json(401, { error: { code: 'unauthorized', message: 'x' } });
      },
    });
    const { response } = await api.GET('/v1/days/{record_date}', { params: { path: { record_date: '2026-11-16' } } });
    expect(response.status).toBe(401);
    expect(sent).toBe(1);
  });
});
