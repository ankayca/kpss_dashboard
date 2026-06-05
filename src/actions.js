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
import {
  addTrial,
  deleteTrial,
  tagTrialTopicsEarly,
  recalcNet,
  syncTopicCheck
} from "./features/trials.js";
import {
  onPhotoFilesPicked,
  openPhotoCamera,
  setupPhotoDropZone,
  setupPhotoBooklets,
  resetStagedPhotos,
  updatePhotoConfirmHint,
  runPhotoClassify,
  clearPhotoResults
} from "./features/photoImport.js";
import {
  addSubjectTrial,
  deleteSubjectTrial,
  tagSubjTopicsEarly,
  recalcSubjectNet,
  syncSubjTopicCheck,
  buildSubjectTopicChecks
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
  clearAll
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
  photoCamera: () => openPhotoCamera(),
  runPhotoClassify: () => runPhotoClassify(),
  clearPhotoResults: () => clearPhotoResults(),
  tagSubjTopicsEarly: () => tagSubjTopicsEarly(),
  addSubjectTrial: () => addSubjectTrial(),
  addReviewManual: () => addReviewManual(),
  saveExamDate: () => saveExamDate(),
  saveTarget: () => saveTarget(),
  saveDailyGoals: () => saveDailyGoals(),
  toggleNotifyReviews: () => toggleNotifyReviews(),
  exportData: () => exportData(),
  importTrigger: () => $("importFile") && $("importFile").click(),
  clearAll: () => clearAll(),
  tagCancel: () => TagGame.cancel(),
  tagSkip: () => TagGame.skip()
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
  on("photoFile", "change", onPhotoFilesPicked);
  on("photoCam", "change", onPhotoFilesPicked);
  // Switching booklet invalidates the staged photos + wrong numbers (each
  // booklet restarts numbering at 1), but the already-confirmed matches from
  // other booklets stay in the list.
  on("photoBooklet", "change", () => {
    resetStagedPhotos();
    if ($("photoWrong")) $("photoWrong").value = "";
  });
  setupPhotoBooklets();
  setupPhotoDropZone();
  on("revLesson", "change", fillRevTopics);
  on("importFile", "change", (e) => importData(e));

  // Delegated handlers for dynamically generated trial inputs.
  const netInputs = $("netInputs");
  if (netInputs) netInputs.addEventListener("input", recalcNet);
  const topicChecks = $("topicChecks");
  if (topicChecks)
    topicChecks.addEventListener("change", (e) => {
      if (e.target.matches('input[type="checkbox"]')) {
        syncTopicCheck(e.target);
        updatePhotoConfirmHint();
      }
    });

  // Subject-trial (alan denemeleri) inputs.
  on("subjDogru", "input", recalcSubjectNet);
  on("subjYanlis", "input", recalcSubjectNet);
  on("subjTrialSection", "change", buildSubjectTopicChecks);
  const subjTopicChecks = $("subjTopicChecks");
  if (subjTopicChecks)
    subjTopicChecks.addEventListener("change", (e) => {
      if (e.target.matches('input[type="checkbox"]')) syncSubjTopicCheck(e.target);
    });

  window.addEventListener("hashchange", () => nav(location.hash.replace("#", "") || "konu"));
}
