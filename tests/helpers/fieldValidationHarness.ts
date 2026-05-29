"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { PathloomEngine, PathloomIngestEngine, PathloomStore } = require("@precisionutilityguild/pathloom/core");
const { createReportDocument } = require("@precisionutilityguild/pathloom/report");
const { fieldValidationFixtures } = require("../../fixtures/fieldValidationFixtures");
const { normalizeReportDocument } = require("./credibilityHarness");

function createTempDatabasePath(label) {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-field-validation-")),
    `${label}.db`,
  );
}

function materializeFieldScenario(scenarioName) {
  const scenario = fieldValidationFixtures[scenarioName];
  const filename = createTempDatabasePath(scenarioName);
  const store = new PathloomStore({ filename });
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

  const engine = new PathloomEngine({ store });
  const analysis = engine.analyze({ sourceKey: scenario.dataset.sourceKey });
  const document = normalizeReportDocument(createReportDocument(analysis));

  store.close();

  return {
    analysis,
    document,
    reviewExpectations: scenario.reviewExpectations,
    scenario,
  };
}

function matchesSubset(candidate, expectedSubset) {
  return Object.entries(expectedSubset).every(([key, value]) => candidate[key] === value);
}

function findFinding(collection, id) {
  return collection.find((finding) => finding.id === id);
}

function assertFieldValidationExpectations(assert, packet) {
  for (const expected of packet.reviewExpectations.affirmedFindings) {
    const finding = findFinding(packet.document.findings, expected.id);
    assert.ok(finding, `Expected ready/clear finding ${expected.id} to be present.`);

    if (expected.itemMatch) {
      assert.ok(
        finding.items.some((item) => matchesSubset(item, expected.itemMatch)),
        `Expected finding ${expected.id} to contain an item matching ${JSON.stringify(expected.itemMatch)}.`,
      );
    }
  }

  for (const expected of packet.reviewExpectations.challengedFindings) {
    const readyFinding = findFinding(packet.document.findings, expected.id);
    const suppressedFinding = findFinding(packet.document.suppressedFindings, expected.id);

    assert.ok(
      readyFinding || suppressedFinding,
      `Expected challenged finding ${expected.id} to exist in either findings or suppressed findings.`,
    );
  }

  for (const expected of packet.reviewExpectations.suppressedFindings) {
    const finding = findFinding(packet.document.suppressedFindings, expected.id);
    assert.ok(finding, `Expected suppressed finding ${expected.id} to be present.`);

    if (expected.blockedBy) {
      assert.ok(
        finding.blockedBy.includes(expected.blockedBy),
        `Expected suppressed finding ${expected.id} to include blocker ${expected.blockedBy}.`,
      );
    }
  }

  for (const expected of packet.reviewExpectations.calibrationChecks) {
    const finding = findFinding(packet.document.findings, expected.id);
    assert.ok(finding, `Expected calibration finding ${expected.id} to be present.`);

    if (expected.kind === "finding_items_include") {
      assert.ok(
        finding.items.some((item) => matchesSubset(item, expected.itemMatch)),
        `Expected finding ${expected.id} to include an item matching ${JSON.stringify(expected.itemMatch)}.`,
      );
      continue;
    }

    if (expected.kind === "all_items_match") {
      assert.ok(
        finding.items.length > 0 &&
          finding.items.every((item) => matchesSubset(item, expected.itemMatch)),
        `Expected every item in finding ${expected.id} to match ${JSON.stringify(expected.itemMatch)}.`,
      );
      continue;
    }

    if (expected.kind === "finding_summary_equals") {
      assert.equal(
        finding.summary,
        expected.summary,
        `Expected finding ${expected.id} to have summary ${expected.summary}.`,
      );
    }
  }
}

export { assertFieldValidationExpectations, materializeFieldScenario };
