import { E } from "./runtime.js";

E.renderTaskPanel = function renderTaskPanel(task) {
    if (task.type === "matching") return E.renderMatching(task, E.state.topicId);
    if (task.type === "gapfill") return E.renderGapfill(task, E.state.topicId);
    if (task.type === "mc" && E.isVocabCloze(task)) return E.renderVocabCloze(task, E.state.topicId);
    if (task.type === "mc") return E.renderMc(task, E.state.topicId);
    if (task.type === "wordform") return E.renderWordform(task, E.state.topicId);
    if (task.type === "listening") return E.renderListening(task, E.state.topicId);
    if (task.type === "speaking") return E.renderSpeaking(task);
    if (task.type === "speaking-questions") return E.renderSpeakingQuestions(task);
    if (task.type === "speaking-interview") return E.renderSpeakingInterview(task);
    if (task.type === "speaking-aloud") return E.renderSpeakingAloud(task);
    if (task.type === "writing") return E.renderWriting(task);
    return document.createElement("div");
  }

E.setNavStatus = function setNavStatus(taskId, score, max) {
    var btn = document.getElementById("nav-" + taskId);
    if (!btn) return;
    if (
      typeof E.isPlacementExam === "function" &&
      E.isPlacementExam() &&
      !E.state.placementFinalized &&
      !(typeof E.isWrittenSubmitted === "function" && E.isWrittenSubmitted())
    ) {
      btn.classList.remove("is-perfect", "is-partial", "is-empty", "is-saved");
      var filled =
        typeof E.isPlacementTaskFilled === "function" && E.isPlacementTaskFilled(taskId);
      if (filled) {
        btn.classList.add("is-partial");
        btn.setAttribute("aria-label", btn.textContent + ", answered");
      } else {
        btn.classList.add("is-empty");
        btn.setAttribute("aria-label", btn.textContent + ", not done");
      }
      E.syncPlaylistCompletionUI();
      return;
    }
    btn.classList.remove("is-perfect", "is-partial", "is-empty");
    var status = "not done";
    if (score === max && max > 0) {
      btn.classList.add("is-perfect");
      status = "done";
    } else if (score > 0) {
      btn.classList.add("is-partial");
      status = "in progress";
    } else {
      btn.classList.add("is-empty");
    }
    btn.setAttribute("aria-label", btn.textContent + ", " + status);
    E.syncPlaylistCompletionUI();
  }

E.isTaskComplete = function isTaskComplete(task) {
    if (!task) return false;
    if (E.isSpeakingPractice(task)) {
      return E.isSpeakingMarkedComplete(task.id);
    }
    var max = E.taskMaxScore(task);
    if (max <= 0) return false;
    return (E.state.scores[task.id] || 0) >= max;
  }

E.getPlaylistProgress = function getPlaylistProgress() {
    if (!E.state.playlist || !E.state.topic || !E.state.topic.tasks) {
      return { done: 0, total: 0, complete: false };
    }
    var tasks = E.state.topic.tasks;
    var done = 0;
    tasks.forEach(function (task) {
      if (E.isTaskComplete(task)) done += 1;
    });
    return {
      done: done,
      total: tasks.length,
      complete: tasks.length > 0 && done === tasks.length,
    };
  }

E.ensurePlaylistStatusEl = function ensurePlaylistStatusEl() {
    var statusEl = document.getElementById("egePlaylistStatus");
    if (statusEl) return statusEl;
    var navWrap = document.getElementById("egeTopicNav");
    var nav = document.getElementById("egeNav");
    if (!navWrap || !nav) return null;

    statusEl = document.createElement("div");
    statusEl.id = "egePlaylistStatus";
    statusEl.className = "ege-playlist-status";
    statusEl.innerHTML =
      '<div class="ege-playlist-status__track" aria-hidden="true">' +
      '<span class="ege-playlist-status__fill"></span></div>' +
      '<p class="ege-playlist-status__label"></p>';
    navWrap.insertBefore(statusEl, nav);
    return statusEl;
  }

E.syncPlaylistCompletionUI = function syncPlaylistCompletionUI() {
    var statusEl = document.getElementById("egePlaylistStatus");
    if (!E.state.playlist || !E.state.topic) {
      if (statusEl) statusEl.remove();
      var pageOff = document.getElementById("egePage");
      if (pageOff) pageOff.classList.remove("is-playlist-complete");
      return;
    }

    if (typeof E.isVariantPlaylist === "function" && E.isVariantPlaylist()) {
      if (statusEl) statusEl.remove();
      var variantPage = document.getElementById("egePage");
      if (variantPage) variantPage.classList.remove("is-playlist-complete");
      return;
    }

    if (typeof E.isFullWrittenExam === "function" && typeof E.isExamInProgress === "function") {
      if (E.isFullWrittenExam() && E.isExamInProgress()) {
        if (statusEl) statusEl.remove();
        return;
      }
    }

    if (
      typeof E.isPlacementExam === "function" &&
      E.isPlacementExam() &&
      !E.state.placementFinalized
    ) {
      if (statusEl) statusEl.remove();
      return;
    }

    var progress = E.getPlaylistProgress();
    statusEl = E.ensurePlaylistStatusEl();
    if (!statusEl) return;

    var fill = statusEl.querySelector(".ege-playlist-status__fill");
    var label = statusEl.querySelector(".ege-playlist-status__label");
    var pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

    if (fill) fill.style.width = pct + "%";
    statusEl.classList.toggle("is-complete", progress.complete);

    if (label) {
      label.textContent = progress.complete
        ? "All done."
        : progress.done + " of " + progress.total;
    }

    statusEl.setAttribute(
      "aria-label",
      progress.complete
        ? "Series complete"
        : progress.done + " of " + progress.total + " tasks complete"
    );

    var page = document.getElementById("egePage");
    if (page) page.classList.toggle("is-playlist-complete", progress.complete);

    if (progress.complete && !E.state.playlistWasComplete) {
      var suppressToast =
        typeof E.isFullWrittenExam === "function" &&
        typeof E.isExamInProgress === "function" &&
        E.isFullWrittenExam() &&
        E.isExamInProgress();
      if (!suppressToast) E.showToast("All done.");
    }
    E.state.playlistWasComplete = progress.complete;
  }

