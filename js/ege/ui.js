import { E } from "./runtime.js";

E.findTask = function findTask(taskId) {
    if (!E.state.topic) return null;
    return E.state.topic.tasks.find(function (item) {
      return item.id === taskId;
    });
  }

E.taskPrefix = function taskPrefix(taskId) {
    return E.state.topicId + "_" + taskId;
  }

E.scoreStoreTopicId = function scoreStoreTopicId(task) {
    if (task && task._sectionId) return task._sectionId;
    return E.state.topicId;
  }

E.scoreStoreTaskId = function scoreStoreTaskId(task, taskId) {
    if (task && task._sourceTaskId) return task._sourceTaskId;
    return taskId || (task && task.id) || "";
  }

E.saveTaskScore = function saveTaskScore(taskId, score, max) {
    var task = E.findTask(taskId);
    E.saveScore(E.scoreStoreTopicId(task), E.scoreStoreTaskId(task, taskId), score, max);
  }

E.clearTaskScore = function clearTaskScore(taskId) {
    var task = E.findTask(taskId);
    E.clearScore(E.scoreStoreTopicId(task), E.scoreStoreTaskId(task, taskId));
  }

E.taskSectionMeta = function taskSectionMeta(task) {
    var base = (task && task._sectionMeta) || E.state.sectionMeta || null;
    if (!task || task.examFrom == null) return base;
    var meta = base ? Object.assign({}, base) : {};
    meta.examFrom = task.examFrom;
    meta.examTo = task.examTo != null ? task.examTo : task.examFrom;
    return meta;
  }

E.isListeningTask = function isListeningTask(task) {
    return !!(task && (task.type === "listening" || task._sectionId === "listening"));
  }

E.isListeningMode = function isListeningMode() {
    var task = E.findTask(E.state.activeTaskId);
    if (task) return E.isListeningTask(task);
    if (E.state.topicId === "listening") return true;
    if (E.state.topicId && E.state.topicId.indexOf("group-Listening") === 0) return true;
    if (E.state.topicId === "parts-listening") return true;
    return false;
  }

E.highlightStoreIds = function highlightStoreIds(task, taskId) {
    return {
      topicId: E.scoreStoreTopicId(task),
      taskId: E.scoreStoreTaskId(task, taskId),
    };
  }

E.buildTaskArticle = function buildTaskArticle(task) {
    var wrap = document.createElement("article");
    wrap.className = "ege-task ege-task--panels";
    wrap.id = "task-" + task.id;
    wrap.dataset.taskId = task.id;
    return wrap;
  }

E.taskInstructionsText = function taskInstructionsText(task) {
    var text = String(task.instructions || "").trim();
    var meta = E.taskSectionMeta(task);
    if (!text && meta && meta.instructions) {
      text = String(meta.instructions).trim();
    }
    return text;
  }

  /* Shared topic layout (topic.html): matching-headings, gap-fill, reading-comprehension,
     grammar-transformations, word-formation, vocabulary-cloze. Standalone listening uses
     ege-page--listening; listening inside a variant playlist uses topic layout like other tasks. */
E.usesTopicLayoutForTask = function usesTopicLayoutForTask(task) {
    if (!task) return false;
    if (!E.isListeningTask(task)) return true;
    return !!(E.state.topicId && String(E.state.topicId).indexOf("variant:") === 0);
  }

E.usesTopicLayout = function usesTopicLayout(topicId) {
    var task = E.findTask(E.state.activeTaskId);
    if (task) return E.usesTopicLayoutForTask(task);
    var id = topicId != null ? topicId : E.state.topicId;
    if (!id) return false;
    if (id === "listening") return false;
    if (id.indexOf("group-Listening") === 0) return false;
    if (id === "parts-listening") return false;
    return true;
  }

E.syncPageModeForTask = function syncPageModeForTask(taskId) {
    var page = document.getElementById("egePage");
    if (!page) return;
    var task = E.findTask(taskId);
    var topicLayout = task && E.usesTopicLayoutForTask(task);
    page.classList.toggle("ege-page--listening", !!(task && E.isListeningTask(task) && !topicLayout));
    page.classList.toggle("ege-page--topic-layout", !!(topicLayout || (task && !E.isListeningTask(task))));
    page.classList.toggle(
      "ege-page--active-listening",
      !!(topicLayout && task && E.isListeningTask(task))
    );
  }

E.prefersReducedMotion = function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

E.formatExamRange = function formatExamRange(from, to) {
    if (from == null) return "";
    if (to == null || to === from) return String(from);
    return from + "–" + to;
  }

E.taskOrderNumber = function taskOrderNumber(taskId) {
    if (!E.state.topic || !E.state.topic.tasks) return 0;
    for (var i = 0; i < E.state.topic.tasks.length; i += 1) {
      if (E.state.topic.tasks[i].id === taskId) return i + 1;
    }
    return 0;
  }

E.numberedTopicLabel = function numberedTopicLabel(taskId, label) {
    var text = String(label || "").trim();
    if (!text) return "";
    var num = E.taskOrderNumber(taskId);
    return num ? num + ") " + text : text;
  }

E.isVariantPlaylist = function isVariantPlaylist(topicId) {
    var id = topicId != null ? topicId : E.state.topicId;
    return String(id || "").indexOf("variant:") === 0;
  }

E.sectionTaskCount = function sectionTaskCount(task) {
    if (!task || !task._sectionId || !E.state.topic || !E.state.topic.tasks) return 1;
    var n = 0;
    E.state.topic.tasks.forEach(function (entry) {
      if (entry._sectionId === task._sectionId) n += 1;
    });
    return n || 1;
  }

E.navItemLabel = function navItemLabel(task) {
    if (!task) return "";
    if (E.isVariantPlaylist()) {
      var meta = task._sectionMeta;
      if (meta && E.sectionTaskCount(task) === 1) {
        return String(meta.title || task.nav || task.title || "").trim();
      }
      return String(task.nav || task.title || "").trim();
    }
    if (E.state.playlist && task._sectionMeta) {
      var taskLabel = String(task.nav || task.title || "").trim();
      if (taskLabel) return taskLabel;
      return String(task._sectionMeta.title || task._sectionId || "").trim();
    }
    return E.numberedTopicLabel(task.id, task.nav || task.title);
  }

E.foldExamLabel = function foldExamLabel(text) {
    return String(text || "").replace(/[–—−]/g, "-");
  }

