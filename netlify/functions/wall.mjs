// GET /wall/:slug -> the public Wall of Love for one collection.
// Built on the server so link previews (WhatsApp, Instagram, iMessage) work,
// and cached at the edge until a testimonial or collection changes.

import { cacheTag, getSnapshot } from "../lib/collections.mjs";
import { getSettings } from "../lib/store.mjs";
import { cacheHeaders } from "../lib/render.mjs";
import { wallPage } from "../lib/wallpage.mjs";

function notFound() {
  return new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Wall not found</title><meta name="robots" content="noindex"><style>body{font:18px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px;text-align:center;background:#fffdf2;color:#111}</style></head><body><div><h1>Hmm, no wall here</h1><p>Double-check the link you were sent.</p></div></body></html>`, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export default async (req, context) => {
  const slug = (context.params?.slug || "").toLowerCase();
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return notFound();

  const [snapshot, settings] = await Promise.all([getSnapshot(slug), getSettings()]);
  if (!snapshot) return notFound();

  const url = new URL(req.url);
  return new Response(wallPage({ settings, snapshot, url: `${url.origin}/wall/${slug}` }), {
    headers: { "content-type": "text/html; charset=utf-8", ...cacheHeaders(["wall", cacheTag(slug)]) },
  });
};

export const config = { path: "/wall/:slug" };
