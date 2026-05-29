# TypeScript Foundation

This document defines the build and publish contract for Pathloom's staged TypeScript migration.

## Why this exists

Pathloom was fully CommonJS JavaScript when the migration program started.

The first migration mission does not convert the whole repo at once. It establishes the rules the later missions must obey so the package can move steadily without breaking its public surface.

## Current strategy

- source-of-truth code remains in the existing repository layout during the migration
- TypeScript is the compiler and declaration emitter for that tree
- compiled publish artifacts live in `dist/`
- the package entrypoints and CLI now resolve to `dist/` rather than directly to source files
- the runtime package format remains explicit CommonJS for parity with the current consumer contract

## Build shape

- `tsconfig.base.json` holds the shared compiler defaults
- `tsconfig.build.json` compiles `index.ts`, `bin/**/*.ts`, `src/**/*.ts`, `scripts/**/*.ts`, `fixtures/**/*.ts`, and `tests/**/*.ts` into `dist/`
- `tsconfig.typecheck.json` defines the no-emit typecheck gate used during the migration

Mission 34 finishes the JavaScript cutover. The repo now treats TypeScript as the only source language, with `allowJs: false`, `noImplicitReturns: true`, and `noFallthroughCasesInSwitch: true` as the baseline hardening gates while broader `strict` work remains a deliberate follow-on.

## Publish contract

The package must continue to provide these stable entrypoints:

- `pathloom`
- `pathloom/contracts`
- `pathloom/core`
- `pathloom/feedback`
- `pathloom/history`
- `pathloom/insights`
- `pathloom/logfile`
- `pathloom/otel`
- `pathloom/report`
- `pathloom/uncertainty`

For each entrypoint, the package now declares:

- a CommonJS runtime target under `dist/`
- a declaration file under `dist/`

## Verification gates

These commands are the compatibility gates for the migration program:

```bash
npm run build
npm run typecheck
npm test
npm run verify:package-contract
```

`verify:package-contract` proves that:

- the manifest points at `dist/`
- every public export has a matching runtime file and declaration file
- the root package and key subpath exports can be required successfully
- the compiled CLI still answers `--version` and `schema report`

## Boundary for later missions

Later TypeScript migration missions should treat this contract as fixed unless there is an explicit new decision to change the package surface.
