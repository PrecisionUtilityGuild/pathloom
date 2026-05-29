# Pathloom Report

Source: `wrapper:demo`
Generated: <generated-at>
Sessions: 29
Events: 49
Catalog tools: 6
Telemetry: sessions explicit_session_id; trace none; span lineage none; first-class fields none

## Activation tool report

query correlated with 83% second-session return in the linked cohort at 14.17x the return rate of the rest of the cohort.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

Interpretation limits:
- Linked-cohort association only: Pathloom is not estimating incremental effect or causal lift here (not_incremental_effect_not_causal).
- Return window: second_observed_session (session_order_plus_invoked_at_gap). Return means the actor had a later observed session. Pathloom also reports immediate (exactly two sessions) vs sustained (three or more) return shapes and median invoked-at gap between first and second sessions when timestamps exist. This is still observational — not incremental lift or causal timing. Aggregate timing: 6 returning actors (6 immediate next-session, 0 sustained multi-session; median invoked-at gap 8).
- Confounding risk: high; tool exposure is observational rather than randomized; actors who use a tool may differ from the control cohort before exposure; invoked-at gaps are descriptive timing only, not elapsed-time causal windows.
- Actor linkage gate: 23 linked actors satisfied the privacy-safe cohort requirement.

- `query` is a credible cohort signal: 5/6 linked actors who used it in session 1 returned for a second observed session (83%) versus 6% for the linked control cohort (14.17x the control-group return rate). 95% interval 44-97% vs control 1-27% Cohort `activation:query:first_session_exposure`: linked actors who invoked query in their first observed session vs linked actors without query in their first observed session (5 immediate next-session returns, 0 sustained multi-session returns; median invoked-at gap to return 8).

Recommendation: Surface this tool earlier in onboarding and make its value legible, because it is the strongest confidence-backed cohort return signal in this dataset.

## Sequence risk map (4)

2 targeted failure paths and 2 reusable success paths crossed the emission threshold.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

- `search -> create` reliably precedes the `create` failure endpoint: 100% errors across 3 repeated paths. other routes into create fail 0% across 3 peer paths, and other routes ending at create fail 33%; seen in cursor only. Trajectory family `terminal:create:suffix_tail:create:len:2:risky_sequence` (2-hop): other routes into create; compared vs 3 suffix-peer observations (ordered paths sharing terminal tool and suffix peer bucket excludes focus path; 2 distinct paths in the peer bucket).
- `search -> list` reliably precedes the `list` failure endpoint: 100% errors across 3 repeated paths. other routes into list fail 0% across 11 peer paths, and other routes ending at list fail 0%; seen in claude-desktop only. Trajectory family `terminal:list:suffix_tail:list:len:2:risky_sequence` (2-hop): other routes into list; compared vs 11 suffix-peer observations (ordered paths sharing terminal tool and suffix peer bucket excludes focus path; 2 distinct paths in the peer bucket).
- `query -> list` is a reusable success path into `list`: 100% success across 11 repeated paths. other routes into list succeed 0% across 3 peer paths, and other routes ending at list succeed 67%; seen in claude-desktop only. Trajectory family `terminal:list:suffix_tail:list:len:2:golden_path` (2-hop): other routes into list; compared vs 3 suffix-peer observations (ordered paths sharing terminal tool and suffix peer bucket excludes focus path; 2 distinct paths in the peer bucket).
- `list -> create` is a reusable success path into `create`: 100% success across 3 repeated paths. other routes into create succeed 0% across 3 peer paths, and other routes ending at create succeed 17%; seen in claude-desktop only. Trajectory family `terminal:create:suffix_tail:create:len:2:golden_path` (2-hop): other routes into create; compared vs 3 suffix-peer observations (ordered paths sharing terminal tool and suffix peer bucket excludes focus path; 2 distinct paths in the peer bucket).

Recommendation: Focus on the highest-lift failure endpoint first. Tighten the handoff into that terminal tool or add a safer bridge before the failing step.

## Dead tools (2)

2 registered tools had zero calls across 29 sessions.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

- `bulk_export` recorded 0 calls across the analysis window (confidence: high).
- `delete_record` recorded 0 calls across the analysis window (confidence: high).

Recommendation: Remove these tools, rename them, or improve their descriptions before adding more surface area.

## Client divergence (2)

2 client-level divergence patterns crossed the emission threshold.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

- `cursor` averages 2 tools/session with 50% success (peer baseline: 84%, 1.65 tools/session).
- `cursor` underperforms on `create` with 100% errors (peer baseline: 33%).

Recommendation: Review the worst client-specific path first. Divergence this large usually means descriptions, examples, or affordances are landing differently across clients.

## Argument mismatch patterns (2)

2 recurring argument mismatch patterns crossed the emission threshold.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

- `create` is often missing required argument `userId` (56% of 9 calls).
- `search` often sends `limit` as `array:string` but expects `number` (33% of 9 calls).

Recommendation: Improve the descriptions or schemas for the highest-rate mismatches before shipping more tools around them.

## Session termination analysis (2)

list was the most common termination tool, and 2 candidate dead-end patterns crossed the emission threshold.

Evidence strength: **Credible finding** (full claim)

The dataset supported the full claim, and the observed pattern cleared the emission threshold.

- `create` ends 9/9 reached sessions (100%), classified as `possible_dead_end`.
- `list` ends 17/20 reached sessions (85%), classified as `possible_dead_end`.

Recommendation: Shorten the path into a successful next action after this tool, or make the expected follow-up clearer.
