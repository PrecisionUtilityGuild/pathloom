"use strict";

import type { AnalysisThresholds } from "./types";

const { analyzeDataset } = require("../insights") as typeof import("../insights");

import { PathloomIngestEngine } from "./ingestEngine";
import { PathloomStore } from "./store";

export class PathloomEngine {
  adapter: { materialize?: (options: unknown) => { sourceKey?: string } | null } | null;
  store: PathloomStore;

  constructor(
    options: {
      adapter?: { materialize?: (options: unknown) => { sourceKey?: string } | null };
      store?: PathloomStore;
      storeOptions?: { filename?: string };
    } = {},
  ) {
    this.adapter = options.adapter || null;
    this.store = options.store || new PathloomStore(options.storeOptions);
  }

  analyze(
    options: {
      sourceKey?: string | null;
      thresholds?: Partial<AnalysisThresholds>;
    } = {},
  ) {
    let sourceKey = options.sourceKey || null;

    if (this.adapter && typeof this.adapter.materialize === "function") {
      const materialized = this.adapter.materialize({
        ingestEngine: new PathloomIngestEngine({ store: this.store }),
        sourceKey,
        store: this.store,
      });

      if (!sourceKey && materialized?.sourceKey) {
        sourceKey = materialized.sourceKey;
      }
    }

    sourceKey = sourceKey || this.resolveDefaultSourceKey();
    const dataset = this.store.getDataset(sourceKey);

    if (!dataset) {
      throw new Error(`Unknown dataset: ${sourceKey}`);
    }

    return analyzeDataset(
      {
        dataset,
        events: this.store.listInvocationEvents(sourceKey),
        sourceKey,
        toolCatalog: this.store.listToolCatalog(sourceKey),
      },
      {
        thresholds: options.thresholds,
      },
    );
  }

  resolveDefaultSourceKey(): string {
    const datasets = this.store.listDatasets();

    if (datasets.length === 1) {
      return datasets[0].sourceKey;
    }

    if (datasets.length === 0) {
      throw new Error("No datasets are registered in the local Pathloom store.");
    }

    throw new Error(
      "Multiple datasets are registered. Pass { sourceKey } to analyze a specific one.",
    );
  }
}
