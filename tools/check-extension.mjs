import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const requiredFiles = [
  "manifest.json",
  "README.md",
  "LICENSE",
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

const allowedPermissions = [
  "storage",
  "alarms",
  "tabs",
  "scripting"
];

const allowedHostPermissions = [
  "https://x.com/*",
  "https://twitter.com/*"
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

const unexpectedPermissions = permissions.filter((permission) => !allowedPermissions.includes(permission));
assert(unexpectedPermissions.length === 0, `Unexpected permissions found: ${unexpectedPermissions.join(", ")}`);

const hostPermissions = manifest.host_permissions || [];
const unexpectedHostPermissions = hostPermissions.filter((permission) => !allowedHostPermissions.includes(permission));
assert(unexpectedHostPermissions.length === 0, `Unexpected host permissions found: ${unexpectedHostPermissions.join(", ")}`);

const extensionCsp = manifest.content_security_policy?.extension_pages || "";
assert(!extensionCsp.includes("'unsafe-eval'"), "CSP must not allow unsafe-eval.");
assert(!/https?:\/\//i.test(extensionCsp), "CSP must not load remote script/style origins.");

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
