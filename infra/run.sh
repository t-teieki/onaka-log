#!/bin/bash
# Lambda の起動スクリプト（Lambda Web Adapter が HTTP を uvicorn に渡す。ADR-0007）
export PYTHONPATH="/var/task:${PYTHONPATH}"
exec python -m uvicorn --host 127.0.0.1 --port "${AWS_LWA_PORT:-8000}" --no-access-log onaka_api.main:app
