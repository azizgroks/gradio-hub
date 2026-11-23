import { BACKENDS, getEnv, authed, needAuth, backendBase, backendKey } from "./_backends.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  const env = getEnv();
  if (!authed(req, env)) return needAuth();
  const out = {};
  for (const b of BACKENDS) {
    const base = backendBase(b, env);
    if (b.urlEnv && !base) { out[b.id] = { name: b.name, ok: false, reason: "no session" }; continue; }
    const key = backendKey(b, env);
    if (!b.noKey && !key) { out[b.id] = { name: b.name, ok: false, reason: "no key" }; continue; }
    if (b.probe === "key") { out[b.id] = { name: b.name, ok: true, reason: "key set" }; continue; }
    try {
      const headers = key ? { "Authorization": "Bearer " + key } : {};
      const r = await fetch(base + "/models", {
        headers: headers,
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
