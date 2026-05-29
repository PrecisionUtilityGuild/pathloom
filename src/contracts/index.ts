"use strict";

import { FINDINGS, SOURCE_KINDS } from "../core/analysisContract";

const { CLAIM_SCOPES, FINDING_SUPPORT_STATUSES, UNCERTAINTY_LEVELS } =
  require("../uncertainty") as typeof import("../uncertainty");

export const PATHLOOM_EVENT_SCHEMA_VERSION = "1.0";
export const PATHLOOM_REPORT_SCHEMA_VERSION = "1.0";
export const PATHLOOM_DISTRIBUTION_BUNDLE_SCHEMA_VERSION = "1.0";
export const PATHLOOM_REPORT_SNAPSHOT_SCHEMA_VERSION = "1.0";
export const PATHLOOM_HISTORY_DIFF_SCHEMA_VERSION = "1.0";
export const PATHLOOM_ADJUDICATION_SCHEMA_VERSION = "1.0";
export const PATHLOOM_FEEDBACK_REVIEW_SCHEMA_VERSION = "1.1";
export const PATHLOOM_CLI_SURFACE_VERSION = "1.0";
export const PATHLOOM_CHECK_RESULT_SCHEMA_VERSION = "1.0";
export const PATHLOOM_CHECK_BADGE_SCHEMA_VERSION = "1.0";

const READYNESS_VALUES = ["invalid", "minimal", "partial", "full"];
const ACTOR_IDENTITY_MODES = ["none", "session_only", "stable_actor"];
const TOOL_CATALOG_AUTHORITIES = [
  "none",
  "runtime_registration",
  "external_catalog",
  "explicit_manifest",
];
const FINDING_SEVERITIES = ["info", "warning", "clear"];
const FINDING_STATUSES = ["ready", "clear", "suppressed"];
const OUTCOME_VALUES = ["success", "error", "timeout", "empty-result"];
const SESSION_ID_SOURCE_VALUES = ["explicit", "trace_fallback", "unknown"];
export const ADJUDICATION_STATUSES = ["accepted", "noisy", "misleading", "missing_context"];
export const FEEDBACK_TARGET_KINDS = ["active_item", "active_summary", "suppressed_finding"];
export const FEEDBACK_POLICY_KINDS = [
  "evidence_request",
  "ranking_pressure",
  "suppression_guidance",
  "wording_adjustment",
];
export const FEEDBACK_POLICY_APPLIES_TO_SCOPES = ["feedback_review_only"];

export const PATHLOOM_EVENT_SCHEMA = Object.freeze({
  version: PATHLOOM_EVENT_SCHEMA_VERSION,
  kind: "normalized_event",
  required: [
    "actorKey",
    "actorPrivacy",
    "arguments",
    "argumentShapes",
    "argumentsMissing",
    "argumentsProvided",
    "clientHint",
    "invokedAt",
    "isFirstInSession",
    "outcome",
    "positionInSession",
    "precedingTool",
    "provenance",
    "resolvedAt",
    "resultTokenEstimate",
    "serverId",
    "serverVersion",
    "sessionId",
    "sessionIdSource",
    "sourceEventId",
    "toolName",
  ],
  notes: {
    actorKey:
      "Optional privacy-safe cross-session actor identifier. Required for activation findings, but may be null for session-only datasets.",
    sessionId:
      "Opaque session identifier. Stable within a dataset window, but insufficient for activation claims on its own.",
    sessionIdSource:
      "States whether a session boundary came from explicit source telemetry or a trace-derived fallback.",
  },
  properties: {
    actorKey: { type: ["string", "null"] },
    actorPrivacy: { type: ["string", "null"] },
    arguments: { type: ["object", "null"] },
    argumentShapes: { type: "object" },
    argumentsMissing: { items: { type: "string" }, type: "array" },
    argumentsProvided: { items: { type: "string" }, type: "array" },
    clientHint: { type: "string" },
    invokedAt: { type: "number" },
    isFirstInSession: { type: "boolean" },
    outcome: { enum: OUTCOME_VALUES, type: "string" },
    positionInSession: { minimum: 1, type: "number" },
    precedingTool: { type: ["string", "null"] },
    provenance: { type: "object" },
    resolvedAt: { type: "number" },
    resultTokenEstimate: { minimum: 0, type: "number" },
    serverId: { type: "string" },
    serverVersion: { type: "string" },
    sessionId: { type: "string" },
    sessionIdSource: { enum: SESSION_ID_SOURCE_VALUES, type: "string" },
    traceId: { type: ["string", "null"] },
    spanId: { type: ["string", "null"] },
    parentSpanId: { type: ["string", "null"] },
    sourceEventId: { type: ["string", "null"] },
    toolName: { type: "string" },
  },
});

export const PATHLOOM_FINDING_DEFINITIONS = Object.freeze({
  [FINDINGS.DEAD_TOOLS]: {
    itemTypes: ["dead_tool"],
    title: "Dead tools",
  },
  [FINDINGS.ARGUMENT_MISMATCH]: {
    itemTypes: [
      "missing_required_argument",
      "wrong_argument_type_or_shape",
      "invalid_argument_value",
    ],
    title: "Argument mismatch patterns",
  },
  [FINDINGS.SESSION_TERMINATION]: {
    itemTypes: ["termination_pattern"],
    title: "Session termination analysis",
  },
  [FINDINGS.SEQUENCE_RISK]: {
    itemTypes: ["risky_sequence", "golden_path"],
    title: "Sequence risk map",
  },
  [FINDINGS.CLIENT_DIVERGENCE]: {
    itemTypes: ["client_outlier", "tool_outlier"],
    title: "Client divergence",
  },
  [FINDINGS.ACTIVATION]: {
    itemTypes: ["activation_tool"],
    title: "Activation tool report",
  },
});

