// 削除を待っている間の表示（F-032-09）。消した食事・食品を除き、合計もそれを除いて出す。
// 送り終えたらサーバーの値で読み直すので、ここの計算は一時的な表示だけに使う（計算の正はバックエンド、ADR-0015）
import type { DaySummary, Meal } from '@/api/client';

import type { DeleteTarget } from './delete-queue';

type Nutrient = keyof Meal['totals'];
const NUTRIENTS: Nutrient[] = ['energy_kcal', 'protein_g', 'fat_g', 'carbohydrate_g'];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 隠すものを除いた食事。食事ごと隠すとき・食品が残らないときは null */
export function visibleMeal(meal: Meal, hidden: DeleteTarget[]): Meal | null {
  const mine = hidden.filter((t) => t.recordDate === meal.record_date && t.mealId === meal.meal_id);
  if (mine.length === 0) return meal;
  if (mine.some((t) => t.kind === 'meal')) return null;
  const hiddenItems = new Set(mine.map((t) => (t.kind === 'item' ? t.itemId : '')));
  const items = meal.items.filter((i) => !hiddenItems.has(i.item_id));
  if (items.length === meal.items.length) return meal;
  if (items.length === 0) return null;
  const totals = Object.fromEntries(
    NUTRIENTS.map((n) => [n, round1(items.reduce((sum, i) => sum + (i.nutrients[n] ?? 0), 0))]),
  ) as Meal['totals'];
  const incomplete = NUTRIENTS.filter((n) => items.some((i) => i.nutrients[n] === null));
  return { ...meal, items, totals, totals_incomplete: incomplete };
}

/** 隠すものを除いた1日分 */
export function visibleDay(day: DaySummary, hidden: DeleteTarget[]): DaySummary {
  if (hidden.length === 0) return day;
  const meals = day.meals.map((m) => visibleMeal(m, hidden));
  if (meals.every((m, i) => m === day.meals[i])) return day;
  const shown = meals.filter((m): m is Meal => m !== null);
  const totals = Object.fromEntries(
    NUTRIENTS.map((n) => [n, round1(shown.reduce((sum, m) => sum + m.totals[n], 0))]),
  ) as DaySummary['totals'];
  const incomplete = NUTRIENTS.filter((n) => shown.some((m) => m.totals_incomplete.includes(n)));
  return { ...day, meals: shown, totals, totals_incomplete: incomplete };
}
