# ADR-0019: バックエンドの CD は GitHub Actions（OIDC）＋ SAM ＋ CodeDeploy

- ステータス: Accepted
- 日付: 2026-11-17
- 関連: CIC-05, CIC-09, INF-04, ADR-0007, ADR-0014, [ci-cd.md](../04_operations/ci-cd.md), [architecture.md](../02_design/architecture.md)

## 背景

dev へのデプロイは手元（WSL）から `sam deploy` を管理者の権限（`onaka-admin`）で行い、変更セットを見て了承してから適用していた。ADR-0014 で CI からのデプロイは GitHub の OIDC と決めていたが、作っていなかった。あわせて、AWS の CI/CD（特に CodeDeploy による段階的な切り替えと自動ロールバック）を学びたい。

## 選択肢

| 選択肢 | 長所 | 短所 |
|---|---|---|
| A. GitHub Actions（OIDC）＋ SAM ＋ CodeDeploy | 今の CI に足すだけ。SAM の `DeploymentPreference` で CodeDeploy のアプリ・デプロイグループ・ロールを作ってくれる。実務で多い形 | パイプライン自体は AWS のサービスではない |
| B. CodePipeline ＋ CodeBuild ＋ CodeDeploy | AWS の CI/CD サービスを一通り学べる | 新しく作る量が多い。CodePipeline・CodeBuild の費用。今の GitHub Actions の検査と二重になる |
| C. 手元からのデプロイのまま | 何も足さない | 学べない。手順の抜けが起きうる |

## 決定

A。B は A に慣れてから、比べるために試すかを決める。

1. **GitHub Actions の `deploy-dev`**（`.github/workflows/deploy-dev.yml`）: `main` に入ったバックエンドの変更で、テスト → `infra/build.sh` → `sam deploy --config-env dev --no-confirm-changeset --role-arn <実行ロール>`。手動でも動かせる
2. **AWS へは OIDC**（長期のキーを使わない）。IAM は `infra/github-deploy.yaml` で、アプリのスタックとは別に管理者が手元から 1 回作る
   - デプロイ用ロール `onaka-log-github-deploy-<env>`: GitHub の Environment `<env>` のジョブからだけ引き受けられる（`sub = repo:t-teieki/onaka-log:environment:<env>`）。できるのは S3 に成果物を置くこと、`onaka-log-<env>` のスタックを変更セットで更新すること、実行ロールを CloudFormation に渡すことだけ
   - CloudFormation の実行ロール `onaka-log-cfn-exec-<env>`: リソースを実際に作るロール。`onaka-log` の名前が付いたリソースに絞る
3. **Lambda の切り替えは CodeDeploy**: `ApiFunction` に `AutoPublishAlias: live` と `DeploymentPreference` を付け、API Gateway はエイリアス `live` を呼ぶ
   - **PreTraffic フック**（`CodeDeployHook_onaka-log-pretraffic-<env>`）: 切り替える前に新しいバージョンを直接呼び、確かめる用の利用者 ID で `GET /v1/days/{今日}` が 200 になることを確かめる。失敗なら切り替えない
   - **アラーム**: Lambda（エイリアス `live`）の Errors と、API の 5xx。切り替え中に鳴ったら前のバージョンに戻す
   - **切り替え方**はパラメーター `DeploymentType`。dev は学習のため `Canary10Percent5Minutes`、既定（prod）は `AllAtOnce`（prod を作るときに見直す）
4. 手元の運用（変更セットを見て了承してから適用）は、CI では「変更セットをログに残してから適用」に置き換える。承認を挟みたくなったら GitHub の Environment `dev` に承認者を付ける。prod は承認者を付ける前提

## 理由と影響

- 自分専用で要求がほとんどないので、Canary の 10% の間に要求が来ず、アラームが鳴らないことが多い。**主な確認は PreTraffic フックが担う**（起動・import・ルーティング・利用者 ID の取り出し・DynamoDB の読み取りまで）。書き込みと Claude は呼ばない（費用と、確かめる用のデータを残さないため）
- API の契約は変えない（ヘルスチェックの API は足さず、既存の取得 API を使う）
- 切り替え中は新旧のバージョンが同時に動く。DynamoDB の項目の形を変えるときは、古いバージョンが読めるように後方互換にする
- Canary の dev は、デプロイに 5 分余分にかかる（CloudFormation が切り替えの終わりを待つ）
- 費用: CodeDeploy（Lambda）は無料。アラーム 2 つで月 $0.20 ほど。フックの Lambda はほぼ 0 円。月 1000 円（NFR-001）に収まる
- 一度 `--role-arn` でデプロイすると、スタックは実行ロールを覚え、手元から `--role-arn` なしでデプロイしても実行ロールが使われる。テンプレートに新しい種類のリソースを足すときは、先に `infra/github-deploy.yaml` の実行ロールに権限を足す
- 残るリスク: 実行ロールは `onaka-log-<env>-*` の IAM ロールを作り、任意のポリシーを付けられる。`main` に push できる人は、テンプレート経由で強い権限のロールを作れる。自分専用の間は受け入れ、公開・共同開発の前に permissions boundary で上限を付ける
- 見直す条件: prod を作るとき（承認者・`DeploymentType`）、CodePipeline と比べたくなったとき、共同開発者が増えるとき
