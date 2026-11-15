// 食事・食品の ID（ADR-0013: アプリで UUIDv7 を作る。再送しても同じ ID になり、二重保存を防げる）
import { getRandomBytes } from 'expo-crypto';

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** RFC 9562 の UUIDv7: 先頭 48 ビットがミリ秒の時刻、残りが乱数（版 7・variant 10） */
export function uuidv7(now: Date = new Date(), random: (n: number) => Uint8Array = getRandomBytes): string {
  const bytes = new Uint8Array(16);
  let ms = now.getTime();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes.set(random(10).subarray(0, 10), 6);
  bytes[6] = 0x70 | (bytes[6] & 0x0f);
  bytes[8] = 0x80 | (bytes[8] & 0x3f);
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
