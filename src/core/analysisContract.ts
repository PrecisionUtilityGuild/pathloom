"use strict";

import type {
  DatasetProfile,
  DatasetReadinessSummary,
  FindingSupportDecision,
  FindingSupportEvaluation,
  PlainObject,
} from "./types";

export const SOURCE_KINDS = Object.freeze({
  WRAPPER: "wrapper",
  OTEL: "otel",
  LOGFILE: "logfile",
  CUSTOM: "custom",
} as const);

export const FINDINGS = Object.freeze({
  DEAD_TOOLS: "dead_tool_detection",
  ARGUMENT_MISMATCH: "argument_mismatch_patterns",
  SESSION_TERMINATION: "session_termination_analysis",
  SEQUENCE_RISK: "sequence_risk_map",
  CLIENT_DIVERGENCE: "client_divergence",
  ACTIVATION: "activation_tool_report",
} as const);

export const CLAIMS = Object.freeze({
  UNUSED_REGISTERED_TOOLS: "unused_registered_tools",
  MISSING_REQUIRED_ARGUMENTS: "missing_required_arguments",
  WRONG_ARGUMENT_TYPE_OR_SHAPE: "wrong_argument_type_or_shape",
  INVALID_ARGUMENT_VALUE: "invalid_argument_value",
  SESSION_DEAD_ENDS: "session_dead_ends",
  RISKY_SEQUENCES: "risky_sequences",
  GOLDEN_PATHS: "golden_paths",
  CLIENT_COMPARISONS: "client_comparisons",
  ACTIVATION_CORRELATIONS: "activation_correlations",
} as const);

const defaultProfile = Object.freeze({
  sourceKind: SOURCE_KINDS.CUSTOM,
  actorIdentity: {
    mode: "none",
    privacy: "none",
  },
  toolCatalog: {
    authority: "none",
    completeness: "none",
  },
  schemaEvidence: {
    expectedSchema: "none",
    observedArguments: "none",
  },
  provenance: {
    sessionization: "none",
    eventOrder: "none",
    lifecycleOutcomes: "none",
    clientHints: "none",
  },
  telemetrySpine: {
    firstClassFields: [],
    importedMetadata: {
      aiModelIdentity: "none",
      aiPromptIdentity: "none",
      externalAttributeBags: "none",
      langfuseSurfaces: "none",
    },
    spanLineage: "none",
    traceIdentity: "none",
  },
}) satisfies DatasetProfile;

const TRACE_IDENTITY_MODES = ["none", "first_class"];
const SPAN_LINEAGE_MODES = ["none", "first_class"];
const IMPORTED_METADATA_MODES = ["none", "provenance_only"];

function mergeObjects<T extends PlainObject>(base: T, overrides: PlainObject = {}): T {
  const output: PlainObject | unknown[] = Array.isArray(base) ? [...base] : { ...base };

  for (const [key, value] of Object.entries(overrides || {})) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      output[key] = mergeObjects(base[key] as PlainObject, value as PlainObject);
      continue;
    }

    output[key] = value;
  }

  return output as T;
}

export function createDatasetProfile(overrides: PlainObject = {}): DatasetProfile {
  return mergeObjects(defaultProfile, overrides);
}

export function validateDatasetProfile(profile: DatasetProfile): string[] {
  const issues = [];

  if (
    profile.actorIdentity.mode === "stable_actor" &&
    !["hashed", "pseudonymous"].includes(profile.actorIdentity.privacy)
  ) {
    issues.push("Stable actor identity must be privacy-safe (hashed or pseudonymous).");
  }

  if (profile.actorIdentity.mode !== "stable_actor" && profile.actorIdentity.privacy === "raw") {
    issues.push("Raw actor identity is not a sanctioned privacy mode.");
  }

  if (profile.toolCatalog.authority === "none" && profile.toolCatalog.completeness !== "none") {
    issues.push("Tool catalog completeness cannot be declared without a catalog authority.");
  }

  if (
    profile.schemaEvidence.observedArguments === "none" &&
    profile.schemaEvidence.expectedSchema !== "none" &&
    profile.provenance.lifecycleOutcomes === "none"
  ) {
    issues.push(
      "Schema-only datasets without argument observations or lifecycle evidence are too thin for mismatch analysis.",
    );
  }

  if (profile.provenance.eventOrder !== "none" && profile.provenance.sessionization === "none") {
    issues.push(
      "Per-session ordering cannot be trusted without an explicit sessionization strategy.",
    );
  }

  const telemetrySpine = profile.telemetrySpine || ({} as DatasetProfile["telemetrySpine"]);

  if (!TRACE_IDENTITY_MODES.includes(telemetrySpine.traceIdentity || "none")) {
    issues.push("Telemetry trace identity mode must be none or first_class.");
  }

  if (!SPAN_LINEAGE_MODES.includes(telemetrySpine.spanLineage || "none")) {
    issues.push("Telemetry span lineage mode must be none or first_class.");
  }

  if (
    telemetrySpine.traceIdentity !== "first_class" &&
    telemetrySpine.spanLineage === "first_class"
  ) {
    issues.push("Span lineage cannot be first-class when trace identity is not first-class.");
  }

  const importedMetadata =
    telemetrySpine.importedMetadata || ({} as DatasetProfile["telemetrySpine"]["importedMetadata"]);
  for (const key of [
    "aiModelIdentity",
    "aiPromptIdentity",
    "externalAttributeBags",
    "langfuseSurfaces",
  ]) {
    if (!IMPORTED_METADATA_MODES.includes(importedMetadata[key] || "none")) {
      issues.push(`Telemetry imported metadata mode for ${key} must be none or provenance_only.`);
    }
  }

  return issues;
}

