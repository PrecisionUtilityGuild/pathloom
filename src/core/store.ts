"use strict";

import fs = require("node:fs");
import path = require("node:path");
import Database = require("better-sqlite3");

import { summarizeDatasetReadiness, validateDatasetProfile } from "./analysisContract";
import type {
  AdjudicationRecord,
  DatasetProfile,
  DatasetRecord,
  InvocationEventRecord,
  PersistedInvocationEvent,
  ToolCatalogEntry,
} from "./types";

export const CURRENT_SCHEMA_VERSION = 4;

interface DatasetRow {
  created_at: number;
  id: number;
  profile_json: string;
  readiness_json: string;
  source_key: string;
  source_kind: string;
  updated_at: number;
}

interface AdjudicationRow {
  adjudication_status: string;
  created_at: number;
  finding_id: string;
  note: string | null;
  snapshot_key: string;
  source_key: string;
  target_id: string;
  target_kind: string;
  target_label: string;
  updated_at: number;
}

interface ReportSnapshotRecord {
  capturedAt: string;
  label?: string | null;
  reportVersion: string;
  snapshotKey: string;
  sourceKey: string;
  [key: string]: unknown;
}

function ensureParentDirectory(filename?: string) {
  if (!filename || filename === ":memory:") {
    return;
  }

  fs.mkdirSync(path.dirname(filename), { recursive: true });
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  return JSON.parse(value);
}

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function mapDatasetRow(row: DatasetRow): DatasetRecord {
  return {
    createdAt: row.created_at,
    id: row.id,
    profile: parseJson(row.profile_json, {} as DatasetProfile),
    readiness: parseJson(row.readiness_json, {
      readiness: "invalid",
      eligibleFindings: [],
      narrowedFindings: [],
      suppressedFindings: [],
      validationIssues: [],
    }),
    sourceKey: row.source_key,
    sourceKind: row.source_kind,
    updatedAt: row.updated_at,
  };
}

