"use strict";

const DEFAULTS = {
  endpoint: "https://tokyra-compressor.tokyracompany.workers.dev",
  mode: "auto",
  targetReduction: 35,
  enabled: true,
  showInline: true,
  autoAnalyze: true,
  analysisDelay: 1200,
  minCharacters: 80,
  disabledSites: []
};

let disabledSites = [];
const form = document.getElementById("settingsForm");
const endpoint = document.getElementById("endpoint");
const connectionStatus = document.getElementById("connectionStatus");
const connectionMessage = document.getElementById("connectionMessage");

function normalizeSite(value) {
  let site = String(value || "").trim().toLowerCase();
  if (!site) return "";
  try {
    site = new URL(site.includes("://") ? site : `https://${site}`).hostname;
  } catch {
    return "";
  }
  return site.replace(/^www\./, "");
}

function renderSites() {
  const list = document.getElementById("siteList");
  list.replaceChildren();
  disabledSites.forEach((site) => {
    const row = document.createElement("div");
    row.className = "site-item";
    const label = document.createElement("span");
    label.textContent = site;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      disabledSites = disabledSites.filter((item) => item !== site);
      renderSites();
    });
    row.append(label, remove);
    list.append(row);
  });
}

function setConnection(state, label, message = "") {
  connectionStatus.className = `status${state ? ` ${state}` : ""}`;
  connectionStatus.querySelector("b").textContent = label;
  connectionMessage.textContent = message;
  connectionMessage.classList.toggle("hidden", !message);
}

function baseEndpoint(value) {
  const url = new URL(String(value || "").trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("Use an http:// or https:// Worker URL.");
  url.pathname = url.pathname.replace(/\/compress\/?$/, "/");
  url.search = "";
  url.hash = "";
  return url.href;
}

document.getElementById("addSiteButton").addEventListener("click", () => {
  const input = document.getElementById("siteInput");
  const site = normalizeSite(input.value);
  if (!site) return;
  if (!disabledSites.includes(site)) disabledSites.push(site);
  disabledSites.sort();
  input.value = "";
  renderSites();
});

document.getElementById("siteInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.getElementById("addSiteButton").click();
  }
});

document.getElementById("testButton").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Testing…";
  setConnection("", "Testing");
  try {
    const response = await fetch(baseEndpoint(endpoint.value), { headers: { Accept: "application/json" } });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || `Worker responded with ${response.status}.`);
    setConnection("success", "Connected", `${result.version || "Tokyra Worker"} · ${result.model || result.provider || "Workers AI"}`);
  } catch (error) {
    setConnection("error", "Connection failed", error && error.message ? error.message : "The Worker could not be reached.");
  } finally {
    button.disabled = false;
    button.textContent = "Test connection";
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    baseEndpoint(endpoint.value);
  } catch (error) {
    setConnection("error", "Invalid URL", error.message);
    return;
  }
  const values = {
    endpoint: endpoint.value.trim().replace(/\/+$/, ""),
    mode: document.getElementById("mode").value,
    targetReduction: Number(document.getElementById("targetReduction").value),
    enabled: document.getElementById("enabled").checked,
    showInline: document.getElementById("showInline").checked,
    autoAnalyze: document.getElementById("autoAnalyze").checked,
    analysisDelay: Number(document.getElementById("analysisDelay").value),
    minCharacters: Math.min(10000, Math.max(20, Number(document.getElementById("minCharacters").value) || 80)),
    disabledSites
  };
  chrome.storage.sync.set(values, () => {
    const message = document.getElementById("saveMessage");
    message.textContent = "Settings saved";
    setTimeout(() => { message.textContent = ""; }, 1800);
  });
});

chrome.storage.sync.get(DEFAULTS, (saved) => {
  const values = { ...DEFAULTS, ...saved };
  endpoint.value = values.endpoint;
  document.getElementById("mode").value = values.mode;
  document.getElementById("targetReduction").value = String(values.targetReduction);
  document.getElementById("enabled").checked = values.enabled;
  document.getElementById("showInline").checked = values.showInline;
  document.getElementById("autoAnalyze").checked = values.autoAnalyze;
  document.getElementById("analysisDelay").value = String(values.analysisDelay);
  document.getElementById("minCharacters").value = values.minCharacters;
  disabledSites = Array.isArray(values.disabledSites) ? values.disabledSites : [];
  renderSites();
});