export const PATHLOOM_REPORT_SCHEMA = Object.freeze({
  version: PATHLOOM_REPORT_SCHEMA_VERSION,
  kind: "report_document",
  findingDefinitions: PATHLOOM_FINDING_DEFINITIONS,
  required: [
    "dataset",
    "findings",
    "generatedAt",
    "reportVersion",
    "sourceKey",
    "summary",
    "suppressedFindings",
  ],
  properties: {
    dataset: {
      required: [
        "actorIdentityMode",
        "readiness",
        "sourceKind",
        "sourceKey",
        "telemetrySpine",
        "toolCatalogAuthority",
      ],
    },
    findings: { type: "array" },
    generatedAt: { format: "date-time", type: "string" },
    reportVersion: { const: PATHLOOM_REPORT_SCHEMA_VERSION, type: "string" },
    sourceKey: { type: "string" },
    summary: {
      required: [
        "clearFindingCount",
        "eventCount",
        "readyFindingCount",
        "sessionCount",
        "suppressedFindingCount",
        "toolCatalogSize",
      ],
    },
    suppressedFindings: { type: "array" },
  },
});

const DISTRIBUTION_BUNDLE_ARTIFACT_IDS = ["share_summary", "report_markdown", "report_json"];

export const PATHLOOM_DISTRIBUTION_BUNDLE_SCHEMA = Object.freeze({
  version: PATHLOOM_DISTRIBUTION_BUNDLE_SCHEMA_VERSION,
  kind: "distribution_bundle",
  artifactIds: DISTRIBUTION_BUNDLE_ARTIFACT_IDS,
  required: ["artifacts", "bundleVersion", "generatedAt", "reportVersion", "sourceKey", "summary"],
  properties: {
    artifacts: { type: "array" },
    bundleVersion: {
      const: PATHLOOM_DISTRIBUTION_BUNDLE_SCHEMA_VERSION,
      type: "string",
    },
    generatedAt: { format: "date-time", type: "string" },
    reportVersion: { const: PATHLOOM_REPORT_SCHEMA_VERSION, type: "string" },
    sourceKey: { type: "string" },
    summary: {
      required: [
        "clearFindingCount",
        "headline",
        "readyFindingCount",
        "suppressedFindingCount",
        "topFindingTitles",
      ],
    },
  },
});

export const PATHLOOM_REPORT_SNAPSHOT_SCHEMA = Object.freeze({
  version: PATHLOOM_REPORT_SNAPSHOT_SCHEMA_VERSION,
  kind: "report_snapshot",
  required: [
    "capturedAt",
    "reportDocument",
    "reportVersion",
    "snapshotKey",
    "snapshotVersion",
    "sourceKey",
    "summary",
  ],
  properties: {
    capturedAt: { format: "date-time", type: "string" },
    label: { type: ["string", "null"] },
    reportDocument: { type: "object" },
    reportVersion: { const: PATHLOOM_REPORT_SCHEMA_VERSION, type: "string" },
    snapshotKey: { type: "string" },
    snapshotVersion: { const: PATHLOOM_REPORT_SNAPSHOT_SCHEMA_VERSION, type: "string" },
    sourceKey: { type: "string" },
    summary: {
      required: [
        "clearFindingCount",
        "eventCount",
        "readyFindingCount",
        "sessionCount",
        "suppressedFindingCount",
        "toolCatalogSize",
      ],
    },
  },
});

export const PATHLOOM_HISTORY_DIFF_SCHEMA = Object.freeze({
  version: PATHLOOM_HISTORY_DIFF_SCHEMA_VERSION,
  kind: "history_diff",
  required: [
    "baseline",
    "current",
    "diffVersion",
    "evidenceChanges",
    "newFindings",
    "regressedFindings",
    "resolvedFindings",
    "sourceKey",
    "summary",
  ],
  properties: {
    baseline: {
      required: ["capturedAt", "snapshotKey", "sourceKey"],
    },
    current: {
      required: ["capturedAt", "snapshotKey", "sourceKey"],
    },
    diffVersion: { const: PATHLOOM_HISTORY_DIFF_SCHEMA_VERSION, type: "string" },
    evidenceChanges: { type: "array" },
    newFindings: { type: "array" },
    regressedFindings: { type: "array" },
    resolvedFindings: { type: "array" },
    sourceKey: { type: "string" },
    summary: {
      required: [
        "evidenceChangeCount",
        "headline",
        "newCount",
        "regressedCount",
        "resolvedCount",
        "unchangedCount",
      ],
    },
  },
});

export const PATHLOOM_ADJUDICATION_SCHEMA = Object.freeze({
  version: PATHLOOM_ADJUDICATION_SCHEMA_VERSION,
  kind: "adjudication_record",
  statuses: ADJUDICATION_STATUSES,
  required: [
    "adjudicationStatus",
    "createdAt",
    "findingId",
    "snapshotKey",
    "sourceKey",
    "targetId",
    "targetKind",
    "targetLabel",
    "updatedAt",
  ],
  properties: {
    adjudicationStatus: { enum: ADJUDICATION_STATUSES, type: "string" },
    createdAt: { format: "date-time", type: "string" },
    findingId: { type: "string" },
    note: { type: ["string", "null"] },
    snapshotKey: { type: "string" },
    sourceKey: { type: "string" },
    targetId: { type: "string" },
    targetKind: { enum: FEEDBACK_TARGET_KINDS, type: "string" },
    targetLabel: { type: "string" },
    updatedAt: { format: "date-time", type: "string" },
  },
});

