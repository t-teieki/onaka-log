// 削除と「元に戻す」（画面設計 3-9、F-032-06〜08・11・12）。API を送るのを遅らせ、送る前なら取り消せる
import { CONFLICT_MESSAGE, DeleteQueue, ERROR_MESSAGE, type DeleteTarget, type SendResult } from '@/features/delete/delete-queue';

const itemA: DeleteTarget = { kind: 'item', recordDate: '2026-11-13', mealId: 'meal-1', itemId: 'item-a' };
const itemB: DeleteTarget = { kind: 'item', recordDate: '2026-11-13', mealId: 'meal-1', itemId: 'item-b' };
const meal2: DeleteTarget = { kind: 'meal', recordDate: '2026-11-13', mealId: 'meal-2' };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function setup(results: SendResult[] = []) {
  const sent: DeleteTarget[] = [];
  const after: [DeleteTarget, SendResult][] = [];
  const queue = new DeleteQueue({
    send: async (t) => {
      sent.push(t);
      return results.shift() ?? 'ok';
    },
    afterSend: async (t, r) => {
      after.push([t, r]);
    },
  });
  return { queue, sent, after };
}

describe('削除の待ち合わせ（F-032）', () => {
  it('[F-032-06] 消すとすぐ待ちに入り、表示から隠す。まだ送らない', () => {
    const { queue, sent } = setup();
    queue.remove(itemA);
    expect(queue.getState().pending).toEqual(itemA);
    expect(queue.getState().hidden).toEqual([itemA]);
    expect(sent).toEqual([]);
  });

  it('[F-032-07] 「元に戻す」なら送らず、表示を戻す', async () => {
    const { queue, sent } = setup();
    queue.remove(itemA);
    queue.undo();
    expect(queue.getState()).toEqual({ pending: null, hidden: [], error: null });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([]);
  });

  it('[F-032-08] 5秒たったら送り、送り終えたら読み直して隠すのをやめる', async () => {
    const { queue, sent, after } = setup();
    queue.remove(itemA);
    await jest.advanceTimersByTimeAsync(4_999);
    expect(sent).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    await queue.idle();
    expect(sent).toEqual([itemA]);
    expect(after).toEqual([[itemA, 'ok']]);
    expect(queue.getState()).toEqual({ pending: null, hidden: [], error: null });
  });

  it('[F-032-08] バックグラウンドに移ったとき（flush）はすぐ送る', async () => {
    const { queue, sent } = setup();
    queue.remove(itemA);
    queue.flush();
    await queue.idle();
    expect(sent).toEqual([itemA]);
    expect(queue.getState().pending).toBeNull();
  });

  it('[F-032-08] 次の削除を始めたら前の分を送り、新しい分が待ちになる', async () => {
    const { queue, sent } = setup();
    queue.remove(itemA);
    queue.remove(meal2);
    expect(queue.getState().pending).toEqual(meal2);
    await queue.idle();
    expect(sent).toEqual([itemA]);
    expect(queue.getState().hidden).toEqual([meal2]);
  });

  it('[F-032-11] 送るのは1件ずつ順に（前の応答を待ってから次を送る）', async () => {
    let release: () => void = () => {};
    const sent: string[] = [];
    const queue = new DeleteQueue({
      send: async (t) => {
        sent.push(`start:${t.kind === 'item' ? t.itemId : t.mealId}`);
        if (t.kind === 'item' && t.itemId === 'item-a') await new Promise<void>((r) => (release = r));
        sent.push(`end:${t.kind === 'item' ? t.itemId : t.mealId}`);
        return 'ok';
      },
    });
    queue.remove(itemA);
    queue.remove(itemB);
    queue.flush();
    await jest.advanceTimersByTimeAsync(0);
    expect(sent).toEqual(['start:item-a']);
    // 送っている間も、消したものは隠したまま
    expect(queue.getState().hidden).toEqual([itemA, itemB]);
    release();
    await queue.idle();
    expect(sent).toEqual(['start:item-a', 'end:item-a', 'start:item-b', 'end:item-b']);
  });

  it('[F-032-12] 409 なら重なったことを、そのほかの失敗なら失敗を出し、表示を戻す', async () => {
    const { queue, after } = setup(['conflict', 'error']);
    queue.remove(itemA);
    queue.flush();
    await queue.idle();
    expect(queue.getState()).toEqual({ pending: null, hidden: [], error: CONFLICT_MESSAGE });
    expect(after).toEqual([[itemA, 'conflict']]);

    queue.remove(itemB);
    expect(queue.getState().error).toBeNull();
    queue.flush();
    await queue.idle();
    expect(queue.getState().error).toBe(ERROR_MESSAGE);
  });

  it('[F-032-12] 送る処理が投げても失敗として扱う', async () => {
    const queue = new DeleteQueue({
      send: async () => {
        throw new Error('network');
      },
    });
    queue.remove(itemA);
    queue.flush();
    await queue.idle();
    expect(queue.getState()).toEqual({ pending: null, hidden: [], error: ERROR_MESSAGE });
  });

  it('失敗の表示はしばらくすると消える', async () => {
    const { queue } = setup(['error']);
    queue.remove(itemA);
    queue.flush();
    await queue.idle();
    expect(queue.getState().error).toBe(ERROR_MESSAGE);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(queue.getState().error).toBeNull();
  });

  it('変わったら購読者に知らせる', () => {
    const { queue } = setup();
    const listener = jest.fn();
    const unsubscribe = queue.subscribe(listener);
    queue.remove(itemA);
    queue.undo();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    queue.remove(itemA);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
