import { BACKENDS, getEnv, authed, needAuth } from "./_backends.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  const env = getEnv();
  if (!authed(req, env)) return needAuth();
  const out = {};
  for (const b of BACKENDS) {
    const key = env[b.key];
    if (!key) { out[b.id] = { name: b.name, ok: false, reason: "no key" }; continue; }
    if (b.probe === "key") { out[b.id] = { name: b.name, ok: true, reason: "key set" }; continue; }
    try {
      const r = await fetch(b.base + "/models", {
        headers: { "Authorization": "Bearer " + key },
        signal: AbortSignal.timeout(5000),
      });
      out[b.id] = { name: b.name, ok: r.ok, reason: r.ok ? "" : ("HTTP " + r.status) };
    } catch (e) {
      out[b.id] = { name: b.name, ok: false, reason: "timeout" };
    }
  }
  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
