"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildScenarioReport } = require("./helpers/credibilityHarness.js");
const { goldenPath } = require("./helpers/testkit.js");

function readGolden(name, extension) {
  return fs.readFileSync(goldenPath(name, extension), "utf8");
}

test("authoritative scenario matches frozen JSON, Markdown, and terminal goldens", () => {
  const report = buildScenarioReport("authoritative_ready");

  assert.equal(report.json, readGolden("authoritative_ready", "json"));
  assert.equal(report.markdown, readGolden("authoritative_ready", "md"));
  assert.equal(report.terminal, readGolden("authoritative_ready", "txt"));
  assert.equal(
    report.document.findings.some(
      (finding) =>
        finding.id === "activation_tool_report" && finding.items[0]?.toolName === "query",
    ),
    true,
  );
});

test("degraded scenario matches narrowed goldens and keeps unsupported claims suppressed", () => {
  const report = buildScenarioReport("degraded_narrowed");

  assert.equal(report.json, readGolden("degraded_narrowed", "json"));
  assert.equal(report.markdown, readGolden("degraded_narrowed", "md"));
  assert.equal(report.terminal, readGolden("degraded_narrowed", "txt"));
  assert.equal(
    report.document.suppressedFindings.some((finding) => finding.id === "dead_tool_detection"),
    true,
  );
  assert.equal(
    report.document.findings.some(
      (finding) =>
        finding.id === "argument_mismatch_patterns" &&
        finding.items.every((item) => item.issueType === "missing_required_argument"),
    ),
    true,
  );
  assert.equal(
    report.document.suppressedFindings.some((finding) => finding.id === "activation_tool_report"),
    true,
  );
});

test("sparse scenario matches suppression goldens and blocks overclaiming", () => {
  const report = buildScenarioReport("sparse_suppressed");

  assert.equal(report.json, readGolden("sparse_suppressed", "json"));
  assert.equal(report.markdown, readGolden("sparse_suppressed", "md"));
  assert.equal(report.terminal, readGolden("sparse_suppressed", "txt"));
  assert.equal(
    report.document.suppressedFindings.some(
      (finding) =>
        finding.id === "dead_tool_detection" &&
        finding.blockedBy.includes("insufficient_session_count"),
    ),
    true,
  );
  assert.equal(
    report.document.suppressedFindings.some(
      (finding) =>
        finding.id === "session_termination_analysis" &&
        finding.blockedBy.includes("insufficient_session_count"),
    ),
    true,
  );
  assert.equal(
    report.document.suppressedFindings.some(
      (finding) =>
        finding.id === "activation_tool_report" &&
        finding.blockedBy.includes("missing_observed_actor_linkage"),
    ),
    true,
  );
});
