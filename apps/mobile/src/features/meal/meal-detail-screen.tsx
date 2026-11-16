// 食事の詳細（画面設計 3-6、F-031-08〜10）。食品・食事の削除は確認なしで消して「元に戻す」を出す（3-9、F-032-06・10）
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Meal } from '@/api/client';
import { useDeleteQueue, useDeleteQueueState } from '@/features/delete/delete-context';
import { visibleMeal } from '@/features/delete/pending-view';
import { MethodSheet, type RecordMethod } from '@/features/record/method-sheet';
import { formatGrams, formatKcal, mealTime } from '@/lib/format';
import { formatRecordDate } from '@/lib/record-date';

import { MealNotFoundError, useMeal } from './use-meal';

type Item = Meal['items'][number];

type Props = {
  recordDate: string;
  mealId: string;
  /** 前の画面（ホーム）へ戻る。食事ごと消したときも呼ぶ */
  onClose: () => void;
  /** 「食品を追加」で入力方式を選んだとき（画面の移動はルーティング側、F-030-08） */
  onAddItem?: (method: RecordMethod) => void;
};

export function MealDetailScreen({ recordDate, mealId, onClose, onAddItem = () => {} }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const meal = useMeal(recordDate, mealId);
  const queue = useDeleteQueue();
  const { hidden } = useDeleteQueueState();
  const shown = meal.data ? visibleMeal(meal.data, hidden) : null;

  const removeItem = (item: Item) => {
    if (!queue || !shown) return;
    queue.remove({ kind: 'item', recordDate, mealId, itemId: item.item_id });
    // 最後の食品なら食事ごと消える（サーバーも食事ごと削除する、F-032-03・10）
    if (shown.items.length === 1) onClose();
  };

  const removeMeal = () => {
    if (!queue) return;
    queue.remove({ kind: 'meal', recordDate, mealId });
    onClose();
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="戻る" onPress={onClose} style={styles.back}>
          <Text style={styles.backText}>◀ 戻る</Text>
        </Pressable>
      </View>

      {meal.isPending ? (
        <ActivityIndicator style={styles.center} />
      ) : meal.isError ? (
        <View style={styles.center}>
          {meal.error instanceof MealNotFoundError ? (
            <Text style={styles.message}>この食事は見つかりません</Text>
          ) : (
            <>
              <Text style={styles.message}>読み込めませんでした</Text>
              <Pressable accessibilityRole="button" onPress={() => meal.refetch()} style={styles.retry}>
                <Text style={styles.retryText}>再読み込み</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : shown ? (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            <Text
              style={styles.eatenAt}
            >{`${formatRecordDate(shown.eaten_at.slice(0, 10))} ${mealTime(shown.eaten_at)}`}</Text>
            <View style={styles.totals}>
              <Text style={styles.kcal}>{formatKcal(shown.totals.energy_kcal)} kcal</Text>
              <Text style={styles.pfc}>
                {`P ${formatGrams(shown.totals.protein_g)}g  F ${formatGrams(shown.totals.fat_g)}g  C ${formatGrams(shown.totals.carbohydrate_g)}g`}
              </Text>
              {shown.totals_incomplete.length > 0 && <Text style={styles.incomplete}>一部不明</Text>}
            </View>
            {shown.items.map((item) => (
              <ItemRow key={item.item_id} item={item} onRemove={() => removeItem(item)} />
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" onPress={() => setSheetOpen(true)} style={styles.addItem}>
              <Text style={styles.addItemText}>＋ 食品を追加</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={removeMeal} style={styles.deleteMeal}>
              <Text style={styles.deleteMealText}>この食事を削除</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <MethodSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelect={(method) => {
          setSheetOpen(false);
          onAddItem(method);
        }}
      />
    </SafeAreaView>
  );
}

const SOURCE_LABELS: Record<Item['source']['method'], string> = {
  barcode: 'バーコード',
  label_ocr: '栄養成分表示',
  photo: '写真（目安）',
  manual: '手入力',
};

const FRACTIONS: [number, string][] = [
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [1 / 2, '1/2'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
];

/** 分量（全部のときは出さない、F-031-09） */
function portionLabel(portion: Item['portion']): string | null {
  if (portion.mode === 'pieces' && portion.pieces) return `${portion.pieces}個`;
  if (portion.mode === 'fraction' && portion.fraction) {
    const f = portion.fraction;
    return FRACTIONS.find(([v]) => Math.abs(v - f) < 0.005)?.[1] ?? `${Math.round(f * 100)}%`;
  }
  return null;
}

/** 不明（null）は「—」 */
const grams = (g: number | null) => (g === null ? '—' : `${formatGrams(g)}g`);

function ItemRow({ item, onRemove }: { item: Item; onRemove: () => void }) {
  const { nutrients: n } = item;
  const notes = [
    SOURCE_LABELS[item.source.method],
    item.reference.basis.label,
    portionLabel(item.portion),
    item.reference.net_content?.status === 'unknown' ? '内容量：不明' : null,
  ].filter((s): s is string => !!s);
  return (
    <View style={styles.item}>
      <View style={styles.itemMain}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemKcal}>{n.energy_kcal === null ? '— kcal' : `${formatKcal(n.energy_kcal)} kcal`}</Text>
        <Text
          style={styles.itemPfc}
        >{`P ${grams(n.protein_g)}  F ${grams(n.fat_g)}  C ${grams(n.carbohydrate_g)}`}</Text>
        <View style={styles.notes}>
          {notes.map((note) => (
            <Text key={note} style={styles.note}>
              {note}
            </Text>
          ))}
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}を削除`} onPress={onRemove} hitSlop={8}>
        <Text style={styles.remove}>削除</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  back: { padding: 12 },
  backText: { fontSize: 16, color: '#2563eb' },
  body: { paddingBottom: 24 },
  eatenAt: { fontSize: 16, paddingHorizontal: 16, color: '#333' },
  totals: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  kcal: { fontSize: 28, fontWeight: '700' },
  pfc: { fontSize: 16, marginTop: 4 },
  incomplete: { marginTop: 4, color: '#b45309' },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
  },
  itemMain: { flex: 1, gap: 2 },
  itemName: { fontSize: 16, fontWeight: '600' },
  itemKcal: { fontVariant: ['tabular-nums'] },
  itemPfc: { color: '#333', fontVariant: ['tabular-nums'] },
  notes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  note: {
    fontSize: 12,
    color: '#555',
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  remove: { color: '#dc2626', paddingVertical: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  message: { color: '#555' },
  retry: { marginTop: 12, padding: 12 },
  retryText: { color: '#2563eb' },
  footer: { padding: 16, gap: 12 },
  addItem: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addItemText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  deleteMeal: { borderColor: '#dc2626', borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  deleteMealText: { color: '#dc2626', fontSize: 16, fontWeight: '600' },
});
