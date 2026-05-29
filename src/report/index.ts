"use strict";

const fs = require("node:fs");
const path = require("node:path");

import type {
  AnalysisResult,
  DatasetRecord,
  DistributionBundle,
  Finding,
  FindingUncertainty,
  ReportFinding,
  ReportDatasetSummary,
  ReportDocument,
} from "../core/types";

const {
  PATHLOOM_DISTRIBUTION_BUNDLE_SCHEMA_VERSION,
  PATHLOOM_REPORT_SCHEMA_VERSION,
  validateDistributionBundle,
  validateReportDocument,
} = require("../contracts") as typeof import("../contracts");
import { createFindingUncertainty } from "../uncertainty";

export const REPORT_VERSION = PATHLOOM_REPORT_SCHEMA_VERSION;
export const DISTRIBUTION_BUNDLE_VERSION = PATHLOOM_DISTRIBUTION_BUNDLE_SCHEMA_VERSION;
export const BUNDLE_MANIFEST_FILE = "bundle.json";
export const BUNDLE_ARTIFACT_FILES = Object.freeze({
  report_json: "report.json",
  report_markdown: "report.md",
  share_summary: "share-summary.md",
});

function toIsoTimestamp(value: string | number | Date): string {
  return new Date(value).toISOString();
}

function summarizeDataset(dataset: DatasetRecord): ReportDatasetSummary {
  return {
    actorIdentityMode: dataset.profile.actorIdentity.mode,
    readiness: dataset.readiness.readiness,
    sourceKind: dataset.sourceKind,
    sourceKey: dataset.sourceKey,
    telemetrySpine: {
      sessionization: dataset.profile.provenance.sessionization,
      ...dataset.profile.telemetrySpine,
    },
    toolCatalogAuthority: dataset.profile.toolCatalog.authority,
  };
}

function renderTelemetrySummary(
  telemetrySpine: Partial<ReportDatasetSummary["telemetrySpine"]> = {},
): string {
  const spine = telemetrySpine as Record<string, unknown>;
  const traceIdentity = typeof spine.traceIdentity === "string" ? spine.traceIdentity : "none";
  const spanLineage = typeof spine.spanLineage === "string" ? spine.spanLineage : "none";
  const sessionization = typeof spine.sessionization === "string" ? spine.sessionization : "none";
  const firstClassFields =
    Array.isArray(spine.firstClassFields) && spine.firstClassFields.length > 0
      ? spine.firstClassFields.join(", ")
      : "none";

  return `Telemetry: sessions ${sessionization}; trace ${traceIdentity}; span lineage ${spanLineage}; first-class fields ${firstClassFields}`;
}

function serializeFinding(finding: Finding): ReportFinding {
  return {
    blockedBy: finding.blockedBy || [],
    evidence: finding.evidence || {},
    id: finding.id,
    items: finding.items || [],
    recommendation: finding.recommendation || null,
    severity: finding.severity,
    status: finding.status,
    summary: finding.summary,
    title: finding.title,
    uncertainty: finding.uncertainty || createFindingUncertainty(finding),
  };
}

function renderMarkdownUncertainty(uncertainty: FindingUncertainty): string {
  return [
    `Evidence strength: **${uncertainty.label}** (${uncertainty.claimScopeLabel})`,
    "",
    `${uncertainty.explanation}`,
  ].join("\n");
}

function renderSequenceClientCoverage(clientSpread) {
  if (!clientSpread || !Array.isArray(clientSpread.clientHints)) {
    return "client coverage unavailable";
  }

  if (clientSpread.transferability === "cross_client") {
    return `seen across ${clientSpread.clientHints.join(", ")}`;
  }

  return `seen in ${clientSpread.clientHints[0] || "one client"} only`;
}

function activationSignalLabel(signalClass) {
  if (signalClass === "candidate_return_correlate") {
    return "candidate return correlate";
  }

  if (signalClass === "credible_cohort_signal") {
    return "credible cohort signal";
  }

  return "return signal";
}

function renderConfoundingReasons(diagnostics) {
  return Array.isArray(diagnostics?.confoundingRisk?.reasons) &&
    diagnostics.confoundingRisk.reasons.length > 0
    ? diagnostics.confoundingRisk.reasons.join("; ")
    : "not specified";
}