E.setNavOpen = function setNavOpen(open) {
    var page = document.getElementById("egePage");
    var currentBtn = document.getElementById("egeFlowCurrent");
    if (page) page.classList.toggle("is-nav-open", open);
    if (currentBtn) currentBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

E.syncTaskFlowControls = function syncTaskFlowControls() {
    if (!E.state.topic || !E.state.activeTaskId) return;
    var tasks =
      typeof E.getNavVisibleTasks === "function"
        ? E.getNavVisibleTasks()
        : E.state.topic.tasks;
    var ids = tasks.map(function (task) {
      return task.id;
    });
    var idx = ids.indexOf(E.state.activeTaskId);
    var hasPrev = idx > 0;
    var hasNext = idx >= 0 && idx < ids.length - 1;
    var prevBtn = document.getElementById("egeFlowPrev");
    var nextBtn = document.getElementById("egeFlowNext");
    if (prevBtn) prevBtn.hidden = !hasPrev;
    if (nextBtn) nextBtn.hidden = !hasNext;
    var flowNav = document.getElementById("egeTaskFlow");
    if (flowNav) {
      var mobileNav =
        window.matchMedia && window.matchMedia("(max-width: 860px)").matches;
      flowNav.hidden = !mobileNav || (!hasPrev && !hasNext);
    }

    var task = E.findTask(E.state.activeTaskId);
    var labelEl = document.getElementById("egeFlowLabel");
    var positionEl = document.getElementById("egeFlowPosition");
    if (labelEl && task) {
      labelEl.textContent = E.navItemLabel(task) || "Task";
    }
    if (positionEl) {
      if (tasks.length > 1 && idx >= 0) {
        positionEl.textContent = idx + 1 + " / " + tasks.length;
        positionEl.hidden = false;
      } else {
        positionEl.textContent = "";
        positionEl.hidden = true;
      }
    }
  }

E.scrollMainToTop = function scrollMainToTop() {
    var main = document.getElementById("egeMain");
    var behavior = E.prefersReducedMotion() ? "auto" : "smooth";
    if (main && typeof main.scrollIntoView === "function") {
      main.scrollIntoView({ behavior: behavior, block: "start" });
      return;
    }
    if (typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: behavior });
    }
  }

E.setActiveTaskPanel = function setActiveTaskPanel(taskId) {
    document.querySelectorAll(".ege-task-panel").forEach(function (panel) {
      var active = panel.dataset.taskId === taskId;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    E.mountTaskFlowNav(taskId);
  }

E.mountTaskFlowNav = function mountTaskFlowNav(taskId) {
    var flowNav = document.getElementById("egeTaskFlow");
    var host = document.querySelector(".ege-workspace");
    if (!flowNav || !host) return;

    if (flowNav.parentElement !== host) {
      host.appendChild(flowNav);
    }

    flowNav.classList.remove("ege-task-flow--in-panel");
  }

E.getAdjacentTaskId = function getAdjacentTaskId(delta) {
    if (!E.state.topic || !E.state.activeTaskId) return null;
    var tasks =
      typeof E.getNavVisibleTasks === "function"
        ? E.getNavVisibleTasks()
        : E.state.topic.tasks;
    var ids = tasks.map(function (task) {
      return task.id;
    });
    var idx = ids.indexOf(E.state.activeTaskId);
    if (idx < 0) return null;
    var next = idx + delta;
    if (next < 0 || next >= ids.length) return null;
    return ids[next];
  }

E.showAdjacentTask = function showAdjacentTask(delta) {
    var nextId = E.getAdjacentTaskId(delta);
    if (!nextId) return;
    E.setNavOpen(false);
    E.showTask(nextId);
  }

E.focusNavTaskButton = function focusNavTaskButton(taskId) {
    var btn = document.getElementById("nav-" + taskId);
    if (btn && !btn.hidden && !btn.disabled) btn.focus();
  }

E.hasActiveInTaskKeyboardSelection = function hasActiveInTaskKeyboardSelection(taskId) {
    if (!taskId) return false;

    if (
      E.mcKeyboardState &&
      E.mcKeyboardState.taskId === taskId &&
      E.mcKeyboardState.questionIndex >= 0
    ) {
      return true;
    }

    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return false;

    var boards = Array.prototype.slice.call(taskEl.querySelectorAll(".ege-picks-controller"));
    for (var i = 0; i < boards.length; i += 1) {
      var board = boards[i];
      if (typeof E.isPickBoardVisible === "function" && !E.isPickBoardVisible(board)) continue;
      if (board.getActiveLetter && board.getActiveLetter()) return true;
      if (board.getActiveGap && board.getActiveGap()) return true;
    }

    return false;
  }

E.handleTaskArrowNav = function handleTaskArrowNav(event) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
    if (!E.state.activeTaskId) return false;

    var delta = event.key === "ArrowDown" ? 1 : -1;
    var fromNav =
      event.target &&
      event.target.closest &&
      event.target.closest(".ege-nav__btn");

    if (!fromNav && E.hasActiveInTaskKeyboardSelection(E.state.activeTaskId)) return false;

    var nextId = E.getAdjacentTaskId(delta);
    if (!nextId) return false;

    event.preventDefault();
    E.resetTaskDigitBuffer();
    E.setNavOpen(false);
    E.showTask(nextId);
    E.focusNavTaskButton(nextId);
    return true;
  }

E.handleTaskEnterNav = function handleTaskEnterNav(event) {
    if (event.key !== "Enter") return false;
    if (event.defaultPrevented) return false;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
    if (!E.state.activeTaskId) return false;

    var target = event.target;
    if (target) {
      var tag = (target.tagName || "").toLowerCase();
      if (tag === "textarea" || tag === "select") return false;
      if (tag === "input") {
        var type = (target.type || "").toLowerCase();
        if (type !== "button" && type !== "submit" && type !== "reset") return false;
      }
      if (target.isContentEditable) return false;
    }

    var nextId = E.getAdjacentTaskId(1);
    if (!nextId) return false;

    event.preventDefault();
    E.setNavOpen(false);
    E.showTask(nextId);
    return true;
  }

E.showTask = function showTask(taskId) {
    if (
      typeof E.isNavTaskVisible === "function" &&
      typeof E.isFullWrittenExam === "function" &&
      E.isFullWrittenExam()
    ) {
      var blocked = E.findTask(taskId);
      if (blocked && !E.isNavTaskVisible(blocked)) {
        if (typeof E.ensureActivePhaseTask === "function") E.ensureActivePhaseTask();
        return;
      }
    }
    if (typeof E.prepareMockExamNavigation === "function") E.prepareMockExamNavigation(taskId);
    if (typeof E.flushAutosave === "function") E.flushAutosave();
    var prevTaskId = E.state.activeTaskId;
    if (prevTaskId && typeof E.closeWritingCriteriaDrawer === "function") {
      E.closeWritingCriteriaDrawer(prevTaskId, { returnFocus: false });
    }
    E.state.activeTaskId = taskId;
    if (typeof E.persistActiveTask === "function") E.persistActiveTask(taskId);
    E.resetTaskDigitBuffer();
    E.resetMcKeyboardState(taskId);
    E.setActiveTaskPanel(taskId);
    document.querySelectorAll(".ege-nav__btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.taskId === taskId);
    });

    var task = E.findTask(taskId);
    if (prevTaskId && prevTaskId !== taskId && typeof E.clearListeningNotesPlacing === "function") {
      E.clearListeningNotesPlacing();
    }
    if (task && task._sectionMeta) {
      E.state.sectionMeta = task._sectionMeta;
    }
    E.syncPageModeForTask(taskId);
    E.syncRailLogoVisibility(task);

    var instructions = document.getElementById("egeInstructions");
    if (instructions && task) {
      if (task.type === "listening") {
        E.syncListeningInstructions(taskId);
      } else {
        instructions.hidden = true;
        instructions.removeAttribute("lang");
        instructions.textContent = "";
      }
    } else if (instructions) {
      instructions.hidden = true;
      instructions.textContent = "";
    }
    if (task && task.type === "listening") {
      E.mountListeningChrome(taskId);
      E.syncListeningStepUI(taskId);
      E.scheduleListeningNavAlign(taskId);
      if (typeof E.syncSharedListeningMount === "function") E.syncSharedListeningMount(taskId);
      if (typeof E.syncExamTimerPlacement === "function") E.syncExamTimerPlacement();
    } else {
      E.mountListeningChrome(null);
      if (typeof E.syncExamTimerPlacement === "function") E.syncExamTimerPlacement();
    }
    E.stopSpeakingTimers();
    if (task && task.type === "matching") E.syncMatchingCheckEnabled(taskId);
    if (task && task.type === "wordform") E.syncWordformCheckEnabled(taskId);
    if (task && (task.type === "mc" || task.type === "gapfill")) E.syncCheckButton(taskId);
    if (typeof E.syncSaveAnswersButton === "function") E.syncSaveAnswersButton(taskId);
    var panel = document.getElementById("panel-" + taskId);
    if (panel && window.EgeHighlight && task && task.type !== "listening" && (task.type === "writing" || !E.isSpeakingPractice(task))) {
      var hl = E.highlightStoreIds(task, taskId);
      EgeHighlight.attachAll(panel, hl.topicId, hl.taskId);
    }
    E.syncTopicLayout(taskId);
    E.syncTaskFlowControls();

    var afterLayout = function () {
      if (task && E.usesTopicLayout(E.state.topicId)) {
        E.observeTopicExercisePanel(taskId);
        E.scheduleTopicNavAlign(taskId);
        E.scrollActiveNavIntoView(taskId);
      }
      var prevTask = prevTaskId ? E.findTask(prevTaskId) : null;
      var skipScroll =
        prevTask &&
        task &&
        E.isListeningTask(prevTask) &&
        E.isListeningTask(task) &&
        E.taskUsesExamSinglePage(prevTask) &&
        E.taskUsesExamSinglePage(task) &&
        E.state.topicId &&
        String(E.state.topicId).indexOf("variant:") === 0;
      if (!skipScroll) E.scrollMainToTop();
      if (typeof E.syncMobileReadWorkTabs === "function") E.syncMobileReadWorkTabs(taskId);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        requestAnimationFrame(afterLayout);
      });
    } else {
      afterLayout();
    }
  }

