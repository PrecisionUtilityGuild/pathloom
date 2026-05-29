# Pathloom Analysis Contract

This document resolves the trust-critical semantics underneath the README promises. It is the architectural contract for when Pathloom is allowed to emit a finding, when it must narrow a claim, and when it must stay silent.

## Why this exists

Pathloom's product promise is stronger than "compute metrics from telemetry." It promises deploy-actionable findings that server authors can trust.

That means three common shortcuts are off-limits:

1. We do not infer retention from session IDs alone.
2. We do not infer dead tools from a call log without an authoritative tool catalog.
3. We do not claim argument type confusion unless we have evidence for both the expected schema and the observed argument shape/value.

The architecture in [src/core/analysisContract.ts](/Users/a14a/Documents/pathloom/src/core/analysisContract.ts:1) turns those rules into an executable contract.

## Core principle

Pathloom findings are gated by evidence dimensions, not adapter names.

A source like "OTel" or "logfile" does not automatically grant or remove capability. Instead, each dataset advertises what kind of evidence it actually contains:

- `actorIdentity`
- `toolCatalog`
- `schemaEvidence`
- `provenance`
- `telemetrySpine`

Findings are evaluated against those evidence dimensions and end in one of three states:

- `eligible`: Pathloom can make the full claim.
- `narrowed`: Pathloom can emit a smaller, safer claim.
- `suppressed`: Pathloom must not emit the finding.

Those support states are internal entitlement decisions. The product surface now maps them into a shared uncertainty vocabulary that every rendered finding carries:

- `credible`: the entitled claim cleared the emission threshold
- `candidate`: the pattern is promising but below the threshold for a product finding
- `weak`: the dataset could evaluate the claim, but the observed pattern stayed below threshold
- `unsupported`: the dataset could not support the claim Pathloom would otherwise want to make

The product surface also records claim scope separately:

- `full`: the full claim is entitled
- `narrowed`: only a safer subset is entitled
- `suppressed`: the claim must be withheld

That separation is deliberate:

- support status answers "what is Pathloom allowed to claim?"
- uncertainty level answers "how strong is the emitted or withheld signal?"
- claim scope answers "how much of the original product claim survived contract narrowing?"

## Resolution 1: Cross-session identity architecture

Retention and activation findings are the highest-risk area for accidental overclaiming.

### Sanctioned identity modes

- `none`: no cross-session identity exists.
- `session_only`: sessions are identifiable, but cannot be linked across sessions to the same actor.
- `stable_actor`: a privacy-safe actor key can link multiple sessions for the same actor.

### Privacy requirement

`stable_actor` is valid only when the identity is:

- `hashed`, or
- `pseudonymous`

Raw actor identifiers are not a sanctioned Pathloom input for retention analysis.

### Consequence

- `session_only` is enough for session termination and sequence analysis.
- `session_only` is not enough for activation or retention claims.
- `stable_actor` plus privacy-safe identity is required before Pathloom can evaluate return cohorts.

This deliberately prevents the team from "sneaking in" retention logic via session IDs or timestamps.

## Resolution 2: Tool catalog authority architecture

Dead-tool detection is not an observational problem alone. It is a catalog-authority problem.

### Allowed authority sources

- `runtime_registration`
  Direct wrapper mode observes which tools were actually registered by the server.
- `explicit_manifest`
  A declared tool manifest is provided alongside the dataset.
- `external_catalog`
  A separate catalog source is provided and declared authoritative.
- `none`
  No authoritative inventory exists.

### Completeness levels

- `authoritative`
- `partial`
- `none`

### Consequence

Pathloom may emit dead-tool findings only when:

- catalog authority is not `none`, and
- completeness is `authoritative`

Observed absence in telemetry is never enough on its own. Without an authoritative catalog, Pathloom may later support softer "unobserved tools" language, but it must not claim true dead tools.

## Resolution 3: Argument evidence architecture

Argument mismatch findings depend on two independent evidence streams:

1. expected schema evidence
2. observed argument evidence

### Expected schema evidence

- `runtime_schema`
- `manifest_schema`
- `declared_contract`
- `none`

### Observed argument evidence

- `none`
- `presence_only`
  We can see whether an argument key was sent, but not its shape or value.
- `shape_only`
  We can inspect array/object/primitive shape and compatible type categories.
- `full_values`
  We can inspect full values and perform enum/value checks.

### Consequence

- Missing-required-argument claims require expected schema plus at least `presence_only`.
- Wrong-type or wrong-shape claims require expected schema plus at least `shape_only`.
- Invalid value or enum misuse claims require expected schema plus `full_values`.

This is a central Pathloom behavior: when evidence gets thinner, the finding narrows instead of disappearing into a vague average.

## Resolution 4: Provenance and sequencing architecture

