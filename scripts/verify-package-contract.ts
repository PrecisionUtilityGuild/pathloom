"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const manifest = require(path.join(repoRoot, "package.json"));

function assertFileExists(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert.equal(
    fs.existsSync(absolutePath),
    true,
    `Expected publish artifact to exist: ${relativePath}`,
  );
}

assert.equal(manifest.type, "commonjs");
assert.equal(manifest.main, "./dist/index.js");
assert.equal(manifest.types, "./dist/index.d.ts");
assert.equal(manifest.bin.pathloom, "./dist/bin/pathloom.js");

const expectedExports = [
  ".",
  "./contracts",
  "./core",
  "./feedback",
  "./history",
  "./insights",
  "./logfile",
  "./otel",
  "./report",
  "./uncertainty",
];

for (const exportKey of expectedExports) {
  const exportTarget = manifest.exports[exportKey];
  assert.ok(exportTarget, `Missing package export: ${exportKey}`);
  assert.equal(typeof exportTarget.types, "string");
  assert.equal(typeof exportTarget.require, "string");
  assert.equal(typeof exportTarget.default, "string");
  assertFileExists(exportTarget.types);
  assertFileExists(exportTarget.require);
}

const pathloom = require(manifest.name);
const contracts = require(`${manifest.name}/contracts`);
const core = require(`${manifest.name}/core`);

assert.equal(typeof pathloom.PathloomEngine, "function");
assert.equal(typeof pathloom.withPathloom, "function");
assert.equal(typeof contracts.validateNormalizedEvent, "function");
assert.equal(typeof core.PathloomEngine, "function");

const version = execFileSync(
  process.execPath,
  [path.join(repoRoot, "dist/bin/pathloom.js"), "--version"],
  {
    cwd: repoRoot,
    encoding: "utf8",
  },
).trim();
assert.equal(version, manifest.version);

const schema = JSON.parse(
  execFileSync(
    process.execPath,
    [path.join(repoRoot, "dist/bin/pathloom.js"), "schema", "report"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  ),
);
assert.equal(schema.kind, "report_document");

process.stdout.write("Package contract verified against dist artifacts.\n");

export {};