E.restoreTopicLayoutTools = function restoreTopicLayoutTools() {
    document.querySelectorAll(".ege-highlight-tools").forEach(function (tools) {
      var panel = tools.closest(".ege-task-panel");
      if (!panel && tools.dataset.taskId) {
        panel = document.getElementById("panel-" + tools.dataset.taskId);
      }
      if (!panel) return;

      var task = panel.querySelector(".ege-task");
      if (task && window.EgeHighlight && typeof EgeHighlight.mountOnPassageColumn === "function") {
        if (EgeHighlight.mountOnPassageColumn(task, tools)) return;
      }

      var intro = panel.querySelector(".ege-task-intro");
      if (intro) {
        var head = intro.querySelector(".ege-task-intro__head");
        var target = head || intro;
        if (tools.parentNode !== target) target.appendChild(tools);
      } else if (task && task.parentNode) {
        if (tools.parentNode !== task.parentNode) task.parentNode.insertBefore(tools, task);
      } else if (tools.parentNode !== panel) {
        panel.appendChild(tools);
      }
    });
  }

E.restoreTopicLayoutIntros = function restoreTopicLayoutIntros() {
    document.querySelectorAll(".ege-task-intro").forEach(function (intro) {
      var panel = intro.closest(".ege-task-panel");
      if (!panel) {
        var lead = intro.querySelector(".ege-task-intro__lead");
        var ownerId = lead && lead.dataset.taskId;
        if (ownerId) panel = document.getElementById("panel-" + ownerId);
      }
      if (!panel) return;
      if (intro.parentNode !== panel) {
        panel.insertBefore(intro, panel.firstChild);
      }
    });
  }

E.teardownTopicLayout = function teardownTopicLayout() {
    E.restoreTopicLayoutIntros();
    E.restoreTopicLayoutTools();
  }

E.formatExamClock = function formatExamClock(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var hours = Math.floor(total / 3600);
    var mins = Math.floor((total % 3600) / 60);
    var secs = total % 60;
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return hours + ":" + pad(mins) + ":" + pad(secs);
  }

E.examTimerStorageKey = function examTimerStorageKey(key) {
    return "ege-prep:exam-timer:" + String(key || "demo");
  }

E.listeningBarShowsExamTimer = function listeningBarShowsExamTimer() {
  return false;
};

E.getListeningExamTimerSlot = function getListeningExamTimerSlot() {
  return null;
};

E.syncExamTimerPlacement = function syncExamTimerPlacement() {
    var timer = document.getElementById("egeExamTimer");
    var topBar = document.getElementById("egeExamBar");
    if (!timer) return;

    timer.classList.remove("ege-exam-timer--in-listening-bar");

    if (typeof E.useExamSidebarControls === "function" && E.useExamSidebarControls()) {
      if (typeof E.syncExamControlsLayout === "function") E.syncExamControlsLayout();
    } else {
      var end =
        topBar && typeof E.ensureExamBarEnd === "function"
          ? E.ensureExamBarEnd()
          : topBar;
      if (end && !timer.hidden && timer.parentNode !== end) end.appendChild(timer);
      if (typeof E.syncExamBarControlsLayout === "function") E.syncExamBarControlsLayout();
    }

    if (!topBar) return;
    if (typeof E.useExamSidebarControls === "function" && E.useExamSidebarControls()) {
      topBar.hidden = true;
      if (typeof E.syncExamSideRail === "function") E.syncExamSideRail();
      return;
    }

    var phaseActions = document.getElementById("egeExamPhaseActions");
    var finishBtn = document.getElementById("egeFinishWritten");
    var manageActions = document.getElementById("egeExamManageActions");
    var hasOther = !!(phaseActions && !phaseActions.hidden);
    var finishVisible = !!(finishBtn && !finishBtn.hidden);
    var manageVisible = !!(
      manageActions &&
      !manageActions.hidden &&
      manageActions.childElementCount > 0
    );
    var timerVisible = !timer.hidden && topBar.contains(timer);
    topBar.hidden = !(timerVisible || hasOther || finishVisible || manageVisible);
  }

