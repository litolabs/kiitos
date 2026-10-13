// POST /api/submit -> saves a new testimonial as "pending".

import { createHash, randomUUID } from "node:crypto";
import { getFormBySlug, getSettings, stores } from "../lib/store.mjs";
import { error, json } from "../lib/http.mjs";
import { decodeAvatar, saveAvatar } from "../lib/avatar.mjs";
import { sendAlert } from "../lib/alert.mjs";

const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 }; // 5 submissions per hour per person
const MAX_ANSWER = 3000;
const MAX_SHORT = 200;

const clean = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

async function isRateLimited(ip) {
  const key = createHash("sha256").update(`te:${ip || "unknown"}`).digest("hex");
  const store = stores.rateLimits();
  const now = Date.now();
  const previous = (await store.get(key, { type: "json" })) || [];
  const recent = previous.filter((t) => now - t < RATE_LIMIT.windowMs);
  if (recent.length >= RATE_LIMIT.max) return true;
  await store.setJSON(key, [...recent, now]);
  return false;
}

export default async (req, context) => {
  if (req.method !== "POST") return error("Method not allowed", 405);

  let input;
  try {
    input = await req.json();
  } catch {
    return error("Something went wrong sending that. Please try again.");
  }

  // Honeypot: a hidden field real people never see. Bots fill it in.
  // Pretend all is well so they move on, but save nothing.
  if (clean(input.fax, 50)) return json({ ok: true, id: randomUUID() });

  const form = await getFormBySlug(clean(input.formSlug, 100));
  if (!form) return error("We couldn't find that form.", 404);

  // Some forms skip the star question. Then a rating is optional.
  const askRating = form.askRating !== false;
  const given_rating = Number(input.rating);
  const validRating = Number.isInteger(given_rating) && given_rating >= 1 && given_rating <= 5;
  if (askRating && !validRating) return error("Please pick a star rating.");
  const rating = validRating ? given_rating : null;

  const name = clean(input.name, MAX_SHORT);
  if (!name) return error("Please add your name.");

  const given = input.answers && typeof input.answers === "object" ? input.answers : {};
  const answers = form.questions.map((q) => ({ id: q.id, prompt: q.prompt, text: clean(given[q.id], MAX_ANSWER) }));
  const missing = form.questions.find((q, i) => q.required && !answers[i].text);
  if (missing) return error(`Please answer "${missing.prompt}"`);

  const email = clean(input.email, MAX_SHORT);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error("That email address doesn't look quite right.");

  let avatar;
  try {
    avatar = decodeAvatar(input.avatar);
  } catch (e) {
    return error(e.message);
  }

  if (await isRateLimited(context.ip)) {
    return error("Woah, that's a lot of testimonials in a row. Please try again in a little while.", 429);
  }

  const settings = await getSettings();
  const id = randomUUID();
  const now = new Date().toISOString();

  const avatarKey = avatar ? await saveAvatar(avatar, id) : "";

  const testimonial = {
    id,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    source: "form",
    formId: form.id,
    name,
    role: clean(input.role, MAX_SHORT),
    email,
    website: clean(input.website, MAX_SHORT),
    avatar: avatarKey,
    rating,
    answers: answers.map(({ id, prompt, text }) => ({ id, prompt, text })),
    body: answers.filter((a) => a.text).map((a) => a.text).join("\n\n"),
    highlight: "",
    tags: [...(form.tags || [])],
    featured: false,
    consent: {
      publishName: input.consent?.publishName === true,
      publishPhoto: input.consent?.publishPhoto === true && Boolean(avatarKey),
      wording: {
        publishName: settings.consent.publishName,
        publishPhoto: settings.consent.publishPhoto,
      },
    },
    video: null,
  };

  await stores.testimonials().setJSON(id, testimonial);
  await sendAlert(req, { testimonial, form });
  return json({ ok: true, id }, 201);
};

export const config = { path: "/api/submit" };
