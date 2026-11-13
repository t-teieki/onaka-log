# IaC の方式の比較（INF-03 / Q-34）

> ステータス: 比較資料（決定は ADR に書く）
> 最終更新: 2026-11-14
> 関連: INF-03, ADR-0007, [architecture.md](../architecture.md)

## 1. 管理するもの（MVP）

| リソース | 数 |
|---|---|
| Lambda 関数（FastAPI、Lambda Web Adapter） | 1 |
| API Gateway HTTP API ＋ JWT オーソライザー | 1 |
| DynamoDB テーブル | 1 |
| Cognito ユーザープール ＋ Apple・Google の ID プロバイダー ＋ アプリクライアント ＋ ドメイン | 1式 |
| IAM ロール（Lambda 実行用、CI のデプロイ用 OIDC） | 2 |
| SSM パラメーター（Claude API キー。値は手で入れ、IaC では名前と権限だけ扱う） | 1 |
| CloudWatch ロググループ（保持期間） | 1 |
| AWS Budgets（予算アラート） | 1 |

これを dev と prod の2環境に、同じ定義から作る。規模は小さく、サーバーレスのリソースが中心。

## 2. 候補

| | AWS SAM | AWS CDK（Python） | Terraform |
|---|---|---|---|
| 書き方 | YAML（CloudFormation の拡張） | Python のコード | HCL（Terraform 独自の言語） |
| 新しく覚えること | 少ない（YAML と CloudFormation の考え方） | 中（CDK の考え方。CLI は Node.js 製なので Node.js も要る） | 中〜多（HCL、state の管理） |
| サーバーレスとの相性 | 最もよい。Lambda・API・DynamoDB を短く書ける | よい（L2 コンストラクトで短く書ける） | 普通（リソースを1つずつ書く） |
| ローカルでの実行 | `sam local start-api` で API Gateway＋Lambda を Docker で動かせる | 直接はない（SAM CLI と組み合わせることはできる） | ない |
| 状態の管理 | CloudFormation が持つ（自分で管理しない） | CloudFormation が持つ | **state ファイルを自分で管理**（S3 などに置き、ロックも考える） |
| Cognito の Apple・Google 連携 | CloudFormation のリソースで書ける（やや冗長） | L2 コンストラクトがあり書きやすい | 書ける |
| CI（GitHub Actions） | `sam build` / `sam deploy`、公式のセットアップ Action あり | `cdk deploy`（Node.js と Python の両方を用意） | `terraform plan` / `apply`、state の置き場所が要る |
| 初回の準備 | ほぼなし（`sam deploy --guided`） | `cdk bootstrap`（準備用スタックを作る） | state 用の S3 バケットなど |
| 他のクラウドへの移植 | できない | できない | できる（今回は不要） |
| 費用 | 0円 | 0円（bootstrap の S3 に少し） | 0円（state の S3 に少し） |

## 3. 推奨: AWS SAM

- 管理するものが少なく、ほぼすべてサーバーレスのリソースなので、SAM の得意な範囲に収まる
- `sam local start-api` で、API Gateway＋Lambda に近い形をローカルで確かめられる（ADR-0007 のローカル再現の方針に合う）
- state の管理が要らず、準備も少ない。1人での開発・運用の手間が最も少ない
- Python だけで済む（CDK は Node.js も要る）

**弱み**: YAML が長くなりやすい（特に Cognito の ID プロバイダーまわり）。リソースが大きく増えたら、CDK への移行を考える（どちらも CloudFormation なので、既存のリソースを取り込める）。

## 4. 他を選ぶ場合

- **CDK（Python）**: コードで書きたい、条件分岐や共通化を多用したい場合。Cognito の設定は SAM より短く書ける
- **Terraform**: AWS 以外も同じ道具で管理したい、Terraform の経験を積みたい場合。state の管理が増える
