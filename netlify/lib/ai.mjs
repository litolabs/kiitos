// The AI helpers: highlight suggestions and themes.
//
// Uses Netlify's AI Gateway, which hands the function its Claude credentials
// automatically, so there's no API key to manage. If the owner ever sets their own
// ANTHROPIC_API_KEY in Netlify, that one is used instead. Set AI_MODEL to
// pin a particular model.

import Anthropic from "@anthropic-ai/sdk";

// Fast, low-cost models first. The first one the gateway accepts is kept.
const MODELS = [process.env.AI_MODEL, "claude-haiku-5-5", "claude-haiku-4-5", "claude-sonnet-4-5"].filter(Boolean);
let workingModel = null;

// Who the testimonials are about, from Settings. Falls back to plain words
// when the owner hasn't filled it in yet.
export const ownerFrom = (settings = {}) => ({
  name: String(settings.ownerName || "").trim(),
  role: String(settings.ownerRole || "").trim() || "coach",
});
const ownerPhrase = (o) => (o.name ? `${o.name}, a ${o.role}` : `a ${o.role}`);
const ownerName = (o) => o.name || "the owner";

export const aiAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_BASE_URL);

// Asks Claude to fill in one tool call, so the answer always comes back as
// tidy JSON in the shape we asked for.
async function ask({ system, prompt, content, schema, maxTokens = 2000 }) {
  const client = new Anthropic({ timeout: 50000, maxRetries: 1 });
  const tool = { name: "answer", description: "Return the answer.", input_schema: schema };
  let lastError;
  for (const model of workingModel ? [workingModel] : MODELS) {
    try {
      const message = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: "answer" },
        messages: [{ role: "user", content: content || prompt }],
      });
      workingModel = model;
      const use = message.content.find((block) => block.type === "tool_use");
      if (!use) throw new Error("The AI didn't send an answer back.");
      return use.input;
    } catch (e) {
      lastError = e;
      // Only move on to the next model when this one isn't offered.
      if (!(e.status === 404 || (e.status === 400 && /model/i.test(e.message)))) break;
    }
  }
  throw lastError;
}

// Compares text loosely (spacing and curly quotes ignored), so we can check a
// suggestion really is their own words.
const loose = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

