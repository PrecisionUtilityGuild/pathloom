"use strict";

import { normalizeInvocationEvent, normalizeToolCatalogEntry } from "./normalization";
import { PathloomStore } from "./store";
import type {
  DatasetProfile,
  InvocationSessionState,
  PersistedInvocationEvent,
  RawInvocationEvent,
  ToolCatalogEntry,
} from "./types";

export class PathloomIngestEngine {
  store: PathloomStore;
  sessionState: Map<string, InvocationSessionState>;

  constructor(options: { store?: PathloomStore; storeOptions?: { filename?: string } } = {}) {
    this.store = options.store || new PathloomStore(options.storeOptions);
    this.sessionState = new Map();
  }

  registerDataset({
    profile,
    sourceKey,
    sourceKind,
  }: {
    profile: DatasetProfile;
    sourceKey: string;
    sourceKind: string;
  }) {
    return this.store.upsertDataset({
      profile,
      sourceKey,
      sourceKind,
    });
  }

  registerToolCatalog({ sourceKey, tools }: { sourceKey: string; tools: ToolCatalogEntry[] }) {
    this.store.registerToolCatalogEntries(
      sourceKey,
      tools.map((tool) => normalizeToolCatalogEntry(tool)),
    );
  }

  ingestInvocationBatch({
    events,
    sourceKey,
  }: {
    events: RawInvocationEvent[];
    sourceKey: string;
  }): PersistedInvocationEvent[] {
    const normalizedEvents: PersistedInvocationEvent[] = [];

    for (const rawEvent of events) {
      const sessionKey = `${sourceKey}:${rawEvent.sessionId || "unknown-session"}`;
      const priorState = this.sessionState.get(sessionKey) || {
        lastTool: null,
        position: 0,
      };
      const normalized = normalizeInvocationEvent(rawEvent, priorState);

      this.sessionState.set(sessionKey, {
        lastTool: normalized.toolName,
        position: normalized.positionInSession,
      });

      normalizedEvents.push(normalized);
    }

    this.store.appendInvocationEvents(sourceKey, normalizedEvents);
    return normalizedEvents;
  }
}
