"use strict";

import type {
  ClaimScope,
  Finding,
  FindingUncertainty,
  SupportStatus,
  UncertaintyLevel,
} from "../core/types";

export const UNCERTAINTY_LEVELS = Object.freeze([
  "unsupported",
  "weak",
  "candidate",
  "credible",
] as const satisfies UncertaintyLevel[]);

export const CLAIM_SCOPES = Object.freeze([
  "suppressed",
  "narrowed",
  "full",
] as const satisfies ClaimScope[]);
export const FINDING_SUPPORT_STATUSES = Object.freeze([
  "eligible",
  "narrowed",
  "suppressed",
] as const satisfies SupportStatus[]);

export const LEVEL_LABELS = Object.freeze({
  unsupported: "Unsupported",
  weak: "Weak signal",
  candidate: "Candidate-grade signal",
  credible: "Credible finding",
});

export const CLAIM_SCOPE_LABELS = Object.freeze({
  full: "full claim",
  narrowed: "narrowed claim",
  suppressed: "suppressed claim",
});

function inferSupportStatus(finding: Finding): SupportStatus {
  if (finding.support && FINDING_SUPPORT_STATUSES.includes(finding.support.status)) {
    return finding.support.status;
  }

  return finding.status === "suppressed" ? "suppressed" : "eligible";
}

function inferClaimScope(supportStatus: SupportStatus): ClaimScope {
  if (supportStatus === "suppressed") {
    return "suppressed";
  }

  if (supportStatus === "narrowed") {
    return "narrowed";
  }

  return "full";
}

function inferUncertaintyLevel(finding: Finding, supportStatus: SupportStatus): UncertaintyLevel {
  if (supportStatus === "suppressed" || finding.status === "suppressed") {
    return "unsupported";
  }

  if (
    (finding.items || []).some(
      (item) =>
        item.signalClass === "candidate_signal" ||
        item.signalClass === "candidate_return_correlate",
    )
  ) {
    return "candidate";
  }

  if (finding.status === "ready") {
    return "credible";
  }

  return "weak";
}

function buildUnsupportedExplanation(
  finding: Finding,
  blockedBy: string[],
  rationale: string | null,
): string {
  const blockerText = blockedBy.length > 0 ? ` Blocked by: ${blockedBy.join(", ")}.` : "";

  return `The dataset does not support this claim. ${rationale || finding.summary}${blockerText}`;
}

function buildWeakExplanation(claimScope: ClaimScope): string {
  if (claimScope === "narrowed") {
    return "The dataset could only support a safer subset of this claim, and no pattern crossed the emission threshold strongly enough to emit even that narrower version.";
  }

  return "The dataset could evaluate this claim, but no pattern crossed the emission threshold strongly enough to emit a product finding.";
}

function buildCandidateExplanation(): string {
  return "Pathloom observed a promising pattern, but it did not clear the credible threshold required for a product finding.";
}

function buildCredibleExplanation(claimScope: ClaimScope): string {
  if (claimScope === "narrowed") {
    return "The dataset only supported a safer subset of the full claim, and the observed pattern cleared the emission threshold within that narrower scope.";
  }

  return "The dataset supported the full claim, and the observed pattern cleared the emission threshold.";
}

function buildHeadline(level: UncertaintyLevel, claimScope: ClaimScope): string {
  if (level === "credible") {
    return claimScope === "narrowed" ? "Credible finding on a narrowed claim" : "Credible finding";
  }

  if (level === "candidate") {
    return claimScope === "narrowed"
      ? "Candidate-grade signal on a narrowed claim"
      : "Candidate-grade signal";
  }

  if (level === "weak") {
    return claimScope === "narrowed" ? "Weak signal on a narrowed claim" : "Weak signal";
  }

  return claimScope === "suppressed" ? "Unsupported claim" : "Unsupported signal";
}

export function createFindingUncertainty(finding: Finding): FindingUncertainty {
  const supportStatus = inferSupportStatus(finding);
  const claimScope = inferClaimScope(supportStatus);
  const level = inferUncertaintyLevel(finding, supportStatus);
  const label = LEVEL_LABELS[level];
  const claimScopeLabel = CLAIM_SCOPE_LABELS[claimScope];
  const blockedBy = Array.isArray(finding.blockedBy) ? [...finding.blockedBy] : [];
  const rationale = finding.support?.rationale || null;
  const allowedClaims = Array.isArray(finding.support?.allowedClaims)
    ? [...finding.support.allowedClaims]
    : [];
  let explanation = "";

  if (level === "unsupported") {
    explanation = buildUnsupportedExplanation(finding, blockedBy, rationale);
  } else if (level === "weak") {
    explanation = buildWeakExplanation(claimScope);
  } else if (level === "candidate") {
    explanation = buildCandidateExplanation();
  } else {
    explanation = buildCredibleExplanation(claimScope);
  }

  const headline = buildHeadline(level, claimScope);

  return {
    allowedClaims,
    blockedBy,
    claimScope,
    claimScopeLabel,
    explanation,
    headline,
    label,
    level,
    rationale,
    supportStatus,
  };
}