function mapAdjudicationRow(row: AdjudicationRow): AdjudicationRecord {
  return {
    adjudicationStatus: row.adjudication_status,
    createdAt: new Date(row.created_at).toISOString(),
    findingId: row.finding_id,
    note: row.note,
    snapshotKey: row.snapshot_key,
    sourceKey: row.source_key,
    targetId: row.target_id,
    targetKind: row.target_kind,
    targetLabel: row.target_label,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export class PathloomStore {
  filename: string;
  db: Database.Database;
  statements!: Record<string, Database.Statement>;

  constructor(options: { filename?: string } = {}) {
    this.filename = options.filename || path.join(process.cwd(), ".pathloom", "pathloom.db");

    ensureParentDirectory(this.filename);
    this.db = new Database(this.filename);
    this.migrate();
    this.prepareStatements();
  }

  migrate() {
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pathloom_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS datasets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_key TEXT NOT NULL UNIQUE,
        source_kind TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        readiness_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tool_catalog_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        server_id TEXT NOT NULL,
        server_version TEXT NOT NULL,
        schema_source TEXT,
        schema_json TEXT,
        registered_at INTEGER NOT NULL,
        UNIQUE(dataset_id, tool_name),
        FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS invocation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id INTEGER NOT NULL,
        source_event_id TEXT,
        server_id TEXT NOT NULL,
        server_version TEXT NOT NULL,
        actor_key TEXT,
        actor_privacy TEXT,
        session_id TEXT NOT NULL,
        session_id_source TEXT NOT NULL DEFAULT 'unknown',
        trace_id TEXT,
        span_id TEXT,
        parent_span_id TEXT,
        client_hint TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        invoked_at INTEGER NOT NULL,
        resolved_at INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        arguments_json TEXT,
        arguments_provided_json TEXT NOT NULL,
        arguments_missing_json TEXT NOT NULL,
        argument_shapes_json TEXT NOT NULL,
        position_in_session INTEGER NOT NULL,
        preceding_tool TEXT,
        is_first_in_session INTEGER NOT NULL,
        result_token_estimate INTEGER NOT NULL DEFAULT 0,
        provenance_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_invocation_source_event
      ON invocation_events(dataset_id, source_event_id);

      CREATE INDEX IF NOT EXISTS idx_invocation_dataset_session
      ON invocation_events(dataset_id, session_id, position_in_session);

      CREATE INDEX IF NOT EXISTS idx_invocation_dataset_trace
      ON invocation_events(dataset_id, trace_id, invoked_at);

      CREATE TABLE IF NOT EXISTS report_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_key TEXT NOT NULL UNIQUE,
        source_key TEXT NOT NULL,
        label TEXT,
        captured_at INTEGER NOT NULL,
        report_version TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_report_snapshots_source_time
      ON report_snapshots(source_key, captured_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS finding_adjudications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_key TEXT NOT NULL,
        source_key TEXT NOT NULL,
        finding_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_kind TEXT NOT NULL,
        target_label TEXT NOT NULL,
        adjudication_status TEXT NOT NULL,
        note TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(snapshot_key, target_id)
      );

      CREATE INDEX IF NOT EXISTS idx_finding_adjudications_snapshot
      ON finding_adjudications(snapshot_key, updated_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_finding_adjudications_source
      ON finding_adjudications(source_key, updated_at DESC, id DESC);
    `);

    if (!hasColumn(this.db, "invocation_events", "session_id_source")) {
      this.db.exec(
        "ALTER TABLE invocation_events ADD COLUMN session_id_source TEXT NOT NULL DEFAULT 'unknown';",
      );
    }

    if (!hasColumn(this.db, "invocation_events", "trace_id")) {
      this.db.exec("ALTER TABLE invocation_events ADD COLUMN trace_id TEXT;");
    }

    if (!hasColumn(this.db, "invocation_events", "span_id")) {
      this.db.exec("ALTER TABLE invocation_events ADD COLUMN span_id TEXT;");
    }

    if (!hasColumn(this.db, "invocation_events", "parent_span_id")) {
      this.db.exec("ALTER TABLE invocation_events ADD COLUMN parent_span_id TEXT;");
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_invocation_dataset_trace
      ON invocation_events(dataset_id, trace_id, invoked_at);
    `);

    this.db
      .prepare(
        `
        INSERT INTO pathloom_meta (key, value)
        VALUES ('schema_version', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      )
      .run(String(CURRENT_SCHEMA_VERSION));
  }

  prepareStatements() {
    this.statements = {
      datasetBySourceKey: this.db.prepare(`
        SELECT id, source_key, source_kind, profile_json, readiness_json, created_at, updated_at
        FROM datasets
        WHERE source_key = ?
      `),
      datasets: this.db.prepare(`
        SELECT id, source_key, source_kind, profile_json, readiness_json, created_at, updated_at
        FROM datasets
        ORDER BY source_key ASC
      `),
      eventRows: this.db.prepare(`
        SELECT *
        FROM invocation_events
        WHERE dataset_id = ?
        ORDER BY session_id ASC, position_in_session ASC, id ASC
      `),
      insertEvent: this.db.prepare(`
        INSERT INTO invocation_events (
          dataset_id,
          source_event_id,
          server_id,
          server_version,
          actor_key,
          actor_privacy,
          session_id,
          session_id_source,
          trace_id,
          span_id,
          parent_span_id,
          client_hint,
          tool_name,
          invoked_at,
          resolved_at,
          outcome,
          arguments_json,
          arguments_provided_json,
          arguments_missing_json,
          argument_shapes_json,
          position_in_session,
          preceding_tool,
          is_first_in_session,
          result_token_estimate,
          provenance_json,
          created_at
        ) VALUES (
          @datasetId,
          @sourceEventId,
          @serverId,
          @serverVersion,
          @actorKey,
          @actorPrivacy,
          @sessionId,
          @sessionIdSource,
          @traceId,
          @spanId,
          @parentSpanId,
          @clientHint,
          @toolName,
          @invokedAt,
          @resolvedAt,
          @outcome,
          @argumentsJson,
          @argumentsProvidedJson,
          @argumentsMissingJson,
          @argumentShapesJson,
          @positionInSession,
          @precedingTool,
          @isFirstInSession,
          @resultTokenEstimate,
          @provenanceJson,
          @createdAt
        )
        ON CONFLICT(dataset_id, source_event_id) DO NOTHING
      `),
      listCatalogRows: this.db.prepare(`
        SELECT *
        FROM tool_catalog_entries
        WHERE dataset_id = ?
        ORDER BY tool_name ASC
      `),
      latestReportSnapshotsBySource: this.db.prepare(`
        SELECT *
        FROM report_snapshots
        WHERE source_key = ?
        ORDER BY captured_at DESC, id DESC
      `),
      listAdjudicationsBySnapshot: this.db.prepare(`
        SELECT *
        FROM finding_adjudications
        WHERE snapshot_key = ?
        ORDER BY updated_at DESC, id DESC
      `),
      listAdjudicationsBySource: this.db.prepare(`
        SELECT *
        FROM finding_adjudications
        WHERE source_key = ?
        ORDER BY updated_at DESC, id DESC
      `),
      reportSnapshotByKey: this.db.prepare(`
        SELECT *
        FROM report_snapshots
        WHERE snapshot_key = ?
      `),
      insertReportSnapshot: this.db.prepare(`
        INSERT INTO report_snapshots (
          snapshot_key,
          source_key,
          label,
          captured_at,
          report_version,
          snapshot_json,
          created_at
        ) VALUES (
          @snapshotKey,
          @sourceKey,
          @label,
          @capturedAt,
          @reportVersion,
          @snapshotJson,
          @createdAt
        )
        ON CONFLICT(snapshot_key) DO UPDATE SET
          label = excluded.label,
          captured_at = excluded.captured_at,
          report_version = excluded.report_version,
          snapshot_json = excluded.snapshot_json
      `),
      upsertAdjudication: this.db.prepare(`
        INSERT INTO finding_adjudications (
          snapshot_key,
          source_key,
          finding_id,
          target_id,
          target_kind,
          target_label,
          adjudication_status,
          note,
          created_at,
          updated_at
        ) VALUES (
          @snapshotKey,
          @sourceKey,
          @findingId,
          @targetId,
          @targetKind,
          @targetLabel,
          @adjudicationStatus,
          @note,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(snapshot_key, target_id) DO UPDATE SET
          source_key = excluded.source_key,
          finding_id = excluded.finding_id,
          target_kind = excluded.target_kind,
          target_label = excluded.target_label,
          adjudication_status = excluded.adjudication_status,
          note = excluded.note,
          updated_at = excluded.updated_at
      `),
      upsertCatalogEntry: this.db.prepare(`
        INSERT INTO tool_catalog_entries (
          dataset_id,
          tool_name,
          server_id,
          server_version,
          schema_source,
          schema_json,
          registered_at
        ) VALUES (
          @datasetId,
          @toolName,
          @serverId,
          @serverVersion,
          @schemaSource,
          @schemaJson,
          @registeredAt
        )
        ON CONFLICT(dataset_id, tool_name) DO UPDATE SET
          server_id = excluded.server_id,
          server_version = excluded.server_version,
          schema_source = excluded.schema_source,
          schema_json = excluded.schema_json,
          registered_at = excluded.registered_at
      `),
      upsertDataset: this.db.prepare(`
        INSERT INTO datasets (
          source_key,
          source_kind,
          profile_json,
          readiness_json,
          created_at,
          updated_at
        ) VALUES (
          @sourceKey,
          @sourceKind,
          @profileJson,
          @readinessJson,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(source_key) DO UPDATE SET
          source_kind = excluded.source_kind,
          profile_json = excluded.profile_json,
          readiness_json = excluded.readiness_json,
          updated_at = excluded.updated_at
      `),
    };
  }

  upsertDataset({
    profile,
    sourceKey,
    sourceKind,
  }: {
    profile: DatasetProfile;
    sourceKey: string;
    sourceKind: string;
  }): DatasetRecord | null {
    const validationIssues = validateDatasetProfile(profile);

    if (validationIssues.length > 0) {
      throw new Error(`Invalid dataset profile for ${sourceKey}: ${validationIssues.join(" ")}`);
    }

    const now = Date.now();
    const readiness = summarizeDatasetReadiness(profile);

    this.statements.upsertDataset.run({
      createdAt: now,
      profileJson: JSON.stringify(profile),
      readinessJson: JSON.stringify(readiness),
      sourceKey,
      sourceKind,
      updatedAt: now,
    });

    return this.getDataset(sourceKey);
  }

  getDataset(sourceKey: string): DatasetRecord | null {
    const row = this.statements.datasetBySourceKey.get(sourceKey) as DatasetRow | undefined;

    if (!row) {
      return null;
    }

    return mapDatasetRow(row);
  }

  listDatasets() {
    return this.statements.datasets.all().map(mapDatasetRow);
  }

  saveReportSnapshot(snapshot: ReportSnapshotRecord) {
    const capturedAt = Date.parse(snapshot.capturedAt);
    const createdAt = Date.now();

    this.statements.insertReportSnapshot.run({
      capturedAt,
      createdAt,
      label: snapshot.label,
      reportVersion: snapshot.reportVersion,
      snapshotJson: JSON.stringify(snapshot),
      snapshotKey: snapshot.snapshotKey,
      sourceKey: snapshot.sourceKey,
    });

    return this.getReportSnapshot(snapshot.snapshotKey);
  }

  getReportSnapshot(snapshotKey: string) {
    const row = this.statements.reportSnapshotByKey.get(snapshotKey) as
      | { snapshot_json: string }
      | undefined;

    if (!row) {
      return null;
    }

    return parseJson(row.snapshot_json, null);
  }

  listReportSnapshots(sourceKey: string) {
    return this.statements.latestReportSnapshotsBySource
      .all(sourceKey)
      .map((row) => parseJson(row.snapshot_json, null))
      .filter(Boolean);
  }

  saveAdjudication(record: AdjudicationRecord) {
    this.statements.upsertAdjudication.run({
      adjudicationStatus: record.adjudicationStatus,
      createdAt: Date.parse(record.createdAt),
      findingId: record.findingId,
      note: record.note,
      snapshotKey: record.snapshotKey,
      sourceKey: record.sourceKey,
      targetId: record.targetId,
      targetKind: record.targetKind,
      targetLabel: record.targetLabel,
      updatedAt: Date.parse(record.updatedAt),
    });

    return this.listAdjudications(record.snapshotKey).find(
      (saved) => saved.targetId === record.targetId,
    );
  }

  listAdjudications(snapshotKey: string): AdjudicationRecord[] {
    return (this.statements.listAdjudicationsBySnapshot.all(snapshotKey) as AdjudicationRow[]).map(
      mapAdjudicationRow,
    );
  }

  listAdjudicationsForSource(sourceKey: string): AdjudicationRecord[] {
    return (this.statements.listAdjudicationsBySource.all(sourceKey) as AdjudicationRow[]).map(
      mapAdjudicationRow,
    );
  }

  registerToolCatalogEntries(sourceKey: string, entries: ToolCatalogEntry[]) {
    const dataset = this.getDataset(sourceKey);

    if (!dataset) {
      throw new Error(`Unknown dataset: ${sourceKey}`);
    }

    const writeEntries = this.db.transaction((catalogEntries: ToolCatalogEntry[]) => {
      for (const entry of catalogEntries) {
        this.statements.upsertCatalogEntry.run({
          datasetId: dataset.id,
          registeredAt: entry.registeredAt,
          schemaJson: entry.schema ? JSON.stringify(entry.schema) : null,
          schemaSource: entry.schemaSource,
          serverId: entry.serverId,
          serverVersion: entry.serverVersion,
          toolName: entry.toolName,
        });
      }
    });

    writeEntries(entries);
  }

  appendInvocationEvents(sourceKey: string, events: PersistedInvocationEvent[]) {
    const dataset = this.getDataset(sourceKey);

    if (!dataset) {
      throw new Error(`Unknown dataset: ${sourceKey}`);
    }

    const writeEvents = this.db.transaction((normalizedEvents: PersistedInvocationEvent[]) => {
      for (const event of normalizedEvents) {
        this.statements.insertEvent.run({
          ...event,
          createdAt: Date.now(),
          datasetId: dataset.id,
        });
      }
    });

    writeEvents(events);
  }

  listToolCatalog(sourceKey: string): ToolCatalogEntry[] {
    const dataset = this.getDataset(sourceKey);

    if (!dataset) {
      return [];
    }

    return (this.statements.listCatalogRows.all(dataset.id) as any[]).map((row) => ({
      registeredAt: Number(row.registered_at),
      schema: parseJson(row.schema_json, null),
      schemaSource: row.schema_source ?? null,
      serverId: String(row.server_id),
      serverVersion: String(row.server_version),
      toolName: String(row.tool_name),
    }));
  }

  listInvocationEvents(sourceKey: string): InvocationEventRecord[] {
    const dataset = this.getDataset(sourceKey);

    if (!dataset) {
      return [];
    }

    return (this.statements.eventRows.all(dataset.id) as any[]).map((row) => ({
      actorKey: row.actor_key ?? null,
      actorPrivacy: row.actor_privacy ?? null,
      arguments: parseJson(row.arguments_json, null),
      argumentShapes: parseJson(row.argument_shapes_json, {}),
      argumentsMissing: parseJson(row.arguments_missing_json, []),
      argumentsProvided: parseJson(row.arguments_provided_json, []),
      clientHint: String(row.client_hint),
      invokedAt: Number(row.invoked_at),
      isFirstInSession: Boolean(row.is_first_in_session),
      outcome: String(row.outcome),
      positionInSession: Number(row.position_in_session),
      precedingTool: row.preceding_tool ?? null,
      provenance: parseJson(row.provenance_json, {}),
      resolvedAt: Number(row.resolved_at),
      resultTokenEstimate: Number(row.result_token_estimate),
      serverId: String(row.server_id),
      serverVersion: String(row.server_version),
      sessionId: String(row.session_id),
      sessionIdSource: String(row.session_id_source),
      spanId: row.span_id ?? null,
      sourceEventId: row.source_event_id ?? null,
      toolName: String(row.tool_name),
      traceId: row.trace_id ?? null,
      parentSpanId: row.parent_span_id ?? null,
    }));
  }

  close() {
    this.db.close();
  }
}
