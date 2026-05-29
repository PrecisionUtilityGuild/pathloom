"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const {
  PathloomEngine,
  PathloomStore,
  buildFeedbackPolicyId,
  createAdjudicationRecord,
  createFeedbackReview,
  createReportSnapshot,
  resolveFeedbackTarget,
} = require("@precisionutilityguild/pathloom/core");
const { validateFeedbackReview } = require("@precisionutilityguild/pathloom/contracts");
const { createReportDocument } = require("@precisionutilityguild/pathloom/report");
const { seedReadyDataset } = require("./helpers/reportSeed.js");
const { resolveRepoRoot } = require("./helpers/testkit.js");

const REPO_ROOT = resolveRepoRoot();

function buildSavedSnapshot(label) {
  const seeded = seedReadyDataset(label);
  const store = new PathloomStore({ filename: seeded.filename });
  const engine = new PathloomEngine({ store });
  const document = createReportDocument(engine.analyze({ sourceKey: seeded.sourceKey }));
  const snapshot = store.saveReportSnapshot(
    createReportSnapshot(document, {
      capturedAt: "2026-05-24T12:00:00.000Z",
      label,
    }),
  );

  return {
    seeded,
    snapshot,
    store,
  };
}

function saveSnapshotAt(store, seeded, label, capturedAt) {
  const engine = new PathloomEngine({ store });
  const document = createReportDocument(engine.analyze({ sourceKey: seeded.sourceKey }));

  return store.saveReportSnapshot(
    createReportSnapshot(document, {
      capturedAt,
      label,
    }),
  );
}

test("PathloomStore saves and updates adjudications per snapshot target", () => {
  const { snapshot, store } = buildSavedSnapshot("feedback-store");
  const target = resolveFeedbackTarget(snapshot, {
    findingId: "dead_tool_detection",
    itemLabel: "delete_record",
  });

  store.saveAdjudication(
    createAdjudicationRecord(snapshot, target, {
      adjudicationStatus: "accepted",
      note: "Confirmed against the live catalog.",
      timestamp: "2026-05-24T12:05:00.000Z",
    }),
  );
  store.saveAdjudication(
    createAdjudicationRecord(snapshot, target, {
      adjudicationStatus: "misleading",
      note: "Catalog no longer reflects the public surface.",
      timestamp: "2026-05-24T12:10:00.000Z",
    }),
  );

  const adjudications = store.listAdjudications(snapshot.snapshotKey);

  assert.equal(adjudications.length, 1);
  assert.equal(adjudications[0].adjudicationStatus, "misleading");
  assert.match(adjudications[0].note, /public surface/);

  store.close();
});

test("feedback review exposes stable targets and recorded adjudication counts", () => {
  const { snapshot, store } = buildSavedSnapshot("feedback-review");
  const activeTarget = resolveFeedbackTarget(snapshot, {
    findingId: "sequence_risk_map",
    itemLabel: "search -> create",
  });
  const suppressedTarget = resolveFeedbackTarget(snapshot, {
    targetId: "dead_tool_detection::delete_record::dead",
  });

  store.saveAdjudication(
    createAdjudicationRecord(snapshot, activeTarget, {
      adjudicationStatus: "accepted",
      note: "Matches recent on-call incidents.",
    }),
  );
  store.saveAdjudication(
    createAdjudicationRecord(snapshot, suppressedTarget, {
      adjudicationStatus: "missing_context",
      note: "Need a fresh catalog sync before acting.",
    }),
  );

  const review = createFeedbackReview(snapshot, store.listAdjudications(snapshot.snapshotKey));

  assert.ok(review.targets.some((target) => target.targetId === activeTarget.targetId));
  assert.equal(review.summary.acceptedCount, 1);
  assert.equal(review.summary.missingContextCount, 1);
  assert.ok(review.summary.unreviewedCount > 0);

  store.close();
});

