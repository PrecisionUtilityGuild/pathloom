"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { validateCheckBadge, validateCheckResult } = require("@precisionutilityguild/pathloom/contracts");
const { hashDemoPack } = require("../src/check/badge");
const { runCli } = require("../src/cli/run");
const { materializeCalibrationScenario, runPathloomCheck } = require("../src/check");

function createMockIo() {
  const buffers = { stdout: [], stderr: [] };
  return {
    buffers,
    stdout: {
      write(chunk) {
        buffers.stdout.push(String(chunk));
      },
    },
    stderr: {
      write(chunk) {
        buffers.stderr.push(String(chunk));
      },
    },
    exitCode: 0,
  };
}

test("runPathloomCheck passes on authoritative-ready calibration and goldens", () => {
  const result = runPathloomCheck();
  const validation = validateCheckResult(result);

  assert.equal(validation.valid, true, validation.errors.join("; "));
  assert.equal(result.passed, true);
  assert.equal(result.exitCode, 0);
  assert.ok(result.gates.length > 0);
});

test("calibration violations surface accountable knobs for CI operators", () => {
  const packet = materializeCalibrationScenario("sparse_launch_week", {
    thresholds: {
      deadToolsMinSessions: 1,
      deadToolsMinConfidence: 0,
    },
  });

  assert.ok(packet.evaluation.violations.length > 0);
  assert.match(packet.evaluation.formattedViolations.join("\n"), /accountable_knobs/);
  packet.store.close();
});

test("CLI pathloom check exits 0 on a clean tree", () => {
  const io = createMockIo();
  const exitCode = runCli(["node", "pathloom", "check"], io);

  assert.equal(exitCode, 0);
  assert.match(io.buffers.stdout.join(""), /Status: PASS/);
});

test("CLI pathloom check --json-summary returns a valid check contract", () => {
  const io = createMockIo();
  const exitCode = runCli(["node", "pathloom", "check", "--json-summary"], io);
  const result = JSON.parse(io.buffers.stdout.join(""));

  assert.equal(exitCode, 0);
  assert.equal(validateCheckResult(result).valid, true);
});

test("CLI pathloom check --calibration-only skips golden gates", () => {
  const io = createMockIo();
  runCli(["node", "pathloom", "check", "--calibration-only", "--json-summary"], io);
  const result = JSON.parse(io.buffers.stdout.join(""));

  assert.equal(result.passed, true);
  assert.ok(result.gates.every((gate) => gate.gate === "calibration"));
});

test("validateCheckResult enforces pass and failure contract shape", () => {
  const valid = validateCheckResult({
    checkVersion: "1.0",
    exitCode: 0,
    passed: true,
    summary: { gateCount: 2, failureCount: 0, passedGateCount: 2 },
    gates: [],
    failures: [],
  });

  assert.equal(valid.valid, true);

  const invalid = validateCheckResult({
    checkVersion: "1.0",
    exitCode: 0,
    passed: false,
    summary: { gateCount: 1, failureCount: 0, passedGateCount: 0 },
    gates: [],
    failures: [],
  });

  assert.equal(invalid.valid, false);
});

test("CLI pathloom check --emit-badge returns a valid certify badge", () => {
  const io = createMockIo();
  const exitCode = runCli(["node", "pathloom", "check", "--emit-badge"], io);
  const badge = JSON.parse(io.buffers.stdout.join(""));

  assert.equal(exitCode, 0);
  assert.equal(validateCheckBadge(badge).valid, true);
  assert.equal(badge.demoPack.contentHash, hashDemoPack().value);
});

test("CLI pathloom check can diff a source report against an expected JSON golden", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-report-golden-"));
  const dbPath = path.join(tmpDir, "pathloom.db");

  const repoRoot = path.join(__dirname, "..", "..");
  const packRoot = path.join(repoRoot, "fixtures", "demo-pack", "authoritative-ready");

  const ioImport = createMockIo();
  const importExit = runCli(
    [
      "node",
      "pathloom",
      "import",
      "--db",
      dbPath,
      "--format",
      "logfile",
      "--input",
      path.join(packRoot, "events.ndjson"),
      "--catalog",
      path.join(packRoot, "tool-catalog.json"),
      "--source",
      "logfile:demo-pack",
      "--actor-privacy",
      "hashed",
    ],
    ioImport,
  );
  assert.equal(importExit, 0);

  const ioCheck = createMockIo();
  const checkExit = runCli(
    [
      "node",
      "pathloom",
      "check",
      "--db",
      dbPath,
      "--source",
      "logfile:demo-pack",
      "--golden",
      path.join(packRoot, "expected-report.json"),
      "--json-summary",
    ],
    ioCheck,
  );

  assert.equal(checkExit, 0);
  const result = JSON.parse(ioCheck.buffers.stdout.join(""));
  assert.equal(validateCheckResult(result).valid, true);
  assert.equal(result.gates.length, 1);
  assert.equal(result.gates[0].gate, "report_golden");
});

test("CLI help documents check flags", () => {
  const io = createMockIo();
  runCli(["node", "pathloom", "check", "--help"], io);
  const help = io.buffers.stdout.join("");

  assert.match(help, /pathloom check/);
  assert.match(help, /--calibration-only/);
  assert.match(help, /--golden/);
  assert.match(help, /--fail-fast/);
  assert.match(help, /--json-summary/);
  assert.match(help, /--emit-badge/);
});
