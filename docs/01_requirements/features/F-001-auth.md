# F-001 サインイン

> ステータス: Draft（Apple は Apple Developer Program に登録してから）
> 最終更新: 2026-11-16
> 関連: [ADR-0006](../../adr/0006-auth-from-day-one.md), [ADR-0007](../../adr/0007-backend-aws-serverless.md), [ADR-0017](../../adr/0017-libraries-and-tooling.md), [architecture.md](../../02_design/architecture.md) §5

## API 側

トークン（Cognito の JWT）の検証は API Gateway の JWT オーソライザーが行う。Lambda（FastAPI）は、API Gateway が検証済みの要求に付けた情報から利用者 ID を取り出すだけ。

## 要件

| ID | 要件 |
|---|---|
| F-001-01 | 利用者 ID は、API Gateway の要求の文脈（Lambda Web Adapter が `x-amzn-request-context` ヘッダーで渡す JSON）の `authorizer.jwt.claims.sub` から取る。本文やパラメーターの利用者 ID は使わない |
| F-001-02 | 利用者 ID が取れない要求は 401 unauthorized（API Gateway を通らない要求を誤って受け付けない） |
| F-001-03 | ローカル開発（uvicorn）では、環境変数 `ONAKA_LOCAL_USER_ID` を設定したときだけ、その値を利用者 ID として使う。AWS 上では使わない（環境変数を設定しない） |

## アプリ側（2026-11-16）

サインインは Cognito のマネージドログイン（Hosted UI）を expo-auth-session で開く（認可コード＋PKCE、ADR-0017・Q-42）。ログイン方法は Google（Cognito に連携）。Apple は Apple Developer Program に登録してから足す（ADR-0006、Q-41）。

| ID | 要件 |
|---|---|
| F-001-04 | Cognito の設定（`EXPO_PUBLIC_COGNITO_DOMAIN`・`EXPO_PUBLIC_COGNITO_CLIENT_ID`）がないときはサインインを使わない。トークンなしで API を呼ぶ（ローカルのバックエンドの `ONAKA_LOCAL_USER_ID` 用、Q-45） |
| F-001-05 | 設定があり、保存したセッションがないときはサインイン画面（画面設計 3-8）を出し、ホームなどの画面は出さない |
| F-001-06 | 「Google でサインイン」は Cognito の `/oauth2/authorize` を `identity_provider=Google`・`response_type=code`・PKCE（S256）・`scope=openid email profile` で開く。戻り先はアプリの `auth/callback`（Expo Go では `exp://…/--/auth/callback`） |
| F-001-07 | 戻ってきた認可コードを `/oauth2/token` でトークン（アクセス・ID・リフレッシュ）に換える。リフレッシュトークンは端末の安全な保管場所（expo-secure-store）に置き、アクセストークンはメモリだけに持つ |
| F-001-08 | 利用者がブラウザを閉じた（キャンセル）ときはサインイン画面のまま何も出さない。失敗したときは「サインインできませんでした。もう一度お試しください」を出す |
| F-001-09 | 起動時に保存したリフレッシュトークンがあれば、サインイン画面を出さずにトークンを更新して使う |
| F-001-10 | API を呼ぶ前に、アクセストークンの期限が切れている（残り60秒未満を含む）ならリフレッシュトークンで更新する |
| F-001-11 | 更新が `invalid_grant` などで拒否されたら、保存したトークンを消してサインイン画面に戻す。通信の失敗（オフラインなど）では消さない（次の操作でもう一度更新する） |
| F-001-12 | API が 401 を返したら、トークンを1回だけ更新して同じ要求を送り直す。更新できなければ F-001-11 と同じくサインイン画面に戻す（画面設計 4-1 の `unauthorized`） |
| F-001-13 | ホームの「設定」（⚙）で設定画面（画面設計 3-7）を開く。設定画面は「サインアウト」とアプリの版を出す |
| F-001-14 | 「サインアウト」を押すと、削除を待っていればそれを先に送り（F-032-08）、リフレッシュトークンを Cognito の `/oauth2/revoke`（`token`・`client_id`）で失効させ、端末のトークンを消してサインイン画面に戻す。読んだデータも消す |
| F-001-15 | 失効の要求が失敗しても（オフラインなど）、端末のトークンは消してサインアウトする（失効はできる範囲で行う。アクセストークンは最長60分で切れる） |
| F-001-16 | Cognito の設定がないとき（ローカルのバックエンド、F-001-04）は「サインアウト」を出さず、サインインを使っていないことを出す |
