"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { fieldValidationFixtures } = require("../fixtures/fieldValidationFixtures.js");
const {
  assertFieldValidationExpectations,
  materializeFieldScenario,
} = require("./helpers/fieldValidationHarness.js");

test("field validation harness covers multiple scrubbed-equivalent operator datasets", () => {
  const scenarioNames = Object.keys(fieldValidationFixtures);

  assert.ok(
    scenarioNames.length >= 2,
    "Field validation should cover at least two representative scrubbed-equivalent datasets.",
  );
  assert.ok(scenarioNames.includes("cursor_onboarding_gap"));
  assert.ok(scenarioNames.includes("logfile_handoff_gap"));
});

test("field validation scenarios preserve affirmed, challenged, and suppressed expectations", async (t) => {
  for (const scenarioName of Object.keys(fieldValidationFixtures)) {
    await t.test(scenarioName, () => {
      const packet = materializeFieldScenario(scenarioName);

      assert.equal(packet.document.sourceKey, packet.scenario.dataset.sourceKey);
      assert.ok(packet.reviewExpectations.scenarioSummary);

      assertFieldValidationExpectations(assert, packet);
    });
  }
});

test("underpowered validation scenarios stay suppression-first", () => {
  const packet = materializeFieldScenario("launch_week_underpowered");

  assert.equal(packet.document.summary.readyFindingCount, 0);
  assert.equal(packet.document.findings.length, 1);
  assert.equal(packet.document.findings[0].id, "argument_mismatch_patterns");
  assert.ok(packet.document.suppressedFindings.length >= 3);
  assertFieldValidationExpectations(assert, packet);
});
