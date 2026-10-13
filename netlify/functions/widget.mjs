// GET /w/:slug/:style -> an embeddable widget for one collection.
//
// Fixed heights, so a Showit Embed Code box can be set to match exactly:
//   marquee  rows x 60 + (rows - 1) x 8 + 8   (1 row 68, 2 rows 136, 3 rows 204, 4 rows 272)
//   avatars  104
//   badge    76  (compact: black score square with the stars and count beside it)
//   grid and card grow with their content.
// Styles: marquee, avatars, badge, grid, card.
// Shown inside an iframe. It tells the page around it how tall it is, so the
// small /embed.js loader can resize the iframe to fit.

import { cacheTag, getSnapshot } from "../lib/collections.mjs";
import { cacheHeaders } from "../lib/render.mjs";
import { getSettings } from "../lib/store.mjs";
import { STYLES, widgetPage } from "../lib/widgetpage.mjs";

export default async (req, context) => {
  const slug = (context.params?.slug || "").toLowerCase();
  const style = (context.params?.style || "").toLowerCase();
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || !STYLES.includes(style)) {
    return new Response("Widget not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const [snapshot, settings] = await Promise.all([getSnapshot(slug), getSettings()]);
  if (!snapshot) return new Response("Widget not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

  const q = new URL(req.url).searchParams;
  return new Response(widgetPage({ settings, snapshot, style, q }), {
    headers: { "content-type": "text/html; charset=utf-8", ...cacheHeaders(["wall", cacheTag(slug)]) },
  });
};

export const config = { path: "/w/:slug/:style" };
