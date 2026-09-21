import {
  CATALOG_SIZE,
  FIXTURE_VERSION,
  VISIBLE_LIMIT,
  classifyCheck,
  createCatalog,
  deriveRunState,
  median,
  searchCatalog,
  validateEvidenceReport,
  visibleCatalog,
} from "./core.js";

const catalog = createCatalog();
const caseTabs = [...document.querySelectorAll("[data-case]")];
const runButtons = [...document.querySelectorAll("[data-run-all]")];
const comparison = document.querySelector("#comparison");
const runState = document.querySelector("#run-state");
const resultCards = [...document.querySelectorAll("[data-result]")];
const resultsTitle = document.querySelector("#results-title");
const resultsSummary = document.querySelector("#results-summary");
const timingStatus = document.querySelector("#timing-status");
const timingCells = ["#timing-before-dom", "#timing-fixed-dom", "#timing-before-frame", "#timing-fixed-frame"].map((selector) => document.querySelector(selector));
const downloadReport = document.querySelector("#download-report");
const copyReport = document.querySelector("#copy-report");
const walkthroughButton = document.querySelector("#walkthrough");
const walkthroughCaption = document.querySelector("#walkthrough-caption");
const measurementRoot = document.querySelector("#measurement-root");
const announcer = document.querySelector("#announcer");

const caseContent = {
  heavy: {
    kicker: "CASE 01 / DOM WEIGHT",
    title: "The page that renders everything.",
    description: "The broken catalog mounts every item. The repair keeps all 6,000 searchable, while only a bounded page reaches the DOM.",
  },
  overflow: {
    kicker: "CASE 02 / RESPONSIVE LAYOUT",
    title: "The layout wider than the phone.",
    description: "A fixed-width content rail forces a 390px viewport sideways. The repair lets content resolve inside the available width.",
  },
  button: {
    kicker: "CASE 03 / FUNCTION",
    title: "The button that does nothing.",
    description: "Both forms stay local. The broken control has no click behavior; the repair validates input and confirms the action without a network request.",
  },
};

let activeCase = "heavy";
let activeReport = null;
let reportUrl = null;
let isRunning = false;
let walkthroughController = null;
let catalogSearchTimer = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function browserFrame(content, label, state) {
  return `
    <article class="preview-card">
      <div class="preview-label"><span>${label}</span><span class="state-${state}">${state === "broken" ? "BUG PRESENT" : "REPAIRED"}</span></div>
      <div class="browser-chrome"><i></i><i></i><i></i><span>local.fixture/fixproof</span></div>
      ${content}
    </article>`;
}

function productMarkup(items) {
  return items.map((item) => `<article class="product-card" data-product-id="${item.id}"><b>${item.label}</b><span>${item.id} / $${item.price}</span></article>`).join("");
}

function catalogPanel(kind, query = "") {
  const full = searchCatalog(catalog, query);
  const bounded = visibleCatalog(catalog, query);
  const items = kind === "before" ? full : bounded.items;
  return `
    <div class="catalog-ui" data-catalog-kind="${kind}">
      <div class="catalog-header">
        <input type="search" value="${escapeHtml(query)}" aria-label="Search ${kind} catalog" placeholder="Try cobalt or FP-0420">
        <span class="catalog-count">${full.length.toLocaleString()} found</span>
      </div>
      <div class="catalog-list">${productMarkup(items)}</div>
      ${kind === "fixed" ? `<div class="bounded-note">SHOWING ${items.length} OF ${full.length.toLocaleString()} MATCHES</div>` : ""}
    </div>`;
}

function updateCatalogResults(query) {
  const matches = searchCatalog(catalog, query);
  for (const kind of ["before", "fixed"]) {
    const panel = comparison.querySelector(`[data-catalog-kind="${kind}"]`);
    const items = kind === "before" ? matches : matches.slice(0, VISIBLE_LIMIT);
    panel.querySelector("input").value = query;
    panel.querySelector(".catalog-count").textContent = `${matches.length.toLocaleString()} found`;
    panel.querySelector(".catalog-list").innerHTML = productMarkup(items);
    if (kind === "fixed") panel.querySelector(".bounded-note").textContent = `SHOWING ${items.length} OF ${matches.length.toLocaleString()} MATCHES`;
  }
}

