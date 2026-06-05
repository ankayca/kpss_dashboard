/* ============================================================
   AUTHENTICATION — email/password + Google Sign-In.

   Talks to the auth API in /server/server.js. The server keeps a
   session cookie (HttpOnly), so the client only needs to call the
   endpoints with `credentials: "include"` and read the returned
   user. This module also owns the login screen UI: it gates the
   app, and only resolves once the visitor is authenticated AND has
   picked an exam profile.
   ============================================================ */
import { PROFILE_OPTIONS } from "./config.js";
import { $, esc } from "./utils.js";

const GOOGLE_CLIENT_ID =
  "265612832039-robfjtm3on0ietmkdoon6ihuu4nrdp74.apps.googleusercontent.com";

const API = "/api/auth";

async function call(pathSuffix, options = {}) {
  const res = await fetch(API + pathSuffix, {
    credentials: "include",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options
  });
  let data;
  try {
    data = await res.json();
  } catch (_) {
    data = undefined;
  }
  if (!res.ok) {
    const msg = (data && data.error) || `Sunucu hatası (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const Auth = {
  me: () => call("/me"),
  login: (email, password) =>
    call("/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (payload) =>
    call("/register", { method: "POST", body: JSON.stringify(payload) }),
  google: (credential) =>
    call("/google", { method: "POST", body: JSON.stringify({ credential }) }),
  setProfile: (profileId) =>
    call("/profile", { method: "POST", body: JSON.stringify({ profileId }) }),
  logout: () => call("/logout", { method: "POST" })
};

/* ------------------------------ UI ------------------------------ */

function show(el, visible) {
  if (el) el.classList.toggle("hidden", !visible);
}

function setError(id, msg) {
  const el = $(id);
  if (el) {
    el.textContent = msg || "";
    show(el, !!msg);
  }
}

function fillProfileSelect(selectId) {
  const sel = $(selectId);
  if (!sel) return;
  sel.innerHTML = PROFILE_OPTIONS.map(
    (p) => `<option value="${esc(p.id)}">${esc(p.examName)}</option>`
  ).join("");
}

let googleInited = false;
function initGoogle(onCredential) {
  if (googleInited) return;
  const g = window.google;
  const target = $("googleBtn");
  if (!g || !g.accounts || !g.accounts.id || !target) return;
  googleInited = true;
  g.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (resp) => onCredential(resp.credential)
  });
  g.accounts.id.renderButton(target, {
    theme: "outline",
    size: "large",
    width: 280,
    text: "continue_with",
    locale: "tr"
  });
}

/** Wait for the GSI script (async/defer) to load, then init the button. */
function whenGoogleReady(onCredential) {
  if (window.google && window.google.accounts) {
    initGoogle(onCredential);
    return;
  }
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (window.google && window.google.accounts) {
      clearInterval(timer);
      initGoogle(onCredential);
    } else if (tries > 40) {
      clearInterval(timer);
    }
  }, 250);
}

/**
 * Gate the app behind authentication. Resolves with the fully
 * authenticated user (guaranteed to have a profileId). Renders the
 * login / register / profile-picker UI as needed.
 */
export function runAuthGate() {
  return new Promise((resolve) => {
    const screen = $("authScreen");
    fillProfileSelect("regProfile");
    fillProfileSelect("pickProfile");

    const done = (user) => {
      show(screen, false);
      document.body.classList.remove("auth-active");
      resolve(user);
    };

    const needProfile = (user) => {
      show($("authForms"), false);
      show($("profilePick"), true);
    };

    const finishOrPickProfile = (resp) => {
      if (resp.user && resp.user.profileId && !resp.needsProfile) done(resp.user);
      else needProfile(resp.user);
    };

    // Tab switching (login <-> register)
    const loginPanel = $("loginPanel");
    const registerPanel = $("registerPanel");
    const showLogin = (isLogin) => {
      show(loginPanel, isLogin);
      show(registerPanel, !isLogin);
      $("tabLogin").classList.toggle("active", isLogin);
      $("tabRegister").classList.toggle("active", !isLogin);
      setError("loginError", "");
      setError("registerError", "");
    };
    $("tabLogin").addEventListener("click", () => showLogin(true));
    $("tabRegister").addEventListener("click", () => showLogin(false));

    // Email/password login
    $("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      setError("loginError", "");
      try {
        const resp = await Auth.login($("loginEmail").value, $("loginPassword").value);
        finishOrPickProfile(resp);
      } catch (err) {
        setError("loginError", err.message);
      }
    });

    // Email/password register
    $("registerForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      setError("registerError", "");
      try {
        const resp = await Auth.register({
          name: $("regName").value.trim(),
          email: $("regEmail").value.trim(),
          password: $("regPassword").value,
          profileId: $("regProfile").value
        });
        finishOrPickProfile(resp);
      } catch (err) {
        setError("registerError", err.message);
      }
    });

    // Profile picker (first-time Google users)
    $("profilePickForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      setError("pickError", "");
      try {
        const resp = await Auth.setProfile($("pickProfile").value);
        done(resp.user);
      } catch (err) {
        setError("pickError", err.message);
      }
    });

    // Google Sign-In
    whenGoogleReady(async (credential) => {
      try {
        const resp = await Auth.google(credential);
        finishOrPickProfile(resp);
      } catch (err) {
        setError("loginError", err.message);
      }
    });

    // Check for an existing session first.
    Auth.me()
      .then((resp) => {
        if (resp.user && resp.user.profileId) done(resp.user);
        else needProfile(resp.user);
      })
      .catch(() => {
        document.body.classList.add("auth-active");
        show(screen, true);
        show($("authForms"), true);
        show($("profilePick"), false);
        showLogin(true);
      });
  });
}
