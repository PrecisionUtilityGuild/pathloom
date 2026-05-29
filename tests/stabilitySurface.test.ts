"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const pathloom = require("..");
const contracts = require("@precisionutilityguild/pathloom/contracts");
const { PathloomStore } = require("@precisionutilityguild/pathloom/core");
const { createReportDocument } = require("@precisionutilityguild/pathloom/report");
const { seedReadyDataset } = require("./helpers/reportSeed.js");
const { resolveRepoRoot } = require("./helpers/testkit.js");

const REPO_ROOT = resolveRepoRoot();

test("root package exports the stable contract surface", () => {
  assert.equal(typeof pathloom.PathloomEngine, "function");
  assert.equal(typeof pathloom.createFindingUncertainty, "function");
  assert.equal(typeof pathloom.withPathloom, "function");
  assert.equal(pathloom.PATHLOOM_ADJUDICATION_SCHEMA_VERSION, "1.0");
  assert.equal(pathloom.PATHLOOM_DISTRIBUTION_BUNDLE_SCHEMA_VERSION, "1.0");
  assert.equal(pathloom.PATHLOOM_EVENT_SCHEMA_VERSION, "1.0");
  assert.equal(pathloom.PATHLOOM_FEEDBACK_REVIEW_SCHEMA_VERSION, "1.1");
  assert.equal(pathloom.PATHLOOM_HISTORY_DIFF_SCHEMA_VERSION, "1.0");
  assert.equal(pathloom.PATHLOOM_REPORT_SCHEMA_VERSION, "1.0");
  assert.equal(pathloom.PATHLOOM_REPORT_SNAPSHOT_SCHEMA_VERSION, "1.0");
  assert.equal(typeof pathloom.validateAdjudicationRecord, "function");
  assert.equal(typeof pathloom.validateDistributionBundle, "function");
  assert.equal(typeof pathloom.validateFeedbackReview, "function");
  assert.equal(typeof pathloom.validateHistoryDiff, "function");
  assert.equal(typeof pathloom.validateNormalizedEvent, "function");
  assert.equal(typeof pathloom.validateReportDocument, "function");
  assert.equal(typeof pathloom.validateReportSnapshot, "function");
  assert.equal(typeof pathloom.validateCheckResult, "function");
  assert.equal(typeof pathloom.validateCheckBadge, "function");
});

test("stable contracts module exposes event, report, and findings definitions", () => {
  assert.equal(contracts.PATHLOOM_ADJUDICATION_SCHEMA.kind, "adjudication_record");
  assert.equal(contracts.PATHLOOM_DISTRIBUTION_BUNDLE_SCHEMA.kind, "distribution_bundle");
  assert.equal(contracts.PATHLOOM_EVENT_SCHEMA.kind, "normalized_event");
  assert.equal(contracts.PATHLOOM_FEEDBACK_REVIEW_SCHEMA.kind, "feedback_review");
  assert.equal(contracts.PATHLOOM_HISTORY_DIFF_SCHEMA.kind, "history_diff");
  assert.equal(contracts.PATHLOOM_REPORT_SCHEMA.kind, "report_document");
  assert.equal(contracts.PATHLOOM_REPORT_SNAPSHOT_SCHEMA.kind, "report_snapshot");
  assert.ok(contracts.PATHLOOM_FINDING_DEFINITIONS.activation_tool_report);
});

test("normalized events loaded from the store satisfy the stable event contract", () => {
  const seeded = seedReadyDataset("stability-event");
  const store = new PathloomStore({ filename: seeded.filename });
  const events = store.listInvocationEvents(seeded.sourceKey);
  const validation = contracts.validateNormalizedEvent(events[0]);

  assert.equal(validation.valid, true);

  store.close();
});

test("shared report documents satisfy the stable report contract", () => {
  const seeded = seedReadyDataset("stability-report");
  const store = new PathloomStore({ filename: seeded.filename });
  const { PathloomEngine } = require("@precisionutilityguild/pathloom/core");
  const engine = new PathloomEngine({ store });
  const report = createReportDocument(engine.analyze({ sourceKey: seeded.sourceKey }));
  const validation = contracts.validateReportDocument(report);

  assert.equal(validation.valid, true);

  store.close();
});

test("distribution bundles satisfy the stable bundle contract", () => {
  const seeded = seedReadyDataset("stability-bundle");
  const store = new PathloomStore({ filename: seeded.filename });
  const { PathloomEngine } = require("@precisionutilityguild/pathloom/core");
  const { createDistributionBundle } = require("@precisionutilityguild/pathloom/report");
  const engine = new PathloomEngine({ store });
  const report = createReportDocument(engine.analyze({ sourceKey: seeded.sourceKey }));
  const bundle = createDistributionBundle(report);
  const validation = contracts.validateDistributionBundle(bundle);

  assert.equal(validation.valid, true);

  store.close();
});

