"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { PathloomEngine, PathloomIngestEngine, PathloomStore } = require("@precisionutilityguild/pathloom/core");
const { credibilityFixtures } = require("../fixtures/credibilityFixtures.js");

function createTempDatabasePath(label) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-v02-")), `${label}.db`);
}

function seedScenario(name) {
  const scenario = credibilityFixtures[name];
  const store = new PathloomStore({ filename: createTempDatabasePath(name) });
  const ingestEngine = new PathloomIngestEngine({ store });

  ingestEngine.registerDataset(scenario.dataset);
  if (scenario.catalog.length > 0) {
    ingestEngine.registerToolCatalog({
      sourceKey: scenario.dataset.sourceKey,
      tools: scenario.catalog,
    });
  }
  ingestEngine.ingestInvocationBatch({
    events: scenario.events,
    sourceKey: scenario.dataset.sourceKey,
  });

  return {
    report: new PathloomEngine({ store }).analyze({
      sourceKey: scenario.dataset.sourceKey,
    }),
    store,
  };
}

test("authoritative datasets emit risky sequences, golden paths, and client divergence", () => {
  const { report, store } = seedScenario("authoritative_ready");
  const sequence = report.findings.find((finding) => finding.id === "sequence_risk_map");
  const divergence = report.findings.find((finding) => finding.id === "client_divergence");

  assert.equal(sequence.status, "ready");
  assert.ok(
    sequence.items.some(
      (item) =>
        item.pathKind === "risky_sequence" &&
        item.sequenceLabel === "search -> create" &&
        item.errorRate === 1 &&
        item.endpoint.type === "failure_endpoint" &&
        item.endpoint.terminalTool === "create" &&
        item.peerCohorts.matchedSuffixPeers.label === "other routes into create" &&
        item.trajectoryContext &&
        item.trajectoryContext.windowLength === 2 &&
        item.trajectoryContext.familyId.includes("terminal:create") &&
        item.trajectoryContext.cohortSemantics.includes("suffix_peer_bucket"),
    ),
  );
  assert.ok(
    sequence.items.some(
      (item) =>
        item.pathKind === "golden_path" &&
        item.sequenceLabel === "query -> list" &&
        item.successRate === 1 &&
        item.endpoint.type === "success_endpoint" &&
        item.clientSpread.transferability === "single_client",
    ),
  );

  assert.equal(divergence.status, "ready");
  assert.ok(
    divergence.items.some(
      (item) =>
        item.issueType === "client_outlier" &&
        item.clientHint === "cursor" &&
        item.successRate === 0.5,
    ),
  );
  assert.ok(
    divergence.items.some(
      (item) =>
        item.issueType === "tool_outlier" &&
        item.clientHint === "cursor" &&
        item.toolName === "create",
    ),
  );

  store.close();
});

test("degraded datasets suppress unsupported client divergence and sequence claims when repetition is too thin", () => {
  const { report, store } = seedScenario("degraded_narrowed");
  const suppressedIds = new Map<string, any>(
    report.suppressedFindings.map((finding) => [finding.id, finding]),
  );

  assert.equal(
    suppressedIds.get("client_divergence").blockedBy.includes("missing_normalized_client_hints"),
    true,
  );
  assert.equal(
    suppressedIds.get("sequence_risk_map").blockedBy.includes("insufficient_sequence_observations"),
    true,
  );

  store.close();
});

test("sparse authoritative datasets suppress v0.2 findings rather than bluffing", () => {
  const { report, store } = seedScenario("sparse_suppressed");
  const suppressedIds = new Map<string, any>(
    report.suppressedFindings.map((finding) => [finding.id, finding]),
  );

  assert.equal(
    suppressedIds.get("sequence_risk_map").blockedBy.includes("insufficient_sequence_observations"),
    true,
  );
  assert.equal(
    suppressedIds.get("client_divergence").blockedBy.includes("insufficient_client_variety"),
    true,
  );

  store.close();
});
