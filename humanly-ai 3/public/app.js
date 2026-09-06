(() => {
  "use strict";

  const elements = {
    rewriteTab: document.getElementById("rewriteTab"),
    detectTab: document.getElementById("detectTab"),
    rewritePanel: document.getElementById("rewritePanel"),
    detectPanel: document.getElementById("detectPanel"),
    textInput: document.getElementById("textInput"),
    wordCount: document.getElementById("wordCount"),
    characterCount: document.getElementById("characterCount"),
    sampleButton: document.getElementById("sampleButton"),
    clearButton: document.getElementById("clearButton"),
    humanizeButton: document.getElementById("humanizeButton"),
    analyzeButton: document.getElementById("analyzeButton"),
    voiceSelect: document.getElementById("voiceSelect"),
    strengthSelect: document.getElementById("strengthSelect"),
    audienceInput: document.getElementById("audienceInput"),
    emptyState: document.getElementById("emptyState"),
    loadingState: document.getElementById("loadingState"),
    loadingTitle: document.getElementById("loadingTitle"),
    loadingCopy: document.getElementById("loadingCopy"),
    rewriteResult: document.getElementById("rewriteResult"),
    detectResult: document.getElementById("detectResult"),
    errorState: document.getElementById("errorState"),
    errorMessage: document.getElementById("errorMessage"),
    retryButton: document.getElementById("retryButton"),
    resultActions: document.getElementById("resultActions"),
    copyButton: document.getElementById("copyButton"),
    downloadButton: document.getElementById("downloadButton"),
    outputText: document.getElementById("outputText"),
    resultBadge: document.getElementById("resultBadge"),
    resultNote: document.getElementById("resultNote"),
    beforeChars: document.getElementById("beforeChars"),
    afterChars: document.getElementById("afterChars"),
    rhythmChange: document.getElementById("rhythmChange"),
    scoreRing: document.getElementById("scoreRing"),
    scoreValue: document.getElementById("scoreValue"),
    confidenceLabel: document.getElementById("confidenceLabel"),
    verdictText: document.getElementById("verdictText"),
    verdictCopy: document.getElementById("verdictCopy"),
    metricList: document.getElementById("metricList"),
    signalList: document.getElementById("signalList"),
    attributionText: document.getElementById("attributionText"),
    connectionPill: document.getElementById("connectionPill"),
    connectionText: document.getElementById("connectionText"),
    toast: document.getElementById("toast")
  };

  const samples = {
    rewrite: "It is important to note that our organization has the ability to utilize a wide range of digital tools in order to facilitate better communication. Furthermore, these tools play a crucial role in ensuring that every team member is kept fully informed regarding project developments. Consequently, it is recommended that employees leverage the platform on a regular basis.",
    detect: "In today's rapidly evolving digital landscape, artificial intelligence has emerged as a transformative force across numerous industries. Furthermore, its ability to analyze vast amounts of data enables organizations to make more informed strategic decisions. Moreover, AI-driven solutions can streamline daily operations and enhance customer experiences across multiple touchpoints. Additionally, these robust systems allow teams to automate repetitive tasks while allocating resources more effectively. Consequently, businesses can achieve greater efficiency and unlock meaningful opportunities for sustainable growth. However, successful implementation requires thoughtful planning, clear governance, and ongoing collaboration among key stakeholders. Ultimately, embracing this multifaceted technology is crucial for organizations seeking to remain competitive in a dynamic global marketplace. In conclusion, artificial intelligence offers a seamless pathway toward innovation, productivity, and long-term organizational success."
  };

  let activeMode = "rewrite";
  let lastResultText = "";
  let busy = false;

  function setMode(mode) {
    activeMode = mode;
    const rewrite = mode === "rewrite";
    elements.rewriteTab.classList.toggle("active", rewrite);
    elements.detectTab.classList.toggle("active", !rewrite);
    elements.rewriteTab.setAttribute("aria-selected", String(rewrite));
    elements.detectTab.setAttribute("aria-selected", String(!rewrite));
    elements.rewritePanel.hidden = !rewrite;
    elements.detectPanel.hidden = rewrite;
    if (!lastResultText) showState("empty");
  }

  function updateCounts() {
    const text = elements.textInput.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    elements.wordCount.textContent = `${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
    elements.characterCount.textContent = `${text.length.toLocaleString()} / 40,000`;
  }

  function showState(state) {
    elements.emptyState.hidden = state !== "empty";
    elements.loadingState.hidden = state !== "loading";
    elements.rewriteResult.hidden = state !== "rewrite";
    elements.detectResult.hidden = state !== "detect";
    elements.errorState.hidden = state !== "error";
    elements.resultActions.hidden = !["rewrite", "detect"].includes(state);
  }

  function toast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    window.setTimeout(() => elements.toast.classList.remove("show"), 2200);
  }

  async function post(endpoint, payload) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The request could not be completed.");
    return data;
  }

  function requireText() {
    const text = elements.textInput.value.trim();
    if (!text) {
      elements.textInput.focus();
      toast("Paste some text first");
      return null;
    }
    return text;
  }

  function setBusy(value) {
    busy = value;
    elements.humanizeButton.disabled = value;
    elements.analyzeButton.disabled = value;
  }

  async function runRewrite() {
    const text = requireText();
    if (!text || busy) return;
    setBusy(true);
    elements.loadingTitle.textContent = "Finding your natural rhythm…";
    elements.loadingCopy.textContent = "Preserving facts while smoothing stiff or generic language.";
    showState("loading");
    try {
      const result = await post("/api/humanize", {
        text,
        voice: elements.voiceSelect.value,
        strength: elements.strengthSelect.value,
        audience: elements.audienceInput.value
      });
      lastResultText = result.output;
      elements.outputText.textContent = result.output;
      elements.resultBadge.textContent = `${result.voice} rewrite`;
      elements.resultNote.textContent = result.note;
      elements.beforeChars.textContent = Number(result.changes.charactersBefore).toLocaleString();
      elements.afterChars.textContent = Number(result.changes.charactersAfter).toLocaleString();
      const delta = result.changes.sentenceVariationAfter - result.changes.sentenceVariationBefore;
      elements.rhythmChange.textContent = `${delta >= 0 ? "+" : ""}${delta}`;
      showState("rewrite");
    } catch (error) {
      elements.errorMessage.textContent = error.message;
      showState("error");
    } finally {
      setBusy(false);
    }
  }

  function metricLabel(key) {
    return ({
      sentenceVariation: "Sentence variation",
      vocabularyVariety: "Vocabulary variety",
      formulaicLanguage: "Formulaic language",
      personalVoice: "Personal voice"
    })[key] || key;
  }

  function verdictExplanation(verdict) {
    if (verdict === "AI-patterned") return "This passage contains several patterns often seen in generated or heavily templated prose.";
    if (verdict === "Human-leaning") return "This passage shows more varied, personal, or irregular writing patterns.";
    return "The evidence points in both directions, so a confident authorship call would be misleading.";
  }

  async function runAnalysis() {
    const text = requireText();
    if (!text || busy) return;
    setBusy(true);
    elements.loadingTitle.textContent = "Reading the patterns…";
    elements.loadingCopy.textContent = "Measuring rhythm, structure, vocabulary, and voice.";
    showState("loading");
    try {
      const result = await post("/api/detect", { text });
      lastResultText = [
        `Humanly analysis: ${result.verdict} (${result.score}/100)`,
        `Confidence: ${result.confidence}`,
        "",
        `Signals: ${(result.signals || []).join("; ") || "No strong AI-like signals"}`,
        `Human signals: ${(result.humanSignals || []).join("; ") || "No strong human-leaning signals"}`,
        "",
        result.attribution,
        result.caveat || ""
      ].join("\n");
      elements.scoreRing.style.setProperty("--score", result.score);
      elements.scoreRing.style.setProperty("--ring-color", result.score >= 68 ? "#f2785c" : result.score <= 36 ? "#2f8e6a" : "#d2a13e");
      elements.scoreValue.textContent = result.score;
      elements.confidenceLabel.textContent = `${String(result.confidence).replace("-", " ")} confidence`;
      elements.verdictText.textContent = result.verdict;
      elements.verdictCopy.textContent = verdictExplanation(result.verdict);
      elements.metricList.innerHTML = Object.entries(result.metrics).map(([key, value]) => `
        <div class="metric-row">
          <span>${metricLabel(key)}</span>
          <div class="metric-track"><div class="metric-fill" style="width:${Number(value)}%"></div></div>
          <span class="metric-value">${Number(value)}</span>
        </div>
      `).join("");
      const aiSignals = (result.signals || []).map((signal) => `<span class="signal-chip ai">${escapeHtml(signal)}</span>`);
      const humanSignals = (result.humanSignals || []).map((signal) => `<span class="signal-chip human">${escapeHtml(signal)}</span>`);
      elements.signalList.innerHTML = [...aiSignals, ...humanSignals].join("") || '<span class="signal-chip">Not enough text for strong signals</span>';
      elements.attributionText.textContent = result.attribution;
      showState("detect");
    } catch (error) {
      elements.errorMessage.textContent = error.message;
      showState("error");
    } finally {
      setBusy(false);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function copyResult() {
    if (!lastResultText) return;
    try {
      await navigator.clipboard.writeText(lastResultText);
      toast("Copied to clipboard");
    } catch {
      toast("Copy failed — select the result manually");
    }
  }

  function downloadResult() {
    if (!lastResultText) return;
    const blob = new Blob([lastResultText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = activeMode === "rewrite" ? "humanly-rewrite.txt" : "humanly-analysis.txt";
    anchor.click();
    URL.revokeObjectURL(url);
    toast("Download started");
  }

  async function checkStatus() {
    try {
      const response = await fetch("/api/status");
      const status = await response.json();
      elements.connectionPill.classList.add("connected");
      elements.connectionText.textContent = status.modelConnected ? "Model connected" : "Local demo mode";
      elements.textInput.maxLength = status.maxTextChars || 40000;
    } catch {
      elements.connectionText.textContent = "Engine offline";
    }
  }

  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  elements.textInput.addEventListener("input", updateCounts);
  elements.textInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      activeMode === "rewrite" ? runRewrite() : runAnalysis();
    }
  });
  elements.sampleButton.addEventListener("click", () => {
    elements.textInput.value = samples[activeMode];
    updateCounts();
    elements.textInput.focus();
  });
  elements.clearButton.addEventListener("click", () => {
    elements.textInput.value = "";
    lastResultText = "";
    updateCounts();
    showState("empty");
    elements.textInput.focus();
  });
  elements.humanizeButton.addEventListener("click", runRewrite);
  elements.analyzeButton.addEventListener("click", runAnalysis);
  elements.retryButton.addEventListener("click", () => activeMode === "rewrite" ? runRewrite() : runAnalysis());
  elements.copyButton.addEventListener("click", copyResult);
  elements.downloadButton.addEventListener("click", downloadResult);

  updateCounts();
  checkStatus();
})();
