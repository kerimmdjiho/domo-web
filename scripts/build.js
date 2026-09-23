// Zero-dependency build: copy src/ -> dist/, substitute build-time placeholders.
// No bundling, no minification, no fingerprinting -- deliberately simple so the
// Docker multi-stage build (node stage runs this, nginx stage serves the output)
// stays easy to reason about.
import { readdirSync, statSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const srcDir = join(rootDir, "src");
const distDir = join(rootDir, "dist");

const API_URL = process.env.API_URL ?? "";
const BUILD_VERSION = process.env.BUILD_VERSION ?? "dev";

function walk(dir) {
  const entries = readdirSync(dir);
  let files = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files = files.concat(walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function main() {
  console.log(`[build] API_URL=${JSON.stringify(API_URL)} BUILD_VERSION=${JSON.stringify(BUILD_VERSION)}`);

  console.log(`[build] cleaning ${distDir}`);
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  const files = walk(srcDir);
  for (const file of files) {
    const rel = relative(srcDir, file);
    const destPath = join(distDir, rel);
    mkdirSync(join(destPath, ".."), { recursive: true });

    let contents = readFileSync(file, "utf8");
    const before = contents;
    contents = contents.split("__API_URL__").join(API_URL);
    contents = contents.split("__BUILD_VERSION__").join(BUILD_VERSION);

    writeFileSync(destPath, contents);

    const replaced = contents !== before;
    console.log(`[build] copied ${rel}${replaced ? " (placeholders substituted)" : ""}`);
  }

  console.log(`[build] done -- ${files.length} file(s) written to dist/`);
}

main();
