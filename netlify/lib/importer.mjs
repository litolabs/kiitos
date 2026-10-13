// Brings testimonials in from another tool (Senja first). The admin page reads
// the export file in the browser, matches its columns, and sends small batches
// here. Every photo is downloaded into Netlify Blobs, so nothing depends on the
// old tool's image links once it's cancelled.

import { createHash } from "node:crypto";
import { UUID_PATTERN } from "./http.mjs";
import { deletedIds, stores } from "./store.mjs";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
// Photos bigger than this are shrunk in the admin's browser before saving,
// so walls and widgets stay quick to load.
export const SMALL_PHOTO_BYTES = 300 * 1024;
const IMAGE_TYPES = { "image/jpeg": "jpeg", "image/jpg": "jpeg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export const tagSlug = (tag) =>
  String(tag).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
const decode = (s) => s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITIES[e.toLowerCase()] ?? m;
});

// Senja marks highlighted phrases with <mark>. The first one becomes our
// highlight, and all the HTML is stripped from the body.
export function cleanText(raw) {
  const source = String(raw || "");
  const marks = [...source.matchAll(/<mark[^>]*>([\s\S]*?)<\/mark>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, "")).trim()).filter(Boolean);
  const body = decode(source.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<[^>]+>/g, ""))
    .replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const highlight = marks.find((m) => m.length >= 20 && m.length <= 280) || marks.find((m) => m.length <= 280) || "";
  return { body, highlight };
}

// "2025-05-07 07:45:21.166+00" and most other date formats.
function parseDate(value) {
  if (!value) return null;
  let v = String(value).trim().replace(" ", "T");
  // Only a time can end in a short time zone like "+00". A plain date such as
  // "2025-05-07" ends the same way, and must be left alone.
  if (/T.*[+-]\d\d$/.test(v)) v += ":00";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// The same source testimonial always gets the same id here, so running an
// import twice never makes duplicates.
function idFor(row) {
  const sourceId = text(row.sourceId, 100).toLowerCase();
  if (UUID_PATTERN.test(sourceId)) return sourceId;
  const h = createHash("sha256").update(`${row.source}|${sourceId}|${row.name}|${row.date}|${row.text}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export async function download(url) {
  if (!/^https:\/\//i.test(url || "")) throw new Error("not an https link");
  const res = await fetch(url, { signal: AbortSignal.timeout(7000), redirect: "follow" });
  if (!res.ok) throw new Error(`the link returned ${res.status}`);
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new Error(`not a supported image (${type || "unknown type"})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("the image is over 20 MB");
  return { bytes, contentType: type === "image/jpg" ? "image/jpeg" : type, ext };
}

async function importOne(row, source, deleted = new Set()) {
  const name = text(row.name, 200);
  const { body, highlight } = cleanText(row.text);
  if (!name) return { status: "skipped", reason: "No name" };
  if (!body) return { status: "skipped", name, reason: row.type === "video" ? "Video testimonial with no text (text only for now)" : "No testimonial text" };

  const id = idFor({ ...row, source, name });
  if (deleted.has(id)) return { status: "skipped", name, reason: "You deleted this one for good, so it stays deleted" };
  const store = stores.testimonials();
  const existing = await store.get(id, { type: "json" });
  if (existing) return repairPhoto(existing, row, name);

  const notes = [];
  const photo = await copyPhoto(id, row.avatarUrl, notes);
  const avatar = photo.key;

  // Extra images attached to a testimonial are kept safe, ready for later.
  const attachments = [];
  for (const [i, url] of (row.images || []).slice(0, 10).entries()) {
    try {
      const img = await download(url);
      const key = `${id}/image-${i + 1}.${img.ext}`;
      await stores.media().set(key, img.bytes, { metadata: { contentType: img.contentType } });
      attachments.push(key);
    } catch (e) {
      notes.push(`Image ${i + 1} not copied: ${e.message}`);
    }
  }

  const createdAt = parseDate(row.date);
  if (!createdAt) notes.push("No usable date, so today's date was used");
  const rating = Number.parseInt(row.rating, 10);
  const when = createdAt || new Date().toISOString();
  const wording = `Imported from ${source}, where it was collected and approved.`;

  const testimonial = {
    id,
    createdAt: when,
    updatedAt: new Date().toISOString(),
    status: row.approved === false ? "pending" : "approved",
    source: "import",
    formId: null,
    import: {
      from: source, sourceId: text(row.sourceId, 100), importedAt: new Date().toISOString(),
      avatarUrl: text(row.avatarUrl, 1000), photoPending: photo.pending,
    },
    name,
    role: text(row.role, 200),
    email: text(row.email, 200),
    website: text(row.website, 200),
    avatar,
    rating: rating >= 1 && rating <= 5 ? rating : null,
    answers: [],
    body: body.slice(0, 10000),
    highlight,
    tags: [...new Set((row.tags || []).map(tagSlug).filter(Boolean))],
    featured: false,
    consent: { publishName: true, publishPhoto: Boolean(avatar || photo.pending), wording: { publishName: wording, publishPhoto: wording } },
    attachments,
    video: null,
  };
  await store.setJSON(id, testimonial);
  return { status: "imported", name, id, notes, photoPending: photo.pending };
}

// Small photos are saved straight away. Big ones are left for the admin's
// browser to shrink (see /api/admin/import/photo).
async function copyPhoto(id, url, notes) {
  if (!url) return { key: "", pending: false };
  try {
    const img = await download(url);
    if (img.bytes.length > SMALL_PHOTO_BYTES) return { key: "", pending: true };
    const key = `${id}.${img.ext}`;
    await stores.avatars().set(key, img.bytes, { metadata: { contentType: img.contentType } });
    return { key, pending: false };
  } catch (e) {
    notes.push(`Photo not copied: ${e.message}`);
    return { key: "", pending: false };
  }
}

// Running an import again fills in any photo that didn't make it last time.
async function repairPhoto(t, row, name) {
  if (t.avatar || !row.avatarUrl || t.source !== "import") return { status: "existing", name, id: t.id, photoPending: Boolean(t.import?.photoPending) };
  const notes = [];
  const photo = await copyPhoto(t.id, row.avatarUrl, notes);
  t.avatar = photo.key;
  t.import = { ...t.import, avatarUrl: text(row.avatarUrl, 1000), photoPending: photo.pending };
  t.consent = { ...t.consent, publishPhoto: Boolean(photo.key || photo.pending) };
  t.updatedAt = new Date().toISOString();
  await stores.testimonials().setJSON(t.id, t);
  return { status: "existing", name, id: t.id, notes, photoPending: photo.pending };
}

export async function importBatch(rows, source = "Senja") {
  const results = [];
  const deleted = await deletedIds();
  for (const row of rows.slice(0, 10)) {
    try {
      results.push(await importOne(row, text(source, 40) || "another tool", deleted));
    } catch (e) {
      results.push({ status: "skipped", name: text(row?.name, 200), reason: `Something went wrong: ${e.message}` });
    }
  }
  return results;
}
