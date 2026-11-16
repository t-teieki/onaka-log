// 削除を待っている間の表示（F-032-09）。消した食事・食品を除き、合計もそれを除いて出す
import threeMeals from '../../../contracts/api/examples/valid/DaySummary-three-meals.json';
import type { DaySummary, Meal } from '@/api/client';
import type { DeleteTarget } from '@/features/delete/delete-queue';
import { visibleDay, visibleMeal } from '@/features/delete/pending-view';

const day = threeMeals as DaySummary;
const [donutMeal, noodleMeal] = day.meals as [Meal, Meal, Meal];
const date = day.record_date;
const [donut, juice] = donutMeal.items;

describe('削除を待っている間の表示（F-032-09）', () => {
  it('[F-032-09] 隠すものがなければそのまま返す', () => {
    expect(visibleMeal(donutMeal, [])).toBe(donutMeal);
    expect(visibleDay(day, [])).toBe(day);
  });

  it('[F-032-09] 食品を隠すと、残りの食品で食事の合計と不明を出し直す', () => {
    const hidden: DeleteTarget[] = [{ kind: 'item', recordDate: date, mealId: donutMeal.meal_id, itemId: juice!.item_id }];
    const meal = visibleMeal(donutMeal, hidden);
    expect(meal?.items.map((i) => i.item_id)).toEqual([donut!.item_id]);
    expect(meal?.totals).toEqual({ energy_kcal: 289, protein_g: 1.7, fat_g: 26.1, carbohydrate_g: 11.7 });
    // 不明（null）だったのは野菜ジュースの脂質だけなので、消えたら不明もなくなる
    expect(meal?.totals_incomplete).toEqual([]);
  });

  it('[F-032-09] 食事を隠したとき、またはすべての食品を隠したときは null', () => {
    expect(visibleMeal(donutMeal, [{ kind: 'meal', recordDate: date, mealId: donutMeal.meal_id }])).toBeNull();
    const allItems: DeleteTarget[] = donutMeal.items.map((i) => ({
      kind: 'item',
      recordDate: date,
      mealId: donutMeal.meal_id,
      itemId: i.item_id,
    }));
    expect(visibleMeal(donutMeal, allItems)).toBeNull();
  });

  it('[F-032-09] 食事を隠すと、日の一覧から除き、日次合計と不明を出し直す', () => {
    const shown = visibleDay(day, [{ kind: 'meal', recordDate: date, mealId: donutMeal.meal_id }]);
    expect(shown.meals.map((m) => m.meal_id)).toEqual(day.meals.slice(1).map((m) => m.meal_id));
    // 351 + 190、9.8 + 11、14.6 + 13、44.8 + 6
    expect(shown.totals).toEqual({ energy_kcal: 541, protein_g: 20.8, fat_g: 27.6, carbohydrate_g: 50.8 });
    expect(shown.totals_incomplete).toEqual([]);
  });

  it('[F-032-09] ほかの日やほかの食事への削除は影響しない', () => {
    const hidden: DeleteTarget[] = [
      { kind: 'meal', recordDate: '2026-11-12', mealId: donutMeal.meal_id },
      { kind: 'item', recordDate: date, mealId: noodleMeal.meal_id, itemId: juice!.item_id },
    ];
    expect(visibleMeal(donutMeal, hidden)).toBe(donutMeal);
  });
});
