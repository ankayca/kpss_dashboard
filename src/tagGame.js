/* ============================================================
   Hızlı etiket mini-oyun — sequentially tag a reason for each
   wrong question (sessions) or wrong topic (trials).
   ============================================================ */
import { REASON_META } from "./config.js";
import { $, esc, escAttr } from "./utils.js";

let queue = [];
let results = {};
let idx = 0;
let onDone = null;
let onCancel = null;
let flashTimer = null;

function buildReasonButtons() {
  const el = $("tagReasons");
  if (!el) return;
  el.innerHTML = REASON_META.map(
    (r) =>
      `<button type="button" class="tag-reason-btn" data-reason="${escAttr(r.id)}">
        <span class="ic reason-abbr" style="min-width:32px;height:32px;font-size:12px">${esc(r.abbr)}</span>
        <span>${esc(r.id)}</span><span class="kbd">${esc(r.key)}</span>
      </button>`
  ).join("");
  el.onclick = (e) => {
    const btn = e.target.closest(".tag-reason-btn");
    if (btn) pick(btn.dataset.reason, btn);
  };
}

function onKey(e) {
  const ov = $("tagOverlay");
  if (!ov || !ov.classList.contains("show")) return;
  if (e.key === "Escape") {
    e.preventDefault();
    cancel();
    return;
  }
  if (e.key === "0") {
    e.preventDefault();
    skip();
    return;
  }
  const m = REASON_META.find((r) => r.key === e.key);
  if (m) {
    e.preventDefault();
    pick(m.id);
  }
}

function render() {
  const item = queue[idx];
  $("tagProgress").textContent = idx + 1 + " / " + queue.length;
  $("tagDots").innerHTML = queue
    .map(
      (_, i) => `<span class="tag-dot ${i < idx ? "done" : ""} ${i === idx ? "cur" : ""}"></span>`
    )
    .join("");
  $("tagTarget").innerHTML = item.sublabel
    ? `<div class="tag-subl">${esc(item.sublabel)}</div><div class="tag-main">${esc(item.label)}</div>`
    : `<div class="tag-main">${esc(item.label)}</div>`;
}

function open(items, done, cancelFn) {
  if (!items.length) {
    done({});
    return;
  }
  queue = items;
  results = {};
  idx = 0;
  onDone = done;
  onCancel = cancelFn || null;
  const ov = $("tagOverlay");
  if (ov.parentElement !== document.body) document.body.appendChild(ov);
  render();
  ov.classList.add("show");
  ov.setAttribute("aria-hidden", "false");
  document.body.classList.add("tag-game-open");
  document.addEventListener("keydown", onKey);
  requestAnimationFrame(() => ov.querySelector(".tag-reason-btn")?.focus?.());
}

function close() {
  const ov = $("tagOverlay");
  ov.classList.remove("show");
  ov.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tag-game-open");
  document.removeEventListener("keydown", onKey);
  clearTimeout(flashTimer);
}

function advance() {
  idx++;
  if (idx >= queue.length) {
    const out = { ...results };
    close();
    if (onDone) onDone(out);
  } else {
    render();
  }
}

function pick(reason, btnEl) {
  results[queue[idx].id] = reason;
  if (btnEl) {
    btnEl.classList.add("flash");
    flashTimer = setTimeout(() => {
      btnEl.classList.remove("flash");
      advance();
    }, 220);
  } else {
    advance();
  }
}

function skip() {
  results[queue[idx].id] = "";
  advance();
}

function cancel() {
  close();
  if (onCancel) onCancel();
}

/** Wire up the static reason buttons. Call once after the DOM exists. */
export function initTagGame() {
  buildReasonButtons();
}

export const TagGame = { open, pick, skip, cancel };
