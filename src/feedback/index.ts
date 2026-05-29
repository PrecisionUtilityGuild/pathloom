"use strict";

import type {
  AdjudicationRecord,
  FeedbackPolicyKind,
  FeedbackPolicySuggestion,
  FeedbackReview,
  FeedbackTarget,
  ReportSnapshot,
} from "../core/types";

const {
  PATHLOOM_FEEDBACK_REVIEW_SCHEMA_VERSION,
  validateAdjudicationRecord,
  validateFeedbackReview,
} = require("../contracts") as typeof import("../contracts");
const { createFindingTargetId, describeFindingTarget } =
  require("../history") as typeof import("../history");

export const FEEDBACK_REVIEW_VERSION = PATHLOOM_FEEDBACK_REVIEW_SCHEMA_VERSION;
export const FEEDBACK_POLICY_APPLIES_TO = "feedback_review_only" as const;

export function buildFeedbackPolicyId(
  findingId: string,
  policyKind: FeedbackPolicyKind,
  adjudicationStatus: string,
): string {
  return `feedback.policy.${policyKind}.${findingId}.${adjudicationStatus}`;
}

function policyKindForAdjudicationStatus(status: string): FeedbackPolicyKind {
  if (status === "noisy" || status === "accepted") {
    return "ranking_pressure";
  }

  if (status === "misleading") {
    return "wording_adjustment";
  }

  if (status === "missing_context") {
    return "evidence_request";
  }

  return "ranking_pressure";
}

function policyEffectForStatus(status: string): string {
  if (status === "noisy") {
    return "deprioritize_or_tighten";
  }

  if (status === "accepted") {
    return "stabilize_or_promote";
  }

  if (status === "misleading") {
    return "reword_or_hold_back";
  }

  if (status === "missing_context") {
    return "collect_more_context";
  }

  return "review";
}

function createPolicySuggestion(
  findingId: string,
  status: string,
  count: number,
  snapshotCount: number,
  recommendation: string,
  suggestedAction: string,
): FeedbackPolicySuggestion {
  const policyKind = policyKindForAdjudicationStatus(status);

  return {
    adjudicationCount: count,
    adjudicationStatus: status,
    appliesTo: FEEDBACK_POLICY_APPLIES_TO,
    effect: policyEffectForStatus(status),
    findingId,
    policyId: buildFeedbackPolicyId(findingId, policyKind, status),
    policyKind,
    recommendation,
    reversible: true,
    snapshotCount,
    suggestedAction,
  };
}

export function listFeedbackTargets(snapshot: ReportSnapshot): FeedbackTarget[] {
  const targets = [];

  for (const finding of snapshot.reportDocument.findings) {
    if (finding.items.length === 0) {
      targets.push({
        findingId: finding.id,
        findingStatus: finding.status,
        targetId: `${finding.id}::summary`,
        targetKind: "active_summary",
        targetLabel: finding.title,
        title: finding.title,
      });
      continue;
    }

    for (const item of finding.items) {
      targets.push({
        findingId: finding.id,
        findingStatus: finding.status,
        targetId: createFindingTargetId(finding.id, item),
        targetKind: "active_item",
        targetLabel: describeFindingTarget(finding, item),
        title: finding.title,
      });
    }
  }

  for (const finding of snapshot.reportDocument.suppressedFindings) {
    targets.push({
      findingId: finding.id,
      findingStatus: finding.status,
      targetId: `${finding.id}::suppressed`,
      targetKind: "suppressed_finding",
      targetLabel: finding.title,
      title: finding.title,
    });
  }

  return targets;
}

export function createAdjudicationRecord(
  snapshot: ReportSnapshot,
  target: FeedbackTarget,
  options: {
    adjudicationStatus?: string;
    createdAt?: string;
    note?: string | null;
    timestamp?: number | string;
  } = {},
): AdjudicationRecord {
  const now = new Date(options.timestamp || Date.now()).toISOString();
  const record = {
    adjudicationStatus: options.adjudicationStatus,
    createdAt: options.createdAt || now,
    findingId: target.findingId,
    note: options.note || null,
    snapshotKey: snapshot.snapshotKey,
    sourceKey: snapshot.sourceKey,
    targetId: target.targetId,
    targetKind: target.targetKind,
    targetLabel: target.targetLabel,
    updatedAt: now,
  };

  const validation = validateAdjudicationRecord(record);
  if (!validation.valid) {
    throw new Error(`Invalid adjudication record: ${validation.errors.join(" ")}`);
  }

  return record;
}

