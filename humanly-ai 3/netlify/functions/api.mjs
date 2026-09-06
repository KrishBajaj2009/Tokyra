import core from "../../server.js";

const { cleanText, detect, humanize } = core;
const MAX_TEXT_CHARS = Number.parseInt(process.env.MAX_TEXT_CHARS || "40000", 10);

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
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

export default async (request) => {
  const url = new URL(request.url);
  const route = url.searchParams.get("route") || url.pathname.split("/").filter(Boolean).at(-1);

  try {
    if (request.method === "GET" && route === "status") {
      return json(200, {
        ok: true,
        modelConnected: Boolean(process.env.OPENAI_API_KEY),
        model: process.env.OPENAI_API_KEY ? (process.env.HUMANLY_MODEL || "gpt-4.1-mini") : null,
        maxTextChars: MAX_TEXT_CHARS
      });
    }

    if (request.method !== "POST") {
      return json(405, { error: "Method not allowed." });
    }

    const body = await request.json().catch(() => {
      const error = new Error("Request body must be valid JSON.");
      error.status = 400;
      throw error;
    });
    const text = validateText(body);

    if (route === "humanize") {
      return json(200, await humanize(text, body));
    }
    if (route === "detect") {
      return json(200, await detect(text));
    }

    return json(404, { error: "Not found." });
  } catch (error) {
    console.error(JSON.stringify({ event: "humanly_netlify_request_failed", route, message: error.message }));
    return json(error.status || 500, {
      error: error.status ? error.message : "Something went wrong. Please try again."
    });
  }
};
