/* ============================================================
   DOMAIN LOGIC — pure functions over records and the in-memory
   cache. No DOM, no HTML: easy to unit-test in isolation.
   ============================================================ */
import { SECTIONS, SECTION_KEYS, REVIEW_INTERVALS, WRONG_PENALTY } from "./config.js";
import { DB } from "./state.js";
import { ymd, startOfWeek } from "./utils.js";

export function lessonLabel(k) {
  return SECTIONS[k] ? SECTIONS[k].label : "—";
}

/* ---------- Sessions (konu testleri) ---------- */
export function getSessionWrongTags(s) {
  if (s.wrongTags && typeof s.wrongTags === "object") return s.wrongTags;
  const tags = {};
  (s.wrong || []).forEach((q) => {
    tags[String(q)] = "";
  });
  return tags;
}
export function getSessionWrongList(s) {
  if (s.wrong && s.wrong.length) return [...s.wrong].sort((a, b) => a - b);
  return Object.keys(getSessionWrongTags(s))
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
}

/* ---------- Trials (genel denemeler) ---------- */
export function getTrialTopicTags(t) {
  const tagged = t.wrongTopicTags && typeof t.wrongTopicTags === "object" ? t.wrongTopicTags : {};
  if (Object.keys(tagged).length) return tagged;
  // Fall back to the legacy `wrongTopics` shape (arrays of topic names).
  const out = {};
  if (t.wrongTopics) {
    SECTION_KEYS.forEach((k) => {
      (t.wrongTopics[k] || []).forEach((tp) => {
        if (!out[k]) out[k] = {};
        out[k][tp] = "";
      });
    });
  }
  return out;
}
export function countTrialWrongTopics(t) {
  const tags = getTrialTopicTags(t);
  return SECTION_KEYS.reduce((n, k) => n + Object.keys(tags[k] || {}).length, 0);
}
export function listTrialWrongEntries(t) {
  const tags = getTrialTopicTags(t);
  const list = [];
  SECTION_KEYS.forEach((k) =>
    Object.keys(tags[k] || {}).forEach((tp) =>
      list.push({ section: k, topic: tp, reason: tags[k][tp] || "" })
    )
  );
  return list;
}
export function totalNet(t) {
  return SECTION_KEYS.reduce((a, k) => a + (t.nets[k] || 0), 0);
}
export function sortedTrials() {
  return [...DB.trials].sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Subject trials (alan denemeleri) ---------- */
export function sortedSubjectTrials() {
  return [...DB.subjectTrials].sort((a, b) => a.date.localeCompare(b.date));
}

/** Questions answered in a subject trial (correct + wrong). */
export function subjectTrialQuestions(t) {
  return (Number(t.d) || 0) + (Number(t.y) || 0);
}

/** Per-ders aggregate of subject trials: { section, label, count, avgNet, bestNet }. */
export function subjectTrialAveragesBySection(subjectTrials = DB.subjectTrials) {
  const map = {};
  subjectTrials.forEach((t) => {
    if (!SECTIONS[t.section]) return;
    map[t.section] = map[t.section] || { section: t.section, count: 0, sumNet: 0, bestNet: -Infinity };
    map[t.section].count += 1;
    map[t.section].sumNet += t.net || 0;
    map[t.section].bestNet = Math.max(map[t.section].bestNet, t.net || 0);
  });
  return SECTION_KEYS.filter((k) => map[k]).map((k) => ({
    section: k,
    label: SECTIONS[k].label,
    count: map[k].count,
    avgNet: map[k].sumNet / map[k].count,
    bestNet: map[k].bestNet
  }));
}

/** Section net from raw correct/wrong counts. */
export function netFromCounts(d, y) {
  return (Number(d) || 0) - (Number(y) || 0) * WRONG_PENALTY;
}

/* ---------- Tagging ---------- */
export function tagsToWrongTopicTags(tagResults) {
  const out = {};
  Object.entries(tagResults).forEach(([id, reason]) => {
    const sep = id.indexOf("|");
    if (sep < 0) return;
    const section = id.slice(0, sep);
    const topic = id.slice(sep + 1);
    if (!out[section]) out[section] = {};
    out[section][topic] = reason || "";
  });
  return out;
}
export function collectReasonStats(
  sessions = DB.sessions,
  trials = DB.trials,
  subjectTrials = DB.subjectTrials
) {
  const counts = {};
  sessions.forEach((s) =>
    Object.values(getSessionWrongTags(s)).forEach((r) => {
      if (r) counts[r] = (counts[r] || 0) + 1;
    })
  );
  const addEntries = (recs) =>
    recs.forEach((t) =>
      listTrialWrongEntries(t).forEach((e) => {
        if (e.reason) counts[e.reason] = (counts[e.reason] || 0) + 1;
      })
    );
  addEntries(trials);
  addEntries(subjectTrials);
  return counts;
}

/* ---------- Reviews ---------- */
export function hasActiveReview(lesson, topic) {
  return DB.reviews.some((r) => !r.done && r.lesson === lesson && r.topic === topic);
}

/* ---------- Mastery ---------- */
export function computeMastery(
  sessions = DB.sessions,
  trials = DB.trials,
  subjectTrials = DB.subjectTrials
) {
  const map = {};
  const key = (l, t) => l + "||" + t;
  sessions.forEach((s) => {
    if (!SECTIONS[s.lesson]) return;
    const k = key(s.lesson, s.topic);
    map[k] = map[k] || { lesson: s.lesson, topic: s.topic, total: 0, wrong: 0, flags: 0 };
    map[k].total += s.total;
    map[k].wrong += getSessionWrongList(s).length;
  });
  const addFlags = (recs) =>
    recs.forEach((t) =>
      listTrialWrongEntries(t).forEach((e) => {
        const kk = key(e.section, e.topic);
        map[kk] = map[kk] || { lesson: e.section, topic: e.topic, total: 0, wrong: 0, flags: 0 };
        map[kk].flags += 1;
      })
    );
  addFlags(trials);
  addFlags(subjectTrials);
  return Object.values(map).map((m) => {
    let score;
    const hasKonu = m.total > 0;
    if (hasKonu) {
      const acc = ((m.total - m.wrong) / m.total) * 100;
      score = acc - Math.min(m.flags * 8, 40);
    } else {
      score = 70 - m.flags * 10;
    }
    return { ...m, hasKonu, score: Math.max(0, Math.min(100, Math.round(score))) };
  });
}

/* ---------- Activity / streak ---------- */
export function activityCounts() {
  const m = {};
  DB.sessions.forEach((s) => (m[s.date] = (m[s.date] || 0) + 1));
  DB.trials.forEach((t) => (m[t.date] = (m[t.date] || 0) + 1));
  DB.subjectTrials.forEach((t) => (m[t.date] = (m[t.date] || 0) + 1));
  DB.reviews.forEach((r) => (r.history || []).forEach((d) => (m[d] = (m[d] || 0) + 1)));
  return m;
}
export function computeStreak(counts) {
  const has = (d) => (counts[d] || 0) > 0;
  const cur = new Date();
  cur.setHours(0, 0, 0, 0);
  if (!has(ymd(cur))) cur.setDate(cur.getDate() - 1);
  let current = 0;
  while (has(ymd(cur))) {
    current++;
    cur.setDate(cur.getDate() - 1);
  }
  const dates = Object.keys(counts)
    .filter((d) => counts[d] > 0)
    .sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  dates.forEach((ds) => {
    const dt = new Date(ds + "T00:00:00");
    run = prev && Math.round((dt - prev) / 86400000) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = dt;
  });
  return { current, longest };
}

/* ---------- Question / time volume ---------- */
/** Total questions answered in a trial (sum of correct + wrong per section). */
export function trialQuestions(t) {
  return SECTION_KEYS.reduce((n, k) => {
    const c = (t.counts && t.counts[k]) || {};
    return n + (Number(c.d) || 0) + (Number(c.y) || 0);
  }, 0);
}

/** Questions solved on a given YYYY-MM-DD (konu tests + trials). */
export function questionsOnDate(dateStr) {
  let q = 0;
  DB.sessions.forEach((s) => {
    if (s.date === dateStr) q += s.total || 0;
  });
  DB.trials.forEach((t) => {
    if (t.date === dateStr) q += trialQuestions(t);
  });
  DB.subjectTrials.forEach((t) => {
    if (t.date === dateStr) q += subjectTrialQuestions(t);
  });
  return q;
}

/** Study minutes recorded on a given YYYY-MM-DD (konu tests + trials). */
export function minutesOnDate(dateStr) {
  let m = 0;
  DB.sessions.forEach((s) => {
    if (s.date === dateStr) m += s.duration || 0;
  });
  DB.trials.forEach((t) => {
    if (t.date === dateStr) m += t.duration || 0;
  });
  DB.subjectTrials.forEach((t) => {
    if (t.date === dateStr) m += t.duration || 0;
  });
  return m;
}

/* ---------- Daily summary ---------- */
export function dailySummary() {
  const today = ymd(new Date());
  const y = new Date();
  y.setHours(0, 0, 0, 0);
  y.setDate(y.getDate() - 1);
  const yest = ymd(y);
  const counts = activityCounts();
  const streak = computeStreak(counts);
  return {
    streak: streak.current,
    longest: streak.longest,
    todayQuestions: questionsOnDate(today),
    todayMinutes: minutesOnDate(today),
    yesterdayQuestions: questionsOnDate(yest),
    activeToday: (counts[today] || 0) > 0
  };
}

/* ---------- Achievements (derived, no storage) ---------- */
export function computeAchievements() {
  const counts = activityCounts();
  const streak = computeStreak(counts);
  const totalQuestions =
    DB.sessions.reduce((a, s) => a + (s.total || 0), 0) +
    DB.trials.reduce((a, t) => a + trialQuestions(t), 0) +
    DB.subjectTrials.reduce((a, t) => a + subjectTrialQuestions(t), 0);
  const trialCount = DB.trials.length;
  const subjectTrialCount = DB.subjectTrials.length;
  const perfectSessions = DB.sessions.filter((s) => getSessionWrongList(s).length === 0).length;
  const completedReviews = DB.reviews.filter((r) => r.done).length;

  const defs = [
    { id: "streak7", abbr: "7G", title: "7 Gün Seri", desc: "7 gün üst üste çalış", goal: 7, value: streak.longest },
    { id: "streak30", abbr: "30G", title: "30 Gün Seri", desc: "30 gün üst üste çalış", goal: 30, value: streak.longest },
    { id: "q100", abbr: "100", title: "100 Soru", desc: "Toplam 100 soru çöz", goal: 100, value: totalQuestions },
    { id: "q500", abbr: "500", title: "500 Soru", desc: "Toplam 500 soru çöz", goal: 500, value: totalQuestions },
    { id: "q1000", abbr: "1K", title: "1000 Soru", desc: "Toplam 1000 soru çöz", goal: 1000, value: totalQuestions },
    { id: "trial5", abbr: "5D", title: "5 Deneme", desc: "5 genel deneme çöz", goal: 5, value: trialCount },
    { id: "subjtrial10", abbr: "10A", title: "10 Alan Denemesi", desc: "10 alan (tek ders) denemesi çöz", goal: 10, value: subjectTrialCount },
    { id: "perfect", abbr: "TAM", title: "İlk Tam Puan", desc: "Bir konu testini tam yap", goal: 1, value: perfectSessions },
    { id: "review1", abbr: "TKR", title: "İlk Tekrar Bitti", desc: "Bir konunun tüm tekrarlarını tamamla", goal: 1, value: completedReviews }
  ];
  return defs.map((d) => ({
    ...d,
    unlocked: d.value >= d.goal,
    pct: Math.min(100, Math.round((d.value / d.goal) * 100))
  }));
}

/* ---------- Time-series trends (weekly) ---------- */
/** Konu-test accuracy per ISO week: [{ week, accuracy, total }]. */
export function konuAccuracyByWeek() {
  const map = {};
  DB.sessions.forEach((s) => {
    const wk = startOfWeek(s.date);
    map[wk] = map[wk] || { total: 0, wrong: 0 };
    map[wk].total += s.total || 0;
    map[wk].wrong += getSessionWrongList(s).length;
  });
  return Object.keys(map)
    .sort()
    .map((wk) => ({
      week: wk,
      total: map[wk].total,
      accuracy: map[wk].total ? Math.round(((map[wk].total - map[wk].wrong) / map[wk].total) * 100) : 0
    }));
}

/** Study minutes per ISO week: [{ week, minutes }]. */
export function studyMinutesByWeek() {
  const map = {};
  DB.trials.forEach((t) => {
    if (!t.duration) return;
    const wk = startOfWeek(t.date);
    map[wk] = (map[wk] || 0) + t.duration;
  });
  DB.sessions.forEach((s) => {
    if (!s.duration) return;
    const wk = startOfWeek(s.date);
    map[wk] = (map[wk] || 0) + s.duration;
  });
  DB.subjectTrials.forEach((t) => {
    if (!t.duration) return;
    const wk = startOfWeek(t.date);
    map[wk] = (map[wk] || 0) + t.duration;
  });
  return Object.keys(map)
    .sort()
    .map((wk) => ({ week: wk, minutes: map[wk] }));
}

/** Reason counts per ISO week: { labels: [weeks], weeks: { week: { reason: n } } }. */
export function reasonTrendByWeek() {
  const weeks = {};
  const add = (date, reason) => {
    if (!reason) return;
    const wk = startOfWeek(date);
    weeks[wk] = weeks[wk] || {};
    weeks[wk][reason] = (weeks[wk][reason] || 0) + 1;
  };
  DB.sessions.forEach((s) =>
    Object.values(getSessionWrongTags(s)).forEach((r) => add(s.date, r))
  );
  DB.trials.forEach((t) => listTrialWrongEntries(t).forEach((e) => add(t.date, e.reason)));
  DB.subjectTrials.forEach((t) => listTrialWrongEntries(t).forEach((e) => add(t.date, e.reason)));
  return { labels: Object.keys(weeks).sort(), weeks };
}

/* ---------- Weekly comparison (this week vs last week) ---------- */
function rangeStats(fromStr, toStr) {
  const inRange = (d) => d >= fromStr && d <= toStr;
  let questions = 0;
  let minutes = 0;
  const trialNets = [];
  DB.sessions.forEach((s) => {
    if (!inRange(s.date)) return;
    questions += s.total || 0;
    minutes += s.duration || 0;
  });
  DB.trials.forEach((t) => {
    if (!inRange(t.date)) return;
    questions += trialQuestions(t);
    minutes += t.duration || 0;
    trialNets.push(totalNet(t));
  });
  const avgNet = trialNets.length ? trialNets.reduce((a, b) => a + b, 0) / trialNets.length : null;
  return { questions, minutes, trials: trialNets.length, avgNet };
}

export function weeklyComparison() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisStart = new Date(today);
  thisStart.setDate(thisStart.getDate() - ((thisStart.getDay() + 6) % 7));
  const lastStart = new Date(thisStart);
  lastStart.setDate(lastStart.getDate() - 7);
  const lastEnd = new Date(thisStart);
  lastEnd.setDate(lastEnd.getDate() - 1);
  return {
    thisWeek: rangeStats(ymd(thisStart), ymd(today)),
    lastWeek: rangeStats(ymd(lastStart), ymd(lastEnd))
  };
}

/* ---------- Predicted exam net (linear regression on trial totals) ---------- */
export function predictExamNet() {
  const trials = sortedTrials();
  if (trials.length < 2 || !DB.settings.examDate) return null;
  const base = new Date(trials[0].date + "T00:00:00").getTime();
  const dayOf = (d) => (new Date(d + "T00:00:00").getTime() - base) / 86400000;
  const pts = trials.map((t) => [dayOf(t.date), totalNet(t)]);
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p[0], 0);
  const sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
  const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const examX = dayOf(DB.settings.examDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (examX < dayOf(ymd(today))) return null; // exam already passed
  const predicted = slope * examX + intercept;
  return {
    predicted,
    slope,
    perWeek: slope * 7,
    latest: totalNet(trials[trials.length - 1])
  };
}

export { REVIEW_INTERVALS };
