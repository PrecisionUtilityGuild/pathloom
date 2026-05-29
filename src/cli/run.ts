"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { PATHLOOM_PACKAGE_VERSION: version } = require("../version");
const { PathloomEngine } = require("@precisionutilityguild/pathloom/core");
const { LogfileAdapter } = require("@precisionutilityguild/pathloom/logfile");
const { OTelAdapter } = require("@precisionutilityguild/pathloom/otel");
const { evaluateReportGolden, runPathloomCheck, runPathloomCheckWithBadge, renderCheckSummary } =
  require("../check");
const {
  ADJUDICATION_STATUSES,
  PATHLOOM_ADJUDICATION_SCHEMA,
  PATHLOOM_CLI_SURFACE,
  validateCheckBadge,
  validateCheckResult,
  PATHLOOM_DISTRIBUTION_BUNDLE_SCHEMA,
  PATHLOOM_EVENT_SCHEMA,
  PATHLOOM_FEEDBACK_REVIEW_SCHEMA,
  PATHLOOM_FINDING_DEFINITIONS,
  PATHLOOM_HISTORY_DIFF_SCHEMA,
  PATHLOOM_REPORT_SCHEMA,
  PATHLOOM_REPORT_SNAPSHOT_SCHEMA,
} = require("@precisionutilityguild/pathloom/contracts");
const {
  createAdjudicationRecord,
  createFeedbackReview,
  renderAdjudicationSummary,
  renderJsonFeedbackReview,
  renderMarkdownFeedbackReview,
  renderTerminalFeedbackReview,
  resolveFeedbackTarget,
} = require("@precisionutilityguild/pathloom/feedback");
const {
  createHistoryDiff,
  createReportSnapshot,
  renderJsonHistoryDiff,
  renderMarkdownHistoryDiff,
  renderTerminalHistoryDiff,
  writeSnapshotBundle,
} = require("@precisionutilityguild/pathloom/history");
const {
  BUNDLE_MANIFEST_FILE,
  createDistributionBundle,
  createReportDocument,
  renderJsonReport,
  renderMarkdownReport,
  renderTerminalReport,
  writeDistributionBundle,
} = require("@precisionutilityguild/pathloom/report");

function createHelpText() {
  return [
    "Usage:",
    "  pathloom analyze [options]",
    "  pathloom check [options]",
    "  pathloom import [options]",
    "  pathloom bundle [options]",
    "  pathloom snapshot [options]",
    "  pathloom diff [options]",
    "  pathloom adjudicate [options]",
    "  pathloom feedback [options]",
    "  pathloom schema <event|report|bundle|snapshot|diff|adjudication|feedback|findings>",
    "  pathloom --version",
    "",
    "Options:",
    "  --actor-privacy <mode>   Actor privacy for imported data: hashed or pseudonymous",
    "  --calibration-only       Run only calibration-matrix gates (skip golden diff)",
    "  --catalog <path>         Path to a JSON tool catalog or listTools export",
    "  --current <snapshot-key>  Current snapshot key for history diff",
    "  --db, --database <path>   Path to the local Pathloom SQLite database",
    "  --format <type>          Import format: logfile or otel",
    "  --emit-badge             Emit pathloom_certify JSON after a passing check (check command)",
    "  --fail-fast              Stop on the first gate failure",
    "  --finding <id>            Finding id for adjudication",
    "  --golden <scenario|path> Run a single scenario gate, or diff a report against an expected JSON file (requires --db and --source)",
    "  --input <path>           Input file for import commands (JSON or NDJSON)",
    "  --item <label>            Human-readable item label for a finding target",
    "  --label <text>            Human-readable label for saved snapshots",
    "  --note <text>             Free-form local note for adjudication",
    "  --output <dir>            Output directory for distribution bundles",
    "  --previous <snapshot-key> Baseline snapshot key for history diff",
    "  --snapshot <snapshot-key> Snapshot key for feedback or adjudication",
    "  --source <key>            Dataset source key to analyze",
    `  --status <value>          Adjudication status: ${ADJUDICATION_STATUSES.join(", ")}`,
    "  --target <id>             Exact feedback target id for adjudication",
    "  --json                    Render machine-readable JSON",
    "  --json-summary           Emit pathloom check results as JSON (check command)",
    "  --markdown                Render a Markdown report",
    "  --version                 Print the stable CLI/package version",
    "  --help                    Show this help text",
    "",
  ].join("\n");
}

