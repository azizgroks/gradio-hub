"""
Gradio Hub — نسخة HF Space (الرابط الدائم)
===========================================
نفس واجهة الـ Hub في `../app.py`، بس معدّلة عشان تشتغل على Hugging Face
Spaces بلا أي اعتماد على جهاز Muse:

- مفيش Connector ولا subprocess ولا سكربتات اختبار — كل باك-إند API
  بيتكلم OpenAI-compatible مباشرة بمفتاح من Secrets بتاعة الـ Space.
  ده بالذات بيصلّح Nvidia و OpenRouter: في نسخة Kaggle كانوا حمرا
  لأن الـ Hub كان بينادي سكربتات Connectors مش موجودة على Kaggle —
  هنا بيتنادوا مباشرة، وبستريمينج كمان.
- مفيش أي مفتاح أو باسورد في الملف ده — كلها من Secrets (متغيرات بيئة)
  بتتظبط في إعدادات الـ Space. شوف README.md.
- باك-إندز الـ GPU (Colab/Kaggle) والـ Altare مطفية افتراضيًا هنا:
  بتتفتح بس لو اتحط عنوانها في Secrets (KAGGLE_URL / COLAB_URL /
  ALTARE_URL) — يعني الـ Space نفسه شغال دايمًا بالـ APIs، والـ GPU
  بينضم لما جلسته تكون شغالة.
- مفيش أي دالة `@spaces.GPU` — الـ Space ده CPU بس، فمش بيستهلك
  حصة الـ 5 دقايق GPU اليومية (دي نقطة الاختبار في الخطة ب1).

Backends (الترتيب = ترتيب الـ Fallback الافتراضي — خطة v2 §1.4):
  1. groq        — qwen/qwen3.8-27b — API مجاني (1,000 طلب/يوم/موديل)
  2. gemini      — gemini-3.5-flash-lite — API مجاني (500/يوم)
  3. nvidia-nim   — nemotron-3.5-bolt-e4b — API مباشر (كريدت محدود)
  4. openrouter   — ernie-5.5-flash-preview:free — API مباشر (50/يوم)
  5. kaggle-gpu   — Qwen3.8-27B — Ollama على Kaggle T4 (اختياري، جلسة مؤقتة)
  6. colab-gpu    — Qwen3.8-27B — Ollama على Colab T4 (اختياري، جلسة مؤقتة)
  7. altare-llm   — WhiteRabbitNeo 7B — llama.cpp على Altare (اختياري)
"""

import json
import os
import time

import requests
import gradio as gr

# ---------------------------------------------------------------------------
# الإعدادات — من البيئة (Secrets بتاعة الـ Space) بس. مفيش أي مفتاح هنا.
# ---------------------------------------------------------------------------

REQUEST_TIMEOUT_FIRST_TOKEN = int(os.getenv("HUB_FIRST_TOKEN_TIMEOUT", "120"))
HEALTH_TIMEOUT = int(os.getenv("HUB_HEALTH_TIMEOUT", "10"))
DEFAULT_MAX_TOKENS = int(os.getenv("HUB_MAX_TOKENS", "1024"))


def _env(name, default=""):
    value = os.getenv(name, default)
    return value.strip() if isinstance(value, str) else value


