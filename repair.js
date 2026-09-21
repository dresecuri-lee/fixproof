import { WIDTHS, ELEMENT_LIMIT, CSS_LIMIT, checkInput, utf8Bytes, removeImports,
  safeStyleText, escapeAttribute, isMeasurement, buildPatch, classifyWidths, exportHtml, STRESS_TEXT } from "./repair-core.js";
import { measureFrame } from "./repair-frame.js";

const $ = (id) => document.getElementById(id);
const htmlEditor = $("html-editor"), cssEditor = $("css-editor"), stress = $("stress");
const status = $("status"), results = $("results");
const allowed = new Set("main section article header footer nav aside div h1 h2 h3 h4 h5 h6 p span strong em b i small blockquote code pre ul ol li table thead tbody tr th td br hr".split(" "));
const emptyTags = new Set(["br", "hr"]);
const CSP = "default-src 'none'; connect-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'";
const exampleHtml = `<main class="page"><h1>Small pages should fit every screen</h1><section class="card"><h2>Fixed-width card</h2><p>The original card is wider than a phone viewport.</p></section></main>`;
const exampleCss = `body { margin: 0; font: 18px/1.5 system-ui; background: #f4f0e8; color: #111317; }\n.page { padding: 20px; }\n.card { width: 520px; padding: 24px; border: 2px solid #1346e8; background: white; }`;
let serial = 0, cancelPending = null, current = null, resizeObserver = null;

function setStatus(message, kind = "") {
  status.textContent = message;
  status.className = `status ${kind}`;
}

function cancelRun() {
  serial++;
  if (cancelPending) { cancelPending(); cancelPending = null; }
  $("analyze").disabled = false;
}

function invalidate(message = "Input changed. Analyze again before exporting.") {
  cancelRun();
  current = null;
  for (const id of ["download-html", "download-css", "download-json"]) $(id).disabled = true;
  if (!results.hidden) setStatus(message);
  results.hidden = true;
}

function sanitize(html, separateCss, stressed) {
  checkInput(html, separateCss);
  const source = document.createElement("template");
  source.innerHTML = html;
  const elementCount = source.content.querySelectorAll("*").length;
  if (elementCount > ELEMENT_LIMIT) throw new Error(`HTML has ${elementCount} elements; limit is ${ELEMENT_LIMIT}.`);
  const target = document.createElement("div");
  const removals = { elements: 0, attributes: 0, cssImports: 0 };
  const embeddedCss = [];
  let nextId = 0;
  function copy(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.textContent)); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.localName.toLowerCase();
    if (tag === "style") { embeddedCss.push(node.textContent); return; }
    if (tag === "a" && node.namespaceURI === "http://www.w3.org/1999/xhtml") {
      removals.elements++;
      removals.attributes += node.attributes.length;
      for (const child of node.childNodes) copy(child, parent);
      return;
    }
    if (!allowed.has(tag) || node.namespaceURI !== "http://www.w3.org/1999/xhtml") {
      removals.elements += 1 + node.querySelectorAll("*").length;
      return;
    }
    const out = document.createElement(tag);
    out.setAttribute("data-fp-id", `fp-${++nextId}`);
    for (const attr of node.attributes) {
      const name = attr.name.toLowerCase();
      if (["id", "class", "title", "role", "lang", "dir"].includes(name) || /^aria-[a-z-]+$/.test(name)) {
        out.setAttribute(name, attr.value.slice(0, 500));
      } else if (name === "style" && !/@import\b|url\s*\(/i.test(attr.value)) {
        out.setAttribute("style", attr.value);
      } else removals.attributes++;
    }
    parent.append(out);
    if (!emptyTags.has(tag)) for (const child of node.childNodes) copy(child, out);
  }
  for (const node of source.content.childNodes) copy(node, target);
  if (!target.querySelector("[data-fp-id]")) throw new Error("No supported HTML elements remain after sanitizing.");
  if (stressed) {
    const heading = target.querySelector("h1,h2,h3,h4,h5,h6");
    if (!heading) throw new Error("Stress test needs a heading (h1–h6). Add one or turn stress off.");
    heading.textContent = STRESS_TEXT;
  }
  const combinedCss = [...embeddedCss, separateCss].join("\n");
  if (utf8Bytes(combinedCss) > CSS_LIMIT) throw new Error("Combined CSS exceeds the 100 KB limit.");
  const filtered = removeImports(combinedCss);
  removals.cssImports = filtered.count;
  return { markup: target.innerHTML, css: filtered.text, removals, elementCount, stress: stressed };
}

function frameDocument(snapshot, patch = "", nonce = "", token = "", width = 390, measure = false, highlights = "") {
  const policy = `${CSP}; script-src ${measure ? `'nonce-${nonce}'` : "'none'"}`;
  const script = measure ? `<script nonce="${nonce}" data-token="${escapeAttribute(token)}" data-width="${width}">(${measureFrame.toString()})();<\/script>` : "";
  return `<!doctype html><html lang="en"><head><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${safeStyleText(snapshot.css)}</style><style>${safeStyleText(patch)}</style><style>${highlights}</style></head><body>${snapshot.markup}${script}</body></html>`;
}

