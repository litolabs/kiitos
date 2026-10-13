// A small local stand-in for Netlify, for testing on your own computer.
// Run `npm run dev` and open http://localhost:8888
// It serves the public folder, runs the functions and keeps Blobs data in .blobs-local/

import http from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { BlobsServer } from "@netlify/blobs/server";

const root = resolve(import.meta.dirname, "..");
const PORT = Number(process.env.PORT || 8888);

// BLOBS_DIR lets you try a brand new, empty install without touching your test data.
const blobs = new BlobsServer({ directory: process.env.BLOBS_DIR || join(root, ".blobs-local"), token: "local", port: 0 });
const { port: blobsPort } = await blobs.start();
const blobsURL = `http://localhost:${blobsPort}`;
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
  JSON.stringify({ siteID: "local", token: "local", edgeURL: blobsURL, uncachedEdgeURL: blobsURL })
).toString("base64");

// Load every function and turn its `config.path` into a matcher.
const routes = [];
const fnDir = join(root, "netlify/functions");
for (const file of await readdir(fnDir)) {
  const mod = await import(join(fnDir, file));
  for (const path of [].concat(mod.config.path)) {
    const names = [];
    const pattern = new RegExp("^" + path.replace(/\*/g, ".*").replace(/:(\w+)/g, (_, n) => (names.push(n), "([^/]+)")) + "$");
    routes.push({ pattern, names, handler: mod.default });
  }
}

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    const route = routes.find((r) => r.pattern.test(url.pathname));
    if (route) {
      const match = url.pathname.match(route.pattern);
      const params = Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(match[i + 1])]));
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      const response = await route.handler(request, { params, ip: req.socket.remoteAddress });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }

    // Same rewrite as netlify.toml: /f/anything shows form.html
    let file = url.pathname.startsWith("/f/") ? "/form.html" : url.pathname;
    if (file.endsWith("/")) file += "index.html";
    let full = resolve(root, "public", "." + file);
    if (!full.startsWith(join(root, "public"))) throw new Error("bad path");
    if ((await stat(full).catch(() => null))?.isDirectory()) full = join(full, "index.html");
    const body = await readFile(full);
    res.writeHead(200, { "content-type": types[extname(full)] || "application/octet-stream" });
    res.end(body);
  } catch (e) {
    if (e.code !== "ENOENT") console.error(e);
    res.writeHead(e.code === "ENOENT" ? 404 : 500);
    res.end(e.code === "ENOENT" ? "Not found" : "Server error");
  }
}).listen(PORT, () => console.log(`Testimonial Engine running at http://localhost:${PORT}`));