E.PANEL_LABELS = {
  read: "",
  workQuestions: "Questions",
  workAnswers: "Answers",
};

E.resolveWorkLabel = function resolveWorkLabel(kind) {
  if (kind === "questions") return E.PANEL_LABELS.workQuestions;
  if (kind === "answers") return E.PANEL_LABELS.workAnswers;
  return "";
};

E.buildWorkPanel = function buildWorkPanel(kind, inner, extraClass) {
  return E.buildPanel(E.resolveWorkLabel(kind), inner, extraClass || "ege-panel--work");
};

E.mcQuestionExamNum = function mcQuestionExamNum(task, index) {
  if (task.examFrom != null) return task.examFrom + index;
  var section = E.taskSectionMeta(task);
  if (section && section.examFrom != null) return section.examFrom + index;
  var q = task.questions && task.questions[index];
  if (q && q.num != null) return q.num;
  return index + 1;
};

E.formatMcPrompt = function formatMcPrompt(task, question, index) {
  var text = String(question.q || question.text || "")
    .trim()
    .replace(/^\d+\.\s*/, "");
  return E.mcQuestionExamNum(task, index) + ". " + text;
};

E.buildMcPrompt = function buildMcPrompt(task, question, index) {
  var num = E.mcQuestionExamNum(task, index);
  var text = String(question.q || question.text || "")
    .trim()
    .replace(/^\d+\.\s*/, "");
  var prompt = document.createElement("p");
  prompt.className = "ege-mc__prompt";
  var numEl = document.createElement("span");
  numEl.className = "ege-exam-num";
  numEl.textContent = num + ".";
  prompt.appendChild(numEl);
  if (text) prompt.appendChild(document.createTextNode(" " + text));
  return prompt;
};

E.buildSplit = function buildSplit(readEl, workEl, modifier) {
  var split = document.createElement("div");
  split.className = "ege-split" + (modifier ? " " + modifier : "");

  var read = document.createElement("div");
  read.className = "ege-split__read";
  read.appendChild(readEl);

  var work = document.createElement("div");
  work.className = "ege-split__work";
  work.appendChild(workEl);

  split.appendChild(read);
  split.appendChild(work);
  return split;
};

E.buildLongreadSplit = function buildLongreadSplit(readInner, workInner, opts) {
  opts = opts || {};

  var readScroll = document.createElement("div");
  readScroll.className = "ege-read-scroll";
  readScroll.appendChild(readInner);

  var readLabel = opts.readLabel != null ? opts.readLabel : E.PANEL_LABELS.read;
  var readPanel = E.buildPanel(readLabel, readScroll, "ege-panel--read");

  var workCol = document.createElement("div");
  workCol.className = "ege-work-col";
  var workScroll = document.createElement("div");
  workScroll.className = "ege-work-scroll";

  var workLabel = opts.workLabel;
  if (workLabel == null && opts.workLabelKind) {
    workLabel = E.resolveWorkLabel(opts.workLabelKind);
  }
  if (workLabel == null) workLabel = "";

  var workPanel =
    workInner && workInner.classList && workInner.classList.contains("ege-panel")
      ? workInner
      : E.buildPanel(workLabel, workInner, opts.workClass || "ege-panel--work");
  workScroll.appendChild(workPanel);
  workCol.appendChild(workScroll);

  return E.buildSplit(readPanel, workCol, "ege-split--panels");
};

E.buildTaskShell = function buildTaskShell(task, body, footer) {
  var wrap = E.buildTaskArticle(task);
  wrap.appendChild(body);
  if (footer) wrap.appendChild(footer);
  return wrap;
};

E.buildTaskIntro = function buildTaskIntro(task) {
    if (task.type === "listening" && !E.usesTopicLayoutForTask(task)) return null;

    var intro = document.createElement("div");
    intro.className = "ege-task-intro";

    var lead = document.createElement("div");
    lead.className = "ege-task-intro__lead";
    lead.dataset.taskId = task.id;

    var section = E.taskSectionMeta(task);
    var examLabel = section ? E.formatExamRange(section.examFrom, section.examTo) : "";

    var instrText = E.taskInstructionsText(task);
    if (
      examLabel &&
      instrText &&
      E.foldExamLabel(instrText).indexOf(E.foldExamLabel(examLabel)) !== -1
    ) {
      examLabel = "";
    }
    if (instrText || examLabel) {
      var instr = document.createElement("p");
      instr.className = "ege-instructions";
      instr.lang = "ru";

      if (examLabel) {
        var exam = document.createElement("span");
        exam.className = "ege-task-intro__exam";
        exam.textContent = examLabel;
        instr.appendChild(exam);
      }

      if (instrText) {
        if (examLabel) instr.appendChild(document.createTextNode(" "));
        instr.appendChild(document.createTextNode(instrText));
      }

      lead.appendChild(instr);
    }

    if (lead.childElementCount) {
      intro.appendChild(lead);
    }

    var titleText = String(task.title || task.nav || "").trim();
    var skipTitle =
      task.type === "listening" &&
      E.usesTopicLayoutForTask(task) &&
      typeof E.taskUsesExamSinglePage === "function" &&
      E.taskUsesExamSinglePage(task);
    if (titleText && section && section.title) {
      if (
        E.foldExamLabel(titleText).toLowerCase() === E.foldExamLabel(section.title).toLowerCase()
      ) {
        titleText = "";
      }
    }
    if (titleText && task.type !== "wordform" && !skipTitle) {
      var head = document.createElement("div");
      head.className = "ege-task-intro__head";

      var title = document.createElement("h2");
      title.className = "ege-task-title";
      title.textContent = titleText;
      head.appendChild(title);
      intro.appendChild(head);
    }

    return intro.childElementCount ? intro : null;
  }

E.replaceGapPlaceholders = function replaceGapPlaceholders(root, entries) {
    var inserts = {};
    entries.forEach(function (entry) {
      var placeholder = root.querySelector(entry.selector);
      if (!placeholder) return;

      var insert = document.createElement("span");
      insert.className = "ege-gap-insert";
      insert.dataset.gap = entry.gapId;

      var textSpan = document.createElement("span");
      textSpan.className = "ege-gap-insert__text";
      insert.appendChild(textSpan);
      placeholder.replaceWith(insert);
      inserts[entry.gapId] = insert;
    });
    return inserts;
  }

