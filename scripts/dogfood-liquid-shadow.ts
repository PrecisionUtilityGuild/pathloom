"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PATHLOOM_ROOT = path.resolve(__dirname, "..", "..");
const PATHLOOM_CLI = path.join(PATHLOOM_ROOT, "dist", "bin", "pathloom.js");
const LIQUID_SHADOW_ROOT = "/Users/a14a/Documents/liveprojects/ts-repo-prep";
const LIQUID_SHADOW_RUNNER = path.join(LIQUID_SHADOW_ROOT, "scripts", "run-mcp-tool.mjs");
const TARGET_REPO = LIQUID_SHADOW_ROOT;
const SERVER_ID = "liquid-shadow-mcp";
const OUTPUT_ROOT = path.join(PATHLOOM_ROOT, ".pathloom-datasets", "liquid-shadow");
const SOURCE_KEY = "logfile:liquid-shadow-dogfood";
const DOGFOOD_LABEL = "liquid-shadow-dogfood";
const SELECTED_TOOLS = [
  "shadow_ops_context",
  "shadow_search_concept",
  "shadow_search_path",
  "shadow_inspect_file",
  "shadow_workspace_gc",
  "shadow_workspace_status",
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  fs.rmSync(targetPath, { force: true, recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readLiquidShadowVersion() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(LIQUID_SHADOW_ROOT, "package.json"), "utf8"),
  );
  return packageJson.version || "0.0.0";
}

