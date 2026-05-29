"use strict";

const { calibrationFixtures } = require("../../fixtures/calibrationFixtures");
const { materializeCalibrationScenario } = require("./calibration");
const { evaluateReportGolden } = require("./reportGolden");
const {
  CREDIBILITY_GOLDEN_SCENARIOS,
  evaluateGoldenScenario,
  listDefaultGoldenScenarios,
} = require("./golden");

const PATHLOOM_CHECK_VERSION = "1.0";

function buildCalibrationFailure(packet: {
  evaluation: { violations: unknown[]; formattedViolations: string[]; scenarioName: string };
}) {
  return {
    gate: "calibration",
    scenario: packet.evaluation.scenarioName,
    passed: false,
    violationCount: packet.evaluation.violations.length,
    violations: packet.evaluation.formattedViolations,
  };
}

function runCalibrationGate(options: { failFast?: boolean; scenarios?: string[] }) {
  const scenarioNames = options.scenarios || Object.keys(calibrationFixtures);
  const results = [];
  const failures = [];

  for (const scenarioName of scenarioNames) {
    const packet = materializeCalibrationScenario(scenarioName);
    const passed =
      packet.evaluation.violations.length === 0 &&
      packet.evaluation.totalPressure <= packet.evaluation.maxPressure;

    results.push({
      gate: "calibration",
      scenario: scenarioName,
      passed,
      totalPressure: packet.evaluation.totalPressure,
      maxPressure: packet.evaluation.maxPressure,
      violationCount: packet.evaluation.violations.length,
    });

    if (!passed) {
      failures.push(buildCalibrationFailure(packet));
      packet.store.close();
      if (options.failFast) {
        return { results, failures };
      }
    } else {
      packet.store.close();
    }
  }

  return { results, failures };
}

function runGoldenGate(options: { failFast?: boolean; scenarios?: string[] }) {
  const scenarios = options.scenarios || listDefaultGoldenScenarios();
  const results = [];
  const failures = [];

  for (const scenarioName of scenarios) {
    const evaluation = evaluateGoldenScenario(scenarioName);
    results.push({
      gate: "golden",
      scenario: scenarioName,
      passed: evaluation.passed,
      mismatchCount: evaluation.mismatches.length,
    });

    if (!evaluation.passed) {
      failures.push({
        gate: "golden",
        scenario: scenarioName,
        passed: false,
        violationCount: evaluation.mismatches.length,
        violations: evaluation.mismatches,
      });

      if (options.failFast) {
        return { results, failures };
      }
    }
  }

  return { results, failures };
}

function resolveGoldenScenarioName(name: string) {
  if (name === "authoritative-ready") {
    return "authoritative_ready";
  }

  return name;
}

function runPathloomCheck(options: {
  calibrationOnly?: boolean;
  goldenScenario?: string | null;
  failFast?: boolean;
} = {}) {
  const calibrationOnly = Boolean(options.calibrationOnly);
  const failFast = Boolean(options.failFast);
  const goldenScenario = options.goldenScenario
    ? resolveGoldenScenarioName(options.goldenScenario)
    : null;

  const gateResults = [];
  const failures = [];

  const shouldRunCalibration =
    calibrationOnly ||
    !goldenScenario ||
    Object.hasOwn(calibrationFixtures, goldenScenario);

  const shouldRunGolden =
    !calibrationOnly &&
    (!goldenScenario ||
      CREDIBILITY_GOLDEN_SCENARIOS.includes(goldenScenario) ||
      goldenScenario === "demo-pack");

  if (shouldRunCalibration) {
    const scenarios = goldenScenario && Object.hasOwn(calibrationFixtures, goldenScenario)
      ? [goldenScenario]
      : Object.keys(calibrationFixtures);
    const calibration = runCalibrationGate({ failFast, scenarios });
    gateResults.push(...calibration.results);
    failures.push(...calibration.failures);
    if (failFast && failures.length > 0) {
      return finalizeCheckResult(gateResults, failures);
    }
  }

  if (shouldRunGolden) {
    let scenarios: string[];

    if (goldenScenario === "demo-pack") {
      scenarios = ["demo-pack"];
    } else if (goldenScenario && CREDIBILITY_GOLDEN_SCENARIOS.includes(goldenScenario)) {
      scenarios = [goldenScenario];
    } else if (goldenScenario) {
      throw new Error(
        `Unknown --golden scenario: ${goldenScenario}. Expected calibration scenario, ${CREDIBILITY_GOLDEN_SCENARIOS.join(", ")}, demo-pack, or authoritative-ready.`,
      );
    } else {
      scenarios = [...listDefaultGoldenScenarios(), "demo-pack"];
    }

    const golden = runGoldenGate({ failFast, scenarios });
    gateResults.push(...golden.results);
    failures.push(...golden.failures);
  }

  return finalizeCheckResult(gateResults, failures);
}

function finalizeCheckResult(gateResults: unknown[], failures: unknown[]) {
  const passed = failures.length === 0;
  return {
    checkVersion: PATHLOOM_CHECK_VERSION,
    exitCode: passed ? 0 : 1,
    passed,
    summary: {
      gateCount: gateResults.length,
      failureCount: failures.length,
      passedGateCount: gateResults.filter((entry: { passed: boolean }) => entry.passed).length,
    },
    gates: gateResults,
    failures,
  };
}

function renderCheckSummary(result: ReturnType<typeof runPathloomCheck>, format: string) {
  if (format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    result.passed ? "Status: PASS" : "Status: FAIL",
    `Gates: ${result.summary.passedGateCount}/${result.summary.gateCount} passed`,
  ];

  if (result.failures.length === 0) {
    lines.push("Pathloom check passed.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("", "Failures:");

  for (const failure of result.failures as Array<{
    gate: string;
    scenario: string;
    violations: string[];
  }>) {
    lines.push(`- [${failure.gate}] ${failure.scenario}`);
    for (const violation of failure.violations) {
      lines.push(`  ${violation}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

const { createCheckBadge } = require("./badge");

function runPathloomCheckWithBadge(options = {}) {
  const result = runPathloomCheck(options);
  return {
    badge: createCheckBadge(result),
    check: result,
  };
}

export {
  PATHLOOM_CHECK_VERSION,
  createCheckBadge,
  evaluateReportGolden,
  materializeCalibrationScenario,
  runPathloomCheck,
  runPathloomCheckWithBadge,
  renderCheckSummary,
};
