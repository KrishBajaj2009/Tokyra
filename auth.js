(() => {
  "use strict";

  const storageKey = "tokyra-demo-auth";
  const loginButtons = Array.from(document.querySelectorAll("[data-auth-login]"));
  const logoutButtons = Array.from(document.querySelectorAll("[data-auth-logout]"));
  const accountBadges = Array.from(document.querySelectorAll("[data-auth-account]"));

  const readState = () => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  };

  const writeState = (value) => {
    if (!value) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(value));
  };

  const render = () => {
    const auth = readState();
    const label = auth && auth.label ? auth.label : "";

    accountBadges.forEach((badge) => {
      badge.hidden = !label;
      badge.textContent = label;
    });

    loginButtons.forEach((button) => {
      button.hidden = Boolean(label);
    });

    logoutButtons.forEach((button) => {
      button.hidden = !label;
    });
  };

  loginButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const answer = window.prompt("Enter a workspace or team name for this Tokyra demo session.");
      const value = String(answer || "").trim();
      if (!value) return;
      writeState({ label: value });
      render();
    });
  });

  logoutButtons.forEach((button) => {
    button.addEventListener("click", () => {
      writeState(null);
      render();
    });
  });

  render();
})();
