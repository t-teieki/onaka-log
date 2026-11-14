#!/usr/bin/env bash
# Lambda に載せるコードを infra/build/api に作る（sam deploy の前に実行する）。
# 依存は uv.lock どおり、Lambda（Python 3.12・arm64）用の wheel だけを入れる。
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/infra/build/api"
uv="${UV:-uv}"
# LAMBDA_PLATFORM=x86_64-manylinux2014 にすると、手元（x86_64）で run.sh を試せる

rm -rf "$out"
mkdir -p "$out"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cd "$root"
"$uv" export --frozen --no-dev --no-emit-workspace --package onaka-api -o "$tmp/requirements.txt" >/dev/null
"$uv" pip install --quiet --target "$out" --python-version 3.12 --python-platform "${LAMBDA_PLATFORM:-aarch64-manylinux2014}" \
  --only-binary :all: -r "$tmp/requirements.txt"

cp -r apps/api/src/onaka_api "$out/onaka_api"
mkdir -p "$out/contracts"
cp -r contracts/api contracts/domain contracts/llm "$out/contracts/"
cp infra/run.sh "$out/run.sh"
chmod 755 "$out/run.sh"
find "$out" -name "__pycache__" -type d -prune -exec rm -rf {} +

echo "built: $out ($(du -sh "$out" | cut -f1))"