function maybeParseJson(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function estimateTokens(value) {
  if (typeof value !== "string" || value.length === 0) {
    return 0;
  }

  return Math.ceil(value.length / 4);
}

function runProcess(command, args, options: any = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || PATHLOOM_ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function renderCommand(command, args) {
  return [command, ...args].join(" ");
}

function runTool(toolName, toolArgs) {
  const startedAt = Date.now();
  const result = runProcess(
    "node",
    [LIQUID_SHADOW_RUNNER, "--timeout-ms", "60000", toolName, JSON.stringify(toolArgs)],
    { cwd: LIQUID_SHADOW_ROOT },
  );
  const finishedAt = Date.now();
  const stdout = (result.stdout || "").trim();
  const parsed = maybeParseJson(stdout);
  const outcome = result.status === 0 ? "success" : "error";

  return {
    durationMs: finishedAt - startedAt,
    finishedAt,
    outcome,
    parsed,
    rawOutput: stdout,
    startedAt,
    status: result.status,
    stderr: (result.stderr || "").trim(),
  };
}

function runPathloom(args, options: any = {}) {
  const result = runProcess(process.execPath, [PATHLOOM_CLI, ...args], {
    cwd: PATHLOOM_ROOT,
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    throw new Error(
      stderr || stdout || `Pathloom command failed: ${renderCommand("npx pathloom", args)}`,
    );
  }

  const stdout = result.stdout || "";
  return {
    command: renderCommand("npx pathloom", args),
    parsed: options.expectJson ? JSON.parse(stdout) : null,
    stdout,
  };
}

function loadSelectedToolSchemas() {
  const code = `
    import { TOOL_SCHEMAS } from './src/utility/schemas/index.ts';
    const selected = new Set(${JSON.stringify(SELECTED_TOOLS)});
    console.log(JSON.stringify(TOOL_SCHEMAS.filter((tool) => selected.has(tool.name)), null, 2));
  `;
  const result = runProcess("npx", ["tsx", "-e", code], { cwd: LIQUID_SHADOW_ROOT });

  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to load liquid-shadow tool schemas.");
  }

  return JSON.parse(result.stdout);
}

function requiredArguments(schema) {
  if (!schema || typeof schema !== "object" || !Array.isArray(schema.required)) {
    return [];
  }

  return schema.required;
}

function buildCatalogEntries(toolSchemas, serverVersion) {
  return toolSchemas.map((tool) => ({
    schema: tool.inputSchema || null,
    schemaSource: "declared_contract",
    serverId: SERVER_ID,
    serverVersion,
    toolName: tool.name,
  }));
}

function buildScenarios(repoPath, inspectFilePath) {
  const sessions = [];

  for (let index = 1; index <= 6; index += 1) {
    const actorKey = `actor-claude-${index}`;

    sessions.push({
      actorKey,
      clientHint: "Claude Desktop",
      sessionId: `${actorKey}-s1`,
      steps: [
        { toolName: "shadow_ops_context", toolArgs: { compact: true, repoPath } },
        {
          toolName: "shadow_search_concept",
          toolArgs: { compact: true, query: "flow coverage", repoPath },
        },
        {
          toolName: "shadow_inspect_file",
          toolArgs: { detailLevel: "summaries", filePath: inspectFilePath, repoPath },
        },
      ],
    });

    sessions.push({
      actorKey,
      clientHint: "Claude Desktop",
      sessionId: `${actorKey}-s2`,
      steps: [
        {
          toolName: "shadow_search_path",
          toolArgs: { query: "metrics", repoPath },
        },
        {
          toolName: "shadow_search_concept",
          toolArgs: { compact: true, query: "trust summary", repoPath },
        },
      ],
    });
  }

  for (let index = 1; index <= 6; index += 1) {
    const actorKey = `actor-cursor-${index}`;
    const failingArgs =
      index <= 3
        ? { detailLevel: "summaries", repoPath }
        : { detailLevel: "summaries", filePath: [inspectFilePath], repoPath };

    sessions.push({
      actorKey,
      clientHint: "Cursor",
      sessionId: `${actorKey}-s1`,
      steps: [
        {
          toolName: "shadow_search_path",
          toolArgs: { query: "metrics", repoPath },
        },
        {
          toolName: "shadow_inspect_file",
          toolArgs: failingArgs,
        },
      ],
    });
  }

  return sessions;
}

function createLogEntry({
  actorKey,
  clientHint,
  index,
  schemaByTool,
  serverVersion,
  sessionId,
  step,
  toolResult,
}) {
  const schema = schemaByTool.get(step.toolName) || null;
  const required = requiredArguments(schema);
  const argumentNames = Object.keys(step.toolArgs || {});
  const argumentsMissing = required.filter((name) => !Object.hasOwn(step.toolArgs || {}, name));
  const serializedOutput =
    typeof toolResult.rawOutput === "string" && toolResult.rawOutput.length > 0
      ? toolResult.rawOutput
      : JSON.stringify(toolResult.parsed || "");

  return {
    actorKey,
    arguments: step.toolArgs,
    argumentsMissing,
    argumentsProvided: argumentNames,
    clientHint,
    id: `${sessionId}:${index}:${step.toolName}`,
    invokedAt: toolResult.startedAt,
    outcome: toolResult.outcome,
    resolvedAt: toolResult.finishedAt,
    resultTokenEstimate: estimateTokens(serializedOutput),
    serverId: SERVER_ID,
    serverVersion,
    sessionId,
    toolName: step.toolName,
  };
}

function writeNdjson(filePath, rows) {
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  fs.writeFileSync(filePath, `${body}\n`, "utf8");
}

function extractLabeledValue(summaryText, label) {
  const pattern = new RegExp(`^${label}:\\s+(.+)$`, "m");
  const match = summaryText.match(pattern);
  return match ? match[1].trim() : null;
}

function extractSnapshotKey(summaryText) {
  return extractLabeledValue(summaryText, "Pathloom snapshot saved");
}

function createArtifactPaths(outputRoot) {
  return {
    outputRoot,
    logsPath: path.join(outputRoot, "liquid-shadow-dogfood.ndjson"),
    catalogPath: path.join(outputRoot, "liquid-shadow-tool-catalog.json"),
    dbPath: path.join(outputRoot, "pathloom.db"),
    importSummaryPath: path.join(outputRoot, "import-summary.json"),
    terminalReportPath: path.join(outputRoot, "report.txt"),
    markdownPath: path.join(outputRoot, "report.md"),
    jsonPath: path.join(outputRoot, "report.json"),
    feedbackPath: path.join(outputRoot, "feedback.md"),
    bundleDir: path.join(outputRoot, "bundle"),
    bundleSummaryPath: path.join(outputRoot, "bundle-summary.txt"),
    snapshotsDir: path.join(outputRoot, "snapshots"),
    snapshotSummaryPath: path.join(outputRoot, "snapshot-summary.txt"),
    manifestPath: path.join(outputRoot, "manifest.json"),
  };
}

function resetArtifacts(paths) {
  ensureDir(paths.outputRoot);

  for (const targetPath of [
    paths.logsPath,
    paths.catalogPath,
    paths.dbPath,
    paths.importSummaryPath,
    paths.terminalReportPath,
    paths.markdownPath,
    paths.jsonPath,
    paths.feedbackPath,
    paths.bundleSummaryPath,
    paths.snapshotSummaryPath,
    paths.manifestPath,
  ]) {
    removeIfExists(targetPath);
  }

  removeIfExists(paths.bundleDir);
  removeIfExists(paths.snapshotsDir);
}

function buildManifest({
  artifactPaths,
  bundleSummary,
  importPacket,
  logEntries,
  serverVersion,
  sessions,
  snapshotSummary,
  totalCalls,
}) {
  const snapshotKey = extractSnapshotKey(snapshotSummary.stdout);
  const snapshotBundleManifestPath = extractLabeledValue(snapshotSummary.stdout, "Bundle manifest");
  const analyzeArgs = ["analyze", "--db", artifactPaths.dbPath, "--source", SOURCE_KEY];
  const bundleArgs = [
    "bundle",
    "--db",
    artifactPaths.dbPath,
    "--source",
    SOURCE_KEY,
    "--output",
    artifactPaths.bundleDir,
  ];
  const snapshotArgs = [
    "snapshot",
    "--db",
    artifactPaths.dbPath,
    "--source",
    SOURCE_KEY,
    "--label",
    DOGFOOD_LABEL,
    "--output",
    artifactPaths.snapshotsDir,
  ];

  return {
    generatedAt: new Date().toISOString(),
    workflow: {
      entrypoint: "npm run dogfood:liquid-shadow",
      label: DOGFOOD_LABEL,
      sourceKey: SOURCE_KEY,
      targetRepo: TARGET_REPO,
    },
    server: {
      id: SERVER_ID,
      version: serverVersion,
    },
    dataset: {
      capturedCalls: totalCalls,
      invocationEvents: logEntries.length,
      sessions: sessions.length,
      toolCatalogCount: SELECTED_TOOLS.length,
    },
    importSummary: importPacket,
    snapshot: {
      bundleManifestPath: snapshotBundleManifestPath,
      key: snapshotKey,
      summaryPath: artifactPaths.snapshotSummaryPath,
    },
    commands: {
      rerunDogfood: "npm run dogfood:liquid-shadow",
      analyzeTerminal: renderCommand("npx pathloom", analyzeArgs),
      analyzeMarkdown: renderCommand("npx pathloom", [...analyzeArgs, "--markdown"]),
      analyzeJson: renderCommand("npx pathloom", [...analyzeArgs, "--json"]),
      bundle: renderCommand("npx pathloom", bundleArgs),
      snapshot: renderCommand("npx pathloom", snapshotArgs),
      feedback: renderCommand("npx pathloom", [
        "feedback",
        "--db",
        artifactPaths.dbPath,
        "--source",
        SOURCE_KEY,
        "--markdown",
      ]),
      diffLatest: renderCommand("npx pathloom", [
        "diff",
        "--db",
        artifactPaths.dbPath,
        "--source",
        SOURCE_KEY,
        "--markdown",
      ]),
    },
    artifacts: [
      {
        id: "events_ndjson",
        path: artifactPaths.logsPath,
        purpose: "Captured liquid-shadow invocation telemetry in Pathloom logfile format.",
      },
      {
        id: "tool_catalog",
        path: artifactPaths.catalogPath,
        purpose: "Authoritative tool catalog materialized from liquid-shadow schemas.",
      },
      {
        id: "sqlite_store",
        path: artifactPaths.dbPath,
        purpose: "Local Pathloom store used by import, analysis, snapshots, and feedback.",
      },
      {
        id: "import_summary",
        path: artifactPaths.importSummaryPath,
        purpose: "Readiness and ingestion summary returned by the public import command.",
      },
      {
        id: "terminal_report",
        path: artifactPaths.terminalReportPath,
        purpose: "Action-first terminal rendering from the public analyze command.",
      },
      {
        id: "markdown_report",
        path: artifactPaths.markdownPath,
        purpose: "Shareable Markdown report from the public analyze command.",
      },
      {
        id: "json_report",
        path: artifactPaths.jsonPath,
        purpose: "Stable machine-readable report from the public analyze command.",
      },
      {
        id: "bundle_dir",
        path: artifactPaths.bundleDir,
        purpose: "Distribution bundle containing share summary, Markdown, JSON, and manifest.",
      },
      {
        id: "feedback_markdown",
        path: artifactPaths.feedbackPath,
        purpose: "Snapshot-backed review targets and adjudications rendered in Markdown.",
      },
      {
        id: "snapshot_dir",
        path: artifactPaths.snapshotsDir,
        purpose: "Saved report snapshots and per-snapshot bundle outputs for later diffs.",
      },
      {
        id: "bundle_summary",
        path: artifactPaths.bundleSummaryPath,
        purpose: "Terminal summary returned by the bundle command.",
      },
      {
        id: "snapshot_summary",
        path: artifactPaths.snapshotSummaryPath,
        purpose:
          "Terminal summary returned by the snapshot command, including the stored snapshot key.",
      },
      {
        id: "manifest",
        path: artifactPaths.manifestPath,
        purpose: "Canonical map of commands, paths, and review surfaces for this dogfood run.",
      },
    ],
    bundleSummary: bundleSummary.stdout.trim(),
  };
}

function ensureIndexed(repoPath) {
  const probe = runTool("shadow_ops_context", {
    compact: true,
    repoPath,
  });

  if (probe.outcome === "success") {
    return;
  }

  const errorText =
    typeof probe.parsed === "string"
      ? probe.parsed
      : probe.rawOutput || probe.stderr || "Unknown liquid-shadow error.";

  if (errorText.includes("Repository not indexed yet")) {
    throw new Error(
      `Target repo is not indexed in liquid-shadow yet.\n\nRun this first from ${LIQUID_SHADOW_ROOT}:\n` +
        `node scripts/run-mcp-tool.mjs shadow_recon_onboard '{"repoPath":"${repoPath}"}'`,
    );
  }

  throw new Error(`Failed to probe liquid-shadow repo readiness: ${errorText}`);
}

function main() {
  const artifactPaths = createArtifactPaths(OUTPUT_ROOT);
  const serverVersion = readLiquidShadowVersion();
  const toolSchemas = loadSelectedToolSchemas();
  const schemaByTool = new Map(toolSchemas.map((tool) => [tool.name, tool.inputSchema || null]));
  const catalogEntries = buildCatalogEntries(toolSchemas, serverVersion);
  const inspectFilePath = path.join(TARGET_REPO, "src", "entry", "mcp", "server.ts");
  const sessions = buildScenarios(TARGET_REPO, inspectFilePath);
  const logEntries = [];
  let totalCalls = 0;

  resetArtifacts(artifactPaths);
  ensureIndexed(TARGET_REPO);

  for (const session of sessions) {
    for (let index = 0; index < session.steps.length; index += 1) {
      const step = session.steps[index];
      const toolResult = runTool(step.toolName, step.toolArgs);
      logEntries.push(
        createLogEntry({
          actorKey: session.actorKey,
          clientHint: session.clientHint,
          index,
          schemaByTool,
          serverVersion,
          sessionId: session.sessionId,
          step,
          toolResult,
        }),
      );
      totalCalls += 1;
    }
  }

  writeNdjson(artifactPaths.logsPath, logEntries);
  writeJson(artifactPaths.catalogPath, catalogEntries);

  const importResult = runPathloom(
    [
      "import",
      "--db",
      artifactPaths.dbPath,
      "--format",
      "logfile",
      "--input",
      artifactPaths.logsPath,
      "--catalog",
      artifactPaths.catalogPath,
      "--source",
      SOURCE_KEY,
      "--actor-privacy",
      "hashed",
      "--json",
    ],
    { expectJson: true },
  );
  writeJson(artifactPaths.importSummaryPath, importResult.parsed);

  const analyzeArgs = ["analyze", "--db", artifactPaths.dbPath, "--source", SOURCE_KEY];
  const terminalReport = runPathloom(analyzeArgs);
  const markdownReport = runPathloom([...analyzeArgs, "--markdown"]);
  const jsonReport = runPathloom([...analyzeArgs, "--json"], { expectJson: true });
  fs.writeFileSync(artifactPaths.terminalReportPath, terminalReport.stdout, "utf8");
  fs.writeFileSync(artifactPaths.markdownPath, markdownReport.stdout, "utf8");
  writeJson(artifactPaths.jsonPath, jsonReport.parsed);

  const bundleSummary = runPathloom([
    "bundle",
    "--db",
    artifactPaths.dbPath,
    "--source",
    SOURCE_KEY,
    "--output",
    artifactPaths.bundleDir,
  ]);
  fs.writeFileSync(artifactPaths.bundleSummaryPath, bundleSummary.stdout, "utf8");

  const snapshotSummary = runPathloom([
    "snapshot",
    "--db",
    artifactPaths.dbPath,
    "--source",
    SOURCE_KEY,
    "--label",
    DOGFOOD_LABEL,
    "--output",
    artifactPaths.snapshotsDir,
  ]);
  fs.writeFileSync(artifactPaths.snapshotSummaryPath, snapshotSummary.stdout, "utf8");

  const feedbackReport = runPathloom([
    "feedback",
    "--db",
    artifactPaths.dbPath,
    "--source",
    SOURCE_KEY,
    "--markdown",
  ]);
  fs.writeFileSync(artifactPaths.feedbackPath, feedbackReport.stdout, "utf8");

  const manifest = buildManifest({
    artifactPaths,
    bundleSummary,
    importPacket: importResult.parsed,
    logEntries,
    serverVersion,
    sessions,
    snapshotSummary,
    totalCalls,
  });
  writeJson(artifactPaths.manifestPath, manifest);

  process.stdout.write(
    [
      `Generated ${logEntries.length} invocation events across ${sessions.length} sessions.`,
      `Target repo: ${TARGET_REPO}`,
      `Dataset: ${artifactPaths.logsPath}`,
      `Catalog: ${artifactPaths.catalogPath}`,
      `SQLite store: ${artifactPaths.dbPath}`,
      `Markdown report: ${artifactPaths.markdownPath}`,
      `JSON report: ${artifactPaths.jsonPath}`,
      `Feedback review: ${artifactPaths.feedbackPath}`,
      `Bundle directory: ${artifactPaths.bundleDir}`,
      `Snapshot summary: ${artifactPaths.snapshotSummaryPath}`,
      `Manifest: ${artifactPaths.manifestPath}`,
      "",
      terminalReport.stdout.trim(),
    ].join("\n"),
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

export {
  buildCatalogEntries,
  buildManifest,
  createArtifactPaths,
  createLogEntry,
  extractSnapshotKey,
  requiredArguments,
};
