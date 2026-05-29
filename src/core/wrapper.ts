"use strict";

import { SOURCE_KINDS } from "./analysisContract";
import { PathloomIngestEngine } from "./ingestEngine";
import {
  defaultWrapperProfile,
  inferInvocationMeta,
  normalizeRuntimeInvocation,
} from "./normalization";
import { PathloomStore } from "./store";
import type { DatasetProfile, InvocationMeta, PlainObject } from "./types";

type ToolHandler = (...handlerArgs: unknown[]) => Promise<unknown> | unknown;

interface ToolRegistration {
  handler: ToolHandler;
  handlerIndex: number;
  schema: PlainObject | null;
  toolName: string;
}

interface WrappedServer {
  name?: string;
  serverId?: string;
  version?: string;
  config?: {
    name?: string;
    version?: string;
  };
  [key: string]: unknown;
}

function getServerMeta(
  server: WrappedServer,
  options: { serverId?: string; serverVersion?: string } = {},
) {
  return {
    serverId:
      options.serverId ||
      server.name ||
      server.serverId ||
      server?.config?.name ||
      "unknown-server",
    serverVersion: options.serverVersion || server.version || server?.config?.version || "0.0.0",
  };
}

function detectToolRegistration(args: unknown[]): ToolRegistration | null {
  const handlerIndex = args.findIndex((value) => typeof value === "function");

  if (handlerIndex === -1) {
    return null;
  }

  const firstArg = args[0];
  let toolName = null;
  let schema = null;

  if (typeof firstArg === "string") {
    toolName = firstArg;
  } else if (firstArg && typeof firstArg === "object") {
    const firstTool = firstArg as PlainObject & {
      name?: string;
      inputSchema?: PlainObject | null;
      schema?: PlainObject | null;
    };
    toolName = firstTool.name || null;
    schema = firstTool.inputSchema || firstTool.schema || null;
  }

  if (!schema) {
    for (let index = 1; index < handlerIndex; index += 1) {
      const candidate = args[index];
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        const toolCandidate = candidate as PlainObject & {
          inputSchema?: PlainObject | null;
          schema?: PlainObject | null;
        };
        schema = toolCandidate.inputSchema || toolCandidate.schema || toolCandidate;
        break;
      }
    }
  }

  if (!toolName) {
    return null;
  }

  return {
    handler: args[handlerIndex] as ToolHandler,
    handlerIndex,
    schema,
    toolName,
  };
}

function patchRegistrar(
  server: WrappedServer,
  methodName: string,
  runtime: {
    registerTool: (toolName: string, schema: PlainObject | null) => void;
    wrapHandler: (toolName: string, handler: ToolHandler) => ToolHandler;
  },
) {
  if (typeof server[methodName] !== "function") {
    return;
  }

  const original = server[methodName];

  server[methodName] = function patchedToolRegistrar(...args: unknown[]) {
    const registration = detectToolRegistration(args);

    if (!registration) {
      return original.apply(this, args);
    }

    runtime.registerTool(registration.toolName, registration.schema);
    args[registration.handlerIndex] = runtime.wrapHandler(
      registration.toolName,
      registration.handler,
    );

    return original.apply(this, args);
  };
}

export function withPathloom(
  server: WrappedServer,
  options: {
    actorPrivacy?: string;
    databasePath?: string;
    datasetProfile?: DatasetProfile;
    ingestEngine?: PathloomIngestEngine;
    resolveActorKey?: (options: {
      handlerArgs: unknown[];
      server: WrappedServer;
      toolName: string;
    }) => string | null;
    resolveInvocationContext?: (options: {
      handlerArgs: unknown[];
      server: WrappedServer;
      toolName: string;
    }) => InvocationMeta;
    serverId?: string;
    serverVersion?: string;
    sourceKey?: string;
    store?: PathloomStore;
  } = {},
) {
  const store = options.store || new PathloomStore({ filename: options.databasePath });
  const ingestEngine = options.ingestEngine || new PathloomIngestEngine({ store });
  const serverMeta = getServerMeta(server, options);
  const sourceKey =
    options.sourceKey || `wrapper:${serverMeta.serverId}@${serverMeta.serverVersion}`;
  const profile = options.datasetProfile || defaultWrapperProfile(options);

  ingestEngine.registerDataset({
    profile,
    sourceKey,
    sourceKind: SOURCE_KINDS.WRAPPER,
  });

  const runtime = {
    ingestEngine,
    profile,
    registerTool(toolName, schema) {
      ingestEngine.registerToolCatalog({
        sourceKey,
        tools: [
          {
            schema,
            schemaSource: profile.schemaEvidence.expectedSchema,
            serverId: serverMeta.serverId,
            serverVersion: serverMeta.serverVersion,
            toolName,
          },
        ],
      });
    },
    sourceKey,
    store,
    wrapHandler(toolName, handler) {
      return async function wrappedToolHandler(...handlerArgs: unknown[]) {
        const startedAt = Date.now();
        const invocationMeta =
          typeof options.resolveInvocationContext === "function"
            ? options.resolveInvocationContext({
                handlerArgs,
                server,
                toolName,
              })
            : inferInvocationMeta(handlerArgs);
        const actorKey =
          typeof options.resolveActorKey === "function"
            ? options.resolveActorKey({
                handlerArgs,
                server,
                toolName,
              })
            : invocationMeta.actorKey;
        const actorPrivacy =
          invocationMeta.actorPrivacy || options.actorPrivacy || (actorKey ? "hashed" : null);

        try {
          const result = await handler.apply(this, handlerArgs);
          const finishedAt = Date.now();

          ingestEngine.ingestInvocationBatch({
            events: [
              normalizeRuntimeInvocation({
                error: null,
                finishedAt,
                invocationMeta: {
                  ...invocationMeta,
                  actorKey,
                  actorPrivacy,
                },
                result,
                serverId: serverMeta.serverId,
                serverVersion: serverMeta.serverVersion,
                startedAt,
                toolName,
              }),
            ],
            sourceKey,
          });

          return result;
        } catch (error) {
          const finishedAt = Date.now();

          ingestEngine.ingestInvocationBatch({
            events: [
              normalizeRuntimeInvocation({
                error,
                finishedAt,
                invocationMeta: {
                  ...invocationMeta,
                  actorKey,
                  actorPrivacy,
                },
                result: null,
                serverId: serverMeta.serverId,
                serverVersion: serverMeta.serverVersion,
                startedAt,
                toolName,
              }),
            ],
            sourceKey,
          });

          throw error;
        }
      };
    },
  };

  patchRegistrar(server, "tool", runtime);
  patchRegistrar(server, "registerTool", runtime);
  patchRegistrar(server, "addTool", runtime);

  Object.defineProperty(server, "__pathloom", {
    configurable: false,
    enumerable: false,
    value: runtime,
    writable: false,
  });

  return server;
}
