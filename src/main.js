/* ============================================================
   KPSS Çalışma Paneli — application bootstrap.
   ============================================================ */
import "./styles.css";
import { APP_BUILD, PAGES, setActiveProfile } from "./config.js";
import { Store } from "./store.js";
import { hydrate, DB } from "./state.js";
import { runAuthGate } from "./auth.js";
import { $, toast, todayStr } from "./utils.js";
import { applyTheme } from "./theme.js";
import { nav, registerPageRenderer } from "./nav.js";
import { initTagGame } from "./tagGame.js";
import { fillLessonSelect } from "./features/books.js";
import { buildTrialForm, updateTrialTagDraftHint } from "./features/trials.js";
import { fillSubjectTrialSection } from "./features/subjectTrials.js";
import { fillRevLessonSelect, renderReviews, maybeNotifyDueReviews } from "./features/reviews.js";
import { renderAnalytics } from "./features/analytics.js";
import { updateSessWrongHint } from "./features/books.js";
import { refreshAll } from "./refresh.js";
import { setupEventListeners } from "./actions.js";

function setupAccountBar(account, profile) {
  const whoTop = $("activeUserTop");
  if (whoTop) whoTop.textContent = account.name;
  const whoSide = $("activeUserSide");
  if (whoSide) whoSide.textContent = account.name;
  const mail = $("activeUserMail");
  if (mail) mail.textContent = account.email || "";
  const exam = $("activeExam");
  if (exam) exam.textContent = profile.examName;
}

async function init() {
  const account = await runAuthGate();
  const profile = setActiveProfile(account.profileId);
  Store.setUser(account.id);
  setupAccountBar(account, profile);
  document.title = `${account.name} · KPSS Paneli`;

  setupEventListeners();
  registerPageRenderer("analiz", renderAnalytics);
  registerPageRenderer("tekrar", renderReviews);
  initTagGame();

  try {
    await Store.open();
  } catch (e) {
    toast(e && e.message ? e.message : "Veri sunucusuna ulaşılamadı.", true);
    console.error(e);
    return;
  }
  try {
    await hydrate();
  } catch (e) {
    toast("Veriler yüklenemedi.", true);
    console.error(e);
    return;
  }

  applyTheme(DB.settings.theme);
  const buildEl = $("buildTag");
  if (buildEl) buildEl.textContent = "Sürüm: " + APP_BUILD;
  console.info("[KPSS Panel]", APP_BUILD, location.href);

  fillLessonSelect();
  buildTrialForm();
  fillSubjectTrialSection();
  fillRevLessonSelect();
  updateTrialTagDraftHint();
  updateSessWrongHint();

  const today = todayStr();
  const sessDate = $("sessDate");
  const trialDate = $("trialDate");
  const subjTrialDate = $("subjTrialDate");
  if (sessDate) sessDate.value = today;
  if (trialDate) trialDate.value = today;
  if (subjTrialDate) subjTrialDate.value = today;

  const tagOv = $("tagOverlay");
  if (tagOv && tagOv.parentElement !== document.body) document.body.appendChild(tagOv);

  refreshAll();
  const start = location.hash.replace("#", "");
  nav(PAGES.includes(start) ? start : "konu");

  maybeNotifyDueReviews();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
