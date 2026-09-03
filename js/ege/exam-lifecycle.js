import { E } from "./runtime.js";
import { clearPromoUnlock } from "../promo-unlock.js";

var PHASE_KEY_PREFIX = "ege-prep:exam-phase:";
var ACTIVE_TASK_KEY_PREFIX = "ege-prep:exam-active-task:";
var ORAL_EXAM_FROM = 39;

E.EXAM_PHASES = {
  WRITTEN_READY: "written-ready",
  WRITTEN_ACTIVE: "written-active",
  WRITTEN_SUBMITTED: "written-submitted",
  ORAL_READY: "oral-ready",
  ORAL_ACTIVE: "oral-active",
  COMPLETE: "complete",
};

E.examPhaseStorageKey = function examPhaseStorageKey() {
  var key = E.state.examTimerKey || E.answersSaveVariantKey();
  return PHASE_KEY_PREFIX + String(key || "demo");
};

E.activeTaskStorageKey = function activeTaskStorageKey() {
  var key = E.state.examTimerKey || E.answersSaveVariantKey();
  return ACTIVE_TASK_KEY_PREFIX + String(key || "demo");
};

E.loadPersistedExamPhase = function loadPersistedExamPhase() {
  if (!E.isFullWrittenExam()) return null;
  try {
    return localStorage.getItem(E.examPhaseStorageKey()) || null;
  } catch (_err) {
    return null;
  }
};

E.persistExamPhase = function persistExamPhase(phase, options) {
  options = options || {};
  E.state.examPhase = phase || "";
  if (!E.isFullWrittenExam()) return;
  try {
    if (phase) localStorage.setItem(E.examPhaseStorageKey(), phase);
    else localStorage.removeItem(E.examPhaseStorageKey());
  } catch (_err) {
    /* ignore */
  }
  if (!options.skipSync) E.syncExamPhaseUI();
};

E.getExamPhase = function getExamPhase() {
  if (!E.isFullWrittenExam()) return "";
  if (E.state.examPhase) return E.state.examPhase;
  var stored = E.loadPersistedExamPhase();
  if (stored) {
    E.state.examPhase = stored;
    return stored;
  }
  if (E.isExamTimerStarted()) return E.EXAM_PHASES.WRITTEN_ACTIVE;
  return E.EXAM_PHASES.WRITTEN_READY;
};

E.isWrittenExamPhase = function isWrittenExamPhase() {
  var phase = E.getExamPhase();
  return (
    phase === E.EXAM_PHASES.WRITTEN_READY ||
    phase === E.EXAM_PHASES.WRITTEN_ACTIVE ||
    phase === E.EXAM_PHASES.WRITTEN_SUBMITTED
  );
};

E.isOralExamPhase = function isOralExamPhase() {
  var phase = E.getExamPhase();
  return (
    phase === E.EXAM_PHASES.ORAL_READY ||
    phase === E.EXAM_PHASES.ORAL_ACTIVE ||
    phase === E.EXAM_PHASES.COMPLETE
  );
};

E.isWrittenSubmitted = function isWrittenSubmitted() {
  var phase = E.getExamPhase();
  return (
    phase === E.EXAM_PHASES.WRITTEN_SUBMITTED ||
    phase === E.EXAM_PHASES.ORAL_READY ||
    phase === E.EXAM_PHASES.ORAL_ACTIVE ||
    phase === E.EXAM_PHASES.COMPLETE
  );
};

E.isWrittenActive = function isWrittenActive() {
  return E.getExamPhase() === E.EXAM_PHASES.WRITTEN_ACTIVE;
};

E.isOralActive = function isOralActive() {
  return E.getExamPhase() === E.EXAM_PHASES.ORAL_ACTIVE;
};

E.taskExamFrom = function taskExamFrom(task) {
  var section = E.taskSectionMeta(task);
  if (!section || section.examFrom == null) return null;
  if (task.examFrom != null) return task.examFrom;
  if (task.examNum != null) return task.examNum;
  return section.examFrom;
};

E.taskExamTo = function taskExamTo(task) {
  var from = E.taskExamFrom(task);
  if (from == null) return null;
  if (task.examNum != null) return task.examNum;
  if (task.examTo != null) return task.examTo;
  var section = E.taskSectionMeta(task);
  if (section && section.examTo != null) return section.examTo;
  return from;
};

E.isSpeakingTaskType = function isSpeakingTaskType(task) {
  return (
    task &&
    (task.type === "speaking" ||
      task.type === "speaking-questions" ||
      task.type === "speaking-interview" ||
      task.type === "speaking-aloud")
  );
};

