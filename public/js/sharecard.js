// Draws a branded share card for one testimonial onto a canvas, ready to
// save or post to Instagram. Everything happens in the browser.
//
// window.ShareCard.draw(canvas, {
//   size: "square" | "portrait" | "story",
//   bg, colours, fonts,              // from the brand settings
//   text, name, role, rating,        // what goes on the card
//   photo,                           // a loaded <img>, or null for initials
//   initials, showStars, footer,
// })

(function () {
  const STAR = new Path2D("M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z");
  const SIZES = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920] };

  // Instagram covers the top and bottom of a story with its own buttons.
  const SAFE = { square: [0, 0], portrait: [0, 0], story: [230, 280] };

  const MARGIN = 80;      // gap around the card
  const PAD = 72;         // space inside the card
  const SHADOW = 16;      // the offset block shadow, like featured cards on the wall
  const MARK = 112;       // room for the big quote mark
  const STARS = 84;       // star row plus its gap
  const WHO = 184;        // gap, divider and the photo and name row
  const FOOTER = 96;      // the line under the card

  function wrap(ctx, text, width) {
    const lines = [];
    for (const para of text.split(/\n+/)) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? `${line} ${word}` : word;
        if (!line || ctx.measureText(test).width <= width) line = test;
        else { lines.push(line); line = word; }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  function fit(ctx, text, width) {
    if (ctx.measureText(text).width <= width) return text;
    let out = text;
    while (out && ctx.measureText(`${out}…`).width > width) out = out.slice(0, -1);
    return `${out.trimEnd()}…`;
  }

  function draw(canvas, o) {
    const [W, H] = SIZES[o.size] || SIZES.square;
    const [safeTop, safeBottom] = SAFE[o.size] || SAFE.square;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const c = o.colours;
    const onDark = o.bg.toLowerCase() === c.ink.toLowerCase();

    const serif = `"${o.fonts.serif}", Georgia, serif`;
    const display = `"${o.fonts.heading}", "Arial Black", sans-serif`;
    const body = `"${o.fonts.body}", Arial, sans-serif`;

    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, W, H);

    const cardW = W - MARGIN * 2 - SHADOW;
    const innerW = cardW - PAD * 2;
    const footerH = o.footer ? FOOTER : 0;
    const availH = H - safeTop - safeBottom - MARGIN * 2 - SHADOW - footerH;
    const starsH = o.showStars && o.rating ? STARS : 0;
    const fixedH = PAD * 2 + MARK + starsH + WHO;

    // Biggest text size that still fits, from 68px down to 30px.
    let size = 68;
    let lines = [];
    let lineH = 0;
    for (; size >= 30; size -= 2) {
      ctx.font = `${size}px ${serif}`;
      lines = wrap(ctx, o.text || " ", innerW);
      lineH = Math.round(size * 1.28);
      if (fixedH + lines.length * lineH <= availH) break;
    }
    size = Math.max(size, 30);
    const maxLines = Math.max(1, Math.floor((availH - fixedH) / lineH));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, "")}…`;
    }

    const cardH = fixedH + lines.length * lineH;
    const x = MARGIN;
    const y = safeTop + MARGIN + Math.max(0, (availH - cardH) / 2);

    // Card with its block shadow.
    ctx.fillStyle = onDark ? c.accent : c.ink;
    ctx.beginPath();
    ctx.roundRect(x + SHADOW, y + SHADOW, cardW, cardH, 36);
    ctx.fill();
    ctx.fillStyle = c.surface;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 36);
    ctx.fill();
    ctx.stroke();

    let cy = y + PAD;

    // Big quote mark.
    ctx.fillStyle = c.spark;
    ctx.font = `230px ${serif}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText("“", x + PAD - 8, cy + 168);
    cy += MARK;

    // Stars.
    if (starsH) {
      const s = 46;
      for (let i = 0; i < o.rating; i++) {
        ctx.save();
        ctx.translate(x + PAD + i * (s + 8), cy);
        ctx.scale(s / 24, s / 24);
        ctx.fillStyle = c.accent;
        ctx.fill(STAR);
        ctx.strokeStyle = c.ink;
        ctx.lineWidth = 1.3;
        ctx.lineJoin = "round";
        ctx.stroke(STAR);
        ctx.restore();
      }
      cy += starsH;
    }

    // The words.
    ctx.fillStyle = c.ink;
    ctx.font = `${size}px ${serif}`;
    ctx.textBaseline = "top";
    lines.forEach((line, i) => ctx.fillText(line, x + PAD, cy + i * lineH));
    cy += lines.length * lineH + 44;

    // Divider.
    ctx.globalAlpha = 0.14;
    ctx.fillRect(x + PAD, cy, innerW, 3);
    ctx.globalAlpha = 1;
    cy += 43;

    // Photo or initials, then name and role.
    const r = 48;
    const fx = x + PAD + r;
    const fy = cy + r;
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.closePath();
    if (o.photo) {
      ctx.clip();
      const side = Math.min(o.photo.naturalWidth, o.photo.naturalHeight);
      ctx.drawImage(o.photo, (o.photo.naturalWidth - side) / 2, (o.photo.naturalHeight - side) / 2, side, side, fx - r, fy - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = c.accent;
      ctx.fill();
      ctx.fillStyle = c.ink;
      ctx.font = `34px ${display}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(o.initials || "♥", fx, fy + 2);
    }
    ctx.restore();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.stroke();

    const tx = x + PAD + r * 2 + 28;
    const tw = x + cardW - PAD - tx;
    ctx.fillStyle = c.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `40px ${display}`;
    if (o.role) {
      ctx.fillText(fit(ctx, o.name, tw), tx, fy - 22);
      ctx.globalAlpha = 0.65;
      ctx.font = `30px ${body}`;
      ctx.fillText(fit(ctx, o.role, tw), tx, fy + 26);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillText(fit(ctx, o.name, tw), tx, fy + 2);
    }

    // The line under the card.
    if (o.footer) {
      ctx.fillStyle = onDark ? c.surface : c.ink;
      ctx.font = `34px ${display}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fit(ctx, o.footer, W - MARGIN * 2), W / 2, y + cardH + SHADOW + FOOTER / 2 + 16);
      ctx.textAlign = "left";
    }
  }

  window.ShareCard = { draw, SIZES };
})();
