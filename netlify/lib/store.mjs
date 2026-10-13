// Everything that talks to Netlify Blobs lives here.
// One store per type of thing, one JSON record per item, keyed by id.

import { getStore } from "@netlify/blobs";
import { DEFAULT_FORMS, DEFAULT_SETTINGS } from "./defaults.mjs";

// Strong consistency means a record can be read back the moment it is saved.
const open = (name) => getStore({ name, consistency: "strong" });

export const stores = {
  testimonials: () => open("testimonials"),
  forms: () => open("forms"),
  settings: () => open("settings"),
  avatars: () => open("avatars"),
  rateLimits: () => open("rate-limits"),
  collections: () => open("collections"),
  published: () => open("published"),
  media: () => open("media"),
};

export async function getSettings() {
  const store = stores.settings();
  const saved = await store.get("site", { type: "json" });
  if (saved) {
    // The consent wording became yes or no questions. Swap the old
    // starter wording for the new questions, but leave custom wording alone.
    const old = saved.consent || {};
    let changed = false;
    for (const key of ["publishName", "publishPhoto"]) {
      if (!old[key] || old[key].startsWith("Yes, you can show my")) {
        old[key] = DEFAULT_SETTINGS.consent[key];
        changed = true;
      }
    }
    if (changed) await store.setJSON("site", { ...saved, consent: old });
    return { ...saved, consent: old };
  }
  await store.setJSON("site", DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function listForms() {
  const store = stores.forms();
  const { blobs } = await store.list();
  let forms = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);

  // The starter form is added once, on a brand new install. After that the
  // forms are entirely the owner's, and deleted ones stay deleted.
  const settings = stores.settings();
  if (!(await settings.get("forms-seeded-ids"))) {
    if (!forms.length) {
      await Promise.all(DEFAULT_FORMS.map((f) => store.setJSON(f.id, f)));
      forms = structuredClone(DEFAULT_FORMS);
    }
    await settings.setJSON("forms-seeded-ids", DEFAULT_FORMS.map((f) => f.id));
  }
  return forms.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getFormBySlug(slug) {
  const forms = await listForms();
  return forms.find((form) => form.slug === slug) || null;
}

// Ids of testimonials deleted for good. Only the id is kept, nothing
// personal, so an import of an old Senja file never brings one back.
const DELETED_KEY = "deleted-testimonial-ids";

export async function deletedIds() {
  return new Set((await stores.settings().get(DELETED_KEY, { type: "json" })) || []);
}

export async function rememberDeleted(id) {
  const ids = await deletedIds();
  ids.add(id);
  await stores.settings().setJSON(DELETED_KEY, [...ids]);
}
