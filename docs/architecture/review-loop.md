# Review loop (snapshots, diffs, feedback)

Pathloom is meant to run repeatedly, not once. The “review loop” is how findings turn into operator decisions while staying local-first.

This document replaces:

- `history-cadence.md`
- `operator-feedback.md`

## Snapshot model

Pathloom persists **report snapshots** in the local SQLite store (not raw event clones).

Each snapshot stores:

- a stable snapshot key
- optional human label
- capture timestamp
- source key
- report version
- the full canonical report document

### Why store reports instead of raw events

The historical problem Pathloom is solving is:

- what changed in the product signals I act on?

not:

- replay every event forever in a second warehouse

Storing analyzed report documents:

1. avoids duplicating sensitive raw telemetry
2. preserves the exact credibility/suppression decisions Pathloom made at the time
3. lets diffs compare stable product surfaces instead of reinterpreting history through a changed engine

## Diff semantics

Pathloom compares two stored snapshots from the same source key and separates changes into:

- **New findings**: present now, absent before
- **Resolved findings**: present before, absent now (without merely becoming suppressed)
- **Regressed findings**: present in both, materially worse
- **Evidence changes**: support status changed (active ↔ suppressed, blockers changed)

Evidence changes are essential: a disappearing finding is not “fixed” if it vanished because evidence got weaker.

## CLI cadence

### Save a run

```bash
pathloom snapshot --source wrapper:demo --label nightly
```

### Save a run and write a review bundle

```bash
pathloom snapshot --source wrapper:demo --label nightly --output ./pathloom-history
```

### Compare recent runs

```bash
pathloom diff --source wrapper:demo
pathloom diff --source wrapper:demo --markdown
```

If explicit snapshot keys are omitted, Pathloom compares the latest two stored snapshots for that source.

## Operator feedback (adjudication)

Pathloom stores adjudications locally against snapshot-scoped feedback targets.

Statuses:

- `accepted`
- `noisy`
- `misleading`
- `missing_context`

Targets are derived from the stable report surface:

- active finding items
- active summary findings with no individual items
- suppressed findings

### Review the latest snapshot for a source

```bash
pathloom feedback --source wrapper:demo --markdown
```

The review surface aggregates adjudications across stored snapshots, surfaces recurring patterns, and recommends a next review target.

### Record an adjudication

```bash
pathloom adjudicate \
  --source wrapper:demo \
  --finding dead_tool_detection \
  --item delete_record \
  --status accepted \
  --note "Confirmed after catalog review"
```

## Privacy guardrails

This workflow preserves Pathloom’s local-first posture:

- adjudications live in the local SQLite store
- no hosted account is required
- no raw telemetry export is required
- operator notes stay local unless explicitly shared