E.isOralTask = function isOralTask(task) {
  if (E.isSpeakingTaskType(task)) return true;
  var from = E.taskExamFrom(task);
  return from != null && from >= ORAL_EXAM_FROM;
};

E.isWrittenTask = function isWrittenTask(task) {
  return !!task && !E.isOralTask(task);
};

E.getPhaseTasks = function getPhaseTasks() {
  if (!E.state.topic || !E.state.topic.tasks) return [];
  if (!E.isFullWrittenExam()) return E.state.topic.tasks;

  var phase = E.getExamPhase();
  if (
    phase === E.EXAM_PHASES.WRITTEN_READY ||
    phase === E.EXAM_PHASES.WRITTEN_ACTIVE ||
    phase === E.EXAM_PHASES.WRITTEN_SUBMITTED
  ) {
    return E.state.topic.tasks.filter(E.isWrittenTask);
  }
  if (phase === E.EXAM_PHASES.ORAL_READY || phase === E.EXAM_PHASES.ORAL_ACTIVE) {
    return E.state.topic.tasks.filter(E.isOralTask);
  }
  if (phase === E.EXAM_PHASES.COMPLETE) return E.state.topic.tasks;
  return E.state.topic.tasks.filter(E.isWrittenTask);
};

E.isNavTaskVisible = function isNavTaskVisible(task) {
  if (!task || !E.isFullWrittenExam()) return true;
  if (!E.isOralTask(task)) return true;
  var phase = E.getExamPhase();
  return (
    phase === E.EXAM_PHASES.ORAL_READY ||
    phase === E.EXAM_PHASES.ORAL_ACTIVE ||
    phase === E.EXAM_PHASES.COMPLETE
  );
};

E.getNavVisibleTasks = function getNavVisibleTasks() {
  if (!E.state.topic || !E.state.topic.tasks) return [];
  if (!E.isFullWrittenExam()) return E.state.topic.tasks;
  return E.state.topic.tasks.filter(E.isNavTaskVisible);
};

E.persistActiveTask = function persistActiveTask(taskId) {
  if (!E.isFullWrittenExam() || !taskId) return;
  try {
    localStorage.setItem(E.activeTaskStorageKey(), String(taskId));
  } catch (_err) {
    /* ignore */
  }
};

E.loadPersistedActiveTask = function loadPersistedActiveTask() {
  if (!E.isFullWrittenExam()) return "";
  try {
    return localStorage.getItem(E.activeTaskStorageKey()) || "";
  } catch (_err) {
    return "";
  }
};

E.countWrittenAnswered = function countWrittenAnswered() {
  var written = E.writtenExamTasks();
  var answered = 0;
  written.forEach(function (task) {
    if (E.isPlacementTaskFilled(task.id)) answered += 1;
  });
  return { answered: answered, total: written.length };
};

E.ensureExamPhaseHost = function ensureExamPhaseHost() {
  var host = document.getElementById("egeExamPhase");
  if (host) return host;
  host = document.createElement("div");
  host.id = "egeExamPhase";
  host.className = "ege-exam-phase";
  host.hidden = true;
  var workspace = document.querySelector(".ege-workspace");
  var panels = document.getElementById("egePanels");
  if (workspace && panels) workspace.insertBefore(host, panels);
  return host;
};

E.hideExamPhaseHost = function hideExamPhaseHost() {
  var host = document.getElementById("egeExamPhase");
  if (host) {
    host.hidden = true;
    host.innerHTML = "";
  }
  var page = document.getElementById("egePage");
  if (page) page.classList.remove("is-exam-phase-open");
};

E.setWorkspaceTaskLayerVisible = function setWorkspaceTaskLayerVisible(visible) {
  var panelIds = ["egePanels", "egeInstructions"];
  var chromeIds = ["egeTaskFlow", "egeListeningChrome"];
  var ids = visible ? panelIds : panelIds.concat(chromeIds);

  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = !visible;
    if (visible) {
      el.removeAttribute("hidden");
      el.style.removeProperty("pointer-events");
      el.style.removeProperty("display");
    }
  });
};

E.ensureWorkspaceInteractive = function ensureWorkspaceInteractive() {
  var page = document.getElementById("egePage");
  if (page) page.classList.remove("is-exam-phase-open");

  var host = document.getElementById("egeExamPhase");
  if (host) host.hidden = true;

  var panels = document.getElementById("egePanels");
  if (panels) {
    panels.hidden = false;
    panels.removeAttribute("hidden");
    panels.style.removeProperty("pointer-events");
    panels.style.removeProperty("display");
  }

  var instructions = document.getElementById("egeInstructions");
  if (instructions) {
    instructions.style.removeProperty("pointer-events");
    instructions.style.removeProperty("display");
  }
};

