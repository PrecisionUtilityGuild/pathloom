"use strict";

export type PlainObject = Record<string, unknown>;

export interface DatasetProfile {
  sourceKind: string;
  actorIdentity: {
    mode: string;
    privacy: string;
  };
  toolCatalog: {
    authority: string;
    completeness: string;
  };
  schemaEvidence: {
    expectedSchema: string;
    observedArguments: string;
  };
  provenance: {
    sessionization: string;
    eventOrder: string;
    lifecycleOutcomes: string;
    clientHints: string;
  };
  telemetrySpine: {
    firstClassFields: string[];
    importedMetadata: {
      aiModelIdentity: string;
      aiPromptIdentity: string;
      externalAttributeBags: string;
      langfuseSurfaces: string;
    };
    spanLineage: string;
    traceIdentity: string;
  };
}

export interface FindingSupportDecision {
  status: "eligible" | "narrowed" | "suppressed";
  allowedClaims: string[];
  blockedBy: string[];
  rationale: string;
}

export interface FindingSupportEvaluation {
  valid: boolean;
  validationIssues: string[];
  findings: Record<string, FindingSupportDecision>;
}

export interface DatasetReadinessSummary {
  readiness: "invalid" | "minimal" | "partial" | "full";
  eligibleFindings: string[];
  narrowedFindings: string[];
  suppressedFindings: string[];
  validationIssues: string[];
}

export interface DatasetRecord {
  createdAt: number;
  id: number;
  profile: DatasetProfile;
  readiness: DatasetReadinessSummary;
  sourceKey: string;
  sourceKind: string;
  updatedAt: number;
}

export interface ToolCatalogEntry {
  registeredAt?: number;
  schema: PlainObject | null;
  schemaSource: string | null;
  serverId: string;
  serverVersion: string;
  toolName: string;
}

export interface InvocationSessionState {
  lastTool: string | null;
  position: number;
}

export interface RawInvocationEvent {
  actorKey?: string | null;
  actorPrivacy?: string | null;
  arguments?: PlainObject | null;
  argumentsMissing?: string[];
  argumentsProvided?: string[];
  clientHint?: string | null;
  invokedAt: number;
  outcome: string;
  parentSpanId?: string | null;
  provenance?: PlainObject | null;
  resolvedAt: number;
  resultTokenEstimate?: number;
  serverId?: string;
  serverVersion?: string;
  sessionId?: string | null;
  sessionIdSource?: string | null;
  spanId?: string | null;
  sourceEventId?: string | null;
  toolName: string;
  traceId?: string | null;
}

export interface PersistedInvocationEvent {
  actorKey: string | null;
  actorPrivacy: string | null;
  argumentsJson: string | null;
  argumentsMissingJson: string;
  argumentsProvidedJson: string;
  argumentShapesJson: string;
  clientHint: string;
  invokedAt: number;
  isFirstInSession: 0 | 1;
  outcome: string;
  parentSpanId: string | null;
  positionInSession: number;
  precedingTool: string | null;
  provenanceJson: string;
  resolvedAt: number;
  resultTokenEstimate: number;
  serverId: string;
  serverVersion: string;
  sessionId: string;
  sessionIdSource: string;
  spanId: string | null;
  sourceEventId: string | null;
  toolName: string;
  traceId: string | null;
}

export interface InvocationEventRecord {
  actorKey: string | null;
  actorPrivacy: string | null;
  arguments: PlainObject | null;
  argumentShapes: Record<string, string>;
  argumentsMissing: string[];
  argumentsProvided: string[];
  clientHint: string;
  invokedAt: number;
  isFirstInSession: boolean;
  outcome: string;
  parentSpanId: string | null;
  positionInSession: number;
  precedingTool: string | null;
  provenance: PlainObject;
  resolvedAt: number;
  resultTokenEstimate: number;
  serverId: string;
  serverVersion: string;
  sessionId: string;
  sessionIdSource: string;
  spanId: string | null;
  sourceEventId: string | null;
  toolName: string;
  traceId: string | null;
}

