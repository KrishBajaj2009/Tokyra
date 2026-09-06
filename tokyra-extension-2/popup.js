"use strict";

const DEFAULTS = { mode: "auto", targetReduction: 35, disabledSites: [] };
const input = document.getElementById("promptInput");
const inputCount = document.getElementById("inputCount");
const optimizeButton = document.getElementById("optimizeButton");
const modeSelect = document.getElementById("modeSelect");
const targetSelect = document.getElementById("targetSelect");
const errorPanel = document.getElementById("errorPanel");
const resultPanel = document.getElementById("resultPanel");
const outputText = document.getElementById("outputText");
const warningText = document.getElementById("warningText");
let activeHostname = "";
let settings = { ...DEFAULTS };

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function updateCount() {
  inputCount.textContent = `${input.value.length.toLocaleString()} characters`;
}

function showError(message) {
  errorPanel.textContent = message;
  errorPanel.classList.remove("hidden");
}

function displayResult(result) {
  outputText.textContent = result.optimized;
  document.getElementById("savedMetric").textContent = Math.max(0, Math.round(number(result.tokensSaved))).toLocaleString();
  document.getElementById("compressionMetric").textContent = `${Math.max(0, Math.round(number(result.compressionPercentPrecise, result.compressionPercent)))}%`;
  document.getElementById("fidelityMetric").textContent = `${Math.round(number(result.fidelityPercent, 100))}%`;
  document.getElementById("latencyLabel").textContent = result.latencyMs ? `${(number(result.latencyMs) / 1000).toFixed(1)}s` : "";
  document.getElementById("resultTitle").textContent = result.unchanged ? "Already efficient" : "Suggestion ready";
  warningText.textContent = result.warning || "";
  warningText.classList.toggle("hidden", !result.warning);
  errorPanel.classList.add("hidden");
  resultPanel.classList.remove("hidden");
}

function sendOptimize(prompt) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: "TOKYRA_OPTIMIZE",
      prompt,
      mode: modeSelect.value,
      targetReduction: Number(targetSelect.value)
    }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!response || !response.ok) return reject(new Error(response && response.error ? response.error : "Tokyra could not optimize this prompt."));
      resolve(response.result);
    });
  });
}

async function optimize() {
  const prompt = input.value.trim();
  if (!prompt) return showError("Paste or write a prompt first.");
  if (prompt.length > 500000) return showError("Tokyra supports up to 500,000 characters.");

  optimizeButton.disabled = true;
  optimizeButton.innerHTML = '<span class="spinner"></span><span>Optimizing…</span>';
  errorPanel.classList.add("hidden");
  resultPanel.classList.add("hidden");

  try {
    displayResult(await sendOptimize(prompt));
  } catch (error) {
    showError(error && error.message ? error.message : "Tokyra could not optimize this prompt.");
  } finally {
    optimizeButton.disabled = false;
    optimizeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="m13 3-1.2 5.1a2 2 0 0 1-1.5 1.5L5 11l5.3 1.4a2 2 0 0 1 1.5 1.5L13 19l1.2-5.1a2 2 0 0 1 1.5-1.5L21 11l-5.3-1.4a2 2 0 0 1-1.5-1.5L13 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>Optimize again</span>';
  }
}

function updateSiteToggle() {
  const button = document.getElementById("siteToggle");
  if (!activeHostname) {
    button.classList.add("hidden");
    return;
  }
  const paused = settings.disabledSites.includes(activeHostname);
  button.textContent = paused ? "Resume on this site" : "Pause on this site";
}

input.addEventListener("input", updateCount);
input.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") optimize();
});
optimizeButton.addEventListener("click", optimize);
document.getElementById("pasteButton").addEventListener("click", async () => {
  try {
    input.value = await navigator.clipboard.readText();
    updateCount();
    input.focus();
  } catch {
    showError("Clipboard access was blocked. Paste with Ctrl/Cmd + V.");
  }
});
document.getElementById("copyButton").addEventListener("click", async (event) => {
  await navigator.clipboard.writeText(outputText.textContent);
  event.currentTarget.textContent = "Copied";
  setTimeout(() => { event.currentTarget.textContent = "Copy"; }, 1200);
});
document.getElementById("settingsButton").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("siteToggle").addEventListener("click", () => {
  if (!activeHostname) return;
  const sites = new Set(settings.disabledSites);
  if (sites.has(activeHostname)) sites.delete(activeHostname); else sites.add(activeHostname);
  settings.disabledSites = Array.from(sites);
  chrome.storage.sync.set({ disabledSites: settings.disabledSites }, updateSiteToggle);
});

chrome.storage.sync.get(DEFAULTS, (saved) => {
  settings = { ...DEFAULTS, ...saved };
  modeSelect.value = settings.mode;
  targetSelect.value = String(settings.targetReduction);
  if (!targetSelect.value) targetSelect.value = "35";
  updateSiteToggle();
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  try {
    activeHostname = new URL(tab.url).hostname;
  } catch {
    activeHostname = "";
  }
  updateSiteToggle();
});

updateCount();
input.focus();
