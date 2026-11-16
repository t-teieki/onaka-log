// 削除の待ち合わせ（DeleteQueue）を画面に渡す。アプリ全体で1つ、バーも1本（F-032-08）
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useApi } from '@/api/api-context';

import { createDeleteSender } from './api-sender';
import { DeleteQueue, type DeleteQueueState } from './delete-queue';

const DeleteQueueContext = createContext<DeleteQueue | null>(null);

const EMPTY: DeleteQueueState = { pending: null, hidden: [], error: null };
const noop = () => () => {};

export function DeleteQueueProvider({ queue, children }: { queue: DeleteQueue; children: ReactNode }) {
  return <DeleteQueueContext.Provider value={queue}>{children}</DeleteQueueContext.Provider>;
}

/** 削除の待ち合わせ。Provider の外（テストなど）では null */
export function useDeleteQueue(): DeleteQueue | null {
  return useContext(DeleteQueueContext);
}

/** 今の状態（隠すもの・待っている削除・失敗の文言） */
export function useDeleteQueueState(): DeleteQueueState {
  const queue = useDeleteQueue();
  return useSyncExternalStore(queue?.subscribe ?? noop, queue?.getState ?? (() => EMPTY));
}

/** API につないだ待ち合わせを作り、バーを出す。アプリがバックグラウンドに移ったらすぐ送る（F-032-08） */
export function DeleteQueueRoot({ children }: { children: ReactNode }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [queue] = useState(() => new DeleteQueue(createDeleteSender(api, queryClient)));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') queue.flush();
    });
    return () => sub.remove();
  }, [queue]);

  return (
    <DeleteQueueProvider queue={queue}>
      <View style={styles.root}>
        {children}
        <UndoBar />
      </View>
    </DeleteQueueProvider>
  );
}

/** 「削除しました［元に戻す］」（画面設計 3-9）。送れなかったときはその文言 */
function UndoBar() {
  const queue = useDeleteQueue();
  const { pending, error } = useDeleteQueueState();
  // Provider の外（テスト）では null になるので 0 として扱う
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  if (!queue || (!pending && !error)) return null;
  return (
    <View style={[styles.bar, { bottom: bottomInset + 96 }]} accessibilityLiveRegion="polite">
      {pending ? (
        <>
          <Text style={styles.text}>削除しました</Text>
          <Pressable accessibilityRole="button" onPress={() => queue.undo()} hitSlop={12}>
            <Text style={styles.undo}>元に戻す</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.text}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#1f2937',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  text: { color: '#fff', flexShrink: 1 },
  undo: { color: '#93c5fd', fontWeight: '700' },
});
