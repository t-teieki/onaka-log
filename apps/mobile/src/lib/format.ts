// ホームなどの表示の形（画面設計 3-1）

/** kcal は整数（四捨五入）で3桁区切り */
export function formatKcal(kcal: number): string {
  return Math.round(kcal).toLocaleString('en-US');
}

/** グラムは小数第1位まで */
export function formatGrams(g: number): string {
  return g.toFixed(1);
}

/** eaten_at（日本時間 +09:00、秒まで）の HH:MM */
export function mealTime(eatenAt: string): string {
  return eatenAt.slice(11, 16);
}

/** 食品名を「、」でつなぐ。max 文字を超えたら省略する */
export function mealTitle(names: string[], max = 20): string {
  const title = names.join('、');
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}