function randomHex(bytes = 20) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (n) => n.toString(16).padStart(2, "0")).join("");
}

function measure(snapshot, width, patch, job) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    const nonce = randomHex(), token = randomHex();
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, { position: "fixed", left: "0", top: "0", width: `${width}px`, height: "900px", opacity: "0", pointerEvents: "none", zIndex: "-1", border: "0" });
    let done = false;
    const finish = (error, data) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      frame.remove();
      if (cancelPending === cancel) cancelPending = null;
      if (error) reject(error); else resolve(data);
    };
    const cancel = () => finish(new Error("Analysis canceled by input change."));
    const onMessage = (event) => {
      if (serial !== job || event.source !== frame.contentWindow ||
          event.data?.type !== "fixproof:measure" || event.data?.token !== token) return;
      if (!isMeasurement(event.data.data, width)) return finish(new Error("Invalid measurement response."));
      finish(null, event.data.data);
    };
    const timer = setTimeout(() => finish(new Error(`Measurement timed out at ${width}px.`)), 6000);
    cancelPending = cancel;
    window.addEventListener("message", onMessage);
    document.body.append(frame);
    const outerWidth = frame.getBoundingClientRect().width;
    if (Math.abs(outerWidth - width) > 1) {
      finish(new Error(`Measurement frame was ${outerWidth}px wide instead of ${width}px.`));
      return;
    }
    frame.srcdoc = frameDocument(snapshot, patch, nonce, token, width, true);
  });
}

function describe(item) {
  if (item.kind === "fixed") return `fixed pixel width ${item.fixedPx}px beyond its parent`;
  if (item.kind === "wrap") return "long unbroken text needs wrapping";
  return "overflow outside the supported patch rules";
}

function renderMeasurements(run) {
  const tbody = $("measure-body");
  tbody.replaceChildren();
  for (let i = 0; i < WIDTHS.length; i++) {
    const before = run.before[i], after = run.after[i];
    const tr = document.createElement("tr");
    const values = [`${WIDTHS[i]}px`, `${before.documentWidth}px`, `${after.documentWidth}px`, after.documentWidth <= WIDTHS[i] + 1 ? "Fits" : "Overflow remains"];
    for (const value of values) { const td = document.createElement("td"); td.textContent = value; tr.append(td); }
    tbody.append(tr);
  }
  $("summary").textContent = `Result: ${run.status}. ${run.before.filter((m) => m.documentWidth > m.width + 1).length} of 4 original widths overflow; ${run.after.filter((m) => m.documentWidth > m.width + 1).length} remain after patch.`;
  $("mode-note").textContent = run.snapshot.stress ? "Synthetic stress heading was substituted before both scans. Downloads contain that stress text." : "Original input mode. Downloads contain the sanitized version of your entered content.";
  const list = document.createElement("ul");
  const candidates = run.before.flatMap((m) => m.documentWidth > m.width + 1 ? m.candidates : []);
  const seen = new Set();
  for (const item of candidates) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const li = document.createElement("li");
    li.textContent = `${item.label} (${item.id}): observed width ${item.observedWidth}px, overflow ${item.overflow}px. ${describe(item)}.`;
    list.append(li);
  }
  $("culprits").replaceChildren(list);
  if (!list.childNodes.length) $("culprits").textContent = "No overflowing culprit observed at the four measured widths.";
  $("patch").textContent = run.patch || "/* No supported patch generated. */";
  $("patch-explanation").textContent = run.patch ? "Only observed fixed pixel width and long-token elements receive tool-ID overrides. All widths were remeasured." : "The measured layout already fits or its overflow is outside the supported rules.";
  const r = run.snapshot.removals;
  $("removal-note").textContent = `Sanitized layout copy: ${r.elements} elements, ${r.attributes} attributes, ${r.cssImports} CSS imports removed. Scripts, links, media, forms, external resources and browser navigation are excluded or blocked. Compare this copy with your original before using it.`;
}

function previewFrame(stage, snapshot, patch, ids, width) {
  const frame = document.createElement("iframe");
  frame.title = stage.id === "before-stage" ? "Sanitized before preview" : "Sanitized patched preview";
  frame.setAttribute("sandbox", "");
  const outline = ids.map((id) => `[data-fp-id="${id}"]`).join(", ");
  const highlights = outline ? `${outline}{outline:2px solid #d84a26 !important;outline-offset:-2px !important;}` : "";
  frame.srcdoc = frameDocument(snapshot, patch, "", "", width, false, highlights);
  stage.replaceChildren(frame);
  return frame;
}

function updatePreviewWidth() {
  if (!current) return;
  const width = Number($("width-slider").value);
  $("width-output").textContent = `${width}px`;
  for (const label of document.querySelectorAll(".frame-width")) label.textContent = `${width}px CSS viewport`;
  for (const stage of [$("before-stage"), $("after-stage")]) {
    const frame = stage.querySelector("iframe");
    if (!frame) continue;
    const scale = Math.min(1, stage.clientWidth / width);
    frame.style.width = `${width}px`;
    frame.style.transform = `scale(${scale})`;
  }
}

