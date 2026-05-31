/* ============================================================
   FEATURE — Ayarlar (exam date, target net, export/import, reset).
   ============================================================ */
import { Store } from "../store.js";
import { DB, persist, hydrate } from "../state.js";
import { Data } from "../data.js";
import { $, esc, toast, fmtDate, todayStr } from "../utils.js";
import { isActive } from "../nav.js";
import { applyTheme } from "../theme.js";
import { renderAnalytics } from "./analytics.js";
import { refreshAll } from "../refresh.js";

export async function saveExamDate() {
  DB.settings.examDate = $("examDate").value;
  await persist(() => Store.setMeta("examDate", DB.settings.examDate));
  renderExamInfo();
  if (isActive("analiz")) renderAnalytics();
  toast("Sınav tarihi kaydedildi.");
}
export function renderExamInfo() {
  const el = $("examInfo");
  if (!DB.settings.examDate) {
    el.textContent = "Henüz sınav tarihi belirlenmedi.";
    return;
  }
  $("examDate").value = DB.settings.examDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(DB.settings.examDate + "T00:00:00") - today) / 86400000);
  el.innerHTML = `Sınav: <strong>${fmtDate(DB.settings.examDate)}</strong> — ${diff > 0 ? diff + " gün kaldı" : diff === 0 ? "bugün!" : Math.abs(diff) + " gün önce"}`;
}

export async function saveTarget() {
  const v = parseFloat($("targetNet").value);
  DB.settings.targetNet = Number.isNaN(v) ? null : v;
  await persist(() => Store.setMeta("targetNet", DB.settings.targetNet));
  renderTargetInfo();
  if (isActive("analiz")) renderAnalytics();
  toast("Hedef kaydedildi.");
}
export function renderTargetInfo() {
  const el = $("targetInfo");
  if (DB.settings.targetNet == null) {
    el.textContent = "Hedef belirlenmedi.";
    return;
  }
  $("targetNet").value = DB.settings.targetNet;
  el.innerHTML = `Hedef: <strong>${esc(DB.settings.targetNet)} net</strong>`;
}

function parsePosNum(raw) {
  const v = parseFloat(raw);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export async function saveDailyGoals() {
  DB.settings.dailyQuestionGoal = parsePosNum($("dailyQuestionGoal").value);
  DB.settings.dailyMinuteGoal = parsePosNum($("dailyMinuteGoal").value);
  await persist(async () => {
    await Store.setMeta("dailyQuestionGoal", DB.settings.dailyQuestionGoal);
    await Store.setMeta("dailyMinuteGoal", DB.settings.dailyMinuteGoal);
  });
  renderGoalsInfo();
  if (isActive("analiz")) renderAnalytics();
  toast("Günlük hedefler kaydedildi.");
}

export function renderGoalsInfo() {
  const el = $("goalsInfo");
  if (!el) return;
  const q = DB.settings.dailyQuestionGoal;
  const m = DB.settings.dailyMinuteGoal;
  if (q != null) $("dailyQuestionGoal").value = q;
  if (m != null) $("dailyMinuteGoal").value = m;
  if (q == null && m == null) {
    el.textContent = "Günlük hedef belirlenmedi.";
    return;
  }
  const parts = [];
  if (q != null) parts.push(`<strong>${esc(q)} soru</strong>`);
  if (m != null) parts.push(`<strong>${esc(m)} dk</strong>`);
  el.innerHTML = "Günlük hedef: " + parts.join(" · ");
}

export async function toggleNotifyReviews() {
  const want = !DB.settings.notifyReviews;
  if (want && typeof Notification !== "undefined") {
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch (_) {
        /* ignore */
      }
    }
    if (Notification.permission !== "granted") {
      toast("Tarayıcı bildirim izni verilmedi.", true);
      DB.settings.notifyReviews = false;
      await persist(() => Store.setMeta("notifyReviews", false));
      renderNotifyInfo();
      return;
    }
  }
  DB.settings.notifyReviews = want;
  await persist(() => Store.setMeta("notifyReviews", want));
  renderNotifyInfo();
  toast(want ? "Tekrar hatırlatıcısı açıldı." : "Tekrar hatırlatıcısı kapatıldı.");
}

