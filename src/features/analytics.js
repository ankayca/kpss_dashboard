/* ============================================================
   FEATURE — Analiz Paneli (charts, mastery, streaks, pace,
   daily goals, achievements, trends, predictions).
   ============================================================ */
import Chart from "chart.js/auto";
import { SECTIONS, SECTION_KEYS, REASON_META } from "../config.js";
import { DB } from "../state.js";
import { $, esc, escAttr, fmtDate, ymd, cssVar, normTopic } from "../utils.js";
import {
  lessonLabel,
  sortedTrials,
  sortedSubjectTrials,
  subjectTrialAveragesBySection,
  totalNet,
  activityCounts,
  computeStreak,
  computeMastery,
  listTrialWrongEntries,
  getSessionWrongList,
  getSessionWrongTags,
  hasActiveReview,
  dailySummary,
  computeAchievements,
  konuAccuracyByWeek,
  reasonTrendByWeek,
  studyMinutesByWeek,
  weeklyComparison,
  predictExamNet,
  questionsOnDate,
  minutesOnDate
} from "../domain.js";

let trendChart;
let sectionChart;
let sectionTrendChart;
let studyTimeChart;
let konuTrendChart;
let reasonTrendChart;

/* ---------- Filter state ---------- */
const FILTER = { range: "all", lesson: "" };
let filterWired = false;

function rangeStart() {
  if (FILTER.range === "all") return null;
  const days = parseInt(FILTER.range, 10);
  if (!Number.isFinite(days)) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return ymd(d);
}
function passDate(dateStr) {
  const start = rangeStart();
  return !start || dateStr >= start;
}
function filteredTrials() {
  return sortedTrials().filter((t) => passDate(t.date));
}
function filteredSubjectTrials() {
  return sortedSubjectTrials().filter(
    (t) => passDate(t.date) && (!FILTER.lesson || t.section === FILTER.lesson)
  );
}
function filteredSessions() {
  return DB.sessions.filter(
    (s) => passDate(s.date) && (!FILTER.lesson || s.lesson === FILTER.lesson)
  );
}
function passLessonEntry(section) {
  return !FILTER.lesson || section === FILTER.lesson;
}

function setupFilterControls() {
  const lessonSel = $("fltLesson");
  if (lessonSel && !lessonSel.options.length) {
    lessonSel.innerHTML =
      '<option value="">Tüm dersler</option>' +
      SECTION_KEYS.map((k) => `<option value="${k}">${esc(SECTIONS[k].label)}</option>`).join("");
  }
  if (filterWired) return;
  const rangeSel = $("fltRange");
  if (rangeSel) {
    rangeSel.value = FILTER.range;
    rangeSel.addEventListener("change", () => {
      FILTER.range = rangeSel.value;
      renderAnalytics();
    });
  }
  if (lessonSel) {
    lessonSel.value = FILTER.lesson;
    lessonSel.addEventListener("change", () => {
      FILTER.lesson = lessonSel.value;
      renderAnalytics();
    });
  }
  filterWired = true;
}

