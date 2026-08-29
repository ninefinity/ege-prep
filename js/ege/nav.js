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

    var nodes = Array.prototype.slice.call(nav.children);
    var i = 0;
    while (i < nodes.length) {
      var node = nodes[i];
      if (!node.classList.contains("ege-nav__section")) {
        i += 1;
        continue;
      }
      var hasVisible = false;
      var j = i + 1;
      while (j < nodes.length && !nodes[j].classList.contains("ege-nav__section")) {
        var btn = nodes[j];
        if (
          btn.classList.contains("ege-nav__btn") &&
          !(hide && btn.classList.contains("is-perfect") && !btn.classList.contains("is-active"))
        ) {
          hasVisible = true;
        }
        j += 1;
      }
      node.hidden = hide && !hasVisible;
      i = j;
    }

    E.syncMobileTaskControls();
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
    var currentBtn = document.getElementById("egeMobileCurrent");
    if (page) page.classList.toggle("is-nav-open", open);
    if (currentBtn) currentBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

E.syncMobileTaskControls = function syncMobileTaskControls() {
    if (!E.state.topic || !E.state.activeTaskId) return;
    var ids = E.state.topic.tasks.map(function (task) {
      return task.id;
    });
    var idx = ids.indexOf(E.state.activeTaskId);
    var prevBtn = document.getElementById("egePrevTask");
    var nextBtn = document.getElementById("egeNextTask");
    var hasPrev = false;
    var hasNext = false;
    for (var i = 0; i < ids.length; i += 1) {
      if (i === idx || E.isNavTaskHidden(ids[i])) continue;
      if (i < idx) hasPrev = true;
      if (i > idx) hasNext = true;
    }
    if (prevBtn) prevBtn.disabled = !hasPrev;
    if (nextBtn) nextBtn.disabled = !hasNext;
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
    document.querySelectorAll(".ege-task-panel").forEach(function (panel) {
      panel.hidden = panel.dataset.taskId !== taskId;
    });
    document.querySelectorAll(".ege-nav__btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.taskId === taskId);
    });

    var task = E.findTask(taskId);
    if (task && task._sectionMeta) {
      E.state.sectionMeta = task._sectionMeta;
    }
    E.syncPageModeForTask(taskId);

    var currentBtn = document.getElementById("egeMobileCurrent");
    if (currentBtn && task) {
      currentBtn.textContent = E.numberedTopicLabel(task.id, task.nav || task.title) || "Task";
    }
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
      if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
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
    if (task && E.usesTopicLayout(E.state.topicId) && task.type !== "listening") {
      E.observeTopicExercisePanel(taskId);
      E.scheduleTopicNavAlign(taskId);
      E.scrollActiveNavIntoView(taskId);
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

E.restoreTopicLayoutTitle = function restoreTopicLayoutTitle() {
    var titleSlot = document.getElementById("egeTopicToolbarTitle");
    if (!titleSlot) return;

    var title = titleSlot.querySelector(".ege-task-title");
    if (!title) return;

    var taskId = title.dataset.taskId;
    var panel = taskId ? document.getElementById("panel-" + taskId) : null;
    if (!panel) {
      document.querySelectorAll(".ege-task-panel").forEach(function (candidate) {
        if (candidate.querySelector(".ege-task-intro")) panel = candidate;
      });
    }
    if (!panel) return;

    var intro = panel.querySelector(".ege-task-intro");
    if (!intro) {
      var heroMain = document.getElementById("egeTopicHeroMain");
      intro = heroMain && heroMain.querySelector(".ege-task-intro");
    }
    if (!intro) return;

    var head = intro.querySelector(".ege-task-intro__head");
    if (head) head.appendChild(title);
    else intro.appendChild(title);
    titleSlot.textContent = "";
  }

E.restoreTopicLayoutIntros = function restoreTopicLayoutIntros() {
    E.restoreTopicLayoutTitle();
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

    if (!topicLayout && section && section.id !== "listening") {
      if (railTitle) {
        railTitle.hidden = false;
        railTitle.textContent = section.title || "";
      }
      if (examEl) {
        var label = E.formatExamRange(section.examFrom, section.examTo);
        if (label) {
          examEl.textContent = label;
          examEl.hidden = false;
        }
      }
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

E.mergeSectionTopics = function mergeSectionTopics(entries, title) {
    var tasks = [];
    entries.forEach(function (entry) {
      var section = entry.section;
      var topic = entry.topic;
      if (!topic || !topic.tasks) return;
      topic.tasks.forEach(function (task) {
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

E.appendNavSectionDivider = function appendNavSectionDivider(nav, label) {
    var divider = document.createElement("div");
    divider.className = "ege-nav__section";
    divider.textContent = label;
    nav.appendChild(divider);
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
    E.setRailHeadVisible(!E.usesTopicLayout(topicId));

    var railTitle = document.getElementById("egeRailTitle");
    if (railTitle && !E.usesTopicLayout(topicId) && !E.isListeningMode()) {
      railTitle.hidden = false;
      railTitle.textContent = E.sectionDisplayTitle(topic);
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
      var listeningFirst = E.isListeningTask(firstTask);
      page.classList.toggle("ege-page--listening", listeningFirst);
      page.classList.toggle("ege-page--topic-layout", !listeningFirst);
    }

    var lastSectionId = null;
    topic.tasks.forEach(function (task, index) {
      var max = E.taskMaxScore(task);
      var savedScore = E.state.scores[task.id] || 0;

      if (
        E.state.playlist &&
        task._sectionId &&
        task._sectionId !== lastSectionId
      ) {
        lastSectionId = task._sectionId;
        var sectionLabel =
          (task._sectionMeta && task._sectionMeta.title) || task._sectionId;
        E.appendNavSectionDivider(nav, sectionLabel);
      }

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ege-nav__btn";
      btn.id = "nav-" + task.id;
      btn.dataset.taskId = task.id;
      btn.textContent = E.numberedTopicLabel(task.id, task.nav || task.title);
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

      var intro = E.buildTaskIntro(task);
      if (intro) shell.appendChild(intro);
      shell.appendChild(E.renderTaskPanel(task));
      if (window.EgeHighlight && !E.isSpeakingPractice(task)) {
        var hl = E.highlightStoreIds(task, task.id);
        EgeHighlight.attachAll(shell, hl.topicId, hl.taskId);
      }
      shell.hidden = index !== 0;
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
    E.showTask(startTaskId);
    E.bindMobileTaskSwitch();
    E.bindTopicNavAlign();
    E.observeTopicExercisePanel(startTaskId);
    E.scheduleTopicNavAlign(startTaskId);

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

E.bindMobileTaskSwitch = function bindMobileTaskSwitch() {
    var prevBtn = document.getElementById("egePrevTask");
    var nextBtn = document.getElementById("egeNextTask");
    var currentBtn = document.getElementById("egeMobileCurrent");
    if (prevBtn && !prevBtn.dataset.bound) {
      prevBtn.dataset.bound = "1";
      prevBtn.addEventListener("click", function () {
        E.showAdjacentTask(-1);
      });
    }
    if (nextBtn && !nextBtn.dataset.bound) {
      nextBtn.dataset.bound = "1";
      nextBtn.addEventListener("click", function () {
        E.showAdjacentTask(1);
      });
    }
    if (currentBtn && !currentBtn.dataset.bound) {
      currentBtn.dataset.bound = "1";
      currentBtn.addEventListener("click", function () {
        var page = document.getElementById("egePage");
        E.setNavOpen(!(page && page.classList.contains("is-nav-open")));
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
    var partsRaw = params.get("parts");
    var group = params.get("group");
    var topicId = params.get("t");

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

E.mountMergedPlaylist = function mountMergedPlaylist(entries, title, playlistKey) {
    if (!entries.length) {
      throw new Error("No available sections");
    }
    var merged = E.mergeSectionTopics(entries, title);
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
