"use strict";

const { SOURCE_KINDS, FINDINGS } = require("@precisionutilityguild/pathloom/core");
const { directWrapperFixture, logfilePresenceOnlyFixture } = require("./analysisContractFixtures");
const { credibilityFixtures, sharedCatalog } = require("./credibilityFixtures");

function buildSequenceTerminalTrapEvents() {
  return [
    ["s1", "search", { limit: 5, q: "alpha" }, "success"],
    ["s1", "delete_record", { id: "d-1" }, "error"],
    ["s2", "search", { limit: 5, q: "beta" }, "success"],
    ["s2", "delete_record", { id: "d-2" }, "error"],
    ["s3", "search", { limit: 5, q: "gamma" }, "success"],
    ["s3", "delete_record", { id: "d-3" }, "error"],
    ["s4", "list", {}, "success"],
    ["s4", "delete_record", { id: "d-4" }, "error"],
    ["s5", "list", {}, "success"],
    ["s5", "delete_record", { id: "d-5" }, "error"],
    ["s6", "list", {}, "success"],
    ["s6", "delete_record", { id: "d-6" }, "error"],
  ].map(([sessionId, toolName, argumentsValue, outcome], index) => ({
    arguments: argumentsValue,
    clientHint: "Claude Desktop",
    invokedAt: index * 2 + 1,
    outcome,
    resolvedAt: index * 2 + 2,
    serverId: "demo-server",
    serverVersion: "1.0.0",
    sessionId,
    toolName,
  }));
}

const CALIBRATION_FAMILY_RISK_PROFILES = Object.freeze({
  [FINDINGS.DEAD_TOOLS]: {
    riskFocus: "day_one_false_positive",
    defaultMaxPressure: 0,
  },
  [FINDINGS.ARGUMENT_MISMATCH]: {
    riskFocus: "partial_evidence_overclaim",
    defaultMaxPressure: 0,
  },
  [FINDINGS.SESSION_TERMINATION]: {
    riskFocus: "thin_session_dead_end",
    defaultMaxPressure: 0,
  },
  [FINDINGS.SEQUENCE_RISK]: {
    riskFocus: "suffix_peer_and_deep_window_overclaim",
    defaultMaxPressure: 0,
  },
  [FINDINGS.CLIENT_DIVERGENCE]: {
    riskFocus: "mirror_cohort_noise",
    defaultMaxPressure: 0,
  },
  [FINDINGS.ACTIVATION]: {
    riskFocus: "observational_causal_drift",
    defaultMaxPressure: 0,
  },
});

/** Post-SEQ-02 coverage map for CAL-02 inventory. */
const CALIBRATION_COVERAGE_INVENTORY = Object.freeze([
  {
    familyId: FINDINGS.SEQUENCE_RISK,
    scenarios: [
      "sparse_launch_week",
      "degraded_presence_only",
      "sequence_terminal_tool_trap",
      "sequence_trajectory_honesty",
      "sequence_thin_volume_deep_gate",
    ],
    residualRisk: "client-fragmented cohorts without enough peer mass",
  },
  {
    familyId: FINDINGS.ACTIVATION,
    scenarios: [
      "sparse_launch_week",
      "degraded_presence_only",
      "activation_candidate_guardrail",
      "activation_observational_honesty",
      "sequence_trajectory_honesty",
    ],
    residualRisk: "time-based return windows and incremental-effect claims",
  },
]);

