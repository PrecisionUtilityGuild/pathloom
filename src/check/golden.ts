"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { PathloomEngine, PathloomIngestEngine, PathloomStore } = require("@precisionutilityguild/pathloom/core");
const {
  createReportDocument,
  renderJsonReport,
  renderMarkdownReport,
  renderTerminalReport,
} = require("@precisionutilityguild/pathloom/report");
const { credibilityFixtures } = require("../../fixtures/credibilityFixtures");
const { normalizeReportDocument } = require("./normalize");

const CREDIBILITY_GOLDEN_SCENARIOS = Object.freeze([
  "authoritative_ready",
  "degraded_narrowed",
  "sparse_suppressed",
]);

const GOLDEN_EXTENSIONS = Object.freeze({
  json: "json",
  markdown: "md",
  terminal: "txt",
});

function resolveRepoRoot() {
  return path.join(__dirname, "..", "..", "..");
}

function createTempDatabasePath(label: string) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-credibility-")), `${label}.db`);
}

function buildScenarioReport(scenarioName: string) {
  const scenario = credibilityFixtures[scenarioName];
  if (!scenario) {
    throw new Error(`Unknown credibility scenario: ${scenarioName}`);
  }

  const filename = createTempDatabasePath(scenarioName);
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
    sourceKey: scenario.dataset.sourceKey,
    events: scenario.events,
  });

  const engine = new PathloomEngine({ store });
  const analysis = engine.analyze({ sourceKey: scenario.dataset.sourceKey });
  const document = normalizeReportDocument(createReportDocument(analysis));
  const artifacts = {
    analysis,
    document,
    json: renderJsonReport(document),
    markdown: renderMarkdownReport(document),
    terminal: renderTerminalReport(document),
  };

  store.close();
  return artifacts;
}

function readGoldenFile(repoRoot: string, scenarioName: string, surface: string) {
  const extension = GOLDEN_EXTENSIONS[surface as keyof typeof GOLDEN_EXTENSIONS];
  return fs.readFileSync(path.join(repoRoot, "fixtures", "goldens", `${scenarioName}.${extension}`), "utf8");
}

function evaluateCredibilityGolden(scenarioName: string, repoRoot = resolveRepoRoot()) {
  const report = buildScenarioReport(scenarioName);
  const surfaces = ["json", "markdown", "terminal"] as const;
  const mismatches: string[] = [];

  for (const surface of surfaces) {
    const expected = readGoldenFile(repoRoot, scenarioName, surface);
    if (report[surface] !== expected) {
      mismatches.push(`${surface} output drifted from fixtures/goldens/${scenarioName}.${GOLDEN_EXTENSIONS[surface]}`);
    }
  }

  return {
    gate: "golden",
    passed: mismatches.length === 0,
    scenario: scenarioName,
    mismatches,
    violations: mismatches,
  };
}

function evaluateDemoPackGolden(repoRoot = resolveRepoRoot()) {
  const packRoot = path.join(repoRoot, "fixtures", "demo-pack", "authoritative-ready");
  const expectedPath = path.join(packRoot, "expected-report.json");
  const expected = normalizeReportDocument(JSON.parse(fs.readFileSync(expectedPath, "utf8")));

  const { LogfileAdapter } = require("@precisionutilityguild/pathloom/logfile");
  const { loadDemoPack } = require("../../fixtures/demoPack");
  const pack = loadDemoPack();
  const filename = createTempDatabasePath("demo-pack-golden");
  const store = new PathloomStore({ filename });
  const adapter = new LogfileAdapter({
    actorPrivacy: pack.manifest.actorPrivacy,
    entries: pack.events,
    sourceKey: pack.manifest.sourceKey,
    toolCatalog: pack.catalog,
  });

  adapter.materialize({ store });

  const engine = new PathloomEngine({ store });
  const document = normalizeReportDocument(
    createReportDocument(engine.analyze({ sourceKey: pack.manifest.sourceKey })),
  );
  store.close();

  const passed = JSON.stringify(document) === JSON.stringify(expected);
  const mismatches = passed
    ? []
    : ["demo-pack JSON report drifted from fixtures/demo-pack/authoritative-ready/expected-report.json"];

  return {
    gate: "golden",
    passed,
    scenario: "demo-pack",
    mismatches,
    violations: mismatches,
  };
}

function evaluateGoldenScenario(scenarioName: string, repoRoot = resolveRepoRoot()) {
  if (scenarioName === "demo-pack") {
    return evaluateDemoPackGolden(repoRoot);
  }

  if (!CREDIBILITY_GOLDEN_SCENARIOS.includes(scenarioName)) {
    throw new Error(
      `Unknown golden scenario: ${scenarioName}. Expected one of: ${[...CREDIBILITY_GOLDEN_SCENARIOS, "demo-pack"].join(", ")}.`,
    );
  }

  return evaluateCredibilityGolden(scenarioName, repoRoot);
}

function listDefaultGoldenScenarios() {
  return ["authoritative_ready"];
}

export {
  CREDIBILITY_GOLDEN_SCENARIOS,
  buildScenarioReport,
  evaluateCredibilityGolden,
  evaluateDemoPackGolden,
  evaluateGoldenScenario,
  listDefaultGoldenScenarios,
  normalizeReportDocument,
  resolveRepoRoot,
};
