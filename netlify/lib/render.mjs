// Shared building blocks for the public pages (the wall and the widgets),
// so a testimonial card looks the same everywhere.

export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
export const stars = (n) => `<span class="stars" role="img" aria-label="${n} out of 5 stars">${STAR.repeat(Math.round(n))}</span>`;

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Older or imported testimonials may have no star rating. When none of them
// do, show the count instead of a made-up average.
const isRated = (stats) => (stats.rated ?? stats.count) > 0;

export const summaryLine = (stats) =>
  isRated(stats) ? `${stats.average.toFixed(1)} stars from ${plural(stats.count, "testimonial")}` : plural(stats.count, "testimonial");

export function badgeInner(stats, { compact = false } = {}) {
  if (compact) {
    // Widget badge: score square on the left, stars and count beside it.
    return isRated(stats)
      ? `<span class="score">${stats.average.toFixed(1)}</span><span class="meta">${stars(stats.average)}<small>from ${plural(stats.count, "testimonial")}</small></span>`
      : `<span class="score">${stats.count}</span><span class="meta"><small>${stats.count === 1 ? "testimonial" : "testimonials"}<br>and counting</small></span>`;
  }
  return isRated(stats)
    ? `<span class="score">${stats.average.toFixed(1)}</span>${stars(stats.average)}<small>from ${plural(stats.count, "testimonial")}</small>`
    : `<span class="score">${stats.count}</span><small>${stats.count === 1 ? "testimonial" : "testimonials"} and counting</small>`;
}

export function badgeLabel(stats) {
  return isRated(stats) ? `${stats.average.toFixed(1)} out of 5 from ${plural(stats.count, "testimonial")}` : plural(stats.count, "testimonial");
}

const initialsOf = (name) =>
  name.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")[0] || "").join("").slice(0, 2).toUpperCase() || "♥";

export function face(t, cls = "face", { eager = false } = {}) {
  return t.avatar
    ? `<img class="${cls}" src="${esc(t.avatar)}" alt=""${eager ? ' decoding="async"' : ' loading="lazy"'}>`
    : `<span class="${cls} face-blank" aria-hidden="true">${esc(initialsOf(t.name))}</span>`;
}

function websiteLink(site) {
  const value = (site || "").trim();
  if (!value) return "";
  let href = "";
  if (value.startsWith("@")) href = `https://instagram.com/${encodeURIComponent(value.slice(1))}`;
  else if (/^https?:\/\//i.test(value)) href = value;
  else if (/^[\w-]+(\.[\w-]+)+/.test(value)) href = `https://${value}`;
  if (!href) return "";
  return `<a href="${esc(href)}" rel="nofollow noopener" target="_blank">${esc(value.replace(/^https?:\/\//i, "").replace(/\/$/, ""))}</a>`;
}

export function card(t, { showRatings = true, featuredStyle = true } = {}) {
  const paragraphs = t.body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const meta = [t.role ? esc(t.role) : "", websiteLink(t.website)].filter(Boolean).join(" · ");
  return `<article class="card${t.featured && featuredStyle ? " is-featured" : ""}">
    ${showRatings && t.rating ? stars(t.rating) : ""}
    ${t.highlight ? `<p class="pull">${esc(t.highlight)}</p>` : ""}
    <div class="body">${paragraphs}</div>
    <footer class="who">${face(t)}<div><strong>${esc(t.name)}</strong>${meta ? `<span>${meta}</span>` : ""}</div></footer>
  </article>`;
}

export function fontsLink(f) {
  const families = [f.heading, `${f.serif}:ital@0;1`, `${f.body}:wght@400;600;700`]
    .map((name) => "family=" + encodeURIComponent(name).replace(/%20/g, "+").replace(/%3A/g, ":").replace(/%3B/g, ";").replace(/%40/g, "@"))
    .join("&");
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=swap">`;
}

export function rootVars(c, f) {
  return `:root{
  --bg:${c.background};--surface:${c.surface};--ink:${c.ink};--accent:${c.accent};--spark:${c.spark};--spark-alt:${c.sparkAlt};
  --muted:color-mix(in srgb,var(--ink) 62%,transparent);--line:color-mix(in srgb,var(--ink) 12%,transparent);
  --display:"${f.heading}","Arial Black",Impact,sans-serif;--serif:"${f.serif}",Georgia,serif;--body:"${f.body}","Helvetica Neue",Arial,sans-serif;
  color-scheme:light;
}`;
}

export const CARD_CSS = `
.card{break-inside:avoid;background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:22px;margin:0 0 20px;display:grid;gap:14px;color:var(--ink)}
.card.is-featured{border:2px solid var(--ink);box-shadow:6px 6px 0 var(--ink)}
.card .stars{display:flex;gap:2px}
.card .stars svg{width:18px;height:18px;fill:var(--accent);stroke:var(--ink);stroke-width:1.2;stroke-linejoin:round}
.pull{font-family:var(--serif);font-size:22px;line-height:1.25;margin:0}
.body p{margin:0 0 .8em;overflow-wrap:anywhere}
.body p:last-child{margin-bottom:0}
.who{display:flex;align-items:center;gap:12px;padding-top:14px;border-top:1px solid var(--line)}
.who div{min-width:0}
.who strong{display:block;font-weight:700}
.who div span{display:block;color:var(--muted);font-size:14px;overflow-wrap:anywhere}
.face{width:48px;height:48px;border-radius:50%;border:2px solid var(--ink);object-fit:cover;flex:none;background:var(--accent);color:var(--ink);display:grid;place-items:center;font-family:var(--display);font-size:15px}
a{color:inherit}
a:focus-visible{outline:3px solid var(--spark);outline-offset:3px;border-radius:4px}
`;

export const FAVICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ctext y=%22.9em%22 font-size=%2290%22%3E%E2%AD%90%3C/text%3E%3C/svg%3E">`;

// Shared edge caching: browsers always check back, Netlify keeps a copy for
// up to 5 minutes and clears it the moment anything on the wall changes.
export const cacheHeaders = (tags) => ({
  "cache-control": "public, max-age=0, must-revalidate",
  "netlify-cdn-cache-control": "public, durable, max-age=300, stale-while-revalidate=600",
  "netlify-cache-tag": tags.join(","),
});