E.ensureExamBar = function ensureExamBar() {
    var bar = document.getElementById("egeExamBar");
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = "egeExamBar";
    bar.className = "ege-exam-bar";
    bar.hidden = true;
    bar.innerHTML =
      '<div class="ege-exam-bar__end" id="egeExamBarEnd">' +
      '<div class="ege-exam-timer" id="egeExamTimer" hidden>' +
      '<button type="button" class="ege-exam-timer__start" id="egeExamTimerStart" hidden>Start</button>' +
      '<button type="button" class="ege-exam-timer__time" id="egeExamTimerDisplay"></button>' +
      "</div></div>";
    var workspace = document.querySelector(".ege-workspace");
    if (workspace) workspace.insertBefore(bar, workspace.firstChild);

    var timer = bar.querySelector("#egeExamTimer");
    var display = bar.querySelector("#egeExamTimerDisplay");
    var startBtn = bar.querySelector("#egeExamTimerStart");
    if (timer && display) {
      display.addEventListener("click", function () {
        if (timer.classList.contains("is-armed")) E.runExamTimer();
      });
    }
    if (startBtn) {
      startBtn.addEventListener("click", function () {
        if (timer && timer.classList.contains("is-armed")) E.runExamTimer();
      });
    }

    return bar;
  }

E.syncExamPracticeUI = function syncExamPracticeUI() {
    var placement =
      typeof E.hidesPracticeControls === "function" && E.hidesPracticeControls();
    if (E.state.topic && E.state.topic.tasks) {
      E.state.topic.tasks.forEach(function (task) {
        if (placement) {
          ["check-", "reset-", "show-"].forEach(function (prefix) {
            var btn = document.getElementById(prefix + task.id);
            if (btn) btn.hidden = true;
          });
          if (typeof E.hideScoreFeedback === "function") E.hideScoreFeedback(task.id);
        } else {
          if (typeof E.syncShowAnswersButton === "function") E.syncShowAnswersButton(task.id);
          if (typeof E.syncCheckButton === "function") E.syncCheckButton(task.id);
        }
        if (task.type === "listening" && typeof E.syncListeningMcFooterUI === "function") {
          E.syncListeningMcFooterUI(task.id);
        }
        if (task.type === "listening" && typeof E.syncListeningPrepFooterUI === "function") {
          E.syncListeningPrepFooterUI(task.id);
        }
        if (task.type === "listening" && typeof E.syncListeningGapsFooterUI === "function") {
          E.syncListeningGapsFooterUI(task.id);
        }
      });
    }
  }

E.ensureExamTimerEl = function ensureExamTimerEl() {
    E.ensureExamBar();
    return document.getElementById("egeExamTimer");
  }

E.tickExamTimer = function tickExamTimer() {
    var el = document.getElementById("egeExamTimer");
    var display = document.getElementById("egeExamTimerDisplay");
    var startBtn = document.getElementById("egeExamTimerStart");
    if (!el || !display || !E.state.examEndsAt) return;
    el.hidden = false;
    var left = E.state.examEndsAt - Date.now();
    var wasDone = el.classList.contains("is-done");
    display.textContent = E.formatExamClock(left);
    if (startBtn) startBtn.hidden = true;
    el.classList.toggle("is-urgent", left > 0 && left <= 10 * 60 * 1000);
    el.classList.toggle("is-done", left <= 0);
    el.classList.toggle("is-running", left > 0);
    el.setAttribute(
      "aria-label",
      left <= 0 ? "Time is up" : "Time left " + display.textContent
    );
    if (display) {
      display.setAttribute(
        "aria-label",
        left <= 0 ? "Time is up" : "Time left " + display.textContent
      );
    }
    if (left <= 0 && !wasDone) {
      if (typeof E.onExamTimerExpired === "function") E.onExamTimerExpired();
      if (typeof E.syncExamPoints === "function") E.syncExamPoints();
      if (typeof E.syncExamPracticeUI === "function") E.syncExamPracticeUI();
    }
    if (typeof E.syncExamTimerPlacement === "function") E.syncExamTimerPlacement();
  }

E.is2027Demo = function is2027Demo(topicId) {
    return (
      window.EGE_2027_DEMO === true ||
      /(^|\/)2027(\/|$)/.test(location.pathname) ||
      /^variant:2027/.test(String(topicId || ""))
    );
  }

E.applyBrandMark = function applyBrandMark(topicId) {
    var is2027 = E.is2027Demo(topicId);
    var src = is2027
      ? "assets/time-to-ege-2027-edition.png"
      : "assets/timetoege.png";
    document.querySelectorAll(".ege-rail__mark").forEach(function (img) {
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    });
    var icon = document.querySelector('link[rel="icon"]');
    if (icon && icon.getAttribute("href") !== src) icon.setAttribute("href", src);
  }

E.stopExamTimer = function stopExamTimer() {
    if (E.examTimerInterval) {
      clearInterval(E.examTimerInterval);
      E.examTimerInterval = null;
    }
    E.state.examEndsAt = 0;
    E.state.examMinutes = 0;
    E.state.examTimerKey = "";
    var el = document.getElementById("egeExamTimer");
    if (el) {
      el.hidden = true;
      el.classList.remove("is-urgent", "is-done", "is-running", "is-armed");
    }
    if (typeof E.hideExamPoints === "function") E.hideExamPoints();
    if (typeof E.syncExamTimerPlacement === "function") E.syncExamTimerPlacement();
  }

