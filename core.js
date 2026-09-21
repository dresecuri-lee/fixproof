export const FIXTURE_VERSION = "fixproof-synthetic-v1";
export const CATALOG_SIZE = 6000;
export const VISIBLE_LIMIT = 18;

const COLORS = ["Cobalt", "Saffron", "Graphite", "Moss", "Coral", "Ivory"];
const OBJECTS = ["Desk Lamp", "Field Notes", "Cable Case", "Travel Mug", "Tool Roll", "Monitor Stand"];

export function createCatalog(size = CATALOG_SIZE) {
  return Array.from({ length: size }, (_, index) => {
    const number = index + 1;
    return {
      id: `FP-${String(number).padStart(4, "0")}`,
      label: `${COLORS[index % COLORS.length]} ${OBJECTS[Math.floor(index / COLORS.length) % OBJECTS.length]}`,
      price: 18 + ((index * 17) % 173),
      group: `Batch ${String((index % 12) + 1).padStart(2, "0")}`,
    };
  });
}

export function searchCatalog(catalog, query) {
  const term = query.trim().toLocaleLowerCase("en");
  if (!term) return catalog;
  return catalog.filter((item) => `${item.id} ${item.label} ${item.group}`.toLocaleLowerCase("en").includes(term));
}

export function visibleCatalog(catalog, query, limit = VISIBLE_LIMIT) {
  const matches = searchCatalog(catalog, query);
  return { total: matches.length, items: matches.slice(0, limit) };
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function classifyCheck({ beforeBugReproduced, fixedPass }) {
  if (beforeBugReproduced === true && fixedPass === true) return "passed";
  return "failed";
}

export function deriveRunState(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return "pending";
  return checks.every((check) => classifyCheck(check) === "passed") ? "completed" : "failed";
}

export function validateEvidenceReport(report) {
  const errors = [];
  if (!report || typeof report !== "object") return { valid: false, errors: ["Report must be an object."] };
  if (report.fixtureVersion !== FIXTURE_VERSION) errors.push("Fixture version is missing or unexpected.");
  if (!Number.isInteger(report.sampleCount) || report.sampleCount < 1) errors.push("Sample count must be a positive integer.");
  if (!report.generatedAt || Number.isNaN(Date.parse(report.generatedAt))) errors.push("Generated time must be an ISO date.");
  if (!report.environment?.userAgent) errors.push("User agent is required.");
  if (!Array.isArray(report.checks) || report.checks.length !== 3) errors.push("Exactly three case checks are required.");
  else {
    const expectedIds = ["heavy-page", "mobile-overflow", "dead-button"];
    for (const id of expectedIds) {
      const check = report.checks.find((candidate) => candidate.id === id);
      if (!check) errors.push(`Missing check: ${id}.`);
      else {
        if (typeof check.beforeBugReproduced !== "boolean") errors.push(`${id} needs a before finding.`);
        if (typeof check.fixedPass !== "boolean") errors.push(`${id} needs a fixed finding.`);
        if (check.status !== classifyCheck(check)) errors.push(`${id} status does not match its findings.`);
      }
    }
  }
  const derived = deriveRunState(report.checks);
  if (report.status !== derived) errors.push("Report status does not match its checks.");
  for (const side of ["before", "fixed"]) {
    const timing = report.timings?.heavyPage?.[side];
    if (!timing || !Array.isArray(timing.samples) || timing.samples.length !== report.sampleCount) {
      errors.push(`${side} needs the declared number of raw timing samples.`);
      continue;
    }
    for (const field of ["domUpdateMs", "frameAlignedElapsedMs"]) {
      const readings = timing.samples.map((sample) => sample?.[field]);
      const medianField = `median${field[0].toUpperCase()}${field.slice(1)}`;
      if (readings.some((value) => !Number.isFinite(value) || value < 0)
          || !Number.isFinite(timing[medianField])
          || Math.abs(timing[medianField] - median(readings)) > 0.01) {
        errors.push(`${side} ${field} samples and median must agree.`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
