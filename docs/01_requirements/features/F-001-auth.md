# F-001 サインイン（API 側の振る舞い）

> ステータス: Draft（アプリ側のサインインの流れは別に書く）
> 最終更新: 2026-11-14
> 関連: [ADR-0006](../../adr/0006-auth-from-day-one.md), [ADR-0007](../../adr/0007-backend-aws-serverless.md), [ADR-0017](../../adr/0017-libraries-and-tooling.md), [architecture.md](../../02_design/architecture.md) §5

トークン（Cognito の JWT）の検証は API Gateway の JWT オーソライザーが行う。Lambda（FastAPI）は、API Gateway が検証済みの要求に付けた情報から利用者 ID を取り出すだけ。

## 要件

| ID | 要件 |
|---|---|
| F-001-01 | 利用者 ID は、API Gateway の要求の文脈（Lambda Web Adapter が `x-amzn-request-context` ヘッダーで渡す JSON）の `authorizer.jwt.claims.sub` から取る。本文やパラメーターの利用者 ID は使わない |
| F-001-02 | 利用者 ID が取れない要求は 401 unauthorized（API Gateway を通らない要求を誤って受け付けない） |
| F-001-03 | ローカル開発（uvicorn）では、環境変数 `ONAKA_LOCAL_USER_ID` を設定したときだけ、その値を利用者 ID として使う。AWS 上では使わない（環境変数を設定しない） |
