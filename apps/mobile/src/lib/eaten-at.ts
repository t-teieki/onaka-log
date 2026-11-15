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

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_BOUNDARY_MS = 4 * 60 * 60 * 1000;

/**
 * 「記録する」を押したときの食べた日時の既定（画面設計 3-1）。
 * 今日を表示中なら今。過去の日なら、その記録日に入る「その日の今の時刻」（4:00 より前の時刻は翌日の日付）
 */
export function defaultEatenAtFor(recordDate: string, now: Date): Date {
  const timeOfDay = (now.getTime() + JST_OFFSET_MS) % DAY_MS; // 日本時間の 0:00 からの経過
  const shift = timeOfDay < DAY_BOUNDARY_MS ? DAY_MS : 0;
  const at = new Date(Date.parse(`${recordDate}T00:00:00+09:00`) + shift + timeOfDay);
  return clampToNow(at, now);
}

/** 未来は選べない（Q-44）。今より後は今にする */
export function clampToNow(at: Date, now: Date): Date {
  return at.getTime() > now.getTime() ? now : at;
}
