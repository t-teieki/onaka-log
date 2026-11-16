// 分量と値のプレビュー（domain-model §2-3、DM-03・04、F-020-02・03）。
// 保存される値はバックエンドが同じ規則で計算する（ADR-0015）。ここは確認画面の表示だけに使う
import type { Meal } from '@/api/client';
import type { components } from '@/api/schema';

export type Reference = Meal['items'][number]['reference'];
export type Nutrients = Reference['nutrients'];
export type PortionInput = components['schemas']['PortionInput'];

const NUTRIENTS = ['energy_kcal', 'protein_g', 'fat_g', 'carbohydrate_g'] as const;

/** 小数第1位で四捨五入（0.05 は切り上げ。バックエンドの ROUND_HALF_UP に合わせ、掛け算の誤差を先に丸める） */
export function round1(value: number): number {
  return Math.round(Number((value * 10).toPrecision(12))) / 10;
}

/** 「全部」の倍率 */
export function wholeMultiplier(reference: Reference): number {
  const { type } = reference.basis;
  const net = reference.net_content;
  if (type === 'per_100g' || type === 'per_100ml') {
    const unit = type === 'per_100g' ? 'g' : 'ml';
    const usable = net && (net.status === 'known' || net.status === 'assumed_from_serving');
    // 内容量が分からない（または単位が合わない）ときは 100g（ml）食べたとみなす
    return usable && net.amount && net.unit === unit ? net.amount / 100 : 1;
  }
  if (type === 'per_piece') return net?.pieces ?? 1;
  return 1;
}

/** 分量の選択から決まる倍率（DM-04） */
export function multiplierFor(reference: Reference, portion: PortionInput): number {
  if (portion.mode === 'pieces') return portion.pieces ?? 1;
  if (portion.mode === 'fraction') return wholeMultiplier(reference) * (portion.fraction ?? 1);
  return wholeMultiplier(reference);
}

/** 食べた量の値（DM-03）。不明（null）は null のまま */
export function previewNutrients(reference: Reference, portion: PortionInput): Nutrients {
  const m = multiplierFor(reference, portion);
  const out = {} as Nutrients;
  for (const n of NUTRIENTS) {
    const v = reference.nutrients[n];
    out[n] = v === null ? null : round1(v * m);
  }
  return out;
}

export type PortionChoice = { label: string; portion: PortionInput };

const WHOLE: PortionInput = { mode: 'whole', fraction: null, pieces: null };
const fraction = (f: number): PortionInput => ({ mode: 'fraction', fraction: f, pieces: null });
const pieces = (n: number): PortionInput => ({ mode: 'pieces', fraction: null, pieces: n });

/** 分量のボタン（F-020-02）。個数売りは個数、それ以外は全部と割合 */
export function portionChoices(reference: Reference): PortionChoice[] {
  if (reference.basis.type === 'per_piece') {
    const choices = [1, 2, 3].map((n) => ({ label: `${n}個`, portion: pieces(n) }));
    return reference.net_content?.pieces ? [...choices, { label: '全部', portion: WHOLE }] : choices;
  }
  return [
    { label: '全部', portion: WHOLE },
    { label: '3/4', portion: fraction(0.75) },
    { label: '1/2', portion: fraction(0.5) },
    { label: '1/4', portion: fraction(0.25) },
  ];
}

export function samePortion(a: PortionInput, b: PortionInput): boolean {
  return a.mode === b.mode && a.fraction === b.fraction && a.pieces === b.pieces;
}
