/* ============================================================
   FEATURE — Fotoğraftan yanlış konu çıkarma (AI).

   The user photographs a deneme page, types which question
   numbers they got wrong, and a single batched vision call
   (Gemini, server-side) maps each wrong question to a
   {section, topic} from the active profile's taxonomy.

   Each AI run appends its {questionNo, section, topic} matches to a
   confirmation list. The user reviews them (keep / uncheck),
   accumulating across booklets, and the normal trial-save flow
   (TagGame → wrongTopicTags) reads the checked rows. There is no
   separate manual topic grid anymore.

   This module is generic: `createPhotoImporter(config)` builds an
   isolated importer bound to a set of DOM ids and a taxonomy
   provider. The Denemeler page uses it booklet-scoped (the booklet
   picks which sections' taxonomy is sent to the AI).
   ============================================================ */
import { SECTIONS, SECTION_KEYS, BOOKLETS } from "../config.js";
import { $, esc, escAttr, toast, parseWrongNums } from "../utils.js";

// Downscale target — vision cost scales with image size, so keep it small.
const MAX_DIM = 1200;
const JPEG_QUALITY = 0.6;
const MAX_IMAGES = 15;
const LOW_CONFIDENCE = 0.5;

/* ---------------- image compression (client-side) ---------------- */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Görsel okunamadı"));
    };
    img.src = url;
  });
}

/** Resize+grayscale to JPEG base64 (no data: prefix) to minimise upload/cost. */
async function compressToBase64(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { mime: "image/jpeg", data: dataUrl.split(",")[1] || "" };
}

/* ============================================================
   Importer factory — one isolated instance per form.
   config = {
     ids: { drop, file, cam, wrong, thumbs, classifyBtn, status,
            topicChecks, confirmHint, booklet?, bookletField? },
     useBooklet: boolean,
     sectionsPayload: () => [{ key, label, topics }]   // taxonomy sent to AI
   }
   ============================================================ */
