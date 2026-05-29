# Pathloom Credibility Harness

Mission 6 makes Pathloom's trust bar executable.

## What the harness freezes

The credibility harness now centers on named truth-boundary scenarios:

- `authoritative_ready`
- `degraded_narrowed`
- `sparse_suppressed`

These are defined in [fixtures/credibilityFixtures.ts](/Users/a14a/Documents/pathloom/fixtures/credibilityFixtures.ts:1) and exercised through [tests/helpers/credibilityHarness.ts](/Users/a14a/Documents/pathloom/tests/helpers/credibilityHarness.ts:1).

Mission 19 adds a second layer above those frozen report goldens:

- a calibration matrix in [fixtures/calibrationFixtures.ts](/Users/a14a/Documents/pathloom/fixtures/calibrationFixtures.ts:1)
- a scoring harness in [src/check/calibration.ts](/Users/a14a/Documents/pathloom/src/check/calibration.ts:1) (re-exported from [tests/helpers/calibrationHarness.ts](/Users/a14a/Documents/pathloom/tests/helpers/calibrationHarness.ts:1))
- regression coverage in [tests/calibrationHarness.test.ts](/Users/a14a/Documents/pathloom/tests/calibrationHarness.test.ts:1)
- a release-gate CLI in `pathloom check` ([src/check/index.ts](/Users/a14a/Documents/pathloom/src/check/index.ts:1))

## Golden outputs

For each scenario, Pathloom freezes:

- structured JSON report
- Markdown report
- terminal report

Those goldens live under `fixtures/goldens/` and are compared exactly in the credibility tests. This means wording regressions, suppression regressions, and accidental surface drift are all visible.

## Truthfulness expectations

### Authoritative ready

Pathloom is expected to emit the full v0.1 credibility trio.

### Degraded narrowed

Pathloom is expected to:

- suppress unsupported dead-tool claims
- narrow mismatch analysis to the claims supported by the evidence

### Sparse suppressed

Pathloom is expected to suppress findings that would otherwise overclaim from too little data.

## Release gates

Pathloom is not ready to publish or demo a release unless all of the following are true:

1. Contract tests pass.
2. Ingestion spine tests pass.
3. v0.1 findings tests pass.
4. Credibility goldens pass unchanged, or changes are intentional and reviewed.
5. **`pathloom check` passes** (or equivalently `npm run test:calibration` plus golden tests) — family-specific false-positive budgets for sequence deepening and activation honesty.
6. Suppressed findings remain visible in outputs rather than silently disappearing.
7. New adapters or findings add explicit supported, degraded, and sparse cases before shipping.
8. Inference-deepening changes (sequence trajectory context, deep windows, activation semantics) update calibration scenarios or document intentional budget changes before merge.

## Why this matters

The product promise is not just that Pathloom computes results.

It is that Pathloom refuses to say more than the evidence allows.

The harness is therefore a release criterion, not just a unit-test convenience.

## Relationship to field validation

Mission 11 adds a separate but adjacent validation layer in [docs/architecture/field-validation.md](/Users/a14a/Documents/pathloom/docs/architecture/field-validation.md:1).

The distinction matters:

- the credibility harness freezes truth-boundary behavior
- the field-validation harness pressure-tests whether that behavior stays useful on scrubbed-equivalent operator datasets

Together they protect both halves of the Pathloom promise:

- honest claims
- credible product judgment

## Calibration matrix

The calibration matrix is intentionally small and hostile. It covers:

- sparse telemetry that should suppress day-one operational claims
- degraded telemetry that should narrow or suppress claims when evidence dimensions are missing
- adversarial telemetry that tries to trick Pathloom into overclaiming on sequence or activation

Current calibration scenarios:

- `sparse_launch_week`
- `degraded_presence_only`
- `activation_candidate_guardrail`
- `sequence_terminal_tool_trap`
- `sequence_trajectory_honesty` (SEQ-02 trajectory context on ready paths)
- `sequence_thin_volume_deep_gate` (deep-window volume gates stay closed below 30 sessions)
- `activation_observational_honesty` (credible activation keeps linked-cohort interpretation limits and `cohortContext`)

Every scenario defines explicit budgets for the finding families it exercises, and may also declare **family budgets** (`familyBudgets`) that cap pressure per family independently of the scenario total. Each family budget specifies:

- expected finding status (`ready`, `clear`, or `suppressed`)
- required blockers when suppression is the point
- required uncertainty level and claim scope where narrowing matters
- item-count or item-shape expectations when a family must stay quiet even though the dataset is otherwise analyzable

## Threshold accountability

Calibration is tied directly to the threshold families in [src/insights/index.ts](/Users/a14a/Documents/pathloom/src/insights/index.ts:1).

The harness snapshots which threshold keys govern each finding family, including:

- dead-tool session floors
- mismatch observation and rate floors
- termination session/rate floors
- sequence observation, peer, lift, and **deep-window** floors (`sequenceDeep*`)
- client divergence cohort and error-gap floors
- activation cohort, delta, and multiplier floors

Family-specific checks (CAL-02) now include:

- `requireTrajectoryContext` on ready `sequence_risk_map` items
- `maxTrajectoryWindowLength` while deep-volume gates are closed
- `requireEvidenceMatch` on activation diagnostics (observational interpretation + return window timing mode)
- `requireActivationCohortContext` on ready activation items (ACT-02 per-tool cohort diagnostics)
- `forbiddenItemMatch` to block candidate-only activation items from promoting into warnings

When a budget fails, the harness prints **accountable knobs** (the threshold snapshot for that family) so regressions name which constants to tune instead of only reporting “pressure exceeded.”

That means threshold tuning work is no longer “change the constants and see what feels right.” It is “change the constants and prove the calibration matrix still stays inside its false-positive budget.”

## Tuning workflow

When adjusting scoring or thresholds:

1. run `pathloom check` locally (or `npm run test:calibration` in CI matrices that still split gates)
2. run `node --test` before merging
3. review any calibration-budget violation before accepting a new threshold

## `pathloom check` as the third consumer-facing gate

Pathloom now exposes three operator-visible gates:

1. `npm test` — full unit/integration suite
2. `npm run test:calibration` — calibration matrix only (same scoring rules as check)
3. **`pathloom check`** — calibration matrix **plus** default frozen goldens (`authoritative_ready`, `demo-pack`) with CI-stable exit codes

Use `pathloom check` in pre-push hooks and release CI. Use `--calibration-only` when iterating on thresholds without re-diffing goldens. Use `--golden <scenario>` to bisect a single failure. Use `--json-summary` for machine-readable `PATHLOOM_CHECK_RESULT` output.

If the calibration harness fails, the default assumption should be that Pathloom became more willing to overclaim unless the change is intentional and the scenario budget is updated with justification.
