// The Wall of Love page itself, shared by the public wall and the style
// preview in Settings, so the preview always matches the real thing.

import { CARD_CSS, FAVICON, badgeInner, badgeLabel, card, esc, fontsLink, rootVars, summaryLine } from "./render.mjs";

export function wallPage({ settings, snapshot, url }) {
  const c = settings.colours;
  const f = settings.fonts;
  const wall = snapshot.wall || {};
  const { count } = snapshot.stats;
  const showRatings = wall.showRatings !== false;
  const heading = wall.heading || "Wall of Love";
  const title = `${heading} | ${wall.eyebrow || snapshot.name} | ${settings.brandName}`;
  const description = [
    count && showRatings ? `${summaryLine(snapshot.stats)}.` : "",
    wall.subheading || "",
  ].filter(Boolean).join(" ");
  const brand = settings.logoUrl
    ? `<img src="${esc(settings.logoUrl)}" alt="${esc(settings.brandName)}">`
    : esc(settings.brandName);
  const home = settings.siteUrl ? esc(settings.siteUrl) : "";

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(`${heading} | ${wall.eyebrow || snapshot.name}`)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:site_name" content="${esc(settings.brandName)}">
${settings.logoUrl ? `<meta property="og:image" content="${esc(settings.logoUrl)}">` : ""}
<meta name="twitter:card" content="summary">
${FAVICON}
${fontsLink(f)}
<style>
${rootVars(c, f)}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--body);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.top{border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:16px;padding-bottom:16px}
.logo{font-family:var(--serif);font-size:22px;text-decoration:none}
.logo img{max-height:36px;display:block}
.pill{display:inline-block;background:var(--accent);color:var(--ink);font-family:var(--display);font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:12px 20px;border-radius:999px;text-decoration:none;white-space:nowrap}
.hero{padding:56px 0 40px;display:grid;grid-template-columns:1fr auto;gap:32px;align-items:end}
.eyebrow{font-family:var(--display);font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 14px}
.eyebrow span{background:linear-gradient(transparent 55%,var(--accent) 55%);padding:0 .15em}
h1{font-family:var(--display);text-transform:uppercase;font-weight:400;font-size:clamp(44px,9vw,88px);line-height:.96;margin:0;letter-spacing:-.01em;text-wrap:balance}
.sub{font-family:var(--serif);font-size:clamp(20px,2.6vw,26px);line-height:1.3;margin:18px 0 0;max-width:34ch}
.badge{background:var(--ink);color:var(--bg);width:180px;aspect-ratio:1;display:grid;place-content:center;text-align:center;gap:6px;padding:16px}
.badge .score{font-family:var(--display);font-size:56px;line-height:1}
.badge .stars svg{width:20px;height:20px;fill:var(--accent)}
.badge small{font-size:14px;color:color-mix(in srgb,var(--bg) 80%,transparent)}
.grid{columns:3 300px;column-gap:20px;padding:8px 0 64px}
${CARD_CSS}
.empty{text-align:center;padding:48px 0 96px;font-family:var(--serif);font-size:24px}
.foot{background:var(--ink);color:var(--bg);padding:40px 0 calc(40px + env(safe-area-inset-bottom))}
.foot .wrap{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between}
.foot p{margin:0;font-family:var(--display);text-transform:uppercase;letter-spacing:.12em;font-size:12px}
@media (max-width:760px){
  .hero{grid-template-columns:1fr;padding:36px 0 28px;gap:24px}
  .badge{width:100%;aspect-ratio:auto;grid-template-columns:auto 1fr;grid-template-rows:auto auto;place-content:center start;text-align:left;column-gap:16px;padding:18px 20px}
  .badge .score{grid-row:span 2;font-size:48px}
  .grid{columns:1}
}
</style>
</head>
<body>
<header class="top"><div class="wrap">
  ${home ? `<a class="logo" href="${home}">${brand}</a>` : `<span class="logo">${brand}</span>`}
  ${home ? `<a class="pill" href="${home}">Visit the site →</a>` : ""}
</div></header>
<main class="wrap">
  <section class="hero">
    <div>
      ${wall.eyebrow ? `<p class="eyebrow"><span>${esc(wall.eyebrow)}</span></p>` : ""}
      <h1>${esc(heading)}</h1>
      ${wall.subheading ? `<p class="sub">${esc(wall.subheading)}</p>` : ""}
    </div>
    ${count && showRatings ? `<div class="badge" role="img" aria-label="${badgeLabel(snapshot.stats)}">
      ${badgeInner(snapshot.stats)}
    </div>` : ""}
  </section>
  ${count ? `<section class="grid" aria-label="Testimonials">${snapshot.items.map((t) => card(t, { showRatings })).join("")}</section>`
    : `<p class="empty">The love is on its way. Check back soon.</p>`}
</main>
<footer class="foot"><div class="wrap"><p>${esc(settings.brandName)}</p>${home ? `<a class="pill" href="${home}">Visit the site →</a>` : ""}</div></footer>
</body>
</html>`;
}
