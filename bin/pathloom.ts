#!/usr/bin/env node

import { runCli } from "../src/cli/run";

try {
  const exitCode = runCli(process.argv, process);
  process.exitCode = exitCode;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Pathloom error: ${message}\n`);
  process.exitCode = 1;
}
