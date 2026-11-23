// Shared backends + auth for the Vercel edge functions (api/status.js, api/chat.js).
// Same 4 backends as the Cloudflare Worker / Deno port. Keys come from Vercel
// Environment Variables — never in this file.

export const BACKENDS = [
  { id: "groq", name: "Groq — Qwen3.8-27B", base: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", key: "GROQ_API_KEY", modelEnv: "GROQ_MODEL" },
  { id: "gemini", name: "Gemini — 3.5 Flash-Lite", base: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.5-flash-lite", key: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL" },
  { id: "nvidia", name: "Nvidia NIM — Nemotron 3.5 Bolt", base: "https://integrate.api.nvidia.com/v1", model: "nvidia/nemotron-3.5-bolt-e4b", key: "NVIDIA_API_KEY", modelEnv: "NVIDIA_MODEL" },
  { id: "tokenharbor", name: "Token Harbor — DeepSeek V4.1 Flash (Free)", base: "https://tokenharbor.ai/v1", model: "deepseek-v4.1-flash:free", key: "TOKENHARBOR_API_KEY", modelEnv: "TOKENHARBOR_MODEL", probe: "key" },
];

export function getEnv() {
  const keys = [
    "GROQ_API_KEY", "GEMINI_API_KEY", "NVIDIA_API_KEY", "TOKENHARBOR_API_KEY",
    "HUB_AUTH_USER", "HUB_AUTH_PASSWORD",
    "GROQ_MODEL", "GEMINI_MODEL", "NVIDIA_MODEL", "TOKENHARBOR_MODEL",
  ];
  const env = {};
  for (const k of keys) env[k] = (typeof process !== "undefined" && process.env && process.env[k]) || "";
  return env;
}

export function authed(req, env) {
  const h = req.headers.get("Authorization") || "";
  const parts = h.split(" ");
  if (parts[0] !== "Basic" || !parts[1]) return false;
  let decoded = "";
  try { decoded = atob(parts[1]); } catch (e) { return false; }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  return decoded.slice(0, i) === env.HUB_AUTH_USER && decoded.slice(i + 1) === env.HUB_AUTH_PASSWORD;
}

export function needAuth() {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="gradio-hub"' },
  });
}
