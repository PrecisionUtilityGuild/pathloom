#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CI_DIR="${PATHLOOM_CI_DIR:-.pathloom-ci}"
PACK="fixtures/demo-pack/authoritative-ready"
SOURCE_KEY="logfile:demo-pack"
DB="${CI_DIR}/pathloom.db"

npm run build
npm run demo-pack:build

mkdir -p "$CI_DIR"

npx pathloom import \
  --db "$DB" \
  --format logfile \
  --input "./${PACK}/events.ndjson" \
  --catalog "./${PACK}/tool-catalog.json" \
  --source "$SOURCE_KEY" \
  --actor-privacy hashed

npx pathloom analyze --db "$DB" --source "$SOURCE_KEY" --json > "${CI_DIR}/report.json"
npx pathloom analyze --db "$DB" --source "$SOURCE_KEY" --markdown > "${CI_DIR}/report.md"

if ! npx pathloom check --json-summary > "${CI_DIR}/check-summary.json"; then
  echo "::error title=Pathloom credibility gate failed::Calibration or golden gate failed. See check-summary.json and log below."
  echo "::group::Pathloom check (human-readable)"
  npx pathloom check || true
  echo "::endgroup::"
  cat "${CI_DIR}/check-summary.json"
  exit 1
fi

echo "Pathloom check passed."
