/* ============================================================
   FEATURE — Alan Denemeleri (single-subject mock exams).
   Mirrors the general trial flow (genel denemeler) but scoped to
   one ders: enter D/Y, auto-net, photograph the page so the AI maps
   wrong questions → topics, confirm them, then tag reasons on save.
   ============================================================ */
import { SECTIONS, SECTION_KEYS } from "../config.js";
import { Store } from "../store.js";
import { DB, persist } from "../state.js";
import { $, esc, escAttr, toast, uid, fmtDate, reasonIcon } from "../utils.js";
import {
  getTrialTopicTags,
  countTrialWrongTopics,
  listTrialWrongEntries,
  tagsToWrongTopicTags,
  netFromCounts
} from "../domain.js";
import { TagGame } from "../tagGame.js";
import { isActive } from "../nav.js";
import { renderAnalytics } from "./analytics.js";
import { subjectPhotoImporter } from "./photoImport.js";
import { createStepFlow } from "./stepFlow.js";

// Draft of topic→reason tags created before the trial is saved.
let subjTopicTagsDraft = null;

// Progressive disclosure: each step appears once the previous is done.
let stepFlow = null;
function subjNetEntered() {
  const d = $("subjDogru");
  const y = $("subjYanlis");
  return (d && d.value !== "") || (y && y.value !== "");
}
function updateSteps() {
  if (stepFlow) stepFlow.update();
}

/* ---------- Form scaffolding ---------- */
export function fillSubjectTrialSection() {
  const sel = $("subjTrialSection");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = SECTION_KEYS.map(
    (k) => `<option value="${k}">${esc(SECTIONS[k].label)}</option>`
  ).join("");
  if (cur && SECTIONS[cur]) sel.value = cur;
  // Wrong topics come from the AI confirmation list (rendered into
  // #subjTopicChecks by photoImport) — no manual topic grid.
  subjectPhotoImporter.renderConfirmList();

  const stepEl = (n) => document.querySelector(`#page-alan .step[data-step="${n}"]`);
  stepFlow = createStepFlow([
    { el: stepEl(1), gate: subjNetEntered },
    { el: stepEl(2), gate: () => subjectPhotoImporter.hasMatches() },
    { el: stepEl(3), gate: () => subjectPhotoImporter.hasMatches() },
    { el: stepEl(4) }
  ]);
  subjectPhotoImporter.setOnChange(updateSteps);
  updateSteps();
}

/** Switching ders invalidates the AI matches (topics are section-specific). */
export function onSubjSectionChange() {
  subjectPhotoImporter.clearResults();
}

function currentSection() {
  const sel = $("subjTrialSection");
  const k = sel && sel.value;
  return SECTIONS[k] ? k : "";
}

export function recalcSubjectNet() {
  const d = parseFloat($("subjDogru").value) || 0;
  const y = parseFloat($("subjYanlis").value) || 0;
  $("subjNetVal").textContent = netFromCounts(d, y).toFixed(2) + " net";
  updateSteps();
}

function getCheckedSubjTopics() {
  // Multiple wrong questions can map to the same topic; collapse to one
  // entry per section|topic (wrongTopicTags stores one reason per topic).
  const seen = new Set();
  const list = [];
  document.querySelectorAll("#subjTopicChecks input:checked").forEach((cb) => {
    const id = cb.dataset.section + "|" + cb.value;
    if (seen.has(id)) return;
    seen.add(id);
    list.push({ section: cb.dataset.section, topic: cb.value, id });
  });
  return list;
}

export function updateSubjTagDraftHint() {
  const el = $("subjTagDraftHint");
  if (!el) return;
  if (!subjTopicTagsDraft) {
    el.textContent = "";
    return;
  }
  const n = listTrialWrongEntries({ wrongTopicTags: subjTopicTagsDraft }).length;
  el.textContent = n ? `${n} konu etiketlendi (kayda dahil)` : "";
}

function runTagGameForSubj(checkedTopics, onComplete) {
  if (!checkedTopics.length) {
    onComplete({});
    return;
  }
  const items = checkedTopics.map((c) => ({ id: c.id, label: c.topic, sublabel: SECTIONS[c.section].label }));
  TagGame.open(items, (results) => onComplete(tagsToWrongTopicTags(results)));
}

async function finishSubjectTrialSave(payload) {
  const t = { id: uid(), ...payload };
  await persist(async () => {
    await Store.put("subjectTrials", t);
    DB.subjectTrials.push(t);
  });
  $("subjTrialDuration").value = "";
  $("subjTrialNotes").value = "";
  $("subjDogru").value = "";
  $("subjYanlis").value = "";
  subjectPhotoImporter.clearResults();
  subjTopicTagsDraft = null;
  updateSubjTagDraftHint();
  recalcSubjectNet();
  renderSubjectTrials();
  if (isActive("analiz")) renderAnalytics();
  toast("Alan denemesi kaydedildi.");
}

