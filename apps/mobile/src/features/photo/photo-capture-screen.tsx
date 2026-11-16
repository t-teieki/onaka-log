// 料理の撮影と推定（画面設計 3-4、F-013-15〜20）。撮影の画面は栄養成分表示と共通
import { EstimateCaptureScreen, type CaptureProps } from '@/features/capture/estimate-capture-screen';

export type { FoodItemDraft } from '@/features/capture/estimate-capture-screen';

export function PhotoCaptureScreen(props: CaptureProps) {
  return <EstimateCaptureScreen kind="photo" {...props} />;
}
