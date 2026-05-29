# Authoritative Ready Demo Pack

Canonical importable Pathloom demo pack with enough realistic sessions, client divergence, argument mismatches, sequence behavior, and actor linkage to exercise the full credibility-first report surface.

## Contents

- `events.ndjson` — canonical importable telemetry dataset
- `tool-catalog.json` — matching authoritative catalog
- `expected-report.json` — frozen machine-readable report
- `expected-report.md` — frozen Markdown review surface
- `expected-report.txt` — frozen terminal review surface
- `manifest.json` — commands, counts, and expected findings summary

## Import and analyze

Run these commands from the repository root:

```bash
npx pathloom import --format logfile --input ./fixtures/demo-pack/authoritative-ready/events.ndjson --catalog ./fixtures/demo-pack/authoritative-ready/tool-catalog.json --source logfile:demo-pack --actor-privacy hashed
npx pathloom analyze --source logfile:demo-pack
```

## Expected findings

- `activation_tool_report` — query correlated with 83% second-session return in the linked cohort at 14.17x the return rate of the rest of the cohort.
- `sequence_risk_map` — 2 targeted failure paths and 2 reusable success paths crossed the emission threshold.
- `dead_tool_detection` — 2 registered tools had zero calls across 29 sessions.
- `client_divergence` — 2 client-level divergence patterns crossed the emission threshold.
- `argument_mismatch_patterns` — 2 recurring argument mismatch patterns crossed the emission threshold.
- `session_termination_analysis` — list was the most common termination tool, and 2 candidate dead-end patterns crossed the emission threshold.

## Refresh this pack

```bash
npm run demo-pack:build
```