function renderHeavy(query = "") {
  comparison.innerHTML = browserFrame(catalogPanel("before", query), "BEFORE / ALL ITEMS", "broken") + browserFrame(catalogPanel("fixed", query), "FIXED / BOUNDED DOM", "fixed");
  const inputs = [...comparison.querySelectorAll("input[type=search]")];
  for (const input of inputs) {
    input.addEventListener("input", () => {
      const nextQuery = input.value;
      for (const peer of inputs) if (peer !== input) peer.value = nextQuery;
      window.clearTimeout(catalogSearchTimer);
      catalogSearchTimer = window.setTimeout(() => updateCatalogResults(nextQuery), 180);
    });
  }
}

function mobileFixture(kind) {
  return `
    <div class="phone-stage">
      <div class="phone-frame">
        <div class="phone-screen" data-mobile-screen="${kind}">
          <div class="mobile-fixture ${kind === "before" ? "broken-layout" : "fixed-layout"}">
            <div class="mobile-nav"><span>PATCH / GOODS</span><div class="mobile-nav-links"><span>New</span><span>Shop</span><span>Notes</span></div></div>
            <div class="mobile-card-row"><div class="mini-card">Field notes</div><div class="mini-card">Tool roll</div><div class="mini-card">Cable case</div></div>
          </div>
        </div>
      </div>
    </div>
    <div class="overflow-readout" data-overflow-readout="${kind}">${kind === "before" ? "Measure to expose horizontal overflow" : "Measure to verify fit"}</div>
    <div class="phone-scale-note">390px fixture viewport, displayed at reduced scale</div>`;
}

function renderOverflow() {
  comparison.innerHTML = browserFrame(mobileFixture("before"), "BEFORE / FIXED WIDTH", "broken") + browserFrame(mobileFixture("fixed"), "FIXED / FLUID WIDTH", "fixed");
  requestAnimationFrame(() => {
    if (activeCase !== "overflow") return;
    for (const kind of ["before", "fixed"]) {
      const screen = comparison.querySelector(`[data-mobile-screen="${kind}"]`);
      const overflow = Math.max(0, screen.scrollWidth - screen.clientWidth);
      comparison.querySelector(`[data-overflow-readout="${kind}"]`).textContent = `${screen.scrollWidth}px content / ${screen.clientWidth}px viewport / ${overflow}px overflow`;
    }
  });
}

function quoteFixture(kind) {
  return `
    <div class="form-stage">
      <form class="quote-fixture ${kind === "before" ? "broken-form" : "fixed-form"}" data-form-kind="${kind}" novalidate>
        <h4>Request a tiny repair</h4>
        <p>A local interaction demo. Nothing is submitted.</p>
        <label for="${kind}-issue">What is broken?</label>
        <input id="${kind}-issue" name="issue" placeholder="Example: menu overlaps logo">
        <button type="button">Check request</button>
        <p class="form-message" role="status">Waiting for an action.</p>
        <span class="local-badge">LOCAL DEMO / NO NETWORK</span>
      </form>
    </div>`;
}

function attachFixedForm(root) {
  const form = root.querySelector('[data-form-kind="fixed"]');
  if (!form) return;
  const button = form.querySelector("button");
  const input = form.querySelector("input");
  const message = form.querySelector(".form-message");
  button.addEventListener("click", () => {
    message.className = "form-message";
    if (!input.value.trim()) {
      message.textContent = "Add a short bug description first.";
      message.classList.add("error");
      input.setAttribute("aria-invalid", "true");
      return;
    }
    input.removeAttribute("aria-invalid");
    message.textContent = "Request checked. Copy it into your message.";
    message.classList.add("success");
  });
}

function renderButton() {
  comparison.innerHTML = browserFrame(quoteFixture("before"), "BEFORE / NO HANDLER", "broken") + browserFrame(quoteFixture("fixed"), "FIXED / VALIDATED", "fixed");
  attachFixedForm(comparison);
}

