// 食事・食品の ID はアプリで UUIDv7 を作る（ADR-0013）。形は contracts/domain/meal.schema.json の $defs/uuid
import { uuidv7 } from '@/lib/uuid7';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7（ADR-0013）', () => {
  it('契約の uuid の形（版 7・variant 10）になる', () => {
    const id = uuidv7(new Date('2026-11-15T12:00:00Z'), () => new Uint8Array(10).fill(0xff));
    expect(id).toMatch(UUID_PATTERN);
  });

  it('先頭 48 ビットはミリ秒の時刻（時刻順に並ぶ）', () => {
    const at = new Date('2026-11-15T12:00:00.123Z');
    const id = uuidv7(at, () => new Uint8Array(10));
    const ms = parseInt(id.replace(/-/g, '').slice(0, 12), 16);
    expect(ms).toBe(at.getTime());
    const later = uuidv7(new Date(at.getTime() + 1), () => new Uint8Array(10).fill(0xff));
    expect(later > id).toBe(true);
  });

  it('乱数が違えば別の ID になる', () => {
    const at = new Date('2026-11-15T12:00:00Z');
    expect(uuidv7(at, () => new Uint8Array(10).fill(1))).not.toBe(uuidv7(at, () => new Uint8Array(10).fill(2)));
  });

  it('引数なしでも作れる（端末の時計と乱数）', () => {
    expect(uuidv7()).toMatch(UUID_PATTERN);
  });
});
