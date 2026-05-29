# Findings (v0.1–v0.3)

Pathloom’s “findings” are bounded product claims derived from canonical invocation events, gated by the analysis contract and dataset capability profile.

This document replaces:

- `v0-1-findings.md`
- `v0-2-findings.md`
- `v0-3-activation.md`

## Common design rule

Every finding asks the analysis contract whether it is:

- `eligible`
- `narrowed`
- `suppressed`

That rule is what makes Pathloom “credibility-first”: no dataset becomes trustworthy just because it exists.

The concrete implementations live in `src/insights/index.ts` and are orchestrated through `src/core/engine.ts`.

## v0.1 (credibility trio)

### Dead tool detection

Dead-tool detection only runs when the dataset has:

- an authoritative tool catalog
- enough sessions to avoid day-one false positives

If those conditions are not met, the finding is suppressed rather than guessed.

### Argument mismatch patterns

Mismatch analysis compares an authoritative schema surface (catalog/runtime registration) against observed invocation evidence.

The finding narrows automatically:

- presence-only evidence supports missing-required-argument claims
- shape evidence supports wrong-type / wrong-shape claims
- full values unlock invalid-value claims

Emission is also recurrence-gated so one-off weird calls do not create noisy output.

### Session termination analysis

Termination analysis groups events into sessions and flags tools that frequently end sessions with “possible dead end” semantics. The language stays cautious because Pathloom can’t always distinguish intent from abandonment.

### Ranking

Findings are ordered by:

- actionability
- evidence strength
- pattern magnitude

So the CLI stays focused on “what to change next”, not exhaustive reporting.

## v0.2 (behavior layer)

### Sequence risk map (`sequence_risk_map`)

Pathloom computes repeated contiguous paths of length 2 up to `sequenceMaxLength` (default 3), with an optional deep window up to `sequenceDeepMaxLength` (default 4) only when session volume and outcome coverage clear explicit gates (`sequenceDeepMinSessions`, `sequenceDeepMinOutcomeEvents`).

It asks two targeted questions:

- which prefixes reliably precede a specific failure endpoint?
- which successful paths are reusable enough to surface earlier, and do they transfer across clients?

Emission rules (high level):

- suppress when session boundaries, ordered events, or outcome evidence are unsupported by the dataset profile
- suppress when there are too few repeated ordered paths to compare credibly
- emit `risky_sequence` only when repeated paths beat both matched-suffix peers and same-terminal-tool peers
- emit `golden_path` only when repeated paths beat those same peer cohorts on success

Every item carries a stable `trajectoryContext` block (SEQ-02): family id, suffix-peer bucket size, window length, and cohort semantics for auditability.

### Client divergence (`client_divergence`)

Pathloom compares normalized client cohorts:

- overall success rate
- average tools/session
- tool-level error rates for already-underperforming cohorts

Emission rules:

- suppress when client hints aren’t normalized in the dataset profile
- suppress when fewer than two clients are meaningfully represented
- emit cohort divergence before tool-level divergence
- only emit tool-level outliers for a client that is already underperforming at the cohort level

## v0.3 (activation)

### Activation tool report (`activation_tool_report`)

The promise: identify which first-session tools correlate with a second observed session.

The constraint: Pathloom must not make that claim unless the dataset can link sessions across the same actor with privacy-safe identity, and it must not blur observational cohort evidence into incremental-effect language.

#### Trust boundary

Profile-level gate:

- actor identity mode must be `stable_actor`
- identity privacy must be `hashed` or `pseudonymous`
- sessionization must be explicit enough to order actor journeys

Event-level gate:

- observed events must actually contain linked actor keys
- enough linked actors must exist to form cohorts

Consequence:

- a dataset can be activation-eligible “on paper” but still suppress activation if the event stream lacks linkage
- Pathloom refuses to backdoor retention claims through session ids or timestamps alone

#### Taxonomy

Activation language uses three layers:

- `candidate_return_correlate`
- `credible_cohort_signal`
- `incremental_effect_estimate` (reserved for future work)

Today, Pathloom emits the first two and explicitly does not claim the third.

#### Output shape

Items include exposed/control cohort sizes and return rates, confidence bands, and explicit `cohortContext` (ACT-02) so operators can audit what “return” means without reading implementation code.

