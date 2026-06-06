/* ============================================================
   Event wiring — replaces all the old inline on* attributes with
   delegated listeners. Two namespaces:
     • data-page   → navigation buttons
     • data-act    → dynamically generated row buttons
     • data-action → static control buttons
   ============================================================ */
import { $ } from "./utils.js";
import { nav, toggleSidebar } from "./nav.js";
import { toggleTheme, setTheme } from "./theme.js";
import {
  addBook,
  deleteBook,
  addSession,
  saveSessionPerfect,
  deleteSession,
  updateSessWrongHint,
  fillSessTopics
} from "./features/books.js";
import { addTrial, deleteTrial, tagTrialTopicsEarly, recalcNet } from "./features/trials.js";
import { switchAnalyticsTab } from "./features/analytics.js";
import { generalPhotoImporter, subjectPhotoImporter } from "./features/photoImport.js";
import {
  addSubjectTrial,
  deleteSubjectTrial,
  recalcSubjectNet,
  onSubjSectionChange
} from "./features/subjectTrials.js";
import {
  addReviewManual,
  addReviewQuick,
  reviewDone,
  removeReview,
  fillRevTopics
} from "./features/reviews.js";
import {
  saveExamDate,
  saveTarget,
  saveDailyGoals,
  toggleNotifyReviews,
  exportData,
  importData,
  clearAll,
  dismissOnboarding,
  showOnboarding
} from "./features/settings.js";
import { TagGame } from "./tagGame.js";
import { Auth } from "./auth.js";

async function doLogout() {
  try {
    await Auth.logout();
  } catch (_) {
    /* clear session client-side regardless */
  }
  location.reload();
}

// Static control buttons: data-action -> handler.
const ACTIONS = {
  toggleSidebar: () => toggleSidebar(),
  logout: () => doLogout(),
  toggleTheme: () => toggleTheme(),
  setTheme: (el) => setTheme(el.dataset.theme),
  addBook: () => addBook(),
  addSession: () => addSession(),
  saveSessionPerfect: () => saveSessionPerfect(),
  tagTrialTopicsEarly: () => tagTrialTopicsEarly(),
  addTrial: () => addTrial(),
  photoCamera: () => generalPhotoImporter.openCamera(),
  runPhotoClassify: () => generalPhotoImporter.runClassify(),
  clearPhotoResults: () => generalPhotoImporter.clearResults(),
  subjPhotoCamera: () => subjectPhotoImporter.openCamera(),
  runSubjPhotoClassify: () => subjectPhotoImporter.runClassify(),
  clearSubjPhotoResults: () => subjectPhotoImporter.clearResults(),
  addSubjectTrial: () => addSubjectTrial(),
  addReviewManual: () => addReviewManual(),
  saveExamDate: () => saveExamDate(),
  saveTarget: () => saveTarget(),
  saveDailyGoals: () => saveDailyGoals(),
  toggleNotifyReviews: () => toggleNotifyReviews(),
  exportData: () => exportData(),
  dismissOnboarding: () => dismissOnboarding(),
  showOnboarding: () => showOnboarding(),
  importTrigger: () => $("importFile") && $("importFile").click(),
  clearAll: () => clearAll(),
  tagCancel: () => TagGame.cancel(),
  tagSkip: () => TagGame.skip(),
  anlTab: (el) => switchAnalyticsTab(el.dataset.tab)
};

// Dynamic row buttons: data-act -> handler reading data attributes.
const ROW_ACTIONS = {
  delbook: (el) => deleteBook(el.dataset.id),
  delsess: (el) => deleteSession(el.dataset.id),
  deltrial: (el) => deleteTrial(el.dataset.id),
  delsubjtrial: (el) => deleteSubjectTrial(el.dataset.id),
  addrev: (el) => addReviewQuick(el.dataset.lesson, el.dataset.topic),
  revdone: (el) => reviewDone(el.dataset.id),
  revdel: (el) => removeReview(el.dataset.id)
};

export function setupEventListeners() {
  document.addEventListener("click", (e) => {
    const navBtn = e.target.closest("[data-page]");
    if (navBtn) {
      nav(navBtn.dataset.page);
      return;
    }
    const actEl = e.target.closest("[data-action]");
    if (actEl && ACTIONS[actEl.dataset.action]) {
      ACTIONS[actEl.dataset.action](actEl);
      return;
    }
    const rowEl = e.target.closest("[data-act]");
    if (rowEl && ROW_ACTIONS[rowEl.dataset.act]) {
      ROW_ACTIONS[rowEl.dataset.act](rowEl);
    }
  });

  const on = (id, ev, fn) => {
    const el = $(id);
    if (el) el.addEventListener(ev, fn);
  };
  on("sessBook", "change", fillSessTopics);
  on("sessWrong", "input", updateSessWrongHint);
  on("revLesson", "change", fillRevTopics);
  on("importFile", "change", (e) => importData(e));

  // Photo→topic AI importers own their own DOM wiring (file inputs, drop
  // zone, booklet picker, confirm-list toggles).
  generalPhotoImporter.init();
  subjectPhotoImporter.init();

  // Genel deneme net inputs.
  const netInputs = $("netInputs");
  if (netInputs) netInputs.addEventListener("input", recalcNet);

  // Alan deneme (subject trial) inputs. Switching ders re-scopes the AI, so
  // the existing confirm matches are cleared.
  on("subjDogru", "input", recalcSubjectNet);
  on("subjYanlis", "input", recalcSubjectNet);
  on("subjTrialSection", "change", onSubjSectionChange);

  window.addEventListener("hashchange", () => nav(location.hash.replace("#", "")));
}
