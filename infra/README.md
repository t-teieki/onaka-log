# インフラ定義（AWS SAM）

- `template.yaml`: Lambda・API Gateway HTTP API・DynamoDB・Cognito・IAM ロール・ロググループ・予算アラート（未作成）
- `samconfig.toml`: 環境ごとの設定（dev / prod）（未作成）

決定: [ADR-0014](../docs/adr/0014-iac-aws-sam.md)。構成: [architecture.md](../docs/02_design/architecture.md)。Claude API キーはテンプレートに書かず、SSM Parameter Store に手で入れる。
