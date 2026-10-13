// Which Kiitos this is, and where newer versions come from.
//
// VERSION goes up with every release. UPDATES_FROM names the public GitHub
// copy that installs update themselves from, written as "owner/repo@branch".
// It stays empty in the private working repo, which switches updating off.
export const VERSION = "0.2.0";
export const UPDATES_FROM = "litolabs/kiitos@main";

// Turns "owner/repo@branch" into its parts, or null when updating is off.
export function updateSource(from = UPDATES_FROM) {
  const m = /^([\w.-]+)\/([\w.-]+)@([\w./-]+)$/.exec(String(from || "").trim());
  return m ? { owner: m[1], repo: m[2], branch: m[3] } : null;
}

// True when version a is newer than version b ("0.10.0" beats "0.9.2").
export function isNewer(a, b) {
  const parts = (v) => String(v || "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}
