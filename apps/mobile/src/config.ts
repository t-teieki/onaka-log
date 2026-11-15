// 接続先（.env の EXPO_PUBLIC_API_BASE_URL）。秘密は置かない（アプリに埋め込まれて読める）
// 既定は Android エミュレーターから見た Windows の localhost で動かすローカルのバックエンド（uvicorn :8000）
const DEFAULT_API_BASE_URL = 'http://10.0.2.2:8000';

/** API のベース URL（パスの /v1 は含めない。openapi.yaml のパスが /v1 から始まるため） */
export function apiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
}