test("feedback review summarizes recurring adjudication patterns and recommends the next review", () => {
  const seeded = seedReadyDataset("feedback-learning-loop");
  const store = new PathloomStore({ filename: seeded.filename });
  const priorSnapshot = saveSnapshotAt(store, seeded, "prior", "2026-05-24T12:00:00.000Z");
  const currentSnapshot = saveSnapshotAt(store, seeded, "current", "2026-05-24T13:00:00.000Z");

  const priorTarget = resolveFeedbackTarget(priorSnapshot, {
    findingId: "dead_tool_detection",
    itemLabel: "delete_record",
  });
  const currentTarget = resolveFeedbackTarget(currentSnapshot, {
    findingId: "dead_tool_detection",
    itemLabel: "delete_record",
  });
  const sequenceTarget = resolveFeedbackTarget(currentSnapshot, {
    findingId: "sequence_risk_map",
    itemLabel: "search -> create",
  });

  store.saveAdjudication(
    createAdjudicationRecord(priorSnapshot, priorTarget, {
      adjudicationStatus: "misleading",
      note: "Catalog drift made this too strong.",
      timestamp: "2026-05-24T12:05:00.000Z",
    }),
  );
  store.saveAdjudication(
    createAdjudicationRecord(currentSnapshot, currentTarget, {
      adjudicationStatus: "misleading",
      note: "Still too strong without a fresh catalog read.",
      timestamp: "2026-05-24T13:05:00.000Z",
    }),
  );
  store.saveAdjudication(
    createAdjudicationRecord(priorSnapshot, sequenceTarget, {
      adjudicationStatus: "accepted",
      note: "Good incident anchor.",
      timestamp: "2026-05-24T12:10:00.000Z",
    }),
  );

  const review = createFeedbackReview(
    currentSnapshot,
    store.listAdjudications(currentSnapshot.snapshotKey),
    {
      historicalAdjudications: store.listAdjudicationsForSource(currentSnapshot.sourceKey),
    },
  );

  assert.equal(review.summary.historicalAdjudicationCount, 3);
  assert.equal(review.summary.historicalSnapshotCount, 2);
  assert.ok(
    review.learningLoop.patterns.some(
      (pattern) =>
        pattern.findingId === "dead_tool_detection" &&
        pattern.status === "misleading" &&
        pattern.count === 2,
    ),
  );
  assert.ok(
    review.learningLoop.wordingHints.some((hint) => hint.findingId === "dead_tool_detection"),
  );
  const misleadingPolicy = review.learningLoop.policySuggestions.find(
    (policy) =>
      policy.findingId === "dead_tool_detection" && policy.adjudicationStatus === "misleading",
  );
  assert.ok(misleadingPolicy);
  assert.equal(
    misleadingPolicy.policyId,
    buildFeedbackPolicyId("dead_tool_detection", "wording_adjustment", "misleading"),
  );
  assert.equal(misleadingPolicy.policyKind, "wording_adjustment");
  assert.equal(misleadingPolicy.appliesTo, "feedback_review_only");
  assert.equal(misleadingPolicy.reversible, true);
  assert.equal(misleadingPolicy.adjudicationCount, 2);
  const reviewAgain = createFeedbackReview(
    currentSnapshot,
    store.listAdjudications(currentSnapshot.snapshotKey),
    {
      historicalAdjudications: store.listAdjudicationsForSource(currentSnapshot.sourceKey),
    },
  );
  assert.deepEqual(
    review.learningLoop.policySuggestions,
    reviewAgain.learningLoop.policySuggestions,
  );
  const validation = validateFeedbackReview(review);
  assert.equal(validation.valid, true);
  assert.ok(
    review.learningLoop.nextReview &&
      review.learningLoop.nextReview.suggestedAction === "reword_or_hold_back",
  );
  assert.equal(review.targets[0].reviewedInCurrentSnapshot, false);
  assert.equal(review.targets[0].findingId, "dead_tool_detection");
  assert.ok(review.targets.some((target) => target.reviewedInCurrentSnapshot === false));

  store.close();
});

test("adjudication history does not mutate analyze output", () => {
  const { seeded, snapshot, store } = buildSavedSnapshot("feedback-no-mutation");
  const engine = new PathloomEngine({ store });
  const beforeDocument = createReportDocument(
    engine.analyze({ sourceKey: seeded.sourceKey }),
  );
  const target = resolveFeedbackTarget(snapshot, {
    findingId: "dead_tool_detection",
    itemLabel: "delete_record",
  });

  store.saveAdjudication(
    createAdjudicationRecord(snapshot, target, {
      adjudicationStatus: "misleading",
      note: "Too strong for the current catalog.",
    }),
  );
  store.saveAdjudication(
    createAdjudicationRecord(snapshot, target, {
      adjudicationStatus: "noisy",
      note: "Should rank lower until thresholds tighten.",
      timestamp: "2026-05-24T12:15:00.000Z",
    }),
  );

  const afterDocument = createReportDocument(engine.analyze({ sourceKey: seeded.sourceKey }));

  assert.deepEqual(afterDocument.findings, beforeDocument.findings);
  assert.deepEqual(afterDocument.suppressedFindings, beforeDocument.suppressedFindings);

  const review = createFeedbackReview(snapshot, store.listAdjudications(snapshot.snapshotKey), {
    historicalAdjudications: store.listAdjudicationsForSource(snapshot.sourceKey),
  });
  assert.ok(review.learningLoop.policySuggestions.length >= 0);

  store.close();
});

test("CLI adjudicate and feedback support latest-snapshot local workflows", () => {
  const { seeded } = buildSavedSnapshot("feedback-cli");

  const feedbackBefore = execFileSync(
    process.execPath,
    [
      "dist/bin/pathloom.js",
      "feedback",
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
  const adjudicateOutput = execFileSync(
    process.execPath,
    [
      "dist/bin/pathloom.js",
      "adjudicate",
      "--db",
      seeded.filename,
      "--source",
      seeded.sourceKey,
      "--finding",
      "dead_tool_detection",
      "--item",
      "delete_record",
      "--status",
      "accepted",
      "--note",
      "Confirmed dead after wrapper verification.",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );
  const feedbackAfter = execFileSync(
    process.execPath,
    [
      "dist/bin/pathloom.js",
      "feedback",
      "--db",
      seeded.filename,
      "--source",
      seeded.sourceKey,
      "--json",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  const parsedReview = JSON.parse(feedbackAfter);

  assert.match(feedbackBefore, /Target ID:/);
  assert.match(adjudicateOutput, /Pathloom adjudication saved/);
  assert.equal(parsedReview.summary.acceptedCount, 1);
  assert.equal(typeof parsedReview.learningLoop.historicalAdjudicationCount, "number");
  assert.ok(parsedReview.learningLoop.nextReview);
  assert.ok(
    parsedReview.adjudications.some(
      (record) =>
        record.findingId === "dead_tool_detection" &&
        record.targetLabel === "delete_record" &&
        record.adjudicationStatus === "accepted",
    ),
  );
});