/* ---------- Chart helpers ---------- */
function chartPalette() {
  return [cssVar("--accent"), cssVar("--accent-2"), cssVar("--red-dark"), cssVar("--yellow"), "#8a8076"];
}
function destroyChart(ch) {
  if (ch) {
    try {
      ch.destroy();
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}
function chartOpts(extra) {
  const tick = cssVar("--text-dim");
  const grid = "rgba(128,128,128,.12)";
  return Object.assign(
    {
      responsive: true,
      plugins: { legend: { labels: { color: tick, boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: tick, maxRotation: 45 }, grid: { color: grid } },
        y: { ticks: { color: tick }, grid: { color: grid }, beginAtZero: true }
      }
    },
    extra || {}
  );
}

export function renderAnalytics() {
  setupFilterControls();
  const trials = filteredTrials();
  const sessions = filteredSessions();
  const subjectTrials = filteredSubjectTrials();
  const counts = activityCounts();

  renderCountdown();
  $("statTrials").textContent = trials.length;
  $("statBestNet").textContent = trials.length ? Math.max(...trials.map(totalNet)).toFixed(2) : "—";
  const streak = computeStreak(counts);
  $("statStreak").textContent = streak.current;
  $("statLongest").textContent = streak.longest;

  renderDailySummary();
  renderGoalRings();
  renderHeatmap(counts);
  renderPace(trials);
  renderPredict();
  renderWeeklyCompare();
  renderMastery(sessions, trials, subjectTrials);
  drawTrend(trials);
  drawSection(trials);
  drawSectionTrend(trials);
  drawStudyTime();
  drawKonuTrend();
  drawReasonTrend();
  drawTrialTopicFreq(trials);
  const konuCounts = drawKonuTopicFreq(sessions);
  drawSubjectTrialFreq(subjectTrials);
  drawReasonFreq(sessions, trials, subjectTrials);
  drawIntersection(trials, konuCounts);
  renderAchievements();
}

/**
 * Switch the active Analiz sub-tab. Charts are responsive, so we re-render
 * after revealing the panel to guarantee canvases that were laid out while
 * hidden (0px) get correct dimensions.
 */
export function switchAnalyticsTab(tab) {
  const panels = document.querySelectorAll("[data-anlpanel]");
  if (!panels.length) return;
  panels.forEach((p) => p.classList.toggle("active", p.dataset.anlpanel === tab));
  document
    .querySelectorAll("#anlTabs .subtab")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  renderAnalytics();
}

function renderCountdown() {
  const ed = DB.settings.examDate;
  const el = $("cdDays");
  const lbl = $("cdLbl");
  if (!ed) {
    el.textContent = "—";
    lbl.textContent = "Sınav tarihi girilmedi";
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(ed + "T00:00:00") - today) / 86400000);
  if (diff > 0) {
    el.textContent = diff;
    lbl.textContent = "Sınava kalan gün";
  } else if (diff === 0) {
    el.textContent = "Bugün";
    lbl.textContent = "Sınav günü";
  } else {
    el.textContent = Math.abs(diff);
    lbl.textContent = "gün önce yapıldı";
  }
}

/* ---------- Daily summary banner ---------- */
function renderDailySummary() {
  const el = $("dailySummary");
  if (!el) return;
  const s = dailySummary();
  const parts = [];
  if (s.streak > 0) {
    parts.push(`Serin <strong>${s.streak} gün</strong> — devam et!`);
  } else if (s.activeToday) {
    parts.push("Bugün çalışmaya başladın, seriyi başlat!");
  } else {
    parts.push("Bugün henüz kayıt yok. Bir konu testi veya deneme ekleyerek başla.");
  }
  const bits = [];
  bits.push(`Bugün <strong>${s.todayQuestions}</strong> soru`);
  if (s.todayMinutes) bits.push(`<strong>${s.todayMinutes}</strong> dk`);
  if (DB.settings.examDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(DB.settings.examDate + "T00:00:00") - today) / 86400000);
    if (diff >= 0) bits.push(`sınava <strong>${diff}</strong> gün`);
  }
  el.innerHTML =
    `<div class="sb-main">${parts[0]}</div>` + `<div class="sb-sub">${bits.join(" · ")}</div>`;
}

