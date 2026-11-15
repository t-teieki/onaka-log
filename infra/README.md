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
- Cognito は Google と連携する（2026-11-16、F-001-06）。Apple は Apple Developer Program に登録してから。dev だけ、テスト用ユーザーを CLI で使うため、メール＋パスワード（`COGNITO`・`USER_PASSWORD_AUTH`）も残している
- Google の OAuth クライアントのシークレットは Secrets Manager（`onaka-log/<env>/google-client-secret`、値は文字列のまま）に手で入れ、テンプレートは `{{resolve:secretsmanager:…}}` で参照する（Q-45。SSM の SecureString は Cognito の IdP から参照できない）。クライアント ID は秘密ではないので `samconfig.toml` に書く
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

## Google でサインインの準備（ユーザーの作業、env ごとに1回）

1. Google Cloud コンソールでプロジェクトを作り、「Google Auth Platform」（OAuth 同意画面）を設定する。対象は「外部」、公開状態は「テスト」のままにし、テストユーザーに自分の Gmail を足す（テスト中はテストユーザーだけがサインインできる）
2. 「クライアント」で OAuth クライアント ID を作る。種類は **ウェブ アプリケーション**、承認済みのリダイレクト URI は `<CognitoDomain>/oauth2/idpresponse`（`CognitoDomain` はスタックの出力。dev は `https://onaka-log-dev-<アカウント ID>.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse`）。承認済みの JavaScript 生成元は `<CognitoDomain>`
3. クライアント ID を `samconfig.toml` の `GoogleClientId=` に書く（秘密ではない）
4. クライアントのシークレットを Secrets Manager に入れる（AWS コンソールの Secrets Manager →「その他のシークレットのタイプ」→「プレーンテキスト」にシークレットだけを貼る。名前は `onaka-log/dev/google-client-secret`、リージョンは東京）。月 $0.40 かかる
5. デプロイする（上の手順。変更セットを見てから）
6. アプリの `apps/mobile/.env.local` に `EXPO_PUBLIC_COGNITO_DOMAIN=<CognitoDomain>`・`EXPO_PUBLIC_COGNITO_CLIENT_ID=<AppClientId>`・`EXPO_PUBLIC_API_BASE_URL=<ApiUrl から /v1 を除いたもの>` を書き、`npx expo start -c` で起動し直す

- Expo Go の戻り先 `exp://<PC の LAN の IP>:8081/--/auth/callback` を dev の `CallbackUrls` に入れている（Q-45）。PC の IP が変わったら `samconfig.toml` を書き換えてデプロイし直す。Cognito が「redirect_mismatch」を出したらこれを疑う

## dev の状態（2026-11-15 に初回デプロイ）

- スタック `onaka-log-dev`（と SAM が作った `aws-sam-cli-managed-default` の S3 バケット）。API の URL・ユーザープール ID・クライアント ID は次で見る:
  `aws cloudformation describe-stacks --profile onaka-admin --stack-name onaka-log-dev --query "Stacks[0].Outputs"`
- 確かめたこと: 認証なし・不正なトークンは API Gateway が 401 を返す。Lambda を直接呼ぶと（JWT の claims を入れたイベント）、SSM のキーの読み取り・DynamoDB の読み取りまで通る。テスト用ユーザー（`smoke-test@example.com`、メールは送らない）のアクセストークンで、1日分の取得 → 食事の保存（201、合計 702 kcal）→ 取得 → 削除（204）→ 取得（空）まで通った。推定（OCR・写真）と照合は実 API のスモーク（`apps/api/tests/live`、TST-05）で確認した
- テスト用ユーザーのアクセストークンの取り直し（60分で切れる。パスワードは画面・履歴に残さない）:
  `read -rsp "Password: " PW; echo; (umask 077; aws cognito-idp initiate-auth --profile onaka-admin --client-id <AppClientId> --auth-flow USER_PASSWORD_AUTH --auth-parameters "USERNAME=smoke-test@example.com,PASSWORD=$PW" --query AuthenticationResult.AccessToken --output text > ~/.onaka-dev-token); unset PW`
- コールドスタートは約6秒（import と SSM の読み取り）。気になったら、メモリを増やす・import を遅らせるなどを検討する
