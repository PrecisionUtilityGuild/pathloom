# Strategy

This doc is the “why Pathloom exists” entrypoint. It replaces:

- `pathloom-pivot.md`
- `pathloom-roadmap.md`
- `research-sources.md`
- `case-study-pathloom-gate.md`

## Elevator pitch

**One sentence:** Pathloom is a local-first credibility gate that turns MCP telemetry into evidence-entitled product findings you can ship in CI—not another MCP dashboard.

**One paragraph:** Teams already instrument MCP servers with wrappers, OTel exporters, or log pipelines. Dashboards and replay tools show what happened; they do not tell you which product claims your data actually supports. Pathloom sits downstream of observability and upstream of product decisions. It ingests telemetry you already have, applies calibration-backed abstention and frozen goldens, and emits bounded findings (dead tools, risky sequences, activation correlates, client divergence) only when the dataset is entitled to support them. Suppression and narrowed claims are features: they keep weak evidence from masquerading as progress. The goal is claim safety in release workflows, not charts.

## Who buys / who doesn’t

**Primary:** MCP server maintainer (schema/tools decisions)  
**Secondary:** Platform/DX engineer (CI gate, no extra SaaS)  
**Secondary:** AI product lead (cohorts/activation without causal overclaiming)

Not buyers (today): SRE dashboards, session replay buyers, hosted analytics buyers.

## Competitive contrast (short)

Pathloom isn’t competing to *collect* telemetry; it competes on **what claims you’re allowed to make** after collection.

- Yavio/MCPcat: instrumentation + hosted product workflows
- MCPulse/Grafana: observability/monitoring
- MCP Inspector: protocol debugging
- Pathloom: calibration + abstention + frozen goldens + analysis contract

## 90-day scorecard

**Pivot start:** 2026-05-27  
**Next review:** 2026-08-25

| Metric | Baseline | 90-day target |
| --- | ---: | ---: |
| External repos running `pathloom check` in CI | 0 | ≥3 |
| Workflow reuse signal | 0 | ≥10 stars or 3 forks |
| Inbound issues mentioning claim safety / gate | 0 | ≥5 |
| npm weekly downloads | 0 | ≥100 |
| Case study / blog published | 0 | 1 |
| Certify badges emitted (`--emit-badge`) | 0 | ≥10 |

## Case study (proof, reproducible)

The proof path is grounded in the demo pack (not slide-deck fiction):

- demo-pack: `fixtures/demo-pack/authoritative-ready/`
- proof artifacts: `proof/pathloom-proof/` (report.json, report.md, check-summary.json, certify-badge.json)

Reproduce:

```bash
bash scripts/capture-proof-artifacts.sh
```

Example operator action from the demo pack:

- Dead tools flagged with catalog authority (`bulk_export`, `delete_record`) → remove/demote from catalog or improve descriptions
- Argument mismatches (`create.userId`, `search.limit`) → fix schema friction
- Client divergence (Cursor) → tighten Cursor-facing tool descriptions/examples

## Roadmap (short)

0. Credibility gate pivot (market + CI + import-first)  
1. Product clarity + dogfooding (proof machinery)  
2. Inference hardening  
3. Telemetry foundation  
4. Sequence/failure mining  
5. Activation/retention honesty  
6. Operator-guided learning loops

If you want the implementation details, the architecture entrypoints are:

- `docs/architecture/v1-surface.md`
- `docs/architecture/analysis-contract.md`
- `docs/architecture/credibility-harness.md`

## Research sources (minimal)

Keep this short; use it only when it changes what we build next:

- Conformal risk control (abstention discipline): Angelopoulos et al., 2022
- Targeted sequential pattern mining (sequence mining): Huang et al., 2022
- Uplift / causal cautions (activation wording): Gutierrez & Gerardy, 2017; Alaa & van der Schaar, 2018

