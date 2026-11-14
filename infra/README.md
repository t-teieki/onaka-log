# インフラ定義（AWS SAM）

決定: [ADR-0014](../docs/adr/0014-iac-aws-sam.md)。構成: [architecture.md](../docs/02_design/architecture.md)。

| ファイル | 中身 |
|---|---|
| `template.yaml` | DynamoDB（`onaka-log-<env>`）・Cognito（ユーザープール・ドメイン・アプリのクライアント）・API Gateway（HTTP API・JWT 認可・スロットリング）・Lambda（FastAPI＋Lambda Web Adapter、arm64）・ロググループ（14日） |
| `samconfig.toml` | 環境ごとの設定（`dev` / `prod`）。スタック名・SSM パラメーター名 |
| `build.sh` | Lambda に載せるコードを `infra/build/api` に作る（uv.lock どおり、Python 3.12・arm64 の wheel）。`infra/build/` は Git 管理外 |
| `run.sh` | Lambda の起動スクリプト（uvicorn） |

- 予算アラート（AWS Budgets）はテンプレートに入れず、コンソールで作った（INF-10）
- Claude API キーはテンプレートに書かず、SSM Parameter Store に手で入れる（`/onaka-log/<env>/claude-api-key`、SecureString）。Lambda には `ssm:GetParameter` だけを与える
- Cognito は今は Google・Apple の連携なし（管理者が作ったユーザーだけがサインインできる）。dev だけ、CLI でトークンを取れるようにパスワード認証（`USER_PASSWORD_AUTH`）を許している
- prod はテーブルとユーザープールに削除保護・`Retain`、テーブルにポイントインタイムリカバリを付ける。dev は付けない（作り直しやすくする）

## 使い方（WSL、ルートで）

道具: AWS CLI v2・SAM CLI・cfn-lint（WSL のホームに sudo なしで入れた。[dev-environment.md](../docs/00_project/dev-environment.md)）

```bash
export SAM_CLI_TELEMETRY=0
# 検査（CI の infra ワークフローと同じ）
(cd infra && sam validate --lint && cfn-lint template.yaml)
# コードを作る
UV=~/.local/bin/uv UV_LINK_MODE=copy bash infra/build.sh
# デプロイ（変更セットを見せて確認してから適用する）
aws sso login --profile onaka-admin
(cd infra && sam deploy --config-env dev --profile onaka-admin)
```

- 初回のデプロイの前に、SSM に Claude API キーを入れておく（入れないと推定の API が失敗する。その他の API は動く）
- 手元（x86_64）で起動を試すときは `LAMBDA_PLATFORM=x86_64-manylinux2014 bash infra/build.sh` で作り、`infra/build/api` で `python -m uvicorn onaka_api.main:app` を動かす
- CI からのデプロイ（GitHub OIDC）はまだない（CIC-05・CIC-09）
