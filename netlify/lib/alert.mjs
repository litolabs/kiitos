// Emails the owner when a new testimonial arrives, using Netlify's own form
// notifications. Each new testimonial is sent as one entry of the hidden
// "new-testimonial" form (public/forms/alerts.html), and Netlify emails it on.
// The submitter's email address is never included.

const SNIPPET = 300;
const TIMEOUT_MS = 3000;

export async function sendAlert(req, { testimonial, form }) {
  const site = new URL(req.url).origin;
  const text = testimonial.body.replace(/\s+/g, " ").trim();
  const fields = new URLSearchParams({
    "form-name": "new-testimonial",
    name: testimonial.name,
    programme: form.title,
    stars: testimonial.rating ? `${"★".repeat(testimonial.rating)}${"☆".repeat(5 - testimonial.rating)} (${testimonial.rating} of 5)` : "No rating asked",
    snippet: text.length > SNIPPET ? `${text.slice(0, SNIPPET - 1).replace(/\s+\S*$/, "")}…` : text,
    link: `${site}/admin#/t/${testimonial.id}`,
  });
  // An alert that fails must never stop the testimonial being saved.
  try {
    await fetch(`${site}/forms/alerts.html`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: fields,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.warn("New testimonial alert not sent:", e.message);
  }
}
