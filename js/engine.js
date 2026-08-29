import { E } from "./ege/runtime.js";
import "./ege/util.js";
import "./ege/ui.js";
import "./ege/tasks.js";
import "./ege/listening.js";
import "./ege/wordform.js";
import "./ege/speaking.js";
import "./ege/scoring.js";
import "./ege/points.js";
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

export { E };
export function initTopicPage() {
  return E.initTopicPage();
}
