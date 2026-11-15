// 食べた日時（eaten_at）は日本時間 +09:00・秒まで（contracts/domain/meal.schema.json の eaten_at）
import { formatEatenAt, toEatenAt } from '@/lib/eaten-at';

describe('toEatenAt', () => {
  it('端末のタイムゾーンに関係なく日本時間の +09:00 で、秒まで（ミリ秒は切り捨て）', () => {
    expect(toEatenAt(new Date('2026-11-15T03:30:07.999Z'))).toBe('2026-11-15T12:30:07+09:00');
  });

  it('日本時間で日付が変わる', () => {
    expect(toEatenAt(new Date('2026-11-14T15:00:00Z'))).toBe('2026-11-15T00:00:00+09:00');
  });
});

describe('formatEatenAt（確認画面の表示）', () => {
  it('「11/15 12:30」', () => {
    expect(formatEatenAt('2026-11-15T12:30:07+09:00')).toBe('11/15 12:30');
    expect(formatEatenAt('2026-01-05T08:05:00+09:00')).toBe('1/5 08:05');
  });
});
