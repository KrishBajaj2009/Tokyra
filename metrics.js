(() => {
  "use strict";

  const API = "https://tokyra-compressor.tokyracompany.workers.dev";
  const statsURL = `${API}/stats`;
  const latestURL = `${API}/latest`;
  const refreshBtn = document.getElementById("refreshBtn");
  const connectionStatus = document.getElementById("connectionStatus");
  const latestContent = document.getElementById("latestContent");
  let lastSuccessfulRefresh = null;

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
  const optionalNumber = (value) => {
    if (value === null || value === undefined || typeof value === "boolean") return null;
    if (typeof value === "string" && !value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const optionalPercent = (value) => {
    const parsed = optionalNumber(value);
    return parsed !== null && parsed >= 0 && parsed <= 100 ? parsed : null;
  };
  const readFidelity = (data) => {
    const legacyFidelity = data?.fidelity && typeof data.fidelity === "object"
      ? data.fidelity.percent
      : data?.fidelity;
    const candidates = [
      data?.fidelityPercent,
      data?.deterministicFidelityPercent,
      legacyFidelity,
      data?.semanticJudgeScore
    ];
    for (const candidate of candidates) {
      const parsed = optionalPercent(candidate);
      if (parsed !== null) return parsed;
    }
    return null;
  };
  const integer = (value) => new Intl.NumberFormat().format(Math.round(number(value)));
  const integerOrDash = (value) => {
    const parsed = optionalNumber(value);
    return parsed === null ? "—" : new Intl.NumberFormat().format(Math.round(parsed));
  };
  const percent = (value) => `${Math.round(number(value))}%`;
  const percentOrDash = (value) => {
    const parsed = optionalPercent(value);
    return parsed === null ? "—" : `${Math.round(parsed)}%`;
  };
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
    let result = data;
    if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "result")) {
      result = data.result;
    } else if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "latest")) {
      result = data.latest;
    }
    if (!result || typeof result !== "object" || Object.keys(result).length === 0) {
      latestContent.className = "empty-state";
      latestContent.textContent = "No recent compression data is available yet.";
      elements.estimatedSavings.textContent = "—";
      return;
    }

    const saved = optionalNumber(result.tokensSaved);
    const compression = optionalPercent(result.compressionPercent);
    const preciseCompression = optionalPercent(result.compressionPercentPrecise);
    const fidelity = readFidelity(result);
    const cfs = optionalNumber(result.cfsScore);
    const latency = optionalNumber(result.latencyMs);
    const resultStatus = String(result.status || "").toLowerCase();
    const explicitlyUnchanged = result.unchanged === true ||
      result.noVerifiedShorterCandidate === true ||
      resultStatus === "skipped" ||
      resultStatus === "no-verified-shorter-candidate";
    const explicitlyChanged = result.unchanged === false ||
      result.accepted === true ||
      resultStatus.startsWith("optimized") ||
      ["accepted", "complete", "success"].includes(resultStatus);
    const unchanged = explicitlyUnchanged ||
      (!explicitlyChanged && !resultStatus && saved !== null && saved <= 0 &&
        (preciseCompression ?? compression) === 0);
    const judgeStatus = String(result.semanticJudgeStatus || "").toLowerCase();
    const verificationFailed = result.fidelityAccepted === false ||
      judgeStatus === "rejected" ||
      (result.semanticJudgeAccepted === false && !["", "not_required", "unavailable"].includes(judgeStatus));
    const reviewRequired = !unchanged && (fidelity === null || judgeStatus === "unavailable" || verificationFailed ||
      result.status === "optimized-review-required" ||
      result.qualityTier === "review" ||
      result.accepted === false);
    const outcome = unchanged
      ? "Preserved"
      : reviewRequired
        ? "Review"
        : result.accepted === true || result.fidelityAccepted === true
          ? "Verified"
          : "Complete";
    elements.estimatedSavings.textContent = saved === null ? "—" : `$${(saved * 0.000002).toFixed(4)}`;
    latestContent.className = "latest-grid";
    latestContent.replaceChildren(
      createLatestStat("Original", integerOrDash(result.originalTokens)),
      createLatestStat("Optimized", integerOrDash(result.optimizedTokens)),
      createLatestStat("Saved", integerOrDash(saved)),
      createLatestStat("Reduction", percentOrDash(compression)),
      createLatestStat("Fidelity", fidelity === null ? "Unverified" : percent(fidelity)),
      createLatestStat("CFS", cfs === null ? "—" : cfs.toFixed(1)),
      createLatestStat("Latency", latency === null ? "—" : `${integer(latency)}ms`),
      createLatestStat("Status", outcome)
    );
  };

  const renderStats = (data) => {
    const totals = data?.totals || data || {};
    const runs = number(totals.compressionsRun ?? totals.totalRuns);
    const reduction = optionalPercent(totals.avgCompressionPercent ?? totals.avgReductionPercent);
    const fidelity = optionalPercent(totals.avgFidelityPercent ?? totals.avgFidelity);
    const averageCfs = optionalNumber(totals.avgCfsScore ?? totals.avgCFS);
    const repairCount = optionalNumber(totals.repairCount);
    elements.totalRuns.textContent = integer(runs);
    elements.avgReduction.textContent = runs > 0 ? percentOrDash(reduction) : "—";
    elements.avgFidelity.textContent = runs > 0 ? percentOrDash(fidelity) : "—";
    elements.avgCfs.textContent = runs > 0 && averageCfs !== null ? averageCfs.toFixed(1) : "—";
    elements.repairCount.textContent = repairCount === null ? "—" : integer(repairCount);

    requestAnimationFrame(() => {
      elements.reductionGauge.style.setProperty("--value", clamp(reduction ?? 0));
      elements.fidelityGauge.style.setProperty("--value", clamp(fidelity ?? 0));
    });
  };

  const resetDashboardData = () => {
    elements.totalRuns.textContent = "—";
    elements.avgReduction.textContent = "—";
    elements.avgFidelity.textContent = "—";
    elements.avgCfs.textContent = "—";
    elements.repairCount.textContent = "—";
    elements.estimatedSavings.textContent = "—";
    requestAnimationFrame(() => {
      elements.reductionGauge.style.setProperty("--value", 0);
      elements.fidelityGauge.style.setProperty("--value", 0);
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

    const formatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
    const attemptedAt = new Date();

    if (successCount === 2) {
      lastSuccessfulRefresh = attemptedAt;
      elements.lastUpdated.textContent = `Last refreshed ${formatter.format(attemptedAt)}.`;
      setConnection("API online — live data loaded", "online");
      elements.apiState.textContent = "Online";
    } else if (successCount === 1) {
      lastSuccessfulRefresh = attemptedAt;
      elements.lastUpdated.textContent = `Partially refreshed ${formatter.format(attemptedAt)}; some values may be stale.`;
      setConnection("API partially available", "error");
      elements.apiState.textContent = "Partial";
    } else {
      resetDashboardData();
      elements.lastUpdated.textContent = lastSuccessfulRefresh
        ? `Last successful refresh ${formatter.format(lastSuccessfulRefresh)}; latest attempt failed.`
        : "No successful refresh yet. Last attempt failed.";
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