// Up to three pull quote suggestions per testimonial, each word for word
// from what they wrote.
export async function suggestHighlights(testimonials, owner = ownerFrom()) {
  const input = await ask({
    system:
      `You help ${ownerPhrase(owner)} pick pull quotes from client testimonials. ` +
      "A great pull quote is one short, vivid sentence about a real change or feeling, " +
      "the kind that makes a stranger want the same result. Avoid greetings, thank-yous on their own, and vague praise.",
    prompt:
      "For each testimonial below, pick up to 3 pull quote options, best first. " +
      "Copy each one word for word from the testimonial, with no changes, no added words and no quotation marks. " +
      "Each should be between 6 and 30 words, ideally a single sentence.\n\n" +
      testimonials.map((t) => `<testimonial id="${t.id}">\n${t.body}\n</testimonial>`).join("\n\n"),
    schema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, quotes: { type: "array", items: { type: "string" } } },
            required: ["id", "quotes"],
          },
        },
      },
      required: ["results"],
    },
  });

  return testimonials.map((t) => {
    const found = (input.results || []).find((r) => r.id === t.id);
    const body = loose(t.body);
    const quotes = [...new Set((found?.quotes || [])
      .map((q) => String(q).replace(/\s+/g, " ").trim().replace(/^["“'‘]+|["”'’]+$/g, ""))
      .filter((q) => q.length >= 15 && q.length <= 280 && body.includes(loose(q))))].slice(0, 3);
    return { id: t.id, quotes };
  });
}

// Finds the handful of things people keep talking about.
export async function discoverThemes(testimonials, owner = ownerFrom()) {
  const input = await ask({
    system: `You help ${ownerPhrase(owner)} understand what clients say about working with them. Use British spelling.`,
    prompt:
      "Read these testimonials and name the 6 to 8 themes that come up most often. " +
      "Each name should be 2 to 4 words in sentence case, warm and plain, like \"Clarity and direction\" or \"Community and support\". " +
      "Make the themes distinct from each other.\n\n" +
      testimonials.map((t) => `<testimonial>\n${t.body.slice(0, 700)}\n</testimonial>`).join("\n"),
    schema: {
      type: "object",
      properties: {
        themes: {
          type: "array",
          items: { type: "object", properties: { name: { type: "string" }, about: { type: "string" } }, required: ["name", "about"] },
        },
      },
      required: ["themes"],
    },
    maxTokens: 1500,
  });
  const names = new Set();
  return (input.themes || [])
    .map((t) => ({ name: String(t.name || "").trim().slice(0, 40), about: String(t.about || "").trim().slice(0, 200) }))
    .filter((t) => t.name && !names.has(t.name.toLowerCase()) && names.add(t.name.toLowerCase()))
    .slice(0, 8);
}

// Sorts each testimonial into up to three of the themes.
export async function assignThemes(testimonials, themes, owner = ownerFrom()) {
  const input = await ask({
    system: `You sort client testimonials for ${ownerPhrase(owner)} into themes.`,
    prompt:
      "Themes:\n" + themes.map((t) => `- ${t.name}: ${t.about}`).join("\n") +
      "\n\nFor each testimonial, list the themes it clearly talks about, up to 3, using the theme names exactly. " +
      "Use an empty list if none fit.\n\n" +
      testimonials.map((t) => `<testimonial id="${t.id}">\n${t.body.slice(0, 1500)}\n</testimonial>`).join("\n\n"),
    schema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, themes: { type: "array", items: { type: "string" } } },
            required: ["id", "themes"],
          },
        },
      },
      required: ["results"],
    },
  });
  const allowed = new Map(themes.map((t) => [t.name.toLowerCase(), t.name]));
  return testimonials.map((t) => {
    const found = (input.results || []).find((r) => r.id === t.id);
    const picked = (found?.themes || []).map((name) => allowed.get(String(name).trim().toLowerCase())).filter(Boolean);
    return { id: t.id, themes: [...new Set(picked)].slice(0, 3), sorted: Boolean(found) };
  });
}

// ---------- Voice of Customer ----------

export const VOICE_KINDS = {
  talk: { title: "What they talk about", ask: "Find the 5 to 8 topics these testimonials keep returning to, most common first." },
  love: { title: "What they love", ask: "Find the 5 to 8 things clients love most about working with OWNER, the positives that come up most often, most common first." },
  improve: {
    title: "What to improve",
    ask: "Find what clients would like to be better, wished were different, or found hard about the programme itself. " +
      "Only include points the testimonials actually raise. Most testimonials are positive, so if there are few or none, return fewer points (or none) and say so plainly in the summary. Never invent criticism.",
  },
  before: { title: "Life before you", ask: "Find the 5 to 8 things clients were struggling with before they worked with OWNER, most common first. Describe their situation in their terms, not OWNER's." },
  words: {
    title: "Words they use",
    ask: "Find 8 to 12 short, distinctive phrases clients use that are worth borrowing for sales pages, emails and social posts. " +
      "Each heading must be the phrase itself, copied word for word from a testimonial, 2 to 12 words long. In the detail, say in one sentence where it would work well.",
  },
  ask: { title: "Your question", ask: "" },
};

