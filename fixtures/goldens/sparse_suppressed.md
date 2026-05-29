# Pathloom Report

Source: `wrapper:sparse`
Generated: <generated-at>
Sessions: 2
Events: 2
Catalog tools: 6
Telemetry: sessions explicit_session_id; trace none; span lineage none; first-class fields none

## Argument mismatch patterns

No recurring argument confusion patterns crossed the emission threshold.

Evidence strength: **Weak signal** (full claim)

The dataset could evaluate this claim, but no pattern crossed the emission threshold strongly enough to emit a product finding.

## Suppressed findings

### Dead tools

Dead-tool findings stay quiet until the dataset has enough sessions to avoid day-one false positives.

Evidence strength: **Unsupported** (full claim)

The dataset does not support this claim. Dataset can support unused-tool claims because the registered tool inventory is authoritative. Blocked by: insufficient_session_count.

### Session termination analysis

Termination analysis stays quiet until enough sessions exist to distinguish dead ends from noise.

Evidence strength: **Unsupported** (full claim)

The dataset does not support this claim. Dataset supports identifying where sessions end and which tools correlate with dead ends. Blocked by: insufficient_session_count.

### Sequence risk map

Sequence findings stay quiet until Pathloom has enough repeated ordered paths to compare against baseline behavior.

Evidence strength: **Unsupported** (full claim)

The dataset does not support this claim. Dataset supports comparing sequence outcomes against baseline behavior. Blocked by: insufficient_sequence_observations.

### Client divergence

Client divergence needs at least two meaningfully represented clients before differences can be trusted.

Evidence strength: **Unsupported** (full claim)

The dataset does not support this claim. Dataset can compare tool usage and outcomes across normalized clients. Blocked by: insufficient_client_variety.

### Activation tool report

Activation findings stay quiet until privacy-safe actor linkage is actually present in the observed event stream, not just declared in the dataset profile.

Evidence strength: **Unsupported** (full claim)

The dataset does not support this claim. Dataset supports privacy-safe return-cohort analysis for activation-style findings. Blocked by: missing_observed_actor_linkage.
