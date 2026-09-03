import { E } from "./runtime.js";

var scrollStore = {};
var activePane = "read";

function isMobileLayout() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function panelKey(taskId) {
  return String(taskId || "");
}

function getSplit(taskId) {
  var taskEl = document.getElementById("task-" + taskId);
  if (!taskEl) return null;
  return taskEl.querySelector(".ege-split--panels");
}

function getPanes(split) {
  if (!split) return { read: null, work: null };
  return {
    read: split.querySelector(".ege-split__read, .ege-panel--read"),
    work: split.querySelector(".ege-split__work, .ege-panel--work"),
  };
}

function workTabLabel(taskId) {
  var taskEl = document.getElementById("task-" + taskId);
  if (taskEl) {
    var labelEl = taskEl.querySelector(
      ".ege-panel--work .ege-panel__label, .ege-panel--listening-mc .ege-panel__label, .ege-panel--solo .ege-panel__label"
    );
    if (labelEl && labelEl.textContent.trim()) return labelEl.textContent.trim();
  }

  var task = E.findTask(taskId);
  if (task) {
    if (task.type === "mc" || task.type === "matching") return E.PANEL_LABELS.workQuestions;
    if (task.type === "gapfill" || task.type === "wordform" || task.type === "vocab") {
      return E.PANEL_LABELS.workAnswers;
    }
    if (task.type === "writing") {
      return task.examNum === 38 ? "Essay" : "Draft";
    }
    if (task.type === "listening" && task.questions && task.questions.length) {
      return E.PANEL_LABELS.workQuestions;
    }
  }
  return E.PANEL_LABELS.workAnswers;
}

function saveScroll(taskId) {
  var split = getSplit(taskId);
  var panes = getPanes(split);
  var key = panelKey(taskId);
  scrollStore[key] = scrollStore[key] || {};
  if (panes.read) {
    var readScroll = panes.read.querySelector(".ege-read-scroll") || panes.read;
    scrollStore[key].read = readScroll.scrollTop;
  }
  if (panes.work) {
    var workScroll = panes.work.querySelector(".ege-work-scroll") || panes.work;
    scrollStore[key].work = workScroll.scrollTop;
  }
}

function restoreScroll(taskId, pane) {
  var key = panelKey(taskId);
  var saved = scrollStore[key];
  if (!saved) return;
  var split = getSplit(taskId);
  var panes = getPanes(split);
  var scrollEl =
    pane === "work"
      ? (panes.work && (panes.work.querySelector(".ege-work-scroll") || panes.work))
      : panes.read && (panes.read.querySelector(".ege-read-scroll") || panes.read);
  if (scrollEl && saved[pane] != null) scrollEl.scrollTop = saved[pane];
}

function ensureTabs(taskId) {
  var panel = document.getElementById("panel-" + taskId);
  var split = getSplit(taskId);
  if (!panel || !split) return null;

  var workLabel = workTabLabel(taskId);
  var tabs = panel.querySelector(".ege-read-work-tabs");
  if (!tabs) {
    tabs = document.createElement("div");
    tabs.className = "ege-read-work-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Text and " + workLabel.toLowerCase());
    tabs.innerHTML =
      '<button type="button" class="ege-read-work-tabs__btn is-active" role="tab" aria-selected="true" data-pane="read">Text</button>' +
      '<button type="button" class="ege-read-work-tabs__btn" role="tab" aria-selected="false" data-pane="work">' +
      workLabel +
      "</button>";
    var intro = panel.querySelector(".ege-task-intro");
    if (intro && intro.nextSibling) panel.insertBefore(tabs, intro.nextSibling);
    else panel.insertBefore(tabs, split);

    tabs.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-pane]");
      if (!btn) return;
      E.setMobileReadWorkPane(taskId, btn.dataset.pane);
    });
  } else {
    var workBtn = tabs.querySelector('[data-pane="work"]');
    if (workBtn) workBtn.textContent = workLabel;
    tabs.setAttribute("aria-label", "Text and " + workLabel.toLowerCase());
  }
  return tabs;
}

E.setMobileReadWorkPane = function setMobileReadWorkPane(taskId, pane) {
  if (!isMobileLayout()) return;
  var split = getSplit(taskId);
  if (!split) return;
  saveScroll(taskId);
  activePane = pane === "work" ? "work" : "read";
  split.dataset.mobilePane = activePane;

  var tabs = ensureTabs(taskId);
  if (tabs) {
    tabs.querySelectorAll("[data-pane]").forEach(function (btn) {
      var on = btn.dataset.pane === activePane;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  requestAnimationFrame(function () {
    restoreScroll(taskId, activePane);
  });
};

E.syncMobileReadWorkTabs = function syncMobileReadWorkTabs(taskId) {
  var task = E.findTask(taskId);
  if (!task || !E.usesTopicLayoutForTask(task)) return;

  var split = getSplit(taskId);
  if (!split) {
    var panelNoSplit = document.getElementById("panel-" + taskId);
    var staleTabs = panelNoSplit && panelNoSplit.querySelector(".ege-read-work-tabs");
    if (staleTabs) staleTabs.remove();
    return;
  }

  if (!isMobileLayout()) {
    split.removeAttribute("data-mobile-pane");
    var panel = document.getElementById("panel-" + taskId);
    var tabs = panel && panel.querySelector(".ege-read-work-tabs");
    if (tabs) tabs.remove();
    return;
  }

  ensureTabs(taskId);
  if (!split.dataset.mobilePane) split.dataset.mobilePane = activePane;
  E.setMobileReadWorkPane(taskId, split.dataset.mobilePane || "read");
};