function selectCase(caseId, { focus = false } = {}) {
  window.clearTimeout(catalogSearchTimer);
  activeCase = caseId;
  const content = caseContent[caseId];
  document.querySelector("#case-kicker").textContent = content.kicker;
  document.querySelector("#case-title").textContent = content.title;
  document.querySelector("#case-description").textContent = content.description;
  for (const tab of caseTabs) {
    const selected = tab.dataset.case === caseId;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    if (selected && focus) tab.focus();
  }
  if (caseId === "heavy") renderHeavy();
  if (caseId === "overflow") renderOverflow();
  if (caseId === "button") renderButton();
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException("Walkthrough cancelled", "AbortError");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function measureCatalogRender(kind, signal) {
  throwIfAborted(signal);
  measurementRoot.replaceChildren();
  const list = document.createElement("div");
  list.className = "measurement-list";
  const items = kind === "before" ? catalog : catalog.slice(0, VISIBLE_LIMIT);
  const start = performance.now();
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "measurement-card";
    card.dataset.productId = item.id;
    card.textContent = `${item.label} ${item.id} $${item.price}`;
    fragment.append(card);
  }
  list.append(fragment);
  measurementRoot.append(list);
  const constructed = performance.now();
  await nextFrame();
  throwIfAborted(signal);
  const frameAligned = performance.now();
  const result = {
    domUpdateMs: round(constructed - start),
    frameAlignedElapsedMs: round(frameAligned - start),
    domNodes: list.querySelectorAll(".measurement-card").length,
    searchableItems: catalog.length,
  };
  measurementRoot.replaceChildren();
  return result;
}

async function measureHeavyPage(sampleCount = 5, signal) {
  const samples = { before: [], fixed: [] };
  for (let index = 0; index < sampleCount; index += 1) {
    const order = index % 2 === 0 ? ["before", "fixed"] : ["fixed", "before"];
    for (const kind of order) samples[kind].push(await measureCatalogRender(kind, signal));
  }
  const query = "cobalt";
  const fullMatches = searchCatalog(catalog, query);
  const bounded = visibleCatalog(catalog, query);
  measurementRoot.innerHTML = catalogPanel("before", query) + catalogPanel("fixed", query);
  const rendered = {};
  for (const kind of ["before", "fixed"]) {
    const panel = measurementRoot.querySelector(`[data-catalog-kind="${kind}"]`);
    rendered[kind] = {
      count: panel.querySelector(".catalog-count").textContent,
      labels: [...panel.querySelectorAll(".product-card b")].map((node) => node.textContent),
    };
  }
  measurementRoot.replaceChildren();
  const expectedCount = `${fullMatches.length.toLocaleString()} found`;
  const renderedParity = rendered.before.count === expectedCount
    && rendered.fixed.count === expectedCount
    && rendered.before.labels.length === fullMatches.length
    && rendered.before.labels.every((label, index) => label === fullMatches[index].label)
    && rendered.fixed.labels.length === bounded.items.length
    && rendered.fixed.labels.every((label, index) => label === fullMatches[index].label);
  const beforeNodes = samples.before[0].domNodes;
  const fixedNodes = samples.fixed[0].domNodes;
  const beforeBugReproduced = beforeNodes === CATALOG_SIZE && beforeNodes > fixedNodes;
  const fixedPass = fixedNodes === VISIBLE_LIMIT && bounded.total === fullMatches.length && renderedParity;
  return {
    check: {
      id: "heavy-page",
      name: "Heavy page",
      beforeBugReproduced,
      fixedPass,
      status: classifyCheck({ beforeBugReproduced, fixedPass }),
      finding: `${beforeNodes.toLocaleString()} DOM cards before, ${fixedNodes} after; search count and visible label order ${fixedPass ? "match" : "do not match"}.`,
    },
    timing: {
      before: {
        medianDomUpdateMs: round(median(samples.before.map((sample) => sample.domUpdateMs))),
        medianFrameAlignedElapsedMs: round(median(samples.before.map((sample) => sample.frameAlignedElapsedMs))),
        domNodes: beforeNodes,
        samples: samples.before,
      },
      fixed: {
        medianDomUpdateMs: round(median(samples.fixed.map((sample) => sample.domUpdateMs))),
        medianFrameAlignedElapsedMs: round(median(samples.fixed.map((sample) => sample.frameAlignedElapsedMs))),
        domNodes: fixedNodes,
        samples: samples.fixed,
      },
    },
  };
}

