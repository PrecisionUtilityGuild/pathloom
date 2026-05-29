"use strict";

const path = require("node:path");

import type { HistoryDiff, HistoryDiffEntry, ReportDocument, ReportSnapshot } from "../core/types";

const {
  PATHLOOM_HISTORY_DIFF_SCHEMA_VERSION,
  PATHLOOM_REPORT_SNAPSHOT_SCHEMA_VERSION,
  validateHistoryDiff,
  validateReportSnapshot,
} = require("../contracts") as typeof import("../contracts");
const { BUNDLE_MANIFEST_FILE, createDistributionBundle, writeDistributionBundle } =
  require("../report") as typeof import("../report");

export const SNAPSHOT_VERSION = PATHLOOM_REPORT_SNAPSHOT_SCHEMA_VERSION;
export const HISTORY_DIFF_VERSION = PATHLOOM_HISTORY_DIFF_SCHEMA_VERSION;

function compactTimestamp(dateValue) {
  const iso = new Date(dateValue).toISOString();
  return iso.replace(/[-:.]/g, "");
}

function sanitizePathSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function createSnapshotKey(sourceKey: string, capturedAt: string | number): string {
  return `${sourceKey}@${compactTimestamp(capturedAt)}`;
}

export function createReportSnapshot(
  document: ReportDocument,
  options: { capturedAt?: string | number; label?: string | null; snapshotKey?: string } = {},
): ReportSnapshot {
  const capturedAt = options.capturedAt || document.generatedAt;
  const snapshot = {
    capturedAt: new Date(capturedAt).toISOString(),
    label: options.label || null,
    reportDocument: document,
    reportVersion: document.reportVersion,
    snapshotKey: options.snapshotKey || createSnapshotKey(document.sourceKey, capturedAt),
    snapshotVersion: SNAPSHOT_VERSION,
    sourceKey: document.sourceKey,
    summary: { ...document.summary },
  };

  const validation = validateReportSnapshot(snapshot);
  if (!validation.valid) {
    throw new Error(`Invalid report snapshot: ${validation.errors.join(" ")}`);
  }

  return snapshot;
}

function findingItemTargetParts(item) {
  if (!item || typeof item !== "object") {
    return ["summary"];
  }

  if (item.issueType === "missing_required_argument") {
    return [item.toolName, item.argumentName, "missing"];
  }

  if (item.issueType === "wrong_argument_type_or_shape") {
    return [item.toolName, item.argumentName, "shape"];
  }

  if (item.issueType === "invalid_argument_value") {
    return [item.toolName, item.argumentName, "value"];
  }

  if (item.issueType === "client_outlier") {
    return [item.clientHint, "client"];
  }

  if (item.issueType === "tool_outlier") {
    return [item.clientHint, item.toolName, "tool"];
  }

  if (item.issueType === "activation_tool") {
    return [item.toolName, "activation"];
  }

  if (item.pathKind === "risky_sequence" || item.pathKind === "golden_path") {
    return [item.pathKind, item.sequenceLabel];
  }

  if (item.toolName && item.callCount === 0) {
    return [item.toolName, "dead"];
  }

  if (item.toolName && item.terminationRate != null) {
    return [item.toolName, item.classification];
  }

  return null;
}

function metricDescriptorForItem(item) {
  if (!item) {
    return null;
  }

  if (
    item.issueType === "missing_required_argument" ||
    item.issueType === "wrong_argument_type_or_shape"
  ) {
    return { current: item.mismatchRate, direction: "higher_is_worse", label: "mismatch rate" };
  }

  if (item.issueType === "invalid_argument_value") {
    return {
      current: item.mismatchRate,
      direction: "higher_is_worse",
      label: "invalid-value rate",
    };
  }

  if (item.terminationRate != null) {
    return {
      current: item.terminationRate,
      direction: "higher_is_worse",
      label: "termination rate",
    };
  }

  if (item.pathKind === "risky_sequence") {
    return { current: item.errorRate, direction: "higher_is_worse", label: "error rate" };
  }

  if (item.pathKind === "golden_path") {
    return { current: item.successRate, direction: "lower_is_worse", label: "success rate" };
  }

  if (item.issueType === "client_outlier") {
    return {
      current: item.successRate,
      direction: "lower_is_worse",
      label: "client success rate",
    };
  }

  if (item.issueType === "tool_outlier") {
    return {
      current: item.clientErrorRate,
      direction: "higher_is_worse",
      label: "client tool error rate",
    };
  }

  if (item.issueType === "activation_tool") {
    return {
      current: item.returnRateDelta,
      direction: "lower_is_worse",
      label: "activation delta",
    };
  }

  return null;
}

