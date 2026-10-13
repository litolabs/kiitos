// Everything behind the admin login.
//
// POST  /api/admin/login              -> log in with the admin password
// POST  /api/admin/logout             -> log out
// GET   /api/admin/session            -> am I logged in?
// GET   /api/admin/testimonials       -> every testimonial, plus forms and tags
// POST  /api/admin/testimonials      -> add a testimonial by hand (from an email, DM or screenshot)
// PATCH /api/admin/testimonials/:id   -> approve, hide, edit, tag, feature, swap photo
// DELETE /api/admin/testimonials/:id  -> delete a hidden testimonial for good, photo and all
// GET   /api/admin/settings           -> brand settings
// PUT   /api/admin/settings           -> save brand settings
// GET   /api/admin/collections        -> every collection
// POST  /api/admin/collections        -> create a collection
// PUT   /api/admin/collections/:id    -> update a collection
// DELETE /api/admin/collections/:id   -> delete a collection
// GET   /api/admin/forms              -> every form
// POST  /api/admin/forms              -> create a form
// PUT   /api/admin/forms/:id          -> update a form
// DELETE /api/admin/forms/:id         -> delete a form (its testimonials stay)
// POST  /api/admin/import             -> import a small batch of testimonials
// POST  /api/admin/import/finish      -> rebuild every wall after an import
// GET   /api/admin/import/photo-source?id=  -> the original of a big imported photo, for shrinking
// POST  /api/admin/import/photo       -> save a shrunk photo for an imported testimonial
// GET   /api/admin/export?format=json -> download everything (or format=csv)
// POST  /api/admin/ai/highlights      -> pull quote suggestions for a few testimonials
// POST  /api/admin/preview          -> a Wall of Love or widget drawn with unsaved colours and fonts
// POST  /api/admin/ai/screenshot     -> read a screenshot into a testimonial draft
// POST  /api/admin/ai/themes/discover -> find what people talk about most
// POST  /api/admin/ai/themes/assign   -> sort a few testimonials into those themes
// GET   /api/admin/ai/voice           -> saved Voice of Customer reports
// POST  /api/admin/ai/voice           -> run a report, or answer a question, across some testimonials
//
// Any change that affects what's public rebuilds the walls straight away.

import { decodeAvatar, saveAvatar } from "../lib/avatar.mjs";
import {
  adminPassword, clearFails, clearedCookie, isLoggedIn, lockedForMinutes,
  passwordMatches, recordFail, sessionCookie,
} from "../lib/auth.mjs";
import { UUID_PATTERN, error, json } from "../lib/http.mjs";
import { getSettings, listForms, rememberDeleted, stores } from "../lib/store.mjs";
import {
  SORTS, buildSnapshot, listCollections, listTestimonials as loadTestimonials, purgeAllWalls,
  rebuildAll, rebuildSnapshot, removeSnapshot, slugify,
} from "../lib/collections.mjs";
import { randomUUID } from "node:crypto";
import { updateInfo } from "../lib/update.mjs";
import { VERSION } from "../lib/version.mjs";
import { wallPage } from "../lib/wallpage.mjs";
import { STYLES as WIDGET_STYLES, widgetPage } from "../lib/widgetpage.mjs";
import { download, importBatch } from "../lib/importer.mjs";
import { VOICE_KINDS, aiAvailable, assignThemes, discoverThemes, ownerFrom, readScreenshot, suggestHighlights, voiceReport } from "../lib/ai.mjs";

const STATUSES = ["pending", "approved", "hidden"];
const HEX = /^#[0-9a-f]{6}$/i;

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : undefined);

const tagSlug = (tag) =>
  String(tag).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

// ---------- Login ----------

async function login(req, context) {
  if (!adminPassword()) {
    return error("The admin password hasn't been set up yet. Add ADMIN_PASSWORD in Netlify, under Environment variables, then redeploy.", 503);
  }
  const minutes = await lockedForMinutes(context.ip);
  if (minutes) return error(`Too many wrong tries. Have a cup of tea and try again in ${minutes} minute${minutes > 1 ? "s" : ""}.`, 429);

  const { password } = await req.json().catch(() => ({}));
  if (!password || !passwordMatches(password)) {
    const left = await recordFail(context.ip);
    return error(left > 0 ? `That's not it. ${left} ${left === 1 ? "try" : "tries"} left before a short lockout.` : "That's not it. Login is locked for 15 minutes.", 401);
  }
  await clearFails(context.ip);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie() });
}