/* ---------- Daily goal rings ---------- */
function ringHtml(label, value, goal, unit) {
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const deg = Math.round((pct / 100) * 360);
  const done = goal && value >= goal;
  const cls = done ? "ring-done" : "";
  const goalTxt = goal ? `/ ${goal} ${unit}` : `${unit} (hedef yok)`;
  return `<div class="goal-ring">
    <div class="ring ${cls}" style="--deg:${deg}deg">
      <div class="ring-center"><span class="ring-val">${value}</span><span class="ring-pct">${goal ? pct + "%" : "—"}</span></div>
    </div>
    <div class="ring-label">${esc(label)}</div>
    <div class="ring-goal">${esc(goalTxt)}</div>
  </div>`;
}
function renderGoalRings() {
  const el = $("goalRings");
  if (!el) return;
  const today = ymd(new Date());
  const q = questionsOnDate(today);
  const m = minutesOnDate(today);
  const qGoal = DB.settings.dailyQuestionGoal;
  const mGoal = DB.settings.dailyMinuteGoal;
  if (qGoal == null && mGoal == null) {
    el.innerHTML =
      '<div class="empty">Günlük hedef belirlenmedi. Ayarlar → Günlük Hedef ile soru/süre hedefi koy.</div>';
    return;
  }
  let html = "";
  if (qGoal != null) html += ringHtml("Bugünkü soru", q, qGoal, "soru");
  if (mGoal != null) html += ringHtml("Bugünkü süre", m, mGoal, "dk");
  el.innerHTML = html;
}

function renderPace(trials) {
  const target = DB.settings.targetNet;
  const box = $("paceBox");
  if (!target) {
    box.innerHTML = '<div class="empty">Hedef net belirlenmedi. Ayarlar → Hedef Net.</div>';
    return;
  }
  if (!trials.length) {
    box.innerHTML = `<div class="empty">Hedef: <strong>${esc(target)} net</strong>. İlk denemeni ekleyince tempo hesaplanır.</div>`;
    return;
  }
  const latest = totalNet(trials[trials.length - 1]);
  const best = Math.max(...trials.map(totalNet));
  const gap = target - latest;
  let days = null;
  if (DB.settings.examDate) {
    const e = new Date(DB.settings.examDate + "T00:00:00");
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    days = Math.round((e - t) / 86400000);
  }
  const pct = Math.max(0, Math.min(100, (latest / target) * 100));
  let paceMsg;
  if (gap <= 0) {
    paceMsg = `<span class="pill ok">Hedefe ulaştın (son net ${latest.toFixed(2)})</span>`;
  } else if (days && days > 0) {
    paceMsg = `Kalan <strong>${days} gün</strong> · hedefe <strong>${gap.toFixed(2)} net</strong> kaldı → günde <strong>~${(gap / days).toFixed(3)} net</strong> artış gerek.`;
  } else {
    paceMsg = `Hedefe <strong>${gap.toFixed(2)} net</strong> kaldı. (Tempo için sınav tarihi gir.)`;
  }
  box.innerHTML = `
    <div class="prog"><div style="width:${pct}%">${pct.toFixed(0)}%</div></div>
    <div class="pace-grid">
      <div><span>Son net</span><strong>${latest.toFixed(2)}</strong></div>
      <div><span>En iyi</span><strong>${best.toFixed(2)}</strong></div>
      <div><span>Hedef</span><strong>${(+target).toFixed(2)}</strong></div>
    </div>
    <div class="sub" style="margin-top:12px">${paceMsg}</div>`;
}

/* ---------- Predicted exam net ---------- */
function renderPredict() {
  const el = $("predictBox");
  if (!el) return;
  const p = predictExamNet();
  if (!p) {
    el.innerHTML =
      '<div class="sub" style="margin-top:14px">Tahmin için en az 2 deneme ve sınav tarihi gerekir.</div>';
    return;
  }
  const trend =
    p.perWeek > 0.05
      ? `<span class="pill ok">haftada +${p.perWeek.toFixed(2)} net</span>`
      : p.perWeek < -0.05
        ? `<span class="pill warn">haftada ${p.perWeek.toFixed(2)} net</span>`
        : `<span class="pill">sabit seyir</span>`;
  const targetTxt =
    DB.settings.targetNet != null
      ? p.predicted >= DB.settings.targetNet
        ? ` · <span class="pill ok">hedefin üzerinde</span>`
        : ` · <span class="pill warn">hedefin altında</span>`
      : "";
  el.innerHTML = `<div class="sub" style="margin-top:14px">Mevcut tempoyla sınav günü tahmini:
    <strong style="font-size:18px;color:var(--accent-2)">${p.predicted.toFixed(2)} net</strong>
    ${trend}${targetTxt}</div>`;
}