function renderMismatchObservationLabel(item) {
  return item.totalToolObservations != null && item.totalToolObservations !== item.observationCount
    ? `${item.observationCount} provided calls`
    : `${item.observationCount} calls`;
}

function resolveSequenceTerminalTool(item) {
  return item.endpoint?.terminalTool || item.sequence[item.sequence.length - 1];
}

function resolveSequencePeerLabel(item) {
  return item.peerCohorts?.matchedSuffixPeers?.label || "matched peers";
}

function resolveTerminalPeerLabel(item) {
  return (
    item.peerCohorts?.terminalToolPeers?.label ||
    `other routes ending at ${resolveSequenceTerminalTool(item)}`
  );
}

function renderSequenceTrajectoryClause(item) {
  const ctx = item.trajectoryContext;
  if (!ctx) {
    return "";
  }

  const cohortReadable = ctx.cohortSemantics.replace(/_/g, " ");

  return ` Trajectory family \`${ctx.familyId}\` (${ctx.windowLength}-hop): ${ctx.familyLabel}; compared vs ${ctx.peerObservationCount} suffix-peer observations (${cohortReadable}; ${ctx.familyDistinctPathCount} distinct paths in the peer bucket).`;
}

function renderSequenceTrajectoryTerminal(item) {
  const ctx = item.trajectoryContext;
  if (!ctx) {
    return [];
  }

  const cohortReadable = ctx.cohortSemantics.replace(/_/g, " ");

  return [
    `   trajectory: ${ctx.familyId}`,
    `   window: ${ctx.windowLength}-hop; peer bucket obs: ${ctx.suffixBucketObservationCount}; distinct paths in bucket: ${ctx.familyDistinctPathCount}`,
    `   cohort semantics: ${cohortReadable}`,
  ];
}

function renderActivationCohortClause(item) {
  const ctx = item.cohortContext;
  if (!ctx) {
    return "";
  }

  const gapLabel =
    ctx.returnWindow.medianInvokedAtGapToReturn == null
      ? "no invoked-at gap recorded"
      : `median invoked-at gap to return ${ctx.returnWindow.medianInvokedAtGapToReturn}`;

  return ` Cohort \`${ctx.comparisonId}\`: ${ctx.exposureCohortLabel} vs ${ctx.controlCohortLabel} (${ctx.returnWindow.immediateNextSessionReturns} immediate next-session returns, ${ctx.returnWindow.sustainedMultiSessionReturns} sustained multi-session returns; ${gapLabel}).`;
}

function renderActivationCohortTerminal(item) {
  const ctx = item.cohortContext;
  if (!ctx) {
    return [];
  }

  return [
    `   cohort: ${ctx.comparisonId}`,
    `   exposure: ${ctx.exposedActorCount} actors @ ${Math.round(ctx.exposedReturnRate * 100)}% return`,
    `   control: ${ctx.controlActorCount} actors @ ${Math.round(ctx.controlReturnRate * 100)}% return`,
    `   return shape: ${ctx.returnWindow.immediateNextSessionReturns} immediate / ${ctx.returnWindow.sustainedMultiSessionReturns} sustained`,
    `   median invoked-at gap: ${ctx.returnWindow.medianInvokedAtGapToReturn ?? "n/a"}`,
  ];
}

function renderActivationDiagnosticsMarkdown(diagnostics) {
  if (!diagnostics) {
    return [];
  }

  const aggregate = diagnostics.returnWindow?.aggregate;
  const timingSummary = aggregate
    ? ` Aggregate timing: ${aggregate.returningActorCount} returning actors (${aggregate.immediateNextSessionReturns} immediate next-session, ${aggregate.sustainedMultiSessionReturns} sustained multi-session${
        aggregate.medianInvokedAtGapToReturn != null
          ? `; median invoked-at gap ${aggregate.medianInvokedAtGapToReturn}`
          : ""
      }).`
    : "";

  return [
    "",
    "Interpretation limits:",
    `- Linked-cohort association only: Pathloom is not estimating incremental effect or causal lift here (${diagnostics.returnWindow?.claimBoundary || "claim boundary not specified"}).`,
    `- Return window: ${diagnostics.returnWindow?.label || "unspecified"} (${diagnostics.returnWindow?.timingMode || "unspecified timing mode"}). ${diagnostics.returnWindow?.explanation || "no explanation provided"}${timingSummary}`,
    `- Confounding risk: ${diagnostics.confoundingRisk?.level || "unspecified"}; ${renderConfoundingReasons(diagnostics)}.`,
    `- Actor linkage gate: ${diagnostics.actorLinkage?.linkedActorCount ?? 0} linked actors satisfied the privacy-safe cohort requirement.`,
  ];
}

