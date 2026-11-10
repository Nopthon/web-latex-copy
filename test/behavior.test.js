"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");

function loadApi() {
  let api;
  const sandbox = {
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_FRAGMENT_NODE: 11 },
    DOMParser: class { parseFromString() { return { body: { textContent: "" } }; } },
    setTimeout,
    clearTimeout,
    console,
    __latexCopyTestHook(value) { api = value; }
  };
  vm.runInNewContext(source, sandbox, { filename: "content.js" });
  assert.ok(api);
  return api;
}

test("framework reset reapplies once and stops if the page undoes it immediately", () => {
  const api = loadApi();
  assert.equal(api.frameworkReset("<em>edited</em>", "<em>original</em>", 0, 1000), "keep");
  assert.equal(api.frameworkReset("<em>original</em>", "<em>original</em>", 0, 1000), "reapply");
  assert.equal(api.frameworkReset("<em>original</em>", "<em>original</em>", 900, 1000), "give-up");
  assert.equal(api.frameworkReset("<em>original</em>", "<em>original</em>", 100, 1000), "reapply");
});

test("body overflow does not clip when it propagates to the viewport", () => {
  const api = loadApi();
  const html = { localName: "html" };
  const body = { localName: "body" };
  const div = { localName: "div" };
  const rootStyle = { overflowX: "visible", overflowY: "visible", contain: "none" };
  const bodyStyle = { overflowX: "hidden", overflowY: "hidden", contain: "none", display: "block" };
  const box = { root: html, body, rootStyle, bodyStyle };
  const bodyClip = api.elementClipsOverflow(body, bodyStyle, box);
  assert.equal(bodyClip.x, false);
  assert.equal(bodyClip.y, false);
  const rootClip = api.elementClipsOverflow(html, { overflowX: "hidden", overflowY: "scroll" }, box);
  assert.equal(rootClip.x, false);
  assert.equal(rootClip.y, false);
  const divClip = api.elementClipsOverflow(div, { overflowX: "auto", overflowY: "visible" }, box);
  assert.equal(divClip.x, true);
  assert.equal(divClip.y, false);
  const contained = api.elementClipsOverflow(body, bodyStyle, { root: html, body, rootStyle: { ...rootStyle, contain: "paint" }, bodyStyle });
  assert.equal(contained.x, true);
  assert.equal(contained.y, true);

});

test("katex edits keep the first renderer that emits KaTeX HTML", () => {
  const api = loadApi();
  const calls = [];
  const real = {
    render(tex) { calls.push(["real", tex]); },
    renderToString() { return '<span class="katex">1</span>'; }
  };
  const pinned = api.katexApi(real);
  pinned.render("x", null, {});
  const wrapped = {
    render(tex) { calls.push(["wrapped", tex]); },
    renderToString() { return '<span class="katex">1</span>'; }
  };
  api.katexApi(wrapped).render("y", null, {});
  assert.deepEqual(calls, [["real", "x"], ["real", "y"]]);
  assert.equal(api.katexApi({
    render() {},
    renderToString() { return '<script class="katex"></script>'; }
  }), pinned);
});

test("mathjax typeset function is pinned after a safe probe", async () => {
  const api = loadApi();
  const calls = [];
  const node = {
    localName: "mjx-container",
    outerHTML: "<mjx-container></mjx-container>",
    querySelector() { return null; }
  };
  const owner = {
    tex2svgPromise(tex) { calls.push(tex); return Promise.resolve(node); },
    chtmlStylesheet() { return { id: "MJX" }; }
  };
  const first = await api.mathJaxApi("tex2svgPromise", owner);
  await first("x^2", { display: false });
  const wrapped = {
    tex2svgPromise(tex) { calls.push("wrapped:" + tex); return Promise.resolve(node); }
  };
  const second = await api.mathJaxApi("tex2svgPromise", wrapped);
  await second("y", { display: false });
  assert.deepEqual(calls, ["1", "x^2", "y"]);
  assert.equal(await api.mathJaxApi("tex2chtmlPromise", {
    tex2chtmlPromise() { return Promise.resolve({ localName: "div", outerHTML: "<div></div>", querySelector() { return null; } }); }
  }), null);
});

test("mathjax 2 keeps the first Text function", () => {
  const api = loadApi();
  const calls = [];
  const first = { Text(tex) { calls.push(["first", tex]); } };
  const second = { Text(tex) { calls.push(["second", tex]); } };
  const pinned = api.rememberMathJax2(first, { Queue() {} });
  api.rememberMathJax2(second, { Queue() {} });
  pinned.text("a+b");
  assert.deepEqual(calls, [["first", "a+b"]]);
});
