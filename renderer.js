(() => {
  "use strict";
  let library;
  const katexUrl = (() => {
    try { return chrome.runtime.getURL("vendor/katex.min.js"); } catch { return ""; }
  })();
  window.addEventListener("latex-copy-render", async event => {
    const target = event.composedPath()[0];
    if (!(target instanceof HTMLElement) || target.dataset.latexCopyRequest === undefined) return;
    const request = target.dataset.latexCopyRequest;
    const tex = target.dataset.latexCopyTex;
    const displayMode = target.dataset.latexCopyDisplay === "true";
    try {
      if (typeof self.katex?.render !== "function") {
        if (!library) {
          if (!katexUrl) throw new Error("The extension context is no longer valid. Reload this page with F5 and try again.");
          library = import(katexUrl);
        }
        try {
          await library;
        } catch (cause) {
          library = undefined;
          throw new Error("The extension was updated or reloaded. Reload this page with F5 and try again.");
        }
      }
      if (!target.isConnected || target.dataset.latexCopyRequest !== request) {
        if (!target.isConnected) {
          target.dataset.latexCopyStatus = "error";
          target.dataset.latexCopyError = "Rendering was cancelled.";
          target.dispatchEvent(new Event("latex-copy-rendered"));
        }
        return;
      }
      if (typeof self.katex?.render !== "function") throw new Error("The bundled KaTeX failed to load.");
      // Match the original KaTeX HTML and reuse the document's CSS and fonts.
      self.katex.render(tex, target, {
        displayMode, output: target.dataset.latexCopyOutput === "html" ? "html" : "htmlAndMathml", throwOnError: true, trust: false,
        fleqn: target.dataset.latexCopyFleqn === "true", leqno: target.dataset.latexCopyLeqno === "true"
      });
      target.dataset.latexCopyStatus = "ok";
    } catch (cause) {
      if (!target.isConnected) {
        target.dataset.latexCopyStatus = "error";
        target.dataset.latexCopyError = "Rendering was cancelled.";
        target.dispatchEvent(new Event("latex-copy-rendered"));
        return;
      }
      if (target.dataset.latexCopyRequest !== request) return;
      target.dataset.latexCopyStatus = "error";
      target.dataset.latexCopyError = cause.message || "Could not render this formula.";
    }
    target.dispatchEvent(new Event("latex-copy-rendered"));
  }, true);
})();
