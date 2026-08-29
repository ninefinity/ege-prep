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
    return document.createElement("div");
  }

E.setNavStatus = function setNavStatus(taskId, score, max) {
    var btn = document.getElementById("nav-" + taskId);
    if (!btn) return;
    btn.classList.remove("is-perfect", "is-partial", "is-empty");
    if (score === max && max > 0) btn.classList.add("is-perfect");
    else if (score > 0) btn.classList.add("is-partial");
    else btn.classList.add("is-empty");
    btn.setAttribute("aria-label", btn.textContent + ": " + score + " of " + max);
    E.syncNavCompletedFilter();
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
      E.showToast("All done.");
    }
    E.state.playlistWasComplete = progress.complete;
  }

E.loadHideCompleted = function loadHideCompleted() {
    try {
      return localStorage.getItem("ege-prep.hide-completed") === "1";
    } catch (_err) {
      return false;
    }
  }

E.saveHideCompleted = function saveHideCompleted(hide) {
    try {
      localStorage.setItem("ege-prep.hide-completed", hide ? "1" : "0");
    } catch (_err) {
      /* ignore */
    }
  }

E.isNavTaskHidden = function isNavTaskHidden(taskId) {
    if (!E.state.hideCompleted) return false;
    if (taskId === E.state.activeTaskId) return false;
    var btn = document.getElementById("nav-" + taskId);
    return !!(btn && btn.classList.contains("is-perfect"));
  }

E.syncNavCompletedFilter = function syncNavCompletedFilter() {
    var nav = document.getElementById("egeNav");
    var toggle = document.getElementById("egeHideCompleted");
    if (!nav) return;

    var hide = !!(toggle && toggle.checked);
    E.state.hideCompleted = hide;
    nav.classList.toggle("is-hide-completed", hide);
    E.syncTaskFlowControls();
  }

E.bindHideCompletedFilter = function bindHideCompletedFilter() {
    var toggle = document.getElementById("egeHideCompleted");
    if (!toggle || toggle.dataset.bound) return;
    toggle.dataset.bound = "1";
    toggle.checked = E.loadHideCompleted();
    E.state.hideCompleted = toggle.checked;
    toggle.addEventListener("change", function () {
      E.saveHideCompleted(toggle.checked);
      E.syncNavCompletedFilter();
    });
  }

E.setNavOpen = function setNavOpen(open) {
    var page = document.getElementById("egePage");
    var currentBtn = document.getElementById("egeFlowCurrent");
    if (page) page.classList.toggle("is-nav-open", open);
    if (currentBtn) currentBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

E.syncTaskFlowControls = function syncTaskFlowControls() {
    if (!E.state.topic || !E.state.activeTaskId) return;
    var tasks = E.state.topic.tasks;
    var ids = tasks.map(function (task) {
      return task.id;
    });
    var idx = ids.indexOf(E.state.activeTaskId);
    var hasPrev = false;
    var hasNext = false;
    for (var i = 0; i < ids.length; i += 1) {
      if (i === idx || E.isNavTaskHidden(ids[i])) continue;
      if (i < idx) hasPrev = true;
      if (i > idx) hasNext = true;
    }
    var prevBtn = document.getElementById("egeFlowPrev");
    var nextBtn = document.getElementById("egeFlowNext");
    if (prevBtn) prevBtn.hidden = !hasPrev;
    if (nextBtn) nextBtn.hidden = !hasNext;
    var flowNav = document.getElementById("egeTaskFlow");
    if (flowNav) {
      var mobileNav =
        window.matchMedia && window.matchMedia("(max-width: 860px)").matches;
      flowNav.hidden = !hasPrev && !hasNext && !mobileNav;
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
      panel.classList.toggle("is-active", active);
      panel.setAttribute("aria-hidden", active ? "false" : "true");
    });
  }

E.showAdjacentTask = function showAdjacentTask(delta) {
    if (!E.state.topic) return;
    var ids = E.state.topic.tasks.map(function (task) {
      return task.id;
    });
    var idx = ids.indexOf(E.state.activeTaskId);
    if (idx < 0) return;
    var next = idx + delta;
    while (next >= 0 && next < ids.length && E.isNavTaskHidden(ids[next])) {
      next += delta;
    }
    if (next < 0 || next >= ids.length) return;
    E.setNavOpen(false);
    E.showTask(ids[next]);
  }

