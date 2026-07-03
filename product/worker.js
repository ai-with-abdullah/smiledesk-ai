/**
 * SmileDesk AI — self-serve backend (Cloudflare Worker, free tier)
 *
 * Endpoints:
 *   POST /api/create    — create an assistant from a clinic's form data → returns id + embed code
 *   GET  /api/config    — public config for the widget (name, greeting, color)
 *   POST /api/chat      — chat with an assistant (Gemini free tier)
 *   POST /api/activate  — mark an assistant as paid (you call this after Stripe payment)
 *
 * Bindings required (see DEPLOY.md):
 *   KV namespace: ASSISTANTS
 *   Secret: GEMINI_API_KEY   (free key from aistudio.google.com)
 *   Secret: ADMIN_TOKEN      (any long random string you choose)
 */

const TRIAL_DAYS = 14;
const FREE_MSGS_PER_DAY = 200; // per assistant, keeps free tier + Gemini quota safe

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/create" && request.method === "POST")
        return await createAssistant(request, env);
      if (url.pathname === "/api/config" && request.method === "GET")
        return await getConfig(url, env);
      if (url.pathname === "/api/chat" && request.method === "POST")
        return await chat(request, env);
      if (url.pathname === "/api/activate" && request.method === "POST")
        return await activate(request, env);
      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: "Server error", detail: String(err) }, 500);
    }
  },
};

async function createAssistant(request, env) {
  const body = await request.json();
  const required = ["business_name", "business_type", "services", "hours", "location", "contact_email"];
  for (const f of required) {
    if (!body[f] || String(body[f]).trim() === "")
      return json({ error: `Missing field: ${f}` }, 400);
  }

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const assistant = {
    id,
    business_name: String(body.business_name).slice(0, 120),
    business_type: String(body.business_type).slice(0, 60),
    services: String(body.services).slice(0, 2000),
    hours: String(body.hours).slice(0, 500),
    location: String(body.location).slice(0, 300),
    booking_link: String(body.booking_link || "").slice(0, 300),
    phone: String(body.phone || "").slice(0, 60),
    faq: String(body.faq || "").slice(0, 4000),
    languages: String(body.languages || "English").slice(0, 200),
    contact_email: String(body.contact_email).slice(0, 200),
    color: /^#[0-9a-fA-F]{6}$/.test(body.color || "") ? body.color : "#1766ff",
    created_at: Date.now(),
    paid: false,
  };

  await env.ASSISTANTS.put(`a:${id}`, JSON.stringify(assistant));
  return json({ ok: true, id });
}

async function getConfig(url, env) {
  const id = url.searchParams.get("id");
  const a = await loadAssistant(env, id);
  if (!a) return json({ error: "Assistant not found" }, 404);
  const daysLeft = trialDaysLeft(a);
  return json({
    id: a.id,
    business_name: a.business_name,
    color: a.color,
    active: a.paid || daysLeft > 0,
    trial_days_left: a.paid ? null : daysLeft,
  });
}

async function chat(request, env) {
  const { id, messages } = await request.json();
  const a = await loadAssistant(env, id);
  if (!a) return json({ error: "Assistant not found" }, 404);

  if (!a.paid && trialDaysLeft(a) <= 0)
    return json({
      reply:
        `The free trial for this assistant has ended. ` +
        `Please contact ${a.business_name} directly` +
        (a.phone ? ` at ${a.phone}` : "") + `.`,
      trial_ended: true,
    });

  // Per-assistant daily message cap
  const day = new Date().toISOString().slice(0, 10);
  const capKey = `cap:${id}:${day}`;
  const used = parseInt((await env.ASSISTANTS.get(capKey)) || "0", 10);
  if (used >= FREE_MSGS_PER_DAY)
    return json({ reply: "We're receiving a lot of messages right now. Please call us directly or try again tomorrow." });
  await env.ASSISTANTS.put(capKey, String(used + 1), { expirationTtl: 90000 });

  const system = buildSystemPrompt(a);
  const history = (Array.isArray(messages) ? messages : [])
    .slice(-12)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content).slice(0, 2000) }],
    }));

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: history,
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
    }
  );

  if (!resp.ok)
    return json({ reply: "Sorry, I'm having a technical moment. Please try again in a minute or call us directly." });

  const data = await resp.json();
  const reply =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    "Sorry, could you rephrase that?";
  return json({ reply });
}

async function activate(request, env) {
  const { id, admin_token, paid } = await request.json();
  if (admin_token !== env.ADMIN_TOKEN) return json({ error: "Unauthorized" }, 401);
  const a = await loadAssistant(env, id);
  if (!a) return json({ error: "Assistant not found" }, 404);
  a.paid = paid !== false;
  await env.ASSISTANTS.put(`a:${id}`, JSON.stringify(a));
  return json({ ok: true, id, paid: a.paid });
}

async function loadAssistant(env, id) {
  if (!id || !/^[a-f0-9]{10}$/.test(id)) return null;
  const raw = await env.ASSISTANTS.get(`a:${id}`);
  return raw ? JSON.parse(raw) : null;
}

function trialDaysLeft(a) {
  const elapsed = (Date.now() - a.created_at) / 86400000;
  return Math.max(0, Math.ceil(TRIAL_DAYS - elapsed));
}

function buildSystemPrompt(a) {
  return `You are the friendly virtual receptionist for "${a.business_name}", a ${a.business_type}.

YOUR JOB:
- Answer patient/customer questions using ONLY the business information below.
- Guide people to book an appointment. ${
    a.booking_link
      ? `To book, share this link: ${a.booking_link}`
      : `To book, collect their name, phone number, and preferred day/time, then say the team will confirm shortly.`
  }
- If someone describes an emergency or severe pain, tell them to call the business immediately${
    a.phone ? ` at ${a.phone}` : ""
  } and do not attempt to handle it in chat.
- If you don't know something, say so and offer the contact options. NEVER invent prices, availability, or medical advice.
- You can converse in: ${a.languages}. Reply in the language the person writes in.
- Keep replies short (2-4 sentences), warm, and professional.

BUSINESS INFORMATION:
- Name: ${a.business_name}
- Type: ${a.business_type}
- Location: ${a.location}
- Opening hours: ${a.hours}
- Services offered: ${a.services}
${a.phone ? `- Phone: ${a.phone}` : ""}
${a.faq ? `- Additional FAQ / policies:\n${a.faq}` : ""}`;
}
