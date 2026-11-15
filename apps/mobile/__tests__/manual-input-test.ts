// 手入力（F-014、画面設計 3-5 の入力モード、ADR-0012）: 5項目すべて必須（Q-38・DM-09）、数値は小数第1位まで
import manualMeal from '../../../contracts/domain/examples/valid/meal-manual.json';
import { manualItem, validateManualForm, type ManualForm } from '@/features/record/manual-input';

const filled: ManualForm = { name: '職場のお菓子', energy_kcal: '150', protein_g: '2', fat_g: '7.5', carbohydrate_g: '19' };

describe('validateManualForm（F-014）', () => {
  it('5項目すべてあれば保存できる', () => {
    const r = validateManualForm(filled);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        name: '職場のお菓子',
        nutrients: { energy_kcal: 150, protein_g: 2, fat_g: 7.5, carbohydrate_g: 19 },
      });
    }
  });

  it.each(['name', 'energy_kcal', 'protein_g', 'fat_g', 'carbohydrate_g'] as const)(
    '%s が空なら保存できない（すべて必須、Q-38）',
    (key) => {
      const r = validateManualForm({ ...filled, [key]: '' });
      expect(r.ok).toBe(false);
    },
  );

  it('食品名の前後の空白は除き、空白だけなら保存できない', () => {
    const r = validateManualForm({ ...filled, name: '  おにぎり ' });
    expect(r.ok && r.value.name).toBe('おにぎり');
    expect(validateManualForm({ ...filled, name: '   ' }).ok).toBe(false);
  });

  it('食品名は100文字まで（FoodItemInput.name）', () => {
    expect(validateManualForm({ ...filled, name: 'あ'.repeat(100) }).ok).toBe(true);
    expect(validateManualForm({ ...filled, name: 'あ'.repeat(101) }).ok).toBe(false);
  });

  it('数値は0以上・小数第1位まで。それ以外は項目ごとに理由を返す', () => {
    const r = validateManualForm({ ...filled, protein_g: '2.25', fat_g: '-1', carbohydrate_g: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.protein_g).toBe('小数第1位までで入力してください');
      expect(r.errors.fat_g).toBe('0以上の数を入力してください');
      expect(r.errors.carbohydrate_g).toBe('0以上の数を入力してください');
      expect(r.errors.energy_kcal).toBeUndefined();
    }
  });

  it('0 と小数（.5・12.0）は受け付け、全角の数字も半角として読む', () => {
    const r = validateManualForm({ ...filled, energy_kcal: '０', protein_g: '.5', fat_g: '12.0', carbohydrate_g: '１９．５' });
    expect(r.ok && r.value.nutrients).toEqual({ energy_kcal: 0, protein_g: 0.5, fat_g: 12, carbohydrate_g: 19.5 });
  });

  it('空の項目は「未入力」としてエラーを出さない（入力途中に赤くしない）', () => {
    const r = validateManualForm({ ...filled, fat_g: '' });
    expect(!r.ok && r.errors.fat_g).toBeUndefined();
  });
});

describe('manualItem（保存 API の FoodItemInput）', () => {
  it('手入力の食品は出どころ manual・基準 as_entered・分量 whole（契約の例 meal-manual.json と同じ形）', () => {
    const expected = manualMeal.items[0];
    const item = manualItem(expected.item_id, {
      name: expected.name,
      nutrients: { energy_kcal: 150, protein_g: 2, fat_g: 7.5, carbohydrate_g: 19 },
    });
    expect(item).toEqual({
      item_id: expected.item_id,
      name: expected.name,
      source: expected.source,
      reference: expected.reference,
      estimate_detail: null,
      portion: { mode: 'whole', fraction: null, pieces: null },
    });
  });
});
