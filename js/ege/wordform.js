import { E } from "./runtime.js";

E.wordformExamStart = function wordformExamStart(task) {
  var instr = String((task && task.instructions) || "");
  if (/25\s*[–-]\s*29/.test(instr) && !/19\s*[–-]\s*24/.test(instr)) return 25;
  return 19;
};

E.wordformExamNum = function wordformExamNum(task, index) {
  return E.wordformExamStart(task) + index;
};

E.getWordformMark = function getWordformMark(taskId, index) {
  return document.querySelector(
    "#task-" + taskId + ' .ege-wordform-mark[data-index="' + String(index) + '"]'
  );
};

E.getWordformGap = E.getWordformMark;

E.setWordformMarkText = function setWordformMarkText(taskId, index, text) {
  var mark = E.getWordformMark(taskId, index);
  if (!mark) return;
  var body = mark.querySelector(".ege-wordform-mark__body");
  if (body) body.textContent = text;
  mark.classList.remove("is-correct", "is-wrong");
  mark.classList.toggle("is-filled", !!text);
};

E.clearWordformMark = function clearWordformMark(taskId, index, cue) {
  var mark = E.getWordformMark(taskId, index);
  if (!mark) return;
  var body = mark.querySelector(".ege-wordform-mark__body");
  if (body) body.textContent = cue || mark.dataset.cue || "";
  mark.classList.remove("is-correct", "is-wrong", "is-filled", "is-active");
};

E.syncWordformMarkFromInput = function syncWordformMarkFromInput(taskId, index, cue) {
  var prefix = E.taskPrefix(taskId);
  var input = document.getElementById(prefix + "_wf_" + index);
  var value = input ? input.value.trim() : "";
  if (value) E.setWordformMarkText(taskId, index, value);
  else E.clearWordformMark(taskId, index, cue);
};

E.syncWordformPanelUI = function syncWordformPanelUI(taskId, activeIndex) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "wordform") return;

  if (arguments.length < 2) {
    var currentActive = document.querySelector("#task-" + taskId + " .ege-wordform-mark.is-active");
    activeIndex = currentActive ? parseInt(currentActive.dataset.index, 10) : -1;
  }

  var prefix = E.taskPrefix(taskId);

  task.items.forEach(function (item, index) {
    var mark = E.getWordformMark(taskId, index);
    if (mark) mark.classList.toggle("is-active", activeIndex === index);

    var row = document.querySelector(
      "#task-" + taskId + ' .ege-wordform-row[data-index="' + String(index) + '"]'
    );
    if (row) row.classList.toggle("is-active", activeIndex === index);
  });

  var panel = document.querySelector('[data-wordform-panel="' + taskId + '"]');
  var gapNav = panel && panel.querySelector(".ege-gap-nav");
  if (gapNav && gapNav.sync) {
    var slots = task.items.map(function (_item, index) {
      return String(E.wordformExamNum(task, index));
    });
    var answeredSlots = new Set();
    task.items.forEach(function (_item, index) {
      var input = document.getElementById(prefix + "_wf_" + index);
      if (input && E.normalize(input.value)) answeredSlots.add(slots[index]);
    });
    var activeSlot =
      activeIndex != null && activeIndex >= 0 ? String(E.wordformExamNum(task, activeIndex)) : "";
    gapNav.sync(activeSlot, answeredSlots);
  }
};

E.allWordformFilled = function allWordformFilled(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "wordform") return false;
  var prefix = E.taskPrefix(taskId);
  return task.items.every(function (_item, index) {
    var input = document.getElementById(prefix + "_wf_" + index);
    return !!(input && E.normalize(input.value));
  });
};

E.syncWordformCheckEnabled = function syncWordformCheckEnabled(taskId) {
  E.syncCheckButton(taskId);
  E.syncResetButton(taskId);
  E.syncShowAnswersButton(taskId);
  E.syncWordformPanelUI(taskId);
};

E.buildWordformScoreLines = function buildWordformScoreLines(taskId, task, opts) {
  var lines = [];
  if (!task || !task.items) return lines;
  var revealKey = opts && opts.revealKey;
  var keyOnly = opts && opts.keyOnly;
  var prefix = E.taskPrefix(taskId);
  task.items.forEach(function (item, index) {
    var input = document.getElementById(prefix + "_wf_" + index);
    var raw = input ? input.value : "";
    var val = E.normalize(raw);
    var valid = E.buildAcceptedAnswers(item.answer, item.alt);
    var ok = valid.indexOf(val) !== -1;
    var num = E.wordformExamNum(task, index);
    if (keyOnly) {
      lines.push(num + " → " + item.answer);
    } else if (ok) {
      lines.push(num + ": " + raw.trim() + " ✓");
    } else if (revealKey) {
      lines.push(num + ": " + (raw.trim() || "—") + " → " + item.answer);
    } else if (raw.trim()) {
      lines.push(num + ": " + raw.trim() + " ✗");
    } else {
      lines.push(num + ": —");
    }
  });
  return lines;
};

