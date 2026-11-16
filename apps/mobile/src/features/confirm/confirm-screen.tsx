// 確認・修正（画面設計 3-5、F-020-01〜06）: 照合・推定の候補を表示し、名前と分量を決めて保存する。
// addTo があれば追加モード（既存の食事に足す、F-030-08〜12）。手入力は manual-entry-screen（入力モード）
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { components } from '@/api/schema';
import { saveErrorMessage, useAddMealItem, type AddTarget } from '@/features/meal/use-add-item';
import { EatenAtField } from '@/features/record/eaten-at-field';
import { NAME_MAX_LENGTH, type FoodItemInput } from '@/features/record/manual-input';
import { useCreateMeal } from '@/features/record/use-create-meal';
import { defaultEatenAtFor, toEatenAt } from '@/lib/eaten-at';
import { formatGrams, formatKcal } from '@/lib/format';
import {
  portionChoices,
  previewNutrients,
  round1,
  samePortion,
  type Nutrients,
  type PortionInput,
  type Reference,
} from '@/lib/portion';
import { uuidv7 } from '@/lib/uuid7';

export type FoodItemDraft = components['schemas']['FoodItemDraft'];

type Props = {
  /** 品目ごとの候補（1件ずつカードにする。バーコード・写真推定） */
  drafts?: FoodItemDraft[];
  /** 列ごとの候補（どれか1つを選ぶ。栄養成分表示の複数列、F-020-07） */
  columns?: FoodItemDraft[];
  /** ホームで表示していた記録日（食べた日時の既定に使う） */
  recordDate?: string;
  addTo?: AddTarget;
  now?: () => Date;
  newId?: () => string;
  onSaved: (recordDate: string) => void;
  onClose: () => void;
  /** バーコードの候補のときの「栄養成分表示を撮る」（F-020-06） */
  onTakeLabel?: () => void;
};

/** カード1枚の状態。options は選べる候補（列）。品目ごとのカードは1件だけ */
type Card = { itemId: string; options: FoodItemDraft[]; selected: number; name: string; portion: PortionInput };

const NUTRIENTS = ['energy_kcal', 'protein_g', 'fat_g', 'carbohydrate_g'] as const;

