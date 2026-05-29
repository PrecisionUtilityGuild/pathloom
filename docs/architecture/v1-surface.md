# v1 Surface

Mission 9 locks Pathloom's public surface into explicit contracts instead of leaving it implied by implementation details.

Mission 12 extends that principle to report distribution by adding an explicit distribution-bundle contract rather than leaving multi-artifact sharing to ad hoc shell scripting.

## Stable contracts

Pathloom now exports a dedicated contracts surface from `pathloom/contracts` and the root package:

- `PATHLOOM_EVENT_SCHEMA`
- `PATHLOOM_EVENT_SCHEMA_VERSION`
- `PATHLOOM_REPORT_SCHEMA`
- `PATHLOOM_REPORT_SCHEMA_VERSION`
- `PATHLOOM_FINDING_DEFINITIONS`
- `validateNormalizedEvent()`
- `validateReportDocument()`

These are the compatibility anchors for downstream tools, fixtures, and future adapters.

## Stable report document

The report renderer now validates the shared report document before rendering. That means:

- JSON, Markdown, and terminal output still share one document
- shape drift becomes a test failure instead of a silent contract break
- `reportVersion` is now the stable schema version: `1.0`

## Analysis surfaces (rendering + output philosophy)

All output modes render from one canonical report document in `src/report/index.ts`. That document includes:

- dataset summary
- source key
- generation timestamp
- counts for sessions, events, and catalog tools
- telemetry spine summary:
  - sessionization mode
  - trace identity depth
  - span-lineage depth
  - first-class telemetry fields
- ready and clear findings
- suppressed findings
- per-finding uncertainty metadata:
  - evidence strength (`credible`, `candidate`, `weak`, `unsupported`)
  - claim scope (`full`, `narrowed`, `suppressed`)

### Terminal output

The terminal renderer is terse and action-first:

- ready findings are foregrounded
- recommendations are shown inline
- suppressed findings are listed separately as product behavior (not hidden internal state)
- every finding includes a short evidence-strength line and rationale

### JSON output

JSON is the stable machine-readable contract for automation. Every finding carries an explicit `uncertainty` object so downstream tooling can filter/sort without scraping prose.

### Markdown output

Markdown is the human-shareable artifact for docs, issues, and PR comments. It includes the same evidence-strength block as terminal/JSON.

## Stable CLI

The CLI surface is now explicit:

- `pathloom analyze`
- `pathloom check`
- `pathloom import`
- `pathloom schema event`
- `pathloom schema report`
- `pathloom schema findings`
- `pathloom --version`

This matters because "stable CLI" is not just about help text. It means users and automation can discover the event/report/finding contracts without scraping docs or source.

The CLI now also exposes a bundle-generation surface for distribution workflows:

- `pathloom bundle --output <dir>`
- `pathloom schema bundle`

Mission 13 extends the stable surface again for recurring local use:

- `pathloom snapshot`
- `pathloom diff`
- `pathloom schema snapshot`
- `pathloom schema diff`

Mission 14 extends the stable surface into local operator judgment:

- `pathloom feedback`
- `pathloom adjudicate`
- `pathloom schema adjudication`
- `pathloom schema feedback`

## Compatibility gate

Mission 9 adds a dedicated stability suite that checks:

- root exports
- contracts exports
- normalized event validation against real store output
- report document validation against real engine output
- CLI schema and version commands

Together with the credibility harness, this gives Pathloom three distinct release gates:

- truthfulness gate (frozen goldens)
- calibration gate (family-specific overclaiming budgets)
- compatibility gate

`pathloom check` is the operator-facing entrypoint that runs the calibration matrix and default golden scenarios in one command.

## `pathloom check` exit codes

| Code | Meaning |
| --- | --- |
| `0` | All requested gates passed |
| `1` | One or more gate failures (calibration budget or golden drift) |
| non-zero (process) | Invalid arguments or unexpected runtime failure surfaced by the CLI wrapper |

## `pathloom check` flags

- `--calibration-only` — run calibration scenarios only; skip golden diff
- `--golden <scenario|path>` — run one scenario gate (calibration name, `authoritative_ready`, `degraded_narrowed`, `sparse_suppressed`, `demo-pack`, or alias `authoritative-ready`) **or** diff a dataset report against an expected JSON file (requires `--db` and `--source`)
- `--fail-fast` — stop after the first failing gate
- `--json-summary` — emit a `PATHLOOM_CHECK_RESULT` JSON document (validated by `validateCheckResult()`)
- `--emit-badge` — after a passing check, emit `pathloom_certify` JSON (validated by `validateCheckBadge()`), tied to demo-pack `contentHash`

## `pathloom check` stdout

Human mode (default) prints:

- `Status: PASS|FAIL`
- gate pass counts
- per-failure blocks with scenario name, gate kind, and formatted violations

Calibration failures include **accountable knobs** (threshold snapshot per finding family) so CI logs name which constants to review.

JSON mode (`--json-summary`) emits:

- `checkVersion`
- `passed`, `exitCode`
- `summary` (`gateCount`, `passedGateCount`, `failureCount`)
- `gates[]` per-scenario results
- `failures[]` with `violations[]` strings suitable for CI annotation

That is the actual v1 boundary.
