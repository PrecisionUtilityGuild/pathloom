"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SOURCE_KINDS,
  PathloomEngine,
  PathloomIngestEngine,
  PathloomStore,
} = require("@precisionutilityguild/pathloom/core");
const { directWrapperFixture } = require("../fixtures/analysisContractFixtures.js");
const { sharedCatalog } = require("../fixtures/credibilityFixtures.js");

function createTempDatabasePath(label) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-hardening-")), `${label}.db`);
}

function analyzeScenario({
  catalog,
  events,
  label,
  thresholds,
}: {
  catalog: any;
  events: any;
  label: string;
  thresholds?: any;
}) {
  const sourceKey = `wrapper:${label}`;
  const store = new PathloomStore({ filename: createTempDatabasePath(label) });
  const ingestEngine = new PathloomIngestEngine({ store });

  ingestEngine.registerDataset({
    profile: directWrapperFixture,
    sourceKey,
    sourceKind: SOURCE_KINDS.WRAPPER,
  });
  ingestEngine.registerToolCatalog({
    sourceKey,
    tools: catalog,
  });
  ingestEngine.ingestInvocationBatch({
    sourceKey,
    events,
  });

  const report = new PathloomEngine({ store }).analyze({
    sourceKey,
    thresholds,
  });

  return { report, store };
}

test("sequence risk stays quiet when the terminal tool is risky across every predecessor", () => {
  const catalog = sharedCatalog.filter((entry) =>
    ["search", "list", "delete_record"].includes(entry.toolName),
  );
  const events = [
    {
      arguments: { limit: 5, q: "alpha" },
      clientHint: "Claude Desktop",
      invokedAt: 1,
      outcome: "success",
      resolvedAt: 2,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: "s1",
      toolName: "search",
    },
    {
      arguments: { id: "d-1" },
      clientHint: "Claude Desktop",
      invokedAt: 3,
      outcome: "error",
      resolvedAt: 4,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: "s1",
      toolName: "delete_record",
    },
    {
      arguments: { limit: 5, q: "beta" },
      clientHint: "Claude Desktop",
      invokedAt: 5,
      outcome: "success",
      resolvedAt: 6,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: "s2",
      toolName: "search",
    },
    {
      arguments: { id: "d-2" },
      clientHint: "Claude Desktop",
      invokedAt: 7,
      outcome: "error",
      resolvedAt: 8,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: "s2",
      toolName: "delete_record",
    },
    {
      arguments: { limit: 5, q: "gamma" },
      clientHint: "Claude Desktop",
      invokedAt: 9,
      outcome: "success",
      resolvedAt: 10,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: "s3",
      toolName: "search",
    },
    {
      arguments: { id: "d-3" },
      clientHint: "Claude Desktop",
      invokedAt: 11,
      outcome: "error",
      resolvedAt: 12,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: "s3",
      toolName: "delete_record",
    },
    {
      arguments: {},
      clientHint: "Claude Desktop",
      invokedAt: 13,
      outcome: "success",
      resolvedAt: 14,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: "s4",
      toolName: "list",
    },
    {
      arguments: { id: "d-4" },
      clientHint: "Claude Desktop",
      invokedAt: 15,
      outcome: "error",
      resolvedAt: 16,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: "s4",
      toolName: "delete_record",
    },
    {
      arguments: {},
      clientHint: "Claude Desktop",
      invokedAt: 17,
      outcome: "success",
      resolvedAt: 18,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: "s5",
      toolName: "list",
    },
    {
      arguments: { id: "d-5" },
      clientHint: "Claude Desktop",
      invokedAt: 19,
      outcome: "error",
      resolvedAt: 20,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: "s5",
      toolName: "delete_record",
    },
    {
      arguments: {},
      clientHint: "Claude Desktop",
      invokedAt: 21,
      outcome: "success",
      resolvedAt: 22,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: "s6",
      toolName: "list",
    },
    {
      arguments: { id: "d-6" },
      clientHint: "Claude Desktop",
      invokedAt: 23,
      outcome: "error",
      resolvedAt: 24,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: "s6",
      toolName: "delete_record",
    },
  ];

  const { report, store } = analyzeScenario({
    catalog,
    events,
    label: "terminal-risk-everywhere",
  });
  const sequence = report.findings.find((finding) => finding.id === "sequence_risk_map");

  assert.equal(sequence.status, "clear");
  assert.equal(
    sequence.items.some((item) => item.sequenceLabel === "search -> delete_record"),
    false,
  );

  store.close();
});

