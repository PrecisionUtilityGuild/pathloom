# Pathloom

**Credibility-first product findings for MCP server authors.**

Pathloom is a **claim-safety gate** for MCP telemetry: a local-first linter that tells you which product changes your data actually supports—not another dashboard or trace UI. It sits downstream of Grafana, Datadog, and OTel, and upstream of schema and tool-surface decisions.

Pathloom reads the MCP event data you already have (imported spans, structured logs, or a wrapper) and emits bounded findings only when the dataset is entitled to support them. Suppression and narrowed claims are deliberate: weak evidence must not masquerade as progress.

Run **`pathloom check` in CI** to gate releases on calibration harnesses and frozen goldens—the same contract this repo uses for `npm run demo-pack:build`.

```bash
npx pathloom analyze
```

```
⚠  Dead tools (2)
   delete_record   — 0 calls across 847 sessions
   bulk_export     — 0 calls across 847 sessions

⚠  Risky sequences (1)
   search → delete — 71% error rate (baseline: 8%)

✓  Activation tool
   query           — users who call this in session 1 return at 3× the rate of users who don't

ℹ  Client divergence
   Cursor misuses export.format in 34% of calls
   Claude Desktop: 4%
```

---

## The problem

You shipped your MCP server. Your observability says it's healthy. But you have no idea which tools models actually reach for, which ones are dead weight, or why users don't come back after their first session.

Logs, traces, dashboards, and replay tools can all help you inspect what happened. They still leave you deciding what matters.

Pathloom sits one layer downstream. It analyzes MCP telemetry and emits findings like:

- which registered tools are truly unused
- which argument patterns are repeatedly confusing models
- which ordered tool paths reliably fail
- which client cohorts underperform
- which first-session tools correlate with return

The niche is not "more MCP analytics." The niche is credibility-first inference over MCP telemetry.

## Why Pathloom is different

Pathloom is built around evidence entitlement. A finding only appears when the dataset supports the claim.

Examples:

- dead-tool findings require an authoritative tool catalog
- activation findings require privacy-safe cross-session actor linkage
- argument mismatch claims narrow automatically based on whether Pathloom can see presence, shapes, or full values
- suppressed findings stay visible so weak evidence does not masquerade as product progress

Every finding also carries the same uncertainty surface across JSON, terminal, and Markdown:

- `Credible finding`: the dataset supports the claim and the observed pattern cleared the emission threshold
- `Candidate-grade signal`: the pattern is promising, but not yet strong enough to promote to a product finding
- `Weak signal`: the dataset could evaluate the claim, but nothing cleared the emission threshold
- `Unsupported`: the dataset could not support the claim the product might otherwise want to make

That evidence-strength block is paired with claim scope:

- `full claim`: Pathloom can make the full product claim
- `narrowed claim`: Pathloom can only make a safer subset of the claim
- `suppressed claim`: Pathloom must abstain from the claim entirely

This behavior is enforced by the analysis contract in [docs/architecture/analysis-contract.md](/Users/a14a/Documents/pathloom/docs/architecture/analysis-contract.md:1) and backed by the credibility and field-validation harnesses in [docs/architecture/credibility-harness.md](/Users/a14a/Documents/pathloom/docs/architecture/credibility-harness.md:1) and [docs/architecture/field-validation.md](/Users/a14a/Documents/pathloom/docs/architecture/field-validation.md:1).

---

## Install

```bash
npm install @precisionutilityguild/pathloom
```

Global CLI (optional):

```bash
npm install -g @precisionutilityguild/pathloom
pathloom --version
```

**Developing Pathloom itself:** clone the repo, then `npm ci && npm run build` and use `npx pathloom` from the repo root.

---

## Release gate

```bash
npx pathloom check
```

`pathloom check` gates **Pathloom's credibility contract** (calibration matrix + frozen goldens like `authoritative_ready` and `demo-pack`) with stable exit codes for CI. Flags: `--calibration-only`, `--golden <scenario>`, `--fail-fast`, `--json-summary`. See [docs/architecture/credibility-harness.md](./docs/architecture/credibility-harness.md).

### GitHub Actions (your MCP server repo)

```yaml
# .github/workflows/pathloom.yml
on: [pull_request, push]
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - run: npm install @precisionutilityguild/pathloom
      - run: |
          npx pathloom import --format logfile --input ./telemetry/events.ndjson \
            --catalog ./telemetry/tool-catalog.json --source logfile:ci --actor-privacy hashed
          npx pathloom analyze --source logfile:ci --markdown > pathloom-report.md
          npx pathloom check
```

