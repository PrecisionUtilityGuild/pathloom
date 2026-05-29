# Pathloom Ingestion Spine

Mission 3 turns the trust contract into a real local ingestion backbone.

## What exists now

- [src/core/store.ts](/Users/a14a/Documents/pathloom/src/core/store.ts:1)
  A versioned local SQLite store backed by `better-sqlite3`.
- [src/core/ingestEngine.ts](/Users/a14a/Documents/pathloom/src/core/ingestEngine.ts:1)
  A source-agnostic ingest engine that writes canonical events and authoritative tool catalogs.
- [src/core/wrapper.ts](/Users/a14a/Documents/pathloom/src/core/wrapper.ts:1)
  A direct server wrapper that records runtime tool registration and invocation lifecycle.
- [src/core/normalization.ts](/Users/a14a/Documents/pathloom/src/core/normalization.ts:1)
  The normalization layer that preserves provenance and argument-shape evidence.

## Design intent

Mission 2 established that Pathloom findings depend on what a dataset is actually entitled to prove.

Mission 3 carries that into storage:

- each dataset stores its capability profile and readiness summary
- tool registration is stored separately from invocation history
- invocation events preserve session order, preceding tool, outcome, argument evidence, and provenance
- invocation events preserve trace identity and span lineage without collapsing them into session identity
- wrapper and adapter ingestion land in the same canonical schema

## Schema overview

### `datasets`

One row per ingest source.

Each row stores:

- `source_key`
- `source_kind`
- `profile_json`
- `readiness_json`

This is what lets later findings know whether a dataset supports dead-tool claims, activation claims, or only narrower partial findings.

### `tool_catalog_entries`

Authoritative tool inventory entries are stored independently from usage.

This is how Pathloom avoids equating "not observed" with "not registered."

### `invocation_events`

Canonical per-tool events store:

- server metadata
- actor linkage metadata
- session metadata
- session identity source metadata
- trace and span lineage metadata
- normalized client hints
- argument payload and shape evidence
- within-session sequence position
- provenance details

## Adapter seam

`PathloomIngestEngine` is intentionally source-agnostic:

- wrapper mode can register runtime catalogs and write full lifecycle events
- future OTel/logfile adapters can declare weaker or different capability profiles
- all sources still land in the same local SQLite contract

This means mission 7 can add OTel and logfile adapters without redesigning the store.

---

## External adapters (OTel + logfile)

For a full import-first walkthrough (CLI commands, catalog authority, evidence profiles, CI fixtures), see [`docs/guides.md`](../guides.md).

Pathloom ships two first-party ingestion adapters:

- `pathloom/otel`
- `pathloom/logfile`

They exist to reuse existing telemetry without weakening Pathloom's evidence model.

### Shared adapter contract

Each adapter:

- materializes into the same local SQLite store as wrapper mode
- registers one canonical dataset with a capability profile
- optionally registers an authoritative external tool catalog
- emits stable `sourceEventId` values so repeated materialization stays idempotent

The engine can run directly against an adapter:

```js
const engine = new PathloomEngine({
  adapter: new OTelAdapter({ filePath, toolCatalog }),
});

const analysis = engine.analyze();
```

### OTel adapter

`OTelAdapter` consumes exported spans from arrays, JSON, or NDJSON files. It maps common OTel attribute shapes into Pathloom's canonical invocation event:

- tool name
- explicit or trace-fallback session identity
- first-class `traceId`
- first-class `spanId`
- first-class `parentSpanId`
- normalized client hint
- outcome
- arguments
- server id/version
- provenance-preserved OTel and Langfuse metadata

Default profile behavior:

- source kind: `otel`
- sessionization: `derived_session`
- trace identity: `first_class`
- span lineage: `first_class`
- tool catalog authority: `external_catalog` when supplied

### Logfile adapter

`LogfileAdapter` consumes structured invocation logs from arrays, JSON, or NDJSON files.

Default profile behavior:

- source kind: `logfile`
- sessionization: `explicit_session_id`
- observed arguments inferred from the log payload
- trace identity and span lineage become first-class only when the log actually provides them
- tool catalog authority stays `none` unless a catalog is supplied

### Design consequence

Adapters do not get to declare findings by source type alone. They only declare capabilities. The analysis contract decides what claims Pathloom is allowed to make afterward.

They also do not get to redefine Pathloom's product model. Trace structure can arrive through adapters, but generic attribute bags and Langfuse-specific surfaces stay in event provenance unless Pathloom later promotes them explicitly.
