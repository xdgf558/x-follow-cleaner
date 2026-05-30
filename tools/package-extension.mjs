import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const version = manifest.version;
const packageName = `x-follow-cleaner-v${version}`;
const distDir = join(root, "dist");
const stageDir = join(distDir, packageName);
const zipPath = join(distDir, `${packageName}.zip`);

const releaseFiles = [
  "manifest.json",
  "README.md",
  "LICENSE",
  "assets",
  "src"
];

rmSync(stageDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(stageDir, { recursive: true });

for (const file of releaseFiles) {
  const source = join(root, file);
  if (!existsSync(source)) {
    throw new Error(`Missing release file: ${file}`);
  }
  cpSync(source, join(stageDir, file), { recursive: true });
}

const zipResult = spawnSync("zip", ["-r", zipPath, "."], {
  cwd: stageDir,
  encoding: "utf8"
});

if (zipResult.status !== 0) {
  process.stderr.write(zipResult.stderr || zipResult.stdout);
  throw new Error("Failed to create release zip.");
}

console.log(`Created ${zipPath}`);
