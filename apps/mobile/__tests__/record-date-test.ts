// 記録日（DM-01: 日本時間の 4:00 で区切る、scope.md Q-09）と日付の移動（画面設計 3-1）
import { addDays, canGoNext, formatRecordDate, recordDateOf } from '@/lib/record-date';

describe('recordDateOf（DM-01）', () => {
  it('日本時間の 4:00 以降はその日', () => {
    expect(recordDateOf(new Date('2026-11-15T04:00:00+09:00'))).toBe('2026-11-15');
    expect(recordDateOf(new Date('2026-11-15T23:59:59+09:00'))).toBe('2026-11-15');
  });

  it('日本時間の 0:00〜3:59 は前日', () => {
    expect(recordDateOf(new Date('2026-11-15T00:00:00+09:00'))).toBe('2026-11-14');
    expect(recordDateOf(new Date('2026-11-15T03:59:59+09:00'))).toBe('2026-11-14');
  });

  it('端末のタイムゾーンに関係なく日本時間で決める', () => {
    // UTC 2026-11-14T19:30Z = 日本時間 11/15 4:30
    expect(recordDateOf(new Date('2026-11-14T19:30:00Z'))).toBe('2026-11-15');
  });
});

describe('日付の移動', () => {
  it('前日・翌日（月・年をまたぐ）', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('今日（記録日）より先には進めない', () => {
    expect(canGoNext('2026-11-14', '2026-11-15')).toBe(true);
    expect(canGoNext('2026-11-15', '2026-11-15')).toBe(false);
  });

  it('見出しの表示は「11月13日（金）」の形', () => {
    expect(formatRecordDate('2026-11-13')).toBe('11月13日（金）');
    expect(formatRecordDate('2026-11-15')).toBe('11月15日（日）');
  });
});
