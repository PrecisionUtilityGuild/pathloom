"use strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

type RunCliResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function isDistTestsDir(dir: string) {
  return path.basename(dir) === "tests" && path.basename(path.dirname(dir)) === "dist";
}

function resolveRepoRoot(fromDir: string = __dirname) {
  let cursor = fromDir;
  while (true) {
    if (isDistTestsDir(cursor)) {
      return path.join(cursor, "..", "..");
    }

    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  return path.join(fromDir, "..");
}

function repoPath(...segments: string[]) {
  return path.join(resolveRepoRoot(), ...segments);
}

function fixturePath(...segments: string[]) {
  return repoPath("fixtures", ...segments);
}

function goldenPath(name: string, extension: string) {
  return fixturePath("goldens", `${name}.${extension}`);
}

function mkTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function pathloomEntrypoint() {
  // When tests run, we always execute the built CLI.
  return repoPath("dist", "bin", "pathloom.js");
}

function runPathloomCli(
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
  } = {},
): RunCliResult {
  const cwd = options.cwd ?? resolveRepoRoot();
  const env = { ...process.env, ...(options.env ?? {}) };

  const proc = spawnSync(process.execPath, [pathloomEntrypoint(), ...args], {
    cwd,
    env,
    input: options.input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  const code = typeof proc.status === "number" ? proc.status : 1;
  const stdout = proc.stdout ?? "";
  const stderr = proc.stderr ?? "";

  return { code, stdout, stderr };
}

function execPathloomCli(
  args: string[],
  options: Parameters<typeof runPathloomCli>[1] & { expectCode?: number | number[] } = {},
) {
  const { expectCode, ...rest } = options;
  const result = runPathloomCli(args, rest);
  const expected = Array.isArray(expectCode) ? expectCode : expectCode === undefined ? [0] : [expectCode];

  if (!expected.includes(result.code)) {
    const summary = [
      `pathloom CLI exited ${result.code} (expected ${expected.join(" or ")})`,
      `args: ${JSON.stringify(args)}`,
      `cwd: ${rest.cwd ?? resolveRepoRoot()}`,
      "",
      "--- stdout ---",
      result.stdout.trimEnd(),
      "",
      "--- stderr ---",
      result.stderr.trimEnd(),
    ].join("\n");

    throw new Error(summary);
  }

  return result.stdout;
}

export { execPathloomCli, fixturePath, goldenPath, mkTempDir, repoPath, resolveRepoRoot, runPathloomCli };

