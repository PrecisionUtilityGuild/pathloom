"use strict";

const os = require("node:os");
const path = require("node:path");

const { PathloomStore } = require("@precisionutilityguild/pathloom/core");
const { LogfileAdapter } = require("../../src/logfile");
const { loadDemoPack } = require("../../fixtures/demoPack");
const fs = require("node:fs");

function createTempDatabasePath(label) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pathloom-report-")), `${label}.db`);
}

function seedReadyDataset(label = "ready", options: any = {}) {
  const filename = options.filename || createTempDatabasePath(label);
  const store = new PathloomStore({ filename });
  const pack = loadDemoPack();
  const sourceKey = options.sourceKey || pack.manifest.sourceKey;
  const adapter = new LogfileAdapter({
    actorPrivacy: pack.manifest.actorPrivacy,
    entries: pack.events,
    sourceKey,
    toolCatalog: pack.catalog,
  });
  adapter.materialize({ sourceKey, store });

  store.close();

  return {
    filename,
    sourceKey,
  };
}

export { seedReadyDataset };