E.setRadioValue = function setRadioValue(name, value) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (radio) {
      radio.checked = radio.value === String(value);
      radio.dataset.wasChecked = radio.checked ? "1" : "0";
    });
  }

E.gradeMcQuestion = function gradeMcQuestion(name, correctVal) {
    var checked = document.querySelector('input[name="' + name + '"]:checked');
    var value = checked ? checked.value : "";

    document.querySelectorAll('input[name="' + name + '"]').forEach(function (radio) {
      var pill = radio.closest(".ege-pill");
      if (pill) pill.classList.remove("is-correct", "is-wrong");
    });

    if (!checked) return false;

    var ok = E.scoreShortAnswer ? E.scoreShortAnswer(value, correctVal) : value === correctVal;
    if (ok) {
      checked.closest(".ege-pill").classList.add("is-correct");
      return true;
    }

    checked.closest(".ege-pill").classList.add("is-wrong");
    return false;
  }

E.getGapInsert = function getGapInsert(taskId, gapId) {
    return document.querySelector(
      "#task-" + taskId + ' .ege-gap-insert[data-gap="' + String(gapId) + '"]'
    );
  }

E.markGapInsert = function markGapInsert(taskId, gapId, ok, hasValue) {
    var insert = E.getGapInsert(taskId, gapId);
    if (!insert) return;
    insert.classList.toggle("is-correct", ok);
    insert.classList.toggle("is-wrong", hasValue && !ok);
  }

E.showScoreFeedback = function showScoreFeedback(taskId, correct, max, options) {
    var scoreEl = document.getElementById("score-" + taskId);
    if (!scoreEl) return;

    // Reveal path: answer key only — no score / "All correct" celebration.
    if (options && options.revealed) {
      var keyLines =
        options.lines && options.lines.length ? options.lines : ["Answers shown."];
      scoreEl.hidden = false;
      scoreEl.textContent = keyLines.join("\n");
      scoreEl.className = "ege-task__score";
      return;
    }

    if (typeof E.isExamInProgress === "function" && E.isExamInProgress()) {
      var taskEl = document.getElementById("task-" + taskId);
      if (taskEl) taskEl.dataset.hasAttempt = "1";
      scoreEl.hidden = true;
      scoreEl.textContent = "";
      return;
    }

    if (typeof E.hidesPracticeControls === "function" && E.hidesPracticeControls()) {
      scoreEl.hidden = true;
      scoreEl.textContent = "";
      return;
    }

    var lines = [
      "Score: " +
        correct +
        " / " +
        max +
        (correct === max ? ". All correct." : ". Change the marked answers."),
    ];
    if (options && options.lines && options.lines.length) {
      lines = lines.concat(options.lines);
    }
    scoreEl.hidden = false;
    scoreEl.textContent = lines.join("\n");
    scoreEl.className =
      "ege-task__score " + (correct === max ? "is-good" : correct === 0 ? "is-bad" : "is-mixed");
  }

E.hideScoreFeedback = function hideScoreFeedback(taskId) {
    var scoreEl = document.getElementById("score-" + taskId);
    if (!scoreEl) return;
    scoreEl.hidden = true;
    scoreEl.textContent = "";
  }

E.hasGradedScore = function hasGradedScore(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    if (
      typeof E.isExamInProgress === "function" &&
      E.isExamInProgress() &&
      taskEl &&
      taskEl.dataset.hasAttempt === "1"
    ) {
      return true;
    }
    var scoreEl = document.getElementById("score-" + taskId);
    if (!scoreEl || scoreEl.hidden) return false;
    return /^Score:\s/.test(String(scoreEl.textContent || "").trim());
  }

E.clearGradedCheckState = function clearGradedCheckState(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    if (taskEl && taskEl.dataset.answersRevealed === "1") return;
    E.hideScoreFeedback(taskId);
    if (taskEl && taskEl.dataset.hasAttempt === "1") {
      delete taskEl.dataset.hasAttempt;
    }
  }

E.consumeListeningReveal = function consumeListeningReveal(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl || taskEl.dataset.revealedStep !== "1") return false;
    delete taskEl.dataset.revealedStep;
    return true;
  }

E.clearPrepNextPulse = function clearPrepNextPulse(taskId) {
    if (E.prepNextPulseTimers[taskId]) {
      window.clearTimeout(E.prepNextPulseTimers[taskId]);
      delete E.prepNextPulseTimers[taskId];
    }
    var nextBtn = document.getElementById("prep-next-" + taskId);
    if (nextBtn) nextBtn.classList.remove("ege-btn--pulse");
  }

E.showPrepNextButton = function showPrepNextButton(taskId) {
    var nextBtn = document.getElementById("prep-next-" + taskId);
    if (!nextBtn) return;
    nextBtn.hidden = false;
    if (nextBtn.classList.contains("ege-btn--pulse") || E.prepNextPulseTimers[taskId]) return;
    E.prepNextPulseTimers[taskId] = window.setTimeout(function () {
      delete E.prepNextPulseTimers[taskId];
      var btn = document.getElementById("prep-next-" + taskId);
      if (btn && !btn.hidden) btn.classList.add("ege-btn--pulse");
    }, 2000);
  }

E.hidePrepNextButton = function hidePrepNextButton(taskId) {
    E.clearPrepNextPulse(taskId);
    var nextBtn = document.getElementById("prep-next-" + taskId);
    if (nextBtn) nextBtn.hidden = true;
  }

E.showToast = function showToast(message) {
    var existing = document.querySelector(".ege-toast");
    if (existing) existing.remove();
    if (E.toastTimer) {
      window.clearTimeout(E.toastTimer);
      E.toastTimer = null;
    }

    var toast = document.createElement("div");
    toast.className = "ege-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.textContent = message;
    document.body.appendChild(toast);

    window.requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });

    E.toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
      window.setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 220);
      E.toastTimer = null;
    }, 2400);
  }

E.isVocabCloze = function isVocabCloze(task) {
    if (task.type !== "mc" || !task.passage || !task.questions || !task.questions.length) {
      return false;
    }
    if (!/\[\d+\]/.test(task.passage)) return false;
    return task.questions.every(function (question) {
      return /^\d+\.?$/.test(String(question.q).trim());
    });
  }

E.vocabGapNum = function vocabGapNum(question) {
    return String(parseInt(question.q, 10));
  }