/* ---------- Weekly comparison ---------- */
function compareCell(label, cur, prev, unit, digits) {
  const c = cur == null ? 0 : cur;
  const pv = prev == null ? 0 : prev;
  const delta = c - pv;
  const d = Number(digits || 0);
  let arrow = '<span class="wk-flat">→</span>';
  if (delta > (d ? 0.005 : 0.5)) arrow = `<span class="wk-up">▲ ${Math.abs(delta).toFixed(d)}</span>`;
  else if (delta < -(d ? 0.005 : 0.5)) arrow = `<span class="wk-down">▼ ${Math.abs(delta).toFixed(d)}</span>`;
  const curTxt = cur == null ? "—" : cur.toFixed(d);
  return `<div class="wk-cell">
    <div class="wk-label">${esc(label)}</div>
    <div class="wk-val">${curTxt}<small>${esc(unit)}</small></div>
    <div class="wk-delta">${arrow}</div>
  </div>`;
}
function renderWeeklyCompare() {
  const el = $("weeklyCompare");
  if (!el) return;
  const { thisWeek, lastWeek } = weeklyComparison();
  el.innerHTML =
    compareCell("Çözülen soru", thisWeek.questions, lastWeek.questions, "soru", 0) +
    compareCell("Çalışma süresi", thisWeek.minutes, lastWeek.minutes, "dk", 0) +
    compareCell("Deneme", thisWeek.trials, lastWeek.trials, "adet", 0) +
    compareCell("Ortalama net", thisWeek.avgNet, lastWeek.avgNet, "net", 2);
}

function renderHeatmap(counts) {
  const weeks = 18;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // align Monday
  let html = '<div class="hm-grid">';
  const cur = new Date(start);
  while (cur <= today) {
    html += '<div class="hm-col">';
    for (let i = 0; i < 7; i++) {
      if (cur > today) {
        html += '<div class="hm-cell lf"></div>';
      } else {
        const key = ymd(cur);
        const c = counts[key] || 0;
        const lvl = c === 0 ? 0 : c === 1 ? 1 : c === 2 ? 2 : 3;
        html += `<div class="hm-cell l${lvl}" title="${fmtDate(key)}: ${c} aktivite"></div>`;
      }
      cur.setDate(cur.getDate() + 1);
    }
    html += "</div>";
  }
  $("heatmap").innerHTML = html + "</div>";
  const info = $("streakInfo");
  if (info) {
    const streak = computeStreak(counts);
    info.innerHTML = `Güncel seri: <strong>${streak.current} gün</strong> · En uzun seri: <strong>${streak.longest} gün</strong>`;
  }
}

function renderMastery(sessions, trials, subjectTrials) {
  const items = computeMastery(sessions, trials, subjectTrials)
    .filter((m) => !FILTER.lesson || m.lesson === FILTER.lesson)
    .sort((a, b) => a.score - b.score);
  const el = $("mastery");
  if (!items.length) {
    el.innerHTML = '<div class="empty">Henüz yeterli veri yok. Bir deneme ekleyince zayıf konuların burada listelenir.<div class="empty-cta"><button type="button" class="btn sm" data-page="deneme">Deneme ekle</button></div></div>';
    return;
  }
  el.innerHTML = items
    .slice(0, 30)
    .map((m) => {
      const cls = m.score < 50 ? "red" : m.score < 75 ? "yellow" : "green";
      const inQueue = hasActiveReview(m.lesson, m.topic);
      const btn = inQueue
        ? `<span class="pill ok" style="white-space:nowrap">tekrarda</span>`
        : `<button class="btn ghost sm add" data-act="addrev" data-lesson="${m.lesson}" data-topic="${escAttr(m.topic)}">+ Tekrara</button>`;
      const detail = m.hasKonu
        ? `${m.total - m.wrong}/${m.total} doğru${m.flags ? ` · ${m.flags} deneme yanlışı` : ""}`
        : `${m.flags} deneme yanlışı`;
      return `<div class="bar-row">
      <div class="name">${esc(lessonLabel(m.lesson))} · ${esc(m.topic)}<br><span style="font-size:11px;opacity:.7">${esc(detail)}</span></div>
      <div class="track"><div class="fill ${cls}" style="width:${m.score}%"></div></div>
      <div class="cnt">${m.score}</div>
      <div class="add">${btn}</div></div>`;
    })
    .join("");
}

