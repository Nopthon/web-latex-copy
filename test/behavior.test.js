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
  const first = { Text(tex) { calls.push(["first", this, tex]); } };
  const second = { Text(tex) { calls.push(["second", this, tex]); } };
  const pinned = api.rememberMathJax2(first, { Queue() {} });
  api.rememberMathJax2(second, { Queue() {} });
  pinned.text(first, "a+b");
  pinned.text(second, "c+d");
  assert.deepEqual(calls, [["first", first, "a+b"], ["first", second, "c+d"]]);
});

function loadMathJax2Page() {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const observers = [];
  const copied = [];

  class ClassList {
    constructor(owner, names = []) {
      this.owner = owner;
      this.names = [...names];
    }
    contains(name) { return this.names.includes(name); }
    add(...names) {
      for (const name of names) if (!this.contains(name)) this.names.push(name);
      this.owner._syncClass();
    }
    remove(...names) {
      this.names = this.names.filter(name => !names.includes(name));
      this.owner._syncClass();
    }
    replace(oldName, newName) {
      const idx = this.names.indexOf(oldName);
      if (idx >= 0) this.names[idx] = newName;
      this.owner._syncClass();
    }
    [Symbol.iterator]() { return this.names[Symbol.iterator](); }
  }

  function makeStyle() {
    const map = new Map();
    return {
      setProperty(k, v) { map.set(k, String(v)); },
      removeProperty(k) { map.delete(k); },
      getPropertyValue(k) { return map.get(k) || ""; },
      getPropertyPriority() { return ""; }
    };
  }

  function matchSimple(node, part) {
    if (!part) return false;
    if (part.startsWith(".")) return node.classList.contains(part.slice(1));
    if (part.startsWith("[")) {
      const attrMatch = part.match(/^\[([^\]=^]+)(\^)?=["']?([^"'\]]*)["']?\]$/);
      if (!attrMatch) return false;
      const val = node.getAttribute(attrMatch[1]);
      if (val === null) return false;
      return attrMatch[2] === "^" ? val.startsWith(attrMatch[3]) : val === attrMatch[3];
    }
    const bracket = part.indexOf("[");
    const head = bracket >= 0 ? part.slice(0, bracket) : part;
    const rest = bracket >= 0 ? part.slice(bracket) : "";
    const [tag, ...classes] = head.split(".");
    if (tag && node.localName !== tag) return false;
    for (const cls of classes) if (!node.classList.contains(cls)) return false;
    return rest ? matchSimple(node, rest) : true;
  }

  function collectDescendants(node, out = []) {
    for (const child of node.childNodes) {
      if (child.nodeType === 1) {
        out.push(child);
        collectDescendants(child, out);
      }
    }
    return out;
  }

  function makeText(data) {
    return {
      nodeType: 3,
      data,
      get textContent() { return this.data; },
      set textContent(v) { this.data = String(v); },
      parentElement: null,
      parentNode: null,
      get isConnected() {
        for (let p = this.parentNode; p; p = p.parentNode) if (p === documentElement) return true;
        return false;
      },
      getRootNode() { return document; },
      cloneNode() { return makeText(this.data); },
      remove() {
        if (!this.parentNode) return;
        this.parentNode.childNodes = this.parentNode.childNodes.filter(c => c !== this);
        this.parentNode = null;
        this.parentElement = null;
      }
    };
  }

  function makeElement(localName, attrs = {}, classes = []) {
    const elListeners = new Map();
    const el = {
      nodeType: 1,
      localName,
      nodeName: localName.toUpperCase(),
      attrs: { ...attrs },
      dataset: {},
      style: makeStyle(),
      childNodes: [],
      parentElement: null,
      parentNode: null,
      isContentEditable: false,
      hidden: false,
      tabIndex: 0,
      value: "",
      offsetWidth: 200,
      offsetHeight: 80,
      clientWidth: 180,
      clientHeight: 40,
      scrollHeight: 40,
      shadowRoot: null,
      get id() { return this.attrs.id || ""; },
      set id(v) { this.attrs.id = String(v); },
      get className() { return this.classList.names.join(" "); },
      set className(v) { this.classList.names = String(v).split(/\s+/).filter(Boolean); },
      _syncClass() { this.attrs.class = this.classList.names.join(" "); },
      get attributes() {
        return Object.entries(this.attrs).map(([name, value]) => ({ name, value: String(value) }));
      },
      getAttributeNames() { return Object.keys(this.attrs); },
      getAttribute(name) {
        if (name === "class") return this.classList.names.length ? this.className : (this.attrs.class ?? null);
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? String(this.attrs[name]) : null;
      },
      setAttribute(name, value) {
        this.attrs[name] = String(value);
        if (name === "class") this.className = value;
      },
      removeAttribute(name) {
        delete this.attrs[name];
        if (name === "class") this.classList.names = [];
      },
      hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
      toggleAttribute(name, force) {
        const has = this.hasAttribute(name);
        const next = force === undefined ? !has : Boolean(force);
        if (next) this.setAttribute(name, "");
        else this.removeAttribute(name);
        return next;
      },
      get children() { return this.childNodes.filter(c => c.nodeType === 1); },
      get firstElementChild() { return this.children[0] || null; },
      get previousElementSibling() {
        if (!this.parentNode) return null;
        const sibs = this.parentNode.children;
        const idx = sibs.indexOf(this);
        return idx > 0 ? sibs[idx - 1] : null;
      },
      get nextElementSibling() {
        if (!this.parentNode) return null;
        const sibs = this.parentNode.children;
        const idx = sibs.indexOf(this);
        return idx >= 0 && idx + 1 < sibs.length ? sibs[idx + 1] : null;
      },
      get isConnected() {
        for (let p = this; p; p = p.parentNode) if (p === documentElement) return true;
        return false;
      },
      get textContent() { return this.childNodes.map(c => c.textContent).join(""); },
      set textContent(v) {
        this.replaceChildren(v ? makeText(String(v)) : undefined);
      },
      get innerHTML() {
        return this.childNodes.map(c => c.nodeType === 3 ? c.data : `<${c.localName} class="${c.className}">${c.innerHTML}</${c.localName}>`).join("");
      },
      get outerHTML() { return `<${this.localName}>${this.innerHTML}</${this.localName}>`; },
      matches(selector) {
        return selector.split(",").some(part => matchSimple(this, part.trim()));
      },
      closest(selector) {
        for (let n = this; n; n = n.parentElement) if (n.matches?.(selector)) return n;
        return null;
      },
      querySelector(selector) { return collectDescendants(this).find(n => n.matches(selector)) || null; },
      querySelectorAll(selector) { return collectDescendants(this).filter(n => n.matches(selector)); },
      contains(node) {
        for (let n = node; n; n = n.parentNode) if (n === this) return true;
        return false;
      },
      getRootNode() {
        for (let p = this; p; p = p.parentNode) if (p.nodeType === 11) return p;
        return document;
      },
      getBoundingClientRect() { return { left: 10, top: 20, width: 40, height: 18, right: 50, bottom: 38 }; },
      attachShadow() {
        const root = makeElement("#shadow");
        root.nodeType = 11;
        root.host = this;
        root.adoptedStyleSheets = [];
        Object.defineProperty(root, "activeElement", {
          get() { return collectDescendants(root).find(n => n === document.activeElement) || null; }
        });
        this.shadowRoot = root;
        return root;
      },
      append(...nodes) {
        for (const n of nodes) {
          if (n === undefined || n === null) continue;
          const node = typeof n === "string" ? makeText(n) : n;
          node.remove?.();
          node.parentNode = this;
          node.parentElement = this.nodeType === 11 ? null : this;
          this.childNodes.push(node);
        }
      },
      insertBefore(node, ref) {
        node.remove?.();
        node.parentNode = this;
        node.parentElement = this.nodeType === 11 ? null : this;
        const idx = ref ? this.childNodes.indexOf(ref) : -1;
        if (idx >= 0) this.childNodes.splice(idx, 0, node);
        else this.childNodes.push(node);
      },
      replaceChildren(...nodes) {
        for (const c of [...this.childNodes]) { c.parentNode = null; c.parentElement = null; }
        this.childNodes = [];
        this.append(...nodes);
      },
      remove() {
        if (!this.parentNode) return;
        this.parentNode.childNodes = this.parentNode.childNodes.filter(c => c !== this);
        this.parentNode = null;
        this.parentElement = null;
      },
      cloneNode(deep = false) {
        const copy = makeElement(this.localName, { ...this.attrs }, [...this.classList.names]);
        if (deep) for (const c of this.childNodes) copy.append(c.cloneNode(true));
        return copy;
      },
      addEventListener(type, fn) {
        if (!elListeners.has(type)) elListeners.set(type, []);
        elListeners.get(type).push(fn);
      },
      removeEventListener(type, fn) {
        if (!elListeners.has(type)) return;
        elListeners.set(type, elListeners.get(type).filter(f => f !== fn));
      },
      dispatchEvent(event) {
        event.target ??= this;
        event.composedPath ??= () => [this];
        event.preventDefault ??= () => {};
        event.stopPropagation ??= () => {};
        for (const fn of elListeners.get(event.type) || []) fn(event);
      },
      focus() { document.activeElement = this; },
      setPointerCapture() {},
      releasePointerCapture() {},
      hasPointerCapture() { return false; }
    };
    el.classList = new ClassList(el, classes);
    if (classes.length) el._syncClass();
    return el;
  }

  const documentElement = makeElement("html");
  const head = makeElement("head");
  const body = makeElement("body");
  documentElement.append(head, body);

  const jaxByNode = new WeakMap();
  const document = {
    readyState: "complete",
    activeElement: body,
    documentElement,
    head,
    body,
    addEventListener(type, fn) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(fn);
    },
    createElement(tag) { return makeElement(tag); },
    createElementNS(_ns, tag) { return makeElement(tag); },
    getElementById(id) { return collectDescendants(documentElement).find(n => n.id === id) || null; },
    querySelector(selector) { return collectDescendants(documentElement).find(n => n.matches(selector)) || null; },
    querySelectorAll(selector) { return collectDescendants(documentElement).filter(n => n.matches(selector)); }
  };

  function runCallback(spec) {
    if (typeof spec === "function") return spec();
    if (Array.isArray(spec)) {
      const [fn, ...args] = spec;
      if (typeof fn === "function") return fn(...args);
      if (typeof fn === "string" && args[0] && typeof args[0][fn] === "function") {
        return args[0][fn](...args.slice(1));
      }
    }
  }

  const window = {
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    removeEventListener() {},
    getSelection() { return { isCollapsed: true, removeAllRanges() {} }; },
    MathJax: {
      Hub: {
        getJaxFor(node) { return jaxByNode.get(node) || null; },
        Queue(...items) {
          return Promise.resolve().then(async () => {
            for (const item of items) await runCallback(item);
          });
        }
      }
    }
  };

  class FakeMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.targets = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; this.targets = []; }
    trigger() { if (!this.disconnected) this.cb([]); }
  }

  let api;
  const sandbox = {
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_FRAGMENT_NODE: 11 },
    CSS: { supports: () => false },
    CSSStyleSheet: class { replaceSync() {} },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: FakeMutationObserver,
    DOMParser: class { parseFromString() { return { body: { textContent: "" } }; } },
    getComputedStyle() {
      return {
        backgroundColor: "rgb(255, 255, 255)",
        color: "rgb(0, 0, 0)",
        colorScheme: "light",
        fontSize: "16px",
        overflowX: "visible",
        overflowY: "visible",
        contain: "none",
        display: "block",
        getPropertyValue() { return ""; }
      };
    },
    navigator: { clipboard: { writeText(text) { copied.push(text); return Promise.resolve(); } } },
    innerWidth: 800,
    innerHeight: 600,
    scrollX: 0,
    scrollY: 0,
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
    console,
    window,
    document,
    globalThis: null,
    __latexCopyTestHook(value) { api = value; }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "content.js" });

  class FakeTeXJax {
    constructor(id, initialTex, script, display) {
      this.inputJax = "TeX";
      this.id = id;
      this.originalText = initialTex;
      this._script = script;
      this._display = display;
    }
    SourceElement() { return this._script; }
    Text(newTex) {
      const str = String(newTex);
      this.originalText = str;
      this._script.textContent = str;
      const freshFrame = makeElement("span", { id: `${this.id}-Frame` }, ["MathJax"]);
      freshFrame.append(makeText(str));
      const freshOuter = this._display ? makeElement("div", {}, ["MathJax_Display"]) : freshFrame;
      if (this._display) freshOuter.append(freshFrame);
      const currentOuter = this._script.previousElementSibling;
      if (currentOuter) currentOuter.remove();
      body.insertBefore(freshOuter, this._script);
      jaxByNode.set(freshFrame, this);
      return Promise.resolve();
    }
  }

  function mountMathJax2Formula(id, initialTex, display = false) {
    const container = makeElement("span", { id: `${id}-Frame` }, ["MathJax"]);
    container.append(makeText(initialTex));
    const outer = display ? makeElement("div", {}, ["MathJax_Display"]) : container;
    if (display) outer.append(container);
    const script = makeElement("script", { id, type: display ? "math/tex; mode=display" : "math/tex" });
    script.append(makeText(initialTex));
    body.append(outer, script);

    const jax = new FakeTeXJax(id, initialTex, script, display);
    jaxByNode.set(container, jax);
    jaxByNode.set(script, jax);
    return { outer, container, script, jax };
  }

  return {
    api,
    body,
    documentElement,
    observers,
    copied,
    mountMathJax2Formula,
    fire(type, event) {
      for (const fn of windowListeners.get(type) || []) fn(event);
    }
  };
}

