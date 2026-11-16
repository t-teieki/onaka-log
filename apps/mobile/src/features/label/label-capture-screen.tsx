// 栄養成分表示の撮影と読み取り（画面設計 3-4、F-012-15〜20）。撮影の画面は写真の推定と共通
import { EstimateCaptureScreen, type CaptureProps } from '@/features/capture/estimate-capture-screen';

export type { FoodItemDraft } from '@/features/capture/estimate-capture-screen';

export function LabelCaptureScreen(props: CaptureProps) {
  return <EstimateCaptureScreen kind="label" {...props} />;
}