function drawTrend(trials) {
  const c = $("chartTrend");
  if (!trials.length) {
    $("trendEmpty").style.display = "block";
    c.style.display = "none";
    trendChart = destroyChart(trendChart);
    return;
  }
  $("trendEmpty").style.display = "none";
  c.style.display = "block";
  trendChart = destroyChart(trendChart);
  const accent = cssVar("--accent-2");
  const accentDim = cssVar("--accent");
  trendChart = new Chart(c, {
    type: "line",
    data: {
      labels: trials.map((t) => fmtDate(t.date)),
      datasets: [
        {
          label: "Toplam Net",
          data: trials.map(totalNet),
          borderColor: accent,
          backgroundColor: "rgba(162,59,55,.14)",
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: accentDim
        }
      ]
    },
    options: chartOpts()
  });
}

function drawSection(trials) {
  const c = $("chartSection");
  if (!trials.length) {
    $("sectionEmpty").style.display = "block";
    c.style.display = "none";
    sectionChart = destroyChart(sectionChart);
    return;
  }
  $("sectionEmpty").style.display = "none";
  c.style.display = "block";
  sectionChart = destroyChart(sectionChart);
  sectionChart = new Chart(c, {
    type: "bar",
    data: {
      labels: SECTION_KEYS.map((k) => SECTIONS[k].label),
      datasets: [
        {
          label: "Ortalama Net",
          data: SECTION_KEYS.map(
            (k) => trials.reduce((a, t) => a + (t.nets[k] || 0), 0) / trials.length
          ),
          backgroundColor: chartPalette(),
          borderRadius: 6
        }
      ]
    },
    options: chartOpts()
  });
}

function drawSectionTrend(trials) {
  const c = $("chartSectionTrend");
  if (!trials.length) {
    $("sectionTrendEmpty").style.display = "block";
    c.style.display = "none";
    sectionTrendChart = destroyChart(sectionTrendChart);
    return;
  }
  $("sectionTrendEmpty").style.display = "none";
  c.style.display = "block";
  const colors = chartPalette();
  sectionTrendChart = destroyChart(sectionTrendChart);
  sectionTrendChart = new Chart(c, {
    type: "line",
    data: {
      labels: trials.map((t) => fmtDate(t.date)),
      datasets: SECTION_KEYS.map((k, i) => ({
        label: SECTIONS[k].label,
        data: trials.map((t) => t.nets[k] || 0),
        borderColor: colors[i],
        backgroundColor: colors[i],
        tension: 0.3,
        pointRadius: 3
      }))
    },
    options: chartOpts()
  });
}

/* ---------- Study time (weekly, global) ---------- */
function drawStudyTime() {
  const c = $("chartStudyTime");
  const series = studyMinutesByWeek();
  if (!series.length) {
    $("studyTimeEmpty").style.display = "block";
    c.style.display = "none";
    studyTimeChart = destroyChart(studyTimeChart);
    return;
  }
  $("studyTimeEmpty").style.display = "none";
  c.style.display = "block";
  studyTimeChart = destroyChart(studyTimeChart);
  studyTimeChart = new Chart(c, {
    type: "bar",
    data: {
      labels: series.map((w) => fmtDate(w.week)),
      datasets: [
        {
          label: "Dakika / hafta",
          data: series.map((w) => w.minutes),
          backgroundColor: cssVar("--accent"),
          borderRadius: 6
        }
      ]
    },
    options: chartOpts()
  });
}

