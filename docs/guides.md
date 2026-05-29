# Guides

This doc is the “how to use Pathloom” entrypoint. It replaces:

- `otel-sidecar-quickstart.md`
- `ci-integration.md`
- `dogfood-liquid-shadow.md`

## Prerequisites

Install the CLI (Node.js 20+):

```bash
npm install @precisionutilityguild/pathloom
```

For **developing Pathloom itself**, clone the repo and run `npm ci && npm run build` from the repository root.

### Publish (maintainers, Precision Utility Guild org)

Package name: `@precisionutilityguild/pathloom`. Requires an npm account in the **precisionutilityguild** org with publish rights.

```bash
npm whoami
npm publish --access public
```

Use a token with **publish** access to the org (granular token: select the `precisionutilityguild` scope, read and write).

## Quickstart (import-first)

If you already have exported telemetry (OTel spans or NDJSON logs), don’t re-instrument your MCP server. Import first.

### Demo pack (canonical fixtures)

```bash
npm run demo-pack:build   # already built if you followed Prerequisites

npx pathloom import \
  --format logfile \
  --input ./fixtures/demo-pack/authoritative-ready/events.ndjson \
  --catalog ./fixtures/demo-pack/authoritative-ready/tool-catalog.json \
  --source logfile:demo-pack \
  --actor-privacy hashed

npx pathloom analyze --source logfile:demo-pack
npx pathloom check
```

The demo pack lives at `fixtures/demo-pack/authoritative-ready/` with frozen expected surfaces (`expected-report.*`).

### Your own telemetry (OTel)

```bash
npx pathloom import \
  --format otel \
  --input ./telemetry/mcp-spans.ndjson \
  --catalog ./telemetry/tool-catalog.json \
  --source otel:my-server \
  --actor-privacy hashed

npx pathloom analyze --source otel:my-server --markdown > pathloom-report.md
npx pathloom check
```

### Tool catalog authority (important)

Dead-tool findings (and other “full claim” behavior) require an authoritative tool catalog. Without a catalog, Pathloom narrows or suppresses instead of guessing.

## CI integration (GitHub Actions)

Pathloom is **offline-first**: CI runs locally on the runner. No hosted Pathloom API keys required.

### What `pathloom check` gates

`pathloom check` is a **Pathloom package credibility gate**: it runs the calibration matrix and frozen goldens (like `authoritative_ready` and `demo-pack`) to ensure Pathloom itself is not overclaiming.

For your own MCP server CI you usually have two checks:

1. **Your data path**: `pathloom import` → `pathloom analyze` (upload Markdown/JSON as artifacts)
2. **The package gate**: `pathloom check`

### Optional: strict per-source report gate

If you want CI to fail when *your server report changes*, commit an `expected-report.json` for your fixture pack and run:

```bash
npx pathloom check --db ./pathloom.db --source logfile:ci --golden ./telemetry/expected-report.json
```

This mode diffs the canonical report JSON for `--source` against the expected JSON file and exits 0/1 accordingly.

### Minimal workflow (your MCP server repo)

```yaml
name: Pathloom
on: [pull_request, push]
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: npm }
      - run: npm install @precisionutilityguild/pathloom
      - run: |
          npx pathloom import --format logfile \
            --input ./telemetry/events.ndjson \
            --catalog ./telemetry/tool-catalog.json \
            --source logfile:ci --actor-privacy hashed
          npx pathloom analyze --source logfile:ci --markdown > pathloom-report.md
          npx pathloom check
      - uses: actions/upload-artifact@v4
        if: success()
        with:
          name: pathloom-report
          path: pathloom-report.md
```

**This repository** (when you are developing Pathloom itself) runs `.github/workflows/pathloom-check.yml` and ships a composite action at `.github/actions/pathloom-check/` that calls `scripts/ci-gate.sh` after `npm test`.

## Real-server dogfood (liquid-shadow)

If you want a “real MCP surface” run (not just fixtures), use:

```bash
npm run dogfood:liquid-shadow
```

It writes a stable artifact set under `.pathloom-datasets/liquid-shadow/` including imported telemetry, report outputs, snapshots, and feedback surfaces.

---

## Deep links

- Architecture entrypoint: `architecture/README.md`
- Findings overview: `architecture/findings.md`
- Review loop (snapshots + feedback): `architecture/review-loop.md`

