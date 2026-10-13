// The testimonial form. One question per screen, with a progress bar.
// Everything it says comes from the form and settings records in storage.

(function () {
  const app = document.getElementById("app");
  const backBtn = document.getElementById("back");
  const progress = document.getElementById("progress");
  const slug = decodeURIComponent(location.pathname.split("/").filter(Boolean)[1] || new URLSearchParams(location.search).get("form") || "");
  const prefill = new URLSearchParams(location.search);

  const RATING_WORDS = ["", "Not for me", "It was okay", "Pretty good", "Really good", "Absolutely loved it"];
  const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";

  const state = { rating: 0, answers: {}, avatar: "", consent: { publishName: null, publishPhoto: null } };
  let form, settings, steps = [], current = 0;

  // Tiny helper for building elements safely (text is never treated as HTML).
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
    }
    for (const child of children.flat()) if (child) node.append(child);
    return node;
  }

  // ?style-preview=1 shows the form inside the Settings preview. Settings sends
  // its unsaved colours and fonts in, and nothing can be sent from here.
  const stylePreview = new URLSearchParams(location.search).has("style-preview");

  function applyTheme() {
    const c = { ...settings.colours, ...(form.theme?.colours || {}) };
    const f = { ...settings.fonts, ...(form.theme?.fonts || {}) };
    const root = document.documentElement.style;
    root.setProperty("--bg", c.background);
    root.setProperty("--surface", c.surface);
    root.setProperty("--ink", c.ink);
    root.setProperty("--accent", c.accent);
    root.setProperty("--spark", c.spark);
    root.setProperty("--spark-alt", c.sparkAlt);
    root.setProperty("--font-heading", `"${f.heading}", system-ui, sans-serif`);
    root.setProperty("--font-serif", `"${f.serif}", Georgia, serif`);
    root.setProperty("--font-body", `"${f.body}", system-ui, sans-serif`);

    const families = [f.heading, f.serif, `${f.body}:wght@400;600;700`]
      .map((name) => "family=" + name.replace(/ /g, "+")).join("&");
    const href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    const fontLink = document.getElementById("brand-fonts");
    if (fontLink) fontLink.href = href;
    else document.head.append(el("link", { id: "brand-fonts", rel: "stylesheet", href }));

    const brand = document.getElementById("brand");
    brand.replaceChildren(settings.logoUrl ? el("img", { src: settings.logoUrl, alt: settings.brandName }) : settings.brandName);
    document.title = `${form.title} | ${settings.brandName}`;
  }

  function actions(...buttons) {
    return el("div", { class: "actions" }, el("p", { class: "error", role: "alert" }), ...buttons);
  }

  function nextButton(label = "Next", onclick = () => go(current + 1)) {
    return el("button", { type: "button", class: "btn", onclick, text: label });
  }

  function showError(step, message) {
    step.querySelector(".error").textContent = message || "";
  }

  // ---------- Steps ----------

  // Welcome words: a blank line starts a new paragraph, and lines that start
  // with "- " become a bulleted list. Always plain text, never HTML.
  function introBlocks(text) {
    return (text || "").split(/\n\s*\n/).map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return null;
      const bullets = lines.filter((l) => /^[-•*]\s+/.test(l));
      if (bullets.length === lines.length) return el("ul", {}, ...lines.map((l) => el("li", { text: l.replace(/^[-•*]\s+/, "") })));
      if (bullets.length) {
        const intro = lines.filter((l) => !/^[-•*]\s+/.test(l));
        return [el("p", { text: intro.join(" ") }), el("ul", {}, ...bullets.map((l) => el("li", { text: l.replace(/^[-•*]\s+/, "") })))];
      }
      return el("p", { text: lines.join("\n") });
    }).flat().filter(Boolean);
  }

  function welcomeStep() {
    return el("section", { class: "step" },
      el("h1", { text: form.title }),
      el("div", { class: "intro" }, ...introBlocks(form.intro)),
      actions(nextButton("Let's go"))
    );
  }

  function ratingStep() {
    const label = el("p", { class: "rating-label" });
    const next = nextButton();
    next.disabled = true;
    const stars = el("div", { class: "stars", role: "radiogroup", "aria-label": "Star rating" });
    const paint = () => {
      [...stars.children].forEach((s, i) => {
        s.classList.toggle("is-on", i < state.rating);
        s.setAttribute("aria-checked", String(i + 1 === state.rating));
      });
      label.textContent = RATING_WORDS[state.rating];
      next.disabled = !state.rating;
    };
    for (let n = 1; n <= 5; n++) {
      const star = el("button", {
        type: "button", class: "star", role: "radio", "aria-label": `${n} star${n > 1 ? "s" : ""}`,
        onclick: () => { state.rating = n; paint(); },
      });
      star.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
      stars.append(star);
    }
    paint();
    return el("section", { class: "step" },
      el("h2", { text: form.ratingPrompt || "How many stars would you give it?" }),
      stars, label,
      actions(next)
    );
  }

  function questionStep(q) {
    const area = el("textarea", { id: `q-${q.id}`, "aria-describedby": `h-${q.id}`, rows: 6 });
    area.addEventListener("input", () => { state.answers[q.id] = area.value; });
    const step = el("section", { class: "step" },
      el("h2", {}, el("label", { for: `q-${q.id}`, text: q.prompt })),
      q.helper ? el("p", { class: "helper", id: `h-${q.id}`, text: q.helper }) : null,
      area,
      actions(
        nextButton("Next", () => {
          if (q.required && !area.value.trim()) return showError(step, "Just a sentence or two will do.");
          showError(step, "");
          go(current + 1);
        }),
        q.required ? null : el("button", { type: "button", class: "btn ghost", text: "Skip this one", onclick: () => go(current + 1) })
      )
    );
    step.focusTarget = area;
    return step;
  }

  function field(label, input, { optional, hint } = {}) {
    return el("label", { class: "field" },
      label, optional ? el("span", { class: "optional", text: " (optional)" }) : null,
      hint ? el("small", { text: hint }) : null,
      input
    );
  }

  function aboutStep() {
    const name = el("input", { type: "text", name: "name", autocomplete: "name", required: true, value: prefill.get("name") || "" });
    const role = el("input", { type: "text", name: "role", autocomplete: "organization-title", value: prefill.get("role") || "" });
    const email = el("input", { type: "email", name: "email", autocomplete: "email", inputmode: "email", value: prefill.get("email") || "" });
    const website = el("input", { type: "text", name: "website", autocomplete: "url", inputmode: "url", placeholder: "yoursite.com or @yourhandle" });
    const honeypot = el("div", { class: "hp", "aria-hidden": "true" },
      el("label", { text: "Leave this empty" }, el("input", { type: "text", name: "fax", tabindex: "-1", autocomplete: "off" })));

    const step = el("section", { class: "step" },
      el("h2", { text: "A little about you" }),
      field("Your name", name),
      field("What you do", role, { optional: true, hint: "Your role or business, as you'd like it shown." }),
      field("Email", email, { optional: true, hint: `Private. Only ${settings.brandName} sees this.` }),
      field("Website or Instagram", website, { optional: true }),
      honeypot,
      actions(nextButton("Next", () => {
        if (!name.value.trim()) return showError(step, "We'd love to know who this is from.");
        if (email.value && !email.checkValidity()) return showError(step, "That email address doesn't look quite right.");
        showError(step, "");
        Object.assign(state, {
          name: name.value, role: role.value, email: email.value, website: website.value,
          fax: honeypot.querySelector("input").value,
        });
        go(current + 1);
      }))
    );
    step.focusTarget = name.value ? null : name;
    return step;
  }

  function photoStep() {
    const fileInput = el("input", { type: "file", accept: "image/*" });
    const drop = el("label", { class: "photo-drop" },
      el("span", { class: "badge", text: "Add a photo" }),
      el("span", { class: "muted", text: "A friendly face makes your words land even better. A square crop is all we keep." }),
      fileInput
    );
    const cropBox = el("div", { class: "cropper", hidden: true });
    const zoom = el("input", { type: "range", min: "1", max: "4", step: "0.01", value: "1", "aria-label": "Zoom" });
    const zoomRow = el("div", { class: "zoom", hidden: true }, el("span", { text: "−", "aria-hidden": "true" }), zoom, el("span", { text: "+", "aria-hidden": "true" }));
    const preview = el("img", { class: "photo-preview", alt: "Your photo", hidden: true });
    let cropper = null;

    const useBtn = nextButton("Use this photo", () => {
      state.avatar = cropper.toDataURL();
      preview.src = state.avatar;
      preview.hidden = false;
      cropBox.hidden = zoomRow.hidden = true;
      drop.hidden = false;
      drop.querySelector(".badge").textContent = "Choose a different photo";
      useBtn.hidden = true;
      go(current + 1);
    });
    useBtn.hidden = true;

    const step = el("section", { class: "step" },
      el("h2", { text: "Got a photo?" }),
      preview, drop, cropBox, zoomRow,
      actions(useBtn, el("button", {
        type: "button", class: "btn ghost", text: "Skip the photo", onclick: () => {
          state.avatar = ""; preview.hidden = true; cropBox.hidden = zoomRow.hidden = true; drop.hidden = false; useBtn.hidden = true;
          go(current + 1);
        },
      }))
    );

    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        showError(step, "");
        drop.hidden = true;
        preview.hidden = true;
        cropBox.hidden = zoomRow.hidden = false;
        useBtn.hidden = false;
        cropper = window.PhotoCropper(cropBox, zoom, img);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => showError(step, "We couldn't open that photo. Try a JPEG or PNG?");
      img.src = URL.createObjectURL(file);
      fileInput.value = "";
    });

    return step;
  }

  function consentStep() {
    // One clear yes or no question each, nothing chosen in advance.
    const question = (key, text) => {
      const buttons = ["Yes", "No"].map((label) => el("button", {
        type: "button", class: "choice", "aria-pressed": "false", text: label,
        onclick: () => {
          state.consent[key] = label === "Yes";
          buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === buttons[label === "Yes" ? 0 : 1])));
          showError(step, "");
        },
      }));
      const block = el("div", { class: "consent-q", role: "group", "aria-label": text },
        el("p", { class: "consent-text", text }), el("div", { class: "choices" }, ...buttons));
      block.reset = () => { state.consent[key] = null; buttons.forEach((b) => b.setAttribute("aria-pressed", "false")); };
      return block;
    };
    const nameQ = question("publishName", settings.consent.publishName);
    const photoQ = question("publishPhoto", settings.consent.publishPhoto);
    const submit = nextButton("Send my testimonial", () => {
      const unanswered = state.consent.publishName === null || (state.avatar && state.consent.publishPhoto === null);
      if (unanswered) return showError(step, "Just pop a yes or no on each question.");
      send(step, submit);
    });
    const step = el("section", { class: "step" },
      el("h2", { text: "Last bit. Can we share it?" }),
      el("div", { class: "card" },
        nameQ, photoQ,
        settings.consent.note ? el("p", { class: "muted", style: "margin:14px 0 0", text: settings.consent.note }) : null
      ),
      actions(submit)
    );
    // The photo question only makes sense if they added a photo.
    step.onShow = () => {
      photoQ.hidden = !state.avatar;
      if (!state.avatar) photoQ.reset();
    };
    return step;
  }

  function thanksStep() {
    const ty = form.thankYou || {};
    const receipt = el("div", { class: "card receipt" }, el("p", { class: "muted", style: "margin:0", text: "Checking it saved…" }));
    const step = el("section", { class: "step thanks" },
      el("div", { class: "big", "aria-hidden": "true", text: "🎉" }),
      el("h1", {}, el("span", { class: "highlight", text: ty.heading || "Thank you" })),
      el("p", { class: "helper", text: ty.message || "" }),
      receipt,
      ty.linkUrl ? actions(el("a", { class: "btn", href: ty.linkUrl, target: "_blank", rel: "noopener", text: ty.linkLabel || "Keep going" })) : null
    );
    step.receipt = receipt;
    return step;
  }

  // ---------- Flow ----------

  if (stylePreview) {
    window.addEventListener("message", (e) => {
      if (e.origin !== location.origin || e.data?.type !== "kiitos:style" || !settings) return;
      settings = { ...settings, colours: { ...settings.colours, ...e.data.colours }, fonts: { ...settings.fonts, ...e.data.fonts }, brandName: e.data.brandName || settings.brandName };
      applyTheme();
    });
  }

  async function send(step, button) {
    if (stylePreview) {
      showError(step, "This is a preview, so nothing was sent.");
      return;
    }
    button.disabled = true;
    button.textContent = "Sending…";
    showError(step, "");
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formSlug: form.slug, rating: state.rating, answers: state.answers,
          name: state.name, role: state.role, email: state.email, website: state.website,
          avatar: state.avatar, fax: state.fax,
          consent: { publishName: state.consent.publishName === true, publishPhoto: Boolean(state.avatar) && state.consent.publishPhoto === true },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      go(current + 1);
      window.celebrate([settings.colours.accent, settings.colours.spark, settings.colours.sparkAlt, settings.colours.ink]);
      showReceipt(data.id);
    } catch (e) {
      showError(step, e.message);
      button.disabled = false;
      button.textContent = "Send my testimonial";
    }
  }

  async function showReceipt(id) {
    const box = steps[steps.length - 1].receipt;
    try {
      const res = await fetch(`/api/receipt/${id}`);
      if (!res.ok) throw new Error();
      const r = await res.json();
      const when = new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
      box.replaceChildren(
        el("p", { style: "margin:0 0 10px" }, el("span", { class: "badge", text: "✓ Saved" })),
        el("dl", {},
          el("dt", { text: "From" }), el("dd", { text: r.name }),
          r.rating ? el("dt", { text: "Stars" }) : null, r.rating ? el("dd", { text: "★".repeat(r.rating) }) : null,
          el("dt", { text: "Photo" }), el("dd", { text: r.hasPhoto ? "Yes" : "No" }),
          el("dt", { text: "Saved" }), el("dd", { text: when }),
          el("dt", { text: "Status" }), el("dd", { text: r.status === "pending" ? "Waiting for approval" : r.status })
        )
      );
    } catch {
      box.replaceChildren(el("p", { class: "muted", style: "margin:0", text: "Sent. Thank you!" }));
    }
  }

  function go(index) {
    current = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((s, i) => s.classList.toggle("is-active", i === current));
    const last = steps.length - 1;
    progress.style.width = `${(current / last) * 100}%`;
    backBtn.hidden = current === 0 || current === last;
    window.scrollTo({ top: 0 });
    steps[current].onShow?.();
    const target = steps[current].focusTarget;
    if (target && matchMedia("(hover: hover)").matches) target.focus();
  }

  backBtn.addEventListener("click", () => go(current - 1));

  function fail(message) {
    app.replaceChildren(el("section", { class: "step is-active" },
      el("h2", { text: "Hmm, that link didn't work" }),
      el("p", { class: "helper", text: message })
    ));
  }

  async function start() {
    if (!slug) return fail("This page needs a form name in the link, like /f/your-programme.");
    try {
      const res = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
      if (res.status === 404) return fail("We couldn't find that form. Double-check the link you were sent.");
      if (!res.ok) throw new Error();
      ({ form, settings } = await res.json());
    } catch {
      return fail("Something went wrong loading the form. Please refresh and try again.");
    }
    applyTheme();
    if (stylePreview && window.parent !== window) window.parent.postMessage({ type: "kiitos:form-ready" }, location.origin);
    const askRating = form.askRating !== false;
    steps = [welcomeStep(), askRating ? ratingStep() : null, ...form.questions.map(questionStep), aboutStep(), photoStep(), consentStep(), thanksStep()].filter(Boolean);
    app.replaceChildren(...steps);
    go(0);
  }

  start();
})();
