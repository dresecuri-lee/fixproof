export const WIDTHS = [320, 390, 768, 1280];
export const HTML_LIMIT = 200 * 1024;
export const CSS_LIMIT = 100 * 1024;
export const ELEMENT_LIMIT = 1500;
export const STRESS_TEXT = "A deliberately long heading: UnbrokenResponsiveLayoutStressTokenWithoutSpaces1234567890";

export function utf8Bytes(value) {
  return new TextEncoder().encode(value).length;
}

export function checkInput(html, css) {
  if (!html.trim()) throw new Error("Enter HTML or load the example before analyzing.");
  if (utf8Bytes(html) > HTML_LIMIT) throw new Error("HTML exceeds the 200 KB limit.");
  if (utf8Bytes(css) > CSS_LIMIT) throw new Error("CSS exceeds the 100 KB limit.");
}

export function removeImports(css) {
  let count = 0;
  const text = css.replace(/@import\b[^;]*;?/gi, () => { count++; return ""; });
  return { text, count };
}

export function safeStyleText(css) {
  // A CSS escape keeps a literal '<' from terminating the enclosing style element.
  return css.replaceAll("<", "\\3c ");
}

export function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export function isMeasurement(value, width) {
  if (!value || typeof value !== "object" || value.width !== width ||
      !Number.isFinite(value.viewportWidth) || Math.abs(value.viewportWidth - width) > 1 ||
      !Number.isFinite(value.rootClientWidth) || value.rootClientWidth < width - 30 || value.rootClientWidth > width + 1 ||
      !Number.isFinite(value.rootRectWidth) || value.rootRectWidth < 0 || value.rootRectWidth > 100000 ||
      !Number.isFinite(value.htmlScrollWidth) || value.htmlScrollWidth < 0 || value.htmlScrollWidth > 100000 ||
      !Number.isFinite(value.bodyScrollWidth) || value.bodyScrollWidth < 0 || value.bodyScrollWidth > 100000 ||
      value.documentWidth !== Math.max(value.htmlScrollWidth, value.bodyScrollWidth) ||
      !Number.isFinite(value.documentWidth) || value.documentWidth < width - 1 || value.documentWidth > 100000 ||
      !Array.isArray(value.candidates) || value.candidates.length > 16) return false;
  return value.candidates.every((item) => item && typeof item === "object" &&
    /^fp-\d{1,4}$/.test(item.id) && /^[a-z][a-z0-9-]{0,24}$/.test(item.tag) &&
    typeof item.label === "string" && item.label.length <= 120 &&
    ["fixed", "wrap", "unsupported"].includes(item.kind) &&
    [item.observedWidth, item.overflow, item.right].every((n) => Number.isFinite(n) && n >= -100000 && n <= 100000) &&
    (item.fixedPx === null || (Number.isFinite(item.fixedPx) && item.fixedPx >= 0 && item.fixedPx <= 100000)) &&
    (item.kind !== "fixed" || item.fixedPx !== null));
}

export function buildPatch(candidates) {
  const byId = new Map();
  for (const item of candidates) {
    if (item.kind === "unsupported" || byId.has(item.id)) continue;
    byId.set(item.id, item);
  }
  return [...byId.values()].map((item) => {
    const selector = `[data-fp-id="${item.id}"]`;
    if (item.kind === "wrap") {
      return `${selector} { overflow-wrap: anywhere !important; word-break: normal !important; }`;
    }
    const width = item.fixedPx === null ? "auto" : `min(100%, ${item.fixedPx}px)`;
    return `${selector} { width: ${width} !important; min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important; }`;
  }).join("\n");
}

export function classifyWidths(before, after, hasPatch) {
  if (before.length !== WIDTHS.length || after.length !== WIDTHS.length) return "error";
  const fit = (entry) => entry.documentWidth <= entry.width + 1;
  if (before.every(fit) && after.every(fit)) return "already fits";
  if (hasPatch && after.every(fit)) return "fixed by patch";
  return "remaining overflow";
}

export function exportHtml({ markup, css, patch, stress }) {
  const csp = "default-src 'none'; connect-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; script-src 'none'";
  return `<!doctype html>\n<html lang="en"><head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sanitized layout copy${stress ? " — synthetic stress" : ""}</title><style>${safeStyleText(css)}</style><style>${safeStyleText(patch)}</style></head><body>${markup}</body></html>\n`;
}
