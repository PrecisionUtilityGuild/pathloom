"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { PathloomEngine } = require("@precisionutilityguild/pathloom/core");
const { createReportDocument } = require("@precisionutilityguild/pathloom/report");
const { normalizeReportDocument } = require("./normalize");

function readExpectedReport(expectedPath: string) {
  const raw = fs.readFileSync(expectedPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Golden report is not valid JSON: ${expectedPath}`);
  }
}

function computeActualReport({ databasePath, sourceKey }: { databasePath: string; sourceKey: string }) {
  const engine = new PathloomEngine({
    storeOptions: { filename: databasePath },
  });

  const document = normalizeReportDocument(createReportDocument(engine.analyze({ sourceKey })));
  engine.store.close();
  return document;
}

function evaluateReportGolden(options: {
  databasePath: string;
  sourceKey: string;
  expectedPath: string;
}) {
  const expected = normalizeReportDocument(readExpectedReport(options.expectedPath));
  const actual = computeActualReport({ databasePath: options.databasePath, sourceKey: options.sourceKey });

  const expectedString = JSON.stringify(expected);
  const actualString = JSON.stringify(actual);

  const passed = expectedString === actualString;

  const violations = passed
    ? []
    : [
        `report JSON drifted for ${options.sourceKey}`,
        `expected: ${path.relative(process.cwd(), options.expectedPath)}`,
        `hint: run "pathloom analyze --db ${options.databasePath} --source ${options.sourceKey} --json" and update the expected report if the change is intentional`,
      ];

  return {
    gate: "report_golden",
    scenario: options.sourceKey,
    passed,
    mismatchCount: passed ? 0 : 1,
    violations,
  };
}

export { evaluateReportGolden };

