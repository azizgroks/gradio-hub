// gradio-hub as a Cloudflare Worker — one permanent link, no server, no card, never sleeps.
// Same hub, same backends (Groq, Gemini, Nvidia — OpenAI-compatible), same login.
// Env vars (Worker Secrets): GROQ_API_KEY, GEMINI_API_KEY, NVIDIA_API_KEY,
// HUB_AUTH_USER, HUB_AUTH_PASSWORD. Optional model overrides: GROQ_MODEL, GEMINI_MODEL, NVIDIA_MODEL.
// OpenRouter can be added later by adding one entry to BACKENDS + OPENROUTER_API_KEY secret.

const BACKENDS = [
  { id: "groq", name: "Groq — Qwen3.8-27B", base: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", key: "GROQ_API_KEY", modelEnv: "GROQ_MODEL" },
  { id: "gemini", name: "Gemini — 3.5 Flash-Lite", base: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.5-flash-lite", key: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL" },
  { id: "nvidia", name: "Nvidia NIM — Nemotron 3.5 Bolt", base: "https://integrate.api.nvidia.com/v1", model: "nvidia/nemotron-3.5-bolt-e4b", key: "NVIDIA_API_KEY", modelEnv: "NVIDIA_MODEL" },
];

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function authed(request, env) {
  const h = request.headers.get("Authorization") || "";
  const parts = h.split(" ");
  if (parts[0] !== "Basic" || !parts[1]) return false;
  let decoded = "";
  try { decoded = atob(parts[1]); } catch (e) { return false; }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  return decoded.slice(0, i) === env.HUB_AUTH_USER && decoded.slice(i + 1) === env.HUB_AUTH_PASSWORD;
}

function needAuth() {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="gradio-hub"' },
  });
}