export function createFindingTargetId(findingId: string, item): string {
  const targetParts = findingItemTargetParts(item);
  if (targetParts) {
    return `${findingId}::${targetParts.join("::")}`;
  }

  return `${findingId}::${JSON.stringify(item)}`;
}

export function describeFindingTarget(finding, item): string {
  if (!item || typeof item !== "object" || Object.keys(item).length === 0) {
    return finding.title;
  }

  if (item.toolName && item.argumentName) {
    return `${item.toolName}.${item.argumentName}`;
  }

  if (item.sequenceLabel) {
    return item.sequenceLabel;
  }

  if (item.clientHint && item.toolName) {
    return `${item.clientHint}.${item.toolName}`;
  }

  if (item.clientHint) {
    return item.clientHint;
  }

  if (item.toolName) {
    return item.toolName;
  }

  return finding.title;
}

function activeFindingEntries(document) {
  const entries = new Map();

  for (const finding of document.findings) {
    if (finding.items.length === 0) {
      const signature = createFindingTargetId(finding.id, null);
      entries.set(signature, {
        findingId: finding.id,
        item: null,
        label: describeFindingTarget(finding, null),
        severity: finding.severity,
        signature,
        status: finding.status,
        summary: finding.summary,
        title: finding.title,
      });
      continue;
    }

    for (const item of finding.items) {
      const signature = createFindingTargetId(finding.id, item);
      entries.set(signature, {
        findingId: finding.id,
        item,
        label: describeFindingTarget(finding, item),
        severity: finding.severity,
        signature,
        status: finding.status,
        summary: finding.summary,
        title: finding.title,
      });
    }
  }

  return entries;
}

function suppressedFindingMap(document) {
  const map = new Map();

  for (const finding of document.suppressedFindings) {
    map.set(finding.id, finding);
  }

  return map;
}

function metricDescriptor(entry) {
  return metricDescriptorForItem(entry.item);
}

function compareRegression(previousEntry, currentEntry) {
  if (previousEntry.status !== currentEntry.status) {
    if (previousEntry.status === "clear" && currentEntry.status === "ready") {
      return {
        currentValue: currentEntry.status,
        label: "finding status",
        previousValue: previousEntry.status,
      };
    }
  }

  const previousMetric = metricDescriptor(previousEntry);
  const currentMetric = metricDescriptor(currentEntry);

  if (!previousMetric || !currentMetric || previousMetric.label !== currentMetric.label) {
    return null;
  }

  if (typeof previousMetric.current !== "number" || typeof currentMetric.current !== "number") {
    return null;
  }

  const delta = currentMetric.current - previousMetric.current;
  const threshold = 0.05;

  if (currentMetric.direction === "higher_is_worse" && delta >= threshold) {
    return {
      currentValue: currentMetric.current,
      label: currentMetric.label,
      previousValue: previousMetric.current,
    };
  }

  if (currentMetric.direction === "lower_is_worse" && delta <= -threshold) {
    return {
      currentValue: currentMetric.current,
      label: currentMetric.label,
      previousValue: previousMetric.current,
    };
  }

  return null;
}

function snapshotRef(snapshot) {
  return {
    capturedAt: snapshot.capturedAt,
    label: snapshot.label,
    snapshotKey: snapshot.snapshotKey,
    sourceKey: snapshot.sourceKey,
  };
}

