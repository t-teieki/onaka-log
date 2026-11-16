// 撮影・選択した画像の下ごしらえ（F-012-16・F-013-16・22、ADR-0010）: 長辺 1024px の JPEG（品質 0.8）にして base64 で返す。
// 撮影・選択・縮小で端末のキャッシュにできた一時ファイルはすぐ消す（画像は端末にも残さない、ADR-0004）。
// アプリのキャッシュの外にあるファイル（利用者の写真そのもの）は消さない
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type PreparedImage = { media_type: 'image/jpeg'; data_base64: string };
export type Picture = { uri: string; width: number; height: number };

export const MAX_LONG_SIDE = 1024;
const JPEG_QUALITY = 0.8;

function remove(uri: string) {
  if (!uri.startsWith(Paths.cache.uri)) return;
  try {
    new File(uri).delete();
  } catch {
    // もう消えている・消せないときは続ける（キャッシュは OS が片付ける）
  }
}

export async function prepareImage(picture: Picture): Promise<PreparedImage> {
  try {
    const context = ImageManipulator.manipulate(picture.uri);
    if (Math.max(picture.width, picture.height) > MAX_LONG_SIDE) {
      context.resize(picture.width >= picture.height ? { width: MAX_LONG_SIDE } : { height: MAX_LONG_SIDE });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
    remove(saved.uri);
    if (!saved.base64) throw new Error('画像を base64 にできなかった');
    return { media_type: 'image/jpeg', data_base64: saved.base64 };
  } finally {
    remove(picture.uri);
  }
}
