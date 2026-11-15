// 記録日（DM-01）。日本時間の 4:00 で区切る。バックエンドの domain/meal.py の record_date_of と同じ規則
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_BOUNDARY_MS = 4 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 日時 → 記録日（YYYY-MM-DD）。端末のタイムゾーンは使わない */
export function recordDateOf(at: Date): string {
  return new Date(at.getTime() + JST_OFFSET_MS - DAY_BOUNDARY_MS).toISOString().slice(0, 10);
}

function parse(recordDate: string): Date {
  return new Date(`${recordDate}T00:00:00Z`);
}

export function addDays(recordDate: string, days: number): string {
  const d = parse(recordDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 今日（記録日）より先には進めない */
export function canGoNext(recordDate: string, today: string): boolean {
  return recordDate < today;
}

/** 「11月13日（金）」 */
export function formatRecordDate(recordDate: string): string {
  const d = parse(recordDate);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEKDAYS[d.getUTCDay()]}）`;
}
