/* ============================================================
   Page navigation + responsive sidebar.
   Page-specific renderers are injected to avoid import cycles.
   ============================================================ */
import { PAGES, DEFAULT_PAGE, NAV_ITEMS } from "./config.js";
import { $ } from "./utils.js";

const pageRenderers = {};

/** Register a render callback fired whenever a page becomes active. */
export function registerPageRenderer(page, fn) {
  pageRenderers[page] = fn;
}

/**
 * Build the sidebar navigation from NAV_ITEMS. Items are clustered under
 * their `group` heading (in first-seen order); null-group items render
 * plainly at the end. Keeps markup in sync with config so reordering or
 * relabelling a page is a one-line change.
 */
export function renderNav(container) {
  const host = container || $("navList");
  if (!host) return;
  let html = "";
  let lastGroup;
  for (const item of NAV_ITEMS) {
    if (item.group && item.group !== lastGroup) {
      html += `<div class="nav-group">${item.group}</div>`;
    } else if (!item.group && lastGroup !== null) {
      html += `<div class="nav-sep"></div>`;
    }
    lastGroup = item.group || null;
    const badge = item.badge
      ? ` <span class="badge" id="${item.badge}">0</span>`
      : "";
    html += `<button class="nav-btn" data-page="${item.page}">`
      + `<span class="ic">${item.ic}</span>`
      + `<span class="nav-label">${item.label}</span>${badge}</button>`;
  }
  host.innerHTML = html;
}

export function isActive(p) {
  const el = $("page-" + p);
  return !!el && el.classList.contains("active");
}

export function nav(page) {
  if (!PAGES.includes(page)) page = DEFAULT_PAGE;
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