// ---------- Testimonials ----------

async function listTestimonials() {
  const items = await loadTestimonials();
  const order = { pending: 0, approved: 1, hidden: 2 };
  items.sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt));

  const forms = (await listForms()).map(({ id, slug, title, questions, tags }) => ({ id, slug, title, questions, tags }));
  const tags = [...new Set(items.flatMap((t) => t.tags || []))].sort();
  const themes = (await stores.settings().get("themes", { type: "json" })) || null;
  return json({ testimonials: items, forms, tags, themes, ai: aiAvailable(), version: VERSION, update: await updateInfo() });
}

async function updateTestimonial(req, id) {
  if (!UUID_PATTERN.test(id)) return error("Not found", 404);
  const store = stores.testimonials();
  const t = await store.get(id, { type: "json" });
  if (!t) return error("Not found", 404);

  const input = await req.json().catch(() => null);
  if (!input) return error("Something went wrong sending that. Please try again.");

  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status)) return error("Unknown status.");
    t.status = input.status;
  }
  for (const [field, max] of [["name", 200], ["role", 200], ["website", 200], ["body", 10000], ["highlight", 280]]) {
    const value = text(input[field], max);
    if (value !== undefined) t[field] = value;
  }
  if (!t.name) return error("A testimonial needs a name.");
  if (Array.isArray(input.tags)) t.tags = [...new Set(input.tags.map(tagSlug).filter(Boolean))];
  if (typeof input.featured === "boolean") t.featured = input.featured;

  // Photo: a new cropped image replaces the old one, an empty string removes it.
  if (input.avatar !== undefined) {
    let avatar;
    try {
      avatar = decodeAvatar(input.avatar);
    } catch (e) {
      return error(e.message);
    }
    const oldKey = t.avatar;
    t.avatar = avatar ? await saveAvatar(avatar) : "";
    if (oldKey) await stores.avatars().delete(oldKey);
  }

  t.updatedAt = new Date().toISOString();
  await store.setJSON(id, t);
  await rebuildAll();
  return json({ testimonial: t });
}

// Testimonials that arrive some other way (an email, a DM, a screenshot)
// are added by hand. The owner confirms they have permission to share them.
async function addTestimonial(req) {
  const input = await req.json().catch(() => null);
  if (!input) return error("Something went wrong sending that. Please try again.");
  const name = text(input.name, 200);
  if (!name) return error("Add their name.");
  const body = text(input.body, 10000);
  if (!body) return error("Add the words of their testimonial.");
  if (input.permission !== true) return error("Tick the box to confirm you have their permission to share this.");
  const rating = input.rating === null || input.rating === "" || input.rating === undefined ? null : Number(input.rating);
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return error("Stars need to be between 1 and 5.");
  const status = input.status === "pending" ? "pending" : "approved";
  const forms = await listForms();
  const formId = forms.some((f) => f.id === input.formId) ? input.formId : null;

  let avatar;
  try {
    avatar = decodeAvatar(input.avatar);
  } catch (e) {
    return error(e.message);
  }
  const id = randomUUID();
  const now = new Date();
  const given = /^\d{4}-\d{2}-\d{2}$/.test(input.date || "") ? new Date(`${input.date}T12:00:00Z`) : null;
  const createdAt = given && !Number.isNaN(given.getTime()) && given <= now ? given.toISOString() : now.toISOString();
  const avatarKey = avatar ? await saveAvatar(avatar, id) : "";
  const from = text(input.from, 60) || "By hand";
  const wording = `Added by hand from ${from}. The owner confirmed they have permission to share it.`;

  const t = {
    id, createdAt, updatedAt: now.toISOString(), status, source: "manual", formId,
    import: { from, addedAt: now.toISOString() },
    name, role: text(input.role, 200) || "", email: text(input.email, 200) || "", website: text(input.website, 200) || "",
    avatar: avatarKey, rating, answers: [], body, highlight: "",
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(tagSlug).filter(Boolean))] : [],
    featured: false,
    consent: { publishName: input.showName !== false, publishPhoto: Boolean(avatarKey) && input.showPhoto !== false, wording: { publishName: wording, publishPhoto: wording } },
    video: null,
  };
  await stores.testimonials().setJSON(id, t);
  if (status === "approved") await rebuildAll();
  return json({ testimonial: t }, 201);
}