async function measureMobileOverflow(signal) {
  throwIfAborted(signal);
  measurementRoot.innerHTML = mobileFixture("before") + mobileFixture("fixed");
  await nextFrame();
  throwIfAborted(signal);
  const findings = {};
  for (const kind of ["before", "fixed"]) {
    const viewport = measurementRoot.querySelector(`[data-mobile-screen="${kind}"]`);
    findings[kind] = {
      scrollWidth: viewport.scrollWidth,
      clientWidth: viewport.clientWidth,
      overflowPx: Math.max(0, viewport.scrollWidth - viewport.clientWidth),
    };
  }
  measurementRoot.replaceChildren();
  const beforeBugReproduced = findings.before.overflowPx > 0;
  const fixedPass = findings.fixed.overflowPx === 0 && findings.fixed.clientWidth === 390;
  return {
    id: "mobile-overflow",
    name: "Mobile overflow",
    beforeBugReproduced,
    fixedPass,
    status: classifyCheck({ beforeBugReproduced, fixedPass }),
    finding: `${findings.before.overflowPx}px horizontal overflow before, ${findings.fixed.overflowPx}px after.`,
    measurements: findings,
  };
}

async function measureDeadButton() {
  const host = document.createElement("div");
  host.innerHTML = quoteFixture("before") + quoteFixture("fixed");
  measurementRoot.replaceChildren(host);
  attachFixedForm(host);
  const before = host.querySelector('[data-form-kind="before"]');
  const fixed = host.querySelector('[data-form-kind="fixed"]');
  before.querySelector("input").value = "Menu overlaps logo";
  before.querySelector("button").click();
  const beforeMessage = before.querySelector(".form-message").textContent;
  fixed.querySelector("button").click();
  const validationMessage = fixed.querySelector(".form-message").textContent;
  fixed.querySelector("input").value = "Menu overlaps logo";
  fixed.querySelector("button").click();
  const successMessage = fixed.querySelector(".form-message").textContent;
  const beforeBugReproduced = beforeMessage === "Waiting for an action.";
  const fixedPass = validationMessage === "Add a short bug description first." && successMessage === "Request checked. Copy it into your message.";
  measurementRoot.replaceChildren();
  return {
    id: "dead-button",
    name: "Dead button",
    beforeBugReproduced,
    fixedPass,
    status: classifyCheck({ beforeBugReproduced, fixedPass }),
    finding: beforeBugReproduced && fixedPass ? "No before response; fixed form validates empty input and confirms valid input." : "The observed click behavior was unexpected.",
    measurements: { beforeMessage, validationMessage, successMessage },
  };
}

function setRunState(state) {
  runState.className = `run-state ${state}`;
  runState.querySelector("strong").textContent = state[0].toUpperCase() + state.slice(1);
}

function setControlsDisabled(disabled, { keepWalkthrough = false } = {}) {
  for (const button of [...runButtons, ...caseTabs]) button.disabled = disabled;
  if (!keepWalkthrough) walkthroughButton.disabled = disabled;
}

function resetTimingSummary(status) {
  timingStatus.textContent = status;
  for (const cell of timingCells) cell.textContent = status === "Pending" ? "Pending" : "—";
}

function showTimingSummary(report) {
  const before = report.timings?.heavyPage?.before;
  const fixed = report.timings?.heavyPage?.fixed;
  const values = [before?.medianDomUpdateMs, fixed?.medianDomUpdateMs, before?.medianFrameAlignedElapsedMs, fixed?.medianFrameAlignedElapsedMs];
  if (!values.every((value) => Number.isFinite(value))) {
    resetTimingSummary("Unavailable");
    return;
  }
  timingStatus.textContent = `Measured / ${report.sampleCount} samples each`;
  values.forEach((value, index) => { timingCells[index].textContent = `${value.toFixed(2)} ms`; });
}