// One report across a set of testimonials. Every quote is checked against the
// testimonial it claims to come from, so nothing is put in anyone's mouth.
export async function voiceReport({ kind, question, testimonials, programmes, owner = ownerFrom() }) {
  const spec = VOICE_KINDS[kind];
  const task = kind === "ask"
    ? `Answer this question from ${ownerName(owner)} using only what these testimonials say: "${question}". ` +
      "Organise the answer as a few clear points, most important first. If the testimonials don't answer it, say so in the summary and return no points."
    : spec.ask.replaceAll("OWNER", ownerName(owner));
  const input = await ask({
    system:
      `You analyse client testimonials for ${ownerPhrase(owner)}` +
      (programmes.length ? ` whose programmes include ${programmes.join(", ")}` : "") + ". " +
      `Write for ${ownerName(owner)} in warm, plain British English, as a sharp colleague would. No hype, no clichés, no em dashes, and never call their work a product or service. ` +
      "Back every point with short quotes copied word for word from the testimonials, each tagged with the id of the testimonial it came from.",
    prompt:
      `${task}\n\nFor each point give a short heading, one or two sentences of detail, and 1 to 3 supporting quotes of 5 to 30 words. ` +
      "Also give a one or two sentence summary of the overall picture.\n\n" +
      testimonials.map((t) => `<testimonial id="${t.id}" name="${t.name.replace(/"/g, "'")}">\n${t.body.slice(0, 2500)}\n</testimonial>`).join("\n\n"),
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              detail: { type: "string" },
              quotes: {
                type: "array",
                items: { type: "object", properties: { id: { type: "string" }, quote: { type: "string" } }, required: ["id", "quote"] },
              },
            },
            required: ["heading", "detail", "quotes"],
          },
        },
      },
      required: ["summary", "points"],
    },
    maxTokens: 3500,
  });

  const byId = new Map(testimonials.map((t) => [t.id, t]));
  const clean = (v, max) => String(v || "").replace(/\s+/g, " ").trim().replace(/\s*[—–]\s*/g, ", ").slice(0, max);
  const points = (input.points || []).slice(0, 12).map((p) => {
    const quotes = [];
    for (const q of p.quotes || []) {
      const t = byId.get(String(q.id));
      const text = String(q.quote || "").replace(/\s+/g, " ").trim().slice(0, 300).replace(/^["“'‘]+|["”'’]+$/g, "");
      if (t && text.length >= 8 && loose(t.body).includes(loose(text)) && !quotes.some((x) => x.id === t.id)) {
        quotes.push({ id: t.id, name: t.name, quote: text });
      }
    }
    const heading = kind === "words" ? String(p.heading || "").replace(/\s+/g, " ").trim().replace(/^["“'‘]+|["”'’]+$/g, "").slice(0, 160) : clean(p.heading, 160);
    return { heading, detail: clean(p.detail, 600), quotes: quotes.slice(0, 3) };
  }).filter((p) => p.heading && (kind !== "words" || (p.quotes.length && p.quotes.some((q) => loose(q.quote).includes(loose(p.heading)) || loose(byId.get(q.id).body).includes(loose(p.heading))))));
  return { title: spec.title, summary: clean(input.summary, 800), points };
}

// ---------- Reading a screenshot ----------

// Turns a screenshot of a message, post or review into a testimonial draft.
// The owner checks every field before anything is saved.
export async function readScreenshot({ mediaType, data }, owner = ownerFrom()) {
  const input = await ask({
    system: `You help ${ownerPhrase(owner)} turn screenshots of kind messages and reviews into testimonials. Copy the words exactly as written. Never add, polish or invent anything.`,
    content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      { type: "text", text:
        `This is a screenshot of a message, post, email or review, probably praising ${ownerName(owner)}. ` +
        "Pull out the testimonial: the words of the person giving the praise, copied exactly, keeping their paragraph breaks and emojis. " +
        "Leave out timestamps, read receipts, reactions, buttons, names of chats, and anything the owner wrote in reply. " +
        "If the same person sent several messages, join them in order. " +
        "Give their name as shown, a role or business only if the screenshot shows one, a star rating only if one is shown, " +
        "the date only if one is shown (as YYYY-MM-DD), and where it came from. If there's no testimonial in it, leave the words empty." },
    ],
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        role: { type: "string" },
        words: { type: "string" },
        rating: { type: "integer" },
        date: { type: "string" },
        platform: { type: "string", enum: ["WhatsApp", "Instagram", "Facebook", "LinkedIn", "Email", "Google review", "Text message", "Other"] },
      },
      required: ["name", "words", "platform"],
    },
    maxTokens: 1500,
  });
  const rating = Number.isInteger(input.rating) && input.rating >= 1 && input.rating <= 5 ? input.rating : null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date || "") ? input.date : "";
  return {
    name: String(input.name || "").trim().slice(0, 200),
    role: String(input.role || "").trim().slice(0, 200),
    words: String(input.words || "").trim().slice(0, 10000),
    rating, date, platform: String(input.platform || "Other"),
  };
}
