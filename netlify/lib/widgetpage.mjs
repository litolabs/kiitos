// The embeddable widget pages, shared by the public widgets and the style
// preview in Settings.
//
// Fixed heights, so a Showit Embed Code box can be set to match exactly:
//   marquee  rows x 60 + (rows - 1) x 8 + 8   (1 row 68, 2 rows 136, 3 rows 204, 4 rows 272)
//   avatars  104
//   badge    76  (compact: black score square with the stars and count beside it)
//   grid and card grow with their content.
// Styles: marquee, avatars, badge, grid, card.
// Shown inside an iframe. It tells the page around it how tall it is, so the
// small /embed.js loader can resize the iframe to fit.

import { CARD_CSS, badgeInner, badgeLabel, card, esc, face, fontsLink, plural, rootVars, stars } from "./render.mjs";

export const STYLES = ["marquee", "avatars", "badge", "grid", "card"];
const HEX = /^[0-9a-f]{6}$/i;
const SPEEDS = { slow: 18, medium: 13, fast: 9 }; // seconds per card
const PER_ROW = 8; // cards per row; keeps the moving strip short enough for iPhones to draw in full

const int = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Colours can be overridden per embed with ?bg=, ?accent=, ?ink=, ?surface=
// (hex without the #). bg also accepts "transparent".
function colours(settings, q) {
  const c = { ...settings.colours };
  for (const [param, key] of [["accent", "accent"], ["ink", "ink"], ["surface", "surface"]]) {
    if (HEX.test(q.get(param) || "")) c[key] = `#${q.get(param)}`;
  }
  const bg = q.get("bg") || "transparent";
  return { c, pageBg: bg === "page" ? c.background : HEX.test(bg) ? `#${bg}` : "transparent" };
}

