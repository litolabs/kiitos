// GET /api/receipt/:id -> reads a testimonial back out of storage, so the
// thank-you screen can prove it was saved. Private details stay private.

import { stores } from "../lib/store.mjs";
import { UUID_PATTERN, error, json } from "../lib/http.mjs";

export default async (req, context) => {
  const id = context.params?.id || "";
  if (!UUID_PATTERN.test(id)) return error("Not found", 404);

  const t = await stores.testimonials().get(id, { type: "json" });
  if (!t) return error("Not found", 404);

  return json({
    id: t.id,
    name: t.name,
    rating: t.rating,
    status: t.status,
    createdAt: t.createdAt,
    hasPhoto: Boolean(t.avatar),
    tags: t.tags,
  });
};

export const config = { path: "/api/receipt/:id" };
