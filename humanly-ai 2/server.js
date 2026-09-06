"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number.parseInt(process.env.PORT || "4173", 10);
const MAX_TEXT_CHARS = Number.parseInt(process.env.MAX_TEXT_CHARS || "40000", 10);
const MODEL = process.env.HUMANLY_MODEL || "gpt-4.1-mini";
const BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
});

const VOICES = Object.freeze({
  natural: "natural, conversational, and unforced",
  warm: "warm, thoughtful, and personable",
  professional: "clear, confident, and professional without corporate stiffness",
  casual: "casual, direct, and relaxed",
  concise: "compact, plainspoken, and decisive"
});

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function cleanText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  const maximumBytes = Math.max(128_000, MAX_TEXT_CHARS * 4);

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

function validateText(body) {
  const text = cleanText(body && body.text);
  if (!text) {
    const error = new Error("Paste some text first.");
    error.status = 400;
    throw error;
  }
  if (text.length > MAX_TEXT_CHARS) {
    const error = new Error(`Text must be ${MAX_TEXT_CHARS.toLocaleString()} characters or fewer.`);
    error.status = 413;
    throw error;
  }
  return text;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function splitSentences(text) {
  const matches = text.match(/[^.!?\n]+(?:[.!?]+|$)/g) || [];
  return matches.map((sentence) => sentence.trim()).filter(Boolean);
}

function wordsFrom(text) {
  return (text.toLowerCase().match(/[a-z0-9]+(?:['’][a-z]+)?/g) || []);
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function analyzeText(text) {
  const words = wordsFrom(text);
  const sentences = splitSentences(text);
  const sentenceLengths = sentences.map((sentence) => wordsFrom(sentence).length).filter(Boolean);
  const uniqueWords = new Set(words);
  const meanLength = average(sentenceLengths);
  const deviation = standardDeviation(sentenceLengths);
  const burstiness = meanLength ? deviation / meanLength : 0;
  const lexicalDiversity = words.length ? uniqueWords.size / words.length : 0;
  const transitions = countMatches(text, /\b(furthermore|moreover|additionally|consequently|therefore|however|in conclusion|it is important to note|ultimately|overall)\b/gi);
  const formulaic = countMatches(text, /\b(delve|tapestry|landscape|realm|multifaceted|robust|seamless|leverage|underscores?|plays? a (?:crucial|vital) role|in today['’]s)\b/gi);
  const contractions = countMatches(text, /\b(?:i['’]m|i['’]ve|i['’]d|you['’]re|we['’]re|we['’]ve|they['’]re|it['’]s|isn['’]t|aren['’]t|don['’]t|doesn['’]t|can['’]t|won['’]t|couldn['’]t|shouldn['’]t)\b/gi);
  const starts = sentences.map((sentence) => (wordsFrom(sentence).slice(0, 2).join(" "))).filter(Boolean);
  const startCounts = starts.reduce((map, start) => map.set(start, (map.get(start) || 0) + 1), new Map());
  const repeatedStarts = [...startCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
  const secondPerson = countMatches(text, /\b(?:you|your|yours)\b/gi);
  const firstPerson = countMatches(text, /\b(?:i|me|my|mine|we|us|our|ours)\b/gi);
  const parentheticals = countMatches(text, /\([^)]{2,80}\)/g);
  const emDashes = countMatches(text, /—/g);
  const paragraphs = text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim());

  let score = 28;
  const signals = [];
  const humanSignals = [];

  if (words.length >= 80 && burstiness < 0.34) {
    score += 17;
    signals.push("Sentence lengths are unusually uniform");
  } else if (burstiness > 0.58) {
    score -= 10;
    humanSignals.push("Sentence rhythm varies naturally");
  }

  const transitionRate = transitions / Math.max(1, words.length) * 100;
  if (transitionRate > 0.8) {
    score += 15;
    signals.push("Heavy use of formal transitions");
  }

  if (formulaic >= 2 || (formulaic === 1 && words.length < 180)) {
    score += Math.min(20, formulaic * 7);
    signals.push("Contains stock phrases common in model-generated prose");
  }

  if (sentences.length >= 6 && repeatedStarts / sentences.length > 0.24) {
    score += 12;
    signals.push("Several sentences begin with the same pattern");
  }

  if (words.length > 140 && contractions === 0 && firstPerson + secondPerson < 3) {
    score += 8;
    signals.push("Voice stays consistently impersonal");
  } else if (contractions > 1) {
    score -= 5;
    humanSignals.push("Contractions create a less scripted voice");
  }

  if (paragraphs.length >= 3) {
    const paragraphLengths = paragraphs.map((paragraph) => wordsFrom(paragraph).length);
    const paragraphMean = average(paragraphLengths);
    const paragraphVariation = paragraphMean ? standardDeviation(paragraphLengths) / paragraphMean : 0;
    if (paragraphVariation < 0.22) {
      score += 8;
      signals.push("Paragraphs follow a highly regular structure");
    }
  }

  if (parentheticals + emDashes >= 3 && burstiness > 0.4) {
    score -= 4;
    humanSignals.push("Asides and interruptions vary the flow");
  }

  if (words.length > 100 && lexicalDiversity > 0.58) {
    score -= 4;
    humanSignals.push("Vocabulary is relatively varied");
  }

  score = Math.round(clamp(score, 3, 97));
  const evidence = words.length < 60 ? "very-low" : words.length < 140 ? "low" : words.length < 500 ? "medium" : "medium-high";
  const verdict = score >= 68 ? "AI-patterned" : score <= 36 ? "Human-leaning" : "Inconclusive";

  return {
    score,
    verdict,
    confidence: evidence,
    wordCount: words.length,
    sentenceCount: sentences.length,
    metrics: {
      sentenceVariation: Math.round(clamp(burstiness * 100, 0, 100)),
      vocabularyVariety: Math.round(clamp(lexicalDiversity * 100, 0, 100)),
      formulaicLanguage: Math.round(clamp((formulaic * 18 + transitionRate * 12), 0, 100)),
      personalVoice: Math.round(clamp((contractions * 9 + (firstPerson + secondPerson) / Math.max(1, words.length) * 300), 0, 100))
    },
    signals: signals.slice(0, 4),
    humanSignals: humanSignals.slice(0, 3),
    attribution: "Text alone cannot reliably identify Claude, GPT, Gemini, or another specific model."
  };
}

function preserveCase(original, replacement) {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function localHumanize(text, strength = "balanced") {
  const replacements = [
    [/\bit is important to note that\b/gi, ""],
    [/\bit should be noted that\b/gi, ""],
    [/\bin order to\b/gi, "to"],
    [/\bdue to the fact that\b/gi, "because"],
    [/\bat this point in time\b/gi, "now"],
    [/\butilize\b/gi, "use"],
    [/\bleverage\b/gi, "use"],
    [/\bfacilitate\b/gi, "help"],
    [/\bcommence\b/gi, "start"],
    [/\bsubsequently\b/gi, "later"],
    [/\bapproximately\b/gi, "about"],
    [/\bnevertheless\b/gi, "still"],
    [/\bfurthermore\b/gi, "also"],
    [/\bmoreover\b/gi, "also"],
    [/\bit is recommended that employees\b/gi, "employees should"],
    [/\bplay a (?:crucial|vital) role in ensuring that\b/gi, "help make sure"],
    [/\bplays a (?:crucial|vital) role in ensuring that\b/gi, "helps make sure"],
    [/\bplay a (?:crucial|vital) role in\b/gi, "help"],
    [/\bplays a (?:crucial|vital) role in\b/gi, "helps"],
    [/\bwith regard to\b/gi, "about"],
    [/\bregarding\b/gi, "about"],
    [/\ba wide range of\b/gi, "many"],
    [/\bhas the ability to\b/gi, "can"],
    [/\bfully informed\b/gi, "informed"],
    [/\bon a regular basis\b/gi, "regularly"]
  ];

  let output = text;
  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, (match) => replacement ? preserveCase(match, replacement) : "");
  }

  output = output
    .replace(/\b(However|Therefore|Additionally|Consequently),\s+/g, (match, word) => ({
      However: "But ", Therefore: "So ", Additionally: "Also, ", Consequently: "As a result, "
    })[word] || match)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/(^|[.!?]\s+),?\s*/g, "$1")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  output = output.replace(
    /(^|[.!?]\n]\s+)([a-z])/g,
    (_, boundary, letter) => boundary + letter.toUpperCase()
  );

  if (strength === "bold") {
    output = output
      .replace(/\bdo not\b/gi, "don't")
      .replace(/\bcannot\b/gi, "can't")
      .replace(/\bit is\b/gi, "it's")
      .replace(/\bthat is\b/gi, "that's")
      .replace(/\bwe are\b/gi, "we're");
  }

  return output;
}

function extractModelText(payload) {
  const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((item) => item && (item.text || item.content || "")).join("").trim();
  }
  return "";
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
}

async function callModel(messages, options = {}) {
  if (!process.env.OPENAI_API_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: options.temperature ?? 0.35,
        max_tokens: options.maxTokens || 2500
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error && payload.error.message ? payload.error.message : `Model request failed (${response.status}).`);
    }
    return extractModelText(payload);
  } finally {
    clearTimeout(timer);
  }
}

async function humanize(text, body) {
  const voice = Object.hasOwn(VOICES, body.voice) ? body.voice : "natural";
  const strength = ["light", "balanced", "bold"].includes(body.strength) ? body.strength : "balanced";
  const audience = cleanText(body.audience).slice(0, 120) || "the original audience";
  const modelOutput = await callModel([
    {
      role: "system",
      content: [
        "You are a careful writing editor. Rewrite the user's text so it sounds like a real person with a distinct, natural cadence.",
        "Preserve the meaning, claims, names, numbers, dates, quotations, citations, URLs, and technical terms exactly. Do not invent facts.",
        "Remove canned transitions and generic filler. Vary sentence rhythm only where it improves readability. Keep intentional formatting.",
        "This is editing, not detector evasion. Do not claim the result is human-authored or undetectable.",
        `Target voice: ${VOICES[voice]}. Editing strength: ${strength}. Audience: ${audience}.`,
        "Return only the revised text."
      ].join(" ")
    },
    { role: "user", content: text }
  ], { temperature: strength === "bold" ? 0.62 : strength === "light" ? 0.18 : 0.38, maxTokens: Math.min(6000, Math.max(700, Math.ceil(text.length / 2))) });

  const output = cleanText(modelOutput || localHumanize(text, strength));
  const before = analyzeText(text);
  const after = analyzeText(output);
  return {
    output,
    mode: modelOutput ? "model" : "local-demo",
    voice,
    changes: {
      charactersBefore: text.length,
      charactersAfter: output.length,
      sentenceVariationBefore: before.metrics.sentenceVariation,
      sentenceVariationAfter: after.metrics.sentenceVariation
    },
    note: modelOutput ? "Meaning-preserving model edit" : "Local demo edit — connect a model for deeper rewriting"
  };
}

async function detect(text) {
  const heuristic = analyzeText(text);
  const modelText = await callModel([
    {
      role: "system",
      content: [
        "Assess stylistic evidence in the supplied text. AI-text detection is uncertain and model-family attribution from prose is not reliable.",
        "Return only JSON with: score (0-100, where 100 means stronger AI-like patterns), verdict (AI-patterned, Human-leaning, or Inconclusive),",
        "confidence (very-low, low, medium, or medium-high), signals (up to 4 short strings), humanSignals (up to 3 short strings).",
        "Do not identify a specific vendor or model. Be especially cautious with short, edited, translated, non-native, or formulaic professional writing."
      ].join(" ")
    },
    { role: "user", content: text }
  ], { temperature: 0, maxTokens: 450 });

  const model = parseJsonObject(modelText);
  if (!model || !Number.isFinite(Number(model.score))) {
    return { ...heuristic, mode: "heuristic", caveat: "This is a pattern estimate, not proof of authorship." };
  }

  const blendedScore = Math.round(clamp(heuristic.score * 0.55 + Number(model.score) * 0.45, 1, 99));
  const verdict = blendedScore >= 68 ? "AI-patterned" : blendedScore <= 36 ? "Human-leaning" : "Inconclusive";
  return {
    ...heuristic,
    score: blendedScore,
    verdict,
    confidence: ["very-low", "low", "medium", "medium-high"].includes(model.confidence) ? model.confidence : heuristic.confidence,
    signals: [...new Set([...(heuristic.signals || []), ...(Array.isArray(model.signals) ? model.signals : [])])].slice(0, 4),
    humanSignals: [...new Set([...(heuristic.humanSignals || []), ...(Array.isArray(model.humanSignals) ? model.humanSignals : [])])].slice(0, 3),
    mode: "hybrid",
    caveat: "This is a pattern estimate, not proof of authorship. Human writing can score high and AI writing can score low."
  };
}

async function serveStatic(request, response, url) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const decoded = decodeURIComponent(pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") sendJson(response, 404, { error: "Not found." });
    else throw error;
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/status") {
      sendJson(response, 200, {
        ok: true,
        modelConnected: Boolean(process.env.OPENAI_API_KEY),
        model: process.env.OPENAI_API_KEY ? MODEL : null,
        maxTextChars: MAX_TEXT_CHARS
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/humanize") {
      const body = await readBody(request);
      const text = validateText(body);
      sendJson(response, 200, await humanize(text, body));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/detect") {
      const body = await readBody(request);
      const text = validateText(body);
      sendJson(response, 200, await detect(text));
      return;
    }
    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response, url);
      return;
    }
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    console.error(JSON.stringify({ event: "request_failed", path: url.pathname, message: error.message }));
    sendJson(response, error.status || 500, { error: error.status ? error.message : "Something went wrong. Please try again." });
  }
}

function createServer() {
  return http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      console.error(error);
      if (!response.headersSent) sendJson(response, 500, { error: "Internal server error." });
      else response.end();
    });
  });
}

if (require.main === module) {
  createServer().listen(PORT, "127.0.0.1", () => {
    console.log(`Humanly AI is running at http://127.0.0.1:${PORT}`);
    console.log(process.env.OPENAI_API_KEY ? `Model mode: ${MODEL}` : "Model mode: local demo (no API key set)");
  });
}

module.exports = { analyzeText, cleanText, createServer, localHumanize };
