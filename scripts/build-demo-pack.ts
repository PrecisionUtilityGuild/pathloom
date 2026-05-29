"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { PathloomEngine, PathloomStore } = require("@precisionutilityguild/pathloom/core");
const { LogfileAdapter } = require("../src/logfile");
const {
  createReportDocument,
  renderJsonReport,
  renderMarkdownReport,
  renderTerminalReport,
} = require("@precisionutilityguild/pathloom/report");
const {
  DEMO_PACK_VERSION,
  getCanonicalDemoPackDefinition,
  getDemoPackPaths,
  writeNdjson,
} = require("../fixtures/demoPack");

const PATHLOOM_ROOT = path.resolve(__dirname, "..", "..");

function createTempDatabasePath(label) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-demo-pack-")), `${label}.db`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeReportDocument(document) {
  return {
    ...document,
    generatedAt: "<generated-at>",
  };
}

function relativeToRepo(filePath) {
  return path.relative(PATHLOOM_ROOT, filePath).replaceAll(path.sep, "/");
}

function describeFindingItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  if (item.sequenceLabel) {
    return item.sequenceLabel;
  }

  if (item.toolName && item.argumentName) {
    return `${item.toolName}.${item.argumentName}`;
  }

  if (item.clientHint && item.toolName) {
    return `${item.clientHint}.${item.toolName}`;
  }

  if (item.clientHint) {
    return item.clientHint;
  }

  if (item.toolName) {
    return item.toolName;
  }

  return null;
}

function createExpectedFindings(document) {
  return document.findings.map((finding) => ({
    id: finding.id,
    keyItems: finding.items
      .map((item) => describeFindingItem(item))
      .filter(Boolean)
      .slice(0, 4),
    severity: finding.severity,
    status: finding.status,
    summary: finding.summary,
    title: finding.title,
  }));
}

function createManifest(definition, document, paths) {
  const sessionCount = new Set(definition.events.map((event) => event.sessionId)).size;
  const eventsPath = `./${relativeToRepo(paths.eventsPath)}`;
  const catalogPath = `./${relativeToRepo(paths.catalogPath)}`;

  return {
    actorPrivacy: definition.actorPrivacy,
    artifacts: {
      catalog: "tool-catalog.json",
      events: "events.ndjson",
      expectedJson: "expected-report.json",
      expectedMarkdown: "expected-report.md",
      expectedTerminal: "expected-report.txt",
      manifest: "manifest.json",
      readme: "README.md",
    },
    commands: {
      analyzeJson: `npx pathloom analyze --source ${definition.sourceKey} --json`,
      analyzeMarkdown: `npx pathloom analyze --source ${definition.sourceKey} --markdown`,
      analyzeTerminal: `npx pathloom analyze --source ${definition.sourceKey}`,
      import: `npx pathloom import --format logfile --input ${eventsPath} --catalog ${catalogPath} --source ${definition.sourceKey} --actor-privacy ${definition.actorPrivacy}`,
      rebuild: "npm run demo-pack:build",
    },
    dataset: {
      catalogToolCount: definition.catalog.length,
      eventCount: definition.events.length,
      readiness: document.dataset.readiness,
      sessionCount,
      sourceKind: document.dataset.sourceKind,
      toolCatalogAuthority: document.dataset.toolCatalogAuthority,
    },
    description: definition.description,
    expectedFindings: createExpectedFindings(document),
    generatedFrom: {
      fixtureModule: "fixtures/credibilityFixtures.js",
      scenarioName: definition.scenarioName,
    },
    id: definition.id,
    packVersion: DEMO_PACK_VERSION,
    sourceKey: definition.sourceKey,
    title: definition.title,
  };
}

function createReadme(definition, manifest) {
  const findings = manifest.expectedFindings
    .map((finding) => `- \`${finding.id}\` — ${finding.summary}`)
    .join("\n");

  return [
    `# ${definition.title}`,
    "",
    definition.description,
    "",
    "## Contents",
    "",
    "- `events.ndjson` — canonical importable telemetry dataset",
    "- `tool-catalog.json` — matching authoritative catalog",
    "- `expected-report.json` — frozen machine-readable report",
    "- `expected-report.md` — frozen Markdown review surface",
    "- `expected-report.txt` — frozen terminal review surface",
    "- `manifest.json` — commands, counts, and expected findings summary",
    "",
    "## Import and analyze",
    "",
    "Run these commands from the repository root:",
    "",
    "```bash",
    manifest.commands.import,
    manifest.commands.analyzeTerminal,
    "```",
    "",
    "## Expected findings",
    "",
    findings,
    "",
    "## Refresh this pack",
    "",
    "```bash",
    manifest.commands.rebuild,
    "```",
    "",
  ].join("\n");
}

function buildDemoPack() {
  const definition = getCanonicalDemoPackDefinition();
  const paths = getDemoPackPaths(definition.id);
  const databasePath = createTempDatabasePath(definition.id);
  const store = new PathloomStore({ filename: databasePath });
  const adapter = new LogfileAdapter({
    actorPrivacy: definition.actorPrivacy,
    entries: definition.events,
    sourceKey: definition.sourceKey,
    toolCatalog: definition.catalog,
  });

  ensureDir(paths.rootPath);
  writeNdjson(paths.eventsPath, definition.events);
  writeJson(paths.catalogPath, definition.catalog);

  adapter.materialize({ store });

  const engine = new PathloomEngine({ store });
  const analysis = engine.analyze({ sourceKey: definition.sourceKey });
  const document = normalizeReportDocument(createReportDocument(analysis));
  const manifest = createManifest(definition, document, paths);
  const readme = createReadme(definition, manifest);

  fs.writeFileSync(paths.expectedTerminalPath, renderTerminalReport(document), "utf8");
  fs.writeFileSync(paths.expectedMarkdownPath, renderMarkdownReport(document), "utf8");
  fs.writeFileSync(paths.expectedJsonPath, renderJsonReport(document), "utf8");
  writeJson(paths.manifestPath, manifest);
  fs.writeFileSync(paths.readmePath, readme, "utf8");

  store.close();

  return {
    definition,
    manifest,
    paths,
  };
}

function main() {
  const result = buildDemoPack();

  process.stdout.write(
    [
      `Built demo pack: ${result.definition.id}`,
      `Source key: ${result.definition.sourceKey}`,
      `Events: ${result.manifest.dataset.eventCount}`,
      `Sessions: ${result.manifest.dataset.sessionCount}`,
      `Catalog tools: ${result.manifest.dataset.catalogToolCount}`,
      `Manifest: ${result.paths.manifestPath}`,
    ].join("\n"),
  );
}

if (require.main === module) {
  main();
}

export {
  buildDemoPack,
  createExpectedFindings,
  createManifest,
  createReadme,
  normalizeReportDocument,
};