function renderActivationDiagnosticsTerminal(diagnostics) {
  if (!diagnostics) {
    return [];
  }

  return [
    `   interpretation: linked-cohort association only; no incremental-effect claim`,
    `   return window: ${diagnostics.returnWindow?.label || "unspecified"} -- ${diagnostics.returnWindow?.explanation || "no explanation provided"}`,
    `   confounding risk: ${diagnostics.confoundingRisk?.level || "unspecified"} -- ${renderConfoundingReasons(diagnostics)}`,
    `   actor linkage gate: ${diagnostics.actorLinkage?.linkedActorCount ?? 0} linked actors met the privacy-safe cohort requirement`,
  ];
}

export function createReportDocument(analysis: AnalysisResult): ReportDocument {
  const readyFindings = analysis.findings.filter((finding) => finding.status === "ready");
  const clearFindings = analysis.findings.filter((finding) => finding.status === "clear");

  const document = {
    dataset: summarizeDataset(analysis.dataset),
    findings: analysis.findings.map(serializeFinding),
    generatedAt: toIsoTimestamp(analysis.generatedAt),
    reportVersion: REPORT_VERSION,
    sourceKey: analysis.sourceKey,
    summary: {
      clearFindingCount: clearFindings.length,
      eventCount: analysis.datasetStats.eventCount,
      readyFindingCount: readyFindings.length,
      sessionCount: analysis.datasetStats.sessionCount,
      suppressedFindingCount: analysis.suppressedFindings.length,
      toolCatalogSize: analysis.datasetStats.toolCatalogSize,
    },
    suppressedFindings: analysis.suppressedFindings.map(serializeFinding),
  };

  const validation = validateReportDocument(document);
  if (!validation.valid) {
    throw new Error(`Invalid report document: ${validation.errors.join(" ")}`);
  }

  return document;
}