async function aiScreenshot(req) {
  const input = await req.json().catch(() => null);
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(input?.image || "");
  if (!match) return error("That image didn't come through. Try a PNG or JPEG screenshot.");
  if (match[2].length > 5_000_000) return error("That image is too big. Try a smaller screenshot.");
  return aiCall(async () => {
    const draft = await readScreenshot({ mediaType: match[1], data: match[2] }, ownerFrom(await getSettings()));
    if (!draft.words) return error("I couldn't find a testimonial in that screenshot. Try a clearer one, or type it in by hand.", 422);
    return json({ draft });
  });
}

// Only hidden testimonials can be deleted, so nothing live disappears by accident.
// Removes the record, its photo and any kept images, takes it off every wall's
// pins, leave-offs and order, and remembers the id so a re-import skips it.
async function deleteTestimonial(id) {
  if (!UUID_PATTERN.test(id)) return error("Not found", 404);
  const store = stores.testimonials();
  const t = await store.get(id, { type: "json" });
  if (!t) return error("Not found", 404);
  if (t.status !== "hidden") return error("Hide this testimonial first, then you can delete it.");

  if (t.avatar) await stores.avatars().delete(t.avatar);
  await Promise.all((t.attachments || []).map((key) => stores.media().delete(key)));

  for (const c of await listCollections()) {
    const strip = (list) => (list || []).filter((x) => x !== id);
    if ([c.pins, c.exclusions, c.order].some((list) => (list || []).includes(id))) {
      await stores.collections().setJSON(c.id, { ...c, pins: strip(c.pins), exclusions: strip(c.exclusions), order: strip(c.order) });
    }
  }

  await rememberDeleted(id);
  await store.delete(id);
  await rebuildAll();
  return json({ ok: true });
}

// ---------- AI helpers ----------

const AI_OFF = "The AI isn't switched on for your site yet. See the Guide, under AI helpers.";

async function aiCall(fn) {
  if (!aiAvailable()) return error(AI_OFF, 503);
  try {
    return await fn();
  } catch (e) {
    console.error("AI call failed:", e.status, e.message);
    if (e.status === 401 || e.status === 403) return error(AI_OFF, 503);
    if (e.status === 429) return error("The AI is busy. Give it a minute and try again.", 503);
    return error("The AI didn't answer this time. Please try again.", 502);
  }
}

async function readIds(req, max) {
  const input = await req.json().catch(() => null);
  const ids = Array.isArray(input?.ids) ? [...new Set(input.ids.filter((id) => UUID_PATTERN.test(id)))] : [];
  if (!ids.length || ids.length > max) return null;
  const store = stores.testimonials();
  return (await Promise.all(ids.map((id) => store.get(id, { type: "json" })))).filter((t) => t && t.body);
}

async function aiHighlights(req) {
  const list = await readIds(req, 8);
  if (!list) return error("Send between 1 and 8 testimonials at a time.");
  const owner = ownerFrom(await getSettings());
  return aiCall(async () => json({ results: await suggestHighlights(list, owner) }));
}

async function aiDiscoverThemes() {
  const all = (await loadTestimonials()).filter((t) => t.status !== "hidden" && t.body);
  if (all.length < 5) return error("Themes need at least 5 testimonials to work with.");
  return aiCall(async () => {
    const list = await discoverThemes(all.slice(0, 250), ownerFrom(await getSettings()));
    if (list.length < 2) return error("The AI couldn't find clear themes this time. Please try again.", 502);
    const themes = { list, version: new Date().toISOString() };
    await stores.settings().setJSON("themes", themes);
    return json({ themes });
  });
}

async function aiAssignThemes(req) {
  const themes = await stores.settings().get("themes", { type: "json" });
  if (!themes?.list?.length) return error("Find your themes first.");
  const list = await readIds(req, 15);
  if (!list) return error("Send between 1 and 15 testimonials at a time.");
  return aiCall(async () => {
    const results = await assignThemes(list, themes.list, ownerFrom(await getSettings()));
    const store = stores.testimonials();
    await Promise.all(results.filter((r) => r.sorted).map(async (r) => {
      const t = await store.get(r.id, { type: "json" });
      if (t) await store.setJSON(r.id, { ...t, themes: r.themes, themesVersion: themes.version });
    }));
    return json({ results, version: themes.version });
  });
}

const REPORTS_KEY = "voice-reports";

