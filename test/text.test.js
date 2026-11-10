"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");

const namedEntities = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&eacute;": "é",
  "&alpha;": "α",
  "&beta;": "β",
  "&sup2;": "²",
  "&copy;": "©",
  "&nbsp;": " "
};

const plain = value => JSON.parse(JSON.stringify(value));

class FakeDOMParser {
  parseFromString(html) {
    const entity = html.slice(html.indexOf("<body>") + 6);
    return { body: { textContent: namedEntities[entity] ?? entity } };
  }
}

function loadTextApi() {
  let api;
  const sandbox = {
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    DOMParser: FakeDOMParser,
    setTimeout,
    clearTimeout,
    console,
    __latexCopyTestHook(value) { api = value; }
  };
  vm.runInNewContext(source, sandbox, { filename: "content.js" });
  assert.ok(api, "content.js did not expose its text fixtures");
  return api;
}

const api = loadTextApi();

test("inline dollar delimiters do not swallow currency", () => {
  assert.deepEqual(plain(api.markdownMath("He paid $5, then $x$.").formulas), [
    { tex: "x", display: false }
  ]);
  assert.deepEqual(plain(api.markdownMath("Costs $5-$10 for $x$.").formulas), [
    { tex: "x", display: false }
  ]);
  assert.deepEqual(plain(api.markdownMath("cost $5 and math $$x$$").formulas), [
    { tex: "x", display: true }
  ]);
});

test("adjacent inline formulas still parse", () => {
  assert.deepEqual(plain(api.markdownMath("$a$$b$").formulas), [
    { tex: "a", display: false },
    { tex: "b", display: false }
  ]);
});

test("formulas inside link destinations and HTML attributes are ignored", () => {
  assert.deepEqual(plain(api.markdownMath("[$x$](http://e/$y$)").formulas), [
    { tex: "x", display: false }
  ]);
  assert.deepEqual(plain(api.markdownMath('<span data-x="$z$">hi</span> $w$').formulas), [
    { tex: "w", display: false }
  ]);
});

test("indented code is literal, not math", () => {
  assert.deepEqual(plain(api.markdownMath("    $x$\n\n$y$").formulas), [
    { tex: "y", display: false }
  ]);
  const code = api.markdownMath("```\n<div> $x$\n```\nAfter");
  assert.equal(code.formulas.length, 0);
  assert.equal(code.key, api.pageSignature("<div> $x$After"));
});

test("ordered and task list syntax is removed from the source signature", () => {
  assert.equal(
    api.markdownMath("1. Step $x$\n2. Next").key,
    api.pageSignature("Step \u0001Next")
  );
  assert.equal(
    api.markdownMath("- [x] Done $y$").key,
    api.pageSignature("Done \u0001")
  );
});

test("named entities, autolinks and reference links match rendered text", () => {
  assert.equal(api.sourceSignature("Caf&eacute;"), api.pageSignature("Café"));
  assert.equal(api.sourceSignature("&alpha; + &sup2;"), api.pageSignature("α + ²"));
  assert.equal(
    api.sourceSignature("See <https://example.com>"),
    api.pageSignature("See https://example.com")
  );
  assert.equal(api.sourceSignature("See [docs][1]"), api.pageSignature("See docs"));
  assert.equal(api.sourceSignature("See [docs](https://example.com)"), api.pageSignature("See docs"));
  assert.equal(
    api.sourceSignature("See [docs](https://example.com/Foo_(bar))"),
    api.pageSignature("See docs")
  );
});

test("literal tags and comparison operators are not treated as markup", () => {
  assert.equal(api.sourceSignature("&lt;b&gt;"), api.pageSignature("<b>"));
  assert.equal(
    api.sourceSignature("a < b and c > d"),
    api.pageSignature("a < b and c > d")
  );
  assert.equal(
    api.sourceSignature("Use <span>foo</span>"),
    api.pageSignature("Use foo")
  );
});

test("reference definitions do not contribute rendered text", () => {
  assert.equal(
    api.sourceSignature("Text\n\n[1]: https://example.com"),
    api.pageSignature("Text")
  );
});

test("normalize and delimit handle delimiters and trailing comments", () => {
  assert.deepEqual(plain(api.normalize({ tex: "$$a$$", display: false })), { tex: "a", display: true });
  assert.deepEqual(plain(api.normalize({ tex: "\\(a\\)", display: true })), { tex: "a", display: false });
  assert.deepEqual(plain(api.normalize({ tex: "a + b", display: false })), { tex: "a + b", display: false });
  const commented = api.delimit({ tex: "x + y % comment", display: false });
  assert.ok(commented.text.endsWith("\n$"));
  assert.equal(commented.text, "$x + y % comment\n$");
});

test("owner source without a renderer accepts one command and rejects lookalikes", () => {
  assert.deepEqual(
    plain(api.chooseOwnerSource([{ tex: "\\frac{1}{2}", display: false }], null)),
    { tex: "\\frac{1}{2}", display: false }
  );
  assert.equal(api.chooseOwnerSource([{ tex: "a = b", display: false }], null), null);
  assert.equal(api.chooseOwnerSource([
    { tex: "\\alpha", display: false },
    { tex: "\\beta", display: true }
  ], null), null);
  assert.deepEqual(plain(api.chooseOwnerSource([
    { tex: "price is $100", display: false },
    { tex: "\\alpha", display: false },
    { tex: "\\alpha", display: false }
  ], null)), { tex: "\\alpha", display: false });
});

test("owner source with a renderer keeps the glyph match", () => {
  assert.deepEqual(plain(api.chooseOwnerSource([
    { tex: "\\alpha", display: false },
    { tex: "\\beta", display: false }
  ], source => source.tex === "\\beta")), { tex: "\\beta", display: false });
  assert.equal(api.chooseOwnerSource([{ tex: "\\alpha", display: false }], () => false), null);
});