export function resolveFeedbackTarget(
  snapshot: ReportSnapshot,
  options: { findingId?: string; itemLabel?: string; targetId?: string } = {},
): FeedbackTarget {
  const targets = listFeedbackTargets(snapshot);

  if (options.targetId) {
    const match = targets.find((target) => target.targetId === options.targetId);
    if (!match) {
      throw new Error(`Unknown feedback target: ${options.targetId}`);
    }

    return match;
  }

  if (!options.findingId) {
    throw new Error("Adjudication requires --finding <id> or --target <target-id>.");
  }

  const findingTargets = targets.filter((target) => target.findingId === options.findingId);
  if (findingTargets.length === 0) {
    throw new Error(`Unknown finding: ${options.findingId}`);
  }

  if (options.itemLabel) {
    const matches = findingTargets.filter(
      (target) => target.targetLabel === options.itemLabel || target.targetId === options.itemLabel,
    );

    if (matches.length === 0) {
      throw new Error(
        `No feedback target matched item '${options.itemLabel}' for finding ${options.findingId}.`,
      );
    }

    if (matches.length > 1) {
      throw new Error(
        `Item '${options.itemLabel}' matched multiple targets for finding ${options.findingId}; use --target for an exact target id.`,
      );
    }

    return matches[0];
  }

  if (findingTargets.length > 1) {
    throw new Error(
      `Finding ${options.findingId} has multiple feedback targets; pass --item <label> or --target <target-id>.`,
    );
  }

  return findingTargets[0];
}

function countByStatus(adjudications, status) {
  return adjudications.filter((record) => record.adjudicationStatus === status).length;
}

function createStatusCounts() {
  return {
    accepted: 0,
    misleading: 0,
    missing_context: 0,
    noisy: 0,
  };
}

function incrementStatusCount(counts, status) {
  if (Object.prototype.hasOwnProperty.call(counts, status)) {
    counts[status] += 1;
  }
}

function strongestStatus(counts) {
  const ordered = ["misleading", "missing_context", "noisy", "accepted"];
  let bestStatus = null;
  let bestCount = 0;

  for (const status of ordered) {
    if (counts[status] > bestCount) {
      bestStatus = status;
      bestCount = counts[status];
    }
  }

  return {
    count: bestCount,
    status: bestStatus,
  };
}

function normalizeHistoricalReview(historicalAdjudications = []) {
  const byFinding = new Map();
  const byTarget = new Map();
  const snapshotKeys = new Set();

  for (const record of historicalAdjudications) {
    snapshotKeys.add(record.snapshotKey);

    if (!byFinding.has(record.findingId)) {
      byFinding.set(record.findingId, {
        counts: createStatusCounts(),
        findingId: record.findingId,
        snapshotKeys: new Set(),
      });
    }

    if (!byTarget.has(record.targetId)) {
      byTarget.set(record.targetId, {
        counts: createStatusCounts(),
        findingId: record.findingId,
        snapshotKeys: new Set(),
        targetId: record.targetId,
        targetKind: record.targetKind,
        targetLabel: record.targetLabel,
      });
    }

    const findingEntry = byFinding.get(record.findingId);
    const targetEntry = byTarget.get(record.targetId);
    incrementStatusCount(findingEntry.counts, record.adjudicationStatus);
    incrementStatusCount(targetEntry.counts, record.adjudicationStatus);
    findingEntry.snapshotKeys.add(record.snapshotKey);
    targetEntry.snapshotKeys.add(record.snapshotKey);
  }

  return {
    byFinding,
    byTarget,
    snapshotCount: snapshotKeys.size,
  };
}

function createRankingHint(findingId, effect, reason, count) {
  return {
    count,
    effect,
    findingId,
    reason,
  };
}