E.showExamPhaseScreen = function showExamPhaseScreen(contentHtml) {
  var host = E.ensureExamPhaseHost();
  E.setWorkspaceTaskLayerVisible(false);
  host.innerHTML = contentHtml;
  host.hidden = false;
  var page = document.getElementById("egePage");
  if (page) page.classList.add("is-exam-phase-open");
};

E.showTaskWorkspace = function showTaskWorkspace() {
  var page = document.getElementById("egePage");
  if (page) page.classList.remove("is-exam-ready");
  E.hideExamPhaseHost();
  E.ensureWorkspaceInteractive();
  if (typeof E.syncTaskFlowControls === "function") E.syncTaskFlowControls();
  if (typeof E.scheduleTopicNavAlign === "function" && E.state.activeTaskId) {
    E.scheduleTopicNavAlign(E.state.activeTaskId);
  }
};

E.enterExamReview = function enterExamReview() {
  E.state.examReviewing = true;
  E.showTaskWorkspace();
  E.syncExamPhaseActions();
};

E.renderWrittenReadyScreen = function renderWrittenReadyScreen() {
  var mins = E.state.examMinutes || 190;
  return (
    '<div class="ege-exam-phase__panel ege-exam-phase__panel--ready" role="region" aria-labelledby="egeWrittenReadyTitle">' +
    '<h2 class="ege-exam-phase__title" id="egeWrittenReadyTitle">Письменная часть</h2>' +
    '<p class="ege-exam-phase__lead">Задания 1–38 · ' +
    mins +
    " минут</p>" +
    '<p class="ege-exam-phase__note">Ответы сохраняются автоматически. Устная часть отдельно, после сдачи письменной.</p>' +
    '<p class="ege-exam-phase__timer-note">Таймер начнётся после старта</p>' +
    '<div class="ege-exam-phase__actions ege-exam-phase__actions--ready">' +
    '<button type="button" class="ege-exam-timer__start" id="egeStartWrittenExam">Start</button>' +
    "</div></div>"
  );
};

E.appendExamPhaseButton = function appendExamPhaseButton(actions, label, primary, onClick) {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "ege-btn ege-exam-phase-actions__btn " + (primary ? "ege-btn--primary" : "ege-btn--ghost");
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  actions.appendChild(btn);
};

E.resetWrittenTasksInDom = function resetWrittenTasksInDom() {
  E.writtenExamTasks().forEach(function (task) {
    if (typeof E.unlockTaskInputs === "function") E.unlockTaskInputs(task.id);
    if (typeof E.resetTask === "function") E.resetTask(task.id, { force: true });
    if (task.type === "writing") {
      var textarea = document.getElementById("writing-draft-" + task.id);
      if (textarea) textarea.value = "";
      if (typeof E.syncWritingWordCount === "function") E.syncWritingWordCount(task.id);
    }
  });
  E.state.writing38Choice = "";
  E.state.writing38Drafts = {};
  E.state.placementFinalized = false;
  if (typeof E.syncExamPoints === "function") E.syncExamPoints();
};

E.resetWrittenExamAnswers = function resetWrittenExamAnswers(force) {
  if (!E.isFullWrittenExam()) return;
  if (!force) {
    var msg = "Сбросить все ответы письменной части? Таймер продолжит идти.";
    if (!window.confirm(msg)) return;
  }
  if (typeof E.cancelAutosave === "function") E.cancelAutosave();
  E.stopAllListeningAudio();
  if (typeof E.clearVariantSavedAnswers === "function") E.clearVariantSavedAnswers();
  if (typeof E.clearVariantSessionData === "function") E.clearVariantSessionData();
  E.resetWrittenTasksInDom();
  E.ensureWorkspaceInteractive();
  var phase = E.getExamPhase();
  if (phase === E.EXAM_PHASES.WRITTEN_SUBMITTED || phase === E.EXAM_PHASES.COMPLETE) {
    E.persistExamPhase(E.EXAM_PHASES.WRITTEN_ACTIVE, { skipSync: true });
    var mins = E.state.examMinutes;
    var key = E.state.examTimerKey || E.answersSaveVariantKey();
    if (mins && key) {
      if (typeof E.clearExamTimerSession === "function") E.clearExamTimerSession();
      E.armExamTimer(mins, key);
      E.runExamTimer();
    }
  }
  E.syncExamPhaseUI();
  E.syncFinishWrittenButton();
  E.syncExamManageActions();
};