export interface InvocationMeta {
  actorKey?: string | null;
  actorPrivacy?: string | null;
  arguments?: PlainObject;
  argumentsMissing?: string[];
  clientHint?: string;
  outcome?: string;
  parentSpanId?: string | null;
  provenance?: PlainObject;
  resultTokenEstimate?: number;
  sessionId?: string;
  sessionIdSource?: string | null;
  spanId?: string | null;
  traceId?: string | null;
}

export interface AdjudicationRecord {
  adjudicationStatus: string;
  createdAt: string;
  findingId: string;
  note: string | null;
  snapshotKey: string;
  sourceKey: string;
  targetId: string;
  targetKind: string;
  targetLabel: string;
  updatedAt: string;
}

export interface StoreOptions {
  filename?: string;
  storeOptions?: {
    filename?: string;
  };
}

export type FindingId =
  | "dead_tool_detection"
  | "argument_mismatch_patterns"
  | "session_termination_analysis"
  | "sequence_risk_map"
  | "client_divergence"
  | "activation_tool_report";

export type FindingSeverity = "info" | "warning" | "clear";
export type FindingStatus = "ready" | "clear" | "suppressed";
export type SupportStatus = "eligible" | "narrowed" | "suppressed";
export type UncertaintyLevel = "unsupported" | "weak" | "candidate" | "credible";
export type ClaimScope = "suppressed" | "narrowed" | "full";

export interface FindingUncertainty {
  allowedClaims: string[];
  blockedBy: string[];
  claimScope: ClaimScope;
  claimScopeLabel: string;
  explanation: string;
  headline: string;
  label: string;
  level: UncertaintyLevel;
  rationale: string | null;
  supportStatus: SupportStatus;
}

export interface BaseFindingItem extends PlainObject {
  argumentName?: string;
  avgToolsPerSession?: number;
  baselineErrorRate?: number;
  baselineSuccessRate?: number;
  baselineToolErrorRate?: number;
  baselineToolsPerSession?: number;
  callCount?: number;
  classification?: string;
  clientErrorRate?: number;
  clientHint?: string;
  confidence?: string;
  confidenceBand?: ActivationConfidenceBand;
  controlActors?: number;
  controlReturnRate?: number;
  endpoint?: {
    terminalTool: string;
    type: string;
  };
  errorRate?: number;
  expected?: string;
  exposedActors?: number;
  exposedReturnRate?: number;
  issueType?: string;
  mismatchRate?: number;
  observationCount?: number;
  observedExample?: string;
  overallClientOutlier?: boolean;
  pathKind?: "risky_sequence" | "golden_path";
  peerCohorts?: {
    matchedSuffixPeers?: SequencePeerRate;
    terminalToolPeers?: SequencePeerRate;
  };
  cohortContext?: ActivationCohortContext;
  /** Cohort / trajectory-family semantics for sequence findings (SEQ-02). */
  trajectoryContext?: SequenceTrajectoryContext;
  peerObservationCount?: number;
  returnRateDelta?: number;
  returnRateMultiplier?: number | null;
  returnedActors?: number;
  sequence?: string[];
  sequenceLabel?: string;
  sessionsEndingHere?: number;
  sessionsReachingTool?: number;
  signalClass?: string;
  successRate?: number;
  terminalToolBaselineErrorRate?: number;
  terminalToolBaselineSuccessRate?: number;
  toolName?: string;
  totalToolObservations?: number;
}

export interface DeadToolItem extends BaseFindingItem {
  callCount: number;
  confidence: string;
  toolName: string;
}

export interface MissingRequiredArgumentItem extends BaseFindingItem {
  argumentName: string;
  issueType: "missing_required_argument";
  mismatchRate: number;
  observationCount: number;
  toolName: string;
  totalToolObservations?: number;
}