function createSuggestedAction(status, findingId) {
  if (status === "misleading") {
    return {
      action: "reword_or_hold_back",
      findingId,
      reason:
        "Repeated misleading judgments suggest the wording or eligibility boundary outruns the evidence.",
    };
  }

  if (status === "missing_context") {
    return {
      action: "collect_more_context",
      findingId,
      reason:
        "Repeated missing-context judgments suggest Pathloom needs richer evidence, fixtures, or source modeling before this finding is fully actionable.",
    };
  }

  if (status === "noisy") {
    return {
      action: "tighten_thresholds_or_lower_rank",
      findingId,
      reason:
        "Repeated noisy judgments suggest this finding family should rank lower or require stricter emission thresholds.",
    };
  }

  if (status === "accepted") {
    return {
      action: "preserve_or_promote",
      findingId,
      reason:
        "Repeated accepted judgments suggest this finding family is stable and worth preserving as a visible product surface.",
    };
  }

  return {
    action: "review",
    findingId,
    reason: "No strong historical pattern exists yet.",
  };
}

function summarizeLearningLoop(targets, currentAdjudications, historicalAdjudications) {
  const currentTargetIds = new Set(currentAdjudications.map((record) => record.targetId));
  const normalized = normalizeHistoricalReview(historicalAdjudications);
  const patterns = [];
  const policySuggestions = [];
  const rankingHints = [];
  const wordingHints = [];
  const evidenceGaps = [];

  for (const findingEntry of normalized.byFinding.values()) {
    for (const status of ["misleading", "missing_context", "noisy", "accepted"]) {
      const count = findingEntry.counts[status];
      if (count < 2) {
        continue;
      }

      const suggestion = createSuggestedAction(status, findingEntry.findingId);
      patterns.push({
        count,
        findingId: findingEntry.findingId,
        snapshotCount: findingEntry.snapshotKeys.size,
        status,
        suggestedAction: suggestion.action,
        summary: `${findingEntry.findingId} received ${count} ${status.replace("_", " ")} adjudication${count === 1 ? "" : "s"} across ${findingEntry.snapshotKeys.size} snapshot${findingEntry.snapshotKeys.size === 1 ? "" : "s"}.`,
      });

      policySuggestions.push(
        createPolicySuggestion(
          findingEntry.findingId,
          status,
          count,
          findingEntry.snapshotKeys.size,
          suggestion.reason,
          suggestion.action,
        ),
      );

      if (status === "noisy") {
        rankingHints.push(
          createRankingHint(
            findingEntry.findingId,
            "deprioritize_or_tighten",
            suggestion.reason,
            count,
          ),
        );
      } else if (status === "accepted") {
        rankingHints.push(
          createRankingHint(
            findingEntry.findingId,
            "stabilize_or_promote",
            suggestion.reason,
            count,
          ),
        );
      } else if (status === "misleading") {
        wordingHints.push({
          count,
          findingId: findingEntry.findingId,
          reason: suggestion.reason,
        });
      } else if (status === "missing_context") {
        evidenceGaps.push({
          count,
          findingId: findingEntry.findingId,
          reason: suggestion.reason,
        });
      }
    }
  }

  const prioritizedTargets = targets
    .map((target) => {
      const targetHistory = normalized.byTarget.get(target.targetId);
      const findingHistory = normalized.byFinding.get(target.findingId);
      const reviewed = currentTargetIds.has(target.targetId);
      let reviewPriority = reviewed ? -100 : 10;
      const priorityReasons = [];

      if (targetHistory) {
        reviewPriority += targetHistory.counts.misleading * 6;
        reviewPriority += targetHistory.counts.missing_context * 5;
        reviewPriority += targetHistory.counts.noisy * 4;
        reviewPriority -= targetHistory.counts.accepted * 2;

        if (targetHistory.counts.misleading > 0) {
          priorityReasons.push("same target has prior misleading history");
        }
        if (targetHistory.counts.missing_context > 0) {
          priorityReasons.push("same target has prior missing-context history");
        }
        if (targetHistory.counts.noisy > 0) {
          priorityReasons.push("same target has prior noisy history");
        }
      }

      if (findingHistory) {
        reviewPriority += findingHistory.counts.misleading * 3;
        reviewPriority += findingHistory.counts.missing_context * 2;
        reviewPriority += findingHistory.counts.noisy * 2;
        reviewPriority -= findingHistory.counts.accepted;

        if (findingHistory.counts.misleading > 0) {
          priorityReasons.push("finding family has repeated misleading judgments");
        }
        if (findingHistory.counts.missing_context > 0) {
          priorityReasons.push("finding family has repeated evidence gaps");
        }
        if (findingHistory.counts.noisy > 0) {
          priorityReasons.push("finding family has repeated noisy judgments");
        }
      }

      if (target.targetKind === "suppressed_finding") {
        reviewPriority += 1;
      }

      if (priorityReasons.length === 0 && !reviewed) {
        priorityReasons.push("no prior adjudication exists for this target yet");
      }

      const targetStrongest = strongestStatus(
        targetHistory ? targetHistory.counts : createStatusCounts(),
      );
      const findingStrongest = strongestStatus(
        findingHistory ? findingHistory.counts : createStatusCounts(),
      );

      return {
        ...target,
        historicalCounts: targetHistory ? { ...targetHistory.counts } : createStatusCounts(),
        historicalStrongestStatus: targetStrongest.status || findingStrongest.status || null,
        reviewPriority,
        reviewPriorityReasons: priorityReasons,
        reviewedInCurrentSnapshot: reviewed,
      };
    })
    .sort((left, right) => {
      if (left.reviewedInCurrentSnapshot !== right.reviewedInCurrentSnapshot) {
        return left.reviewedInCurrentSnapshot ? 1 : -1;
      }

      if (right.reviewPriority !== left.reviewPriority) {
        return right.reviewPriority - left.reviewPriority;
      }

      return `${left.findingId}:${left.targetLabel}`.localeCompare(
        `${right.findingId}:${right.targetLabel}`,
      );
    });

  const nextReviewTarget =
    prioritizedTargets.find((target) => !target.reviewedInCurrentSnapshot) || null;
  const nextReview = nextReviewTarget
    ? {
        findingId: nextReviewTarget.findingId,
        rationale:
          nextReviewTarget.reviewPriorityReasons.length > 0
            ? nextReviewTarget.reviewPriorityReasons.join("; ")
            : "highest-priority unreviewed target",
        reviewPriority: nextReviewTarget.reviewPriority,
        suggestedAction: createSuggestedAction(
          nextReviewTarget.historicalStrongestStatus,
          nextReviewTarget.findingId,
        ).action,
        targetId: nextReviewTarget.targetId,
        targetKind: nextReviewTarget.targetKind,
        targetLabel: nextReviewTarget.targetLabel,
      }
    : null;

  return {
    historicalAdjudicationCount: historicalAdjudications.length,
    historicalSnapshotCount: normalized.snapshotCount,
    nextReview,
    patterns: patterns.sort((left, right) => right.count - left.count),
    policySuggestions: policySuggestions.sort((left, right) => {
      if (right.adjudicationCount !== left.adjudicationCount) {
        return right.adjudicationCount - left.adjudicationCount;
      }

      return left.policyId.localeCompare(right.policyId);
    }),
    rankingHints: rankingHints.sort((left, right) => right.count - left.count),
    targets: prioritizedTargets,
    wordingHints: wordingHints.sort((left, right) => right.count - left.count),
    evidenceGaps: evidenceGaps.sort((left, right) => right.count - left.count),
  };
}

