// api/chat.js
const knowledgeBase = require("../knowledge-base.json");

const ALLOWED_ORIGINS = [
  "https://rema-2004.github.io",
];

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;

function buildSystemPrompt() {
  const sectionsText = knowledgeBase.sections
    .map((s) => `## ${s.heading}\n${s.content}`)
    .join("\n\n");

  return `أنت "المساعد القانوني لمنصة قرار" — مساعد ذكاء اصطناعي مدمج بمنصة قرار، وهي منصة إلكترونية أردنية تعليمية/تجريبية تشرح آلية العملية الانتخابية.

مهمتك: الإجابة على أسئلة الزوّار حول قانون الانتخاب الأردني لمجلس النواب، عمل الهيئة المستقلة للانتخاب، وكيفية استخدام منصة قرار — استنادًا حصرًا إلى قاعدة المعرفة أدناه (${knowledgeBase.law_reference}).

قواعد صارمة:
1. جاوب بالعربية دائمًا.
2. اعتمد فقط على قاعدة المعرفة المرفقة. إذا احتجت رقم مش موجود عندك بثقة، قول بوضوح إنك مو متأكد ووجّه المستخدم لموقع iec.jo. لا تخترع أرقام.
3. لا تقدّم أي رأي سياسي أو تحيّز.
4. إذا سُئلت عن شيء برّه نطاقك، اعتذر بلطف.
5. خلي إجاباتك مختصرة ومباشرة.
6. ذكّر المستخدم أحيانًا إنك أداة تعليمية ومو بديل عن المصدر الرسمي.

--- قاعدة المعرفة ---
${sectionsText}
--- نهاية قاعدة المعرفة ---
(${knowledgeBase.disclaimer})`;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY غير معرّف بإعدادات السيرفر." });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "لازم ترسل رسالة واحدة على الأقل." });
  }

  const trimmedMessages = messages.slice(-20).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 4000),
  }));

  try {
    const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(),
        messages: trimmedMessages,
      }),
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error("Anthropic API error:", apiResponse.status, data);
      return res.status(apiResponse.status).json({
        error: data?.error?.message || "صار خطأ بالتواصل مع Anthropic API.",
      });
    }

    const textBlock = (data.content || []).find((b) => b.type === "text");
    const reply = textBlock ? textBlock.text : "ما قدرت أفهم السؤال، ممكن تعيد صياغته؟";
    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "صار خطأ غير متوقع بالسيرفر." });
  }
};
