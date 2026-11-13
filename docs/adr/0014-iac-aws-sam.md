# ADR-0014: IaC は AWS SAM、環境は local / dev / prod

- ステータス: Accepted
- 日付: 2026-11-14
- 関連: Q-34, INF-02, INF-03, INF-04, ADR-0007, [比較資料](../02_design/discussions/iac-comparison.md), [architecture.md](../02_design/architecture.md)

## 背景

ADR-0007 で、AWS のリソースは手作業ではなく IaC で管理すると決めた。管理するのは Lambda 1つ・HTTP API・DynamoDB・Cognito（Apple・Google）・IAM・SSM パラメーター・ロググループ・予算アラートで、ほぼサーバーレスのリソース。

## 選択肢

| 選択肢 | 長所 | 短所 |
|---|---|---|
| AWS SAM | サーバーレス向けで短く書ける。`sam local` でローカル実行。state 管理不要。Python だけで済む | YAML が長くなりやすい（Cognito まわり） |
| AWS CDK（Python） | コードで書ける。Cognito などの L2 が便利 | CLI に Node.js が要る。bootstrap が要る |
| Terraform | AWS 以外も管理できる | state を自分で管理する。HCL を覚える |

## 決定

1. IaC は **AWS SAM** を使う。テンプレートは `infra/` に置く（フォルダ構成は ADR-0002 の確定時に反映）
2. 環境は **local / dev / prod**
   - local: FastAPI を `uvicorn`、DB は DynamoDB Local。日常の開発・テスト
   - dev / prod: AWS 上に同じテンプレートから別のスタックで作る（`onaka-log-dev` / `onaka-log-prod`）。テーブル・Cognito も分ける
3. Claude API キーは SSM Parameter Store の SecureString に手で入れる。テンプレートではパラメーター名と読み取り権限だけを扱い、値は Git にも CI にも置かない
4. CI からのデプロイは GitHub Actions の OIDC で、長期の AWS キーを使わない（詳細は CIC-05・CIC-09）

## 理由と影響

- 規模が小さくサーバーレス中心なので、SAM の得意な範囲に収まり、1人での準備・運用の手間が最も少ない
- `sam local start-api` で API Gateway＋Lambda に近い形を確かめられる（ADR-0007 のローカル再現の方針）
- 見直す条件: リソースが大きく増え YAML の保守が重くなったら CDK に移る（どちらも CloudFormation なので既存リソースを取り込める）
