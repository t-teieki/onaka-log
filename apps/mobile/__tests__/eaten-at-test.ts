// 食べた日時（eaten_at）は日本時間 +09:00・秒まで（contracts/domain/meal.schema.json の eaten_at）
import { clampToNow, defaultEatenAtFor, formatEatenAt, toEatenAt } from '@/lib/eaten-at';
import { recordDateOf } from '@/lib/record-date';

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

describe('defaultEatenAtFor（記録する を押したときの食べた日時の既定、画面設計 3-1・Q-33）', () => {
  const NOW = new Date('2026-11-13T20:15:00+09:00'); // 記録日 2026-11-13

  it('今日を表示しているときは今の時刻', () => {
    expect(toEatenAt(defaultEatenAtFor('2026-11-13', NOW))).toBe('2026-11-13T20:15:00+09:00');
  });

  it('過去の日を表示しているときは、その日の今の時刻', () => {
    expect(toEatenAt(defaultEatenAtFor('2026-11-10', NOW))).toBe('2026-11-10T20:15:00+09:00');
  });

  it('今が 4:00 より前なら、その記録日に入るよう翌日の日付の同じ時刻にする', () => {
    const lateNight = new Date('2026-11-14T02:30:00+09:00'); // 記録日 2026-11-13
    const at = defaultEatenAtFor('2026-11-10', lateNight);
    expect(toEatenAt(at)).toBe('2026-11-11T02:30:00+09:00');
    expect(recordDateOf(at)).toBe('2026-11-10');
  });
});

describe('clampToNow（未来は選べない、Q-44）', () => {
  const NOW = new Date('2026-11-13T20:15:00+09:00');

  it('今より後は今にする', () => {
    expect(clampToNow(new Date('2026-11-14T09:00:00+09:00'), NOW)).toEqual(NOW);
  });

  it('今まではそのまま', () => {
    const past = new Date('2026-11-12T07:00:00+09:00');
    expect(clampToNow(past, NOW)).toEqual(past);
  });
});
