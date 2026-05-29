"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { LogfileAdapter, OTelAdapter, PathloomEngine, PathloomStore } = require("@precisionutilityguild/pathloom/core");
const { sharedCatalog } = require("../fixtures/credibilityFixtures.js");

function createTempDatabasePath(label) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-adapter-")), `${label}.db`);
}

test("OTelAdapter materializes spans into the canonical store and analysis engine", () => {
  const filename = createTempDatabasePath("otel");
  const store = new PathloomStore({ filename });
  const adapter = new OTelAdapter({
    sourceKey: "otel:demo",
    spans: [
      {
        attributes: {
          "mcp.arguments": JSON.stringify({ q: "hello" }),
          "mcp.client": "Cursor",
          "mcp.session.id": "session-1",
          "mcp.tool.name": "query",
          "langfuse.prompt.id": "prompt-1",
        },
        endTimeUnixMs: 20,
        resource: {
          attributes: {
            "gen_ai.request.model": "gpt-4.1-mini",
            "service.name": "demo-server",
            "service.version": "2.0.0",
          },
        },
        traceId: "trace-1",
        spanId: "span-1",
        startTimeUnixMs: 10,
      },
      {
        attributes: {
          "mcp.arguments": JSON.stringify({ format: ["csv"] }),
          "mcp.client": "Cursor",
          "mcp.parent.span.id": "span-1",
          "mcp.tool.name": "bulk_export",
        },
        endTimeUnixMs: 40,
        resource: {
          attributes: {
            "service.name": "demo-server",
            "service.version": "2.0.0",
          },
        },
        traceId: "trace-1",
        spanId: "span-2",
        startTimeUnixMs: 30,
        status: { code: 2 },
      },
    ],
    toolCatalog: sharedCatalog,
  });

  const report = new PathloomEngine({ adapter, store }).analyze();
  const dataset = store.getDataset("otel:demo");
  const events = store.listInvocationEvents("otel:demo");

  assert.equal(report.sourceKey, "otel:demo");
  assert.equal(dataset.sourceKind, "otel");
  assert.equal(dataset.profile.toolCatalog.authority, "external_catalog");
  assert.equal(dataset.profile.provenance.sessionization, "derived_session");
  assert.equal(dataset.profile.telemetrySpine.traceIdentity, "first_class");
  assert.equal(dataset.profile.telemetrySpine.spanLineage, "first_class");
  assert.equal(events[0].clientHint, "cursor");
  assert.equal(events[0].traceId, "trace-1");
  assert.equal(events[0].sessionId, "session-1");
  assert.equal(events[0].sessionIdSource, "explicit");
  assert.equal(events[1].sessionId, "trace:trace-1");
  assert.equal(events[1].sessionIdSource, "trace_fallback");
  assert.equal(events[1].parentSpanId, "span-1");
  assert.equal(events[1].argumentShapes.format, "array:string");
  assert.equal(events[0].provenance.importedTelemetry.langfuse.promptId, "prompt-1");
  assert.equal(events[0].provenance.importedTelemetry.modelId, "gpt-4.1-mini");

  store.close();
});

test("LogfileAdapter ingests NDJSON logs with inferred capabilities", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-logfile-"));
  const filePath = path.join(dir, "events.ndjson");

  fs.writeFileSync(
    filePath,
    [
      JSON.stringify({
        arguments: { q: "northstar" },
        attributes: { raw: true },
        clientHint: "Claude Desktop",
        id: "evt-1",
        invokedAt: 1,
        outcome: "success",
        resolvedAt: 2,
        serverId: "demo-server",
        serverVersion: "1.0.0",
        sessionId: "s1",
        traceId: "trace-a",
        spanId: "span-a",
        toolName: "query",
      }),
      JSON.stringify({
        arguments: { q: "mission" },
        clientHint: "Claude Desktop",
        id: "evt-2",
        invokedAt: 3,
        outcome: "success",
        resolvedAt: 4,
        serverId: "demo-server",
        serverVersion: "1.0.0",
        sessionId: "s2",
        toolName: "query",
      }),
    ].join("\n"),
    "utf8",
  );

  const store = new PathloomStore({ filename: createTempDatabasePath("logfile") });
  const adapter = new LogfileAdapter({
    filePath,
    sourceKey: "logfile:demo",
  });

  new PathloomEngine({ adapter, store }).analyze();
  const dataset = store.getDataset("logfile:demo");
  const events = store.listInvocationEvents("logfile:demo");

  assert.equal(dataset.sourceKind, "logfile");
  assert.equal(dataset.profile.toolCatalog.authority, "none");
  assert.equal(dataset.profile.schemaEvidence.observedArguments, "full_values");
  assert.equal(dataset.profile.telemetrySpine.traceIdentity, "first_class");
  assert.equal(events.length, 2);
  assert.equal(events[0].clientHint, "claude-desktop");
  assert.equal(events[0].sessionIdSource, "explicit");
  assert.equal(events[0].traceId, "trace-a");
  assert.equal(events[0].provenance.importedTelemetry.attributes.raw, true);

  store.close();
});
