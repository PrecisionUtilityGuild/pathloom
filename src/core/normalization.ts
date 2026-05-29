"use strict";

import { SOURCE_KINDS, createDatasetProfile } from "./analysisContract";
import type {
  InvocationMeta,
  InvocationSessionState,
  PersistedInvocationEvent,
  PlainObject,
  RawInvocationEvent,
  ToolCatalogEntry,
} from "./types";

const KNOWN_CLIENTS = new Map([
  ["claude desktop", "claude-desktop"],
  ["claude-desktop", "claude-desktop"],
  ["cursor", "cursor"],
  ["vscode", "vscode"],
  ["visual studio code", "vscode"],
  ["unknown", "unknown"],
]);

function isPlainObject(value: unknown): value is PlainObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeClientHint(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    return "unknown";
  }

  const normalized = value.trim().toLowerCase();
  return KNOWN_CLIENTS.get(normalized) || normalized.replace(/\s+/g, "-");
}

export function inferOutcome(result: unknown, error: unknown): string {
  if (error) {
    return "error";
  }

  if (
    result == null ||
    (Array.isArray(result) && result.length === 0) ||
    (isPlainObject(result) && Object.keys(result).length === 0)
  ) {
    return "empty-result";
  }

  return "success";
}

function summarizeValueShape(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "array:empty";
    }

    return `array:${summarizeValueShape(value[0])}`;
  }

  if (typeof value === "object") {
    return "object";
  }

  return typeof value;
}

export function summarizeArgumentShapes(
  args: PlainObject | null | undefined,
): Record<string, string> {
  if (!isPlainObject(args)) {
    return {};
  }

  const shapes = {};

  for (const [key, value] of Object.entries(args)) {
    shapes[key] = summarizeValueShape(value);
  }

  return shapes;
}

function resolveSessionIdSource(
  sessionId?: string | null,
  sessionIdSource?: string | null,
): string {
  if (sessionIdSource) {
    return sessionIdSource;
  }

  return sessionId && sessionId !== "unknown-session" ? "explicit" : "unknown";
}

export function defaultWrapperProfile(
  options: { resolveActorKey?: (...args: unknown[]) => unknown; actorPrivacy?: string } = {},
) {
  const hasStableActor = typeof options.resolveActorKey === "function";

  return createDatasetProfile({
    sourceKind: SOURCE_KINDS.WRAPPER,
    actorIdentity: hasStableActor
      ? {
          mode: "stable_actor",
          privacy: options.actorPrivacy || "hashed",
        }
      : {
          mode: "session_only",
          privacy: "none",
        },
    toolCatalog: {
      authority: "runtime_registration",
      completeness: "authoritative",
    },
    schemaEvidence: {
      expectedSchema: "runtime_schema",
      observedArguments: "full_values",
    },
    provenance: {
      sessionization: "explicit_session_id",
      eventOrder: "per_session_order",
      lifecycleOutcomes: "full_lifecycle",
      clientHints: "normalized",
    },
    telemetrySpine: {
      firstClassFields: [],
      importedMetadata: {
        aiModelIdentity: "none",
        aiPromptIdentity: "none",
        externalAttributeBags: "none",
        langfuseSurfaces: "none",
      },
      spanLineage: "none",
      traceIdentity: "none",
    },
  });
}

function mergeMeta(base: InvocationMeta, overrides?: InvocationMeta): InvocationMeta {
  return {
    ...base,
    ...(overrides || {}),
  };
}

export function inferInvocationMeta(handlerArgs: unknown[]): InvocationMeta {
  const [firstArg, secondArg] = handlerArgs;
  const firstIsObject = isPlainObject(firstArg);
  const secondIsObject = isPlainObject(secondArg);
  const metaKeys = [
    "sessionId",
    "sessionIdSource",
    "traceId",
    "spanId",
    "parentSpanId",
    "clientHint",
    "actorKey",
    "arguments",
    "params",
    "provenance",
  ];

  const firstLooksLikeContext =
    firstIsObject && metaKeys.some((key) => Object.hasOwn(firstArg, key));

  const context: PlainObject = firstLooksLikeContext ? firstArg : secondIsObject ? secondArg : {};
  const args: PlainObject = firstLooksLikeContext
    ? (context.arguments as PlainObject | undefined) ||
      (context.params as PlainObject | undefined) ||
      {}
    : firstIsObject
      ? firstArg
      : {};

  return {
    actorKey: (context.actorKey as string | null | undefined) || null,
    actorPrivacy: (context.actorPrivacy as string | null | undefined) || null,
    arguments: args,
    clientHint: normalizeClientHint(context.clientHint),
    parentSpanId: (context.parentSpanId as string | null | undefined) || null,
    provenance: isPlainObject(context.provenance) ? context.provenance : {},
    resultTokenEstimate: Number(context.resultTokenEstimate || 0),
    sessionIdSource: (context.sessionIdSource as string | null | undefined) || null,
    sessionId: (context.sessionId as string | undefined) || "unknown-session",
    spanId: (context.spanId as string | null | undefined) || null,
    traceId: (context.traceId as string | null | undefined) || null,
  };
}

