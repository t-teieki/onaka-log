# ドキュメント索引

## 読む順番

1. [00_project/roadmap.md](00_project/roadmap.md) — 現在地と全体チェックリスト
2. [00_project/open-questions.md](00_project/open-questions.md) — 未決事項
3. [00_project/progress-log.md](00_project/progress-log.md) — 経緯・引継ぎ
4. [01_requirements/](01_requirements/) — 要件（What）
5. [02_design/](02_design/) — 設計（How）
6. [adr/](adr/) — 決定とその理由

## ディレクトリ

| パス | 内容 |
|---|---|
| `00_project/` | プロジェクト管理・外部記憶（roadmap / progress-log / open-questions / folder-structure / glossary） |
| `01_requirements/` | vision, scope, features/（F-xxx、索引は features/README.md）, non-functional（NFR-xxx） |
| `02_design/` | architecture, domain-model, data-model, auth, infra, api, error-handling, llm/, screens/ |
| `03_testing/` | テスト戦略・トレーサビリティ・eval 方針 |
| `04_operations/` | CI/CD・リリース・監視 |
| `adr/` | Architecture Decision Records |
| `templates/` | 各種テンプレート |

## 記法

- Markdown + Mermaid。1ファイル1トピック。
- 各ドキュメントの冒頭に `ステータス`（Draft / Proposed / Accepted / Deprecated）と `最終更新` を書く。
- ID: `F-xxx`（機能）, `NFR-xxx`（非機能）, `ADR-xxxx`, `Q-xx`（未決事項）, roadmap 項目（`PRJ-01` 等）。
- 仕様の各要件には ID を振り、テストから参照できるようにする（例: `F-001-03`）。
