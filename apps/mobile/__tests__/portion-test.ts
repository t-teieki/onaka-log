// 分量と値のプレビュー（F-020-02・03、domain-model §2-3、DM-03・04）。保存される値はバックエンドの計算（同じ規則）
import found from '../../../contracts/api/examples/valid/ProductLookupResponse-found.json';
import type { Reference } from '@/lib/portion';
import { multiplierFor, portionChoices, previewNutrients, wholeMultiplier } from '@/lib/portion';

const cupNoodle = found.item.reference as Reference; // 100g 当たり 450kcal、内容量 78g

const ref = (patch: Partial<Reference>): Reference => ({ ...cupNoodle, ...patch });
const whole = { mode: 'whole', fraction: null, pieces: null } as const;

describe('「全部」の倍率（domain-model §2-3）', () => {
  it('[F-020-03] 100g 当たりで内容量が分かれば 内容量 ÷ 100', () => {
    expect(wholeMultiplier(cupNoodle)).toBeCloseTo(0.78);
  });

  it('[F-020-03] 1食分から推定した内容量も使う。単位が合わない・内容量が不明なら 1（100g 食べたとみなす）', () => {
    const serving = ref({ net_content: { status: 'assumed_from_serving', amount: 30, unit: 'g', pieces: null } });
    expect(wholeMultiplier(serving)).toBeCloseTo(0.3);
    const ml = ref({ net_content: { status: 'known', amount: 500, unit: 'ml', pieces: null } });
    expect(wholeMultiplier(ml)).toBe(1);
    expect(wholeMultiplier(ref({ net_content: { status: 'unknown', amount: null, unit: null, pieces: null } }))).toBe(1);
    expect(wholeMultiplier(ref({ net_content: null }))).toBe(1);
  });

  it('[F-020-03] 100ml 当たりは ml の内容量で割る', () => {
    const drink = ref({
      basis: { type: 'per_100ml', amount: 100, unit: 'ml', label: null },
      net_content: { status: 'known', amount: 500, unit: 'ml', pieces: null },
    });
    expect(wholeMultiplier(drink)).toBe(5);
  });

  it('[F-020-03] 1個当たりは個数（分からなければ 1）。包装・1食当たりなどは 1', () => {
    const perPiece = ref({
      basis: { type: 'per_piece', amount: null, unit: null, label: '1個当たり' },
      net_content: { status: 'known', amount: null, unit: null, pieces: 4 },
    });
    expect(wholeMultiplier(perPiece)).toBe(4);
    expect(wholeMultiplier({ ...perPiece, net_content: null })).toBe(1);
    expect(wholeMultiplier(ref({ basis: { type: 'per_package', amount: null, unit: null, label: '1袋当たり' } }))).toBe(1);
  });
});

describe('分量の倍率とプレビュー（DM-03・04）', () => {
  it('[F-020-03] fraction は「全部」の倍率 × fraction、pieces は個数', () => {
    expect(multiplierFor(cupNoodle, whole)).toBeCloseTo(0.78);
    expect(multiplierFor(cupNoodle, { mode: 'fraction', fraction: 0.5, pieces: null })).toBeCloseTo(0.39);
    expect(multiplierFor(cupNoodle, { mode: 'pieces', fraction: null, pieces: 2 })).toBe(2);
  });

  it('[F-020-03] 値は 元の値 × 倍率 を小数第1位で四捨五入。不明（null）は null のまま', () => {
    expect(previewNutrients(cupNoodle, whole)).toEqual({
      energy_kcal: 351,
      protein_g: 9.8,
      fat_g: 14.6,
      carbohydrate_g: 44.8,
    });
    expect(previewNutrients(cupNoodle, { mode: 'fraction', fraction: 0.5, pieces: null })).toEqual({
      energy_kcal: 175.5,
      protein_g: 4.9,
      fat_g: 7.3,
      carbohydrate_g: 22.4,
    });
    const unknownProtein = ref({ nutrients: { ...cupNoodle.nutrients, protein_g: null } });
    expect(previewNutrients(unknownProtein, whole).protein_g).toBeNull();
  });

  it('[F-020-03] 四捨五入は 0.05 を切り上げる（バックエンドの ROUND_HALF_UP と同じ）', () => {
    const r = ref({
      basis: { type: 'per_package', amount: null, unit: null, label: null },
      nutrients: { energy_kcal: 0.25, protein_g: 1.05, fat_g: 2.45, carbohydrate_g: 0 },
    });
    expect(previewNutrients(r, whole)).toEqual({ energy_kcal: 0.3, protein_g: 1.1, fat_g: 2.5, carbohydrate_g: 0 });
  });
});

describe('分量のボタン（F-020-02）', () => {
  it('[F-020-02] 1個当たり以外は「全部」「3/4」「1/2」「1/4」', () => {
    expect(portionChoices(cupNoodle)).toEqual([
      { label: '全部', portion: whole },
      { label: '3/4', portion: { mode: 'fraction', fraction: 0.75, pieces: null } },
      { label: '1/2', portion: { mode: 'fraction', fraction: 0.5, pieces: null } },
      { label: '1/4', portion: { mode: 'fraction', fraction: 0.25, pieces: null } },
    ]);
  });

  it('[F-020-02] 1個当たりは「1個」「2個」「3個」、個数が分かれば「全部」も', () => {
    const perPiece = ref({
      basis: { type: 'per_piece', amount: null, unit: null, label: '1個当たり' },
      net_content: { status: 'known', amount: null, unit: null, pieces: 4 },
    });
    expect(portionChoices(perPiece).map((c) => c.label)).toEqual(['1個', '2個', '3個', '全部']);
    expect(portionChoices({ ...perPiece, net_content: null }).map((c) => c.label)).toEqual(['1個', '2個', '3個']);
  });
});