export function createHistoryDiff(
  previousSnapshot: ReportSnapshot,
  currentSnapshot: ReportSnapshot,
): HistoryDiff {
  const previousValidation = validateReportSnapshot(previousSnapshot);
  if (!previousValidation.valid) {
    throw new Error(`Invalid baseline snapshot: ${previousValidation.errors.join(" ")}`);
  }

  const currentValidation = validateReportSnapshot(currentSnapshot);
  if (!currentValidation.valid) {
    throw new Error(`Invalid current snapshot: ${currentValidation.errors.join(" ")}`);
  }

  if (previousSnapshot.sourceKey !== currentSnapshot.sourceKey) {
    throw new Error("History diff requires snapshots from the same source key.");
  }

  const previousActive = activeFindingEntries(previousSnapshot.reportDocument);
  const currentActive = activeFindingEntries(currentSnapshot.reportDocument);
  const previousSuppressed = suppressedFindingMap(previousSnapshot.reportDocument);
  const currentSuppressed = suppressedFindingMap(currentSnapshot.reportDocument);

  const newFindings = [];
  const resolvedFindings = [];
  const regressedFindings = [];
  const evidenceChanges = [];
  let unchangedCount = 0;

  for (const [signature, currentEntry] of currentActive.entries()) {
    const previousEntry = previousActive.get(signature);

    if (!previousEntry) {
      if (previousSuppressed.has(currentEntry.findingId)) {
        const previousFinding = previousSuppressed.get(currentEntry.findingId);
        evidenceChanges.push({
          blockedBy: previousFinding.blockedBy,
          changeType: "newly_supported",
          findingId: currentEntry.findingId,
          label: currentEntry.label,
          title: currentEntry.title,
        });
        continue;
      }

      newFindings.push({
        findingId: currentEntry.findingId,
        label: currentEntry.label,
        severity: currentEntry.severity,
        title: currentEntry.title,
      });
      continue;
    }

    const regression = compareRegression(previousEntry, currentEntry);
    if (regression) {
      regressedFindings.push({
        currentValue: regression.currentValue,
        findingId: currentEntry.findingId,
        label: currentEntry.label,
        metric: regression.label,
        previousValue: regression.previousValue,
        title: currentEntry.title,
      });
      continue;
    }

    unchangedCount += 1;
  }

  for (const [signature, previousEntry] of previousActive.entries()) {
    if (currentActive.has(signature)) {
      continue;
    }

    if (currentSuppressed.has(previousEntry.findingId)) {
      const currentFinding = currentSuppressed.get(previousEntry.findingId);
      evidenceChanges.push({
        blockedBy: currentFinding.blockedBy,
        changeType: "now_suppressed",
        findingId: previousEntry.findingId,
        label: previousEntry.label,
        title: previousEntry.title,
      });
      continue;
    }

    resolvedFindings.push({
      findingId: previousEntry.findingId,
      label: previousEntry.label,
      severity: previousEntry.severity,
      title: previousEntry.title,
    });
  }

  for (const [findingId, currentFinding] of currentSuppressed.entries()) {
    const previousFinding = previousSuppressed.get(findingId);
    if (!previousFinding) {
      continue;
    }

    const previousBlockers = JSON.stringify(previousFinding.blockedBy || []);
    const currentBlockers = JSON.stringify(currentFinding.blockedBy || []);
    if (previousBlockers !== currentBlockers) {
      evidenceChanges.push({
        blockedBy: currentFinding.blockedBy,
        changeType: "suppression_changed",
        findingId,
        label: currentFinding.title,
        title: currentFinding.title,
      });
    }
  }

  const diff = {
    baseline: snapshotRef(previousSnapshot),
    current: snapshotRef(currentSnapshot),
    diffVersion: HISTORY_DIFF_VERSION,
    evidenceChanges,
    newFindings,
    regressedFindings,
    resolvedFindings,
    sourceKey: currentSnapshot.sourceKey,
    summary: {
      evidenceChangeCount: evidenceChanges.length,
      headline: `${newFindings.length} new, ${resolvedFindings.length} resolved, ${regressedFindings.length} regressed, and ${evidenceChanges.length} evidence-shifted finding changes between ${previousSnapshot.snapshotKey} and ${currentSnapshot.snapshotKey}.`,
      newCount: newFindings.length,
      regressedCount: regressedFindings.length,
      resolvedCount: resolvedFindings.length,
      unchangedCount,
    },
  };

  const validation = validateHistoryDiff(diff);
  if (!validation.valid) {
    throw new Error(`Invalid history diff: ${validation.errors.join(" ")}`);
  }

  return diff;
}

