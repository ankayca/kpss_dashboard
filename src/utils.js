/* ============================================================
   Small, dependency-light helpers: DOM, escaping, dates, toast.
   ============================================================ */
import { REASON_META } from "./config.js";

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function $(id) {
  return document.getElementById(id);
}

/** Like $(), but logs a warning when the element is missing (helps catch typos). */
export function must$(id) {
  const el = $(id);
  if (!el) console.warn("Missing element:", id);
  return el;
}

const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}
export const escAttr = esc;

export function ymd(dt) {
  return (
    dt.getFullYear() +
    "-" +
    String(dt.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(dt.getDate()).padStart(2, "0")
  );
}

/** A YYYY-MM-DD string is the storage format for every date in the app. */
export function isYmd(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function fmtDate(d) {
  if (!d) return "—";
  const p = String(d).split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(d);
}

export function addDays(ymdStr, n) {
  const d = new Date(ymdStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function todayStr() {
  return ymd(new Date());
}

/** Monday of the week containing the given YYYY-MM-DD date, as YYYY-MM-DD. */
export function startOfWeek(ymdStr) {
  const d = new Date(ymdStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return ymdStr;
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return ymd(d);
}

let toastTimer;
export function toast(msg, isErr) {
  const t = $("toast");
  if (!t) {
    (isErr ? console.error : console.log)("[toast]", msg);
    return;
  }
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.className = "toast";
  }, 2600);
}

export function reasonIcon(id) {
  const m = REASON_META.find((r) => r.id === id);
  if (!m) return "";
  return `<span class="reason-abbr" title="${esc(m.id)}">${esc(m.abbr)}</span>`;
}

/**
 * Parse wrong-question numbers from free text.
 * Accepts separators: comma, semicolon, whitespace, pipe and newlines.
 * Returns a de-duplicated, ascending list of positive integers.
 */
export function parseWrongNums(raw) {
  if (raw == null || !String(raw).trim()) return [];
  const seen = new Set();
  const out = [];
  String(raw)
    .split(/[,;\s|]+/)
    .forEach((part) => {
      const n = parseInt(part.trim(), 10);
      if (Number.isInteger(n) && n > 0 && n <= 9999 && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    });
  return out.sort((a, b) => a - b);
}

/** Normalize a topic label for fuzzy intersection matching. */
export function normTopic(s) {
  return String(s == null ? "" : s)
    .toLocaleLowerCase("tr")
    .replace(/dönemi?/g, "")
    .replace(/[-_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Read a CSS custom property from :root (used to theme charts). */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#9a9a9a";
}
