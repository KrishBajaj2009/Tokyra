// Wasmer Edge JS Service Worker (runs on WinterJS, not Node).
// No npm packages here on purpose — WinterJS runs a single script with
// Web-standard APIs (fetch, Request, Response, Headers), similar to a
// Cloudflare Worker. process.env is how Wasmer exposes secrets/env vars.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD; // optional

// Best-effort in-memory rate limit. Resets whenever the instance restarts,
// so treat this as a soft guardrail, not a hard one — pair it with a
// spend cap on your Anthropic key (console.anthropic.com/settings/limits).
const hits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const max = 20; // requests per window per IP
  const entry = hits.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  hits.set(ip, entry);
  return entry.count > max;
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// CORS: the frontend (tokyra.wasmer.app) is a different app/origin than
// this worker, so every response needs these headers, and preflight
// OPTIONS requests must be answered directly.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Password",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

async function handleCompress(request) {
  if (ACCESS_PASSWORD) {
    const provided = request.headers.get("x-app-password");
    if (provided !== ACCESS_PASSWORD) {
      return json({ error: "Missing or incorrect password." }, 401);
    }
  }

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(ip)) {
    return json({ error: "Too many requests. Try again later." }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const text = body && body.text;
  if (!text || typeof text !== "string" || !text.trim()) {
    return json({ error: "Missing 'text' in request body." }, 400);
  }
  if (text.length > 50000) {
    return json({ error: "Text too long (max 50,000 characters)." }, 400);
  }

  let apiRes;
  try {
    apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content:
              "Rewrite the following text to use as few tokens as possible while " +
              "preserving all meaning, intent, facts, and constraints needed to get " +
              "an equally good answer if this were sent as a prompt. Strip filler " +
              "words, redundant phrasing, and unnecessary politeness. Output ONLY " +
              "the compressed text, nothing else, no preamble.\n\nTEXT:\n" + text,
          },
        ],
      }),
    });
  } catch (err) {
    return json({ error: "Could not reach the Anthropic API." }, 502);
  }

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    return json({ error: "Anthropic API error: " + errText }, apiRes.status);
  }

  const data = await apiRes.json();
  const compressed = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return json({
    compressed,
    originalTokens: estimateTokens(text),
    compressedTokens: estimateTokens(compressed),
    usage: data.usage,
  });
}

async function handler(request) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (url.pathname === "/health") {
    return json({ ok: true });
  }

  if (url.pathname === "/compress" && request.method === "POST") {
    return handleCompress(request);
  }

  return json({ error: "Not found" }, 404);
}

addEventListener("fetch", (fetchEvent) => {
  fetchEvent.respondWith(handler(fetchEvent.request));
});
