#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT/infrastructure"; docker compose logs -f --tail=100 "${1:-}"
