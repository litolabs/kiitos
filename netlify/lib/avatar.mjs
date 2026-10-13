// Turns a cropped photo sent from the browser into bytes we can store.

import { randomUUID } from "node:crypto";
import { stores } from "./store.mjs";

const MAX_AVATAR_BYTES = 250 * 1024;

export function decodeAvatar(dataUrl) {
  if (!dataUrl) return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("That photo didn't come through properly. Try another one?");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_AVATAR_BYTES) throw new Error("That photo is a bit too big. Try another one?");
  return { contentType: match[1], bytes };
}

// Saves a photo under a fresh key and returns the key.
export async function saveAvatar({ contentType, bytes }, id = randomUUID()) {
  const key = `${id}.${contentType.split("/")[1]}`;
  await stores.avatars().set(key, bytes, { metadata: { contentType } });
  return key;
}