const CALIBRATION_FINDING_THRESHOLD_KEYS = Object.freeze({
  [FINDINGS.DEAD_TOOLS]: [
    "deadToolsMinSessions",
    "deadToolsMediumConfidenceSessions",
    "deadToolsHighConfidenceSessions",
  ],
  [FINDINGS.ARGUMENT_MISMATCH]: [
    "mismatchMinObservations",
    "mismatchMinProvidedObservations",
    "mismatchMinOccurrences",
    "mismatchMinRate",
  ],
  [FINDINGS.SESSION_TERMINATION]: [
    "terminationMinSessions",
    "terminationCandidateMinSessions",
    "terminationMinRate",
  ],
  [FINDINGS.SEQUENCE_RISK]: [
    "sequenceMinDistinctObservations",
    "sequenceMinPeerObservations",
    "sequenceMaxLength",
    "sequenceDeepMaxLength",
    "sequenceDeepMinSessions",
    "sequenceDeepMinOutcomeEvents",
    "sequenceDeepMinDistinctObservations",
    "sequenceDeepMinPeerObservations",
    "sequenceDeepMinErrorLift",
    "sequenceDeepMinTerminalErrorLift",
    "sequenceDeepMinSuccessLift",
    "sequenceDeepMinTerminalSuccessLift",
    "sequenceMinErrorLift",
    "sequenceMinTerminalErrorLift",
    "sequenceMinErrorRate",
    "sequenceMinSuccessLift",
    "sequenceMinTerminalSuccessLift",
    "sequenceMinSuccessRate",
  ],
  [FINDINGS.CLIENT_DIVERGENCE]: [
    "clientMinComparableSessions",
    "clientMinDistinctClients",
    "clientMinSuccessGap",
    "clientMinToolsGap",
    "clientToolMinObservations",
    "clientToolMinErrorRate",
    "clientToolErrorGap",
  ],
  [FINDINGS.ACTIVATION]: [
    "activationMinLinkedActors",
    "activationCandidateMinExposedActors",
    "activationCandidateMinControlActors",
    "activationCredibleMinExposedActors",
    "activationCredibleMinControlActors",
    "activationMinReturnedActors",
    "activationCandidateMinReturnRateDelta",
    "activationCredibleMinReturnRateDelta",
    "activationCandidateMinReturnRateMultiplier",
    "activationCredibleMinReturnRateMultiplier",
  ],
});