E.restartWrittenExam = function restartWrittenExam(force) {
  if (!E.isFullWrittenExam()) return;
  if (!force) {
    var msg =
      "Начать экзамен заново? Все ответы и прогресс будут удалены, таймер сбросится.";
    if (!window.confirm(msg)) return;
  }
  var mins = E.state.examMinutes;
  var key = E.state.examTimerKey || E.answersSaveVariantKey();
  if (typeof E.cancelAutosave === "function") E.cancelAutosave();
  E.stopAllListeningAudio();
  E.stopExamTimer();
  if (typeof E.clearExamTimerSession === "function") E.clearExamTimerSession();
  if (typeof E.clearVariantSavedAnswers === "function") E.clearVariantSavedAnswers();
  if (typeof E.clearVariantSessionData === "function") E.clearVariantSessionData();
  try {
    localStorage.removeItem(E.activeTaskStorageKey());
  } catch (_err) {
    /* ignore */
  }
  E.state.examReviewing = false;
  E.state.placementFinalized = false;
  E.resetWrittenTasksInDom();
  E.ensureWorkspaceInteractive();
  E.persistExamPhase(E.EXAM_PHASES.WRITTEN_READY, { skipSync: true });
  if (mins && key) {
    E.state.examMinutes = mins;
    E.state.examTimerKey = String(key);
  }
  E.syncExamPhaseUI();
  E.syncFinishWrittenButton();
  E.syncExamManageActions();
};

E.mountExamBarControl = function mountExamBarControl(el, beforeId) {
  var end = E.ensureExamBarEnd();
  var before = beforeId ? document.getElementById(beforeId) : null;
  if (before && before.parentNode === end) end.insertBefore(el, before);
  else end.appendChild(el);
};

E.useExamSidebarControls = function useExamSidebarControls() {
  return false;
};

E.ensureExamSideRail = function ensureExamSideRail() {
  var rail = document.getElementById("egeExamSideRail");
  if (rail) return rail;
  rail = document.createElement("div");
  rail.id = "egeExamSideRail";
  rail.className = "ege-exam-side-rail";
  rail.hidden = true;
  var sidebar = document.querySelector(".ege-topic-sidebar");
  if (sidebar) sidebar.appendChild(rail);
  return rail;
};

E.syncExamControlsLayout = function syncExamControlsLayout() {
  if (!E.useExamSidebarControls()) {
    E.syncExamBarControlsLayout();
    E.syncExamSideRail();
    return;
  }

  var rail = E.ensureExamSideRail();
  var timer = document.getElementById("egeExamTimer");
  var phase = document.getElementById("egeExamPhaseActions");
  var finish = document.getElementById("egeFinishWritten");
  var manage = document.getElementById("egeExamManageActions");

  var slot =
    typeof E.getListeningExamTimerSlot === "function" ? E.getListeningExamTimerSlot() : null;
  var timerInListening = !!(
    slot &&
    typeof E.listeningBarShowsExamTimer === "function" &&
    E.listeningBarShowsExamTimer() &&
    timer &&
    !timer.hidden
  );

  var order = [];
  if (timer && !timerInListening) order.push(timer);
  if (phase) order.push(phase);
  if (finish) order.push(finish);
  if (manage) order.push(manage);

  order.forEach(function (el) {
    rail.appendChild(el);
  });

  var bar = document.getElementById("egeExamBar");
  if (bar) bar.hidden = true;
  E.syncExamSideRail();
};

E.syncExamBarControlsLayout = function syncExamBarControlsLayout() {
  var end = E.ensureExamBarEnd();
  var manage = document.getElementById("egeExamManageActions");
  var timer = document.getElementById("egeExamTimer");
  var finish = document.getElementById("egeFinishWritten");
  [manage, timer, finish].forEach(function (el) {
    if (el && el.parentNode !== end) end.appendChild(el);
  });
  [manage, timer, finish].forEach(function (el) {
    if (el && el.parentNode === end) end.appendChild(el);
  });
};

E.syncExamSideRail = function syncExamSideRail() {
  var rail = document.getElementById("egeExamSideRail");
  if (!rail) return;

  if (!E.useExamSidebarControls()) {
    rail.hidden = true;
    return;
  }

  var visibleChild = false;
  Array.prototype.forEach.call(rail.children, function (el) {
    if (el.hidden) return;
    if (el.id === "egeExamTimer") {
      visibleChild = true;
      return;
    }
    if (el.classList && el.classList.contains("ege-exam-phase-actions") && !el.hidden) {
      visibleChild = true;
      return;
    }
    if (el.classList && el.classList.contains("ege-exam-manage-actions") && !el.hidden) {
      visibleChild = true;
      return;
    }
    if (el.id === "egeFinishWritten" && !el.hidden) visibleChild = true;
  });

  rail.hidden = !visibleChild;
};

