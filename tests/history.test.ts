"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const {
  PathloomEngine,
  PathloomStore,
  createFindingTargetId,
  createHistoryDiff,
  createReportSnapshot,
  describeFindingTarget,
} = require("@precisionutilityguild/pathloom/core");
const { createReportDocument } = require("@precisionutilityguild/pathloom/report");
const { seedReadyDataset } = require("./helpers/reportSeed.js");
const { resolveRepoRoot } = require("./helpers/testkit.js");

const REPO_ROOT = resolveRepoRoot();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function recount(document) {
  const readyFindingCount = document.findings.filter(
    (finding) => finding.status === "ready",
  ).length;
  const clearFindingCount = document.findings.filter(
    (finding) => finding.status === "clear",
  ).length;

  document.summary.readyFindingCount = readyFindingCount;
  document.summary.clearFindingCount = clearFindingCount;
  document.summary.suppressedFindingCount = document.suppressedFindings.length;

  return document;
}

function buildReadyDocument(label) {
  const seeded = seedReadyDataset(label);
  const engine = new PathloomEngine({
    storeOptions: { filename: seeded.filename },
  });

  return createReportDocument(engine.analyze({ sourceKey: seeded.sourceKey }));
}

test("PathloomStore saves and retrieves report snapshots in reverse chronological order", () => {
  const filename = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-history-store-")),
    "history.db",
  );
  const store = new PathloomStore({ filename });
  const document = buildReadyDocument("history-store");
  const baseline = createReportSnapshot(document, {
    capturedAt: "2026-05-24T10:00:00.000Z",
    label: "baseline",
    snapshotKey: `${document.sourceKey}@20260524T100000Z`,
  });
  const current = createReportSnapshot(document, {
    capturedAt: "2026-05-24T11:00:00.000Z",
    label: "current",
    snapshotKey: `${document.sourceKey}@20260524T110000Z`,
  });

  store.saveReportSnapshot(baseline);
  store.saveReportSnapshot(current);

  const snapshots = store.listReportSnapshots(document.sourceKey);

  assert.equal(store.getReportSnapshot(current.snapshotKey).label, "current");
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0].snapshotKey, current.snapshotKey);
  assert.equal(snapshots[1].snapshotKey, baseline.snapshotKey);

  store.close();
});

test("createHistoryDiff distinguishes new, resolved, regressed, and evidence-shifted changes", () => {
  const baselineDocument = buildReadyDocument("history-diff-baseline");
  const currentDocument = recount(clone(baselineDocument));

  currentDocument.findings = currentDocument.findings.filter(
    (finding) => finding.id !== "dead_tool_detection" && finding.id !== "activation_tool_report",
  );

  const termination = currentDocument.findings.find(
    (finding) => finding.id === "session_termination_analysis",
  );
  termination.items.push({
    classification: "possible_dead_end",
    sessionsEndingHere: 6,
    sessionsReachingTool: 7,
    terminationRate: 6 / 7,
    toolName: "search",
  });

  const sequence = currentDocument.findings.find((finding) => finding.id === "sequence_risk_map");
  const goldenPath = sequence.items.find((item) => item.pathKind === "golden_path");
  goldenPath.successRate = 0.8;

  currentDocument.suppressedFindings.push({
    blockedBy: ["missing_observed_actor_linkage"],
    evidence: {},
    id: "activation_tool_report",
    items: [],
    recommendation: null,
    severity: "info",
    status: "suppressed",
    summary:
      "Activation findings stay quiet until privacy-safe actor linkage is actually present in the observed event stream, not just declared in the dataset profile.",
    title: "Activation tool report",
    uncertainty: {
      allowedClaims: [],
      blockedBy: ["missing_observed_actor_linkage"],
      claimScope: "suppressed",
      claimScopeLabel: "suppressed claim",
      explanation:
        "The dataset does not support this claim. Activation findings stay quiet until privacy-safe actor linkage is actually present in the observed event stream, not just declared in the dataset profile. Blocked by: missing_observed_actor_linkage.",
      headline: "Unsupported on a suppressed claim",
      label: "Unsupported",
      level: "unsupported",
      rationale:
        "Activation findings stay quiet until privacy-safe actor linkage is actually present in the observed event stream, not just declared in the dataset profile.",
      supportStatus: "suppressed",
    },
  });

  recount(currentDocument);

  const baseline = createReportSnapshot(baselineDocument, {
    capturedAt: "2026-05-24T10:00:00.000Z",
    snapshotKey: `${baselineDocument.sourceKey}@20260524T100000Z`,
  });
  const current = createReportSnapshot(currentDocument, {
    capturedAt: "2026-05-24T11:00:00.000Z",
    snapshotKey: `${currentDocument.sourceKey}@20260524T110000Z`,
  });
  const diff = createHistoryDiff(baseline, current);

  assert.equal(diff.summary.newCount, 1);
  assert.equal(diff.summary.resolvedCount, 2);
  assert.equal(diff.summary.regressedCount, 1);
  assert.equal(diff.summary.evidenceChangeCount, 1);
  assert.ok(
    diff.newFindings.some(
      (entry) => entry.findingId === "session_termination_analysis" && entry.label === "search",
    ),
  );
  assert.ok(
    diff.resolvedFindings.some(
      (entry) => entry.findingId === "dead_tool_detection" && entry.label === "delete_record",
    ),
  );
  assert.ok(
    diff.regressedFindings.some(
      (entry) => entry.findingId === "sequence_risk_map" && entry.label === "query -> list",
    ),
  );
  assert.ok(
    diff.evidenceChanges.some(
      (entry) =>
        entry.findingId === "activation_tool_report" && entry.changeType === "now_suppressed",
    ),
  );
});

