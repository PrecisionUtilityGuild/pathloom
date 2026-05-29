"use strict";

import { FINDINGS, evaluateFindingSupport } from "../core/analysisContract";
import type {
  AnalysisContextInput,
  AnalysisResult,
  AnalysisThresholds,
  Finding,
} from "../core/types";
import { createFindingUncertainty } from "../uncertainty";

export const DEFAULT_THRESHOLDS = Object.freeze({
  deadToolsMinSessions: 5,
  deadToolsHighConfidenceSessions: 25,
  deadToolsMediumConfidenceSessions: 10,
  mismatchMinObservations: 3,
  mismatchMinProvidedObservations: 2,
  mismatchMinOccurrences: 2,
  mismatchMinRate: 0.25,
  terminationCandidateMinSessions: 2,
  terminationMinSessions: 4,
  terminationMinRate: 0.5,
  sequenceMinDistinctObservations: 3,
  sequenceMinPeerObservations: 3,
  sequenceMaxLength: 3,
  sequenceMinErrorLift: 0.25,
  sequenceMinTerminalErrorLift: 0.15,
  sequenceMinErrorRate: 0.6,
  sequenceMinSuccessLift: 0.15,
  sequenceMinTerminalSuccessLift: 0.1,
  sequenceMinSuccessRate: 0.85,
  sequenceDeepMaxLength: 4,
  sequenceDeepMinDistinctObservations: 6,
  sequenceDeepMinErrorLift: 0.32,
  sequenceDeepMinOutcomeEvents: 150,
  sequenceDeepMinPeerObservations: 14,
  sequenceDeepMinSessions: 30,
  sequenceDeepMinSuccessLift: 0.22,
  sequenceDeepMinTerminalErrorLift: 0.2,
  sequenceDeepMinTerminalSuccessLift: 0.15,
  clientMinComparableSessions: 2,
  clientMinDistinctClients: 2,
  clientMinSuccessGap: 0.2,
  clientMinToolsGap: 0.75,
  clientToolMinObservations: 3,
  clientToolMinErrorRate: 0.5,
  clientToolErrorGap: 0.3,
  activationMinLinkedActors: 10,
  activationCandidateMinExposedActors: 4,
  activationCandidateMinControlActors: 4,
  activationCredibleMinExposedActors: 5,
  activationCredibleMinControlActors: 5,
  activationMinReturnedActors: 3,
  activationCandidateMinReturnRateDelta: 0.2,
  activationCredibleMinReturnRateDelta: 0.25,
  activationCandidateMinReturnRateMultiplier: 2,
  activationCredibleMinReturnRateMultiplier: 2,
} satisfies AnalysisThresholds);

function median(values) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function getSessionMap(events) {
  const sessions = new Map();

  for (const event of events) {
    const sessionId = event.sessionId || "unknown-session";

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }

    sessions.get(sessionId).push(event);
  }

  for (const sessionEvents of sessions.values()) {
    sessionEvents.sort((left, right) => left.positionInSession - right.positionInSession);
  }

  return sessions;
}

function getActorJourneys(events) {
  const actorSessions = new Map();

  for (const event of events) {
    if (typeof event.actorKey !== "string" || event.actorKey.length === 0) {
      continue;
    }

    if (!actorSessions.has(event.actorKey)) {
      actorSessions.set(event.actorKey, new Map());
    }

    const sessions = actorSessions.get(event.actorKey);
    const sessionId = event.sessionId || "unknown-session";

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }

    sessions.get(sessionId).push(event);
  }

  return new Map(
    [...actorSessions.entries()].map(([actorKey, sessions]) => [
      actorKey,
      [...sessions.entries()]
        .map(([sessionId, sessionEvents]) => {
          const sortedEvents = [...sessionEvents].sort(
            (left, right) => left.positionInSession - right.positionInSession,
          );
          const tools = [...new Set(sortedEvents.map((event) => event.toolName))];

          return {
            events: sortedEvents,
            firstInvokedAt: sortedEvents[0]?.invokedAt || 0,
            sessionId,
            tools,
          };
        })
        .sort((left, right) => left.firstInvokedAt - right.firstInvokedAt),
    ]),
  );
}

function getToolSchemaMap(toolCatalog) {
  const schemaMap = new Map();

  for (const entry of toolCatalog) {
    schemaMap.set(entry.toolName, entry.schema || null);
  }

  return schemaMap;
}

function getEventsByTool(events) {
  const eventsByTool = new Map();

  for (const event of events) {
    if (!eventsByTool.has(event.toolName)) {
      eventsByTool.set(event.toolName, []);
    }

    eventsByTool.get(event.toolName).push(event);
  }

  return eventsByTool;
}

function normalizeExpectedTypes(schema) {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const types = Array.isArray(schema.type) ? schema.type : [schema.type].filter(Boolean);

  return types.flatMap((type) => {
    if (type === "integer") {
      return ["number"];
    }

    if (type === "array") {
      const itemTypes = normalizeExpectedTypes(schema.items);
      if (itemTypes.length === 0) {
        return ["array"];
      }

      return itemTypes.map((itemType) => `array:${itemType}`);
    }

    return [type];
  });
}

function shapeMatchesExpected(expectedTypes, observedShape) {
  if (expectedTypes.length === 0) {
    return true;
  }

  return expectedTypes.some((expectedType) => {
    if (expectedType === "array") {
      return observedShape === "array" || observedShape.startsWith("array:");
    }

    if (expectedType.startsWith("array:")) {
      return observedShape === expectedType || observedShape === "array:empty";
    }

    return observedShape === expectedType;
  });
}

function scoreSeverity(severity) {
  switch (severity) {
    case "warning":
      return 3;
    case "info":
      return 2;
    default:
      return 1;
  }
}

function createSuppressedFinding({ blockedBy = [], id, reason, support, title }) {
  return {
    blockedBy: [...(support?.blockedBy || []), ...blockedBy],
    id,
    items: [],
    recommendation: null,
    score: 0,
    severity: "info",
    status: "suppressed",
    summary: reason || support?.rationale || "Finding is not supported by this dataset.",
    support,
    title,
  } satisfies Finding;
}

function createClearFinding({
  evidence = {},
  id,
  items = [],
  recommendation = null,
  support,
  title,
  summary,
}) {
  return {
    evidence,
    id,
    items,
    recommendation,
    score: 1,
    severity: "clear",
    status: "clear",
    summary,
    support,
    title,
  } satisfies Finding;
}

function confidenceFromSessionCount(sessionCount, thresholds) {
  if (sessionCount >= thresholds.deadToolsHighConfidenceSessions) {
    return "high";
  }

  if (sessionCount >= thresholds.deadToolsMediumConfidenceSessions) {
    return "medium";
  }

  return "low";
}

function isFailureOutcome(outcome) {
  return outcome === "error" || outcome === "timeout";
}

function isSuccessOutcome(outcome) {
  return outcome === "success" || outcome === "empty-result";
}

function toSequenceLabel(sequence) {
  return sequence.join(" -> ");
}

function roundMetric(value) {
  return Number(value.toFixed(2));
}