BACKENDS = [
    {
        "id": "groq",
        "label": "Groq — Qwen3.8-27B API (أسرع مجاني، 1000/يوم)",
        "kind": "openai",
        "base_url": "https://api.groq.com/openai/v1",
        "model": _env("GROQ_MODEL", "qwen/qwen3.8-27b"),
        "api_key": _env("GROQ_API_KEY", ""),
        "requires_key": True,
        "enabled": _env("GROQ_ENABLED", "1") == "1",
    },
    {
        "id": "gemini",
        "label": "Gemini — Flash-Lite (500/يوم)",
        "kind": "openai",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "model": _env("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        "api_key": _env("GEMINI_API_KEY", ""),
        "requires_key": True,
        "enabled": _env("GEMINI_ENABLED", "1") == "1",
    },
    {
        "id": "nvidia-nim",
        "label": "Nvidia NIM — Nemotron Bolt (سريع، كريدت محدود)",
        "kind": "openai",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "model": _env("NVIDIA_MODEL", "nvidia/nemotron-3.5-bolt-e4b"),
        "api_key": _env("NVIDIA_API_KEY", ""),
        "requires_key": True,
        "enabled": _env("NVIDIA_ENABLED", "1") == "1",
    },
    {
        "id": "openrouter",
        "label": "OpenRouter :free — ERNIE Flash (آخر ورقة، 50/يوم)",
        "kind": "openai",
        "base_url": "https://openrouter.ai/api/v1",
        "model": _env("OPENROUTER_MODEL", "baidu/ernie-5.5-flash-preview:free"),
        "api_key": _env("OPENROUTER_API_KEY", ""),
        "requires_key": True,
        "enabled": _env("OPENROUTER_ENABLED", "1") == "1",
    },
    {
        "id": "kaggle-gpu",
        "label": "Qwen3.8-27B — Kaggle GPU (T4)",
        "kind": "ollama",
        "base_url": _env("KAGGLE_URL", "http://REPLACE-ME-kaggle:11434"),
        "model": _env("KAGGLE_MODEL", "hf.co/Blackfrost-AI/Qwen3.8-27B-ABLITERATED-GGUF:Qwen3.8-27B-ABLITERATED-Q3_K_M.gguf"),
        "api_key": "",
        "enabled": _env("KAGGLE_ENABLED", "0") == "1",
    },
    {
        "id": "colab-gpu",
        "label": "Qwen3.8-27B — Colab GPU (الأقوى)",
        "kind": "ollama",
        "base_url": _env("COLAB_URL", "http://REPLACE-ME-colab:11434"),
        "model": _env("COLAB_MODEL", "hf.co/Blackfrost-AI/Qwen3.8-27B-ABLITERATED-GGUF:Qwen3.8-27B-ABLITERATED-Q3_K_M.gguf"),
        "api_key": "",
        "enabled": _env("COLAB_ENABLED", "0") == "1",
    },
    {
        "id": "altare-llm",
        "label": "WhiteRabbitNeo 7B — Altare (بطيء، شغال طول الوقت)",
        "kind": "openai",
        "base_url": _env("ALTARE_URL", "http://REPLACE-ME-altare:8080/v1"),
        "model": _env("ALTARE_MODEL", "whiterabbitneo-7b"),
        "api_key": _env("ALTARE_API_KEY", ""),
        "enabled": _env("ALTARE_ENABLED", "0") == "1",
    },
]

SYSTEM_PROMPT = (
    "You are a helpful assistant. Answer in the same language as the user. "
    "Keep answers short unless the user asks for detail. /no_think"
)


def is_configured(backend):
    """الباك-إند متظبط ولا لسه عنوان وهمي / ناقصه مفتاح؟"""
    if not backend["enabled"]:
        return False
    if "REPLACE-ME" in backend["base_url"]:
        return False
    if backend["kind"] == "openai" and backend.get("requires_key") and not backend["api_key"]:
        return False
    return True


def health_check(backend):
    """فحص سريع: هل الباك-إند بيرد؟ بيرجع (ok: bool, note: str)."""
    if not is_configured(backend):
        return False, "مش متظبط (عنوان وهمي أو مفتاح ناقص)"
    # Ollama: الـ base_url من غير /v1، فالمسار /v1/models.
    # أما الـ openai: الـ base_url فيه /v1 أصلاً، فالمسار /models.
    path = "/v1/models" if backend["kind"] == "ollama" else "/models"
    url = backend["base_url"].rstrip("/") + path
    headers = {}
    if backend["api_key"]:
        headers["Authorization"] = "Bearer " + backend["api_key"]
    try:
        resp = requests.get(url, headers=headers, timeout=HEALTH_TIMEOUT)
        if resp.status_code == 200:
            return True, "شغال"
        return False, "HTTP %s" % resp.status_code
    except requests.exceptions.Timeout:
        return False, "تايم أوت"
    except requests.exceptions.RequestException as exc:
        return False, "مش واصل: %s" % type(exc).__name__


def status_table():
    """جدول حالة كل الباك-إندز — للعرض في الواجهة."""
    rows = []
    for backend in BACKENDS:
        ok, note = health_check(backend)
        lamp = "🟢" if ok else "🔴"
        rows.append("| %s %s | %s | %s |" % (lamp, backend["label"], backend["model"], note))
    header = "| الباك-إند | الموديل | الحالة |\n|---|---|---|\n"
    return header + "\n".join(rows)


def _openai_stream(backend, messages):
    """ستريمينج من أي باك-إند OpenAI-compatible. بيعمل yield للنص الجزئي."""
    url = backend["base_url"].rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if backend["api_key"]:
        headers["Authorization"] = "Bearer " + backend["api_key"]
    payload = {
        "model": backend["model"],
        "messages": messages,
        "stream": True,
        "temperature": 0.7,
        "max_tokens": DEFAULT_MAX_TOKENS,
    }
    with requests.post(
        url, headers=headers, json=payload, stream=True,
        timeout=REQUEST_TIMEOUT_FIRST_TOKEN,
    ) as resp:
        resp.raise_for_status()
        full = ""
        for raw_line in resp.iter_lines(decode_unicode=True):
            if not raw_line:
                continue
            line = raw_line.strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
            except ValueError:
                continue
            choices = chunk.get("choices") or []
            if not choices:
                continue
            delta = (choices[0].get("delta") or {}).get("content") or ""
            if delta:
                full += delta
                yield full
        if not full:
            yield "(الباك-إند رد من غير نص — جرّب تاني أو بدّل الباك-إند)"
        else:
            yield full


def _ollama_stream(backend, messages):
    """Ollama — بيتكلم OpenAI-compatible الأول، ولو فشل يقع على /api/chat."""
    try:
        yield from _openai_stream(backend, messages)
        return
    except requests.exceptions.HTTPError:
        pass  # هنقع على /api/chat تحت
    url = backend["base_url"].rstrip("/") + "/api/chat"
    payload = {
        "model": backend["model"],
        "messages": messages,
        "stream": True,
        "options": {"temperature": 0.7, "num_ctx": 4096, "num_predict": DEFAULT_MAX_TOKENS},
    }
    with requests.post(url, json=payload, stream=True,
                       timeout=REQUEST_TIMEOUT_FIRST_TOKEN) as resp:
        resp.raise_for_status()
        full = ""
        for raw_line in resp.iter_lines(decode_unicode=True):
            if not raw_line:
                continue
            try:
                data = json.loads(raw_line)
            except ValueError:
                continue
            chunk = (data.get("message") or {}).get("content") or ""
            if chunk:
                full += chunk
                yield full
        yield full or "(الباك-إند رد من غير نص — جرّب تاني أو بدّل الباك-إند)"


def stream_from(backend, messages):
    if backend["kind"] == "ollama":
        yield from _ollama_stream(backend, messages)
    else:
        yield from _openai_stream(backend, messages)


def fallback_order(selected_id):
    """المختار أولاً، وبعدين باقي الباك-إندز المتظبطة بالترتيب الافتراضي."""
    by_id = {b["id"]: b for b in BACKENDS}
    order = []
    if selected_id in by_id:
        order.append(by_id[selected_id])
    for backend in BACKENDS:
        if backend["id"] != selected_id:
            order.append(backend)
    return [b for b in order if is_configured(b)]


def chat_fn(message, history, backend_id):
    """دالة الشات — ستريمينج + Fallback تلقائي."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in history or []:
        if isinstance(turn, dict):
            messages.append({"role": turn.get("role", "user"),
                             "content": turn.get("content", "")})
        elif isinstance(turn, (list, tuple)) and len(turn) == 2:
            messages.append({"role": "user", "content": turn[0] or ""})
            messages.append({"role": "assistant", "content": turn[1] or ""})
    messages.append({"role": "user", "content": message})

    tried = []
    pending_note = ""
    for backend in fallback_order(backend_id):
        tried.append(backend["label"])
        try:
            got_anything = False
            for partial in stream_from(backend, messages):
                got_anything = True
                yield (pending_note + "\n\n" + partial) if pending_note else partial
            if got_anything:
                return
        except Exception as exc:  # noqa: BLE001 — أي فشل = جرّب اللي بعده
            pending_note = "\n\n_(%s وقع: %s — بنجرّب اللي بعده…)_" % (
                backend["label"], type(exc).__name__)
            time.sleep(0.5)
            continue
    yield (
        "كل الباك-إندز المتظبطة واقفة دلوقتي.\n"
        "اللي اتجرّب: %s\n"
        "اتأكد من الـ Secrets في إعدادات الـ Space، وبعدين دوس «تحديث الحالة»."
        % ("، ".join(tried) if tried else "مفيش أي باك-إند متظبط — ظبط الـ Secrets في إعدادات الـ Space")
    )


def build_demo():
    choices = [(b["label"], b["id"]) for b in BACKENDS]
    with gr.Blocks(title="Gradio Hub — كل الموديلات في واجهة واحدة") as demo:
        gr.Markdown(
            "# 🧭 Gradio Hub — كل الموديلات في واجهة واحدة\n"
            "اختار باك-إند، أو سيبها على «تلقائي» والـ Hub يختار الشغال.\n"
            "لو الباك-إند وقع في النص، الـ Hub بيكمّل من اللي بعده لوحده."
        )
        with gr.Row():
            backend_dd = gr.Dropdown(
                choices=choices,
                value="groq",
                label="الباك-إند (الموديل)",
            )
            refresh_btn = gr.Button("🔄 تحديث الحالة", size="sm")
        status_md = gr.Markdown(status_table())
        chatbot = gr.Chatbot(label="الشات", height=480)
        msg = gr.Textbox(label="اكتب رسالتك…", placeholder="اكتب هنا واضغط Enter")
        with gr.Row():
            send_btn = gr.Button("إرسال", variant="primary")
            clear_btn = gr.Button("مسح الشات")

        def _send(user_msg, history, backend_id):
            if not user_msg or not user_msg.strip():
                yield history
                return
            history = list(history or []) + [
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": ""},
            ]
            for partial in chat_fn(user_msg, history[:-2], backend_id):
                history[-1] = {"role": "assistant", "content": partial}
                yield history

        msg.submit(_send, [msg, chatbot, backend_dd], [chatbot]).then(
            lambda: "", None, [msg])
        send_btn.click(_send, [msg, chatbot, backend_dd], [chatbot]).then(
            lambda: "", None, [msg])
        clear_btn.click(lambda: [], None, [chatbot])
        refresh_btn.click(lambda: status_table(), None, [status_md])
    return demo


demo = build_demo()

if __name__ == "__main__":
    auth = None
    user = _env("HUB_AUTH_USER", "")
    password = _env("HUB_AUTH_PASSWORD", "")
    if user and password:
        auth = (user, password)
    demo.launch(
        server_name=_env("HUB_HOST", "0.0.0.0"),
        server_port=int(_env("HUB_PORT", "7860")),
        share=_env("HUB_SHARE", "false").lower() == "true",
        auth=auth,
    )