const FLAG_OPTIONS = Object.freeze({
  "--help": { key: "help", value: true },
  "--json": { key: "format", value: "json" },
  "--json-summary": { key: "jsonSummary", value: true },
  "--markdown": { key: "format", value: "markdown" },
  "--version": { key: "version", value: true },
  "--calibration-only": { key: "calibrationOnly", value: true },
  "--emit-badge": { key: "emitBadge", value: true },
  "--fail-fast": { key: "failFast", value: true },
});

const VALUE_OPTIONS = Object.freeze({
  "--actor-privacy": "actorPrivacy",
  "--catalog": "catalogPath",
  "--current": "currentSnapshotKey",
  "--database": "databasePath",
  "--db": "databasePath",
  "--finding": "findingId",
  "--format": "importFormat",
  "--golden": "goldenScenario",
  "--input": "inputPath",
  "--item": "itemLabel",
  "--label": "label",
  "--note": "note",
  "--output": "outputDir",
  "--previous": "previousSnapshotKey",
  "--snapshot": "snapshotKey",
  "--source": "sourceKey",
  "--status": "adjudicationStatus",
  "--target": "targetId",
});

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    adjudicationStatus: null,
    actorPrivacy: null,
    calibrationOnly: false,
    catalogPath: null,
    command: null,
    currentSnapshotKey: null,
    databasePath: null,
    emitBadge: false,
    findingId: null,
    importFormat: null,
    inputPath: null,
    failFast: false,
    format: "terminal",
    goldenScenario: null,
    help: false,
    jsonSummary: false,
    itemLabel: null,
    label: null,
    note: null,
    outputDir: null,
    previousSnapshotKey: null,
    schemaSubject: null,
    snapshotKey: null,
    sourceKey: null,
    targetId: null,
    version: false,
  };

  if (args.length === 0) {
    parsed.help = true;
    return parsed;
  }

  if (args[0] === "--version") {
    parsed.version = true;
    return parsed;
  }

  parsed.command = args[0];

  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];
    const flagOption = FLAG_OPTIONS[token];

    if (flagOption) {
      parsed[flagOption.key] = flagOption.value;
      continue;
    }

    if (Object.hasOwn(VALUE_OPTIONS, token)) {
      index += 1;
      parsed[VALUE_OPTIONS[token]] = args[index] || null;
      continue;
    }

    if (parsed.command === "schema" && parsed.schemaSubject == null) {
      parsed.schemaSubject = token;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return parsed;
}

function renderDocument(document, format) {
  if (format === "json") {
    return renderJsonReport(document);
  }

  if (format === "markdown") {
    return renderMarkdownReport(document);
  }

  return renderTerminalReport(document);
}

function getSchemaDocument(subject) {
  if (subject === "event") {
    return PATHLOOM_EVENT_SCHEMA;
  }

  if (subject === "report") {
    return PATHLOOM_REPORT_SCHEMA;
  }

  if (subject === "bundle") {
    return PATHLOOM_DISTRIBUTION_BUNDLE_SCHEMA;
  }

  if (subject === "snapshot") {
    return PATHLOOM_REPORT_SNAPSHOT_SCHEMA;
  }

  if (subject === "diff") {
    return PATHLOOM_HISTORY_DIFF_SCHEMA;
  }

  if (subject === "adjudication") {
    return PATHLOOM_ADJUDICATION_SCHEMA;
  }

  if (subject === "feedback") {
    return PATHLOOM_FEEDBACK_REVIEW_SCHEMA;
  }

  if (subject === "findings") {
    return {
      definitions: PATHLOOM_FINDING_DEFINITIONS,
      version: PATHLOOM_CLI_SURFACE.version,
    };
  }

  throw new Error(`Unknown schema subject: ${subject}`);
}