E.resetTaskDigitBuffer = function resetTaskDigitBuffer() {
    clearTimeout(E.taskDigitBuffer.timer);
    E.taskDigitBuffer.digits = "";
    E.taskDigitBuffer.taskId = "";
    E.taskDigitBuffer.timer = null;
  }

E.resetMcKeyboardState = function resetMcKeyboardState(taskId) {
    if (taskId && E.mcKeyboardState.taskId === taskId) return;
    var prev = E.mcKeyboardState.taskId;
    E.mcKeyboardState.taskId = taskId || "";
    E.mcKeyboardState.questionIndex = -1;
    if (prev) {
      var prevEl = document.getElementById("task-" + prev);
      if (prevEl) {
        prevEl.querySelectorAll(".ege-mc-card.is-active").forEach(function (card) {
          card.classList.remove("is-active");
        });
      }
    }
  }

E.shouldIgnoreTaskKeyboard = function shouldIgnoreTaskKeyboard(event) {
    if (event.defaultPrevented) return true;
    if (event.metaKey || event.ctrlKey || event.altKey) return true;
    if (event.repeat) return true;
    if (!E.state.activeTaskId) return true;

    var target = event.target;
    if (!target) return false;
    var tag = (target.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "select") return true;
    if (tag === "input") {
      var type = (target.type || "").toLowerCase();
      if (type !== "button" && type !== "submit" && type !== "reset") return true;
    }
    if (target.isContentEditable) return true;
    return false;
  }

E.parseDigitKey = function parseDigitKey(event) {
    var key = event.key;
    var code = event.code;
    if (/^[1-9]$/.test(key)) return parseInt(key, 10);
    if (/^Digit[1-9]$/.test(code) || /^Numpad[1-9]$/.test(code)) {
      return parseInt(code.replace(/\D/g, ""), 10);
    }
    return null;
  }

E.parseLetterKey = function parseLetterKey(event) {
    if (event.key.length !== 1) return null;
    var ch = event.key.toUpperCase();
    if (ch >= "A" && ch <= "Z") return ch;
    return null;
  }

E.pushTaskDigitBuffer = function pushTaskDigitBuffer(taskId, digit, candidates, onMatch) {
    if (E.taskDigitBuffer.taskId !== taskId) E.resetTaskDigitBuffer();
    E.taskDigitBuffer.taskId = taskId;
    clearTimeout(E.taskDigitBuffer.timer);
    E.taskDigitBuffer.digits += String(digit);

    var exact = candidates.filter(function (candidate) {
      return String(candidate) === E.taskDigitBuffer.digits;
    });
    if (exact.length === 1) {
      onMatch(exact[0]);
      E.resetTaskDigitBuffer();
      return "matched";
    }

    var prefix = candidates.filter(function (candidate) {
      return String(candidate).indexOf(E.taskDigitBuffer.digits) === 0;
    });
    if (!prefix.length) {
      E.resetTaskDigitBuffer();
      return "none";
    }

    E.taskDigitBuffer.timer = setTimeout(resetTaskDigitBuffer, 450);
    return "pending";
  }

E.setActiveReadingMcQuestion = function setActiveReadingMcQuestion(taskId, index) {
    E.mcKeyboardState.taskId = taskId;
    E.mcKeyboardState.questionIndex = index;
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;
    var cards = taskEl.querySelectorAll(".ege-work-scroll .ege-mc-card, .ege-mc-stack .ege-mc-card");
    cards.forEach(function (card, i) {
      card.classList.toggle("is-active", i === index);
    });
    var card = cards[index];
    if (!card) return;
    var scrollParent = card.closest(".ege-work-scroll");
    if (scrollParent) {
      var cardRect = card.getBoundingClientRect();
      var scrollRect = scrollParent.getBoundingClientRect();
      if (cardRect.bottom > scrollRect.bottom - 4) {
        scrollParent.scrollTop += cardRect.bottom - scrollRect.bottom + 12;
      } else if (cardRect.top < scrollRect.top + 4) {
        scrollParent.scrollTop += cardRect.top - scrollRect.top - 8;
      }
      return;
    }
    card.scrollIntoView({ block: "nearest" });
  }

E.resolvePickSlotLetter = function resolvePickSlotLetter(slots, letter) {
    if (!letter || !slots || !slots.length) return "";
    for (var i = 0; i < slots.length; i += 1) {
      if (String(slots[i]).toUpperCase() === letter) return slots[i];
    }
    return "";
  }

E.handlePickAssignKeyboard = function handlePickAssignKeyboard(event, board, slots, maxOption) {
    if (!board) return false;

    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowLeft"
    ) {
      if (!slots || !slots.length) return false;
      event.preventDefault();
      E.resetTaskDigitBuffer();
      var delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      var current = "";
      if (board.getActiveLetter) current = board.getActiveLetter() || "";
      else if (board.getActiveGap) current = board.getActiveGap() || "";
      var idx = slots.indexOf(current);
      var next;
      if (idx < 0) next = delta > 0 ? slots[0] : slots[slots.length - 1];
      else next = slots[(idx + delta + slots.length) % slots.length];
      if (board.setActiveLetter) board.setActiveLetter(next);
      else if (board.setActiveGap) board.setActiveGap(next);
      return true;
    }

    var letter = E.parseLetterKey(event);
    if (letter) {
      var slot = E.resolvePickSlotLetter(slots, letter);
      if (!slot) return false;
      event.preventDefault();
      E.resetTaskDigitBuffer();
      // Prefer setActive* so typing A6 selects then assigns; activate* toggles/clears on re-press.
      if (board.setActiveLetter) board.setActiveLetter(slot);
      else if (board.setActiveGap) board.setActiveGap(slot);
      else if (board.activateLetter) board.activateLetter(slot);
      else if (board.activateGap) board.activateGap(slot);
      else return false;
      return true;
    }

    var num = E.parseDigitKey(event);
    if (num != null && maxOption > 0 && num <= maxOption && board.assignNumber) {
      event.preventDefault();
      E.resetTaskDigitBuffer();
      board.assignNumber(num);
      return true;
    }

    return false;
  }

E.isPickBoardVisible = function isPickBoardVisible(board) {
    if (!board || board.hidden) return false;
    if (board.closest("[hidden]")) return false;
    return board.getClientRects().length > 0;
  }

