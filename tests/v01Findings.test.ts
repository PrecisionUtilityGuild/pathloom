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
const {
  directWrapperFixture,
  logfilePresenceOnlyFixture,
} = require("../fixtures/analysisContractFixtures.js");
const { credibilityFixtures, sharedCatalog } = require("../fixtures/credibilityFixtures.js");

function createTempDatabasePath(label) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-findings-")), `${label}.db`);
}

function seedCatalog(ingestEngine, sourceKey) {
  ingestEngine.registerToolCatalog({
    sourceKey,
    tools: sharedCatalog,
  });
}

test("PathloomEngine emits the full v0.1 credibility trio for an authoritative wrapper dataset", () => {
  const store = new PathloomStore({ filename: createTempDatabasePath("v01-full") });
  const ingestEngine = new PathloomIngestEngine({ store });
  const sourceKey = "wrapper:demo";

  ingestEngine.registerDataset({
    profile: directWrapperFixture,
    sourceKey,
    sourceKind: SOURCE_KINDS.WRAPPER,
  });
  seedCatalog(ingestEngine, sourceKey);
  ingestEngine.ingestInvocationBatch({
    sourceKey,
    events: credibilityFixtures.authoritative_ready.events,
  });

  const engine = new PathloomEngine({ store });
  const report = engine.analyze({ sourceKey });

  const deadTools = report.findings.find((finding) => finding.id === "dead_tool_detection");
  const mismatches = report.findings.find((finding) => finding.id === "argument_mismatch_patterns");
  const termination = report.findings.find(
    (finding) => finding.id === "session_termination_analysis",
  );

  assert.equal(deadTools.status, "ready");
  assert.deepEqual(deadTools.items.map((item) => item.toolName).sort(), [
    "bulk_export",
    "delete_record",
  ]);

  assert.equal(mismatches.status, "ready");
  assert.ok(
    mismatches.items.some(
      (item) =>
        item.toolName === "search" &&
        item.argumentName === "limit" &&
        item.issueType === "wrong_argument_type_or_shape",
    ),
  );
  assert.ok(
    mismatches.items.some(
      (item) =>
        item.toolName === "create" &&
        item.argumentName === "userId" &&
        item.issueType === "missing_required_argument",
    ),
  );

  assert.equal(termination.status, "ready");
  assert.ok(termination.items.some((item) => item.toolName === "list"));
  assert.ok(report.findings.length >= 3);

  store.close();
});

test("PathloomEngine narrows mismatch claims and suppresses unsupported dead-tool findings for degraded datasets", () => {
  const store = new PathloomStore({ filename: createTempDatabasePath("v01-partial") });
  const ingestEngine = new PathloomIngestEngine({ store });
  const sourceKey = "logfile:demo";

  ingestEngine.registerDataset({
    profile: logfilePresenceOnlyFixture,
    sourceKey,
    sourceKind: SOURCE_KINDS.LOGFILE,
  });
  ingestEngine.registerToolCatalog({
    sourceKey,
    tools: [
      {
        schema: {
          properties: {
            name: { type: "string" },
            userId: { type: "string" },
          },
          required: ["userId"],
          type: "object",
        },
        schemaSource: "declared_contract",
        serverId: "demo-server",
        serverVersion: "1.0.0",
        toolName: "create",
      },
    ],
  });
  ingestEngine.ingestInvocationBatch({
    sourceKey,
    events: [
      {
        arguments: { name: "Ada" },
        argumentsProvided: ["name"],
        clientHint: "unknown",
        invokedAt: 1,
        outcome: "error",
        resolvedAt: 2,
        serverId: "demo-server",
        serverVersion: "1.0.0",
        sessionId: "s1",
        toolName: "create",
      },
      {
        arguments: { name: "Lin" },
        argumentsProvided: ["name"],
        clientHint: "unknown",
        invokedAt: 3,
        outcome: "error",
        resolvedAt: 4,
        serverId: "demo-server",
        serverVersion: "1.0.0",
        sessionId: "s2",
        toolName: "create",
      },
      {
        arguments: { name: "Tess", userId: "u-1" },
        argumentsProvided: ["name", "userId"],
        clientHint: "unknown",
        invokedAt: 5,
        outcome: "success",
        resolvedAt: 6,
        serverId: "demo-server",
        serverVersion: "1.0.0",
        sessionId: "s3",
        toolName: "create",
      },
      {
        arguments: {},
        clientHint: "unknown",
        invokedAt: 7,
        outcome: "success",
        resolvedAt: 8,
        serverId: "demo-server",
        serverVersion: "1.0.0",
        sessionId: "s4",
        toolName: "list",
      },
    ],
  });

  const engine = new PathloomEngine({ store });
  const report = engine.analyze({ sourceKey });

  assert.equal(
    report.suppressedFindings.some((finding) => finding.id === "dead_tool_detection"),
    true,
  );

  const mismatches = report.findings.find((finding) => finding.id === "argument_mismatch_patterns");
  assert.equal(mismatches.status, "ready");
  assert.equal(mismatches.items.length, 1);
  assert.equal(mismatches.items[0].issueType, "missing_required_argument");
  assert.equal(mismatches.uncertainty.claimScope, "narrowed");
  assert.equal(mismatches.uncertainty.level, "credible");

  store.close();
});

test("PathloomEngine suppresses dead-tool and termination findings on sparse authoritative datasets", () => {
  const store = new PathloomStore({ filename: createTempDatabasePath("v01-sparse") });
  const ingestEngine = new PathloomIngestEngine({ store });
  const sourceKey = "wrapper:sparse";

  ingestEngine.registerDataset({
    profile: directWrapperFixture,
    sourceKey,
    sourceKind: SOURCE_KINDS.WRAPPER,
  });
  seedCatalog(ingestEngine, sourceKey);
  ingestEngine.ingestInvocationBatch({
    sourceKey,
    events: [
      {
        arguments: { q: "hello" },
        clientHint: "Claude Desktop",
        invokedAt: 1,
        outcome: "success",
        resolvedAt: 2,
        serverId: "demo-server",
        serverVersion: "1.0.0",
        sessionId: "s1",
        toolName: "query",
      },
      {
        arguments: {},
        clientHint: "Claude Desktop",
        invokedAt: 3,
        outcome: "success",
        resolvedAt: 4,
        serverId: "demo-server",
        serverVersion: "1.0.0",
        sessionId: "s2",
        toolName: "list",
      },
    ],
  });

  const engine = new PathloomEngine({ store });
  const report = engine.analyze({ sourceKey });

  assert.equal(
    report.suppressedFindings.some(
      (finding) =>
        finding.id === "dead_tool_detection" &&
        finding.blockedBy.includes("insufficient_session_count"),
    ),
    true,
  );
  assert.equal(
    report.suppressedFindings.some(
      (finding) =>
        finding.id === "session_termination_analysis" &&
        finding.blockedBy.includes("insufficient_session_count"),
    ),
    true,
  );

  store.close();
});
