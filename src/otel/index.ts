"use strict";

const { SOURCE_KINDS, PathloomIngestEngine, normalizeClientHint } = require("@precisionutilityguild/pathloom/core");
const {
  createStableSourceEventId,
  inferDatasetProfile,
  loadStructuredRecords,
  parseArrayValue,
  parseMaybeJson,
} = require("../adapters/shared");

function readAttribute(sources, keys) {
  for (const source of sources) {
    if (!source || typeof source !== "object") {
      continue;
    }

    for (const key of keys) {
      if (Object.hasOwn(source, key) && source[key] != null) {
        return source[key];
      }
    }
  }

  return undefined;
}

function toTimestamp(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function inferOutcome(span, attributes) {
  const explicit = readAttribute([span, attributes], ["outcome", "mcp.outcome", "tool.outcome"]);
  if (typeof explicit === "string" && explicit.length > 0) {
    return explicit;
  }

  const statusCode = readAttribute([span.status || {}, span], ["code", "statusCode"]);
  if (statusCode === 2 || statusCode === "ERROR") {
    return "error";
  }

  return "success";
}

function readTraceMetadata(span, attributes, resourceAttributes) {
  const modelId = readAttribute(
    [span, attributes, resourceAttributes],
    ["modelId", "gen_ai.request.model", "llm.model_name", "ai.model.id"],
  );
  const promptId = readAttribute(
    [span, attributes, resourceAttributes],
    ["promptId", "langfuse.prompt.id", "ai.prompt.id"],
  );
  const generationId = readAttribute(
    [span, attributes],
    ["langfuse.generation.id", "generationId"],
  );
  const scoreId = readAttribute([span, attributes], ["langfuse.score.id", "scoreId"]);

  const langfuse =
    promptId || generationId || scoreId
      ? {
          generationId: generationId || null,
          promptId: promptId || null,
          scoreId: scoreId || null,
          traceId: readAttribute([span, attributes], ["langfuse.trace.id"]) || null,
        }
      : null;

  return {
    attributes,
    langfuse,
    modelId: modelId || null,
    operationName: span.name || null,
    promptId: promptId || null,
    resourceAttributes,
    traceState: span.traceState || null,
  };
}

function normalizeOtelSpan(span, index) {
  const attributes = span.attributes || {};
  const resourceAttributes = span.resource?.attributes || {};
  const traceId =
    readAttribute([span, attributes], ["traceId", "mcp.trace.id", "trace.id"]) || null;
  const explicitSessionId = readAttribute(
    [span, attributes],
    ["sessionId", "mcp.session.id", "session.id"],
  );
  const argumentsValue = parseMaybeJson(
    readAttribute([span, attributes], ["arguments", "mcp.arguments", "tool.arguments"]),
    {},
  );
  const sessionId = explicitSessionId || (traceId ? `trace:${traceId}` : "unknown-session");
  const sessionIdSource = explicitSessionId ? "explicit" : traceId ? "trace_fallback" : "unknown";
  const invokedAt = toTimestamp(
    readAttribute([span, attributes], ["invokedAt", "startTimeUnixMs", "startTime"]),
    index + 1,
  );
  const resolvedAt = toTimestamp(
    readAttribute([span, attributes], ["resolvedAt", "endTimeUnixMs", "endTime"]),
    invokedAt,
  );

  const event: any = {
    actorKey:
      readAttribute([span, attributes], ["actorKey", "mcp.actor.hash", "mcp.actor.key"]) || null,
    arguments: argumentsValue && typeof argumentsValue === "object" ? argumentsValue : {},
    argumentsMissing: parseArrayValue(
      readAttribute([span, attributes], ["argumentsMissing", "mcp.arguments.missing"]),
    ),
    argumentsProvided: parseArrayValue(
      readAttribute([span, attributes], ["argumentsProvided", "mcp.arguments.provided"]),
    ),
    clientHint: normalizeClientHint(
      readAttribute([span, attributes], ["clientHint", "mcp.client", "client.name"]) || "unknown",
    ),
    invokedAt,
    outcome: inferOutcome(span, attributes),
    parentSpanId:
      readAttribute([span, attributes], ["parentSpanId", "mcp.parent.span.id", "parent.span.id"]) ||
      span.parentSpanId ||
      span.parentSpan?.spanId ||
      null,
    provenance: {
      capture: SOURCE_KINDS.OTEL,
      importedTelemetry: readTraceMetadata(span, attributes, resourceAttributes),
      otelSignal: "span",
    },
    resolvedAt,
    resultTokenEstimate:
      readAttribute([span, attributes], ["resultTokenEstimate", "mcp.result.tokens"]) || 0,
    serverId:
      readAttribute(
        [span, attributes, resourceAttributes],
        ["serverId", "service.name", "mcp.server.id"],
      ) || "unknown-server",
    serverVersion:
      readAttribute(
        [span, attributes, resourceAttributes],
        ["serverVersion", "service.version", "mcp.server.version"],
      ) || "0.0.0",
    sessionIdSource,
    sessionId,
    spanId:
      readAttribute([span, attributes], ["spanId", "mcp.span.id", "span.id"]) ||
      span.spanId ||
      null,
    toolName:
      readAttribute([span, attributes], ["toolName", "mcp.tool.name", "tool.name", "name"]) ||
      "unknown-tool",
    traceId,
  };

  event.sourceEventId = createStableSourceEventId("otel", index, {
    ...event,
    sourceEventId:
      readAttribute([span, attributes], ["sourceEventId", "event.id"]) || span.spanId || null,
  });

  return event;
}

class OTelAdapter {
  options: any;

  constructor(options: any = {}) {
    this.options = options;
  }

  materialize({ sourceKey, store }) {
    const ingestEngine = new PathloomIngestEngine({ store });
    const spans = loadStructuredRecords(this.options);
    const events = spans.map((span, index) => normalizeOtelSpan(span, index));
    const toolCatalog = this.options.toolCatalog || [];
    const resolvedSourceKey = sourceKey || this.options.sourceKey || "otel:default";
    const profile =
      this.options.profile ||
      inferDatasetProfile({
        actorPrivacy: this.options.actorPrivacy,
        events,
        profileOverrides: this.options.profileOverrides,
        sessionization: "derived_session",
        sourceKind: SOURCE_KINDS.OTEL,
        toolCatalog,
      });

    ingestEngine.registerDataset({
      profile,
      sourceKey: resolvedSourceKey,
      sourceKind: SOURCE_KINDS.OTEL,
    });

    if (toolCatalog.length > 0) {
      ingestEngine.registerToolCatalog({
        sourceKey: resolvedSourceKey,
        tools: toolCatalog,
      });
    }

    if (events.length > 0) {
      ingestEngine.ingestInvocationBatch({
        events,
        sourceKey: resolvedSourceKey,
      });
    }

    return {
      eventCount: events.length,
      sourceKey: resolvedSourceKey,
    };
  }
}

export { OTelAdapter };
