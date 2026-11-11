# 開発環境

> ステータス: Draft
> 最終更新: 2026-11-11
> 関連: Q-18, Q-20, PRJ-10

## 決定事項

- リポジトリは C ドライブ上（`C:\project\onaka-log`、WSL からは `/mnt/c/project/onaka-log`）に置く。下の表の問題が実際に支障になったら、WSL 側（例: `~/projects/onaka-log`）へ移す（Q-20）
- 開発作業（エディタ・Node・Python・Git）は WSL（Ubuntu）から行う
- iOS の動作確認は iPhone 実機（Expo Go）、Android は Windows 上のエミュレータ
- 改行コードは LF に統一（`.gitattributes`）

## 想定される問題と対処（Q-20）

| 問題 | 原因 | 対処 |
|---|---|---|
| iPhone から開発サーバー（Metro）につながらない | WSL2 は既定で NAT 経由のため、LAN の端末から WSL 内のサーバーが見えない | ① Windows 11 の WSL ミラーモードネットワーク（`.wslconfig` に `networkingMode=mirrored`）を使う ② `npx expo start --tunnel` を使う |
| `npm install` やビルドが遅い | WSL から Windows 側のファイルシステム（`/mnt/c`）へのアクセスは遅い | `node_modules` が大きくなって支障が出たら、リポジトリを WSL 側（`~/`）へ移すことを検討する |
| ファイルを保存しても自動リロードされない | Windows 側のアプリから編集した変更は、WSL のファイル監視に届かないことがある | 編集は WSL 側（VS Code の WSL 接続など）から行う。それでも駄目なら監視をポーリングに切り替える |
| WSL から Android エミュレータに接続しにくい | エミュレータは Windows 側で動き、`adb` の接続先が分かれる | Windows 側の `adb` を使う、またはミラーモードで接続する（M4 で確認） |
| Docker（DynamoDB Local・SAM local）が遅い | C ドライブ上のファイルをコンテナにマウントすると遅い | 支障が出たら WSL 側へ移す |
| ファイルの実行権限・改行の差異 | Windows と Linux の違い | `.gitattributes` で LF 固定。Windows 側の Git では `core.autocrlf=false` を推奨 |

## 未決

- Node.js・Python のバージョン管理ツール（例: Node は mise / nvm、Python は uv）
- エディタ設定（推奨拡張機能、format on save）
