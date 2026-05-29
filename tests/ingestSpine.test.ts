"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SOURCE_KINDS,
  withPathloom,
  PathloomIngestEngine,
  PathloomStore,
} = require("@precisionutilityguild/pathloom/core");
const { otelWithCatalogFixture } = require("../fixtures/analysisContractFixtures.js");

function createTempDatabasePath(label) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-")), `${label}.db`);
}

class FakeMcpServer {
  name: string;
  version: string;
  handlers: Map<string, (args: any, context: any) => any>;

  constructor(meta: { name?: string; version?: string } = {}) {
    this.name = meta.name || "demo-server";
    this.version = meta.version || "1.0.0";
    this.handlers = new Map();
  }

  tool(name: string, schema: any, handler: (args: any, context: any) => any) {
    this.handlers.set(name, handler);
    return this;
  }

  async invoke(name: string, args: any, context: any) {
    return this.handlers.get(name)(args, context);
  }
}

test("withPathloom captures runtime tool registration and invocation lifecycle in SQLite", async () => {
  const databasePath = createTempDatabasePath("wrapper");
  const store = new PathloomStore({ filename: databasePath });
  const server = withPathloom(new FakeMcpServer(), {
    actorPrivacy: "hashed",
    resolveActorKey: ({ handlerArgs }) => handlerArgs[1].actorKey,
    resolveInvocationContext: ({ handlerArgs }) => ({
      actorKey: handlerArgs[1].actorKey,
      arguments: handlerArgs[0],
      clientHint: handlerArgs[1].clientHint,
      provenance: handlerArgs[1].provenance,
      sessionIdSource: handlerArgs[1].sessionIdSource,
      resultTokenEstimate: handlerArgs[1].resultTokenEstimate,
      sessionId: handlerArgs[1].sessionId,
      traceId: handlerArgs[1].traceId,
    }),
    store,
  });

  server.tool(
    "query",
    {
      properties: {
        limit: { type: "number" },
        q: { type: "string" },
      },
      type: "object",
    },
    async (args) => ({ items: [args.q] }),
  );
  server.tool(
    "delete_record",
    {
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
      type: "object",
    },
    async () => {
      throw new Error("boom");
    },
  );

  await server.invoke(
    "query",
    { limit: 5, q: "hello" },
    {
      actorKey: "actor-1",
      clientHint: "Claude Desktop",
      provenance: {
        importedTelemetry: {
          modelId: "gpt-4.1-mini",
        },
      },
      resultTokenEstimate: 42,
      sessionIdSource: "explicit",
      sessionId: "session-1",
      traceId: "trace-wrapper-1",
    },
  );
  await assert.rejects(
    server.invoke(
      "delete_record",
      { id: "abc" },
      {
        actorKey: "actor-1",
        clientHint: "Claude Desktop",
        resultTokenEstimate: 0,
        sessionIdSource: "explicit",
        sessionId: "session-1",
        traceId: "trace-wrapper-1",
      },
    ),
  );

  const dataset = store.getDataset("wrapper:demo-server@1.0.0");
  const catalog = store.listToolCatalog("wrapper:demo-server@1.0.0");
  const events = store.listInvocationEvents("wrapper:demo-server@1.0.0");

  assert.equal(dataset.sourceKind, SOURCE_KINDS.WRAPPER);
  assert.equal(dataset.profile.toolCatalog.authority, "runtime_registration");
  assert.equal(dataset.profile.actorIdentity.mode, "stable_actor");
  assert.equal(catalog.length, 2);
  assert.equal(events.length, 2);
  assert.equal(events[0].toolName, "query");
  assert.equal(events[0].clientHint, "claude-desktop");
  assert.equal(events[0].positionInSession, 1);
  assert.equal(events[0].precedingTool, null);
  assert.equal(events[0].outcome, "success");
  assert.equal(events[0].sessionIdSource, "explicit");
  assert.equal(events[0].traceId, "trace-wrapper-1");
  assert.equal(events[0].provenance.importedTelemetry.modelId, "gpt-4.1-mini");
  assert.equal(events[1].toolName, "delete_record");
  assert.equal(events[1].positionInSession, 2);
  assert.equal(events[1].precedingTool, "query");
  assert.equal(events[1].outcome, "error");

  store.close();
});

test("adapter ingestion preserves capability metadata and canonical sequencing", () => {
  const databasePath = createTempDatabasePath("adapter");
  const store = new PathloomStore({ filename: databasePath });
  const ingestEngine = new PathloomIngestEngine({ store });

  ingestEngine.registerDataset({
    profile: otelWithCatalogFixture,
    sourceKey: "otel:demo",
    sourceKind: SOURCE_KINDS.OTEL,
  });
  ingestEngine.registerToolCatalog({
    sourceKey: "otel:demo",
    tools: [
      {
        schema: { properties: { q: { type: "string" } }, type: "object" },
        schemaSource: "manifest_schema",
        serverId: "demo-server",
        serverVersion: "2.0.0",
        toolName: "query",
      },
      {
        schema: { properties: { format: { type: "string" } }, type: "object" },
        schemaSource: "manifest_schema",
        serverId: "demo-server",
        serverVersion: "2.0.0",
        toolName: "export",
      },
    ],
  });
  ingestEngine.ingestInvocationBatch({
    events: [
      {
        arguments: { q: "hello" },
        clientHint: "Cursor",
        invokedAt: 100,
        outcome: "success",
        parentSpanId: null,
        sessionIdSource: "explicit",
        resolvedAt: 120,
        serverId: "demo-server",
        serverVersion: "2.0.0",
        sessionId: "s-1",
        spanId: "span-1",
        sourceEventId: "evt-1",
        toolName: "query",
        traceId: "trace-1",
      },
      {
        arguments: { format: ["csv"] },
        clientHint: "Cursor",
        invokedAt: 130,
        outcome: "error",
        parentSpanId: "span-1",
        sessionIdSource: "trace_fallback",
        resolvedAt: 150,
        serverId: "demo-server",
        serverVersion: "2.0.0",
        sessionId: "trace:trace-1",
        spanId: "span-2",
        sourceEventId: "evt-2",
        toolName: "export",
        traceId: "trace-1",
      },
    ],
    sourceKey: "otel:demo",
  });

  const dataset = store.getDataset("otel:demo");
  const catalog = store.listToolCatalog("otel:demo");
  const events = store.listInvocationEvents("otel:demo");

  assert.equal(dataset.sourceKind, SOURCE_KINDS.OTEL);
  assert.equal(dataset.readiness.readiness, "partial");
  assert.equal(dataset.profile.toolCatalog.authority, "external_catalog");
  assert.equal(dataset.profile.telemetrySpine.traceIdentity, "first_class");
  assert.equal(catalog.length, 2);
  assert.equal(events.length, 2);
  assert.equal(events[0].toolName, "query");
  assert.equal(events[0].positionInSession, 1);
  assert.equal(events[0].traceId, "trace-1");
  assert.equal(events[0].sessionIdSource, "explicit");
  assert.equal(events[0].argumentShapes.q, "string");
  assert.equal(events[1].toolName, "export");
  assert.equal(events[1].positionInSession, 1);
  assert.equal(events[1].precedingTool, null);
  assert.equal(events[1].sessionIdSource, "trace_fallback");
  assert.equal(events[1].parentSpanId, "span-1");
  assert.equal(events[1].argumentShapes.format, "array:string");

  store.close();
});
