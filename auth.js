/*
  Tokyra accounts — powered by Netlify Identity.

  Requires the Netlify Identity widget script to be loaded BEFORE this
  file, and requires Identity to be turned on for this site in the
  Netlify dashboard (Project configuration -> Identity -> Enable Identity,
  Registration set to "Open").

  This file:
  - Wires up any #authLoginBtn / #authSignupBtn / #authLogoutBtn buttons
  - Shows an "email" badge (#authAccountBadge) when someone is logged in
  - Fires a `tokyra:auth` CustomEvent on `document` whenever auth state
    changes, with `detail.user` set to the Netlify Identity user object
    (or null when logged out) — pages can listen for this to gate content.
*/
(function () {
  function setup() {
    var widget = window.netlifyIdentity;
    if (!widget) {
      console.warn("Netlify Identity widget did not load.");
      return;
    }

    var loginBtn = document.getElementById("authLoginBtn");
    var signupBtn = document.getElementById("authSignupBtn");
    var logoutBtn = document.getElementById("authLogoutBtn");
    var badge = document.getElementById("authAccountBadge");

    function render(user) {
      var loggedIn = !!user;

      if (loginBtn) loginBtn.style.display = loggedIn ? "none" : "inline-flex";
      if (signupBtn) signupBtn.style.display = loggedIn ? "none" : "inline-flex";
      if (logoutBtn) logoutBtn.style.display = loggedIn ? "inline-flex" : "none";

      if (badge) {
        if (loggedIn) {
          var email = (user.email || "").split("@")[0];
          badge.textContent = email;
          badge.style.display = "inline-flex";
        } else {
          badge.textContent = "";
          badge.style.display = "none";
        }
      }

      document.dispatchEvent(
        new CustomEvent("tokyra:auth", { detail: { user: user || null } })
      );
    }

    if (loginBtn) {
      loginBtn.addEventListener("click", function () {
        widget.open("login");
      });
    }
    if (signupBtn) {
      signupBtn.addEventListener("click", function () {
        widget.open("signup");
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        widget.logout();
      });
    }

    widget.on("init", function (user) {
      render(user);
    });
    widget.on("login", function (user) {
      render(user);
      widget.close();
    });
    widget.on("logout", function () {
      render(null);
    });
    widget.on("error", function (err) {
      console.error("Netlify Identity error:", err);
    });

    // init() re-checks the current session and also handles the
    // confirmation / recovery / invite tokens Netlify appends to the
    // URL hash after someone clicks a link in an auth email.
    widget.init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();
