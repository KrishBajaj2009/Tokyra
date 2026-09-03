(() => {
  "use strict";

  const WORKER_URL = "https://tokyra-compressor.tokyracompany.workers.dev";
  const MAX_INPUT_CHARS = 500000;

  const input = document.getElementById("promptInput");
  const output = document.getElementById("output");
  const compressBtn = document.getElementById("compressBtn");
  const compressLabel = compressBtn.querySelector(".button-label");
  const copyBtn = document.getElementById("copyBtn");
  const clearBtn = document.getElementById("clearBtn");
  const sampleBtn = document.getElementById("sampleBtn");
  const voiceBtn = document.getElementById("voiceBtn");
  const uploadBtn = document.getElementById("uploadBtn");
  const fileInput = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  const fileMeta = document.getElementById("fileMeta");
  const characterCount = document.getElementById("characterCount");
  const outputCount = document.getElementById("outputCount");
  const limitHint = document.getElementById("limitHint");
  const status = document.getElementById("status");
  const statusText = document.getElementById("statusText");
  let activeController = null;
  let activeRequestId = 0;

  const fields = {
    originalTokens: document.getElementById("originalTokens"),
    optimizedTokens: document.getElementById("optimizedTokens"),
    savedTokens: document.getElementById("savedTokens"),
    compressionPercent: document.getElementById("compressionPercent"),
    fidelity: document.getElementById("fidelity"),
    latency: document.getElementById("latency"),
    cfs: document.getElementById("cfs")
  };

  const samplePrompt = "You are a helpful customer support assistant. Carefully read the customer's request, identify the main issue, and write a clear, concise, friendly response that directly answers every question. Apologize when the customer experienced an inconvenience, explain the next practical step, and set an honest expectation for when they will hear back. Avoid unnecessary technical language, internal implementation details, blame, unsupported guarantees, and promises the company has not approved. Keep the answer professional and empathetic. Use short paragraphs, preserve any dates or reference numbers supplied by the customer, and end by thanking them for their patience. Do not repeat the same point in multiple ways. Return only the customer-facing response without analysis, notes, or a preamble.";

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
  const formatNumber = (value) => new Intl.NumberFormat().format(number(value));

  const describeError = (value, fallback = "Compression failed.") => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value.message === "string" && value.message.trim()) return value.message.trim();
    return fallback;
  };

  const readApiResponse = async (response) => {
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      const error = new Error("The server returned an unreadable response.");
      error.status = response.status;
      throw error;
    }

    if (!response.ok) {
      const fallback = response.status === 429
        ? "The free compression service is busy or has reached its current limit. Try again later."
        : "Compression failed.";
      const error = new Error(describeError(data.error || data.message, fallback));
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const setStatus = (message, state = "") => {
    status.className = `status-bar${state ? ` ${state}` : ""}`;
    statusText.textContent = message;
  };

  const resetMetrics = () => {
    Object.values(fields).forEach((field) => { field.textContent = "—"; });
    fields.fidelity.classList.remove("metric-unverified");
    fields.fidelity.removeAttribute("title");
  };

  const updateCounts = () => {
    const inputLength = input.value.length;
    characterCount.textContent = `${inputLength.toLocaleString()} characters`;

    if (inputLength > MAX_INPUT_CHARS) {
      characterCount.classList.add("limit-note");
      limitHint.textContent = `Limit exceeded by ${(inputLength - MAX_INPUT_CHARS).toLocaleString()} characters`;
    } else {
      characterCount.classList.remove("limit-note");
      limitHint.textContent = `${MAX_INPUT_CHARS.toLocaleString()} character ceiling · ⌘/Ctrl + Enter`;
    }

    const outputText = output.classList.contains("is-placeholder") ? "" : output.textContent;
    outputCount.textContent = `${outputText.length.toLocaleString()} characters`;
  };

  const setOutput = (text, { placeholder = false, loading = false } = {}) => {
    output.textContent = text;
    output.classList.toggle("is-placeholder", placeholder);
    output.classList.toggle("is-loading", loading);
    copyBtn.disabled = placeholder || loading || !text.trim();
    updateCounts();
  };

  const setCompressionButtonBusy = (busy) => {
    compressBtn.disabled = busy;
    compressBtn.classList.toggle("is-busy", busy);
    compressBtn.setAttribute("aria-busy", String(busy));
    compressLabel.textContent = busy ? "Compressing signal" : "Compress prompt";
  };

  const cancelActiveCompression = (message = "") => {
    if (!activeController) return false;
    activeRequestId += 1;
    activeController.abort();
    activeController = null;
    setCompressionButtonBusy(false);
    if (output.classList.contains("is-loading")) {
      setOutput("Your compressed prompt will appear here.", { placeholder: true });
    }
    if (message) setStatus(message);
    return true;
  };

  const displayCompressionResult = (data, startedAt) => {
    const optimized = String(data.optimized || data.optimizedPrompt || "").trim();
    if (!optimized) throw new Error("No optimized prompt was returned.");

    setOutput(optimized);
    fields.originalTokens.textContent = formatNumber(data.originalTokens);
    fields.optimizedTokens.textContent = formatNumber(data.optimizedTokens);

    const originalTokens = number(data.originalTokens);
    const optimizedTokens = number(data.optimizedTokens);
    const tokensSaved = optionalNumber(data.tokensSaved) ?? Math.max(0, originalTokens - optimizedTokens);
    const preciseCompression = optionalPercent(data.compressionPercentPrecise);
    const compression = optionalPercent(data.compressionPercent) ?? preciseCompression ??
      (originalTokens > 0 ? Math.max(0, (tokensSaved / originalTokens) * 100) : 0);
    const fidelity = readFidelity(data);
    const cfsScore = number(data.cfsScore);
    const latency = number(data.latencyMs, Date.now() - startedAt);
    const judgeStatus = String(data.semanticJudgeStatus || "").toLowerCase();
    const verificationUnavailable = fidelity === null || judgeStatus === "unavailable";
    const verificationFailed = data.fidelityAccepted === false ||
      judgeStatus === "rejected" ||
      (data.semanticJudgeAccepted === false && !["", "not_required", "unavailable"].includes(judgeStatus));
    const reviewRequired = verificationUnavailable || verificationFailed ||
      data.status === "optimized-review-required" ||
      data.qualityTier === "review" ||
      data.accepted === false;
    const resultStatus = String(data.status || "").toLowerCase();
    const explicitlyUnchanged = data.unchanged === true ||
      data.noVerifiedShorterCandidate === true ||
      resultStatus === "skipped" ||
      resultStatus === "no-verified-shorter-candidate";
    const explicitlyChanged = data.unchanged === false ||
      data.accepted === true ||
      resultStatus.startsWith("optimized") ||
      ["accepted", "complete", "success"].includes(resultStatus);
    const outputChanged = optimized !== input.value.trim();
    const unchanged = explicitlyUnchanged ||
      (!explicitlyChanged && !outputChanged && tokensSaved <= 0 && (preciseCompression ?? compression) <= 0);

    fields.savedTokens.textContent = formatNumber(tokensSaved);
    fields.compressionPercent.textContent = `${Math.round(compression)}%`;
    fields.fidelity.textContent = fidelity === null ? "Unverified" : `${Math.round(fidelity)}%`;
    fields.fidelity.classList.toggle("metric-unverified", fidelity === null);
    fields.fidelity.title = fidelity === null
      ? "The current Worker returned no verified fidelity score for this result."
      : "";
    fields.cfs.textContent = cfsScore.toFixed(cfsScore % 1 ? 1 : 0);
    fields.latency.textContent = `${Math.round(latency)}ms`;

    document.dispatchEvent(new CustomEvent("tokyra:compression", { detail: { compression, fidelity, tokensSaved } }));

    if (unchanged) {
      setStatus("No shorter result passed every safety check, so Tokyra preserved the original prompt.", "success");
      window.TokyraUI?.toast("Original preserved — no safe reduction passed.");
    } else if (reviewRequired) {
      const reviewMessage = verificationUnavailable
        ? "A shorter draft was produced, but fidelity was not verified for this run. Review it before use."
        : verificationFailed
          ? "A shorter draft was produced, but it did not pass all verification checks. Review it before use."
          : "A shorter draft was produced and requires review before use.";
      setStatus(reviewMessage, "review");
      window.TokyraUI?.toast("Shorter draft ready — fidelity review required.");
    } else {
      setStatus(`Compression complete at ${Math.round(fidelity)}% fidelity. Review the output before using it.`, "success");
      window.TokyraUI?.toast(`${formatNumber(tokensSaved)} tokens removed at ${Math.round(fidelity)}% fidelity.`);
    }
  };

  const humanFileSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes || 0} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
  };

  const applyPromptText = (text, sourceLabel) => {
    cancelActiveCompression("The active request was cancelled because the prompt changed.");
    input.value = text;
    updateCounts();
    fileMeta.textContent = sourceLabel;
    input.focus();
  };

  async function loadTextFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      applyPromptText(text, `${file.name} · ${humanFileSize(file.size)} · ${text.length.toLocaleString()} chars`);
      if (text.length > MAX_INPUT_CHARS) {
        setStatus(`Loaded ${file.name}, but it exceeds the ${MAX_INPUT_CHARS.toLocaleString()} character limit. Split it before compressing.`, "error");
      } else {
        setStatus(`Loaded ${file.name}. Ready to compress.`, "success");
      }
    } catch (error) {
      console.error("File load error:", error);
      setStatus("That file could not be read as text.", "error");
      fileMeta.textContent = "File load failed";
    }
  }

  async function compressPrompt() {
    if (activeController) {
      setStatus("Compression is already in progress. Wait for it to finish or edit the prompt to cancel it.", "loading");
      return;
    }

    const prompt = input.value.trim();
    if (!prompt) {
      setStatus("Add a prompt before compressing.", "error");
      input.focus();
      return;
    }
    if (prompt.length > MAX_INPUT_CHARS) {
      setStatus(`This prompt is ${prompt.length.toLocaleString()} characters. Tokyra accepts up to ${MAX_INPUT_CHARS.toLocaleString()} per request.`, "error");
      input.focus();
      return;
    }

    setCompressionButtonBusy(true);
    setStatus("Separating signal from repetition…", "loading");
    setOutput("Processing your prompt…", { placeholder: true, loading: true });
    resetMetrics();
    const startedAt = Date.now();
    const requestId = ++activeRequestId;
    const controller = new AbortController();
    activeController = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 90000);

    try {
      const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "balanced", targetReduction: 66 }),
        signal: controller.signal
      });
      const data = await readApiResponse(response);
      if (requestId !== activeRequestId) return;
      displayCompressionResult(data, startedAt);
    } catch (error) {
      if (requestId !== activeRequestId) return;
      console.error("Tokyra compression error:", error);
      const message = timedOut
        ? "Compression timed out after 90 seconds. Try a shorter prompt or split it into sections."
        : /CPU time limit/i.test(error.message || "")
        ? "This prompt exceeded Cloudflare Free's processing limit. Try a shorter prompt or split it into sections."
        : error.message || "Compression failed.";
      setOutput(`Unable to compress this prompt. ${message}`, { placeholder: true });
      setStatus(message, "error");
    } finally {
      clearTimeout(timeout);
      if (requestId === activeRequestId) {
        activeController = null;
        setCompressionButtonBusy(false);
      }
    }
  }

  input.addEventListener("input", () => {
    cancelActiveCompression("The active request was cancelled because the prompt changed.");
    updateCounts();
  });
  input.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      compressPrompt();
    }
  });

  compressBtn.addEventListener("click", compressPrompt);

  clearBtn.addEventListener("click", () => {
    cancelActiveCompression();
    input.value = "";
    fileInput.value = "";
    setOutput("Your compressed prompt will appear here.", { placeholder: true });
    resetMetrics();
    fileMeta.textContent = "TXT · MD · JSON · CSV · HTML · XML · YAML";
    setStatus("Ready for fast compression.");
    updateCounts();
    input.focus();
  });

  sampleBtn.addEventListener("click", () => {
    applyPromptText(samplePrompt, "Preloaded customer-support sample");
    setStatus("Sample prompt loaded. Ready to compress.");
  });

  copyBtn.addEventListener("click", async () => {
    const text = output.textContent;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied";
      setTimeout(() => { copyBtn.textContent = "Copy output"; }, 1400);
      window.TokyraUI?.toast("Optimized prompt copied.");
    } catch {
      const range = document.createRange();
      range.selectNodeContents(output);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      setStatus("Clipboard access was blocked. The output is selected for manual copying.", "error");
    }
  });

  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const [file] = fileInput.files || [];
    await loadTextFile(file);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-active");
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-active");
    });
  });

  dropzone.addEventListener("drop", async (event) => {
    const [file] = event.dataTransfer?.files || [];
    await loadTextFile(file);
  });
  dropzone.addEventListener("click", () => fileInput.click());

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.hidden = true;
  } else {
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    voiceBtn.addEventListener("click", () => recognition.start());
    recognition.addEventListener("start", () => {
      voiceBtn.textContent = "Listening…";
      voiceBtn.setAttribute("aria-pressed", "true");
      setStatus("Listening for your prompt…", "loading");
    });
    recognition.addEventListener("result", (event) => {
      cancelActiveCompression("The active request was cancelled because the prompt changed.");
      input.value = Array.from(event.results).map((result) => result[0].transcript).join(" ");
      updateCounts();
    });
    recognition.addEventListener("end", () => {
      voiceBtn.textContent = "Voice";
      voiceBtn.setAttribute("aria-pressed", "false");
      setStatus("Voice input added. Ready to compress.");
    });
    recognition.addEventListener("error", () => {
      voiceBtn.textContent = "Voice";
      voiceBtn.setAttribute("aria-pressed", "false");
      setStatus("Voice input is unavailable. Type, paste, or upload a prompt instead.", "error");
    });
  }

  try {
    localStorage.removeItem("tokyraMaximumCompressionJob");
  } catch {
    // Ignore browsers that block storage.
  }

  updateCounts();
})();