export const PATHLOOM_FEEDBACK_REVIEW_SCHEMA = Object.freeze({
  version: PATHLOOM_FEEDBACK_REVIEW_SCHEMA_VERSION,
  kind: "feedback_review",
  required: ["adjudications", "learningLoop", "reviewVersion", "snapshot", "summary", "targets"],
  properties: {
    adjudications: { type: "array" },
    reviewVersion: { const: PATHLOOM_FEEDBACK_REVIEW_SCHEMA_VERSION, type: "string" },
    snapshot: {
      required: ["capturedAt", "snapshotKey", "sourceKey"],
    },
    summary: {
      required: [
        "acceptedCount",
        "headline",
        "misleadingCount",
        "missingContextCount",
        "noisyCount",
        "recordedCount",
        "targetCount",
        "unreviewedCount",
      ],
    },
    targets: { type: "array" },
  },
});

export const PATHLOOM_CLI_SURFACE = Object.freeze({
  version: PATHLOOM_CLI_SURFACE_VERSION,
  commands: {
    analyze: {
      description: "Analyze a local Pathloom store and render a report.",
      options: ["--db", "--database", "--source", "--json", "--markdown", "--help"],
    },
    check: {
      description:
        "Run release gates: calibration matrix and frozen golden scenarios with CI-stable exit codes.",
      options: [
        "--calibration-only",
        "--golden",
        "--fail-fast",
        "--json-summary",
        "--emit-badge",
        "--help",
      ],
    },
    import: {
      description: "Import OTel or logfile telemetry into the local Pathloom store.",
      options: [
        "--db",
        "--database",
        "--format",
        "--input",
        "--catalog",
        "--source",
        "--actor-privacy",
        "--help",
      ],
    },
    bundle: {
      description: "Generate a distribution bundle with shareable Markdown and JSON artifacts.",
      options: ["--db", "--database", "--source", "--output", "--help"],
    },
    snapshot: {
      description:
        "Persist a local report snapshot for recurring analysis and optionally write a bundle directory.",
      options: ["--db", "--database", "--label", "--output", "--source", "--help"],
    },
    diff: {
      description: "Compare stored report snapshots and render a stable historical diff.",
      options: [
        "--db",
        "--database",
        "--source",
        "--current",
        "--previous",
        "--json",
        "--markdown",
        "--help",
      ],
    },
    adjudicate: {
      description:
        "Record a local operator judgment against a report snapshot finding or finding-item target.",
      options: [
        "--db",
        "--database",
        "--source",
        "--snapshot",
        "--finding",
        "--item",
        "--target",
        "--status",
        "--note",
        "--help",
      ],
    },
    feedback: {
      description:
        "Review available feedback targets and recorded adjudications for the latest or selected snapshot.",
      options: ["--db", "--database", "--source", "--snapshot", "--json", "--markdown", "--help"],
    },
    schema: {
      description:
        "Print the stable event, report, bundle, snapshot, diff, adjudication, feedback, or findings contract as JSON.",
      subjects: [
        "event",
        "report",
        "bundle",
        "snapshot",
        "diff",
        "adjudication",
        "feedback",
        "findings",
      ],
    },
  },
  globalOptions: ["--help", "--version"],
});

export const PATHLOOM_CHECK_BADGE_SCHEMA = Object.freeze({
  version: PATHLOOM_CHECK_BADGE_SCHEMA_VERSION,
  kind: "pathloom_certify",
  required: ["badgeVersion", "kind", "issuedAt", "pathloomVersion", "passed", "demoPack", "gates"],
  properties: {
    badgeVersion: { const: PATHLOOM_CHECK_BADGE_SCHEMA_VERSION, type: "string" },
    kind: { const: "pathloom_certify", type: "string" },
    passed: { type: "boolean" },
    demoPack: {
      required: ["id", "sourceKey", "contentHash", "hashAlgorithm", "hashedFiles"],
    },
    gates: {
      required: ["calibrationScenarios", "goldenScenarios", "gateCount", "passedGateCount"],
    },
  },
});