function buildDecision(
  status: FindingSupportDecision["status"],
  allowedClaims: string[],
  blockedBy: string[],
  rationale: string,
): FindingSupportDecision {
  return {
    status,
    allowedClaims,
    blockedBy,
    rationale,
  };
}

function evaluateDeadToolSupport(profile: DatasetProfile): FindingSupportDecision {
  const blockedBy = [];

  if (profile.toolCatalog.authority === "none") {
    blockedBy.push("missing_tool_catalog_authority");
  }

  if (profile.toolCatalog.completeness !== "authoritative") {
    blockedBy.push("non_authoritative_tool_catalog");
  }

  if (blockedBy.length > 0) {
    return buildDecision(
      "suppressed",
      [],
      blockedBy,
      "Dead-tool findings require an authoritative tool catalog. Observed call absence alone is never enough.",
    );
  }

  return buildDecision(
    "eligible",
    [CLAIMS.UNUSED_REGISTERED_TOOLS],
    [],
    "Dataset can support unused-tool claims because the registered tool inventory is authoritative.",
  );
}

function evaluateArgumentMismatchSupport(profile: DatasetProfile): FindingSupportDecision {
  const blockedBy = [];
  const allowedClaims = [];
  const { expectedSchema, observedArguments } = profile.schemaEvidence;

  if (expectedSchema === "none") {
    blockedBy.push("missing_expected_schema");
  }

  if (observedArguments === "none") {
    blockedBy.push("missing_observed_arguments");
  }

  if (blockedBy.length > 0) {
    return buildDecision(
      "suppressed",
      [],
      blockedBy,
      "Argument mismatch findings need both expected schema evidence and observed argument evidence.",
    );
  }

  allowedClaims.push(CLAIMS.MISSING_REQUIRED_ARGUMENTS);

  if (["shape_only", "full_values"].includes(observedArguments)) {
    allowedClaims.push(CLAIMS.WRONG_ARGUMENT_TYPE_OR_SHAPE);
  }

  if (observedArguments === "full_values") {
    allowedClaims.push(CLAIMS.INVALID_ARGUMENT_VALUE);
  }

  if (allowedClaims.length === 1) {
    return buildDecision(
      "narrowed",
      allowedClaims,
      [],
      "Presence-only arguments support missing-required-argument claims, but not type or value assertions.",
    );
  }

  return buildDecision(
    "eligible",
    allowedClaims,
    [],
    "Dataset can compare expected schema against observed arguments with enough fidelity for typed mismatch claims.",
  );
}

function evaluateSessionTerminationSupport(profile: DatasetProfile): FindingSupportDecision {
  const blockedBy = [];

  if (profile.provenance.sessionization === "none") {
    blockedBy.push("missing_sessionization");
  }

  if (profile.provenance.eventOrder === "none") {
    blockedBy.push("missing_per_session_order");
  }

  if (blockedBy.length > 0) {
    return buildDecision(
      "suppressed",
      [],
      blockedBy,
      "Session termination analysis requires trustworthy session boundaries and within-session ordering.",
    );
  }

  return buildDecision(
    "eligible",
    [CLAIMS.SESSION_DEAD_ENDS],
    [],
    "Dataset supports identifying where sessions end and which tools correlate with dead ends.",
  );
}