function wilsonInterval(successes, trials, z = 1.96) {
  if (trials === 0) {
    return {
      lower: 0,
      upper: 0,
    };
  }

  const p = successes / trials;
  const zSquared = z * z;
  const denominator = 1 + zSquared / trials;
  const center = (p + zSquared / (2 * trials)) / denominator;
  const margin =
    (z / denominator) * Math.sqrt((p * (1 - p)) / trials + zSquared / (4 * trials * trials));

  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

function createRateStat() {
  return {
    clientHints: new Set(),
    errorCount: 0,
    observationCount: 0,
    sequenceKeys: new Set(),
    sessionIds: new Set(),
    successCount: 0,
  };
}

function suffixKeyForSequence(sequence) {
  return sequence.slice(1).join(">");
}

function createSequenceWindowStat(sequence) {
  return {
    clientHints: new Set(),
    errorCount: 0,
    observationCount: 0,
    sequence,
    sessionIds: new Set(),
    successCount: 0,
  };
}

function listClientHints(clientHints) {
  return [...clientHints].sort();
}

function createClientSpread(clientHints) {
  const normalizedClients = listClientHints(clientHints);

  return {
    clientHints: normalizedClients,
    transferableClientCount: normalizedClients.length,
    transferability: normalizedClients.length > 1 ? "cross_client" : "single_client",
  };
}

function sequencePeerLabel(sequence) {
  if (sequence.length <= 2) {
    return `other routes into ${sequence[sequence.length - 1]}`;
  }

  return `other routes into ${toSequenceLabel(sequence.slice(1))}`;
}

function endpointQuestion(terminalTool, pathKind) {
  if (pathKind === "risky_sequence") {
    return `What reliably precedes ${terminalTool} failures?`;
  }

  return `What reusable path reliably lands ${terminalTool} success?`;
}

function endpointLabel(terminalTool, pathKind) {
  return pathKind === "risky_sequence"
    ? `${terminalTool} failure endpoint`
    : `${terminalTool} success endpoint`;
}

function buildPeerSequenceLabels(sequenceKeys, currentKey, sequenceStats, limit = 3) {
  return [...sequenceKeys]
    .filter((key) => key !== currentKey)
    .map((key) => sequenceStats.get(key))
    .filter(Boolean)
    .sort((left, right) => right.observationCount - left.observationCount)
    .slice(0, limit)
    .map((stat) => toSequenceLabel(stat.sequence));
}

function buildSequencePeerCohorts({
  currentKey,
  pathKind,
  peerObservationCount,
  peerRate,
  sequence,
  sequenceStats,
  suffixBucket,
  terminalPeerObservationCount,
  terminalPeerRate,
  terminalTool,
}) {
  return {
    matchedSuffixPeers: {
      label: sequencePeerLabel(sequence),
      observationCount: peerObservationCount,
      rate: pathKind === "risky_sequence" ? roundMetric(peerRate) : roundMetric(peerRate),
      sequenceLabels: buildPeerSequenceLabels(suffixBucket.sequenceKeys, currentKey, sequenceStats),
    },
    terminalToolPeers: {
      label: `other routes ending at ${terminalTool}`,
      observationCount: terminalPeerObservationCount,
      rate: roundMetric(terminalPeerRate),
    },
  };
}

function buildSequenceTrajectoryContext({
  pathKind,
  peerObservationCount,
  sequence,
  suffixBucket,
  terminalTool,
}) {
  const windowLength = sequence.length;
  const suffixTailIntoTerminal = sequence.slice(1);
  const tailKey = suffixTailIntoTerminal.join(">") || "_direct_";
  const familyId = `terminal:${terminalTool}:suffix_tail:${tailKey}:len:${windowLength}:${pathKind}`;

  return {
    cohortSemantics:
      "ordered_paths_sharing_terminal_tool_and_suffix_peer_bucket_excludes_focus_path",
    familyDistinctPathCount: suffixBucket.sequenceKeys.size,
    familyId,
    familyLabel: sequencePeerLabel(sequence),
    peerObservationCount,
    suffixBucketObservationCount: suffixBucket.observationCount,
    windowLength,
  };
}

function summarizeActivationReturnTiming(linkedActors) {
  const returnGaps = [];
  let immediateNextSessionReturns = 0;
  let returningActorCount = 0;
  let sustainedMultiSessionReturns = 0;

  for (const sessions of linkedActors) {
    if (sessions.length < 2) {
      continue;
    }

    returningActorCount += 1;

    if (sessions.length === 2) {
      immediateNextSessionReturns += 1;
    }

    if (sessions.length >= 3) {
      sustainedMultiSessionReturns += 1;
    }

    returnGaps.push(sessions[1].firstInvokedAt - sessions[0].firstInvokedAt);
  }

  return {
    immediateNextSessionReturns,
    medianInvokedAtGapToReturn: returnGaps.length > 0 ? roundMetric(median(returnGaps)) : null,
    returningActorCount,
    sustainedMultiSessionReturns,
  };
}

function buildActivationDiagnostics(linkedActors) {
  const linkedActorCount = linkedActors.length;
  const returnTiming = summarizeActivationReturnTiming(linkedActors);

  return {
    actorLinkage: {
      linkedActorCount,
      requirement: "privacy_safe_stable_actor",
      status: linkedActorCount > 0 ? "observed" : "missing",
    },
    comparisonBasis: "first_session_exposure_vs_skip_within_linked_actor_cohorts",
    confoundingRisk: {
      level: "high",
      reasons: [
        "tool exposure is observational rather than randomized",
        "actors who use a tool may differ from the control cohort before exposure",
        "invoked-at gaps are descriptive timing only, not elapsed-time causal windows",
      ],
    },
    interpretation: "linked_cohort_association_only",
    returnWindow: {
      aggregate: returnTiming,
      claimBoundary: "not_incremental_effect_not_causal",
      kind: "next_observed_session",
      label: "second_observed_session",
      timingMode: "session_order_plus_invoked_at_gap",
      explanation:
        "Return means the actor had a later observed session. Pathloom also reports immediate (exactly two sessions) vs sustained (three or more) return shapes and median invoked-at gap between first and second sessions when timestamps exist. This is still observational — not incremental lift or causal timing.",
    },
    signalTaxonomy: {
      candidate: "candidate_return_correlate",
      credible: "credible_cohort_signal",
      future: "incremental_effect_estimate",
    },
  };
}

function buildActivationCohortContext({
  controlActors,
  controlReturnRate,
  exposedReturnRate,
  stat,
  toolName,
}) {
  const immediateNextSessionReturns = stat.exposedReturnedActors - stat.exposedSustainedReturns;

  return {
    cohortSemantics: "first_session_exposure_vs_linked_control_without_exposure",
    comparisonId: `activation:${toolName}:first_session_exposure`,
    controlActorCount: controlActors,
    controlCohortLabel: `linked actors without ${toolName} in their first observed session`,
    controlReturnRate: roundMetric(controlReturnRate),
    exposedActorCount: stat.exposedActors,
    exposureCohortLabel: `linked actors who invoked ${toolName} in their first observed session`,
    exposedReturnRate: roundMetric(exposedReturnRate),
    returnWindow: {
      immediateNextSessionReturns,
      kind: "next_observed_session",
      label: "second_observed_session",
      medianInvokedAtGapToReturn:
        stat.returnGaps.length > 0 ? roundMetric(median(stat.returnGaps)) : null,
      sustainedMultiSessionReturns: stat.exposedSustainedReturns,
    },
  };
}

function analyzeDeadToolDetection(context, support, thresholds) {
  if (support.status === "suppressed") {
    return createSuppressedFinding({
      id: FINDINGS.DEAD_TOOLS,
      reason: support.rationale,
      support,
      title: "Dead tools",
    });
  }

  if (context.sessionCount < thresholds.deadToolsMinSessions) {
    return createSuppressedFinding({
      blockedBy: ["insufficient_session_count"],
      id: FINDINGS.DEAD_TOOLS,
      reason:
        "Dead-tool findings stay quiet until the dataset has enough sessions to avoid day-one false positives.",
      support,
      title: "Dead tools",
    });
  }

  const usageCountByTool = new Map();

  for (const event of context.events) {
    usageCountByTool.set(event.toolName, (usageCountByTool.get(event.toolName) || 0) + 1);
  }

  const confidence = confidenceFromSessionCount(context.sessionCount, thresholds);
  const items = context.toolCatalog
    .filter((entry) => !usageCountByTool.has(entry.toolName))
    .map((entry) => ({
      callCount: 0,
      confidence,
      serverId: entry.serverId,
      serverVersion: entry.serverVersion,
      toolName: entry.toolName,
    }));

  if (items.length === 0) {
    return createClearFinding({
      evidence: {
        catalogSize: context.toolCatalog.length,
        sessionCount: context.sessionCount,
      },
      id: FINDINGS.DEAD_TOOLS,
      summary:
        "Every tool in the authoritative catalog was exercised at least once in the analysis window.",
      support,
      title: "Dead tools",
    });
  }

  return {
    evidence: {
      catalogSize: context.toolCatalog.length,
      confidence,
      sessionCount: context.sessionCount,
    },
    id: FINDINGS.DEAD_TOOLS,
    items,
    recommendation:
      "Remove these tools, rename them, or improve their descriptions before adding more surface area.",
    score: 20 + items.length * 5,
    severity: "warning",
    status: "ready",
    summary: `${items.length} registered tool${items.length === 1 ? "" : "s"} had zero calls across ${context.sessionCount} session${context.sessionCount === 1 ? "" : "s"}.`,
    support,
    title: `Dead tools (${items.length})`,
  };
}

function analyzeArgumentMismatchPatterns(context, support, thresholds) {
  if (support.status === "suppressed") {
    return createSuppressedFinding({
      id: FINDINGS.ARGUMENT_MISMATCH,
      reason: support.rationale,
      support,
      title: "Argument mismatch patterns",
    });
  }

  const allowedClaims = new Set(support.allowedClaims);
  const schemaByTool = getToolSchemaMap(context.toolCatalog);
  const eventsByTool = getEventsByTool(context.events);
  const items = [];

  for (const [toolName, schema] of schemaByTool.entries()) {
    if (!schema || typeof schema !== "object") {
      continue;
    }

    const toolEvents = eventsByTool.get(toolName) || [];
    if (toolEvents.length < thresholds.mismatchMinObservations) {
      continue;
    }

    const properties = schema.properties || {};
    const required = schema.required || [];

    if (allowedClaims.has("missing_required_arguments")) {
      for (const argumentName of required) {
        let missingCount = 0;

        for (const event of toolEvents) {
          const args = event.arguments || {};
          const missingList = event.argumentsMissing || [];
          const isMissing =
            !Object.hasOwn(args, argumentName) || missingList.includes(argumentName);

          if (isMissing) {
            missingCount += 1;
          }
        }

        const missingRate = missingCount / toolEvents.length;
        if (
          missingCount >= thresholds.mismatchMinOccurrences &&
          missingRate >= thresholds.mismatchMinRate
        ) {
          items.push({
            argumentName,
            issueType: "missing_required_argument",
            mismatchCount: missingCount,
            mismatchRate: Number(missingRate.toFixed(2)),
            observationCount: toolEvents.length,
            recommendation:
              "Clarify this argument in the tool description or make the schema easier for models to satisfy.",
            toolName,
          });
        }
      }
    }

    if (allowedClaims.has("wrong_argument_type_or_shape")) {
      for (const [argumentName, propertySchema] of Object.entries(properties)) {
        const expectedTypes = normalizeExpectedTypes(propertySchema);
        if (expectedTypes.length === 0) {
          continue;
        }

        let exposureCount = 0;
        let mismatchCount = 0;
        let observedExample = null;

        for (const event of toolEvents) {
          const args = event.arguments || {};
          if (!Object.hasOwn(args, argumentName)) {
            continue;
          }

          exposureCount += 1;
          const observedShape = event.argumentShapes?.[argumentName] || typeof args[argumentName];
          if (!shapeMatchesExpected(expectedTypes, observedShape)) {
            mismatchCount += 1;
            observedExample = observedExample || observedShape;
          }
        }

        if (exposureCount < thresholds.mismatchMinProvidedObservations) {
          continue;
        }

        const mismatchRate = mismatchCount / exposureCount;
        if (
          mismatchCount >= thresholds.mismatchMinOccurrences &&
          mismatchRate >= thresholds.mismatchMinRate
        ) {
          items.push({
            argumentName,
            expected: expectedTypes.join(" | "),
            issueType: "wrong_argument_type_or_shape",
            mismatchCount,
            mismatchRate: Number(mismatchRate.toFixed(2)),
            observationCount: exposureCount,
            observedExample,
            recommendation:
              "Models are sending the wrong shape here. Tighten the schema wording or simplify the accepted shape.",
            totalToolObservations: toolEvents.length,
            toolName,
          });
        }
      }
    }

    if (allowedClaims.has("invalid_argument_value")) {
      for (const [argumentName, propertySchema] of Object.entries(properties)) {
        const enumValues = Array.isArray((propertySchema as { enum?: unknown[] }).enum)
          ? (propertySchema as { enum?: unknown[] }).enum
          : [];

        if (enumValues.length === 0) {
          continue;
        }

        let exposureCount = 0;
        let invalidCount = 0;
        let observedExample = null;

        for (const event of toolEvents) {
          const args = event.arguments || {};
          if (!Object.hasOwn(args, argumentName)) {
            continue;
          }

          exposureCount += 1;
          if (!enumValues.includes(args[argumentName])) {
            invalidCount += 1;
            observedExample = observedExample || args[argumentName];
          }
        }

        if (exposureCount < thresholds.mismatchMinProvidedObservations) {
          continue;
        }

        const mismatchRate = invalidCount / exposureCount;
        if (
          invalidCount >= thresholds.mismatchMinOccurrences &&
          mismatchRate >= thresholds.mismatchMinRate
        ) {
          items.push({
            argumentName,
            expected: enumValues.join(" | "),
            issueType: "invalid_argument_value",
            mismatchCount: invalidCount,
            mismatchRate: Number(mismatchRate.toFixed(2)),
            observationCount: exposureCount,
            observedExample,
            recommendation:
              "This argument value is drifting outside the intended enum. Make the allowed values more legible to models.",
            totalToolObservations: toolEvents.length,
            toolName,
          });
        }
      }
    }
  }

  items.sort((left, right) => {
    if (right.mismatchRate !== left.mismatchRate) {
      return right.mismatchRate - left.mismatchRate;
    }

    return right.mismatchCount - left.mismatchCount;
  });

  if (items.length === 0) {
    return createClearFinding({
      evidence: {
        supportMode: support.status,
        toolsObserved: schemaByTool.size,
      },
      id: FINDINGS.ARGUMENT_MISMATCH,
      summary:
        support.status === "narrowed"
          ? "The dataset only supports a narrowed mismatch view, and no recurring missing-argument patterns crossed the emission threshold."
          : "No recurring argument confusion patterns crossed the emission threshold.",
      support,
      title: "Argument mismatch patterns",
    });
  }

  return {
    evidence: {
      supportMode: support.status,
      toolsObserved: schemaByTool.size,
    },
    id: FINDINGS.ARGUMENT_MISMATCH,
    items,
    recommendation:
      "Improve the descriptions or schemas for the highest-rate mismatches before shipping more tools around them.",
    score: 15 + items.length * 4,
    severity: "warning",
    status: "ready",
    summary:
      support.status === "narrowed"
        ? `${items.length} recurring missing-argument pattern${items.length === 1 ? "" : "s"} crossed the emission threshold.`
        : `${items.length} recurring argument mismatch pattern${items.length === 1 ? "" : "s"} crossed the emission threshold.`,
    support,
    title: `Argument mismatch patterns (${items.length})`,
  };
}

function analyzeSessionTermination(context, support, thresholds) {
  if (support.status === "suppressed") {
    return createSuppressedFinding({
      id: FINDINGS.SESSION_TERMINATION,
      reason: support.rationale,
      support,
      title: "Session termination analysis",
    });
  }

  if (context.sessionCount < thresholds.terminationMinSessions) {
    return createSuppressedFinding({
      blockedBy: ["insufficient_session_count"],
      id: FINDINGS.SESSION_TERMINATION,
      reason:
        "Termination analysis stays quiet until enough sessions exist to distinguish dead ends from noise.",
      support,
      title: "Session termination analysis",
    });
  }

  const reachedByTool = new Map();
  const endedByTool = new Map();
  const sessionLengths = [];
  const lengthsByTerminationTool = new Map();
  const sessions = getSessionMap(context.events);

  for (const sessionEvents of sessions.values()) {
    sessionLengths.push(sessionEvents.length);
    const seenTools = new Set();

    for (const event of sessionEvents) {
      if (!seenTools.has(event.toolName)) {
        seenTools.add(event.toolName);
        reachedByTool.set(event.toolName, (reachedByTool.get(event.toolName) || 0) + 1);
      }
    }

    const terminationTool = sessionEvents[sessionEvents.length - 1].toolName;
    endedByTool.set(terminationTool, (endedByTool.get(terminationTool) || 0) + 1);

    if (!lengthsByTerminationTool.has(terminationTool)) {
      lengthsByTerminationTool.set(terminationTool, []);
    }

    lengthsByTerminationTool.get(terminationTool).push(sessionEvents.length);
  }

  const overallMedian = median(sessionLengths);
  const items = [];
  let topTerminationTool = null;
  let topTerminationCount = 0;

  for (const [toolName, endedSessions] of endedByTool.entries()) {
    const sessionsReachingTool = reachedByTool.get(toolName) || 0;
    const terminationRate = sessionsReachingTool === 0 ? 0 : endedSessions / sessionsReachingTool;

    if (endedSessions > topTerminationCount) {
      topTerminationCount = endedSessions;
      topTerminationTool = toolName;
    }

    if (
      endedSessions < thresholds.terminationCandidateMinSessions ||
      terminationRate < thresholds.terminationMinRate
    ) {
      continue;
    }

    const toolMedianLength = median(lengthsByTerminationTool.get(toolName) || []);
    const classification =
      terminationRate >= 0.75 && toolMedianLength <= overallMedian
        ? "possible_dead_end"
        : "likely_natural_exit";

    items.push({
      classification,
      medianSessionLengthAtTermination: toolMedianLength,
      sessionsEndingHere: endedSessions,
      sessionsReachingTool,
      terminationRate: Number(terminationRate.toFixed(2)),
      toolName,
    });
  }

  items.sort((left, right) => {
    if (right.terminationRate !== left.terminationRate) {
      return right.terminationRate - left.terminationRate;
    }

    return right.sessionsEndingHere - left.sessionsEndingHere;
  });

  if (items.length === 0) {
    return createClearFinding({
      evidence: {
        medianSessionLength: overallMedian,
        sessionCount: context.sessionCount,
        topTerminationTool,
      },
      id: FINDINGS.SESSION_TERMINATION,
      summary:
        "Pathloom observed session endings, but no tool crossed the dead-end emission threshold strongly enough to report.",
      support,
      title: "Session termination analysis",
    });
  }

  const topItem = items[0];

  return {
    evidence: {
      medianSessionLength: overallMedian,
      sessionCount: context.sessionCount,
      topTerminationTool,
    },
    id: FINDINGS.SESSION_TERMINATION,
    items,
    recommendation:
      topItem.classification === "possible_dead_end"
        ? "Shorten the path into a successful next action after this tool, or make the expected follow-up clearer."
        : "Double-check whether these session endings are intentional completions or a sign the tool is acting like a stopping point.",
    score: 12 + items.length * 3,
    severity: "warning",
    status: "ready",
    summary: `${topTerminationTool} was the most common termination tool, and ${items.filter((item) => item.classification === "possible_dead_end").length || 0} candidate dead-end pattern${items.length === 1 ? "" : "s"} crossed the emission threshold.`,
    support,
    title: `Session termination analysis (${items.length})`,
  };
}

function analyzeSequenceRisk(context, support, thresholds) {
  if (support.status === "suppressed") {
    return createSuppressedFinding({
      id: FINDINGS.SEQUENCE_RISK,
      reason: support.rationale,
      support,
      title: "Sequence risk map",
    });
  }

  const baselineSample = context.events.filter((event) => event.outcome);
  const baselineErrorRate =
    baselineSample.length === 0
      ? 0
      : baselineSample.filter((event) => isFailureOutcome(event.outcome)).length /
        baselineSample.length;
  const baselineSuccessRate =
    baselineSample.length === 0
      ? 0
      : baselineSample.filter((event) => isSuccessOutcome(event.outcome)).length /
        baselineSample.length;
  const outcomeEventCount = baselineSample.length;
  const sequenceDeepMaxLength = thresholds.sequenceDeepMaxLength ?? thresholds.sequenceMaxLength;
  const allowDeepSequenceWindows =
    sequenceDeepMaxLength > thresholds.sequenceMaxLength &&
    context.sessionCount >= (thresholds.sequenceDeepMinSessions ?? 30) &&
    outcomeEventCount >= (thresholds.sequenceDeepMinOutcomeEvents ?? 150);
  const maxWindowLength = allowDeepSequenceWindows
    ? sequenceDeepMaxLength
    : thresholds.sequenceMaxLength;
  const sequenceStats = new Map();
  const suffixBuckets = new Map();
  const terminalStats = new Map();
  let totalSequenceObservations = 0;

  for (const event of context.events) {
    if (!event.outcome) {
      continue;
    }

    if (!terminalStats.has(event.toolName)) {
      terminalStats.set(event.toolName, createRateStat());
    }

    const stat = terminalStats.get(event.toolName);
    stat.clientHints.add(event.clientHint);
    stat.observationCount += 1;
    stat.sessionIds.add(event.sessionId);

    if (isFailureOutcome(event.outcome)) {
      stat.errorCount += 1;
    }

    if (isSuccessOutcome(event.outcome)) {
      stat.successCount += 1;
    }
  }

  for (const [sessionId, sessionEvents] of context.sessions.entries()) {
    for (let length = 2; length <= maxWindowLength; length += 1) {
      if (sessionEvents.length < length) {
        continue;
      }

      for (let index = 0; index <= sessionEvents.length - length; index += 1) {
        const window = sessionEvents.slice(index, index + length);
        const sequence = window.map((event) => event.toolName);
        const key = sequence.join(">");
        const suffixKey = suffixKeyForSequence(sequence);
        const terminalEvent = window[window.length - 1];

        if (!sequenceStats.has(key)) {
          sequenceStats.set(key, createSequenceWindowStat(sequence));
        }

        const suffixBucketKey = `${length}:${suffixKey}`;
        if (!suffixBuckets.has(suffixBucketKey)) {
          suffixBuckets.set(suffixBucketKey, createRateStat());
        }

        const stat = sequenceStats.get(key);
        const suffixStat = suffixBuckets.get(suffixBucketKey);
        stat.clientHints.add(terminalEvent.clientHint);
        stat.observationCount += 1;
        stat.sessionIds.add(sessionId);
        suffixStat.clientHints.add(terminalEvent.clientHint);
        suffixStat.observationCount += 1;
        suffixStat.sequenceKeys.add(key);
        suffixStat.sessionIds.add(sessionId);
        totalSequenceObservations += 1;

        if (isFailureOutcome(terminalEvent.outcome)) {
          stat.errorCount += 1;
          suffixStat.errorCount += 1;
        }

        if (isSuccessOutcome(terminalEvent.outcome)) {
          stat.successCount += 1;
          suffixStat.successCount += 1;
        }
      }
    }
  }

  if (totalSequenceObservations < thresholds.sequenceMinDistinctObservations) {
    return createSuppressedFinding({
      blockedBy: ["insufficient_sequence_observations"],
      id: FINDINGS.SEQUENCE_RISK,
      reason:
        "Sequence findings stay quiet until Pathloom has enough repeated ordered paths to compare against baseline behavior.",
      support,
      title: "Sequence risk map",
    });
  }

  const items = [];

  for (const stat of sequenceStats.values()) {
    const isDeepOnlyWindow =
      allowDeepSequenceWindows && stat.sequence.length > thresholds.sequenceMaxLength;
    const minDistinctObs = isDeepOnlyWindow
      ? (thresholds.sequenceDeepMinDistinctObservations ?? thresholds.sequenceMinDistinctObservations)
      : thresholds.sequenceMinDistinctObservations;
    const minPeerObs = isDeepOnlyWindow
      ? (thresholds.sequenceDeepMinPeerObservations ?? thresholds.sequenceMinPeerObservations)
      : thresholds.sequenceMinPeerObservations;
    const minErrorLift = isDeepOnlyWindow
      ? (thresholds.sequenceDeepMinErrorLift ?? thresholds.sequenceMinErrorLift)
      : thresholds.sequenceMinErrorLift;
    const minTerminalErrorLift = isDeepOnlyWindow
      ? (thresholds.sequenceDeepMinTerminalErrorLift ?? thresholds.sequenceMinTerminalErrorLift)
      : thresholds.sequenceMinTerminalErrorLift;
    const minSuccessLift = isDeepOnlyWindow
      ? (thresholds.sequenceDeepMinSuccessLift ?? thresholds.sequenceMinSuccessLift)
      : thresholds.sequenceMinSuccessLift;
    const minTerminalSuccessLift = isDeepOnlyWindow
      ? (thresholds.sequenceDeepMinTerminalSuccessLift ?? thresholds.sequenceMinTerminalSuccessLift)
      : thresholds.sequenceMinTerminalSuccessLift;

    if (stat.observationCount < minDistinctObs) {
      continue;
    }

    const suffixKey = suffixKeyForSequence(stat.sequence);
    const suffixBucket = suffixBuckets.get(`${stat.sequence.length}:${suffixKey}`);
    const terminalTool = stat.sequence[stat.sequence.length - 1];
    const terminalBucket = terminalStats.get(terminalTool);

    if (!suffixBucket || !terminalBucket) {
      continue;
    }

    const peerObservationCount = suffixBucket.observationCount - stat.observationCount;
    const terminalPeerObservationCount = terminalBucket.observationCount - stat.observationCount;

    if (peerObservationCount < minPeerObs || terminalPeerObservationCount < minPeerObs) {
      continue;
    }

    const errorRate = stat.errorCount / stat.observationCount;
    const successRate = stat.successCount / stat.observationCount;
    const peerErrorRate = (suffixBucket.errorCount - stat.errorCount) / peerObservationCount;
    const peerSuccessRate = (suffixBucket.successCount - stat.successCount) / peerObservationCount;
    const terminalPeerErrorRate =
      (terminalBucket.errorCount - stat.errorCount) / terminalPeerObservationCount;
    const terminalPeerSuccessRate =
      (terminalBucket.successCount - stat.successCount) / terminalPeerObservationCount;
    const errorLift = errorRate - peerErrorRate;
    const successLift = successRate - peerSuccessRate;
    const terminalErrorLift = errorRate - terminalPeerErrorRate;
    const terminalSuccessLift = successRate - terminalPeerSuccessRate;
    const prefix = stat.sequence.slice(0, -1);
    const prefixLabel = toSequenceLabel(prefix);
    const clientSpread = createClientSpread(stat.clientHints);

    if (
      errorRate >= thresholds.sequenceMinErrorRate &&
      errorLift >= minErrorLift &&
      terminalErrorLift >= minTerminalErrorLift
    ) {
      items.push({
        baselineErrorRate: roundMetric(peerErrorRate),
        baselineKind: "matched_suffix_peers",
        clientSpread,
        errorLift: roundMetric(errorLift),
        errorRate: roundMetric(errorRate),
        endpoint: {
          label: endpointLabel(terminalTool, "risky_sequence"),
          question: endpointQuestion(terminalTool, "risky_sequence"),
          terminalTool,
          type: "failure_endpoint",
        },
        globalBaselineErrorRate: roundMetric(baselineErrorRate),
        observationCount: stat.observationCount,
        pathKind: "risky_sequence",
        peerObservationCount,
        peerCohorts: buildSequencePeerCohorts({
          currentKey: `${stat.sequence.join(">")}`,
          pathKind: "risky_sequence",
          peerObservationCount,
          peerRate: peerErrorRate,
          sequence: stat.sequence,
          sequenceStats,
          suffixBucket,
          terminalPeerObservationCount,
          terminalPeerRate: terminalPeerErrorRate,
          terminalTool,
        }),
        prefix,
        prefixLabel,
        prefixLength: prefix.length,
        sequence: stat.sequence,
        sequenceLabel: toSequenceLabel(stat.sequence),
        sessionCount: stat.sessionIds.size,
        terminalToolBaselineErrorRate: roundMetric(terminalPeerErrorRate),
        terminalToolErrorLift: roundMetric(terminalErrorLift),
        trajectoryContext: buildSequenceTrajectoryContext({
          pathKind: "risky_sequence",
          peerObservationCount,
          sequence: stat.sequence,
          suffixBucket,
          terminalTool,
        }),
      });
      continue;
    }

    if (
      successRate >= thresholds.sequenceMinSuccessRate &&
      successLift >= minSuccessLift &&
      terminalSuccessLift >= minTerminalSuccessLift
    ) {
      items.push({
        baselineKind: "matched_suffix_peers",
        baselineSuccessRate: roundMetric(peerSuccessRate),
        clientSpread,
        endpoint: {
          label: endpointLabel(terminalTool, "golden_path"),
          question: endpointQuestion(terminalTool, "golden_path"),
          terminalTool,
          type: "success_endpoint",
        },
        globalBaselineSuccessRate: roundMetric(baselineSuccessRate),
        observationCount: stat.observationCount,
        pathKind: "golden_path",
        peerObservationCount,
        peerCohorts: buildSequencePeerCohorts({
          currentKey: `${stat.sequence.join(">")}`,
          pathKind: "golden_path",
          peerObservationCount,
          peerRate: peerSuccessRate,
          sequence: stat.sequence,
          sequenceStats,
          suffixBucket,
          terminalPeerObservationCount,
          terminalPeerRate: terminalPeerSuccessRate,
          terminalTool,
        }),
        prefix,
        prefixLabel,
        prefixLength: prefix.length,
        sequence: stat.sequence,
        sequenceLabel: toSequenceLabel(stat.sequence),
        sessionCount: stat.sessionIds.size,
        successLift: roundMetric(successLift),
        successRate: roundMetric(successRate),
        terminalToolBaselineSuccessRate: roundMetric(terminalPeerSuccessRate),
        terminalToolSuccessLift: roundMetric(terminalSuccessLift),
        trajectoryContext: buildSequenceTrajectoryContext({
          pathKind: "golden_path",
          peerObservationCount,
          sequence: stat.sequence,
          suffixBucket,
          terminalTool,
        }),
      });
    }
  }

  items.sort((left, right) => {
    const leftRisk = left.pathKind === "risky_sequence" ? 1 : 0;
    const rightRisk = right.pathKind === "risky_sequence" ? 1 : 0;

    if (rightRisk !== leftRisk) {
      return rightRisk - leftRisk;
    }

    const leftDelta =
      left.pathKind === "risky_sequence" ? left.errorLift || 0 : left.successLift || 0;
    const rightDelta =
      right.pathKind === "risky_sequence" ? right.errorLift || 0 : right.successLift || 0;

    if (rightDelta !== leftDelta) {
      return rightDelta - leftDelta;
    }

    return right.observationCount - left.observationCount;
  });

  if (items.length === 0) {
    return createClearFinding({
      evidence: {
        baselineErrorRate: Number(baselineErrorRate.toFixed(2)),
        baselineSuccessRate: Number(baselineSuccessRate.toFixed(2)),
        sequencePatternsObserved: sequenceStats.size,
      },
      id: FINDINGS.SEQUENCE_RISK,
      summary:
        "Pathloom observed enough ordered paths to evaluate targeted failure endpoints and reusable success paths, but no sequence signal crossed the emission threshold.",
      support,
      title: "Sequence risk map",
    });
  }

  const riskyCount = items.filter((item) => item.pathKind === "risky_sequence").length;
  const goldenCount = items.filter((item) => item.pathKind === "golden_path").length;
  const crossClientGoldenCount = items.filter(
    (item) =>
      item.pathKind === "golden_path" && item.clientSpread.transferability === "cross_client",
  ).length;

  return {
    evidence: {
      baselineErrorRate: Number(baselineErrorRate.toFixed(2)),
      crossClientReusablePathCount: crossClientGoldenCount,
      failureEndpointCount: riskyCount,
      baselineSuccessRate: Number(baselineSuccessRate.toFixed(2)),
      sequencePatternsObserved: sequenceStats.size,
      successEndpointCount: goldenCount,
    },
    id: FINDINGS.SEQUENCE_RISK,
    items,
    recommendation:
      riskyCount > 0
        ? "Focus on the highest-lift failure endpoint first. Tighten the handoff into that terminal tool or add a safer bridge before the failing step."
        : "Surface the strongest reusable success path earlier, especially when it already transfers across multiple clients.",
    score: 18 + riskyCount * 6 + goldenCount * 3,
    severity: riskyCount > 0 ? "warning" : "info",
    status: "ready",
    summary: `${riskyCount} targeted failure path${riskyCount === 1 ? "" : "s"} and ${goldenCount} reusable success path${goldenCount === 1 ? "" : "s"} crossed the emission threshold.`,
    support,
    title: `Sequence risk map (${items.length})`,
  };
}

function analyzeClientDivergence(context, support, thresholds) {
  if (support.status === "suppressed") {
    return createSuppressedFinding({
      id: FINDINGS.CLIENT_DIVERGENCE,
      reason: support.rationale,
      support,
      title: "Client divergence",
    });
  }

  const statsByClient = new Map();

  for (const event of context.events) {
    const clientHint = event.clientHint || "unknown";

    if (!statsByClient.has(clientHint)) {
      statsByClient.set(clientHint, {
        errorCount: 0,
        eventCount: 0,
        sessionIds: new Set(),
        successCount: 0,
        toolStats: new Map(),
      });
    }

    const stat = statsByClient.get(clientHint);
    stat.eventCount += 1;
    stat.sessionIds.add(event.sessionId);

    if (isFailureOutcome(event.outcome)) {
      stat.errorCount += 1;
    }

    if (isSuccessOutcome(event.outcome)) {
      stat.successCount += 1;
    }

    if (!stat.toolStats.has(event.toolName)) {
      stat.toolStats.set(event.toolName, {
        errorCount: 0,
        observationCount: 0,
      });
    }

    const toolStat = stat.toolStats.get(event.toolName);
    toolStat.observationCount += 1;

    if (isFailureOutcome(event.outcome)) {
      toolStat.errorCount += 1;
    }
  }

  const comparableClients = [...statsByClient.entries()].filter(
    ([, stat]) => stat.sessionIds.size >= thresholds.clientMinComparableSessions,
  );

  if (comparableClients.length < thresholds.clientMinDistinctClients) {
    return createSuppressedFinding({
      blockedBy: ["insufficient_client_variety"],
      id: FINDINGS.CLIENT_DIVERGENCE,
      reason:
        "Client divergence needs at least two meaningfully represented clients before differences can be trusted.",
      support,
      title: "Client divergence",
    });
  }

  const totalEvents = comparableClients.reduce((sum, [, stat]) => sum + stat.eventCount, 0);
  const totalSuccesses = comparableClients.reduce((sum, [, stat]) => sum + stat.successCount, 0);
  const totalSessions = comparableClients.reduce((sum, [, stat]) => sum + stat.sessionIds.size, 0);
  const items = [];

  for (const [clientHint, stat] of comparableClients) {
    const peerEvents = totalEvents - stat.eventCount;
    const peerSuccesses = totalSuccesses - stat.successCount;
    const peerSessions = totalSessions - stat.sessionIds.size;

    if (peerEvents <= 0 || peerSessions <= 0) {
      continue;
    }

    const successRate = stat.successCount / stat.eventCount;
    const baselineSuccessRate = peerSuccesses / peerEvents;
    const avgToolsPerSession = stat.eventCount / stat.sessionIds.size;
    const baselineToolsPerSession = (totalEvents - stat.eventCount) / peerSessions;
    const successGap = baselineSuccessRate - successRate;
    const toolsGap = baselineToolsPerSession - avgToolsPerSession;
    const isOverallOutlier =
      successGap >= thresholds.clientMinSuccessGap || toolsGap >= thresholds.clientMinToolsGap;

    if (isOverallOutlier) {
      items.push({
        avgToolsPerSession: roundMetric(avgToolsPerSession),
        baselineSuccessRate: roundMetric(baselineSuccessRate),
        baselineToolsPerSession: roundMetric(baselineToolsPerSession),
        clientHint,
        eventCount: stat.eventCount,
        issueType: "client_outlier",
        sessionCount: stat.sessionIds.size,
        successGap: roundMetric(successGap),
        successRate: roundMetric(successRate),
        toolsGap: roundMetric(toolsGap),
      });
    }

    for (const [toolName, toolStat] of stat.toolStats.entries()) {
      if (toolStat.observationCount < thresholds.clientToolMinObservations) {
        continue;
      }

      let peerToolErrors = 0;
      let peerToolObservations = 0;

      for (const [peerClientHint, peerStat] of comparableClients) {
        if (peerClientHint === clientHint) {
          continue;
        }

        const peerToolStat = peerStat.toolStats.get(toolName);
        if (!peerToolStat) {
          continue;
        }

        peerToolErrors += peerToolStat.errorCount;
        peerToolObservations += peerToolStat.observationCount;
      }

      if (peerToolObservations < thresholds.clientToolMinObservations) {
        continue;
      }

      const clientErrorRate = toolStat.errorCount / toolStat.observationCount;
      const baselineToolErrorRate = peerToolErrors / peerToolObservations;
      const errorGap = clientErrorRate - baselineToolErrorRate;

      if (
        clientErrorRate >= thresholds.clientToolMinErrorRate &&
        errorGap >= thresholds.clientToolErrorGap
      ) {
        items.push({
          baselineToolErrorRate: roundMetric(baselineToolErrorRate),
          clientErrorRate: roundMetric(clientErrorRate),
          clientHint,
          errorGap: roundMetric(errorGap),
          issueType: "tool_outlier",
          observationCount: toolStat.observationCount,
          overallClientOutlier: isOverallOutlier,
          toolName,
        });
      }
    }
  }

  items.sort((left, right) => {
    const leftClient = left.issueType === "client_outlier" ? 1 : 0;
    const rightClient = right.issueType === "client_outlier" ? 1 : 0;

    if (rightClient !== leftClient) {
      return rightClient - leftClient;
    }

    const leftGap = Math.max(left.successGap || 0, left.errorGap || 0, left.toolsGap || 0);
    const rightGap = Math.max(right.successGap || 0, right.errorGap || 0, right.toolsGap || 0);

    if (rightGap !== leftGap) {
      return rightGap - leftGap;
    }

    return (
      (right.observationCount || right.eventCount) - (left.observationCount || left.eventCount)
    );
  });

  if (items.length === 0) {
    return createClearFinding({
      evidence: {
        comparableClients: comparableClients.map(([clientHint]) => clientHint),
      },
      id: FINDINGS.CLIENT_DIVERGENCE,
      summary:
        "Pathloom compared normalized client cohorts, but no client or tool-level gap crossed the divergence threshold.",
      support,
      title: "Client divergence",
    });
  }

  return {
    evidence: {
      comparableClients: comparableClients.map(([clientHint]) => clientHint),
    },
    id: FINDINGS.CLIENT_DIVERGENCE,
    items,
    recommendation:
      "Review the worst client-specific path first. Divergence this large usually means descriptions, examples, or affordances are landing differently across clients.",
    score: 16 + items.length * 4,
    severity: "warning",
    status: "ready",
    summary: `${items.length} client-level divergence pattern${items.length === 1 ? "" : "s"} crossed the emission threshold.`,
    support,
    title: `Client divergence (${items.length})`,
  };
}

function analyzeActivationToolReport(context, support, thresholds) {
  if (support.status === "suppressed") {
    return createSuppressedFinding({
      id: FINDINGS.ACTIVATION,
      reason: support.rationale,
      support,
      title: "Activation tool report",
    });
  }

  const actorJourneys = getActorJourneys(context.events);
  const linkedActors = [...actorJourneys.values()].filter((sessions) => sessions.length > 0);
  const diagnostics = buildActivationDiagnostics(linkedActors);

  if (linkedActors.length === 0) {
    return createSuppressedFinding({
      blockedBy: ["missing_observed_actor_linkage"],
      id: FINDINGS.ACTIVATION,
      reason:
        "Activation findings stay quiet until privacy-safe actor linkage is actually present in the observed event stream, not just declared in the dataset profile.",
      support,
      title: "Activation tool report",
    });
  }

  if (linkedActors.length < thresholds.activationMinLinkedActors) {
    return createSuppressedFinding({
      blockedBy: ["insufficient_linked_actor_count"],
      id: FINDINGS.ACTIVATION,
      reason:
        "Activation findings need a meaningfully sized linked cohort before Pathloom will treat a return pattern as product signal rather than a few repeat users.",
      support,
      title: "Activation tool report",
    });
  }

  const totalReturnedActors = linkedActors.filter((sessions) => sessions.length >= 2).length;
  const allFirstSessionTools = new Set();
  const statsByTool = new Map();

  for (const sessions of linkedActors) {
    const firstSession = sessions[0];
    const returned = sessions.length >= 2;
    const firstSessionTools = new Set(firstSession.tools);

    for (const toolName of firstSessionTools) {
      allFirstSessionTools.add(toolName);

      if (!statsByTool.has(toolName)) {
        statsByTool.set(toolName, {
          exposedActors: 0,
          exposedReturnedActors: 0,
          exposedSustainedReturns: 0,
          returnGaps: [],
        });
      }

      const stat = statsByTool.get(toolName);
      stat.exposedActors += 1;

      if (returned) {
        stat.exposedReturnedActors += 1;
        stat.returnGaps.push(sessions[1].firstInvokedAt - sessions[0].firstInvokedAt);

        if (sessions.length >= 3) {
          stat.exposedSustainedReturns += 1;
        }
      }
    }
  }

  const candidateSignals = [];
  const credibleFindings = [];

  for (const toolName of allFirstSessionTools) {
    const stat = statsByTool.get(toolName);
    const controlActors = linkedActors.length - stat.exposedActors;

    if (
      stat.exposedActors < thresholds.activationCandidateMinExposedActors ||
      controlActors < thresholds.activationCandidateMinControlActors
    ) {
      continue;
    }

    const controlReturnedActors = totalReturnedActors - stat.exposedReturnedActors;
    const exposedReturnRate = stat.exposedReturnedActors / stat.exposedActors;
    const controlReturnRate = controlActors === 0 ? 0 : controlReturnedActors / controlActors;
    const returnRateDelta = exposedReturnRate - controlReturnRate;
    const returnRateMultiplier =
      controlReturnRate === 0 ? null : exposedReturnRate / controlReturnRate;
    const exposedInterval = wilsonInterval(stat.exposedReturnedActors, stat.exposedActors);
    const controlInterval = wilsonInterval(controlReturnedActors, controlActors);

    if (stat.exposedReturnedActors < thresholds.activationMinReturnedActors) {
      continue;
    }

    if (
      returnRateDelta < thresholds.activationCandidateMinReturnRateDelta ||
      (returnRateMultiplier != null &&
        returnRateMultiplier < thresholds.activationCandidateMinReturnRateMultiplier)
    ) {
      continue;
    }

    const cohortContext = buildActivationCohortContext({
      controlActors,
      controlReturnRate,
      exposedReturnRate,
      stat,
      toolName,
    });

    const candidate = {
      cohortContext,
      confidenceBand: {
        controlLower: roundMetric(controlInterval.lower),
        controlUpper: roundMetric(controlInterval.upper),
        exposedLower: roundMetric(exposedInterval.lower),
        exposedUpper: roundMetric(exposedInterval.upper),
      },
      controlActors,
      controlReturnRate: roundMetric(controlReturnRate),
      exposedActors: stat.exposedActors,
      exposedReturnRate: roundMetric(exposedReturnRate),
      issueType: "activation_tool",
      returnedActors: stat.exposedReturnedActors,
      returnRateDelta: roundMetric(returnRateDelta),
      returnRateMultiplier: returnRateMultiplier == null ? null : roundMetric(returnRateMultiplier),
      signalClass: "candidate_return_correlate",
      toolName,
    };

    candidateSignals.push(candidate);

    const isCredibleFinding =
      stat.exposedActors >= thresholds.activationCredibleMinExposedActors &&
      controlActors >= thresholds.activationCredibleMinControlActors &&
      returnRateDelta >= thresholds.activationCredibleMinReturnRateDelta &&
      (returnRateMultiplier == null ||
        returnRateMultiplier >= thresholds.activationCredibleMinReturnRateMultiplier) &&
      exposedInterval.lower > controlInterval.upper;

    if (!isCredibleFinding) {
      continue;
    }

    credibleFindings.push({
      ...candidate,
      signalClass: "credible_cohort_signal",
    });
  }

  candidateSignals.sort((left, right) => {
    if (right.returnRateDelta !== left.returnRateDelta) {
      return right.returnRateDelta - left.returnRateDelta;
    }

    const leftLower = left.confidenceBand.exposedLower - left.confidenceBand.controlUpper;
    const rightLower = right.confidenceBand.exposedLower - right.confidenceBand.controlUpper;

    if (rightLower !== leftLower) {
      return rightLower - leftLower;
    }

    return right.exposedActors - left.exposedActors;
  });

  credibleFindings.sort((left, right) => {
    const leftSeparation = left.confidenceBand.exposedLower - left.confidenceBand.controlUpper;
    const rightSeparation = right.confidenceBand.exposedLower - right.confidenceBand.controlUpper;

    if (rightSeparation !== leftSeparation) {
      return rightSeparation - leftSeparation;
    }

    if (right.returnRateDelta !== left.returnRateDelta) {
      return right.returnRateDelta - left.returnRateDelta;
    }

    const leftMultiplier = left.returnRateMultiplier || Number.POSITIVE_INFINITY;
    const rightMultiplier = right.returnRateMultiplier || Number.POSITIVE_INFINITY;

    if (rightMultiplier !== leftMultiplier) {
      return rightMultiplier - leftMultiplier;
    }

    return right.exposedActors - left.exposedActors;
  });

  if (credibleFindings.length === 0) {
    return createClearFinding({
      evidence: {
        candidateSignalCount: candidateSignals.length,
        diagnostics,
        linkedActorCount: linkedActors.length,
        returningActorCount: totalReturnedActors,
        toolsObservedInFirstSessions: allFirstSessionTools.size,
      },
      id: FINDINGS.ACTIVATION,
      items: candidateSignals.slice(0, 3),
      recommendation:
        candidateSignals.length > 0
          ? "Treat these as watch-list return correlates, not product truths. Gather more linked-cohort evidence before changing onboarding around them."
          : null,
      summary:
        candidateSignals.length > 0
          ? "Pathloom saw candidate return correlates, but none cleared the credible cohort-signal threshold needed for a product finding."
          : "Pathloom observed linked return cohorts, but no first-session tool crossed the activation threshold strongly enough to report.",
      support,
      title: "Activation tool report",
    });
  }

  const topItem = credibleFindings[0];
  const multiplierSummary =
    topItem.returnRateMultiplier == null
      ? "with no control-group returns observed"
      : `at ${topItem.returnRateMultiplier}x the return rate of the rest of the cohort`;

  return {
    evidence: {
      candidateSignalCount: candidateSignals.length,
      credibleSignalCount: credibleFindings.length,
      diagnostics,
      linkedActorCount: linkedActors.length,
      returningActorCount: totalReturnedActors,
      toolsObservedInFirstSessions: allFirstSessionTools.size,
    },
    id: FINDINGS.ACTIVATION,
    items: [topItem],
    recommendation:
      "Surface this tool earlier in onboarding and make its value legible, because it is the strongest confidence-backed cohort return signal in this dataset.",
    score: 22 + Math.round(topItem.returnRateDelta * 20),
    severity: "warning",
    status: "ready",
    summary: `${topItem.toolName} correlated with ${Math.round(
      topItem.exposedReturnRate * 100,
    )}% second-session return in the linked cohort ${multiplierSummary}.`,
    support,
    title: "Activation tool report",
  };
}

function rankFindings(findings) {
  return [...findings].sort((left, right) => {
    const leftReady = left.status === "ready" ? 1 : 0;
    const rightReady = right.status === "ready" ? 1 : 0;

    if (rightReady !== leftReady) {
      return rightReady - leftReady;
    }

    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return scoreSeverity(right.severity) - scoreSeverity(left.severity);
  });
}

function attachFindingUncertainty(finding: Finding): Finding {
  return {
    ...finding,
    uncertainty: createFindingUncertainty(finding),
  };
}

export function analyzeDataset(
  input: AnalysisContextInput,
  options: { thresholds?: Partial<AnalysisThresholds> } = {},
): AnalysisResult {
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(options.thresholds || {}),
  };
  const sessions = getSessionMap(input.events);
  const context = {
    ...input,
    sessionCount: sessions.size,
    sessions,
  };
  const support = evaluateFindingSupport(input.dataset.profile);

  if (!support.valid) {
    throw new Error(`Dataset profile is invalid: ${support.validationIssues.join(" ")}`);
  }

  const findings = (
    [
      analyzeDeadToolDetection(context, support.findings[FINDINGS.DEAD_TOOLS], thresholds),
      analyzeArgumentMismatchPatterns(
        context,
        support.findings[FINDINGS.ARGUMENT_MISMATCH],
        thresholds,
      ),
      analyzeSessionTermination(
        context,
        support.findings[FINDINGS.SESSION_TERMINATION],
        thresholds,
      ),
      analyzeSequenceRisk(context, support.findings[FINDINGS.SEQUENCE_RISK], thresholds),
      analyzeClientDivergence(context, support.findings[FINDINGS.CLIENT_DIVERGENCE], thresholds),
      analyzeActivationToolReport(context, support.findings[FINDINGS.ACTIVATION], thresholds),
    ] as Finding[]
  ).map(attachFindingUncertainty);

  return {
    datasetStats: {
      eventCount: input.events.length,
      sessionCount: context.sessionCount,
      toolCatalogSize: input.toolCatalog.length,
    },
    dataset: input.dataset,
    findings: rankFindings(findings.filter((finding) => finding.status !== "suppressed")),
    generatedAt: Date.now(),
    sourceKey: input.sourceKey,
    suppressedFindings: findings.filter((finding) => finding.status === "suppressed"),
  };
}

export const analyzeV01Dataset = analyzeDataset;
