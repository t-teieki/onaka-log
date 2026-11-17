# インフラ定義（AWS SAM）

決定: [ADR-0014](../docs/adr/0014-iac-aws-sam.md)。構成: [architecture.md](../docs/02_design/architecture.md)。

| ファイル | 中身 |
|---|---|
| `template.yaml` | DynamoDB（`onaka-log-<env>`）・Cognito（ユーザープール・ドメイン・アプリのクライアント）・API Gateway（HTTP API・JWT 認可・スロットリング）・Lambda（FastAPI＋Lambda Web Adapter、arm64）・ロググループ（14日） |
| `samconfig.toml` | 環境ごとの設定（`dev` / `prod`）。スタック名・SSM パラメーター名 |
| `build.sh` | Lambda に載せるコードを `infra/build/api` に作る（uv.lock どおり、Python 3.12・arm64 の wheel）。`infra/build/` は Git 管理外 |
| `run.sh` | Lambda の起動スクリプト（uvicorn） |
| `github-deploy.yaml` | GitHub Actions からデプロイするための IAM（GitHub の OIDC プロバイダー・デプロイ用ロール・CloudFormation の実行ロール、ADR-0019）。アプリのスタックとは別に、管理者が手元から作る |

- Lambda はエイリアス `live` を CodeDeploy で切り替える（`AutoPublishAlias`・`DeploymentPreference`、ADR-0019）。切り替え前に PreTraffic フック（`CodeDeployHook_onaka-log-pretraffic-<env>`）が新しいバージョンで1日分の取得を呼んで確かめ、切り替え中はアラーム（Lambda の Errors・API の 5xx）が鳴ったら戻す。切り替え方は `DeploymentType`（dev は `Canary10Percent5Minutes`）

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
- CI からのデプロイは `.github/workflows/deploy-dev.yml`（下の準備をしてから動く。CIC-05・CIC-09）

## CI からのデプロイの準備（ユーザーの作業、env ごとに1回、ADR-0019）

1. デプロイ用の IAM を作る（管理者の権限で、変更セットを見てから）:
   ```bash
   aws cloudformation deploy --profile onaka-admin --region ap-northeast-1 \
     --template-file infra/github-deploy.yaml --stack-name onaka-log-github-deploy-dev \
     --parameter-overrides Env=dev --capabilities CAPABILITY_NAMED_IAM --no-execute-changeset
   ```
   表示された変更セットを確かめてから `aws cloudformation execute-change-set` で適用する。GitHub の OIDC プロバイダーはアカウントに1つだけなので、prod では `CreateOidcProvider=false ExistingOidcProviderArn=<ARN>` を付ける
2. 出力の `DeployRoleArn` と `ExecutionRoleArn` を、GitHub のリポジトリ変数（Settings → Secrets and variables → Actions → Variables）に `AWS_DEPLOY_ROLE_ARN_DEV`・`AWS_CFN_EXEC_ROLE_ARN_DEV` として入れる（秘密ではない）
3. GitHub の Environment `dev` を作る（Settings → Environments）。デプロイ前に承認を挟みたければ Required reviewers に自分を入れる。Deployment branches は `main` だけにする
4. Actions の `deploy-dev` を手動で動かし（Run workflow）、成功することを確かめる

- 一度 `--role-arn` でデプロイすると、スタックは実行ロールを覚える。手元から `sam deploy` しても実行ロールの権限で作られるので、テンプレートに新しい種類のリソースを足すときは先に `github-deploy.yaml` の実行ロールに権限を足す
- 実行ロールは `onaka-log-<env>-*` の IAM ロールを作れる。`main` に push できる人は強い権限のロールを作れるので、共同開発・公開の前に permissions boundary を付ける（ADR-0019）

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
- コールドスタートは約6秒（import と SSM の読み取り）だったので、2026-11-16 に Anthropic SDK と SSM を推定の初回まで遅らせ、メモリを 1024MB にした（ADR-0007）。推定の初回だけ、その分（数秒）遅くなる
- API Gateway のアクセスログ（`/aws/apigateway/onaka-log-api-<Env>`、14日）: Lambda に届く前に断られた要求（認証・スロットリング）の理由が `authorizerError` に出る。トークンや本文は残さない
