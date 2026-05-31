/* ============================================================
   Page navigation + responsive sidebar.
   Page-specific renderers are injected to avoid import cycles.
   ============================================================ */
import { PAGES } from "./config.js";
import { $ } from "./utils.js";

const pageRenderers = {};

/** Register a render callback fired whenever a page becomes active. */
export function registerPageRenderer(page, fn) {
  pageRenderers[page] = fn;
}

export function isActive(p) {
  const el = $("page-" + p);
  return !!el && el.classList.contains("active");
}

export function nav(page) {
  if (!PAGES.includes(page)) page = "konu";
  const pageEl = $("page-" + page);
  if (!pageEl) return;
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  pageEl.classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  if ("#" + page !== location.hash) location.hash = page;
  if (pageRenderers[page]) pageRenderers[page]();
  if (window.innerWidth <= 860) closeSidebar();
  window.scrollTo(0, 0);
}

export function toggleSidebar() {
  $("sidebar").classList.toggle("open");
  $("backdrop").classList.toggle("show");
}

export function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("backdrop").classList.remove("show");
}
