# Gradio Hub — نسخة HF Space (الرابط الدائم)

نسخة الـ Hub الدائم على Hugging Face Spaces — رابط ثابت `*.hf.space`
ما بيتغيرش، شغال بالـ APIs المجانية، ومفيش فيه أي مفتاح.

## الفرق عن نسخة Kaggle (`../app.py`)

- **Nvidia و OpenRouter بيتكلموا الـ API مباشرة** (OpenAI-compatible)
  بدل سكربتات الـ Connectors — عشان كده كانوا حمرا على Kaggle،
  وهنا بيشتغلوا بستريمينج زي باقي الباك-إندز.
- مفيش `subprocess` ولا اعتماد على جهاز Muse خالص.
- الـ GPU (Kaggle/Colab) و Altare مطفية افتراضيًا — بتتفتح بس لو
  اتحط عنوان الجلسة في الـ Secrets.
- مفيش أي دالة `@spaces.GPU` — الـ Space ده CPU بس، فمش بيستهلك
  حصة الـ 5 دقايق GPU اليومية.

## إنشاء الـ Space (خطوة ب1 في الخطة)

1. افتح https://huggingface.co/new-space — اختار:
   - **SDK: Gradio** — **Hardware: ZeroGPU** (المجاني)
   - اسم الـ Space (مثلًا `gradio-hub`)
   - ⚠️ حساب Hugging Face لازم يبقى موثّق وعمره **أكتر من 30 يوم**
     عشان الـ ZeroGPU المجاني — لو حسابك أصغر، الـ Space مش هيتفتح
     مجانًا، والبديل هو Oracle (المرحلة ب2 في الخطة).
2. ارفع الملفات دي في الـ Space: `app.py` + `requirements.txt`
   (من الفولدر ده — مفيش أي ملف تاني مطلوب).
3. في إعدادات الـ Space → **Settings → Variables and Secrets**،
   ضيف الـ Secrets دي (القيم من الـ Secure Vault — متتكتبش في أي ملف):
   - `GROQ_API_KEY` — بيبدأ بـ `gsk_`
   - `GEMINI_API_KEY` — بيبدأ بـ `AIza`
   - `NVIDIA_API_KEY` — مفتاح Nvidia NIM (الموجود، بينتهي بـ D0xU)
   - `OPENROUTER_API_KEY` — بيبدأ بـ `sk-or-v1-`
   - `HUB_AUTH_USER` — مثلًا `aziz`
   - `HUB_AUTH_PASSWORD` — باسورد الرابط العام (اختار واحد قوي)
4. اعمل **Factory Reboot** للـ Space بعد إضافة الـ Secrets، وافتح
   الرابط `https://<user>-<space>.hf.space` من التليفون على الداتا.

## اختبار القبول (لازم يعدّي قبل ما الرابط يتسلّم)

- الرابط بيفتح من التليفون وبيطلب الباسورد.
- زرار «تحديث الحالة»: Groq و Gemini و Nvidia و OpenRouter 🟢.
- ابعت «أهلا» على Groq — رد ستريمينج كامل في أقل من ثانية.
- ابعت سؤال على Gemini — لازم يرد.
- الـ Space **مش** بيستهلك حصة الـ 5 دقايق GPU — لو استهلكها أو
  الـ Space نام ومصحاش، انتقل لـ Oracle فورًا (ب2).

## لو جلسة GPU شغالة وعايز تضيفها

في الـ Secrets ضيف `KAGGLE_URL` (رابط Ollama بتاع الجلسة، مثلًا
`http://<host>:11434`) + `KAGGLE_ENABLED=1` — وبعدين Factory Reboot.
نفس الحكاية لـ Colab (`COLAB_URL` + `COLAB_ENABLED=1`) و Altare
(`ALTARE_URL` + `ALTARE_ENABLED=1`).

## ملحوظة مهمة

الرابط **الدائم** هنا هو رابط الـ Hub نفسه. الموديل التقيل Qwen3.8-27B
على الـ GPU هيفضل مؤقت بطبيعته (جلسات Kaggle/Colab بتقفل)، والـ Hub
بيبدّل تلقائيًا للـ APIs لما الجلسة تقفل — فالشات مبيقفش.
