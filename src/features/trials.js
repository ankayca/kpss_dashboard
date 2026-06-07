/* ============================================================
   FEATURE — Genel Denemeler (full mock exams + net calculator).
   ============================================================ */
import { SECTIONS, SECTION_KEYS, BOOKLETS } from "../config.js";
import { Store } from "../store.js";
import { DB, persist } from "../state.js";
import { $, esc, escAttr, toast, uid, fmtDate, reasonIcon } from "../utils.js";
import {
  getTrialTopicTags,
  countTrialWrongTopics,
  listTrialWrongEntries,
  totalNet,
  tagsToWrongTopicTags,
  netFromCounts
} from "../domain.js";
import { TagGame } from "../tagGame.js";
import { isActive } from "../nav.js";
import { renderAnalytics } from "./analytics.js";
import { generalPhotoImporter } from "./photoImport.js";
import { createStepFlow } from "./stepFlow.js";

// Draft of topic→reason tags created before the trial is saved.
let trialTopicTagsDraft = null;

// Entered net values kept per-section so switching oturum (booklet) preserves
// what was typed for the other oturum. section -> { d: string, y: string }.
let netDraft = {};

// Progressive disclosure: each step appears once the previous is done.
let stepFlow = null;
function updateSteps() {
  if (stepFlow) stepFlow.update();
}

/** Section keys belonging to the currently selected oturum (booklet). */
function bookletSections() {
  const sel = $("photoBooklet");
  const b = BOOKLETS.find((x) => x.key === (sel && sel.value)) || BOOKLETS[0];
  return ((b && b.sections) || SECTION_KEYS).filter((k) => SECTIONS[k]);
}

/** Render the net-entry grid for only the selected oturum's lessons. */
function renderNetInputs() {
  const host = $("netInputs");
  if (!host) return;
  host.innerHTML = bookletSections()
    .map((k) => {
      const draft = netDraft[k] || {};
      return `<div class="net-card">
      <div class="net-card-h">${esc(SECTIONS[k].label)}</div>
      <div class="net-inputs">
        <input type="number" min="0" id="dogru_${k}" value="${escAttr(draft.d || "")}" placeholder="D" title="Doğru">
        <input type="number" min="0" id="yanlis_${k}" value="${escAttr(draft.y || "")}" placeholder="Y" title="Yanlış">
      </div>
      <div class="net-val" id="netv_${k}">0.00 net</div>
    </div>`;
    })
    .join("");
}

/* ---------- Form scaffolding ---------- */
export function buildTrialForm() {
  renderNetInputs();
  // Wrong topics are no longer marked by hand; the AI confirmation list
  // (rendered into #topicChecks by photoImport) is the single source.
  generalPhotoImporter.renderConfirmList();

  // Switching the oturum re-renders the net grid to that oturum's lessons.
  // (The photo importer also listens to clear staged photos / wrong numbers.)
  const booklet = $("photoBooklet");
  if (booklet && !booklet.dataset.netBound) {
    booklet.addEventListener("change", () => {
      renderNetInputs();
      recalcNet();
    });
    booklet.dataset.netBound = "1";
  }

  // Net entry is optional: the photo step is available immediately so users
  // can pick the oturum (AGS / ÖABT or GY / GK) and upload right away.
  const stepEl = (n) => document.querySelector(`#page-deneme .step[data-step="${n}"]`);
  stepFlow = createStepFlow([
    { el: stepEl(1) },
    { el: stepEl(2), gate: () => generalPhotoImporter.hasMatches() },
    { el: stepEl(3), gate: () => generalPhotoImporter.hasMatches() },
    { el: stepEl(4) }
  ]);
  generalPhotoImporter.setOnChange(updateSteps);
  recalcNet();
  updateSteps();
}

export function recalcNet() {
  // Sync the currently visible inputs into the draft, then total every
  // section that has been entered (across both oturum selections).
  bookletSections().forEach((k) => {
    const dEl = $("dogru_" + k);
    const yEl = $("yanlis_" + k);
    if (!dEl || !yEl) return;
    netDraft[k] = { d: dEl.value, y: yEl.value };
    const nv = $("netv_" + k);
    if (nv) nv.textContent = netFromCounts(parseFloat(dEl.value) || 0, parseFloat(yEl.value) || 0).toFixed(2) + " net";
  });
  let total = 0;
  SECTION_KEYS.forEach((k) => {
    const dr = netDraft[k];
    if (dr) total += netFromCounts(parseFloat(dr.d) || 0, parseFloat(dr.y) || 0);
  });
  $("netTotal").textContent = "Toplam: " + total.toFixed(2) + " net";
  updateSteps();
}

function getCheckedTrialTopics() {
  // Multiple wrong questions can map to the same topic; collapse to one
  // entry per section|topic (wrongTopicTags stores one reason per topic).
  const seen = new Set();
  const list = [];
  document.querySelectorAll("#topicChecks input:checked").forEach((cb) => {
    const id = cb.dataset.section + "|" + cb.value;
    if (seen.has(id)) return;
    seen.add(id);
    list.push({ section: cb.dataset.section, topic: cb.value, id });
  });
  return list;
}

export function updateTrialTagDraftHint() {
  const el = $("trialTagDraftHint");
  if (!el) return;
  if (!trialTopicTagsDraft) {
    el.textContent = "";
    return;
  }
  const n = listTrialWrongEntries({ wrongTopicTags: trialTopicTagsDraft }).length;
  el.textContent = n ? `${n} konu etiketlendi (kayda dahil)` : "";
}

