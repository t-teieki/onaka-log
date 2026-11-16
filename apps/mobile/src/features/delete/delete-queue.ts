// 削除と「元に戻す」（画面設計 3-9、F-032-06〜08・11・12）。
// 削除 API を送るのを約5秒遅らせ、その間なら取り消せる。アプリ全体で1つだけ作る（バーも1本）

export type DeleteTarget =
  | { kind: 'meal'; recordDate: string; mealId: string }
  | { kind: 'item'; recordDate: string; mealId: string; itemId: string };

/** ok: 消えた（404 を含む） / conflict: 409 version_conflict / error: そのほかの失敗 */
export type SendResult = 'ok' | 'conflict' | 'error';

export type DeleteQueueState = {
  /** 「元に戻す」を出している削除 */
  pending: DeleteTarget | null;
  /** 表示から隠すもの（待ち＋送っている途中） */
  hidden: DeleteTarget[];
  /** 送れなかったときにバーに出す文言 */
  error: string | null;
};

export const CONFLICT_MESSAGE = 'ほかの変更と重なったため削除できませんでした';
export const ERROR_MESSAGE = '削除できませんでした';

type Options = {
  /** 削除 API を送る。版（expected_version）は送る時点の最新を使う（F-032-11） */
  send: (target: DeleteTarget) => Promise<SendResult>;
  /** 送り終えたあと（読み直しなど）。これが終わるまで隠したままにする */
  afterSend?: (target: DeleteTarget, result: SendResult) => Promise<void>;
  undoMs?: number;
  errorMs?: number;
};

const EMPTY: DeleteQueueState = { pending: null, hidden: [], error: null };

export class DeleteQueue {
  private state: DeleteQueueState = EMPTY;
  private readonly listeners = new Set<() => void>();
  private readonly send: Options['send'];
  private readonly afterSend: NonNullable<Options['afterSend']>;
  private readonly undoMs: number;
  private readonly errorMs: number;
  private undoTimer: ReturnType<typeof setTimeout> | null = null;
  private errorTimer: ReturnType<typeof setTimeout> | null = null;
  /** 送るのは1件ずつ順に（前の応答で版が変わるため） */
  private chain: Promise<void> = Promise.resolve();

  constructor({ send, afterSend = async () => {}, undoMs = 5_000, errorMs = 4_000 }: Options) {
    this.send = send;
    this.afterSend = afterSend;
    this.undoMs = undoMs;
    this.errorMs = errorMs;
  }

  getState = (): DeleteQueueState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** 消す（F-032-06）。前の削除が待っていれば、それを先に送る（F-032-08） */
  remove(target: DeleteTarget): void {
    this.flush();
    this.clearError();
    this.update({ pending: target, hidden: [...this.state.hidden, target] });
    this.undoTimer = setTimeout(() => this.flush(), this.undoMs);
  }

  /** 「元に戻す」（F-032-07） */
  undo(): void {
    const { pending } = this.state;
    if (!pending) return;
    this.clearUndoTimer();
    this.update({ pending: null, hidden: this.state.hidden.filter((t) => t !== pending) });
  }

  /** 待っている削除をすぐ送る（5秒たった・バックグラウンドに移った・次の削除、F-032-08） */
  flush(): void {
    const { pending } = this.state;
    if (!pending) return;
    this.clearUndoTimer();
    this.update({ pending: null });
    this.chain = this.chain.then(() => this.commit(pending));
  }

  /** 送っている途中の削除がすべて終わるまで待つ */
  idle(): Promise<void> {
    return this.chain;
  }

  private async commit(target: DeleteTarget): Promise<void> {
    const result = await this.send(target).catch((): SendResult => 'error');
    await this.afterSend(target, result).catch(() => {});
    this.update({ hidden: this.state.hidden.filter((t) => t !== target) });
    if (result !== 'ok') this.showError(result === 'conflict' ? CONFLICT_MESSAGE : ERROR_MESSAGE);
  }

  private showError(message: string) {
    this.clearError();
    this.update({ error: message });
    this.errorTimer = setTimeout(() => this.clearError(), this.errorMs);
  }

  private clearError() {
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.errorTimer = null;
    if (this.state.error) this.update({ error: null });
  }

  private clearUndoTimer() {
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoTimer = null;
  }

  private update(patch: Partial<DeleteQueueState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
}
