"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("manifest version matches package.json", () => {
  assert.equal(manifest.version, pkg.version);
});

test("browser version constraints cover MAIN world requirement", () => {
  const hasWorld = (manifest.content_scripts || []).some(script => script.world !== undefined);
  if (hasWorld) {
    assert.ok(Number.parseFloat(manifest.minimum_chrome_version) >= 111);
    const geckoMin = manifest.browser_specific_settings?.gecko?.strict_min_version;
    if (geckoMin !== undefined) {
      assert.ok(Number.parseFloat(geckoMin) >= 128);
    }
  }
});

test("all referenced scripts, stylesheets and web_accessible_resources exist", () => {
  for (const script of manifest.content_scripts || []) {
    for (const file of [...(script.js || []), ...(script.css || [])]) {
      assert.ok(fs.existsSync(path.join(root, file)), `Missing content script asset: ${file}`);
    }
  }
  for (const entry of manifest.web_accessible_resources || []) {
    for (const file of entry.resources || []) {
      assert.ok(fs.existsSync(path.join(root, file)), `Missing web accessible resource: ${file}`);
    }
  }
});

test("dist/latex-copy files match root source files byte-for-byte", () => {
  const distDir = path.join(root, "dist", "latex-copy");
  if (!fs.existsSync(distDir)) return;
  const files = [
    "manifest.json",
    "content.js",
    "content.css",
    "renderer.js",
    "README.md",
    path.join("vendor", "katex.min.js"),
    path.join("vendor", "LICENSE-KaTeX.txt")
  ];
  for (const rel of files) {
    const srcBuf = fs.readFileSync(path.join(root, rel));
    const distPath = path.join(distDir, rel);
    assert.ok(fs.existsSync(distPath), `Missing dist file: ${rel}`);
    const distBuf = fs.readFileSync(distPath);
    assert.ok(srcBuf.equals(distBuf), `File drift in dist/latex-copy/${rel}`);
  }
});
