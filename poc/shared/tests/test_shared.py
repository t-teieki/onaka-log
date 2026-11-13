import base64
import io
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve()
ROOT = HERE.parents[3]
sys.path.insert(0, str(ROOT / "poc"))

import pytest  # noqa: E402
from shared import images, pricing, schemas  # noqa: E402
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("contract_conftest", ROOT / "tests" / "contract" / "conftest.py")
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
check_structured_outputs = _mod.check_structured_outputs


# ---- schemas ----

def test_strip_nested_keywords():
    s = {"type": "object", "properties": {"a": {"type": "number", "minimum": 0, "maximum": 5}}, "minLength": 1,
         "items": {"type": "string", "maxLength": 3}}
    out = schemas.strip_unsupported(s)
    assert out["properties"]["a"] == {"type": "number"}
    assert "minLength" not in out and out["items"] == {"type": "string"}
    assert "minimum" in s["properties"]["a"]  # 元は変更しない


def test_strip_keeps_property_named_like_keyword():
    s = {"type": "object", "properties": {"minimum": {"type": "number", "minimum": 0}, "maxLength": {"type": "string"}},
         "$defs": {"minLength": {"type": "integer", "maximum": 3}}}
    out = schemas.strip_unsupported(s)
    assert set(out["properties"]) == {"minimum", "maxLength"}
    assert out["properties"]["minimum"] == {"type": "number"}
    assert out["$defs"]["minLength"] == {"type": "integer"}


def test_stripped_ocr_schema():
    full = schemas.load_schema("nutrition-label-ocr")
    api = schemas.strip_unsupported(full)
    text = str(api)
    for kw in ("'minimum'", "'maximum'", "'minLength'", "'maxLength'"):
        assert kw not in text
    assert check_structured_outputs(api) == []
    assert "minimum" in str(full)


def test_prompt_extraction():
    system, version = schemas.load_prompt("nutrition-label-ocr")
    assert version == "0.1.0"
    assert system.startswith("あなたは日本の食品パッケージ")
    assert "```" not in system and "安全のためのルール" in system


def test_extract_prompt_errors():
    with pytest.raises(ValueError):
        schemas.extract_system_prompt("no block")
    with pytest.raises(ValueError):
        schemas.extract_prompt_version("none")


# ---- pricing ----

def test_cost_basic():
    u = {"input_tokens": 1_000_000, "output_tokens": 1_000_000}
    assert pricing.cost_usd("claude-sonnet-5-5", u) == pytest.approx(12.0)
    assert pricing.cost_jpy("claude-sonnet-5-5", u) == pytest.approx(1800.0)
    assert pricing.cost_usd("claude-haiku-5-5", u) == pytest.approx(0.6)
    assert pricing.cost_usd("claude-opus-5-5", u) == pytest.approx(24.0)


def test_cost_cache():
    u = {"input_tokens": 0, "output_tokens": 0, "cache_creation_input_tokens": 1_000_000, "cache_read_input_tokens": 1_000_000}
    assert pricing.cost_usd("claude-sonnet-5-5", u) == pytest.approx(2.0 * 1.25 + 0.10)
    assert pricing.cost_usd("claude-opus-5-5", u) == pytest.approx(4.0 * 1.25 + 0.20)
    assert pricing.cost_usd("claude-haiku-5-5", u) == pytest.approx(0.10 * 1.25 + 0.01)


def test_cost_missing_and_none_fields():
    assert pricing.cost_usd("claude-sonnet-5-5", {}) == 0
    assert pricing.cost_usd("claude-sonnet-5-5", {"input_tokens": None, "output_tokens": 10}) > 0


def test_unknown_model_raises():
    with pytest.raises(KeyError):
        pricing.cost_usd("nope", {})


# ---- estimate ----

def test_estimate():
    system = "あ" * 300
    tokens = pricing.estimate_input_tokens(1500, 1000, system)
    assert tokens == round(1500 * 1000 / 750 + 300 / 1.5)
    jpy = pricing.estimate_call_jpy("claude-sonnet-5-5", 1500, 1000, system)
    expect = (tokens * 2.0 + pricing.ASSUMED_OUTPUT_TOKENS * 10.0) / 1e6 * 150
    assert jpy == pytest.approx(expect)
    assert pricing.estimate_call_jpy("claude-haiku-5-5", 1500, 1000, system) < jpy
    assert pricing.estimate_call_jpy("claude-opus-5-5", 1500, 1000, system) > jpy


# ---- images ----

def _decode(b64):
    return Image.open(io.BytesIO(base64.b64decode(b64)))


def test_resize_caps_long_edge():
    img = Image.new("RGB", (1600, 800), "white")
    b64, w, h, n = images.encode_image(img, 768)
    assert (w, h) == (768, 384)
    im = _decode(b64)
    assert im.size == (768, 384) and im.format == "JPEG" and n > 0


def test_small_image_not_upscaled():
    img = Image.new("RGB", (300, 200), "white")
    _, w, h, _ = images.encode_image(img, 1024)
    assert (w, h) == (300, 200)


def test_no_max_edge_keeps_size_and_converts_rgb():
    img = Image.new("RGBA", (400, 900), (255, 0, 0, 128))
    b64, w, h, _ = images.encode_image(img, None)
    assert (w, h) == (400, 900) and _decode(b64).mode == "RGB"


def test_exif_transpose_applied():
    img = Image.new("RGB", (200, 100), "white")
    exif = Image.Exif()
    exif[0x0112] = 6  # 90度回転
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    buf.seek(0)
    _, w, h, _ = images.encode_image(Image.open(buf), None)
    assert (w, h) == (100, 200)
