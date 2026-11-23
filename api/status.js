import { BACKENDS, getEnv, authed, needAuth, backendBase, backendKey, backendApiBase } from "./_backends.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  const env = getEnv();
  if (!authed(req, env)) return needAuth();
  const out = {};
  for (const b of BACKENDS) {
    const def = env[b.modelEnv] || b.model;
    const base = backendBase(b, env);
    if (b.urlEnv && !base) { out[b.id] = { name: b.name, ok: false, reason: "no session", models: [def] }; continue; }
    const key = backendKey(b, env);
    if (!b.noKey && !key) { out[b.id] = { name: b.name, ok: false, reason: "no key", models: [def] }; continue; }
    if (b.probe === "key") {
      // Key is set: green, and best-effort fetch the live model list.
      let models = [def];
      try {
        const r = await fetch(backendApiBase(b, env) + "/models", {
          headers: key ? { "Authorization": "Bearer " + key } : {},
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) {
          const j = await r.json();
          const ids = (j.data || []).map(function (m) { return m.id; }).filter(Boolean);
          if (ids.length) models = [def].concat(ids.filter(function (id) { return id !== def; })).slice(0, 60);
        }
      } catch (e) {}
      out[b.id] = { name: b.name, ok: true, reason: "key set", models: models };
      continue;
    }
    try {
      const headers = key ? { "Authorization": "Bearer " + key } : {};
      const r = await fetch(backendApiBase(b, env) + "/models", {
        headers: headers,
        signal: AbortSignal.timeout(5000),
      });
      let models = [def];
      if (r.ok) {
        const j = await r.json();
        let data = j.data || [];
        // OpenRouter lists paid models too: keep only the free ones (price 0).
        if (b.id === "openrouter") {
          data = data.filter(function (m) { return m.pricing && m.pricing.prompt === "0" && m.pricing.completion === "0"; });
        }
        const ids = data.map(function (m) { return m.id; }).filter(Boolean);
        if (ids.length) models = [def].concat(ids.filter(function (id) { return id !== def; })).slice(0, 60);
      }
      out[b.id] = { name: b.name, ok: r.ok, reason: r.ok ? "" : ("HTTP " + r.status), models: models };
    } catch (e) {
      out[b.id] = { name: b.name, ok: false, reason: "timeout", models: [def] };
    }
  }
  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
