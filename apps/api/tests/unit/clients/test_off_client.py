"""Open Food Facts の呼び出し（F-011-10〜12）。HTTP は httpx の MockTransport で差し替える。"""

from __future__ import annotations

import json

import httpx
import pytest

from onaka_api.clients.off import USER_AGENT, OffClient
from onaka_api.estimation import UpstreamUnavailable


def client_with(handler: httpx.MockTransport) -> OffClient:
    return OffClient(httpx.Client(transport=handler), base_url="https://off.example", timeout_s=5.0)


@pytest.mark.spec("F-011-11", "F-011-12")
def test_found_returns_json_and_sends_user_agent() -> None:
    seen: list[httpx.Request] = []

    def handle(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, json={"status": 1, "product": {"product_name": "x"}})

    assert client_with(httpx.MockTransport(handle)).fetch("4901234567900") == {
        "status": 1,
        "product": {"product_name": "x"},
    }
    (req,) = seen
    assert str(req.url) == "https://off.example/api/v2/product/4901234567900.json"
    assert req.headers["user-agent"] == USER_AGENT
    assert "@" not in USER_AGENT  # 個人情報（メールアドレスなど）を含めない


@pytest.mark.spec("F-011-10", "F-011-12")
def test_404_is_none() -> None:
    def handle(req: httpx.Request) -> httpx.Response:
        return httpx.Response(404, content=json.dumps({"status": 0}).encode())

    assert client_with(httpx.MockTransport(handle)).fetch("4900000000000") is None


@pytest.mark.spec("F-011-10")
@pytest.mark.parametrize("status", [500, 503, 429])
def test_server_errors_are_upstream_unavailable(status: int) -> None:
    def handle(req: httpx.Request) -> httpx.Response:
        return httpx.Response(status)

    with pytest.raises(UpstreamUnavailable):
        client_with(httpx.MockTransport(handle)).fetch("4901234567900")


@pytest.mark.spec("F-011-10")
@pytest.mark.parametrize("exc", [httpx.ConnectTimeout("timeout"), httpx.ConnectError("refused")])
def test_network_errors_are_upstream_unavailable(exc: Exception) -> None:
    def handle(req: httpx.Request) -> httpx.Response:
        raise exc

    with pytest.raises(UpstreamUnavailable):
        client_with(httpx.MockTransport(handle)).fetch("4901234567900")


@pytest.mark.spec("F-011-10")
def test_broken_json_is_upstream_unavailable() -> None:
    def handle(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"<html>")

    with pytest.raises(UpstreamUnavailable):
        client_with(httpx.MockTransport(handle)).fetch("4901234567900")
