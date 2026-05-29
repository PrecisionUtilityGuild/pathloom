"use strict";

const { SOURCE_KINDS, createDatasetProfile } = require("@precisionutilityguild/pathloom/core");

const directWrapperFixture = createDatasetProfile({
  sourceKind: SOURCE_KINDS.WRAPPER,
  actorIdentity: {
    mode: "stable_actor",
    privacy: "hashed",
  },
  toolCatalog: {
    authority: "runtime_registration",
    completeness: "authoritative",
  },
  schemaEvidence: {
    expectedSchema: "runtime_schema",
    observedArguments: "full_values",
  },
  provenance: {
    sessionization: "explicit_session_id",
    eventOrder: "per_session_order",
    lifecycleOutcomes: "full_lifecycle",
    clientHints: "normalized",
  },
  telemetrySpine: {
    firstClassFields: [],
    importedMetadata: {
      aiModelIdentity: "none",
      aiPromptIdentity: "none",
      externalAttributeBags: "none",
      langfuseSurfaces: "none",
    },
    spanLineage: "none",
    traceIdentity: "none",
  },
});

const logfilePresenceOnlyFixture = createDatasetProfile({
  sourceKind: SOURCE_KINDS.LOGFILE,
  actorIdentity: {
    mode: "session_only",
    privacy: "none",
  },
  toolCatalog: {
    authority: "none",
    completeness: "none",
  },
  schemaEvidence: {
    expectedSchema: "declared_contract",
    observedArguments: "presence_only",
  },
  provenance: {
    sessionization: "explicit_session_id",
    eventOrder: "per_session_order",
    lifecycleOutcomes: "final_outcome",
    clientHints: "none",
  },
  telemetrySpine: {
    firstClassFields: [],
    importedMetadata: {
      aiModelIdentity: "none",
      aiPromptIdentity: "none",
      externalAttributeBags: "none",
      langfuseSurfaces: "none",
    },
    spanLineage: "none",
    traceIdentity: "none",
  },
});

const otelWithCatalogFixture = createDatasetProfile({
  sourceKind: SOURCE_KINDS.OTEL,
  actorIdentity: {
    mode: "session_only",
    privacy: "none",
  },
  toolCatalog: {
    authority: "external_catalog",
    completeness: "authoritative",
  },
  schemaEvidence: {
    expectedSchema: "manifest_schema",
    observedArguments: "shape_only",
  },
  provenance: {
    sessionization: "derived_session",
    eventOrder: "per_session_order",
    lifecycleOutcomes: "final_outcome",
    clientHints: "normalized",
  },
  telemetrySpine: {
    firstClassFields: ["traceId", "spanId", "parentSpanId"],
    importedMetadata: {
      aiModelIdentity: "provenance_only",
      aiPromptIdentity: "provenance_only",
      externalAttributeBags: "provenance_only",
      langfuseSurfaces: "provenance_only",
    },
    spanLineage: "first_class",
    traceIdentity: "first_class",
  },
});

const invalidRawActorFixture = createDatasetProfile({
  sourceKind: SOURCE_KINDS.CUSTOM,
  actorIdentity: {
    mode: "stable_actor",
    privacy: "raw",
  },
  toolCatalog: {
    authority: "explicit_manifest",
    completeness: "authoritative",
  },
  schemaEvidence: {
    expectedSchema: "declared_contract",
    observedArguments: "full_values",
  },
  provenance: {
    sessionization: "explicit_session_id",
    eventOrder: "per_session_order",
    lifecycleOutcomes: "full_lifecycle",
    clientHints: "normalized",
  },
  telemetrySpine: {
    firstClassFields: [],
    importedMetadata: {
      aiModelIdentity: "none",
      aiPromptIdentity: "none",
      externalAttributeBags: "none",
      langfuseSurfaces: "none",
    },
    spanLineage: "none",
    traceIdentity: "none",
  },
});

export {
  directWrapperFixture,
  invalidRawActorFixture,
  logfilePresenceOnlyFixture,
  otelWithCatalogFixture,
};
