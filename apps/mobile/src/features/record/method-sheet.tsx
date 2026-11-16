// 入力方式の選択（画面設計 3-2、F-010）: 画面の下から出るシート
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type RecordMethod = 'barcode' | 'label' | 'photo' | 'manual';

const METHODS: { method: RecordMethod; label: string; ready: boolean }[] = [
  { method: 'barcode', label: 'バーコード', ready: true },
  { method: 'label', label: '栄養成分表示', ready: true },
  { method: 'photo', label: '写真', ready: false },
  { method: 'manual', label: '手入力', ready: true },
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
        {METHODS.map(({ method, label, ready }) => (
          <Pressable
            key={method}
            accessibilityRole="button"
            disabled={!ready}
            onPress={() => onSelect(method)}
            style={[styles.option, !ready && styles.optionDisabled]}
          >
            <Text style={[styles.optionText, !ready && styles.disabledText]}>{label}</Text>
            {/* まだ作っていない方式（IMP-08） */}
            {!ready && <Text style={styles.badge}>準備中</Text>}
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
  optionDisabled: { backgroundColor: '#f8fafc' },
  optionText: { fontSize: 16 },
  disabledText: { color: '#94a3b8' },
  badge: { fontSize: 12, color: '#94a3b8' },
  close: { paddingVertical: 14, alignItems: 'center' },
  closeText: { fontSize: 16, color: '#2563eb' },
});
