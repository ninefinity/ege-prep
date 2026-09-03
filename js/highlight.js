(function () {
  "use strict";

  var STORAGE_KEY = "ege-prep.highlights.v1";

  var ICON_PEN =
    '<svg class="ege-highlight-tools__icon" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M15.5 2.5l6 6-12 12H3.5v-6l12-12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M14 4l6 6" fill="none" stroke="currentColor" stroke-width="2"/>' +
    "</svg>";

  var ICON_ERASER =
    '<svg class="ege-highlight-tools__icon" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M7 21h11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M6.8 12.3L14 5.1l5.9 5.9-7.2 7.2H4.6V12.3h2.2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    "</svg>";

  function loadAll() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_err) {
      return {};
    }
  }

  function saveEntry(id, html) {
    try {
      var all = loadAll();
      if (html && html.indexOf("ege-highlight") !== -1) {
        all[id] = html;
      } else {
        delete all[id];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (_err) {
      /* ignore quota errors */
    }
  }

  function unwrapHighlight(mark) {
    var parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  }

  function selectionInside(container, range) {
    return container.contains(range.commonAncestorContainer);
  }

  function selectionBlocked(range) {
    var node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (!node || !node.closest) return false;
    return !!node.closest(
      ".ege-gap-picks, .ege-gap-insert:not(.is-filled), .ege-choice-group, button, .ege-highlight-tools, .ege-passage-column__tools, .ege-match-picks, .ege-input, .ege-wordform-mark, .ege-wordform-answers, .ege-writing-textarea"
    );
  }

  function applyHighlight(container, rangeOpt) {
    var range = rangeOpt || null;
    var sel = window.getSelection();
    var usingLiveSelection = !range;

    if (!range) {
      if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
      range = sel.getRangeAt(0);
    }

    if (!selectionInside(container, range) || selectionBlocked(range)) {
      if (usingLiveSelection && sel) sel.removeAllRanges();
      return false;
    }

    var mark = document.createElement("mark");
    mark.className = "ege-highlight";

    try {
      var contents = range.extractContents();
      if (!contents.textContent.trim()) {
        if (sel) sel.removeAllRanges();
        return false;
      }
      mark.appendChild(contents);
      range.insertNode(mark);
      if (sel) sel.removeAllRanges();
      return true;
    } catch (_err) {
      if (sel) sel.removeAllRanges();
      return false;
    }
  }

  function cloneLiveSelectionRange() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    try {
      return sel.getRangeAt(0).cloneRange();
    } catch (_err) {
      return null;
    }
  }

  function applySelectionToContainers(containers, rangeOpt) {
    var range = rangeOpt || cloneLiveSelectionRange();
    if (!range) return null;

    for (var i = 0; i < containers.length; i += 1) {
      var container = containers[i];
      if (!applyHighlight(container, range.cloneRange())) continue;
      persistContainer(container);
      return container;
    }
    return null;
  }

  function sanitizePassageHtml(container) {
    var clone = container.cloneNode(true);
    clone.querySelectorAll(".ege-gap-insert").forEach(function (insert) {
      insert.classList.remove("is-filled", "is-correct", "is-wrong");
      var text = insert.querySelector(".ege-gap-insert__text");
      if (text) text.textContent = "";
      else {
        var span = document.createElement("span");
        span.className = "ege-gap-insert__text";
        insert.appendChild(span);
      }
    });
    return clone.innerHTML;
  }

  function persistContainer(container) {
    var id = container.dataset.highlightId;
    if (id) saveEntry(id, sanitizePassageHtml(container));
  }

  function buildTaskToolbar(containers) {
    var tools = document.createElement("div");
    tools.className = "ege-highlight-tools";
    tools.setAttribute("role", "toolbar");
    tools.setAttribute("aria-label", "Инструменты для текста");

    var highlightBtn = document.createElement("button");
    highlightBtn.type = "button";
    highlightBtn.className = "ege-highlight-tools__btn";
    highlightBtn.dataset.mode = "highlight";
    highlightBtn.innerHTML = ICON_PEN;
    highlightBtn.setAttribute("aria-label", "Выделить текст");
    highlightBtn.setAttribute("title", "Highlight (H)");
    highlightBtn.setAttribute("aria-pressed", "false");

    var eraseBtn = document.createElement("button");
    eraseBtn.type = "button";
    eraseBtn.className = "ege-highlight-tools__btn";
    eraseBtn.dataset.mode = "erase";
    eraseBtn.innerHTML = ICON_ERASER;
    eraseBtn.setAttribute("aria-label", "Стереть выделение");
    eraseBtn.setAttribute("title", "Erase (R)");
    eraseBtn.setAttribute("aria-pressed", "false");

    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "ege-highlight-tools__btn ege-highlight-tools__btn--ghost";
    clearBtn.dataset.mode = "clear";
    clearBtn.textContent = "Clear";
    clearBtn.setAttribute("aria-label", "Clear all highlights");
    clearBtn.setAttribute("title", "Clear all");
    clearBtn.hidden = true;

    var mode = "none";
    var pendingHighlightRange = null;

    function setMode(next) {
      mode = next;
      highlightBtn.classList.toggle("is-active", mode === "highlight");
      eraseBtn.classList.toggle("is-active", mode === "erase");
      highlightBtn.setAttribute("aria-pressed", mode === "highlight" ? "true" : "false");
      eraseBtn.setAttribute("aria-pressed", mode === "erase" ? "true" : "false");
      containers.forEach(function (container) {
        container.classList.toggle("ege-erase-mode", mode === "erase");
      });
    }

    function syncClearBtn() {
      var hasMarks = containers.some(function (container) {
        return container.querySelector(".ege-highlight");
      });
      clearBtn.hidden = !hasMarks;
    }

    function clearAll() {
      containers.forEach(function (container) {
        container.querySelectorAll(".ege-highlight").forEach(function (mark) {
          unwrapHighlight(mark);
        });
        persistContainer(container);
      });
      syncClearBtn();
    }

    function tryHighlightSelection(rangeOpt) {
      if (!applySelectionToContainers(containers, rangeOpt || null)) return false;
      syncClearBtn();
      return true;
    }

    highlightBtn.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      pendingHighlightRange = cloneLiveSelectionRange();
      if (pendingHighlightRange) event.preventDefault();
    });

    highlightBtn.addEventListener("click", function () {
      var saved = pendingHighlightRange;
      pendingHighlightRange = null;
      if (tryHighlightSelection(saved)) return;
      setMode(mode === "highlight" ? "none" : "highlight");
    });

    eraseBtn.addEventListener("click", function () {
      pendingHighlightRange = null;
      setMode(mode === "erase" ? "none" : "erase");
    });

    clearBtn.addEventListener("click", function () {
      pendingHighlightRange = null;
      clearAll();
      setMode("none");
    });

    containers.forEach(function (container) {
      function tryHighlight() {
        if (mode !== "highlight") return;
        window.setTimeout(function () {
          if (applyHighlight(container)) {
            persistContainer(container);
            syncClearBtn();
          }
        }, 0);
      }

      container.addEventListener("mouseup", tryHighlight);
      container.addEventListener("touchend", tryHighlight);

      container.addEventListener("click", function (event) {
        if (mode !== "erase") return;
        var mark = event.target.closest(".ege-highlight");
        if (!mark || !container.contains(mark)) return;
        event.preventDefault();
        event.stopPropagation();
        unwrapHighlight(mark);
        persistContainer(container);
        syncClearBtn();
      });
    });

    tools.appendChild(highlightBtn);
    tools.appendChild(eraseBtn);
    tools.appendChild(clearBtn);

    tools.setHighlightMode = function (next) {
      if (next === "highlight" && tryHighlightSelection()) return;
      if (next === "highlight" || next === "erase" || next === "none") setMode(next);
    };

    setMode("none");
    syncClearBtn();
    return tools;
  }

  function isTypingTarget(el) {
    if (!el || el === document.body) return false;
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function bindToolShortcuts() {
    if (window._egeHighlightKeysBound) return;
    window._egeHighlightKeysBound = true;

    var holdDir = 0;
    var holdAudio = null;
    var holdRaf = 0;
    var holdStartedAt = 0;
    var holdLastTs = 0;

    function stopHoldSeek() {
      holdDir = 0;
      holdAudio = null;
      holdStartedAt = 0;
      holdLastTs = 0;
      if (holdRaf) {
        cancelAnimationFrame(holdRaf);
        holdRaf = 0;
      }
    }

    function seekAudioBy(audioEl, delta) {
      if (!audioEl || !isFinite(audioEl.duration) || audioEl.duration <= 0) return;
      audioEl.currentTime = Math.min(
        audioEl.duration,
        Math.max(0, audioEl.currentTime + delta)
      );
    }

    function holdTick(ts) {
      if (!holdDir || !holdAudio) {
        holdRaf = 0;
        return;
      }
      if (!holdLastTs) holdLastTs = ts;
      var dt = Math.min(0.05, (ts - holdLastTs) / 1000);
      holdLastTs = ts;
      var held = (ts - holdStartedAt) / 1000;
      var speed = Math.min(48, 10 + held * 18);
      seekAudioBy(holdAudio, holdDir * speed * dt);
      holdRaf = requestAnimationFrame(holdTick);
    }

    function activeListeningAudio(panel) {
      var audioEl = panel.querySelector(".ege-listening-audio audio");
      if (!audioEl) return null;
      var audioWrap = audioEl.closest(".ege-listening-audio, .ege-listening-step");
      if (audioWrap && audioWrap.hidden) return null;
      var listenStep = audioEl.closest(".ege-listening-step");
      if (listenStep && listenStep.hidden) return null;
      if (!isFinite(audioEl.duration) || audioEl.duration <= 0) return null;
      return audioEl;
    }

    document.addEventListener("keydown", function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      var key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      var panel = document.querySelector(".ege-task-panel.is-active");
      if (!panel) return;

      if (key === "ArrowLeft" || key === "ArrowRight") {
        var audioEl = activeListeningAudio(panel);
        if (!audioEl) return;
        event.preventDefault();
        var dir = key === "ArrowLeft" ? -1 : 1;
        if (event.repeat || holdDir === dir) return;
        stopHoldSeek();
        holdDir = dir;
        holdAudio = audioEl;
        holdStartedAt = performance.now();
        holdLastTs = 0;
        seekAudioBy(audioEl, dir * 5);
        holdRaf = requestAnimationFrame(holdTick);
        return;
      }

      if (event.repeat) return;

      if (key === "h" || key === "r") {
        var tools = panel.querySelector(".ege-highlight-tools");
        if (!tools || !tools.setHighlightMode) return;
        if (tools.closest("[hidden]")) return;
        event.preventDefault();
        tools.setHighlightMode(key === "h" ? "highlight" : "erase");
        return;
      }

      if (key === "p") {
        var playBtn = panel.querySelector(".ege-listening-play");
        if (!playBtn) return;
        var audioHost = playBtn.closest(
          ".ege-listening-audio, .ege-highlight-tools, .ege-listening-step"
        );
        if (audioHost && audioHost.hidden) return;
        var step = playBtn.closest(".ege-listening-step");
        if (step && step.hidden) return;
        event.preventDefault();
        playBtn.click();
      }
    });

    document.addEventListener("keyup", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      var dir = event.key === "ArrowLeft" ? -1 : 1;
      if (holdDir === dir) stopHoldSeek();
    });

    window.addEventListener("blur", stopHoldSeek);
  }

  function restoreListeningAudio(panel, task) {
    var tools = panel && panel.querySelector(".ege-highlight-tools");
    if (!tools || !task) return;

    var audio = tools.querySelector(".ege-listening-audio");
    if (!audio) return;

    var read = task.querySelector(".ege-listening-read");
    if (!read) return;

    audio.classList.remove("ege-listening-audio--toolbar");
    read.insertBefore(audio, read.firstChild);
  }

  function isHiddenHighlightHost(el) {
    var node = el.parentElement;
    while (node) {
      if (node.hasAttribute("hidden")) {
        if (node.classList && node.classList.contains("ege-task-panel")) return false;
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function passageColumnFor(task, container) {
    var start =
      container ||
      (task && task.querySelector(".ege-passage, .ege-text-block, .ege-highlightable"));
    if (start) {
      return (
        start.closest(".ege-split__read") ||
        start.closest(".ege-panel--read") ||
        start.closest(".ege-listening-exam-match__statements") ||
        start.closest(".ege-listening-exam-tfn__statements") ||
        start.closest(".ege-panel") ||
        start.closest(".ege-listening-exam-page__block") ||
        start.closest(".ege-listening-step") ||
        task
      );
    }
    if (!task) return null;
    return task.querySelector(".ege-split__read, .ege-panel--read") || task;
  }

  function mountToolsFallback(panel, task, tools) {
    if (!panel || !tools) return;
    var intro = panel.querySelector(".ege-task-intro");
    var head = intro && intro.querySelector(".ege-task-intro__head");
    if (head) {
      head.appendChild(tools);
      return;
    }
    if (intro) {
      intro.appendChild(tools);
      return;
    }
    if (task && task.parentNode) {
      task.parentNode.insertBefore(tools, task);
      return;
    }
    panel.appendChild(tools);
  }

  function mountOnPassageColumn(task, tools) {
    if (!task || !tools) return false;
    var column = passageColumnFor(task, task.querySelector(".ege-highlightable"));
    if (!column) return false;

    column.classList.add("ege-passage-column");

    var header = null;
    for (var i = 0; i < column.children.length; i++) {
      if (column.children[i].classList.contains("ege-passage-column__header")) {
        header = column.children[i];
        break;
      }
    }

    if (!header) {
      header = document.createElement("header");
      header.className = "ege-passage-column__header";
      if (column.firstChild && column.firstChild.parentNode === column) {
        column.insertBefore(header, column.firstChild);
      } else {
        column.appendChild(header);
      }
    }

    var slot = null;
    for (var j = 0; j < header.children.length; j++) {
      if (header.children[j].classList.contains("ege-passage-column__tools")) {
        slot = header.children[j];
        break;
      }
    }
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "ege-passage-column__tools";
      slot.setAttribute("role", "group");
      slot.setAttribute("aria-label", "Инструменты для текста");
      header.appendChild(slot);
    }

    if (tools.parentNode !== slot) slot.appendChild(tools);
    return true;
  }

  function attachAll(panel, topicId, taskId) {
    if (!panel) return;

    var task = panel.querySelector(".ege-task");
    if (!task) return;

    restoreListeningAudio(panel, task);

    var existing = panel.querySelector(".ege-highlight-tools");
    if (existing) existing.remove();

    var base = topicId + "_" + taskId;
    var savedAll = loadAll();
    var containers = [];

    task.querySelectorAll(".ege-passage, .ege-text-block").forEach(function (el, index) {
      if (isHiddenHighlightHost(el)) return;

      var id = base + "_h" + index;
      var hasInteractiveGaps = !!el.querySelector(".ege-gap-insert");
      var hasWordform = !!el.querySelector(".ege-wordform-mark");
      var saved = savedAll[id];
      var savedHasGaps = !!(saved && saved.indexOf("ege-gap-insert") !== -1);
      var savedHasWordform = !!(saved && saved.indexOf("ege-wordform-mark") !== -1);

      /* Skip incompatible highlight saves that would wipe interactive shells */
      if (
        saved &&
        (!hasInteractiveGaps || savedHasGaps) &&
        (!hasWordform || savedHasWordform)
      ) {
        el.innerHTML = saved;
        el.querySelectorAll(".ege-gap-insert").forEach(function (insert) {
          insert.classList.remove("is-filled", "is-correct", "is-wrong");
          var text = insert.querySelector(".ege-gap-insert__text");
          if (text) text.textContent = "";
          else {
            var span = document.createElement("span");
            span.className = "ege-gap-insert__text";
            insert.appendChild(span);
          }
        });
      }

      el.classList.add("ege-highlightable");
      el.dataset.highlightId = id;
      containers.push(el);
    });

    if (!containers.length) return;

    if (task.classList.contains("ege-task--listening")) {
      var listenKind = task.dataset.listeningKind || "";
      if (listenKind === "mc" || listenKind.indexOf("prep") === 0) return;
    }

    var tools = buildTaskToolbar(containers);
    tools.dataset.taskId = taskId;
    if (!mountOnPassageColumn(task, tools)) {
      mountToolsFallback(panel, task, tools);
    }
  }

  bindToolShortcuts();

  window.EgeHighlight = {
    attachAll: attachAll,
    mountOnPassageColumn: mountOnPassageColumn,
  };
})();
