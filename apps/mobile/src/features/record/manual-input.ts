// 手入力（F-014、ADR-0012）の検証と、保存 API に送る食品（FoodItemInput）の組み立て
import type { components } from '@/api/schema';

export type FoodItemInput = components['schemas']['FoodItemInput'];

const NUTRIENT_KEYS = ['energy_kcal', 'protein_g', 'fat_g', 'carbohydrate_g'] as const;
type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export type ManualForm = { name: string } & Record<NutrientKey, string>;
export type ManualValue = { name: string; nutrients: Record<NutrientKey, number> };
export type ManualErrors = Partial<Record<keyof ManualForm, string>>;
export type ManualResult = { ok: true; value: ManualValue } | { ok: false; errors: ManualErrors };

export const NAME_MAX_LENGTH = 100; // FoodItemInput.name の maxLength

/** 全角の数字・小数点を半角に */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** 5項目すべて必須（Q-38・DM-09）。数値は0以上・小数第1位まで。空の項目は未入力としてエラーにしない */
export function validateManualForm(form: ManualForm): ManualResult {
  const errors: ManualErrors = {};
  let complete = true;

  const name = form.name.trim();
  if (name === '') complete = false;
  else if (name.length > NAME_MAX_LENGTH) errors.name = `${NAME_MAX_LENGTH}文字以内で入力してください`;

  const nutrients = {} as Record<NutrientKey, number>;
  for (const key of NUTRIENT_KEYS) {
    const raw = toHalfWidth(form[key].trim());
    if (raw === '') {
      complete = false;
    } else if (!/^(\d+(\.\d*)?|\.\d+)$/.test(raw)) {
      errors[key] = '0以上の数を入力してください';
    } else if (/\.\d{2,}$/.test(raw)) {
      errors[key] = '小数第1位までで入力してください';
    } else {
      nutrients[key] = Number(raw);
    }
  }

  if (!complete || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, nutrients } };
}

/** 手入力の食品: 出どころ manual・基準 as_entered（入力した値をそのまま食べた量の値にする）・分量 whole */
export function manualItem(itemId: string, value: ManualValue): FoodItemInput {
  return {
    item_id: itemId,
    name: value.name,
    source: {
      method: 'manual',
      provider: 'user',
      product_code: null,
      estimation: null,
      confidence: null,
      column_index: null,
      column_heading: null,
    },
    reference: {
      basis: { type: 'as_entered', amount: null, unit: null, label: null },
      net_content: null,
      nutrients: value.nutrients,
    },
    estimate_detail: null,
    portion: { mode: 'whole', fraction: null, pieces: null },
  };
}