export function ConfirmScreen({
  drafts,
  columns,
  recordDate,
  addTo,
  now = () => new Date(),
  newId = () => uuidv7(),
  onSaved,
  onClose,
  onTakeLabel,
}: Props) {
  // 食事・食品の ID は開いたときに決め、再送でも変えない（F-020-05）
  const [mealId] = useState(() => (addTo ? '' : newId()));
  const [cards, setCards] = useState<Card[]>(() => {
    const groups = columns && columns.length > 0 ? [columns] : (drafts ?? []).map((d) => [d]);
    // 先頭の列を選んだ状態で開く（Q-37）
    return groups.map((options) => ({
      itemId: newId(),
      options,
      selected: 0,
      name: options[0]!.name,
      portion: options[0]!.default_portion,
    }));
  });
  const [eatenAt, setEatenAt] = useState(() => toEatenAt(recordDate ? defaultEatenAtFor(recordDate, now()) : now()));
  const createMeal = useCreateMeal();
  const addItem = useAddMealItem(addTo);
  const saving = createMeal.isPending || addItem.isPending;

  const chosen = cards.map((c) => c.options[c.selected]!);
  const previews = cards.map((c, i) => previewNutrients(chosen[i]!.reference, c.portion));
  const totalKcal = round1(previews.reduce((sum, p) => sum + (p.energy_kcal ?? 0), 0));
  const incomplete = previews.some((p) => NUTRIENTS.some((n) => p[n] === null));
  const namesOk = cards.every((c) => c.name.trim().length > 0 && c.name.trim().length <= NAME_MAX_LENGTH);
  const canSave = cards.length > 0 && namesOk && !saving;
  const saveError = saveErrorMessage(addTo ? addItem.error : createMeal.error);

  const update = (i: number, patch: Partial<Card>) =>
    setCards((all) => all.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  // 列を変えたら、名前・分量もその列の候補に合わせる（F-020-07）
  const selectColumn = (i: number, index: number) => {
    const option = cards[i]!.options[index]!;
    update(i, { selected: index, name: option.name, portion: option.default_portion });
  };

  const save = () => {
    if (!canSave) return;
    const items: FoodItemInput[] = cards.map((c, i) => ({
      item_id: c.itemId,
      name: c.name.trim(),
      source: chosen[i]!.source,
      reference: chosen[i]!.reference,
      estimate_detail: chosen[i]!.estimate_detail,
      portion: c.portion,
    }));
    const done = { onSuccess: (date: string) => onSaved(date) };
    if (addTo) addItem.mutate(items[0]!, done);
    else createMeal.mutate({ meal_id: mealId, eaten_at: eatenAt, items }, done);
  };

  const fromBarcode = chosen.some((d) => d.source.method === 'barcode');

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={onClose} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{addTo ? '食品を追加' : '確認'}</Text>
        <View style={styles.close} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* 追加モードは食事の日時のまま（F-020-04） */}
        {!addTo && <EatenAtField value={eatenAt} onChange={setEatenAt} now={now} />}
        {cards.map((card, i) => (
          <FoodCard
            key={card.itemId}
            card={card}
            preview={previews[i]!}
            onChange={(patch) => update(i, patch)}
            onSelectColumn={(index) => selectColumn(i, index)}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.total}>{`合計 ${formatKcal(totalKcal)} kcal`}</Text>
          {incomplete && <Text style={styles.incomplete}>一部不明</Text>}
        </View>
        {fromBarcode && onTakeLabel && (
          // 登録ミス対策（ADR-0009、F-020-06）
          <Pressable accessibilityRole="button" onPress={onTakeLabel} style={styles.ocrButton}>
            <Text style={styles.ocrText}>栄養成分表示を撮る</Text>
          </Pressable>
        )}
        {saveError && <Text style={styles.error}>{saveError}</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addTo ? '食事に追加' : '保存する'}
          disabled={!canSave}
          accessibilityState={{ disabled: !canSave }}
          onPress={save}
          style={[styles.saveButton, !canSave && styles.saveDisabled]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>{addTo ? '食事に追加' : '保存する'}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const SOURCE_LABELS: Record<FoodItemDraft['source']['method'], string> = {
  barcode: 'Open Food Facts',
  label_ocr: '栄養成分表示',
  photo: '写真（目安）',
  manual: '手入力',
};

const BASIS_LABELS: Record<Reference['basis']['type'], string> = {
  per_100g: '100g当たり',
  per_100ml: '100ml当たり',
  per_package: '1包装当たり',
  per_serving: '1食当たり',
  per_piece: '1個当たり',
  as_estimated: '推定',
  as_entered: '入力した値',
};

/** 基準と内容量の表記（F-020-01） */
function basisLine(reference: Reference): string {
  const basis = reference.basis.label ?? BASIS_LABELS[reference.basis.type];
  const net = reference.net_content;
  if (!net) return basis;
  if (net.status === 'unknown') return `${basis}・内容量：不明`;
  const amount = net.amount && net.unit ? `${net.amount}${net.unit}` : net.pieces ? `${net.pieces}個` : null;
  if (!amount) return `${basis}・内容量：不明`;
  return net.status === 'assumed_from_serving' ? `${basis}・内容量 ${amount}（1食分）` : `${basis}・内容量 ${amount}`;
}

const grams = (g: number | null) => (g === null ? '—' : `${formatGrams(g)}g`);

/** 列のボタンの名前: 見出し、なければ「1列目」「2列目」 */
const columnLabel = (d: FoodItemDraft, i: number) => d.source.column_heading ?? `${i + 1}列目`;

function FoodCard({
  card,
  preview,
  onChange,
  onSelectColumn,
}: {
  card: Card;
  preview: Nutrients;
  onChange: (patch: Partial<Card>) => void;
  onSelectColumn: (index: number) => void;
}) {
  const draft = card.options[card.selected]!;
  return (
    <View style={styles.card}>
      {card.options.length > 1 && (
        // 違う列で記録しないよう、カードの上の方に目立つように置く（Q-37）
        <View style={styles.columns}>
          {card.options.map((option, index) => {
            const selected = index === card.selected;
            const label = columnLabel(option, index);
            return (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                onPress={() => onSelectColumn(index)}
                style={[styles.column, selected && styles.columnSelected]}
              >
                <Text style={[styles.columnText, selected && styles.choiceTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={styles.nameRow}>
        <TextInput
          accessibilityLabel="食品名"
          value={card.name}
          onChangeText={(name) => onChange({ name })}
          maxLength={NAME_MAX_LENGTH}
          style={styles.nameInput}
        />
        <Text style={styles.pencil}>✎</Text>
      </View>
      <Text style={styles.meta}>{SOURCE_LABELS[draft.source.method]}</Text>
      <Text style={styles.meta}>{basisLine(draft.reference)}</Text>

      <View style={styles.choices}>
        {portionChoices(draft.reference).map((choice) => {
          const selected = samePortion(choice.portion, card.portion);
          return (
            <Pressable
              key={choice.label}
              accessibilityRole="button"
              accessibilityLabel={choice.label}
              accessibilityState={{ selected }}
              onPress={() => onChange({ portion: choice.portion })}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{choice.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.kcal}>
        {preview.energy_kcal === null ? '— kcal' : `${formatKcal(preview.energy_kcal)} kcal`}
      </Text>
      <Text style={styles.pfc}>
        {`P ${grams(preview.protein_g)}  F ${grams(preview.fat_g)}  C ${grams(preview.carbohydrate_g)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  close: { width: 48, padding: 12 },
  closeText: { fontSize: 22 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  body: { padding: 16, gap: 16 },
  card: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    borderBottomWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 4,
  },
  pencil: { color: '#64748b' },
  meta: { color: '#555', fontSize: 13 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  column: { borderWidth: 2, borderColor: '#f59e0b', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  columnSelected: { backgroundColor: '#f59e0b' },
  columnText: { fontSize: 15, fontWeight: '600', color: '#92400e' },
  choice: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  choiceSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  choiceText: { fontSize: 15, color: '#1f2937' },
  choiceTextSelected: { color: '#fff', fontWeight: '600' },
  kcal: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pfc: { color: '#333', fontVariant: ['tabular-nums'] },
  footer: { padding: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  total: { fontSize: 18, fontWeight: '700' },
  incomplete: { color: '#b45309' },
  ocrButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 12,
  },
  ocrText: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
  badge: { fontSize: 12, color: '#6b7280', backgroundColor: '#f3f4f6', paddingHorizontal: 6, borderRadius: 4 },
  error: { color: '#dc2626', fontSize: 13 },
  saveButton: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  saveDisabled: { backgroundColor: '#93c5fd' },
  saveText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
