// 食べた日時の行と変更（画面設計 3-5、Q-33・Q-44）。OS 標準のピッカーを日本時間に固定して使い、未来は選べない
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { clampToNow, formatEatenAt, toEatenAt } from '@/lib/eaten-at';

const TIME_ZONE = 'Asia/Tokyo';

type Props = {
  /** 食べた日時（eaten_at の形） */
  value: string;
  onChange: (eatenAt: string) => void;
  /** 今の時刻（上限。テストで固定する） */
  now: () => Date;
};

/** iOS は日時のホイール＋「完了」、Android は日付 → 時刻のダイアログ */
type Step = { kind: 'ios'; draft: Date } | { kind: 'date' } | { kind: 'time'; draft: Date };

export function EatenAtField({ value, onChange, now }: Props) {
  const [step, setStep] = useState<Step | null>(null);
  const current = new Date(value);
  const label = formatEatenAt(value);

  const apply = (at: Date) => {
    setStep(null);
    onChange(toEatenAt(clampToNow(at, now())));
  };

  const open = () => setStep(Platform.OS === 'ios' ? { kind: 'ios', draft: current } : { kind: 'date' });

  // Android のダイアログは onChange のたびに閉じる。閉じた（dismissed）ら何も変えない
  const onAndroidDate = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === 'set' && date) setStep({ kind: 'time', draft: date });
    else setStep(null);
  };
  const onAndroidTime = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === 'set' && date) apply(date);
    else setStep(null);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`食べた日時 ${label}`}
        accessibilityHint="タップで日時を変更します"
        onPress={open}
        style={styles.row}
      >
        <Text style={styles.rowLabel}>食べた日時</Text>
        <View style={styles.valueBox}>
          <Text style={styles.rowValue}>{label}</Text>
          <Text style={styles.edit}>✎</Text>
        </View>
      </Pressable>

      {step?.kind === 'date' && (
        <DateTimePicker
          mode="date"
          value={current}
          maximumDate={now()}
          timeZoneName={TIME_ZONE}
          onChange={onAndroidDate}
        />
      )}
      {step?.kind === 'time' && (
        <DateTimePicker
          mode="time"
          is24Hour
          value={step.draft}
          maximumDate={now()}
          timeZoneName={TIME_ZONE}
          onChange={onAndroidTime}
        />
      )}
      {step?.kind === 'ios' && (
        <Modal transparent animationType="slide" onRequestClose={() => setStep(null)}>
          <View style={styles.backdrop}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Pressable accessibilityRole="button" accessibilityLabel="キャンセル" onPress={() => setStep(null)}>
                  <Text style={styles.cancel}>キャンセル</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="完了" onPress={() => apply(step.draft)}>
                  <Text style={styles.done}>完了</Text>
                </Pressable>
              </View>
              <DateTimePicker
                mode="datetime"
                display="spinner"
                locale="ja-JP"
                value={step.draft}
                maximumDate={now()}
                timeZoneName={TIME_ZONE}
                onChange={(_event, date) => date && setStep({ kind: 'ios', draft: date })}
              />
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  rowLabel: { color: '#555' },
  valueBox: { flexDirection: 'row', gap: 6 },
  rowValue: { fontVariant: ['tabular-nums'], color: '#2563eb' },
  edit: { color: '#2563eb' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', paddingBottom: 32, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  cancel: { fontSize: 16, color: '#555' },
  done: { fontSize: 16, fontWeight: '600', color: '#2563eb' },
});
