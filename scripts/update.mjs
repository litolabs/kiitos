// Runs every time Netlify deploys. If this copy of Kiitos knows where updates
// come from, it fetches the newest version and deploys that, so "redeploy"
// means "update". Testimonials, forms and settings live in Netlify Blobs, so
// nothing here can touch them.
//
// Safe by design: if anything goes wrong, it says so in the deploy log and
// the deploy carries on with the code already here.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const say = (msg) => console.log(`[Kiitos update] ${msg}`);

// Folders and files that make up Kiitos itself. netlify.toml is left alone,
// because Netlify has already read it by the time this runs.
const PARTS = ["public", "netlify", "scripts", "package.json", "package-lock.json", "README.md"];

try {
  const { UPDATES_FROM, VERSION, isNewer, updateSource } = await import(join(root, "netlify/lib/version.mjs"));
  const source = updateSource(process.env.KIITOS_UPDATES_FROM || UPDATES_FROM);
  if (!source) {
    say("Updates are switched off for this copy. Deploying the code as it is.");
  } else {
    const tarball = process.env.KIITOS_UPDATES_TARBALL
      || `https://codeload.github.com/${source.owner}/${source.repo}/tar.gz/refs/heads/${source.branch}`;
    const res = await fetch(tarball, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`the download returned ${res.status}`);
    const work = mkdtempSync(join(tmpdir(), "kiitos-"));
    try {
      execFileSync("tar", ["-xz", "-C", work], { input: Buffer.from(await res.arrayBuffer()) });
      const fresh = join(work, readdirSync(work)[0]);
      // Check it really is Kiitos before replacing anything.
      for (const must of ["public/admin/index.html", "netlify/functions/admin.mjs", "netlify/lib/version.mjs"]) {
        if (!existsSync(join(fresh, must))) throw new Error(`the download is missing ${must}`);
      }
      const latest = /VERSION\s*=\s*"(\d+\.\d+\.\d+)"/.exec(readFileSync(join(fresh, "netlify/lib/version.mjs"), "utf8"))?.[1];
      if (!latest) throw new Error("the download has no version number");

      if (!isNewer(latest, VERSION)) {
        say(`Already up to date, on version ${VERSION}.`);
      } else {
        const lockBefore = existsSync(join(root, "package-lock.json")) ? readFileSync(join(root, "package-lock.json"), "utf8") : "";
        for (const part of PARTS) {
          if (!existsSync(join(fresh, part))) continue;
          rmSync(join(root, part), { recursive: true, force: true });
          cpSync(join(fresh, part), join(root, part), { recursive: true });
        }
        if (readFileSync(join(root, "package-lock.json"), "utf8") !== lockBefore) {
          say("This version needs different building blocks. Installing them.");
          execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: root, stdio: "inherit" });
        }
        say(`Updated from version ${VERSION} to ${latest}.`);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
} catch (e) {
  say(`Couldn't fetch an update (${e.message}). Deploying the code already here.`);
}
