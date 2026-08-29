(() => {
  "use strict";

  const storageKey = "tokyra-demo-auth";
  const loginButtons = Array.from(document.querySelectorAll("[data-auth-login], [data-auth-signup]"));
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
    try {
      if (!value) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // The site remains usable when browser storage is unavailable.
    }
  };

  const render = () => {
    const auth = readState();
    const label = auth && typeof auth.label === "string" ? auth.label : "";

    accountBadges.forEach((badge) => {
      badge.hidden = !label;
      badge.textContent = label;
      badge.title = label;
    });
    loginButtons.forEach((button) => { button.hidden = Boolean(label); });
    logoutButtons.forEach((button) => { button.hidden = !label; });
  };

  const dialog = document.createElement("dialog");
  dialog.className = "auth-dialog";
  dialog.innerHTML = `
    <form class="auth-form" method="dialog">
      <div class="auth-form-head">
        <div><span>TOKYRA SESSION</span><h2>Name this workspace.</h2></div>
        <button class="dialog-close" type="button" aria-label="Close">×</button>
      </div>
      <label for="tokyraWorkspaceName">Workspace or team name</label>
      <input id="tokyraWorkspaceName" name="workspace" type="text" maxlength="48" autocomplete="organization" placeholder="e.g. Tokyra Labs" required>
      <p>This only labels your local demo session on this device.</p>
      <button class="button button-accent button-wide" type="submit">Continue to Tokyra <span class="arrow" aria-hidden="true">↗</span></button>
    </form>`;
  document.body.appendChild(dialog);

  const form = dialog.querySelector("form");
  const input = dialog.querySelector("input");
  const closeButton = dialog.querySelector(".dialog-close");

  const openDialog = () => {
    if (typeof dialog.showModal !== "function") {
      const answer = window.prompt("Enter a workspace or team name for this Tokyra demo session.");
      const value = String(answer || "").trim();
      if (value) {
        writeState({ label: value });
        render();
      }
      return;
    }
    input.value = "";
    dialog.showModal();
    requestAnimationFrame(() => input.focus());
  };

  loginButtons.forEach((button) => button.addEventListener("click", openDialog));
  closeButton.addEventListener("click", () => dialog.close());

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    writeState({ label: value });
    render();
    dialog.close();
    window.TokyraUI?.toast(`Workspace set to ${value}.`);
  });

  logoutButtons.forEach((button) => {
    button.addEventListener("click", () => {
      writeState(null);
      render();
      window.TokyraUI?.toast("Local Tokyra session cleared.");
    });
  });

  render();
})();