E.resolveActivePickBoard = function resolveActivePickBoard(taskEl) {
    if (!taskEl) return null;
    var boards = Array.prototype.slice.call(taskEl.querySelectorAll(".ege-picks-controller")).filter(
      E.isPickBoardVisible
    );
    if (!boards.length) return null;

    var focused = boards.find(function (board) {
      return board.contains(document.activeElement);
    });
    if (focused) return focused;

    var selected = boards.find(function (board) {
      return (
        (board.getActiveLetter && board.getActiveLetter()) ||
        (board.getActiveGap && board.getActiveGap())
      );
    });
    if (selected) return selected;

    return boards[0];
  }

E.handleTaskPickBoards = function handleTaskPickBoards(event, taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    var board = E.resolveActivePickBoard(taskEl);
    if (!board) return false;
    if (typeof board.refreshPickSlots === "function") board.refreshPickSlots();
    return E.handlePickAssignKeyboard(
      event,
      board,
      board._pickSlots || [],
      board._pickMaxOption || 0
    );
  }

E.mcQuestionKeyboardLabel = function mcQuestionKeyboardLabel(task, index) {
    if (task.type === "listening" && task.examFrom != null) {
      return String(task.examFrom + index);
    }
    var parsed = parseInt(String(task.questions[index].q || "").trim(), 10);
    return isFinite(parsed) ? String(parsed) : String(index + 1);
  }

E.handleMcStackKeyboard = function handleMcStackKeyboard(event, task, taskId) {
    var digit = E.parseDigitKey(event);
    if (digit == null) return false;

    var prefix = E.taskPrefix(taskId);
    var questions = task.questions || [];

    if (
      E.mcKeyboardState.taskId === taskId &&
      E.mcKeyboardState.questionIndex >= 0 &&
      questions[E.mcKeyboardState.questionIndex]
    ) {
      var activeQuestion = questions[E.mcKeyboardState.questionIndex];
      if (digit <= activeQuestion.opts.length) {
        event.preventDefault();
        E.setRadioValue(
          prefix + "_q_" + E.mcKeyboardState.questionIndex,
          String(digit - 1)
        );
        E.updateAnsweredCount(taskId);
        if (typeof E.syncCheckButton === "function") E.syncCheckButton(taskId);
        if (typeof E.syncFinishWrittenButton === "function") E.syncFinishWrittenButton();
        return true;
      }
    }

    var questionCandidates = questions.map(function (_question, index) {
      return E.mcQuestionKeyboardLabel(task, index);
    });
    var questionResult = E.pushTaskDigitBuffer(taskId, digit, questionCandidates, function (num) {
      var index = questionCandidates.indexOf(String(num));
      if (index >= 0) E.setActiveReadingMcQuestion(taskId, index);
    });
    if (questionResult !== "none") event.preventDefault();
    return questionResult !== "none";
  }

E.handleWordformKeyboard = function handleWordformKeyboard(event, task, taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    var picks = taskEl && taskEl.querySelector(".ege-wordform-picks");
    if (!picks || !task.items) return false;

    var slots = picks._pickSlots || task.items.map(function (_item, index) {
      return String(E.wordformExamNum(task, index));
    });

    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowLeft"
    ) {
      event.preventDefault();
      E.resetTaskDigitBuffer();
      var delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      var current = picks.getActiveGap ? picks.getActiveGap() : "";
      var idx = slots.indexOf(current);
      var next;
      if (idx < 0) next = delta > 0 ? slots[0] : slots[slots.length - 1];
      else next = slots[(idx + delta + slots.length) % slots.length];
      if (picks.setActiveGap) picks.setActiveGap(next);
      return true;
    }

    var digit = E.parseDigitKey(event);
    if (digit == null) return false;

    var result = E.pushTaskDigitBuffer(taskId, digit, slots, function (examNum) {
      if (picks.setActiveGap) picks.setActiveGap(String(examNum));
    });
    if (result !== "none") event.preventDefault();
    return result !== "none";
  }

