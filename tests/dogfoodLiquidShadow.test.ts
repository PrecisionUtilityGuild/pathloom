"use strict";

const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildManifest,
  createArtifactPaths,
  extractSnapshotKey,
} = require("../scripts/dogfood-liquid-shadow.js");

test("createArtifactPaths returns stable dogfood artifact locations", () => {
  const paths = createArtifactPaths("/tmp/pathloom-dogfood");

  assert.equal(paths.logsPath, "/tmp/pathloom-dogfood/liquid-shadow-dogfood.ndjson");
  assert.equal(paths.catalogPath, "/tmp/pathloom-dogfood/liquid-shadow-tool-catalog.json");
  assert.equal(paths.bundleDir, "/tmp/pathloom-dogfood/bundle");
  assert.equal(paths.snapshotsDir, "/tmp/pathloom-dogfood/snapshots");
  assert.equal(paths.manifestPath, "/tmp/pathloom-dogfood/manifest.json");
});

test("extractSnapshotKey reads the saved snapshot identifier from CLI output", () => {
  const summary = [
    "Pathloom snapshot saved: logfile:liquid-shadow-dogfood@20260525T143000000Z",
    "Source: logfile:liquid-shadow-dogfood",
    "Bundle manifest: /tmp/pathloom-dogfood/snapshots/demo/bundle.json",
  ].join("\n");

  assert.equal(extractSnapshotKey(summary), "logfile:liquid-shadow-dogfood@20260525T143000000Z");
});

test("buildManifest records commands, snapshot metadata, and review artifacts", () => {
  const artifactPaths = createArtifactPaths("/tmp/pathloom-dogfood");
  const manifest = buildManifest({
    artifactPaths,
    bundleSummary: {
      stdout: "Pathloom bundle written to /tmp/pathloom-dogfood/bundle\n",
    },
    importPacket: {
      eventCount: 42,
      readiness: "ready",
      sourceKey: "logfile:liquid-shadow-dogfood",
      sourceKind: "logfile",
      toolCatalogSize: 6,
    },
    logEntries: new Array(42).fill({}),
    serverVersion: "1.2.3",
    sessions: new Array(18).fill({}),
    snapshotSummary: {
      stdout: [
        "Pathloom snapshot saved: logfile:liquid-shadow-dogfood@20260525T143000000Z",
        "Source: logfile:liquid-shadow-dogfood",
        "Bundle manifest: /tmp/pathloom-dogfood/snapshots/logfile-liquid-shadow-dogfood-20260525T143000000Z/bundle.json",
      ].join("\n"),
    },
    totalCalls: 42,
  });

  assert.equal(manifest.workflow.entrypoint, "npm run dogfood:liquid-shadow");
  assert.equal(manifest.server.version, "1.2.3");
  assert.equal(manifest.dataset.sessions, 18);
  assert.equal(manifest.snapshot.key, "logfile:liquid-shadow-dogfood@20260525T143000000Z");
  assert.equal(
    manifest.snapshot.bundleManifestPath,
    "/tmp/pathloom-dogfood/snapshots/logfile-liquid-shadow-dogfood-20260525T143000000Z/bundle.json",
  );
  assert.equal(
    manifest.commands.diffLatest,
    "npx pathloom diff --db /tmp/pathloom-dogfood/pathloom.db --source logfile:liquid-shadow-dogfood --markdown",
  );
  assert.equal(
    manifest.artifacts.find((artifact) => artifact.id === "feedback_markdown").path,
    path.join("/tmp/pathloom-dogfood", "feedback.md"),
  );
});
