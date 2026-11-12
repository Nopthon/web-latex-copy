"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const listeners = { window: {}, document: {} };
const Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_FRAGMENT_NODE: 11 };

function displayOf(name) {
  if (name === "td" || name === "th") return "table-cell";
  if (name === "tr") return "table-row";
  if (name === "table") return "table";
  if (name === "li") return "list-item";
  if (/^(p|div|h[1-6]|ul|ol|pre|blockquote|section|article|hr)$/.test(name)) return "block";
  return "inline";
}

function matchesOne(node, selector) {
  if (selector.startsWith("[")) {
    const match = selector.match(/^\[([^\]=~|$^*]+)(?:[~|$^*]?=["']([^"']*)["'])?\]$/);
    if (!match || /[~|$^*]=/.test(selector)) return false;
    const value = node.attrs?.[match[1]] ?? null;
    return match[2] === undefined ? value !== null : value === match[2];
  }
  if (selector.startsWith(".")) return node.classList?.has(selector.slice(1)) === true;
  const tag = selector.match(/^[a-z0-9-]*/i)?.[0] ?? "";
  if (tag && node.localName !== tag) return false;
  let rest = selector.slice(tag.length);
  while (rest.startsWith(".")) {
    const match = rest.match(/^\.([a-zA-Z0-9_-]+)/);
    if (!match || !node.classList.has(match[1])) return false;
    rest = rest.slice(match[0].length);
  }
  if (!rest) return true;
  if (!rest.startsWith("[")) return false;
  return matchesOne(node, rest);
}

function descendants(node) {
  const output = [];
  const walk = parent => {
    for (const child of parent.childNodes || []) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      output.push(child);
      walk(child);
    }
  };
  walk(node);
  return output;
}

function make(name, attrs = {}, classes = []) {
  const node = {
    nodeType: Node.ELEMENT_NODE,
    localName: name,
    attrs,
    classList: new Set(classes),
    className: classes.join(" "),
    childNodes: [],
    children: [],
    parentElement: null,
    previousElementSibling: null,
    firstElementChild: null,
    hidden: false,
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(attrs, key) ? attrs[key] : null; },
    matches(selector) { return selector.split(",").some(part => matchesOne(this, part.trim())); },
    closest(selector) {
      for (let current = this; current; current = current.parentElement) {
        if (current.matches?.(selector)) return current;
      }
      return null;
    },
    querySelector(selector) { return descendants(this).find(child => child.matches(selector)) ?? null; },
    getRootNode() { return document; }
  };
  return node;
}

function text(value) {
  return { nodeType: Node.TEXT_NODE, data: value, length: value.length, parentElement: null, getRootNode() { return document; } };
}

function adopt(parent, child) {
  child.parentElement = parent;
  parent.childNodes.push(child);
  if (child.nodeType !== Node.ELEMENT_NODE) return;
  child.previousElementSibling = parent.children.at(-1) ?? null;
  if (!parent.firstElementChild) parent.firstElementChild = child;
  parent.children.push(child);
}