E.handleTaskKeyboard = function handleTaskKeyboard(event) {
    if (E.shouldIgnoreTaskKeyboard(event)) return;

    var taskId = E.state.activeTaskId;
    var task = E.findTask(taskId);
    if (!task) return;

    var panel = document.getElementById("panel-" + taskId);
    if (panel && !panel.classList.contains("is-active")) return;

    if (typeof E.isTaskAnswersSaved === "function" && E.isTaskAnswersSaved(taskId)) return;

    if (
      (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      typeof E.handleTaskArrowNav === "function" &&
      E.handleTaskArrowNav(event)
    ) {
      return;
    }

    if (task.type === "matching" || task.type === "gapfill") {
      if (E.handleTaskPickBoards(event, taskId)) return;
    }

    if (task.type === "wordform") {
      if (E.handleWordformKeyboard(event, task, taskId)) return;
    }

    if (task.type === "listening") {
      if (E.handleTaskPickBoards(event, taskId)) return;
      if (E.handleMcStackKeyboard(event, task, taskId)) return;
      return;
    }

    if (task.type === "mc" && E.isVocabCloze(task)) {
      if (E.handleTaskPickBoards(event, taskId)) return;
      return;
    }

    if (task.type === "mc") {
      E.handleMcStackKeyboard(event, task, taskId);
    }
  }

E.loadScores = function loadScores(topicId) {
    try {
      var raw = localStorage.getItem(E.STORAGE_KEY);
      if (!raw) return {};
      var all = JSON.parse(raw);
      return all[topicId] || {};
    } catch (_err) {
      return {};
    }
  }

E.saveScore = function saveScore(topicId, taskId, score, max) {
    try {
      var raw = localStorage.getItem(E.STORAGE_KEY);
      var all = raw ? JSON.parse(raw) : {};
      if (!all[topicId]) all[topicId] = {};
      all[topicId][taskId] = { score: score, max: max, at: Date.now() };
      localStorage.setItem(E.STORAGE_KEY, JSON.stringify(all));
    } catch (_err) {
      /* ignore quota errors */
    }
  }

E.clearScore = function clearScore(topicId, taskId) {
    try {
      var raw = localStorage.getItem(E.STORAGE_KEY);
      if (!raw) return;
      var all = JSON.parse(raw);
      if (all[topicId]) {
        delete all[topicId][taskId];
        localStorage.setItem(E.STORAGE_KEY, JSON.stringify(all));
      }
    } catch (_err) {
      /* ignore */
    }
  }

E.optionRange = function optionRange(count) {
    var items = [];
    for (var i = 1; i <= count; i += 1) items.push(i);
    return items;
  }

E.buildChoiceGroup = function buildChoiceGroup(name, count, opts) {
    opts = opts || {};
    var group = document.createElement("div");
    group.className = "ege-choice-group" + (opts.text ? " ege-choice-group--mc" : "");
    group.setAttribute("role", "radiogroup");
    if (opts.label) group.setAttribute("aria-label", opts.label);

    E.optionRange(count).forEach(function (num) {
      var label = document.createElement("label");
      label.className =
        "ege-pill" + (opts.text ? " ege-pill--text ege-pill--option" : "");
      var input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = String(num);
      label.appendChild(input);
      if (opts.text && opts.text[num - 1]) {
        label.appendChild(document.createTextNode(opts.text[num - 1]));
      } else {
        label.appendChild(document.createTextNode(String(num)));
      }
      group.appendChild(label);
    });

    group.addEventListener("change", function () {
      group.querySelectorAll(".ege-pill").forEach(function (pill) {
        pill.classList.remove("is-correct", "is-wrong");
      });
    });

    return group;
  }

E.showTopicLoading = function showTopicLoading() {
    var panels = document.getElementById("egePanels");
    var page = document.getElementById("egePage");
    if (panels) {
      panels.setAttribute("aria-busy", "true");
      panels.innerHTML = '<p class="ege-loading" id="egeTopicLoading">Loading…</p>';
    }
    if (page) page.setAttribute("aria-busy", "true");
  }

E.clearTopicLoading = function clearTopicLoading() {
    var panels = document.getElementById("egePanels");
    var page = document.getElementById("egePage");
    if (panels) panels.removeAttribute("aria-busy");
    if (page) page.removeAttribute("aria-busy");
  }

E.isTaskFullyAnswered = function isTaskFullyAnswered(taskId) {
    var task = E.findTask(taskId);
    if (!task) return false;
    var prefix = E.taskPrefix(taskId);

    if (task.type === "mc") {
      return (task.questions || []).every(function (_question, index) {
        return E.getCheckedValue(prefix + "_q_" + index) !== "";
      });
    }

    if (task.type === "matching") return E.allMatchingFilled(taskId);

    if (task.type === "gapfill") {
      return (task.gaps || []).every(function (gap) {
        return E.getCheckedValue(prefix + "_gap_" + gap) !== "";
      });
    }

    if (task.type === "wordform") return E.allWordformFilled(taskId);

    return false;
  }

E.isTaskAllCorrect = function isTaskAllCorrect(taskId) {
    var task = E.findTask(taskId);
    if (!task || !E.isTaskFullyAnswered(taskId)) return false;
    var prefix = E.taskPrefix(taskId);

    if (task.type === "matching") {
      return task.texts.every(function (item) {
        return (
          String(E.getCheckedValue(prefix + "_" + item.letter)) ===
          String(task.answers[item.letter])
        );
      });
    }

    if (task.type === "gapfill") {
      return task.gaps.every(function (gap) {
        return (
          String(E.getCheckedValue(prefix + "_gap_" + gap)) === String(task.answers[gap])
        );
      });
    }

    if (task.type === "mc") {
      return (task.questions || []).every(function (question, index) {
        return (
          String(E.getCheckedValue(prefix + "_q_" + index)) === String(question.correct)
        );
      });
    }

    if (task.type === "wordform") {
      return task.items.every(function (item, index) {
        var input = document.getElementById(prefix + "_wf_" + index);
        if (!input) return false;
        var valid = E.buildAcceptedAnswers(item.answer, item.alt);
        return valid.indexOf(E.normalize(input.value)) !== -1;
      });
    }

    return false;
  };

E.syncShowAnswersButton = function syncShowAnswersButton(taskId) {
    var showBtn = document.getElementById("show-" + taskId);
    if (!showBtn) return;
    var task = E.findTask(taskId);
    if (!task || task.type === "listening") return;

    var taskEl = document.getElementById("task-" + taskId);
    var revealed = taskEl && taskEl.dataset.answersRevealed === "1";
    var examLocked =
      typeof E.hidesShowAnswers === "function" && E.hidesShowAnswers();
    showBtn.hidden = revealed || E.isTaskAllCorrect(taskId) || examLocked;
  };

E.taskHasProgress = function taskHasProgress(taskId) {
    var task = E.findTask(taskId);
    if (!task) return false;

    var taskEl = document.getElementById("task-" + taskId);
    if (
      taskEl &&
      (taskEl.dataset.answersRevealed === "1" || taskEl.dataset.hasAttempt === "1")
    ) {
      return true;
    }

    if (task.type === "speaking" || task.type === "speaking-questions") {
      if (typeof E.isSpeakingMarkedComplete === "function" && E.isSpeakingMarkedComplete(taskId)) {
        return true;
      }
      if (!taskEl) return false;
      var timers = taskEl.querySelectorAll(".ege-speaking-timer");
      for (var ti = 0; ti < timers.length; ti += 1) {
        var wrap = timers[ti];
        if (wrap.classList.contains("is-running") || wrap.classList.contains("is-done")) {
          return true;
        }
        var duration = parseInt(wrap.dataset.duration, 10);
        var display = wrap.querySelector(".ege-speaking-timer__display");
        if (!display || !duration) continue;
        var parts = String(display.textContent || "").split(":");
        if (parts.length < 2) continue;
        var remaining =
          (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
        if (remaining < duration) return true;
      }
      return false;
    }

    var prefix = E.taskPrefix(taskId);

    if (task.type === "matching") {
      return (task.texts || []).some(function (item) {
        return E.getCheckedValue(prefix + "_" + item.letter) !== "";
      });
    }

    if (task.type === "gapfill") {
      return (task.gaps || []).some(function (gap) {
        return E.getCheckedValue(prefix + "_gap_" + gap) !== "";
      });
    }

    if (task.type === "mc") {
      return (task.questions || []).some(function (_question, index) {
        return E.getCheckedValue(prefix + "_q_" + index) !== "";
      });
    }

    if (task.type === "wordform") {
      return (task.items || []).some(function (_item, index) {
        var input = document.getElementById(prefix + "_wf_" + index);
        return !!(input && E.normalize(input.value));
      });
    }

    if (task.type === "writing") {
      var draft = document.getElementById("writing-draft-" + taskId);
      return !!(draft && E.normalize(draft.value));
    }

    if (task.type === "listening") {
      if (E.getListeningStep(taskId) > 1) return true;
      if (E.isPrepMatchingUnlocked(taskId) || E.isPrepMatchPassed(taskId)) return true;
      if (E.isListeningGapsPassed(taskId) || E.isListeningMcPassed(taskId)) return true;

      if (task.prep && task.prep.gapFill && task.prep.gapFill.items) {
        if (E.countPrepGapFilled(prefix, task.prep.gapFill.items) > 0) return true;
      }
      if (task.prep && task.prep.matching && task.prep.matching.expressions) {
        for (var mi = 0; mi < task.prep.matching.expressions.length; mi += 1) {
          var expr = task.prep.matching.expressions[mi];
          if (E.getCheckedValue(prefix + "_prep_m_" + expr.id)) return true;
        }
      }
      var gaps = E.getActiveListeningGaps ? E.getActiveListeningGaps(task) : task.gaps || [];
      for (var gi = 0; gi < gaps.length; gi += 1) {
        var gapInput = document.getElementById(prefix + "_gap_" + gaps[gi].num);
        if (gapInput && E.normalize(gapInput.value)) return true;
      }
      return (task.questions || []).some(function (_q, index) {
        return E.getCheckedValue(prefix + "_q_" + index) !== "";
      });
    }

    return false;
  };

E.syncResetButton = function syncResetButton(taskId) {
    var resetBtn = document.getElementById("reset-" + taskId);
    if (!resetBtn) return;
    if (typeof E.hidesPracticeControls === "function" && E.hidesPracticeControls()) {
      resetBtn.hidden = true;
      return;
    }
    resetBtn.hidden = !E.taskHasProgress(taskId);
    resetBtn.disabled = false;
  };

E.syncCheckButton = function syncCheckButton(taskId) {
    var checkBtn = document.getElementById("check-" + taskId);
    if (!checkBtn) return;
    if (typeof E.hidesPracticeControls === "function" && E.hidesPracticeControls()) {
      checkBtn.hidden = true;
      checkBtn.disabled = true;
      return;
    }
    var task = E.findTask(taskId);
    if (!task || task.type === "listening") return;

    var taskEl = document.getElementById("task-" + taskId);
    var revealed = taskEl && taskEl.dataset.answersRevealed === "1";
    var ready = E.isTaskFullyAnswered(taskId) && !revealed;
    var hide = revealed || E.hasGradedScore(taskId);

    checkBtn.hidden = hide;
    if (hide) {
      checkBtn.disabled = true;
      checkBtn.title = "";
      return;
    }

    checkBtn.disabled = !ready;
    checkBtn.title = ready ? "" : "Answer all questions first";
  }

E.updateAnsweredCount = function updateAnsweredCount(taskId) {
    E.syncCheckButton(taskId);
    E.syncResetButton(taskId);
    E.syncShowAnswersButton(taskId);
    if (typeof E.syncSaveAnswersButton === "function") E.syncSaveAnswersButton(taskId);
    if (
      typeof E.isPlacementExam === "function" &&
      E.isPlacementExam() &&
      typeof E.syncExamPoints === "function"
    ) {
      E.syncExamPoints();
    }
  }

E.syncMcChoiceGroup = function syncMcChoiceGroup(group) {
    var work =
      group.closest(".ege-work-scroll") ||
      group.closest(".ege-split__work") ||
      group.closest(".ege-panel--work");
    var scrollTop = work ? work.scrollTop : 0;
    group.querySelectorAll(".ege-pill").forEach(function (pill) {
      pill.classList.remove("is-correct", "is-wrong");
    });
    var taskEl = group.closest("[data-task-id]");
    if (taskEl) {
      var tid = taskEl.dataset.taskId;
      E.clearGradedCheckState(tid);
      E.updateAnsweredCount(tid);
      var listeningTask = E.findTask(tid);
      if (listeningTask && listeningTask.type === "listening") {
        E.syncListeningMcFooterUI(tid);
      }
    }
    var vocabPicks = group.closest(".ege-vocab-picks");
    if (vocabPicks && vocabPicks.syncInserts) vocabPicks.syncInserts();
    if (work) work.scrollTop = scrollTop;
  }

E.buildMcChoiceGroup = function buildMcChoiceGroup(name, options, label) {
    var group = document.createElement("div");
    group.className = "ege-choice-group ege-choice-group--mc";
    group.setAttribute("role", "radiogroup");
    if (label) group.setAttribute("aria-label", label);

    options.forEach(function (opt, optIndex) {
      var pill = document.createElement("label");
      pill.className = "ege-pill ege-pill--text ege-pill--option";
      var input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = String(optIndex);
      input.dataset.wasChecked = "0";
      input.autocomplete = "off";
      input.addEventListener("click", function () {
        if (input.dataset.wasChecked === "1") {
          input.checked = false;
          input.dataset.wasChecked = "0";
          E.syncMcChoiceGroup(group);
          return;
        }
      });
      pill.appendChild(input);
      pill.appendChild(document.createTextNode((optIndex + 1) + ") " + opt));
      group.appendChild(pill);
    });

    group.addEventListener("change", function () {
      group.querySelectorAll('input[type="radio"]').forEach(function (radio) {
        radio.dataset.wasChecked = radio.checked ? "1" : "0";
      });
      E.syncMcChoiceGroup(group);
    });

    return group;
  }

E.buildRefStrip = function buildRefStrip(label, items) {
    var wrap = document.createElement("div");
    wrap.className = "ege-ref-strip";
    if (label) wrap.setAttribute("aria-label", label);

    var list = document.createElement("ol");
    list.className = "ege-ref__list";
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    wrap.appendChild(list);
    return wrap;
  }

E.wirePickableRefList = function wirePickableRefList(list, onPick, itemLabel) {
    if (!list) return;
    list.classList.add("ege-ref__list--pickable");
    list.querySelectorAll("li").forEach(function (li, index) {
      var num = index + 1;
      li.dataset.value = String(num);
      li.setAttribute("role", "button");
      li.tabIndex = 0;
      li.setAttribute("aria-label", (itemLabel || "Option") + " " + num);
      li.addEventListener("click", function () {
        onPick(num);
      });
      li.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onPick(num);
      });
    });
  }

