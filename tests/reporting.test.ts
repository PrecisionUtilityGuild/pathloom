"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const { PathloomEngine } = require("@precisionutilityguild/pathloom/core");
const {
  createDistributionBundle,
  createReportDocument,
  renderJsonReport,
  renderMarkdownReport,
  renderShareSummary,
  renderTerminalReport,
} = require("@precisionutilityguild/pathloom/report");
const { buildScenarioReport } = require("./helpers/credibilityHarness.js");
const { seedReadyDataset } = require("./helpers/reportSeed.js");
const { resolveRepoRoot } = require("./helpers/testkit.js");

const REPO_ROOT = resolveRepoRoot();

test("shared report document supports terminal, JSON, and Markdown rendering", () => {
  const seeded = seedReadyDataset("renderers");
  const engine = new PathloomEngine({
    storeOptions: { filename: seeded.filename },
  });
  const analysis = engine.analyze({ sourceKey: seeded.sourceKey });
  const document = createReportDocument(analysis);

  const terminal = renderTerminalReport(document);
  const json = renderJsonReport(document);
  const markdown = renderMarkdownReport(document);

  assert.equal(document.summary.readyFindingCount, 6);
  assert.equal(document.dataset.telemetrySpine.traceIdentity, "none");
  assert.match(terminal, new RegExp(`Pathloom analysis for ${seeded.sourceKey}`));
  assert.match(terminal, /Telemetry: sessions explicit_session_id; trace none; span lineage none/);
  assert.match(terminal, /WARN  Dead tools/);
  assert.match(terminal, /other routes into create/);
  assert.equal(document.findings[0].uncertainty.level, "credible");
  assert.match(json, /"reportVersion": "1.0"/);
  assert.match(json, /"peerCohorts"/);
  assert.match(json, /"telemetrySpine"/);
  assert.match(json, /"uncertainty"/);
  assert.match(markdown, /# Pathloom Report/);
  assert.match(markdown, /Telemetry: sessions explicit_session_id; trace none; span lineage none/);
  assert.match(markdown, /## Dead tools/);
  assert.match(markdown, /Evidence strength:/);
  assert.match(markdown, /Interpretation limits:/);
  assert.match(markdown, /Linked-cohort association only/);
  assert.match(markdown, /reliably precedes the `create` failure endpoint/);
  assert.match(markdown, /## Sequence risk map/);
  assert.match(markdown, /## Activation tool report/);
});

test("report surfaces expose narrowed, candidate, and unsupported uncertainty states", () => {
  const degraded = buildScenarioReport("degraded_narrowed");
  const activationCandidate = buildScenarioReport("activation_candidate_only");
  const narrowedMismatch = degraded.document.findings.find(
    (finding) => finding.id === "argument_mismatch_patterns",
  );
  const suppressedActivation = degraded.document.suppressedFindings.find(
    (finding) => finding.id === "activation_tool_report",
  );
  const candidateActivation = activationCandidate.document.findings.find(
    (finding) => finding.id === "activation_tool_report",
  );

  assert.equal(narrowedMismatch.uncertainty.level, "credible");
  assert.equal(narrowedMismatch.uncertainty.claimScope, "narrowed");
  assert.equal(suppressedActivation.uncertainty.level, "unsupported");
  assert.equal(candidateActivation.uncertainty.level, "candidate");
  assert.equal(
    candidateActivation.evidence.diagnostics.signalTaxonomy.future,
    "incremental_effect_estimate",
  );
});

test("distribution bundle stays aligned with the canonical report document", () => {
  const seeded = seedReadyDataset("bundle-renderers");
  const engine = new PathloomEngine({
    storeOptions: { filename: seeded.filename },
  });
  const document = createReportDocument(engine.analyze({ sourceKey: seeded.sourceKey }));
  const bundle = createDistributionBundle(document);
  const shareSummary = renderShareSummary(bundle);
  const markdownArtifact = bundle.artifacts.find((artifact) => artifact.id === "report_markdown");
  const jsonArtifact = bundle.artifacts.find((artifact) => artifact.id === "report_json");

  assert.equal(bundle.summary.readyFindingCount, document.summary.readyFindingCount);
  assert.equal(bundle.reportVersion, document.reportVersion);
  assert.equal(bundle.artifacts.length, 3);
  assert.match(shareSummary, /# Pathloom Share Summary/);
  assert.match(shareSummary, /\[Full Markdown report\]\(\.\/report\.md\)/);
  assert.equal(markdownArtifact.contents, renderMarkdownReport(document));
  assert.equal(jsonArtifact.contents, renderJsonReport(document));
});

test("CLI analyze renders JSON output from the shared report document", () => {
  const seeded = seedReadyDataset("cli-json");
  const output = execFileSync(
    process.execPath,
    ["dist/bin/pathloom.js", "analyze", "--db", seeded.filename, "--source", seeded.sourceKey, "--json"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  const parsed = JSON.parse(output);

  assert.equal(parsed.sourceKey, seeded.sourceKey);
  assert.equal(parsed.summary.readyFindingCount, 6);
  assert.equal(parsed.findings[0].status, "ready");
});

test("CLI analyze renders Markdown and terminal output modes", () => {
  const seeded = seedReadyDataset("cli-text");
  const markdown = execFileSync(
    process.execPath,
    [
      "dist/bin/pathloom.js",
      "analyze",
      "--db",
      seeded.filename,
      "--source",
      seeded.sourceKey,
      "--markdown",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );
  const terminal = execFileSync(
    process.execPath,
    ["dist/bin/pathloom.js", "analyze", "--db", seeded.filename, "--source", seeded.sourceKey],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  assert.match(markdown, /## Argument mismatch patterns/);
  assert.match(markdown, /Recommendation:/);
  assert.match(terminal, /INFO  Suppressed findings|WARN  Dead tools|OK  /);
});

test("CLI bundle writes a distribution-ready artifact set in one run", () => {
  const seeded = seedReadyDataset("cli-bundle");
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-bundle-"));
  const output = execFileSync(
    process.execPath,
    [
      "dist/bin/pathloom.js",
      "bundle",
      "--db",
      seeded.filename,
      "--source",
      seeded.sourceKey,
      "--output",
      outputDir,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, "bundle.json"), "utf8"));
  const shareSummary = fs.readFileSync(path.join(outputDir, "share-summary.md"), "utf8");
  const markdownReport = fs.readFileSync(path.join(outputDir, "report.md"), "utf8");
  const jsonReport = JSON.parse(fs.readFileSync(path.join(outputDir, "report.json"), "utf8"));

  assert.match(output, /Pathloom bundle written to/);
  assert.equal(manifest.sourceKey, seeded.sourceKey);
  assert.equal(manifest.artifacts.length, 3);
  assert.match(shareSummary, /\[Machine-readable JSON\]\(\.\/report\.json\)/);
  assert.match(markdownReport, /# Pathloom Report/);
  assert.equal(jsonReport.sourceKey, seeded.sourceKey);
});

test("CLI import materializes logfile telemetry into the local store", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-cli-import-"));
  const dbPath = path.join(dir, "import.db");
  const inputPath = path.join(dir, "events.ndjson");
  const catalogPath = path.join(dir, "catalog.json");

  fs.writeFileSync(
    inputPath,
    [
      JSON.stringify({
        actorKey: "actor-1",
        arguments: { q: "hello" },
        clientHint: "Claude Desktop",
        id: "evt-1",
        invokedAt: 1,
        outcome: "success",
        resolvedAt: 2,
        serverId: "demo-server",
        serverVersion: "1.0.0",
        sessionId: "s1",
        toolName: "query",
      }),
      JSON.stringify({
        actorKey: "actor-1",
        arguments: { format: "csv" },
        clientHint: "Claude Desktop",
        id: "evt-2",
        invokedAt: 3,
        outcome: "success",
        resolvedAt: 4,
        serverId: "demo-server",
        serverVersion: "1.0.0",
        sessionId: "s2",
        toolName: "bulk_export",
      }),
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    catalogPath,
    JSON.stringify(
      [
        {
          inputSchema: {
            properties: {
              q: { type: "string" },
            },
            required: ["q"],
            type: "object",
          },
          name: "query",
        },
        {
          inputSchema: {
            properties: {
              format: {
                enum: ["csv", "json"],
                type: "string",
              },
            },
            required: ["format"],
            type: "object",
          },
          name: "bulk_export",
        },
      ],
      null,
      2,
    ),
    "utf8",
  );

  const importOutput = execFileSync(
    process.execPath,
    [
      "dist/bin/pathloom.js",
      "import",
      "--db",
      dbPath,
      "--format",
      "logfile",
      "--input",
      inputPath,
      "--catalog",
      catalogPath,
      "--source",
      "logfile:cli-import",
      "--actor-privacy",
      "hashed",
      "--json",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  const parsedImport = JSON.parse(importOutput);
  const analysisOutput = execFileSync(
    process.execPath,
    ["dist/bin/pathloom.js", "analyze", "--db", dbPath, "--source", "logfile:cli-import", "--json"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );
  const parsedAnalysis = JSON.parse(analysisOutput);

  assert.equal(parsedImport.sourceKey, "logfile:cli-import");
  assert.equal(parsedImport.sourceKind, "logfile");
  assert.equal(parsedImport.eventCount, 2);
  assert.equal(parsedImport.toolCatalogSize, 2);
  assert.equal(parsedImport.readiness, "full");
  assert.equal(parsedImport.telemetrySpine.traceIdentity, "none");
  assert.equal(parsedAnalysis.sourceKey, "logfile:cli-import");
  assert.equal(parsedAnalysis.summary.eventCount, 2);
});

test("CLI returns a clear error when multiple datasets exist and no source is provided", () => {
  const first = seedReadyDataset("multi-a");
  seedReadyDataset("multi-b", {
    filename: first.filename,
    sourceKey: "wrapper:second",
  });

  assert.throws(() => {
    execFileSync(process.execPath, ["dist/bin/pathloom.js", "analyze", "--db", first.filename], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }, /Multiple datasets are registered/);
});
