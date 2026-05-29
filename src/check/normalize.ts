"use strict";

function normalizeReportDocument(document: Record<string, unknown>) {
  return {
    ...document,
    generatedAt: "<generated-at>",
  };
}

export { normalizeReportDocument };