E.buildAnswerTrack = function buildAnswerTrack(slots, onSelect) {
    var track = document.createElement("div");
    track.className = "ege-answer-track";
    track.setAttribute("aria-label", "Your answers");

    var row = document.createElement("div");
    row.className = "ege-answer-track__row";

    slots.forEach(function (slot) {
      var cell = document.createElement("div");
      cell.className = "ege-answer-track__cell";
      cell.dataset.slot = String(slot.id);

      var slotEl = document.createElement("span");
      slotEl.className = "ege-answer-track__slot";
      slotEl.textContent = slot.label;

      var valEl = document.createElement("span");
      valEl.className = "ege-answer-track__val";
      cell.appendChild(slotEl);
      cell.appendChild(valEl);

      if (onSelect) {
        cell.setAttribute("role", "button");
        cell.tabIndex = 0;
        cell.setAttribute("aria-label", "Select " + slot.label);
        cell.addEventListener("click", function () {
          onSelect(slot.id);
        });
        cell.addEventListener("keydown", function (event) {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onSelect(slot.id);
        });
      }

      row.appendChild(cell);
    });

    track.appendChild(row);
    return track;
  }

E.getAnswerTrackCell = function getAnswerTrackCell(taskId, slotId) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return null;
    return taskEl.querySelector('.ege-answer-track__cell[data-slot="' + slotId + '"]');
  }