function resetResults(message = "Running…", timingState = "Measuring…") {
  activeReport = null;
  if (reportUrl) URL.revokeObjectURL(reportUrl);
  reportUrl = null;
  downloadReport.href = "#";
  downloadReport.classList.add("is-disabled");
  downloadReport.setAttribute("aria-disabled", "true");
  downloadReport.tabIndex = -1;
  copyReport.disabled = true;
  resetTimingSummary(timingState);
  for (const card of resultCards) {
    card.classList.remove("is-passed", "is-failed");
    card.querySelector("p").textContent = message;
  }
}

function updateResultCard(check) {
  const card = resultCards.find((candidate) => candidate.dataset.result === check.id);
  card.classList.add(check.status === "passed" ? "is-passed" : "is-failed");
  card.querySelector("p").textContent = check.status === "passed" ? `Bug reproduced. Fixed check passed. ${check.finding}` : `Unexpected result. ${check.finding}`;
}

function publishReport(report) {
  activeReport = report;
  showTimingSummary(report);
  const text = JSON.stringify(report, null, 2);
  reportUrl = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  downloadReport.href = reportUrl;
  downloadReport.classList.remove("is-disabled");
  downloadReport.removeAttribute("aria-disabled");
  downloadReport.tabIndex = 0;
  copyReport.disabled = false;
}

