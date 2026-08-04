(() => {
  "use strict";

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  const navToggle = document.querySelector(".nav-toggle");
  const navMenu = document.getElementById("primary-nav");

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      const expanded = navToggle.getAttribute("aria-expanded") === "true";
      navToggle.setAttribute("aria-expanded", String(!expanded));
      navMenu.classList.toggle("is-open", !expanded);
    });
  }

  const revealNodes = Array.from(document.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16 });

    revealNodes.forEach((node) => observer.observe(node));
  } else {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
  }

  const countTargets = Array.from(document.querySelectorAll("[data-countup]"));
  const animateCount = (node) => {
    const target = Number(node.getAttribute("data-countup"));
    if (!Number.isFinite(target)) return;

    const prefix = node.getAttribute("data-prefix") || "";
    const suffix = node.getAttribute("data-suffix") || "";
    const duration = 1200;
    const start = performance.now();

    const frame = (time) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = target * eased;
      const rounded = target >= 100 ? Math.round(value) : value.toFixed(target % 1 ? 1 : 0);
      node.textContent = `${prefix}${rounded}${suffix}`;
      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    };

    requestAnimationFrame(frame);
  };

  if ("IntersectionObserver" in window && countTargets.length > 0) {
    const countObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });

    countTargets.forEach((node) => countObserver.observe(node));
  } else {
    countTargets.forEach(animateCount);
  }
})();
