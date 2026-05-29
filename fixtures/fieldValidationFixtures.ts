"use strict";

const { SOURCE_KINDS } = require("@precisionutilityguild/pathloom/core");
const { directWrapperFixture, logfilePresenceOnlyFixture } = require("./analysisContractFixtures");
const { credibilityFixtures, sharedCatalog } = require("./credibilityFixtures");

const fieldValidationFixtures = {
  cursor_onboarding_gap: {
    catalog: sharedCatalog,
    dataset: {
      profile: directWrapperFixture,
      sourceKey: "validation:cursor-onboarding-gap",
      sourceKind: SOURCE_KINDS.WRAPPER,
    },
    events: credibilityFixtures.authoritative_ready.events,
    reviewExpectations: {
      affirmedFindings: [
        {
          id: "activation_tool_report",
          itemMatch: {
            issueType: "activation_tool",
            toolName: "query",
          },
        },
        {
          id: "client_divergence",
          itemMatch: {
            clientHint: "cursor",
            issueType: "client_outlier",
          },
        },
        {
          id: "session_termination_analysis",
          itemMatch: {
            classification: "possible_dead_end",
            toolName: "list",
          },
        },
      ],
      calibrationChecks: [
        {
          id: "client_divergence",
          kind: "finding_items_include",
          itemMatch: {
            clientHint: "cursor",
            issueType: "tool_outlier",
            toolName: "create",
          },
        },
      ],
      challengedFindings: [
        {
          id: "dead_tool_detection",
          note: "Field review should verify the authoritative catalog still reflects the public tool surface before treating removal as immediate product work.",
        },
      ],
      scenarioSummary:
        "Scrubbed-equivalent authoritative dataset for a multi-client server where Cursor underperforms during onboarding, query predicts return, and list behaves like a dead-end entry surface.",
      suppressedFindings: [],
    },
  },
  logfile_handoff_gap: {
    catalog: credibilityFixtures.degraded_narrowed.catalog,
    dataset: {
      profile: logfilePresenceOnlyFixture,
      sourceKey: "validation:logfile-handoff-gap",
      sourceKind: SOURCE_KINDS.LOGFILE,
    },
    events: credibilityFixtures.degraded_narrowed.events,
    reviewExpectations: {
      affirmedFindings: [
        {
          id: "argument_mismatch_patterns",
          itemMatch: {
            argumentName: "userId",
            issueType: "missing_required_argument",
            toolName: "create",
          },
        },
      ],
      calibrationChecks: [
        {
          id: "argument_mismatch_patterns",
          kind: "all_items_match",
          itemMatch: {
            issueType: "missing_required_argument",
          },
        },
      ],
      challengedFindings: [],
      scenarioSummary:
        "Scrubbed-equivalent logfile dataset for a handoff workflow where only presence-level argument evidence exists. Pathloom should still surface the recurring missing userId problem while refusing stronger claims.",
      suppressedFindings: [
        {
          id: "activation_tool_report",
        },
        {
          id: "dead_tool_detection",
        },
      ],
    },
  },
  launch_week_underpowered: {
    catalog: sharedCatalog,
    dataset: {
      profile: directWrapperFixture,
      sourceKey: "validation:launch-week-underpowered",
      sourceKind: SOURCE_KINDS.WRAPPER,
    },
    events: credibilityFixtures.sparse_suppressed.events,
    reviewExpectations: {
      affirmedFindings: [
        {
          id: "argument_mismatch_patterns",
        },
      ],
      calibrationChecks: [
        {
          id: "argument_mismatch_patterns",
          kind: "finding_summary_equals",
          summary: "No recurring argument confusion patterns crossed the emission threshold.",
        },
      ],
      challengedFindings: [],
      scenarioSummary:
        "Scrubbed-equivalent launch-week dataset with authoritative capture but too little repetition to justify confident operational claims.",
      suppressedFindings: [
        {
          blockedBy: "insufficient_session_count",
          id: "dead_tool_detection",
        },
        {
          blockedBy: "insufficient_session_count",
          id: "session_termination_analysis",
        },
        {
          blockedBy: "missing_observed_actor_linkage",
          id: "activation_tool_report",
        },
      ],
    },
  },
};

export { fieldValidationFixtures };