export interface WrongArgumentTypeOrShapeItem extends BaseFindingItem {
  argumentName: string;
  expected: string;
  issueType: "wrong_argument_type_or_shape";
  mismatchRate: number;
  observationCount: number;
  observedExample: string;
  toolName: string;
  totalToolObservations?: number;
}

export interface InvalidArgumentValueItem extends BaseFindingItem {
  argumentName: string;
  expected: string;
  issueType: "invalid_argument_value";
  mismatchRate: number;
  observationCount: number;
  observedExample: string;
  toolName: string;
  totalToolObservations?: number;
}

export interface TerminationPatternItem extends BaseFindingItem {
  classification: string;
  sessionsEndingHere: number;
  sessionsReachingTool: number;
  terminationRate: number;
  toolName: string;
}

export interface SequenceClientSpread {
  clientHints: string[];
  transferability: string;
}

export interface SequencePeerRate {
  label: string;
  observationCount?: number;
  rate: number;
  sequenceLabels?: string[];
}

/** Explicit trajectory family + peer-bucket context for sequence items. */
export interface SequenceTrajectoryContext {
  cohortSemantics: string;
  familyDistinctPathCount: number;
  familyId: string;
  familyLabel: string;
  peerObservationCount: number;
  suffixBucketObservationCount: number;
  windowLength: number;
}

export interface SequencePathItem extends BaseFindingItem {
  clientSpread?: SequenceClientSpread;
  errorRate?: number;
  observationCount: number;
  pathKind: "risky_sequence" | "golden_path";
  peerCohorts?: {
    matchedSuffixPeers?: SequencePeerRate;
    terminalToolPeers?: SequencePeerRate;
  };
  peerObservationCount: number;
  sequence: string[];
  sequenceLabel: string;
  successRate?: number;
  trajectoryContext?: SequenceTrajectoryContext;
}

export interface ClientOutlierItem extends BaseFindingItem {
  avgToolsPerSession: number;
  baselineSuccessRate: number;
  baselineToolsPerSession: number;
  clientHint: string;
  issueType: "client_outlier";
  successRate: number;
}

export interface ToolOutlierItem extends BaseFindingItem {
  baselineToolErrorRate: number;
  clientErrorRate: number;
  clientHint: string;
  issueType: "tool_outlier";
  overallClientOutlier: boolean;
  toolName: string;
}

export interface ActivationConfidenceBand {
  controlLower: number;
  controlUpper: number;
  exposedLower: number;
  exposedUpper: number;
}

/** Per-tool cohort and return-window semantics for activation items (ACT-02). */
export interface ActivationCohortContext {
  cohortSemantics: string;
  comparisonId: string;
  controlActorCount: number;
  controlCohortLabel: string;
  controlReturnRate: number;
  exposedActorCount: number;
  exposureCohortLabel: string;
  exposedReturnRate: number;
  returnWindow: {
    immediateNextSessionReturns: number;
    kind: string;
    label: string;
    medianInvokedAtGapToReturn: number | null;
    sustainedMultiSessionReturns: number;
  };
}

export interface ActivationToolItem extends BaseFindingItem {
  cohortContext?: ActivationCohortContext;
  confidenceBand?: ActivationConfidenceBand;
  controlActors: number;
  controlReturnRate: number;
  exposedActors: number;
  exposedReturnRate: number;
  issueType: "activation_tool";
  returnRateDelta: number;
  returnRateMultiplier: number | null;
  returnedActors: number;
  signalClass: string;
  toolName: string;
}

export type FindingItem =
  | DeadToolItem
  | MissingRequiredArgumentItem
  | WrongArgumentTypeOrShapeItem
  | InvalidArgumentValueItem
  | TerminationPatternItem
  | SequencePathItem
  | ClientOutlierItem
  | ToolOutlierItem
  | ActivationToolItem;

