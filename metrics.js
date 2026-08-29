(() => {
  "use strict";

  const API = "https://tokyra-compressor.tokyracompany.workers.dev";
  const statsURL = `${API}/stats`;
  const latestURL = `${API}/latest`;
  const refreshBtn = document.getElementById("refreshBtn");
  const connectionStatus = document.getElementById("connectionStatus");
  const latestContent = document.getElementById("latestContent");

  const elements = {
    totalRuns: document.getElementById("totalRuns"),
    avgReduction: document.getElementById("avgReduction"),
    avgFidelity: document.getElementById("avgFidelity"),
    avgCfs: document.getElementById("avgCfs"),
    repairCount: document.getElementById("repairCount"),
    estimatedSavings: document.getElementById("estimatedSavings"),
    reductionGauge: document.getElementById("reductionGauge"),
    fidelityGauge: document.getElementById("fidelityGauge"),
    apiState: document.getElementById("apiState"),
    lastUpdated: document.getElementById("lastUpdated")
  };

  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const integer = (value) => new Intl.NumberFormat().format(Math.round(number(value)));
  const percent = (value) => `${Math.round(number(value))}%`;
  const clamp = (value) => Math.min(100, Math.max(0, number(value)));

  const setConnection = (message, state = "") => {
    connectionStatus.className = `connection-status${state ? ` ${state}` : ""}`;
    connectionStatus.querySelector("span").textContent = message;
  };

  const fetchJSON = async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  };

  const createLatestStat = (label, value) => {
    const item = document.createElement("div");
    item.className = "latest-stat";
    const labelElement = document.createElement("span");
    const valueElement = document.createElement("strong");
    labelElement.textContent = label;
    valueElement.textContent = value;
    item.append(labelElement, valueElement);
    return item;
  };

  const renderLatest = (data) => {
    if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
      latestContent.className = "empty-state";
      latestContent.textContent = "No recent compression data is available yet.";
      elements.estimatedSavings.textContent = "$0.0000";
      return;
    }

    const saved = number(data.tokensSaved);
    elements.estimatedSavings.textContent = `$${(saved * 0.000002).toFixed(4)}`;
    latestContent.className = "latest-grid";
    latestContent.replaceChildren(
      createLatestStat("Original", integer(data.originalTokens)),
      createLatestStat("Optimized", integer(data.optimizedTokens)),
      createLatestStat("Saved", integer(saved)),
      createLatestStat("Reduction", percent(data.compressionPercent)),
      createLatestStat("Fidelity", percent(data.fidelityPercent ?? data.fidelity)),
      createLatestStat("CFS", number(data.cfsScore).toFixed(1)),
      createLatestStat("Latency", `${integer(data.latencyMs)}ms`),
      createLatestStat("Status", "Complete")
    );
  };

  const renderStats = (data) => {
    const totals = data?.totals || {};
    const reduction = number(totals.avgCompressionPercent);
    const fidelity = number(totals.avgFidelity);
    elements.totalRuns.textContent = integer(totals.compressionsRun);
    elements.avgReduction.textContent = percent(reduction);
    elements.avgFidelity.textContent = percent(fidelity);
    elements.avgCfs.textContent = number(totals.avgCFS).toFixed(1);
    elements.repairCount.textContent = integer(totals.repairCount);

    requestAnimationFrame(() => {
      elements.reductionGauge.style.setProperty("--value", clamp(reduction));
      elements.fidelityGauge.style.setProperty("--value", clamp(fidelity));
    });
  };

  async function loadDashboard() {
    refreshBtn.disabled = true;
    refreshBtn.firstChild.textContent = "Refreshing data ";
    setConnection("Loading live metrics…");
    elements.apiState.textContent = "Checking";

    const [statsResult, latestResult] = await Promise.allSettled([
      fetchJSON(statsURL),
      fetchJSON(latestURL)
    ]);
    let successCount = 0;

    if (statsResult.status === "fulfilled") {
      renderStats(statsResult.value);
      successCount += 1;
    }

    if (latestResult.status === "fulfilled") {
      renderLatest(latestResult.value);
      successCount += 1;
    }

    const timestamp = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date());
    elements.lastUpdated.textContent = `Last refreshed ${timestamp}.`;

    if (successCount === 2) {
      setConnection("API online — live data loaded", "online");
      elements.apiState.textContent = "Online";
    } else if (successCount === 1) {
      setConnection("API partially available", "error");
      elements.apiState.textContent = "Partial";
    } else {
      setConnection("Metrics API is currently unavailable", "error");
      elements.apiState.textContent = "Offline";
      latestContent.className = "empty-state";
      latestContent.textContent = "Live data could not be loaded. Try refreshing in a moment.";
    }

    refreshBtn.disabled = false;
    refreshBtn.firstChild.textContent = "Refresh data ";
  }

  refreshBtn.addEventListener("click", loadDashboard);
  loadDashboard();
})();