E.armExamTimer = function armExamTimer(minutes, key) {
    if (E.examTimerInterval) {
      clearInterval(E.examTimerInterval);
      E.examTimerInterval = null;
    }
    var mins = Number(minutes);
    if (!mins || mins <= 0) {
      E.stopExamTimer();
      return;
    }
    E.ensureExamBar();
    E.state.examMinutes = mins;
    E.state.examTimerKey = String(key || "demo");
    E.state.examEndsAt = 0;

    if (
      typeof E.isFullWrittenExam === "function" &&
      E.isFullWrittenExam() &&
      typeof E.getExamPhase === "function" &&
      E.getExamPhase() === E.EXAM_PHASES.WRITTEN_READY
    ) {
      var readyBar = document.getElementById("egeExamBar");
      if (readyBar) readyBar.hidden = true;
      var readyTimer = document.getElementById("egeExamTimer");
      if (readyTimer) readyTimer.hidden = true;
      return;
    }

    var bar = document.getElementById("egeExamBar");
    if (bar && !(typeof E.useExamSidebarControls === "function" && E.useExamSidebarControls())) {
      bar.hidden = false;
    }

    var started = 0;
    try {
      started = parseInt(sessionStorage.getItem(E.examTimerStorageKey(E.state.examTimerKey)), 10) || 0;
    } catch (err) {
      started = 0;
    }

    var el = E.ensureExamTimerEl();
    var display = document.getElementById("egeExamTimerDisplay");
    var startBtn = document.getElementById("egeExamTimerStart");
    el.hidden = false;
    el.classList.remove("is-urgent", "is-done", "is-running");

    if (started) {
      E.runExamTimer(started);
      if (typeof E.syncExamPoints === "function") E.syncExamPoints();
      return;
    }

    el.classList.add("is-armed");
    if (display) {
      display.textContent = E.formatExamClock(mins * 60 * 1000);
      display.setAttribute("aria-label", "Exam length " + display.textContent);
    }
    if (startBtn) {
      startBtn.hidden = false;
      startBtn.setAttribute("aria-label", "Start exam timer");
    }
    el.setAttribute("aria-label", "Exam timer not started");
    if (typeof E.syncExamPoints === "function") E.syncExamPoints();
    if (typeof E.syncExamTimerPlacement === "function") E.syncExamTimerPlacement();
  }

E.runExamTimer = function runExamTimer(startedAt) {
    var mins = Number(E.state.examMinutes);
    if (!mins || mins <= 0) return;
    var started = Number(startedAt) || Date.now();
    try {
      sessionStorage.setItem(E.examTimerStorageKey(E.state.examTimerKey), String(started));
    } catch (err) {
      /* ignore quota / private mode */
    }
    E.state.examEndsAt = started + mins * 60 * 1000;
    var el = E.ensureExamTimerEl();
    var startBtn = document.getElementById("egeExamTimerStart");
    el.hidden = false;
    el.classList.remove("is-armed");
    el.classList.add("is-running");
    if (startBtn) startBtn.hidden = true;
    if (E.examTimerInterval) clearInterval(E.examTimerInterval);
    E.tickExamTimer();
    E.examTimerInterval = setInterval(E.tickExamTimer, 1000);
    if (typeof E.syncExamTimerPlacement === "function") E.syncExamTimerPlacement();
  }

E.syncTopicLayout = function syncTopicLayout() {
    E.restoreTopicLayoutIntros();
    E.restoreTopicLayoutTools();
  }

E.setRailHeadVisible = function setRailHeadVisible(visible) {
    var railHead = document.getElementById("egeRailHead");
    if (railHead) railHead.hidden = !visible;
  }

E.syncRailLogoVisibility = function syncRailLogoVisibility(task) {
    var topicLayout = task ? E.usesTopicLayoutForTask(task) : E.usesTopicLayout(E.state.topicId);
    E.setRailHeadVisible(!topicLayout);
    var railHead = document.getElementById("egeRailHead");
    if (railHead) {
      railHead.classList.toggle(
        "ege-rail__head--logo-only",
        !topicLayout || !!(task && E.isListeningTask(task) && !topicLayout)
      );
    }
  }

E.applySectionMeta = function applySectionMeta(section) {
    if (!section) return;
    E.state.sectionMeta = section;

    var topicLayout = E.usesTopicLayout(section.id);
    E.setRailHeadVisible(!topicLayout);

    var railHead = document.getElementById("egeRailHead");
    if (railHead) {
      railHead.classList.toggle(
        "ege-rail__head--logo-only",
        topicLayout || section.id === "listening"
      );
    }

    var railTitle = document.getElementById("egeRailTitle");
    if (railTitle) {
      railTitle.hidden = true;
      railTitle.textContent = "";
    }

    var examEl = document.getElementById("egeRailExam");
    if (examEl) {
      examEl.hidden = true;
      examEl.textContent = "";
    }
  }

E.sectionDisplayTitle = function sectionDisplayTitle(topic) {
    if (E.state.playlist && topic && topic.title) {
      return topic.title;
    }
    if (E.state.sectionMeta && E.state.sectionMeta.title) {
      return E.state.sectionMeta.title;
    }
    return topic.title;
  }

E.playlistKeyFromGroup = function playlistKeyFromGroup(groupName) {
    return (
      "group-" +
      String(groupName || "")
        .replace(/\s+/g, "-")
        .replace(/&/g, "and")
    );
  }

E.playlistKeyFromParts = function playlistKeyFromParts(ids) {
    return "parts-" + ids.join("+");
  }

E.cloneTaskForPlaylist = function cloneTaskForPlaylist(task, sectionId, sectionMeta) {
    var cloned = Object.assign({}, task);
    cloned._sourceTaskId = task.id;
    cloned._sectionId = sectionId;
    cloned._sectionMeta = sectionMeta || null;
    cloned.id = sectionId + "__" + task.id;
    return cloned;
  }

E.playlistUsedStorageKey = function playlistUsedStorageKey(playlistKey, sectionId) {
    return "ege-prep.playlist-used." + playlistKey + "." + sectionId;
  }

E.loadPlaylistUsed = function loadPlaylistUsed(playlistKey, sectionId) {
    if (!playlistKey) return [];
    try {
      var raw = localStorage.getItem(E.playlistUsedStorageKey(playlistKey, sectionId));
      return raw ? JSON.parse(raw) : [];
    } catch (_err) {
      return [];
    }
  }

E.savePlaylistUsed = function savePlaylistUsed(playlistKey, sectionId, ids) {
    if (!playlistKey) return;
    try {
      localStorage.setItem(E.playlistUsedStorageKey(playlistKey, sectionId), JSON.stringify(ids));
    } catch (_err) {
      /* ignore quota errors */
    }
  }

E.sectionSeriesSlots = function sectionSeriesSlots(section) {
    if (!section || section.examFrom == null) return 1;
    if (section.examTo == null || section.examTo === section.examFrom) return 1;
    return section.examTo - section.examFrom + 1;
  }

E.pickSeriesVariants = function pickSeriesVariants(sectionId, pool, count, playlistKey) {
    if (!pool || !pool.length || count < 1) return [];

    var want = Math.min(count, pool.length);
    var used = E.loadPlaylistUsed(playlistKey, sectionId);
    var available = pool.filter(function (task) {
      return used.indexOf(task.id) === -1;
    });

    if (available.length < want) {
      used = [];
      available = pool.slice();
    }

    var shuffled = E.shuffleList(available);
    var picked = shuffled.slice(0, want);

    if (playlistKey) {
      picked.forEach(function (task) {
        if (used.indexOf(task.id) === -1) used.push(task.id);
      });
      E.savePlaylistUsed(playlistKey, sectionId, used);
    }

    return picked;
  }