export function createFeedbackReview(
  snapshot: ReportSnapshot,
  adjudications: AdjudicationRecord[],
  options: { historicalAdjudications?: AdjudicationRecord[] } = {},
): FeedbackReview {
  const targets = listFeedbackTargets(snapshot);
  const learningLoop = summarizeLearningLoop(
    targets,
    adjudications,
    options.historicalAdjudications || adjudications,
  );
  const review = {
    adjudications,
    learningLoop,
    reviewVersion: FEEDBACK_REVIEW_VERSION,
    snapshot: {
      capturedAt: snapshot.capturedAt,
      label: snapshot.label,
      snapshotKey: snapshot.snapshotKey,
      sourceKey: snapshot.sourceKey,
    },
    summary: {
      acceptedCount: countByStatus(adjudications, "accepted"),
      headline: `${adjudications.length} of ${targets.length} feedback target${targets.length === 1 ? "" : "s"} reviewed for snapshot ${snapshot.snapshotKey}.`,
      historicalAdjudicationCount: learningLoop.historicalAdjudicationCount,
      historicalSnapshotCount: learningLoop.historicalSnapshotCount,
      misleadingCount: countByStatus(adjudications, "misleading"),
      missingContextCount: countByStatus(adjudications, "missing_context"),
      noisyCount: countByStatus(adjudications, "noisy"),
      recordedCount: adjudications.length,
      targetCount: targets.length,
      unreviewedCount: Math.max(0, targets.length - adjudications.length),
    },
    targets: learningLoop.targets,
  };

  const validation = validateFeedbackReview(review);
  if (!validation.valid) {
    throw new Error(`Invalid feedback review: ${validation.errors.join(" ")}`);
  }

  return review;
}

