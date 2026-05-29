#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ASSETS="proof/pathloom-proof"

bash scripts/ci-gate.sh

mkdir -p "$ASSETS"
cp .pathloom-ci/report.json .pathloom-ci/report.md .pathloom-ci/check-summary.json "$ASSETS/"

npx pathloom check --emit-badge > "${ASSETS}/certify-badge.json"

echo "Proof artifacts written to ${ASSETS}/"