test("tool-level client regressions surface even when the client is not an overall cohort outlier", () => {
  const events = [];
  let invokedAt = 1;

  for (let session = 1; session <= 4; session += 1) {
    for (const [toolName, argumentsValue, outcome, clientHint] of [
      ["query", { q: `claude-${session}` }, "success", "Claude Desktop"],
      ["list", {}, "success", "Claude Desktop"],
      ["search", { limit: 5, q: `claude-${session}` }, "success", "Claude Desktop"],
      [
        "create",
        { name: `claude-${session}`, userId: `c-${session}` },
        "success",
        "Claude Desktop",
      ],
      ["bulk_export", { format: "csv" }, "success", "Claude Desktop"],
      ["query", { q: `cursor-${session}` }, "success", "Cursor"],
      ["list", {}, "success", "Cursor"],
      ["search", { limit: 5, q: `cursor-${session}` }, "success", "Cursor"],
      ["create", { name: `cursor-${session}`, userId: `u-${session}` }, "success", "Cursor"],
      [
        "bulk_export",
        { format: session === 4 ? "csv" : "json" },
        session === 4 ? "success" : "error",
        "Cursor",
      ],
    ]) {
      events.push({
        arguments: argumentsValue,
        clientHint,
        invokedAt,
        outcome,
        resolvedAt: invokedAt + 1,
        serverId: "demo-server",
        serverVersion: "1.0.0",
        sessionId: `${clientHint === "Cursor" ? "cursor" : "claude"}-${session}`,
        toolName,
      });
      invokedAt += 2;
    }
  }

  const { report, store } = analyzeScenario({
    catalog: sharedCatalog,
    events,
    label: "tool-regression-only",
  });
  const divergence = report.findings.find((finding) => finding.id === "client_divergence");

  assert.equal(divergence.status, "ready");
  assert.equal(
    divergence.items.some(
      (item) => item.issueType === "client_outlier" && item.clientHint === "cursor",
    ),
    false,
  );
  assert.equal(
    divergence.items.some(
      (item) =>
        item.issueType === "tool_outlier" &&
        item.clientHint === "cursor" &&
        item.toolName === "bulk_export" &&
        item.overallClientOutlier === false,
    ),
    true,
  );

  store.close();
});

test("optional-argument mismatch rates use provided-call denominators instead of total tool volume", () => {
  const catalog = sharedCatalog.filter((entry) => entry.toolName === "bulk_export");
  const events = [];

  for (let index = 0; index < 7; index += 1) {
    events.push({
      arguments: {},
      clientHint: "Claude Desktop",
      invokedAt: index * 2 + 1,
      outcome: "success",
      resolvedAt: index * 2 + 2,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId: `bulk-${index + 1}`,
      toolName: "bulk_export",
    });
  }

  events.push({
    arguments: { format: "xml" },
    clientHint: "Claude Desktop",
    invokedAt: 15,
    outcome: "error",
    resolvedAt: 16,
    serverId: "demo-server",
    serverVersion: "1.0.0",
    sessionId: "bulk-8",
    toolName: "bulk_export",
  });
  events.push({
    arguments: { format: "yaml" },
    clientHint: "Claude Desktop",
    invokedAt: 17,
    outcome: "error",
    resolvedAt: 18,
    serverId: "demo-server",
    serverVersion: "1.0.0",
    sessionId: "bulk-9",
    toolName: "bulk_export",
  });

  const { report, store } = analyzeScenario({
    catalog,
    events,
    label: "optional-denominator",
  });
  const mismatch = report.findings.find((finding) => finding.id === "argument_mismatch_patterns");
  const invalidValue = mismatch.items.find(
    (item) =>
      item.issueType === "invalid_argument_value" &&
      item.toolName === "bulk_export" &&
      item.argumentName === "format",
  );

  assert.equal(mismatch.status, "ready");
  assert.equal(invalidValue.observationCount, 2);
  assert.equal(invalidValue.totalToolObservations, 9);
  assert.equal(invalidValue.mismatchRate, 1);

  store.close();
});

test("golden paths record cross-client transferability when the same successful prefix works across cohorts", () => {
  const catalog = sharedCatalog.filter((entry) =>
    ["query", "search", "list"].includes(entry.toolName),
  );
  const events = [];
  let invokedAt = 1;

  for (const [sessionId, clientHint, firstTool, outcome] of [
    ["claude-1", "Claude Desktop", "query", "success"],
    ["claude-2", "Claude Desktop", "query", "success"],
    ["cursor-1", "Cursor", "query", "success"],
    ["cursor-2", "Cursor", "query", "success"],
    ["peer-1", "Claude Desktop", "search", "error"],
    ["peer-2", "Cursor", "search", "error"],
    ["peer-3", "Claude Desktop", "search", "timeout"],
  ]) {
    events.push({
      arguments: firstTool === "query" ? { q: sessionId } : { limit: 5, q: sessionId },
      clientHint,
      invokedAt,
      outcome: "success",
      resolvedAt: invokedAt + 1,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId,
      toolName: firstTool,
    });
    invokedAt += 2;
    events.push({
      arguments: {},
      clientHint,
      invokedAt,
      outcome,
      resolvedAt: invokedAt + 1,
      serverId: "demo-server",
      serverVersion: "1.0.0",
      sessionId,
      toolName: "list",
    });
    invokedAt += 2;
  }

  const { report, store } = analyzeScenario({
    catalog,
    events,
    label: "cross-client-golden-transfer",
  });
  const sequence = report.findings.find((finding) => finding.id === "sequence_risk_map");
  const golden = sequence.items.find(
    (item) => item.pathKind === "golden_path" && item.sequenceLabel === "query -> list",
  );

  assert.equal(sequence.status, "ready");
  assert.equal(golden.clientSpread.transferability, "cross_client");
  assert.deepEqual(golden.clientSpread.clientHints, ["claude-desktop", "cursor"]);
  assert.equal(golden.clientSpread.transferableClientCount, 2);
  assert.equal(golden.peerCohorts.matchedSuffixPeers.label, "other routes into list");
  assert.equal(golden.peerCohorts.matchedSuffixPeers.observationCount, 3);

  store.close();
});
