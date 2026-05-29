"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { credibilityFixtures } = require("./credibilityFixtures");

const PATHLOOM_ROOT = path.resolve(__dirname, "..", "..");
const DEMO_PACK_VERSION = "1.0";
const DEMO_PACK_ROOT = path.join(PATHLOOM_ROOT, "fixtures", "demo-pack");
const DEFAULT_DEMO_PACK_ID = "authoritative-ready";
const DEFAULT_DEMO_PACK_SOURCE_KEY = "logfile:demo-pack";
const DEFAULT_DEMO_PACK_TITLE = "Authoritative Ready Demo Pack";

function getCanonicalDemoPackDefinition() {
  const scenario = credibilityFixtures.authoritative_ready;

  return {
    actorPrivacy: "hashed",
    catalog: scenario.catalog,
    description:
      "Canonical importable Pathloom demo pack with enough realistic sessions, client divergence, argument mismatches, sequence behavior, and actor linkage to exercise the full credibility-first report surface.",
    events: scenario.events,
    id: DEFAULT_DEMO_PACK_ID,
    scenarioName: "authoritative_ready",
    sourceKey: DEFAULT_DEMO_PACK_SOURCE_KEY,
    title: DEFAULT_DEMO_PACK_TITLE,
  };
}

function getDemoPackPaths(packId = DEFAULT_DEMO_PACK_ID, rootDir = DEMO_PACK_ROOT) {
  const rootPath = path.join(rootDir, packId);

  return {
    catalogPath: path.join(rootPath, "tool-catalog.json"),
    eventsPath: path.join(rootPath, "events.ndjson"),
    expectedJsonPath: path.join(rootPath, "expected-report.json"),
    expectedMarkdownPath: path.join(rootPath, "expected-report.md"),
    expectedTerminalPath: path.join(rootPath, "expected-report.txt"),
    manifestPath: path.join(rootPath, "manifest.json"),
    readmePath: path.join(rootPath, "README.md"),
    rootPath,
  };
}

function writeNdjson(filePath, rows) {
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  fs.writeFileSync(filePath, `${body}\n`, "utf8");
}

function readNdjson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").trim();

  if (raw.length === 0) {
    return [];
  }

  return raw.split(/\r?\n/).map((line) => JSON.parse(line));
}

function loadDemoPack(packId = DEFAULT_DEMO_PACK_ID, rootDir = DEMO_PACK_ROOT) {
  const paths = getDemoPackPaths(packId, rootDir);

  return {
    catalog: JSON.parse(fs.readFileSync(paths.catalogPath, "utf8")),
    events: readNdjson(paths.eventsPath),
    expected: {
      json: fs.readFileSync(paths.expectedJsonPath, "utf8"),
      markdown: fs.readFileSync(paths.expectedMarkdownPath, "utf8"),
      terminal: fs.readFileSync(paths.expectedTerminalPath, "utf8"),
    },
    manifest: JSON.parse(fs.readFileSync(paths.manifestPath, "utf8")),
    paths,
    readme: fs.readFileSync(paths.readmePath, "utf8"),
  };
}

export {
  DEFAULT_DEMO_PACK_ID,
  DEFAULT_DEMO_PACK_SOURCE_KEY,
  DEFAULT_DEMO_PACK_TITLE,
  DEMO_PACK_ROOT,
  DEMO_PACK_VERSION,
  getCanonicalDemoPackDefinition,
  getDemoPackPaths,
  loadDemoPack,
  readNdjson,
  writeNdjson,
};