// The highlight if the owner picked one. Otherwise the opening of the second
// paragraph (usually "what changed"), which tends to be the most quotable.
const shortText = (t) => {
  if (t.highlight) return t.highlight;
  const paragraphs = t.body.split(/\n{2,}/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const source = paragraphs[1] || paragraphs[0] || "";
  let text = "";
  for (const sentence of source.split(/(?<=[.!?])\s/)) {
    text = text ? `${text} ${sentence}` : sentence;
    if (text.length >= 40) break; // enough to land as a quote
  }
  if (text.length <= 90) return text;
  return `${text.slice(0, 87).replace(/\s+\S*$/, "")}…`;
};

// ---------- Styles ----------

function marquee(items, q) {
  if (!items.length) return "";
  // Always draw the rows asked for, so the height is predictable. With fewer
  // testimonials than rows, every row shows them all, starting at a different one.
  const rowCount = int(q.get("rows"), 1, 4, 3);
  const perCard = SPEEDS[q.get("speed")] || SPEEDS.medium;
  const showNames = q.get("names") === "1";
  // Each row shows up to PER_ROW cards. Which ones moves on each day, so every
  // testimonial gets its turn without the strip growing too long.
  const day = Math.floor(Date.now() / 86400000);
  const rows = Array.from({ length: rowCount }, (_, r) => {
    const all = items.length >= rowCount
      ? items.filter((_, i) => i % rowCount === r)
      : items.map((_, i) => items[(i + r) % items.length]);
    if (all.length <= PER_ROW) return all;
    const start = (day * PER_ROW) % all.length;
    return Array.from({ length: PER_ROW }, (_, i) => all[(start + i) % all.length]);
  });
  const pill = (t) => `<div class="pill" title="${esc(t.name)}">${face(t, "face sm", { eager: true })}<span class="q" aria-hidden="true">“</span><span class="txt">${esc(shortText(t))}${showNames ? ` <em>${esc(t.name)}</em>` : ""}</span></div>`;
  return `<div class="marquee" aria-label="Testimonials">${rows.map((row, r) => {
    let cards = row;
    while (cards.length < 6) cards = cards.concat(row); // enough to fill wide screens
    const duration = Math.round(cards.length * perCard * (1 + r * 0.18));
    const set = cards.map(pill).join("");
    return `<div class="row"><div class="track" style="--dur:${duration}s">${set}<div class="dupe" aria-hidden="true">${set}</div></div></div>`;
  }).join("")}</div>`;
}

function avatars(items, stats, q) {
  if (!items.length) return "";
  const max = int(q.get("max"), 3, 30, 10);
  const shown = [...items.filter((t) => t.avatar), ...items.filter((t) => !t.avatar)].slice(0, max);
  const extra = items.length - shown.length;
  const caption = q.get("caption") !== "0";
  return `<div class="strip">
    <div class="faces">${shown.map((t) => face(t, "face av")).join("")}${extra > 0 ? `<span class="face av more">+${extra}</span>` : ""}</div>
    ${caption ? `<p class="cap">${stats.rated ?? stats.count ? `${stars(stats.average)} <strong>${stats.average.toFixed(1)}</strong> from ` : ""}${plural(stats.count, "testimonial")}</p>` : ""}
  </div>`;
}

function badge(stats) {
  if (!stats.count) return "";
  return `<div class="badge-wrap"><div class="badge" role="img" aria-label="${badgeLabel(stats)}">
    ${badgeInner(stats, { compact: true })}
  </div></div>`;
}

function grid(items, showRatings, q) {
  const limit = int(q.get("limit"), 0, 100, 6);
  const chosen = limit ? items.slice(0, limit) : items;
  return chosen.length ? `<div class="grid">${chosen.map((t) => card(t, { showRatings })).join("")}</div>` : "";
}

function single(items, showRatings, q) {
  const t = items.find((x) => x.id === q.get("id")) || items.find((x) => x.featured) || items[0];
  return t ? `<div class="single">${card(t, { showRatings, featuredStyle: false })}</div>` : "";
}

// ---------- Page ----------

const STYLE_CSS = `
html,body{margin:0;overflow:hidden;background:var(--page-bg);color:var(--ink);font-family:var(--body);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
.marquee{display:grid;gap:8px;padding:4px 0}
.row{height:60px;padding:4px 0;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent);mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent)}
.track{display:flex;height:52px;width:max-content;animation:slide var(--dur) linear infinite;will-change:transform;transform:translate3d(0,0,0);-webkit-backface-visibility:hidden;backface-visibility:hidden}
.dupe{display:flex}
.row:hover .track,.row:focus-within .track{animation-play-state:paused}
@keyframes slide{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
.pill{display:flex;align-items:center;gap:10px;height:52px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:0 22px 0 7px;margin-right:12px;white-space:nowrap;box-shadow:0 1px 6px rgba(0,0,0,.06)}
.pill .q{font-family:var(--serif);font-size:30px;line-height:.6;margin-top:10px}
.pill .txt{font-size:15px}
.pill em{font-style:normal;color:var(--muted);font-weight:600}
.face.sm{width:36px;height:36px;font-size:12px;border-width:1.5px}
@media (max-width:480px){.pill{gap:8px;padding:0 16px 0 7px;margin-right:10px}.pill .txt{font-size:14px}.pill .q{font-size:26px}}
@media (prefers-reduced-motion:reduce){
  .track{animation:none}.dupe{display:none}
  .row{overflow-x:auto;-webkit-mask-image:none;mask-image:none;scrollbar-width:none}
  .row::-webkit-scrollbar{display:none}
}
.strip{height:104px;padding:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
.faces{display:flex;align-items:center;justify-content:center;flex-wrap:nowrap;padding-left:14px}
.face.av{width:52px;height:52px;margin-left:-14px;border:3px solid var(--ring);font-size:15px}
.face.more{background:var(--ink);color:var(--surface);font-family:var(--body);font-weight:700;font-size:14px}
.cap{margin:10px 0 0;display:flex;gap:6px;align-items:center;justify-content:center;white-space:nowrap;font-size:15px}
@media (max-width:480px){.faces{padding-left:12px}.face.av{width:40px;height:40px;margin-left:-12px;border-width:2px;font-size:12px}}
.cap .stars{display:inline-flex;gap:1px}
.cap .stars svg{width:16px;height:16px;fill:var(--accent);stroke:var(--ink);stroke-width:1.2}
.badge-wrap{height:76px;display:flex;justify-content:center;align-items:center;padding:4px}
.badge{display:flex;align-items:center;gap:12px;color:var(--ink);max-width:100%}
.badge .score{flex:none;width:64px;height:64px;display:grid;place-items:center;background:var(--ink);color:var(--surface);font-family:var(--display);font-size:26px;line-height:1;border-radius:4px}
.badge .meta{display:grid;gap:3px;text-align:left;min-width:0}
.badge .stars{display:flex;gap:2px}
.badge .stars svg{width:20px;height:20px;fill:var(--accent);stroke:var(--ink);stroke-width:1.2;stroke-linejoin:round}
.badge small{font-size:15px;line-height:1.25;color:var(--muted);font-weight:600}
.grid{columns:3 280px;column-gap:20px;padding:4px 4px 0}
.single{max-width:680px;margin:0 auto;padding:4px 8px 10px}
.single .pull{font-size:clamp(22px,4vw,30px)}
`;

export function widgetPage({ settings, snapshot, style, q }) {
  const { c, pageBg } = colours(settings, q);
  const showRatings = q.get("ratings") !== "0" && snapshot.wall?.showRatings !== false;
  const items = snapshot.items;
  const body =
    style === "marquee" ? marquee(items, q)
    : style === "avatars" ? avatars(items, snapshot.stats, q)
    : style === "badge" ? badge(snapshot.stats)
    : style === "grid" ? grid(items, showRatings, q)
    : single(items, showRatings, q);

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(snapshot.name)} testimonials</title>
<base target="_blank">
${fontsLink(settings.fonts)}
<style>
${rootVars(c, settings.fonts)}
:root{--page-bg:${pageBg};--ring:${pageBg === "transparent" ? c.surface : pageBg}}
${CARD_CSS}
${STYLE_CSS}
</style>
</head>
<body>
${body}
<script>
(function(){
  var last = 0;
  function send(){
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (h !== last) { last = h; parent.postMessage({ type: "love-widget:height", height: h }, "*"); }
  }
  new ResizeObserver(send).observe(document.documentElement);
  addEventListener("load", send);
  send();
})();
</script>
</body>
</html>`;
}