// Which testimonials a report covers: all of them, or one form, tag or theme.
function inScope(t, scope) {
  if (t.status === "hidden" || !t.body) return false;
  if (scope.type === "form") return t.formId === scope.value;
  if (scope.type === "tag") return (t.tags || []).includes(scope.value);
  if (scope.type === "theme") return (t.themes || []).includes(scope.value);
  return true;
}

async function aiVoice(req) {
  const input = await req.json().catch(() => null);
  const kind = input?.kind;
  if (!VOICE_KINDS[kind]) return error("Pick a report to run.");
  const question = text(input.question, 300) || "";
  if (kind === "ask" && question.length < 5) return error("Type a question first.");
  const scope = ["form", "tag", "theme"].includes(input.scope?.type) ? { type: input.scope.type, value: text(input.scope.value, 120) || "" } : { type: "all", value: "" };

  const list = (await loadTestimonials()).filter((t) => inScope(t, scope));
  if (list.length < 3) return error("A report needs at least 3 testimonials to read. Try a wider choice.");
  // Wall names are the friendliest programme names we have, like "Coaching Academy".
  const programmes = [...new Set((await listCollections()).filter((c) => c.rule?.tags?.length).map((c) => c.name))].slice(0, 8);

  return aiCall(async () => {
    const result = await voiceReport({ kind, question, testimonials: list.slice(0, 300), programmes, owner: ownerFrom(await getSettings()) });
    const report = {
      id: randomUUID(), kind, question, scope, label: text(input.scopeLabel, 120) || "All your testimonials",
      count: Math.min(list.length, 300), createdAt: new Date().toISOString(), ...result,
    };
    const store = stores.settings();
    const saved = (await store.get(REPORTS_KEY, { type: "json" })) || [];
    await store.setJSON(REPORTS_KEY, [report, ...saved].slice(0, 30));
    return json({ report });
  });
}

// ---------- Style preview ----------

