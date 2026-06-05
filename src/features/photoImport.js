/* ============================================================
   FEATURE — Fotoğraftan yanlış konu çıkarma (AI).

   The user photographs a deneme page, types which question
   numbers they got wrong, and a single batched vision call
   (Gemini, server-side) maps each wrong question to a
   {section, topic} from the active profile's taxonomy.

   The result is shown for confirmation, then it just *ticks*
   the existing "Yanlış Konular" checkboxes (#topicChecks) so
   the normal trial-save flow (TagGame → wrongTopicTags) runs
   unchanged. No new storage shape, no new save path.
   ============================================================ */
import { SECTIONS, SECTION_KEYS } from "../config.js";
import { $, esc, escAttr, toast, parseWrongNums } from "../utils.js";

// Downscale target — vision cost scales with image size, so keep it small.
const MAX_DIM = 1200;
const JPEG_QUALITY = 0.6;
const MAX_IMAGES = 6;
const LOW_CONFIDENCE = 0.5;

let selectedFiles = []; // File[]
let lastResults = []; // sanitized classification rows from the server

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

/* ---------------- taxonomy payload ---------------- */

function sectionsPayload() {
  return SECTION_KEYS.map((k) => ({
    key: k,
    label: SECTIONS[k].label,
    topics: SECTIONS[k].topics
  }));
}

/* ---------------- file selection + thumbnails ---------------- */

export function onPhotoFilesPicked(e) {
  const files = Array.from((e.target && e.target.files) || []).filter((f) =>
    /^image\//.test(f.type)
  );
  if (!files.length) return;
  selectedFiles = files.slice(0, MAX_IMAGES);
  renderPhotoThumbs();
  if (files.length > MAX_IMAGES) {
    toast(`En fazla ${MAX_IMAGES} sayfa işlenir; ilk ${MAX_IMAGES} alındı.`, true);
  }
}

function renderPhotoThumbs() {
  const wrap = $("photoThumbs");
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

export async function runPhotoClassify() {
  if (!selectedFiles.length) return toast("Önce deneme sayfasının fotoğrafını yükle.", true);
  const wrong = parseWrongNums($("photoWrong") ? $("photoWrong").value : "");

  const btn = $("photoClassifyBtn");
  const status = $("photoStatus");
  const setBusy = (busy, msg) => {
    if (btn) btn.disabled = busy;
    if (status) status.textContent = msg || "";
  };

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
      body: JSON.stringify({ images, wrong, sections: sectionsPayload() })
    });
    const text = await res.text();
    payload = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(payload && payload.error ? payload.error : `Sunucu hatası (${res.status})`);
  } catch (e) {
    setBusy(false, "");
    return toast(e && e.message ? e.message : "AI çağrısı başarısız.", true);
  }

  lastResults = Array.isArray(payload.results) ? payload.results : [];
  setBusy(false, lastResults.length ? "" : "Sonuç bulunamadı.");
  renderPhotoResults();
  if (!lastResults.length) {
    toast("Konu bulunamadı — soruları el ile işaretleyebilirsin.", true);
  } else {
    toast(`${lastResults.length} konu önerisi hazır — kontrol edip işaretle.`);
  }
}

/* ---------------- review UI ---------------- */

function renderPhotoResults() {
  const box = $("photoResults");
  if (!box) return;
  if (!lastResults.length) {
    box.innerHTML = "";
    return;
  }
  const rows = lastResults
    .map((r, i) => {
      const low = r.confidence < LOW_CONFIDENCE;
      const pct = Math.round((r.confidence || 0) * 100);
      const qLabel = r.questionNo ? `Soru ${esc(String(r.questionNo))}` : "Soru ?";
      return `<label class="photo-res-row${low ? " low" : ""}">
        <input type="checkbox" data-photo-res="${i}" ${low ? "" : "checked"} />
        <span class="photo-res-q">${qLabel}</span>
        <span class="photo-res-arrow">→</span>
        <span class="pill">${esc(r.sectionLabel)}</span>
        <span class="pill topic">${esc(r.topic)}</span>
        <span class="photo-res-conf" title="Güven">%${pct}${low ? " · düşük" : ""}</span>
      </label>`;
    })
    .join("");
  box.innerHTML =
    `<div class="sub">AI önerileri — işaretliler aşağıdaki "Yanlış Konular" listesine eklenecek. Düşük güvenli olanları kontrol et.</div>` +
    rows +
    `<div class="btn-row" style="margin-top:10px">
      <button type="button" class="btn sm" data-action="applyPhotoResults">Seçili konuları işaretle</button>
      <button type="button" class="btn ghost sm" data-action="clearPhotoResults">Temizle</button>
    </div>`;
}

/** Tick the matching checkboxes in #topicChecks for the accepted suggestions. */
export function applyPhotoResults() {
  const box = $("photoResults");
  if (!box) return;
  const accepted = new Set();
  box.querySelectorAll("input[data-photo-res]:checked").forEach((cb) => {
    accepted.add(parseInt(cb.dataset.photoRes, 10));
  });
  if (!accepted.size) return toast("İşaretlenecek konu seç.", true);

  let ticked = 0;
  const missing = [];
  accepted.forEach((i) => {
    const r = lastResults[i];
    if (!r) return;
    const sel = `#topicChecks input[data-section="${CSS.escape(r.section)}"][value="${CSS.escape(r.topic)}"]`;
    const cb = document.querySelector(sel);
    if (cb) {
      if (!cb.checked) {
        cb.checked = true;
        const label = cb.closest(".chk");
        if (label) label.classList.add("checked");
        ticked++;
      }
    } else {
      missing.push(`${r.sectionLabel} · ${r.topic}`);
    }
  });

  const checksEl = $("topicChecks");
  if (checksEl) checksEl.scrollIntoView({ behavior: "smooth", block: "center" });
  if (ticked) toast(`${ticked} konu işaretlendi — sebepleri etiketleyip kaydet.`);
  else toast("Konular zaten işaretliydi.", false);
  if (missing.length) {
    toast(`Bu profilde bulunmayan konu(lar): ${missing.join(", ")}`, true);
  }
}

export function clearPhotoResults() {
  lastResults = [];
  selectedFiles = [];
  const f = $("photoFile");
  if (f) f.value = "";
  renderPhotoThumbs();
  renderPhotoResults();
  const status = $("photoStatus");
  if (status) status.textContent = "";
}
