"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { PathloomEngine, PathloomStore } = require("@precisionutilityguild/pathloom/core");
const { LogfileAdapter } = require("@precisionutilityguild/pathloom/logfile");
const {
  createReportDocument,
  renderJsonReport,
  renderMarkdownReport,
  renderTerminalReport,
} = require("@precisionutilityguild/pathloom/report");
const { loadDemoPack } = require("../fixtures/demoPack.js");
const { normalizeReportDocument } = require("../scripts/build-demo-pack.js");

function createTempDatabasePath(label) {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-demo-pack-test-")),
    `${label}.db`,
  );
}

test("canonical demo pack stays aligned with its frozen expected reports", () => {
  const pack = loadDemoPack();
  const store = new PathloomStore({ filename: createTempDatabasePath("demo-pack") });
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

  assert.equal(renderJsonReport(document), pack.expected.json);
  assert.equal(renderMarkdownReport(document), pack.expected.markdown);
  assert.equal(renderTerminalReport(document), pack.expected.terminal);

  store.close();
});

test("demo pack manifest advertises the canonical import story and expected findings", () => {
  const pack = loadDemoPack();

  assert.equal(pack.manifest.id, "authoritative-ready");
  assert.equal(pack.manifest.sourceKey, "logfile:demo-pack");
  assert.equal(pack.manifest.dataset.eventCount, pack.events.length);
  assert.equal(pack.manifest.dataset.catalogToolCount, pack.catalog.length);
  assert.match(pack.manifest.commands.import, /pathloom import --format logfile/);
  assert.ok(
    pack.manifest.expectedFindings.some(
      (finding) => finding.id === "dead_tool_detection" && finding.keyItems.includes("bulk_export"),
    ),
  );
});