/* ---------- Konu accuracy trend (weekly, global) ---------- */
function drawKonuTrend() {
  const c = $("chartKonuTrend");
  const series = konuAccuracyByWeek();
  if (!series.length) {
    $("konuTrendEmpty").style.display = "block";
    c.style.display = "none";
    konuTrendChart = destroyChart(konuTrendChart);
    return;
  }
  $("konuTrendEmpty").style.display = "none";
  c.style.display = "block";
  konuTrendChart = destroyChart(konuTrendChart);
  konuTrendChart = new Chart(c, {
    type: "line",
    data: {
      labels: series.map((w) => fmtDate(w.week)),
      datasets: [
        {
          label: "Doğruluk %",
          data: series.map((w) => w.accuracy),
          borderColor: cssVar("--green"),
          backgroundColor: "rgba(127,174,138,.16)",
          fill: true,
          tension: 0.3,
          pointRadius: 4
        }
      ]
    },
    options: chartOpts({ scales: { y: { min: 0, max: 100, ticks: { color: cssVar("--text-dim") } } } })
  });
}

/* ---------- Reason trend (weekly, global) ---------- */
function drawReasonTrend() {
  const c = $("chartReasonTrend");
  const { labels, weeks } = reasonTrendByWeek();
  if (!labels.length) {
    $("reasonTrendEmpty").style.display = "block";
    c.style.display = "none";
    reasonTrendChart = destroyChart(reasonTrendChart);
    return;
  }
  $("reasonTrendEmpty").style.display = "none";
  c.style.display = "block";
  const colors = chartPalette();
  reasonTrendChart = destroyChart(reasonTrendChart);
  reasonTrendChart = new Chart(c, {
    type: "line",
    data: {
      labels: labels.map((w) => fmtDate(w)),
      datasets: REASON_META.map((r, i) => ({
        label: r.abbr,
        data: labels.map((w) => (weeks[w] && weeks[w][r.id]) || 0),
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length],
        tension: 0.3,
        pointRadius: 3
      }))
    },
    options: chartOpts()
  });
}

function barRow(name, count, max, cls, rawName) {
  const pct = max ? Math.round((count / max) * 100) : 0;
  return `<div class="bar-row"><div class="name">${rawName ? name : esc(name)}</div><div class="track"><div class="fill ${cls || ""}" style="width:${pct}%"></div></div><div class="cnt">${count}</div></div>`;
}

function drawTrialTopicFreq(trials) {
  const counts = {};
  trials.forEach((t) =>
    listTrialWrongEntries(t).forEach((e) => {
      if (!passLessonEntry(e.section)) return;
      const key = SECTIONS[e.section].label + " · " + e.topic;
      counts[key] = (counts[key] || 0) + 1;
    })
  );
  const el = $("trialTopicFreq");
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  el.innerHTML = entries.length
    ? entries
        .slice(0, 20)
        .map(([n, c]) => barRow(n, c, entries[0][1], ""))
        .join("")
    : '<div class="empty">Henüz işaretlenmiş yanlış konu yok.</div>';
}

function drawKonuTopicFreq(sessions) {
  const counts = {};
  const lessonOf = {};
  sessions.forEach((s) => {
    const n = getSessionWrongList(s).length;
    if (!n) return;
    counts[s.topic] = (counts[s.topic] || 0) + n;
    if (SECTIONS[s.lesson]) lessonOf[s.topic] = SECTIONS[s.lesson].label;
  });
  const el = $("konuTopicFreq");
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  el.innerHTML = entries.length
    ? entries
        .slice(0, 20)
        .map(([n, c]) => barRow((lessonOf[n] ? esc(lessonOf[n]) + " · " : "") + esc(n), c, entries[0][1], "", true))
        .join("")
    : '<div class="empty">Henüz konu testi yanlışı yok.</div>';
  return counts;
}