// The real Wall of Love page, drawn with colours and fonts that aren't saved
// yet, using a few of the owner's own approved testimonials.
async function previewWall(req) {
  const input = await req.json().catch(() => null);
  if (!input) return error("Something went wrong sending that. Please try again.");
  const current = await getSettings();
  const settings = structuredClone(current);
  for (const key of Object.keys(settings.colours)) {
    if (HEX.test(input.colours?.[key] || "")) settings.colours[key] = input.colours[key];
  }
  for (const key of Object.keys(settings.fonts)) {
    const value = text(input.fonts?.[key], 60);
    if (value) settings.fonts[key] = value.replace(/[^\w\s-]/g, "");
  }
  const brand = text(input.brandName, 120);
  if (brand) settings.brandName = brand;

  const sample = {
    slug: "preview", name: "Preview", rule: { tags: [], match: "any" }, pins: [], exclusions: [], sort: "featured", order: [],
    wall: { eyebrow: "Style preview", heading: "Wall of Love", subheading: "This is how your walls look with these colours and fonts.", showRatings: true },
  };
  let snapshot = buildSnapshot(sample, await loadTestimonials());
  if (!snapshot.items.length) {
    const now = new Date().toISOString();
    const example = (id, name, role, rating, body, highlight) => ({ id, name, role, rating, body, highlight, avatar: "", website: "", featured: false, createdAt: now });
    snapshot = { ...snapshot, items: [
      example("a", "Ana Silva", "Founder, Bloom Studio", 5, "I came in stuck and left with a plan I actually believe in.\n\nEvery session gave me something I could use the same day.", "I left with a plan I actually believe in."),
      example("b", "Sam Lee", "Designer", 5, "Warm, sharp and honest. Exactly what I needed.", ""),
      example("c", "Priya Shah", "", 4, "The biggest shift was how I talk to myself. Everything else followed from that.", ""),
    ], stats: { count: 3, rated: 3, average: 4.7 } };
  }
  const style = WIDGET_STYLES.includes(input.widget) ? input.widget : "";
  if (style) {
    // On the page colour, as it would sit on a site with the same background.
    const q = new URLSearchParams({ bg: "page", rows: "2", max: "8", names: "1" });
    snapshot = { ...snapshot, items: snapshot.items.slice(0, 16) };
    return new Response(widgetPage({ settings, snapshot, style, q }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  snapshot = { ...snapshot, items: snapshot.items.slice(0, 6) };
  const html = wallPage({ settings, snapshot, url: new URL("/wall/preview", req.url).href });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// ---------- Settings ----------

async function saveSettings(req) {
  const input = await req.json().catch(() => null);
  if (!input) return error("Something went wrong sending that. Please try again.");
  const current = await getSettings();
  const next = structuredClone(current);

  for (const field of ["brandName", "ownerName", "ownerRole", "logoUrl", "siteUrl"]) {
    const value = text(input[field], 300);
    if (value !== undefined) next[field] = value;
  }
  if (!next.brandName) return error("Your brand needs a name.");
  for (const key of Object.keys(current.colours)) {
    const value = input.colours?.[key];
    if (value !== undefined) {
      if (!HEX.test(value)) return error(`"${value}" isn't a colour code. Use the format #FFD60A.`);
      next.colours[key] = value.toUpperCase();
    }
  }
  for (const key of Object.keys(current.fonts)) {
    const value = text(input.fonts?.[key], 60);
    if (value) next.fonts[key] = value.replace(/[^\w\s-]/g, "");
  }
  for (const key of Object.keys(current.consent)) {
    const value = text(input.consent?.[key], 300);
    if (value !== undefined) next.consent[key] = value;
  }

  await stores.settings().setJSON("site", next);
  await purgeAllWalls();
  return json({ settings: next });
}

// ---------- Collections ----------

function readCollection(input, existing = {}) {
  const name = text(input.name, 80) ?? existing.name;
  if (!name) throw new Error("Give your collection a name.");
  const slug = slugify(text(input.slug, 60) || existing.slug || name);
  if (!slug) throw new Error("The link name needs at least one letter or number.");
  const ids = (list) => (Array.isArray(list) ? [...new Set(list.filter((id) => UUID_PATTERN.test(id)))] : undefined);
  const wallIn = input.wall || {};
  const wallOld = existing.wall || {};
  return {
    ...existing,
    id: existing.id || `collection_${randomUUID()}`,
    slug,
    name,
    description: text(input.description, 300) ?? existing.description ?? "",
    rule: {
      tags: Array.isArray(input.rule?.tags) ? [...new Set(input.rule.tags.map(tagSlug).filter(Boolean))] : existing.rule?.tags || [],
      match: input.rule?.match === "all" ? "all" : input.rule?.match === "any" ? "any" : existing.rule?.match || "any",
    },
    pins: ids(input.pins) ?? existing.pins ?? [],
    exclusions: ids(input.exclusions) ?? existing.exclusions ?? [],
    sort: SORTS.includes(input.sort) ? input.sort : existing.sort || "featured",
    order: ids(input.order) ?? existing.order ?? [],
    wall: {
      eyebrow: text(wallIn.eyebrow, 80) ?? wallOld.eyebrow ?? name,
      heading: text(wallIn.heading, 80) ?? wallOld.heading ?? "Wall of Love",
      subheading: text(wallIn.subheading, 200) ?? wallOld.subheading ?? "",
      showRatings: typeof wallIn.showRatings === "boolean" ? wallIn.showRatings : wallOld.showRatings ?? true,
    },
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function saveCollection(req, id) {
  const input = await req.json().catch(() => null);
  if (!input) return error("Something went wrong sending that. Please try again.");
  const all = await listCollections();
  const existing = id ? all.find((c) => c.id === id) : undefined;
  if (id && !existing) return error("Not found", 404);

  let collection;
  try {
    collection = readCollection(input, existing);
  } catch (e) {
    return error(e.message);
  }
  if (all.some((c) => c.slug === collection.slug && c.id !== collection.id)) {
    return error(`Another collection already uses the link /wall/${collection.slug}. Pick a different one.`);
  }

  await stores.collections().setJSON(collection.id, collection);
  if (existing && existing.slug !== collection.slug) await removeSnapshot(existing.slug);
  const snapshot = await rebuildSnapshot(collection);
  return json({ collection, stats: snapshot.stats }, existing ? 200 : 201);
}

async function deleteCollection(id) {
  const existing = (await listCollections()).find((c) => c.id === id);
  if (!existing) return error("Not found", 404);
  await stores.collections().delete(id);
  await removeSnapshot(existing.slug);
  return json({ ok: true });
}

// ---------- Forms ----------

function readForm(input, existing = {}) {
  const title = text(input.title, 120) ?? existing.title;
  if (!title) throw new Error("Give your form a title.");
  const slug = slugify(text(input.slug, 60) || existing.slug || title);
  if (!slug) throw new Error("The link name needs at least one letter or number.");
  const questionsIn = Array.isArray(input.questions) ? input.questions : existing.questions || [];
  if (questionsIn.length > 10) throw new Error("Keep it to 10 questions or fewer.");
  const seen = new Set();
  const questions = questionsIn.map((q) => {
    const prompt = text(q?.prompt, 200);
    if (!prompt) throw new Error("Every question needs some words.");
    let id = /^[a-z0-9_-]{1,40}$/i.test(q?.id || "") ? q.id : `q_${randomUUID().slice(0, 8)}`;
    while (seen.has(id)) id = `q_${randomUUID().slice(0, 8)}`;
    seen.add(id);
    return { id, prompt, helper: text(q?.helper, 300) || "", required: q?.required === true };
  });
  if (!questions.length) throw new Error("Add at least one question.");
  const ty = input.thankYou || existing.thankYou || {};
  const linkUrl = text(ty.linkUrl, 500) || "";
  if (linkUrl && !/^https?:\/\//i.test(linkUrl)) throw new Error("The thank-you link needs to start with https://");
  return {
    ...existing,
    id: existing.id || `form_${randomUUID()}`,
    slug,
    title,
    intro: text(input.intro, 1500) ?? existing.intro ?? "",
    askRating: typeof input.askRating === "boolean" ? input.askRating : existing.askRating !== false,
    ratingPrompt: text(input.ratingPrompt, 200) ?? existing.ratingPrompt ?? "",
    questions,
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(tagSlug).filter(Boolean))] : existing.tags || [],
    thankYou: { heading: text(ty.heading, 120) || "", message: text(ty.message, 600) || "", linkLabel: text(ty.linkLabel, 60) || "", linkUrl },
    theme: existing.theme || {},
  };
}

async function saveForm(req, id) {
  const input = await req.json().catch(() => null);
  if (!input) return error("Something went wrong sending that. Please try again.");
  const all = await listForms();
  const existing = id ? all.find((f) => f.id === id) : undefined;
  if (id && !existing) return error("Not found", 404);
  let form;
  try {
    form = readForm(input, existing);
  } catch (e) {
    return error(e.message);
  }
  if (all.some((f) => f.slug === form.slug && f.id !== form.id)) {
    return error(`Another form already uses the link /f/${form.slug}. Pick a different one.`);
  }
  await stores.forms().setJSON(form.id, form);
  return json({ form }, existing ? 200 : 201);
}

async function deleteForm(id) {
  const existing = (await listForms()).find((f) => f.id === id);
  if (!existing) return error("Not found", 404);
  await stores.forms().delete(id);
  return json({ ok: true });
}

// ---------- Your data ----------

async function runImport(req) {
  const input = await req.json().catch(() => null);
  if (!input || !Array.isArray(input.rows)) return error("Something went wrong sending that. Please try again.");
  if (input.rows.length > 10) return error("Send at most 10 testimonials at a time.");
  return json({ results: await importBatch(input.rows, input.source) });
}

// Hands the browser the original photo (it can't fetch other sites' images
// directly), so it can shrink it to a 400 pixel square.
async function photoSource(req) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!UUID_PATTERN.test(id)) return error("Not found", 404);
  const t = await stores.testimonials().get(id, { type: "json" });
  const url = t?.import?.avatarUrl;
  if (!url) return error("No original photo for this one.", 404);
  try {
    const img = await download(url);
    return new Response(img.bytes, { headers: { "content-type": img.contentType, "cache-control": "no-store" } });
  } catch (e) {
    return error(`Couldn't fetch the original photo: ${e.message}`, 502);
  }
}

async function saveImportedPhoto(req) {
  const input = await req.json().catch(() => null);
  if (!input || !UUID_PATTERN.test(input.id || "")) return error("Not found", 404);
  const store = stores.testimonials();
  const t = await store.get(input.id, { type: "json" });
  if (!t) return error("Not found", 404);
  let avatar;
  try {
    avatar = decodeAvatar(input.avatar);
  } catch (e) {
    return error(e.message);
  }
  if (!avatar) return error("No photo sent.");
  const oldKey = t.avatar;
  t.avatar = await saveAvatar(avatar);
  if (oldKey && oldKey !== t.avatar) await stores.avatars().delete(oldKey);
  t.import = { ...t.import, photoPending: false };
  // Imported photos were already public where they came from.
  if (t.source === "import") t.consent = { ...t.consent, publishPhoto: true };
  t.updatedAt = new Date().toISOString();
  await store.setJSON(t.id, t);
  return json({ testimonial: t });
}

const csvCell = (value) => {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function exportData(req) {
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const origin = new URL(req.url).origin;
  const [testimonials, collections, forms, settings] = await Promise.all([loadTestimonials(), listCollections(), listForms(), getSettings()]);
  testimonials.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const day = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), testimonials, collections, forms, settings }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="testimonials-${day}.json"`, "cache-control": "no-store" },
    });
  }
  const columns = ["id", "status", "date", "name", "email", "role", "website", "rating", "tags", "featured", "highlight", "body", "photo", "show name", "show photo", "source"];
  const rows = testimonials.map((t) => [
    t.id, t.status, t.createdAt, t.name, t.email, t.role, t.website, t.rating ?? "", (t.tags || []).join(", "), t.featured ? "yes" : "no",
    t.highlight, t.body, t.avatar ? `${origin}/api/avatar/${t.avatar}` : "", t.consent?.publishName ? "yes" : "no", t.consent?.publishPhoto ? "yes" : "no",
    t.import?.from || t.source,
  ]);
  const csv = "\uFEFF" + [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="testimonials-${day}.csv"`, "cache-control": "no-store" },
  });
}