E.mergeSectionTopics = function mergeSectionTopics(entries, title, playlistKey) {
    var tasks = [];
    entries.forEach(function (entry) {
      var section = entry.section;
      var topic = entry.topic;
      if (!topic || !topic.tasks || !topic.tasks.length) return;
      var slots = E.sectionSeriesSlots(section);
      var picked = E.pickSeriesVariants(section.id, topic.tasks, slots, playlistKey);
      picked.forEach(function (task) {
        tasks.push(E.cloneTaskForPlaylist(task, section.id, section));
      });
    });
    return {
      title: title,
      tasks: tasks,
    };
  }

E.fetchTopicJson = function fetchTopicJson(sectionId) {
    return fetch("data/" + sectionId + ".json").then(function (res) {
      if (!res.ok) throw new Error("Topic not found: " + sectionId);
      return res.json();
    });
  }

E.fetchSectionsCatalog = function fetchSectionsCatalog() {
    return fetch("sections.json")
      .then(function (res) {
        return res.ok ? res.json() : { sections: [] };
      })
      .catch(function () {
        return { sections: [] };
      });
  }

E.resolveAvailableSections = function resolveAvailableSections(catalog, predicate) {
    return (catalog.sections || []).filter(function (section) {
      if (section.available === false) return false;
      return predicate(section);
    });
  }

