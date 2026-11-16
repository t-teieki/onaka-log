// 設定（画面設計 3-7、F-001-13〜16）
import { fireEvent, render, screen } from '@testing-library/react-native';

import { DeleteQueueProvider } from '@/features/delete/delete-context';
import { DeleteQueue, type DeleteTarget } from '@/features/delete/delete-queue';
import { SettingsScreen } from '@/features/settings/settings-screen';

const target: DeleteTarget = { kind: 'meal', recordDate: '2026-11-16', mealId: 'meal-1' };

describe('設定（F-001）', () => {
  it('[F-001-13] サインアウトとアプリの版を出し、「戻る」で閉じる', async () => {
    const onClose = jest.fn();
    await render(<SettingsScreen version="1.2.3" signOut={async () => {}} onClose={onClose} />);
    expect(screen.getByText('バージョン 1.2.3')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'サインアウト' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('戻る'));
    expect(onClose).toHaveBeenCalled();
  });

  it('[F-001-14] サインアウトを押すと、待っている削除を先に送ってからサインアウトする', async () => {
    const order: string[] = [];
    const queue = new DeleteQueue({
      send: async () => {
        order.push('delete');
        return 'ok';
      },
    });
    queue.remove(target);
    const signOut = jest.fn(async () => {
      order.push('signOut');
    });
    await render(
      <DeleteQueueProvider queue={queue}>
        <SettingsScreen version="1.0.0" signOut={signOut} onClose={() => {}} />
      </DeleteQueueProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'サインアウト' }));
    expect(order).toEqual(['delete', 'signOut']);
  });

  it('[F-001-14] サインアウトの途中は二度押しできない', async () => {
    let finish: () => void = () => {};
    const signOut = jest.fn(() => new Promise<void>((r) => (finish = r)));
    await render(<SettingsScreen version="1.0.0" signOut={signOut} onClose={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'サインアウト' }));
    expect(screen.getByRole('button', { name: 'サインアウト' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'サインアウト' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    finish();
  });

  it('[F-001-16] サインインを使っていないときはサインアウトを出さない', async () => {
    await render(<SettingsScreen version="1.0.0" signOut={null} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'サインアウト' })).toBeNull();
    expect(screen.getByText('サインインを使っていません（ローカルのバックエンド）')).toBeOnTheScreen();
  });
});
