# apps/api（バックエンド）向けルール

親の [CLAUDE.md](../../CLAUDE.md) に加えて守ること。詳細は [README.md](README.md)。

- 構成: FastAPI を Lambda で動かす。コードは `src/onaka_api/`。`domain/` は純粋な計算とルールだけ（boto3・FastAPI を import しない）。mypy は `domain` が strict。
- 先にテスト: `tests/unit/`（単体）・`tests/api/`（契約どおりか）に spec マーカー（`@pytest.mark.spec("DM-03")`）を付けて赤を確認してから実装する。**既存のテストと `contracts/` は実装中に変えない**（hook が確認を出す）。
- 契約が正: API の形は `contracts/api/openapi.yaml`、食事の形は `contracts/domain/meal.schema.json`。Pydantic モデルは手書きし、契約テストで守る。
- Claude API の入出力は `contracts/llm/<usecase>/` のスキーマで検証する。画像は保存せず、ログにも残さない（ADR-0004）。
- 実行は WSL の uv（ルートの CLAUDE.md のコマンド）。Ruff・mypy・pytest が通ってから完了とする。
- 実 API（`-m live`）は費用がかかるので、ユーザーの了承を得てから動かす。
