"use strict";

const DEFAULTS = Object.freeze({
  endpoint: "https://tokyra-compressor.tokyracompany.workers.dev",
  mode: "auto",
  targetReduction: 35,
  enabled: true,
  showInline: true,
  autoAnalyze: true,
  analysisDelay: 1200,
  minCharacters: 80,
  disabledSites: []
});

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function normalizeEndpoint(value) {
  const raw = String(value || DEFAULTS.endpoint).trim().replace(/\/+$/, "");
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("The worker URL must begin with http:// or https://.");
  }
  return url.pathname.endsWith("/compress") ? url.href : `${url.href.replace(/\/$/, "")}/compress`;
}

function errorMessage(payload, fallback) {
  if (payload && typeof payload.error === "string") return payload.error;
  if (payload && typeof payload.message === "string") return payload.message;
  return fallback;
}

async function optimizePrompt(message) {
  const saved = await storageGet(DEFAULTS);
  const prompt = String(message.prompt || "").trim();

  if (!prompt) throw new Error("Add some text before optimizing.");
  if (prompt.length > 500000) throw new Error("Tokyra supports up to 500,000 characters per request.");

  const endpoint = normalizeEndpoint(saved.endpoint);
  const mode = ["auto", "safe", "balanced", "maximum"].includes(message.mode)
    ? message.mode
    : saved.mode;
  const target = Number.isFinite(Number(message.targetReduction))
    ? Math.min(99, Math.max(5, Number(message.targetReduction)))
    : saved.targetReduction;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, mode, targetReduction: target }),
      signal: controller.signal
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Tokyra returned an unreadable response (${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(errorMessage(payload, `Tokyra request failed (${response.status}).`));
    }

    if (!payload || typeof payload.optimized !== "string") {
      throw new Error("Tokyra did not return optimized text.");
    }

    return payload;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("Tokyra took too long to respond. Try again or use a shorter prompt.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(DEFAULTS, (saved) => chrome.storage.sync.set(saved));
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "tokyra-optimize",
      title: "Optimize with Tokyra",
      contexts: ["editable"]
    });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "TOKYRA_OPTIMIZE") return false;

  optimizePrompt(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({
      ok: false,
      error: error && error.message ? error.message : "Tokyra could not optimize this prompt."
    }));

  return true;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "tokyra-optimize" || !tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "TOKYRA_CONTEXT_OPTIMIZE" }).catch(() => undefined);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "optimize-active-field") return;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: "TOKYRA_CONTEXT_OPTIMIZE" }).catch(() => undefined);
    }
  });
});
