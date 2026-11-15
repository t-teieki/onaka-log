// 食べた日時（eaten_at）: 日本時間 +09:00・秒まで（contracts/domain/meal.schema.json）。端末のタイムゾーンは使わない
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Date → 「2026-11-15T12:30:07+09:00」（ミリ秒は切り捨て） */
export function toEatenAt(at: Date): string {
  return `${new Date(at.getTime() + JST_OFFSET_MS).toISOString().slice(0, 19)}+09:00`;
}

/** 確認画面の表示「11/15 12:30」 */
export function formatEatenAt(eatenAt: string): string {
  const month = Number(eatenAt.slice(5, 7));
  const day = Number(eatenAt.slice(8, 10));
  return `${month}/${day} ${eatenAt.slice(11, 16)}`;
}