export function tagTrialTopicsEarly() {
  const checked = getCheckedTrialTopics();
  if (!checked.length) return toast("Önce yanlış konuları işaretle.", true);
  const items = checked.map((c) => ({ id: c.id, label: c.topic, sublabel: SECTIONS[c.section].label }));
  TagGame.open(items, (results) => {
    trialTopicTagsDraft = tagsToWrongTopicTags(results);
    updateTrialTagDraftHint();
    toast("Konu sebepleri hazır — denemeyi kaydet.");
  });
}

function runTagGameForTrial(checkedTopics, onComplete) {
  if (!checkedTopics.length) {
    onComplete({});
    return;
  }
  const items = checkedTopics.map((c) => ({ id: c.id, label: c.topic, sublabel: SECTIONS[c.section].label }));
  TagGame.open(items, (results) => onComplete(tagsToWrongTopicTags(results)));
}

async function finishTrialSave(payload) {
  const t = { id: uid(), ...payload };
  await persist(async () => {
    await Store.put("trials", t);
    DB.trials.push(t);
  });
  $("trialDuration").value = "";
  $("trialNotes").value = "";
  netDraft = {};
  renderNetInputs();
  generalPhotoImporter.clearResults();
  trialTopicTagsDraft = null;
  updateTrialTagDraftHint();
  recalcNet();
  renderTrials();
  if (isActive("analiz")) renderAnalytics();
  toast("Deneme kaydedildi.");
}

export function addTrial() {
  const date = $("trialDate").value;
  if (!date) return toast("Tarih seçin.", true);
  const duration = parseInt($("trialDuration").value, 10) || 0;
  const nets = {};
  const counts = {};
  SECTION_KEYS.forEach((k) => {
    const dr = netDraft[k] || {};
    const d = parseFloat(dr.d) || 0;
    const y = parseFloat(dr.y) || 0;
    nets[k] = netFromCounts(d, y);
    counts[k] = { d, y };
  });
  const notes = $("trialNotes").value.trim();
  const checked = getCheckedTrialTopics();
  const base = { date, duration, nets, counts, notes };

  const saveWithTags = (wrongTopicTags) => finishTrialSave({ ...base, wrongTopicTags });

  if (trialTopicTagsDraft && checked.length) {
    const missing = checked.filter(
      (c) => !(trialTopicTagsDraft[c.section] && c.topic in trialTopicTagsDraft[c.section])
    );
    const buildMerged = (extra) => {
      const merged = {};
      checked.forEach((c) => {
        if (!merged[c.section]) merged[c.section] = {};
        const fromDraft = trialTopicTagsDraft[c.section] && trialTopicTagsDraft[c.section][c.topic];
        const fromExtra = extra && extra[c.section] && extra[c.section][c.topic];
        merged[c.section][c.topic] = (fromDraft !== undefined ? fromDraft : fromExtra) || "";
      });
      return merged;
    };
    if (!missing.length) {
      saveWithTags(buildMerged());
      return;
    }
    runTagGameForTrial(missing, (extra) => saveWithTags(buildMerged(extra)));
    return;
  }
  if (!checked.length) {
    return toast("En az bir yanlış konu işaretle — kayıtta her konu için sebep ekranı açılır.", true);
  }
  runTagGameForTrial(checked, (tags) => saveWithTags(tags));
}

export async function deleteTrial(id) {
  await persist(() => Store.del("trials", id));
  DB.trials = DB.trials.filter((t) => t.id !== id);
  renderTrials();
  if (isActive("analiz")) renderAnalytics();
  toast("Deneme silindi.");
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

export function renderTrials() {
  const tbl = $("trialTable");
  const trials = [...DB.trials].sort((a, b) => b.date.localeCompare(a.date));
  if (!trials.length) {
    tbl.innerHTML = '<tbody><tr><td><div class="empty">Henüz deneme yok. Yukarıdaki adımları izleyerek ilk denemeni ekle.</div></td></tr></tbody>';
    $("trialSummary").textContent = "";
    return;
  }
  const avg = trials.reduce((a, t) => a + totalNet(t), 0) / trials.length;
  $("trialSummary").textContent = `${trials.length} deneme · ortalama toplam net ${avg.toFixed(2)}`;
  tbl.innerHTML =
    "<thead><tr><th>Tarih</th><th>Süre</th>" +
    SECTION_KEYS.map((k) => `<th>${esc(SECTIONS[k].label)}</th>`).join("") +
    "<th>Toplam</th><th>Yanlış Konu</th><th></th></tr></thead><tbody>" +
    trials
      .map((t) => {
        const wt = countTrialWrongTopics(t);
        const topicHtml = wt ? renderTopicTagPills(getTrialTopicTags(t)) : "—";
        return `<tr>
        <td>${fmtDate(t.date)}${t.notes ? ' <span class="pill" title="' + escAttr(t.notes) + '">not</span>' : ""}</td>
        <td>${t.duration ? t.duration + "dk" : "—"}</td>
        ${SECTION_KEYS.map((k) => `<td>${(t.nets[k] || 0).toFixed(2)}</td>`).join("")}
        <td><strong>${totalNet(t).toFixed(2)}</strong></td>
        <td>${topicHtml}</td>
        <td style="text-align:right"><button class="iconbtn del" data-act="deltrial" data-id="${t.id}" title="Sil">×</button></td>
      </tr>`;
      })
      .join("") +
    "</tbody>";
}