E.mountTopic = function mountTopic(topic, topicId) {
    E.state.topic = topic;
    E.state.topicId = topicId;
    E.state.playlist = !!(topic.tasks || []).some(function (task) {
      return !!task._sectionId;
    });
    E.state.scores = {};
    E.state.listeningSelections = {};
    E.state.listeningRuns = {};
    E.state.prepLayouts = {};

    topic.tasks.forEach(function (task) {
      if (task.type === "listening") {
        if (task.prep && task.prep.matching) {
          E.shuffleMatchingMeaningContent(task.prep.matching, task.id);
        }
        E.state.listeningSelections[task.id] = E.chooseListeningGaps(task);
        E.state.listeningRuns[task.id] = E.buildListeningRun(E.state.listeningSelections[task.id]);
        E.state.listeningSteps[task.id] = 1;
      }
    });

    topic.tasks.forEach(function (task) {
      var saved = E.loadScores(E.scoreStoreTopicId(task));
      var storeTaskId = E.scoreStoreTaskId(task, task.id);
      E.state.scores[task.id] = saved[storeTaskId] ? saved[storeTaskId].score : 0;
    });

    E.state.placementFinalized = false;
    if (typeof E.isPlacementExam === "function" && E.isPlacementExam()) {
      topic.tasks.forEach(function (task) {
        E.state.scores[task.id] = 0;
      });
    }

    document.title = E.sectionDisplayTitle(topic) + " – Time to ЕГЭ – Yap O'Clock";
    E.applyBrandMark(topicId);

    var railTitle = document.getElementById("egeRailTitle");
    if (railTitle) {
      railTitle.hidden = true;
      railTitle.textContent = "";
    }

    var nav = document.getElementById("egeNav");
    var panels = document.getElementById("egePanels");
    nav.textContent = "";
    panels.textContent = "";
    E.clearTopicLoading();
    E.teardownTopicLayout();

    var page = document.getElementById("egePage");
    if (page) {
      var firstTask = topic.tasks[0];
      var topicLayoutFirst = E.usesTopicLayoutForTask(firstTask);
      page.classList.toggle("ege-page--listening", E.isListeningTask(firstTask) && !topicLayoutFirst);
      page.classList.toggle("ege-page--topic-layout", topicLayoutFirst || !E.isListeningTask(firstTask));
    }

    var variantNav = E.isVariantPlaylist(topicId);
    var lastSectionId = "";
    topic.tasks.forEach(function (task, index) {
      var max = E.taskMaxScore(task);
      var savedScore = E.state.scores[task.id] || 0;

      var soloSectionNav =
        !variantNav &&
        E.state.playlist &&
        task._sectionId &&
        topic.tasks.filter(function (t) {
          return t._sectionId === task._sectionId;
        }).length === 1;

      if (!variantNav && E.state.playlist && task._sectionId && task._sectionId !== lastSectionId) {
        lastSectionId = task._sectionId;
        var sectionMeta = task._sectionMeta;
        var range = sectionMeta ? E.formatExamRange(sectionMeta.examFrom, sectionMeta.examTo) : "";
        var sectionLabel = range
          ? range + " · " + (sectionMeta.title || "")
          : sectionMeta.title || "";

        if (soloSectionNav) {
          var soloBtn = document.createElement("button");
          soloBtn.type = "button";
          soloBtn.className = "ege-nav__btn ege-nav__section";
          soloBtn.id = "nav-" + task.id;
          soloBtn.dataset.taskId = task.id;
          soloBtn.textContent = sectionLabel;
          soloBtn.addEventListener("click", function () {
            E.setNavOpen(false);
            E.showTask(task.id);
          });
          nav.appendChild(soloBtn);
        } else {
          var heading = document.createElement("p");
          heading.className = "ege-nav__section";
          heading.textContent = sectionLabel;
          nav.appendChild(heading);
        }
      }

      if (!soloSectionNav) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ege-nav__btn";
        btn.id = "nav-" + task.id;
        btn.dataset.taskId = task.id;
        btn.textContent = E.navItemLabel(task);
        btn.addEventListener("click", function () {
          E.setNavOpen(false);
          E.showTask(task.id);
        });
        nav.appendChild(btn);
      }
      E.setNavStatus(task.id, savedScore, max);

      var shell = document.createElement("section");
      shell.className = "ege-task-panel";
      shell.id = "panel-" + task.id;
      shell.dataset.taskId = task.id;
      if (task._sectionId) shell.dataset.sectionId = task._sectionId;

      var intro = E.buildTaskIntro(task);
      if (intro) shell.appendChild(intro);
      shell.appendChild(E.renderTaskPanel(task));
      if (
        task.type === "listening" &&
        typeof E.taskUsesExamSinglePage === "function" &&
        E.taskUsesExamSinglePage(task)
      ) {
        E.mountListeningExamAudio(task, E.state.topicId, shell);
      }
      if (window.EgeHighlight && (task.type === "writing" || !E.isSpeakingPractice(task))) {
        var hl = E.highlightStoreIds(task, task.id);
        EgeHighlight.attachAll(shell, hl.topicId, hl.taskId);
      }
      shell.hidden = index !== 0;
      panels.appendChild(shell);
    });

    var startTaskId = topic.tasks[0].id;
    var persistedTaskId =
      typeof E.loadPersistedActiveTask === "function" ? E.loadPersistedActiveTask() : "";
    if (
      persistedTaskId &&
      topic.tasks.some(function (task) {
        return task.id === persistedTaskId;
      })
    ) {
      startTaskId = persistedTaskId;
    }
    var requestedTaskId = E.getTaskIdFromUrl();
    if (
      requestedTaskId &&
      topic.tasks.some(function (task) {
        return task.id === requestedTaskId || task._sourceTaskId === requestedTaskId;
      })
    ) {
      var match = topic.tasks.find(function (task) {
        return task.id === requestedTaskId || task._sourceTaskId === requestedTaskId;
      });
      if (match) startTaskId = match.id;
    }

    E.state.playlistWasComplete = E.state.playlist ? E.getPlaylistProgress().complete : false;
    E.syncPlaylistCompletionUI();

    if (E.isFullWrittenExam && E.isFullWrittenExam()) {
      if (typeof E.bindAutosave === "function") E.bindAutosave();
      if (typeof E.restoreVariantSavedAnswers === "function") E.restoreVariantSavedAnswers();
      if (typeof E.initExamPhase === "function") E.initExamPhase();
      var phase = typeof E.getExamPhase === "function" ? E.getExamPhase() : "";
      if (
        phase === E.EXAM_PHASES.WRITTEN_ACTIVE ||
        phase === E.EXAM_PHASES.WRITTEN_SUBMITTED ||
        phase === E.EXAM_PHASES.ORAL_READY ||
        phase === E.EXAM_PHASES.ORAL_ACTIVE ||
        phase === E.EXAM_PHASES.COMPLETE
      ) {
        var visibleTasks =
          typeof E.getNavVisibleTasks === "function" ? E.getNavVisibleTasks() : topic.tasks;
        if (
          visibleTasks.length &&
          !visibleTasks.some(function (task) {
            return task.id === startTaskId;
          })
        ) {
          startTaskId = visibleTasks[0].id;
        }
        E.showTask(startTaskId);
      }
    } else {
      E.showTask(startTaskId);
    }

    E.bindTaskFlow();
    E.bindTopicNavAlign();
    E.observeTopicExercisePanel(startTaskId);
    E.scheduleTopicNavAlign(startTaskId);

    if (String(topicId || "").indexOf("variant:") !== 0) {
      E.stopExamTimer();
    }

    var back = document.querySelector(".ege-topic-sidebar__back");
    if (back) {
      if (E.is2027Demo(topicId)) {
        back.href = window.EGE_2027_DEMO ? "index.html" : "2027/";
        back.textContent = "← go back";
      } else {
        back.href = "index.html";
        back.textContent = "← Sections";
      }
    }

    if (typeof E.syncExamPracticeUI === "function") E.syncExamPracticeUI();
    if (typeof E.syncExamPoints === "function") E.syncExamPoints();
    if (
      !variantNav &&
      typeof E.restoreVariantSavedAnswers === "function"
    ) {
      E.restoreVariantSavedAnswers();
    }
    if (typeof E.syncNavForPhase === "function") E.syncNavForPhase();

    if (!window._egeTopicLayoutResizeBound) {
      window._egeTopicLayoutResizeBound = true;
      window.addEventListener("resize", function () {
        if (E.state.activeTaskId) E.syncTopicLayout(E.state.activeTaskId);
        if (E.usesTopicLayout(E.state.topicId)) {
          E.observeTopicExercisePanel(E.state.activeTaskId);
          E.scheduleTopicNavAlign(E.state.activeTaskId);
        }
      });
    }

    if (!window._egeListeningNavAlignBound) {
      window._egeListeningNavAlignBound = true;
      window.addEventListener("resize", function () {
        if (E.isListeningMode() && E.state.activeTaskId) {
          E.scheduleListeningNavAlign(E.state.activeTaskId);
        }
      });
    }

    if (!window._egeDevFillBound) {
      window._egeDevFillBound = true;
      document.addEventListener("keydown", function (event) {
        if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
        if (event.code !== "Digit9") return;
        event.preventDefault();
        E.fillActiveCorrectAnswers();
      });
    }

    if (!window._egeCheckKeyBound) {
      window._egeCheckKeyBound = true;
      document.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        if (!E.state.activeTaskId) return;
        if (typeof E.hidesPracticeControls === "function" && E.hidesPracticeControls()) return;

        var target = event.target;
        if (target) {
          var tag = (target.tagName || "").toLowerCase();
          if (tag === "textarea" || tag === "select") return;
          if (tag === "input") {
            var type = (target.type || "").toLowerCase();
            if (type !== "button" && type !== "submit" && type !== "reset") return;
          }
          if (target.isContentEditable) return;
        }

        if (E.isListeningMode()) {
          var nextInterviewBtn = document.getElementById(
            "next-interview-" + E.state.activeTaskId
          );
          if (nextInterviewBtn && !nextInterviewBtn.hidden) return;
          var prepNextBtn = document.getElementById("prep-next-" + E.state.activeTaskId);
          if (prepNextBtn && !prepNextBtn.hidden) return;
        }

        var checkBtn = document.getElementById("check-" + E.state.activeTaskId);
        if (!checkBtn || checkBtn.hidden || checkBtn.disabled) return;
        event.preventDefault();
        checkBtn.click();
      });
    }

    if (!window._egeListeningEnterNextBound) {
      window._egeListeningEnterNextBound = true;
      document.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (!E.isListeningMode() || !E.state.activeTaskId) return;

        var target = event.target;
        if (target) {
          var tag = (target.tagName || "").toLowerCase();
          if (tag === "input" || tag === "textarea" || tag === "select") return;
          if (target.isContentEditable) return;
        }

        var nextInterviewBtn = document.getElementById(
          "next-interview-" + E.state.activeTaskId
        );
        if (nextInterviewBtn && !nextInterviewBtn.hidden) {
          event.preventDefault();
          nextInterviewBtn.click();
          return;
        }

        var nextBtn = document.getElementById("prep-next-" + E.state.activeTaskId);
        if (!nextBtn || nextBtn.hidden) return;

        event.preventDefault();
        nextBtn.click();
      });
    }

    if (E.isListeningMode() && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        E.scheduleListeningNavAlign(E.state.activeTaskId);
      });
    }
  }