E.ensureExamManageActions = function ensureExamManageActions() {
  var actions = document.getElementById("egeExamManageActions");
  if (!actions) {
    actions = document.createElement("div");
    actions.id = "egeExamManageActions";
    actions.className = "ege-exam-manage-actions";
    actions.hidden = true;
  }
  E.mountExamBarControl(actions, "egeFinishWritten");
  return actions;
};

E.syncExamManageActions = function syncExamManageActions() {
  var actions = E.ensureExamManageActions();
  actions.textContent = "";
  actions.hidden = true;
  if (!E.isFullWrittenExam()) {
    E.syncExamSideRail();
    return;
  }

  var phase = E.getExamPhase();
  var showReset =
    phase === E.EXAM_PHASES.WRITTEN_ACTIVE ||
    phase === E.EXAM_PHASES.WRITTEN_SUBMITTED ||
    phase === E.EXAM_PHASES.COMPLETE;
  var showRestart =
    phase === E.EXAM_PHASES.WRITTEN_ACTIVE ||
    phase === E.EXAM_PHASES.WRITTEN_SUBMITTED ||
    phase === E.EXAM_PHASES.ORAL_READY ||
    phase === E.EXAM_PHASES.ORAL_ACTIVE ||
    phase === E.EXAM_PHASES.COMPLETE;

  if (!showReset && !showRestart) {
    E.syncExamSideRail();
    return;
  }

  actions.hidden = false;

  if (showReset) {
    E.appendExamPhaseButton(actions, "Сбросить", false, function () {
      E.resetWrittenExamAnswers(false);
    });
  }
  if (showRestart) {
    var restartBtn = document.createElement("button");
    restartBtn.type = "button";
    restartBtn.className = "ege-btn ege-btn--ghost ege-exam-restart-btn";
    restartBtn.textContent = "✕";
    restartBtn.setAttribute("aria-label", "Начать заново");
    restartBtn.title = "Начать заново";
    restartBtn.addEventListener("click", function () {
      E.restartWrittenExam(false);
    });
    actions.appendChild(restartBtn);
  }

  E.syncExamControlsLayout();
  E.syncExamSideRail();
};

E.syncExamPhaseActions = function syncExamPhaseActions() {
  var actions = document.getElementById("egeExamPhaseActions");
  if (!actions) {
    actions = document.createElement("div");
    actions.id = "egeExamPhaseActions";
    actions.className = "ege-exam-phase-actions";
  }
  actions.textContent = "";
  actions.hidden = true;

  if (!E.isFullWrittenExam()) {
    E.syncExamControlsLayout();
    return;
  }

  var phase = E.getExamPhase();
  if (phase === E.EXAM_PHASES.WRITTEN_SUBMITTED) {
    actions.hidden = false;
    E.appendExamPhaseButton(actions, "Устная часть", true, function () {
      E.persistExamPhase(E.EXAM_PHASES.ORAL_READY);
      E.syncExamPhaseUI();
    });
    E.syncExamControlsLayout();
    return;
  }

  if (phase === E.EXAM_PHASES.ORAL_READY) {
    actions.hidden = false;
    E.appendExamPhaseButton(actions, "Готов(а)", true, E.startOralExam);
    E.syncExamControlsLayout();
    return;
  }

  if (phase === E.EXAM_PHASES.ORAL_ACTIVE) {
    actions.hidden = false;
    E.appendExamPhaseButton(actions, "Готово", true, E.confirmOralResults);
  }

  E.syncExamManageActions();
  E.syncExamControlsLayout();
};

E.ensureActivePhaseTask = function ensureActivePhaseTask() {
  if (!E.isFullWrittenExam()) return;
  var tasks = E.getPhaseTasks();
  if (!tasks.length) return;
  var active = E.state.activeTaskId;
  if (active && tasks.some(function (task) { return task.id === active; })) return;
  E.showTask(tasks[0].id);
};

E.prepareMockExamNavigation = function prepareMockExamNavigation(taskId) {
  if (!E.isFullWrittenExam()) return;
  var task = E.findTask(taskId);
  if (!task) return;

  var phase = E.getExamPhase();
  E.showTaskWorkspace();

  if (phase === E.EXAM_PHASES.WRITTEN_READY) {
    E.persistExamPhase(E.EXAM_PHASES.WRITTEN_ACTIVE);
    if (!E.isExamTimerStarted()) E.runExamTimer();
    if (typeof E.bindAutosave === "function") E.bindAutosave();
    if (typeof E.restoreVariantSavedAnswers === "function") E.restoreVariantSavedAnswers();
    E.syncFinishWrittenButton();
  }

  if (phase === E.EXAM_PHASES.ORAL_READY && E.isOralTask(task)) {
    E.persistExamPhase(E.EXAM_PHASES.ORAL_ACTIVE);
    var timer = document.getElementById("egeExamTimer");
    if (timer) timer.hidden = true;
  }

  E.syncExamPhaseActions();
  E.syncNavForPhase();
};