async function runAllChecks({ fromWalkthrough = false, signal } = {}) {
  if (isRunning) return activeReport;
  throwIfAborted(signal);
  isRunning = true;
  resetResults();
  setRunState("running");
  setControlsDisabled(true, { keepWalkthrough: fromWalkthrough });
  resultsTitle.textContent = "Observing the fixtures…";
  resultsSummary.textContent = "Alternating render samples, measuring layout, and exercising the local form.";
  announcer.textContent = "FixProof checks started.";
  document.querySelector("#results").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });

  try {
    const heavy = await measureHeavyPage(5, signal);
    throwIfAborted(signal);
    updateResultCard(heavy.check);
    const overflow = await measureMobileOverflow(signal);
    throwIfAborted(signal);
    updateResultCard(overflow);
    throwIfAborted(signal);
    const deadButton = await measureDeadButton();
    throwIfAborted(signal);
    updateResultCard(deadButton);
    const checks = [heavy.check, overflow, deadButton];
    const status = deriveRunState(checks);
    const report = {
      schema: "https://github.com/dresecuri-lee/fixproof/blob/main/README.md#evidence-report",
      fixtureVersion: FIXTURE_VERSION,
      generatedAt: new Date().toISOString(),
      status,
      sampleCount: 5,
      methodology: "Local synthetic fixtures. Heavy-page DOM update and two-frame-aligned elapsed figures are medians from five alternating before/fixed runs measured with performance.now in a hidden measurement container. Search parity is asserted on rendered fixture DOM. Mobile layout uses the same fixture markup as the preview at a 390px CSS viewport. Form checks dispatch real clicks.",
      limitations: "Frame-aligned elapsed time is not a paint-completion metric. These figures are not Lighthouse or Web Vitals. Timing depends on the current browser, device load, extensions, visibility, and power state. No network submission is tested.",
      environment: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      },
      timings: { heavyPage: heavy.timing },
      checks,
    };
    const validation = validateEvidenceReport(report);
    if (!validation.valid) {
      report.status = "failed";
      report.validationErrors = validation.errors;
    }
    setRunState(report.status);
    if (report.status === "completed") {
      resultsTitle.textContent = "Three bugs reproduced. Three repairs passed.";
      resultsSummary.textContent = "These findings came from this browser run. Download or copy the complete environment, timing samples, and assertions.";
    } else {
      resultsTitle.textContent = "One or more findings were unexpected.";
      resultsSummary.textContent = "The report is still available. Inspect its assertions and environment before drawing a conclusion.";
    }
    publishReport(report);
    announcer.textContent = `FixProof checks ${report.status}.`;
    return report;
  } catch (error) {
    if (error?.name === "AbortError") {
      measurementRoot.replaceChildren();
      resetResults("Pending", "Pending");
      setRunState("pending");
      resultsTitle.textContent = "Ready when you are.";
      resultsSummary.textContent = "Walkthrough stopped before checks completed. Run all three browser checks to create new evidence.";
      announcer.textContent = "Walkthrough stopped. No report was saved.";
      throw error;
    }
    measurementRoot.replaceChildren();
    const failureReport = {
      fixtureVersion: FIXTURE_VERSION,
      generatedAt: new Date().toISOString(),
      status: "failed",
      sampleCount: 5,
      environment: { userAgent: navigator.userAgent },
      timings: {},
      checks: [],
      error: error instanceof Error ? error.message : String(error),
    };
    setRunState("failed");
    resultsTitle.textContent = "The check run stopped.";
    resultsSummary.textContent = "A browser error interrupted measurement. The partial failure report is available for inspection.";
    for (const card of resultCards.filter((candidate) => candidate.querySelector("p").textContent === "Running…")) {
      card.classList.add("is-failed");
      card.querySelector("p").textContent = "Not completed.";
    }
    publishReport(failureReport);
    announcer.textContent = "FixProof checks failed to complete.";
    return failureReport;
  } finally {
    isRunning = false;
    setControlsDisabled(false);
  }
}

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Walkthrough cancelled", "AbortError"));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Walkthrough cancelled", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function playWalkthrough() {
  if (walkthroughController) {
    walkthroughController.abort();
    return;
  }
  const controller = new AbortController();
  walkthroughController = controller;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pause = reducedMotion ? 150 : 5600;
  walkthroughButton.querySelector(".play-icon").textContent = "■";
  walkthroughButton.querySelector("span:nth-child(2)").textContent = "Stop walkthrough";
  walkthroughButton.querySelector("small").textContent = "Playing locally";
  walkthroughCaption.hidden = false;
  try {
    selectCase("heavy");
    walkthroughCaption.textContent = "01 / Same 6,000 products. The repair keeps search parity with a bounded DOM.";
    await abortableDelay(pause, controller.signal);
    selectCase("overflow");
    walkthroughCaption.textContent = "02 / The before fixture exceeds 390px. The repair resolves within the viewport.";
    await abortableDelay(pause, controller.signal);
    selectCase("button");
    walkthroughCaption.textContent = "03 / The before click is silent. The repair validates and confirms locally.";
    await abortableDelay(pause, controller.signal);
    walkthroughCaption.textContent = "Now the browser runs every check and records what it actually observes.";
    await runAllChecks({ fromWalkthrough: true, signal: controller.signal });
    await abortableDelay(reducedMotion ? 150 : 6500, controller.signal);
    walkthroughCaption.textContent = "Evidence is ready to download or copy. No result existed before this run.";
    await abortableDelay(reducedMotion ? 150 : 4000, controller.signal);
  } catch (error) {
    if (error?.name !== "AbortError") throw error;
    announcer.textContent = "Walkthrough stopped.";
  } finally {
    walkthroughController = null;
    walkthroughCaption.hidden = true;
    walkthroughButton.querySelector(".play-icon").textContent = "▶";
    walkthroughButton.querySelector("span:nth-child(2)").textContent = "Play walkthrough";
    walkthroughButton.querySelector("small").textContent = "≈ 30 sec";
  }
}

for (const tab of caseTabs) tab.addEventListener("click", () => selectCase(tab.dataset.case));
for (const button of runButtons) button.addEventListener("click", () => runAllChecks());
walkthroughButton.addEventListener("click", playWalkthrough);

downloadReport.addEventListener("click", (event) => {
  if (!activeReport) event.preventDefault();
});

copyReport.addEventListener("click", async () => {
  if (!activeReport) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(activeReport, null, 2));
    copyReport.textContent = "Copied";
    window.setTimeout(() => { copyReport.textContent = "Copy report"; }, 1800);
  } catch {
    copyReport.textContent = "Copy unavailable";
  }
});

window.addEventListener("beforeunload", () => {
  if (reportUrl) URL.revokeObjectURL(reportUrl);
  walkthroughController?.abort();
});

selectCase(activeCase);
