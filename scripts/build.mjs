import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;

const distRoot = path.join(root, "dist");
const stageDir = path.join(distRoot, "latex-copy");
const vendorDir = path.join(stageDir, "vendor");

fs.mkdirSync(vendorDir, { recursive: true });

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
  const src = path.join(root, rel);
  const dst = path.join(stageDir, rel);
  fs.copyFileSync(src, dst);
  const srcBuf = fs.readFileSync(src);
  const dstBuf = fs.readFileSync(dst);
  if (!srcBuf.equals(dstBuf)) {
    console.error(`Build verification failed: ${rel} differs after copy.`);
    process.exit(1);
  }
}

for (const entry of fs.readdirSync(distRoot)) {
  if (/\.(?:zip|xpi)$/i.test(entry)) {
    fs.rmSync(path.join(distRoot, entry), { force: true });
  }
}

const zipPath = path.join(distRoot, `chrome-latex-copy-v${version}.zip`);
const xpiPath = path.join(distRoot, `firefox-latex-copy-v${version}.xpi`);

if (process.platform === "win32") {
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${stageDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`
  ], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-r", "-q", zipPath, "."], { cwd: stageDir, stdio: "inherit" });
}

fs.copyFileSync(zipPath, xpiPath);
console.log(`Built ${path.relative(root, zipPath)} and ${path.relative(root, xpiPath)}`);
