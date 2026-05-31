/* ============================================================
   Theme handling (dark / light) persisted via meta store.
   ============================================================ */
import { Store } from "./store.js";
import { DB, persist } from "./state.js";
import { $ } from "./utils.js";
import { isActive } from "./nav.js";
import { renderAnalytics } from "./features/analytics.js";

export function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  const btn = $("themeBtn");
  if (btn) btn.textContent = t === "light" ? "Açık tema" : "Koyu tema";
}

export async function setTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  DB.settings.theme = t;
  applyTheme(t);
  await persist(() => Store.setMeta("theme", t));
  if (isActive("analiz")) renderAnalytics();
}

export function toggleTheme() {
  return setTheme(DB.settings.theme === "light" ? "dark" : "light");
}