test("report snapshots and history diffs satisfy their stable contracts", () => {
  const seeded = seedReadyDataset("stability-history");
  const store = new PathloomStore({ filename: seeded.filename });
  const { PathloomEngine, createHistoryDiff, createReportSnapshot } = require("@precisionutilityguild/pathloom/core");
  const engine = new PathloomEngine({ store });
  const report = createReportDocument(engine.analyze({ sourceKey: seeded.sourceKey }));
  const baseline = createReportSnapshot(report, {
    capturedAt: "2026-05-24T09:00:00.000Z",
    snapshotKey: `${seeded.sourceKey}@20260524T090000Z`,
  });
  const current = createReportSnapshot(report, {
    capturedAt: "2026-05-24T10:00:00.000Z",
    snapshotKey: `${seeded.sourceKey}@20260524T100000Z`,
  });
  const snapshotValidation = contracts.validateReportSnapshot(baseline);
  const diffValidation = contracts.validateHistoryDiff(createHistoryDiff(baseline, current));

  assert.equal(snapshotValidation.valid, true);
  assert.equal(diffValidation.valid, true);

  store.close();
});

test("adjudication records and feedback reviews satisfy their stable contracts", () => {
  const seeded = seedReadyDataset("stability-feedback");
  const store = new PathloomStore({ filename: seeded.filename });
  const {
    PathloomEngine,
    createAdjudicationRecord,
    createFeedbackReview,
    createReportSnapshot,
    resolveFeedbackTarget,
  } = require("@precisionutilityguild/pathloom/core");
  const engine = new PathloomEngine({ store });
  const report = createReportDocument(engine.analyze({ sourceKey: seeded.sourceKey }));
  const snapshot = store.saveReportSnapshot(
    createReportSnapshot(report, {
      capturedAt: "2026-05-24T12:00:00.000Z",
      snapshotKey: `${seeded.sourceKey}@20260524T120000000Z`,
    }),
  );
  const target = resolveFeedbackTarget(snapshot, {
    findingId: "dead_tool_detection",
    itemLabel: "delete_record",
  });
  const record = createAdjudicationRecord(snapshot, target, {
    adjudicationStatus: "accepted",
    note: "Confirmed locally.",
  });
  const review = createFeedbackReview(snapshot, [record]);

  assert.equal(contracts.validateAdjudicationRecord(record).valid, true);
  assert.equal(contracts.validateFeedbackReview(review).valid, true);

  store.close();
});

test("CLI exposes version and stable schema commands", () => {
  const version = execFileSync(process.execPath, ["dist/bin/pathloom.js", "--version"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
  const eventSchema = JSON.parse(
    execFileSync(process.execPath, ["dist/bin/pathloom.js", "schema", "event"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }),
  );
  const reportSchema = JSON.parse(
    execFileSync(process.execPath, ["dist/bin/pathloom.js", "schema", "report"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }),
  );
  const bundleSchema = JSON.parse(
    execFileSync(process.execPath, ["dist/bin/pathloom.js", "schema", "bundle"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }),
  );
  const snapshotSchema = JSON.parse(
    execFileSync(process.execPath, ["dist/bin/pathloom.js", "schema", "snapshot"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }),
  );
  const diffSchema = JSON.parse(
    execFileSync(process.execPath, ["dist/bin/pathloom.js", "schema", "diff"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }),
  );
  const adjudicationSchema = JSON.parse(
    execFileSync(process.execPath, ["dist/bin/pathloom.js", "schema", "adjudication"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }),
  );
  const feedbackSchema = JSON.parse(
    execFileSync(process.execPath, ["dist/bin/pathloom.js", "schema", "feedback"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }),
  );

  assert.equal(adjudicationSchema.version, "1.0");
  assert.equal(version, "1.0.0");
  assert.equal(bundleSchema.version, "1.0");
  assert.equal(diffSchema.version, "1.0");
  assert.equal(eventSchema.version, "1.0");
  assert.equal(feedbackSchema.version, "1.1");
  assert.equal(reportSchema.version, "1.0");
  assert.equal(snapshotSchema.version, "1.0");
});

test("CLI supports schema subject positionals and the --database alias", () => {
  const seeded = seedReadyDataset("stability-cli-alias");
  const eventSchema = JSON.parse(
    execFileSync(process.execPath, ["dist/bin/pathloom.js", "schema", "event"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }),
  );
  const output = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "dist/bin/pathloom.js",
        "analyze",
        "--database",
        seeded.filename,
        "--source",
        seeded.sourceKey,
        "--json",
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
      },
    ),
  );

  assert.equal(eventSchema.kind, "normalized_event");
  assert.equal(output.sourceKey, seeded.sourceKey);
  assert.equal(output.summary.readyFindingCount, 6);
});