E.getMatchingTextBlock = function getMatchingTextBlock(taskId, letter) {
    var root = document.querySelector("#task-" + taskId + " .ege-match-texts");
    return root ? root.querySelector('[data-letter="' + letter + '"]') : null;
  }

E.buildPanel = function buildPanel(label, content, extraClass) {
    var panel = document.createElement("div");
    panel.className = "ege-panel" + (extraClass ? " " + extraClass : "");

    if (label) {
      var labelEl = document.createElement("p");
      labelEl.className = "ege-panel__label";
      labelEl.textContent = label;
      panel.appendChild(labelEl);
    }
    panel.appendChild(content);
    return panel;
  }

E.appendStandardTaskActions = function appendStandardTaskActions(actions, taskId, options) {
    var opts = options || {};
    var placement =
      typeof E.hidesPracticeControls === "function" && E.hidesPracticeControls();

    if (!opts.omitCheck && !placement) {
      var checkBtn = document.createElement("button");
      checkBtn.type = "button";
      checkBtn.className = "ege-btn ege-btn--primary";
      checkBtn.id = "check-" + taskId;
      checkBtn.textContent = "Check answers";
      checkBtn.disabled = true;
      checkBtn.title = "Answer all questions first";
      if (opts.checkHidden) checkBtn.hidden = true;
      checkBtn.addEventListener("click", function () {
        E.checkTask(taskId);
      });
      actions.appendChild(checkBtn);
    }

    if (!opts.omitReset && !placement) {
      var resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "ege-btn ege-btn--ghost";
      resetBtn.id = "reset-" + taskId;
      resetBtn.textContent = "Reset";
      resetBtn.hidden = true;
      E.bindResetButton(resetBtn, taskId);
      actions.appendChild(resetBtn);
    }

    if (opts.showAnswers && !(typeof E.hidesShowAnswers === "function" && E.hidesShowAnswers())) {
      var showBtn = document.createElement("button");
      showBtn.type = "button";
      showBtn.className = "ege-btn ege-btn--ghost";
      showBtn.id = "show-" + taskId;
      showBtn.textContent = "Show answers";
      if (opts.showHidden) showBtn.hidden = true;
      showBtn.addEventListener("click", function () {
        E.revealTask(taskId);
      });
      actions.appendChild(showBtn);
    }

    if (typeof E.appendSaveAnswersAction === "function") {
      E.appendSaveAnswersAction(actions, taskId);
    }
  }

E.bindResetButton = function bindResetButton(btn, taskId) {
    var armed = false;
    var timer = 0;
    btn.title = "Сбросить это задание";
    btn.setAttribute("aria-label", "Сбросить это задание");

    function disarm() {
      armed = false;
      btn.textContent = "Reset";
      btn.classList.remove("is-armed");
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
    }

    btn.addEventListener("click", function () {
      if (!armed) {
        armed = true;
        btn.textContent = "Reset?";
        btn.classList.add("is-armed");
        timer = window.setTimeout(disarm, 4000);
        return;
      }
      disarm();
      E.resetTask(taskId);
    });
  }

E.buildTaskFooter = function buildTaskFooter(taskId, max, options) {
    options = options || {};
    var footer = document.createElement("div");
    footer.className = "ege-task__footer";
    if (options.scoreBeforeActions) footer.classList.add("ege-task__footer--score-first");

    var actions = document.createElement("div");
    actions.className = "ege-task__actions";

    (options.extrasBefore || []).forEach(function (el) {
      actions.appendChild(el);
    });

    if (options.doneButton) {
      var completeBtn = document.createElement("button");
      completeBtn.type = "button";
      completeBtn.className = "ege-btn ege-btn--ghost ege-btn--small";
      completeBtn.id = "complete-" + taskId;
      completeBtn.textContent = options.doneLabel || "Done";
      completeBtn.addEventListener("click", function () {
        if (typeof options.onDone === "function") options.onDone(taskId);
        else if (typeof E.markSpeakingComplete === "function") E.markSpeakingComplete(taskId);
      });
      actions.appendChild(completeBtn);

      if (!options.omitReset) {
        var doneResetBtn = document.createElement("button");
        doneResetBtn.type = "button";
        doneResetBtn.className = "ege-btn ege-btn--ghost ege-btn--small";
        doneResetBtn.id = "reset-" + taskId;
        doneResetBtn.textContent = "Reset";
        doneResetBtn.hidden = true;
        E.bindResetButton(doneResetBtn, taskId);
        actions.appendChild(doneResetBtn);
      }
    } else {
      E.appendStandardTaskActions(actions, taskId, options);
    }

    (options.extras || options.extrasAfter || []).forEach(function (el) {
      actions.appendChild(el);
    });

    var score = document.createElement("p");
    score.className = "ege-task__score";
    score.id = "score-" + taskId;
    score.hidden = true;
    score.setAttribute("aria-live", "polite");

    if (options.scoreBeforeActions) {
      footer.appendChild(score);
      footer.appendChild(actions);
    } else {
      footer.appendChild(actions);
      footer.appendChild(score);
    }

    footer.dataset.max = String(max);
    if (!options.doneButton) {
      E.syncCheckButton(taskId);
      E.syncResetButton(taskId);
      E.syncShowAnswersButton(taskId);
    } else {
      E.syncResetButton(taskId);
    }
    return footer;
  }
