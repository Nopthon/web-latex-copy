"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");

function loadClickPage() {
  const listeners = new Map();
  function listen(type, fn) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  }
  class ClassList {
    constructor(names) { this.names = [...names]; }
    contains(name) { return this.names.includes(name); }
    add(...names) { for (const name of names) if (!this.contains(name)) this.names.push(name); }
    remove(...names) { this.names = this.names.filter(name => !names.includes(name)); }
    [Symbol.iterator]() { return this.names[Symbol.iterator](); }
  }
  function make(localName, attrs = {}, classes = []) {
    return {
      nodeType: 1,
      localName,
      attrs: { ...attrs },
      classList: new ClassList(classes),
      parentElement: null,
      parentNode: null,
      childNodes: [],
      children: [],
      isConnected: true,
      isContentEditable: false,
      hidden: false,
      style: {},
      className: classes.join(" "),
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
      setAttribute(name, value) { this.attrs[name] = String(value); },
      matches(selector) {
        return selector.split(",").some(part => {
          part = part.trim();
          if (part.startsWith(".")) return this.classList.contains(part.slice(1));
          const role = part.match(/^\[role="([^"]+)"\]$/);
          if (role) return this.getAttribute("role") === role[1];
          if (part.startsWith("[")) return false;
          const tag = part.split(/[.:[#]/)[0];
          return Boolean(tag) && this.localName === tag;
        });
      },
      closest(selector) {
        for (let node = this; node; node = node.parentElement) if (node.matches?.(selector)) return node;
        return null;
      },
      querySelector() { return null; },
      getRootNode() { return { host: null }; },
      getBoundingClientRect() { return { left: 10, top: 20, width: 30, height: 16, right: 40, bottom: 36 }; },
      attachShadow() { return { adoptedStyleSheets: [], append() {} }; },
      append() {},
      remove() {}
    };
  }
  function adopt(parent, child) {
    child.parentElement = parent;
    child.parentNode = parent;
    parent.childNodes.push(child);
    parent.children.push(child);
  }
  const copied = [];
  const documentElement = make("html");
  const body = make("body");
  adopt(documentElement, body);
  const sandbox = {
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_FRAGMENT_NODE: 11 },
    console,
    setTimeout() {},
    clearTimeout() {},
    innerWidth: 800,
    innerHeight: 600,
    CSSStyleSheet: class { replaceSync() {} },
    getComputedStyle() {
      return {
        backgroundColor: "rgba(0, 0, 0, 0)",
        color: "rgb(0, 0, 0)",
        colorScheme: "light",
        overflowX: "visible",
        overflowY: "visible",
        contain: "none",
        display: "block",
        getPropertyValue() { return ""; }
      };
    },
    navigator: { clipboard: { writeText(text) { copied.push(text); return Promise.resolve(); } } },
    window: {
      addEventListener(type, fn) { listen(type, fn); },
      getSelection() { return { isCollapsed: true, removeAllRanges() {} }; }
    },
    document: {
      addEventListener() {},
      documentElement,
      body,
      createElement() { return make("span"); },
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    }
  };
  vm.runInNewContext(source, sandbox, { filename: "content.js" });
  return {
    copied,
    body,
    make,
    adopt,
    fire(type, event) {
      for (const fn of listeners.get(type) || []) fn(event);
    }
  };
}

function clickEvent(target) {
  return {
    button: 0,
    detail: 1,
    pointerId: 1,
    pointerType: "mouse",
    clientX: 1,
    clientY: 1,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    composedPath: () => [target],
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.stopped = true; }
  };
}

test("clicking a formula copies its bare source", async () => {
  const page = loadClickPage();
  const formula = page.make("span", { "data-latex": "a+b" }, ["katex"]);
  page.adopt(page.body, formula);
  page.fire("pointerdown", clickEvent(formula));
  const click = clickEvent(formula);
  page.fire("click", click);
  await Promise.resolve();
  assert.equal(click.defaultPrevented, true);
  assert.deepEqual(page.copied, ["a+b"]);
});

test("a formula inside role=button keeps the control's click", async () => {
  const page = loadClickPage();
  const button = page.make("div", { role: "button" });
  const formula = page.make("span", { "data-latex": "a+b" }, ["katex"]);
  page.adopt(page.body, button);
  page.adopt(button, formula);
  page.fire("pointerdown", clickEvent(formula));
  const click = clickEvent(formula);
  page.fire("click", click);
  await Promise.resolve();
  assert.notEqual(click.defaultPrevented, true);
  assert.deepEqual(page.copied, []);
});
