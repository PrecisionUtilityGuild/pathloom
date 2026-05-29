# Pathloom Field Validation

Mission 11 extends Pathloom's credibility work from synthetic truth-boundary fixtures into a repeatable field-validation loop.

The goal is not to bolt on a second scoring system. It is to pressure-test the exact product surface Pathloom ships today:

- `PathloomEngine.analyze()`
- the shared report document
- terminal, JSON, and Markdown renderers

## Why this exists

The core credibility harness already proves that Pathloom:

- emits findings on strong evidence
- narrows claims on partial evidence
- suppresses claims it is not entitled to make

That is necessary, but not sufficient.

Real operator trust also depends on whether a finding:

- matches what an experienced server author would conclude from the same telemetry
- is prioritized in a useful order
- uses wording that invites action instead of bluffing certainty
- stays appropriately quiet on thin or degraded evidence

## Validation pack

The field-validation harness lives in:

- [fixtures/fieldValidationFixtures.ts](/Users/a14a/Documents/pathloom/fixtures/fieldValidationFixtures.ts:1)
- [tests/helpers/fieldValidationHarness.ts](/Users/a14a/Documents/pathloom/tests/helpers/fieldValidationHarness.ts:1)
- [tests/fieldValidationHarness.test.ts](/Users/a14a/Documents/pathloom/tests/fieldValidationHarness.test.ts:1)

Each scenario contains:

- a scrubbed-equivalent dataset profile
- a representative tool catalog when one is legitimately available
- canonical invocation events
- explicit review expectations:
  - findings expected to be affirmed
  - findings expected to be challenged or manually verified
  - findings expected to stay suppressed
  - calibration checks that must remain true in the product

## Current scenarios

### `cursor_onboarding_gap`

Authoritative wrapper-mode telemetry with stable actor identity and multiple clients represented.

Review focus:

- affirm that Pathloom identifies `query` as the activation tool
- affirm that Cursor is the degraded client cohort
- affirm that `list` looks like a dead-end entry surface
- challenge whether dead-tool findings should trigger removal immediately or first trigger operator catalog verification

### `logfile_handoff_gap`

Structured logfile telemetry with session-only identity and presence-only argument evidence.

Review focus:

- affirm that Pathloom still reports the repeated missing `userId` problem
- affirm that Pathloom refuses dead-tool and activation claims on this weaker evidence
- preserve the calibration rule that presence-only evidence must not masquerade as type validation

### `launch_week_underpowered`

Small authoritative dataset that resembles a new deployment or a thin partner pilot.

Review focus:

- affirm that Pathloom stays quiet instead of bluffing from low counts
- preserve insufficient-sample suppression for dead-tool and session-termination claims
- preserve activation suppression when linked actor evidence is not actually observed

## Review rubric

Each scenario should be reviewed against the same rubric:

1. Correctness
   Is the finding directionally and mechanically correct for the dataset?

2. Evidence entitlement
   Is Pathloom making only the claims the profile and observed evidence support?

3. Actionability
   Would an operator know what to change next, or at least what to inspect next?

4. Wording credibility
   Does the wording reflect confidence honestly, especially for degraded or probabilistic patterns?

5. Suppression quality
   When a finding is blocked, is the suppression reason itself useful and trustworthy?

6. Priority
   Would an experienced operator want this surfaced near the top of the report?

## Accepted calibration rules protected here

The field-validation harness currently locks in several high-value product rules:

- authoritative dead-tool findings are allowed, but operators should still verify the catalog reflects the current public surface before deletion
- presence-only datasets may support missing-required-argument findings, but not wrong-type claims
- session-only or unlinked datasets must not emit activation findings
- underpowered datasets must preserve explicit suppression instead of generating weak heuristics

## Workflow

1. Add or update a scrubbed-equivalent scenario in `fixtures/fieldValidationFixtures.ts`.
2. Run `npm run test:field-validation`.
3. Review the scenario's affirmed, challenged, and suppressed expectations.
4. If a product change is accepted:
   - update the fixture expectations
   - add or adjust regression coverage
   - document the reasoning in the relevant architecture doc or README
   - review whether recurring local adjudications point to the same issue before changing thresholds broadly
5. If a scenario reveals a misleading finding, prefer tightening evidence gates, thresholds, or wording over adding explanation after the fact.

## Product posture

This workflow preserves Pathloom's local-first and credibility-first philosophy:

- the validation pack is local and reproducible
- scrubbed-equivalent datasets stand in for partner telemetry when raw data cannot be shared
- feedback is encoded as fixtures and tests, not hand-wavy folklore