E.syncWrittenReadyChrome = function syncWrittenReadyChrome() {
  var page = document.getElementById("egePage");
  if (page) page.classList.add("is-exam-ready");
  if (typeof E.setNavOpen === "function") E.setNavOpen(false);
  var bar = document.getElementById("egeExamBar");
  if (bar) bar.hidden = true;
  var timer = document.getElementById("egeExamTimer");
  if (timer) timer.hidden = true;
};

E.showWrittenReadyScreen = function showWrittenReadyScreen() {
  E.syncWrittenReadyChrome();
  E.showExamPhaseScreen(E.renderWrittenReadyScreen());
  var start = document.getElementById("egeStartWrittenExam");
  if (start) {
    start.addEventListener("click", function () {
      E.startWrittenExam();
    });
  }
};

E.initExamPhase = function initExamPhase() {
  if (!E.isFullWrittenExam()) {
    E.state.examPhase = "";
    return;
  }
  if (!window._egeExamControlsResizeBound) {
    window._egeExamControlsResizeBound = true;
    window.addEventListener("resize", function () {
      if (typeof E.syncExamControlsLayout === "function") E.syncExamControlsLayout();
      if (typeof E.syncExamTimerPlacement === "function") E.syncExamTimerPlacement();
    });
  }
  var phase = E.getExamPhase();
  if (!phase) {
    E.persistExamPhase(E.EXAM_PHASES.WRITTEN_READY);
    phase = E.EXAM_PHASES.WRITTEN_READY;
  }
  E.syncExamPhaseUI();
};

E.syncExamPhaseUI = function syncExamPhaseUI() {
  if (!E.isFullWrittenExam()) {
    E.hideExamPhaseHost();
    E.syncFinishWrittenButton();
    E.syncNavForPhase();
    E.syncExamPhaseActions();
    E.syncExamManageActions();
    return;
  }

  var phase = E.getExamPhase();
  E.syncNavForPhase();
  E.syncFinishWrittenButton();
  E.syncExamManageActions();

  if (phase === E.EXAM_PHASES.WRITTEN_READY) {
    E.showWrittenReadyScreen();
    return;
  }

  if (phase === E.EXAM_PHASES.WRITTEN_SUBMITTED) {
    E.showTaskWorkspace();
    if (typeof E.finalizePlacementExam === "function") E.finalizePlacementExam();
    if (typeof E.syncExamPoints === "function") E.syncExamPoints();
    E.syncExamPhaseActions();
    E.ensureActivePhaseTask();
    return;
  }

  if (phase === E.EXAM_PHASES.ORAL_READY) {
    E.showTaskWorkspace();
    if (typeof E.syncExamPoints === "function") E.syncExamPoints();
    E.syncExamPhaseActions();
    E.ensureActivePhaseTask();
    return;
  }

  if (phase === E.EXAM_PHASES.COMPLETE) {
    if (E.state.examReviewing) {
      E.showTaskWorkspace();
      E.syncExamPhaseActions();
      return;
    }
    if (typeof E.showExamResultsScreen === "function") E.showExamResultsScreen();
    E.syncExamPhaseActions();
    return;
  }

  E.showTaskWorkspace();
  E.syncExamPhaseActions();

  var timer = document.getElementById("egeExamTimer");
  if (timer && E.isOralExamPhase()) timer.hidden = true;

  if (phase === E.EXAM_PHASES.WRITTEN_ACTIVE && !E.isExamTimerStarted()) {
    E.armExamTimer(E.state.examMinutes, E.state.examTimerKey);
  }
};

E.startWrittenExam = function startWrittenExam() {
  E.persistExamPhase(E.EXAM_PHASES.WRITTEN_ACTIVE, { skipSync: true });
  E.showTaskWorkspace();
  E.ensureExamBar();
  E.runExamTimer();
  var tasks = E.getPhaseTasks();
  if (tasks.length) E.showTask(tasks[0].id);
  if (typeof E.bindAutosave === "function") E.bindAutosave();
  if (typeof E.restoreVariantSavedAnswers === "function") E.restoreVariantSavedAnswers();
  E.syncFinishWrittenButton();
  if (typeof E.syncExamPhaseActions === "function") E.syncExamPhaseActions();
  if (typeof E.syncExamManageActions === "function") E.syncExamManageActions();
  if (typeof E.syncNavForPhase === "function") E.syncNavForPhase();
  E.syncExamControlsLayout();
};