Several findings depend on trustworthy session and ordering semantics:

- session termination analysis
- sequence risk map
- activation tool report

### Provenance dimensions

- `sessionization`
  - `none`
  - `explicit_session_id`
  - `derived_session`
- `eventOrder`
  - `none`
  - `timestamps_only`
  - `per_session_order`
- `lifecycleOutcomes`
  - `none`
  - `final_outcome`
  - `full_lifecycle`
- `clientHints`
  - `none`
  - `normalized`

### Consequence

- Session termination needs `sessionization` plus `eventOrder`.
- Sequence risk needs `sessionization`, `per_session_order`, and outcome evidence.
- Client divergence needs normalized client hints.
- Activation additionally needs the sanctioned cross-session identity model.

## Resolution 5: Trace-compatible telemetry boundary

Pathloom can preserve useful trace structure without redefining its product around generic observability.

### First-class canonical fields

These fields are now first-class on normalized events when the source provides them:

- `traceId`
- `spanId`
- `parentSpanId`
- `sessionIdSource`

That split matters:

- `sessionId` remains the sequence-analysis boundary Pathloom uses for per-session ordering.
- `traceId` is preserved separately and must not be treated as identical to session identity.
- `sessionIdSource` makes that distinction executable:
  - `explicit`
  - `trace_fallback`
  - `unknown`

### Compatibility boundary

Pathloom adopts this compatibility rule:

- canonical core:
  - actor linkage
  - session identity
  - trace identity
  - span lineage
- preserved but non-canonical provenance:
  - broader OpenTelemetry attribute bags
  - resource attributes
  - Langfuse prompt, generation, trace, and score surfaces
  - imported model and prompt identifiers

The goal is to preserve downstream evidence without turning every external tracing abstraction into a Pathloom product primitive.

### Consequence

- later sequence work can reason over session paths without collapsing trace identity into the same concept
- later activation work can keep actor and session semantics separate even when trace-rich telemetry is imported
- richer telemetry does not widen claim entitlement by itself; it only adds structure that later findings may choose to use explicitly

## Eligibility matrix

| Finding                | Minimum contract                                      | Narrowing behavior                                                                   |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Dead tool detection    | Authoritative tool catalog                            | Suppress entirely if catalog is missing or partial                                   |
| Argument mismatch      | Expected schema + observed arguments                  | Narrow from missing + type + value claims down to missing-only when evidence is thin |
| Session termination    | Sessionization + per-session order                    | Suppress if sessions cannot be trusted                                               |
| Sequence risk          | Sessionization + per-session order + outcome evidence | Suppress if ordering or outcomes are too weak                                        |
| Client divergence      | Normalized client hints                               | Suppress if client labels are not normalized                                         |
| Activation tool report | Privacy-safe stable actor + sessionization            | Suppress if only session-level identity exists                                       |

## Suppression and degradation policy

Pathloom prefers principled non-findings over weak findings.

The contract therefore distinguishes:

- support status `suppressed`: the dataset cannot support this finding at all
- support status `narrowed`: the dataset supports a safer subset of the claim
- support status `eligible`: the full claim is allowed

And the rendered finding surface distinguishes:

- uncertainty `unsupported`: the claim is not supportable with this dataset
- uncertainty `weak`: the claim is supportable in principle, but the observed pattern is too faint
- uncertainty `candidate`: the pattern is interesting and visible, but not yet promotion-worthy
- uncertainty `credible`: the observed pattern is strong enough to appear as a Pathloom finding

Examples:

- A logfile with only argument presence may still support "missing required arguments" but not "wrong type."
- An OTel dataset with an external authoritative catalog may support dead-tool detection even if it did not come from the wrapper.
- A wrapper dataset without privacy-safe actor linkage still may not emit activation findings.

## What this unlocks downstream

Mission 2 is complete only if later implementation can reuse this contract directly.

That is why the repository now includes:

- [src/core/analysisContract.ts](/Users/a14a/Documents/pathloom/src/core/analysisContract.ts:1)
  Executable evidence and finding gating logic.
- [fixtures/analysisContractFixtures.ts](/Users/a14a/Documents/pathloom/fixtures/analysisContractFixtures.ts:1)
  Representative datasets for full, partial, and invalid evidence conditions.
- [tests/analysisContract.test.ts](/Users/a14a/Documents/pathloom/tests/analysisContract.test.ts:1)
  Regression tests that prove Pathloom narrows or suppresses findings correctly.

## Architectural standard going forward

Any new adapter or finding must answer these questions before shipping:

1. What evidence dimensions does this source actually provide?
2. Which findings become eligible, narrowed, or suppressed as a result?
3. What claim would Pathloom be making that it is not truly entitled to make?

If that answer is unclear, the finding is not ready to ship.
