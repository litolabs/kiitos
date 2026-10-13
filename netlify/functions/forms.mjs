// GET /api/forms           -> a list of forms (title and link)
// GET /api/forms/:slug     -> one form plus the public brand settings

import { getFormBySlug, getSettings, listForms } from "../lib/store.mjs";
import { error, json } from "../lib/http.mjs";

function publicSettings(settings) {
  // Never send private settings (like the admin email) to the browser.
  const { brandName, logoUrl, colours, fonts, consent } = settings;
  return { brandName, logoUrl, colours, fonts, consent };
}

export default async (req, context) => {
  if (req.method !== "GET") return error("Method not allowed", 405);

  const slug = context.params?.slug;
  if (!slug) {
    const [forms, settings] = await Promise.all([listForms(), getSettings()]);
    return json({
      settings: publicSettings(settings),
      forms: forms.map(({ slug, title }) => ({ slug, title, url: `/f/${slug}` })),
    });
  }

  const [form, settings] = await Promise.all([getFormBySlug(slug), getSettings()]);
  if (!form) return error("We couldn't find that form.", 404);
  return json({ form, settings: publicSettings(settings) });
};

export const config = { path: ["/api/forms", "/api/forms/:slug"] };
