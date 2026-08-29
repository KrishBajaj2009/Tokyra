(() => {
  "use strict";

  const demos = [
    {
      name: "Customer support",
      original: "You are a helpful customer support assistant. Carefully read the customer's request, identify the main issue, and write a clear, concise, friendly response that directly answers every question. Apologize when the customer experienced an inconvenience, explain the next practical step, and set an honest expectation for when they will hear back. Avoid unnecessary technical language, internal implementation details, blame, unsupported guarantees, and promises the company has not approved. Keep the answer professional and empathetic. Use short paragraphs, preserve any dates or reference numbers supplied by the customer, and end by thanking them for their patience. Do not repeat the same point in multiple ways. Return only the customer-facing response without analysis, notes, or a preamble.",
      optimized: "Write a concise, friendly customer-support response that answers every question. If there was inconvenience, apologize, give the next practical step and an honest follow-up expectation. Avoid technical/internal details, blame, unsupported guarantees, or unapproved promises. Preserve supplied dates/reference numbers, use short professional paragraphs, avoid repetition, thank the customer, and return only the customer-facing response.",
      originalTokens: "126",
      optimizedTokens: "68",
      savedTokens: "58",
      compression: "46%",
      fidelity: "98%",
      latency: "1180ms"
    },
    {
      name: "Complex coding workflow",
      original: "Act as a senior software engineer helping debug a production web application. Before making changes, read all supplied code, configuration, error messages, stack traces, environment-variable names, routes, package versions, database fields, and user requirements. Determine the actual root cause rather than guessing from one error. Preserve all unrelated functionality and make the smallest safe change that fully resolves the problem. Do not rename public APIs, exported functions, environment variables, routes, configuration keys, file paths, CSS classes referenced by JavaScript, database fields, analytics events, or external identifiers unless explicitly requested. Do not remove validation, authentication, authorization, rate limiting, logging, caching, retries, accessibility behavior, responsive behavior, or browser compatibility. Preserve exact numbers, limits, model names, URLs, paths, dates, IDs, prices, percentages, and technical literals when they affect behavior. Prefer existing dependencies and project patterns; do not invent libraries, endpoints, services, files, routes, tables, or frameworks. Check syntax, imports, async behavior, malformed responses, empty and very large input, network failures, duplicate submissions, stale state, security regressions, and mobile layouts. Return the root cause, the minimal fix, complete replacement code for changed files, and a short verification section. Avoid filler and unrelated refactors.",
      optimized: "Debug the production app as a senior engineer. Read all supplied code/config/errors and identify the real root cause. Make the smallest safe fix while preserving unrelated behavior and existing validation, auth, rate limits, logging, caching, retries, accessibility, responsiveness, and compatibility. Do not rename public APIs, exports, env vars, routes, config keys, paths, JS-referenced CSS classes, DB fields, events, or external IDs unless requested. Preserve behavior-critical literals. Prefer existing dependencies; do not invent files, APIs, services, routes, tables, or frameworks. Check syntax/imports, async behavior, malformed responses, empty/large input, failures, duplicate submissions, stale state, security, and mobile layouts. Return root cause, minimal fix, complete changed-file code, and brief verification.",
      originalTokens: "225",
      optimizedTokens: "112",
      savedTokens: "113",
      compression: "50%",
      fidelity: "98%",
      latency: "1390ms"
    },
    {
      name: "Extreme production workflow",
      original: "[Representative excerpt from the preloaded ≈10,200-token prompt]\n\nYou are Tokyra's senior production engineering agent. Repair a complex production application with the smallest safe change while preserving every explicit constraint. Read every supplied source file, configuration block, stack trace, request log, schema, package version, build setting, environment-variable name, route, and prior implementation note before proposing a change. Trace the symptom to its actual root cause. Preserve all unrelated behavior, API contracts, UI flows, keyboard behavior, browser compatibility, validation, caching, retries, analytics, logging, accessibility, public interfaces, exact literals, security boundaries, database semantics, and deployment constraints. Apply these requirements continuously throughout investigation, implementation, verification, and final output. The full preloaded prompt repeats and expands this policy across 70+ detailed requirements…",
      optimized: "Act as Tokyra’s senior production engineer. Repair the supplied application with the smallest safe change while preserving every explicit constraint and unrelated behavior.\n\nINVESTIGATE: Read all supplied source, config, errors, logs, schemas, versions, environment variables, routes, deployment settings, model IDs, database fields, and prior notes. Trace symptoms to the root cause.\n\nPRESERVE: Do not alter public interfaces, response shapes, data semantics, behavior-critical literals, security controls, logging, caching, retries, accessibility, compatibility, or resource limits unless requested.\n\nIMPLEMENT: Use existing patterns and dependencies; do not invent files, APIs, services, routes, packages, tables, credentials, or requirements. Make and state only the smallest necessary assumption.\n\nVERIFY: Check syntax, references, nullability, async flow, races, cleanup, duplicate actions, timeouts, malformed responses, edge inputs, partial failures, mobile behavior, and regressions.\n\nOUTPUT: Return root cause, minimal fix, complete changed-file code, and concise verification.",
      originalTokens: "≈10,200",
      optimizedTokens: "≈704",
      savedTokens: "≈9,496",
      compression: "≈93%",
      fidelity: "97%",
      latency: "1.9s"
    }
  ];

  const elements = {
    originalText: document.getElementById("originalText"),
    optimizedText: document.getElementById("optimizedText"),
    originalTokenMini: document.getElementById("originalTokenMini"),
    optimizedTokenMini: document.getElementById("optimizedTokenMini"),
    counter: document.getElementById("demoCounter"),
    progress: document.getElementById("progressBar"),
    status: document.getElementById("statusText"),
    next: document.getElementById("nextDemoText"),
    originalTokens: document.getElementById("originalTokens"),
    optimizedTokens: document.getElementById("optimizedTokens"),
    savedTokens: document.getElementById("savedTokens"),
    compression: document.getElementById("compressionPercent"),
    fidelity: document.getElementById("fidelity"),
    latency: document.getElementById("latency")
  };

  const tabs = Array.from(document.querySelectorAll("[data-demo-index]"));
  const cards = Array.from(document.querySelectorAll("[data-demo-card]"));
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeIndex = 0;
  let sequence = 0;
  let cycleTimer;

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  const setActiveControls = (index) => {
    tabs.forEach((tab, tabIndex) => tab.setAttribute("aria-selected", String(tabIndex === index)));
    cards.forEach((card, cardIndex) => card.classList.toggle("is-active", cardIndex === index));
  };

  const resetMetrics = () => {
    [elements.originalTokens, elements.optimizedTokens, elements.savedTokens, elements.compression, elements.fidelity, elements.latency]
      .forEach((element) => { element.textContent = "—"; });
  };

  async function typeText(element, text, totalMilliseconds, currentSequence) {
    element.textContent = "";
    element.scrollTop = 0;
    element.className = "demo-text typing-caret";
    if (prefersReducedMotion.matches) {
      element.textContent = text;
      element.className = "demo-text";
      return;
    }

    const steps = 95;
    const chunk = Math.max(1, Math.ceil(text.length / steps));
    const delay = Math.max(5, totalMilliseconds / steps);
    for (let index = 0; index < text.length; index += chunk) {
      if (sequence !== currentSequence) return;
      element.textContent = text.slice(0, Math.min(text.length, index + chunk));
      element.scrollTop = element.scrollHeight;
      await sleep(delay);
    }
    element.textContent = text;
    element.className = "demo-text";
  }

  const animateProgress = (duration, currentSequence) => {
    const start = performance.now();
    elements.progress.style.width = "0%";
    const frame = (now) => {
      if (sequence !== currentSequence) return;
      const value = Math.min(100, ((now - start) / duration) * 100);
      elements.progress.style.width = `${value}%`;
      if (value < 100) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  const populateMetrics = (demo) => {
    elements.originalTokens.textContent = demo.originalTokens;
    elements.optimizedTokens.textContent = demo.optimizedTokens;
    elements.savedTokens.textContent = demo.savedTokens;
    elements.compression.textContent = demo.compression;
    elements.fidelity.textContent = demo.fidelity;
    elements.latency.textContent = demo.latency;
    elements.originalTokenMini.textContent = `${demo.originalTokens} TOKENS`;
    elements.optimizedTokenMini.textContent = `${demo.optimizedTokens} TOKENS`;
  };

  async function playDemo(index) {
    activeIndex = index;
    sequence += 1;
    const currentSequence = sequence;
    const demo = demos[index];
    clearTimeout(cycleTimer);
    setActiveControls(index);
    resetMetrics();

    elements.counter.textContent = `DEMO ${String(index + 1).padStart(2, "0")} / 03`;
    elements.originalTokenMini.textContent = "READING…";
    elements.optimizedTokenMini.textContent = "WAITING…";
    elements.optimizedText.textContent = "Tokyra is preparing the optimized prompt…";
    elements.optimizedText.className = "demo-text is-waiting";
    elements.progress.style.width = "0%";
    elements.status.textContent = demo.name === "Extreme production workflow" ? "Streaming representative 10K-token workflow excerpt…" : "Reading original prompt…";
    elements.next.textContent = index === demos.length - 1 ? "Looping back to example one." : "Next example starts automatically.";

    await typeText(elements.originalText, demo.original, index === 2 ? 1200 : 920, currentSequence);
    if (sequence !== currentSequence) return;
    elements.originalTokenMini.textContent = `${demo.originalTokens} TOKENS`;
    elements.status.textContent = "Compressing while checking protected meaning…";
    animateProgress(prefersReducedMotion.matches ? 50 : 900, currentSequence);
    await sleep(prefersReducedMotion.matches ? 30 : 430);
    if (sequence !== currentSequence) return;

    elements.status.textContent = "Writing optimized prompt…";
    await typeText(elements.optimizedText, demo.optimized, index === 2 ? 820 : 650, currentSequence);
    if (sequence !== currentSequence) return;

    populateMetrics(demo);
    elements.progress.style.width = "100%";
    elements.status.textContent = `${demo.savedTokens} tokens removed · ${demo.compression} smaller · ${demo.fidelity} fidelity`;
    cycleTimer = setTimeout(() => playDemo((index + 1) % demos.length), prefersReducedMotion.matches ? 6500 : 4800);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => playDemo(Number(tab.dataset.demoIndex)));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (Number(tab.dataset.demoIndex) + direction + demos.length) % demos.length;
      tabs[nextIndex].focus();
      playDemo(nextIndex);
    });
  });

  cards.forEach((card) => card.addEventListener("click", () => {
    playDemo(Number(card.dataset.demoCard));
    document.querySelector(".demo-stage")?.scrollIntoView({ behavior: prefersReducedMotion.matches ? "auto" : "smooth", block: "center" });
  }));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      sequence += 1;
      clearTimeout(cycleTimer);
    } else {
      playDemo(activeIndex);
    }
  });

  playDemo(0);
})();
