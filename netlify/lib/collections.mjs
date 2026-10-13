// Collections decide which approved testimonials appear on a wall.
// Each one keeps a prebuilt snapshot in the "published" store, so public
// pages never read the admin data directly.

import { purgeCache } from "@netlify/functions";
import { DEFAULT_COLLECTIONS } from "./defaults.mjs";
import { stores } from "./store.mjs";

export const SORTS = ["featured", "newest", "rating", "manual"];
const SEEDED_KEY = "collections-seeded";

export const slugify = (text) =>
  String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export async function listCollections() {
  const store = stores.collections();
  const { blobs } = await store.list();
  if (blobs.length === 0 && !(await stores.settings().get(SEEDED_KEY))) {
    await Promise.all(DEFAULT_COLLECTIONS.map((c) => store.setJSON(c.id, c)));
    await stores.settings().set(SEEDED_KEY, new Date().toISOString());
    return structuredClone(DEFAULT_COLLECTIONS);
  }
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listTestimonials() {
  const store = stores.testimonials();
  const { blobs } = await store.list();
  return (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
}

// ---------- Choosing and ordering ----------

const newest = (a, b) => b.createdAt.localeCompare(a.createdAt);
const featuredFirst = (a, b) => Number(b.featured) - Number(a.featured) || newest(a, b);

export function selectTestimonials(collection, testimonials) {
  const { tags = [], match = "any" } = collection.rule || {};
  const pins = new Set(collection.pins || []);
  const excluded = new Set(collection.exclusions || []);

  const chosen = testimonials.filter((t) => {
    if (t.status !== "approved" || excluded.has(t.id)) return false;
    if (pins.has(t.id) || tags.length === 0) return true;
    const own = t.tags || [];
    return match === "all" ? tags.every((tag) => own.includes(tag)) : tags.some((tag) => own.includes(tag));
  });

  if (collection.sort === "newest") return chosen.sort(newest);
  if (collection.sort === "rating") return chosen.sort((a, b) => (b.rating || 0) - (a.rating || 0) || featuredFirst(a, b));
  if (collection.sort === "manual") {
    const position = new Map((collection.order || []).map((id, i) => [id, i]));
    return chosen.sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity) || featuredFirst(a, b));
  }
  return chosen.sort(featuredFirst);
}

// ---------- What the public sees ----------

const initials = (name) => name.split(/\s+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(" ");

// Only what each person agreed to share. Email never leaves the admin.
export function publicItem(t) {
  const showName = t.consent?.publishName === true;
  const showPhoto = t.consent?.publishPhoto === true;
  return {
    id: t.id,
    name: showName ? t.name : initials(t.name),
    role: showName ? t.role || "" : "",
    website: showName ? t.website || "" : "",
    avatar: showPhoto && t.avatar ? `/api/avatar/${t.avatar}` : "",
    rating: t.rating >= 1 && t.rating <= 5 ? t.rating : null, // imports can arrive without one
    body: t.body,
    highlight: t.highlight || "",
    featured: Boolean(t.featured),
    date: t.createdAt,
  };
}

export function buildSnapshot(collection, testimonials) {
  const items = selectTestimonials(collection, testimonials).map(publicItem);
  // The average only counts testimonials that came with a star rating.
  const rated = items.filter((t) => t.rating);
  const average = rated.length ? Math.round((rated.reduce((sum, t) => sum + t.rating, 0) / rated.length) * 10) / 10 : 0;
  return {
    slug: collection.slug,
    name: collection.name,
    description: collection.description || "",
    wall: collection.wall,
    stats: { count: items.length, average, rated: rated.length },
    items,
    builtAt: new Date().toISOString(),
  };
}

export const cacheTag = (slug) => `wall-${slug}`;

async function purge(tags) {
  try {
    await purgeCache({ tags });
  } catch {
    // Only works on Netlify itself. Locally there is no cache to clear.
  }
}

export async function rebuildSnapshot(collection, testimonials) {
  const list = testimonials || (await listTestimonials());
  const snapshot = buildSnapshot(collection, list);
  await stores.published().setJSON(collection.slug, snapshot);
  await purge([cacheTag(collection.slug)]);
  return snapshot;
}

export async function rebuildAll() {
  const [collections, testimonials] = await Promise.all([listCollections(), listTestimonials()]);
  await Promise.all(collections.map((c) => rebuildSnapshot(c, testimonials)));
}

export async function removeSnapshot(slug) {
  await stores.published().delete(slug);
  await purge([cacheTag(slug)]);
}

export const purgeAllWalls = () => purge(["wall"]);

export async function getSnapshot(slug) {
  const saved = await stores.published().get(slug, { type: "json" });
  if (saved) return saved;
  // First visit to a wall that hasn't been built yet.
  const collection = (await listCollections()).find((c) => c.slug === slug);
  return collection ? rebuildSnapshot(collection) : null;
}