test("history target ids and labels stay stable across finding item shapes", () => {
  assert.equal(createFindingTargetId("dead_tool_detection", null), "dead_tool_detection::summary");
  assert.equal(
    createFindingTargetId("argument_mismatch_patterns", {
      argumentName: "format",
      issueType: "invalid_argument_value",
      toolName: "bulk_export",
    }),
    "argument_mismatch_patterns::bulk_export::format::value",
  );
  assert.equal(
    createFindingTargetId("sequence_risk_map", {
      pathKind: "golden_path",
      sequenceLabel: "query -> list",
    }),
    "sequence_risk_map::golden_path::query -> list",
  );
  assert.equal(
    createFindingTargetId("session_termination_analysis", {
      classification: "possible_dead_end",
      terminationRate: 0.75,
      toolName: "search",
    }),
    "session_termination_analysis::search::possible_dead_end",
  );
  assert.equal(
    describeFindingTarget(
      { title: "Argument mismatch patterns" },
      {
        argumentName: "format",
        toolName: "bulk_export",
      },
    ),
    "bulk_export.format",
  );
  assert.equal(
    describeFindingTarget(
      { title: "Client divergence" },
      {
        clientHint: "cursor",
        toolName: "query",
      },
    ),
    "cursor.query",
  );
});

test("CLI snapshot and diff support recurring local history workflows", () => {
  const seeded = seedReadyDataset("history-cli");
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-history-cli-"));

  const firstSnapshotOutput = execFileSync(
    process.execPath,
    [
      "dist/bin/pathloom.js",
      "snapshot",
      "--db",
      seeded.filename,
      "--source",
      seeded.sourceKey,
      "--label",
      "baseline",
      "--output",
      outputRoot,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  const secondSnapshotOutput = execFileSync(
    process.execPath,
    [
      "dist/bin/pathloom.js",
      "snapshot",
      "--db",
      seeded.filename,
      "--source",
      seeded.sourceKey,
      "--label",
      "current",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  const diffOutput = execFileSync(
    process.execPath,
    ["dist/bin/pathloom.js", "diff", "--db", seeded.filename, "--source", seeded.sourceKey, "--json"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  const parsedDiff = JSON.parse(diffOutput);
  const createdDirs = fs
    .readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  assert.match(firstSnapshotOutput, /Pathloom snapshot saved:/);
  assert.match(firstSnapshotOutput, /Bundle directory:/);
  assert.match(secondSnapshotOutput, /Pathloom snapshot saved:/);
  assert.equal(createdDirs.length, 1);
  assert.equal(parsedDiff.sourceKey, seeded.sourceKey);
  assert.equal(parsedDiff.summary.newCount, 0);
  assert.equal(parsedDiff.summary.regressedCount, 0);
});