E.bindTaskFlow = function bindTaskFlow() {
    function bindSwitchBtn(id, delta) {
      var btn = document.getElementById(id);
      if (!btn || btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        E.showAdjacentTask(delta);
      });
    }

    bindSwitchBtn("egeFlowPrev", -1);
    bindSwitchBtn("egeFlowNext", 1);

    var currentBtn = document.getElementById("egeFlowCurrent");
    if (currentBtn && !currentBtn.dataset.bound) {
      currentBtn.dataset.bound = "1";
      currentBtn.addEventListener("click", function () {
        if (window.matchMedia && window.matchMedia("(min-width: 861px)").matches) return;
        var page = document.getElementById("egePage");
        E.setNavOpen(!(page && page.classList.contains("is-nav-open")));
      });
    }

    if (!window._egeTaskFlowResizeBound) {
      window._egeTaskFlowResizeBound = true;
      window.addEventListener("resize", function () {
        E.syncTaskFlowControls();
      });
    }

    if (!window._egeTaskFlowEnterBound) {
      window._egeTaskFlowEnterBound = true;
      document.addEventListener("keydown", function (event) {
        E.handleTaskEnterNav(event);
      });
    }
  }

E.getTopicIdFromUrl = function getTopicIdFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get("t") || "";
  }

E.getTaskIdFromUrl = function getTaskIdFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get("task") || "";
  }

E.parseTopicRoute = function parseTopicRoute() {
    var params = new URLSearchParams(window.location.search);
    var variant = params.get("variant");
    var partsRaw = params.get("parts");
    var group = params.get("group");
    var topicId = params.get("t");

    if (variant) return { mode: "variant", id: variant };

    if (partsRaw) {
      var ids = partsRaw
        .split(",")
        .map(function (id) {
          return id.trim();
        })
        .filter(Boolean);
      if (ids.length) return { mode: "parts", ids: ids };
    }
    if (group) return { mode: "group", group: group };
    if (topicId) return { mode: "single", id: topicId };
    return null;
  }

E.mountVariantPlaylist = function mountVariantPlaylist(variant) {
    return E.fetchSectionsCatalog().then(function (catalog) {
      var sectionById = {};
      (catalog.sections || []).forEach(function (section) {
        sectionById[section.id] = section;
      });

      return Promise.all(
        (variant.entries || []).map(function (entry) {
          return E.fetchTopicJson(entry.section).then(function (topic) {
            var section = sectionById[entry.section];
            if (!section || section.available === false) {
              if (!topic || !topic.tasks || !topic.tasks.length) {
                throw new Error("Section unavailable: " + entry.section);
              }
              section = {
                id: entry.section,
                title: topic.title || entry.section,
                available: true,
              };
            }
            var task = (topic.tasks || []).find(function (t) {
              return t.id === entry.task;
            });
            if (!task) {
              throw new Error("Task not found: " + entry.task);
            }
            return { section: section, task: task };
          });
        })
      ).then(function (entries) {
        var tasks = entries.map(function (entry) {
          return E.cloneTaskForPlaylist(entry.task, entry.section.id, entry.section);
        });
        var merged = {
          title: variant.title || variant.id || "Variant",
          tasks: tasks,
        };
        E.state.sectionMeta = entries[0].section;
        E.applySectionMeta(entries[0].section);
        return E.loadTaskTranscripts(merged).then(function () {
          E.mountTopic(merged, "variant:" + (variant.id || "demo"));
          E.state.examMinutes = Number(variant.timeMinutes) || 0;
          E.state.examTimerKey = String(variant.id || "demo");
          if (E.isFullWrittenExam && E.isFullWrittenExam()) {
            E.ensureExamBar();
            if (typeof E.initExamPhase === "function") E.initExamPhase();
            if (
              typeof E.getExamPhase === "function" &&
              E.getExamPhase() === E.EXAM_PHASES.WRITTEN_ACTIVE &&
              E.isExamTimerStarted()
            ) {
              E.armExamTimer(variant.timeMinutes, variant.id || "demo");
            }
          } else {
            E.armExamTimer(variant.timeMinutes, variant.id || "demo");
          }
        });
      });
    });
  }

E.mountMergedPlaylist = function mountMergedPlaylist(entries, title, playlistKey) {
    if (!entries.length) {
      throw new Error("No available sections");
    }
    var merged = E.mergeSectionTopics(entries, title, playlistKey);
    if (!merged.tasks.length) {
      throw new Error("No tasks in playlist");
    }
    E.state.sectionMeta = entries[0].section;
    E.applySectionMeta(entries[0].section);
    return E.loadTaskTranscripts(merged).then(function () {
      E.mountTopic(merged, playlistKey);
    });
  }

E.initTopicPage = function initTopicPage() {
    var route = E.parseTopicRoute();
    if (!route) {
      window.location.href = "index.html";
      return;
    }

    E.showTopicLoading();

    E.fetchSectionsCatalog()
      .then(function (catalog) {
        if (route.mode === "variant") {
          return fetch("data/variants/" + encodeURIComponent(route.id) + ".json")
            .then(function (res) {
              if (!res.ok) throw new Error("Variant not found");
              return res.json();
            })
            .then(function (variant) {
              return E.mountVariantPlaylist(variant);
            });
        }

        if (route.mode === "single") {
          var section = (catalog.sections || []).find(function (entry) {
            return entry.id === route.id;
          });
          if (section && section.available === false) {
            window.location.href = "index.html";
            return null;
          }
          return E.fetchTopicJson(route.id).then(function (topic) {
            E.applySectionMeta(section);
            return E.loadTaskTranscripts(topic).then(function () {
              E.mountTopic(topic, route.id);
            });
          });
        }

        var sections;
        var title;
        var playlistKey;

        if (route.mode === "group") {
          sections = E.resolveAvailableSections(catalog, function (entry) {
            return entry.group === route.group;
          });
          title = route.group;
          playlistKey = E.playlistKeyFromGroup(route.group);
        } else {
          var wanted = {};
          route.ids.forEach(function (id) {
            wanted[id] = true;
          });
          sections = E.resolveAvailableSections(catalog, function (entry) {
            return !!wanted[entry.id];
          });
          sections.sort(function (a, b) {
            return route.ids.indexOf(a.id) - route.ids.indexOf(b.id);
          });
          title = sections
            .map(function (section) {
              return section.title || section.id;
            })
            .join(" · ");
          playlistKey = E.playlistKeyFromParts(
            sections.map(function (section) {
              return section.id;
            })
          );
        }

        if (!sections.length) {
          throw new Error("No available sections");
        }

        return Promise.all(
          sections.map(function (section) {
            return E.fetchTopicJson(section.id).then(function (topic) {
              return { section: section, topic: topic };
            });
          })
        ).then(function (entries) {
          return E.mountMergedPlaylist(entries, title, playlistKey);
        });
      })
      .catch(function (err) {
        E.clearTopicLoading();
        var panels = document.getElementById("egePanels");
        if (panels) {
          var detail = err && err.message ? err.message : "Unknown error";
          panels.innerHTML =
            '<p class="ege-error">' +
            detail +
            '. <a href="index.html">Back to sections</a>.</p>';
        }
      });
  }
