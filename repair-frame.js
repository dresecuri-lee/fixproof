// This function is serialized into a nonce-authorized sandbox frame. It never receives author code.
export function measureFrame() {
  const config = document.currentScript.dataset;
  const requestedWidth = Number(config.width);
  function pixelDeclaration(element) {
    let found = null;
    const inspect = (style) => {
      for (const property of ["width", "min-width"]) {
        const value = style.getPropertyValue(property).trim();
        if (/^\d+(?:\.\d+)?px$/i.test(value)) found = Number.parseFloat(value);
      }
    };
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      const visit = (items) => {
        for (const rule of items) {
          if (rule.type === CSSRule.STYLE_RULE) {
            try { if (element.matches(rule.selectorText)) inspect(rule.style); } catch { /* unsupported selector */ }
          } else if (rule.type === CSSRule.MEDIA_RULE && matchMedia(rule.conditionText).matches) {
            visit(rule.cssRules);
          } else if (rule.type === CSSRule.SUPPORTS_RULE && CSS.supports(rule.conditionText)) {
            visit(rule.cssRules);
          }
        }
      };
      visit(rules);
    }
    inspect(element.style);
    return found;
  }
  function scan() {
    const viewport = window.innerWidth;
    const candidates = [];
    const all = document.querySelectorAll("[data-fp-id]");
    for (const element of all) {
      const rect = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      const ownOverflow = element.scrollWidth - element.clientWidth;
      const rightOverflow = rect.right - viewport;
      if (rightOverflow <= 1 && (ownOverflow <= 1 || computed.overflowX !== "visible")) continue;
      if (rect.width <= 0) continue;
      const parentWidth = element.parentElement?.getBoundingClientRect().width || viewport;
      const px = pixelDeclaration(element);
      let kind = "unsupported";
      if (computed.position !== "absolute" && computed.position !== "fixed") {
        if (px !== null && (rect.width > parentWidth + 1 || element.scrollWidth > parentWidth + 1) &&
            Math.abs(Number.parseFloat(computed.width) - px) < 2) kind = "fixed";
        else if ([...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && /\S{24,}/u.test(node.textContent || "")) && ownOverflow > 1 &&
                 computed.overflowX === "visible") kind = "wrap";
      }
      const depth = (() => { let n = element, d = 0; while (n.parentElement) { d++; n = n.parentElement; } return d; })();
      const label = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.classList.length ? `.${[...element.classList].slice(0, 2).join(".")}` : ""}`.slice(0, 120);
      candidates.push({ id: element.dataset.fpId, tag: element.tagName.toLowerCase(), label,
        observedWidth: Math.round(rect.width * 10) / 10,
        overflow: Math.round(Math.max(0, rightOverflow, ownOverflow) * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        kind, fixedPx: kind === "fixed" ? px : null, depth });
    }
    candidates.sort((a, b) => b.depth - a.depth || b.overflow - a.overflow);
    const htmlScrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body.scrollWidth;
    const documentWidth = Math.max(htmlScrollWidth, bodyScrollWidth);
    window.parent.postMessage({ type: "fixproof:measure", token: config.token,
      data: { width: requestedWidth, viewportWidth: viewport,
        rootClientWidth: document.documentElement.clientWidth,
        rootRectWidth: document.documentElement.getBoundingClientRect().width,
        htmlScrollWidth, bodyScrollWidth, documentWidth,
        candidates: candidates.slice(0, 16).map(({ depth, ...item }) => item) } }, "*");
  }
  // The transparent on-screen frame receives an animation frame after load.
  // That frame establishes its CSS viewport before dimensions are read.
  const ready = () => requestAnimationFrame(scan);
  if (document.readyState === "complete") ready();
  else window.addEventListener("load", ready, { once: true });
}
