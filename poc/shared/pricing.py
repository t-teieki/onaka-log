"""モデルごとの単価と費用計算（USD / 100万トークン）。純粋関数。"""

from __future__ import annotations

from typing import Any

JPY_PER_USD = 150.0
CACHE_WRITE_MULTIPLIER = 1.25  # キャッシュ書き込み = 入力単価 × 1.25

# input / output / cache_read（USD / MTok）
PRICES: dict[str, dict[str, float]] = {
    # haiku の cache_read 0.01 は仮定（公式表で未確認）
    "claude-haiku-5-5": {"input": 0.10, "output": 0.50, "cache_read": 0.01},
    "claude-sonnet-5-5": {"input": 2.00, "output": 10.00, "cache_read": 0.10},
    "claude-opus-5-5": {"input": 4.00, "output": 20.00, "cache_read": 0.20},
}

# dry-run の概算に使う仮定
ASSUMED_OUTPUT_TOKENS = 2000  # thinking を含む。保守的
CHARS_PER_TOKEN = 1.5  # 日本語システムプロンプトの粗い換算
PIXELS_PER_TOKEN = 750.0  # 画像トークン ≈ 幅×高さ / 750


def cost_usd(model: str, usage: dict[str, Any]) -> float:
    p = PRICES[model]
    inp = usage.get("input_tokens") or 0
    out = usage.get("output_tokens") or 0
    cw = usage.get("cache_creation_input_tokens") or 0
    cr = usage.get("cache_read_input_tokens") or 0
    total = (
        inp * p["input"]
        + cw * p["input"] * CACHE_WRITE_MULTIPLIER
        + cr * p["cache_read"]
        + out * p["output"]
    )
    return total / 1_000_000


def cost_jpy(model: str, usage: dict[str, Any]) -> float:
    return cost_usd(model, usage) * JPY_PER_USD


def estimate_input_tokens(width: int, height: int, system_prompt: str) -> int:
    image = width * height / PIXELS_PER_TOKEN
    system = len(system_prompt) / CHARS_PER_TOKEN
    return int(round(image + system))


def estimate_call_jpy(model: str, width: int, height: int, system_prompt: str) -> float:
    """1回の呼び出しの概算費用（円）。キャッシュは効かない前提。"""
    usage = {
        "input_tokens": estimate_input_tokens(width, height, system_prompt),
        "output_tokens": ASSUMED_OUTPUT_TOKENS,
    }
    return cost_jpy(model, usage)
