/* ============================================================
   DATA NORMALIZATION — defensive parsing for anything that
   crosses a trust boundary (IndexedDB rows, imported JSON).
   Invalid records are coerced to safe defaults or dropped.
   ============================================================ */
import { SECTIONS, SECTION_KEYS } from "./config.js";
import { isYmd } from "./utils.js";

function asStr(v, max = 500) {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function asNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function asId(v) {
  const s = asStr(v, 80);
  return s || null;
}

export function normalizeBook(b) {
  const id = asId(b && b.id);
  const name = asStr(b && b.name, 200).trim();
  const lesson = b && b.lesson;
  if (!id || !name || !SECTIONS[lesson]) return null;
  return { id, name, lesson };
}

export function normalizeSession(s) {
  if (!s || typeof s !== "object") return null;
  const id = asId(s.id);
  if (!id || !asStr(s.date, 12)) return null;
  const wrong = Array.isArray(s.wrong)
    ? [...new Set(s.wrong.map((n) => parseInt(n, 10)).filter((n) => n > 0))].sort((a, b) => a - b)
    : [];
  const wrongTags = s.wrongTags && typeof s.wrongTags === "object" ? s.wrongTags : {};
  return {
    id,
    date: asStr(s.date, 12),
    bookId: asId(s.bookId) || "",
    bookName: asStr(s.bookName, 200),
    lesson: asStr(s.lesson, 40),
    topic: asStr(s.topic, 200),
    testNumber: asStr(s.testNumber, 80),
    total: Math.max(1, asNum(s.total, 1)),
    duration: Math.max(0, asNum(s.duration, 0)),
    wrong,
    wrongTags
  };
}

export function normalizeTrial(t) {
  if (!t || typeof t !== "object") return null;
  const id = asId(t.id);
  if (!id || !asStr(t.date, 12)) return null;
  const nets = {};
  const counts = {};
  SECTION_KEYS.forEach((k) => {
    const c = t.counts && t.counts[k];
    const d = Math.max(0, asNum(c && c.d, 0));
    const y = Math.max(0, asNum(c && c.y, 0));
    counts[k] = { d, y };
    // Prefer derived net from counts when available; fall back to stored net.
    nets[k] = c ? d - y * 0.25 : asNum(t.nets && t.nets[k], 0);
  });
  const wrongTopicTags =
    t.wrongTopicTags && typeof t.wrongTopicTags === "object" ? t.wrongTopicTags : {};
  // Preserve legacy `wrongTopics` shape so domain helpers can migrate it lazily.
  const legacy =
    t.wrongTopics && typeof t.wrongTopics === "object" ? { wrongTopics: t.wrongTopics } : {};
  return {
    id,
    date: asStr(t.date, 12),
    duration: Math.max(0, asNum(t.duration, 0)),
    nets,
    counts,
    notes: asStr(t.notes, 2000),
    wrongTopicTags,
    ...legacy
  };
}

export function normalizeSubjectTrial(t) {
  if (!t || typeof t !== "object") return null;
  const id = asId(t.id);
  if (!id || !asStr(t.date, 12)) return null;
  const section = t.section;
  if (!SECTIONS[section]) return null;
  const d = Math.max(0, asNum(t.d, 0));
  const y = Math.max(0, asNum(t.y, 0));
  // Keep wrongTopicTags in the same nested shape as general trials so the
  // domain helpers (listTrialWrongEntries, mastery, …) can be reused as-is.
  let wrongTopicTags = {};
  if (t.wrongTopicTags && typeof t.wrongTopicTags === "object") {
    SECTION_KEYS.forEach((k) => {
      if (t.wrongTopicTags[k] && typeof t.wrongTopicTags[k] === "object") {
        wrongTopicTags[k] = { ...t.wrongTopicTags[k] };
      }
    });
  }
  return {
    id,
    date: asStr(t.date, 12),
    section,
    duration: Math.max(0, asNum(t.duration, 0)),
    d,
    y,
    net: d - y * 0.25,
    notes: asStr(t.notes, 2000),
    wrongTopicTags
  };
}

export function normalizeReview(r) {
  if (!r || typeof r !== "object") return null;
  const id = asId(r.id);
  if (!id || !SECTIONS[r.lesson] || !asStr(r.topic, 200)) return null;
  const done = !!r.done;
  return {
    id,
    lesson: r.lesson,
    topic: asStr(r.topic, 200),
    createdDate: asStr(r.createdDate, 12) || "",
    level: Math.max(0, asNum(r.level, 0)),
    nextDate: done ? null : asStr(r.nextDate, 12) || null,
    history: Array.isArray(r.history) ? r.history.filter(isYmd) : [],
    done
  };
}

export function normalizeImport(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Geçersiz dosya");
  return {
    books: (Array.isArray(payload.books) ? payload.books : []).map(normalizeBook).filter(Boolean),
    sessions: (Array.isArray(payload.sessions) ? payload.sessions : [])
      .map(normalizeSession)
      .filter(Boolean),
    trials: (Array.isArray(payload.trials) ? payload.trials : [])
      .map(normalizeTrial)
      .filter(Boolean),
    subjectTrials: (Array.isArray(payload.subjectTrials) ? payload.subjectTrials : [])
      .map(normalizeSubjectTrial)
      .filter(Boolean),
    reviews: (Array.isArray(payload.reviews) ? payload.reviews : [])
      .map(normalizeReview)
      .filter(Boolean),
    settings: payload.settings && typeof payload.settings === "object" ? payload.settings : {}
  };
}

export const Data = {
  normalizeBook,
  normalizeSession,
  normalizeTrial,
  normalizeSubjectTrial,
  normalizeReview,
  normalizeImport
};
