import test from "node:test";
import assert from "node:assert/strict";
import { WIDTHS, checkInput, removeImports, safeStyleText, isMeasurement,
  buildPatch, classifyWidths, exportHtml } from "../repair-core.js";

test("input limits count UTF-8 bytes and reject an empty document", () => {
  assert.throws(() => checkInput(" ", ""), /Enter HTML/);
  assert.throws(() => checkInput("한".repeat(70000), ""), /200 KB/);
  assert.throws(() => checkInput("<p>x</p>", "x".repeat(102401)), /100 KB/);
  assert.doesNotThrow(() => checkInput("<p>x</p>", ""));
});

test("CSS imports are removed and style terminators cannot escape export style", () => {
  const filtered = removeImports('@import url("https://example.invalid/a.css"); p { color: red }');
  assert.equal(filtered.count, 1);
  assert.match(filtered.text, /p \{ color: red \}/);
  const hostile = "p::after { content: '</style><script>evil()</script>' }";
  assert.ok(!safeStyleText(hostile).includes("</style>"));
  const patch = '[data-fp-id="fp-1"] { overflow-wrap: anywhere !important; }';
  const output = exportHtml({ markup: "<p data-fp-id=\"fp-1\">Safe</p>", css: hostile, patch, stress: true });
  assert.equal((output.match(/<\/style>/g) || []).length, 2);
  assert.match(output, /<\/style><style>\[data-fp-id="fp-1"\]/);
  const malformed = exportHtml({ markup: "<p>Safe</p>", css: "p { color: red; /*", patch, stress: false });
  assert.match(malformed, /\/\*<\/style><style>\[data-fp-id="fp-1"\]/);
  assert.match(output, /script-src 'none'/);
  assert.match(output, /synthetic stress/);
});

test("measurement schema rejects forged widths, unbounded data and malformed IDs", () => {
  const valid = { width: 320, viewportWidth: 320, rootClientWidth: 320,
    rootRectWidth: 320, htmlScrollWidth: 540, bodyScrollWidth: 540,
    documentWidth: 540, candidates: [{
    id: "fp-2", tag: "section", label: "section.card", kind: "fixed",
    observedWidth: 520, overflow: 220, right: 540, fixedPx: 520,
  }] };
  assert.equal(isMeasurement(valid, 320), true);
  assert.equal(isMeasurement({ ...valid, width: 390 }, 320), false);
  assert.equal(isMeasurement({ ...valid, viewportWidth: 229 }, 320), false);
  assert.equal(isMeasurement({ ...valid, rootClientWidth: 229 }, 320), false);
  assert.equal(isMeasurement({ ...valid, htmlScrollWidth: 229, bodyScrollWidth: 229, documentWidth: 229 }, 320), false);
  assert.equal(isMeasurement({ ...valid, documentWidth: 539 }, 320), false);
  assert.equal(isMeasurement({ ...valid, candidates: [{ ...valid.candidates[0], id: "body; color:red" }] }, 320), false);
  assert.equal(isMeasurement({ ...valid, documentWidth: Infinity }, 320), false);
  assert.equal(isMeasurement({ ...valid, documentWidth: 0 }, 320), false);
});

test("patches target stable IDs and measured status retains unresolved overflow", () => {
  const candidates = [
    { id: "fp-2", kind: "fixed", fixedPx: 520 },
    { id: "fp-3", kind: "wrap", fixedPx: null },
    { id: "fp-4", kind: "unsupported", fixedPx: null },
  ];
  const patch = buildPatch(candidates);
  assert.match(patch, /\[data-fp-id="fp-2"\].*min\(100%, 520px\)/);
  assert.match(patch, /\[data-fp-id="fp-3"\].*overflow-wrap: anywhere/);
  assert.ok(!patch.includes("fp-4"));
  assert.ok(!patch.includes("overflow-x: hidden"));
  const before = WIDTHS.map((width) => ({ width, documentWidth: width === 320 ? 520 : width }));
  const fits = WIDTHS.map((width) => ({ width, documentWidth: width }));
  assert.equal(classifyWidths(before, fits, true), "fixed by patch");
  assert.equal(classifyWidths(before, before, true), "remaining overflow");
  assert.equal(classifyWidths(fits, fits, false), "already fits");
  assert.equal(classifyWidths(fits, before, false), "remaining overflow");
});