export function renderJsonFeedbackReview(review: FeedbackReview): string {
  return `${JSON.stringify(review, null, 2)}\n`;
}

export function renderMarkdownFeedbackReview(review: FeedbackReview): string {
  const lines = [
    "# Pathloom Feedback Review",
    "",
    review.summary.headline,
    "",
    `Source: \`${review.snapshot.sourceKey}\``,
    `Snapshot: \`${review.snapshot.snapshotKey}\``,
    `Captured: ${review.snapshot.capturedAt}`,
    "",
    "## Summary",
    "",
    `- Accepted: ${review.summary.acceptedCount}`,
    `- Noisy: ${review.summary.noisyCount}`,
    `- Misleading: ${review.summary.misleadingCount}`,
    `- Missing context: ${review.summary.missingContextCount}`,
    `- Unreviewed: ${review.summary.unreviewedCount}`,
    `- Historical adjudications for source: ${review.summary.historicalAdjudicationCount}`,
    `- Historical snapshots for source: ${review.summary.historicalSnapshotCount}`,
    "",
    "## Learning loop",
    "",
  ];

  if (review.learningLoop.nextReview) {
    lines.push(
      `- Next review target: \`${review.learningLoop.nextReview.findingId}\` / \`${review.learningLoop.nextReview.targetLabel}\``,
    );
    lines.push(`  Target ID: \`${review.learningLoop.nextReview.targetId}\``);
    lines.push(`  Why now: ${review.learningLoop.nextReview.rationale}`);
    lines.push(`  Suggested follow-up: \`${review.learningLoop.nextReview.suggestedAction}\``);
  } else {
    lines.push("- No unreviewed targets remain for this snapshot.");
  }

  if (review.learningLoop.policySuggestions.length > 0) {
    lines.push("", "### Policy suggestions", "");
    lines.push(
      "These policies are review-only guidance. They do not mutate stored findings or analyze output.",
      "",
    );
    for (const policy of review.learningLoop.policySuggestions) {
      lines.push(
        `- \`${policy.policyId}\` (${policy.policyKind}, ${policy.adjudicationCount} adjudications): ${policy.recommendation}`,
      );
      lines.push(
        `  Effect: \`${policy.effect}\`  Action: \`${policy.suggestedAction}\`  Scope: \`${policy.appliesTo}\``,
      );
    }
  }

  if (review.learningLoop.rankingHints.length > 0) {
    lines.push("", "### Ranking hints", "");
    for (const hint of review.learningLoop.rankingHints) {
      lines.push(
        `- \`${hint.findingId}\` -> \`${hint.effect}\` (${hint.count} adjudications): ${hint.reason}`,
      );
    }
  }

  if (review.learningLoop.wordingHints.length > 0) {
    lines.push("", "### Wording or suppression hints", "");
    for (const hint of review.learningLoop.wordingHints) {
      lines.push(`- \`${hint.findingId}\`: ${hint.reason}`);
    }
  }

  if (review.learningLoop.evidenceGaps.length > 0) {
    lines.push("", "### Evidence gaps", "");
    for (const gap of review.learningLoop.evidenceGaps) {
      lines.push(`- \`${gap.findingId}\`: ${gap.reason}`);
    }
  }

  if (review.learningLoop.patterns.length > 0) {
    lines.push("", "### Recurring patterns", "");
    for (const pattern of review.learningLoop.patterns) {
      lines.push(`- ${pattern.summary}`);
    }
  }

  lines.push("", "## Available targets", "");

  for (const target of review.targets) {
    lines.push(
      `- \`${target.findingId}\` / \`${target.targetLabel}\`  \n  Target ID: \`${target.targetId}\`  \n  Kind: \`${target.targetKind}\`  \n  Review priority: \`${target.reviewPriority}\``,
    );
    if (target.reviewPriorityReasons.length > 0) {
      lines.push(`  Why: ${target.reviewPriorityReasons.join("; ")}`);
    }
  }

  lines.push("", "## Recorded adjudications", "");

  if (review.adjudications.length === 0) {
    lines.push("None yet.", "");
    return `${lines.join("\n")}\n`;
  }

  for (const record of review.adjudications) {
    lines.push(
      `- \`${record.adjudicationStatus}\` on \`${record.findingId}\` / \`${record.targetLabel}\``,
    );
    lines.push(`  Target ID: \`${record.targetId}\``);
    if (record.note) {
      lines.push(`  Note: ${record.note}`);
    }
  }
  lines.push("");

  return `${lines.join("\n")}`;
}