E.showTask = function showTask(taskId) {
    E.state.activeTaskId = taskId;
    E.resetTaskDigitBuffer();
    E.resetMcKeyboardState(taskId);
    E.setActiveTaskPanel(taskId);
    document.querySelectorAll(".ege-nav__btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.taskId === taskId);
    });

    var task = E.findTask(taskId);
    if (task && task._sectionMeta) {
      E.state.sectionMeta = task._sectionMeta;
    }
    E.syncPageModeForTask(taskId);

    E.syncNavCompletedFilter();

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
    } else {
      E.mountListeningChrome(null);
    }
    E.stopSpeakingTimers();
    if (task && task.type === "matching") E.syncMatchingCheckEnabled(taskId);
    if (task && task.type === "wordform") E.syncWordformCheckEnabled(taskId);
    if (task && (task.type === "mc" || task.type === "gapfill")) E.syncCheckButton(taskId);
    var panel = document.getElementById("panel-" + taskId);
    if (panel && window.EgeHighlight && task && task.type !== "listening" && !E.isSpeakingPractice(task)) {
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
      E.scrollMainToTop();
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

      var intro = panel.querySelector(".ege-task-intro");
      var task = panel.querySelector(".ege-task");
      if (intro) {
        var head = intro.querySelector(".ege-task-intro__head");
        var target = head || intro;
        if (tools.parentNode !== target) target.appendChild(tools);
      } else if (task) {
        panel.insertBefore(tools, task);
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

E.ensureExamBar = function ensureExamBar() {
    var bar = document.getElementById("egeExamBar");
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = "egeExamBar";
    bar.className = "ege-exam-bar";
    bar.hidden = true;
    bar.innerHTML =
      '<div class="ege-exam-points" id="egeExamPoints" hidden>' +
      '<button type="button" class="ege-exam-points__total" id="egeExamPointsTotal" aria-expanded="false" aria-controls="egeExamPointsDetail"></button>' +
      '<div class="ege-exam-points__detail" id="egeExamPointsDetail" hidden></div>' +
      "</div>" +
      '<div class="ege-exam-timer" id="egeExamTimer" hidden>' +
      '<button type="button" class="ege-exam-timer__time" id="egeExamTimerDisplay"></button>' +
      "</div>";
    var workspace = document.querySelector(".ege-workspace");
    if (workspace) workspace.insertBefore(bar, workspace.firstChild);

    var pointsBtn = bar.querySelector("#egeExamPointsTotal");
    var detail = bar.querySelector("#egeExamPointsDetail");
    if (pointsBtn && detail) {
      pointsBtn.addEventListener("click", function () {
        var open = detail.hidden;
        detail.hidden = !open;
        pointsBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    var timer = bar.querySelector("#egeExamTimer");
    var display = bar.querySelector("#egeExamTimerDisplay");
    if (timer && display) {
      display.addEventListener("click", function () {
        if (timer.classList.contains("is-armed")) E.runExamTimer();
      });
    }
    return bar;
  }

E.ensureExamTimerEl = function ensureExamTimerEl() {
    E.ensureExamBar();
    return document.getElementById("egeExamTimer");
  }

E.tickExamTimer = function tickExamTimer() {
    var el = document.getElementById("egeExamTimer");
    var display = document.getElementById("egeExamTimerDisplay");
    if (!el || !display || !E.state.examEndsAt) return;
    var left = E.state.examEndsAt - Date.now();
    display.textContent = E.formatExamClock(left);
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
  }

E.applyBrandMark = function applyBrandMark(topicId) {
    var is2027 = /^variant:2027/.test(String(topicId || ""));
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
    E.state.examMinutes = mins;
    E.state.examTimerKey = String(key || "demo");
    E.state.examEndsAt = 0;

    var started = 0;
    try {
      started = parseInt(sessionStorage.getItem(E.examTimerStorageKey(E.state.examTimerKey)), 10) || 0;
    } catch (err) {
      started = 0;
    }

    var el = E.ensureExamTimerEl();
    var display = document.getElementById("egeExamTimerDisplay");
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
      display.setAttribute("aria-label", "Start exam timer " + display.textContent);
    }
    el.setAttribute("aria-label", "Start exam timer");
    var bar = document.getElementById("egeExamBar");
    if (bar) bar.hidden = false;
    if (typeof E.syncExamPoints === "function") E.syncExamPoints();
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
    el.classList.remove("is-armed");
    el.classList.add("is-running");
    if (E.examTimerInterval) clearInterval(E.examTimerInterval);
    E.tickExamTimer();
    E.examTimerInterval = setInterval(E.tickExamTimer, 1000);
    var bar = document.getElementById("egeExamBar");
    if (bar) bar.hidden = false;
  }

E.syncTopicLayout = function syncTopicLayout() {
    E.restoreTopicLayoutIntros();
    E.restoreTopicLayoutTools();
  }

E.setRailHeadVisible = function setRailHeadVisible(visible) {
    var railHead = document.getElementById("egeRailHead");
    if (railHead) railHead.hidden = !visible;
  }

E.applySectionMeta = function applySectionMeta(section) {
    if (!section) return;
    E.state.sectionMeta = section;

    E.setRailHeadVisible(false);

    var railHead = document.getElementById("egeRailHead");
    if (railHead) {
      railHead.classList.add("ege-rail__head--logo-only");
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

    document.title = E.sectionDisplayTitle(topic) + " – Time to ЕГЭ – Yap O'Clock";
    E.applyBrandMark(topicId);
    E.setRailHeadVisible(false);

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
      page.classList.add("ege-page--topic-layout");
      page.classList.toggle(
        "ege-page--listening-task",
        E.isListeningTask(topic.tasks[0])
      );
      var main = document.getElementById("egeMain");
      if (main) {
        main.classList.toggle("ege-main--listening", E.isListeningTask(topic.tasks[0]));
      }
    }

    topic.tasks.forEach(function (task, index) {
      var max = E.taskMaxScore(task);
      var savedScore = E.state.scores[task.id] || 0;

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
      E.setNavStatus(task.id, savedScore, max);

      var shell = document.createElement("section");
      shell.className = "ege-task-panel";
      shell.id = "panel-" + task.id;
      shell.dataset.taskId = task.id;
      if (task._sectionId) shell.dataset.sectionId = task._sectionId;

      var intro = E.isSpeakingPractice(task) ? null : E.buildTaskIntro(task);
      if (intro) shell.appendChild(intro);
      shell.appendChild(E.renderTaskPanel(task));
      if (window.EgeHighlight && !E.isSpeakingPractice(task)) {
        var hl = E.highlightStoreIds(task, task.id);
        EgeHighlight.attachAll(shell, hl.topicId, hl.taskId);
      }
      shell.classList.toggle("is-active", index === 0);
      shell.setAttribute("aria-hidden", index === 0 ? "false" : "true");
      panels.appendChild(shell);
    });

    var startTaskId = topic.tasks[0].id;
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

    E.bindHideCompletedFilter();
    E.state.playlistWasComplete = E.state.playlist ? E.getPlaylistProgress().complete : false;
    E.syncPlaylistCompletionUI();
    E.showTask(startTaskId);
    E.bindTaskFlow();
    E.bindTopicNavAlign();
    E.observeTopicExercisePanel(startTaskId);
    E.scheduleTopicNavAlign(startTaskId);

    if (String(topicId || "").indexOf("variant:") !== 0) {
      E.stopExamTimer();
    }

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
          var section = sectionById[entry.section];
          if (!section || section.available === false) {
            throw new Error("Section unavailable: " + entry.section);
          }
          return E.fetchTopicJson(entry.section).then(function (topic) {
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
          E.armExamTimer(variant.timeMinutes, variant.id || "demo");
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
      .catch(function () {
        E.clearTopicLoading();
        var panels = document.getElementById("egePanels");
        if (panels) {
          panels.innerHTML =
            '<p class="ege-error">Section not found. <a href="index.html">Back to sections</a>.</p>';
        }
      });
  }
