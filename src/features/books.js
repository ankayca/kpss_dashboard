/* ============================================================
   FEATURE — Konu Testleri (books + per-topic wrong sessions).
   ============================================================ */
import { SECTIONS, SECTION_KEYS, WRONG_PENALTY } from "../config.js";
import { Store } from "../store.js";
import { DB, persist } from "../state.js";
import { $, esc, escAttr, toast, uid, parseWrongNums, fmtDate, reasonIcon } from "../utils.js";
import { lessonLabel, getSessionWrongList, getSessionWrongTags } from "../domain.js";
import { TagGame } from "../tagGame.js";
import { isActive } from "../nav.js";
import { renderAnalytics } from "./analytics.js";

/* ---------- Selects ---------- */
export function fillLessonSelect() {
  $("bookLesson").innerHTML =
    '<option value="">— ders seç —</option>' +
    SECTION_KEYS.map((k) => `<option value="${k}">${esc(SECTIONS[k].label)}</option>`).join("");
}
export function fillSessBooks() {
  const sel = $("sessBook");
  const cur = sel.value;
  sel.innerHTML =
    '<option value="">— seç —</option>' +
    DB.books
      .map((b) => `<option value="${b.id}">${esc(b.name)} · ${esc(lessonLabel(b.lesson))}</option>`)
      .join("");
  if (cur && DB.books.some((b) => b.id === cur)) sel.value = cur;
  fillSessTopics();
}
export function fillSessTopics() {
  const book = DB.books.find((b) => b.id === $("sessBook").value);
  const sel = $("sessTopic");
  if (!book || !SECTIONS[book.lesson]) {
    sel.innerHTML = '<option value="">— önce kitap seç —</option>';
    return;
  }
  sel.innerHTML =
    '<option value="">— konu seç —</option>' +
    SECTIONS[book.lesson].topics
      .map((t) => `<option value="${escAttr(t)}">${esc(t)}</option>`)
      .join("");
}

/* ---------- Books ---------- */
export async function addBook() {
  const name = $("bookName").value.trim();
  const lesson = $("bookLesson").value;
  if (!name) return toast("Kitap adı girin.", true);
  if (!SECTIONS[lesson]) return toast("Ders seçin.", true);
  const b = { id: uid(), name, lesson };
  await persist(async () => {
    await Store.put("books", b);
    DB.books.push(b);
  });
  $("bookName").value = "";
  renderBooks();
  toast("Kitap eklendi.");
}
export async function deleteBook(id) {
  const b = DB.books.find((x) => x.id === id);
  if (!b || !confirm(`"${b.name}" ve bu kitaba ait tüm yanlış kayıtları silinsin mi?`)) return;
  const removedBooks = DB.books;
  const toRemove = DB.sessions.filter((s) => s.bookId === id);
  await persist(async () => {
    await Store.del("books", id);
    for (const s of toRemove) await Store.del("sessions", s.id);
  });
  DB.books = removedBooks.filter((x) => x.id !== id);
  DB.sessions = DB.sessions.filter((s) => s.bookId !== id);
  renderBooks();
  renderSessions();
  if (isActive("analiz")) renderAnalytics();
  toast("Kitap silindi.");
}
export function renderBooks() {
  const list = $("bookList");
  if (!DB.books.length) {
    list.innerHTML = '<div class="empty">Henüz kitap eklenmedi.</div>';
  } else {
    list.innerHTML =
      "<table><tbody>" +
      DB.books
        .map(
          (b) =>
            `<tr><td><strong>${esc(b.name)}</strong></td>
      <td><span class="pill topic">${esc(lessonLabel(b.lesson))}</span></td>
      <td style="text-align:right;width:40px"><button class="iconbtn del" data-act="delbook" data-id="${b.id}" title="Sil">×</button></td></tr>`
        )
        .join("") +
      "</tbody></table>";
  }
  fillSessBooks();
}

/* ---------- Wrong-answer sessions ---------- */
export function updateSessWrongHint() {
  const el = $("sessWrongHint");
  if (!el) return;
  const nums = parseWrongNums($("sessWrong").value);
  el.textContent = nums.length
    ? `${nums.length} soru için sebep ekranı açılacak: ${nums.join(", ")}`
    : "Yanlış soru numarası yaz; Kaydet deyince sebep seçimi açılır.";
}

