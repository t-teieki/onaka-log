// 確認・修正の入力モード（手入力、画面設計 3-5、F-014）: 食品名・kcal・P・F・C を入れて保存する
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatEatenAt, toEatenAt } from '@/lib/eaten-at';
import { uuidv7 } from '@/lib/uuid7';

import { manualItem, NAME_MAX_LENGTH, validateManualForm, type ManualForm } from './manual-input';
import { useCreateMeal } from './use-create-meal';

type Props = {
  /** 今の時刻（テストで固定する）。食べた日時の既定値になる */
  now?: () => Date;
  /** ID を作る（テストで固定する）。食事と食品の ID はこの画面を開いたときに決め、再送でも変えない */
  newId?: () => string;
  /** 保存できたとき（食事の記録日を渡す） */
  onSaved: (recordDate: string) => void;
  onClose: () => void;
};

const NUTRIENT_FIELDS = [
  { key: 'energy_kcal', label: 'kcal' },
  { key: 'protein_g', label: 'たんぱく質（g）' },
  { key: 'fat_g', label: '脂質（g）' },
  { key: 'carbohydrate_g', label: '炭水化物（g）' },
] as const;

const EMPTY: ManualForm = { name: '', energy_kcal: '', protein_g: '', fat_g: '', carbohydrate_g: '' };

export function ManualEntryScreen({ now = () => new Date(), newId = () => uuidv7(), onSaved, onClose }: Props) {
  const [ids] = useState(() => ({ meal: newId(), item: newId() }));
  // 食べた日時の既定は記録した時刻（Q-33）。変更する操作は次の段階で足す
  const [eatenAt] = useState(() => toEatenAt(now()));
  const [form, setForm] = useState<ManualForm>(EMPTY);
  const createMeal = useCreateMeal();

  const result = validateManualForm(form);
  const errors = result.ok ? {} : result.errors;
  const saving = createMeal.isPending;

  const save = () => {
    if (!result.ok || saving) return;
    createMeal.mutate(
      { meal_id: ids.meal, eaten_at: eatenAt, items: [manualItem(ids.item, result.value)] },
      { onSuccess: (recordDate) => onSaved(recordDate) },
    );
  };

  const set = (key: keyof ManualForm) => (text: string) => setForm((f) => ({ ...f, [key]: text }));

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={onClose} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <Text style={styles.headerTitle}>手入力</Text>
        <View style={styles.close} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.row}>
            <Text style={styles.rowLabel}>食べた日時</Text>
            <Text style={styles.rowValue}>{formatEatenAt(eatenAt)}</Text>
          </View>

          <Field label="食品名" error={errors.name}>
            <TextInput
              accessibilityLabel="食品名"
              value={form.name}
              onChangeText={set('name')}
              maxLength={NAME_MAX_LENGTH}
              placeholder="例: おにぎり（鮭）"
              style={styles.input}
            />
          </Field>

          {NUTRIENT_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label} error={errors[key]}>
              <TextInput
                accessibilityLabel={label}
                value={form[key]}
                onChangeText={set(key)}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </Field>
          ))}

          <Text style={styles.note}>5項目すべて入れると保存できます。数値は小数第1位まで。</Text>
          {createMeal.isError && <Text style={styles.error}>保存できませんでした。もう一度お試しください</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            testID="save-button"
            accessibilityRole="button"
            accessibilityLabel="保存する"
            disabled={!result.ok || saving}
            onPress={save}
            style={[styles.saveButton, (!result.ok || saving) && styles.saveDisabled]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>保存する</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  close: { width: 48, padding: 12 },
  closeText: { fontSize: 22 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  body: { padding: 16, gap: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  rowLabel: { color: '#555' },
  rowValue: { fontVariant: ['tabular-nums'] },
  field: { gap: 6 },
  fieldLabel: { fontSize: 14, color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  note: { color: '#64748b', fontSize: 13 },
  error: { color: '#dc2626', fontSize: 13 },
  footer: { padding: 16 },
  saveButton: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  saveDisabled: { backgroundColor: '#93c5fd' },
  saveText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
