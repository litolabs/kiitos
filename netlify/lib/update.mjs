// Tells the admin when a newer Kiitos is waiting. It reads the version file
// from the public copy, at most once every twelve hours, and never slows the
// admin down: any hiccup just means "no news".

import { stores } from "./store.mjs";
import { UPDATES_FROM, VERSION, isNewer, updateSource } from "./version.mjs";

const KEY = "update-check";
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export async function updateInfo() {
  const source = updateSource(process.env.KIITOS_UPDATES_FROM || UPDATES_FROM);
  if (!source) return null;
  try {
    const store = stores.settings();
    let check = await store.get(KEY, { type: "json" });
    if (!check || Date.now() - check.checkedAt > TWELVE_HOURS) {
      const url = process.env.KIITOS_UPDATES_URL
        || `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.branch}/netlify/lib/version.mjs`;
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return null;
      const latest = /VERSION\s*=\s*"(\d+\.\d+\.\d+)"/.exec(await res.text())?.[1];
      if (!latest) return null;
      check = { latest, checkedAt: Date.now() };
      await store.setJSON(KEY, check);
    }
    return {
      current: VERSION,
      latest: check.latest,
      available: isNewer(check.latest, VERSION),
      notes: `https://github.com/${source.owner}/${source.repo}/blob/${source.branch}/CHANGELOG.md`,
    };
  } catch {
    return null;
  }
}