export function renderNotifyInfo() {
  const el = $("notifyInfo");
  const btn = $("notifyBtn");
  const supported = typeof Notification !== "undefined";
  if (btn) btn.textContent = DB.settings.notifyReviews ? "Hatırlatıcı: Açık" : "Hatırlatıcı: Kapalı";
  if (!el) return;
  if (!supported) {
    el.textContent = "Bu tarayıcı bildirimleri desteklemiyor.";
    return;
  }
  el.textContent = DB.settings.notifyReviews
    ? "Uygulamayı açtığında bugün vadesi gelen tekrarlar için bildirim alırsın."
    : "Bugün vadesi gelen tekrarlar için tarayıcı bildirimi al.";
}

export function exportData() {
  const payload = {
    books: DB.books,
    sessions: DB.sessions,
    trials: DB.trials,
    subjectTrials: DB.subjectTrials,
    reviews: DB.reviews,
    settings: DB.settings,
    _version: 2
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kpss-yedek-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Veriler dışa aktarıldı.");
}

export function importData(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => {
    toast("Dosya okunamadı.", true);
    ev.target.value = "";
  };
  reader.onload = async (e) => {
    try {
      const raw = JSON.parse(e.target.result);
      const p = Data.normalizeImport(raw);
      await persist(async () => {
        for (const c of Store.COLLECTIONS) await Store.clear(c);
        for (const b of p.books) await Store.put("books", b);
        for (const s of p.sessions) await Store.put("sessions", s);
        for (const t of p.trials) await Store.put("trials", t);
        for (const t of p.subjectTrials) await Store.put("subjectTrials", t);
        for (const r of p.reviews) await Store.put("reviews", r);
        const st = p.settings;
        await Store.setMeta("examDate", typeof st.examDate === "string" ? st.examDate.slice(0, 12) : "");
        const tn = st.targetNet;
        await Store.setMeta(
          "targetNet",
          tn == null || tn === "" || !Number.isFinite(Number(tn)) ? null : Number(tn)
        );
        await Store.setMeta("theme", st.theme === "light" ? "light" : "dark");
        const posMeta = (v) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : null;
        };
        await Store.setMeta("dailyQuestionGoal", posMeta(st.dailyQuestionGoal));
        await Store.setMeta("dailyMinuteGoal", posMeta(st.dailyMinuteGoal));
        await Store.setMeta("notifyReviews", st.notifyReviews === true);
      });
      await hydrate();
      applyTheme(DB.settings.theme);
      refreshAll();
      toast("Veriler içe aktarıldı.");
    } catch (err) {
      toast(
        err && err.message === "Geçersiz dosya" ? "Geçersiz JSON dosyası." : "İçe aktarma başarısız.",
        true
      );
    }
    ev.target.value = "";
  };
  reader.readAsText(file);
}

export async function clearAll() {
  if (!confirm("TÜM veriler kalıcı olarak silinecek. Emin misiniz?")) return;
  await persist(async () => {
    for (const c of Store.COLLECTIONS) await Store.clear(c);
    await Store.setMeta("examDate", "");
    await Store.setMeta("targetNet", null);
  });
  DB.books = [];
  DB.sessions = [];
  DB.trials = [];
  DB.subjectTrials = [];
  DB.reviews = [];
  DB.settings.examDate = "";
  DB.settings.targetNet = null;
  refreshAll();
  renderGoalsInfo();
  renderNotifyInfo();
  toast("Tüm veriler silindi.");
}

export function renderDataStats() {
  const el = $("dataStats");
  if (!el) return;
  el.innerHTML = `${DB.books.length} kitap · ${DB.sessions.length} yanlış kaydı · ${DB.trials.length} genel deneme · ${DB.subjectTrials.length} alan denemesi · ${DB.reviews.length} tekrar kaydı`;
}
