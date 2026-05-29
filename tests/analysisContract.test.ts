"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CLAIMS,
  FINDINGS,
  evaluateFindingSupport,
  summarizeDatasetReadiness,
  validateDatasetProfile,
} = require("@precisionutilityguild/pathloom/core");

const {
  directWrapperFixture,
  invalidRawActorFixture,
  logfilePresenceOnlyFixture,
  otelWithCatalogFixture,
} = require("../fixtures/analysisContractFixtures.js");

test("direct wrapper datasets unlock all README findings", () => {
  const evaluation = evaluateFindingSupport(directWrapperFixture);
  const readiness = summarizeDatasetReadiness(directWrapperFixture);

  assert.equal(evaluation.valid, true);
  assert.equal(readiness.readiness, "full");

  for (const finding of Object.values(FINDINGS) as string[]) {
    assert.equal(evaluation.findings[finding].status, "eligible");
  }

  assert.deepEqual(evaluation.findings[FINDINGS.ACTIVATION].allowedClaims, [
    CLAIMS.ACTIVATION_CORRELATIONS,
  ]);
});

test("presence-only logfile datasets narrow mismatch claims and suppress unsupported findings", () => {
  const evaluation = evaluateFindingSupport(logfilePresenceOnlyFixture);
  const readiness = summarizeDatasetReadiness(logfilePresenceOnlyFixture);

  assert.equal(evaluation.valid, true);
  assert.equal(readiness.readiness, "partial");
  assert.equal(evaluation.findings[FINDINGS.DEAD_TOOLS].status, "suppressed");
  assert.equal(evaluation.findings[FINDINGS.ARGUMENT_MISMATCH].status, "narrowed");
  assert.deepEqual(evaluation.findings[FINDINGS.ARGUMENT_MISMATCH].allowedClaims, [
    CLAIMS.MISSING_REQUIRED_ARGUMENTS,
  ]);
  assert.equal(evaluation.findings[FINDINGS.SESSION_TERMINATION].status, "eligible");
  assert.equal(evaluation.findings[FINDINGS.CLIENT_DIVERGENCE].status, "suppressed");
  assert.equal(evaluation.findings[FINDINGS.ACTIVATION].status, "suppressed");
});

test("OTel datasets can support dead-tool and sequence findings when an authoritative catalog is supplied", () => {
  const evaluation = evaluateFindingSupport(otelWithCatalogFixture);

  assert.equal(evaluation.valid, true);
  assert.equal(evaluation.findings[FINDINGS.DEAD_TOOLS].status, "eligible");
  assert.equal(evaluation.findings[FINDINGS.SEQUENCE_RISK].status, "eligible");
  assert.equal(evaluation.findings[FINDINGS.CLIENT_DIVERGENCE].status, "eligible");
  assert.equal(evaluation.findings[FINDINGS.ACTIVATION].status, "suppressed");
  assert.ok(
    evaluation.findings[FINDINGS.ARGUMENT_MISMATCH].allowedClaims.includes(
      CLAIMS.WRONG_ARGUMENT_TYPE_OR_SHAPE,
    ),
  );
});

test("raw actor identity is rejected as an invalid retention architecture", () => {
  const issues = validateDatasetProfile(invalidRawActorFixture);
  const readiness = summarizeDatasetReadiness(invalidRawActorFixture);

  assert.ok(
    issues.includes("Stable actor identity must be privacy-safe (hashed or pseudonymous)."),
  );
  assert.equal(readiness.readiness, "invalid");
});