async function handleStatus(env) {
  const out = {};
  for (const b of BACKENDS) {
    const key = env[b.key];
    if (!key) { out[b.id] = { name: b.name, ok: false, reason: "no key" }; continue; }
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
  return json(out);
}

async function handleChat(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  const cfg = BACKENDS.find(function (b) { return b.id === body.backend; });
  if (!cfg) return json({ error: "unknown backend" }, 400);
  const key = env[cfg.key];
  if (!key) return json({ error: "backend not configured" }, 400);
  const model = env[cfg.modelEnv] || cfg.model;
  const upstream = await fetch(cfg.base + "/chat/completions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model,
      messages: body.messages || [],
      temperature: 0.7,
      max_tokens: 1024,
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

function page() {
  return "<!DOCTYPE html>\n<html lang=\"ar\" dir=\"rtl\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>الـ Hub الموحد</title>\n<style>\nbody{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:0}\n.wrap{max-width:720px;margin:0 auto;padding:16px}\nh1{font-size:20px;margin:8px 0}\n.bar{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}\nselect,button,input{font-size:15px;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0}\nbutton{cursor:pointer;background:#2563eb;border-color:#2563eb}\nbutton:disabled{opacity:.5;cursor:wait}\n#status{font-size:13px;line-height:1.9;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:8px 12px;margin:10px 0}\n#log{border:1px solid #334155;border-radius:8px;padding:12px;min-height:300px;background:#020617;white-space:pre-wrap;line-height:1.8}\n.msg{margin:0 0 12px}\n.user{color:#93c5fd}\n.asst{color:#e2e8f0}\n.note{color:#fbbf24;font-size:13px}\n.row{display:flex;gap:8px;margin-top:10px}\n#inp{flex:1}\n</style>\n</head>\n<body>\n<div class=\"wrap\">\n<h1>الـ Hub الموحد</h1>\n<div class=\"bar\">\n<select id=\"backend\">\n<option value=\"groq\">Groq — Qwen3.8-27B</option>\n<option value=\"gemini\">Gemini — 3.5 Flash-Lite</option>\n<option value=\"nvidia\">Nvidia NIM — Nemotron 3.5 Bolt</option>\n</select>\n<button id=\"refresh\">تحديث الحالة</button>\n</div>\n<div id=\"status\">جارٍ فحص الحالة…</div>\n<div id=\"log\"></div>\n<div class=\"row\">\n<input id=\"inp\" placeholder=\"اكتب رسالتك…\" autocomplete=\"off\">\n<button id=\"send\">إرسال</button>\n</div>\n</div>\n<script>\nvar history = [];\nvar order = [\"groq\", \"gemini\", \"nvidia\"];\nfunction el(id){ return document.getElementById(id); }\nfunction addMsg(role, text){\n  var d = document.createElement(\"div\");\n  d.className = \"msg \" + (role === \"user\" ? \"user\" : \"asst\");\n  d.textContent = (role === \"user\" ? \"أنت: \" : \"المساعد: \") + text;\n  el(\"log\").appendChild(d);\n  return d;\n}\nasync function refresh(){\n  el(\"status\").textContent = \"جارٍ فحص الحالة…\";\n  try {\n    var r = await fetch(\"/api/status\");\n    var s = await r.json();\n    var html = \"\";\n    order.forEach(function(id){\n      var b = s[id];\n      if (!b) return;\n      html += (b.ok ? \"🟢 \" : \"🔴 \") + b.name + (b.ok ? \"\" : \" — \" + (b.reason || \"\")) + \"<br>\";\n    });\n    el(\"status\").innerHTML = html || \"لا توجد باك-إندز\";\n  } catch (e) { el(\"status\").textContent = \"تعذر فحص الحالة\"; }\n}\nasync function tryBackend(id, msgs, bubble){\n  var r = await fetch(\"/api/chat\", {\n    method: \"POST\",\n    headers: { \"Content-Type\": \"application/json\" },\n    body: JSON.stringify({ backend: id, messages: msgs }),\n  });\n  if (!r.ok) { var t = await r.text(); throw new Error(\"HTTP \" + r.status + \" \" + t.slice(0, 120)); }\n  var reader = r.body.getReader();\n  var dec = new TextDecoder();\n  var buf = \"\"; var out = \"\";\n  while (true) {\n    var chunk = await reader.read();\n    if (chunk.done) break;\n    buf += dec.decode(chunk.value, { stream: true });\n    var lines = buf.split(\"\\n\");\n    buf = lines.pop();\n    for (var i = 0; i < lines.length; i++) {\n      var line = lines[i].trim();\n      if (line.indexOf(\"data:\") !== 0) continue;\n      var data = line.slice(5).trim();\n      if (data === \"[DONE]\") continue;\n      try {\n        var j = JSON.parse(data);\n        var delta = (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || \"\";\n        if (delta) { out += delta; bubble.textContent = \"المساعد: \" + out; }\n      } catch (e) {}\n    }\n  }\n  return out;\n}\nasync function send(){\n  var inp = el(\"inp\");\n  var text = inp.value.trim();\n  if (!text) return;\n  inp.value = \"\";\n  el(\"send\").disabled = true;\n  history.push({ role: \"user\", content: text });\n  addMsg(\"user\", text);\n  var bubble = addMsg(\"assistant\", \"⏳ جارٍ التفكير…\");\n  var first = el(\"backend\").value;\n  var tries = [first].concat(order.filter(function(x){ return x !== first; }));\n  var ok = false;\n  for (var i = 0; i < tries.length; i++) {\n    try {\n      var out = await tryBackend(tries[i], history, bubble);\n      if (out) {\n        history.push({ role: \"assistant\", content: out });\n        if (tries[i] !== first) {\n          var n = document.createElement(\"div\");\n          n.className = \"msg note\";\n          n.textContent = \"ملاحظة: \" + first + \" لم يرد، فتم الرد عبر \" + tries[i] + \" تلقائيًا.\";\n          el(\"log\").appendChild(n);\n        }\n        ok = true;\n      }\n      break;\n    } catch (e) {\n      bubble.textContent = \"المساعد: ⏳ \" + tries[i] + \" لم يرد، أجرّب البديل…\";\n    }\n  }\n  if (!ok) bubble.textContent = \"المساعد: كل الباك-إندز متوقفة حاليًا. جرّب لاحقًا.\";\n  el(\"send\").disabled = false;\n  inp.focus();\n}\nel(\"send\").addEventListener(\"click\", send);\nel(\"inp\").addEventListener(\"keydown\", function(e){ if (e.key === \"Enter\") send(); });\nel(\"refresh\").addEventListener(\"click\", refresh);\nrefresh();\n</script>\n</body>\n</html>\n";
}

export default {
  async fetch(request, env, ctx) {
    if (!authed(request, env)) return needAuth();
    const url = new URL(request.url);
    if (url.pathname === "/api/status" && request.method === "GET") return handleStatus(env);
    if (url.pathname === "/api/chat" && request.method === "POST") return handleChat(request, env);
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(page(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
  },
};
