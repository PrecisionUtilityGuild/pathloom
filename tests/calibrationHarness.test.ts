"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { FINDINGS } = require("@precisionutilityguild/pathloom/core");
const {
  CALIBRATION_COVERAGE_INVENTORY,
  CALIBRATION_FAMILY_RISK_PROFILES,
  CALIBRATION_FINDING_THRESHOLD_KEYS,
  calibrationFixtures,
} = require("../fixtures/calibrationFixtures.js");
const {
  assertCalibrationExpectations,
  materializeCalibrationScenario,
  runCalibrationMatrix,
} = require("./helpers/calibrationHarness.js");

test("calibration fixture matrix covers sparse, degraded, and adversarial false-positive risks", () => {
  const scenarioNames = Object.keys(calibrationFixtures);
  const scenarioKinds = new Set(
    scenarioNames.map((scenarioName) => calibrationFixtures[scenarioName].kind),
  );
  const coveredFamilies = new Set();

  for (const scenarioName of scenarioNames) {
    for (const findingId of Object.keys(
      calibrationFixtures[scenarioName].calibrationExpectations.findings,
    )) {
      coveredFamilies.add(findingId);
    }
  }

  assert.ok(scenarioNames.length >= 7);
  assert.ok(scenarioKinds.has("sparse"));
  assert.ok(scenarioKinds.has("degraded"));
  assert.ok(scenarioKinds.has("adversarial"));
  assert.ok(scenarioKinds.has("authoritative"));
  assert.ok(
    scenarioNames.includes("sequence_trajectory_honesty"),
    "Expected SEQ-02 trajectory honesty calibration scenario.",
  );
  assert.ok(
    scenarioNames.includes("sequence_thin_volume_deep_gate"),
    "Expected thin-volume deep-window calibration scenario.",
  );
  assert.ok(
    scenarioNames.includes("activation_observational_honesty"),
    "Expected activation observational-honesty calibration scenario.",
  );
  assert.ok(CALIBRATION_COVERAGE_INVENTORY.length >= 2);
  assert.ok(CALIBRATION_FAMILY_RISK_PROFILES[FINDINGS.SEQUENCE_RISK]);

  for (const findingId of Object.values(FINDINGS) as string[]) {
    assert.ok(
      coveredFamilies.has(findingId),
      `Expected calibration matrix to cover finding family ${findingId}.`,
    );
    assert.ok(
      Array.isArray(CALIBRATION_FINDING_THRESHOLD_KEYS[findingId]) &&
        CALIBRATION_FINDING_THRESHOLD_KEYS[findingId].length > 0,
      `Expected threshold mapping for finding family ${findingId}.`,
    );
  }
});

test("calibration scenarios stay within their explicit false-positive budgets", () => {
  const packets = runCalibrationMatrix();

  for (const packet of packets) {
    assert.equal(packet.document.sourceKey, packet.scenario.dataset.sourceKey);
    assertCalibrationExpectations(assert, packet);
    packet.store.close();
  }
});

test("threshold overrides flow through PathloomEngine and trip calibration budgets when loosened", () => {
  const packet = materializeCalibrationScenario("sparse_launch_week", {
    thresholds: {
      deadToolsMinSessions: 1,
      sequenceMinDistinctObservations: 1,
      sequenceMinPeerObservations: 1,
      terminationCandidateMinSessions: 1,
      terminationMinSessions: 1,
    },
  });

  assert.ok(packet.evaluation.totalPressure > packet.evaluation.maxPressure);
  assert.ok(
    packet.evaluation.violations.some(
      (violation) =>
        violation.findingId === FINDINGS.DEAD_TOOLS && violation.code === "status_mismatch",
    ),
  );
  assert.ok(
    packet.evaluation.violations.some(
      (violation) =>
        violation.findingId === FINDINGS.SESSION_TERMINATION &&
        violation.code === "status_mismatch",
    ),
  );

  packet.store.close();
});

test("SEQ-02 and activation deepening scenarios stay inside family-specific budgets", () => {
  for (const scenarioName of [
    "sequence_trajectory_honesty",
    "sequence_thin_volume_deep_gate",
    "activation_observational_honesty",
  ]) {
    const packet = materializeCalibrationScenario(scenarioName);
    assertCalibrationExpectations(assert, packet);
    packet.store.close();
  }
});

test("activation observational honesty requires cohort context and timing semantics", () => {
  const packet = materializeCalibrationScenario("activation_observational_honesty");
  assertCalibrationExpectations(assert, packet);
  const activation = packet.document.findings.find(
    (finding) => finding.id === "activation_tool_report",
  );
  assert.ok(activation.items[0].cohortContext?.comparisonId?.includes("activation:"));
  packet.store.close();
});

test("sequence family regressions report accountable knobs in calibration failures", () => {
  const packet = materializeCalibrationScenario("sequence_trajectory_honesty", {
    thresholds: {
      sequenceMinDistinctObservations: 999,
      sequenceMinPeerObservations: 999,
    },
  });

  assert.ok(packet.evaluation.totalPressure > packet.evaluation.maxPressure);
  assert.ok(
    packet.evaluation.violations.some(
      (violation) =>
        violation.findingId === FINDINGS.SEQUENCE_RISK &&
        violation.code === "status_mismatch",
    ),
  );
  assert.ok(
    packet.evaluation.formattedViolations.some(
      (line) =>
        line.includes(FINDINGS.SEQUENCE_RISK) &&
        line.includes("accountable_knobs") &&
        line.includes("sequenceMinDistinctObservations"),
    ),
    "Expected sequence family regression to name accountable threshold knobs.",
  );

  packet.store.close();
});
