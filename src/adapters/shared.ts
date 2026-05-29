"use strict";

const fs = require("node:fs");

const { SOURCE_KINDS, createDatasetProfile } = require("@precisionutilityguild/pathloom/core");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMaybeJson(value, fallback) {
  if (typeof value !== "string") {
    return value == null ? fallback : value;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function parseArrayValue(value) {
  if (Array.isArray(value)) {
    return value;
  }

  const parsed = parseMaybeJson(value, []);
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (typeof value === "string" && value.includes(",")) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function loadStructuredRecords(options: any = {}) {
  if (Array.isArray(options.entries)) {
    return options.entries;
  }

  if (Array.isArray(options.spans)) {
    return options.spans;
  }

  if (Array.isArray(options.logs)) {
    return options.logs;
  }

  if (!options.filePath) {
    return [];
  }

  const raw = fs.readFileSync(options.filePath, "utf8").trim();
  if (raw.length === 0) {
    return [];
  }

  if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function inferObservedArguments(events) {
  let sawPresenceOnly = false;

  for (const event of events) {
    if (isPlainObject(event.arguments) && Object.keys(event.arguments).length > 0) {
      return "full_values";
    }

    if (
      Array.isArray(event.argumentsProvided) ||
      Array.isArray(event.argumentsMissing) ||
      isPlainObject(event.argumentShapes)
    ) {
      sawPresenceOnly = true;
    }
  }

  return sawPresenceOnly ? "presence_only" : "none";
}

function inferActorIdentity(events, actorPrivacy) {
  if (events.some((event) => typeof event.actorKey === "string" && event.actorKey.length > 0)) {
    return {
      mode: "stable_actor",
      privacy: actorPrivacy || "hashed",
    };
  }

  return {
    mode: "session_only",
    privacy: "none",
  };
}

function inferExpectedSchemaMode(sourceKind, toolCatalog) {
  if (!Array.isArray(toolCatalog) || toolCatalog.length === 0) {
    return "none";
  }

  if (sourceKind === SOURCE_KINDS.OTEL) {
    return "manifest_schema";
  }

  if (sourceKind === SOURCE_KINDS.LOGFILE) {
    return "declared_contract";
  }

  return "runtime_schema";
}

function inferTelemetrySpine(events, sourceKind) {
  const firstClassFields = [];
  const hasTraceIdentity = events.some(
    (event) => typeof event.traceId === "string" && event.traceId.length > 0,
  );
  const hasSpanLineage = events.some(
    (event) =>
      (typeof event.spanId === "string" && event.spanId.length > 0) ||
      (typeof event.parentSpanId === "string" && event.parentSpanId.length > 0),
  );

  if (hasTraceIdentity) {
    firstClassFields.push("traceId");
  }

  if (events.some((event) => typeof event.spanId === "string" && event.spanId.length > 0)) {
    firstClassFields.push("spanId");
  }

  if (
    events.some((event) => typeof event.parentSpanId === "string" && event.parentSpanId.length > 0)
  ) {
    firstClassFields.push("parentSpanId");
  }

  const importedMetadata = {
    aiModelIdentity: "none",
    aiPromptIdentity: "none",
    externalAttributeBags: "none",
    langfuseSurfaces: "none",
  };

  if (sourceKind === SOURCE_KINDS.OTEL || sourceKind === SOURCE_KINDS.LOGFILE) {
    const telemetryRecords = events
      .map((event) => event.provenance?.importedTelemetry)
      .filter((value) => value && typeof value === "object");

    if (telemetryRecords.some((value) => value.modelId != null)) {
      importedMetadata.aiModelIdentity = "provenance_only";
    }

    if (telemetryRecords.some((value) => value.promptId != null)) {
      importedMetadata.aiPromptIdentity = "provenance_only";
    }

    if (
      telemetryRecords.some(
        (value) =>
          value.attributes != null ||
          value.resourceAttributes != null ||
          value.logAttributes != null,
      )
    ) {
      importedMetadata.externalAttributeBags = "provenance_only";
    }

    if (telemetryRecords.some((value) => value.langfuse != null)) {
      importedMetadata.langfuseSurfaces = "provenance_only";
    }
  }

  return {
    firstClassFields,
    importedMetadata,
    spanLineage: hasSpanLineage ? "first_class" : "none",
    traceIdentity: hasTraceIdentity ? "first_class" : "none",
  };
}

function inferDatasetProfile({
  actorPrivacy,
  events,
  profileOverrides,
  sessionization,
  sourceKind,
  toolCatalog,
}) {
  return createDatasetProfile({
    actorIdentity: inferActorIdentity(events, actorPrivacy),
    provenance: {
      clientHints: "normalized",
      eventOrder: "per_session_order",
      lifecycleOutcomes: "final_outcome",
      sessionization,
    },
    schemaEvidence: {
      expectedSchema: inferExpectedSchemaMode(sourceKind, toolCatalog),
      observedArguments: inferObservedArguments(events),
    },
    sourceKind,
    telemetrySpine: inferTelemetrySpine(events, sourceKind),
    toolCatalog:
      Array.isArray(toolCatalog) && toolCatalog.length > 0
        ? {
            authority: "external_catalog",
            completeness: "authoritative",
          }
        : {
            authority: "none",
            completeness: "none",
          },
    ...(profileOverrides || {}),
  });
}

function createStableSourceEventId(prefix, index, event) {
  if (typeof event.sourceEventId === "string" && event.sourceEventId.length > 0) {
    return event.sourceEventId;
  }

  return [
    prefix,
    event.sessionIdSource || "unknown",
    event.sessionId || "unknown-session",
    event.traceId || "unknown-trace",
    event.spanId || "unknown-span",
    event.toolName || "unknown-tool",
    event.invokedAt || index + 1,
    index,
  ].join(":");
}

export {
  createStableSourceEventId,
  inferDatasetProfile,
  inferTelemetrySpine,
  isPlainObject,
  loadStructuredRecords,
  parseArrayValue,
  parseMaybeJson,
};