E.stopAllListeningAudio = function stopAllListeningAudio() {
  document.querySelectorAll("audio").forEach(function (audio) {
    audio.pause();
  });
  if (typeof E.pauseSharedListeningAudio === "function") E.pauseSharedListeningAudio();
};

E.lockWrittenAnswers = function lockWrittenAnswers() {
  E.writtenExamTasks().forEach(function (task) {
    if (typeof E.lockTaskInputs === "function") E.lockTaskInputs(task.id);
  });
};

E.submitWrittenExam = function submitWrittenExam(force) {
  if (!E.isFullWrittenExam() || E.isWrittenSubmitted()) return;
  if (!force && E.getExamPhase() !== E.EXAM_PHASES.WRITTEN_ACTIVE) return;

  if (typeof E.flushAutosave === "function") E.flushAutosave();
  E.stopAllListeningAudio();
  E.stopExamTimer();
  if (typeof E.finalizePlacementExam === "function") E.finalizePlacementExam();
  E.lockWrittenAnswers();
  E.persistExamPhase(E.EXAM_PHASES.WRITTEN_SUBMITTED);
  E.syncExamPhaseUI();
  if (typeof E.syncExamPracticeUI === "function") E.syncExamPracticeUI();
};

E.confirmSubmitWrittenExam = function confirmSubmitWrittenExam() {
  var counts = E.countWrittenAnswered();
  var unanswered = counts.total - counts.answered;
  var msg =
    unanswered > 0
      ? "Вы ещё не всё сделали: не заполнено " +
        unanswered +
        " из " +
        counts.total +
        ". Всё равно сдать письменную часть?"
      : "Сдать письменную часть? После сдачи ответы нельзя изменить.";
  if (window.confirm(msg)) E.submitWrittenExam(true);
};

E.startOralExam = function startOralExam() {
  E.persistExamPhase(E.EXAM_PHASES.ORAL_ACTIVE);
  E.syncExamPhaseUI();
  var tasks = E.getPhaseTasks();
  if (tasks.length) E.showTask(tasks[0].id);
};

E.ensureExamBarEnd = function ensureExamBarEnd() {
  var bar = E.ensureExamBar();
  var end = document.getElementById("egeExamBarEnd");
  if (end) return end;

  end = document.createElement("div");
  end.id = "egeExamBarEnd";
  end.className = "ege-exam-bar__end";

  var timer = document.getElementById("egeExamTimer");
  bar.appendChild(end);
  if (timer && timer.parentNode === bar) end.appendChild(timer);
  else if (timer) end.appendChild(timer);

  return end;
};

E.ensureFinishWrittenButton = function ensureFinishWrittenButton() {
  var btn = document.getElementById("egeFinishWritten");
  if (btn) {
    btn.classList.add("ege-exam-finish", "ege-btn--primary");
    btn.classList.remove("ege-btn--ghost");
    E.mountExamBarControl(btn);
    E.syncExamBarControlsLayout();
    return btn;
  }
  btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ege-btn ege-btn--primary ege-exam-finish";
  btn.id = "egeFinishWritten";
  btn.textContent = "Сдать";
  btn.hidden = true;
  btn.addEventListener("click", function () {
    E.confirmSubmitWrittenExam();
  });
  E.mountExamBarControl(btn);
  E.syncExamBarControlsLayout();
  return btn;
};

E.syncFinishWrittenButton = function syncFinishWrittenButton() {
  var btn = E.ensureFinishWrittenButton();
  var visible = E.isFullWrittenExam() && E.isWrittenActive();
  btn.hidden = !visible;
  if (!visible) {
    E.syncExamSideRail();
    return;
  }

  var allComplete =
    typeof E.isPlacementWrittenFilled === "function" && E.isPlacementWrittenFilled();
  btn.disabled = false;
  btn.classList.toggle("ege-btn--primary", allComplete);
  btn.classList.toggle("ege-btn--ghost", !allComplete);
  btn.classList.toggle("is-ready", allComplete);
  btn.removeAttribute("aria-disabled");
  btn.title = "";
  E.syncExamControlsLayout();
};