// ---------- Router ----------

export default async (req, context) => {
  const path = new URL(req.url).pathname.replace(/^\/api\/admin\/?/, "").replace(/\/$/, "");
  const method = req.method;

  if (path === "login" && method === "POST") return login(req, context);
  if (path === "logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": clearedCookie() });
  if (path === "session" && method === "GET") return json({ loggedIn: isLoggedIn(req), passwordSet: Boolean(adminPassword()) });

  if (!isLoggedIn(req)) return error("Please log in.", 401);

  // Changes must be sent as JSON, which other websites can't do on your behalf.
  if (method !== "GET" && method !== "DELETE" && !(req.headers.get("content-type") || "").includes("application/json")) {
    return error("Unsupported request.", 415);
  }

  if (path === "testimonials" && method === "GET") return listTestimonials();
  if (path === "testimonials" && method === "POST") return addTestimonial(req);
  const match = /^testimonials\/([^/]+)$/.exec(path);
  if (match && method === "PATCH") return updateTestimonial(req, match[1]);
  if (match && method === "DELETE") return deleteTestimonial(match[1]);
  if (path === "settings" && method === "GET") return json({ settings: await getSettings() });
  if (path === "settings" && method === "PUT") return saveSettings(req);
  if (path === "preview" && method === "POST") return previewWall(req);
  if (path === "forms" && method === "GET") return json({ forms: await listForms() });
  if (path === "forms" && method === "POST") return saveForm(req);
  const formMatch = /^forms\/([^/]+)$/.exec(path);
  if (formMatch && method === "PUT") return saveForm(req, formMatch[1]);
  if (formMatch && method === "DELETE") return deleteForm(formMatch[1]);
  if (path === "import" && method === "POST") return runImport(req);
  if (path === "import/finish" && method === "POST") { await rebuildAll(); return json({ ok: true }); }
  if (path === "import/photo-source" && method === "GET") return photoSource(req);
  if (path === "import/photo" && method === "POST") return saveImportedPhoto(req);
  if (path === "export" && method === "GET") return exportData(req);
  if (path === "ai/highlights" && method === "POST") return aiHighlights(req);
  if (path === "ai/themes/discover" && method === "POST") return aiDiscoverThemes();
  if (path === "ai/themes/assign" && method === "POST") return aiAssignThemes(req);
  if (path === "ai/voice" && method === "GET") return json({ reports: (await stores.settings().get(REPORTS_KEY, { type: "json" })) || [] });
  if (path === "ai/voice" && method === "POST") return aiVoice(req);
  if (path === "ai/screenshot" && method === "POST") return aiScreenshot(req);
  if (path === "collections" && method === "GET") return json({ collections: await listCollections() });
  if (path === "collections" && method === "POST") return saveCollection(req);
  const col = /^collections\/([^/]+)$/.exec(path);
  if (col && method === "PUT") return saveCollection(req, col[1]);
  if (col && method === "DELETE") return deleteCollection(col[1]);

  return error("Not found", 404);
};

export const config = { path: "/api/admin/*" };
