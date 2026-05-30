import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const requiredFiles = [
  "manifest.json",
  "README.md",
  "src/background/serviceWorker.js",
  "src/content/followingScanner.js",
  "src/content/profileActivityParser.js",
  "src/popup/popup.html",
  "src/popup/popup.css",
  "src/popup/popup.js",
  "src/options/options.html",
  "src/options/options.css",
  "src/options/options.js",
  "src/results/results.html",
  "src/results/results.css",
  "src/results/results.js",
  "src/shared/constants.js",
  "src/shared/storage.js",
  "src/shared/dateUtils.js",
  "src/shared/csvUtils.js",
  "src/shared/domUtils.js",
  "src/shared/statusUtils.js",
  "assets/icon16.png",
  "assets/icon48.png",
  "assets/icon128.png",
  "docs/project-context.md",
  "docs/stage-plan.md",
  "docs/development-log.md",
  "docs/test-checklist.md",
  "docs/known-issues.md"
];

const bannedPermissions = [
  "cookies",
  "webRequest",
  "debugger",
  "declarativeNetRequest",
  "history",
  "downloads",
  "management"
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function listJsFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsFiles(path));
    } else if (entry.isFile() && path.endsWith(".js")) {
      files.push(path);
    }
  }

  return files;
}

for (const file of requiredFiles) {
  assert(existsSync(join(root, file)), `Missing required file: ${file}`);
}

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const permissions = manifest.permissions || [];
const foundBannedPermissions = bannedPermissions.filter((permission) => permissions.includes(permission));
assert(foundBannedPermissions.length === 0, `Banned permissions found: ${foundBannedPermissions.join(", ")}`);

for (const file of listJsFiles(join(root, "src"))) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`Syntax check failed: ${file}`);
  }
}

console.log("Extension check passed.");