export interface FindingEvidence {
  [key: string]: unknown;
  diagnostics?: {
    actorLinkage?: {
      linkedActorCount?: number;
    };
    confoundingRisk?: {
      level?: string;
      reasons?: string[];
    };
    returnWindow?: {
      aggregate?: {
        immediateNextSessionReturns?: number;
        medianInvokedAtGapToReturn?: number | null;
        returningActorCount?: number;
        sustainedMultiSessionReturns?: number;
      };
      claimBoundary?: string;
      explanation?: string;
      kind?: string;
      label?: string;
      timingMode?: string;
    };
    signalTaxonomy?: {
      future?: string;
    };
  };
}

export interface Finding {
  blockedBy?: string[];
  evidence?: FindingEvidence;
  id: FindingId;
  items: FindingItem[];
  recommendation: string | null;
  score: number;
  severity: FindingSeverity;
  status: FindingStatus;
  summary: string;
  support?: FindingSupportDecision;
  title: string;
  uncertainty?: FindingUncertainty;
}

export type ReportFinding = Omit<Finding, "score">;

export interface DatasetStats {
  eventCount: number;
  sessionCount: number;
  toolCatalogSize: number;
}

export interface AnalysisContextInput {
  dataset: DatasetRecord;
  events: InvocationEventRecord[];
  sourceKey: string;
  toolCatalog: ToolCatalogEntry[];
}

export interface AnalysisResult {
  dataset: DatasetRecord;
  datasetStats: DatasetStats;
  findings: Finding[];
  generatedAt: number;
  sourceKey: string;
  suppressedFindings: Finding[];
}

export interface AnalysisThresholds {
  [key: string]: number;
  activationCandidateMinControlActors: number;
  activationCandidateMinExposedActors: number;
  activationCandidateMinReturnRateDelta: number;
  activationCandidateMinReturnRateMultiplier: number;
  activationCredibleMinControlActors: number;
  activationCredibleMinExposedActors: number;
  activationCredibleMinReturnRateDelta: number;
  activationCredibleMinReturnRateMultiplier: number;
  activationMinLinkedActors: number;
  activationMinReturnedActors: number;
  clientMinComparableSessions: number;
  clientMinDistinctClients: number;
  clientMinSuccessGap: number;
  clientMinToolsGap: number;
  clientToolErrorGap: number;
  clientToolMinErrorRate: number;
  clientToolMinObservations: number;
  deadToolsHighConfidenceSessions: number;
  deadToolsMediumConfidenceSessions: number;
  deadToolsMinSessions: number;
  mismatchMinObservations: number;
  mismatchMinOccurrences: number;
  mismatchMinProvidedObservations: number;
  mismatchMinRate: number;
  sequenceMaxLength: number;
  sequenceMinDistinctObservations: number;
  sequenceMinErrorLift: number;
  sequenceMinErrorRate: number;
  sequenceMinPeerObservations: number;
  sequenceMinSuccessLift: number;
  sequenceMinSuccessRate: number;
  sequenceMinTerminalErrorLift: number;
  sequenceMinTerminalSuccessLift: number;
  terminationCandidateMinSessions: number;
  terminationMinRate: number;
  terminationMinSessions: number;
}

export interface ReportDatasetSummary {
  actorIdentityMode: string;
  readiness: DatasetReadinessSummary["readiness"];
  sourceKey: string;
  sourceKind: string;
  telemetrySpine: {
    [key: string]: unknown;
    sessionization: string;
  };
  toolCatalogAuthority: string;
}

export interface ReportSummary {
  clearFindingCount: number;
  eventCount: number;
  readyFindingCount: number;
  sessionCount: number;
  suppressedFindingCount: number;
  toolCatalogSize: number;
}

export interface ReportDocument {
  dataset: ReportDatasetSummary;
  findings: ReportFinding[];
  generatedAt: string;
  reportVersion: string;
  sourceKey: string;
  summary: ReportSummary;
  suppressedFindings: ReportFinding[];
}

export interface BundleArtifact {
  contents: string;
  fileName: string;
  id: "share_summary" | "report_markdown" | "report_json";
  label: string;
  mediaType: string;
  relPath: string;
}

