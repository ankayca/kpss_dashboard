/* ============================================================
   USER SELECTION — two hardcoded accounts, no password/auth.

   Only the *choice* of user is kept in localStorage; all study
   data lives on the server (the Pi). Switching user reloads the
   page so the right profile + data are loaded cleanly.
   ============================================================ */
import { PROFILES, DEFAULT_PROFILE } from "./config.js";

const KEY = "kpss_user";

export const USERS = Object.keys(PROFILES);

export function getUser() {
  let u = null;
  try {
    u = localStorage.getItem(KEY);
  } catch (_) {
    /* localStorage may be unavailable */
  }
  return PROFILES[u] ? u : DEFAULT_PROFILE;
}

export function setUser(user) {
  if (!PROFILES[user]) return;
  try {
    localStorage.setItem(KEY, user);
  } catch (_) {
    /* ignore */
  }
  location.reload();
}
