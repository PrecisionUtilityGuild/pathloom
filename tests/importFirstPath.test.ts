"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { runCli } = require("../src/cli/run");
const { normalizeReportDocument } = require("../scripts/build-demo-pack.js");

const packRoot = path.join(
  __dirname,
  "..",
  "..",
  "fixtures",
  "demo-pack",
  "authoritative-ready",
);

function createMockIo(databasePath) {
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
    databasePath,
  };
}

function runCommand(io, args) {
  const exitCode = runCli(["node", "pathloom", ...args], io);
  return {
    exitCode,
    stdout: io.buffers.stdout.join(""),
    stderr: io.buffers.stderr.join(""),
  };
}

test("import-first CLI path: logfile import then analyze matches frozen demo-pack golden", () => {
  const databasePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-import-first-")),
    "pathloom.db",
  );
  const sourceKey = "logfile:demo-pack";

  const importResult = runCommand(createMockIo(databasePath), [
    "import",
    "--db",
    databasePath,
    "--format",
    "logfile",
    "--input",
    path.join(packRoot, "events.ndjson"),
    "--catalog",
    path.join(packRoot, "tool-catalog.json"),
    "--source",
    sourceKey,
    "--actor-privacy",
    "hashed",
  ]);

  assert.equal(importResult.exitCode, 0, importResult.stderr);
  assert.match(importResult.stdout, /Pathloom import completed/);

  const analyzeResult = runCommand(createMockIo(databasePath), [
    "analyze",
    "--db",
    databasePath,
    "--source",
    sourceKey,
    "--json",
  ]);

  assert.equal(analyzeResult.exitCode, 0, analyzeResult.stderr);

  const document = normalizeReportDocument(JSON.parse(analyzeResult.stdout));
  const expected = normalizeReportDocument(
    JSON.parse(fs.readFileSync(path.join(packRoot, "expected-report.json"), "utf8")),
  );

  assert.deepEqual(document, expected);
});
