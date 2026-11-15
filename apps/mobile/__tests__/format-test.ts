// ホームの表示の形（画面設計 3-1）
import { formatGrams, formatKcal, mealTime, mealTitle } from '@/lib/format';

describe('数値の表示', () => {
  it('kcal は整数（四捨五入）で3桁区切り', () => {
    expect(formatKcal(1842.4)).toBe('1,842');
    expect(formatKcal(702.5)).toBe('703');
    expect(formatKcal(0)).toBe('0');
  });

  it('グラムは小数第1位まで', () => {
    expect(formatGrams(72.4)).toBe('72.4');
    expect(formatGrams(61)).toBe('61.0');
  });
});

describe('食事の行', () => {
  it('時刻は eaten_at の日本時間の HH:MM', () => {
    expect(mealTime('2026-11-13T08:05:30+09:00')).toBe('08:05');
  });

  it('名前は食品名を「、」でつなぎ、長ければ省略する', () => {
    expect(mealTitle(['ご飯'])).toBe('ご飯');
    expect(mealTitle(['ご飯', 'ハンバーグ'])).toBe('ご飯、ハンバーグ');
    expect(mealTitle(['ご飯', 'ハンバーグ（ソース付き）', '豆腐と玉ねぎの味噌汁'], 12)).toBe('ご飯、ハンバーグ（ソー…');
  });
});