function readSessionForm() {
  const date = $("sessDate").value;
  const bookId = $("sessBook").value;
  const topic = $("sessTopic").value;
  const total = parseInt($("sessTotal").value, 10);
  const durationRaw = parseInt($("sessDuration").value, 10);
  const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 0;
  const wrong = parseWrongNums($("sessWrong").value);
  if (!date) return { err: "Tarih seçin." };
  if (!bookId) return { err: "Kitap seçin." };
  if (!topic) return { err: "Konu seçin." };
  if (!total || total < 1) return { err: "Geçerli toplam soru sayısı girin." };
  const book = DB.books.find((b) => b.id === bookId);
  if (!book) return { err: "Kitap bulunamadı." };
  const overflow = wrong.filter((n) => n > total);
  if (overflow.length) {
    return { err: `Yanlış numarası toplam soru sayısını aşıyor: ${overflow.join(", ")}` };
  }
  return {
    date,
    bookId,
    book,
    topic,
    total,
    wrong,
    base: { date, bookId, bookName: book.name, lesson: book.lesson, topic, total, duration }
  };
}

async function saveSessionRecord(data) {
  const s = { id: uid(), ...data };
  await persist(async () => {
    await Store.put("sessions", s);
    DB.sessions.push(s);
  });
  $("sessWrong").value = "";
  $("sessTotal").value = "";
  $("sessDuration").value = "";
  updateSessWrongHint();
  renderSessions();
  if (isActive("analiz")) renderAnalytics();
  toast("Yanlış kaydı eklendi.");
}

export async function saveSessionPerfect() {
  const f = readSessionForm();
  if (f.err) return toast(f.err, true);
  await saveSessionRecord({ ...f.base, wrong: [], wrongTags: {} });
}

export function addSession() {
  const f = readSessionForm();
  if (f.err) return toast(f.err, true);
  if (!f.wrong.length) {
    return toast(
      "Yanlış soru numarası gir (örn. 3, 7, 12) — ardından sebep ekranı açılır. Tam ise «Tam puan» kullan.",
      true
    );
  }
  const items = f.wrong.map((n) => ({ id: String(n), label: "Soru " + n, sublabel: f.topic }));
  TagGame.open(items, async (tagResults) => {
    const wrongTags = {};
    f.wrong.forEach((n) => {
      wrongTags[String(n)] = tagResults[String(n)] || "";
    });
    await saveSessionRecord({ ...f.base, wrong: f.wrong, wrongTags });
  });
}

export async function deleteSession(id) {
  await persist(() => Store.del("sessions", id));
  DB.sessions = DB.sessions.filter((s) => s.id !== id);
  renderSessions();
  if (isActive("analiz")) renderAnalytics();
  toast("Kayıt silindi.");
}

function renderWrongChips(tags, nums) {
  const keys = nums && nums.length ? nums.map(String) : Object.keys(tags || {});
  return keys
    .map((q) => {
      const r = (tags || {})[String(q)] || "";
      return `<span class="tag-wrong-chip" title="${r ? esc(r) : "Sebep yok"}">
      <span class="tag-num">${esc(q)}</span>${r ? `<span class="tag-reason-mini">${reasonIcon(r)}</span>` : ""}</span>`;
    })
    .join("");
}

export function renderSessions() {
  const t = $("sessTable");
  const sessions = [...DB.sessions].sort((a, b) => b.date.localeCompare(a.date));
  if (!sessions.length) {
    t.innerHTML = '<tbody><tr><td><div class="empty">Henüz yanlış kaydı yok.</div></td></tr></tbody>';
    $("sessSummary").textContent = "";
    return;
  }
  let totalWrong = 0;
  let totalQ = 0;
  sessions.forEach((s) => {
    totalWrong += getSessionWrongList(s).length;
    totalQ += s.total;
  });
  $("sessSummary").textContent = `${sessions.length} kayıt · ${totalWrong} yanlış / ${totalQ} soru · başarı ~%${totalQ ? Math.round((1 - totalWrong / totalQ) * 100) : 0}`;
  t.innerHTML =
    "<thead><tr><th>Tarih</th><th>Kitap</th><th>Ders</th><th>Konu</th><th>Yanlışlar (sebep)</th><th>Net</th><th></th></tr></thead><tbody>" +
    sessions
      .map((s) => {
        const wrongList = getSessionWrongList(s);
        const tags = getSessionWrongTags(s);
        const wrongHtml = wrongList.length
          ? renderWrongChips(tags, wrongList)
          : '<span class="pill ok">tam</span>';
        const net = s.total - wrongList.length - wrongList.length * WRONG_PENALTY;
        return `<tr>
        <td>${fmtDate(s.date)}</td><td>${esc(s.bookName)}</td>
        <td><span class="pill">${esc(lessonLabel(s.lesson))}</span></td>
        <td><span class="pill topic">${esc(s.topic)}</span></td>
        <td>${wrongHtml}</td>
        <td>${net.toFixed(2)} / ${s.total}</td>
        <td style="text-align:right"><button class="iconbtn del" data-act="delsess" data-id="${s.id}" title="Sil">×</button></td>
      </tr>`;
      })
      .join("") +
    "</tbody>";
}
