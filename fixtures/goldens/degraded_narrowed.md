# Pathloom Report

Source: `logfile:demo`
Generated: <generated-at>
Sessions: 4
Events: 4
Catalog tools: 1
Telemetry: sessions explicit_session_id; trace none; span lineage none; first-class fields none

## Argument mismatch patterns (1)

1 recurring missing-argument pattern crossed the emission threshold.

Evidence strength: **Credible finding** (narrowed claim)

The dataset only supported a safer subset of the full claim, and the observed pattern cleared the emission threshold within that narrower scope.

- `create` is often missing required argument `userId` (67% of 3 calls).

Recommendation: Improve the descriptions or schemas for the highest-rate mismatches before shipping more tools around them.

## Session termination analysis (1)

create was the most common termination tool, and 1 candidate dead-end pattern crossed the emission threshold.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

- `create` ends 3/3 reached sessions (100%), classified as `possible_dead_end`.

Recommendation: Shorten the path into a successful next action after this tool, or make the expected follow-up clearer.

## Suppressed findings

### Dead tools

Dead-tool findings require an authoritative tool catalog. Observed call absence alone is never enough.

Evidence strength: **Unsupported** (suppressed claim)

The dataset does not support this claim. Dead-tool findings require an authoritative tool catalog. Observed call absence alone is never enough. Blocked by: missing_tool_catalog_authority, non_authoritative_tool_catalog.

### Sequence risk map

Sequence findings stay quiet until Pathloom has enough repeated ordered paths to compare against baseline behavior.

Evidence strength: **Unsupported** (full claim)

The dataset does not support this claim. Dataset supports comparing sequence outcomes against baseline behavior. Blocked by: insufficient_sequence_observations.

### Client divergence

Client divergence requires normalized client hints rather than free-form labels.

Evidence strength: **Unsupported** (suppressed claim)

The dataset does not support this claim. Client divergence requires normalized client hints rather than free-form labels. Blocked by: missing_normalized_client_hints.

### Activation tool report

Activation analysis requires privacy-safe actor linkage across sessions. Session IDs alone are insufficient.

Evidence strength: **Unsupported** (suppressed claim)

The dataset does not support this claim. Activation analysis requires privacy-safe actor linkage across sessions. Session IDs alone are insufficient. Blocked by: missing_stable_actor_identity, non_private_actor_identity.