export interface DistributionBundle {
  artifacts: BundleArtifact[];
  bundleVersion: string;
  dataset?: ReportDatasetSummary;
  generatedAt: string;
  reportVersion: string;
  sourceKey: string;
  summary: {
    clearFindingCount: number;
    headline: string;
    readyFindingCount: number;
    recommendedActions: Array<{
      recommendation: string;
      title: string;
    }>;
    suppressedFindingCount: number;
    topFindingTitles: string[];
  };
}

export interface ReportSnapshot {
  capturedAt: string;
  label: string | null;
  reportDocument: ReportDocument;
  reportVersion: string;
  snapshotKey: string;
  snapshotVersion: string;
  sourceKey: string;
  summary: ReportSummary;
}

export interface HistoryDiffEntry {
  blockedBy?: string[];
  changeType?: string;
  currentValue?: number | string;
  findingId: string;
  label: string;
  metric?: string;
  previousValue?: number | string;
  title: string;
}

export interface HistoryDiff {
  baseline: {
    capturedAt: string;
    label?: string | null;
    snapshotKey: string;
    sourceKey: string;
  };
  current: {
    capturedAt: string;
    label?: string | null;
    snapshotKey: string;
    sourceKey: string;
  };
  diffVersion: string;
  evidenceChanges: HistoryDiffEntry[];
  newFindings: HistoryDiffEntry[];
  regressedFindings: HistoryDiffEntry[];
  resolvedFindings: HistoryDiffEntry[];
  sourceKey: string;
  summary: {
    evidenceChangeCount: number;
    headline: string;
    newCount: number;
    regressedCount: number;
    resolvedCount: number;
    unchangedCount: number;
  };
}

export interface FeedbackTarget {
  findingId: string;
  findingStatus: FindingStatus;
  reviewPriority?: number;
  reviewPriorityReasons?: string[];
  targetId: string;
  targetKind: string;
  targetLabel: string;
  title: string;
}

export interface FeedbackPattern {
  count: number;
  findingId: string;
  snapshotCount: number;
  status: string;
  suggestedAction: string;
  summary: string;
}

export interface FeedbackHint {
  count: number;
  effect?: string;
  findingId: string;
  reason: string;
}

export type FeedbackPolicyKind =
  | "evidence_request"
  | "ranking_pressure"
  | "suppression_guidance"
  | "wording_adjustment";

export interface FeedbackPolicySuggestion {
  adjudicationCount: number;
  adjudicationStatus: string;
  appliesTo: "feedback_review_only";
  effect: string;
  findingId: string;
  policyId: string;
  policyKind: FeedbackPolicyKind;
  recommendation: string;
  reversible: true;
  snapshotCount: number;
  suggestedAction: string;
}

export interface FeedbackLearningLoop {
  evidenceGaps: FeedbackHint[];
  historicalAdjudicationCount: number;
  historicalSnapshotCount: number;
  nextReview: null | {
    findingId: string;
    rationale: string;
    reviewPriority: number;
    suggestedAction: string;
    targetId: string;
    targetKind: string;
    targetLabel: string;
  };
  patterns: FeedbackPattern[];
  policySuggestions: FeedbackPolicySuggestion[];
  rankingHints: FeedbackHint[];
  wordingHints: FeedbackHint[];
}

export interface FeedbackReview {
  adjudications: AdjudicationRecord[];
  learningLoop: FeedbackLearningLoop;
  reviewVersion: string;
  snapshot: {
    capturedAt: string;
    snapshotKey: string;
    sourceKey: string;
  };
  summary: {
    acceptedCount: number;
    headline: string;
    historicalAdjudicationCount: number;
    historicalSnapshotCount: number;
    misleadingCount: number;
    missingContextCount: number;
    noisyCount: number;
    recordedCount: number;
    targetCount: number;
    unreviewedCount: number;
  };
  targets: FeedbackTarget[];
}
