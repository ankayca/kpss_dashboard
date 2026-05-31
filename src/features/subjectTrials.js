/* ============================================================
   FEATURE — Alan Denemeleri (single-subject mock exams).
   Mirrors the general trial flow (genel denemeler) but scoped to
   one ders: enter D/Y, auto-net, then tag the wrong topics.
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

// Draft of topic→reason tags created before the trial is saved.
let subjTopicTagsDraft = null;

/* ---------- Form scaffolding ---------- */
export function fillSubjectTrialSection() {
  const sel = $("subjTrialSection");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = SECTION_KEYS.map(
    (k) => `<option value="${k}">${esc(SECTIONS[k].label)}</option>`
  ).join("");
  if (cur && SECTIONS[cur]) sel.value = cur;
  buildSubjectTopicChecks();
}

/** Render the topic checkboxes for the currently selected ders. */
export function buildSubjectTopicChecks() {
  const wrap = $("subjTopicChecks");
  if (!wrap) return;
  const k = currentSection();
  if (!k) {
    wrap.innerHTML = "";
    return;
  }
  const chks = SECTIONS[k].topics
    .map(
      (tp) =>
        `<label class="chk"><input type="checkbox" data-section="${k}" value="${escAttr(tp)}"> ${esc(tp)}</label>`
    )
    .join("");
  wrap.innerHTML = `<div class="topic-group"><h4>${esc(SECTIONS[k].label)}</h4><div class="chk-grid">${chks}</div></div>`;
  subjTopicTagsDraft = null;
  updateSubjTagDraftHint();
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
}

/** Keep the visual "checked" state of a topic checkbox label in sync. */
export function syncSubjTopicCheck(checkbox) {
  const label = checkbox.closest(".chk");
  if (label) label.classList.toggle("checked", checkbox.checked);
}

function getCheckedSubjTopics() {
  const list = [];
  document.querySelectorAll("#subjTopicChecks input:checked").forEach((cb) =>
    list.push({ section: cb.dataset.section, topic: cb.value, id: cb.dataset.section + "|" + cb.value })
  );
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

export function tagSubjTopicsEarly() {
  const checked = getCheckedSubjTopics();
  if (!checked.length) return toast("Önce yanlış konuları işaretle.", true);
  const items = checked.map((c) => ({ id: c.id, label: c.topic, sublabel: SECTIONS[c.section].label }));
  TagGame.open(items, (results) => {
    subjTopicTagsDraft = tagsToWrongTopicTags(results);
    updateSubjTagDraftHint();
    toast("Konu sebepleri hazır — denemeyi kaydet.");
  });
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
  document.querySelectorAll("#subjTopicChecks input:checked").forEach((cb) => {
    cb.checked = false;
    cb.closest(".chk").classList.remove("checked");
  });
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
    tbl.innerHTML = '<tbody><tr><td><div class="empty">Henüz alan denemesi yok.</div></td></tr></tbody>';
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
