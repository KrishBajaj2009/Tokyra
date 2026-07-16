import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Best-effort in-memory rate limit. This resets whenever the serverless
// function cold-starts, so it's a soft guardrail, not a hard one — good
// enough to stop casual abuse, not a substitute for the Anthropic
// console spend cap (see README). For real distributed rate limiting
// once you have real traffic, swap this for Upstash Redis (free tier) —
// noted in the README.
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Password gate — set ACCESS_PASSWORD in your Vercel project's
  // environment variables before sharing the link publicly.
  const required = process.env.ACCESS_PASSWORD;
  if (required) {
    const provided = req.headers["x-app-password"];
    if (provided !== required) {
      return res.status(401).json({ error: "Missing or incorrect password." });
    }
  }

  const ip =
    (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
      .toString()
      .split(",")[0]
      .trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests. Try again later." });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Missing 'text' in request body." });
  }
  if (text.length > 50000) {
    return res.status(400).json({ error: "Text too long (max 50,000 characters)." });
  }

  try {
    const response = await anthropic.messages.create({
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
    });

    const compressed = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    res.status(200).json({
      compressed,
      originalTokens: estimateTokens(text),
      compressedTokens: estimateTokens(compressed),
      usage: response.usage,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Compression failed. Check function logs." });
  }
}
