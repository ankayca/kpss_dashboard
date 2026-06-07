/* ============================================================
   Cross-feature render orchestration.
   Kept separate so feature modules can trigger a full refresh
   without importing each other directly.
   ============================================================ */
import { renderBooks, renderSessions } from "./features/books.js";
import { renderTrials } from "./features/trials.js";
import { renderReviews, updateRevBadge } from "./features/reviews.js";
import {
  renderExamInfo,
  renderTargetInfo,
  renderDataStats,
  renderGoalsInfo,
  renderNotifyInfo
} from "./features/settings.js";
import { renderAnalytics } from "./features/analytics.js";
import { isActive } from "./nav.js";

export function refreshAll() {
  renderBooks();
  renderSessions();
  renderTrials();
  renderReviews();
  renderExamInfo();
  renderTargetInfo();
  renderGoalsInfo();
  renderNotifyInfo();
  renderDataStats();
  updateRevBadge();
  if (isActive("analiz")) renderAnalytics();
}
