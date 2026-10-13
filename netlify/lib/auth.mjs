// Admin login. One password, stored as the ADMIN_PASSWORD environment
// variable in Netlify. A correct login sets a signed, HttpOnly cookie.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { stores } from "./store.mjs";

const COOKIE = "te_admin";
const SESSION_DAYS = 14;
const LOCKOUT = { maxFails: 5, windowMs: 15 * 60 * 1000 };

const sha256 = (text) => createHash("sha256").update(text).digest();

export const adminPassword = () => process.env.ADMIN_PASSWORD || "";

// The signing key comes from the password, so changing the password
// logs out every existing session.
const signingKey = () => sha256(`te-session:${adminPassword()}`);
const sign = (value) => createHmac("sha256", signingKey()).update(value).digest("base64url");

export function passwordMatches(attempt) {
  return timingSafeEqual(sha256(String(attempt)), sha256(adminPassword()));
}

export function sessionCookie() {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const value = `${expires}.${sign(String(expires))}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
}

export const clearedCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function isLoggedIn(req) {
  if (!adminPassword()) return false;
  const cookies = Object.fromEntries(
    (req.headers.get("cookie") || "").split(/;\s*/).filter(Boolean).map((c) => {
      const i = c.indexOf("=");
      return [c.slice(0, i), c.slice(i + 1)];
    })
  );
  const [expires, signature] = (cookies[COOKIE] || "").split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  const expected = Buffer.from(sign(expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ---------- Lockout after repeated wrong passwords ----------

const lockKey = (ip) => `login-${sha256(`te:${ip || "unknown"}`).toString("hex")}`;

async function recentFails(ip) {
  const fails = (await stores.rateLimits().get(lockKey(ip), { type: "json" })) || [];
  return fails.filter((t) => Date.now() - t < LOCKOUT.windowMs);
}

// Returns how many minutes are left on a lockout, or 0 if not locked.
export async function lockedForMinutes(ip) {
  const fails = await recentFails(ip);
  if (fails.length < LOCKOUT.maxFails) return 0;
  return Math.max(1, Math.ceil((fails[0] + LOCKOUT.windowMs - Date.now()) / 60000));
}

export async function recordFail(ip) {
  const fails = await recentFails(ip);
  await stores.rateLimits().setJSON(lockKey(ip), [...fails, Date.now()]);
  return LOCKOUT.maxFails - fails.length - 1; // tries left
}

export const clearFails = (ip) => stores.rateLimits().delete(lockKey(ip));
