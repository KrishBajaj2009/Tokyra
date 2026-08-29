(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.querySelector(".nav-menu");

  document.querySelectorAll("[data-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  const closeMenu = (returnFocus = false) => {
    menu?.classList.remove("is-open");
    toggle?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-locked");
    if (returnFocus) toggle?.focus();
  };

  toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    menu?.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-locked", open && window.innerWidth <= 900);
  });

  menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => closeMenu()));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu?.classList.contains("is-open")) closeMenu(true);
  });

  document.addEventListener("click", (event) => {
    if (
      menu?.classList.contains("is-open") &&
      !menu.contains(event.target) &&
      !toggle?.contains(event.target)
    ) closeMenu();
  });

  const updateHeader = () => header?.classList.toggle("is-scrolled", window.scrollY > 10);
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  const revealElements = Array.from(document.querySelectorAll(".reveal"));
  if (!reducedMotion.matches && "IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -36px" });
    revealElements.forEach((element) => revealObserver.observe(element));
  } else {
    revealElements.forEach((element) => element.classList.add("is-visible"));
  }

  const formatCount = (value) => new Intl.NumberFormat().format(Math.round(value));
  const countElements = Array.from(document.querySelectorAll("[data-count]"));
  if (countElements.length) {
    const animateCount = (element) => {
      const target = Number(element.dataset.count || 0);
      if (reducedMotion.matches || !Number.isFinite(target)) {
        element.textContent = formatCount(target);
        return;
      }
      const start = performance.now();
      const duration = 1100;
      const frame = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 4);
        element.textContent = formatCount(target * eased);
        if (progress < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    };

    if ("IntersectionObserver" in window) {
      const countObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateCount(entry.target);
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.55 });
      countElements.forEach((element) => countObserver.observe(element));
    } else {
      countElements.forEach(animateCount);
    }
  }

  if (finePointer.matches && !reducedMotion.matches) {
    document.body.classList.add("has-pointer");
    window.addEventListener("pointermove", (event) => {
      document.documentElement.style.setProperty("--mouse-x", `${event.clientX}px`);
      document.documentElement.style.setProperty("--mouse-y", `${event.clientY}px`);
    }, { passive: true });

    document.querySelectorAll(".magnetic").forEach((element) => {
      element.addEventListener("pointermove", (event) => {
        const bounds = element.getBoundingClientRect();
        const x = event.clientX - bounds.left - bounds.width / 2;
        const y = event.clientY - bounds.top - bounds.height / 2;
        element.style.transform = `translate(${x * 0.12}px, ${y * 0.12}px)`;
      });
      element.addEventListener("pointerleave", () => {
        element.style.transform = "";
      });
    });

    document.querySelectorAll("[data-tilt]").forEach((element) => {
      element.addEventListener("pointermove", (event) => {
        const bounds = element.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        const range = element.classList.contains("hero-console") ? 4 : 2.2;
        element.style.transform = `perspective(1000px) rotateX(${(-y * range).toFixed(2)}deg) rotateY(${(x * range).toFixed(2)}deg) translateY(-2px)`;
      });
      element.addEventListener("pointerleave", () => {
        element.style.transform = "";
      });
    });
  }

  class NetworkField {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext("2d");
      this.parent = canvas.parentElement;
      this.points = [];
      this.frame = 0;
      this.visible = true;
      this.dark = Boolean(canvas.closest(".final-cta, .app-page"));
      this.resize = this.resize.bind(this);
      this.draw = this.draw.bind(this);
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(this.parent);

      if ("IntersectionObserver" in window) {
        this.visibilityObserver = new IntersectionObserver(([entry]) => {
          this.visible = entry.isIntersecting;
        });
        this.visibilityObserver.observe(canvas);
      }
      this.resize();
      this.draw();
    }

    resize() {
      const bounds = this.parent.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.width = Math.max(1, Math.floor(bounds.width));
      this.height = Math.max(1, Math.floor(bounds.height));
      this.canvas.width = Math.floor(this.width * ratio);
      this.canvas.height = Math.floor(this.height * ratio);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const amount = Math.min(54, Math.max(18, Math.floor((this.width * this.height) / 30000)));
      this.points = Array.from({ length: amount }, () => ({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.17,
        vy: (Math.random() - 0.5) * 0.17,
        radius: 0.7 + Math.random() * 1.2
      }));
    }

    draw() {
      this.frame = requestAnimationFrame(this.draw);
      if (!this.visible || reducedMotion.matches || !this.context) return;
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);

      this.points.forEach((point) => {
        point.x += point.vx;
        point.y += point.vy;
        if (point.x < -5 || point.x > this.width + 5) point.vx *= -1;
        if (point.y < -5 || point.y > this.height + 5) point.vy *= -1;
      });

      for (let i = 0; i < this.points.length; i += 1) {
        const a = this.points[i];
        for (let j = i + 1; j < this.points.length; j += 1) {
          const b = this.points[j];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > 138) continue;
          const alpha = (1 - distance / 138) * (this.dark ? 0.13 : 0.08);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = this.dark ? `rgba(217,255,67,${alpha})` : `rgba(70,55,135,${alpha})`;
          ctx.lineWidth = 0.75;
          ctx.stroke();
        }
      }

      this.points.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        ctx.fillStyle = index % 7 === 0
          ? (this.dark ? "rgba(217,255,67,.7)" : "rgba(118,88,255,.55)")
          : (this.dark ? "rgba(255,255,255,.25)" : "rgba(11,12,15,.18)");
        ctx.fill();
      });
    }
  }

  if (!reducedMotion.matches && "ResizeObserver" in window) {
    document.querySelectorAll("[data-network]").forEach((canvas) => new NetworkField(canvas));
  }

  const heroDemoElements = {
    original: document.getElementById("heroOriginal"),
    optimized: document.getElementById("heroOptimized"),
    input: document.getElementById("demoInputTokens"),
    output: document.getElementById("demoOutputTokens"),
    reduction: document.getElementById("heroReduction"),
    fidelity: document.getElementById("heroFidelity")
  };

  if (heroDemoElements.original) {
    const demos = [
      {
        original: "You are a helpful customer support assistant. Carefully read the customer’s request, identify the main issue, and write a clear, concise, friendly response that directly answers every question…",
        optimized: "Write a concise, friendly support response that answers every question. Preserve supplied dates and reference numbers; avoid unsupported guarantees and repetition.",
        input: "126 TOKENS", output: "68 TOKENS", reduction: "46%", fidelity: "98%"
      },
      {
        original: "Act as a senior engineer. Before changing anything, read all supplied code, configuration, stack traces, routes, package versions, database fields, and requirements…",
        optimized: "Debug the production app as a senior engineer. Read all supplied code and errors, find the root cause, make the smallest safe fix, and preserve behavior-critical literals and interfaces.",
        input: "225 TOKENS", output: "112 TOKENS", reduction: "50%", fidelity: "98%"
      },
      {
        original: "Create a quarterly research brief with every source URL, publication date, named entity, percentage, price, model ID, exception, and explicit prohibition preserved exactly…",
        optimized: "Create the quarterly research brief. Preserve every source URL, date, entity, percentage, price, model ID, exception, and prohibition exactly; remove redundant phrasing.",
        input: "184 TOKENS", output: "79 TOKENS", reduction: "57%", fidelity: "97%"
      }
    ];
    let demoIndex = 0;
    const renderDemo = () => {
      demoIndex = (demoIndex + 1) % demos.length;
      const demo = demos[demoIndex];
      Object.values(heroDemoElements).forEach((element) => {
        if (element) element.style.opacity = "0.18";
      });
      setTimeout(() => {
        heroDemoElements.original.textContent = demo.original;
        heroDemoElements.optimized.textContent = demo.optimized;
        heroDemoElements.input.textContent = demo.input;
        heroDemoElements.output.textContent = demo.output;
        heroDemoElements.reduction.textContent = demo.reduction;
        heroDemoElements.fidelity.textContent = demo.fidelity;
        Object.values(heroDemoElements).forEach((element) => {
          if (element) element.style.opacity = "";
        });
      }, 220);
    };
    if (!reducedMotion.matches) setInterval(renderDemo, 4800);
  }

  const toastRegion = document.createElement("div");
  toastRegion.className = "toast-region";
  toastRegion.setAttribute("aria-live", "polite");
  toastRegion.setAttribute("aria-atomic", "true");
  document.body.appendChild(toastRegion);

  const toast = (message, duration = 2600) => {
    const element = document.createElement("div");
    element.className = "toast";
    element.textContent = message;
    toastRegion.appendChild(element);
    setTimeout(() => {
      element.classList.add("is-leaving");
      element.addEventListener("animationend", () => element.remove(), { once: true });
    }, duration);
  };

  window.TokyraUI = Object.freeze({ toast });
})();
