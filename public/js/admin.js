// The admin area: log in, then curate testimonials.
// Screens: #/ (inbox), #/t/<id> (edit one), #/highlights, #/share/<id>, #/walls, #/walls/<id or new>, #/widgets,
// #/forms, #/forms/<id or new>, #/data, #/settings, #/guide. A grouped side panel links them, and slides in on phones.

(function () {
  const app = document.getElementById("app");
  const toastBox = document.getElementById("toast");

  const data = { testimonials: [], forms: [], tags: [], settings: null, collections: [] };
  const filters = { status: "all", tag: "", form: "", rating: "", featured: false, q: "", theme: "" };
  let leaveGuard = null; // returns true if it's fine to leave the current screen

  // ---------- Helpers ----------

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "value") node.value = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
    }
    for (const child of children.flat()) if (child != null && child !== false) node.append(child);
    return node;
  }

  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(`/api/admin/${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    const result = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "login") {
      renderLogin("You've been logged out. Please log in again.");
      throw new Error("Logged out");
    }
    if (!res.ok) throw new Error(result.error || "Something went wrong. Please try again.");
    return result;
  }

  let toastTimer;
  function toast(message, undo) {
    clearTimeout(toastTimer);
    toastBox.replaceChildren(el("span", { text: message }));
    if (undo) toastBox.append(el("button", { text: "Undo", onclick: () => { toastBox.hidden = true; undo(); } }));
    toastBox.hidden = false;
    toastTimer = setTimeout(() => { toastBox.hidden = true; }, undo ? 6000 : 2500);
  }

  const stars = (n) => n
    ? el("span", { class: "stars", "aria-label": `${n} out of 5 stars`, text: "★".repeat(n) + "☆".repeat(5 - n) })
    : el("span", { class: "muted", style: "font-size:13px;white-space:nowrap", text: "No stars" });
  // Average of the testimonials that have a star rating.
  const averageOf = (list) => {
    const rated = list.filter((t) => t.rating);
    return rated.length ? (rated.reduce((n, t) => n + t.rating, 0) / rated.length).toFixed(1) : "–";
  };
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const avatar = (t, src) => (src || t.avatar)
    ? el("img", { class: "avatar", src: src || `/api/avatar/${t.avatar}`, alt: "" })
    : el("span", { class: "avatar", "aria-hidden": "true", text: initials(t.name || "?") });
  const date = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const formTitle = (id) => data.forms.find((f) => f.id === id)?.title || "";
  const STATUS_LABEL = { pending: "Waiting", approved: "Approved", hidden: "Hidden" };
  const tagSlug = (tag) => tag.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  // Line icons for the side panel, drawn in the current text colour.
  const ICONS = {
    inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/>',
    forms: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h4"/>',
    data: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 20h16"/>',
    walls: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
    widgets: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
    guide: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.4 2.4 0 1 1 3.4 2.2c-.6.3-1 .8-1 1.5v.4"/><path d="M12 16.8v.1"/>',
    logout: '<path d="M14 4h5v16h-5"/><path d="m10 8-4 4 4 4"/><path d="M6 12h10"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    back: '<path d="m14.5 6-6 6 6 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    import: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 20h16"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 16-5-5-8.5 8.5"/>',
    sheet: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15h6M9 18h4"/>',
    move: '<path d="M4 12h12"/><path d="m12 7 5 5-5 5"/><path d="M20 5v14"/>',
    sync: '<path d="M19.5 10.5A7.5 7.5 0 0 0 6 6.2L4.5 8"/><path d="M4.5 4v4h4"/><path d="M4.5 13.5A7.5 7.5 0 0 0 18 17.8l1.5-1.8"/><path d="M19.5 20v-4h-4"/>',
    voice: '<path d="M4 5h16v11H9.5L5 20v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    talk: '<path d="M4 5h16v11H9.5L5 20v-4H4z"/>',
    love: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
    improve: '<path d="m4 16 6-6 4 4 6-6"/><path d="M15 8h5v5"/>',
    before: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4v4h4"/><path d="M12 8.5V12l2.5 1.8"/>',
    words: '<path d="M10 7H6.5A1.5 1.5 0 0 0 5 8.5V12h4v5H5"/><path d="M19 7h-3.5A1.5 1.5 0 0 0 14 8.5V12h4v5h-4"/>',
  };
  const icon = (name) => {
    const span = el("span", { class: "ico", "aria-hidden": "true" });
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
    return span;
  };

  // The side panel, grouped by what each part is for.
  const NAV = [
    ["Collect", [["forms", "#/forms", "Forms"], ["import", "#/import", "Import"]]],
    ["Manage", [["inbox", "#/", "Inbox"]]],
    ["Share", [["walls", "#/walls", "Walls of Love"], ["widgets", "#/widgets", "Widgets"]]],
    ["Analyse", [["voice", "#/voice", "Voice of Customer"]]],
  ];

  // Which side panel item a screen belongs to.
  const sectionFor = (hash) =>
    hash.startsWith("#/forms") ? "forms"
    : hash.startsWith("#/walls") ? "walls"
    : hash.startsWith("#/widgets") ? "widgets"
    : hash.startsWith("#/data") || hash.startsWith("#/import") ? "import"
    : hash.startsWith("#/voice") ? "voice"
    : hash.startsWith("#/settings") ? "settings"
    : hash.startsWith("#/guide") ? "guide"
    : "inbox";

  const logOut = async () => { await api("logout", { method: "POST" }).catch(() => {}); renderLogin(); };

  function sidePanel(active) {
    const waiting = data.testimonials.filter((t) => t.status === "pending").length;
    const close = () => { side.classList.remove("open"); scrim.hidden = true; };
    const link = ([key, href, label]) => el("a", { class: `side-link${key === active ? " is-on" : ""}`, href, "aria-current": key === active ? "page" : false, onclick: close },
      icon(key), el("span", { class: "side-text", text: label }),
      key === "inbox" && waiting ? el("span", { class: "side-count", text: String(waiting), "aria-label": `${waiting} waiting` }) : null);
    const brand = data.settings?.brandName || "Testimonials";
    const side = el("aside", { class: "side", id: "side-panel", "aria-label": "Admin sections" },
      el("div", { class: "side-brand" },
        el("span", { class: "brand-mark", text: (brand.trim()[0] || "★").toUpperCase() }),
        el("div", { class: "brand-text" }, el("strong", { text: brand }), el("span", { text: "Kiitos" })),
        el("button", { class: "icon side-close", "aria-label": "Close menu", onclick: close }, icon("close"))),
      el("nav", { class: "side-nav" }, ...NAV.map(([group, items]) => el("div", { class: "side-group" },
        el("p", { class: "side-label", text: group }), ...items.map(link)))),
      el("div", { class: "side-foot" },
        link(["guide", "#/guide", "Guide"]),
        link(["settings", "#/settings", "Settings"]),
        el("button", { class: "side-link", onclick: logOut }, icon("logout"), el("span", { class: "side-text", text: "Log out" })))
    );
    const scrim = el("div", { class: "scrim", hidden: true, onclick: close });
    return { side, scrim, open: () => { side.classList.add("open"); scrim.hidden = false; side.querySelector(".is-on, .side-link")?.focus(); } };
  }

  // Every screen starts with the side panel and a page header.
  function topBar(title, { back, backTo = "#/", extra = [] } = {}) {
    app.classList.add("has-side");
    const panel = sidePanel(sectionFor(location.hash || "#/"));
    const frag = document.createDocumentFragment();
    frag.append(panel.side, panel.scrim, el("header", { class: "pagebar" },
      el("div", { class: "pagebar-inner" },
        el("button", { class: "icon menu-btn", "aria-label": "Open menu", "aria-controls": "side-panel", onclick: panel.open }, icon("menu")),
        back ? el("button", { class: "icon", "aria-label": "Back", onclick: () => { location.hash = backTo; } }, icon("back")) : null,
        el("h1", {}, ...[].concat(title)),
        el("div", { class: "pagebar-extra" }, ...extra)
      )
    ));
    return frag;
  }

  // ---------- Login ----------

  function renderLogin(message = "", passwordSet = true) {
    leaveGuard = null;
    const input = el("input", { type: "password", id: "pw", autocomplete: "current-password", required: true });
    const err = el("p", { class: "error", role: "alert", text: message });
    const button = el("button", { class: "primary", type: "submit", text: "Log in" });
    const form = el("form", { class: "login", onsubmit: async (e) => {
      e.preventDefault();
      button.disabled = true;
      err.textContent = "";
      try {
        await api("login", { method: "POST", body: { password: input.value } });
        await loadAll();
        route();
      } catch (e2) {
        err.textContent = e2.message;
        input.select();
      } finally {
        button.disabled = false;
      }
    } },
      el("p", { class: "login-mark", text: "Kiitos" }),
      el("h1", { text: "Welcome back" }),
      el("p", { class: "muted", text: passwordSet ? "Pop your admin password in to see your testimonials." : "The admin password hasn't been set up yet. Add ADMIN_PASSWORD under Environment variables in Netlify, then redeploy." }),
      el("label", { for: "pw", text: "Password" }), input,
      err, button
    );
    app.classList.remove("has-side");
    app.replaceChildren(form);
    input.focus();
  }

  // ---------- Inbox ----------

  function matches(t) {
    if (filters.status !== "all" && t.status !== filters.status) return false;
    if (filters.tag && !(t.tags || []).includes(filters.tag)) return false;
    if (filters.theme && !(t.themes || []).includes(filters.theme)) return false;
    if (filters.form && t.formId !== filters.form) return false;
    if (filters.rating && t.rating !== Number(filters.rating)) return false;
    if (filters.featured && !t.featured) return false;
    if (filters.q) {
      const hay = [t.name, t.role, t.email, t.website, t.body, t.highlight, ...(t.tags || [])].join(" ").toLowerCase();
      if (!filters.q.toLowerCase().split(/\s+/).every((word) => hay.includes(word))) return false;
    }
    return true;
  }

  async function setStatus(t, status, { quiet } = {}) {
    const before = t.status;
    try {
      const { testimonial } = await api(`testimonials/${t.id}`, { method: "PATCH", body: { status } });
      Object.assign(t, testimonial);
      if (location.hash === "#/" || location.hash === "") renderInbox();
      if (!quiet) toast(status === "approved" ? `Approved ${t.name} ✓` : status === "hidden" ? `Hid ${t.name}` : "Moved back to waiting", () => setStatus(t, before, { quiet: true }));
    } catch (e) {
      toast(e.message);
    }
  }

  function card(t) {
    const open = () => { location.hash = `#/t/${t.id}`; };
    return el("article", { class: `card t-row is-${t.status}` },
      el("div", { class: "card-top" },
        avatar(t),
        el("div", { class: "who" }, el("strong", { text: t.name }), el("span", { text: t.role || formTitle(t.formId) })),
        stars(t.rating)
      ),
      el("p", { class: "snippet", onclick: open, text: t.highlight ? `“${t.highlight}”` : t.body }),
      el("div", { class: "meta" },
        el("span", { class: `pill ${t.status}`, text: STATUS_LABEL[t.status] }),
        t.featured ? el("span", { class: "pill featured", text: "★ Featured" }) : null,
        ...(t.tags || []).map((tag) => el("span", { class: "pill", text: `#${tag}` })),
        el("span", { class: "muted", text: date(t.createdAt) })
      ),
      el("div", { class: "card-actions" },
        t.status !== "approved" ? el("button", { class: "approve", text: "Approve", onclick: () => setStatus(t, "approved") }) : null,
        t.status !== "hidden" ? el("button", { class: "hide", text: "Hide", onclick: () => setStatus(t, "hidden") }) : null,
        t.status === "approved" ? el("button", { text: "Share card", onclick: () => { location.hash = `#/share/${t.id}`; } }) : null,
        el("div", { class: "grow" }, el("button", { text: "Edit", onclick: open }))
      )
    );
  }

  function renderInbox() {
    leaveGuard = null;
    const waiting = data.testimonials.filter((t) => t.status === "pending").length;
    const list = el("div", { class: "list" });
    const paintList = () => {
      const shown = data.testimonials.filter(matches);
      list.replaceChildren(...(shown.length ? shown.map(card) : [el("p", { class: "empty", text: data.testimonials.length ? "Nothing matches those filters." : "No testimonials yet. Share your form link and they'll land here." })]));
    };

    const select = (key, label, options) => el("label", {}, label,
      el("select", { onchange: (e) => { filters[key] = e.target.value; paintList(); } },
        ...options.map(([value, text]) => el("option", { value, text, selected: filters[key] === value }))));

    const statusChips = el("div", { class: "chips", role: "group", "aria-label": "Status" },
      ...[["all", "All"], ["pending", `Waiting (${waiting})`], ["approved", "Approved"], ["hidden", "Hidden"]].map(([value, text]) =>
        el("button", { class: `chip${filters.status === value ? " is-on" : ""}`, "aria-pressed": String(filters.status === value), text, onclick: (e) => {
          filters.status = value;
          statusChips.querySelectorAll(".chip").forEach((c) => { c.classList.remove("is-on"); c.setAttribute("aria-pressed", "false"); });
          e.target.classList.add("is-on");
          e.target.setAttribute("aria-pressed", "true");
          paintList();
        } })));

    const search = el("input", { type: "search", placeholder: "Search names, words, tags…", "aria-label": "Search", value: filters.q,
      oninput: (e) => { filters.q = e.target.value.trim(); paintList(); } });

    const featured = el("label", { class: "toggle" },
      el("input", { type: "checkbox", checked: filters.featured, onchange: (e) => { filters.featured = e.target.checked; paintList(); } }),
      "Featured only");

    // What people talk about, found by the AI.
    const themeBox = el("div", { class: "themes" });
    let busy = "";
    const paintThemes = () => {
      themeBox.hidden = !data.ai && !data.themes;
      const counts = new Map();
      for (const t of data.testimonials) {
        if (t.status === "hidden" || t.themesVersion !== data.themes?.version) continue;
        for (const name of t.themes || []) counts.set(name, (counts.get(name) || 0) + 1);
      }
      const names = (data.themes?.list || []).map((th) => th.name).filter((n) => counts.has(n)).sort((a, b) => counts.get(b) - counts.get(a));
      const chips = names.map((name) => el("button", { class: `chip${filters.theme === name ? " is-on" : ""}`, "aria-pressed": String(filters.theme === name),
        onclick: () => { filters.theme = filters.theme === name ? "" : name; paintThemes(); paintList(); } },
        name, el("span", { class: "chip-count", text: String(counts.get(name)) })));
      themeBox.replaceChildren(...[
        el("p", { class: "themes-label", text: "What people talk about" }),
        busy ? el("p", { class: "muted", style: "margin:0", text: busy })
          : chips.length ? el("div", { class: "chips" }, ...chips)
          : el("p", { class: "muted", style: "margin:0", text: "Let the AI read your testimonials and find the themes that keep coming up." }),
        data.ai && !busy ? el("button", { class: data.themes ? "link" : "primary", style: "margin-top:10px", text: data.themes ? "Find themes again" : "✨ Find my themes", onclick: findThemes }) : null,
      ].filter(Boolean));
    };
    const findThemes = async () => {
      if (data.themes && !confirm("Find your themes again? The AI reads every testimonial afresh, so the theme names may change.")) return;
      busy = "Reading every testimonial. This takes about half a minute…";
      paintThemes();
      try {
        await findAndSortThemes((message) => { busy = message; paintThemes(); });
        toast("Themes found ✓");
      } catch (e) {
        toast(e.message);
      }
      busy = "";
      paintThemes();
      paintList();
    };
    paintThemes();
    if (data.ai && data.themes && !autoSortStarted && needsSorting().length) {
      autoSortStarted = true; // new testimonials get sorted quietly, once per visit
      sortIntoThemes(needsSorting()).then(paintThemes).catch(() => {});
    }

    const noHighlight = data.testimonials.filter((t) => t.status === "approved" && !t.highlight && t.body).length;
    const highlightBanner = data.ai && noHighlight
      ? el("div", { class: "ai-banner" },
        el("span", { text: `✨ ${noHighlight} approved ${noHighlight === 1 ? "testimonial has" : "testimonials have"} no highlight yet.` }),
        el("button", { text: "Suggest highlights", onclick: () => { location.hash = "#/highlights"; } }))
      : null;

    const updateBanner = data.update?.available
      ? el("div", { class: "ai-banner update-banner" },
        el("span", { text: `🎁 Kiitos ${data.update.latest} is ready (you're on ${data.update.current}). To update, open Netlify, go to Deploys, tap Trigger deploy, then Deploy project. Your testimonials and settings stay exactly as they are.` }),
        data.update.notes ? el("a", { class: "btn", href: data.update.notes, target: "_blank", rel: "noopener", text: "See what's new" }) : null,
        el("a", { class: "btn", href: "#/guide-updates", text: "How to update" }))
      : null;

    app.replaceChildren(
      topBar(["Inbox", waiting ? el("span", { class: "count", text: `${waiting} waiting` }) : null]),
      el("main", { class: "wrap" },
        updateBanner,
        el("div", { class: "filters" },
          search,
          statusChips,
          el("div", { class: "grid" },
            select("tag", "Tag", [["", "Any tag"], ...data.tags.map((t) => [t, `#${t}`])]),
            select("form", "Form", [["", "Any form"], ...data.forms.map((f) => [f.id, f.title])]),
            select("rating", "Stars", [["", "Any"], ...[5, 4, 3, 2, 1].map((n) => [String(n), "★".repeat(n)])]),
            el("div", {}, featured)
          ),
          themeBox
        ),
        highlightBanner,
        list
      )
    );
    paintList();
  }

  // ---------- Edit ----------

  function renderEdit(id) {
    const t = data.testimonials.find((x) => x.id === id);
    if (!t) { location.hash = "#/"; return; }

    const draft = { status: t.status, name: t.name, role: t.role, website: t.website, body: t.body, highlight: t.highlight, tags: [...(t.tags || [])], featured: t.featured };
    let newAvatar; // undefined = unchanged, "" = remove, data URL = replace
    let dirty = false;
    const touch = () => { dirty = true; };
    leaveGuard = () => !dirty || confirm("You have unsaved changes. Leave without saving?");

    const field = (key, label, attrs = {}) => {
      const input = el(attrs.multiline ? "textarea" : "input", { type: "text", id: `f-${key}`, value: draft[key] || "", ...attrs.input,
        oninput: (e) => { draft[key] = e.target.value; touch(); attrs.oninput?.(e); } });
      return { input, node: el("label", { for: `f-${key}` }, label, attrs.hint ? el("small", { text: attrs.hint }) : null, input) };
    };

    // Status
    const seg = el("div", { class: "segmented", role: "group", "aria-label": "Status" });
    const paintSeg = () => seg.replaceChildren(...["pending", "approved", "hidden"].map((s) =>
      el("button", { class: draft.status === s ? "is-on" : "", "aria-pressed": String(draft.status === s), text: STATUS_LABEL[s], onclick: () => { draft.status = s; touch(); paintSeg(); } })));
    paintSeg();
    const featuredBox = el("label", { class: "toggle" },
      el("input", { type: "checkbox", checked: draft.featured, onchange: (e) => { draft.featured = e.target.checked; touch(); } }),
      "★ Featured (shows first on walls and widgets)");

    // Photo
    const photoSlot = el("div", {}, avatar(t));
    const cropBox = el("div", { class: "cropper", hidden: true });
    const zoom = el("input", { type: "range", min: "1", max: "4", step: "0.01", value: "1", "aria-label": "Zoom" });
    const zoomRow = el("div", { class: "zoom", hidden: true }, el("span", { text: "−" }), zoom, el("span", { text: "+" }));
    let cropper = null;
    const useCrop = el("button", { class: "primary", hidden: true, text: "Use this crop", onclick: () => {
      newAvatar = cropper.toDataURL(); touch();
      photoSlot.replaceChildren(avatar(t, newAvatar));
      cropBox.hidden = zoomRow.hidden = useCrop.hidden = true;
    } });
    const fileInput = el("input", { type: "file", accept: "image/*", hidden: true, onchange: () => {
      const file = fileInput.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        cropBox.hidden = zoomRow.hidden = useCrop.hidden = false;
        cropper = window.PhotoCropper(cropBox, zoom, img);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => toast("Couldn't open that photo. Try a JPEG or PNG?");
      img.src = URL.createObjectURL(file);
      fileInput.value = "";
    } });
    const removePhoto = el("button", { class: "link", text: "Remove photo", onclick: () => {
      newAvatar = ""; touch();
      photoSlot.replaceChildren(el("span", { class: "avatar", text: initials(draft.name || "?") }));
    } });

    // Body and highlight
    const body = field("body", "Testimonial", { multiline: true, hint: "The full text that appears on your Wall of Love. Fix typos freely.", input: { rows: 8 } });
    const counter = el("p", { class: "counter" });
    const paintCounter = () => {
      const n = (draft.highlight || "").length;
      counter.textContent = `${n} / 160 characters`;
      counter.classList.toggle("over", n > 160);
    };
    const highlight = field("highlight", "Highlight", { multiline: true, hint: "A short pull quote for the scrolling widgets. Aim for one punchy sentence.", input: { rows: 3, maxlength: 280 }, oninput: paintCounter });
    highlight.input.style.minHeight = "80px";
    paintCounter();
    const suggestBox = el("div", { class: "suggestions" });
    const suggest = data.ai ? el("button", { text: "✨ Suggest a highlight", onclick: async () => {
      suggest.disabled = true;
      suggest.textContent = "Reading…";
      try {
        const { results } = await api("ai/highlights", { method: "POST", body: { ids: [t.id] } });
        const quotes = results[0]?.quotes || [];
        suggestBox.replaceChildren(...(quotes.length
          ? [el("p", { class: "muted", style: "margin:10px 0 0;font-size:14px", text: "Tap one to use it, then Save changes." }),
            ...quotes.map((q) => el("button", { class: "suggestion", onclick: () => { draft.highlight = q; highlight.input.value = q; touch(); paintCounter(); } }, `“${q}”`))]
          : [el("p", { class: "muted", text: "No strong pick this time. Try again, or select your own above." })]));
      } catch (e) {
        toast(e.message);
      }
      suggest.disabled = false;
      suggest.textContent = "✨ Suggest again";
    } }) : null;
    const useSelection = el("button", { class: "link", text: "Use the text I've selected above", onclick: () => {
      const { selectionStart: a, selectionEnd: b, value } = body.input;
      const picked = value.slice(a, b).trim();
      if (!picked) return toast("Select some words in the testimonial first.");
      draft.highlight = picked.slice(0, 280);
      highlight.input.value = draft.highlight;
      touch(); paintCounter();
    } });

    // Tags
    const tagList = el("div", { class: "tag-list" });
    const paintTags = () => tagList.replaceChildren(...draft.tags.map((tag) =>
      el("span", { class: "chip" }, `#${tag}`, el("button", { class: "link", "aria-label": `Remove ${tag}`, text: "✕", onclick: () => { draft.tags = draft.tags.filter((x) => x !== tag); touch(); paintTags(); } }))));
    paintTags();
    const tagInput = el("input", { type: "text", list: "known-tags", placeholder: "Add a tag, like coaching or retreat-2026", "aria-label": "Add a tag" });
    const addTag = () => {
      const tag = tagSlug(tagInput.value);
      if (tag && !draft.tags.includes(tag)) { draft.tags.push(tag); touch(); paintTags(); }
      tagInput.value = "";
    };
    tagInput.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } });

    // What they originally wrote
    const questions = data.forms.find((f) => f.id === t.formId)?.questions || [];
    const answers = (t.answers || []).filter((a) => a.text).map((a) =>
      el("dl", { class: "answer" }, el("dt", { text: a.prompt || questions.find((q) => q.id === a.id)?.prompt || "Answer" }), el("dd", { text: a.text })));

    const name = field("name", "Name");
    const save = el("button", { class: "primary", text: "Save changes", onclick: async () => {
      save.disabled = true;
      save.textContent = "Saving…";
      try {
        const body = { ...draft };
        if (newAvatar !== undefined) body.avatar = newAvatar;
        const { testimonial } = await api(`testimonials/${t.id}`, { method: "PATCH", body });
        Object.assign(t, testimonial);
        data.tags = [...new Set([...data.tags, ...t.tags])].sort();
        dirty = false;
        toast("Saved ✓");
        location.hash = "#/";
      } catch (e) {
        toast(e.message);
      } finally {
        save.disabled = false;
        save.textContent = "Save changes";
      }
    } });

    // Delete for good. Only for testimonials already saved as Hidden, and only
    // after typing DELETE, so it can never happen by accident.
    const deleteSection = el("section", { class: "section" }, el("h2", { text: "Delete for good" }));
    if (t.status !== "hidden") {
      deleteSection.append(el("p", { class: "muted", style: "margin:0", text: "To delete this testimonial for good, set it to Hidden and save first. Most of the time hiding is all you need." }));
    } else {
      const confirmInput = el("input", { type: "text", id: "f-delete", autocomplete: "off", autocapitalize: "characters", placeholder: "DELETE" });
      const del = el("button", { class: "hide", text: "Delete for good", disabled: true, onclick: async () => {
        del.disabled = true;
        del.textContent = "Deleting…";
        try {
          await api(`testimonials/${t.id}`, { method: "DELETE" });
          data.testimonials = data.testimonials.filter((x) => x.id !== t.id);
          dirty = false;
          toast("Deleted for good");
          location.hash = "#/";
        } catch (e) {
          toast(e.message);
          del.disabled = false;
          del.textContent = "Delete for good";
        }
      } });
      confirmInput.addEventListener("input", () => { del.disabled = confirmInput.value.trim().toUpperCase() !== "DELETE"; });
      deleteSection.append(
        el("p", { class: "muted", style: "margin:0", text: "This removes their words and photo everywhere, including your downloads, and can't be undone. Importing an old Senja file won't bring it back." }),
        el("label", { for: "f-delete" }, "Type DELETE to confirm", confirmInput),
        el("div", { style: "margin-top:12px" }, del)
      );
    }

    app.replaceChildren(
      topBar("Edit testimonial", { back: true }),
      el("main", { class: "wrap" },
        el("section", { class: "section" },
          el("h2", { text: "Status" }), seg, featuredBox
        ),
        el("section", { class: "section" },
          el("h2", { text: "Who it's from" }),
          el("div", { class: "photo" }, photoSlot,
            el("div", {},
              el("button", { text: t.avatar ? "Replace photo" : "Add photo", onclick: () => fileInput.click() }), fileInput,
              el("div", {}, removePhoto))),
          cropBox, zoomRow, el("div", { style: "text-align:center" }, useCrop),
          name.node,
          field("role", "Role or business").node,
          field("website", "Website or Instagram").node,
          !t.consent?.publishName ? el("p", { class: "warn", text: "Heads up. They said no to showing their name, so walls show their initials only." }) : null,
          !t.consent?.publishPhoto && t.avatar ? el("p", { class: "warn", text: "Heads up. They said no to showing their photo, so it won't be published." }) : null
        ),
        el("section", { class: "section" },
          el("h2", { text: "Words" }),
          body.node,
          highlight.node, counter, useSelection,
          suggest ? el("div", { style: "margin-top:10px" }, suggest) : null, suggestBox,
          el("div", { style: "margin-top:14px" }, el("button", { text: "Make a share card", onclick: () => { location.hash = `#/share/${t.id}`; } }))
        ),
        el("section", { class: "section" },
          el("h2", { text: "Tags" }),
          el("p", { class: "muted", style: "margin:0", text: "Tags decide which collections and walls this shows up on." }),
          tagList,
          el("div", { class: "row", style: "margin-top:8px" }, el("div", { class: "grow" }, tagInput), el("button", { text: "Add", onclick: addTag })),
          el("datalist", { id: "known-tags" }, ...data.tags.map((tag) => el("option", { value: tag })))
        ),
        el("section", { class: "section" },
          el("h2", { text: "What they wrote" }),
          answers.length ? answers : el("p", { class: "muted", text: "No separate answers saved." })
        ),
        el("section", { class: "section" },
          el("h2", { text: "Details" }),
          el("dl", { class: "facts" },
            el("dt", { text: "Stars" }), el("dd", {}, stars(t.rating)),
            el("dt", { text: "Email" }), el("dd", { text: t.email || "Not given" }),
            el("dt", { text: "Form" }), el("dd", { text: formTitle(t.formId) || t.source }),
            el("dt", { text: "Received" }), el("dd", { text: new Date(t.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) }),
            el("dt", { text: "Consent" }), el("dd", { text: `Name ${t.consent?.publishName ? "yes" : "no"}, photo ${t.consent?.publishPhoto ? "yes" : "no"}` })
          ),
          el("p", { class: "muted", style: "font-size:14px;margin-bottom:0", text: "Email stays private. It never appears on anything public." })
        ),
        deleteSection
      ),
      el("div", { class: "savebar" }, el("div", { class: "inner" },
        el("button", { text: "Cancel", onclick: () => { location.hash = "#/"; } }), save))
    );
    window.scrollTo({ top: 0 });
  }

  // ---------- AI helpers ----------

  let autoSortStarted = false;
  const needsSorting = () => data.themes
    ? data.testimonials.filter((t) => t.status !== "hidden" && t.body && t.themesVersion !== data.themes.version)
    : [];

  async function sortIntoThemes(list, onProgress) {
    for (let i = 0; i < list.length; i += 15) {
      const batch = list.slice(i, i + 15);
      const { results, version } = await api("ai/themes/assign", { method: "POST", body: { ids: batch.map((t) => t.id) } });
      for (const r of results) {
        const t = data.testimonials.find((x) => x.id === r.id);
        if (t && r.sorted) Object.assign(t, { themes: r.themes, themesVersion: version });
      }
      onProgress?.(Math.min(i + batch.length, list.length), list.length);
    }
  }

  // Finds the themes afresh, then sorts every testimonial into them.
  async function findAndSortThemes(onStatus) {
    const { themes } = await api("ai/themes/discover", { method: "POST", body: {} });
    data.themes = themes;
    filters.theme = "";
    await sortIntoThemes(needsSorting(), (done, total) => onStatus(`Sorting them into themes… ${done} of ${total}`));
  }

  // ---------- Import ----------
  // Every way to bring testimonials in, in one place.

  let importMode = "hand"; // "shot" opens the add screen ready for a screenshot

  function renderImport() {
    leaveGuard = null;
    const option = (iconName, title, about, onclick, { muted } = {}) => el("button", { class: `import-card${muted ? " is-muted" : ""}`, onclick, disabled: Boolean(muted) },
      icon(iconName), el("span", {}, el("strong", { text: title }), el("span", { class: "muted", text: about })));
    app.replaceChildren(
      topBar("Import"),
      el("main", { class: "wrap" },
        el("p", { class: "lede", text: "Bring testimonials in from anywhere. Kind words in a WhatsApp chat, an email, a DM or another tool all belong here." }),
        el("div", { class: "import-list" },
          data.ai ? option("image", "From a screenshot", "Upload a screenshot of a WhatsApp chat, Instagram DM, email or review. The AI reads it and fills in the details for you to check.",
            () => { importMode = "shot"; location.hash = "#/import/new"; }) : null,
          option("pen", "Add one by hand", "Paste kind words from an email or message, then add their name, photo and stars.",
            () => { importMode = "hand"; location.hash = "#/import/new"; }),
          el("p", { class: "or", text: "or bring in lots at once" }),
          option("sheet", "Upload a spreadsheet", "A CSV or JSON file from any tool. Match the columns, then import them all in one go.", () => { location.hash = "#/data"; }),
          option("move", "Move from Senja", "In Senja, export everything to CSV, then upload it here. Photos, highlights and approvals come too.", () => { location.hash = "#/data"; }),
          option("sync", "Auto-import", "Coming later. New reviews from places like Google, pulled in by themselves.", null, { muted: true })),
        el("div", { class: "import-foot" },
          icon("import"), el("span", { class: "grow", text: "Want a copy of everything? Download a backup as JSON or CSV." }),
          el("a", { class: "btn", href: "#/data", text: "Backups" })))
    );
  }

  // Shrinks a screenshot so it uploads quickly, keeping it sharp enough to read.
  const shrinkImage = (file, max = 1600) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Couldn't open that image. Try a PNG or JPEG."));
    img.src = URL.createObjectURL(file);
  });

  const SOURCES = ["By hand", "WhatsApp", "Instagram", "Facebook", "LinkedIn", "Email", "Google review", "Text message", "Other"];

  function renderAdd() {
    const d = { name: "", role: "", email: "", website: "", body: "", rating: "", date: new Date().toISOString().slice(0, 10), tags: [], formId: "", status: "approved", from: "By hand", permission: false, showName: true, showPhoto: true };
    let dirty = false;
    const touch = () => { dirty = true; };
    leaveGuard = () => !dirty || confirm("You have an unsaved testimonial. Leave without saving?");
    const fields = {};
    const field = (key, label, { hint, type = "text", multiline, rows } = {}) => {
      const input = el(multiline ? "textarea" : "input", { type, id: `a-${key}`, value: d[key], rows, oninput: (e) => { d[key] = e.target.value; touch(); } });
      fields[key] = input;
      return el("label", { for: `a-${key}` }, label, hint ? el("small", { text: hint }) : null, input);
    };
    const select = (key, label, options, { hint, onchange } = {}) => {
      const input = el("select", { id: `a-${key}`, onchange: (e) => { d[key] = e.target.value; touch(); onchange?.(); } },
        ...options.map(([value, text]) => el("option", { value, text, selected: String(d[key]) === String(value) })));
      fields[key] = input;
      return el("label", { for: `a-${key}` }, label, hint ? el("small", { text: hint }) : null, input);
    };
    const fill = () => { for (const [key, input] of Object.entries(fields)) input.value = d[key] ?? ""; paintTags(); };

    // Start from a screenshot
    const shotStatus = el("p", { class: "muted", style: "margin:10px 0 0" });
    const shotPreview = el("img", { class: "shot-preview", alt: "", hidden: true });
    const shotInput = el("input", { type: "file", accept: "image/*", hidden: true, onchange: async () => {
      const file = shotInput.files[0];
      shotInput.value = "";
      if (!file) return;
      try {
        const image = await shrinkImage(file);
        shotPreview.src = image;
        shotPreview.hidden = false;
        shotButton.disabled = true;
        shotStatus.textContent = "Reading your screenshot. This takes about 10 seconds…";
        const { draft } = await api("ai/screenshot", { method: "POST", body: { image } });
        Object.assign(d, {
          name: draft.name || d.name, role: draft.role || d.role, body: draft.words,
          rating: draft.rating ? String(draft.rating) : d.rating, date: draft.date || d.date,
          from: SOURCES.includes(draft.platform) ? draft.platform : "Other",
        });
        fill();
        touch();
        shotStatus.textContent = "Filled in below. Check every word, then save.";
        toast("Filled in ✓ Check it over, then save.");
      } catch (e) {
        shotStatus.textContent = "";
        toast(e.message);
      }
      shotButton.disabled = false;
    } });
    const shotButton = el("button", { class: importMode === "shot" ? "primary" : "", onclick: () => shotInput.click() }, icon("image"), "Choose a screenshot");
    const shotSection = data.ai ? el("section", { class: `section${importMode === "shot" ? " is-focus" : ""}` },
      el("h2", { text: "Start from a screenshot" }),
      el("p", { class: "muted", style: "margin-top:0", text: "WhatsApp, Instagram, email or a review. The AI reads it and fills in the form below. Nothing is saved until you've checked it. The screenshot itself isn't kept." }),
      shotButton, shotInput, shotStatus, shotPreview) : null;

    // Photo
    const photoSlot = el("div", {}, el("span", { class: "avatar", text: "?" }));
    let photo = "";
    const cropBox = el("div", { class: "cropper", hidden: true });
    const zoom = el("input", { type: "range", min: "1", max: "4", step: "0.01", value: "1", "aria-label": "Zoom" });
    const zoomRow = el("div", { class: "zoom", hidden: true }, el("span", { text: "−" }), zoom, el("span", { text: "+" }));
    let cropper = null;
    const useCrop = el("button", { class: "primary", hidden: true, text: "Use this crop", onclick: () => {
      photo = cropper.toDataURL();
      touch();
      photoSlot.replaceChildren(el("img", { class: "avatar", src: photo, alt: "" }));
      cropBox.hidden = zoomRow.hidden = useCrop.hidden = true;
      photoToggle.hidden = false;
    } });
    const photoInput = el("input", { type: "file", accept: "image/*", hidden: true, onchange: () => {
      const file = photoInput.files[0];
      photoInput.value = "";
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        cropBox.hidden = zoomRow.hidden = useCrop.hidden = false;
        cropper = window.PhotoCropper(cropBox, zoom, img);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => toast("Couldn't open that photo. Try a JPEG or PNG?");
      img.src = URL.createObjectURL(file);
    } });

    // Tags, plus a form's tags when one is picked
    const tagList = el("div", { class: "tag-list" });
    const paintTags = () => tagList.replaceChildren(...d.tags.map((tag) =>
      el("span", { class: "chip" }, `#${tag}`, el("button", { class: "link", "aria-label": `Remove ${tag}`, text: "✕", onclick: () => { d.tags = d.tags.filter((x) => x !== tag); touch(); paintTags(); } }))));
    const tagInput = el("input", { type: "text", list: "add-tags", placeholder: "Add a tag, like coaching", "aria-label": "Add a tag" });
    const addTag = () => {
      const tag = tagSlug(tagInput.value);
      if (tag && !d.tags.includes(tag)) { d.tags.push(tag); touch(); paintTags(); }
      tagInput.value = "";
    };
    tagInput.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } });

    const toggle = (key, label) => el("label", { class: "toggle" },
      el("input", { type: "checkbox", checked: d[key], onchange: (e) => { d[key] = e.target.checked; touch(); } }), label);
    const photoToggle = toggle("showPhoto", "Show their photo");
    photoToggle.hidden = true;

    const statusSeg = el("div", { class: "segmented", role: "group", "aria-label": "Status" });
    const paintStatus = () => statusSeg.replaceChildren(...[["approved", "Approved"], ["pending", "Waiting"]].map(([v, label]) =>
      el("button", { class: d.status === v ? "is-on" : "", "aria-pressed": String(d.status === v), text: label, onclick: () => { d.status = v; touch(); paintStatus(); } })));
    paintStatus();

    const save = el("button", { class: "primary", text: "Save testimonial", onclick: async () => {
      if (!d.permission) return toast("Tick the box to confirm you have their permission.");
      save.disabled = true;
      save.textContent = "Saving…";
      try {
        const { testimonial } = await api("testimonials", { method: "POST", body: {
          ...d, body: d.body, rating: d.rating ? Number(d.rating) : null, avatar: photo || undefined,
        } });
        data.testimonials.unshift(testimonial);
        data.tags = [...new Set([...data.tags, ...testimonial.tags])].sort();
        dirty = false;
        toast(`Added ${testimonial.name} ✓`);
        location.hash = "#/";
      } catch (e) {
        toast(e.message);
      } finally {
        save.disabled = false;
        save.textContent = "Save testimonial";
      }
    } });

    app.replaceChildren(
      topBar("Add a testimonial", { back: true, backTo: "#/import" }),
      el("main", { class: "wrap" },
        shotSection,
        el("section", { class: "section" },
          el("h2", { text: "Who it's from" }),
          el("div", { class: "photo" }, photoSlot,
            el("div", {}, el("button", { text: "Add photo", onclick: () => photoInput.click() }), photoInput)),
          cropBox, zoomRow, el("div", { style: "text-align:center" }, useCrop),
          field("name", "Name"),
          field("role", "Role or business", { hint: "Optional." }),
          field("website", "Website or Instagram", { hint: "Optional. A link or an @handle." }),
          field("email", "Email", { hint: "Optional and private. Never shown anywhere public.", type: "email" })),
        el("section", { class: "section" },
          el("h2", { text: "What they said" }),
          field("body", "Their words", { multiline: true, rows: 8, hint: "Exactly as they wrote it. You can tidy typos later in Edit." }),
          el("div", { class: "two-col" },
            select("rating", "Stars", [["", "No stars"], ...[5, 4, 3, 2, 1].map((n) => [String(n), "★".repeat(n)])]),
            field("date", "Date received", { type: "date" })),
          select("from", "Where it came from", SOURCES.map((v) => [v, v]))),
        el("section", { class: "section" },
          el("h2", { text: "Where it shows up" }),
          select("formId", "Programme", [["", "None"], ...data.forms.map((f) => [f.id, f.title])], {
            hint: "Picking a form adds its tags, so this lands on the same walls.",
            onchange: () => {
              const form = data.forms.find((f) => f.id === d.formId);
              const formTags = data.fullForms?.find((f) => f.id === d.formId)?.tags || form?.tags || [];
              d.tags = [...new Set([...d.tags, ...formTags])];
              paintTags();
            } }),
          el("p", { class: "label-like", text: "Tags" }), tagList,
          el("div", { class: "row", style: "margin-top:8px" }, el("div", { class: "grow" }, tagInput), el("button", { text: "Add", onclick: addTag })),
          el("datalist", { id: "add-tags" }, ...data.tags.map((tag) => el("option", { value: tag }))),
          el("p", { class: "label-like", text: "Status" }), statusSeg),
        el("section", { class: "section" },
          el("h2", { text: "Permission" }),
          el("label", { class: "toggle" },
            el("input", { type: "checkbox", onchange: (e) => { d.permission = e.target.checked; touch(); } }),
            "I have their permission to share this"),
          toggle("showName", "Show their name (otherwise initials)"),
          photoToggle)
      ),
      el("div", { class: "savebar" }, el("div", { class: "inner" },
        el("button", { text: "Cancel", onclick: () => { location.hash = "#/import"; } }), save))
    );
    paintTags();
    window.scrollTo({ top: 0 });
  }

  // ---------- Voice of Customer ----------
  // What clients say, in their own words: themes at a glance, and reports
  // that the AI writes from the testimonials, with real quotes as proof.

  const REPORT_TYPES = [
    ["talk", "What they talk about", "The topics your testimonials keep returning to"],
    ["love", "What they love", "The positives that come up most often"],
    ["improve", "What to improve", "Anything clients wish were better"],
    ["before", "Life before you", "What clients struggled with before working with you"],
    ["words", "Words they use", "Phrases worth borrowing for your own copy"],
  ];
  let voiceTab = "themes";
  let voiceScope = { type: "all", value: "", label: "All your testimonials" };
  let voiceReports = null; // saved reports, loaded once per visit
  let openReport = null;

  const wordCount = (list) => list.reduce((n, t) => n + t.body.split(/\s+/).filter(Boolean).length, 0);
  const firstLine = (body) => {
    const text = body.replace(/\s+/g, " ").trim();
    const sentence = (text.match(/^.{30,}?[.!?](\s|$)/) || [text])[0].trim();
    return sentence.length > 180 ? `${sentence.slice(0, 177).replace(/\s+\S*$/, "")}…` : sentence;
  };
  const inVoiceScope = (t, scope) => {
    if (t.status === "hidden" || !t.body) return false;
    if (scope.type === "form") return t.formId === scope.value;
    if (scope.type === "tag") return (t.tags || []).includes(scope.value);
    if (scope.type === "theme") return (t.themes || []).includes(scope.value);
    return true;
  };

  function renderVoice() {
    leaveGuard = null;
    const pool = data.testimonials.filter((t) => t.status !== "hidden" && t.body);
    const seg = el("div", { class: "segmented narrow", role: "group", "aria-label": "View" });
    const body = el("div");
    const paint = () => {
      seg.replaceChildren(...[["themes", "Themes"], ["reports", "Reports"]].map(([key, label]) =>
        el("button", { class: voiceTab === key ? "is-on" : "", "aria-pressed": String(voiceTab === key), text: label, onclick: () => { voiceTab = key; paint(); } })));
      body.replaceChildren(voiceTab === "themes" ? voiceThemes(pool, paint) : voiceReportsView());
    };
    app.replaceChildren(
      topBar("Voice of Customer"),
      el("main", { class: "wrap" },
        el("p", { class: "lede", text: "What your clients say, in their own words, ready for your copy." }),
        seg, body)
    );
    paint();
  }

  function voiceThemes(pool, repaint) {
    const version = data.themes?.version;
    const themes = (data.themes?.list || []).map((th) => {
      const members = pool.filter((t) => t.themesVersion === version && (t.themes || []).includes(th.name));
      return { ...th, members };
    }).filter((th) => th.members.length).sort((a, b) => b.members.length - a.members.length);
    const top = themes[0];

    const stat = (label, value, sub) => el("div", { class: "stat" },
      el("p", { class: "stat-label", text: label }), el("p", { class: "stat-value", text: value }), el("p", { class: "stat-sub", text: sub }));
    const stats = el("div", { class: "stats" },
      stat("Testimonials read", String(pool.length), `${wordCount(pool).toLocaleString("en-GB")} words`),
      stat("Top theme", top ? top.name : "Not yet", top ? `In about ${Math.round((top.members.length / pool.length) * 100)}% of testimonials` : "Find your themes to see it"),
      stat("Themes found", String(themes.length), "From what your clients wrote"));

    if (!themes.length) {
      const status = el("p", { class: "muted" });
      const find = data.ai ? el("button", { class: "primary", text: "✨ Find my themes", onclick: async () => {
        find.disabled = true;
        status.textContent = "Reading every testimonial. This takes about half a minute…";
        try {
          await findAndSortThemes((m) => { status.textContent = m; });
          toast("Themes found ✓");
          repaint();
        } catch (e) {
          toast(e.message);
          find.disabled = false;
          status.textContent = "";
        }
      } }) : null;
      return el("div", {}, stats, el("div", { class: "section empty-state" },
        el("h2", { text: "Find what your clients talk about" }),
        el("p", { class: "muted", text: data.ai ? "The AI reads every testimonial and names the themes that keep coming up." : "The AI isn't switched on for your site yet." }),
        find, status));
    }

    // The most telling line for each theme: a featured or highlighted one first,
    // and a different person on each card where possible.
    const used = new Set();
    const pick = (members) => {
      const ranked = [...members].sort((a, b) =>
        (b.featured - a.featured) || (Boolean(b.highlight) - Boolean(a.highlight)) || (Boolean(b.avatar) - Boolean(a.avatar)));
      const t = ranked.find((m) => !used.has(m.id)) || ranked[0];
      used.add(t.id);
      return t;
    };
    const cards = themes.map((th) => {
      const t = pick(th.members);
      const faces = [...th.members.filter((m) => m.avatar), ...th.members.filter((m) => !m.avatar)].slice(0, 5);
      return el("button", { class: "theme-card", onclick: () => { filters.theme = th.name; filters.status = "all"; location.hash = "#/"; } },
        el("span", { class: "theme-name", text: th.name }),
        el("span", { class: "theme-quote", text: `“${t.highlight || firstLine(t.body)}”` }),
        el("span", { class: "theme-who", text: t.name }),
        el("span", { class: "theme-foot" },
          el("span", { class: "faces-row" }, ...faces.map((m) => avatar(m))),
          el("span", { class: "muted", text: `${th.members.length} ${th.members.length === 1 ? "testimonial" : "testimonials"} about this` })));
    });
    return el("div", {}, stats,
      el("h2", { text: "What clients talk about" }),
      el("p", { class: "muted", style: "margin-top:0", text: "Ranked by how many testimonials mention each theme. Tap one to see every testimonial behind it, or run a report for a closer look." }),
      el("div", { class: "theme-grid" }, ...cards));
  }

  function voiceReportsView() {
    const view = el("div");
    const panel = el("div");

    // What the report covers
    const pool = () => data.testimonials.filter((t) => inVoiceScope(t, voiceScope));
    const summary = el("p", { class: "scope-summary" });
    const paintSummary = () => {
      const list = pool();
      summary.replaceChildren(el("strong", { text: voiceScope.label }), el("span", { class: "muted", text: ` · ${list.length} testimonials, ${wordCount(list).toLocaleString("en-GB")} words` }));
    };
    paintSummary();
    const option = (value, label) => el("option", { value, text: label, selected: `${voiceScope.type}:${voiceScope.value}` === value });
    const themeNames = (data.themes?.list || []).map((th) => th.name);
    const picker = el("select", { "aria-label": "Choose which testimonials", onchange: (e) => {
      const [type, ...rest] = e.target.value.split(":");
      const value = rest.join(":");
      const label = e.target.selectedOptions[0].textContent;
      voiceScope = { type, value, label: type === "all" ? "All your testimonials" : label };
      paintSummary();
    } },
      option("all:", "All your testimonials"),
      el("optgroup", { label: "By form" }, ...data.forms.map((f) => option(`form:${f.id}`, f.title))),
      data.tags.length ? el("optgroup", { label: "By tag" }, ...data.tags.map((tag) => option(`tag:${tag}`, `#${tag}`))) : null,
      themeNames.length ? el("optgroup", { label: "By theme" }, ...themeNames.map((n) => option(`theme:${n}`, n))) : null);
    const scopeBox = el("div", { class: "scope" }, el("div", { class: "grow" }, el("p", { class: "stat-label", text: "Reporting on" }), summary), el("div", { class: "scope-pick" }, picker));

    async function run(kind, question = "") {
      const count = pool().length;
      panel.replaceChildren(el("div", { class: "report" }, el("p", { class: "muted", style: "margin:0", text: `Reading ${count} testimonials. This takes about 20 seconds…` })));
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      tiles.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      askButton.disabled = true;
      try {
        const { report } = await api("ai/voice", { method: "POST", body: { kind, question, scope: voiceScope, scopeLabel: voiceScope.label } });
        voiceReports = [report, ...(voiceReports || [])].slice(0, 30);
        openReport = report;
        showReport(report);
        paintRecent();
      } catch (e) {
        panel.replaceChildren();
        toast(e.message);
      }
      tiles.querySelectorAll("button").forEach((b) => { b.disabled = !data.ai; });
      askButton.disabled = !data.ai;
    }

    const asText = (r) => [
      `${r.kind === "ask" ? r.question : r.title} (${r.label})`, r.summary, "",
      ...r.points.flatMap((p, i) => [`${i + 1}. ${p.heading}`, p.detail, ...p.quotes.map((q) => `"${q.quote}" (${q.name})`), ""]),
    ].join("\n").trim();

    function showReport(r) {
      const copyIt = async () => {
        try { await navigator.clipboard.writeText(asText(r)); toast("Copied ✓"); }
        catch { prompt("Copy this report", asText(r)); }
      };
      panel.replaceChildren(el("article", { class: "report" },
        el("div", { class: "report-head" },
          el("h2", { text: r.kind === "ask" ? r.question : r.title }),
          data.ai ? el("button", { text: "Try again", onclick: () => run(r.kind, r.question) }) : null,
          el("button", { class: "primary", text: "Copy", onclick: copyIt }),
          el("button", { class: "icon", "aria-label": "Close report", onclick: () => { openReport = null; panel.replaceChildren(); } }, icon("close"))),
        r.summary ? el("p", { class: "report-summary", text: r.summary }) : null,
        r.points.length ? el("ol", { class: "report-points" }, ...r.points.map((p) => el("li", {},
          el("p", { class: "point-head" }, el("strong", { text: p.heading })),
          p.detail ? el("p", { class: "point-detail", text: p.detail }) : null,
          ...p.quotes.map((q) => el("blockquote", { class: "point-quote" },
            el("span", { text: `“${q.quote}”` }),
            el("a", { href: `#/t/${q.id}`, text: q.name })))))) : null,
        el("p", { class: "report-foot", text: `Written from ${r.count} testimonials (${r.label}) on ${new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` })));
    }

    const tiles = el("div", { class: "report-tiles" }, ...REPORT_TYPES.map(([kind, title, about]) =>
      el("button", { class: "report-tile", disabled: !data.ai, onclick: () => run(kind) },
        icon(kind), el("span", {}, el("strong", { text: title }), el("span", { class: "muted", text: about })))));

    const askInput = el("input", { type: "text", maxlength: 300, placeholder: "Ask anything, like “Why do people choose to work with me?”", "aria-label": "Ask a question about these testimonials",
      onkeydown: (e) => { if (e.key === "Enter") askButton.click(); } });
    const askButton = el("button", { class: "primary", text: "Ask", disabled: !data.ai, onclick: () => {
      const q = askInput.value.trim();
      if (q.length < 5) return toast("Type a question first.");
      run("ask", q);
    } });

    const recent = el("div");
    const paintRecent = () => {
      const list = voiceReports || [];
      recent.replaceChildren(...(list.length ? [
        el("h2", { text: "Recent reports" }),
        el("div", { class: "recent" }, ...list.slice(0, 12).map((r) => el("button", { class: "recent-row", onclick: () => { openReport = r; showReport(r); panel.scrollIntoView({ behavior: "smooth", block: "nearest" }); } },
          el("span", { class: "grow" }, el("strong", { text: r.kind === "ask" ? r.question : r.title }), el("span", { class: "muted", text: ` · ${r.label}` })),
          el("span", { class: "muted", text: new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) }))))] : []));
    };
    if (voiceReports) paintRecent();
    else api("ai/voice").then(({ reports }) => { voiceReports = reports; paintRecent(); }).catch(() => {});

    view.append(...[
      scopeBox,
      !data.ai ? el("p", { class: "warn", text: "The AI isn't switched on for your site yet, so new reports can't run. Saved ones still open." }) : null,
      tiles,
      el("div", { class: "ask-row" }, askInput, askButton),
      panel,
      recent].filter(Boolean));
    if (openReport) showReport(openReport);
    return view;
  }

  // Suggested pull quotes for every approved testimonial without one.
  function renderHighlights() {
    leaveGuard = null;
    const queue = data.testimonials.filter((t) => t.status === "approved" && !t.highlight && t.body);
    const list = el("div", { class: "list" });
    const status = el("p", { class: "muted", style: "text-align:center" });
    const more = el("button", { text: "Show more", hidden: true, onclick: () => load() });
    let next = 0;
    let loading = false;

    const paintStatus = () => {
      const left = queue.length - next;
      status.textContent = loading ? "The AI is reading…" : left ? `${left} more to go.` : list.querySelector(".card") ? "" : "All done. Lovely.";
      more.hidden = loading || !left;
    };

    const suggestionCard = (t, quotes) => {
      const node = el("article", { class: "card" });
      const done = () => { node.remove(); paintStatus(); if (!list.querySelector(".card")) load(); };
      node.append(
        el("div", { class: "card-top" }, avatar(t), el("div", { class: "who" }, el("strong", { text: t.name }), el("span", { text: t.role || formTitle(t.formId) }))),
        el("p", { class: "snippet", title: "Tap to read it all", onclick: (e) => e.currentTarget.classList.toggle("open"), text: t.body }),
        el("p", { class: "muted", style: "margin:12px 0 0;font-size:14px", text: quotes.length ? "Tap the one you like." : "The AI couldn't find a strong one here. Pick your own in Edit." }),
        ...quotes.map((q) => el("button", { class: "suggestion", onclick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            const { testimonial } = await api(`testimonials/${t.id}`, { method: "PATCH", body: { highlight: q } });
            Object.assign(t, testimonial);
            toast(`Highlight saved for ${t.name} ✓`);
            done();
          } catch (err) {
            e.currentTarget.disabled = false;
            toast(err.message);
          }
        } }, `“${q}”`)),
        el("div", { class: "card-actions" },
          el("button", { text: "Skip", onclick: done }),
          el("div", { class: "grow" }, el("button", { text: "Edit", onclick: () => { location.hash = `#/t/${t.id}`; } })))
      );
      return node;
    };

    async function load() {
      if (loading || next >= queue.length) return paintStatus();
      loading = true;
      const batch = queue.slice(next, next + 4);
      next += batch.length;
      paintStatus();
      try {
        const { results } = await api("ai/highlights", { method: "POST", body: { ids: batch.map((t) => t.id) } });
        for (const r of results) list.append(suggestionCard(batch.find((t) => t.id === r.id), r.quotes));
      } catch (e) {
        next -= batch.length;
        toast(e.message);
      }
      loading = false;
      paintStatus();
    }

    app.replaceChildren(
      topBar("Suggest highlights", { back: true }),
      el("main", { class: "wrap" },
        el("p", { class: "muted", text: "The AI picks the best lines from each testimonial, word for word. Tap one to make it the highlight, or skip it. Highlights show in your scrolling widgets and at the top of each card." }),
        list, status, el("div", { style: "text-align:center" }, more)
      )
    );
    if (!queue.length) list.append(el("p", { class: "empty", text: "Every approved testimonial has a highlight. Lovely." }));
    else load();
  }

  // ---------- Share cards ----------
  // A branded image of one testimonial, made right here in the browser,
  // ready to save or post to Instagram.

  const SWATCHES = [["background", "Page colour"], ["accent", "Highlight colour"], ["spark", "Spark one"], ["sparkAlt", "Spark two"], ["ink", "Text colour"]];
  const SHARE_SIZES = [["square", "Square post"], ["portrait", "Tall post"], ["story", "Story"]];
  const publicInitials = (name) => name.split(/\s+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(" ");

  // The highlight if there is one, otherwise the first sentence or two.
  const defaultQuote = (t) => {
    if (t.highlight) return t.highlight;
    const text = t.body.replace(/\s+/g, " ").trim();
    if (text.length <= 220) return text;
    let out = "";
    for (const sentence of text.split(/(?<=[.!?])\s/)) {
      const next = out ? `${out} ${sentence}` : sentence;
      if (next.length > 220) break;
      out = next;
    }
    return out || `${text.slice(0, 217).replace(/\s+\S*$/, "")}…`;
  };

  // Brand fonts from Google Fonts, loaded once, so the canvas can draw with them.
  let brandFonts;
  function loadBrandFonts() {
    if (brandFonts) return brandFonts;
    const f = data.settings.fonts;
    const families = [f.heading, f.serif, `${f.body}:wght@400`]
      .map((name) => "family=" + encodeURIComponent(name).replace(/%20/g, "+").replace(/%3A/g, ":").replace(/%40/g, "@"))
      .join("&");
    const link = el("link", { rel: "stylesheet", href: `https://fonts.googleapis.com/css2?${families}&display=swap` });
    brandFonts = new Promise((resolve) => {
      const done = () => Promise.all([
        document.fonts.load(`68px "${f.serif}"`, "“Aa"),
        document.fonts.load(`40px "${f.heading}"`, "Aa"),
        document.fonts.load(`30px "${f.body}"`, "Aa"),
      ]).catch(() => {}).then(resolve);
      link.onload = done;
      link.onerror = resolve;
      setTimeout(resolve, 6000); // never wait forever
    });
    document.head.append(link);
    return brandFonts;
  }

  // The line under the card is remembered on this device, so it only needs typing once.
  const FOOTER_KEY = "te-share-footer";
  const lastFooter = () => { try { return localStorage.getItem(FOOTER_KEY); } catch { return null; } };
  const rememberFooter = (value) => { try { localStorage.setItem(FOOTER_KEY, value); } catch { /* private browsing */ } };

  async function renderShare(id) {
    const t = data.testimonials.find((x) => x.id === id);
    if (!t) { location.hash = "#/"; return; }
    leaveGuard = null;

    const c = data.settings.colours;
    const showName = t.consent?.publishName === true;
    const photoAllowed = Boolean(t.avatar) && t.consent?.publishPhoto === true;
    const o = {
      size: "square", bgKey: "background", text: defaultQuote(t),
      showStars: Boolean(t.rating), showPhoto: photoAllowed, showRole: Boolean(t.role),
      footer: lastFooter() ?? (data.settings.brandName || ""),
    };
    let photo = null;
    let file = null; // the latest image, ready for the share sheet
    const canvas = el("canvas", { class: "share-canvas", role: "img", "aria-label": "Share card preview" });
    const fileName = () => `testimonial-${tagSlug(showName ? t.name : publicInitials(t.name)) || "card"}-${o.size}.png`;

    let queued = false;
    const paint = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        window.ShareCard.draw(canvas, {
          size: o.size, bg: c[o.bgKey], colours: c, fonts: data.settings.fonts,
          text: o.text.trim(), name: showName ? t.name : publicInitials(t.name),
          role: o.showRole ? t.role : "", rating: t.rating, showStars: o.showStars,
          photo: o.showPhoto ? photo : null, initials: initials(t.name || "?"), footer: o.footer.trim(),
        });
        file = null;
        canvas.toBlob((blob) => { if (blob) file = new File([blob], fileName(), { type: "image/png" }); }, "image/png");
      });
    };

    // Size
    const sizeSeg = el("div", { class: "segmented", role: "group", "aria-label": "Size" });
    const paintSizes = () => sizeSeg.replaceChildren(...SHARE_SIZES.map(([key, label]) =>
      el("button", { class: o.size === key ? "is-on" : "", "aria-pressed": String(o.size === key), text: label, onclick: () => { o.size = key; paintSizes(); paint(); } })));
    paintSizes();

    // Background
    const swatches = el("div", { class: "swatches", role: "group", "aria-label": "Background" });
    const paintSwatches = () => swatches.replaceChildren(...SWATCHES.map(([key, label]) =>
      el("button", { class: `swatch${o.bgKey === key ? " is-on" : ""}`, style: `background:${c[key]}`, "aria-label": label, "aria-pressed": String(o.bgKey === key), title: label,
        onclick: () => { o.bgKey = key; paintSwatches(); paint(); } })));
    paintSwatches();

    // Words
    const words = el("textarea", { id: "share-words", rows: 4, maxlength: 400, value: o.text, oninput: (e) => { o.text = e.target.value; paintCount(); paint(); } });
    words.style.minHeight = "100px";
    const count = el("p", { class: "counter" });
    const paintCount = () => {
      count.textContent = `${o.text.length} characters. Under 200 reads best.`;
      count.classList.toggle("over", o.text.length > 280);
    };
    paintCount();
    const resetWords = el("button", { class: "link", text: t.highlight ? "Go back to the highlight" : "Go back to the opening lines", onclick: () => { o.text = defaultQuote(t); words.value = o.text; paintCount(); paint(); } });

    const toggle = (key, label, { disabled } = {}) => el("label", { class: "toggle" },
      el("input", { type: "checkbox", checked: o[key], disabled: Boolean(disabled), onchange: (e) => { o[key] = e.target.checked; paint(); } }), label);

    const footer = el("input", { type: "text", id: "share-footer", maxlength: 60, value: o.footer, oninput: (e) => { o.footer = e.target.value; rememberFooter(o.footer); paint(); } });

    // Save and share
    const download = el("button", { text: "Save image", onclick: () => {
      canvas.toBlob((blob) => {
        if (!blob) return toast("Couldn't make the image. Please try again.");
        const url = URL.createObjectURL(blob);
        const a = el("a", { href: url, download: fileName() });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }, "image/png");
    } });
    const share = el("button", { class: "primary", text: "Share", onclick: async () => {
      if (!file) return toast("One moment, the image is still being made. Tap Share again.");
      try {
        await navigator.share({ files: [file] });
      } catch (e) {
        if (e.name !== "AbortError") toast("Sharing didn't work here. Tap Save image instead.");
      }
    } });
    const testFile = new File([new Blob(["x"], { type: "image/png" })], "test.png", { type: "image/png" });
    share.hidden = !(navigator.canShare && navigator.canShare({ files: [testFile] }));

    app.replaceChildren(
      topBar("Share card", { back: true, backTo: `#/t/${t.id}` }),
      el("main", { class: "wrap" },
        el("section", { class: "section" },
          canvas,
          t.status !== "approved" ? el("p", { class: "warn", text: "Heads up. This one isn't approved yet." }) : null,
          !showName ? el("p", { class: "warn", text: "They said no to showing their name, so the card uses their initials." }) : null,
          t.avatar && !photoAllowed ? el("p", { class: "warn", text: "They said no to showing their photo, so the card uses their initials instead." }) : null
        ),
        el("section", { class: "section" },
          el("h2", { text: "Size" }), sizeSeg,
          el("p", { class: "muted", style: "font-size:14px;margin:8px 0 0", text: "Square and tall are for feed posts. Story keeps the words clear of Instagram's buttons." }),
          el("h2", { text: "Background", style: "margin-top:20px" }), swatches
        ),
        el("section", { class: "section" },
          el("h2", { text: "Words" }),
          el("label", { for: "share-words" }, "What the card says", el("small", { text: "Changes here are for this image only. Your testimonial stays as it is." }), words),
          count, resetWords,
          t.rating ? toggle("showStars", "Show their stars") : null,
          photoAllowed ? toggle("showPhoto", "Show their photo") : null,
          t.role ? toggle("showRole", `Show "${t.role}"`) : null,
          el("label", { for: "share-footer" }, "Line under the card", el("small", { text: "Your name, website or Instagram handle. Leave it empty for none. This device remembers it for next time." }), footer)
        )
      ),
      el("div", { class: "savebar" }, el("div", { class: "inner" }, download, share))
    );
    if (share.hidden) download.classList.add("primary");
    window.scrollTo({ top: 0 });

    paint();
    if (o.showPhoto) {
      const img = new Image();
      img.onload = () => { photo = img; paint(); };
      img.src = `/api/avatar/${t.avatar}`;
    }
    await loadBrandFonts();
    paint();
  }

  // ---------- Settings ----------

  // Ready-made looks. One tap fills in the colours and fonts, and everything
  // can still be changed afterwards.
  const STYLE_PRESETS = [
    { key: "neutral", name: "Neutral", about: "Simple, calm and timeless.",
      colours: { background: "#FAF8F4", surface: "#FFFFFF", ink: "#161616", accent: "#E8D9B5", spark: "#C9A87C", sparkAlt: "#A8B5A0" },
      fonts: { heading: "Inter Tight", serif: "Newsreader", body: "Inter" } },
    { key: "editorial", name: "Editorial", about: "Polished and professional, like a magazine.",
      colours: { background: "#F4F1EA", surface: "#FFFFFF", ink: "#1B1B1B", accent: "#D9B26F", spark: "#8C2F39", sparkAlt: "#2F4858" },
      fonts: { heading: "Playfair Display", serif: "Playfair Display", body: "Source Sans 3" } },
    { key: "soft", name: "Soft and warm", about: "Gentle earthy tones for wellbeing and care.",
      colours: { background: "#F6F1EB", surface: "#FFFDFB", ink: "#3B2F2A", accent: "#E8C4A8", spark: "#C97B63", sparkAlt: "#9CAF88" },
      fonts: { heading: "Cormorant Garamond", serif: "Cormorant Garamond", body: "Nunito Sans" } },
    { key: "colourful", name: "Colourful", about: "Bright and friendly, full of energy.",
      colours: { background: "#FFF7EF", surface: "#FFFFFF", ink: "#1E1B3A", accent: "#FFB703", spark: "#FB5607", sparkAlt: "#3A86FF" },
      fonts: { heading: "Bricolage Grotesque", serif: "Fraunces", body: "DM Sans" } },
    { key: "playful", name: "Bold and playful", about: "Loud, fun and full of personality.",
      colours: { background: "#FFFDF2", surface: "#FFFFFF", ink: "#111111", accent: "#FAED23", spark: "#FF9AD5", sparkAlt: "#7EF0FF" },
      fonts: { heading: "Archivo Black", serif: "DM Serif Display", body: "Source Sans 3" } },
  ];
  const sameStyle = (s, p) => Object.keys(p.colours).every((k) => (s.colours[k] || "").toUpperCase() === p.colours[k].toUpperCase())
    && Object.keys(p.fonts).every((k) => s.fonts[k] === p.fonts[k]);

  // The preset fonts, loaded once so each style card can show its own look.
  let presetFontsLoaded = false;
  function loadPresetFonts() {
    if (presetFontsLoaded) return;
    presetFontsLoaded = true;
    const families = [...new Set(STYLE_PRESETS.flatMap((p) => [p.fonts.heading, p.fonts.body]))]
      .map((name) => "family=" + encodeURIComponent(name).replace(/%20/g, "+")).join("&");
    document.head.append(el("link", { rel: "stylesheet", href: `https://fonts.googleapis.com/css2?${families}&display=swap` }));
  }

  let previewTab = "wall"; // remembered while the admin is open
  let activePreviewMessage = null;
  window.addEventListener("message", (e) => activePreviewMessage?.(e));

  function renderSettings(draft, wasDirty = false) {
    const s = draft || structuredClone(data.settings);
    let dirty = wasDirty;
    leaveGuard = () => !dirty || confirm("You have unsaved changes. Leave without saving?");

    const text = (path, label, hint, type = "text") => {
      const [group, key] = path.split(".");
      const holder = key ? s[group] : s;
      const name = key || group;
      const input = el(type === "textarea" ? "textarea" : "input", { type, id: `s-${path}`, value: holder[name] || "",
        oninput: (e) => { holder[name] = e.target.value; dirty = true; } });
      if (type === "textarea") input.style.minHeight = "70px";
      return el("label", { for: `s-${path}` }, label, hint ? el("small", { text: hint }) : null, input);
    };

    const COLOUR_LABELS = { background: "Background", surface: "Cards", ink: "Text and outlines", accent: "Buttons and highlights", spark: "Spark one", sparkAlt: "Spark two" };
    const colour = (key) => {
      const hex = el("input", { type: "text", value: s.colours[key], "aria-label": `${COLOUR_LABELS[key]} code`, maxlength: 7 });
      const picker = el("input", { type: "color", value: s.colours[key], "aria-label": COLOUR_LABELS[key] });
      picker.addEventListener("input", () => { hex.value = picker.value.toUpperCase(); s.colours[key] = hex.value; dirty = true; });
      hex.addEventListener("input", () => { s.colours[key] = hex.value; dirty = true; if (/^#[0-9a-f]{6}$/i.test(hex.value)) picker.value = hex.value; });
      return el("label", {}, COLOUR_LABELS[key], el("div", { class: "colour" }, picker, hex));
    };

    // One-tap styles
    loadPresetFonts();
    const styleCards = el("div", { class: "style-grid" }, ...STYLE_PRESETS.map((p) =>
      el("button", { class: `style-card${sameStyle(s, p) ? " is-on" : ""}`, "aria-pressed": String(sameStyle(s, p)), onclick: () => {
        const y = window.scrollY;
        renderSettings({ ...s, colours: { ...s.colours, ...p.colours }, fonts: { ...s.fonts, ...p.fonts } }, true);
        window.scrollTo({ top: y });
        toast(`${p.name} applied. Tap Save settings to keep it.`);
      } },
        el("span", { class: "style-swatches" }, ...["background", "ink", "accent", "spark", "sparkAlt"].map((k) => el("span", { style: `background:${p.colours[k]}` }))),
        el("span", { class: "style-name", style: `font-family:"${p.fonts.heading}",sans-serif`, text: p.name }),
        el("span", { class: "muted", text: p.about }))));

    // Previews of everything the style touches, with the unsaved choices
    const tabs = el("div", { class: "segmented preview-tabs", role: "group", "aria-label": "Preview" });
    const panel = el("div", { class: "preview-panel" });
    const previewNote = el("p", { class: "muted", style: "margin:10px 0 0;font-size:13.5px" });
    let wallFrame = null;
    let formFrame = null;
    let widgetFrames = {};
    let shareCanvas = null;
    let previewTimer;
    let previewRun = 0;
    const paintNote = () => { previewNote.textContent = dirty ? "Showing your changes. They aren't saved yet." : "This is how it looks right now."; };
    const styleMessage = () => ({ type: "kiitos:style", colours: s.colours, fonts: s.fonts, brandName: s.brandName });
    const fetchPreview = async (extra = {}) => {
      const res = await fetch("/api/admin/preview", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ colours: s.colours, fonts: s.fonts, brandName: s.brandName, ...extra }) });
      return res.ok ? res.text() : null;
    };

    // Widgets tell their frame how tall they are, and the form says when it's ready for colours.
    activePreviewMessage = (e) => {
      if (e.data?.type === "kiitos:form-ready" && formFrame && e.source === formFrame.contentWindow) {
        formFrame.contentWindow.postMessage(styleMessage(), location.origin);
      }
      if (e.data?.type === "love-widget:height") {
        const frame = Object.values(widgetFrames).find((f) => f.contentWindow === e.source);
        if (frame && e.data.height > 0) frame.style.height = `${Math.min(e.data.height, 900)}px`;
      }
    };

    const drawShareCard = async () => {
      const pool = data.testimonials.filter((t) => t.status === "approved" && t.body);
      const t = pool.find((x) => x.highlight && x.consent?.publishName) || pool.find((x) => x.highlight) || pool[0];
      const f = s.fonts;
      const families = [f.heading, f.serif, `${f.body}:wght@400`].map((n) => "family=" + encodeURIComponent(n).replace(/%20/g, "+").replace(/%3A/g, ":").replace(/%40/g, "@")).join("&");
      let link = document.getElementById("draft-fonts");
      if (!link) { link = el("link", { id: "draft-fonts", rel: "stylesheet" }); document.head.append(link); }
      const href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
      if (link.href !== href) await new Promise((resolve) => { link.onload = link.onerror = resolve; link.href = href; setTimeout(resolve, 4000); });
      await Promise.all([document.fonts.load(`68px "${f.serif}"`, "“Aa"), document.fonts.load(`40px "${f.heading}"`, "Aa"), document.fonts.load(`30px "${f.body}"`, "Aa")]).catch(() => {});
      if (!shareCanvas) return;
      const showName = t ? t.consent?.publishName === true : true;
      window.ShareCard.draw(shareCanvas, {
        size: "square", bg: s.colours.background, colours: s.colours, fonts: f,
        text: t ? defaultQuote(t) : "I came in stuck and left with a plan I actually believe in.",
        name: t ? (showName ? t.name : publicInitials(t.name)) : "Ana Silva", role: t && showName ? t.role || "" : "Founder, Bloom Studio",
        rating: t ? t.rating : 5, showStars: true, photo: null, initials: initials((t && t.name) || "Ana Silva"), footer: lastFooter() ?? (s.brandName || ""),
      });
    };

    const refreshPreview = (now = false) => {
      paintNote();
      if (formFrame?.contentWindow) formFrame.contentWindow.postMessage(styleMessage(), location.origin);
      clearTimeout(previewTimer);
      previewTimer = setTimeout(async () => {
        const run = ++previewRun;
        try {
          if (wallFrame) {
            const html = await fetchPreview();
            if (html && run === previewRun) wallFrame.srcdoc = html;
          }
          for (const [style, frame] of Object.entries(widgetFrames)) {
            const html = await fetchPreview({ widget: style });
            if (html && run === previewRun) frame.srcdoc = html;
          }
          if (shareCanvas) await drawShareCard();
        } catch { /* the preview is a nice-to-have */ }
      }, now ? 0 : 450);
    };

    const PREVIEW_TABS = [["wall", "Wall of Love"], ["form", "Form"], ["widgets", "Widgets"], ["share", "Share card"]];
    const WIDGET_PREVIEWS = [["marquee", "Marquee rows", 136], ["badge", "Rating badge", 76], ["avatars", "Avatar strip", 104], ["card", "Single card", 360]];
    const buildPanel = () => {
      wallFrame = formFrame = shareCanvas = null;
      widgetFrames = {};
      if (previewTab === "wall") {
        wallFrame = el("iframe", { class: "style-preview", title: "Preview of your Wall of Love", sandbox: "" });
        panel.replaceChildren(wallFrame);
      } else if (previewTab === "form") {
        const slug = data.forms[0]?.slug;
        panel.replaceChildren(slug
          ? el("div", { class: "phone-wrap" }, formFrame = el("iframe", { class: "phone", title: "Preview of your form", src: `/f/${encodeURIComponent(slug)}?style-preview=1` }))
          : el("p", { class: "muted", text: "Make a form first, then you can preview it here." }));
      } else if (previewTab === "widgets") {
        panel.replaceChildren(el("div", { class: "widget-previews" }, ...WIDGET_PREVIEWS.map(([style, label, height]) => {
          widgetFrames[style] = el("iframe", { class: "widget-preview", title: `Preview of the ${label.toLowerCase()} widget`, sandbox: "allow-scripts", style: `height:${height}px` });
          return el("div", {}, el("p", { class: "label-like", style: "margin-top:0", text: label }), widgetFrames[style]);
        })), el("p", { class: "muted", style: "margin:10px 0 0;font-size:13.5px", text: "Shown on your background colour. On your website they sit on whatever is behind them." }));
      } else {
        shareCanvas = el("canvas", { class: "share-canvas", role: "img", "aria-label": "Preview of a share card" });
        panel.replaceChildren(shareCanvas);
      }
      refreshPreview(true);
    };
    const paintTabs = () => tabs.replaceChildren(...PREVIEW_TABS.map(([key, label]) =>
      el("button", { class: previewTab === key ? "is-on" : "", "aria-pressed": String(previewTab === key), text: label, onclick: () => { previewTab = key; paintTabs(); buildPanel(); } })));

    const save = el("button", { class: "primary", text: "Save settings", onclick: async () => {
      save.disabled = true;
      try {
        const { settings } = await api("settings", { method: "PUT", body: s });
        data.settings = settings;
        dirty = false;
        toast("Settings saved ✓");
        refreshPreview();
      } catch (e) {
        toast(e.message);
      } finally {
        save.disabled = false;
      }
    } });

    app.replaceChildren(
      topBar("Settings"),
      el("main", { class: "wrap" },
        el("section", { class: "section" },
          el("h2", { text: "Brand" }),
          text("brandName", "Brand name", "Shown on your walls, widgets, forms and share cards."),
          text("ownerName", "Your first name", "Optional. The AI helpers use it, so reports talk about you by name."),
          text("ownerRole", "What you do", "Optional. For example life coach, yoga teacher or brand designer. Helps the AI understand your testimonials."),
          text("logoUrl", "Logo link", "Optional. A link to your logo image. Leave empty to show your brand name instead.", "url"),
          text("siteUrl", "Website", "Your main website, for links back.", "url")
        ),
        el("section", { class: "section" },
          el("h2", { text: "Style" }),
          el("p", { class: "muted", style: "margin:0", text: "Pick a look in one tap, then make it yours with the colours and fonts below. It styles your forms, Walls of Love, widgets and share cards." }),
          styleCards),
        el("section", { class: "section" },
          el("h2", { text: "Preview" }),
          tabs, panel, previewNote),
        el("section", { class: "section" },
          el("h2", { text: "Colours" }),
          el("p", { class: "muted", style: "margin:0", text: "These style everything your clients see: your forms, Walls of Love, widgets and share cards. Your admin keeps its own look." }),
          ...Object.keys(s.colours).map(colour)
        ),
        el("section", { class: "section" },
          el("h2", { text: "Fonts" }),
          el("p", { class: "muted", style: "margin:0", text: "Used on your forms, walls, widgets and share cards. Any font name from Google Fonts, spelt exactly as it appears there." }),
          text("fonts.heading", "Headlines"),
          text("fonts.serif", "Accent serif"),
          text("fonts.body", "Body text")
        ),
        el("section", { class: "section" },
          el("h2", { text: "Consent wording" }),
          el("p", { class: "muted", style: "margin:0", text: "The questions people answer on the last screen of the form. Each testimonial keeps a copy of the exact words they saw." }),
          text("consent.publishName", "Name question", "Asked with Yes and No buttons.", "textarea"),
          text("consent.publishPhoto", "Photo question", "Only asked if they added a photo.", "textarea"),
          text("consent.note", "Small print underneath", "", "textarea")
        )
      ),
      el("div", { class: "savebar" }, el("div", { class: "inner" }, save))
    );
    // Any change to colours, fonts or the brand name refreshes the preview.
    app.querySelector("main").addEventListener("input", (e) => {
      if (/^s-(fonts\.|brandName)/.test(e.target.id || "") || e.target.closest(".colour")) refreshPreview();
    });
    paintTabs();
    buildPanel();
    if (!draft) window.scrollTo({ top: 0 });
  }


  // ---------- Walls (collections) ----------

  const SORT_LABELS = { featured: "Featured first, then newest", newest: "Newest first", rating: "Highest stars first", manual: "My own order" };
  const wallUrl = (slug) => `${location.origin}/wall/${slug}`;
  const slugify = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

  // Mirrors netlify/lib/collections.mjs so the preview matches the real wall.
  function selectFor(c) {
    const pins = new Set(c.pins), excluded = new Set(c.exclusions);
    const newest = (a, b) => b.createdAt.localeCompare(a.createdAt);
    const featuredFirst = (a, b) => Number(b.featured) - Number(a.featured) || newest(a, b);
    const matchesRule = (t) => !c.rule.tags.length || (c.rule.match === "all"
      ? c.rule.tags.every((tag) => (t.tags || []).includes(tag))
      : c.rule.tags.some((tag) => (t.tags || []).includes(tag)));
    const chosen = data.testimonials.filter((t) => t.status === "approved" && !excluded.has(t.id) && (pins.has(t.id) || matchesRule(t)));
    if (c.sort === "newest") chosen.sort(newest);
    else if (c.sort === "rating") chosen.sort((a, b) => (b.rating || 0) - (a.rating || 0) || featuredFirst(a, b));
    else if (c.sort === "manual") {
      const pos = new Map(c.order.map((id, i) => [id, i]));
      chosen.sort((a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity) || featuredFirst(a, b));
    } else chosen.sort(featuredFirst);
    const waiting = data.testimonials.filter((t) => t.status === "pending" && matchesRule(t)).length;
    return { chosen, waiting, excluded: data.testimonials.filter((t) => excluded.has(t.id)) };
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Link copied ✓"); }
    catch { prompt("Copy this link", text); }
  }

  function renderWalls() {
    leaveGuard = null;
    const list = data.collections.map((c) => {
      const { chosen } = selectFor(c);
      const avg = averageOf(chosen);
      return el("article", { class: "card" },
        el("div", { class: "card-top" },
          el("div", { class: "who" }, el("strong", { text: c.name }), el("span", { text: `/wall/${c.slug}` })),
          el("span", { class: "pill", text: `★ ${avg} · ${chosen.length}` })),
        c.description ? el("p", { class: "snippet", text: c.description }) : null,
        el("div", { class: "meta" }, ...(c.rule.tags.length ? c.rule.tags.map((tag) => el("span", { class: "pill", text: `#${tag}` })) : [el("span", { class: "pill", text: "All approved" })])),
        el("div", { class: "card-actions" },
          el("a", { class: "btn primary", href: `/wall/${c.slug}`, target: "_blank", rel: "noopener", text: "Open wall" }),
          el("button", { text: "Copy link", onclick: () => copy(wallUrl(c.slug)) }),
          el("div", { class: "grow" }, el("button", { text: "Edit", onclick: () => { location.hash = `#/walls/${c.id}`; } })))
      );
    });
    app.replaceChildren(
      topBar("Walls of Love", { extra: [el("button", { class: "primary", text: "+ New wall", onclick: () => { location.hash = "#/walls/new"; } })] }),
      el("main", { class: "wrap" },
        el("p", { class: "lede", text: "Each wall is a group of approved testimonials, chosen by tag, with its own public page." }),
        el("div", { class: "list" }, ...(list.length ? list : [el("p", { class: "empty", text: "No collections yet. Make your first one." })]))
      )
    );
  }

  function renderWall(id) {
    const isNew = id === "new";
    const existing = data.collections.find((c) => c.id === id);
    if (!isNew && !existing) { location.hash = "#/walls"; return; }
    const c = structuredClone(existing || {
      name: "", slug: "", description: "", rule: { tags: [], match: "any" }, pins: [], exclusions: [], sort: "featured", order: [],
      wall: { eyebrow: "", heading: "Wall of Love", subheading: "", showRatings: true },
    });
    let dirty = false;
    let slugTouched = !isNew;
    const touch = () => { dirty = true; };
    leaveGuard = () => !dirty || confirm("You have unsaved changes. Leave without saving?");

    const input = (value, attrs = {}) => el(attrs.multiline ? "textarea" : "input", { type: "text", value: value || "", ...attrs });
    const labelled = (label, hint, node) => el("label", {}, label, hint ? el("small", { text: hint }) : null, node);

    // Basics
    const name = input(c.name, { placeholder: "Coaching Academy" });
    const slug = input(c.slug, { placeholder: "coaching-academy" });
    const linkHint = el("small", { class: "muted" });
    const paintLink = () => { linkHint.textContent = c.slug ? wallUrl(c.slug) : "Your link appears here"; };
    name.addEventListener("input", () => {
      c.name = name.value; touch();
      if (!slugTouched) { c.slug = slugify(name.value); slug.value = c.slug; paintLink(); }
      if (!c.wall.eyebrow || c.wall.eyebrow === eyebrowAuto) { c.wall.eyebrow = name.value; eyebrow.value = name.value; eyebrowAuto = name.value; }
    });
    slug.addEventListener("input", () => { slugTouched = true; c.slug = slugify(slug.value); paintLink(); touch(); });
    slug.addEventListener("blur", () => { slug.value = c.slug; });
    paintLink();
    const description = input(c.description, { multiline: true, placeholder: "A note for you. Only you see this." });
    description.style.minHeight = "60px";
    description.addEventListener("input", () => { c.description = description.value; touch(); });

    // Rule
    const tagList = el("div", { class: "tag-list" });
    const paintTags = () => tagList.replaceChildren(...(c.rule.tags.length
      ? c.rule.tags.map((tag) => el("span", { class: "chip" }, `#${tag}`, el("button", { class: "link", "aria-label": `Remove ${tag}`, text: "✕", onclick: () => { c.rule.tags = c.rule.tags.filter((x) => x !== tag); touch(); paintTags(); paintPreview(); } })))
      : [el("span", { class: "muted", text: "No tags yet, so every approved testimonial is included." })]));
    const tagInput = el("input", { type: "text", list: "wall-tags", placeholder: "Pick or type a tag", "aria-label": "Add a tag" });
    const addTag = () => {
      const tag = tagSlug(tagInput.value);
      if (tag && !c.rule.tags.includes(tag)) { c.rule.tags.push(tag); touch(); paintTags(); paintPreview(); }
      tagInput.value = "";
    };
    tagInput.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } });
    tagInput.addEventListener("change", addTag);
    const matchSeg = el("div", { class: "segmented", role: "group", "aria-label": "Match" });
    const paintMatch = () => matchSeg.replaceChildren(...[["any", "Any of these tags"], ["all", "All of these tags"]].map(([v, label]) =>
      el("button", { class: c.rule.match === v ? "is-on" : "", "aria-pressed": String(c.rule.match === v), text: label, onclick: () => { c.rule.match = v; touch(); paintMatch(); paintPreview(); } })));

    const sort = el("select", { "aria-label": "Order" }, ...Object.entries(SORT_LABELS).map(([v, label]) => el("option", { value: v, text: label, selected: c.sort === v })));
    sort.addEventListener("change", () => {
      c.sort = sort.value; touch();
      if (c.sort === "manual" && !c.order.length) c.order = selectFor(c).chosen.map((t) => t.id);
      paintPreview();
    });

    // Wall words
    const eyebrow = input(c.wall.eyebrow, { placeholder: "Coaching Academy" });
    let eyebrowAuto = isNew ? "" : null;
    eyebrow.addEventListener("input", () => { c.wall.eyebrow = eyebrow.value; eyebrowAuto = null; touch(); });
    const heading = input(c.wall.heading, { placeholder: "Wall of Love" });
    heading.addEventListener("input", () => { c.wall.heading = heading.value; touch(); });
    const sub = input(c.wall.subheading, { multiline: true, placeholder: "Real words from real people." });
    sub.style.minHeight = "60px";
    sub.addEventListener("input", () => { c.wall.subheading = sub.value; touch(); });
    const ratings = el("label", { class: "toggle" },
      el("input", { type: "checkbox", checked: c.wall.showRatings, onchange: (e) => { c.wall.showRatings = e.target.checked; touch(); } }),
      "Show stars and the rating badge");

    // Live preview
    const summary = el("p", { class: "muted", style: "margin:0" });
    const preview = el("div", { class: "list" });
    const excludedBox = el("div", {});
    const move = (tid, step) => {
      const ids = selectFor(c).chosen.map((t) => t.id);
      const i = ids.indexOf(tid), j = i + step;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      c.order = ids; touch(); paintPreview();
    };
    function paintPreview() {
      const { chosen, waiting, excluded } = selectFor(c);
      const avg = averageOf(chosen);
      summary.textContent = `${chosen.length} testimonial${chosen.length === 1 ? "" : "s"} on this wall${avg === "–" ? "" : `, averaging ${avg} stars`}.` + (waiting ? ` ${waiting} more match but are still waiting for approval in your inbox.` : "");
      preview.replaceChildren(...(chosen.length ? chosen.map((t, i) => {
        const pinned = c.pins.includes(t.id);
        return el("article", { class: "card" },
          el("div", { class: "card-top" }, avatar(t),
            el("div", { class: "who" }, el("strong", { text: t.name }), el("span", { text: t.role || date(t.createdAt) })), stars(t.rating)),
          el("p", { class: "snippet", text: t.highlight ? `“${t.highlight}”` : t.body }),
          el("div", { class: "meta" },
            t.featured ? el("span", { class: "pill featured", text: "★ Featured" }) : null,
            pinned ? el("span", { class: "pill", text: "📌 Pinned" }) : null,
            !t.consent?.publishName ? el("span", { class: "pill", text: "Initials only" }) : null),
          el("div", { class: "card-actions" },
            c.sort === "manual" ? el("button", { class: "icon", "aria-label": "Move up", text: "↑", disabled: i === 0, onclick: () => move(t.id, -1) }) : null,
            c.sort === "manual" ? el("button", { class: "icon", "aria-label": "Move down", text: "↓", disabled: i === chosen.length - 1, onclick: () => move(t.id, 1) }) : null,
            el("button", { text: pinned ? "Unpin" : "Pin", title: "Pinned testimonials stay on this wall whatever their tags", onclick: () => {
              c.pins = pinned ? c.pins.filter((x) => x !== t.id) : [...c.pins, t.id]; touch(); paintPreview();
            } }),
            el("div", { class: "grow" }, el("button", { class: "hide", text: "Leave off", onclick: () => {
              c.exclusions = [...c.exclusions, t.id]; c.pins = c.pins.filter((x) => x !== t.id); touch(); paintPreview();
            } })))
        );
      }) : [el("p", { class: "empty", text: "Nothing on this wall yet. Approve testimonials with these tags, or change the tags above." })]));
      excludedBox.replaceChildren(...(excluded.length ? [
        el("h2", { text: "Left off this wall" }),
        ...excluded.map((t) => el("div", { class: "row", style: "margin-top:8px" },
          el("span", { class: "grow", text: t.name }),
          el("button", { text: "Put back", onclick: () => { c.exclusions = c.exclusions.filter((x) => x !== t.id); touch(); paintPreview(); } }))),
      ] : []));
    }

    paintTags(); paintMatch(); paintPreview();

    const save = el("button", { class: "primary", text: isNew ? "Create wall" : "Save changes", onclick: async () => {
      if (!c.name.trim()) return toast("Give your collection a name first.");
      save.disabled = true;
      try {
        const { collection } = await api(isNew ? "collections" : `collections/${existing.id}`, { method: isNew ? "POST" : "PUT", body: c });
        const i = data.collections.findIndex((x) => x.id === collection.id);
        if (i >= 0) data.collections[i] = collection; else data.collections.push(collection);
        dirty = false;
        toast(isNew ? "Your wall is live ✓" : "Saved. The wall is updated ✓");
        location.hash = "#/walls";
      } catch (e) {
        toast(e.message);
      } finally {
        save.disabled = false;
      }
    } });

    const remove = !isNew ? el("button", { class: "hide", text: "Delete", onclick: async () => {
      if (!confirm(`Delete "${c.name}"? The wall at /wall/${existing.slug} will stop working. Your testimonials stay safe.`)) return;
      try {
        await api(`collections/${existing.id}`, { method: "DELETE" });
        data.collections = data.collections.filter((x) => x.id !== existing.id);
        dirty = false;
        toast("Collection deleted");
        location.hash = "#/walls";
      } catch (e) { toast(e.message); }
    } }) : null;

    app.replaceChildren(
      topBar(isNew ? "New collection" : "Edit collection", { back: true, backTo: "#/walls",
        extra: !isNew ? [el("a", { class: "btn", href: `/wall/${existing.slug}`, target: "_blank", rel: "noopener", text: "View" })] : [] }),
      el("main", { class: "wrap" },
        el("section", { class: "section" },
          el("h2", { text: "The basics" }),
          labelled("Name", "", name),
          labelled("Link name", "Lowercase words joined with hyphens.", slug), linkHint,
          labelled("Note to self", "", description)
        ),
        el("section", { class: "section" },
          el("h2", { text: "Which testimonials" }),
          el("p", { class: "muted", style: "margin:0 0 10px", text: "Only approved testimonials ever appear." }),
          matchSeg, tagList,
          el("div", { class: "row", style: "margin-top:8px" }, el("div", { class: "grow" }, tagInput), el("button", { text: "Add", onclick: addTag })),
          el("datalist", { id: "wall-tags" }, ...data.tags.map((tag) => el("option", { value: tag }))),
          labelled("Order", "", sort)
        ),
        el("section", { class: "section" },
          el("h2", { text: "Wall words" }),
          labelled("Small label above the headline", "", eyebrow),
          labelled("Headline", "", heading),
          labelled("Line underneath", "", sub),
          ratings
        ),
        el("section", { class: "section" },
          el("h2", { text: "Live preview" }),
          summary, preview, excludedBox
        )
      ),
      el("div", { class: "savebar" }, el("div", { class: "inner" }, remove, save))
    );
    window.scrollTo({ top: 0 });
  }


  // ---------- Widgets ----------

  const WIDGET_STYLES = {
    marquee: { label: "Marquee", hint: "Rows of pill cards that scroll sideways. Uses each highlight, or a line from the \"what changed\" answer if there isn't one. Write highlights under 160 characters for the best look." },
    avatars: { label: "Avatar strip", hint: "A row of overlapping faces with the rating underneath." },
    badge: { label: "Rating badge", hint: "The black square with your average and count, worked out live." },
    grid: { label: "Grid", hint: "Cards with the full testimonials." },
    card: { label: "Single card", hint: "One testimonial, for a sales page section." },
  };
  const widgetState = { collection: "", style: "marquee", rows: "3", speed: "medium", names: false, max: "10", caption: true, limit: "6", id: "", ratings: true, bg: "transparent", bgCustom: "#FFFFFF" };

  function widgetUrl(w) {
    const c = data.collections.find((x) => x.id === w.collection);
    if (!c) return "";
    const q = new URLSearchParams();
    if (w.style === "marquee") { q.set("rows", w.rows); q.set("speed", w.speed); if (w.names) q.set("names", "1"); }
    if (w.style === "avatars") { q.set("max", w.max); if (!w.caption) q.set("caption", "0"); }
    if (w.style === "grid") q.set("limit", w.limit);
    if (w.style === "card" && w.id) q.set("id", w.id);
    if ((w.style === "grid" || w.style === "card") && !w.ratings) q.set("ratings", "0");
    const bg = w.bg === "custom" ? w.bgCustom.replace("#", "") : w.bg;
    if (bg !== "transparent") q.set("bg", bg);
    const qs = q.toString();
    return `${location.origin}/w/${c.slug}/${w.style}${qs ? `?${qs}` : ""}`;
  }

  // Matches the fixed heights in netlify/functions/widget.mjs.
  // Grid and single card grow with their content, so those use the preview's height.
  let measuredHeight = 0;
  function widgetHeight(w) {
    if (w.style === "marquee") { const rows = Number(w.rows); return rows * 60 + (rows - 1) * 8 + 8; }
    if (w.style === "avatars") return 104;
    if (w.style === "badge") return 76;
    return measuredHeight || 400;
  }

  function embedCode(url, style) {
    const height = widgetHeight(widgetState);
    return `<iframe data-love-widget src="${url}" title="Testimonials" loading="lazy" scrolling="no" style="width:100%;border:0;display:block;height:${height}px;overflow:hidden"></iframe>\n<script src="${location.origin}/embed.js" async></script>`;
  }

  function renderWidgets() {
    leaveGuard = null;
    const w = widgetState;
    if (!data.collections.some((c) => c.id === w.collection)) {
      // Start on the collection with the most testimonials in it.
      const ranked = [...data.collections].sort((a, b) => selectFor(b).chosen.length - selectFor(a).chosen.length);
      w.collection = ranked[0]?.id || "";
    }

    const frame = el("iframe", { "data-love-widget": "", title: "Widget preview", scrolling: "no", style: "width:100%;border:0;display:block;height:220px" });
    const code = el("textarea", { readonly: true, rows: 5, "aria-label": "Embed code", style: "font-family:ui-monospace,Menlo,monospace;font-size:13px;min-height:110px" });
    const hint = el("p", { class: "muted", style: "margin:6px 0 0" });
    const heightNote = el("p", { class: "warn", style: "margin:12px 0 0" });
    const options = el("div", {});
    const emptyNote = el("p", { class: "empty", hidden: true, text: "This collection has no approved testimonials yet, so the widget stays invisible on your site until it does." });
    const stage = el("div", { class: "stage" }, frame, emptyNote);

    new ResizeObserver(() => {
      const h = parseInt(frame.style.height, 10) || 0;
      if (h && h !== measuredHeight && (w.style === "grid" || w.style === "card")) { measuredHeight = h; refresh(); }
    }).observe(frame);

    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const url = widgetUrl(w);
        hint.textContent = WIDGET_STYLES[w.style].hint;
        code.value = url ? embedCode(url, w.style) : "Make a collection first, in the Walls tab.";
        if (url && frame.src !== url) frame.src = url;
        const fixed = ["marquee", "avatars", "badge"].includes(w.style);
        heightNote.textContent = fixed
          ? `If your website builder asks for a height, use ${widgetHeight(w)} pixels, on desktop and on mobile, and stretch the box to full width.`
          : `This style grows with its content. In this preview it's about ${widgetHeight(w)} pixels tall, and it will be taller on a phone. For long grids, linking to your Wall of Love usually works better.`;
        stage.classList.toggle("is-dark", w.bg === "111111");
        const c = data.collections.find((x) => x.id === w.collection);
        emptyNote.hidden = !c || selectFor(c).chosen.length > 0;
      }, 250);
    };
    const set = (key, value) => { w[key] = value; refresh(); };

    const selectBox = (key, label, opts) => el("label", {}, label,
      el("select", { onchange: (e) => { set(key, e.target.value); } }, ...opts.map(([v, text]) => el("option", { value: v, text, selected: w[key] === v }))));
    const tick = (key, label) => el("label", { class: "toggle" },
      el("input", { type: "checkbox", checked: w[key], onchange: (e) => set(key, e.target.checked) }), label);

    function paintOptions() {
      const parts = [];
      if (w.style === "marquee") {
        parts.push(selectBox("rows", "Rows", [["1", "1 row"], ["2", "2 rows"], ["3", "3 rows"], ["4", "4 rows"]]));
        parts.push(selectBox("speed", "Speed", [["slow", "Slow and dreamy"], ["medium", "Medium"], ["fast", "Fast"]]));
        parts.push(tick("names", "Show names after each quote"));
      }
      if (w.style === "avatars") {
        parts.push(selectBox("max", "How many faces", ["5", "8", "10", "12", "15", "20"].map((n) => [n, n])));
        parts.push(tick("caption", "Show the stars and count underneath"));
      }
      if (w.style === "grid") parts.push(selectBox("limit", "How many", [["3", "3"], ["6", "6"], ["9", "9"], ["12", "12"], ["0", "All of them"]]));
      if (w.style === "card") {
        const c = data.collections.find((x) => x.id === w.collection);
        const chosen = c ? selectFor(c).chosen : [];
        parts.push(selectBox("id", "Which testimonial", [["", "The first featured one (updates by itself)"], ...chosen.map((t) => [t.id, `${t.name}: ${(t.highlight || t.body).slice(0, 50)}`])]));
      }
      if (w.style === "grid" || w.style === "card") parts.push(tick("ratings", "Show stars"));
      const custom = el("input", { type: "color", value: w.bgCustom, "aria-label": "Custom background", onchange: (e) => { w.bgCustom = e.target.value.toUpperCase(); set("bg", "custom"); } });
      parts.push(el("label", {}, "Background",
        el("div", { class: "row" },
          el("select", { class: "grow", onchange: (e) => { set("bg", e.target.value); paintOptions(); } },
            ...[["transparent", "See-through (your page shows behind it)"], ["page", "Your page colour"], ["FFFFFF", "White"], ["111111", "Black"], ["custom", "Pick a colour"]]
              .map(([v, text]) => el("option", { value: v, text, selected: w.bg === v }))),
          w.bg === "custom" ? custom : null)));
      options.replaceChildren(...parts);
    }

    const styleChips = el("div", { class: "chips", role: "group", "aria-label": "Widget style" });
    const paintStyles = () => styleChips.replaceChildren(...Object.entries(WIDGET_STYLES).map(([key, { label }]) =>
      el("button", { class: `chip${w.style === key ? " is-on" : ""}`, "aria-pressed": String(w.style === key), text: label, onclick: () => { w.style = key; paintStyles(); paintOptions(); refresh(); } })));

    paintStyles(); paintOptions(); refresh();

    app.replaceChildren(
      topBar("Widgets"),
      el("main", { class: "wrap" },
        el("section", { class: "section" },
          el("h2", { text: "1. Pick a collection and a style" }),
          el("label", {}, "Collection",
            el("select", { onchange: (e) => { w.collection = e.target.value; w.id = ""; paintOptions(); refresh(); } },
              ...data.collections.map((c) => el("option", { value: c.id, text: c.name, selected: w.collection === c.id })))),
          styleChips, hint
        ),
        el("section", { class: "section" }, el("h2", { text: "2. Tweak it" }), options),
        el("section", { class: "section" }, el("h2", { text: "3. Preview" }), stage),
        el("section", { class: "section" },
          el("h2", { text: "4. Copy the code into your website" }),
          code, heightNote,
          el("div", { class: "row", style: "margin-top:10px" },
            el("button", { class: "primary", text: "Copy embed code", onclick: () => copy(code.value) })),
          el("p", { class: "muted", style: "font-size:14px;margin-bottom:0", text: "In your website builder, add an Embed Code or HTML element, paste this in and publish. Some builders show a blank box while you're editing. The widget comes to life on the published page, and updates by itself whenever you approve or edit testimonials." })
        )
      )
    );
    window.scrollTo({ top: 0 });
  }



  // ---------- Forms ----------

  const formUrl = (slug) => `${location.origin}/f/${slug}`;

  async function loadForms() {
    const { forms } = await api("forms");
    data.fullForms = forms;
    data.forms = forms.map(({ id, slug, title, questions }) => ({ id, slug, title, questions }));
    return forms;
  }

  async function renderForms() {
    leaveGuard = null;
    const forms = await loadForms(); // always fresh, in case a form changed elsewhere
    const count = (id) => data.testimonials.filter((t) => t.formId === id).length;
    const duplicate = async (f) => {
      try {
        const { form } = await api("forms", { method: "POST", body: { ...f, id: undefined, title: `${f.title} (copy)`, slug: `${f.slug}-copy` } });
        await loadForms();
        toast("Copied. Now make it your own ✓");
        location.hash = `#/forms/${form.id}`;
      } catch (e) { toast(e.message); }
    };
    app.replaceChildren(
      topBar("Forms", { extra: [el("button", { class: "primary", text: "+ New form", onclick: () => { location.hash = "#/forms/new"; } })] }),
      el("main", { class: "wrap" },
        el("p", { class: "lede", text: "One form per programme. Each one tags its testimonials automatically, so they land on the right walls. Add ?name=Their Name to a link to fill in their name for them." }),
        el("div", { class: "list" }, ...forms.map((f) => el("article", { class: "card" },
          el("div", { class: "card-top" },
            el("div", { class: "who" }, el("strong", { text: f.title }), el("span", { text: `/f/${f.slug}` })),
            el("span", { class: "pill", text: `${count(f.id)} received` })),
          el("div", { class: "meta" }, ...(f.tags.length ? f.tags.map((tag) => el("span", { class: "pill", text: `#${tag}` })) : [el("span", { class: "muted", text: "No tags" })])),
          el("div", { class: "card-actions" },
            el("a", { class: "btn primary", href: `/f/${f.slug}`, target: "_blank", rel: "noopener", text: "Open" }),
            el("button", { text: "Copy link", onclick: () => copy(formUrl(f.slug)) }),
            el("button", { text: "Duplicate", onclick: () => duplicate(f) }),
            el("div", { class: "grow" }, el("button", { text: "Edit", onclick: () => { location.hash = `#/forms/${f.id}`; } })))
        )))
      )
    );
  }

  async function renderForm(id) {
    const isNew = id === "new";
    const forms = data.fullForms || await loadForms();
    const existing = forms.find((f) => f.id === id);
    if (!isNew && !existing) { location.hash = "#/forms"; return; }
    const f = structuredClone(existing || {
      title: "", slug: "", intro: "This takes about three minutes. Thank you for sharing your words.",
      ratingPrompt: "First things first. How many stars would you give it?",
      questions: [
        { prompt: "Where were you before?", helper: "What was going on for you?", required: true },
        { prompt: "What changed for you?", helper: "Big shifts, small wins, anything that surprised you.", required: true },
        { prompt: "What would you tell a friend thinking about joining?", helper: "Say it the way you would over a coffee.", required: false },
      ],
      tags: [], thankYou: { heading: "Thank you", message: "Your testimonial has landed safely.", linkLabel: "", linkUrl: "" },
    });
    let dirty = false;
    let slugTouched = !isNew;
    const touch = () => { dirty = true; };
    leaveGuard = () => !dirty || confirm("You have unsaved changes. Leave without saving?");

    const input = (value, oninput, attrs = {}) => {
      const node = el(attrs.multiline ? "textarea" : "input", { type: "text", value: value || "", placeholder: attrs.placeholder || false });
      if (attrs.multiline) node.style.minHeight = "70px";
      node.addEventListener("input", () => { oninput(node.value); touch(); });
      return node;
    };
    const labelled = (label, hint, node) => el("label", {}, label, hint ? el("small", { text: hint }) : null, node);

    const slugInput = input(f.slug, (v) => { slugTouched = true; f.slug = slugify(v); paintLink(); }, { placeholder: "coaching" });
    const linkHint = el("small", { class: "muted" });
    const paintLink = () => { linkHint.textContent = f.slug ? formUrl(f.slug) : "Your link appears here"; };
    const titleInput = input(f.title, (v) => { f.title = v; if (!slugTouched) { f.slug = slugify(v); slugInput.value = f.slug; paintLink(); } }, { placeholder: "How was the programme for you?" });
    slugInput.addEventListener("blur", () => { slugInput.value = f.slug; });
    paintLink();

    // Star rating question, which a form can switch off
    const ratingField = labelled("Star rating question", "", input(f.ratingPrompt, (v) => { f.ratingPrompt = v; }));
    ratingField.hidden = f.askRating === false;
    const askRatingToggle = el("label", { class: "toggle" },
      el("input", { type: "checkbox", checked: f.askRating !== false, onchange: (e) => { f.askRating = e.target.checked; ratingField.hidden = !e.target.checked; touch(); } }),
      "Ask for a star rating");

    // Questions
    const qBox = el("div", {});
    function paintQuestions() {
      qBox.replaceChildren(...f.questions.map((q, i) => el("div", { class: "qcard" },
        el("div", { class: "row" },
          el("strong", { class: "grow", text: `Question ${i + 1}` }),
          el("button", { class: "icon", "aria-label": "Move up", text: "↑", disabled: i === 0, onclick: () => { [f.questions[i - 1], f.questions[i]] = [f.questions[i], f.questions[i - 1]]; touch(); paintQuestions(); } }),
          el("button", { class: "icon", "aria-label": "Move down", text: "↓", disabled: i === f.questions.length - 1, onclick: () => { [f.questions[i + 1], f.questions[i]] = [f.questions[i], f.questions[i + 1]]; touch(); paintQuestions(); } }),
          el("button", { class: "icon hide", "aria-label": "Remove question", text: "✕", disabled: f.questions.length === 1, onclick: () => { f.questions.splice(i, 1); touch(); paintQuestions(); } })),
        labelled("The question", "", input(q.prompt, (v) => { q.prompt = v; })),
        labelled("Little helper underneath", "", input(q.helper, (v) => { q.helper = v; })),
        el("label", { class: "toggle" }, el("input", { type: "checkbox", checked: q.required, onchange: (e) => { q.required = e.target.checked; touch(); } }), "They must answer this one")
      )));
    }
    paintQuestions();
    const addQuestion = el("button", { text: "+ Add a question", onclick: () => {
      if (f.questions.length >= 10) return toast("Ten questions is plenty.");
      f.questions.push({ prompt: "", helper: "", required: false }); touch(); paintQuestions();
    } });

    // Tags
    const tagList = el("div", { class: "tag-list" });
    const paintTags = () => tagList.replaceChildren(...(f.tags.length
      ? f.tags.map((tag) => el("span", { class: "chip" }, `#${tag}`, el("button", { class: "link", "aria-label": `Remove ${tag}`, text: "✕", onclick: () => { f.tags = f.tags.filter((x) => x !== tag); touch(); paintTags(); } })))
      : [el("span", { class: "muted", text: "No tags yet. Add the tag your wall looks for, like coaching." })]));
    paintTags();
    const tagInput = el("input", { type: "text", list: "form-tags", placeholder: "Add a tag", "aria-label": "Add a tag" });
    const addTag = () => {
      const tag = tagSlug(tagInput.value);
      if (tag && !f.tags.includes(tag)) { f.tags.push(tag); touch(); paintTags(); }
      tagInput.value = "";
    };
    tagInput.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } });
    tagInput.addEventListener("change", addTag);

    // Phone preview of the saved form
    const frame = el("iframe", { class: "phone", title: "Form preview", src: !isNew ? `/f/${existing.slug}` : "about:blank" });

    const save = el("button", { class: "primary", text: isNew ? "Create form" : "Save changes", onclick: async () => {
      if (!f.title.trim()) return toast("Give your form a title first.");
      save.disabled = true;
      try {
        const body = { ...f, questions: f.questions.filter((q) => q.prompt.trim()) };
        const { form } = await api(isNew ? "forms" : `forms/${existing.id}`, { method: isNew ? "POST" : "PUT", body });
        await loadForms();
        dirty = false;
        toast(isNew ? "Your form is live ✓" : "Saved ✓");
        if (isNew) location.hash = `#/forms/${form.id}`;
        else frame.src = `/f/${form.slug}?t=${Date.now()}`;
      } catch (e) {
        toast(e.message);
      } finally {
        save.disabled = false;
      }
    } });
    const remove = !isNew ? el("button", { class: "hide", text: "Delete", onclick: async () => {
      if (!confirm(`Delete "${f.title}"? The link /f/${existing.slug} will stop working. Testimonials already received stay safe.`)) return;
      try {
        await api(`forms/${existing.id}`, { method: "DELETE" });
        await loadForms();
        dirty = false;
        toast("Form deleted");
        location.hash = "#/forms";
      } catch (e) { toast(e.message); }
    } }) : null;

    app.replaceChildren(
      topBar(isNew ? "New form" : "Edit form", { back: true, backTo: "#/forms",
        extra: !isNew ? [el("button", { text: "Copy link", onclick: () => copy(formUrl(existing.slug)) })] : [] }),
      el("main", { class: "wrap" },
        el("section", { class: "section" },
          el("h2", { text: "The basics" }),
          labelled("Title", "The big headline on the first screen.", titleInput),
          labelled("Link name", "Lowercase words joined with hyphens.", slugInput), linkHint,
          labelled("Welcome words", "Leave a blank line for a new paragraph. Start a line with - for a bullet.", input(f.intro, (v) => { f.intro = v; }, { multiline: true })),
          askRatingToggle,
          ratingField
        ),
        el("section", { class: "section" },
          el("h2", { text: "Questions" }),
          el("p", { class: "muted", style: "margin:0", text: "One question per screen. Three good questions beat six okay ones." }),
          qBox, addQuestion
        ),
        el("section", { class: "section" },
          el("h2", { text: "Tags" }),
          el("p", { class: "muted", style: "margin:0", text: "Added to every testimonial from this form, so it lands on the right walls." }),
          tagList,
          el("div", { class: "row", style: "margin-top:8px" }, el("div", { class: "grow" }, tagInput), el("button", { text: "Add", onclick: addTag })),
          el("datalist", { id: "form-tags" }, ...data.tags.map((tag) => el("option", { value: tag })))
        ),
        el("section", { class: "section" },
          el("h2", { text: "Thank-you screen" }),
          labelled("Heading", "", input(f.thankYou.heading, (v) => { f.thankYou.heading = v; })),
          labelled("Message", "", input(f.thankYou.message, (v) => { f.thankYou.message = v; }, { multiline: true })),
          labelled("Button words", "Optional, for example Follow me on Instagram.", input(f.thankYou.linkLabel, (v) => { f.thankYou.linkLabel = v; })),
          labelled("Button link", "Optional. Starts with https://", input(f.thankYou.linkUrl, (v) => { f.thankYou.linkUrl = v; }))
        ),
        !isNew ? el("section", { class: "section" },
          el("h2", { text: "Preview" }),
          el("p", { class: "muted", style: "margin:0 0 12px", text: "This is the saved version, on a phone-sized screen. Save to see your changes. It's a real form, so anything you send from here arrives in your inbox." }),
          el("div", { class: "phone-wrap" }, frame)) : null
      ),
      el("div", { class: "savebar" }, el("div", { class: "inner" }, remove, save))
    );
    window.scrollTo({ top: 0 });
  }

  // ---------- Your data (import and export) ----------

  // Reads CSV, including quoted cells with commas and line breaks inside.
  function parseCSV(textIn) {
    const textSrc = textIn.replace(/^﻿/, "");
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < textSrc.length; i++) {
      const ch = textSrc[i];
      if (quoted) {
        if (ch === '"' && textSrc[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && textSrc[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const [header = [], ...body] = rows.filter((r) => r.some((c) => c.trim()));
    return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
  }

  function readRecords(fileText, fileName) {
    if (/\.json$/i.test(fileName) || /^\s*[[{]/.test(fileText)) {
      const parsed = JSON.parse(fileText);
      const list = Array.isArray(parsed) ? parsed : parsed.testimonials || parsed.data || [];
      return list.filter((x) => x && typeof x === "object");
    }
    return parseCSV(fileText);
  }

  const IMPORT_FIELDS = [
    ["name", "Name", ["customer_name", "name", "customer name", "full name", "endorser name", "author"], true],
    ["text", "Testimonial text", ["text", "testimonial", "review", "content", "message", "body"], true],
    ["email", "Email (stays private)", ["customer_email", "email", "customer email", "email address"]],
    ["role", "Role or tagline", ["customer_tagline", "tagline", "role", "job title", "title", "position", "headline"]],
    ["company", "Company", ["customer_company", "company", "organisation", "organization"]],
    ["website", "Website or Instagram", ["customer_url", "website", "customer url", "link"]],
    ["avatarUrl", "Photo link", ["customer_avatar", "avatar", "user photo", "photo", "profile picture", "picture"]],
    ["rating", "Star rating", ["rating", "stars", "score"]],
    ["date", "Date", ["date", "created_at", "created at", "created", "submitted at", "submitted"]],
    ["tags", "Tags", ["tags", "tag", "labels"]],
    ["approved", "Approved or published", ["approved", "status", "published"]],
    ["form", "Which form it came from", ["form_id", "form", "form name", "form id", "source form"]],
    ["images", "Extra images", ["media", "images", "attachments"]],
    ["type", "Type (text or video)", ["type", "testimonial type"]],
    ["sourceId", "Original ID", ["id", "testimonial id", "testimonial_id", "uuid"]],
  ];
  const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  function guessColumns(headers) {
    const map = {};
    const byNorm = new Map(headers.map((h) => [norm(h), h]));
    for (const [key, , synonyms] of IMPORT_FIELDS) {
      const hit = synonyms.map(norm).find((syn) => byNorm.has(syn));
      map[key] = hit ? byNorm.get(hit) : "";
    }
    return map;
  }

  const asList = (v) => {
    if (Array.isArray(v)) return v.map((x) => (typeof x === "object" && x ? x.url || x.src || x.name || "" : String(x))).filter(Boolean);
    if (v == null || v === "") return [];
    const str = String(v).trim();
    if (str.startsWith("[")) { try { return asList(JSON.parse(str)); } catch {} }
    return str.split(/\s*[,;|]\s*/).filter(Boolean);
  };
  const asBool = (v) => {
    if (v === true || v === false) return v;
    const str = String(v ?? "").trim().toLowerCase();
    if (["true", "yes", "1", "approved", "published", "public"].includes(str)) return true;
    if (["false", "no", "0", "pending", "unapproved", "draft", "hidden", "rejected"].includes(str)) return false;
    return null;
  };
  const cellOf = (record, column) => (column ? record[column] : undefined);

  function normalise(record, map, formTags, extraTags) {
    const get = (key) => cellOf(record, map[key]);
    const role = [String(get("role") ?? "").trim(), String(get("company") ?? "").trim()].filter(Boolean);
    const formValue = String(get("form") ?? "").trim();
    return {
      sourceId: String(get("sourceId") ?? ""),
      name: String(get("name") ?? "").trim(),
      text: String(get("text") ?? ""),
      email: String(get("email") ?? "").trim(),
      role: [...new Set(role)].join(", "),
      website: String(get("website") ?? "").trim(),
      avatarUrl: String(get("avatarUrl") ?? "").trim(),
      rating: get("rating") === "" ? null : get("rating"),
      date: String(get("date") ?? ""),
      tags: [...asList(get("tags")), ...(formValue && formTags[formValue] ? [formTags[formValue]] : []), ...extraTags],
      approved: asBool(get("approved")),
      images: asList(get("images")),
      type: String(get("type") ?? "").toLowerCase(),
    };
  }

  const suggestTag = (value) => tagSlug(value.replace(/\bform\b/gi, ""));

  // ---------- Shrinking imported photos ----------
  // Imported photos are often full-size phone pictures. The browser crops each
  // to a centred square and shrinks it to 400 pixels, about 50 KB, so walls
  // and widgets stay quick.
  const SMALL_PHOTO_BYTES = 300 * 1024;

  async function shrinkPhoto(blob) {
    const bitmap = await createImageBitmap(blob);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 400;
    canvas.getContext("2d").drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 400, 400);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function tidyPhotos(onProgress = () => {}) {
    const candidates = data.testimonials.filter((t) => t.source === "import" && (t.import?.photoPending || t.avatar));
    const outcome = { shrunk: 0, failed: [] };
    let done = 0;
    const work = async (t) => {
      try {
        const source = t.import?.photoPending ? `/api/admin/import/photo-source?id=${t.id}` : `/api/avatar/${t.avatar}`;
        const res = await fetch(source, { credentials: "same-origin" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `status ${res.status}`);
        const blob = await res.blob();
        if (!t.import?.photoPending && blob.size <= SMALL_PHOTO_BYTES) return;
        const { testimonial } = await api("import/photo", { method: "POST", body: { id: t.id, avatar: await shrinkPhoto(blob) } });
        Object.assign(t, testimonial);
        outcome.shrunk++;
      } catch (e) {
        outcome.failed.push(`${t.name}: ${e.message}`);
      } finally {
        onProgress(++done, candidates.length);
      }
    };
    const queue = [...candidates];
    await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await work(queue.shift()); }));
    return outcome;
  }

  function renderData() {
    leaveGuard = null;
    const state = { records: [], headers: [], map: {}, formTags: {}, extra: "", source: "Senja", fileName: "" };
    const stepFile = el("section", { class: "section" });
    const stepMatch = el("section", { class: "section", hidden: true });
    const stepRun = el("section", { class: "section", hidden: true });

    const fileInput = el("input", { type: "file", accept: ".csv,.json,text/csv,application/json", onchange: async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        state.records = readRecords(await file.text(), file.name);
      } catch (e) {
        return toast("Couldn't read that file. Is it a CSV or JSON export?");
      }
      if (!state.records.length) return toast("That file has no testimonials in it.");
      state.fileName = file.name;
      state.headers = [...new Set(state.records.flatMap((r) => Object.keys(r)))];
      state.map = guessColumns(state.headers);
      paintMatch();
      stepMatch.hidden = false;
      stepMatch.scrollIntoView({ behavior: "smooth" });
    } });

    stepFile.append(
      el("h2", { text: "Import testimonials" }),
      el("p", { class: "muted", style: "margin:0 0 12px", text: "Bring in testimonials from Senja or anywhere else. In Senja, open Testimonials, tap the three dots and choose Export all to CSV. Then pick that file here." }),
      labelledInput("Where they're from", el("input", { type: "text", value: state.source, oninput: (e) => { state.source = e.target.value; } })),
      el("label", {}, "The export file", fileInput)
    );

    function labelledInput(label, node) { return el("label", {}, label, node); }

    function photoSection() {
      const status = el("p", { class: "muted", style: "margin:10px 0 0" });
      const button = el("button", { text: "Shrink big photos", onclick: async () => {
        button.disabled = true;
        const result = await tidyPhotos((d, n) => { status.textContent = `Checking photos: ${d} of ${n}`; });
        if (result.shrunk) await api("import/finish", { method: "POST", body: {} }).catch(() => {});
        await loadAll();
        status.textContent = `Done. ${result.shrunk} photo${result.shrunk === 1 ? "" : "s"} shrunk.${result.failed.length ? ` ${result.failed.length} had a problem: ${result.failed.join("; ")}` : ""}`;
        button.disabled = false;
      } });
      return el("section", { class: "section" },
        el("h2", { text: "Imported photos" }),
        el("p", { class: "muted", style: "margin:0 0 12px", text: "Shrinks any big imported photo to a neat 400 pixel square, and fetches any that were too big to copy first time. Safe to run as often as you like." }),
        button, status);
    }

    function preview() {
      const extraTags = state.extra.split(",").map(tagSlug).filter(Boolean);
      return state.records.map((r) => normalise(r, state.map, state.formTags, extraTags));
    }

    function paintMatch() {
      const formColumn = state.map.form;
      const formValues = formColumn ? [...new Set(state.records.map((r) => String(r[formColumn] ?? "").trim()).filter(Boolean))] : [];
      for (const v of formValues) if (!(v in state.formTags)) state.formTags[v] = suggestTag(v);

      const rows = preview();
      const approved = rows.filter((r) => r.approved !== false).length;
      const noText = rows.filter((r) => !r.text.replace(/<[^>]+>/g, "").trim()).length;
      const withPhoto = rows.filter((r) => r.avatarUrl).length;

      const selects = IMPORT_FIELDS.map(([key, label, , required]) => el("label", {}, `${label}${required ? " *" : ""}`,
        el("select", { onchange: (e) => { state.map[key] = e.target.value; paintMatch(); } },
          el("option", { value: "", text: "(not in this file)" }),
          ...state.headers.map((h) => el("option", { value: h, text: h, selected: state.map[key] === h })))));

      const sample = rows.slice(0, 3).map((r) => el("article", { class: "card" },
        el("div", { class: "card-top" },
          r.avatarUrl ? el("img", { class: "avatar", src: r.avatarUrl, alt: "" }) : el("span", { class: "avatar", text: initials(r.name || "?") }),
          el("div", { class: "who" }, el("strong", { text: r.name || "(no name)" }), el("span", { text: r.role || "" })),
          stars(Number.parseInt(r.rating, 10) || 0)),
        el("p", { class: "snippet", text: r.text.replace(/<[^>]+>/g, "").slice(0, 220) || "(no text)" }),
        el("div", { class: "meta" },
          el("span", { class: `pill ${r.approved === false ? "pending" : "approved"}`, text: r.approved === false ? "Will arrive as waiting" : "Will arrive approved" }),
          ...r.tags.map((tag) => el("span", { class: "pill", text: `#${tagSlug(tag)}` })),
          el("span", { class: "muted", text: r.date ? r.date.slice(0, 10) : "no date" }))));

      stepMatch.replaceChildren(
        el("h2", { text: "Check the columns" }),
        el("p", { class: "muted", style: "margin:0", text: `Found ${rows.length} testimonials in ${state.fileName}. ${approved} are approved, ${withPhoto} have a photo${noText ? `, and ${noText} have no text (probably videos), which will be skipped` : ""}. I've matched the columns as best I can. Change any that look wrong.` }),
        el("div", { class: "filters" }, el("div", { class: "grid" }, ...selects)),
        formValues.length ? el("div", {},
          el("h2", { text: "Tag by form" }),
          el("p", { class: "muted", style: "margin:0", text: "Each form becomes a tag, so your walls know which programme a testimonial belongs to. Edit the tag names if you like." }),
          ...formValues.map((v) => {
            const from = state.records.filter((r) => String(r[formColumn] ?? "").trim() === v);
            const names = from.slice(0, 3).map((r) => String(r[state.map.name] ?? "").trim()).filter(Boolean).join(", ");
            return el("label", {}, v,
              el("small", { text: `${from.length} testimonial${from.length === 1 ? "" : "s"}${names ? `, like ${names}` : ""}` }),
              el("input", { type: "text", value: state.formTags[v], placeholder: "leave empty for no tag",
                oninput: (e) => { state.formTags[v] = tagSlug(e.target.value); }, onchange: paintMatch }));
          })) : null,
        el("label", {}, "Add these tags to every testimonial", el("small", { text: "Optional. Separate with commas." }),
          el("input", { type: "text", value: state.extra, placeholder: "senja-import", oninput: (e) => { state.extra = e.target.value; }, onchange: paintMatch })),
        el("h2", { text: "Preview" }),
        el("div", { class: "list" }, ...sample),
        el("div", { class: "row", style: "margin-top:16px" },
          el("button", { class: "primary", text: `Import ${rows.length} testimonials`, disabled: !state.map.name || !state.map.text, onclick: runImport }))
      );
    }

    async function runImport() {
      const rows = preview();
      const bar = el("div", { class: "progress-track" }, el("div", { class: "progress-fill" }));
      const status = el("p", { class: "muted", text: "Starting…" });
      stepRun.hidden = false;
      stepRun.replaceChildren(el("h2", { text: "Importing" }), el("p", { class: "muted", style: "margin:0 0 10px", text: "Keep this page open. Each photo gets copied into your own storage, so it takes a little while." }), bar, status);
      stepRun.scrollIntoView({ behavior: "smooth" });
      stepMatch.querySelectorAll("button, select, input").forEach((x) => { x.disabled = true; });

      const results = [];
      const size = 5;
      for (let i = 0; i < rows.length; i += size) {
        const batch = rows.slice(i, i + size);
        let attempt = 0;
        while (true) {
          try {
            const { results: got } = await api("import", { method: "POST", body: { rows: batch, source: state.source } });
            results.push(...got);
            break;
          } catch (e) {
            if (++attempt >= 3) { batch.forEach((r) => results.push({ status: "skipped", name: r.name, reason: `Couldn't reach the server: ${e.message}` })); break; }
            await new Promise((r) => setTimeout(r, 1500 * attempt));
          }
        }
        const done = Math.min(rows.length, i + size);
        bar.firstChild.style.width = `${(done / rows.length) * 100}%`;
        status.textContent = `${done} of ${rows.length} done`;
      }
      await loadAll();
      const photos = await tidyPhotos((d, n) => {
        bar.firstChild.style.width = `${(d / Math.max(n, 1)) * 100}%`;
        status.textContent = `Shrinking photos so your pages load fast: ${d} of ${n}`;
      });
      status.textContent = "Rebuilding your walls…";
      await api("import/finish", { method: "POST", body: {} }).catch(() => toast("Imported, but the walls didn't refresh. Approve or edit anything to refresh them."));
      await loadAll();
      report(results, photos);
    }

    function report(results, photos = { shrunk: 0, failed: [] }) {
      const imported = results.filter((r) => r.status === "imported");
      const existing = results.filter((r) => r.status === "existing");
      const skipped = results.filter((r) => r.status === "skipped");
      const noted = imported.filter((r) => r.notes?.length);
      const importedIds = new Set(imported.concat(existing).map((r) => r.id));
      const tagCounts = {};
      data.testimonials.filter((t) => importedIds.has(t.id)).forEach((t) => (t.tags || []).forEach((tag) => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; }));
      const approvedNow = data.testimonials.filter((t) => importedIds.has(t.id) && t.status === "approved").length;

      const reportText = [
        `Import from ${state.source}, ${new Date().toLocaleString("en-GB")}`,
        `Rows in file: ${results.length}`, `Imported: ${imported.length}`, `Already here: ${existing.length}`, `Skipped: ${skipped.length}`, `Photos shrunk: ${photos.shrunk}`,
        ...photos.failed.map((f) => `  Photo problem, ${f}`),
        ...skipped.map((r) => `  Skipped ${r.name || "(no name)"}: ${r.reason}`),
        ...noted.flatMap((r) => r.notes.map((n) => `  ${r.name}: ${n}`)),
      ].join("\n");

      const hasWall = (tag) => data.collections.some((c) => c.rule.tags.includes(tag));
      const makeWall = async (tag, button) => {
        button.disabled = true;
        try {
          const name = tag.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
          const { collection } = await api("collections", { method: "POST", body: { name, slug: tag, rule: { tags: [tag], match: "any" } } });
          data.collections.push(collection);
          button.replaceWith(el("a", { class: "btn", href: `/wall/${collection.slug}`, target: "_blank", rel: "noopener", text: "Open wall" }));
        } catch (e) { toast(e.message); button.disabled = false; }
      };

      stepRun.replaceChildren(...[
        el("h2", { text: "All done ✓" }),
        el("dl", { class: "facts" },
          el("dt", { text: "Rows in the file" }), el("dd", { text: String(results.length) }),
          el("dt", { text: "Imported" }), el("dd", { text: String(imported.length) }),
          el("dt", { text: "Already here" }), el("dd", { text: String(existing.length) }),
          el("dt", { text: "Skipped" }), el("dd", { text: String(skipped.length) }),
          el("dt", { text: "Approved now" }), el("dd", { text: `${approvedNow} (check this against your old badge)` }),
          el("dt", { text: "Photos shrunk" }), el("dd", { text: String(photos.shrunk) })),
        skipped.length ? el("div", {}, el("h2", { text: "Skipped, and why" }), ...skipped.map((r) => el("p", { class: "warn", text: `${r.name || "(no name)"}: ${r.reason}` }))) : null,
        noted.length || photos.failed.length ? el("div", {}, el("h2", { text: "Worth a look" }),
          ...noted.flatMap((r) => r.notes.map((n) => el("p", { class: "warn", text: `${r.name}: ${n}` }))),
          ...photos.failed.map((f) => el("p", { class: "warn", text: `Photo problem, ${f}` }))) : null,
        Object.keys(tagCounts).length ? el("div", {},
          el("h2", { text: "Tags in this import" }),
          ...Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, n]) => {
            const button = el("button", { text: "Make a wall", onclick: () => makeWall(tag, button) });
            return el("div", { class: "row", style: "margin-top:8px" }, el("span", { class: "grow", text: `#${tag} (${n})` }), hasWall(tag) ? el("span", { class: "pill approved", text: "Has a wall" }) : button);
          })) : null,
        el("div", { class: "row", style: "margin-top:16px" },
          el("button", { text: "Copy this report", onclick: () => copy(reportText) }),
          el("a", { class: "btn primary", href: "#/", text: "Go to the inbox" })),
      ].filter(Boolean));
    }

    app.replaceChildren(
      topBar("Spreadsheets and backups", { back: true, backTo: "#/import" }),
      el("main", { class: "wrap" },
        stepFile, stepMatch, stepRun,
        photoSection(),
        el("section", { class: "section" },
          el("h2", { text: "Download everything" }),
          el("p", { class: "muted", style: "margin:0 0 12px", text: "Your testimonials are yours. Download a full copy whenever you like. The JSON file has everything, the CSV opens in Excel or Google Sheets." }),
          el("div", { class: "row" },
            el("a", { class: "btn", href: "/api/admin/export?format=json", download: "", text: "Download JSON" }),
            el("a", { class: "btn", href: "/api/admin/export?format=csv", download: "", text: "Download CSV" })))
      )
    );
    window.scrollTo({ top: 0 });
  }


  // ---------- Guide ----------
  // The one-page "how to use it" note, so nobody needs to ask how a feature works.

  const GUIDE = [
    ["Your week in two minutes", [
      "New testimonials land in the Inbox, marked Waiting. Nothing goes public until you approve it.",
      "Tap Approve on the good ones. Tap Hide on anything you don't want to use. Made a mistake? Tap Undo in the little pop-up.",
      "For your favourites, tap Edit, select their best sentence and tap \"Use the text I've selected above\". That becomes the highlight in the scrolling marquee.",
      "That's it. Your walls and the widgets on your website update by themselves within a moment.",
    ]],
    ["Collecting testimonials (Forms)", [
      "Each programme has its own form. Open the Forms tab, tap Copy link and send it by WhatsApp or email.",
      "Add ?name= and their name to the end of the link to fill it in for them, for example /f/share?name=Ye.",
      "Each form adds its own tags, so testimonials land on the right walls without you lifting a finger.",
      "Running something new, like a retreat? Tap Duplicate on any form, change the title, questions and tags, then Save.",
      "The preview at the bottom of each form is real. Anything you send from it arrives in your Inbox, so hide your test ones afterwards.",
    ]],
    ["Email alerts", [
      "Every new testimonial sends you an email with their name, the programme, their stars, the first few lines and a link straight to it in your admin.",
      "The emails come from Netlify. To switch them on or change the address, go to Netlify, then Forms, then Form notifications, and look for the new-testimonial form.",
      "No email? Check your spam folder, then Netlify's Forms screen, which keeps a list of every alert it sent, including any it thought was spam.",
      "Alerts never include the person's email address, and a missed alert never loses a testimonial. It's always in your Inbox.",
    ]],
    ["The Inbox", [
      "Waiting ones sit at the top with a count. Use the chips and filters to find anything by status, tag, form, stars or featured, or just search.",
      "Edit lets you fix typos, change the name or role, add tags, mark it Featured (it shows first on walls) and swap or remove the photo.",
      "If someone said no to showing their name, walls show their initials instead. If they said no to their photo, it stays private. You'll see a yellow heads-up when that applies. You can't override it, and that's on purpose.",
      "Hide is always safe. It takes a testimonial off every wall and widget, and you can bring it back any time.",
      "Need it gone completely, like a test entry or someone asking to be removed? Hide it and save, then open it again and use Delete for good at the bottom. You type DELETE to confirm. It removes their words and photo for good, and an old Senja import won't bring it back.",
    ]],
    ["AI helpers", [
      "Suggest highlights. When approved testimonials have no highlight, the Inbox offers Suggest highlights. The AI picks the best lines, word for word, and you tap the one you like. Nothing changes until you tap.",
      "It works through a few testimonials at a time. When you've picked or skipped them all, the next few load by themselves, or tap Show more at the bottom.",
      "Changed your mind about a highlight? Open the testimonial with Edit, clear the Highlight box (or type a new one), then Save changes. With no highlight, widgets use a line from the testimonial instead.",
      "On any Edit screen, ✨ Suggest a highlight gives you up to three options for that testimonial. Tap one, then Save changes.",
      "Themes. Tap ✨ Find my themes in the Inbox and the AI reads everything and names what people talk about most, like Clarity and direction. Tap a theme to see just those testimonials.",
      "New testimonials get sorted into your themes by themselves when you open the Inbox. Tap Find themes again now and then, to refresh the list as more come in.",
      "Themes are just for you in the admin. They never show on your walls or widgets.",
      "It runs on Netlify's built-in AI, paid from your Netlify credits. A full run over all your testimonials costs pennies. To see your credits, go to Netlify, then Usage & billing.",
      "If it says the AI isn't switched on, open a Claude chat and paste a screenshot.",
    ]],
    ["Voice of Customer", [
      "Find it in the side panel, under Analyse. It shows what your clients say, in their own words, ready for your copy.",
      "Themes shows the big picture. How many testimonials you have, your top theme, and a card for each theme with a telling quote and the faces behind it. Tap a card to see every testimonial in that theme.",
      "Reports lets the AI write you a summary. First choose who it covers, all your testimonials or just one form, tag or theme. Then tap a report, like Life before you or Words they use.",
      "Every point comes with real quotes, checked word for word against what clients wrote. Tap a name to open that testimonial.",
      "Ask anything lets you type your own question, like \"Why do people choose to work with me?\" or \"What nearly stopped people signing up?\"",
      "Copy puts the whole report on your clipboard, ready for a sales page, email or caption. Reports are saved under Recent reports, so you don't need to run them twice.",
      "Each report costs a few credits, so pennies. Run as many as you like.",
    ]],
    ["Share cards for Instagram", [
      "Tap Share card on any approved testimonial in the Inbox, or Make a share card on its Edit screen.",
      "Pick a size. Square or tall for a feed post, Story for stories. Then pick a background from your brand colours.",
      "The card starts with the highlight. Trim the words to make them punchier. That only changes the image, never the testimonial itself.",
      "On your phone, tap Share and choose Instagram, or Save image to keep it in your photos for later.",
      "The line under the card is remembered on each phone or computer, so you only type it once per device.",
      "Consent still counts. If someone said no to their name or photo, the card uses their initials.",
    ]],
    ["Walls of Love (Walls)", [
      "A wall is a group of approved testimonials chosen by tag. Each one has its own public page at /wall/its-name. Tap Copy link to share it.",
      "\"Any of these tags\" means a testimonial needs just one of them. \"All of these tags\" means it needs every one.",
      "Pin keeps a testimonial on a wall whatever its tags. Leave off removes it from that wall only.",
      "Change the order with the Order menu. Pick \"My own order\" to use the up and down arrows.",
      "Wall words lets you change the small label, the headline and the line underneath.",
      "A wall with no tags at all shows every approved testimonial. That's your /wall/love page.",
    ]],
    ["Widgets on your website (Widgets)", [
      "Pick a wall and a style, tweak it, watch the preview, then tap Copy embed code.",
      "In your website builder, add an Embed Code or HTML element, paste the code in and stretch it to full width. If it asks for a height, use the number the Widgets tab shows you.",
      "Heights to remember. Marquee 68 for one row, 136 for two, 204 for three, 272 for four. Avatar strip 104. Rating badge 76. Grid and single card grow with their words.",
      "Some website builders show a blank box while you're editing. That's normal. Widgets come to life on the published page.",
      "You never need to touch your website again to update them. Approving, hiding or editing a testimonial updates every widget by itself.",
    ]],
    ["Import", [
      "Find it in the side panel, under Collect. It gathers every way to bring testimonials in.",
      "From a screenshot. Upload a screenshot of a WhatsApp chat, Instagram DM, email or review. The AI fills in their name and words, and you check it before saving. The screenshot isn't kept.",
      "Add one by hand. Paste their words, add their name, photo, stars and the date you received it. Pick a programme to add its tags, so it lands on the right walls.",
      "You'll be asked to confirm you have their permission. Untick Show their name if they'd rather appear as initials.",
      "Upload a spreadsheet or Move from Senja bring in lots at once. Running the same file twice never makes doubles.",
    ]],
    ["Spreadsheets and backups", [
      "Download JSON is a full backup of everything. Download CSV opens in Excel or Google Sheets. A backup once a month is a good habit.",
      "Shrink big photos tidies any oversized imported photo into a neat square so your pages stay fast. Safe to tap any time.",
    ]],
    ["Settings", [
      "Your brand name, website, colours and fonts live here. Change them and every wall, widget and form follows.",
      "Style gives you five ready-made looks: Neutral, Editorial, Soft and warm, Colourful, and Bold and playful. Tap one to fill in all the colours and fonts, then tweak anything you like.",
      "The Preview has four tabs: Wall of Love, Form, Widgets and Share card. Each shows your real pages with your choices and updates as you go. Nothing changes for your clients until you tap Save settings.",
      "The form in the preview is just for looking. You can tap through it, but nothing gets sent.",
      "Colours are codes like #FAED23. Fonts are names from Google Fonts, spelt exactly as Google spells them.",
      "The consent questions are what people answer on the last screen of each form. Each testimonial keeps a copy of the exact words they saw.",
    ]],
    ["Updates", [
      "Kiitos gets better over time, and every update is included. When a newer version is out, a note appears at the top of your Inbox saying which version is ready and which one you're on.",
      "Tap See what's new on that note to read what changed before you decide.",
      "To update, open Netlify and click your Kiitos site. Go to Deploys, tap Trigger deploy, then Deploy project.",
      "Wait a minute or two until the newest deploy at the top of the list says Published. Then come back here and refresh. The note in your Inbox disappears once you're up to date.",
      "Updating never touches your testimonials, forms, walls, widgets or settings. Those are stored separately from the app, so your website embeds keep working as they are.",
      "Each update is one deploy, which uses a few of your Netlify credits. That's why updates wait for you rather than happening by themselves.",
      "No rush. Your Kiitos keeps working on the version it has until you choose to update. Skipped a few? One update brings you straight to the newest.",
      "Not sure it worked? In Netlify, open the newest deploy and look at its log for a line starting [Kiitos update]. It says which version you moved to, or that you're already up to date.",
      "If an update can't be fetched, nothing breaks. Kiitos simply carries on with the version you already have, and you can try again later.",
    ]],
    ["Handy to know", [
      "Your admin lives at /admin. You stay logged in on each device for two weeks.",
      "To change your password, go to Netlify, then Environment variables, then ADMIN_PASSWORD, then trigger a deploy. Every device gets logged out.",
      "Five wrong passwords in a row lock the login for 15 minutes. Make a cup of tea and try again.",
      "Your copy of Kiitos also lives in your own GitHub account. You never need to open it. Leave it as it is and updates keep arriving through Netlify.",
      "Emails stay private. They never appear on any wall, widget or download link that people can see.",
      "Deleting a form or a wall never deletes testimonials. Hiding a testimonial is always undoable. Delete for good is not.",
      "Avoid the bin icons in Netlify's Blobs screen. Those delete things for good. Do it from this admin instead.",
    ]],
    ["If something looks off", [
      "A wall or widget looks out of date? Give it a minute, then refresh. Changes usually show straight away.",
      "Logged out unexpectedly? Your two weeks ran out or the password changed. Log in again.",
      "A photo missing? Open Your data and tap Shrink big photos.",
      "Still stuck? Get in touch with whoever set you up with Kiitos. Send a screenshot, and say which screen you were on and what you tapped.",
    ]],
  ];

  function renderGuide(openTitle) {
    leaveGuard = null;
    app.replaceChildren(
      topBar("Guide"),
      el("main", { class: "wrap" },
        el("p", { class: "muted", text: `Everything this admin does, in plain English. Tap a section to open it.${data.version ? ` You're on Kiitos ${data.version}.` : ""}` }),
        ...GUIDE.map(([title, points], i) => el("details", { class: "section guide", open: openTitle ? title === openTitle : i === 0 },
          el("summary", {}, el("h2", { text: title })),
          el("ul", {}, ...points.map((p) => el("li", { text: p })))))
      )
    );
    window.scrollTo({ top: 0 });
    if (openTitle) app.querySelector("details[open]")?.scrollIntoView({ block: "start" });
  }

  // ---------- Start up ----------

  async function loadAll() {
    const [list, { settings }, { collections }] = await Promise.all([api("testimonials"), api("settings"), api("collections")]);
    Object.assign(data, list, { settings, collections });
    document.documentElement.style.setProperty("--accent", settings.colours.accent);
  }

  let currentHash = location.hash;
  function route() {
    const hash = location.hash || "#/";
    if (hash.startsWith("#/t/")) renderEdit(hash.slice(4));
    else if (hash.startsWith("#/share/")) renderShare(hash.slice(8));
    else if (hash === "#/highlights") renderHighlights();
    else if (hash === "#/voice") renderVoice();
    else if (hash === "#/settings") renderSettings();
    else if (hash === "#/widgets") renderWidgets();
    else if (hash === "#/data") renderData();
    else if (hash === "#/import") renderImport();
    else if (hash === "#/import/new") renderAdd();
    else if (hash === "#/guide") renderGuide();
    else if (hash === "#/guide-updates") renderGuide("Updates");
    else if (hash === "#/forms") renderForms();
    else if (hash.startsWith("#/forms/")) renderForm(hash.slice(8));
    else if (hash === "#/walls") renderWalls();
    else if (hash.startsWith("#/walls/")) renderWall(hash.slice(8));
    else renderInbox();
    currentHash = location.hash;
  }

  window.addEventListener("hashchange", () => {
    if (leaveGuard && !leaveGuard()) {
      history.replaceState(null, "", currentHash || "#/");
      return;
    }
    if (data.settings) route();
  });

  (async function start() {
    try {
      const res = await fetch("/api/admin/session", { credentials: "same-origin" });
      const { loggedIn, passwordSet } = await res.json();
      if (!loggedIn) return renderLogin("", passwordSet);
      await loadAll();
      route();
    } catch (e) {
      if (e.message !== "Logged out") app.replaceChildren(el("p", { class: "loading", text: "Couldn't load the admin. Please refresh." }));
    }
  })();
})();
