"""推定・照合のエラー。API ではエラーコード（docs/02_design/api.md §5）に対応づける。"""

from __future__ import annotations


class EstimationFailed(Exception):
    """Claude の応答が出力スキーマ・意味上のルールに合わない、リフューザル、出力の途切れ。API では 422。"""

    code = "estimation_failed"


class UpstreamUnavailable(Exception):
    """Claude・Open Food Facts に届かない、タイムアウト、5xx。API では 502。"""

    code = "upstream_unavailable"
