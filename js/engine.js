import { E } from "./ege/runtime.js";
import "./ege/util.js";
import "./ege/ui.js";
import "./ege/tasks.js";
import "./ege/listening.js";
import "./ege/listening-notes.js";
import "./ege/wordform.js";
import "./ege/speaking.js";
import "./ege/writing.js";
import "./ege/scoring.js";
import "./ege/exam-scoring.config.js";
import "./ege/exam-scoring.js";
import "./ege/answers-save.js";
import "./ege/points.js";
import "./ege/results.js";
import "./ege/exam-lifecycle.js";
import "./ege/mobile-read-work.js";
import "./ege/nav.js";

window.EgePrep = {
  initTopicPage: E.initTopicPage,
};

if (!window._egeTaskKeysBound) {
  window._egeTaskKeysBound = true;
  document.addEventListener("keydown", function (event) {
    E.handleTaskKeyboard(event);
  });
}

if (typeof E.bindExamLeaveGuard === "function") E.bindExamLeaveGuard();

export { E };
export function initTopicPage() {
  return E.initTopicPage();
}
