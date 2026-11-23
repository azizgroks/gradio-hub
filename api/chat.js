import { BACKENDS, getEnv, authed, needAuth, backendBase, backendKey, backendApiBase } from "./_backends.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  const env = getEnv();
  if (!authed(req, env)) return needAuth();
  let body;
  try { body = await req.json(); } catch (e) {
    return new Response(JSON.stringify({ error: "bad json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const cfg = BACKENDS.find(function (b) { return b.id === body.backend; });
  if (!cfg) {
    return new Response(JSON.stringify({ error: "unknown backend" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const base = backendBase(cfg, env);
  if (cfg.urlEnv && !base) {
    return new Response(JSON.stringify({ error: "kaggle session not running" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const key = backendKey(cfg, env);
  if (!cfg.noKey && !key) {
    return new Response(JSON.stringify({ error: "backend not configured" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const model = (typeof body.model === "string" && body.model.trim() && body.model.length < 200 ? body.model.trim() : null) || env[cfg.modelEnv] || cfg.model;
  const headers = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = "Bearer " + key;
  const upstream = await fetch(backendApiBase(cfg, env) + "/chat/completions", {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      model: model,
      messages: body.messages || [],
      temperature: 0.7,
      max_tokens: 800,
      stream: true,
    }),
  });
  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { "Content-Type": "application/json" } });
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}