const calibrationFixtures = {
  sparse_launch_week: {
    catalog: sharedCatalog,
    dataset: {
      profile: directWrapperFixture,
      sourceKey: "calibration:sparse-launch-week",
      sourceKind: SOURCE_KINDS.WRAPPER,
    },
    events: credibilityFixtures.sparse_suppressed.events,
    kind: "sparse",
    calibrationExpectations: {
      maxPressure: 0,
      familyBudgets: {
        [FINDINGS.DEAD_TOOLS]: { maxPressure: 0 },
        [FINDINGS.SEQUENCE_RISK]: { maxPressure: 0 },
        [FINDINGS.ACTIVATION]: { maxPressure: 0 },
      },
      scenarioSummary:
        "Authoritative but tiny launch-week telemetry. High-risk findings must stay suppressed until repetition exists.",
      findings: {
        [FINDINGS.DEAD_TOOLS]: {
          blockedBy: ["insufficient_session_count"],
          status: "suppressed",
        },
        [FINDINGS.ARGUMENT_MISMATCH]: {
          claimScope: "full",
          level: "weak",
          maxItems: 0,
          status: "clear",
        },
        [FINDINGS.SESSION_TERMINATION]: {
          blockedBy: ["insufficient_session_count"],
          status: "suppressed",
        },
        [FINDINGS.SEQUENCE_RISK]: {
          blockedBy: ["insufficient_sequence_observations"],
          status: "suppressed",
        },
        [FINDINGS.CLIENT_DIVERGENCE]: {
          blockedBy: ["insufficient_client_variety"],
          status: "suppressed",
        },
        [FINDINGS.ACTIVATION]: {
          blockedBy: ["missing_observed_actor_linkage"],
          status: "suppressed",
        },
      },
    },
  },
  degraded_presence_only: {
    catalog: credibilityFixtures.degraded_narrowed.catalog,
    dataset: {
      profile: logfilePresenceOnlyFixture,
      sourceKey: "calibration:degraded-presence-only",
      sourceKind: SOURCE_KINDS.LOGFILE,
    },
    events: credibilityFixtures.degraded_narrowed.events,
    kind: "degraded",
    calibrationExpectations: {
      maxPressure: 0,
      familyBudgets: {
        [FINDINGS.SEQUENCE_RISK]: { maxPressure: 0 },
        [FINDINGS.CLIENT_DIVERGENCE]: { maxPressure: 0 },
        [FINDINGS.ACTIVATION]: { maxPressure: 0 },
      },
      scenarioSummary:
        "Logfile telemetry with presence-only argument evidence. Mismatch claims may narrow, but unsupported catalog, client, sequence, and activation claims must stay quiet.",
      findings: {
        [FINDINGS.DEAD_TOOLS]: {
          blockedBy: ["missing_tool_catalog_authority", "non_authoritative_tool_catalog"],
          status: "suppressed",
        },
        [FINDINGS.ARGUMENT_MISMATCH]: {
          claimScope: "narrowed",
          level: "credible",
          minItems: 1,
          status: "ready",
        },
        [FINDINGS.SESSION_TERMINATION]: {
          claimScope: "full",
          level: "credible",
          minItems: 1,
          status: "ready",
        },
        [FINDINGS.SEQUENCE_RISK]: {
          blockedBy: ["insufficient_sequence_observations"],
          status: "suppressed",
        },
        [FINDINGS.CLIENT_DIVERGENCE]: {
          blockedBy: ["missing_normalized_client_hints"],
          status: "suppressed",
        },
        [FINDINGS.ACTIVATION]: {
          blockedBy: ["missing_stable_actor_identity", "non_private_actor_identity"],
          status: "suppressed",
        },
      },
    },
  },
  activation_candidate_guardrail: {
    catalog: credibilityFixtures.activation_candidate_only.catalog,
    dataset: {
      profile: credibilityFixtures.activation_candidate_only.dataset.profile,
      sourceKey: "calibration:activation-candidate-guardrail",
      sourceKind: SOURCE_KINDS.WRAPPER,
    },
    events: credibilityFixtures.activation_candidate_only.events,
    kind: "adversarial",
    calibrationExpectations: {
      maxPressure: 0,
      familyBudgets: {
        [FINDINGS.ACTIVATION]: { maxPressure: 0 },
        [FINDINGS.SEQUENCE_RISK]: { maxPressure: 0 },
      },
      scenarioSummary:
        "Linked-actor telemetry that is promising but not yet strong enough for a credible activation finding. Candidate evidence must not self-promote into a warning.",
      findings: {
        [FINDINGS.DEAD_TOOLS]: {
          level: "credible",
          minItems: 1,
          status: "ready",
        },
        [FINDINGS.ARGUMENT_MISMATCH]: {
          claimScope: "full",
          level: "weak",
          maxItems: 0,
          status: "clear",
        },
        [FINDINGS.SESSION_TERMINATION]: {
          level: "credible",
          minItems: 1,
          status: "ready",
        },
        [FINDINGS.SEQUENCE_RISK]: {
          blockedBy: ["insufficient_sequence_observations"],
          status: "suppressed",
        },
        [FINDINGS.CLIENT_DIVERGENCE]: {
          blockedBy: ["insufficient_client_variety"],
          status: "suppressed",
        },
        [FINDINGS.ACTIVATION]: {
          claimScope: "full",
          itemMatch: {
            signalClass: "candidate_return_correlate",
          },
          level: "candidate",
          minItems: 1,
          status: "clear",
        },
      },
    },
  },
  sequence_terminal_tool_trap: {
    catalog: sharedCatalog.filter((entry) =>
      ["search", "list", "delete_record"].includes(entry.toolName),
    ),
    dataset: {
      profile: directWrapperFixture,
      sourceKey: "calibration:sequence-terminal-tool-trap",
      sourceKind: SOURCE_KINDS.WRAPPER,
    },
    events: buildSequenceTerminalTrapEvents(),
    kind: "adversarial",
    calibrationExpectations: {
      maxPressure: 0,
      familyBudgets: {
        [FINDINGS.SEQUENCE_RISK]: { maxPressure: 0 },
        [FINDINGS.SESSION_TERMINATION]: { maxPressure: 0 },
      },
      scenarioSummary:
        "Adversarial sequence dataset where the terminal tool is globally risky. Session termination may fire, but sequence mining must not hallucinate a predecessor-specific risky path.",
      findings: {
        [FINDINGS.DEAD_TOOLS]: {
          claimScope: "full",
          level: "weak",
          maxItems: 0,
          status: "clear",
        },
        [FINDINGS.ARGUMENT_MISMATCH]: {
          claimScope: "full",
          level: "weak",
          maxItems: 0,
          status: "clear",
        },
        [FINDINGS.SESSION_TERMINATION]: {
          level: "credible",
          minItems: 1,
          status: "ready",
        },
        [FINDINGS.SEQUENCE_RISK]: {
          claimScope: "full",
          forbiddenItemMatch: {
            pathKind: "risky_sequence",
            sequenceLabel: "search -> delete_record",
          },
          level: "weak",
          maxItems: 0,
          status: "clear",
        },
        [FINDINGS.CLIENT_DIVERGENCE]: {
          blockedBy: ["insufficient_client_variety"],
          status: "suppressed",
        },
        [FINDINGS.ACTIVATION]: {
          blockedBy: ["missing_observed_actor_linkage"],
          status: "suppressed",
        },
      },
    },
  },
  sequence_trajectory_honesty: {
    catalog: credibilityFixtures.authoritative_ready.catalog,
    dataset: {
      profile: directWrapperFixture,
      sourceKey: "calibration:sequence-trajectory-honesty",
      sourceKind: SOURCE_KINDS.WRAPPER,
    },
    events: credibilityFixtures.authoritative_ready.events,
    kind: "authoritative",
    calibrationExpectations: {
      maxPressure: 0,
      familyBudgets: {
        [FINDINGS.SEQUENCE_RISK]: { maxPressure: 0 },
        [FINDINGS.ACTIVATION]: { maxPressure: 0 },
      },
      scenarioSummary:
        "Authoritative repetition with SEQ-02 trajectory context. Ready sequence items must carry explicit family ids; activation must stay observational-only.",
      findings: {
        [FINDINGS.SEQUENCE_RISK]: {
          level: "credible",
          minItems: 1,
          requireTrajectoryContext: true,
          status: "ready",
        },
        [FINDINGS.ACTIVATION]: {
          level: "credible",
          minItems: 1,
          requireActivationCohortContext: true,
          requireEvidenceMatch: {
            diagnostics: {
              interpretation: "linked_cohort_association_only",
              returnWindow: {
                timingMode: "session_order_plus_invoked_at_gap",
              },
            },
          },
          status: "ready",
        },
      },
    },
  },
  sequence_thin_volume_deep_gate: {
    catalog: credibilityFixtures.authoritative_ready.catalog,
    dataset: {
      profile: directWrapperFixture,
      sourceKey: "calibration:sequence-thin-volume-deep-gate",
      sourceKind: SOURCE_KINDS.WRAPPER,
    },
    events: credibilityFixtures.authoritative_ready.events,
    kind: "adversarial",
    calibrationExpectations: {
      maxPressure: 0,
      familyBudgets: {
        [FINDINGS.SEQUENCE_RISK]: { maxPressure: 0 },
      },
      scenarioSummary:
        "Authoritative volume that is still below deep-window gates (<30 sessions). Sequence emission must stay at baseline window length even when trajectory context is present.",
      findings: {
        [FINDINGS.SEQUENCE_RISK]: {
          level: "credible",
          maxTrajectoryWindowLength: 3,
          minItems: 1,
          requireTrajectoryContext: true,
          status: "ready",
        },
      },
    },
  },
  activation_observational_honesty: {
    catalog: credibilityFixtures.authoritative_ready.catalog,
    dataset: {
      profile: directWrapperFixture,
      sourceKey: "calibration:activation-observational-honesty",
      sourceKind: SOURCE_KINDS.WRAPPER,
    },
    events: credibilityFixtures.authoritative_ready.events,
    kind: "authoritative",
    calibrationExpectations: {
      maxPressure: 0,
      familyBudgets: {
        [FINDINGS.ACTIVATION]: { maxPressure: 0 },
      },
      scenarioSummary:
        "Credible activation signals must keep linked-cohort interpretation limits visible and must not promote candidate-only cohorts into warnings.",
      findings: {
        [FINDINGS.ACTIVATION]: {
          forbiddenItemMatch: {
            signalClass: "candidate_return_correlate",
          },
          level: "credible",
          minItems: 1,
          requireActivationCohortContext: true,
          requireEvidenceMatch: {
            diagnostics: {
              interpretation: "linked_cohort_association_only",
              returnWindow: {
                claimBoundary: "not_incremental_effect_not_causal",
                kind: "next_observed_session",
                timingMode: "session_order_plus_invoked_at_gap",
              },
            },
          },
          status: "ready",
        },
      },
    },
  },
};

export {
  CALIBRATION_COVERAGE_INVENTORY,
  CALIBRATION_FAMILY_RISK_PROFILES,
  CALIBRATION_FINDING_THRESHOLD_KEYS,
  calibrationFixtures,
};
