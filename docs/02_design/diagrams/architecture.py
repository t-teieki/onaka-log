"""全体構成図（AWS アイコン版）を描く。docs/02_design/architecture.md から参照する。

描き直し方（Docker で graphviz・日本語フォント・diagrams を用意して実行する）:
  docker run --rm -v "$PWD/docs/02_design/diagrams:/work" -w /work python:3.12-slim bash -c \
    "apt-get update -qq && apt-get install -y -qq graphviz fonts-ipafont-gothic >/dev/null \
     && pip install -q diagrams==0.24.4 && python architecture.py"

出力: architecture.png（このファイルと同じフォルダ）
"""

from diagrams import Cluster, Diagram, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.cost import Budgets
from diagrams.aws.database import Dynamodb
from diagrams.aws.management import Cloudformation, CloudwatchLogs, SystemsManagerParameterStore
from diagrams.aws.network import APIGateway
from diagrams.aws.security import IAMRole, Cognito
from diagrams.generic.device import Mobile
from diagrams.onprem.ci import GithubActions
from diagrams.onprem.compute import Server

FONT = "IPAGothic"
graph_attr = {"fontname": FONT, "fontsize": "20", "pad": "0.4", "nodesep": "0.6", "ranksep": "1.1", "splines": "spline"}
node_attr = {"fontname": FONT, "fontsize": "13"}
edge_attr = {"fontname": FONT, "fontsize": "11"}
cluster_attr = {"fontname": FONT, "fontsize": "14"}

with Diagram("onaka-log 全体構成（MVP）", filename="architecture", outformat="png", show=False, direction="LR",
             graph_attr=graph_attr, node_attr=node_attr, edge_attr=edge_attr):
    app = Mobile("スマートフォン\nExpo アプリ\n（撮影・バーコード読み取り\n画像を長辺1024pxに縮小）")
    ci = GithubActions("GitHub Actions\nsam build / deploy")

    with Cluster("AWS 東京リージョン（ap-northeast-1）\ndev / prod を同じ SAM テンプレートから別スタックで作る",
                 graph_attr=cluster_attr):
        with Cluster("認証", graph_attr=cluster_attr):
            cognito = Cognito("Cognito ユーザープール\nSign in with Apple / Google")
        with Cluster("API", graph_attr=cluster_attr):
            apigw = APIGateway("API Gateway\nHTTP API（JWT 認可）")
            fn = Lambda("Lambda\nPython / FastAPI\n推定・照合・計算・検証")
            ddb = Dynamodb("DynamoDB\n食事（1テーブル）")
        with Cluster("設定・運用", graph_attr=cluster_attr):
            ssm = SystemsManagerParameterStore("SSM Parameter Store\nClaude API キー")
            logs = CloudwatchLogs("CloudWatch Logs\n画像・入力本文は出さない")
            budgets = Budgets("AWS Budgets\n予算アラート")
        with Cluster("デプロイ", graph_attr=cluster_attr):
            role = IAMRole("デプロイ用ロール\n（OIDC）")
            cfn = Cloudformation("CloudFormation\n（AWS SAM）")

    with Cluster("外部サービス", graph_attr=cluster_attr):
        claude = Server("Claude API\nOCR: Haiku 5.5\n写真: Sonnet 5.5")
        off = Server("Open Food Facts API\n（バーコード照合）")

    app >> Edge(label="サインイン") >> cognito
    app >> Edge(label="HTTPS + JWT") >> apigw
    apigw >> Edge(style="dashed", constraint="false") >> cognito
    apigw >> fn >> ddb
    fn >> Edge(label="画像＋プロンプト", minlen="3") >> claude
    fn >> Edge(label="JAN で照合", minlen="3") >> off
    fn >> Edge(label="起動時に読む", style="dashed") >> ssm
    fn >> Edge(style="dashed") >> logs
    ssm - Edge(style="invis") - budgets
    ci >> Edge(label="OIDC") >> role >> cfn