function drawSubjectTrialFreq(subjectTrials) {
  const el = $("subjTrialFreq");
  if (!el) return;
  const rows = subjectTrialAveragesBySection(subjectTrials);
  if (!rows.length) {
    el.innerHTML = '<div class="empty">Henüz alan denemesi yok.</div>';
    return;
  }
  const max = Math.max(...rows.map((r) => Math.max(r.avgNet, 0)), 1);
  el.innerHTML = rows
    .map((r) =>
      barRow(
        `${esc(r.label)} <span class="pill">${r.count} deneme · en iyi ${r.bestNet.toFixed(2)}</span>`,
        Number(r.avgNet.toFixed(2)),
        max,
        "",
        true
      )
    )
    .join("");
}

function drawReasonFreq(sessions, trials, subjectTrials) {
  const counts = {};
  sessions.forEach((s) =>
    Object.values(getSessionWrongTags(s)).forEach((r) => {
      if (r) counts[r] = (counts[r] || 0) + 1;
    })
  );
  const addEntries = (recs) =>
    recs.forEach((t) =>
      listTrialWrongEntries(t).forEach((e) => {
        if (!passLessonEntry(e.section)) return;
        if (e.reason) counts[e.reason] = (counts[e.reason] || 0) + 1;
      })
    );
  addEntries(trials);
  addEntries(subjectTrials || []);
  const el = $("reasonFreq");
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  el.innerHTML = entries.length
    ? entries.map(([n, c]) => barRow(n, c, entries[0][1], "red")).join("")
    : '<div class="empty">Henüz sebep etiketi yok.</div>';
}

function drawIntersection(trials, konuCounts) {
  const trialNorm = {};
  trials.forEach((t) =>
    listTrialWrongEntries(t).forEach((e) => {
      if (!passLessonEntry(e.section)) return;
      trialNorm[normTopic(e.topic)] = (trialNorm[normTopic(e.topic)] || 0) + 1;
    })
  );
  const matches = [];
  Object.entries(konuCounts).forEach(([topic, kc]) => {
    const n = normTopic(topic);
    let best = null;
    Object.keys(trialNorm).forEach((tn) => {
      if (n === tn || (n && tn && (n.includes(tn) || tn.includes(n)))) {
        if (!best || trialNorm[tn] > best.tc) best = { tn, tc: trialNorm[tn] };
      }
    });
    if (best) matches.push({ topic, konu: kc, trial: best.tc });
  });
  matches.sort((a, b) => b.konu + b.trial - (a.konu + a.trial));
  const el = $("intersection");
  if (!matches.length) {
    el.innerHTML = '<div class="empty">Henüz kesişen zayıf konu yok.</div>';
    return;
  }
  const max = Math.max(...matches.map((m) => m.konu + m.trial));
  el.innerHTML = matches
    .map((m) =>
      barRow(
        `${esc(m.topic)} <span class="pill warn">konu: ${m.konu} · deneme: ${m.trial}</span>`,
        m.konu + m.trial,
        max,
        "red",
        true
      )
    )
    .join("");
}

/* ---------- Achievements ---------- */
function renderAchievements() {
  const el = $("achievements");
  if (!el) return;
  const items = computeAchievements();
  el.innerHTML = items
    .map((a) => {
      const state = a.unlocked ? "unlocked" : "locked";
      const progress = a.unlocked
        ? '<span class="pill ok">tamam</span>'
        : `<div class="badge-track"><div class="badge-fill" style="width:${a.pct}%"></div></div>
           <div class="badge-prog">${a.value} / ${a.goal}</div>`;
      return `<div class="badge ${state}">
        <div class="badge-medal">${esc(a.abbr)}</div>
        <div class="badge-body">
          <div class="badge-title">${esc(a.title)}</div>
          <div class="badge-desc">${esc(a.desc)}</div>
          ${progress}
        </div>
      </div>`;
    })
    .join("");
}