function renderPreviews(run) {
  const ids = [...new Set(run.before.flatMap((m) => m.candidates.filter((c) => c.kind !== "unsupported").map((c) => c.id)))];
  const width = Number($("width-slider").value);
  previewFrame($("before-stage"), run.snapshot, "", ids, width);
  previewFrame($("after-stage"), run.snapshot, run.patch, ids, width);
  updatePreviewWidth();
}

async function analyze() {
  cancelRun();
  current = null;
  results.hidden = true;
  const job = serial;
  $("analyze").disabled = true;
  setStatus("Sanitizing input…");
  try {
    const snapshot = sanitize(htmlEditor.value, cssEditor.value, stress.checked);
    const before = [];
    for (const width of WIDTHS) {
      setStatus(`Measuring original layout at ${width}px…`);
      before.push(await measure(snapshot, width, "", job));
    }
    const patch = buildPatch(before.flatMap((m) => m.documentWidth > m.width + 1 ? m.candidates : []));
    const after = [];
    for (const width of WIDTHS) {
      setStatus(`Measuring patched layout at ${width}px…`);
      after.push(await measure(snapshot, width, patch, job));
    }
    if (job !== serial) return;
    const run = { snapshot, before, after, patch, status: classifyWidths(before, after, Boolean(patch)), generatedAt: new Date().toISOString() };
    current = run;
    renderMeasurements(run);
    results.hidden = false;
    renderPreviews(run);
    for (const id of ["download-html", "download-css", "download-json"]) $(id).disabled = false;
    setStatus(`Analysis complete: ${run.status}. Downloads match this analyzed ${snapshot.stress ? "synthetic stress" : "original"} state.`, "success");
  } catch (error) {
    if (job !== serial) return;
    setStatus(error.message || "Analysis failed.", "error");
  } finally {
    if (job === serial) $("analyze").disabled = false;
  }
}

function download(name, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  requestAnimationFrame(() => requestAnimationFrame(() => URL.revokeObjectURL(url)));
}

function exportRun(kind) {
  if (!current) return;
  const run = current, suffix = run.snapshot.stress ? "-synthetic-stress" : "";
  if (kind === "html") download(`sanitized-layout-copy${suffix}.html`, "text/html", exportHtml({ ...run.snapshot, patch: run.patch }));
  if (kind === "css") download(`layout-patch${suffix}.css`, "text/css", run.patch || "/* No supported patch generated. */\n");
  if (kind === "json") {
    const report = { schema: "fixproof-responsive-lab/1", generatedAt: run.generatedAt,
      mode: run.snapshot.stress ? "synthetic-stress" : "original", widths: WIDTHS,
      status: run.status, elementCount: run.snapshot.elementCount, removals: run.snapshot.removals,
      limitations: "Sanitized HTML/CSS subset. Active content and external resources excluded or blocked. Not a full-site import or preservation guarantee.",
      sanitizedMarkup: run.snapshot.markup, sanitizedCss: run.snapshot.css, patchCss: run.patch,
      before: run.before, patched: run.after };
    download(`layout-report${suffix}.json`, "application/json", `${JSON.stringify(report, null, 2)}\n`);
  }
}

htmlEditor.addEventListener("input", () => invalidate());
cssEditor.addEventListener("input", () => invalidate());
stress.addEventListener("change", () => invalidate(stress.checked ? "Stress enabled. Analyze to measure synthetic heading content." : "Original heading restored for the next analysis. Analyze again."));
$("example").addEventListener("click", () => { invalidate(); htmlEditor.value = exampleHtml; cssEditor.value = exampleCss; stress.checked = false; $("file-name").textContent = "Built-in example"; setStatus("Broken example loaded. Choose Analyze layout."); });
$("html-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  invalidate();
  if (!/\.html?$/i.test(file.name) || file.size > 200 * 1024) { setStatus("Choose a .html file no larger than 200 KB.", "error"); return; }
  const loadId = serial;
  try {
    const text = await file.text();
    if (loadId !== serial) return;
    htmlEditor.value = text;
    $("file-name").textContent = file.name;
    setStatus("HTML file loaded locally. Choose Analyze layout.");
  } catch { setStatus("Could not read the selected file.", "error"); }
});
$("analyze").addEventListener("click", analyze);
$("width-select").addEventListener("change", () => { $("width-slider").value = $("width-select").value; updatePreviewWidth(); });
$("width-slider").addEventListener("input", () => { const value = Number($("width-slider").value); $("width-select").value = WIDTHS.includes(value) ? String(value) : ""; updatePreviewWidth(); });
for (const kind of ["html", "css", "json"]) { $( `download-${kind}` ).disabled = true; $( `download-${kind}` ).addEventListener("click", () => exportRun(kind)); }
resizeObserver = new ResizeObserver(updatePreviewWidth);
resizeObserver.observe($("before-stage")); resizeObserver.observe($("after-stage"));
