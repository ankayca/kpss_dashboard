/* ============================================================
   APPLICATION STATE — an in-memory mirror of the database so the
   render layer can stay synchronous. All writes go through the
   Store first, then update this cache.
   ============================================================ */
import { Store } from "./store.js";
import { Data } from "./data.js";
import { toast } from "./utils.js";

export const DB = {
  books: [],
  sessions: [],
  trials: [],
  subjectTrials: [],
  reviews: [],
  settings: {
    examDate: "",
    targetNet: null,
    theme: "dark",
    dailyQuestionGoal: null,
    dailyMinuteGoal: null,
    notifyReviews: false
  }
};

function normNumMeta(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Run a write action and surface failures to the user without
 * silently corrupting the in-memory cache.
 */
export async function persist(action) {
  try {
    return await action();
  } catch (e) {
    console.error(e);
    toast(e && e.message ? e.message : "Kayıt sırasında hata oluştu.", true);
    throw e;
  }
}

export async function hydrate() {
  const [books, sessions, trials, subjectTrials, reviews] = await Promise.all([
    Store.all("books"),
    Store.all("sessions"),
    Store.all("trials"),
    Store.all("subjectTrials"),
    Store.all("reviews")
  ]);
  DB.books = (books || []).map(Data.normalizeBook).filter(Boolean);
  DB.sessions = (sessions || []).map(Data.normalizeSession).filter(Boolean);
  DB.trials = (trials || []).map(Data.normalizeTrial).filter(Boolean);
  DB.subjectTrials = (subjectTrials || []).map(Data.normalizeSubjectTrial).filter(Boolean);
  DB.reviews = (reviews || []).map(Data.normalizeReview).filter(Boolean);

  const [theme, targetNet, examDate, dailyQuestionGoal, dailyMinuteGoal, notifyReviews] =
    await Promise.all([
      Store.getMeta("theme"),
      Store.getMeta("targetNet"),
      Store.getMeta("examDate"),
      Store.getMeta("dailyQuestionGoal"),
      Store.getMeta("dailyMinuteGoal"),
      Store.getMeta("notifyReviews")
    ]);
  let normalizedTarget = targetNet == null || targetNet === "" ? null : Number(targetNet);
  if (normalizedTarget != null && !Number.isFinite(normalizedTarget)) normalizedTarget = null;
  DB.settings = {
    examDate: examDate || "",
    targetNet: normalizedTarget,
    theme: theme === "light" ? "light" : "dark",
    dailyQuestionGoal: normNumMeta(dailyQuestionGoal),
    dailyMinuteGoal: normNumMeta(dailyMinuteGoal),
    notifyReviews: notifyReviews === true
  };
}

/** One-time migration of the original localStorage payload into IndexedDB. */
export async function migrateLegacy() {
  if (await Store.getMeta("_migrated")) return;
  const raw = localStorage.getItem("kpss_dashboard_v1");
  if (raw) {
    try {
      const p = JSON.parse(raw);
      for (const b of p.books || []) await Store.put("books", b);
      for (const s of p.sessions || []) await Store.put("sessions", s);
      for (const t of p.trials || []) await Store.put("trials", t);
      if (p.settings && p.settings.examDate) await Store.setMeta("examDate", p.settings.examDate);
      toast("Eski veriler veritabanına taşındı.");
    } catch (e) {
      console.warn("migrate failed", e);
    }
  }
  await Store.setMeta("_migrated", true);
}
