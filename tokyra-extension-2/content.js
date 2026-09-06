(() => {
  "use strict";

  if (window.__tokyraExtensionLoaded) return;
  window.__tokyraExtensionLoaded = true;

  const DEFAULTS = {
    mode: "auto",
    targetReduction: 35,
    enabled: true,
    showInline: true,
    autoAnalyze: true,
    analysisDelay: 1200,
    minCharacters: 80,
    disabledSites: []
  };

  const state = {
    settings: { ...DEFAULTS },
    activeEditor: null,
    result: null,
    resultSource: "",
    lastRequested: "",
    loading: false,
    pending: false,
    applying: false,
    dismissedSource: "",
    debounceTimer: null,
    hideTimer: null
  };

  const host = document.createElement("div");
  host.id = "tokyra-extension-root";
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;inset:0 auto auto 0;width:0;height:0;";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    :host{--green:#15a05c;--green-dark:#11864e;--ink:#17221d;--muted:#6b7770;--line:#e1e8e3;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
    *{box-sizing:border-box}.hidden{display:none!important}button{font:inherit}
    .launcher{position:fixed;display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:50%;background:var(--green);color:#fff;cursor:pointer;box-shadow:0 4px 15px rgba(10,85,45,.27);transition:transform .15s,box-shadow .15s,background .15s;z-index:2}
    .launcher:hover{transform:scale(1.07);box-shadow:0 6px 20px rgba(10,85,45,.32)}.launcher:focus-visible{outline:3px solid rgba(21,160,92,.22);outline-offset:2px}.launcher svg{width:18px;height:18px}
    .launcher.loading:after{content:"";position:absolute;inset:-3px;border:2px solid rgba(21,160,92,.2);border-top-color:var(--green);border-radius:50%;animation:spin .75s linear infinite}.launcher.loading{background:#fff;color:var(--green)}
    .launcher.queued{background:#4d8c69}.launcher.error{background:#b9574c}.launcher .count{position:absolute;top:-6px;right:-6px;display:grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border:2px solid #fff;border-radius:10px;background:#222d27;color:#fff;font-size:9px;font-weight:850;line-height:1}
    .card{position:fixed;width:min(380px,calc(100vw - 24px));max-height:min(570px,calc(100vh - 24px));display:flex;flex-direction:column;border:1px solid rgba(18,45,31,.13);border-radius:15px;background:#fff;box-shadow:0 18px 55px rgba(22,35,28,.22);overflow:hidden;animation:arrive .16s ease-out}
    .head{display:flex;align-items:center;gap:10px;padding:13px 14px;border-bottom:1px solid var(--line)}.brand{display:grid;place-items:center;width:29px;height:29px;border-radius:9px;background:var(--green);color:#fff}.brand svg{width:17px}.title{min-width:0;flex:1}.title strong{display:block;font-size:13px;line-height:17px}.title span{display:block;color:var(--muted);font-size:10px;line-height:14px}.icon-btn{display:grid;place-items:center;width:29px;height:29px;border:0;border-radius:8px;background:transparent;color:#6f7974;cursor:pointer}.icon-btn:hover{background:#f2f5f3;color:#202923}.icon-btn svg{width:16px;height:16px}
    .body{overflow:auto}.loading-panel{display:flex;align-items:center;gap:11px;padding:18px 16px;color:#4f5d55;font-size:12px}.spinner{width:18px;height:18px;flex:none;border:2px solid #d8e8de;border-top-color:var(--green);border-radius:50%;animation:spin .7s linear infinite}.loading-panel strong{display:block;color:var(--ink);font-size:12px}.loading-panel span{display:block;margin-top:2px;color:var(--muted);font-size:10px}
    .error{margin:14px;padding:11px 12px;border:1px solid #ffd4cf;border-radius:9px;background:#fff4f2;color:#9d392f;font-size:11px;line-height:16px}.result{padding:0 14px 14px}.success-row{display:flex;align-items:center;gap:7px;padding:13px 1px 10px;color:#167745;font-size:11px;font-weight:800}.success-row svg{width:15px;height:15px}
    .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:10px}.metric{padding:8px;border:1px solid var(--line);border-radius:8px;background:#fbfcfb}.metric b{display:block;font-size:14px;line-height:17px}.metric span{display:block;margin-top:1px;color:var(--muted);font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
    .suggestion-label{display:flex;align-items:center;justify-content:space-between;margin:0 1px 6px}.suggestion-label strong{font-size:10px;text-transform:uppercase;letter-spacing:.05em}.suggestion-label span{color:var(--muted);font-size:9px}.suggestion{position:relative;max-height:235px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dce5df;border-left:3px solid var(--green);border-radius:9px;background:#fbfdfb;padding:11px 11px 35px;color:#28332d;font:11px/1.52 ui-monospace,SFMono-Regular,Menlo,monospace}.copy{position:absolute;right:6px;bottom:6px;border:0;border-radius:6px;background:#eaf2ed;color:#506057;padding:5px 8px;font:800 9px/1 inherit;cursor:pointer}.copy:hover{background:#dfeae2}
    .actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px}.accept,.dismiss{height:38px;border-radius:9px;font-size:11px;font-weight:800;cursor:pointer}.accept{border:0;background:var(--green);color:#fff}.accept:hover{background:var(--green-dark)}.dismiss{border:1px solid #dce4df;background:#fff;color:#59665f;padding:0 13px}.dismiss:hover{background:#f5f7f6}.warning{margin:8px 1px 0;color:#786941;font-size:9px;line-height:14px}
    @keyframes spin{to{transform:rotate(360deg)}}@keyframes arrive{from{opacity:0;transform:translateY(5px) scale(.985)}to{opacity:1;transform:none}}
    @media(max-width:520px){.card{left:12px!important;right:12px!important;bottom:12px!important;top:auto!important;width:auto}.launcher{right:12px!important}.metrics{grid-template-columns:repeat(3,1fr)}}
  `;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <button class="launcher hidden" type="button" aria-label="Open Tokyra suggestion" title="Tokyra is ready">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M7.8 12h8.4M10.3 17h3.4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
      <span class="count hidden">1</span>
    </button>
    <section class="card hidden" role="dialog" aria-label="Tokyra writing suggestion">
      <header class="head">
        <span class="brand"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M7.8 12h8.4M10.3 17h3.4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></span>
        <div class="title"><strong>Tokyra suggestion</strong><span>Updates automatically as you write</span></div>
        <button class="icon-btn close" type="button" aria-label="Close"><svg viewBox="0 0 24 24" fill="none"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </header>
      <div class="body">
        <div class="loading-panel hidden"><span class="spinner"></span><div><strong>Checking your prompt…</strong><span>You can keep typing. Tokyra will use the latest version.</span></div></div>
        <div class="error hidden"></div>
        <div class="result hidden">
          <div class="success-row"><svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Suggested rewrite ready</span></div>
          <div class="metrics"><div class="metric"><b data-metric="saved">—</b><span>tokens saved</span></div><div class="metric"><b data-metric="compression">—</b><span>shorter</span></div><div class="metric"><b data-metric="fidelity">—</b><span>fidelity</span></div></div>
          <div class="suggestion-label"><strong>Replace with</strong><span>Meaning preserved</span></div>
          <div class="suggestion"><span class="suggestion-text"></span><button class="copy" type="button">Copy</button></div>
          <div class="actions"><button class="accept" type="button">Apply suggestion</button><button class="dismiss" type="button">Dismiss</button></div>
          <div class="warning hidden"></div>
        </div>
      </div>
    </section>
  `;
  shadow.append(style, wrapper);

  const launcher = wrapper.querySelector(".launcher");
  const badge = wrapper.querySelector(".count");
  const card = wrapper.querySelector(".card");
  const loadingPanel = wrapper.querySelector(".loading-panel");
  const resultPanel = wrapper.querySelector(".result");
  const errorPanel = wrapper.querySelector(".error");
  const suggestionText = wrapper.querySelector(".suggestion-text");

  function isEditor(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.closest("[data-tokyra-ignore='true']")) return false;
    if (element.matches("textarea")) return !element.disabled && !element.readOnly;
    if (element.matches("input")) {
      const sensitiveAutocomplete = ["current-password", "new-password", "one-time-code", "cc-number", "cc-csc"];
      return ["text", "search", "url", "email", ""].includes(element.type) &&
        !sensitiveAutocomplete.includes(String(element.autocomplete || "").toLowerCase()) &&
        !element.disabled && !element.readOnly;
    }
    return element.isContentEditable || Boolean(element.closest("[contenteditable='true']"));
  }

  function resolveEditor(element) {
    if (!(element instanceof HTMLElement)) return null;
    const editableRoot = element.closest("[contenteditable='true']");
    if (editableRoot) return isEditor(editableRoot) ? editableRoot : null;
    if (isEditor(element)) return element;
    const candidate = element.closest("textarea,input,[contenteditable='true']");
    return candidate && isEditor(candidate) ? candidate : null;
  }

  function readEditor(editor) {
    if (!editor) return "";
    if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) return editor.value;
    return editor.innerText || editor.textContent || "";
  }

  function writeEditor(editor, value) {
    if (!editor) return false;
    editor.focus();
    if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
      const prototype = editor instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      if (!descriptor || !descriptor.set) return false;
      descriptor.set.call(editor, value);
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: value }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      editor.setSelectionRange(value.length, value.length);
      return true;
    }
    if (editor.isContentEditable) {
      editor.textContent = value;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: value }));
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return true;
    }
    return false;
  }

  function currentSiteDisabled() {
    return state.settings.disabledSites.some((site) => location.hostname === site || location.hostname.endsWith(`.${site}`));
  }

  function isUsableEditor(editor) {
    if (!isEditor(editor) || !editor.isConnected) return false;
    const rect = editor.getBoundingClientRect();
    return rect.width >= 120 && rect.height >= 28;
  }

  function assistantEnabled() {
    return state.settings.enabled && state.settings.showInline && !currentSiteDisabled();
  }

  function positionLauncher() {
    const editor = state.activeEditor;
    if (!editor || launcher.classList.contains("hidden")) return;
    const rect = editor.getBoundingClientRect();
    const size = 32;
    launcher.style.left = `${Math.max(8, Math.min(window.innerWidth - size - 8, rect.right - size - 7))}px`;
    launcher.style.top = `${Math.max(8, Math.min(window.innerHeight - size - 8, rect.bottom - size - 7))}px`;
  }

  function positionCard() {
    const editor = state.activeEditor;
    if (!editor || card.classList.contains("hidden")) return;
    const rect = editor.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 24);
    const cardHeight = Math.min(card.offsetHeight || 430, window.innerHeight - 24);
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
    let top = rect.bottom + 8;
    if (top + cardHeight > window.innerHeight - 12) top = Math.max(12, rect.top - cardHeight - 8);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function setLauncherStatus(status) {
    launcher.classList.remove("loading", "queued", "error");
    badge.classList.add("hidden");
    if (status === "loading") {
      launcher.classList.add("loading");
      launcher.title = "Tokyra is checking your prompt";
    } else if (status === "queued") {
      launcher.classList.add("queued");
      launcher.title = "Tokyra will check after you pause typing";
    } else if (status === "suggestion") {
      badge.classList.remove("hidden");
      launcher.title = "1 Tokyra suggestion";
    } else if (status === "error") {
      launcher.classList.add("error");
      launcher.title = "Tokyra could not check this prompt";
    } else {
      launcher.title = "Tokyra is ready";
    }
  }

  function showForEditor(editor) {
    if (!assistantEnabled() || !isUsableEditor(editor)) return;
    if (state.activeEditor !== editor) {
      clearTimeout(state.debounceTimer);
      state.activeEditor = editor;
      state.result = null;
      state.resultSource = "";
      state.lastRequested = "";
      state.dismissedSource = "";
      card.classList.add("hidden");
      setLauncherStatus("idle");
    }
    launcher.classList.remove("hidden");
    positionLauncher();
    scheduleAnalysis();
  }

  function hideAll() {
    clearTimeout(state.debounceTimer);
    card.classList.add("hidden");
    launcher.classList.add("hidden");
    state.result = null;
    state.pending = false;
  }

  function showCard(panel = "result") {
    if (!state.activeEditor) return;
    card.classList.remove("hidden");
    loadingPanel.classList.toggle("hidden", panel !== "loading");
    resultPanel.classList.toggle("hidden", panel !== "result");
    errorPanel.classList.toggle("hidden", panel !== "error");
    requestAnimationFrame(positionCard);
  }

  function displayError(message, openCard = false) {
    errorPanel.textContent = message;
    setLauncherStatus("error");
    if (openCard) showCard("error");
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function hasUsefulSuggestion(result, source) {
    return result && typeof result.optimized === "string" &&
      result.optimized.trim() && result.optimized.trim() !== source.trim() &&
      number(result.tokensSaved) > 0;
  }

  function displayResult(result, source, autoOpen) {
    state.result = result;
    state.resultSource = source;
    suggestionText.textContent = result.optimized;
    wrapper.querySelector("[data-metric='saved']").textContent = Math.max(0, Math.round(number(result.tokensSaved))).toLocaleString();
    wrapper.querySelector("[data-metric='compression']").textContent = `${Math.max(0, Math.round(number(result.compressionPercentPrecise, result.compressionPercent)))}%`;
    wrapper.querySelector("[data-metric='fidelity']").textContent = `${Math.round(number(result.fidelityPercent, 100))}%`;
    const warning = wrapper.querySelector(".warning");
    warning.textContent = result.warning || "";
    warning.classList.toggle("hidden", !result.warning);
    setLauncherStatus("suggestion");
    if (autoOpen && state.dismissedSource !== source) showCard("result");
  }

  function sendOptimize(prompt) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "TOKYRA_OPTIMIZE",
        prompt,
        mode: state.settings.mode,
        targetReduction: state.settings.targetReduction
      }, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response || !response.ok) return reject(new Error(response && response.error ? response.error : "Tokyra could not optimize this prompt."));
        resolve(response.result);
      });
    });
  }

  function scheduleAnalysis(delay = state.settings.analysisDelay) {
    clearTimeout(state.debounceTimer);
    if (!assistantEnabled() || !state.settings.autoAnalyze || !state.activeEditor) return;
    const prompt = readEditor(state.activeEditor).trim();
    if (prompt.length < state.settings.minCharacters || prompt === state.lastRequested) {
      if (!state.loading && !state.result) setLauncherStatus("idle");
      return;
    }
    setLauncherStatus(state.loading ? "loading" : "queued");
    state.debounceTimer = setTimeout(() => analyzeCurrent(false), Math.max(400, Number(delay) || 1200));
  }

  async function analyzeCurrent(force) {
    if (!state.activeEditor || !assistantEnabled()) return;
    const prompt = readEditor(state.activeEditor).trim();
    if (!prompt || (!force && prompt.length < state.settings.minCharacters)) return;
    if (state.loading) {
      state.pending = true;
      return;
    }
    if (!force && prompt === state.lastRequested) return;

    state.loading = true;
    state.pending = false;
    state.lastRequested = prompt;
    setLauncherStatus("loading");

    try {
      const result = await sendOptimize(prompt);
      const current = readEditor(state.activeEditor).trim();
      if (current !== prompt) {
        state.pending = true;
        return;
      }
      if (hasUsefulSuggestion(result, prompt)) {
        displayResult(result, prompt, true);
      } else {
        state.result = null;
        state.resultSource = "";
        card.classList.add("hidden");
        setLauncherStatus("idle");
      }
    } catch (error) {
      displayError(error && error.message ? error.message : "Tokyra could not check this prompt.", force);
    } finally {
      state.loading = false;
      const current = readEditor(state.activeEditor).trim();
      if (state.pending || current !== state.lastRequested) {
        state.pending = false;
        scheduleAnalysis(450);
      } else if (!state.result && !launcher.classList.contains("error")) {
        setLauncherStatus("idle");
      }
    }
  }

  document.addEventListener("focusin", (event) => {
    const editor = resolveEditor(event.target);
    if (editor) showForEditor(editor);
  }, true);

  document.addEventListener("input", (event) => {
    const editor = resolveEditor(event.target);
    if (!editor) return;
    if (state.applying) {
      state.applying = false;
      return;
    }
    if (editor !== state.activeEditor) showForEditor(editor);
    state.result = null;
    state.resultSource = "";
    state.dismissedSource = "";
    card.classList.add("hidden");
    scheduleAnalysis();
  }, true);

  document.addEventListener("focusout", () => {
    clearTimeout(state.hideTimer);
    state.hideTimer = setTimeout(() => {
      if (card.classList.contains("hidden") && !isEditor(document.activeElement)) launcher.classList.add("hidden");
    }, 250);
  }, true);

  window.addEventListener("scroll", () => { positionLauncher(); positionCard(); }, true);
  window.addEventListener("resize", () => { positionLauncher(); positionCard(); });

  launcher.addEventListener("click", () => {
    const current = readEditor(state.activeEditor).trim();
    if (state.result && state.resultSource === current) return showCard("result");
    if (state.loading) return showCard("loading");
    showCard("loading");
    analyzeCurrent(true);
  });

  wrapper.querySelector(".close").addEventListener("click", () => card.classList.add("hidden"));
  wrapper.querySelector(".dismiss").addEventListener("click", () => {
    state.dismissedSource = state.resultSource;
    card.classList.add("hidden");
  });
  wrapper.querySelector(".accept").addEventListener("click", () => {
    if (!state.result) return;
    if (readEditor(state.activeEditor).trim() !== state.resultSource) {
      displayError("This text changed while Tokyra was checking it. The latest version is being analyzed now.", true);
      scheduleAnalysis(0);
      return;
    }
    state.applying = true;
    if (writeEditor(state.activeEditor, state.result.optimized)) {
      state.lastRequested = state.result.optimized.trim();
      state.result = null;
      state.resultSource = "";
      card.classList.add("hidden");
      setLauncherStatus("idle");
    } else {
      state.applying = false;
      displayError("This editor blocks automatic replacement. Use Copy instead.", true);
    }
  });
  wrapper.querySelector(".copy").addEventListener("click", async (event) => {
    if (!state.result) return;
    await navigator.clipboard.writeText(state.result.optimized);
    const button = event.currentTarget;
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = "Copy"; }, 1200);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "TOKYRA_CONTEXT_OPTIMIZE") {
      const editor = resolveEditor(document.activeElement) || state.activeEditor;
      if (editor) {
        showForEditor(editor);
        showCard("loading");
        analyzeCurrent(true);
      }
    }
  });

  chrome.storage.sync.get(DEFAULTS, (saved) => {
    state.settings = { ...DEFAULTS, ...saved };
    const editor = resolveEditor(document.activeElement);
    if (editor) showForEditor(editor);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, change] of Object.entries(changes)) state.settings[key] = change.newValue;
    if (!assistantEnabled()) hideAll();
    else scheduleAnalysis();
  });
})();
