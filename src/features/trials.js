/* ============================================================
   FEATURE — Genel Denemeler (full mock exams + net calculator).
   ============================================================ */
import { SECTIONS, SECTION_KEYS } from "../config.js";
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

// Draft of topic→reason tags created before the trial is saved.
let trialTopicTagsDraft = null;

/* ---------- Form scaffolding ---------- */
export function buildTrialForm() {
  $("netInputs").innerHTML = SECTION_KEYS.map(
    (k) =>
      `<div class="net-card">
      <div class="net-card-h">${esc(SECTIONS[k].label)}</div>
      <div class="net-inputs">
        <input type="number" min="0" id="dogru_${k}" placeholder="D" title="Doğru">
        <input type="number" min="0" id="yanlis_${k}" placeholder="Y" title="Yanlış">
      </div>
      <div class="net-val" id="netv_${k}">0.00 net</div>
    </div>`
  ).join("");
  // Wrong topics are no longer marked by hand; the AI confirmation list
  // (rendered into #topicChecks by photoImport) is the single source.
  generalPhotoImporter.renderConfirmList();
  recalcNet();
}

export function recalcNet() {
  let total = 0;
  SECTION_KEYS.forEach((k) => {
    const d = parseFloat($("dogru_" + k).value) || 0;
    const y = parseFloat($("yanlis_" + k).value) || 0;
    const net = netFromCounts(d, y);
    $("netv_" + k).textContent = net.toFixed(2) + " net";
    total += net;
  });
  $("netTotal").textContent = "Toplam: " + total.toFixed(2) + " net";
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
  SECTION_KEYS.forEach((k) => {
    $("dogru_" + k).value = "";
    $("yanlis_" + k).value = "";
  });
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
    const d = parseFloat($("dogru_" + k).value) || 0;
    const y = parseFloat($("yanlis_" + k).value) || 0;
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
    tbl.innerHTML = '<tbody><tr><td><div class="empty">Henüz deneme yok.</div></td></tr></tbody>';
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