export function createPhotoImporter(config) {
  const ids = config.ids;
  const useBooklet = !!config.useBooklet;
  let selectedFiles = []; // File[] staged for the current classify run
  let confirmed = []; // accumulated AI matches awaiting confirmation
  let onChange = typeof config.onChange === "function" ? config.onChange : null;

  const el = (key) => (ids[key] ? $(ids[key]) : null);
  const notify = () => {
    if (onChange) onChange();
  };

  /* ---------------- booklet scoping ---------------- */

  function selectedBookletLabel() {
    if (!useBooklet) return "";
    const sel = el("booklet");
    const b = BOOKLETS.find((x) => x.key === (sel && sel.value));
    return BOOKLETS.length > 1 && b ? b.label : "";
  }

  /** Populate the booklet picker; hide it entirely when there's only one. */
  function setupBooklets() {
    if (!useBooklet) return;
    const sel = el("booklet");
    const field = el("bookletField");
    if (!sel) return;
    sel.innerHTML = BOOKLETS.map(
      (b) => `<option value="${escAttr(b.key)}">${esc(b.label)}</option>`
    ).join("");
    if (field) field.classList.toggle("hidden", BOOKLETS.length < 2);
  }

  /* ---------------- file selection + thumbnails ---------------- */

  /** Merge newly chosen/dropped files into the selection (dedup, cap). */
  function addFiles(fileList) {
    const incoming = Array.from(fileList || []).filter((f) => /^image\//.test(f.type));
    if (!incoming.length) {
      toast("Sadece görsel dosyaları eklenebilir.", true);
      return;
    }
    const seen = new Set(selectedFiles.map((f) => `${f.name}:${f.size}`));
    const merged = selectedFiles.slice();
    for (const f of incoming) {
      const key = `${f.name}:${f.size}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(f);
    }
    const overflow = merged.length > MAX_IMAGES;
    selectedFiles = merged.slice(0, MAX_IMAGES);
    renderThumbs();
    if (overflow) {
      toast(`En fazla ${MAX_IMAGES} sayfa işlenir; ilk ${MAX_IMAGES} alındı.`, true);
    }
  }

  /** <input type="file"> change handler (gallery picker and camera both route here). */
  function onFilesPicked(e) {
    addFiles(e.target && e.target.files);
    // Reset so picking the same file again still fires a change event.
    if (e.target) e.target.value = "";
  }

  /** Open the camera-capture input (phones show the rear camera). */
  function openCamera() {
    const cam = el("cam");
    if (cam) cam.click();
  }

  /** Wire the drop zone: click opens the file picker, drag-and-drop adds images. */
  function setupDropZone() {
    const zone = el("drop");
    const fileInput = el("file");
    if (!zone || !fileInput) return;

    zone.addEventListener("click", (e) => {
      // Let the inner camera button handle its own click.
      if (e.target.closest("button")) return;
      fileInput.click();
    });
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

    const stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    ["dragenter", "dragover"].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        stop(e);
        zone.classList.add("dragover");
      })
    );
    ["dragleave", "dragend"].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        stop(e);
        zone.classList.remove("dragover");
      })
    );
    zone.addEventListener("drop", (e) => {
      stop(e);
      zone.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });
  }

  function renderThumbs() {
    const wrap = el("thumbs");
    if (!wrap) return;
    if (!selectedFiles.length) {
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML = selectedFiles
      .map((f) => {
        const url = URL.createObjectURL(f);
        return `<img class="photo-thumb" src="${url}" alt="${escAttr(f.name)}" title="${escAttr(f.name)}" />`;
      })
      .join("");
  }

  /* ---------------- classify ---------------- */

  async function runClassify() {
    if (!selectedFiles.length) return toast("Önce deneme sayfasının fotoğrafını yükle.", true);
    const wrongEl = el("wrong");
    const wrong = parseWrongNums(wrongEl ? wrongEl.value : "");

    const btn = el("classifyBtn");
    const status = el("status");
    const setBusy = (busy, msg) => {
      if (btn) btn.disabled = busy;
      if (status) status.textContent = msg || "";
    };

    const sections = config.sectionsPayload();
    if (!sections.length) {
      return toast("Önce ders seç.", true);
    }

    setBusy(true, "Görseller hazırlanıyor…");
    let images;
    try {
      images = await Promise.all(selectedFiles.map(compressToBase64));
    } catch (e) {
      setBusy(false, "");
      return toast("Görsel işlenemedi.", true);
    }

    setBusy(true, "AI konuları buluyor…");
    let payload;
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, wrong, sections })
      });
      const text = await res.text();
      payload = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(payload && payload.error ? payload.error : `Sunucu hatası (${res.status})`);
    } catch (e) {
      setBusy(false, "");
      return toast(e && e.message ? e.message : "AI çağrısı başarısız.", true);
    }

    const results = Array.isArray(payload.results) ? payload.results : [];
    const added = mergeConfirmed(results);
    setBusy(false, results.length ? "" : "Sonuç bulunamadı.");
    renderConfirmList();
    resetStaged(); // ready for the next booklet's pages
    const checksEl = el("topicChecks");
    if (checksEl && added) checksEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (!results.length) {
      toast("Konu bulunamadı — fotoğrafı netleştirip tekrar dene.", true);
    } else if (!added) {
      toast("Bu eşleşmeler zaten onay listesinde.", false);
    } else {
      toast(`${added} yeni eşleşme onaya eklendi — kontrol et.`);
    }
  }

  /* ---------------- confirmation list ---------------- */

  /** Append new AI rows to the accumulated confirm list (dedupe identical rows). */
  function mergeConfirmed(results) {
    const bookletLabel = selectedBookletLabel();
    let added = 0;
    for (const r of results) {
      if (!r || !r.section || !r.topic) continue;
      const qno = Number.isFinite(r.questionNo) ? r.questionNo : null;
      const key = `${r.section}|${r.topic}|${qno == null ? "" : qno}`;
      if (confirmed.some((c) => c.key === key)) continue;
      const confidence = typeof r.confidence === "number" ? r.confidence : 0.5;
      confirmed.push({
        key,
        qno,
        bookletLabel,
        section: r.section,
        sectionLabel: r.sectionLabel || r.section,
        topic: r.topic,
        confidence,
        checked: confidence >= LOW_CONFIDENCE
      });
      added++;
    }
    confirmed.sort((a, b) => {
      if (a.bookletLabel !== b.bookletLabel) return a.bookletLabel < b.bookletLabel ? -1 : 1;
      return (a.qno || 0) - (b.qno || 0);
    });
    return added;
  }

  /** Render the accumulated matches into the topic-checks box as confirmable rows. */
  function renderConfirmList() {
    const box = el("topicChecks");
    if (!box) return;
    if (!confirmed.length) {
      box.innerHTML = `<div class="sub tc-empty">Henüz eşleşme yok — yukarıdan fotoğraf yükleyip "Konuları bul (AI)" de.</div>`;
      updateConfirmHint();
      return;
    }
    box.innerHTML = confirmed
      .map((c) => {
        const low = c.confidence < LOW_CONFIDENCE;
        const pct = Math.round((c.confidence || 0) * 100);
        const q = c.qno ? `Soru ${esc(String(c.qno))}` : "Soru ?";
        const bk = c.bookletLabel ? `<span class="tc-booklet">${esc(c.bookletLabel)}</span>` : "";
        return `<label class="chk tc-row${c.checked ? " checked" : ""}${low ? " low" : ""}">
          <input type="checkbox" data-section="${escAttr(c.section)}" value="${escAttr(c.topic)}" ${c.checked ? "checked" : ""} />
          <span class="tc-q">${q}</span>
          ${bk}
          <span class="tc-sec">${esc(c.sectionLabel)}</span>
          <span class="tc-arrow">→</span>
          <span class="tc-topic">${esc(c.topic)}</span>
          <span class="tc-conf" title="Güven">%${pct}${low ? " · düşük" : ""}</span>
        </label>`;
      })
      .join("");
    updateConfirmHint();
  }

  /** Sync internal checked state from the DOM and refresh the count hint. */
  function updateConfirmHint() {
    const box = el("topicChecks");
    if (box) {
      const cbs = box.querySelectorAll("input[type=checkbox]");
      cbs.forEach((cb, i) => {
        if (confirmed[i]) confirmed[i].checked = cb.checked;
      });
    }
    const hint = el("confirmHint");
    if (hint) {
      const n = confirmed.filter((c) => c.checked).length;
      hint.textContent = confirmed.length ? `${n}/${confirmed.length} konu işaretli` : "";
    }
    // Match/confirmation state changed — let the step flow re-evaluate.
    notify();
  }

  /** Clear only the staged photos/inputs for the current run (keeps confirmed list). */
  function resetStaged() {
    selectedFiles = [];
    const f = el("file");
    if (f) f.value = "";
    const cam = el("cam");
    if (cam) cam.value = "";
    renderThumbs();
    const status = el("status");
    if (status) status.textContent = "";
  }

  /** Full reset: drop the confirmation list and staged photos. */
  function clearResults() {
    confirmed = [];
    resetStaged();
    renderConfirmList();
  }

  /** Wire all DOM events this importer owns (idempotent enough for one init). */
  function init() {
    const fileInput = el("file");
    if (fileInput) fileInput.addEventListener("change", onFilesPicked);
    const cam = el("cam");
    if (cam) cam.addEventListener("change", onFilesPicked);
    if (useBooklet) {
      const booklet = el("booklet");
      if (booklet)
        booklet.addEventListener("change", () => {
          // Each booklet restarts numbering at 1, so the staged photos +
          // wrong numbers are invalid; already-confirmed matches stay.
          resetStaged();
          const w = el("wrong");
          if (w) w.value = "";
        });
    }
    const box = el("topicChecks");
    if (box)
      box.addEventListener("change", (e) => {
        if (!e.target.matches('input[type="checkbox"]')) return;
        const label = e.target.closest(".chk");
        if (label) label.classList.toggle("checked", e.target.checked);
        updateConfirmHint();
      });
    setupBooklets();
    setupDropZone();
    renderConfirmList();
  }

  /** Whether the AI confirmation list currently holds any matches. */
  function hasMatches() {
    return confirmed.length > 0;
  }

  /** Register a callback fired whenever the confirmation state changes. */
  function setOnChange(fn) {
    onChange = typeof fn === "function" ? fn : null;
  }

  return {
    init,
    runClassify,
    clearResults,
    openCamera,
    resetStaged,
    renderConfirmList,
    updateConfirmHint,
    hasMatches,
    setOnChange
  };
}

/* ============================================================
   Singletons — one per form.
   ============================================================ */

/** Genel Denemeler: AI is scoped to the selected booklet's sections. */
export const generalPhotoImporter = createPhotoImporter({
  useBooklet: true,
  ids: {
    drop: "photoDrop",
    file: "photoFile",
    cam: "photoCam",
    wrong: "photoWrong",
    thumbs: "photoThumbs",
    classifyBtn: "photoClassifyBtn",
    status: "photoStatus",
    booklet: "photoBooklet",
    bookletField: "photoBookletField",
    topicChecks: "topicChecks",
    confirmHint: "photoConfirmHint"
  },
  sectionsPayload() {
    const sel = $("photoBooklet");
    const chosen = sel && sel.value;
    const booklet = BOOKLETS.find((b) => b.key === chosen) || BOOKLETS[0];
    const keys = ((booklet && booklet.sections) || SECTION_KEYS).filter((k) => SECTIONS[k]);
    return keys.map((k) => ({ key: k, label: SECTIONS[k].label, topics: SECTIONS[k].topics }));
  }
});
