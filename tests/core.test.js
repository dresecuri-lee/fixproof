import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_SIZE,
  FIXTURE_VERSION,
  classifyCheck,
  createCatalog,
  deriveRunState,
  searchCatalog,
  validateEvidenceReport,
  visibleCatalog,
} from "../core.js";

test("bounded catalog preserves total search count and visible label order", () => {
  const catalog = createCatalog();
  const queries = ["", "cobalt", "FP-0420", "batch 07", "not-present"];
  assert.equal(catalog.length, CATALOG_SIZE);
  for (const query of queries) {
    const full = searchCatalog(catalog, query);
    const bounded = visibleCatalog(catalog, query, 18);
    assert.equal(bounded.total, full.length, `count parity for ${query}`);
    assert.deepEqual(bounded.items.map((item) => item.label), full.slice(0, 18).map((item) => item.label));
  }
});

test("catalog generation is deterministic and IDs remain unique", () => {
  const first = createCatalog(200);
  const second = createCatalog(200);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((item) => item.id)).size, 200);
});

test("expected bugs plus fixed assertions complete, unexpected findings fail", () => {
  assert.equal(classifyCheck({ beforeBugReproduced: true, fixedPass: true }), "passed");
  assert.equal(classifyCheck({ beforeBugReproduced: false, fixedPass: true }), "failed");
  assert.equal(classifyCheck({ beforeBugReproduced: true, fixedPass: false }), "failed");
  assert.equal(deriveRunState([
    { beforeBugReproduced: true, fixedPass: true },
    { beforeBugReproduced: true, fixedPass: true },
  ]), "completed");
  assert.equal(deriveRunState([{ beforeBugReproduced: true, fixedPass: false }]), "failed");
  assert.equal(deriveRunState([]), "pending");
});

function validReport() {
  const checks = ["heavy-page", "mobile-overflow", "dead-button"].map((id) => ({
    id,
    beforeBugReproduced: true,
    fixedPass: true,
    status: "passed",
  }));
  return {
    fixtureVersion: FIXTURE_VERSION,
    sampleCount: 5,
    generatedAt: "2026-09-22T10:00:00.000Z",
    environment: { userAgent: "Unit Test Browser" },
    timings: { heavyPage: {
      before: timingSide(10),
      fixed: timingSide(2),
    } },
    checks,
    status: "completed",
  };
}

function timingSide(value) {
  return {
    medianDomUpdateMs: value,
    medianFrameAlignedElapsedMs: value + 16,
    samples: Array.from({ length: 5 }, () => ({
      domUpdateMs: value,
      frameAlignedElapsedMs: value + 16,
    })),
  };
}

test("evidence validation accepts a complete measured report", () => {
  assert.deepEqual(validateEvidenceReport(validReport()), { valid: true, errors: [] });
});

test("evidence validation rejects missing environment and inconsistent findings", () => {
  const report = validReport();
  report.environment.userAgent = "";
  report.checks[1].fixedPass = false;
  report.status = "completed";
  const result = validateEvidenceReport(report);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("User agent")));
  assert.ok(result.errors.some((error) => error.includes("mobile-overflow status")));
  assert.ok(result.errors.some((error) => error.includes("Report status")));
});

test("evidence validation rejects missing samples and a median that misstates the readings", () => {
  const report = validReport();
  report.timings.heavyPage.before.samples.pop();
  report.timings.heavyPage.fixed.medianFrameAlignedElapsedMs = 0;
  const result = validateEvidenceReport(report);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("before needs the declared number")));
  assert.ok(result.errors.some((error) => error.includes("fixed frameAlignedElapsedMs")));
});