const document = {
  addEventListener(type, fn) { (listeners.document[type] ??= []).push(fn); },
  querySelectorAll() { return []; },
  getElementById() { return null },
  createTreeWalker(root) {
    const nodes = descendants(root);
    let index = 0;
    return { nextNode() { return nodes[index++] ?? null; } };
  },
  createRange() { return { selectNode() {}, compareBoundaryPoints() { return 0; } }; }
};
const window = {
  addEventListener(type, fn) { (listeners.window[type] ??= []).push(fn); },
  getSelection: () => null,
  getComputedStyle: node => ({ display: displayOf(node.localName), visibility: "visible", whiteSpace: node.localName === "pre" ? "pre" : "normal", opacity: "1" })
};
const sandbox = {
  window, document, Node, NodeFilter: { SHOW_ELEMENT: 1 },
  getComputedStyle: window.getComputedStyle, globalThis: null
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
let hook;
sandbox.__latexCopyTestHook = value => { hook = value; };
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8"), sandbox, { filename: "content.js" });

function rangeOf(root, start = null, end = null) {
  return {
    startContainer: start?.node ?? root,
    startOffset: start?.offset ?? 0,
    endContainer: end?.node ?? root,
    endOffset: end?.offset ?? (end?.node?.length ?? 0),
    intersectsNode: node => !start || node === root || node === start.node || node === end?.node || descendants(root).includes(node) || root.childNodes?.includes(node)
  };
}

function copied(root, start, end) {
  return hook.serialize(rangeOf(root, start, end), root, new Map()).text;
}

test("a selection containing a formula is copied as Markdown", () => {
  const root = make("div");
  const title = make("h2");
  adopt(title, text("Answer"));
  const paragraph = make("p");
  const strong = make("strong");
  const em = make("em");
  const code = make("code");
  const link = make("a", { href: "https://example.com/a b" });
  const formula = make("span", { "data-latex": "x^2" }, ["katex"]);
  adopt(strong, text("bold"));
  adopt(em, text("italic"));
  adopt(code, text("inline"));
  adopt(link, text("docs"));
  adopt(formula, text("x²"));
  for (const piece of [text("See "), strong, text(" and "), em, text(" plus "), code, text(" at "), link, text(" with "), formula, text(".")]) adopt(paragraph, piece);
  const list = make("ul");
  const first = make("li");
  const second = make("li");
  adopt(first, text("one"));
  adopt(second, text("two"));
  adopt(list, first);
  adopt(list, second);
  const fence = make("pre");
  const python = make("code", {}, ["language-python"]);
  adopt(python, text("print(1)"));
  adopt(fence, python);
  const quote = make("blockquote");
  const quoted = make("p");
  adopt(quoted, text("quoted"));
  adopt(quote, quoted);
  const table = make("table");
  const head = make("thead");
  const body = make("tbody");
  const headRow = make("tr");
  const bodyRow = make("tr");
  for (const label of ["A", "B"]) {
    const cell = make("th");
    adopt(cell, text(label));
    adopt(headRow, cell);
  }
  for (const label of ["1", "2"]) {
    const cell = make("td");
    adopt(cell, text(label));
    adopt(bodyRow, cell);
  }
  adopt(head, headRow);
  adopt(body, bodyRow);
  adopt(table, head);
  adopt(table, body);
  for (const block of [title, paragraph, list, fence, quote, table]) adopt(root, block);

  assert.equal(copied(root), [
    "## Answer",
    "",
    "See **bold** and *italic* plus `inline` at [docs](<https://example.com/a b>) with $x^2$.",
    "",
    "- one",
    "- two",
    "",
    "```python",
    "print(1)",
    "```",
    "",
    "> quoted",
    "",
    "| A | B |",
    "| --- | --- |",
    "| 1 | 2 |"
  ].join("\n"));
});

test("display formulas, task lists and class marks keep their Markdown form", () => {
  const root = make("div");
  const formula = make("span", { "data-latex": "y=x" }, ["katex-display"]);
  adopt(formula, text("y = x"));
  const list = make("ol", { start: "3" });
  const item = make("li");
  const box = make("input", { type: "checkbox" });
  box.checked = true;
  const label = make("span", {}, ["bold"]);
  adopt(label, text("done"));
  adopt(item, box);
  adopt(item, label);
  adopt(list, item);
  const next = make("li");
  adopt(next, text("later"));
  adopt(list, next);
  adopt(root, formula);
  adopt(root, list);

  assert.equal(copied(root), "$$\ny=x\n$$\n\n3. [x] **done**\n4. later");
});

test("a partial text selection stays inside its inline mark", () => {
  const word = text("abcdef");
  const strong = make("strong");
  adopt(strong, word);
  assert.equal(copied(strong, { node: word, offset: 2 }, { node: word, offset: 5 }), "**cde**");
});

test("a formula without recoverable source is not flattened to its glyphs", () => {
  const root = make("p");
  const formula = make("span", {}, ["katex"]);
  adopt(formula, text("x²"));
  adopt(root, text("see "));
  adopt(root, formula);
  const result = hook.serialize(rangeOf(root), root, new Map());
  assert.equal(result.text, "see");
  assert.equal(result.count, 0);
  assert.equal(result.total, 1);
});

test("copy writes Markdown and blocks later page handlers only when every formula converts", () => {
  const root = make("p");
  const formula = make("span", { "data-latex": "x^2" }, ["katex"]);
  adopt(formula, text("x²"));
  adopt(root, text("see "));
  adopt(root, formula);
  const plain = make("p");
  adopt(plain, text("no math"));
  const broken = make("p");
  const missing = make("span", {}, ["katex"]);
  adopt(missing, text("x²"));
  adopt(broken, text("see "));
  adopt(broken, missing);

  const fire = target => {
    const stored = new Map();
    const event = {
      cancelable: true,
      defaultPrevented: false,
      stopped: false,
      clipboardData: {
        clearData() { stored.clear(); },
        setData(type, value) { stored.set(type, value); },
        getData(type) { return stored.get(type) ?? ""; }
      },
      composedPath() { return [target]; },
      preventDefault() { event.defaultPrevented = true; },
      stopPropagation() { event.stopped = true; },
      stopImmediatePropagation() {}
    };
    window.getSelection = () => ({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => ({ ...rangeOf(target), commonAncestorContainer: target })
    });
    listeners.window.copy[0](event);
    return event;
  };

  const converted = fire(root);
  assert.equal(converted.defaultPrevented, true);
  assert.equal(converted.stopped, true);
  assert.equal(converted.clipboardData.getData("text/plain"), "see $x^2$");
  const native = fire(plain);
  assert.equal(native.defaultPrevented, false);
  assert.equal(native.stopped, false);
  const incomplete = fire(broken);
  assert.equal(incomplete.defaultPrevented, false);
  assert.equal(incomplete.stopped, false);
});
