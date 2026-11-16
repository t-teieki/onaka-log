// 入力方式の選択（画面設計 3-2、F-010）: 画面の下から出るシート
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type RecordMethod = 'barcode' | 'label' | 'photo' | 'manual';

const METHODS: { method: RecordMethod; label: string }[] = [
  { method: 'barcode', label: 'バーコード' },
  { method: 'label', label: '栄養成分表示' },
  { method: 'photo', label: '写真' },
  { method: 'manual', label: '手入力' },
];

type Props = {
  visible: boolean;
  onSelect: (method: RecordMethod) => void;
  onClose: () => void;
};

export function MethodSheet({ visible, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false} />
      <View style={styles.sheet}>
        <Text style={styles.title}>入力方法を選ぶ</Text>
        {METHODS.map(({ method, label }) => (
          <Pressable key={method} accessibilityRole="button" onPress={() => onSelect(method)} style={styles.option}>
            <Text style={styles.optionText}>{label}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
          <Text style={styles.closeText}>閉じる</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  optionText: { fontSize: 16 },
  close: { paddingVertical: 14, alignItems: 'center' },
  closeText: { fontSize: 16, color: '#2563eb' },
});