function createEngine(parsed) {
  return new PathloomEngine({
    storeOptions: parsed.databasePath ? { filename: parsed.databasePath } : undefined,
  });
}

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse ${label} JSON at ${filePath}: ${error.message}`);
  }
}

function normalizeCatalogEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new Error("Catalog JSON must be an array.");
  }

  return entries.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("Catalog entries must be objects.");
    }

    if (typeof entry.toolName === "string" && entry.toolName.length > 0) {
      return {
        schema: entry.schema || null,
        schemaSource: entry.schemaSource || "explicit_manifest",
        serverId: entry.serverId || "unknown-server",
        serverVersion: entry.serverVersion || "0.0.0",
        toolName: entry.toolName,
      };
    }

    if (typeof entry.name === "string" && entry.name.length > 0) {
      return {
        schema: entry.inputSchema || entry.schema || null,
        schemaSource: "explicit_manifest",
        serverId: entry.serverId || "unknown-server",
        serverVersion: entry.serverVersion || "0.0.0",
        toolName: entry.name,
      };
    }

    throw new Error("Catalog entries must include either toolName or name.");
  });
}

function createImportAdapter(parsed) {
  if (!parsed.importFormat || !["logfile", "otel"].includes(parsed.importFormat)) {
    throw new Error("Import command requires --format <logfile|otel>.");
  }

  if (!parsed.inputPath) {
    throw new Error("Import command requires --input <path>.");
  }

  if (parsed.actorPrivacy && !["hashed", "pseudonymous"].includes(parsed.actorPrivacy)) {
    throw new Error("Import command only supports --actor-privacy hashed or pseudonymous.");
  }

  const toolCatalog = parsed.catalogPath
    ? normalizeCatalogEntries(readJsonFile(parsed.catalogPath, "catalog"))
    : [];

  const adapterOptions = {
    actorPrivacy: parsed.actorPrivacy || undefined,
    filePath: parsed.inputPath,
    sourceKey: parsed.sourceKey || undefined,
    toolCatalog,
  };

  if (parsed.importFormat === "otel") {
    return {
      adapter: new OTelAdapter(adapterOptions),
      sourceKind: "otel",
    };
  }

  return {
    adapter: new LogfileAdapter(adapterOptions),
    sourceKind: "logfile",
  };
}

function renderImportSummary(packet, format) {
  if (format === "json") {
    return `${JSON.stringify(packet, null, 2)}\n`;
  }

  const lines = [
    `Pathloom import completed for ${packet.sourceKey}`,
    `Format: ${packet.sourceKind}`,
    `Events imported: ${packet.eventCount}`,
    `Catalog tools: ${packet.toolCatalogSize}`,
    `Readiness: ${packet.readiness}`,
    `Telemetry: sessions ${packet.telemetrySpine.sessionization}; trace ${packet.telemetrySpine.traceIdentity}; span lineage ${packet.telemetrySpine.spanLineage}`,
  ];

  if (packet.databasePath) {
    lines.push(`Database: ${packet.databasePath}`);
  }

  if (packet.eligibleFindings.length > 0) {
    lines.push(`Eligible findings: ${packet.eligibleFindings.join(", ")}`);
  }

  if (packet.narrowedFindings.length > 0) {
    lines.push(`Narrowed findings: ${packet.narrowedFindings.join(", ")}`);
  }

  if (packet.suppressedFindings.length > 0) {
    lines.push(`Suppressed findings: ${packet.suppressedFindings.join(", ")}`);
  }

  return `${lines.join("\n")}\n`;
}

function analyzeDocument(parsed) {
  const engine = createEngine(parsed);
  const analysis = engine.analyze({
    sourceKey: parsed.sourceKey || undefined,
  });

  return {
    document: createReportDocument(analysis),
    engine,
  };
}

function renderBundleWriteSummary(bundle, outputDir) {
  const lines = [
    `Pathloom bundle written to ${outputDir}`,
    bundle.summary.headline,
    "",
    `Share summary: ${path.join(outputDir, "share-summary.md")}`,
    `Markdown report: ${path.join(outputDir, "report.md")}`,
    `JSON report: ${path.join(outputDir, "report.json")}`,
    `Bundle manifest: ${path.join(outputDir, BUNDLE_MANIFEST_FILE)}`,
  ];

  return `${lines.join("\n")}\n`;
}

function renderDiff(diff, format) {
  if (format === "json") {
    return renderJsonHistoryDiff(diff);
  }

  if (format === "markdown") {
    return renderMarkdownHistoryDiff(diff);
  }

  return renderTerminalHistoryDiff(diff);
}

function renderFeedback(review, format) {
  if (format === "json") {
    return renderJsonFeedbackReview(review);
  }

  if (format === "markdown") {
    return renderMarkdownFeedbackReview(review);
  }

  return renderTerminalFeedbackReview(review);
}

function renderSnapshotSummary(snapshot, bundleWrite) {
  const lines = [
    `Pathloom snapshot saved: ${snapshot.snapshotKey}`,
    `Source: ${snapshot.sourceKey}`,
    `Captured: ${snapshot.capturedAt}`,
  ];

  if (snapshot.label) {
    lines.push(`Label: ${snapshot.label}`);
  }

  lines.push(
    `Ready findings: ${snapshot.summary.readyFindingCount}  Clear findings: ${snapshot.summary.clearFindingCount}  Suppressed findings: ${snapshot.summary.suppressedFindingCount}`,
  );

  if (bundleWrite) {
    lines.push(`Bundle directory: ${bundleWrite.outputDir}`);
    lines.push(`Bundle manifest: ${bundleWrite.manifestPath}`);
  }

  return `${lines.join("\n")}\n`;
}

function inferSnapshotsForDiff(store, parsed) {
  if (parsed.currentSnapshotKey && parsed.previousSnapshotKey) {
    const current = store.getReportSnapshot(parsed.currentSnapshotKey);
    const previous = store.getReportSnapshot(parsed.previousSnapshotKey);

    if (!current) {
      throw new Error(`Unknown snapshot: ${parsed.currentSnapshotKey}`);
    }

    if (!previous) {
      throw new Error(`Unknown snapshot: ${parsed.previousSnapshotKey}`);
    }

    return {
      current,
      previous,
    };
  }

  let sourceKey = parsed.sourceKey;
  let snapshots = null;

  if (parsed.currentSnapshotKey) {
    const current = store.getReportSnapshot(parsed.currentSnapshotKey);
    if (!current) {
      throw new Error(`Unknown snapshot: ${parsed.currentSnapshotKey}`);
    }

    sourceKey = sourceKey || current.sourceKey;
    snapshots = store.listReportSnapshots(sourceKey);
    const currentIndex = snapshots.findIndex(
      (snapshot) => snapshot.snapshotKey === current.snapshotKey,
    );

    if (currentIndex === -1 || currentIndex === snapshots.length - 1) {
      throw new Error(
        `No baseline snapshot exists before ${current.snapshotKey} for source ${sourceKey}.`,
      );
    }

    return {
      current,
      previous: snapshots[currentIndex + 1],
    };
  }

  if (parsed.previousSnapshotKey) {
    const previous = store.getReportSnapshot(parsed.previousSnapshotKey);
    if (!previous) {
      throw new Error(`Unknown snapshot: ${parsed.previousSnapshotKey}`);
    }

    sourceKey = sourceKey || previous.sourceKey;
    snapshots = store.listReportSnapshots(sourceKey);
    const previousIndex = snapshots.findIndex(
      (snapshot) => snapshot.snapshotKey === previous.snapshotKey,
    );

    if (previousIndex <= 0) {
      throw new Error(
        `No newer snapshot exists after ${previous.snapshotKey} for source ${sourceKey}.`,
      );
    }

    return {
      current: snapshots[previousIndex - 1],
      previous,
    };
  }

  if (!sourceKey) {
    throw new Error(
      "Diff command requires --source <key> or explicit --current/--previous snapshot keys.",
    );
  }

  snapshots = store.listReportSnapshots(sourceKey);
  if (snapshots.length < 2) {
    throw new Error(
      `Need at least two snapshots for ${sourceKey} before Pathloom can render a diff.`,
    );
  }

  return {
    current: snapshots[0],
    previous: snapshots[1],
  };
}

function resolveSnapshotForFeedback(store, parsed) {
  if (parsed.snapshotKey) {
    const snapshot = store.getReportSnapshot(parsed.snapshotKey);
    if (!snapshot) {
      throw new Error(`Unknown snapshot: ${parsed.snapshotKey}`);
    }

    return snapshot;
  }

  if (!parsed.sourceKey) {
    throw new Error("Feedback commands require --snapshot <key> or --source <key>.");
  }

  const snapshots = store.listReportSnapshots(parsed.sourceKey);
  if (snapshots.length === 0) {
    throw new Error(
      `No snapshots are stored for ${parsed.sourceKey}. Save one with pathloom snapshot before recording feedback.`,
    );
  }

  return snapshots[0];
}

function runCli(argv, io = process) {
  const parsed = parseArgs(argv);

  if (parsed.version) {
    io.stdout.write(`${version}\n`);
    return 0;
  }

  if (parsed.help || parsed.command == null) {
    io.stdout.write(createHelpText());
    return 0;
  }

  if (parsed.command === "check") {
    const goldenLooksLikeFile =
      typeof parsed.goldenScenario === "string" &&
      parsed.goldenScenario.length > 0 &&
      fs.existsSync(parsed.goldenScenario);

    if (goldenLooksLikeFile) {
      if (!parsed.databasePath) {
        throw new Error("Report golden check requires --db <path>.");
      }
      if (!parsed.sourceKey) {
        throw new Error("Report golden check requires --source <key>.");
      }

      const gate = evaluateReportGolden({
        databasePath: parsed.databasePath,
        expectedPath: parsed.goldenScenario,
        sourceKey: parsed.sourceKey,
      });

      const result = {
        checkVersion: "1.0",
        exitCode: gate.passed ? 0 : 1,
        passed: gate.passed,
        summary: {
          gateCount: 1,
          failureCount: gate.passed ? 0 : 1,
          passedGateCount: gate.passed ? 1 : 0,
        },
        gates: [gate],
        failures: gate.passed ? [] : [{ gate: gate.gate, scenario: gate.scenario, violations: gate.violations }],
      };

      const validation = validateCheckResult(result);
      if (!validation.valid) {
        throw new Error(`Internal check result contract violation: ${validation.errors.join("; ")}`);
      }

      const format = parsed.jsonSummary ? "json" : "terminal";
      io.stdout.write(renderCheckSummary(result, format));
      return result.exitCode;
    }

    const checkOptions = {
      calibrationOnly: parsed.calibrationOnly,
      failFast: parsed.failFast,
      goldenScenario: parsed.goldenScenario,
    };

    if (parsed.emitBadge) {
      const { badge, check } = runPathloomCheckWithBadge(checkOptions);
      const checkValidation = validateCheckResult(check);
      const badgeValidation = validateCheckBadge(badge);

      if (!checkValidation.valid) {
        throw new Error(`Internal check result contract violation: ${checkValidation.errors.join("; ")}`);
      }

      if (!badgeValidation.valid) {
        throw new Error(`Internal check badge contract violation: ${badgeValidation.errors.join("; ")}`);
      }

      if (!check.passed) {
        const format = parsed.jsonSummary ? "json" : "terminal";
        io.stdout.write(renderCheckSummary(check, format));
        return check.exitCode;
      }

      io.stdout.write(`${JSON.stringify(badge, null, 2)}\n`);
      return 0;
    }

    const result = runPathloomCheck(checkOptions);
    const validation = validateCheckResult(result);
    if (!validation.valid) {
      throw new Error(`Internal check result contract violation: ${validation.errors.join("; ")}`);
    }

    const format = parsed.jsonSummary ? "json" : "terminal";
    io.stdout.write(renderCheckSummary(result, format));
    return result.exitCode;
  }

  if (parsed.command === "schema") {
    if (!parsed.schemaSubject) {
      throw new Error(
        "Schema command requires one of: event, report, bundle, snapshot, diff, adjudication, feedback, findings.",
      );
    }

    io.stdout.write(`${JSON.stringify(getSchemaDocument(parsed.schemaSubject), null, 2)}\n`);
    return 0;
  }

  if (
    parsed.command !== "analyze" &&
    parsed.command !== "check" &&
    parsed.command !== "import" &&
    parsed.command !== "bundle" &&
    parsed.command !== "snapshot" &&
    parsed.command !== "diff" &&
    parsed.command !== "adjudicate" &&
    parsed.command !== "feedback"
  ) {
    throw new Error(`Unknown command: ${parsed.command}`);
  }

  if (parsed.command === "diff") {
    const store = createEngine(parsed).store;
    const { current, previous } = inferSnapshotsForDiff(store, parsed);
    const diff = createHistoryDiff(previous, current);
    io.stdout.write(renderDiff(diff, parsed.format));
    return 0;
  }

  if (parsed.command === "feedback") {
    const store = createEngine(parsed).store;
    const snapshot = resolveSnapshotForFeedback(store, parsed);
    const review = createFeedbackReview(snapshot, store.listAdjudications(snapshot.snapshotKey), {
      historicalAdjudications: store.listAdjudicationsForSource(snapshot.sourceKey),
    });
    io.stdout.write(renderFeedback(review, parsed.format));
    return 0;
  }

  if (parsed.command === "adjudicate") {
    if (!ADJUDICATION_STATUSES.includes(parsed.adjudicationStatus)) {
      throw new Error(`Adjudicate command requires --status <${ADJUDICATION_STATUSES.join("|")}>.`);
    }

    const store = createEngine(parsed).store;
    const snapshot = resolveSnapshotForFeedback(store, parsed);
    const target = resolveFeedbackTarget(snapshot, {
      findingId: parsed.findingId,
      itemLabel: parsed.itemLabel,
      targetId: parsed.targetId,
    });
    const record = createAdjudicationRecord(snapshot, target, {
      adjudicationStatus: parsed.adjudicationStatus,
      note: parsed.note,
    });
    const saved = store.saveAdjudication(record);
    io.stdout.write(renderAdjudicationSummary(saved));
    return 0;
  }

  if (parsed.command === "import") {
    const engine = createEngine(parsed);
    const { adapter, sourceKind } = createImportAdapter(parsed);
    const materialized = adapter.materialize({
      sourceKey: parsed.sourceKey || undefined,
      store: engine.store,
    });
    const dataset = engine.store.getDataset(materialized.sourceKey);
    const packet = {
      databasePath: parsed.databasePath || engine.store.filename,
      eligibleFindings: dataset?.readiness?.eligibleFindings || [],
      eventCount: materialized.eventCount || 0,
      narrowedFindings: dataset?.readiness?.narrowedFindings || [],
      readiness: dataset?.readiness?.readiness || "minimal",
      sourceKey: materialized.sourceKey,
      sourceKind,
      suppressedFindings: dataset?.readiness?.suppressedFindings || [],
      telemetrySpine: {
        sessionization: dataset?.profile?.provenance?.sessionization || "none",
        ...(dataset?.profile?.telemetrySpine || {}),
      },
      toolCatalogSize: engine.store.listToolCatalog(materialized.sourceKey).length,
    };
    io.stdout.write(renderImportSummary(packet, parsed.format));
    return 0;
  }

  const { document, engine } = analyzeDocument(parsed);

  if (parsed.command === "bundle") {
    if (!parsed.outputDir) {
      throw new Error("Bundle command requires --output <dir>.");
    }

    const bundle = createDistributionBundle(document);
    writeDistributionBundle(bundle, parsed.outputDir);
    io.stdout.write(renderBundleWriteSummary(bundle, parsed.outputDir));
    return 0;
  }

  if (parsed.command === "snapshot") {
    const snapshot = createReportSnapshot(document, {
      label: parsed.label,
    });
    const savedSnapshot = engine.store.saveReportSnapshot(snapshot);
    const bundleWrite = parsed.outputDir
      ? writeSnapshotBundle(savedSnapshot, parsed.outputDir)
      : null;
    io.stdout.write(renderSnapshotSummary(savedSnapshot, bundleWrite));
    return 0;
  }

  io.stdout.write(renderDocument(document, parsed.format));
  return 0;
}

export { createHelpText, getSchemaDocument, parseArgs, runCli };
