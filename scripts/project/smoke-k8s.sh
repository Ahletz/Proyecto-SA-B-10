#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; API_BASE=http://localhost:30080 "$ROOT/tests/e2e/smoke.sh"