export function addSubjectTrial() {
  const date = $("subjTrialDate").value;
  if (!date) return toast("Tarih seçin.", true);
  const section = currentSection();
  if (!section) return toast("Ders seçin.", true);
  const duration = parseInt($("subjTrialDuration").value, 10) || 0;
  const d = parseFloat($("subjDogru").value) || 0;
  const y = parseFloat($("subjYanlis").value) || 0;
  const notes = $("subjTrialNotes").value.trim();
  const checked = getCheckedSubjTopics();
  const base = { date, section, duration, d, y, net: netFromCounts(d, y), notes };

  const saveWithTags = (wrongTopicTags) => finishSubjectTrialSave({ ...base, wrongTopicTags });

  if (subjTopicTagsDraft && checked.length) {
    const missing = checked.filter(
      (c) => !(subjTopicTagsDraft[c.section] && c.topic in subjTopicTagsDraft[c.section])
    );
    const buildMerged = (extra) => {
      const merged = {};
      checked.forEach((c) => {
        if (!merged[c.section]) merged[c.section] = {};
        const fromDraft = subjTopicTagsDraft[c.section] && subjTopicTagsDraft[c.section][c.topic];
        const fromExtra = extra && extra[c.section] && extra[c.section][c.topic];
        merged[c.section][c.topic] = (fromDraft !== undefined ? fromDraft : fromExtra) || "";
      });
      return merged;
    };
    if (!missing.length) {
      saveWithTags(buildMerged());
      return;
    }
    runTagGameForSubj(missing, (extra) => saveWithTags(buildMerged(extra)));
    return;
  }
  if (!checked.length) {
    return toast("En az bir yanlış konu işaretle — kayıtta her konu için sebep ekranı açılır.", true);
  }
  runTagGameForSubj(checked, (tags) => saveWithTags(tags));
}

export async function deleteSubjectTrial(id) {
  await persist(() => Store.del("subjectTrials", id));
  DB.subjectTrials = DB.subjectTrials.filter((t) => t.id !== id);
  renderSubjectTrials();
  if (isActive("analiz")) renderAnalytics();
  toast("Alan denemesi silindi.");
}

function renderTopicTagPills(tags) {
  const entries = listTrialWrongEntries({ wrongTopicTags: tags });
  if (!entries.length) return "—";
  return entries
    .map(
      (e) =>
        `<span class="pill topic" title="${esc(e.reason || "Sebep yok")}">${reasonIcon(e.reason)} ${esc(e.topic)}</span>`
    )
    .join(" ");
}

export function renderSubjectTrials() {
  const tbl = $("subjTrialTable");
  if (!tbl) return;
  const trials = [...DB.subjectTrials].sort((a, b) => b.date.localeCompare(a.date));
  if (!trials.length) {
    tbl.innerHTML = '<tbody><tr><td><div class="empty">Henüz alan denemesi yok. Yukarıdaki adımları izleyerek ilk alan denemeni ekle.</div></td></tr></tbody>';
    $("subjTrialSummary").textContent = "";
    return;
  }
  const avg = trials.reduce((a, t) => a + (t.net || 0), 0) / trials.length;
  $("subjTrialSummary").textContent = `${trials.length} alan denemesi · ortalama net ${avg.toFixed(2)}`;
  tbl.innerHTML =
    "<thead><tr><th>Tarih</th><th>Ders</th><th>D / Y</th><th>Net</th><th>Yanlış Konu</th><th></th></tr></thead><tbody>" +
    trials
      .map((t) => {
        const wt = countTrialWrongTopics(t);
        const topicHtml = wt ? renderTopicTagPills(getTrialTopicTags(t)) : "—";
        const label = SECTIONS[t.section] ? SECTIONS[t.section].label : "—";
        return `<tr>
        <td>${fmtDate(t.date)}${t.duration ? ' <span class="pill">' + t.duration + "dk</span>" : ""}${t.notes ? ' <span class="pill" title="' + escAttr(t.notes) + '">not</span>' : ""}</td>
        <td><span class="pill topic">${esc(label)}</span></td>
        <td>${t.d} / ${t.y}</td>
        <td><strong>${(t.net || 0).toFixed(2)}</strong></td>
        <td>${topicHtml}</td>
        <td style="text-align:right"><button class="iconbtn del" data-act="delsubjtrial" data-id="${t.id}" title="Sil">×</button></td>
      </tr>`;
      })
      .join("") +
    "</tbody>";
}
