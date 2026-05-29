"use strict";

const fs = require("node:fs");
const path = require("node:path");

function readPackageVersion() {
  const candidatePaths = [
    path.join(__dirname, "..", "package.json"),
    path.join(__dirname, "..", "..", "package.json"),
  ];

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
    if (typeof manifest.version === "string" && manifest.version.length > 0) {
      return manifest.version;
    }
  }

  throw new Error("Unable to resolve the Pathloom package version.");
}

const PATHLOOM_PACKAGE_VERSION = readPackageVersion();

export { PATHLOOM_PACKAGE_VERSION };
