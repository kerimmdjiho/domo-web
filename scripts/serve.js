// Tiny zero-dependency static file server for dist/, local dev only.
// This is NOT what runs in production/Docker -- there the nginx stage
// serves dist/. This script exists so you can sanity-check a build
// without touching a container.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(rootDir, "dist");
const PORT = Number(process.env.PORT) || 8080;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function resolveFile(urlPath) {
  let safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  if (safePath === sep || safePath === "" || safePath === ".") {
    safePath = "index.html";
  }
  let filePath = join(distDir, safePath);

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, "index.html");
      await stat(filePath);
    }
    return filePath;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = await resolveFile(url.pathname);

  // SPA-ish fallback: unknown paths without a file extension serve index.html.
  if (!filePath && !extname(url.pathname)) {
    filePath = await resolveFile("/index.html");
  }

  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
    return;
  }

  try {
    const data = await readFile(filePath);
    const contentType = MIME_TYPES[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("500 Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`[serve] serving ${distDir} on http://localhost:${PORT}`);
});
