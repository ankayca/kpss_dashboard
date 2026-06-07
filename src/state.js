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
  reviews: [],
  settings: {
    examDate: "",
    targetNet: null,
    theme: "dark",
    dailyQuestionGoal: null,
    dailyMinuteGoal: null,
    notifyReviews: false,
    onboardDismissed: false
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
  const [books, sessions, trials, reviews] = await Promise.all([
    Store.all("books"),
    Store.all("sessions"),
    Store.all("trials"),
    Store.all("reviews")
  ]);
  DB.books = (books || []).map(Data.normalizeBook).filter(Boolean);
  DB.sessions = (sessions || []).map(Data.normalizeSession).filter(Boolean);
  DB.trials = (trials || []).map(Data.normalizeTrial).filter(Boolean);
  DB.reviews = (reviews || []).map(Data.normalizeReview).filter(Boolean);

  const [theme, targetNet, examDate, dailyQuestionGoal, dailyMinuteGoal, notifyReviews, onboardDismissed] =
    await Promise.all([
      Store.getMeta("theme"),
      Store.getMeta("targetNet"),
      Store.getMeta("examDate"),
      Store.getMeta("dailyQuestionGoal"),
      Store.getMeta("dailyMinuteGoal"),
      Store.getMeta("notifyReviews"),
      Store.getMeta("onboardDismissed")
    ]);
  let normalizedTarget = targetNet == null || targetNet === "" ? null : Number(targetNet);
  if (normalizedTarget != null && !Number.isFinite(normalizedTarget)) normalizedTarget = null;
  DB.settings = {
    examDate: examDate || "",
    targetNet: normalizedTarget,
    theme: theme === "light" ? "light" : "dark",
    dailyQuestionGoal: normNumMeta(dailyQuestionGoal),
    dailyMinuteGoal: normNumMeta(dailyMinuteGoal),
    notifyReviews: notifyReviews === true,
    onboardDismissed: onboardDismissed === true
  };
}
