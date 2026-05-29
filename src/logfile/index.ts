"use strict";

const { SOURCE_KINDS, PathloomIngestEngine, normalizeClientHint } = require("@precisionutilityguild/pathloom/core");
const {
  createStableSourceEventId,
  inferDatasetProfile,
  loadStructuredRecords,
  parseArrayValue,
  parseMaybeJson,
} = require("../adapters/shared");

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

function readImportedTelemetry(entry) {
  const provenanceTelemetry =
    entry.provenance?.importedTelemetry && typeof entry.provenance.importedTelemetry === "object"
      ? entry.provenance.importedTelemetry
      : {};

  const langfuse =
    provenanceTelemetry.langfuse ||
    entry.langfuse ||
    (entry.langfuseTraceId || entry.langfusePromptId || entry.langfuseGenerationId
      ? {
          generationId: entry.langfuseGenerationId || null,
          promptId: entry.langfusePromptId || null,
          traceId: entry.langfuseTraceId || null,
        }
      : null);

  return {
    ...provenanceTelemetry,
    attributes: provenanceTelemetry.attributes || entry.attributes || null,
    langfuse,
    logAttributes: provenanceTelemetry.logAttributes || entry.logAttributes || null,
    modelId: provenanceTelemetry.modelId || entry.modelId || null,
    operationName: provenanceTelemetry.operationName || entry.operationName || null,
    promptId: provenanceTelemetry.promptId || entry.promptId || null,
    traceState: provenanceTelemetry.traceState || entry.traceState || null,
  };
}

function normalizeLogEntry(entry, index) {
  const argumentsValue = parseMaybeJson(entry.arguments, {});
  const traceId = entry.traceId || null;
  const sessionId = entry.sessionId || (traceId ? `trace:${traceId}` : "unknown-session");
  const sessionIdSource =
    entry.sessionIdSource ||
    (entry.sessionId ? "explicit" : traceId ? "trace_fallback" : "unknown");
  const event: any = {
    actorKey: entry.actorKey || null,
    arguments: argumentsValue && typeof argumentsValue === "object" ? argumentsValue : {},
    argumentsMissing: parseArrayValue(entry.argumentsMissing),
    argumentsProvided: parseArrayValue(entry.argumentsProvided),
    clientHint: normalizeClientHint(entry.clientHint || "unknown"),
    invokedAt: toTimestamp(entry.invokedAt, index + 1),
    outcome: entry.outcome || "success",
    parentSpanId: entry.parentSpanId || null,
    provenance: {
      capture: SOURCE_KINDS.LOGFILE,
      importedTelemetry: readImportedTelemetry(entry),
      logfile: true,
    },
    resolvedAt: toTimestamp(entry.resolvedAt, toTimestamp(entry.invokedAt, index + 1)),
    resultTokenEstimate: entry.resultTokenEstimate || 0,
    serverId: entry.serverId || "unknown-server",
    serverVersion: entry.serverVersion || "0.0.0",
    sessionId,
    sessionIdSource,
    spanId: entry.spanId || null,
    toolName: entry.toolName || "unknown-tool",
    traceId,
  };

  event.sourceEventId = createStableSourceEventId("logfile", index, {
    ...event,
    sourceEventId: entry.sourceEventId || entry.id || null,
  });

  return event;
}

class LogfileAdapter {
  options: any;

  constructor(options: any = {}) {
    this.options = options;
  }

  materialize({ sourceKey, store }) {
    const ingestEngine = new PathloomIngestEngine({ store });
    const entries = loadStructuredRecords(this.options);
    const events = entries.map((entry, index) => normalizeLogEntry(entry, index));
    const toolCatalog = this.options.toolCatalog || [];
    const resolvedSourceKey = sourceKey || this.options.sourceKey || "logfile:default";
    const profile =
      this.options.profile ||
      inferDatasetProfile({
        actorPrivacy: this.options.actorPrivacy,
        events,
        profileOverrides: this.options.profileOverrides,
        sessionization: "explicit_session_id",
        sourceKind: SOURCE_KINDS.LOGFILE,
        toolCatalog,
      });

    ingestEngine.registerDataset({
      profile,
      sourceKey: resolvedSourceKey,
      sourceKind: SOURCE_KINDS.LOGFILE,
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

export { LogfileAdapter };
