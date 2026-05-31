/* ============================================================
   FEATURE — Tekrar Kuyruğu (spaced repetition queue).
   ============================================================ */
import { SECTIONS, SECTION_KEYS, REVIEW_INTERVALS } from "../config.js";
import { Store } from "../store.js";
import { DB, persist } from "../state.js";
import { $, esc, escAttr, toast, uid, fmtDate, todayStr, addDays } from "../utils.js";
import { lessonLabel, hasActiveReview } from "../domain.js";
import { isActive } from "../nav.js";
import { renderAnalytics } from "./analytics.js";

export function fillRevLessonSelect() {
  $("revLesson").innerHTML =
    '<option value="">— ders seç —</option>' +
    SECTION_KEYS.map((k) => `<option value="${k}">${esc(SECTIONS[k].label)}</option>`).join("");
}
export function fillRevTopics() {
  const k = $("revLesson").value;
  const sel = $("revTopic");
  if (!SECTIONS[k]) {
    sel.innerHTML = '<option value="">— önce ders seç —</option>';
    return;
  }
  sel.innerHTML =
    '<option value="">— konu seç —</option>' +
    SECTIONS[k].topics.map((t) => `<option value="${escAttr(t)}">${esc(t)}</option>`).join("");
}

export async function createReview(lesson, topic) {
  if (!SECTIONS[lesson] || !topic) return false;
  if (hasActiveReview(lesson, topic)) {
    toast("Bu konu zaten tekrar kuyruğunda.", true);
    return false;
  }
  const r = {
    id: uid(),
    lesson,
    topic,
    createdDate: todayStr(),
    level: 0,
    nextDate: addDays(todayStr(), REVIEW_INTERVALS[0]),
    history: [],
    done: false
  };
  await persist(async () => {
    await Store.put("reviews", r);
    DB.reviews.push(r);
  });
  renderReviews();
  updateRevBadge();
  toast(`Tekrara eklendi: ${SECTIONS[lesson].label} · ${topic}`);
  return true;
}

export async function addReviewManual() {
  const lesson = $("revLesson").value;
  const topic = $("revTopic").value;
  if (!lesson) return toast("Ders seçin.", true);
  if (!topic) return toast("Konu seçin.", true);
  await createReview(lesson, topic);
}

export function addReviewQuick(lesson, topic) {
  return createReview(lesson, topic);
}

export async function reviewDone(id) {
  const r = DB.reviews.find((x) => x.id === id);
  if (!r) return;
  // Work on a copy so a failed write doesn't leave the cache mutated.
  const updated = { ...r, history: [...(r.history || []), todayStr()], level: (r.level || 0) + 1 };
  if (updated.level >= REVIEW_INTERVALS.length) {
    updated.done = true;
    updated.nextDate = null;
  } else {
    updated.nextDate = addDays(todayStr(), REVIEW_INTERVALS[updated.level]);
  }
  await persist(() => Store.put("reviews", updated));
  Object.assign(r, updated);
  renderReviews();
  updateRevBadge();
  if (isActive("analiz")) renderAnalytics();
  toast(updated.done ? "Konu tamamlandı." : "Tekrar kaydedildi, sonraki tarihe ötelendi.");
}

export async function removeReview(id) {
  await persist(() => Store.del("reviews", id));
  DB.reviews = DB.reviews.filter((r) => r.id !== id);
  renderReviews();
  updateRevBadge();
  toast("Tekrardan çıkarıldı.");
}

function revItemHtml(r, cls) {
  const due = cls ? `class="rev ${cls}"` : 'class="rev"';
  const lvl = `${r.level || 0}/${REVIEW_INTERVALS.length}`;
  const next = r.done ? "Tamamlandı" : `Sonraki: ${fmtDate(r.nextDate)}`;
  const btns = r.done
    ? `<button class="iconbtn del" data-act="revdel" data-id="${r.id}" title="Sil">×</button>`
    : `<button class="btn sm" data-act="revdone" data-id="${r.id}">Tekrar ettim</button>
       <button class="iconbtn del" data-act="revdel" data-id="${r.id}" title="Çıkar">×</button>`;
  return `<div ${due}>
    <div class="info"><div class="t">${esc(lessonLabel(r.lesson))} · ${esc(r.topic)}</div>
      <div class="d">${next} · aşama ${lvl} · ${(r.history || []).length} tekrar</div></div>
    <div class="btn-row">${btns}</div></div>`;
}

export function renderReviews() {
  const today = todayStr();
  const active = DB.reviews.filter((r) => !r.done);
  const due = active
    .filter((r) => r.nextDate <= today)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const upcoming = active
    .filter((r) => r.nextDate > today)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const done = DB.reviews.filter((r) => r.done);
  $("revDue").innerHTML = due.length
    ? due.map((r) => revItemHtml(r, r.nextDate < today ? "due" : "duesoon")).join("")
    : '<div class="empty">Bugün için bekleyen tekrar yok.</div>';
  $("revUpcoming").innerHTML = upcoming.length
    ? upcoming.map((r) => revItemHtml(r, "")).join("")
    : '<div class="empty">Planlanmış tekrar yok.</div>';
  $("revDone").innerHTML = done.length
    ? done.map((r) => revItemHtml(r, "")).join("")
    : '<div class="empty">Henüz tamamlanan konu yok.</div>';
  updateRevBadge();
}

export function updateRevBadge() {
  const today = todayStr();
  const n = DB.reviews.filter((r) => !r.done && r.nextDate <= today).length;
  const b = $("revBadge");
  if (!b) return;
  b.textContent = n;
  b.classList.toggle("show", n > 0);
}

/** Fire a browser notification for today's due reviews, if enabled & permitted. */
export function maybeNotifyDueReviews() {
  if (!DB.settings.notifyReviews) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const today = todayStr();
  const due = DB.reviews.filter((r) => !r.done && r.nextDate <= today);
  if (!due.length) return;
  const preview = due
    .slice(0, 3)
    .map((r) => `${lessonLabel(r.lesson)} · ${r.topic}`)
    .join("\n");
  const extra = due.length > 3 ? `\n+${due.length - 3} konu daha` : "";
  try {
    new Notification(`KPSS: ${due.length} tekrar bekliyor`, {
      body: preview + extra,
      tag: "kpss-reviews-" + today
    });
  } catch (_) {
    /* ignore */
  }
}