test("mathjax 2 renderEdited updates the targeted formula without stringifying jax", async () => {
  const page = loadMathJax2Page();
  const f1 = page.mountMathJax2Formula("MathJax-Element-1", "n");
  const f2 = page.mountMathJax2Formula("MathJax-Element-2", "x");
  const disp = page.mountMathJax2Formula("MathJax-Element-3", "a+b", true);

  const next1 = await page.api.renderEdited(f1.outer, { tex: "m", display: false }, "mathjax-svg", {});
  assert.equal(f1.jax.originalText, "m");
  assert.equal(next1, f1.script.previousElementSibling);
  assert.equal(next1.textContent, "m");

  const next2 = await page.api.renderEdited(f2.outer, { tex: "y", display: false }, "mathjax-svg", {});
  assert.equal(f2.jax.originalText, "y");
  assert.equal(f1.jax.originalText, "m");
  assert.equal(next2, f2.script.previousElementSibling);

  const nextDisp = await page.api.renderEdited(disp.outer, { tex: "c+d", display: true }, "mathjax-svg", {});
  assert.equal(disp.jax.originalText, "c+d");
  assert.equal(nextDisp, disp.script.previousElementSibling);
  assert.equal(nextDisp.matches(".MathJax_Display"), true);
});

test("mathjax 2 edit and cross-session restore cleanly reverts DOM, source and edit hold", async () => {
  const page = loadMathJax2Page();
  const f1 = page.mountMathJax2Formula("MathJax-Element-1", "n");

  const eventBase = target => ({
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
    preventDefault() {},
    stopImmediatePropagation() {}
  });

  // Session 1: right-click formula, edit to "m", click Render.
  page.fire("contextmenu", eventBase(f1.outer));
  let editorHost = page.documentElement.children.find(c => c.classList.contains("latex-copy-editor"));
  assert.ok(editorHost);
  let textarea = editorHost.shadowRoot.querySelector("textarea");
  assert.equal(textarea.value, "n");
  textarea.value = "m";
  const renderBtn = editorHost.shadowRoot.querySelector("button.primary");
  renderBtn.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 20));

  const editedNode = f1.script.previousElementSibling;
  assert.equal(f1.jax.originalText, "m");
  assert.equal(editedNode.textContent, "m");
  const holdObserver = page.observers.find(o => o.targets.includes(editedNode) && !o.disconnected);
  assert.ok(holdObserver);

  // Re-installing holdEdited on the same node disconnects the previous hold.
  const replacedHold = page.api.holdEdited(editedNode, { tex: "m", display: false }, editedNode.cloneNode(true), "mathjax-svg", {});
  assert.equal(holdObserver.disconnected, true);
  replacedHold.disconnect();
  // Re-attach one hold so session 2's Restore has to clear a live cross-session hold.
  const crossSessionHold = page.api.holdEdited(editedNode, { tex: "m", display: false }, f1.outer.cloneNode(true), "mathjax-svg", {});
  const crossObserver = page.observers.at(-1);
  assert.equal(crossObserver.disconnected, false);

  // Session 2: reopen editor on editedNode, verify source is "m", click Restore.
  page.fire("contextmenu", eventBase(editedNode));
  editorHost = page.documentElement.children.find(c => c.classList.contains("latex-copy-editor"));
  assert.ok(editorHost);
  textarea = editorHost.shadowRoot.querySelector("textarea");
  assert.equal(textarea.value, "m");
  const restoreBtn = editorHost.shadowRoot.querySelectorAll("button").find(b => b.textContent === "Restore");
  restoreBtn.dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 20));

  assert.equal(crossObserver.disconnected, true);
  crossObserver.trigger();
  await new Promise(r => setTimeout(r, 20));

  assert.equal(f1.jax.originalText, "n");
  const restoredNode = f1.script.previousElementSibling;
  assert.equal(restoredNode.textContent, "n");

  // Left-click copies the restored source "n", not "m".
  page.fire("pointerdown", eventBase(restoredNode));
  page.fire("click", eventBase(restoredNode));
  await Promise.resolve();
  assert.deepEqual(page.copied, ["n"]);
  crossSessionHold.disconnect();
});
