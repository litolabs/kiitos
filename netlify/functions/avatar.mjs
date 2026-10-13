// GET /api/avatar/:key -> serves a stored profile photo.

import { stores } from "../lib/store.mjs";
import { error } from "../lib/http.mjs";

export default async (req, context) => {
  const key = context.params?.key || "";
  if (!/^[0-9a-f-]{36}\.(jpeg|png|webp|gif)$/.test(key)) return error("Not found", 404);

  const result = await stores.avatars().getWithMetadata(key, { type: "arrayBuffer" });
  if (!result) return error("Not found", 404);

  return new Response(result.data, {
    headers: {
      "content-type": result.metadata?.contentType || "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};

export const config = { path: "/api/avatar/:key" };