export function renderJsonReport(document: ReportDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function renderMarkdownFinding(finding: ReportFinding): string {
  const lines = [`## ${finding.title}`, "", `${finding.summary}`];

  if (finding.uncertainty) {
    lines.push("", renderMarkdownUncertainty(finding.uncertainty));
  }

  if (finding.id === "activation_tool_report") {
    lines.push(...renderActivationDiagnosticsMarkdown(finding.evidence?.diagnostics));
  }

  if (finding.items.length > 0) {
    lines.push("");
    for (const item of finding.items) {
      if (item.issueType === "missing_required_argument") {
        lines.push(
          `- \`${item.toolName}\` is often missing required argument \`${item.argumentName}\` (${Math.round(
            item.mismatchRate * 100,
          )}% of ${item.observationCount} calls).`,
        );
        continue;
      }

      if (item.issueType === "wrong_argument_type_or_shape") {
        lines.push(
          `- \`${item.toolName}\` often sends \`${item.argumentName}\` as \`${item.observedExample}\` but expects \`${item.expected}\` (${Math.round(
            item.mismatchRate * 100,
          )}% of ${renderMismatchObservationLabel(item)}).`,
        );
        continue;
      }

      if (item.issueType === "invalid_argument_value") {
        lines.push(
          `- \`${item.toolName}\` often sends invalid value \`${item.observedExample}\` for \`${item.argumentName}\` (expected ${item.expected}; ${Math.round(
            item.mismatchRate * 100,
          )}% of ${renderMismatchObservationLabel(item)}).`,
        );
        continue;
      }

      if (item.terminationRate != null) {
        lines.push(
          `- \`${item.toolName}\` ends ${item.sessionsEndingHere}/${item.sessionsReachingTool} reached sessions (${Math.round(
            Number(item.terminationRate) * 100,
          )}%), classified as \`${item.classification}\`.`,
        );
        continue;
      }

      if (item.callCount === 0) {
        lines.push(
          `- \`${item.toolName}\` recorded 0 calls across the analysis window (confidence: ${item.confidence}).`,
        );
        continue;
      }

      if (item.pathKind === "risky_sequence") {
        const peerLabel = resolveSequencePeerLabel(item);
        const peerRate = item.peerCohorts?.matchedSuffixPeers?.rate ?? item.baselineErrorRate;
        const terminalLabel = resolveTerminalPeerLabel(item);
        const terminalRate =
          item.peerCohorts?.terminalToolPeers?.rate ?? item.terminalToolBaselineErrorRate;
        lines.push(
          `- \`${item.sequenceLabel}\` reliably precedes the \`${resolveSequenceTerminalTool(item)}\` failure endpoint: ${Math.round(
            item.errorRate * 100,
          )}% errors across ${item.observationCount} repeated paths. ${peerLabel} fail ${Math.round(
            peerRate * 100,
          )}% across ${item.peerObservationCount} peer paths, and ${terminalLabel} fail ${Math.round(
            terminalRate * 100,
          )}%; ${renderSequenceClientCoverage(item.clientSpread)}.${renderSequenceTrajectoryClause(item)}`,
        );
        continue;
      }

      if (item.pathKind === "golden_path") {
        const peerLabel = resolveSequencePeerLabel(item);
        const peerRate = item.peerCohorts?.matchedSuffixPeers?.rate ?? item.baselineSuccessRate;
        const terminalLabel = resolveTerminalPeerLabel(item);
        const terminalRate =
          item.peerCohorts?.terminalToolPeers?.rate ?? item.terminalToolBaselineSuccessRate;
        lines.push(
          `- \`${item.sequenceLabel}\` is a reusable success path into \`${resolveSequenceTerminalTool(item)}\`: ${Math.round(
            item.successRate * 100,
          )}% success across ${item.observationCount} repeated paths. ${peerLabel} succeed ${Math.round(
            peerRate * 100,
          )}% across ${item.peerObservationCount} peer paths, and ${terminalLabel} succeed ${Math.round(
            terminalRate * 100,
          )}%; ${renderSequenceClientCoverage(item.clientSpread)}.${renderSequenceTrajectoryClause(item)}`,
        );
        continue;
      }

      if (item.issueType === "client_outlier") {
        lines.push(
          `- \`${item.clientHint}\` averages ${item.avgToolsPerSession} tools/session with ${Math.round(
            item.successRate * 100,
          )}% success (peer baseline: ${Math.round(
            item.baselineSuccessRate * 100,
          )}%, ${item.baselineToolsPerSession} tools/session).`,
        );
        continue;
      }

      if (item.issueType === "tool_outlier") {
        const scopeLabel = item.overallClientOutlier
          ? ""
          : " while the overall client cohort stays within range";
        lines.push(
          `- \`${item.clientHint}\` underperforms on \`${item.toolName}\` with ${Math.round(
            item.clientErrorRate * 100,
          )}% errors (peer baseline: ${Math.round(item.baselineToolErrorRate * 100)}%)${scopeLabel}.`,
        );
        continue;
      }

      if (item.issueType === "activation_tool") {
        const multiplier =
          item.returnRateMultiplier == null
            ? "with no control-group returns observed"
            : `(${item.returnRateMultiplier}x the control-group return rate)`;
        const confidenceLabel = item.confidenceBand
          ? ` 95% interval ${Math.round(item.confidenceBand.exposedLower * 100)}-${Math.round(
              item.confidenceBand.exposedUpper * 100,
            )}% vs control ${Math.round(item.confidenceBand.controlLower * 100)}-${Math.round(
              item.confidenceBand.controlUpper * 100,
            )}%`
          : "";
        const signalLabel = activationSignalLabel(item.signalClass);
        lines.push(
          `- \`${item.toolName}\` is a ${signalLabel}: ${item.returnedActors}/${item.exposedActors} linked actors who used it in session 1 returned for a second observed session (${Math.round(
            item.exposedReturnRate * 100,
          )}%) versus ${Math.round(item.controlReturnRate * 100)}% for the linked control cohort ${multiplier}.${confidenceLabel}${renderActivationCohortClause(item)}`,
        );
        continue;
      }
    }
  }

  if (finding.recommendation) {
    lines.push("", `Recommendation: ${finding.recommendation}`);
  }

  return lines.join("\n");
}

export function renderMarkdownReport(document: ReportDocument): string {
  const lines = [
    "# Pathloom Report",
    "",
    `Source: \`${document.sourceKey}\``,
    `Generated: ${document.generatedAt}`,
    `Sessions: ${document.summary.sessionCount}`,
    `Events: ${document.summary.eventCount}`,
    `Catalog tools: ${document.summary.toolCatalogSize}`,
    renderTelemetrySummary(document.dataset.telemetrySpine),
    "",
  ];

  if (document.findings.length > 0) {
    for (const finding of document.findings) {
      lines.push(renderMarkdownFinding(finding), "");
    }
  } else {
    lines.push("No ready or clear findings were emitted.", "");
  }

  if (document.suppressedFindings.length > 0) {
    lines.push("## Suppressed findings", "");
    for (const finding of document.suppressedFindings) {
      lines.push(`### ${finding.title}`, "");
      lines.push(`${finding.summary}`, "");
      if (finding.uncertainty) {
        lines.push(renderMarkdownUncertainty(finding.uncertainty), "");
      }
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderTerminalFinding(finding: ReportFinding): string {
  const lines = [`${finding.severity === "warning" ? "WARN" : "OK"}  ${finding.title}`];

  if (finding.uncertainty) {
    lines.push(
      `   evidence: ${finding.uncertainty.label.toLowerCase()} (${finding.uncertainty.claimScopeLabel})`,
    );
    lines.push(`   why: ${finding.uncertainty.explanation}`);
  }

  if (finding.id === "activation_tool_report") {
    lines.push(...renderActivationDiagnosticsTerminal(finding.evidence?.diagnostics));
  }

  for (const item of finding.items) {
    if (item.callCount === 0) {
      lines.push(
        `   ${item.toolName} -- 0 calls across analysis window (confidence: ${item.confidence})`,
      );
      continue;
    }

    if (item.issueType === "missing_required_argument") {
      lines.push(
        `   ${item.toolName}.${item.argumentName} missing in ${Math.round(
          item.mismatchRate * 100,
        )}% of ${item.observationCount} calls`,
      );
      continue;
    }

    if (item.issueType === "wrong_argument_type_or_shape") {
      lines.push(
        `   ${item.toolName}.${item.argumentName} sent as ${item.observedExample} in ${Math.round(
          item.mismatchRate * 100,
        )}% of ${renderMismatchObservationLabel(item)}`,
      );
      continue;
    }

    if (item.issueType === "invalid_argument_value") {
      lines.push(
        `   ${item.toolName}.${item.argumentName} invalid value ${item.observedExample} (${Math.round(
          item.mismatchRate * 100,
        )}% of ${renderMismatchObservationLabel(item)})`,
      );
      continue;
    }

    if (item.terminationRate != null) {
      lines.push(
        `   ${item.toolName} ends ${item.sessionsEndingHere}/${item.sessionsReachingTool} reached sessions (${Math.round(
          Number(item.terminationRate) * 100,
        )}%) -- ${item.classification}`,
      );
      continue;
    }

    if (item.pathKind === "risky_sequence") {
      const peerLabel = resolveSequencePeerLabel(item);
      const peerRate = item.peerCohorts?.matchedSuffixPeers?.rate ?? item.baselineErrorRate;
      const terminalRate =
        item.peerCohorts?.terminalToolPeers?.rate ?? item.terminalToolBaselineErrorRate;
      lines.push(
        `   ${item.sequenceLabel} -> ${resolveSequenceTerminalTool(item)} failure endpoint: ${Math.round(
          item.errorRate * 100,
        )}% errors across ${item.observationCount} paths -- ${peerLabel} ${Math.round(
          peerRate * 100,
        )}%, terminal-tool peers ${Math.round(terminalRate * 100)}%, ${renderSequenceClientCoverage(
          item.clientSpread,
        )}`,
      );
      lines.push(...renderSequenceTrajectoryTerminal(item));
      continue;
    }

    if (item.pathKind === "golden_path") {
      const peerLabel = resolveSequencePeerLabel(item);
      const peerRate = item.peerCohorts?.matchedSuffixPeers?.rate ?? item.baselineSuccessRate;
      const terminalRate =
        item.peerCohorts?.terminalToolPeers?.rate ?? item.terminalToolBaselineSuccessRate;
      lines.push(
        `   ${item.sequenceLabel} -> reusable ${resolveSequenceTerminalTool(item)} success path: ${Math.round(
          item.successRate * 100,
        )}% success across ${item.observationCount} paths -- ${peerLabel} ${Math.round(
          peerRate * 100,
        )}%, terminal-tool peers ${Math.round(terminalRate * 100)}%, ${renderSequenceClientCoverage(
          item.clientSpread,
        )}`,
      );
      lines.push(...renderSequenceTrajectoryTerminal(item));
      continue;
    }

    if (item.issueType === "client_outlier") {
      lines.push(
        `   ${item.clientHint} averages ${item.avgToolsPerSession} tools/session at ${Math.round(
          item.successRate * 100,
        )}% success -- peer baseline ${Math.round(item.baselineSuccessRate * 100)}%`,
      );
      continue;
    }

    if (item.issueType === "tool_outlier") {
      const scopeLabel = item.overallClientOutlier ? "" : " (overall client otherwise in range)";
      lines.push(
        `   ${item.clientHint}.${item.toolName} errors ${Math.round(
          item.clientErrorRate * 100,
        )}% of calls -- peer baseline ${Math.round(item.baselineToolErrorRate * 100)}%${scopeLabel}`,
      );
      continue;
    }

    if (item.issueType === "activation_tool") {
      const multiplier =
        item.returnRateMultiplier == null
          ? "no control returns observed"
          : `${item.returnRateMultiplier}x control return rate`;
      const signalLabel = activationSignalLabel(item.signalClass);
      const confidenceLabel = item.confidenceBand
        ? ` -- 95% interval ${Math.round(item.confidenceBand.exposedLower * 100)}-${Math.round(
            item.confidenceBand.exposedUpper * 100,
          )}% vs control ${Math.round(item.confidenceBand.controlLower * 100)}-${Math.round(
            item.confidenceBand.controlUpper * 100,
          )}%`
        : "";
      lines.push(
        `   ${item.toolName} ${signalLabel}: ${item.returnedActors}/${item.exposedActors} linked actors returned for a second observed session (${Math.round(
          item.exposedReturnRate * 100,
        )}%) -- linked control cohort ${Math.round(item.controlReturnRate * 100)}% (${multiplier})${confidenceLabel}`,
      );
      lines.push(...renderActivationCohortTerminal(item));
      continue;
    }
  }

  if (finding.recommendation) {
    lines.push(`   -> ${finding.recommendation}`);
  }

  return lines.join("\n");
}

export function renderTerminalReport(document: ReportDocument): string {
  const lines = [
    `Pathloom analysis for ${document.sourceKey}`,
    `Sessions: ${document.summary.sessionCount}  Events: ${document.summary.eventCount}  Catalog tools: ${document.summary.toolCatalogSize}`,
    renderTelemetrySummary(document.dataset.telemetrySpine),
    "",
  ];

  if (document.findings.length === 0) {
    lines.push("No ready findings were emitted.");
  } else {
    for (const finding of document.findings) {
      lines.push(renderTerminalFinding(finding), "");
    }
  }

  if (document.suppressedFindings.length > 0) {
    lines.push("INFO  Suppressed findings");
    for (const finding of document.suppressedFindings) {
      lines.push(`   ${finding.title} -- ${finding.summary}`);
      if (finding.uncertainty) {
        lines.push(
          `      evidence: ${finding.uncertainty.label.toLowerCase()} (${finding.uncertainty.claimScopeLabel})`,
        );
        lines.push(`      why: ${finding.uncertainty.explanation}`);
      }
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildBundleHeadline(document: ReportDocument): string {
  return [
    `${pluralize(document.summary.readyFindingCount, "ready finding")}`,
    `${pluralize(document.summary.clearFindingCount, "clear finding")}`,
    `${pluralize(document.summary.suppressedFindingCount, "suppressed finding")}`,
    `for ${document.sourceKey} across ${pluralize(document.summary.sessionCount, "session")}.`,
  ].join(", ");
}

function summarizeTopFindings(document: ReportDocument, limit = 3): string[] {
  return document.findings.slice(0, limit).map((finding) => finding.title);
}

function collectRecommendedActions(
  document: ReportDocument,
  limit = 3,
): DistributionBundle["summary"]["recommendedActions"] {
  return document.findings
    .filter(
      (finding) => typeof finding.recommendation === "string" && finding.recommendation.length > 0,
    )
    .slice(0, limit)
    .map((finding) => ({
      recommendation: finding.recommendation,
      title: finding.title,
    }));
}

export function renderShareSummary(bundle: DistributionBundle): string {
  const lines = [
    "# Pathloom Share Summary",
    "",
    bundle.summary.headline,
    "",
    `Source: \`${bundle.sourceKey}\``,
    `Generated: ${bundle.generatedAt}`,
    renderTelemetrySummary(bundle.dataset?.telemetrySpine),
    "",
  ];

  if (bundle.summary.topFindingTitles.length > 0) {
    lines.push("## Top findings", "");
    for (const title of bundle.summary.topFindingTitles) {
      lines.push(`- ${title}`);
    }
    lines.push("");
  }

  if (bundle.summary.recommendedActions.length > 0) {
    lines.push("## Recommended follow-up", "");
    for (const action of bundle.summary.recommendedActions) {
      lines.push(`- ${action.title}: ${action.recommendation}`);
    }
    lines.push("");
  }

  lines.push("## Bundle artifacts", "");
  lines.push(`- [Full Markdown report](./${BUNDLE_ARTIFACT_FILES.report_markdown})`);
  lines.push(`- [Machine-readable JSON](./${BUNDLE_ARTIFACT_FILES.report_json})`);
  lines.push(`- [Bundle manifest](./${BUNDLE_MANIFEST_FILE})`);
  lines.push("");

  return `${lines.join("\n").trimEnd()}\n`;
}

export function createDistributionBundle(document: ReportDocument): DistributionBundle {
  const reportValidation = validateReportDocument(document);
  if (!reportValidation.valid) {
    throw new Error(`Invalid report document: ${reportValidation.errors.join(" ")}`);
  }

  const bundle = {
    artifacts: [],
    bundleVersion: DISTRIBUTION_BUNDLE_VERSION,
    dataset: document.dataset,
    generatedAt: document.generatedAt,
    reportVersion: document.reportVersion,
    sourceKey: document.sourceKey,
    summary: {
      clearFindingCount: document.summary.clearFindingCount,
      headline: buildBundleHeadline(document),
      readyFindingCount: document.summary.readyFindingCount,
      recommendedActions: collectRecommendedActions(document),
      suppressedFindingCount: document.summary.suppressedFindingCount,
      topFindingTitles: summarizeTopFindings(document),
    },
  };

  bundle.artifacts = [
    {
      contents: renderShareSummary(bundle),
      fileName: BUNDLE_ARTIFACT_FILES.share_summary,
      id: "share_summary",
      label: "Share summary",
      mediaType: "text/markdown",
      relPath: BUNDLE_ARTIFACT_FILES.share_summary,
    },
    {
      contents: renderMarkdownReport(document),
      fileName: BUNDLE_ARTIFACT_FILES.report_markdown,
      id: "report_markdown",
      label: "Full Markdown report",
      mediaType: "text/markdown",
      relPath: BUNDLE_ARTIFACT_FILES.report_markdown,
    },
    {
      contents: renderJsonReport(document),
      fileName: BUNDLE_ARTIFACT_FILES.report_json,
      id: "report_json",
      label: "Machine-readable JSON report",
      mediaType: "application/json",
      relPath: BUNDLE_ARTIFACT_FILES.report_json,
    },
  ];

  const validation = validateDistributionBundle(bundle);
  if (!validation.valid) {
    throw new Error(`Invalid distribution bundle: ${validation.errors.join(" ")}`);
  }

  return bundle;
}

export function writeDistributionBundle(bundle: DistributionBundle, outputDir: string) {
  const validation = validateDistributionBundle(bundle);
  if (!validation.valid) {
    throw new Error(`Invalid distribution bundle: ${validation.errors.join(" ")}`);
  }

  if (typeof outputDir !== "string" || outputDir.length === 0) {
    throw new Error("Bundle output directory must be a non-empty string.");
  }

  fs.mkdirSync(outputDir, { recursive: true });

  for (const artifact of bundle.artifacts) {
    fs.writeFileSync(path.join(outputDir, artifact.fileName), artifact.contents, "utf8");
  }

  const manifestPath = path.join(outputDir, BUNDLE_MANIFEST_FILE);
  fs.writeFileSync(`${manifestPath}`, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  return {
    artifactPaths: bundle.artifacts.map((artifact) => path.join(outputDir, artifact.fileName)),
    manifestPath,
  };
}
