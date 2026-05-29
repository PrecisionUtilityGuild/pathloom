# Pathloom Report

Source: `logfile:liquid-shadow-dogfood`
Generated: 2026-05-29T07:40:46.834Z
Sessions: 18
Events: 42
Catalog tools: 6
Telemetry: sessions explicit_session_id; trace none; span lineage none; first-class fields none

## Activation tool report

shadow_ops_context correlated with 100% second-session return in the linked cohort with no control-group returns observed.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

Interpretation limits:
- Linked-cohort association only: Pathloom is not estimating incremental effect or causal lift here (not_incremental_effect_not_causal).
- Return window: second_observed_session (session_order_plus_invoked_at_gap). Return means the actor had a later observed session. Pathloom also reports immediate (exactly two sessions) vs sustained (three or more) return shapes and median invoked-at gap between first and second sessions when timestamps exist. This is still observational — not incremental lift or causal timing. Aggregate timing: 6 returning actors (6 immediate next-session, 0 sustained multi-session; median invoked-at gap 1135).
- Confounding risk: high; tool exposure is observational rather than randomized; actors who use a tool may differ from the control cohort before exposure; invoked-at gaps are descriptive timing only, not elapsed-time causal windows.
- Actor linkage gate: 12 linked actors satisfied the privacy-safe cohort requirement.

- `shadow_ops_context` is a credible cohort signal: 6/6 linked actors who used it in session 1 returned for a second observed session (100%) versus 0% for the linked control cohort with no control-group returns observed. 95% interval 61-100% vs control 0-39% Cohort `activation:shadow_ops_context:first_session_exposure`: linked actors who invoked shadow_ops_context in their first observed session vs linked actors without shadow_ops_context in their first observed session (6 immediate next-session returns, 0 sustained multi-session returns; median invoked-at gap to return 1135).

Recommendation: Surface this tool earlier in onboarding and make its value legible, because it is the strongest confidence-backed cohort return signal in this dataset.

## Dead tools (2)

2 registered tools had zero calls across 18 sessions.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

- `shadow_workspace_gc` recorded 0 calls across the analysis window (confidence: medium).
- `shadow_workspace_status` recorded 0 calls across the analysis window (confidence: medium).

Recommendation: Remove these tools, rename them, or improve their descriptions before adding more surface area.

## Sequence risk map (2)

1 targeted failure path and 1 reusable success path crossed the emission threshold.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

- `shadow_search_path -> shadow_inspect_file` reliably precedes the `shadow_inspect_file` failure endpoint: 100% errors across 6 repeated paths. other routes into shadow_inspect_file fail 0% across 6 peer paths, and other routes ending at shadow_inspect_file fail 0%; seen in cursor only. Trajectory family `terminal:shadow_inspect_file:suffix_tail:shadow_inspect_file:len:2:risky_sequence` (2-hop): other routes into shadow_inspect_file; compared vs 6 suffix-peer observations (ordered paths sharing terminal tool and suffix peer bucket excludes focus path; 2 distinct paths in the peer bucket).
- `shadow_search_concept -> shadow_inspect_file` is a reusable success path into `shadow_inspect_file`: 100% success across 6 repeated paths. other routes into shadow_inspect_file succeed 0% across 6 peer paths, and other routes ending at shadow_inspect_file succeed 0%; seen in claude-desktop only. Trajectory family `terminal:shadow_inspect_file:suffix_tail:shadow_inspect_file:len:2:golden_path` (2-hop): other routes into shadow_inspect_file; compared vs 6 suffix-peer observations (ordered paths sharing terminal tool and suffix peer bucket excludes focus path; 2 distinct paths in the peer bucket).

Recommendation: Focus on the highest-lift failure endpoint first. Tighten the handoff into that terminal tool or add a safer bridge before the failing step.

## Client divergence (2)

2 client-level divergence patterns crossed the emission threshold.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

- `cursor` averages 2 tools/session with 50% success (peer baseline: 100%, 2.5 tools/session).
- `cursor` underperforms on `shadow_inspect_file` with 100% errors (peer baseline: 0%).

Recommendation: Review the worst client-specific path first. Divergence this large usually means descriptions, examples, or affordances are landing differently across clients.

## Argument mismatch patterns (2)

2 recurring argument mismatch patterns crossed the emission threshold.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

- `shadow_inspect_file` often sends `filePath` as `array:string` but expects `string` (33% of 9 provided calls).
- `shadow_inspect_file` is often missing required argument `filePath` (25% of 12 calls).

Recommendation: Improve the descriptions or schemas for the highest-rate mismatches before shipping more tools around them.

## Session termination analysis (2)

shadow_inspect_file was the most common termination tool, and 0 candidate dead-end patterns crossed the emission threshold.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

- `shadow_inspect_file` ends 12/12 reached sessions (100%), classified as `likely_natural_exit`.
- `shadow_search_concept` ends 6/12 reached sessions (50%), classified as `likely_natural_exit`.

Recommendation: Double-check whether these session endings are intentional completions or a sign the tool is acting like a stopping point.
