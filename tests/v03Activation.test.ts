"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PathloomEngine,
  PathloomIngestEngine,
  PathloomStore,
  SOURCE_KINDS,
} = require("@precisionutilityguild/pathloom/core");
const { directWrapperFixture } = require("../fixtures/analysisContractFixtures.js");
const { credibilityFixtures } = require("../fixtures/credibilityFixtures.js");

function createTempDatabasePath(label) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-v03-")), `${label}.db`);
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

test("authoritative linked-actor datasets emit an activation tool report", () => {
  const { report, store } = seedScenario("authoritative_ready");
  const activation = report.findings.find((finding) => finding.id === "activation_tool_report");

  assert.equal(activation.status, "ready");
  assert.equal(activation.items.length, 1);
  assert.equal(activation.items[0].toolName, "query");
  assert.equal(activation.items[0].exposedActors, 6);
  assert.equal(activation.items[0].returnedActors, 5);
  assert.equal(activation.items[0].exposedReturnRate, 0.83);
  assert.equal(activation.items[0].controlReturnRate, 0.06);
  assert.equal(activation.items[0].signalClass, "credible_cohort_signal");
  assert.equal(activation.evidence.diagnostics.returnWindow.kind, "next_observed_session");
  assert.equal(
    activation.evidence.diagnostics.returnWindow.timingMode,
    "session_order_plus_invoked_at_gap",
  );
  assert.equal(
    activation.evidence.diagnostics.returnWindow.claimBoundary,
    "not_incremental_effect_not_causal",
  );
  assert.ok(activation.evidence.diagnostics.returnWindow.aggregate);
  assert.equal(activation.evidence.diagnostics.confoundingRisk.level, "high");
  assert.equal(activation.uncertainty.level, "credible");
  assert.ok(
    activation.items[0].confidenceBand.exposedLower >
      activation.items[0].confidenceBand.controlUpper,
  );
  assert.equal(activation.items[0].cohortContext.comparisonId, "activation:query:first_session_exposure");
  assert.equal(activation.items[0].cohortContext.returnWindow.kind, "next_observed_session");
  assert.ok(activation.items[0].cohortContext.returnWindow.medianInvokedAtGapToReturn != null);

  store.close();
});

test("candidate activation signals stay clear until the confidence threshold is met", () => {
  const { report, store } = seedScenario("activation_candidate_only");
  const activation = report.findings.find((finding) => finding.id === "activation_tool_report");

  assert.equal(activation.status, "clear");
  assert.equal(activation.summary.includes("candidate return correlates"), true);
  assert.equal(activation.evidence.candidateSignalCount, 1);
  assert.equal(activation.evidence.diagnostics.returnWindow.label, "second_observed_session");
  assert.equal(activation.items.length, 1);
  assert.equal(activation.items[0].signalClass, "candidate_return_correlate");
  assert.equal(activation.uncertainty.level, "candidate");
  assert.equal(activation.recommendation.includes("watch-list return correlates"), true);
  assert.equal(activation.items[0].cohortContext.comparisonId, "activation:query:first_session_exposure");
  assert.equal(activation.items[0].cohortContext.cohortSemantics, "first_session_exposure_vs_linked_control_without_exposure");

  store.close();
});

test("stable-actor profiles without observed actor linkage suppress activation claims", () => {
  const store = new PathloomStore({ filename: createTempDatabasePath("missing-actors") });
  const ingestEngine = new PathloomIngestEngine({ store });
  const sourceKey = "wrapper:no-actors";

  ingestEngine.registerDataset({
    profile: directWrapperFixture,
    sourceKey,
    sourceKind: SOURCE_KINDS.WRAPPER,
  });
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

  const report = new PathloomEngine({ store }).analyze({ sourceKey });
  const activation = report.suppressedFindings.find(
    (finding) => finding.id === "activation_tool_report",
  );

  assert.equal(activation.blockedBy.includes("missing_observed_actor_linkage"), true);
  assert.equal(activation.uncertainty.level, "unsupported");

  store.close();
});

test("session-only datasets continue suppressing activation even when return-like sessions exist", () => {
  const { report, store } = seedScenario("degraded_narrowed");
  const activation = report.suppressedFindings.find(
    (finding) => finding.id === "activation_tool_report",
  );

  assert.equal(activation.blockedBy.includes("missing_stable_actor_identity"), true);
  assert.equal(activation.uncertainty.level, "unsupported");

  store.close();
});
