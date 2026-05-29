"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { PathloomEngine, PathloomIngestEngine, PathloomStore } = require("@precisionutilityguild/pathloom/core");
const { DEFAULT_THRESHOLDS } = require("@precisionutilityguild/pathloom/insights");
const { createReportDocument } = require("@precisionutilityguild/pathloom/report");
const {
  CALIBRATION_FAMILY_RISK_PROFILES,
  CALIBRATION_FINDING_THRESHOLD_KEYS,
  calibrationFixtures,
} = require("../../fixtures/calibrationFixtures");
const { normalizeReportDocument } = require("./normalize");

function createTempDatabasePath(label) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-calibration-")), `${label}.db`);
}

function matchesSubset(candidate, expectedSubset) {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }

  return Object.entries(expectedSubset).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return matchesSubset(candidate[key], value);
    }

    return candidate[key] === value;
  });
}

function accountableKnobsForFinding(findingId, thresholdSnapshot) {
  const keys = CALIBRATION_FINDING_THRESHOLD_KEYS[findingId] || [];
  const snapshot = thresholdSnapshot[findingId] || {};

  return Object.fromEntries(keys.map((key) => [key, snapshot[key]]));
}

function formatCalibrationViolation(violation, thresholdSnapshot) {
  const profile = CALIBRATION_FAMILY_RISK_PROFILES[violation.findingId];
  const knobs = accountableKnobsForFinding(violation.findingId, thresholdSnapshot);
  const knobSummary = Object.entries(knobs)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");

  return [
    `[${violation.findingId}] ${violation.code}: ${violation.message}`,
    profile ? `  risk_focus=${profile.riskFocus}` : null,
    knobSummary.length > 0 ? `  accountable_knobs: ${knobSummary}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function findFinding(document, id) {
  return (
    document.findings.find((finding) => finding.id === id) ||
    document.suppressedFindings.find((finding) => finding.id === id) ||
    null
  );
}

function buildThresholdSnapshot(thresholds) {
  const thresholdKeys = CALIBRATION_FINDING_THRESHOLD_KEYS as Record<string, string[]>;

  return Object.fromEntries(
    Object.entries(thresholdKeys).map(([findingId, keys]) => [
      findingId,
      Object.fromEntries(keys.map((key) => [key, thresholds[key]])),
    ]),
  );
}

function createViolation({ actual, code, expected, findingId, message }) {
  return {
    actual,
    code,
    expected,
    findingId,
    message,
  };
}

function scoreViolation(violation) {
  switch (violation.code) {
    case "missing_finding":
      return 5;
    case "status_mismatch":
      if (violation.expected === "suppressed" && violation.actual === "ready") {
        return 5;
      }

      if (violation.expected === "clear" && violation.actual === "ready") {
        return 4;
      }

      return 3;
    case "level_mismatch":
    case "claim_scope_mismatch":
      return 3;
    case "missing_blocker":
    case "missing_item_match":
    case "forbidden_item_present":
      return 2;
    case "min_items_mismatch":
    case "max_items_mismatch":
      return 2;
    case "missing_trajectory_context":
    case "deep_window_overclaim":
    case "missing_evidence_match":
    case "missing_activation_cohort_context":
      return 4;
    default:
      return 1;
  }
}

function evaluateFindingBudget(document, findingId, budget) {
  const finding = findFinding(document, findingId);
  const violations = [];

  if (!finding) {
    return {
      finding,
      violations: [
        createViolation({
          actual: null,
          code: "missing_finding",
          expected: budget.status || "present",
          findingId,
          message: `Expected finding ${findingId} to exist in findings or suppressed findings.`,
        }),
      ],
    };
  }

  const blockedBy = Array.isArray(finding.blockedBy) ? finding.blockedBy : [];

  if (budget.status && finding.status !== budget.status) {
    violations.push(
      createViolation({
        actual: finding.status,
        code: "status_mismatch",
        expected: budget.status,
        findingId,
        message: `Expected ${findingId} to have status ${budget.status}, got ${finding.status}.`,
      }),
    );
  }

  if (budget.level && finding.uncertainty?.level !== budget.level) {
    violations.push(
      createViolation({
        actual: finding.uncertainty?.level || null,
        code: "level_mismatch",
        expected: budget.level,
        findingId,
        message: `Expected ${findingId} to have uncertainty level ${budget.level}, got ${finding.uncertainty?.level}.`,
      }),
    );
  }

  if (budget.claimScope && finding.uncertainty?.claimScope !== budget.claimScope) {
    violations.push(
      createViolation({
        actual: finding.uncertainty?.claimScope || null,
        code: "claim_scope_mismatch",
        expected: budget.claimScope,
        findingId,
        message: `Expected ${findingId} to have claim scope ${budget.claimScope}, got ${finding.uncertainty?.claimScope}.`,
      }),
    );
  }

  for (const blocker of budget.blockedBy || []) {
    if (!blockedBy.includes(blocker)) {
      violations.push(
        createViolation({
          actual: blockedBy,
          code: "missing_blocker",
          expected: blocker,
          findingId,
          message: `Expected ${findingId} to include blocker ${blocker}.`,
        }),
      );
    }
  }

  if (typeof budget.minItems === "number" && finding.items.length < budget.minItems) {
    violations.push(
      createViolation({
        actual: finding.items.length,
        code: "min_items_mismatch",
        expected: budget.minItems,
        findingId,
        message: `Expected ${findingId} to contain at least ${budget.minItems} items, got ${finding.items.length}.`,
      }),
    );
  }

  if (typeof budget.maxItems === "number" && finding.items.length > budget.maxItems) {
    violations.push(
      createViolation({
        actual: finding.items.length,
        code: "max_items_mismatch",
        expected: budget.maxItems,
        findingId,
        message: `Expected ${findingId} to contain at most ${budget.maxItems} items, got ${finding.items.length}.`,
      }),
    );
  }

  if (budget.itemMatch && !finding.items.some((item) => matchesSubset(item, budget.itemMatch))) {
    violations.push(
      createViolation({
        actual: finding.items,
        code: "missing_item_match",
        expected: budget.itemMatch,
        findingId,
        message: `Expected ${findingId} to include an item matching ${JSON.stringify(
          budget.itemMatch,
        )}.`,
      }),
    );
  }

  if (
    budget.forbiddenItemMatch &&
    finding.items.some((item) => matchesSubset(item, budget.forbiddenItemMatch))
  ) {
    violations.push(
      createViolation({
        actual: budget.forbiddenItemMatch,
        code: "forbidden_item_present",
        expected: null,
        findingId,
        message: `Expected ${findingId} not to include an item matching ${JSON.stringify(
          budget.forbiddenItemMatch,
        )}.`,
      }),
    );
  }

  if (budget.requireTrajectoryContext) {
    for (const item of finding.items) {
      if (!item.trajectoryContext?.familyId) {
        violations.push(
          createViolation({
            actual: item.trajectoryContext || null,
            code: "missing_trajectory_context",
            expected: "trajectoryContext.familyId",
            findingId,
            message: `Expected every ${findingId} item to include trajectoryContext with a stable familyId (SEQ-02 contract).`,
          }),
        );
      }
    }
  }

  if (typeof budget.maxTrajectoryWindowLength === "number") {
    for (const item of finding.items) {
      const windowLength = item.trajectoryContext?.windowLength;
      if (windowLength > budget.maxTrajectoryWindowLength) {
        violations.push(
          createViolation({
            actual: windowLength,
            code: "deep_window_overclaim",
            expected: budget.maxTrajectoryWindowLength,
            findingId,
            message: `Expected ${findingId} items to stay within ${budget.maxTrajectoryWindowLength}-hop windows while deep-volume gates are closed; got ${windowLength}-hop path ${item.sequenceLabel || "unknown"}.`,
          }),
        );
      }
    }
  }

  if (budget.requireEvidenceMatch && !matchesSubset(finding.evidence, budget.requireEvidenceMatch)) {
    violations.push(
      createViolation({
        actual: finding.evidence,
        code: "missing_evidence_match",
        expected: budget.requireEvidenceMatch,
        findingId,
        message: `Expected ${findingId} evidence to include ${JSON.stringify(
          budget.requireEvidenceMatch,
        )}.`,
      }),
    );
  }

  if (budget.requireActivationCohortContext) {
    for (const item of finding.items) {
      if (!item.cohortContext?.comparisonId) {
        violations.push(
          createViolation({
            actual: item.cohortContext || null,
            code: "missing_activation_cohort_context",
            expected: "cohortContext.comparisonId",
            findingId,
            message: `Expected every ${findingId} item to include cohortContext with explicit return-window and cohort diagnostics (ACT-02 contract).`,
          }),
        );
      }
    }
  }

  return {
    finding,
    violations,
  };
}

function summarizeStatuses(document) {
  return {
    clear: document.findings.filter((finding) => finding.status === "clear").length,
    ready: document.findings.filter((finding) => finding.status === "ready").length,
    suppressed: document.suppressedFindings.length,
  };
}

function summarizeUncertainty(document) {
  const counts = {
    candidate: 0,
    credible: 0,
    unsupported: 0,
    weak: 0,
  };

  for (const finding of [...document.findings, ...document.suppressedFindings]) {
    const level = finding.uncertainty?.level;
    if (level && Object.hasOwn(counts, level)) {
      counts[level] += 1;
    }
  }

  return counts;
}

function evaluateFamilyBudgets(expectations, violations, thresholdSnapshot) {
  const familyBudgets = expectations.familyBudgets || {};
  const familyPressure = {};

  for (const violation of violations) {
    familyPressure[violation.findingId] =
      (familyPressure[violation.findingId] || 0) + scoreViolation(violation);
  }

  const familyViolations = [];

  for (const [findingId, budgetEntry] of Object.entries(familyBudgets)) {
    const budget = budgetEntry as { maxPressure?: number };
    const pressure = familyPressure[findingId] || 0;
    const maxPressure =
      budget.maxPressure ?? CALIBRATION_FAMILY_RISK_PROFILES[findingId]?.defaultMaxPressure ?? 0;

    if (pressure > maxPressure) {
      const knobs = accountableKnobsForFinding(findingId, thresholdSnapshot);
      familyViolations.push(
        createViolation({
          actual: pressure,
          code: "family_pressure_exceeded",
          expected: maxPressure,
          findingId,
          message: `Family ${findingId} exceeded pressure budget (${pressure} > ${maxPressure}); tune ${Object.keys(knobs).join(", ")}.`,
        }),
      );
    }
  }

  return {
    familyPressure,
    familyViolations,
  };
}

function evaluateCalibrationScenario(packet) {
  const expectations = packet.scenario.calibrationExpectations;
  const thresholdSnapshot = buildThresholdSnapshot(packet.thresholds);
  const results = Object.entries(expectations.findings).map(([findingId, budget]) => ({
    budget,
    findingId,
    ...evaluateFindingBudget(packet.document, findingId, budget),
  }));
  const violations = results.flatMap((result) => result.violations);
  const { familyPressure, familyViolations } = evaluateFamilyBudgets(
    expectations,
    violations,
    thresholdSnapshot,
  );
  const allViolations = [...violations, ...familyViolations];
  const totalPressure = allViolations.reduce((sum, violation) => sum + scoreViolation(violation), 0);

  return {
    findingResults: results,
    familyPressure,
    formattedViolations: allViolations.map((violation) =>
      formatCalibrationViolation(violation, thresholdSnapshot),
    ),
    maxPressure: expectations.maxPressure,
    scenarioKind: packet.scenario.kind,
    scenarioName: packet.scenarioName,
    scenarioSummary: expectations.scenarioSummary,
    statusCounts: summarizeStatuses(packet.document),
    thresholdSnapshot,
    totalPressure,
    uncertaintyCounts: summarizeUncertainty(packet.document),
    violations: allViolations,
  };
}

function materializeCalibrationScenario(scenarioName, options: any = {}) {
  const scenario = calibrationFixtures[scenarioName];
  const filename = createTempDatabasePath(scenarioName);
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(options.thresholds || {}),
  };
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
  const analysis = engine.analyze({
    sourceKey: scenario.dataset.sourceKey,
    thresholds: options.thresholds,
  });
  const document = normalizeReportDocument(createReportDocument(analysis));
  const packet = {
    analysis,
    document,
    scenario,
    scenarioName,
    store,
    thresholds,
  };

  return {
    ...packet,
    evaluation: evaluateCalibrationScenario(packet),
  };
}

function runCalibrationMatrix(options: any = {}) {
  return Object.keys(calibrationFixtures).map((scenarioName) =>
    materializeCalibrationScenario(scenarioName, options),
  );
}

function assertCalibrationExpectations(assert, packet) {
  assert.ok(packet.evaluation.scenarioSummary);
  assert.equal(
    packet.evaluation.violations.length,
    0,
    packet.evaluation.formattedViolations.join("\n\n"),
  );
  assert.ok(
    packet.evaluation.totalPressure <= packet.evaluation.maxPressure,
    `Expected calibration pressure for ${packet.scenarioName} to stay <= ${packet.evaluation.maxPressure}, got ${packet.evaluation.totalPressure}.\n${packet.evaluation.formattedViolations.join("\n")}`,
  );
}

export {
  accountableKnobsForFinding,
  assertCalibrationExpectations,
  evaluateCalibrationScenario,
  formatCalibrationViolation,
  materializeCalibrationScenario,
  runCalibrationMatrix,
};