export function renderTerminalFeedbackReview(review: FeedbackReview): string {
  const lines = [
    `Pathloom feedback review for ${review.snapshot.sourceKey}`,
    `Snapshot: ${review.snapshot.snapshotKey}`,
    review.summary.headline,
    `Accepted: ${review.summary.acceptedCount}  Noisy: ${review.summary.noisyCount}  Misleading: ${review.summary.misleadingCount}  Missing context: ${review.summary.missingContextCount}  Unreviewed: ${review.summary.unreviewedCount}`,
    `Historical adjudications: ${review.summary.historicalAdjudicationCount}  Historical snapshots: ${review.summary.historicalSnapshotCount}`,
    "",
    "LEARNING LOOP",
  ];

  if (review.learningLoop.nextReview) {
    lines.push(
      `   next review :: ${review.learningLoop.nextReview.findingId} / ${review.learningLoop.nextReview.targetLabel}`,
    );
    lines.push(`      why: ${review.learningLoop.nextReview.rationale}`);
    lines.push(`      follow-up: ${review.learningLoop.nextReview.suggestedAction}`);
  } else {
    lines.push("   all targets already reviewed in this snapshot");
  }

  if (review.learningLoop.policySuggestions.length > 0) {
    lines.push("   policy suggestions (review-only; no finding mutation)");
    for (const policy of review.learningLoop.policySuggestions) {
      lines.push(
        `   policy :: ${policy.policyId} -> ${policy.effect} (${policy.adjudicationCount})`,
      );
    }
  }

  if (review.learningLoop.rankingHints.length > 0) {
    for (const hint of review.learningLoop.rankingHints) {
      lines.push(`   ranking :: ${hint.findingId} -> ${hint.effect} (${hint.count})`);
    }
  }

  if (review.learningLoop.wordingHints.length > 0) {
    for (const hint of review.learningLoop.wordingHints) {
      lines.push(`   wording :: ${hint.findingId} -> ${hint.reason}`);
    }
  }

  if (review.learningLoop.evidenceGaps.length > 0) {
    for (const gap of review.learningLoop.evidenceGaps) {
      lines.push(`   evidence gap :: ${gap.findingId} -> ${gap.reason}`);
    }
  }

  lines.push("", "TARGETS");

  for (const target of review.targets) {
    lines.push(
      `   ${target.findingId} / ${target.targetLabel} -- ${target.targetId} [priority ${target.reviewPriority}]`,
    );
    if (target.reviewPriorityReasons.length > 0) {
      lines.push(`      why: ${target.reviewPriorityReasons.join("; ")}`);
    }
  }

  lines.push("", "ADJUDICATIONS");

  if (review.adjudications.length === 0) {
    lines.push("   none");
    return `${lines.join("\n")}\n`;
  }

  for (const record of review.adjudications) {
    lines.push(`   ${record.adjudicationStatus} :: ${record.findingId} / ${record.targetLabel}`);
    if (record.note) {
      lines.push(`      note: ${record.note}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function renderAdjudicationSummary(record: AdjudicationRecord): string {
  const lines = [
    `Pathloom adjudication saved for ${record.snapshotKey}`,
    `Target: ${record.findingId} / ${record.targetLabel}`,
    `Status: ${record.adjudicationStatus}`,
  ];

  if (record.note) {
    lines.push(`Note: ${record.note}`);
  }

  return `${lines.join("\n")}\n`;
}