function evaluateSequenceRiskSupport(profile: DatasetProfile): FindingSupportDecision {
  const blockedBy = [];

  if (profile.provenance.sessionization === "none") {
    blockedBy.push("missing_sessionization");
  }

  if (profile.provenance.eventOrder !== "per_session_order") {
    blockedBy.push("insufficient_sequence_ordering");
  }

  if (profile.provenance.lifecycleOutcomes === "none") {
    blockedBy.push("missing_outcome_evidence");
  }

  if (blockedBy.length > 0) {
    return buildDecision(
      "suppressed",
      [],
      blockedBy,
      "Sequence risk needs ordered per-session paths plus outcome evidence.",
    );
  }

  return buildDecision(
    "eligible",
    [CLAIMS.RISKY_SEQUENCES, CLAIMS.GOLDEN_PATHS],
    [],
    "Dataset supports comparing sequence outcomes against baseline behavior.",
  );
}

function evaluateClientDivergenceSupport(profile: DatasetProfile): FindingSupportDecision {
  if (profile.provenance.clientHints !== "normalized") {
    return buildDecision(
      "suppressed",
      [],
      ["missing_normalized_client_hints"],
      "Client divergence requires normalized client hints rather than free-form labels.",
    );
  }

  return buildDecision(
    "eligible",
    [CLAIMS.CLIENT_COMPARISONS],
    [],
    "Dataset can compare tool usage and outcomes across normalized clients.",
  );
}

function evaluateActivationSupport(profile: DatasetProfile): FindingSupportDecision {
  const blockedBy = [];

  if (profile.actorIdentity.mode !== "stable_actor") {
    blockedBy.push("missing_stable_actor_identity");
  }

  if (!["hashed", "pseudonymous"].includes(profile.actorIdentity.privacy)) {
    blockedBy.push("non_private_actor_identity");
  }

  if (profile.provenance.sessionization === "none") {
    blockedBy.push("missing_sessionization");
  }

  if (blockedBy.length > 0) {
    return buildDecision(
      "suppressed",
      [],
      blockedBy,
      "Activation analysis requires privacy-safe actor linkage across sessions. Session IDs alone are insufficient.",
    );
  }

  return buildDecision(
    "eligible",
    [CLAIMS.ACTIVATION_CORRELATIONS],
    [],
    "Dataset supports privacy-safe return-cohort analysis for activation-style findings.",
  );
}

export function evaluateFindingSupport(profile: DatasetProfile): FindingSupportEvaluation {
  const validationIssues = validateDatasetProfile(profile);

  if (validationIssues.length > 0) {
    return {
      valid: false,
      validationIssues,
      findings: {},
    };
  }

  return {
    valid: true,
    validationIssues: [],
    findings: {
      [FINDINGS.DEAD_TOOLS]: evaluateDeadToolSupport(profile),
      [FINDINGS.ARGUMENT_MISMATCH]: evaluateArgumentMismatchSupport(profile),
      [FINDINGS.SESSION_TERMINATION]: evaluateSessionTerminationSupport(profile),
      [FINDINGS.SEQUENCE_RISK]: evaluateSequenceRiskSupport(profile),
      [FINDINGS.CLIENT_DIVERGENCE]: evaluateClientDivergenceSupport(profile),
      [FINDINGS.ACTIVATION]: evaluateActivationSupport(profile),
    },
  };
}

export function summarizeDatasetReadiness(profile: DatasetProfile): DatasetReadinessSummary {
  const evaluation = evaluateFindingSupport(profile);

  if (!evaluation.valid) {
    return {
      readiness: "invalid",
      eligibleFindings: [],
      narrowedFindings: [],
      suppressedFindings: [],
      validationIssues: evaluation.validationIssues,
    };
  }

  const eligibleFindings = [];
  const narrowedFindings = [];
  const suppressedFindings = [];

  for (const [findingId, decision] of Object.entries(evaluation.findings)) {
    if (decision.status === "eligible") {
      eligibleFindings.push(findingId);
      continue;
    }

    if (decision.status === "narrowed") {
      narrowedFindings.push(findingId);
      continue;
    }

    suppressedFindings.push(findingId);
  }

  return {
    readiness:
      suppressedFindings.length === 0
        ? "full"
        : eligibleFindings.length > 0 || narrowedFindings.length > 0
          ? "partial"
          : "minimal",
    eligibleFindings,
    narrowedFindings,
    suppressedFindings,
    validationIssues: [],
  };
}