E.syncNavSectionHeadings = function syncNavSectionHeadings() {
  var nav = document.getElementById("egeNav");
  if (!nav) return;
  var children = Array.prototype.slice.call(nav.children);
  children.forEach(function (el, index) {
    if (el.tagName !== "P" || !el.classList.contains("ege-nav__section")) return;
    var hasVisible = false;
    for (var i = index + 1; i < children.length; i++) {
      var next = children[i];
      if (next.tagName === "P" && next.classList.contains("ege-nav__section")) break;
      if (next.classList.contains("ege-nav__btn") && !next.hidden) {
        hasVisible = true;
        break;
      }
    }
    el.hidden = !hasVisible;
  });
};

E.syncNavForPhase = function syncNavForPhase() {
  if (!E.state.topic || !E.state.topic.tasks) return;
  E.state.topic.tasks.forEach(function (task) {
    var visible = E.isNavTaskVisible(task);
    var navBtn = document.getElementById("nav-" + task.id);
    if (!navBtn) return;
    navBtn.hidden = !visible;
    navBtn.disabled = !visible;
    navBtn.classList.toggle("is-locked", !visible);
    navBtn.classList.toggle("is-exam-nav-hidden", !visible);
    navBtn.title = visible ? "" : "";
  });
  E.syncNavSectionHeadings();
  if (typeof E.syncTaskFlowControls === "function") E.syncTaskFlowControls();
};

E.onExamTimerExpired = function onExamTimerExpired() {
  if (E.isWrittenActive()) E.submitWrittenExam(true);
};

E.shouldWarnBeforeLeaveExam = function shouldWarnBeforeLeaveExam() {
  if (!E.isFullWrittenExam()) return false;
  var phase = E.getExamPhase();
  return (
    phase === E.EXAM_PHASES.WRITTEN_ACTIVE || phase === E.EXAM_PHASES.ORAL_ACTIVE
  );
};

E.confirmLeaveExam = function confirmLeaveExam() {
  if (!E.shouldWarnBeforeLeaveExam()) return true;
  var msg = "Выйти на главную? Весь прогресс будет удалён.";
  if (typeof E.is2027Demo === "function" && E.is2027Demo(E.state.topicId)) {
    msg += " Код придётся ввести заново.";
  }
  return window.confirm(msg);
};

E.abandonExamSession = function abandonExamSession() {
  if (!E.isFullWrittenExam()) return;

  var mins = E.state.examMinutes;
  var timerKey = E.state.examTimerKey || E.answersSaveVariantKey();
  var topicId = E.state.topicId;

  E.stopAllListeningAudio();
  if (typeof E.stopExamTimer === "function") E.stopExamTimer();
  if (typeof E.clearExamTimerSession === "function") E.clearExamTimerSession();
  if (typeof E.clearVariantSavedAnswers === "function") E.clearVariantSavedAnswers();
  if (typeof E.clearVariantSessionData === "function") E.clearVariantSessionData();

  try {
    localStorage.removeItem(E.activeTaskStorageKey());
  } catch (_err) {
    /* ignore */
  }

  E.state.examReviewing = false;
  E.state.placementFinalized = false;
  E.state.writing38Choice = "";
  E.state.writing38Drafts = {};
  E.state.scores = {};

  if (topicId && E.state.topic && E.state.topic.tasks && typeof E.clearScore === "function") {
    E.state.topic.tasks.forEach(function (task) {
      E.clearScore(topicId, task.id);
    });
  }

  if (typeof E.is2027Demo === "function" && E.is2027Demo(E.state.topicId)) {
    clearPromoUnlock();
  }

  E.state.examMinutes = mins;
  E.state.examTimerKey = timerKey;
  E.persistExamPhase(E.EXAM_PHASES.WRITTEN_READY, { skipSync: true });
};

E.bindExamLeaveGuard = function bindExamLeaveGuard() {
  if (window._egeExamLeaveGuardBound) return;
  window._egeExamLeaveGuardBound = true;

  window.addEventListener("beforeunload", function (event) {
    if (!E.shouldWarnBeforeLeaveExam()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  document.addEventListener(
    "click",
    function (event) {
      if (!E.shouldWarnBeforeLeaveExam()) return;
      var link = event.target.closest("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      var href = link.getAttribute("href");
      if (!href || href.charAt(0) === "#") return;
      var dest;
      try {
        dest = new URL(link.href, location.href);
      } catch (_err) {
        return;
      }
      if (dest.origin !== location.origin) return;
      if (dest.pathname === location.pathname && dest.search === location.search) return;
      if (!E.confirmLeaveExam()) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        E.abandonExamSession();
        if (typeof E.is2027Demo === "function" && E.is2027Demo(E.state.topicId)) {
          event.preventDefault();
          location.href = "index.html#code";
        }
      }
    },
    true
  );
};