function normalizeToolSchema(inputSchema: unknown): PlainObject | null {
  if (!inputSchema || typeof inputSchema !== "object") {
    return null;
  }

  return inputSchema as PlainObject;
}

export function normalizeToolCatalogEntry(
  entry: Partial<ToolCatalogEntry> & { toolName?: string } = {},
): ToolCatalogEntry {
  return {
    registeredAt: entry.registeredAt || Date.now(),
    schema: normalizeToolSchema(entry.schema),
    schemaSource: entry.schemaSource || null,
    serverId: entry.serverId || "unknown-server",
    serverVersion: entry.serverVersion || "0.0.0",
    toolName: entry.toolName || "unknown-tool",
  };
}

export function normalizeInvocationEvent(
  rawEvent: RawInvocationEvent,
  sessionState: Partial<InvocationSessionState> = {},
): PersistedInvocationEvent {
  const args = isPlainObject(rawEvent.arguments) ? rawEvent.arguments : {};
  const sessionPosition = (sessionState.position || 0) + 1;
  const providedKeys = rawEvent.argumentsProvided || Object.keys(args);

  return {
    actorKey: rawEvent.actorKey || null,
    actorPrivacy: rawEvent.actorPrivacy || null,
    argumentsJson: Object.keys(args).length > 0 ? JSON.stringify(args) : null,
    argumentsMissingJson: JSON.stringify(rawEvent.argumentsMissing || []),
    argumentsProvidedJson: JSON.stringify(providedKeys),
    argumentShapesJson: JSON.stringify(summarizeArgumentShapes(args)),
    clientHint: normalizeClientHint(rawEvent.clientHint),
    invokedAt: rawEvent.invokedAt,
    isFirstInSession: sessionPosition === 1 ? 1 : 0,
    outcome: rawEvent.outcome,
    positionInSession: sessionPosition,
    precedingTool: sessionState.lastTool || null,
    provenanceJson: JSON.stringify(rawEvent.provenance || {}),
    parentSpanId: rawEvent.parentSpanId || null,
    resolvedAt: rawEvent.resolvedAt,
    resultTokenEstimate: rawEvent.resultTokenEstimate || 0,
    serverId: rawEvent.serverId || "unknown-server",
    serverVersion: rawEvent.serverVersion || "0.0.0",
    sessionIdSource: resolveSessionIdSource(rawEvent.sessionId, rawEvent.sessionIdSource),
    sessionId: rawEvent.sessionId || "unknown-session",
    spanId: rawEvent.spanId || null,
    sourceEventId: rawEvent.sourceEventId || null,
    toolName: rawEvent.toolName,
    traceId: rawEvent.traceId || null,
  };
}

export function normalizeRuntimeInvocation({
  toolName,
  invocationMeta,
  result,
  error,
  serverId,
  serverVersion,
  startedAt,
  finishedAt,
}: {
  toolName: string;
  invocationMeta: InvocationMeta;
  result: unknown;
  error: unknown;
  serverId: string;
  serverVersion: string;
  startedAt: number;
  finishedAt: number;
}): RawInvocationEvent {
  const meta = mergeMeta(
    {
      actorKey: null,
      actorPrivacy: null,
      arguments: {},
      argumentsMissing: [],
      clientHint: "unknown",
      parentSpanId: null,
      provenance: {},
      resultTokenEstimate: 0,
      sessionIdSource: null,
      sessionId: "unknown-session",
      spanId: null,
      traceId: null,
    },
    invocationMeta,
  );

  return {
    actorKey: meta.actorKey,
    actorPrivacy: meta.actorPrivacy,
    arguments: meta.arguments,
    argumentsMissing: meta.argumentsMissing || [],
    clientHint: meta.clientHint,
    invokedAt: startedAt,
    outcome: meta.outcome || inferOutcome(result, error),
    provenance: {
      capture: SOURCE_KINDS.WRAPPER,
      ...(isPlainObject(meta.provenance) ? meta.provenance : {}),
      runtimeWrapped: true,
    },
    parentSpanId: meta.parentSpanId,
    resolvedAt: finishedAt,
    resultTokenEstimate: meta.resultTokenEstimate || 0,
    serverId,
    serverVersion,
    sessionIdSource: resolveSessionIdSource(meta.sessionId, meta.sessionIdSource),
    sessionId: meta.sessionId,
    toolName,
    spanId: meta.spanId,
    traceId: meta.traceId,
  };
}