export const PATHLOOM_CHECK_RESULT_SCHEMA = Object.freeze({
  version: PATHLOOM_CHECK_RESULT_SCHEMA_VERSION,
  kind: "check_result",
  required: ["checkVersion", "exitCode", "passed", "summary", "gates", "failures"],
  properties: {
    checkVersion: { const: PATHLOOM_CHECK_RESULT_SCHEMA_VERSION, type: "string" },
    exitCode: { type: "number" },
    passed: { type: "boolean" },
    summary: {
      required: ["gateCount", "failureCount", "passedGateCount"],
    },
    gates: { type: "array" },
    failures: { type: "array" },
  },
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value == null || typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function buildValidation(valid: boolean, errors: string[]) {
  return {
    errors,
    valid,
  };
}

function validateTelemetrySpine(
  telemetrySpine: Record<string, unknown>,
  path: string,
  errors: string[],
) {
  if (!isPlainObject(telemetrySpine)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  const spine = telemetrySpine as Record<string, any>;

  if (!["none", "first_class"].includes(spine.traceIdentity)) {
    errors.push(`${path}.traceIdentity must be none or first_class.`);
  }

  if (!["none", "first_class"].includes(spine.spanLineage)) {
    errors.push(`${path}.spanLineage must be none or first_class.`);
  }

  if (!Array.isArray(spine.firstClassFields)) {
    errors.push(`${path}.firstClassFields must be an array.`);
  }

  if (!isPlainObject(spine.importedMetadata)) {
    errors.push(`${path}.importedMetadata must be an object.`);
  } else {
    const importedMetadata = spine.importedMetadata as Record<string, any>;
    for (const key of [
      "aiModelIdentity",
      "aiPromptIdentity",
      "externalAttributeBags",
      "langfuseSurfaces",
    ]) {
      if (!["none", "provenance_only"].includes(importedMetadata[key])) {
        errors.push(`${path}.importedMetadata.${key} must be none or provenance_only.`);
      }
    }
  }
}

export function validateNormalizedEvent(event: unknown) {
  const errors = [];

  if (!isPlainObject(event)) {
    return buildValidation(false, ["Event must be an object."]);
  }

  const normalizedEvent = event as Record<string, any>;

  if (!isNullableString(normalizedEvent.actorKey)) {
    errors.push("actorKey must be a string or null.");
  }

  if (!isNullableString(normalizedEvent.actorPrivacy)) {
    errors.push("actorPrivacy must be a string or null.");
  }

  if (!(normalizedEvent.arguments == null || isPlainObject(normalizedEvent.arguments))) {
    errors.push("arguments must be an object or null.");
  }

  if (!isPlainObject(normalizedEvent.argumentShapes)) {
    errors.push("argumentShapes must be an object.");
  }

  if (!Array.isArray(normalizedEvent.argumentsMissing)) {
    errors.push("argumentsMissing must be an array.");
  }

  if (!Array.isArray(normalizedEvent.argumentsProvided)) {
    errors.push("argumentsProvided must be an array.");
  }

  if (typeof normalizedEvent.clientHint !== "string" || normalizedEvent.clientHint.length === 0) {
    errors.push("clientHint must be a non-empty string.");
  }

  if (!isFiniteNumber(normalizedEvent.invokedAt)) {
    errors.push("invokedAt must be a finite number.");
  }

  if (typeof normalizedEvent.isFirstInSession !== "boolean") {
    errors.push("isFirstInSession must be a boolean.");
  }

  if (!OUTCOME_VALUES.includes(normalizedEvent.outcome)) {
    errors.push(`outcome must be one of: ${OUTCOME_VALUES.join(", ")}.`);
  }

  if (!isFiniteNumber(normalizedEvent.positionInSession) || normalizedEvent.positionInSession < 1) {
    errors.push("positionInSession must be a finite number greater than or equal to 1.");
  }

  if (!isNullableString(normalizedEvent.precedingTool)) {
    errors.push("precedingTool must be a string or null.");
  }

  if (!isPlainObject(normalizedEvent.provenance)) {
    errors.push("provenance must be an object.");
  }

  if (!isFiniteNumber(normalizedEvent.resolvedAt)) {
    errors.push("resolvedAt must be a finite number.");
  }

  if (
    !isFiniteNumber(normalizedEvent.resultTokenEstimate) ||
    normalizedEvent.resultTokenEstimate < 0
  ) {
    errors.push("resultTokenEstimate must be a finite non-negative number.");
  }

  if (typeof normalizedEvent.serverId !== "string" || normalizedEvent.serverId.length === 0) {
    errors.push("serverId must be a non-empty string.");
  }

  if (
    typeof normalizedEvent.serverVersion !== "string" ||
    normalizedEvent.serverVersion.length === 0
  ) {
    errors.push("serverVersion must be a non-empty string.");
  }

  if (typeof normalizedEvent.sessionId !== "string" || normalizedEvent.sessionId.length === 0) {
    errors.push("sessionId must be a non-empty string.");
  }

  if (!SESSION_ID_SOURCE_VALUES.includes(normalizedEvent.sessionIdSource)) {
    errors.push(`sessionIdSource must be one of: ${SESSION_ID_SOURCE_VALUES.join(", ")}.`);
  }

  if (!isNullableString(normalizedEvent.traceId)) {
    errors.push("traceId must be a string or null.");
  }

  if (!isNullableString(normalizedEvent.spanId)) {
    errors.push("spanId must be a string or null.");
  }

  if (!isNullableString(normalizedEvent.parentSpanId)) {
    errors.push("parentSpanId must be a string or null.");
  }

  if (!isNullableString(normalizedEvent.sourceEventId)) {
    errors.push("sourceEventId must be a string or null.");
  }

  if (typeof normalizedEvent.toolName !== "string" || normalizedEvent.toolName.length === 0) {
    errors.push("toolName must be a non-empty string.");
  }

  return buildValidation(errors.length === 0, errors);
}

function validateFinding(finding: unknown, path = "finding") {
  const errors = [];

  if (!isPlainObject(finding)) {
    return [`${path} must be an object.`];
  }

  const findingRecord = finding as Record<string, any>;

  if (!Object.values(FINDINGS).includes(findingRecord.id)) {
    errors.push(`${path}.id must be a known finding id.`);
  }

  if (!FINDING_SEVERITIES.includes(findingRecord.severity)) {
    errors.push(`${path}.severity must be a known severity.`);
  }

  if (!FINDING_STATUSES.includes(findingRecord.status)) {
    errors.push(`${path}.status must be ready, clear, or suppressed.`);
  }

  if (!Array.isArray(findingRecord.items)) {
    errors.push(`${path}.items must be an array.`);
  }

  if (!Array.isArray(findingRecord.blockedBy)) {
    errors.push(`${path}.blockedBy must be an array.`);
  }

  if (!isPlainObject(findingRecord.evidence)) {
    errors.push(`${path}.evidence must be an object.`);
  }

  if (!isPlainObject(findingRecord.uncertainty)) {
    errors.push(`${path}.uncertainty must be an object.`);
  } else {
    const uncertainty = findingRecord.uncertainty as Record<string, any>;

    if (!UNCERTAINTY_LEVELS.includes(uncertainty.level)) {
      errors.push(`${path}.uncertainty.level must be a known uncertainty level.`);
    }

    if (!CLAIM_SCOPES.includes(uncertainty.claimScope)) {
      errors.push(`${path}.uncertainty.claimScope must be full, narrowed, or suppressed.`);
    }

    if (!FINDING_SUPPORT_STATUSES.includes(uncertainty.supportStatus)) {
      errors.push(`${path}.uncertainty.supportStatus must be eligible, narrowed, or suppressed.`);
    }

    if (!Array.isArray(uncertainty.blockedBy)) {
      errors.push(`${path}.uncertainty.blockedBy must be an array.`);
    }

    if (!Array.isArray(uncertainty.allowedClaims)) {
      errors.push(`${path}.uncertainty.allowedClaims must be an array.`);
    }

    for (const key of ["label", "claimScopeLabel", "headline", "explanation"]) {
      if (typeof uncertainty[key] !== "string" || uncertainty[key].length === 0) {
        errors.push(`${path}.uncertainty.${key} must be a non-empty string.`);
      }
    }

    if (!(uncertainty.rationale == null || typeof uncertainty.rationale === "string")) {
      errors.push(`${path}.uncertainty.rationale must be a string or null.`);
    }
  }

  if (!(findingRecord.recommendation == null || typeof findingRecord.recommendation === "string")) {
    errors.push(`${path}.recommendation must be a string or null.`);
  }

  if (typeof findingRecord.summary !== "string" || findingRecord.summary.length === 0) {
    errors.push(`${path}.summary must be a non-empty string.`);
  }

  if (typeof findingRecord.title !== "string" || findingRecord.title.length === 0) {
    errors.push(`${path}.title must be a non-empty string.`);
  }

  return errors;
}

export function validateReportDocument(document: unknown) {
  const errors = [];

  if (!isPlainObject(document)) {
    return buildValidation(false, ["Report document must be an object."]);
  }

  const reportDocument = document as Record<string, any>;

  if (!isPlainObject(reportDocument.dataset)) {
    errors.push("dataset must be an object.");
  } else {
    const dataset = reportDocument.dataset as Record<string, any>;

    if (!ACTOR_IDENTITY_MODES.includes(dataset.actorIdentityMode)) {
      errors.push("dataset.actorIdentityMode must be a known actor identity mode.");
    }

    if (!READYNESS_VALUES.includes(dataset.readiness)) {
      errors.push("dataset.readiness must be a known readiness value.");
    }

    if (!Object.values(SOURCE_KINDS).includes(dataset.sourceKind)) {
      errors.push("dataset.sourceKind must be a known source kind.");
    }

    if (typeof dataset.sourceKey !== "string" || dataset.sourceKey.length === 0) {
      errors.push("dataset.sourceKey must be a non-empty string.");
    }

    if (!TOOL_CATALOG_AUTHORITIES.includes(dataset.toolCatalogAuthority)) {
      errors.push("dataset.toolCatalogAuthority must be a known authority.");
    }

    validateTelemetrySpine(dataset.telemetrySpine, "dataset.telemetrySpine", errors);
  }

  if (!Array.isArray(reportDocument.findings)) {
    errors.push("findings must be an array.");
  } else {
    for (let index = 0; index < reportDocument.findings.length; index += 1) {
      errors.push(...validateFinding(reportDocument.findings[index], `findings[${index}]`));
    }
  }

  if (
    typeof reportDocument.generatedAt !== "string" ||
    Number.isNaN(Date.parse(reportDocument.generatedAt))
  ) {
    errors.push("generatedAt must be an ISO-compatible timestamp string.");
  }

  if (reportDocument.reportVersion !== PATHLOOM_REPORT_SCHEMA_VERSION) {
    errors.push(`reportVersion must equal ${PATHLOOM_REPORT_SCHEMA_VERSION}.`);
  }

  if (typeof reportDocument.sourceKey !== "string" || reportDocument.sourceKey.length === 0) {
    errors.push("sourceKey must be a non-empty string.");
  }

  if (!isPlainObject(reportDocument.summary)) {
    errors.push("summary must be an object.");
  } else {
    for (const key of [
      "clearFindingCount",
      "eventCount",
      "readyFindingCount",
      "sessionCount",
      "suppressedFindingCount",
      "toolCatalogSize",
    ]) {
      if (!isFiniteNumber(reportDocument.summary[key]) || reportDocument.summary[key] < 0) {
        errors.push(`summary.${key} must be a finite non-negative number.`);
      }
    }
  }

  if (!Array.isArray(reportDocument.suppressedFindings)) {
    errors.push("suppressedFindings must be an array.");
  } else {
    for (let index = 0; index < reportDocument.suppressedFindings.length; index += 1) {
      errors.push(
        ...validateFinding(
          reportDocument.suppressedFindings[index],
          `suppressedFindings[${index}]`,
        ),
      );
    }
  }

  return buildValidation(errors.length === 0, errors);
}

export function validateDistributionBundle(bundle: unknown) {
  const errors = [];

  if (!isPlainObject(bundle)) {
    return buildValidation(false, ["Distribution bundle must be an object."]);
  }

  if (bundle.bundleVersion !== PATHLOOM_DISTRIBUTION_BUNDLE_SCHEMA_VERSION) {
    errors.push(`bundleVersion must equal ${PATHLOOM_DISTRIBUTION_BUNDLE_SCHEMA_VERSION}.`);
  }

  if (typeof bundle.generatedAt !== "string" || Number.isNaN(Date.parse(bundle.generatedAt))) {
    errors.push("generatedAt must be an ISO-compatible timestamp string.");
  }

  if (bundle.reportVersion !== PATHLOOM_REPORT_SCHEMA_VERSION) {
    errors.push(`reportVersion must equal ${PATHLOOM_REPORT_SCHEMA_VERSION}.`);
  }

  if (typeof bundle.sourceKey !== "string" || bundle.sourceKey.length === 0) {
    errors.push("sourceKey must be a non-empty string.");
  }

  if (!isPlainObject(bundle.summary)) {
    errors.push("summary must be an object.");
  } else {
    if (typeof bundle.summary.headline !== "string" || bundle.summary.headline.length === 0) {
      errors.push("summary.headline must be a non-empty string.");
    }

    for (const key of ["readyFindingCount", "clearFindingCount", "suppressedFindingCount"]) {
      if (!isFiniteNumber(bundle.summary[key]) || bundle.summary[key] < 0) {
        errors.push(`summary.${key} must be a finite non-negative number.`);
      }
    }

    if (!Array.isArray(bundle.summary.topFindingTitles)) {
      errors.push("summary.topFindingTitles must be an array.");
    }
  }

  if (!Array.isArray(bundle.artifacts)) {
    errors.push("artifacts must be an array.");
  } else {
    for (let index = 0; index < bundle.artifacts.length; index += 1) {
      const artifact = bundle.artifacts[index];
      const path = `artifacts[${index}]`;

      if (!isPlainObject(artifact)) {
        errors.push(`${path} must be an object.`);
        continue;
      }

      const bundleArtifact = artifact as Record<string, any>;

      if (!DISTRIBUTION_BUNDLE_ARTIFACT_IDS.includes(bundleArtifact.id)) {
        errors.push(`${path}.id must be a known bundle artifact id.`);
      }

      for (const key of ["fileName", "label", "mediaType", "relPath", "contents"]) {
        if (typeof bundleArtifact[key] !== "string" || bundleArtifact[key].length === 0) {
          errors.push(`${path}.${key} must be a non-empty string.`);
        }
      }
    }
  }

  return buildValidation(errors.length === 0, errors);
}

export function validateReportSnapshot(snapshot: unknown) {
  const errors = [];

  if (!isPlainObject(snapshot)) {
    return buildValidation(false, ["Report snapshot must be an object."]);
  }

  if (snapshot.snapshotVersion !== PATHLOOM_REPORT_SNAPSHOT_SCHEMA_VERSION) {
    errors.push(`snapshotVersion must equal ${PATHLOOM_REPORT_SNAPSHOT_SCHEMA_VERSION}.`);
  }

  if (typeof snapshot.snapshotKey !== "string" || snapshot.snapshotKey.length === 0) {
    errors.push("snapshotKey must be a non-empty string.");
  }

  if (!(snapshot.label == null || typeof snapshot.label === "string")) {
    errors.push("label must be a string or null.");
  }

  if (typeof snapshot.sourceKey !== "string" || snapshot.sourceKey.length === 0) {
    errors.push("sourceKey must be a non-empty string.");
  }

  if (typeof snapshot.capturedAt !== "string" || Number.isNaN(Date.parse(snapshot.capturedAt))) {
    errors.push("capturedAt must be an ISO-compatible timestamp string.");
  }

  if (snapshot.reportVersion !== PATHLOOM_REPORT_SCHEMA_VERSION) {
    errors.push(`reportVersion must equal ${PATHLOOM_REPORT_SCHEMA_VERSION}.`);
  }

  const reportValidation = validateReportDocument(snapshot.reportDocument);
  if (!reportValidation.valid) {
    errors.push(...reportValidation.errors.map((error) => `reportDocument.${error}`));
  }

  if (!isPlainObject(snapshot.summary)) {
    errors.push("summary must be an object.");
  } else {
    for (const key of [
      "clearFindingCount",
      "eventCount",
      "readyFindingCount",
      "sessionCount",
      "suppressedFindingCount",
      "toolCatalogSize",
    ]) {
      if (!isFiniteNumber(snapshot.summary[key]) || snapshot.summary[key] < 0) {
        errors.push(`summary.${key} must be a finite non-negative number.`);
      }
    }
  }

  return buildValidation(errors.length === 0, errors);
}

export function validateHistoryDiff(diff: unknown) {
  const errors = [];

  if (!isPlainObject(diff)) {
    return buildValidation(false, ["History diff must be an object."]);
  }

  if (diff.diffVersion !== PATHLOOM_HISTORY_DIFF_SCHEMA_VERSION) {
    errors.push(`diffVersion must equal ${PATHLOOM_HISTORY_DIFF_SCHEMA_VERSION}.`);
  }

  if (typeof diff.sourceKey !== "string" || diff.sourceKey.length === 0) {
    errors.push("sourceKey must be a non-empty string.");
  }

  for (const side of ["baseline", "current"]) {
    if (!isPlainObject(diff[side])) {
      errors.push(`${side} must be an object.`);
      continue;
    }

    if (typeof diff[side].snapshotKey !== "string" || diff[side].snapshotKey.length === 0) {
      errors.push(`${side}.snapshotKey must be a non-empty string.`);
    }

    if (typeof diff[side].sourceKey !== "string" || diff[side].sourceKey.length === 0) {
      errors.push(`${side}.sourceKey must be a non-empty string.`);
    }

    if (
      typeof diff[side].capturedAt !== "string" ||
      Number.isNaN(Date.parse(diff[side].capturedAt))
    ) {
      errors.push(`${side}.capturedAt must be an ISO-compatible timestamp string.`);
    }
  }

  if (!isPlainObject(diff.summary)) {
    errors.push("summary must be an object.");
  } else {
    if (typeof diff.summary.headline !== "string" || diff.summary.headline.length === 0) {
      errors.push("summary.headline must be a non-empty string.");
    }

    for (const key of [
      "newCount",
      "resolvedCount",
      "regressedCount",
      "evidenceChangeCount",
      "unchangedCount",
    ]) {
      if (!isFiniteNumber(diff.summary[key]) || diff.summary[key] < 0) {
        errors.push(`summary.${key} must be a finite non-negative number.`);
      }
    }
  }

  for (const key of ["newFindings", "resolvedFindings", "regressedFindings", "evidenceChanges"]) {
    if (!Array.isArray(diff[key])) {
      errors.push(`${key} must be an array.`);
    }
  }

  return buildValidation(errors.length === 0, errors);
}

export function validateAdjudicationRecord(record: unknown) {
  const errors = [];

  if (!isPlainObject(record)) {
    return buildValidation(false, ["Adjudication record must be an object."]);
  }

  const adjudicationRecord = record as Record<string, any>;

  if (!ADJUDICATION_STATUSES.includes(adjudicationRecord.adjudicationStatus)) {
    errors.push(`adjudicationStatus must be one of: ${ADJUDICATION_STATUSES.join(", ")}.`);
  }

  for (const key of ["findingId", "snapshotKey", "sourceKey", "targetId", "targetLabel"]) {
    if (typeof adjudicationRecord[key] !== "string" || adjudicationRecord[key].length === 0) {
      errors.push(`${key} must be a non-empty string.`);
    }
  }

  if (!FEEDBACK_TARGET_KINDS.includes(adjudicationRecord.targetKind)) {
    errors.push(`targetKind must be one of: ${FEEDBACK_TARGET_KINDS.join(", ")}.`);
  }

  if (!(adjudicationRecord.note == null || typeof adjudicationRecord.note === "string")) {
    errors.push("note must be a string or null.");
  }

  for (const key of ["createdAt", "updatedAt"]) {
    if (
      typeof adjudicationRecord[key] !== "string" ||
      Number.isNaN(Date.parse(adjudicationRecord[key]))
    ) {
      errors.push(`${key} must be an ISO-compatible timestamp string.`);
    }
  }

  return buildValidation(errors.length === 0, errors);
}

export function validateFeedbackPolicySuggestion(policy: unknown) {
  const errors = [];

  if (!isPlainObject(policy)) {
    return buildValidation(false, ["Feedback policy suggestion must be an object."]);
  }

  for (const key of [
    "policyId",
    "policyKind",
    "findingId",
    "adjudicationStatus",
    "effect",
    "recommendation",
    "suggestedAction",
    "appliesTo",
  ]) {
    if (typeof policy[key] !== "string" || policy[key].length === 0) {
      errors.push(`${key} must be a non-empty string.`);
    }
  }

  if (!FEEDBACK_POLICY_KINDS.includes(String(policy.policyKind))) {
    errors.push(`policyKind must be one of: ${FEEDBACK_POLICY_KINDS.join(", ")}.`);
  }

  if (!FEEDBACK_POLICY_APPLIES_TO_SCOPES.includes(String(policy.appliesTo))) {
    errors.push(`appliesTo must be one of: ${FEEDBACK_POLICY_APPLIES_TO_SCOPES.join(", ")}.`);
  }

  if (policy.reversible !== true) {
    errors.push("reversible must be true.");
  }

  for (const key of ["adjudicationCount", "snapshotCount"]) {
    if (!isFiniteNumber(policy[key]) || policy[key] < 1) {
      errors.push(`${key} must be a finite number >= 1.`);
    }
  }

  return buildValidation(errors.length === 0, errors);
}

export function validateFeedbackLearningLoop(learningLoop: unknown) {
  const errors = [];

  if (!isPlainObject(learningLoop)) {
    return buildValidation(false, ["learningLoop must be an object."]);
  }

  for (const key of ["historicalAdjudicationCount", "historicalSnapshotCount"]) {
    if (!isFiniteNumber(learningLoop[key]) || learningLoop[key] < 0) {
      errors.push(`${key} must be a finite non-negative number.`);
    }
  }

  if (!Array.isArray(learningLoop.policySuggestions)) {
    errors.push("policySuggestions must be an array.");
  } else {
    for (let index = 0; index < learningLoop.policySuggestions.length; index += 1) {
      const validation = validateFeedbackPolicySuggestion(learningLoop.policySuggestions[index]);
      if (!validation.valid) {
        errors.push(
          ...validation.errors.map((error) => `policySuggestions[${index}].${error}`),
        );
      }
    }
  }

  for (const key of ["patterns", "rankingHints", "wordingHints", "evidenceGaps"]) {
    if (!Array.isArray(learningLoop[key])) {
      errors.push(`${key} must be an array.`);
    }
  }

  if (learningLoop.nextReview !== null && !isPlainObject(learningLoop.nextReview)) {
    errors.push("nextReview must be null or an object.");
  }

  return buildValidation(errors.length === 0, errors);
}

export function validateFeedbackReview(review: unknown) {
  const errors = [];

  if (!isPlainObject(review)) {
    return buildValidation(false, ["Feedback review must be an object."]);
  }

  if (review.reviewVersion !== PATHLOOM_FEEDBACK_REVIEW_SCHEMA_VERSION) {
    errors.push(`reviewVersion must equal ${PATHLOOM_FEEDBACK_REVIEW_SCHEMA_VERSION}.`);
  }

  const learningLoopValidation = validateFeedbackLearningLoop(review.learningLoop);
  if (!learningLoopValidation.valid) {
    errors.push(...learningLoopValidation.errors);
  }

  if (!isPlainObject(review.snapshot)) {
    errors.push("snapshot must be an object.");
  } else {
    for (const key of ["capturedAt", "snapshotKey", "sourceKey"]) {
      if (typeof review.snapshot[key] !== "string" || review.snapshot[key].length === 0) {
        errors.push(`snapshot.${key} must be a non-empty string.`);
      }
    }
  }

  if (!Array.isArray(review.adjudications)) {
    errors.push("adjudications must be an array.");
  } else {
    for (let index = 0; index < review.adjudications.length; index += 1) {
      const validation = validateAdjudicationRecord(review.adjudications[index]);
      if (!validation.valid) {
        errors.push(...validation.errors.map((error) => `adjudications[${index}].${error}`));
      }
    }
  }

  if (!Array.isArray(review.targets)) {
    errors.push("targets must be an array.");
  }

  if (!isPlainObject(review.summary)) {
    errors.push("summary must be an object.");
  } else {
    if (typeof review.summary.headline !== "string" || review.summary.headline.length === 0) {
      errors.push("summary.headline must be a non-empty string.");
    }

    for (const key of [
      "acceptedCount",
      "misleadingCount",
      "missingContextCount",
      "noisyCount",
      "recordedCount",
      "targetCount",
      "unreviewedCount",
    ]) {
      if (!isFiniteNumber(review.summary[key]) || review.summary[key] < 0) {
        errors.push(`summary.${key} must be a finite non-negative number.`);
      }
    }
  }

  return buildValidation(errors.length === 0, errors);
}

export function validateCheckResult(result: unknown) {
  const errors: string[] = [];

  if (!isPlainObject(result)) {
    return buildValidation(false, ["check result must be an object."]);
  }

  const check = result as Record<string, unknown>;

  if (check.checkVersion !== PATHLOOM_CHECK_RESULT_SCHEMA_VERSION) {
    errors.push(`checkVersion must be ${PATHLOOM_CHECK_RESULT_SCHEMA_VERSION}.`);
  }

  if (typeof check.passed !== "boolean") {
    errors.push("passed must be a boolean.");
  }

  if (!isFiniteNumber(check.exitCode) || (check.exitCode !== 0 && check.exitCode !== 1)) {
    errors.push("exitCode must be 0 (pass) or 1 (gate failure).");
  }

  if (!isPlainObject(check.summary)) {
    errors.push("summary must be an object.");
  } else {
    for (const key of ["gateCount", "failureCount", "passedGateCount"]) {
      if (!isFiniteNumber(check.summary[key]) || (check.summary[key] as number) < 0) {
        errors.push(`summary.${key} must be a finite non-negative number.`);
      }
    }
  }

  if (!Array.isArray(check.gates)) {
    errors.push("gates must be an array.");
  }

  if (!Array.isArray(check.failures)) {
    errors.push("failures must be an array.");
  }

  if (check.passed === true && (check.failures as unknown[]).length > 0) {
    errors.push("passed=true requires an empty failures array.");
  }

  if (check.passed === false && (check.failures as unknown[]).length === 0) {
    errors.push("passed=false requires at least one failure entry.");
  }

  return buildValidation(errors.length === 0, errors);
}

export function validateCheckBadge(badge: unknown) {
  const errors: string[] = [];

  if (!isPlainObject(badge)) {
    return buildValidation(false, ["check badge must be an object."]);
  }

  const record = badge as Record<string, unknown>;

  if (record.badgeVersion !== PATHLOOM_CHECK_BADGE_SCHEMA_VERSION) {
    errors.push(`badgeVersion must be ${PATHLOOM_CHECK_BADGE_SCHEMA_VERSION}.`);
  }

  if (record.kind !== "pathloom_certify") {
    errors.push('kind must be "pathloom_certify".');
  }

  if (typeof record.passed !== "boolean") {
    errors.push("passed must be a boolean.");
  }

  if (typeof record.issuedAt !== "string" || record.issuedAt.length === 0) {
    errors.push("issuedAt must be a non-empty ISO timestamp string.");
  }

  if (typeof record.pathloomVersion !== "string" || record.pathloomVersion.length === 0) {
    errors.push("pathloomVersion must be a non-empty string.");
  }

  if (!isPlainObject(record.demoPack)) {
    errors.push("demoPack must be an object.");
  } else {
    const demoPack = record.demoPack as Record<string, unknown>;
    if (demoPack.id !== "authoritative-ready") {
      errors.push('demoPack.id must be "authoritative-ready".');
    }

    if (typeof demoPack.contentHash !== "string" || demoPack.contentHash.length !== 64) {
      errors.push("demoPack.contentHash must be a 64-character sha256 hex digest.");
    }
  }

  if (!isPlainObject(record.gates)) {
    errors.push("gates must be an object.");
  } else {
    const gates = record.gates as Record<string, unknown>;
    if (!Array.isArray(gates.calibrationScenarios) || gates.calibrationScenarios.length === 0) {
      errors.push("gates.calibrationScenarios must be a non-empty array.");
    }

    if (!Array.isArray(gates.goldenScenarios) || gates.goldenScenarios.length === 0) {
      errors.push("gates.goldenScenarios must be a non-empty array.");
    }
  }

  if (record.passed !== true) {
    errors.push("passed=true is required for a certify badge emission.");
  }

  return buildValidation(errors.length === 0, errors);
}
