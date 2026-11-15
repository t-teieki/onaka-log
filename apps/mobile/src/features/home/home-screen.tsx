// ホーム（画面設計 3-1、F-031）: 1日の合計・食事一覧・日付の移動・「記録する」
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DaySummary, Meal } from '@/api/client';
import { formatGrams, formatKcal, mealTime, mealTitle } from '@/lib/format';
import { addDays, canGoNext, formatRecordDate, recordDateOf } from '@/lib/record-date';

import { MethodSheet, type RecordMethod } from '@/features/record/method-sheet';

import { useDay } from './use-day';

type Props = {
  /** 今の時刻（テストで固定する） */
  now?: () => Date;
  /** 入力方式を選んだとき（画面の移動はルーティング側で行う） */
  /** 入力方式を選んだとき（表示している記録日を渡す。食べた日時の既定に使う） */
  onSelectMethod?: (method: RecordMethod, recordDate: string) => void;
};

export function HomeScreen({ now = () => new Date(), onSelectMethod = () => {} }: Props) {
  const [today] = useState(() => recordDateOf(now()));
  const [recordDate, setRecordDate] = useState(today);
  const day = useDay(recordDate);
  const nextEnabled = canGoNext(recordDate, today);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前日"
          onPress={() => setRecordDate(addDays(recordDate, -1))}
          style={styles.navButton}
        >
          <Text style={styles.navText}>◀</Text>
        </Pressable>
        <Text style={styles.date}>{formatRecordDate(recordDate)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="翌日"
          disabled={!nextEnabled}
          accessibilityState={{ disabled: !nextEnabled }}
          onPress={() => setRecordDate(addDays(recordDate, 1))}
          style={styles.navButton}
        >
          <Text style={[styles.navText, !nextEnabled && styles.disabled]}>▶</Text>
        </Pressable>
      </View>

      {day.isPending ? (
        <ActivityIndicator style={styles.center} />
      ) : day.isError ? (
        <View style={styles.center}>
          <Text style={styles.message}>読み込めませんでした</Text>
          <Pressable accessibilityRole="button" onPress={() => day.refetch()} style={styles.retry}>
            <Text style={styles.retryText}>再読み込み</Text>
          </Pressable>
        </View>
      ) : (
        <DayBody day={day.data} />
      )}

      <View style={styles.footer}>
        <Pressable accessibilityRole="button" onPress={() => setSheetOpen(true)} style={styles.recordButton}>
          <Text style={styles.recordText}>＋ 記録する</Text>
        </Pressable>
      </View>

      <MethodSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelect={(method) => {
          setSheetOpen(false);
          onSelectMethod(method, recordDate);
        }}
      />
    </SafeAreaView>
  );
}

function DayBody({ day }: { day: DaySummary }) {
  const { totals } = day;
  return (
    <>
      <View style={styles.totals}>
        <Text style={styles.kcal}>{formatKcal(totals.energy_kcal)} kcal</Text>
        <Text style={styles.pfc}>
          {`P ${formatGrams(totals.protein_g)}g  F ${formatGrams(totals.fat_g)}g  C ${formatGrams(totals.carbohydrate_g)}g`}
        </Text>
        {day.totals_incomplete.length > 0 && <Text style={styles.incomplete}>一部不明</Text>}
      </View>
      <FlatList
        data={day.meals}
        keyExtractor={(m) => m.meal_id}
        renderItem={({ item }) => <MealRow meal={item} />}
        ListEmptyComponent={<Text style={[styles.message, styles.empty]}>まだ記録がありません</Text>}
      />
    </>
  );
}

function MealRow({ meal }: { meal: Meal }) {
  return (
    <View testID="meal-row" style={styles.row}>
      <Text style={styles.time}>{mealTime(meal.eaten_at)}</Text>
      <Text style={styles.title} numberOfLines={1}>
        {mealTitle(meal.items.map((i) => i.name))}
      </Text>
      <Text style={styles.rowKcal}>{formatKcal(meal.totals.energy_kcal)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  navButton: { padding: 12 },
  navText: { fontSize: 18 },
  disabled: { color: '#c0c0c0' },
  date: { fontSize: 18, fontWeight: '600' },
  totals: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  kcal: { fontSize: 32, fontWeight: '700' },
  pfc: { fontSize: 16, marginTop: 4 },
  incomplete: { marginTop: 4, color: '#b45309' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  time: { width: 48, fontVariant: ['tabular-nums'] },
  title: { flex: 1 },
  rowKcal: { fontVariant: ['tabular-nums'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  message: { color: '#555' },
  empty: { textAlign: 'center', marginTop: 32 },
  retry: { marginTop: 12, padding: 12 },
  retryText: { color: '#2563eb' },
  footer: { padding: 16 },
  recordButton: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  recordText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