E.wordformPassageBreakTitle = function wordformPassageBreakTitle(task, item, index) {
  if (!task || !item) return "";

  var passageTitles = task.passageTitles;
  if (passageTitles && passageTitles.length >= 2) {
    if (index === 0) return passageTitles[0];
    if (index === 3) return passageTitles[1];
    return "";
  }

  var grammarTitle = task.grammarTitle || "";
  var parts = String(grammarTitle).split(/\s*\/\s*/);
  if (parts.length >= 2) {
    if (index === 0) return parts[0].trim();
    if (index === 3) return parts[1].trim();
  }

  if (index === 0) return "";
  var navSource = grammarTitle || task.nav || "";
  parts = String(navSource).split(/\s*[\/&]\s*/);
  if (parts.length < 2) return "";
  var second = parts[1].trim();
  if (!second) return "";
  var firstWord = second.split(/\s+/)[0].toLowerCase();
  var preStart = String(item.pre || "")
    .trim()
    .toLowerCase();
  if (!firstWord || preStart.indexOf(firstWord) !== 0) return "";
  return second;
};

E.renderWordform = function renderWordform(task, topicId) {
  var max = E.taskMaxScore(task);
  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--wordform", "ege-task--panels");
  var prefix = topicId + "_" + task.id;

  var passage = document.createElement("div");
  passage.className = "ege-passage ege-wordform-passage";

  var answers = document.createElement("div");
  answers.className = "ege-wordform-answers ege-listening-answers";

  var inputs = [];
  var marks = [];
  var rows = [];
  var slots = task.items.map(function (_item, index) {
    return E.wordformExamNum(task, index);
  });

  function focusAnswer(index, opts) {
    opts = opts || {};
    E.syncWordformPanelUI(task.id, index);
    if (opts.scrollMark && marks[index]) {
      marks[index].scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    var input = inputs[index];
    if (input) {
      input.focus();
      if (opts.select && typeof input.select === "function") input.select();
    }
  }

  var passagePart = 0;

  task.items.forEach(function (item, index) {
    var examNum = E.wordformExamNum(task, index);
    var breakTitle = E.wordformPassageBreakTitle(task, item, index);
    if (breakTitle) {
      passagePart += 1;
      var breakEl = document.createElement("h3");
      breakEl.className = "ege-wordform-break";
      breakEl.textContent = passagePart + ") " + breakTitle;
      passage.appendChild(breakEl);
    }

    var line = document.createElement("p");
    line.className = "ege-wordform-line";
    if (item.pre) line.appendChild(document.createTextNode(item.pre + " "));

    var mark = document.createElement("button");
    mark.type = "button";
    mark.className = "ege-wordform-mark";
    mark.dataset.index = String(index);
    mark.dataset.exam = String(examNum);
    mark.dataset.cue = item.word || "";
    mark.setAttribute("aria-label", "Gap " + examNum + ": form of " + item.word);

    var examEl = document.createElement("span");
    examEl.className = "ege-wordform-mark__exam";
    examEl.textContent = String(examNum);
    mark.appendChild(examEl);

    var body = document.createElement("span");
    body.className = "ege-wordform-mark__body";
    body.textContent = item.word || "";
    mark.appendChild(body);

    var cueHint = document.createElement("span");
    cueHint.className = "ege-wordform-mark__cue";
    cueHint.textContent = item.word || "";
    cueHint.setAttribute("aria-hidden", "true");
    mark.appendChild(cueHint);

    mark.addEventListener("click", function () {
      focusAnswer(index, { select: true });
    });

    mark.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      focusAnswer(index, { select: true });
    });

    line.appendChild(mark);
    if (item.post) line.appendChild(document.createTextNode(" " + item.post));
    passage.appendChild(line);
    marks.push(mark);

    var row = document.createElement("div");
    row.className = "ege-listening-row ege-wordform-row";
    row.dataset.index = String(index);

    var inputId = prefix + "_wf_" + index;
    var cueId = prefix + "_wf_cue_" + index;

    var label = document.createElement("label");
    label.className = "ege-listening-row__label ege-exam-num";
    label.htmlFor = inputId;
    label.textContent = examNum + ".";

    var input = document.createElement("input");
    input.type = "text";
    input.className = "ege-input ege-wordform__input";
    input.id = inputId;
    input.setAttribute("aria-label", "Gap " + examNum + ": form of " + item.word);
    input.setAttribute("aria-describedby", cueId);
    input.autocomplete = "off";
    input.spellcheck = false;
    input.dataset.wfIndex = String(index);
    inputs.push(input);

    var cueDesc = document.createElement("span");
    cueDesc.id = cueId;
    cueDesc.className = "ege-wordform-row__cue";
    cueDesc.textContent = item.word || "";

    input.addEventListener("focus", function () {
      E.syncWordformPanelUI(task.id, index);
    });

    input.addEventListener("blur", function () {
      window.setTimeout(function () {
        var active = document.activeElement;
        var stillHere =
          active &&
          (active === input ||
            active.closest("#task-" + task.id + " .ege-wordform-mark") ||
            active.closest("#task-" + task.id + " .ege-wordform-row"));
        if (!stillHere) E.syncWordformPanelUI(task.id, -1);
      }, 0);
    });

    input.addEventListener("input", function () {
      input.classList.remove("is-correct", "is-wrong", "is-empty");
      input.removeAttribute("title");
      E.syncWordformMarkFromInput(task.id, index, item.word);
      input.classList.toggle("is-filled", !!input.value.trim());
      E.hideScoreFeedback(task.id);
      E.syncWordformCheckEnabled(task.id);
    });

    input.addEventListener("keydown", function (event) {
      var delta = 0;
      if (event.key === "Enter" || event.key === "ArrowDown") delta = 1;
      else if (event.key === "ArrowUp") delta = -1;
      else return;

      var nextInput = inputs[index + delta];
      if (!nextInput) return;
      event.preventDefault();
      focusAnswer(index + delta, { select: true, scrollMark: true });
    });

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(cueDesc);
    answers.appendChild(row);
    rows.push(row);
  });

  var gapNav = E.buildInlineGapNav(slots, function (examNum) {
    var idx = slots.indexOf(parseInt(examNum, 10));
    if (idx >= 0) focusAnswer(idx, { select: true, scrollMark: true });
  });
  gapNav.classList.add("ege-wordform-panel__nav");

  var workPanel = document.createElement("div");
  workPanel.className = "ege-panel ege-panel--work ege-wordform-panel";
  workPanel.dataset.wordformPanel = task.id;

  var head = document.createElement("div");
  head.className = "ege-wordform-panel__head";

  var labelEl = document.createElement("p");
  labelEl.className = "ege-panel__label";
  labelEl.textContent = "ANSWERS";

  head.appendChild(labelEl);
  workPanel.appendChild(head);
  workPanel.appendChild(gapNav);
  workPanel.appendChild(answers);

  var workCol = document.createElement("div");
  workCol.className = "ege-work-col";
  var scrollWrap = document.createElement("div");
  scrollWrap.className = "ege-work-scroll";
  scrollWrap.appendChild(workPanel);
  workCol.appendChild(scrollWrap);

  wrap.appendChild(
    E.buildSplit(E.buildPanel("", passage, "ege-panel--read"), workCol, "ege-split--panels")
  );
  wrap.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));

  var picks = document.createElement("div");
  picks.className = "ege-wordform-picks ege-picks-controller";
  picks.setAttribute("aria-hidden", "true");
  picks._pickSlots = slots.map(String);
  picks._pickMaxOption = 0;
  picks.setActiveGap = function (examNum) {
    if (!examNum) {
      E.syncWordformPanelUI(task.id, -1);
      return;
    }
    var idx = picks._pickSlots.indexOf(String(examNum));
    if (idx < 0) return;
    focusAnswer(idx, { select: true, scrollMark: true });
  };
  picks.getActiveGap = function () {
    var active = passage.querySelector(".ege-wordform-mark.is-active");
    if (!active) return "";
    var idx = parseInt(active.dataset.index, 10);
    return isFinite(idx) ? String(E.wordformExamNum(task, idx)) : "";
  };
  wrap.appendChild(picks);

  E.syncWordformPanelUI(task.id, -1);
  E.syncWordformCheckEnabled(task.id);
  return wrap;
};
