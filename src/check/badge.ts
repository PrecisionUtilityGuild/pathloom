"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { PATHLOOM_PACKAGE_VERSION } = require("../version");
const { calibrationFixtures } = require("../../fixtures/calibrationFixtures");
const { resolveRepoRoot } = require("./golden");

const PATHLOOM_CHECK_BADGE_VERSION = "1.0";

const DEMO_PACK_FILES = Object.freeze([
  "events.ndjson",
  "tool-catalog.json",
  "expected-report.json",
]);

function hashDemoPack(repoRoot = resolveRepoRoot()) {
  const packRoot = path.join(repoRoot, "fixtures", "demo-pack", "authoritative-ready");
  const digest = crypto.createHash("sha256");

  for (const fileName of DEMO_PACK_FILES) {
    const filePath = path.join(packRoot, fileName);
    digest.update(fileName);
    digest.update(fs.readFileSync(filePath));
  }

  return {
    algorithm: "sha256",
    files: DEMO_PACK_FILES,
    value: digest.digest("hex"),
  };
}

function createCheckBadge(checkResult: {
  passed: boolean;
  summary: { gateCount: number; passedGateCount: number };
  gates: Array<{ gate: string; scenario: string; passed: boolean }>;
}) {
  const demoPackHash = hashDemoPack();
  const calibrationScenarios = Object.keys(calibrationFixtures);
  const goldenScenarios = checkResult.gates
    .filter((gate) => gate.gate === "golden")
    .map((gate) => gate.scenario);

  return {
    badgeVersion: PATHLOOM_CHECK_BADGE_VERSION,
    kind: "pathloom_certify",
    issuedAt: new Date().toISOString(),
    pathloomVersion: PATHLOOM_PACKAGE_VERSION,
    passed: checkResult.passed,
    demoPack: {
      id: "authoritative-ready",
      sourceKey: "logfile:demo-pack",
      contentHash: demoPackHash.value,
      hashAlgorithm: demoPackHash.algorithm,
      hashedFiles: demoPackHash.files,
    },
    gates: {
      calibrationScenarios,
      goldenScenarios,
      gateCount: checkResult.summary.gateCount,
      passedGateCount: checkResult.summary.passedGateCount,
      results: checkResult.gates,
    },
    verify: {
      command: "npx pathloom check --emit-badge",
      note: "Re-run on the same demo-pack commit; contentHash must match for the badge to be comparable.",
    },
  };
}

export {
  PATHLOOM_CHECK_BADGE_VERSION,
  createCheckBadge,
  hashDemoPack,
};