export function renderJsonHistoryDiff(diff: HistoryDiff): string {
  return `${JSON.stringify(diff, null, 2)}\n`;
}

export function renderMarkdownHistoryDiff(diff: HistoryDiff): string {
  const lines = [
    "# Pathloom History Diff",
    "",
    diff.summary.headline,
    "",
    `Source: \`${diff.sourceKey}\``,
    `Baseline: \`${diff.baseline.snapshotKey}\``,
    `Current: \`${diff.current.snapshotKey}\``,
    "",
  ];

  const sections: Array<[string, HistoryDiffEntry[]]> = [
    ["New findings", diff.newFindings],
    ["Resolved findings", diff.resolvedFindings],
    ["Regressed findings", diff.regressedFindings],
    ["Evidence changes", diff.evidenceChanges],
  ];

  for (const [title, entries] of sections) {
    lines.push(`## ${title}`, "");
    if (entries.length === 0) {
      lines.push("None.", "");
      continue;
    }

    for (const entry of entries) {
      if (entry.metric) {
        const previousValue = Number(entry.previousValue);
        const currentValue = Number(entry.currentValue);
        lines.push(
          `- \`${entry.title}\` on \`${entry.label}\` worsened in ${entry.metric} from ${Math.round(
            previousValue * 100,
          )}% to ${Math.round(currentValue * 100)}%.`,
        );
        continue;
      }

      if (entry.changeType) {
        lines.push(
          `- \`${entry.title}\` on \`${entry.label}\` is now \`${entry.changeType}\`${entry.blockedBy?.length ? ` (blocked by: ${entry.blockedBy.join(", ")})` : ""}.`,
        );
        continue;
      }

      lines.push(`- \`${entry.title}\` on \`${entry.label}\`.`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderTerminalHistoryDiff(diff: HistoryDiff): string {
  const lines = [
    `Pathloom history diff for ${diff.sourceKey}`,
    diff.summary.headline,
    `Baseline: ${diff.baseline.snapshotKey}`,
    `Current: ${diff.current.snapshotKey}`,
    "",
  ];

  const sections: Array<[string, HistoryDiffEntry[]]> = [
    ["NEW", diff.newFindings],
    ["RESOLVED", diff.resolvedFindings],
    ["REGRESSED", diff.regressedFindings],
    ["EVIDENCE", diff.evidenceChanges],
  ];

  for (const [label, entries] of sections) {
    lines.push(`${label}  ${entries.length}`);
    if (entries.length === 0) {
      lines.push("   none", "");
      continue;
    }

    for (const entry of entries) {
      if (entry.metric) {
        const previousValue = Number(entry.previousValue);
        const currentValue = Number(entry.currentValue);
        lines.push(
          `   ${entry.title} / ${entry.label} -- ${entry.metric} ${Math.round(
            previousValue * 100,
          )}% -> ${Math.round(currentValue * 100)}%`,
        );
        continue;
      }

      if (entry.changeType) {
        lines.push(
          `   ${entry.title} / ${entry.label} -- ${entry.changeType}${entry.blockedBy?.length ? ` (${entry.blockedBy.join(", ")})` : ""}`,
        );
        continue;
      }

      lines.push(`   ${entry.title} / ${entry.label}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function writeSnapshotBundle(snapshot: ReportSnapshot, outputRoot: string) {
  const bundle = createDistributionBundle(snapshot.reportDocument);
  const snapshotDir = path.join(outputRoot, sanitizePathSegment(snapshot.snapshotKey));
  const written = writeDistributionBundle(bundle, snapshotDir);

  return {
    bundle,
    manifestPath: written.manifestPath,
    outputDir: snapshotDir,
    snapshotManifestPath: path.join(snapshotDir, BUNDLE_MANIFEST_FILE),
  };
}
