(() => {
  "use strict";

  if (window.TokyraAuthLoaded) return;
  window.TokyraAuthLoaded = true;

  const setup = () => {
    const widget = window.netlifyIdentity;
    if (!widget) {
      document.documentElement.classList.add("auth-unavailable");
      return;
    }

    const loginButtons = document.querySelectorAll("[data-auth-login]");
    const signupButtons = document.querySelectorAll("[data-auth-signup]");
    const logoutButtons = document.querySelectorAll("[data-auth-logout]");
    const accountBadges = document.querySelectorAll("[data-auth-account]");

    const updateUI = (user) => {
      const loggedIn = Boolean(user);
      loginButtons.forEach((button) => { button.hidden = loggedIn; });
      signupButtons.forEach((button) => { button.hidden = loggedIn; });
      logoutButtons.forEach((button) => { button.hidden = !loggedIn; });

      accountBadges.forEach((badge) => {
        if (!loggedIn) {
          badge.hidden = true;
          badge.textContent = "";
          return;
        }

        const label = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Account";
        badge.textContent = label;
        badge.hidden = false;
      });

      window.TokyraUser = user || null;
      document.dispatchEvent(new CustomEvent("tokyra:auth", { detail: { user: user || null } }));
    };

    loginButtons.forEach((button) => button.addEventListener("click", () => widget.open("login")));
    signupButtons.forEach((button) => button.addEventListener("click", () => widget.open("signup")));
    logoutButtons.forEach((button) => button.addEventListener("click", () => widget.logout()));

    widget.on("init", updateUI);
    widget.on("login", (user) => {
      updateUI(user);
      widget.close();
      document.dispatchEvent(new CustomEvent("tokyra:login", { detail: { user } }));
    });
    widget.on("logout", () => {
      updateUI(null);
      document.dispatchEvent(new CustomEvent("tokyra:logout"));
    });
    widget.on("error", (error) => console.error("Tokyra Identity error:", error));
    widget.init();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }
})();