This repo runs [`pathloom-check` workflow](.github/workflows/pathloom-check.yml) on every PR. Guide: [docs/guides.md](./docs/guides.md).

After a green `pathloom check`, emit a verifiable certify badge for README shields:

```bash
npx pathloom check --emit-badge > pathloom-certify.json
```

Case study (demo-pack → catalog action): see [docs/strategy.md](./docs/strategy.md) (proof section).

---

## Quickstart

### Option 1 — Import existing telemetry (recommended)

Already have OTel spans or structured MCP logs? This is the default onboarding path—no wrapper required.

```bash
npm run demo-pack:build

npx pathloom import \
  --format logfile \
  --input ./fixtures/demo-pack/authoritative-ready/events.ndjson \
  --catalog ./fixtures/demo-pack/authoritative-ready/tool-catalog.json \
  --source logfile:demo-pack \
  --actor-privacy hashed

npx pathloom analyze --source logfile:demo-pack
```

For your own files, swap paths and use `--format otel` for span exports. You need a **tool catalog** JSON for authoritative dead-tool findings.

Full walkthrough (catalog rules, evidence profiles, sparse/degraded examples, CI fixtures): [docs/guides.md](./docs/guides.md).

Library API equivalent:

```typescript
import { PathloomEngine } from "@precisionutilityguild/pathloom";
import { OTelAdapter } from "@precisionutilityguild/pathloom/otel";

const engine = new PathloomEngine({
  adapter: new OTelAdapter({
    filePath: "./telemetry/mcp-spans.ndjson",
    sourceKey: "otel:local",
    toolCatalog: registeredTools,
  }),
});

const report = engine.analyze();
```

`OTelAdapter` and `LogfileAdapter` accept JSON/NDJSON files. Trace-rich telemetry preserves `traceId`, `spanId`, and `parentSpanId` while keeping `sessionId` distinct; OTel/Langfuse bags stay in provenance unless promoted by contract.

### Option 2 — Wrap your server (greenfield fastest)

Best when you are starting a new MCP server and want one-line capture—**not** the hero path if you already ship OTel or log exports.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withPathloom } from "@precisionutilityguild/pathloom";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

// ... register your tools ...

export default withPathloom(server);
```

Then run:

```bash
npx pathloom analyze
```

For a real-server dogfood run (catalog capture, import, analyze, bundle, snapshot, feedback), see [docs/guides.md](./docs/guides.md) (Real-server dogfood).

For the canonical CI fixture pack, see [docs/guides.md](./docs/guides.md) (demo-pack section).

---

## What it computes

Pathloom doesn't give you charts. It gives you findings: computed from event data, explained in plain language, and scoped to what the evidence can actually support.

Every rendered finding now includes an evidence-strength block so the operator can see both the claim and how hard the dataset is backing it.

### Dead tool detection

Tools registered on your server that appear in zero calls across your session window. Not low-usage. Zero. With confidence thresholds so you don't fire on day one.

```
delete_record — 0 calls across 847 sessions (confidence: high)
→ Remove it, rename it, or fix its description
```

### Sequence risk map

Targeted failure and reusable success paths inside sessions. Pathloom now asks which prefixes reliably precede a specific bad endpoint, which successful paths are reusable, and whether those paths transfer across clients.

```
search → create — reliably precedes create failures; other routes into create stay clean
query → list — reusable success path across repeated sessions  ← golden path
```

### Activation tool report

Which tools, when called in session 1, correlate with users returning for a second observed session. Pathloom now separates candidate return correlates from credible cohort signals and explicitly keeps incremental-effect language out of scope for this surface.

This only emits when Pathloom can link repeat sessions through a privacy-safe actor key. Session IDs alone are deliberately insufficient.

Every activation finding also carries explicit diagnostics:

- linked-cohort association only, not causal lift
- return currently means a second observed session, not time-to-return retention modeling
- confounding risk remains high because exposure is observational rather than randomized

```
Users who called 'query' in session 1: 61% returned
Linked control cohort: 19% returned
→ 'query' is the strongest credible cohort signal in this dataset. Surface it earlier, but do not read it as incremental effect.
```

### Client divergence

How tool selection and success rates differ across MCP clients. Claude Desktop, Cursor, VS Code, and unknown clients often behave very differently on the same server.

```
claude-desktop — avg 4.2 tools/session, 91% success
cursor         — avg 1.8 tools/session, 67% success
→ Your server underperforms in Cursor. Likely a description legibility issue.
```

### Argument mismatch patterns

Where models consistently send wrong or missing arguments. Surfaces prompt-to-tool mismatch without running evals.

```
search   — 'limit' sent as array in 34% of calls (schema says: number)
create   — 'userId' missing in 28% of calls (marked required)
→ These tools are confusing the model. Improve their descriptions or schemas.
```

### Session termination analysis

Which tools end sessions and whether that's a natural exit or a dead end. Tells you where value stops and where you're losing users.

```
Median session length: 3 tools
Most common termination tool: 'list' (42% of sessions end here)
→ Sessions that reach 'query' are 3× longer. 'list' may be a dead end.
```

## Telemetry boundary

Pathloom sits downstream of logs and traces, but it does not become a generic tracing UI.

- canonical first-class telemetry fields:
  - `sessionId`
  - `sessionIdSource`
  - `traceId`
  - `spanId`
  - `parentSpanId`
- preserved in provenance, not promoted to core findings semantics by default:
  - broad OTel attribute bags
  - resource attributes
  - Langfuse prompt, generation, trace, and score metadata
  - imported model or prompt identifiers

That boundary keeps later sequence and activation work honest: trace identity can enrich evidence without silently redefining what a session or actor means.

---

## Architecture

Pathloom is modular. Use the parts you need.

```
pathloom               → withPathloom() wrapper + CLI
pathloom/core          → normalized event schema + analysis engine
pathloom/otel          → ingest from OpenTelemetry spans
pathloom/logfile       → ingest from NDJSON structured logs
pathloom/insights      → the six computed findings
```

### Normalized event schema

Everything Pathloom computes derives from a single event shape:

```typescript
interface MCPEvent {
  actorKey: string | null; // privacy-safe cross-session actor key when available
  actorPrivacy: string | null; // 'hashed' | 'pseudonymous' | null

  serverId: string;
  serverVersion: string;
  sessionId: string; // opaque session identifier
  sourceEventId: string | null;
  clientHint: string; // 'claude-desktop' | 'cursor' | 'vscode' | 'unknown'

  toolName: string;
  invokedAt: number;
  resolvedAt: number;
  outcome: "success" | "error" | "timeout" | "empty-result";

  argumentsProvided: string[];
  argumentsMissing: string[];
  argumentShapes: Record<string, string>;
  positionInSession: number;
  precedingTool: string | null;
  isFirstInSession: boolean;
  resultTokenEstimate: number;
  provenance: Record<string, unknown>;
}
```

Pathloom now exposes this stable contract directly:

```bash
npx pathloom schema event
npx pathloom schema report
npx pathloom schema findings
npx pathloom --version
```

### Storage

SQLite by default. Nothing leaves your machine. Bring your own adapter if you want Postgres, ClickHouse, or anything else.

## Trust model

Pathloom findings are gated by evidence dimensions, not by adapter name.

A source does not become trustworthy just because it is "OTel" or "wrapper" data. Each dataset advertises what evidence it actually contains:

- actor identity quality
- tool catalog authority
- expected schema evidence
- observed argument evidence
- session and ordering provenance
- client hint normalization

Every finding then resolves to one of three states:

- `eligible`: Pathloom can make the full claim
- `narrowed`: Pathloom can make a smaller, safer claim
- `suppressed`: Pathloom must stay quiet

That contract is the real core of the product. See [docs/architecture/analysis-contract.md](/Users/a14a/Documents/pathloom/docs/architecture/analysis-contract.md:1) for the detailed semantics.

---

## Output formats

```bash
npx pathloom analyze              # terminal output
npx pathloom analyze --json       # machine-readable JSON
npx pathloom analyze --markdown   # Markdown report for your docs or PR comments
npx pathloom import --format logfile --input ./events.ndjson --catalog ./tool-catalog.json --source logfile:demo
npx pathloom import --format otel --input ./spans.ndjson --catalog ./tool-catalog.json --source otel:demo
npx pathloom bundle --output ./pathloom-bundle  # share-summary + Markdown + JSON artifact bundle
npx pathloom snapshot --label nightly --output ./pathloom-history  # save a local historical snapshot
npx pathloom diff --source wrapper:demo --markdown  # compare the latest two saved snapshots
npx pathloom feedback --source wrapper:demo --markdown  # review local feedback targets and adjudications
npx pathloom adjudicate --source wrapper:demo --finding dead_tool_detection --item delete_record --status accepted --note "Confirmed after catalog review"
```

For the canonical real-server workflow, run `npm run dogfood:liquid-shadow` and inspect the stable artifact set described in [docs/guides.md](./docs/guides.md).

For the canonical demo/evaluation fixture pack, run `npm run demo-pack:build` and use the demo-pack artifacts described in [docs/guides.md](./docs/guides.md).

## Historical cadence

Pathloom can now save report snapshots locally and diff them over time without storing duplicate raw telemetry.

- `pathloom snapshot` persists the analyzed report document into the local SQLite store
- `pathloom snapshot --output <dir>` also writes a review bundle under a snapshot-specific directory
- `pathloom diff` compares stored snapshots and separates:
  - new findings
  - resolved findings
  - regressed findings
  - evidence changes, such as a finding becoming newly supported or newly suppressed

That last category matters. If a finding disappears because your evidence got weaker, Pathloom reports that as an evidence shift instead of pretending the issue was fixed.

## Operator feedback loop

Pathloom can now turn local adjudications into a review-intelligence loop, not just a storage record.

- `pathloom feedback` shows the latest local snapshot's review targets, aggregates recurring adjudications across stored snapshots for that source, and recommends what to review next
- `pathloom adjudicate` records an operator judgment like:
  - `accepted`
  - `noisy`
  - `misleading`
  - `missing_context`

These adjudications stay on your machine alongside the report snapshots. They are meant to tighten Pathloom's credibility over time:

- repeated `noisy` feedback should trigger threshold review
- repeated `misleading` feedback should trigger wording or suppression review
- repeated `missing_context` feedback should trigger fixture or evidence-model expansion

The feedback surface now also emits:

- recurring adjudication patterns across snapshots for the same source
- reversible ranking hints like "deprioritize or tighten" versus "stabilize or promote"
- wording and evidence-gap alerts
- a concrete next-review target with a suggested follow-up action

The workflow and privacy posture are documented in [docs/architecture/review-loop.md](./docs/architecture/review-loop.md).

---

## What Pathloom is not

**Not a replacement for observability.** Grafana, Datadog, and OTel still handle uptime, latency, and error tracking. Pathloom sits downstream of them.

**Not a replacement for session replay.** Pathloom is about pattern detection and product inference across sessions, not replaying one session at a time.

**Not a platform.** No account. No dashboard (yet). No data leaving your infrastructure unless you choose.

Pathloom is the layer between your telemetry and your decisions.

---

## Why local-first

Your tool call data encodes your users' query patterns, workflow details, and product behavior. We don't think you should send that to a third party by default. Pathloom runs entirely on your machine. If you later want scheduling, team sharing, historical diffing, or org-wide views, a hosted layer can come. But the intelligence engine itself is the product — not a teaser for a SaaS dashboard.

---

## Roadmap

Pathloom is executing a **credibility gate pivot** (claim safety + CI + import-first onboarding). See [docs/strategy.md](./docs/strategy.md) for positioning, competitive contrast, proof, and 90-day success metrics.

Engine roadmap themes (inference hardening, sequence mining, operator feedback) are summarized in [docs/strategy.md](./docs/strategy.md) (Roadmap section).

---

## Field validation workflow

Pathloom's credibility bar should be tested on real operator-shaped data, not just synthetic demos. The repository now includes a field-validation harness built around scrubbed-equivalent datasets that model:

- an authoritative multi-client server with clear onboarding and activation patterns
- a partial-evidence logfile feed where Pathloom must narrow or suppress claims
- an underpowered launch-week dataset where Pathloom should stay quiet

Run it with:

```bash
npm run test:field-validation
```

The workflow, review rubric, and scenario definitions are documented in [docs/architecture/field-validation.md](/Users/a14a/Documents/pathloom/docs/architecture/field-validation.md:1). The goal is to verify not just whether a finding appears, but whether it is evidence-entitled, operator-actionable, and worded credibly enough to trust.

---

## Development

The repository is now on a staged TypeScript migration path: source files can keep moving from CommonJS JavaScript to TypeScript incrementally, while the publish surface is verified against compiled artifacts in `dist/`.

Useful commands:

```bash
npm run build
npm run typecheck
npm run verify:package-contract
```

The build contract, module strategy, and publish verification rules are documented in [docs/architecture/typescript-foundation.md](/Users/a14a/Documents/pathloom/docs/architecture/typescript-foundation.md:1).

---

## Contributing

The findings are the hard part. If you run Pathloom on your server and a finding is wrong, misleading, or missing, open an issue. The goal is findings that are credible enough that you act on them without second-guessing.

---

## License

MIT
