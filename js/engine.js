(function () {
  "use strict";

  var STORAGE_KEY = "ege-prep.scores.v1";
  var LISTENING_TARGET_GAPS = 15;

  function normalize(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function swapWholeWord(input, fromWord, toWord) {
    var pattern = new RegExp("\\b" + escapeRegExp(fromWord) + "\\b", "g");
    return input.replace(pattern, toWord);
  }

  function generateSpellingVariants(value) {
    var out = [];

    function pushVariant(next) {
      if (next && next !== value && out.indexOf(next) === -1) out.push(next);
    }

    // -ise/-ize family (realise/realize, organised/organized, etc.)
    pushVariant(value.replace(/([a-z]{3,})ise\b/g, "$1ize"));
    pushVariant(value.replace(/([a-z]{3,})ised\b/g, "$1ized"));
    pushVariant(value.replace(/([a-z]{3,})ises\b/g, "$1izes"));
    pushVariant(value.replace(/([a-z]{3,})ising\b/g, "$1izing"));
    pushVariant(value.replace(/([a-z]{3,})isation\b/g, "$1ization"));
    pushVariant(value.replace(/([a-z]{3,})isations\b/g, "$1izations"));
    pushVariant(value.replace(/([a-z]{3,})ize\b/g, "$1ise"));
    pushVariant(value.replace(/([a-z]{3,})ized\b/g, "$1ised"));
    pushVariant(value.replace(/([a-z]{3,})izes\b/g, "$1ises"));
    pushVariant(value.replace(/([a-z]{3,})izing\b/g, "$1ising"));
    pushVariant(value.replace(/([a-z]{3,})ization\b/g, "$1isation"));
    pushVariant(value.replace(/([a-z]{3,})izations\b/g, "$1isations"));

    // High-frequency BrE/AmE lexical pairs.
    [
      ["colour", "color"],
      ["favourite", "favorite"],
      ["favour", "favor"],
      ["honour", "honor"],
      ["labour", "labor"],
      ["neighbour", "neighbor"],
      ["centre", "center"],
      ["theatre", "theater"],
      ["metre", "meter"],
      ["litre", "liter"],
      ["defence", "defense"],
      ["offence", "offense"],
      ["travelling", "traveling"],
      ["travelled", "traveled"],
      ["traveller", "traveler"],
      ["cancelling", "canceling"],
      ["cancelled", "canceled"],
      ["jewellery", "jewelry"],
      ["dialogue", "dialog"],
    ].forEach(function (pair) {
      pushVariant(swapWholeWord(value, pair[0], pair[1]));
      pushVariant(swapWholeWord(value, pair[1], pair[0]));
    });

    return out;
  }

  function buildAcceptedAnswers(answer, alt) {
    var accepted = {};
    var queue = [];

    function add(value) {
      var normalized = normalize(value);
      if (!normalized || accepted[normalized]) return;
      accepted[normalized] = true;
      queue.push(normalized);
    }

    add(answer);
    (alt || []).forEach(add);

    for (var i = 0; i < queue.length; i += 1) {
      generateSpellingVariants(queue[i]).forEach(add);
    }

    return Object.keys(accepted);
  }

  function taskMaxScore(task) {
    if (task.type === "matching") return task.texts.length;
    if (task.type === "gapfill") return task.gaps.length;
    if (task.type === "mc") return task.questions.length;
    if (task.type === "wordform") return task.items.length;
    if (task.type === "listening") {
      var gapCount = getActiveListeningGaps(task).length;
      var questionCount = task.questions ? task.questions.length : 0;
      return gapCount + questionCount;
    }
    return 0;
  }

  function getListeningGaps(task) {
    return task && task.type === "listening" ? task.gaps || [] : [];
  }

  function buildListeningRun(selectedSourceGaps) {
    return (selectedSourceGaps || []).map(function (gap, index) {
      return {
        num: index + 1,
        sourceNum: gap.num,
        answer: gap.answer,
        alt: gap.alt || [],
      };
    });
  }

  function computeRunStats(items) {
    if (!items.length) return { adjacentPairs: 0, maxRun: 0 };
    var adjacentPairs = 0;
    var run = 1;
    var maxRun = 1;
    for (var i = 1; i < items.length; i += 1) {
      if (items[i].num - items[i - 1].num === 1) {
        adjacentPairs += 1;
        run += 1;
        if (run > maxRun) maxRun = run;
      } else {
        run = 1;
      }
    }
    return { adjacentPairs: adjacentPairs, maxRun: maxRun };
  }

  function chooseListeningGaps(task) {
    var all = getListeningGaps(task).slice().sort(function (a, b) {
      return a.num - b.num;
    });
    var target = Math.min(LISTENING_TARGET_GAPS, all.length);
    if (target === all.length) return all;

    var best = null;
    var bestScore = Infinity;

    for (var attempt = 0; attempt < 260; attempt += 1) {
      var shuffled = all.slice();
      for (var i = shuffled.length - 1; i > 0; i -= 1) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }
      var sample = shuffled.slice(0, target).sort(function (a, b) {
        return a.num - b.num;
      });
      var stats = computeRunStats(sample);
      var score = stats.adjacentPairs * 100 + stats.maxRun * 10;
      if (score < bestScore) {
        bestScore = score;
        best = sample;
        if (score === 0) break;
      }
    }

    return best || all.slice(0, target);
  }

  function getActiveListeningGaps(task) {
    var allSource = getListeningGaps(task);
    if (!allSource.length) return [];

    var selectedSource = state.listeningSelections[task.id];
    if (!selectedSource || !selectedSource.length) {
      selectedSource = chooseListeningGaps(task);
      state.listeningSelections[task.id] = selectedSource;
    }

    var run = state.listeningRuns[task.id];
    if (!run || !run.length) {
      run = buildListeningRun(selectedSource);
      state.listeningRuns[task.id] = run;
    }
    return run;
  }

  function getListeningStep(taskId) {
    return state.listeningSteps[taskId] || 1;
  }

  function taskHasSplitPrep(task) {
    if (!task || !task.prep) return false;
    var gapItems = task.prep.gapFill && task.prep.gapFill.items;
    var matchItems = task.prep.matching && task.prep.matching.expressions;
    return !!(gapItems && gapItems.length && matchItems && matchItems.length);
  }

  function getListeningStepKind(task, step) {
    if (!task) return null;
    if (taskHasSplitPrep(task)) {
      if (step === 1) return "prep-gap";
      if (step === 2) return "prep-match";
      if (step === 3) return "listening";
      if (step === 4) return "mc";
      return null;
    }
    if (task.prep) {
      if (step === 1) return "prep";
      if (step === 2) return "listening";
      if (step === 3) return "mc";
      return null;
    }
    if (step === 1) return "listening";
    if (step === 2) return "mc";
    return null;
  }

  function isPrepMatchingComplete(taskId) {
    var task = findTask(taskId);
    if (!task || !task.prep || !task.prep.matching || !task.prep.matching.expressions) return true;
    if (!isPrepMatchingUnlocked(taskId)) return false;
    var prefix = taskPrefix(taskId);
    var expressions = task.prep.matching.expressions;
    for (var i = 0; i < expressions.length; i += 1) {
      if (!getCheckedValue(prefix + "_prep_m_" + expressions[i].id)) return false;
    }
    return true;
  }

  function isListeningStepComplete(taskId, step) {
    var task = findTask(taskId);
    if (!task || task.type !== "listening") return false;
    var prefix = taskPrefix(taskId);
    var kind = getListeningStepKind(task, step);

    if (kind === "prep-gap") return isPrepMatchingUnlocked(taskId);
    if (kind === "prep-match") return isPrepMatchPassed(taskId);
    if (kind === "prep") return isListeningPrepComplete(taskId);

    if (kind === "listening") {
      return isListeningGapsPassed(taskId);
    }

    if (kind === "mc") {
      return (task.questions || []).every(function (_question, index) {
        return !!getCheckedValue(prefix + "_q_" + index);
      });
    }

    return false;
  }

  function canGoToListeningStep(taskId, targetStep) {
    var current = getListeningStep(taskId);
    if (targetStep === current) return true;
    if (targetStep < current) return true;
    for (var step = 1; step < targetStep; step += 1) {
      if (!isListeningStepComplete(taskId, step)) return false;
    }
    return true;
  }

  function setListeningStep(taskId, step) {
    if (!canGoToListeningStep(taskId, step)) return;
    state.listeningSteps[taskId] = step;
    syncListeningStepUI(taskId);
    if (state.activeTaskId === taskId) {
      syncListeningInstructions(taskId);
    }
  }

  function listeningGapMax(task) {
    return getActiveListeningGaps(task).length;
  }

  function listeningMcMax(task) {
    return task.questions ? task.questions.length : 0;
  }

  function listeningStepInstructions(task, step) {
    var kind = getListeningStepKind(task, step);
    if (kind === "mc") {
      return (
        "Вы услышите интервью. В заданиях 3–9 запишите в поле ответа цифру 1, 2 или 3, " +
        "соответствующую выбранному Вами варианту ответа. Вы услышите запись дважды."
      );
    }
    if (kind === "listening") {
      return "Вы услышите запись дважды. Заполните пропуски в тексте словами, которые вы услышите.";
    }
    return "";
  }

  function syncListeningProgressUI(taskId) {
    var progress = document.getElementById("listening-progress-" + taskId);
    if (!progress) return;

    var step = getListeningStep(taskId);

    progress.querySelectorAll(".ege-listening-progress__step").forEach(function (btn) {
      var num = parseInt(btn.dataset.step, 10);
      btn.classList.toggle("is-current", num === step);
      btn.classList.toggle("is-complete", isListeningStepComplete(taskId, num));
      btn.disabled = !canGoToListeningStep(taskId, num);
    });

    progress.querySelectorAll(".ege-listening-progress__line").forEach(function (line, index) {
      line.classList.toggle("is-complete", isListeningStepComplete(taskId, index + 1));
    });

    syncListeningPrepVisibility(taskId);
  }

  function syncListeningInstructions(taskId) {
    var task = findTask(taskId);
    var instructions = document.getElementById("egeInstructions");
    if (!task || task.type !== "listening" || !instructions) return;

    var text = listeningStepInstructions(task, getListeningStep(taskId));
    if (!text) {
      instructions.hidden = true;
      instructions.textContent = "";
      return;
    }

    instructions.hidden = false;
    instructions.textContent = text;
  }

  function syncListeningStepUI(taskId) {
    var task = findTask(taskId);
    if (!task || task.type !== "listening") return;

    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;

    var step = getListeningStep(taskId);
    var kind = getListeningStepKind(task, step);
    hideScoreFeedback(taskId);
    var prepStep = taskEl.querySelector(".ege-listening-step--prep");
    var gapsStep = taskEl.querySelector(".ege-listening-step--gaps");
    var mcStep = taskEl.querySelector(".ege-listening-step--mc");
    if (prepStep) {
      prepStep.hidden = kind !== "prep-gap" && kind !== "prep-match" && kind !== "prep";
    }
    if (gapsStep) gapsStep.hidden = kind !== "listening";
    if (mcStep) mcStep.hidden = kind !== "mc";

    taskEl.dataset.listeningStep = String(step);
    if (kind) taskEl.dataset.listeningKind = kind;
    else delete taskEl.dataset.listeningKind;
    syncListeningProgressUI(taskId);
    syncListeningPrepVisibility(taskId);

    var panel = document.getElementById("panel-" + taskId);
    if (panel && window.EgeHighlight) {
      EgeHighlight.attachAll(panel, state.topicId, taskId);
    }

    var checkBtn = document.getElementById("check-" + taskId);

    if (kind === "prep-gap" || kind === "prep-match" || kind === "prep") {
      syncListeningPrepFooterUI(taskId);
      if (kind === "prep-gap" && isPrepMatchingUnlocked(taskId)) {
        var gapWrap = taskEl.querySelector(".ege-prep-gapfill");
        if (gapWrap && !gapWrap.classList.contains("is-review")) {
          setPrepGapReviewMode(taskId, true);
        }
      }
    } else {
      var prepFillEl = document.getElementById("prep-fill-" + taskId);
      if (prepFillEl) prepFillEl.hidden = true;
      if (kind === "listening") {
        hideListeningFinishButtons(taskId);
        syncListeningGapsFooterUI(taskId);
      } else if (kind === "mc") {
        hidePrepNextButton(taskId);
        syncListeningMcFooterUI(taskId);
      } else {
        hideListeningFinishButtons(taskId);
        if (checkBtn) checkBtn.hidden = false;
        var resetBtn = document.getElementById("reset-" + taskId);
        if (resetBtn) resetBtn.hidden = false;
        hidePrepNextButton(taskId);
      }
    }
    if (kind === "prep-gap" || kind === "prep-match" || kind === "prep") {
      hideListeningFinishButtons(taskId);
    }
    syncListeningPrepGapInstructionUI(taskId);
    if (state.topicId === "listening" && state.activeTaskId === taskId) {
      scheduleListeningNavAlign(taskId);
    }
  }

  function findTask(taskId) {
    if (!state.topic) return null;
    return state.topic.tasks.find(function (item) {
      return item.id === taskId;
    });
  }

  function taskPrefix(taskId) {
    return state.topicId + "_" + taskId;
  }

  function buildTaskArticle(task) {
    var wrap = document.createElement("article");
    wrap.className = "ege-task ege-task--panels";
    wrap.id = "task-" + task.id;
    wrap.dataset.taskId = task.id;
    return wrap;
  }

  function taskInstructionsText(task) {
    var text = String(task.instructions || "").trim();
    if (!text && state.sectionMeta && state.sectionMeta.instructions) {
      text = String(state.sectionMeta.instructions).trim();
    }
    return text;
  }

  /* Shared topic layout (topic.html): matching-headings, gap-fill, reading-comprehension,
     word-formation, vocabulary-cloze. Listening uses ege-page--listening instead. */
  function usesTopicLayout(topicId) {
    var id = topicId != null ? topicId : state.topicId;
    return !!id && id !== "listening";
  }

  function formatExamRange(from, to) {
    if (from == null) return "";
    if (to == null || to === from) return String(from);
    return from + "–" + to;
  }

  function foldExamLabel(text) {
    return String(text || "").replace(/[–—−]/g, "-");
  }

  function buildTaskIntro(task) {
    if (task.type === "listening") return null;

    var intro = document.createElement("div");
    intro.className = "ege-task-intro";

    var lead = document.createElement("div");
    lead.className = "ege-task-intro__lead";
    lead.dataset.taskId = task.id;

    var section = state.sectionMeta;
    var examLabel = section ? formatExamRange(section.examFrom, section.examTo) : "";

    var instrText = taskInstructionsText(task);
    if (
      examLabel &&
      instrText &&
      foldExamLabel(instrText).indexOf(foldExamLabel(examLabel)) !== -1
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

    var titleText = String(task.title || "").trim();
    if (titleText) {
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

  function replaceGapPlaceholders(root, entries) {
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

  function setRadioValue(name, value) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (radio) {
      radio.checked = radio.value === String(value);
      radio.dataset.wasChecked = radio.checked ? "1" : "0";
    });
  }

  function gradeMcQuestion(name, correctVal) {
    var checked = document.querySelector('input[name="' + name + '"]:checked');
    var value = checked ? checked.value : "";

    document.querySelectorAll('input[name="' + name + '"]').forEach(function (radio) {
      var pill = radio.closest(".ege-pill");
      if (pill) pill.classList.remove("is-correct", "is-wrong");
    });

    if (!checked) return false;

    if (value === correctVal) {
      checked.closest(".ege-pill").classList.add("is-correct");
      return true;
    }

    checked.closest(".ege-pill").classList.add("is-wrong");
    return false;
  }

  function getGapInsert(taskId, gapId) {
    return document.querySelector(
      "#task-" + taskId + ' .ege-gap-insert[data-gap="' + String(gapId) + '"]'
    );
  }

  function markGapInsert(taskId, gapId, ok, hasValue) {
    var insert = getGapInsert(taskId, gapId);
    if (!insert) return;
    insert.classList.toggle("is-correct", ok);
    insert.classList.toggle("is-wrong", hasValue && !ok);
  }

  function showScoreFeedback(taskId, correct, max, options) {
    var scoreEl = document.getElementById("score-" + taskId);
    if (!scoreEl) return;

    // Reveal path: answer key only — no score / "All correct" celebration.
    if (options && options.revealed) {
      var keyLines =
        options.lines && options.lines.length ? options.lines : ["Answers shown."];
      scoreEl.hidden = false;
      scoreEl.textContent = keyLines.join("\n");
      scoreEl.className = "ege-task__score";
      setCheckGateHint(taskId, "");
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
    setCheckGateHint(taskId, "");
  }

  function hideScoreFeedback(taskId) {
    var scoreEl = document.getElementById("score-" + taskId);
    if (!scoreEl) return;
    scoreEl.hidden = true;
    scoreEl.textContent = "";
  }

  function consumeListeningReveal(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl || taskEl.dataset.revealedStep !== "1") return false;
    delete taskEl.dataset.revealedStep;
    return true;
  }

  var prepNextPulseTimers = {};

  function clearPrepNextPulse(taskId) {
    if (prepNextPulseTimers[taskId]) {
      window.clearTimeout(prepNextPulseTimers[taskId]);
      delete prepNextPulseTimers[taskId];
    }
    var nextBtn = document.getElementById("prep-next-" + taskId);
    if (nextBtn) nextBtn.classList.remove("ege-btn--pulse");
  }

  function showPrepNextButton(taskId) {
    var nextBtn = document.getElementById("prep-next-" + taskId);
    if (!nextBtn) return;
    nextBtn.hidden = false;
    if (nextBtn.classList.contains("ege-btn--pulse") || prepNextPulseTimers[taskId]) return;
    prepNextPulseTimers[taskId] = window.setTimeout(function () {
      delete prepNextPulseTimers[taskId];
      var btn = document.getElementById("prep-next-" + taskId);
      if (btn && !btn.hidden) btn.classList.add("ege-btn--pulse");
    }, 2000);
  }

  function hidePrepNextButton(taskId) {
    clearPrepNextPulse(taskId);
    var nextBtn = document.getElementById("prep-next-" + taskId);
    if (nextBtn) nextBtn.hidden = true;
  }

  var toastTimer = null;

  function showToast(message) {
    var existing = document.querySelector(".ege-toast");
    if (existing) existing.remove();
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
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

    toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
      window.setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 220);
      toastTimer = null;
    }, 2400);
  }

  function isVocabCloze(task) {
    if (task.type !== "mc" || !task.passage || !task.questions || !task.questions.length) {
      return false;
    }
    if (!/\[\d+\]/.test(task.passage)) return false;
    return task.questions.every(function (question) {
      return /^\d+\.?$/.test(String(question.q).trim());
    });
  }

  function vocabGapNum(question) {
    return String(parseInt(question.q, 10));
  }

  var taskDigitBuffer = { taskId: "", digits: "", timer: null };
  var mcKeyboardState = { taskId: "", questionIndex: -1 };

  function resetTaskDigitBuffer() {
    clearTimeout(taskDigitBuffer.timer);
    taskDigitBuffer.digits = "";
    taskDigitBuffer.taskId = "";
    taskDigitBuffer.timer = null;
  }

  function resetMcKeyboardState(taskId) {
    if (taskId && mcKeyboardState.taskId === taskId) return;
    var prev = mcKeyboardState.taskId;
    mcKeyboardState.taskId = taskId || "";
    mcKeyboardState.questionIndex = -1;
    if (prev) {
      var prevEl = document.getElementById("task-" + prev);
      if (prevEl) {
        prevEl.querySelectorAll(".ege-mc-card.is-active").forEach(function (card) {
          card.classList.remove("is-active");
        });
      }
    }
  }

  function shouldIgnoreTaskKeyboard(event) {
    if (event.defaultPrevented) return true;
    if (event.metaKey || event.ctrlKey || event.altKey) return true;
    if (event.repeat) return true;
    if (!state.activeTaskId) return true;

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

  function parseDigitKey(event) {
    var key = event.key;
    var code = event.code;
    if (/^[1-9]$/.test(key)) return parseInt(key, 10);
    if (/^Digit[1-9]$/.test(code) || /^Numpad[1-9]$/.test(code)) {
      return parseInt(code.replace(/\D/g, ""), 10);
    }
    return null;
  }

  function parseLetterKey(event) {
    if (event.key.length !== 1) return null;
    var ch = event.key.toUpperCase();
    if (ch >= "A" && ch <= "Z") return ch;
    return null;
  }

  function pushTaskDigitBuffer(taskId, digit, candidates, onMatch) {
    if (taskDigitBuffer.taskId !== taskId) resetTaskDigitBuffer();
    taskDigitBuffer.taskId = taskId;
    clearTimeout(taskDigitBuffer.timer);
    taskDigitBuffer.digits += String(digit);

    var exact = candidates.filter(function (candidate) {
      return String(candidate) === taskDigitBuffer.digits;
    });
    if (exact.length === 1) {
      onMatch(exact[0]);
      resetTaskDigitBuffer();
      return "matched";
    }

    var prefix = candidates.filter(function (candidate) {
      return String(candidate).indexOf(taskDigitBuffer.digits) === 0;
    });
    if (!prefix.length) {
      resetTaskDigitBuffer();
      return "none";
    }

    taskDigitBuffer.timer = setTimeout(resetTaskDigitBuffer, 450);
    return "pending";
  }

  function setActiveReadingMcQuestion(taskId, index) {
    mcKeyboardState.taskId = taskId;
    mcKeyboardState.questionIndex = index;
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;
    var cards = taskEl.querySelectorAll(".ege-work-scroll .ege-mc-card, .ege-mc-stack .ege-mc-card");
    cards.forEach(function (card, i) {
      card.classList.toggle("is-active", i === index);
    });
    var card = cards[index];
    if (card) card.scrollIntoView({ block: "nearest" });
  }

  function resolvePickSlotLetter(slots, letter) {
    if (!letter || !slots || !slots.length) return "";
    for (var i = 0; i < slots.length; i += 1) {
      if (String(slots[i]).toUpperCase() === letter) return slots[i];
    }
    return "";
  }

  function handlePickAssignKeyboard(event, board, slots, maxOption) {
    if (!board) return false;

    var letter = parseLetterKey(event);
    if (letter) {
      var slot = resolvePickSlotLetter(slots, letter);
      var activate = board.activateLetter || board.activateGap;
      if (slot && activate) {
        event.preventDefault();
        resetTaskDigitBuffer();
        activate.call(board, slot);
      }
      return true;
    }

    var num = parseDigitKey(event);
    if (num != null && num <= maxOption && board.assignNumber) {
      event.preventDefault();
      resetTaskDigitBuffer();
      board.assignNumber(num);
      return true;
    }

    return false;
  }

  function handleTaskKeyboard(event) {
    if (shouldIgnoreTaskKeyboard(event)) return;

    var taskId = state.activeTaskId;
    var task = findTask(taskId);
    if (!task) return;

    var panel = document.getElementById("panel-" + taskId);
    if (panel && panel.hidden) return;

    if (task.type === "matching") {
      var matchBoard = document.querySelector("#task-" + taskId + " .ege-match-picks");
      handlePickAssignKeyboard(
        event,
        matchBoard,
        task.texts.map(function (item) {
          return item.letter;
        }),
        task.headings.length
      );
      return;
    }

    if (task.type === "gapfill") {
      var gapBoard = document.querySelector("#task-" + taskId + " .ege-gap-picks");
      handlePickAssignKeyboard(event, gapBoard, task.gaps, task.options.length);
      return;
    }

    if (task.type === "mc" && isVocabCloze(task)) {
      var vocabBoard = document.querySelector("#task-" + taskId + " .ege-vocab-picks");
      if (!vocabBoard) return;

      var digit = parseDigitKey(event);
      if (digit == null) return;

      var activeGap = vocabBoard.getActiveGap ? vocabBoard.getActiveGap() : "";
      if (activeGap) {
        var activeIndex = task.questions.findIndex(function (question) {
          return vocabGapNum(question) === activeGap;
        });
        if (activeIndex >= 0 && digit <= task.questions[activeIndex].opts.length) {
          event.preventDefault();
          setRadioValue(taskPrefix(taskId) + "_q_" + activeIndex, String(digit - 1));
          if (vocabBoard.syncInserts) vocabBoard.syncInserts();
          return;
        }
      }

      var gapCandidates = task.questions.map(vocabGapNum);
      var gapResult = pushTaskDigitBuffer(taskId, digit, gapCandidates, function (gapNum) {
        if (vocabBoard.setActiveGap) vocabBoard.setActiveGap(gapNum);
      });
      if (gapResult !== "none") event.preventDefault();
      return;
    }

    if (task.type === "mc" && task.passage) {
      digit = parseDigitKey(event);
      if (digit == null) return;

      var prefix = taskPrefix(taskId);
      if (
        mcKeyboardState.taskId === taskId &&
        mcKeyboardState.questionIndex >= 0 &&
        digit <= task.questions[mcKeyboardState.questionIndex].opts.length
      ) {
        event.preventDefault();
        setRadioValue(prefix + "_q_" + mcKeyboardState.questionIndex, String(digit - 1));
        updateAnsweredCount(taskId);
        syncCheckButton(taskId);
        return;
      }

      var questionCandidates = task.questions.map(function (question) {
        return String(parseInt(String(question.q).trim(), 10));
      });
      var questionResult = pushTaskDigitBuffer(taskId, digit, questionCandidates, function (_num) {
        var index = questionCandidates.indexOf(String(_num));
        if (index >= 0) setActiveReadingMcQuestion(taskId, index);
      });
      if (questionResult !== "none") event.preventDefault();
    }
  }

  function loadScores(topicId) {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var all = JSON.parse(raw);
      return all[topicId] || {};
    } catch (_err) {
      return {};
    }
  }

  function saveScore(topicId, taskId, score, max) {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var all = raw ? JSON.parse(raw) : {};
      if (!all[topicId]) all[topicId] = {};
      all[topicId][taskId] = { score: score, max: max, at: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (_err) {
      /* ignore quota errors */
    }
  }

  function clearScore(topicId, taskId) {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var all = JSON.parse(raw);
      if (all[topicId]) {
        delete all[topicId][taskId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      }
    } catch (_err) {
      /* ignore */
    }
  }

  function optionRange(count) {
    var items = [];
    for (var i = 1; i <= count; i += 1) items.push(i);
    return items;
  }

  function buildChoiceGroup(name, count, opts) {
    opts = opts || {};
    var group = document.createElement("div");
    group.className = "ege-choice-group";
    group.setAttribute("role", "radiogroup");
    if (opts.label) group.setAttribute("aria-label", opts.label);

    optionRange(count).forEach(function (num) {
      var label = document.createElement("label");
      label.className = "ege-pill" + (opts.text ? " ege-pill--text" : "");
      var input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = String(num);
      label.appendChild(input);
      if (opts.text && opts.text[num - 1]) {
        label.appendChild(document.createTextNode((num) + ") " + opts.text[num - 1]));
      } else {
        label.appendChild(document.createTextNode(String(num)));
      }
      group.appendChild(label);
    });

    return group;
  }

  function setCheckGateHint(taskId, message) {
    var hint = document.getElementById("check-hint-" + taskId);
    if (!hint) return;
    if (message) {
      hint.textContent = message;
      hint.hidden = false;
    } else {
      hint.textContent = "";
      hint.hidden = true;
    }
  }

  function showTopicLoading() {
    var panels = document.getElementById("egePanels");
    var page = document.getElementById("egePage");
    if (panels) {
      panels.setAttribute("aria-busy", "true");
      panels.innerHTML = '<p class="ege-loading" id="egeTopicLoading">Loading…</p>';
    }
    if (page) page.setAttribute("aria-busy", "true");
  }

  function clearTopicLoading() {
    var panels = document.getElementById("egePanels");
    var page = document.getElementById("egePage");
    if (panels) panels.removeAttribute("aria-busy");
    if (page) page.removeAttribute("aria-busy");
  }

  function isTaskFullyAnswered(taskId) {
    var task = findTask(taskId);
    if (!task) return false;
    var prefix = taskPrefix(taskId);

    if (task.type === "mc") {
      return (task.questions || []).every(function (_question, index) {
        return getCheckedValue(prefix + "_q_" + index) !== "";
      });
    }

    if (task.type === "matching") return allMatchingFilled(taskId);

    if (task.type === "gapfill") {
      return (task.gaps || []).every(function (gap) {
        return getCheckedValue(prefix + "_gap_" + gap) !== "";
      });
    }

    if (task.type === "wordform") return allWordformFilled(taskId);

    return false;
  }

  function syncCheckButton(taskId) {
    var checkBtn = document.getElementById("check-" + taskId);
    if (!checkBtn) return;
    var task = findTask(taskId);
    if (!task || task.type === "listening") return;

    var taskEl = document.getElementById("task-" + taskId);
    var revealed = taskEl && taskEl.dataset.answersRevealed === "1";
    var ready = isTaskFullyAnswered(taskId) && !revealed;

    checkBtn.hidden = false;
    checkBtn.disabled = !ready;
    if (revealed) checkBtn.title = "Answers already shown";
    else if (!ready) checkBtn.title = "Answer all questions first";
    else checkBtn.title = "";
  }

  function updateAnsweredCount(taskId) {
    syncCheckButton(taskId);
  }

  function syncMcChoiceGroup(group) {
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
      updateAnsweredCount(tid);
      var listeningTask = findTask(tid);
      if (listeningTask && listeningTask.type === "listening") {
        syncListeningMcFooterUI(tid);
      }
    }
    var vocabPicks = group.closest(".ege-vocab-picks");
    if (vocabPicks && vocabPicks.syncInserts) vocabPicks.syncInserts();
    if (work) work.scrollTop = scrollTop;
  }

  function buildMcChoiceGroup(name, options, label) {
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
          syncMcChoiceGroup(group);
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
      syncMcChoiceGroup(group);
    });

    return group;
  }

  function buildRefStrip(label, items) {
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

  function wirePickableRefList(list, onPick, itemLabel) {
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

  function buildAnswerTrack(slots, onSelect) {
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

  function getAnswerTrackCell(taskId, slotId) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return null;
    return taskEl.querySelector('.ege-answer-track__cell[data-slot="' + slotId + '"]');
  }

  function getMatchingTextBlock(taskId, letter) {
    var root = document.querySelector("#task-" + taskId + " .ege-match-texts");
    return root ? root.querySelector('[data-letter="' + letter + '"]') : null;
  }

  function buildPanel(label, content, extraClass) {
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

  function buildMatchingRead(task, topicId, textsRoot) {
    var prefix = topicId + "_" + task.id;
    var read = document.createElement("div");
    read.className = "ege-match-read";

    var refStrip = buildRefStrip("Headings", task.headings);
    var refList = refStrip.querySelector(".ege-ref__list");
    read.appendChild(refStrip);

    var track = buildAnswerTrack(
      task.texts.map(function (item) {
        return { id: item.letter, label: item.letter };
      }),
      null
    );
    read.appendChild(track);

    var picks = document.createElement("div");
    picks.className = "ege-match-picks ege-picks-controller";
    picks.setAttribute("aria-hidden", "true");

    var hidden = document.createElement("div");
    hidden.className = "ege-match-hidden";

    var activeLetter = "";

    function radioName(letter) {
      return prefix + "_" + letter;
    }

    function syncCheckGate() {
      syncMatchingCheckEnabled(task.id);
    }

    function clearLetterMarks(letter) {
      if (textsRoot) {
        var block = textsRoot.querySelector('[data-letter="' + letter + '"]');
        if (block) block.classList.remove("is-correct", "is-wrong", "is-empty");
      }
      if (refList) {
        refList.querySelectorAll("li").forEach(function (li) {
          li.classList.remove("is-correct", "is-wrong");
        });
      }
      var cell = track.querySelector('[data-slot="' + letter + '"]');
      if (cell) cell.classList.remove("is-correct", "is-wrong", "is-empty");
    }

    function syncActiveText() {
      if (!textsRoot) return;
      textsRoot.querySelectorAll(".ege-text-block").forEach(function (block) {
        block.classList.toggle("is-active", block.dataset.letter === activeLetter);
      });
    }

    function syncTextBlocks() {
      if (!textsRoot) return;
      textsRoot.querySelectorAll(".ege-text-block").forEach(function (block) {
        var letter = block.dataset.letter;
        var val = getCheckedValue(radioName(letter));
        block.classList.toggle("is-used", !!val);
      });
    }

    function syncTrack() {
      track.querySelectorAll(".ege-answer-track__cell").forEach(function (cell) {
        var letter = cell.dataset.slot;
        var val = getCheckedValue(radioName(letter));
        var valEl = cell.querySelector(".ege-answer-track__val");
        if (valEl) valEl.textContent = val || "";
        cell.classList.toggle("is-filled", !!val);
        cell.classList.toggle("is-active", letter === activeLetter);
      });
    }

    function syncNumberRow() {
      var value = activeLetter ? getCheckedValue(radioName(activeLetter)) : "";
      if (!refList) return;
      refList.querySelectorAll("li").forEach(function (li, index) {
        li.classList.toggle("is-selected", li.dataset.value === value);
        li.classList.remove("is-correct", "is-wrong");
      });
    }

    function syncUsedState() {
      var usedNumbers = {};
      task.texts.forEach(function (item) {
        var val = getCheckedValue(radioName(item.letter));
        if (val) usedNumbers[val] = true;
      });

      if (refList) {
        refList.querySelectorAll("li").forEach(function (li) {
          li.classList.toggle("is-used", !!usedNumbers[li.dataset.value]);
        });
      }

      syncTextBlocks();
      syncTrack();
    }

    function clearLetter(letter) {
      clearChoiceGroup(radioName(letter));
      clearLetterMarks(letter);
      if (letter === activeLetter) syncNumberRow();
      syncUsedState();
      hideScoreFeedback(task.id);
      syncCheckGate();
    }

    function nextEmptyLetter(fromLetter) {
      var letters = task.texts.map(function (item) {
        return item.letter;
      });
      var start = letters.indexOf(fromLetter);
      if (start < 0) start = 0;
      for (var i = 1; i <= letters.length; i += 1) {
        var letter = letters[(start + i) % letters.length];
        if (!getCheckedValue(radioName(letter))) return letter;
      }
      return fromLetter;
    }

    function assignNumber(num) {
      if (!activeLetter) {
        var first = nextEmptyLetter("");
        if (!first && task.texts.length) first = task.texts[0].letter;
        if (first) setActiveLetter(first);
      }
      if (!activeLetter) return;
      var current = getCheckedValue(radioName(activeLetter));
      if (current === String(num)) {
        clearLetter(activeLetter);
        return;
      }

      task.texts.forEach(function (item) {
        if (item.letter === activeLetter) return;
        if (getCheckedValue(radioName(item.letter)) === String(num)) {
          clearChoiceGroup(radioName(item.letter));
          clearLetterMarks(item.letter);
        }
      });

      setRadioValue(radioName(activeLetter), num);
      clearLetterMarks(activeLetter);
      hideScoreFeedback(task.id);
      syncNumberRow();
      syncUsedState();
      syncCheckGate();

      var next = nextEmptyLetter(activeLetter);
      if (next !== activeLetter) setActiveLetter(next);
    }

    function setActiveLetter(letter) {
      activeLetter = letter || "";
      syncActiveText();
      syncNumberRow();
      syncTrack();
    }

    function activateTextBlock(letter) {
      if (letter === activeLetter) {
        if (getCheckedValue(radioName(letter))) {
          clearLetter(letter);
        } else {
          setActiveLetter("");
        }
        return;
      }
      setActiveLetter(letter);
    }

    task.texts.forEach(function (item) {
      hidden.appendChild(
        buildChoiceGroup(radioName(item.letter), task.headings.length, {
          label: "Heading for text " + item.letter,
        })
      );
    });

    if (textsRoot) {
      textsRoot.querySelectorAll(".ege-text-block").forEach(function (block) {
        block.setAttribute("role", "button");
        block.tabIndex = 0;
        block.setAttribute("aria-label", "Select text " + block.dataset.letter);
        block.addEventListener("click", function () {
          activateTextBlock(block.dataset.letter);
        });
        block.addEventListener("keydown", function (event) {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          activateTextBlock(block.dataset.letter);
        });
      });
    }

    task.texts.forEach(function (item) {
      var cell = track.querySelector('[data-slot="' + item.letter + '"]');
      if (!cell) return;
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
      cell.setAttribute("aria-label", "Select text " + item.letter);
      cell.addEventListener("click", function () {
        activateTextBlock(item.letter);
      });
      cell.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateTextBlock(item.letter);
      });
    });

    wirePickableRefList(refList, assignNumber, "Heading");

    picks.dataset.taskId = task.id;
    picks.syncUsedState = syncUsedState;
    picks.syncNumberRow = syncNumberRow;
    picks.setActiveLetter = setActiveLetter;
    picks.assignNumber = assignNumber;
    picks.clearLetter = clearLetter;
    picks.activateLetter = activateTextBlock;
    picks.getActiveLetter = function () {
      return activeLetter;
    };

    picks.appendChild(hidden);
    read.appendChild(picks);
    syncActiveText();
    syncUsedState();
    syncCheckGate();
    return read;
  }

  function allMatchingFilled(taskId) {
    var task = findTask(taskId);
    if (!task || task.type !== "matching") return false;
    var prefix = taskPrefix(taskId);
    return task.texts.every(function (item) {
      return !!getCheckedValue(prefix + "_" + item.letter);
    });
  }

  function syncMatchingCheckEnabled(taskId) {
    syncCheckButton(taskId);
  }

  function buildMatchingScoreLines(taskId, task, opts) {
    var lines = [];
    if (!task || !task.texts) return lines;
    var revealKey = opts && opts.revealKey;
    var keyOnly = opts && opts.keyOnly;
    var prefix = taskPrefix(taskId);
    task.texts.forEach(function (item) {
      var value = getCheckedValue(prefix + "_" + item.letter);
      var expected = String(task.answers[item.letter]);
      if (keyOnly) {
        lines.push(item.letter + " → " + expected);
      } else if (value && value === expected) {
        lines.push(item.letter + ": " + value + " ✓");
      } else if (revealKey) {
        lines.push(item.letter + ": " + (value || "—") + " → " + expected);
      } else if (value) {
        lines.push(item.letter + ": " + value + " ✗");
      } else {
        lines.push(item.letter + ": —");
      }
    });
    return lines;
  }

  function buildGapfillPicker(task, topicId, inserts, refList) {
    var prefix = topicId + "_" + task.id;

    var track = buildAnswerTrack(
      task.gaps.map(function (gap) {
        return { id: gap, label: gap };
      }),
      null
    );

    var picks = document.createElement("div");
    picks.className = "ege-gap-picks ege-picks-controller";
    picks.setAttribute("aria-hidden", "true");

    var hidden = document.createElement("div");
    hidden.className = "ege-match-hidden";

    var activeGap = "";

    function radioName(gap) {
      return prefix + "_gap_" + gap;
    }

    function updateInsert(gap, num) {
      /* Live query: highlight restore can replace passage DOM and orphan cached nodes */
      var insert = getGapInsert(task.id, gap) || inserts[gap];
      if (!insert || !insert.isConnected) return;
      inserts[gap] = insert;
      var textSpan = insert.querySelector(".ege-gap-insert__text");
      if (!textSpan) {
        textSpan = document.createElement("span");
        textSpan.className = "ege-gap-insert__text";
        insert.appendChild(textSpan);
      }
      if (num) {
        textSpan.textContent = task.options[parseInt(num, 10) - 1] || "";
        insert.classList.add("is-filled");
      } else {
        textSpan.textContent = "";
        insert.classList.remove("is-filled");
      }
    }

    function syncActiveGap() {
      task.gaps.forEach(function (gap) {
        var insert = getGapInsert(task.id, gap) || inserts[gap];
        if (insert) insert.classList.toggle("is-active", gap === activeGap);
      });
    }

    function syncNumberRow() {
      var value = activeGap ? getCheckedValue(radioName(activeGap)) : "";
      if (!refList) return;
      refList.querySelectorAll("li").forEach(function (li) {
        li.classList.toggle("is-selected", li.dataset.value === value);
        li.classList.remove("is-correct", "is-wrong");
      });
    }

    function syncTrack() {
      track.querySelectorAll(".ege-answer-track__cell").forEach(function (cell) {
        var gap = cell.dataset.slot;
        var val = getCheckedValue(radioName(gap));
        var valEl = cell.querySelector(".ege-answer-track__val");
        if (valEl) valEl.textContent = val || "";
        cell.classList.toggle("is-filled", !!val);
        cell.classList.toggle("is-active", gap === activeGap);
      });
    }

    function syncUsedState() {
      var usedNumbers = {};
      task.gaps.forEach(function (gap) {
        var val = getCheckedValue(radioName(gap));
        if (val) usedNumbers[val] = true;
      });

      if (refList) {
        refList.querySelectorAll("li").forEach(function (li) {
          li.classList.toggle("is-used", !!usedNumbers[li.dataset.value]);
        });
      }

      syncTrack();
    }

    function clearGapMarks(gap) {
      var insert = getGapInsert(task.id, gap) || inserts[gap];
      if (insert) insert.classList.remove("is-correct", "is-wrong");
      if (refList) {
        refList.querySelectorAll("li").forEach(function (li) {
          li.classList.remove("is-correct", "is-wrong");
        });
      }
      var cell = track.querySelector('[data-slot="' + gap + '"]');
      if (cell) cell.classList.remove("is-correct", "is-wrong", "is-empty");
    }

    function clearGap(gap) {
      clearChoiceGroup(radioName(gap));
      updateInsert(gap, null);
      clearGapMarks(gap);
      if (gap === activeGap) syncNumberRow();
      syncUsedState();
      syncCheckButton(task.id);
    }

    function nextEmptyGap(fromGap) {
      var start = task.gaps.indexOf(fromGap);
      if (start < 0) start = 0;
      for (var i = 1; i <= task.gaps.length; i += 1) {
        var gap = task.gaps[(start + i) % task.gaps.length];
        if (!getCheckedValue(radioName(gap))) return gap;
      }
      return fromGap || task.gaps[0];
    }

    function assignNumber(num) {
      if (!activeGap) {
        var first = nextEmptyGap("");
        if (first) setActiveGap(first);
      }
      if (!activeGap) return;
      var current = getCheckedValue(radioName(activeGap));
      if (current === String(num)) {
        clearGap(activeGap);
        return;
      }

      task.gaps.forEach(function (gap) {
        if (gap === activeGap) return;
        if (getCheckedValue(radioName(gap)) === String(num)) {
          clearChoiceGroup(radioName(gap));
          updateInsert(gap, null);
          clearGapMarks(gap);
        }
      });

      setRadioValue(radioName(activeGap), num);
      updateInsert(activeGap, String(num));
      clearGapMarks(activeGap);
      syncNumberRow();
      syncUsedState();
      syncCheckButton(task.id);

      var next = nextEmptyGap(activeGap);
      if (next !== activeGap) setActiveGap(next);
    }

    function setActiveGap(gap) {
      activeGap = gap || "";
      syncActiveGap();
      syncNumberRow();
      syncTrack();
    }

    function activateGapInsert(gap) {
      if (gap === activeGap) {
        if (getCheckedValue(radioName(gap))) {
          clearGap(gap);
        } else {
          setActiveGap("");
        }
        return;
      }
      setActiveGap(gap);
    }

    task.gaps.forEach(function (gap) {
      hidden.appendChild(
        buildChoiceGroup(radioName(gap), task.options.length, {
          label: "Sentence part for gap " + gap,
        })
      );

      var insert = inserts[gap];
      if (!insert) return;
      insert.setAttribute("role", "button");
      insert.tabIndex = 0;
      insert.setAttribute("aria-label", "Select gap " + gap);
      insert.addEventListener("click", function () {
        activateGapInsert(gap);
      });
      insert.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateGapInsert(gap);
      });
    });

    wirePickableRefList(refList, assignNumber, "Sentence part");

    task.gaps.forEach(function (gap) {
      var cell = track.querySelector('[data-slot="' + gap + '"]');
      if (!cell) return;
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
      cell.setAttribute("aria-label", "Select gap " + gap);
      cell.addEventListener("click", function () {
        activateGapInsert(gap);
      });
      cell.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateGapInsert(gap);
      });
    });

    picks.appendChild(hidden);
    picks.dataset.taskId = task.id;
    picks.syncUsedState = syncUsedState;
    picks.syncNumberRow = syncNumberRow;
    picks.updateInsert = updateInsert;
    picks.clearGap = clearGap;
    picks.setActiveGap = setActiveGap;
    picks.assignNumber = assignNumber;
    picks.activateGap = activateGapInsert;
    picks.activateLetter = activateGapInsert;
    picks.getActiveGap = function () {
      return activeGap;
    };
    picks.inserts = inserts;
    syncUsedState();
    syncActiveGap();

    return { picks: picks, track: track };
  }

  function buildVocabClozePicker(task, topicId, inserts) {
    var prefix = topicId + "_" + task.id;
    var activeGapNum = "";

    var picks = document.createElement("div");
    picks.className = "ege-mc-stack ege-vocab-picks";
    picks.setAttribute("aria-label", "Choose a word for each gap");

    function radioName(index) {
      return prefix + "_q_" + index;
    }

    function questionIndexForGap(gapNum) {
      for (var i = 0; i < task.questions.length; i += 1) {
        if (vocabGapNum(task.questions[i]) === String(gapNum)) return i;
      }
      return -1;
    }

    function updateInsert(gapNum, word) {
      var insert = getGapInsert(task.id, gapNum) || inserts[gapNum];
      if (!insert || !insert.isConnected) return;
      inserts[gapNum] = insert;
      var textSpan = insert.querySelector(".ege-gap-insert__text");
      if (!textSpan) {
        textSpan = document.createElement("span");
        textSpan.className = "ege-gap-insert__text";
        insert.appendChild(textSpan);
      }
      if (word) {
        textSpan.textContent = word;
        insert.classList.add("is-filled");
      } else {
        textSpan.textContent = "";
        insert.classList.remove("is-filled");
      }
    }

    function syncActiveGap() {
      task.questions.forEach(function (question) {
        var gapNum = vocabGapNum(question);
        var insert = getGapInsert(task.id, gapNum) || inserts[gapNum];
        if (insert) insert.classList.toggle("is-active", gapNum === activeGapNum);
      });
    }

    function syncActiveCard() {
      picks.querySelectorAll(".ege-mc-card").forEach(function (card) {
        card.classList.toggle("is-active", card.dataset.gap === activeGapNum);
      });
    }

    function syncInserts() {
      task.questions.forEach(function (question, index) {
        var value = getCheckedValue(radioName(index));
        var word = value === "" ? "" : question.opts[parseInt(value, 10)] || "";
        updateInsert(vocabGapNum(question), word);
      });
      syncCheckButton(task.id);
      if (activeGapNum) {
        var activeIndex = questionIndexForGap(activeGapNum);
        if (activeIndex >= 0 && getCheckedValue(radioName(activeIndex))) {
          var next = nextEmptyGap(activeGapNum);
          if (next !== activeGapNum) setActiveGap(next);
        }
      }
    }

    function setActiveGap(gapNum) {
      activeGapNum = gapNum || "";
      syncActiveGap();
      syncActiveCard();
      if (!activeGapNum) return;
      var card = picks.querySelector('[data-gap="' + activeGapNum + '"]');
      if (card) card.scrollIntoView({ block: "nearest" });
    }

    function clearGapAnswer(gapNum) {
      var index = questionIndexForGap(gapNum);
      if (index < 0) return;
      clearChoiceGroup(radioName(index));
      updateInsert(gapNum, "");
      var insert = getGapInsert(task.id, gapNum) || inserts[gapNum];
      if (insert) insert.classList.remove("is-correct", "is-wrong");
      syncInserts();
    }

    function activateGapInsert(gapNum) {
      if (gapNum === activeGapNum) {
        var index = questionIndexForGap(gapNum);
        if (index >= 0 && getCheckedValue(radioName(index))) {
          clearGapAnswer(gapNum);
        } else {
          setActiveGap("");
        }
        return;
      }
      setActiveGap(gapNum);
    }

    function nextEmptyGap(fromGapNum) {
      var start = questionIndexForGap(fromGapNum);
      if (start < 0) start = 0;
      for (var i = 1; i <= task.questions.length; i += 1) {
        var index = (start + i) % task.questions.length;
        if (!getCheckedValue(radioName(index))) {
          return vocabGapNum(task.questions[index]);
        }
      }
      return fromGapNum || vocabGapNum(task.questions[0]);
    }

    picks.syncInserts = syncInserts;
    picks.setActiveGap = setActiveGap;
    picks.getActiveGap = function () {
      return activeGapNum;
    };

    task.questions.forEach(function (question, index) {
      var block = document.createElement("div");
      block.className = "ege-mc-card";
      block.id = prefix + "_q_" + index;
      block.dataset.gap = vocabGapNum(question);

      var prompt = document.createElement("p");
      prompt.className = "ege-mc__prompt";
      prompt.textContent = question.q;
      block.appendChild(prompt);
      block.appendChild(buildMcChoiceGroup(radioName(index), question.opts, question.q));
      block.addEventListener("click", function () {
        setActiveGap(block.dataset.gap);
      });
      picks.appendChild(block);
    });

    Object.keys(inserts).forEach(function (gapNum) {
      var insert = inserts[gapNum];
      if (!insert) return;
      insert.setAttribute("role", "button");
      insert.tabIndex = 0;
      insert.setAttribute("aria-label", "Select gap " + gapNum);
      insert.addEventListener("click", function (event) {
        event.stopPropagation();
        activateGapInsert(gapNum);
      });
      insert.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateGapInsert(gapNum);
      });
    });

    picks.addEventListener("change", function (event) {
      var card = event.target.closest(".ege-mc-card");
      if (card) setActiveGap(card.dataset.gap);
    });

    syncInserts();
    syncActiveGap();
    syncActiveCard();

    return picks;
  }

  function buildSplit(readEl, workEl, modifier) {
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
  }

  function getCheckedValue(name) {
    var checked = document.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : "";
  }

  function clearChoiceGroup(name) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (radio) {
      radio.checked = false;
      radio.dataset.wasChecked = "0";
      var pill = radio.closest(".ege-pill");
      if (pill) pill.classList.remove("is-correct", "is-wrong");
    });
  }

  function markChoiceGroup(name, value, correctValue) {
    var pills = [];
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (radio) {
      var pill = radio.closest(".ege-pill");
      if (pill) {
        pill.classList.remove("is-correct", "is-wrong");
        pills.push({ pill: pill, value: radio.value, checked: radio.checked });
      }
    });

    var ok = value === correctValue;
    pills.forEach(function (item) {
      if (item.checked) {
        item.pill.classList.add(ok ? "is-correct" : "is-wrong");
      } else if (!ok && item.value === correctValue) {
        item.pill.classList.add("is-correct");
      }
    });
    return ok;
  }

  function renderMatching(task, topicId) {
    var max = taskMaxScore(task);
    var wrap = buildTaskArticle(task);
    wrap.classList.add("ege-task--matching");

    var texts = document.createElement("div");
    texts.className = "ege-match-texts";
    task.texts.forEach(function (item) {
      var block = document.createElement("div");
      block.className = "ege-text-block";
      block.dataset.letter = item.letter;
      block.innerHTML = "<strong>" + item.letter + ".</strong> " + item.text;
      texts.appendChild(block);
    });

    wrap.appendChild(
      buildSplit(
        buildPanel("", texts, "ege-panel--read"),
        buildPanel("", buildMatchingRead(task, topicId, texts), "ege-panel--work"),
        "ege-split--panels"
      )
    );
    wrap.appendChild(buildTaskFooter(task.id, max, { showAnswers: true }));
    return wrap;
  }

  function renderGapfill(task, topicId) {
    var max = taskMaxScore(task);
    var wrap = buildTaskArticle(task);
    wrap.classList.add("ege-task--gapfill");

    var text = document.createElement("div");
    text.className = "ege-passage ege-gapfill-passage";
    text.innerHTML = task.html;

    var inserts = replaceGapPlaceholders(
      text,
      task.gaps.map(function (gap) {
        return { selector: '[data-gap="' + gap + '"]', gapId: gap };
      })
    );

    var refStrip = buildRefStrip("Sentence parts", task.options);
    var refList = refStrip.querySelector(".ege-ref__list");

    var side = document.createElement("div");
    side.className = "ege-sidebar-work";
    var picker = buildGapfillPicker(task, topicId, inserts, refList);
    side.appendChild(refStrip);
    side.appendChild(picker.track);
    side.appendChild(picker.picks);

    wrap.appendChild(
      buildSplit(
        buildPanel("", text, "ege-panel--read"),
        buildPanel("", side, "ege-panel--work"),
        "ege-split--panels"
      )
    );
    wrap.appendChild(buildTaskFooter(task.id, max, { showAnswers: true }));
    return wrap;
  }

  function renderVocabCloze(task, topicId) {
    var max = taskMaxScore(task);
    var wrap = buildTaskArticle(task);
    wrap.classList.add("ege-task--vocab");

    var html = task.passage;
    task.questions.forEach(function (question) {
      var gapNum = vocabGapNum(question);
      html = html.split("[" + gapNum + "]").join('<span data-vocab-gap="' + gapNum + '"></span>');
    });

    var passage = document.createElement("div");
    passage.className = "ege-passage ege-gapfill-passage";
    passage.innerHTML = html;

    var inserts = replaceGapPlaceholders(
      passage,
      task.questions.map(function (question) {
        var gapNum = vocabGapNum(question);
        return { selector: '[data-vocab-gap="' + gapNum + '"]', gapId: gapNum };
      })
    );

    var picker = buildVocabClozePicker(task, topicId, inserts);
    var side = document.createElement("div");
    side.className = "ege-sidebar-work";
    side.appendChild(picker);

    wrap.appendChild(
      buildSplit(
        buildPanel("", passage, "ege-panel--read"),
        buildPanel("", side, "ege-panel--work"),
        "ege-split--panels"
      )
    );
    wrap.appendChild(buildTaskFooter(task.id, max, { showAnswers: true }));
    return wrap;
  }

  function renderMc(task, topicId) {
    var max = taskMaxScore(task);
    var wrap = buildTaskArticle(task);

    var work = document.createElement("div");
    work.className = "ege-mc-stack";

    task.questions.forEach(function (question, index) {
      var block = document.createElement("div");
      block.className = "ege-mc-card";
      block.id = topicId + "_" + task.id + "_q_" + index;

      var prompt = document.createElement("p");
      prompt.className = "ege-mc__prompt";
      prompt.textContent = question.q;
      block.appendChild(prompt);

      block.appendChild(
        buildMcChoiceGroup(topicId + "_" + task.id + "_q_" + index, question.opts, question.q)
      );
      work.appendChild(block);
    });

    if (task.passage) {
      var passage = document.createElement("div");
      passage.className = "ege-passage";
      passage.innerHTML = task.passage;

      var readScroll = document.createElement("div");
      readScroll.className = "ege-read-scroll";
      readScroll.appendChild(passage);

      var scrollWrap = document.createElement("div");
      scrollWrap.className = "ege-work-scroll";
      scrollWrap.appendChild(work);

      var workPanel = buildPanel("Questions", scrollWrap, "ege-panel--work");
      var workCol = document.createElement("div");
      workCol.className = "ege-work-col";
      workCol.appendChild(workPanel);

      var body = document.createElement("div");
      body.className = "ege-reading-mc-body";

      wrap.classList.add("ege-task--reading-mc");
      body.appendChild(
        buildSplit(buildPanel("Text", readScroll, "ege-panel--read"), workCol, "ege-split--panels")
      );
      body.appendChild(buildTaskFooter(task.id, max, { showAnswers: true }));
      wrap.appendChild(body);
    } else {
      wrap.appendChild(buildPanel("Questions", work, "ege-panel--solo"));
      wrap.appendChild(buildTaskFooter(task.id, max, { showAnswers: true }));
    }
    return wrap;
  }

  function cleanListeningTranscript(text) {
    var lines = String(text || "").split(/\r?\n/);
    var out = [];
    var inSecondPlay = false;

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      if (/^\d{2}:\d{2}$/.test(line)) return;
      if (/transcribed by/i.test(line)) return;
      if (/uniscribe|turboscribe/i.test(line)) return;
      if (/you will hear the (text|recording) again/i.test(line)) {
        inSecondPlay = true;
        return;
      }
      if (/this is the end of the (task|listening)/i.test(line)) {
        inSecondPlay = true;
        return;
      }
      if (
        /you have \d+ seconds/i.test(line) &&
        /complete the task|check your answers|familiarize|ознакомиться/i.test(line) &&
        out.length > 4
      ) {
        inSecondPlay = true;
        return;
      }
      if (/^task 3-9/i.test(line)) return;
      if (/^задание 3-9/i.test(line)) return;
      if (
        /write (down|in) the (number|digit|answer)|соответствующую выбранному/i.test(line) &&
        line.length < 160
      ) {
        return;
      }
      if (/^now,? we are ready to start\.?$/i.test(line)) return;
      line = line.replace(/^(@(?:narrator|host|guest)\|)\s*now,? we are ready to start\.?\s*/i, "$1");
      line = line.replace(/^now,? we are ready to start\.?\s*/i, "");
      if (!line || /^@(?:narrator|host|guest)\|\s*$/i.test(line)) return;
      if (inSecondPlay) return;
      out.push(line);
    });

    return out.join("\n\n");
  }

  function loadTaskTranscripts(topic) {
    var jobs = topic.tasks.map(function (task) {
      if (task.transcript || !task.transcriptFile) return Promise.resolve();
      return fetch(encodeURI(task.transcriptFile))
        .then(function (res) {
          if (!res.ok) throw new Error("Transcript not found");
          return res.text();
        })
        .then(function (text) {
          task.transcript = cleanListeningTranscript(text);
        })
        .catch(function () {
          task.transcript = "";
        });
    });
    return Promise.all(jobs);
  }

  function listeningGuestLabel(task) {
    if (task.guest) return String(task.guest).split(/\s+/)[0];
    var match = task.title && task.title.match(/—\s*(.+)$/);
    return match ? match[1].trim().split(/\s+/)[0] : "Guest";
  }

  function applyListeningGaps(html, allGaps, activeGaps) {
    var out = html || "";
    var selected = {};
    (activeGaps || []).forEach(function (gap) {
      selected[String(gap.sourceNum)] = gap;
    });

    (allGaps || []).forEach(function (gap) {
      var num = String(gap.num);
      if (selected[num]) {
        var slot = selected[num];
        out = out.split("[" + num + "]").join(
          '<button type="button" class="ege-listening-mark" data-gap="' +
            String(slot.num) +
            '" aria-label="Go to gap ' +
            String(slot.num) +
            '">' +
            String(slot.num) +
            "</button>"
        );
      } else {
        out = out.split("[" + num + "]").join(gap.answer || "");
      }
    });
    return out;
  }

  function parseDialogueTranscript(text) {
    if (!/@(?:narrator|host|guest)\|/i.test(text)) return null;
    return text.split(/\r?\n/).map(function (line) {
      var match = line.match(/^@(narrator|host|guest)\|([\s\S]+)$/i);
      if (!match) return null;
      return { role: match[1].toLowerCase(), text: match[2].trim() };
    }).filter(Boolean);
  }

  function mergeDialogueTurns(turns) {
    if (!turns || !turns.length) return [];
    var merged = [];

    turns.forEach(function (turn) {
      var role = turn.role === "narrator" ? "host" : turn.role;
      var prev = merged[merged.length - 1];
      if (prev && prev.role === role) {
        prev.text = prev.text + " " + turn.text;
      } else {
        merged.push({ role: role, text: turn.text });
      }
    });

    return merged;
  }

  function dialogueSpeakerLabel(role, task) {
    if (role === "guest") return listeningGuestLabel(task);
    return "Interviewer";
  }

  function renderDialogueTurn(turn, task, allGaps, activeGaps) {
    var block = document.createElement("div");
    var role = turn.role === "narrator" ? "host" : turn.role;
    block.className = "ege-dialogue__turn ege-dialogue__turn--" + role;

    var body = document.createElement("p");
    body.className = "ege-dialogue__text";
    body.innerHTML = applyListeningGaps(turn.text, allGaps, activeGaps);

    block.appendChild(body);
    return block;
  }

  function markListeningGap(taskId, gapNum, ok, hasValue) {
    var mark = document.querySelector(
      "#task-" + taskId + ' .ege-listening-mark[data-gap="' + String(gapNum) + '"]'
    );
    if (!mark) return;
    mark.classList.toggle("is-checked-correct", ok);
    mark.classList.toggle("is-checked-wrong", hasValue && !ok);
  }

  function clearGapCheckClasses(el) {
    if (!el) return;
    el.classList.remove("is-checked-correct", "is-checked-wrong");
  }

  function applyGapCheckClasses(el, ok, hasValue) {
    if (!el) return;
    el.classList.toggle("is-checked-correct", !!ok);
    el.classList.toggle("is-checked-wrong", !!hasValue && !ok);
  }

  function setListeningMarkText(taskId, gapNum, text) {
    var mark = document.querySelector(
      "#task-" + taskId + ' .ege-listening-mark[data-gap="' + String(gapNum) + '"]'
    );
    if (!mark) return;
    mark.textContent = text;
    clearGapCheckClasses(mark);
    mark.classList.add("is-filled");
  }

  function resetListeningGapsFeedback(taskId) {
    var task = findTask(taskId);
    if (!task) return;
    var prefix = taskPrefix(taskId);
    getActiveListeningGaps(task).forEach(function (gap) {
      var input = document.getElementById(prefix + "_gap_" + gap.num);
      if (input) {
        clearGapCheckClasses(input);
        input.removeAttribute("title");
      }
      markListeningGap(taskId, gap.num, false, false);
    });
  }

  function resetPrepGapFeedback(taskId) {
    var task = findTask(taskId);
    if (!task || !task.prep || !task.prep.gapFill || !task.prep.gapFill.items) return;
    var prefix = taskPrefix(taskId);
    task.prep.gapFill.items.forEach(function (item) {
      var slot = document.getElementById(prefix + "_prep_gf_" + item.id);
      if (!slot) return;
      clearGapCheckClasses(slot);
      slot.removeAttribute("title");
    });
  }

  function clearListeningMark(taskId, gapNum) {
    var mark = document.querySelector(
      "#task-" + taskId + ' .ege-listening-mark[data-gap="' + String(gapNum) + '"]'
    );
    if (!mark) return;
    mark.textContent = String(gapNum);
    mark.classList.remove("is-checked-correct", "is-checked-wrong", "is-filled");
  }

  function parseListeningTime(value) {
    if (typeof value === "number" && isFinite(value) && value >= 0) return value;
    if (typeof value !== "string") return null;
    var trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    var parts = trimmed.split(":").map(Number);
    if (parts.some(function (n) { return !isFinite(n) || n < 0; })) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  function getListeningPlaythroughStarts(task) {
    var raw = task && (task.playthroughStarts || task.audioMarks);
    if (!raw || !raw.length) return [];
    var starts = [];
    for (var i = 0; i < raw.length; i += 1) {
      var item = raw[i];
      var sec =
        typeof item === "object" && item
          ? parseListeningTime(item.at != null ? item.at : item.time)
          : parseListeningTime(item);
      if (sec == null) continue;
      starts.push({
        at: sec,
        label: String(
          (typeof item === "object" && item && item.label) || starts.length + 1
        ),
      });
    }
    return starts;
  }

  function buildListeningAudio(task, topicId) {
    var bar = document.createElement("div");
    bar.className = "ege-listening-audio";

    var audio = document.createElement("audio");
    audio.id = topicId + "_" + task.id + "_audio";
    audio.preload = "auto";
    audio.playbackRate = 1;
    if (task.audio) audio.src = task.audio;

    var seek = document.createElement("div");
    seek.className = "ege-listening-seek";
    seek.setAttribute("role", "slider");
    seek.setAttribute("tabindex", "0");
    seek.setAttribute("aria-label", "Recording position");
    seek.setAttribute("aria-valuemin", "0");
    seek.setAttribute("aria-valuenow", "0");
    seek.setAttribute("aria-valuetext", "0:00");

    var track = document.createElement("div");
    track.className = "ege-listening-seek__track";

    var marks = document.createElement("div");
    marks.className = "ege-listening-seek__marks";

    var thumb = document.createElement("div");
    thumb.className = "ege-listening-seek__thumb";
    thumb.setAttribute("aria-hidden", "true");

    track.appendChild(marks);
    track.appendChild(thumb);
    seek.appendChild(track);

    var controls = document.createElement("div");
    controls.className = "ege-listening-audio__controls";

    var playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "ege-listening-play";
    playBtn.setAttribute("aria-label", "Play recording");
    playBtn.setAttribute("title", "Play / Pause (P)");

    var icon = document.createElement("span");
    icon.className = "ege-listening-play__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "▶";

    var label = document.createElement("span");
    label.className = "ege-listening-play__label";
    label.textContent = "Listen";

    playBtn.appendChild(icon);
    playBtn.appendChild(label);

    function formatTime(sec) {
      if (!isFinite(sec) || sec < 0) sec = 0;
      var total = Math.floor(sec);
      var m = Math.floor(total / 60);
      var s = total % 60;
      return m + ":" + (s < 10 ? "0" : "") + s;
    }

    function duration() {
      return isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    }

    function setPlaying(isPlaying) {
      playBtn.classList.toggle("is-playing", isPlaying);
      seek.classList.toggle("is-playing", isPlaying);
      icon.textContent = isPlaying ? "❚❚" : "▶";
      label.textContent = isPlaying ? "Pause" : "Listen";
      playBtn.setAttribute("aria-label", isPlaying ? "Pause recording" : "Play recording");
    }

    function updateSeekUI() {
      var dur = duration();
      var t = audio.currentTime || 0;
      var pct = dur ? Math.min(100, Math.max(0, (t / dur) * 100)) : 0;
      thumb.style.left = pct + "%";
      seek.style.setProperty("--ege-seek-progress", pct + "%");
      seek.setAttribute("aria-valuemax", String(Math.round(dur)));
      seek.setAttribute("aria-valuenow", String(Math.round(t)));
      seek.setAttribute("aria-valuetext", formatTime(t) + " / " + formatTime(dur));
    }

    function seekTo(time) {
      var dur = duration();
      if (!dur) return;
      audio.currentTime = Math.min(dur, Math.max(0, time));
      updateSeekUI();
    }

    function seekFromClientX(clientX) {
      var dur = duration();
      if (!dur) return;
      var rect = track.getBoundingClientRect();
      if (!rect.width) return;
      var ratio = (clientX - rect.left) / rect.width;
      seekTo(Math.min(1, Math.max(0, ratio)) * dur);
    }

    function renderPlaythroughMarks() {
      marks.textContent = "";
      var dur = duration();
      var starts = getListeningPlaythroughStarts(task);
      if (!dur || !starts.length) return;
      starts.forEach(function (mark) {
        if (mark.at > dur) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ege-listening-seek__mark";
        btn.style.left = (mark.at / dur) * 100 + "%";
        btn.setAttribute("aria-label", "Jump to playthrough " + mark.label);
        btn.title = "Playthrough " + mark.label + " · " + formatTime(mark.at);
        btn.addEventListener("click", function (event) {
          event.stopPropagation();
          seekTo(mark.at);
        });
        marks.appendChild(btn);
      });
    }

    var dragging = false;

    seek.addEventListener("pointerdown", function (event) {
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest(".ege-listening-seek__mark")) return;
      dragging = true;
      seek.classList.add("is-dragging");
      seek.setPointerCapture(event.pointerId);
      seekFromClientX(event.clientX);
      event.preventDefault();
    });

    seek.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      seekFromClientX(event.clientX);
    });

    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      seek.classList.remove("is-dragging");
      if (seek.hasPointerCapture && seek.hasPointerCapture(event.pointerId)) {
        seek.releasePointerCapture(event.pointerId);
      }
    }

    seek.addEventListener("pointerup", endDrag);
    seek.addEventListener("pointercancel", endDrag);

    seek.addEventListener("keydown", function (event) {
      var dur = duration();
      if (!dur) return;
      if (event.key === "Home") {
        event.preventDefault();
        seekTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        seekTo(dur);
      }
    });

    playBtn.addEventListener("click", function () {
      if (audio.paused) {
        var playPromise = audio.play();
        if (playPromise && playPromise.catch) {
          playPromise.catch(function () {
            showToast("Could not play audio.");
          });
        }
      } else {
        audio.pause();
      }
    });

    audio.addEventListener("play", function () {
      setPlaying(true);
    });
    audio.addEventListener("pause", function () {
      setPlaying(false);
    });
    audio.addEventListener("ended", function () {
      setPlaying(false);
      updateSeekUI();
    });
    audio.addEventListener("timeupdate", updateSeekUI);
    audio.addEventListener("loadedmetadata", function () {
      updateSeekUI();
      renderPlaythroughMarks();
    });
    audio.addEventListener("durationchange", function () {
      updateSeekUI();
      renderPlaythroughMarks();
    });

    var speeds = [0.85, 1, 1.25, 1.5, 2];
    var speedGroup = document.createElement("div");
    speedGroup.className = "ege-listening-speed";
    speedGroup.setAttribute("role", "group");
    speedGroup.setAttribute("aria-label", "Playback speed");

    function setSpeed(rate) {
      audio.playbackRate = rate;
      speedGroup.querySelectorAll(".ege-listening-speed__btn").forEach(function (btn) {
        var active = Number(btn.dataset.rate) === rate;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    speeds.forEach(function (rate) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ege-listening-speed__btn";
      btn.dataset.rate = String(rate);
      btn.textContent = rate === 1 ? "1×" : rate + "×";
      btn.setAttribute("aria-label", "Play at " + rate + "× speed");
      btn.setAttribute("aria-pressed", rate === 1 ? "true" : "false");
      if (rate === 1) btn.classList.add("is-active");
      btn.addEventListener("click", function () {
        setSpeed(rate);
      });
      speedGroup.appendChild(btn);
    });

    controls.appendChild(playBtn);
    controls.appendChild(speedGroup);
    controls.appendChild(audio);

    bar.appendChild(seek);
    bar.appendChild(controls);
    updateSeekUI();
    return bar;
  }

  function attachListeningGapLinks(transcript, topicId, taskId) {
    if (!transcript) return;

    transcript.addEventListener("click", function (event) {
      var mark = event.target.closest(".ege-listening-mark");
      if (!mark || !transcript.contains(mark)) return;

      var gapNum = mark.getAttribute("data-gap");
      if (!gapNum) return;

      var input = document.getElementById(topicId + "_" + taskId + "_gap_" + gapNum);
      if (!input) return;

      event.preventDefault();
      input.focus();
      if (typeof input.select === "function") input.select();
    });
  }

  function buildListeningTranscript(task) {
    var transcript = document.createElement("div");
    transcript.className = "ege-passage ege-listening-transcript";

    var text = task.transcript || "";
    var allGaps = getListeningGaps(task);
    var activeGaps = getActiveListeningGaps(task);
    var dialogue = parseDialogueTranscript(text);

    if (dialogue && dialogue.length) {
      dialogue = mergeDialogueTurns(dialogue);
      var wrap = document.createElement("div");
      wrap.className = "ege-dialogue";
      dialogue.forEach(function (turn, index) {
        var turnEl = renderDialogueTurn(turn, task, allGaps, activeGaps);
        if (index === 0) turnEl.classList.add("ege-dialogue__turn--intro");
        wrap.appendChild(turnEl);
      });
      transcript.appendChild(wrap);
      return transcript;
    }

    if (!allGaps.length) {
      text.split(/\n\n+/).forEach(function (paragraph) {
        var trimmed = paragraph.replace(/\n/g, " ").trim();
        if (!trimmed) return;
        var para = document.createElement("p");
        para.textContent = trimmed;
        transcript.appendChild(para);
      });
      return transcript;
    }

    var html = applyListeningGaps(text, allGaps, activeGaps);
    transcript.innerHTML = html;
    return transcript;
  }

  function buildListeningMcStack(task, topicId) {
    var work = document.createElement("div");
    work.className = "ege-mc-stack";

    (task.questions || []).forEach(function (question, index) {
      var block = document.createElement("div");
      block.className = "ege-mc-card";
      var label = question.q.replace(/^\d+\./, String(3 + index) + ".");

      var prompt = document.createElement("p");
      prompt.className = "ege-mc__prompt";
      prompt.textContent = label;
      block.appendChild(prompt);

      block.appendChild(
        buildMcChoiceGroup(topicId + "_" + task.id + "_q_" + index, question.opts, label)
      );
      work.appendChild(block);
    });

    return work;
  }

  function buildListeningProgress(task) {
    var taskId = task.id;
    var hasMc = listeningMcMax(task) > 0;
    var nav = document.createElement("nav");
    nav.className = "ege-listening-progress";
    nav.id = "listening-progress-" + taskId;
    nav.setAttribute("aria-label", "Listening stages");

    var track = document.createElement("div");
    track.className = "ege-listening-progress__track";

    var stages = [];
    if (taskHasSplitPrep(task)) {
      stages.push({ num: 1, label: "Gap fill" });
      stages.push({ num: 2, label: "Matching" });
      stages.push({ num: 3, label: "Listening" });
      if (hasMc) stages.push({ num: 4, label: "Questions" });
    } else {
      if (task.prep) stages.push({ num: 1, label: "Pre-listening" });
      stages.push({ num: task.prep ? 2 : 1, label: "Listening" });
      if (hasMc) stages.push({ num: task.prep ? 3 : 2, label: "Questions" });
    }

    stages.forEach(function (stage, index) {
      if (index > 0) {
        var line = document.createElement("span");
        line.className = "ege-listening-progress__line";
        line.setAttribute("aria-hidden", "true");
        track.appendChild(line);
      }

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ege-listening-progress__step";
      btn.dataset.step = String(stage.num);
      btn.textContent = stage.label;
      btn.addEventListener("click", function () {
        setListeningStep(taskId, stage.num);
      });
      track.appendChild(btn);
    });

    nav.appendChild(track);
    return nav;
  }

  function prepGapSlotValue(slot) {
    if (!slot) return "";
    return slot.dataset.value || "";
  }

  function setPrepGapSlotValue(slot, word) {
    if (!slot) return;
    slot.dataset.value = word || "";
    var textEl = slot.querySelector(".ege-prep-gapfill__slot-text");
    if (textEl) textEl.textContent = word || "";
    slot.classList.remove("is-checked-correct", "is-checked-wrong");
    slot.classList.toggle("is-filled", !!word);
  }

  function eachPrepGapInputFilled(prefix, items) {
    for (var i = 0; i < items.length; i += 1) {
      var slot = document.getElementById(prefix + "_prep_gf_" + items[i].id);
      if (!slot || !normalize(prepGapSlotValue(slot))) return false;
    }
    return true;
  }

  function countPrepGapFilled(prefix, items) {
    var filled = 0;
    for (var i = 0; i < items.length; i += 1) {
      var slot = document.getElementById(prefix + "_prep_gf_" + items[i].id);
      if (slot && normalize(prepGapSlotValue(slot))) filled += 1;
    }
    return filled;
  }

  function isPrepMatchingUnlocked(taskId) {
    var task = findTask(taskId);
    if (!task || !task.prep) return true;
    if (!task.prep.gapFill || !task.prep.gapFill.items || !task.prep.gapFill.items.length) return true;

    var taskEl = document.getElementById("task-" + taskId);
    return !!(taskEl && taskEl.dataset.prepMatchUnlocked === "1");
  }

  function setPrepMatchingUnlocked(taskId, unlocked) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;
    if (unlocked) taskEl.dataset.prepMatchUnlocked = "1";
    else delete taskEl.dataset.prepMatchUnlocked;
  }

  function isPrepMatchPassed(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    return !!(taskEl && taskEl.dataset.prepMatchPassed === "1");
  }

  function setPrepMatchPassed(taskId, passed) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;
    if (passed) taskEl.dataset.prepMatchPassed = "1";
    else delete taskEl.dataset.prepMatchPassed;
  }

  function isListeningGapsPassed(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    return !!(taskEl && taskEl.dataset.listeningGapsPassed === "1");
  }

  function setListeningGapsPassed(taskId, passed) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;
    if (passed) taskEl.dataset.listeningGapsPassed = "1";
    else delete taskEl.dataset.listeningGapsPassed;
  }

  function isListeningMcPassed(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    return !!(taskEl && taskEl.dataset.listeningMcPassed === "1");
  }

  function setListeningMcPassed(taskId, passed) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;
    if (passed) taskEl.dataset.listeningMcPassed = "1";
    else delete taskEl.dataset.listeningMcPassed;
  }

  function fillPrepGapSentence(sentence, answer) {
    return String(sentence || "").replace(/_{2,}/, answer || "");
  }

  function buildPrepGapFillReviewLine(item, displayNum) {
    var line = document.createElement("p");
    line.className = "ege-prep-gapfill__item ege-prep-gapfill__item--review";

    var num = document.createElement("span");
    num.className = "ege-prep-gapfill__num";
    num.textContent = displayNum + ".";
    line.appendChild(num);

    var text = document.createElement("span");
    text.className = "ege-prep-gapfill__full";
    var parts = String(item.sentence || "").split(/_{2,}/);
    if (parts[0]) text.appendChild(document.createTextNode(parts[0]));
    var answer = document.createElement("span");
    answer.className = "ege-prep-gapfill__answer";
    answer.textContent = item.answer || "";
    text.appendChild(answer);
    if (parts[1]) text.appendChild(document.createTextNode(parts[1]));
    line.appendChild(text);
    return line;
  }

  function setPrepGapReviewMode(taskId, enabled) {
    var wrap = document.querySelector("#task-" + taskId + " .ege-prep-gapfill");
    if (!wrap || !wrap._prepGapFillConfig) return;

    var cfg = wrap._prepGapFillConfig;
    var bank = wrap.querySelector(".ege-prep-wordbank");
    var list = wrap.querySelector(".ege-prep-gapfill__items");
    wrap.classList.toggle("is-review", !!enabled);
    if (bank) bank.hidden = !!enabled;
    if (!list) return;

    var layout = ensurePrepLayout(taskId, {
      gapFill: {
        items: cfg.items,
        wordBank: cfg.wordBank,
      },
    });

    if (enabled) {
      list.textContent = "";
      orderPrepByIds(cfg.items, resolvePrepIdOrder(layout.gapItemIds, cfg.items)).forEach(
        function (item, index) {
          list.appendChild(buildPrepGapFillReviewLine(item, index + 1));
        }
      );
      return;
    }

    if (bank) {
      bank.hidden = false;
      renderPrepWordBank(bank, cfg.wordBank, layout.wordBank);
    }
    renderPrepGapFillItems(list, cfg.items, cfg.prefix, layout.gapItemIds);
  }

  function setListeningRevealVisible(taskId, visible) {
    var showBtn = document.getElementById("show-" + taskId);
    if (showBtn) showBtn.hidden = !visible;
  }

  function syncListeningPrepFooterUI(taskId) {
    var task = findTask(taskId);
    if (!task || task.type !== "listening" || !task.prep) return;

    var kind = getListeningStepKind(task, getListeningStep(taskId));
    var checkBtn = document.getElementById("check-" + taskId);
    var progressEl = document.getElementById("prep-fill-" + taskId);
    var resetBtn = document.getElementById("reset-" + taskId);
    var gapItems = task.prep.gapFill && task.prep.gapFill.items;

    if (kind !== "prep-gap" && kind !== "prep-match" && kind !== "prep") {
      hidePrepNextButton(taskId);
      if (resetBtn) resetBtn.hidden = false;
      return;
    }

    if (kind === "prep-match") {
      if (progressEl) progressEl.hidden = true;
      if (isPrepMatchingComplete(taskId)) {
        if (!isPrepMatchPassed(taskId)) {
          setPrepMatchPassed(taskId, true);
          var matchCount =
            (task.prep.matching && task.prep.matching.expressions
              ? task.prep.matching.expressions.length
              : 0) || 0;
          if (matchCount) {
            var taskElMatch = document.getElementById("task-" + taskId);
            if (!(taskElMatch && taskElMatch.dataset.revealedStep === "1")) {
              showScoreFeedback(taskId, matchCount, matchCount);
            }
          }
          syncListeningProgressUI(taskId);
        }
        if (checkBtn) checkBtn.hidden = true;
        if (resetBtn) resetBtn.hidden = true;
        setListeningRevealVisible(taskId, false);
        showPrepNextButton(taskId);
        return;
      }
      if (checkBtn) checkBtn.hidden = true;
      hidePrepNextButton(taskId);
      if (resetBtn) resetBtn.hidden = false;
      setListeningRevealVisible(taskId, true);
      return;
    }

    if (kind === "prep" && isPrepMatchingUnlocked(taskId)) {
      if (progressEl) progressEl.hidden = true;
      if (isPrepMatchingComplete(taskId)) {
        if (!isPrepMatchPassed(taskId)) {
          setPrepMatchPassed(taskId, true);
          var prepMatchCount =
            (task.prep.matching && task.prep.matching.expressions
              ? task.prep.matching.expressions.length
              : 0) || 0;
          if (prepMatchCount) {
            var taskElPrepMatch = document.getElementById("task-" + taskId);
            if (!(taskElPrepMatch && taskElPrepMatch.dataset.revealedStep === "1")) {
              showScoreFeedback(taskId, prepMatchCount, prepMatchCount);
            }
          }
          syncListeningProgressUI(taskId);
        }
        if (checkBtn) checkBtn.hidden = true;
        if (resetBtn) resetBtn.hidden = true;
        setListeningRevealVisible(taskId, false);
        showPrepNextButton(taskId);
        return;
      }
      if (checkBtn) checkBtn.hidden = true;
      hidePrepNextButton(taskId);
      if (resetBtn) resetBtn.hidden = false;
      setListeningRevealVisible(taskId, true);
      return;
    }

    if (kind === "prep-gap" && isPrepMatchingUnlocked(taskId)) {
      if (progressEl) progressEl.hidden = true;
      if (checkBtn) checkBtn.hidden = true;
      if (resetBtn) resetBtn.hidden = true;
      setListeningRevealVisible(taskId, false);
      showPrepNextButton(taskId);
      return;
    }

    hidePrepNextButton(taskId);
    if (resetBtn) resetBtn.hidden = false;
    setListeningRevealVisible(taskId, true);

    if (!gapItems || !gapItems.length) {
      var prepReady = isListeningPrepComplete(taskId);
      if (progressEl) progressEl.hidden = true;
      if (checkBtn) checkBtn.hidden = !prepReady;
      return;
    }

    var prefix = taskPrefix(taskId);
    var total = gapItems.length;
    var filled = countPrepGapFilled(prefix, gapItems);
    var gapReady = filled === total;

    if (progressEl) {
      progressEl.textContent = filled + " / " + total;
      progressEl.hidden = gapReady;
    }

    if (checkBtn) checkBtn.hidden = !gapReady;
  }

  function syncListeningGapsFooterUI(taskId) {
    var task = findTask(taskId);
    if (!task || task.type !== "listening") return;
    if (getListeningStepKind(task, getListeningStep(taskId)) !== "listening") return;

    var checkBtn = document.getElementById("check-" + taskId);
    var resetBtn = document.getElementById("reset-" + taskId);

    if (isListeningGapsPassed(taskId)) {
      if (checkBtn) checkBtn.hidden = true;
      if (resetBtn) resetBtn.hidden = true;
      setListeningRevealVisible(taskId, false);
      if (listeningMcMax(task) > 0) showPrepNextButton(taskId);
      else hidePrepNextButton(taskId);
      return;
    }

    hidePrepNextButton(taskId);
    if (checkBtn) checkBtn.hidden = false;
    if (resetBtn) resetBtn.hidden = false;
    setListeningRevealVisible(taskId, true);
  }

  function isListeningMcComplete(taskId) {
    var task = findTask(taskId);
    if (!task || !task.questions || !task.questions.length) return true;
    var prefix = taskPrefix(taskId);
    for (var i = 0; i < task.questions.length; i += 1) {
      if (!getCheckedValue(prefix + "_q_" + i)) return false;
    }
    return true;
  }

  function hasNextInterview(taskId) {
    if (!state.topic || !state.topic.tasks) return false;
    var ids = state.topic.tasks.map(function (task) {
      return task.id;
    });
    var idx = ids.indexOf(taskId);
    return idx >= 0 && idx < ids.length - 1;
  }

  function hideListeningFinishButtons(taskId) {
    var startOverBtn = document.getElementById("start-over-" + taskId);
    var nextInterviewBtn = document.getElementById("next-interview-" + taskId);
    if (prepNextPulseTimers["interview-" + taskId]) {
      window.clearTimeout(prepNextPulseTimers["interview-" + taskId]);
      delete prepNextPulseTimers["interview-" + taskId];
    }
    if (startOverBtn) startOverBtn.hidden = true;
    if (nextInterviewBtn) {
      nextInterviewBtn.hidden = true;
      nextInterviewBtn.classList.remove("ege-btn--pulse");
    }
  }

  function syncListeningMcFooterUI(taskId) {
    var task = findTask(taskId);
    if (!task || task.type !== "listening") return;
    if (getListeningStepKind(task, getListeningStep(taskId)) !== "mc") return;

    var checkBtn = document.getElementById("check-" + taskId);
    var resetBtn = document.getElementById("reset-" + taskId);
    var showBtn = document.getElementById("show-" + taskId);
    var startOverBtn = document.getElementById("start-over-" + taskId);
    var nextInterviewBtn = document.getElementById("next-interview-" + taskId);

    hidePrepNextButton(taskId);

    if (isListeningMcPassed(taskId)) {
      if (checkBtn) checkBtn.hidden = true;
      if (resetBtn) resetBtn.hidden = true;
      if (showBtn) showBtn.hidden = true;
      if (startOverBtn) startOverBtn.hidden = false;
      if (nextInterviewBtn) {
        var canNext = hasNextInterview(taskId);
        nextInterviewBtn.hidden = !canNext;
        if (
          canNext &&
          !nextInterviewBtn.classList.contains("ege-btn--pulse") &&
          !prepNextPulseTimers["interview-" + taskId]
        ) {
          prepNextPulseTimers["interview-" + taskId] = window.setTimeout(function () {
            delete prepNextPulseTimers["interview-" + taskId];
            var btn = document.getElementById("next-interview-" + taskId);
            if (btn && !btn.hidden) btn.classList.add("ege-btn--pulse");
          }, 2000);
        }
      }
      return;
    }

    hideListeningFinishButtons(taskId);
    if (resetBtn) resetBtn.hidden = false;
    if (checkBtn) checkBtn.hidden = !isListeningMcComplete(taskId);
    if (showBtn) showBtn.hidden = false;
  }

  function isListeningPrepGapFillComplete(taskId) {
    var task = findTask(taskId);
    if (!task || !task.prep || !task.prep.gapFill || !task.prep.gapFill.items) return true;
    return eachPrepGapInputFilled(taskPrefix(taskId), task.prep.gapFill.items);
  }

  function syncListeningPrepVisibility(taskId) {
    var task = findTask(taskId);
    var taskEl = document.getElementById("task-" + taskId);
    if (!task || !taskEl) return;

    var gapPanel = taskEl.querySelector(".ege-panel--prep-gapfill");
    var matchPanel = taskEl.querySelector(".ege-panel--prep-match");
    var kind = getListeningStepKind(task, getListeningStep(taskId));

    if (taskHasSplitPrep(task)) {
      if (gapPanel) gapPanel.hidden = kind !== "prep-gap";
      if (matchPanel) {
        matchPanel.hidden = kind !== "prep-match" || !isPrepMatchingUnlocked(taskId);
      }
      return;
    }

    if (matchPanel) matchPanel.hidden = !isPrepMatchingUnlocked(taskId);
  }

  function isListeningPrepComplete(taskId) {
    var task = findTask(taskId);
    if (!task || !task.prep) return true;

    var prefix = taskPrefix(taskId);
    var prep = task.prep;

    if (prep.gapFill && prep.gapFill.items && prep.gapFill.items.length) {
      if (!isPrepMatchingUnlocked(taskId)) return false;
    }

    if (prep.matching && prep.matching.expressions) {
      for (var j = 0; j < prep.matching.expressions.length; j += 1) {
        var expr = prep.matching.expressions[j];
        if (!getCheckedValue(prefix + "_prep_m_" + expr.id)) return false;
      }
    }

    return true;
  }

  function attachListeningPrepGapFill(wrap) {
    var bank = wrap.querySelector(".ege-prep-wordbank");
    var list = wrap.querySelector(".ege-prep-gapfill__items");
    if (!bank || !list) return;

    var pickedChip = null;
    var dragWord = null;
    var live = wrap.querySelector(".ege-prep-gapfill-live");

    function prepTaskId() {
      var taskEl = wrap.closest(".ege-task");
      return taskEl ? taskEl.dataset.taskId : null;
    }

    function getChips() {
      return Array.prototype.slice.call(wrap.querySelectorAll(".ege-prep-wordbank__word"));
    }

    function getDrops() {
      return Array.prototype.slice.call(wrap.querySelectorAll(".ege-prep-gapfill__slot"));
    }

    function notifyChange() {
      wrap.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function announce(message) {
      if (live) live.textContent = message;
    }

    function updateProgress() {
      notifyChange();
      var taskId = prepTaskId();
      if (taskId) syncListeningPrepFooterUI(taskId);
    }

    function chipIsAvailable(chip) {
      return chip && !chip.classList.contains("is-used");
    }

    function findAvailableChip(word) {
      var chips = getChips();
      for (var i = 0; i < chips.length; i += 1) {
        if (chips[i].dataset.word === word && chipIsAvailable(chips[i])) return chips[i];
      }
      return null;
    }

    function setChipUsed(word, used) {
      getChips().forEach(function (chip) {
        if (chip.dataset.word !== word) return;
        chip.classList.toggle("is-used", used);
        chip.classList.remove("is-selected");
        chip.setAttribute("aria-pressed", used ? "true" : "false");
        if (used) chip.draggable = false;
        else chip.draggable = true;
      });
    }

    function releaseWord(word) {
      if (!word) return;
      setChipUsed(word, false);
    }

    function resetDropAppearance(drop) {
      drop.classList.remove("is-filled", "is-checked-correct", "is-checked-wrong", "is-dragover");
      drop.removeAttribute("title");
    }

    function gapLabel(drop) {
      return drop.getAttribute("aria-label") || "gap";
    }

    function clearDrop(drop) {
      var word = prepGapSlotValue(drop);
      if (!drop || !word) return;
      releaseWord(word);
      setPrepGapSlotValue(drop, "");
      resetDropAppearance(drop);
      var taskId = prepTaskId();
      if (taskId) resetPrepGapFeedback(taskId);
      updateProgress();
      announce(gapLabel(drop) + " cleared. " + word + " returned to word bank.");
    }

    function assignWord(drop, word) {
      if (!word || !drop) return;
      if (!findAvailableChip(word) && prepGapSlotValue(drop) !== word) return;

      getDrops().forEach(function (slot) {
        if (slot !== drop && prepGapSlotValue(slot) === word) {
          setPrepGapSlotValue(slot, "");
          resetDropAppearance(slot);
        }
      });

      var current = prepGapSlotValue(drop);
      if (current && current !== word) releaseWord(current);

      var taskId = prepTaskId();
      if (taskId) resetPrepGapFeedback(taskId);

      setPrepGapSlotValue(drop, word);
      setChipUsed(word, true);
      drop.classList.remove("is-dragover");
      drop.removeAttribute("title");
      updateProgress();
      announce(word + " placed in " + gapLabel(drop) + ".");
    }

    function clearDragover() {
      getDrops().forEach(function (drop) {
        drop.classList.remove("is-dragover");
      });
      bank.classList.remove("is-dragover");
    }

    function selectChip(chip) {
      if (!chipIsAvailable(chip)) return;
      if (pickedChip === chip) {
        pickedChip.classList.remove("is-selected");
        pickedChip.setAttribute("aria-pressed", "false");
        pickedChip = null;
        return;
      }
      getChips().forEach(function (item) {
        item.classList.remove("is-selected");
        item.setAttribute("aria-pressed", "false");
      });
      pickedChip = chip;
      chip.classList.add("is-selected");
      chip.setAttribute("aria-pressed", "true");
    }

    function activateDrop(drop) {
      if (pickedChip) {
        assignWord(drop, pickedChip.dataset.word);
        pickedChip.classList.remove("is-selected");
        pickedChip.setAttribute("aria-pressed", "false");
        pickedChip = null;
        return;
      }
      if (prepGapSlotValue(drop)) clearDrop(drop);
    }

    wrap.resetPrepGapFill = function () {
      getDrops().forEach(function (drop) {
        var word = prepGapSlotValue(drop);
        if (word) releaseWord(word);
        setPrepGapSlotValue(drop, "");
        resetDropAppearance(drop);
      });
      pickedChip = null;
      dragWord = null;
      getChips().forEach(function (chip) {
        chip.classList.remove("is-selected", "is-used", "is-dragging");
        chip.setAttribute("aria-pressed", "false");
        chip.draggable = true;
      });
      if (wrap._prepGapFillConfig) {
        var layout = ensurePrepLayout(wrap.dataset.prepTaskId, {
          gapFill: {
            items: wrap._prepGapFillConfig.items,
            wordBank: wrap._prepGapFillConfig.wordBank,
          },
        });
        renderPrepWordBank(bank, wrap._prepGapFillConfig.wordBank, layout.wordBank);
        renderPrepGapFillItems(
          list,
          wrap._prepGapFillConfig.items,
          wrap._prepGapFillConfig.prefix,
          layout.gapItemIds
        );
      }
      clearDragover();
      updateProgress();
      if (live) live.textContent = "";
    };

    wrap.fillCorrectAnswers = function () {
      var cfg = wrap._prepGapFillConfig;
      if (!cfg || !cfg.items || !cfg.prefix) return;
      if (wrap.classList.contains("is-review")) return;
      cfg.items.forEach(function (item) {
        var drop = document.getElementById(cfg.prefix + "_prep_gf_" + item.id);
        if (drop) assignWord(drop, item.answer);
      });
    };

    wrap.addEventListener("dragstart", function (event) {
      var chip = event.target.closest(".ege-prep-wordbank__word");
      if (!chip || !wrap.contains(chip)) return;
      if (!chipIsAvailable(chip)) {
        event.preventDefault();
        return;
      }
      dragWord = chip.dataset.word;
      chip.classList.add("is-dragging");
      event.dataTransfer.setData("text/plain", dragWord);
      event.dataTransfer.effectAllowed = "move";
    });

    wrap.addEventListener("dragend", function (event) {
      var chip = event.target.closest(".ege-prep-wordbank__word");
      if (!chip || !wrap.contains(chip)) return;
      chip.classList.remove("is-dragging");
      dragWord = null;
      clearDragover();
    });

    wrap.addEventListener("dragover", function (event) {
      var drop = event.target.closest(".ege-prep-gapfill__slot");
      var bankEl = event.target.closest(".ege-prep-wordbank");
      if (!drop && !bankEl) return;
      event.preventDefault();
      clearDragover();
      if (drop) {
        drop.classList.add("is-dragover");
        event.dataTransfer.dropEffect = "move";
      } else {
        bank.classList.add("is-dragover");
      }
    });

    wrap.addEventListener("drop", function (event) {
      var drop = event.target.closest(".ege-prep-gapfill__slot");
      var bankEl = event.target.closest(".ege-prep-wordbank");
      if (!drop && !bankEl) return;
      event.preventDefault();
      clearDragover();
      var word = event.dataTransfer.getData("text/plain") || dragWord;
      if (drop && word) {
        assignWord(drop, word);
        if (pickedChip) {
          pickedChip.classList.remove("is-selected");
          pickedChip.setAttribute("aria-pressed", "false");
        }
        pickedChip = null;
        return;
      }
      if (bankEl && word) {
        getDrops().forEach(function (slot) {
          if (prepGapSlotValue(slot) === word) clearDrop(slot);
        });
      }
    });

    wrap.addEventListener("click", function (event) {
      var chip = event.target.closest(".ege-prep-wordbank__word");
      var drop = event.target.closest(".ege-prep-gapfill__slot");
      if (chip && wrap.contains(chip)) {
        selectChip(chip);
        return;
      }
      if (drop && wrap.contains(drop)) activateDrop(drop);
    });

    wrap.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      var chip = event.target.closest(".ege-prep-wordbank__word");
      var drop = event.target.closest(".ege-prep-gapfill__slot");
      if (!chip && !drop) return;
      event.preventDefault();
      if (chip && wrap.contains(chip)) selectChip(chip);
      else if (drop && wrap.contains(drop)) activateDrop(drop);
    });

    updateProgress();
  }

  function ensurePrepLayout(taskId, prep) {
    if (!state.prepLayouts[taskId]) state.prepLayouts[taskId] = {};
    var layout = state.prepLayouts[taskId];
    var gapItems = prep.gapFill && prep.gapFill.items;
    if (gapItems && gapItems.length && !layout.gapItemIds) {
      layout.gapItemIds = shuffleList(prepItemIds(gapItems));
    }
    var wordBank = prep.gapFill && prep.gapFill.wordBank;
    if (wordBank && wordBank.length && !layout.wordBank) {
      layout.wordBank = shuffleList(wordBank.slice());
    }
    return layout;
  }

  function buildListeningPrepGapFill(prep, topicId, taskId) {
    var gapFill = prep.gapFill;
    if (!gapFill) return null;

    var prefix = topicId + "_" + taskId;
    var wrap = document.createElement("div");
    wrap.className = "ege-prep-gapfill";
    wrap.dataset.prepTaskId = taskId;

    wrap._prepGapFillConfig = {
      items: gapFill.items || [],
      wordBank: gapFill.wordBank || [],
      prefix: prefix,
    };

    var itemCount = (gapFill.items || []).length;
    if (itemCount) {
      var live = document.createElement("p");
      live.className = "ege-prep-gapfill-live ege-match-hidden";
      live.setAttribute("aria-live", "polite");
      live.setAttribute("aria-atomic", "true");
      wrap.appendChild(live);
    }

    var layout = ensurePrepLayout(taskId, prep);

    if (gapFill.wordBank && gapFill.wordBank.length) {
      var bank = document.createElement("div");
      bank.className = "ege-prep-wordbank";
      bank.setAttribute("aria-label", "Word bank");
      renderPrepWordBank(bank, gapFill.wordBank, layout.wordBank);
      wrap.appendChild(bank);
    }

    var list = document.createElement("div");
    list.className = "ege-prep-gapfill__items";
    renderPrepGapFillItems(list, gapFill.items || [], prefix, layout.gapItemIds);
    wrap.appendChild(list);
    attachListeningPrepGapFill(wrap);
    return wrap;
  }

  function shuffleList(items) {
    var list = items.slice();
    for (var i = list.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function seededShuffleList(items, seed) {
    var list = items.slice();
    var hash = 0;
    for (var s = 0; s < seed.length; s += 1) {
      hash = ((hash << 5) - hash + seed.charCodeAt(s)) | 0;
    }
    for (var i = list.length - 1; i > 0; i -= 1) {
      hash = (hash * 1103515245 + 12345) | 0;
      var j = Math.abs(hash) % (i + 1);
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function compareMeaningIds(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }

  function sortedMeanings(meanings) {
    return meanings.slice().sort(function (a, b) {
      return compareMeaningIds(a.id, b.id);
    });
  }

  function shuffleMatchingMeaningContent(matching, seed) {
    var meanings = matching.meanings || [];
    var answers = matching.answers || {};
    if (meanings.length < 2) return;

    var ordered = sortedMeanings(meanings);
    var originalTextById = {};
    meanings.forEach(function (meaning) {
      originalTextById[meaning.id] = meaning.text;
    });

    var texts = ordered.map(function (meaning) {
      return originalTextById[meaning.id];
    });
    var shuffledTexts = seededShuffleList(texts, seed || "matching");
    if (shuffledTexts.every(function (text, index) {
      return text === texts[index];
    })) {
      shuffledTexts.push(shuffledTexts.shift());
    }

    ordered.forEach(function (meaning, index) {
      meaning.text = shuffledTexts[index];
    });

    var letterForText = {};
    ordered.forEach(function (meaning) {
      letterForText[meaning.text] = meaning.id;
    });

    Object.keys(answers).forEach(function (exprId) {
      var originalLetter = answers[exprId];
      var targetText = originalTextById[originalLetter];
      if (targetText && letterForText[targetText]) {
        answers[exprId] = letterForText[targetText];
      }
    });
  }

  function orderPrepByIds(items, idOrder) {
    var map = {};
    items.forEach(function (item) {
      map[item.id] = item;
    });
    return idOrder
      .map(function (id) {
        return map[id];
      })
      .filter(Boolean);
  }

  function prepItemIds(items) {
    return items.map(function (item) {
      return item.id;
    });
  }

  function resolvePrepIdOrder(idOrder, items) {
    if (idOrder && idOrder.length) return idOrder.slice();
    return shuffleList(prepItemIds(items));
  }

  function renderPrepWordBank(bank, words, wordOrder) {
    bank.textContent = "";
    var ordered =
      wordOrder && wordOrder.length ? wordOrder.slice() : shuffleList(words.slice());
    ordered.forEach(function (word) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ege-prep-wordbank__word";
      chip.draggable = true;
      chip.dataset.word = word;
      chip.setAttribute("aria-pressed", "false");
      chip.textContent = word;
      bank.appendChild(chip);
    });
  }

  function buildPrepGapFillLine(item, prefix, displayNum) {
    var line = document.createElement("p");
    line.className = "ege-prep-gapfill__item";

    var num = document.createElement("span");
    num.className = "ege-prep-gapfill__num";
    num.textContent = displayNum + ".";
    line.appendChild(num);

    var parts = String(item.sentence || "").split(/_{2,}/);
    if (parts[0]) line.appendChild(document.createTextNode(parts[0]));

    var slot = document.createElement("button");
    slot.type = "button";
    slot.className = "ege-prep-gapfill__slot";
    slot.id = prefix + "_prep_gf_" + item.id;
    slot.setAttribute("aria-label", "Gap " + displayNum);

    var slotText = document.createElement("span");
    slotText.className = "ege-prep-gapfill__slot-text";
    slot.appendChild(slotText);
    line.appendChild(slot);

    if (parts[1]) line.appendChild(document.createTextNode(parts[1]));
    return line;
  }

  function renderPrepGapFillItems(list, items, prefix, idOrder) {
    list.textContent = "";
    orderPrepByIds(items, resolvePrepIdOrder(idOrder, items)).forEach(function (item, index) {
      list.appendChild(buildPrepGapFillLine(item, prefix, index + 1));
    });
  }

  function buildPrepPairCard(kind, badge, text, id) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "ege-prep-pair-card";
    card.setAttribute("aria-pressed", "false");

    if (kind === "expr") {
      card.dataset.exprId = String(id);
      card.setAttribute("aria-label", "Expression " + id + ": " + text);
    } else {
      card.dataset.meanId = String(id);
      card.setAttribute("aria-label", "Meaning " + id + ": " + text);
    }

    var badgeEl = document.createElement("span");
    badgeEl.className = "ege-prep-pair-badge";
    badgeEl.textContent = badge;
    badgeEl.setAttribute("aria-hidden", "true");

    var textEl = document.createElement("span");
    textEl.className = "ege-prep-pair-text";
    textEl.textContent = text;

    card.appendChild(badgeEl);
    card.appendChild(textEl);

    var link = document.createElement("span");
    link.className = "ege-prep-pair-link";
    link.hidden = true;
    link.setAttribute("aria-hidden", "true");
    card.appendChild(link);

    return card;
  }

  function orderedPrepExpressions(expressions, idOrder) {
    if (idOrder && idOrder.length) return orderPrepByIds(expressions, idOrder);
    return expressions.slice().sort(function (a, b) {
      return a.id - b.id;
    });
  }

  function renderPrepExpressions(exprCol, expressions, idOrder) {
    exprCol.textContent = "";
    orderedPrepExpressions(expressions, idOrder).forEach(function (expr) {
      exprCol.appendChild(buildPrepPairCard("expr", String(expr.id), expr.text, expr.id));
    });
  }

  function renderPrepMeanings(meanCol, meanings) {
    meanCol.textContent = "";
    sortedMeanings(meanings).forEach(function (meaning) {
      meanCol.appendChild(buildPrepPairCard("mean", meaning.id, meaning.text, meaning.id));
    });
  }

  function attachListeningPrepPairing(wrap, config) {
    var prefix = config.prefix;
    var answers = config.answers;
    var expressions = config.expressions;
    var meanings = config.meanings;
    var total = expressions.length;
    var exprCol = wrap.querySelector(".ege-prep-pair-col--expr");
    var meanCol = wrap.querySelector(".ege-prep-pair-col--mean");
    var hidden = wrap.querySelector(".ege-prep-pair-hidden");
    var countEl = wrap.querySelector(".ege-prep-pair-count");
    var live = wrap.querySelector(".ege-prep-pair-live");

    var selectedExpr = null;
    var selectedMean = null;
    var matchedCount = 0;

    expressions.forEach(function (expr) {
      var group = document.createElement("div");
      group.className = "ege-choice-group ege-choice-group--inline";
      group.setAttribute("role", "radiogroup");
      meanings.forEach(function (meaning) {
        var label = document.createElement("label");
        label.className = "ege-pill";
        var input = document.createElement("input");
        input.type = "radio";
        input.name = prefix + "_" + expr.id;
        input.value = meaning.id;
        label.appendChild(input);
        label.appendChild(document.createTextNode(meaning.id));
        group.appendChild(label);
      });
      hidden.appendChild(group);
    });

    function notifyChange() {
      wrap.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function announce(message) {
      if (live) live.textContent = message;
    }

    function updateProgress() {
      if (countEl) countEl.textContent = matchedCount + " / " + total + " matched";
      notifyChange();
      var taskId = wrap.dataset.prepTaskId;
      if (taskId && isPrepMatchingUnlocked(taskId)) syncListeningPrepFooterUI(taskId);
    }

    function exprCards() {
      return wrap.querySelectorAll(".ege-prep-pair-card[data-expr-id]");
    }

    function meanCards() {
      return wrap.querySelectorAll(".ege-prep-pair-card[data-mean-id]");
    }

    function clearSelection() {
      selectedExpr = null;
      selectedMean = null;
      exprCards().forEach(function (card) {
        if (!card.disabled) {
          card.classList.remove("is-selected");
          card.setAttribute("aria-pressed", "false");
        }
      });
      meanCards().forEach(function (card) {
        if (!card.disabled) {
          card.classList.remove("is-selected");
          card.setAttribute("aria-pressed", "false");
        }
      });
    }

    function alignMatchedColumns() {
      var orderedExprs = Array.prototype.slice.call(exprCards());
      orderedExprs.forEach(function (exprCard) {
        var letter = answers[String(exprCard.dataset.exprId)];
        if (!letter) return;
        var meanCard = wrap.querySelector(
          '.ege-prep-pair-card[data-mean-id="' + letter + '"]'
        );
        if (meanCard && meanCard.parentElement === meanCol) {
          meanCol.appendChild(meanCard);
        }
      });
    }

    function lockPair(exprCard, meanCard, letter) {
      exprCard.classList.add("is-matched");
      exprCard.classList.remove("is-selected", "is-error");
      exprCard.setAttribute("aria-pressed", "true");
      exprCard.disabled = true;

      meanCard.classList.add("is-matched");
      meanCard.classList.remove("is-selected", "is-error");
      meanCard.setAttribute("aria-pressed", "true");
      meanCard.disabled = true;

      var exprLink = exprCard.querySelector(".ege-prep-pair-link");
      if (exprLink) {
        exprLink.textContent = "→ " + letter;
        exprLink.hidden = false;
      }
      var meanLink = meanCard.querySelector(".ege-prep-pair-link");
      if (meanLink) {
        meanLink.textContent = "← " + exprCard.dataset.exprId;
        meanLink.hidden = false;
      }

      setRadioValue(prefix + "_" + exprCard.dataset.exprId, letter);
      matchedCount += 1;
      if (matchedCount >= total) alignMatchedColumns();
      updateProgress();
      announce("Expression " + exprCard.dataset.exprId + " matched with " + letter + ". Correct.");
    }

    function flashError(exprCard, meanCard) {
      exprCard.classList.add("is-error");
      meanCard.classList.add("is-error");
      announce("Incorrect match. Try again.");
      window.setTimeout(function () {
        exprCard.classList.remove("is-error", "is-selected");
        meanCard.classList.remove("is-error", "is-selected");
        clearSelection();
      }, 400);
    }

    function tryPair(exprCard, meanCard) {
      var exprId = exprCard.dataset.exprId;
      var letter = meanCard.dataset.meanId;
      if (answers[String(exprId)] === letter) {
        lockPair(exprCard, meanCard, letter);
        clearSelection();
      } else {
        flashError(exprCard, meanCard);
      }
    }

    function selectExpr(card) {
      if (card.classList.contains("is-selected")) {
        card.classList.remove("is-selected");
        card.setAttribute("aria-pressed", "false");
        selectedExpr = null;
        return;
      }
      if (selectedMean) {
        tryPair(card, selectedMean);
        return;
      }
      exprCards().forEach(function (other) {
        if (other !== card && !other.disabled) {
          other.classList.remove("is-selected");
          other.setAttribute("aria-pressed", "false");
        }
      });
      card.classList.add("is-selected");
      card.setAttribute("aria-pressed", "true");
      selectedExpr = card;
      selectedMean = null;
      meanCards().forEach(function (other) {
        if (!other.disabled) {
          other.classList.remove("is-selected");
          other.setAttribute("aria-pressed", "false");
        }
      });
    }

    function selectMean(card) {
      if (card.classList.contains("is-selected")) {
        card.classList.remove("is-selected");
        card.setAttribute("aria-pressed", "false");
        selectedMean = null;
        return;
      }
      if (selectedExpr) {
        tryPair(selectedExpr, card);
        return;
      }
      meanCards().forEach(function (other) {
        if (other !== card && !other.disabled) {
          other.classList.remove("is-selected");
          other.setAttribute("aria-pressed", "false");
        }
      });
      card.classList.add("is-selected");
      card.setAttribute("aria-pressed", "true");
      selectedMean = card;
      selectedExpr = null;
      exprCards().forEach(function (other) {
        if (!other.disabled) {
          other.classList.remove("is-selected");
          other.setAttribute("aria-pressed", "false");
        }
      });
    }

    wrap.addEventListener("click", function (event) {
      var exprCard = event.target.closest(".ege-prep-pair-card[data-expr-id]");
      var meanCard = event.target.closest(".ege-prep-pair-card[data-mean-id]");
      if (exprCard && !exprCard.disabled) {
        selectExpr(exprCard);
        return;
      }
      if (meanCard && !meanCard.disabled) {
        selectMean(meanCard);
      }
    });

    wrap.resetPrepMatch = function () {
      matchedCount = 0;
      clearSelection();
      exprCards().forEach(function (card) {
        card.disabled = false;
        card.classList.remove("is-matched", "is-selected", "is-error", "is-correct", "is-wrong");
        card.setAttribute("aria-pressed", "false");
        clearChoiceGroup(prefix + "_" + card.dataset.exprId);
      });
      meanCards().forEach(function (card) {
        card.disabled = false;
        card.classList.remove("is-matched", "is-selected", "is-error", "is-correct", "is-wrong");
        card.setAttribute("aria-pressed", "false");
      });
      renderPrepExpressions(exprCol, expressions);
      renderPrepMeanings(meanCol, meanings);
      updateProgress();
      if (live) live.textContent = "";
    };

    wrap.fillCorrectAnswers = function () {
      Object.keys(answers).forEach(function (exprId) {
        var letter = answers[exprId];
        var exprCard = wrap.querySelector(
          '.ege-prep-pair-card[data-expr-id="' + exprId + '"]'
        );
        var meanCard = wrap.querySelector(
          '.ege-prep-pair-card[data-mean-id="' + letter + '"]'
        );
        if (exprCard && meanCard && !exprCard.disabled) {
          lockPair(exprCard, meanCard, letter);
        } else if (exprCard && meanCard) {
          var exprLink = exprCard.querySelector(".ege-prep-pair-link");
          if (exprLink) {
            exprLink.textContent = "→ " + letter;
            exprLink.hidden = false;
          }
          var meanLink = meanCard.querySelector(".ege-prep-pair-link");
          if (meanLink) {
            meanLink.textContent = "← " + exprId;
            meanLink.hidden = false;
          }
        }
      });
      alignMatchedColumns();
    };

    updateProgress();
  }

  function buildListeningPrepMatching(prep, topicId, taskId) {
    var match = prep.matching;
    if (!match) return null;

    var expressions = match.expressions || [];
    var meanings = match.meanings || [];
    if (!expressions.length || !meanings.length) return null;

    var prefix = topicId + "_" + taskId + "_prep_m";
    var wrap = document.createElement("div");
    wrap.className = "ege-prep-match";
    wrap.dataset.prepTaskId = taskId;
    wrap._prepExpressions = expressions;

    var layout = ensurePrepLayout(taskId, prep);

    if (match.instruction) {
      var instr = document.createElement("p");
      instr.className = "ege-instructions";
      instr.textContent = match.instruction;
      wrap.appendChild(instr);
    }

    var status = document.createElement("div");
    status.className = "ege-prep-pair-status";

    var count = document.createElement("p");
    count.className = "ege-prep-pair-count";
    status.appendChild(count);
    wrap.appendChild(status);

    var live = document.createElement("p");
    live.className = "ege-prep-pair-live ege-match-hidden";
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    wrap.appendChild(live);

    var board = document.createElement("div");
    board.className = "ege-prep-pair-board";

    var exprCol = document.createElement("div");
    exprCol.className = "ege-prep-pair-col ege-prep-pair-col--expr";
    renderPrepExpressions(exprCol, expressions);

    var meanCol = document.createElement("div");
    meanCol.className = "ege-prep-pair-col ege-prep-pair-col--mean";
    renderPrepMeanings(meanCol, meanings);

    board.appendChild(exprCol);
    board.appendChild(meanCol);
    wrap.appendChild(board);

    var hidden = document.createElement("div");
    hidden.className = "ege-prep-pair-hidden ege-match-hidden";
    wrap.appendChild(hidden);

    attachListeningPrepPairing(wrap, {
      prefix: prefix,
      answers: match.answers || {},
      expressions: expressions,
      meanings: meanings,
    });

    return wrap;
  }

  function buildListeningPrepGapInstruction(task) {
    var gapFill = task.prep && task.prep.gapFill;
    if (!gapFill || !gapFill.instruction) return null;

    var instr = document.createElement("p");
    instr.className = "ege-listening-prep-instr";
    instr.id = "prep-gap-instr-" + task.id;
    instr.textContent = gapFill.instruction;
    return instr;
  }

  function syncListeningPrepGapInstructionUI(taskId) {
    var instr = document.getElementById("prep-gap-instr-" + taskId);
    if (!instr) return;

    var task = findTask(taskId);
    var kind = task && getListeningStepKind(task, getListeningStep(taskId));
    var show =
      task &&
      task.type === "listening" &&
      kind === "prep-gap" &&
      !isPrepMatchingUnlocked(taskId) &&
      task.prep &&
      task.prep.gapFill &&
      task.prep.gapFill.instruction;

    instr.hidden = !show;
  }

  function buildListeningPrepStep(task, topicId) {
    var step = document.createElement("div");
    step.className = "ege-listening-step ege-listening-step--prep";

    if (!task.prep) {
      step.hidden = true;
      return step;
    }

    var stack = document.createElement("div");
    stack.className = "ege-prep-stack";

    var gapFill = buildListeningPrepGapFill(task.prep, topicId, task.id);
    if (gapFill) stack.appendChild(buildPanel("", gapFill, "ege-panel--prep-gapfill"));

    var matching = buildListeningPrepMatching(task.prep, topicId, task.id);
    if (matching) {
      var matchPanel = buildPanel("", matching, "ege-panel--prep-match");
      matchPanel.hidden = !!(task.prep.gapFill && task.prep.gapFill.items && task.prep.gapFill.items.length);
      stack.appendChild(matchPanel);
    }

    step.appendChild(stack);
    return step;
  }

  function buildListeningFooter(task) {
    var taskId = task.id;
    var max = taskMaxScore(task);

    var footer = document.createElement("div");
    footer.className = "ege-task__footer ege-listening-footer";

    var actions = document.createElement("div");
    actions.className = "ege-task__actions";

    var checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "ege-btn ege-btn--primary";
    checkBtn.id = "check-" + taskId;
    checkBtn.textContent = "Check answers";
    checkBtn.hidden = true;
    checkBtn.addEventListener("click", function () {
      checkTask(taskId);
    });

    if (task.prep && task.prep.gapFill && task.prep.gapFill.items && task.prep.gapFill.items.length) {
      var prepFill = document.createElement("p");
      prepFill.className = "ege-listening-prep-fill";
      prepFill.id = "prep-fill-" + taskId;
      prepFill.textContent = "0 / " + task.prep.gapFill.items.length;
      actions.appendChild(prepFill);
    }

    actions.appendChild(checkBtn);

    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "ege-btn ege-btn--primary";
    nextBtn.id = "prep-next-" + taskId;
    nextBtn.textContent = "Next";
    nextBtn.hidden = true;
    nextBtn.title = "Next (Enter)";
    nextBtn.setAttribute("aria-keyshortcuts", "Enter");
    nextBtn.addEventListener("click", function () {
      var current = findTask(taskId);
      if (!current) return;
      var kind = getListeningStepKind(current, getListeningStep(taskId));
      hideScoreFeedback(taskId);
      hidePrepNextButton(taskId);
      if (kind === "prep-gap" && isPrepMatchingUnlocked(taskId)) {
        setListeningStep(taskId, 2);
        return;
      }
      if (kind === "prep-match" && isPrepMatchPassed(taskId)) {
        setListeningStep(taskId, 3);
        return;
      }
      if (kind === "listening" && isListeningGapsPassed(taskId) && listeningMcMax(current) > 0) {
        var mcStep = taskHasSplitPrep(current) ? 4 : current.prep ? 3 : 2;
        setListeningStep(taskId, mcStep);
      }
    });
    actions.appendChild(nextBtn);

    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ege-btn ege-btn--ghost";
    resetBtn.id = "reset-" + taskId;
    resetBtn.textContent = "Reset";
    bindResetButton(resetBtn, taskId);
    actions.appendChild(resetBtn);

    var showBtn = document.createElement("button");
    showBtn.type = "button";
    showBtn.className = "ege-btn ege-btn--ghost";
    showBtn.id = "show-" + taskId;
    showBtn.textContent = "Show answers";
    showBtn.hidden = true;
    showBtn.addEventListener("click", function () {
      revealTask(taskId);
    });
    actions.appendChild(showBtn);

    var startOverBtn = document.createElement("button");
    startOverBtn.type = "button";
    startOverBtn.className = "ege-btn ege-btn--ghost";
    startOverBtn.id = "start-over-" + taskId;
    startOverBtn.textContent = "Start over";
    startOverBtn.hidden = true;
    startOverBtn.addEventListener("click", function () {
      resetTask(taskId);
    });
    actions.appendChild(startOverBtn);

    var nextInterviewBtn = document.createElement("button");
    nextInterviewBtn.type = "button";
    nextInterviewBtn.className = "ege-btn ege-btn--primary";
    nextInterviewBtn.id = "next-interview-" + taskId;
    nextInterviewBtn.textContent = "Next interview";
    nextInterviewBtn.hidden = true;
    nextInterviewBtn.title = "Next interview (Enter)";
    nextInterviewBtn.setAttribute("aria-keyshortcuts", "Enter");
    nextInterviewBtn.addEventListener("click", function () {
      showAdjacentTask(1);
    });
    actions.appendChild(nextInterviewBtn);

    footer.appendChild(actions);

    var score = document.createElement("p");
    score.className = "ege-task__score";
    score.id = "score-" + taskId;
    score.hidden = true;
    score.setAttribute("aria-live", "polite");
    footer.insertBefore(score, actions);
    footer.dataset.max = String(max);
    return footer;
  }

  function restoreAllListeningChromes() {
    document.querySelectorAll(".ege-listening-chrome[data-home-panel]").forEach(function (chrome) {
      var root = document.querySelector("#" + chrome.dataset.homePanel + " .ege-listening-root");
      if (root && chrome.parentElement !== root) {
        root.insertBefore(chrome, root.firstChild);
      }
    });
  }

  function mountListeningChrome(taskId) {
    var host = document.getElementById("egeListeningChrome");
    restoreAllListeningChromes();
    if (!host) return;

    if (state.topicId !== "listening" || !taskId) {
      host.hidden = true;
      return;
    }

    var task = findTask(taskId);
    if (!task || task.type !== "listening") {
      host.hidden = true;
      return;
    }

    var chrome = document.querySelector("#panel-" + taskId + " .ege-listening-chrome");
    if (!chrome) {
      host.hidden = true;
      return;
    }

    host.hidden = false;
    host.replaceChildren(chrome);
  }

  var listeningNavAlignRaf = 0;

  function syncListeningChromeAlign() {
    if (state.topicId !== "listening") return;
    if (window.matchMedia("(max-width: 860px)").matches) return;

    var host = document.getElementById("egeListeningChrome");
    var back = document.querySelector(".ege-topic-sidebar__back");
    if (!host || host.hidden) return;

    var progress = host.querySelector(".ege-listening-progress");
    var instr = host.querySelector(".ege-listening-prep-instr");

    // Keep progress at the top — do not invent margin from viewport midpoints
    // (that created a large empty band above the bar after layout/scroll).
    if (progress) progress.style.marginTop = "";

    if (instr) {
      instr.style.marginTop = "";
      if (!instr.hidden && back) {
        var delta = back.getBoundingClientRect().top - instr.getBoundingClientRect().top;
        if (Math.abs(delta) < 120) {
          instr.style.marginTop = Math.round(delta) + "px";
        }
      }
    }
  }

  function scheduleListeningNavAlign(taskId) {
    if (listeningNavAlignRaf) cancelAnimationFrame(listeningNavAlignRaf);
    listeningNavAlignRaf = requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        listeningNavAlignRaf = 0;
        syncListeningChromeAlign();
        syncListeningNavAlign(taskId || state.activeTaskId);
      });
    });
  }

  function syncListeningNavAlign(taskId) {
    if (state.topicId !== "listening") return;
    if (window.matchMedia("(max-width: 860px)").matches) return;

    var nav = document.getElementById("egeNav");
    var btn = document.getElementById("nav-" + taskId);
    if (!nav || !btn) return;

    nav.style.paddingTop = "";

    var wordBank = null;
    var taskForAlign = findTask(taskId);
    var alignKind = taskForAlign && getListeningStepKind(taskForAlign, getListeningStep(taskId));
    if (alignKind === "prep-gap") {
      var taskEl = document.getElementById("task-" + taskId);
      if (taskEl) wordBank = taskEl.querySelector(".ege-prep-wordbank");
    }

    if (!wordBank) {
      nav.scrollTop = 0;
      return;
    }

    nav.scrollTop = 0;

    var delta = btn.getBoundingClientRect().top - wordBank.getBoundingClientRect().top;
    if (Math.abs(delta) >= 1) {
      nav.scrollTop = Math.max(0, nav.scrollTop + delta);
    }
  }

  var topicNavAlignRaf = 0;
  var topicNavResizeObserver = null;

  function getTopicExercisePanel(taskId) {
    var task = document.getElementById("task-" + taskId);
    if (!task) return null;

    if (task.classList.contains("ege-task--reading-mc")) {
      var workCol = task.querySelector(".ege-work-col");
      if (workCol) return workCol;
    }

    var panel = task.querySelector(".ege-split__work .ege-panel--work");
    if (panel) return panel;

    panel = task.querySelector(".ege-work-col");
    if (panel) return panel;

    panel = task.querySelector(".ege-split__work");
    if (panel) return panel;

    return task;
  }

  function scrollActiveNavIntoView(taskId) {
    if (window.matchMedia("(max-width: 860px)").matches) return;

    var nav = document.getElementById("egeNav");
    var btn = document.getElementById("nav-" + taskId);
    if (!nav || !btn) return;

    btn.scrollIntoView({ block: "nearest" });
  }

  function syncTopicNavAlign(taskId) {
    if (!usesTopicLayout(state.topicId)) return;

    var navShell = document.getElementById("egeTopicNav");
    var nav = document.getElementById("egeNav");
    if (!navShell || !nav) return;

    if (window.matchMedia("(max-width: 860px)").matches) {
      navShell.style.maxHeight = "";
      nav.style.maxHeight = "";
      navShell.classList.remove("is-scrollable");
      return;
    }

    var exercisePanel = getTopicExercisePanel(taskId || state.activeTaskId);
    if (!exercisePanel) {
      navShell.style.maxHeight = "";
      nav.style.maxHeight = "";
      navShell.classList.remove("is-scrollable");
      return;
    }

    var height = Math.round(exercisePanel.getBoundingClientRect().height);
    if (height > 0) {
      navShell.style.maxHeight = height + "px";
      nav.style.maxHeight = height + "px";
    }

    navShell.classList.toggle("is-scrollable", nav.scrollHeight > nav.clientHeight + 1);
  }

  function observeTopicExercisePanel(taskId) {
    if (!topicNavResizeObserver || !usesTopicLayout(state.topicId)) return;

    topicNavResizeObserver.disconnect();
    var panel = getTopicExercisePanel(taskId || state.activeTaskId);
    if (panel) topicNavResizeObserver.observe(panel);
  }

  function scheduleTopicNavAlign(taskId) {
    if (!usesTopicLayout(state.topicId)) return;

    if (topicNavAlignRaf) cancelAnimationFrame(topicNavAlignRaf);
    topicNavAlignRaf = requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        topicNavAlignRaf = 0;
        syncTopicNavAlign(taskId || state.activeTaskId);
        syncReadingMcScrollState(taskId || state.activeTaskId);
      });
    });
  }

  function syncReadingMcScrollState(taskId) {
    if (window.matchMedia("(max-width: 860px)").matches) return;

    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl || !taskEl.classList.contains("ege-task--reading-mc")) return;

    taskEl.querySelectorAll(".ege-work-scroll").forEach(function (el) {
      el.classList.toggle("is-scrollable", el.scrollHeight > el.clientHeight + 1);
    });
  }

  function bindTopicNavAlign() {
    if (window._egeTopicNavAlignBound) return;
    window._egeTopicNavAlignBound = true;

    if (typeof ResizeObserver !== "undefined") {
      topicNavResizeObserver = new ResizeObserver(function () {
        scheduleTopicNavAlign(state.activeTaskId);
      });
    }

    window.addEventListener("resize", function () {
      if (usesTopicLayout(state.topicId)) {
        observeTopicExercisePanel(state.activeTaskId);
        scheduleTopicNavAlign(state.activeTaskId);
      }
    });
  }

  function wrapListeningRoot(task, article) {
    var root = document.createElement("div");
    root.className = "ege-listening-root";

    var chrome = document.createElement("div");
    chrome.className = "ege-listening-chrome";
    chrome.dataset.homePanel = "panel-" + task.id;
    chrome.appendChild(buildListeningProgress(task));
    var prepGapInstr = buildListeningPrepGapInstruction(task);
    if (prepGapInstr) chrome.appendChild(prepGapInstr);
    root.appendChild(chrome);
    root.appendChild(article);

    return root;
  }

  function renderListening(task, topicId) {
    var gaps = getActiveListeningGaps(task);
    var wrap = buildTaskArticle(task);
    wrap.classList.add("ege-task--listening");

    wrap.appendChild(buildListeningPrepStep(task, topicId));

    var readContent = document.createElement("div");
    readContent.className = "ege-listening-read";
    readContent.appendChild(buildListeningAudio(task, topicId));
    if (task.transcript) {
      var transcript = buildListeningTranscript(task);
      readContent.appendChild(transcript);
      if (gaps.length) attachListeningGapLinks(transcript, topicId, task.id);
    }

    if (!gaps.length) {
      if (task.transcript) {
        var soloGapsStep = document.createElement("div");
        soloGapsStep.className = "ege-listening-step ege-listening-step--gaps";
        soloGapsStep.hidden = true;
        soloGapsStep.appendChild(buildPanel("Recording", readContent, "ege-panel--solo"));
        wrap.appendChild(soloGapsStep);
      }
      if (task.questions && task.questions.length) {
        var soloMcStep = document.createElement("div");
        soloMcStep.className = "ege-listening-step ege-listening-step--mc";
        soloMcStep.hidden = true;
        soloMcStep.appendChild(
          buildPanel("", buildListeningMcStack(task, topicId), "ege-panel--listening-mc")
        );
        wrap.appendChild(soloMcStep);
      }
      wrap.appendChild(buildListeningFooter(task));
      wrap.addEventListener("input", function () {
        syncListeningProgressUI(task.id);
        syncListeningMcFooterUI(task.id);
      });
      wrap.addEventListener("change", function () {
        syncListeningProgressUI(task.id);
        syncListeningMcFooterUI(task.id);
      });
      syncListeningPrepFooterUI(task.id);
      syncListeningPrepGapInstructionUI(task.id);
      return wrapListeningRoot(task, wrap);
    }

    var work = document.createElement("div");
    work.className = "ege-listening-answers";

    var listeningInputs = [];

    gaps.forEach(function (gap) {
      var row = document.createElement("div");
      row.className = "ege-listening-row";
      var inputIndex = listeningInputs.length;

      var inputId = topicId + "_" + task.id + "_gap_" + gap.num;

      var label = document.createElement("label");
      label.className = "ege-listening-row__label";
      label.htmlFor = inputId;
      label.textContent = gap.num + ".";

      var input = document.createElement("input");
      input.type = "text";
      input.className = "ege-input ege-listening-input";
      input.id = inputId;
      input.setAttribute("aria-label", "Gap " + gap.num);
      input.autocomplete = "off";
      input.spellcheck = false;
      listeningInputs.push(input);

      input.addEventListener("input", function () {
        var value = input.value.trim();
        resetListeningGapsFeedback(task.id);
        if (value) {
          setListeningMarkText(task.id, gap.num, value);
        } else {
          clearListeningMark(task.id, gap.num);
        }
        input.classList.toggle("is-filled", !!value);
        hideScoreFeedback(task.id);
      });

      input.addEventListener("keydown", function (event) {
        var delta = 0;
        if (event.key === "Enter" || event.key === "ArrowDown") delta = 1;
        else if (event.key === "ArrowUp") delta = -1;
        else return;

        var nextInput = listeningInputs[inputIndex + delta];
        if (!nextInput) return;
        event.preventDefault();
        nextInput.focus();
        if (typeof nextInput.select === "function") nextInput.select();
      });

      row.appendChild(label);
      row.appendChild(input);
      work.appendChild(row);
    });

    var workPanel = buildPanel("Answers", work, "ege-panel--work ege-panel--listening-work");
    var workCol = document.createElement("div");
    workCol.className = "ege-work-col";
    var scrollWrap = document.createElement("div");
    scrollWrap.className = "ege-work-scroll";
    scrollWrap.appendChild(workPanel);
    workCol.appendChild(scrollWrap);

    var gapsStep = document.createElement("div");
    gapsStep.className = "ege-listening-step ege-listening-step--gaps";
    gapsStep.hidden = true;
    gapsStep.appendChild(
      buildSplit(
        buildPanel("Recording", readContent, "ege-panel--read"),
        workCol,
        "ege-split--panels"
      )
    );
    wrap.appendChild(gapsStep);

    if (task.questions && task.questions.length) {
      var mcStep = document.createElement("div");
      mcStep.className = "ege-listening-step ege-listening-step--mc";
      mcStep.hidden = true;
      mcStep.appendChild(
        buildPanel("", buildListeningMcStack(task, topicId), "ege-panel--listening-mc")
      );
      wrap.appendChild(mcStep);
    }

    wrap.appendChild(buildListeningFooter(task));

    wrap.addEventListener("input", function () {
      syncListeningProgressUI(task.id);
      syncListeningMcFooterUI(task.id);
    });
    wrap.addEventListener("change", function () {
      syncListeningProgressUI(task.id);
      syncListeningMcFooterUI(task.id);
    });

    syncListeningPrepFooterUI(task.id);
    syncListeningPrepGapInstructionUI(task.id);

    return wrapListeningRoot(task, wrap);
  }

  function allWordformFilled(taskId) {
    var task = findTask(taskId);
    if (!task || task.type !== "wordform") return false;
    var prefix = taskPrefix(taskId);
    return task.items.every(function (_item, index) {
      var input = document.getElementById(prefix + "_wf_" + index);
      return !!(input && normalize(input.value));
    });
  }

  function syncWordformCheckEnabled(taskId) {
    syncCheckButton(taskId);
  }

  function buildWordformScoreLines(taskId, task, opts) {
    var lines = [];
    if (!task || !task.items) return lines;
    var revealKey = opts && opts.revealKey;
    var keyOnly = opts && opts.keyOnly;
    var prefix = taskPrefix(taskId);
    task.items.forEach(function (item, index) {
      var input = document.getElementById(prefix + "_wf_" + index);
      var raw = input ? input.value : "";
      var val = normalize(raw);
      var valid = buildAcceptedAnswers(item.answer, item.alt);
      var ok = valid.indexOf(val) !== -1;
      var num = index + 1;
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
  }

  function wordformPassageBreakTitle(task, item, index) {
    if (index === 0 || !task || !item) return "";
    var parts = String(task.nav || "").split(/\s*[\/&]\s*/);
    if (parts.length < 2) return "";
    var second = parts[1].trim();
    if (!second) return "";
    var firstWord = second.split(/\s+/)[0].toLowerCase();
    var preStart = String(item.pre || "")
      .trim()
      .toLowerCase();
    if (!firstWord || preStart.indexOf(firstWord) !== 0) return "";
    return second;
  }

  function renderWordform(task, topicId) {
    var max = taskMaxScore(task);
    var wrap = buildTaskArticle(task);
    wrap.classList.add("ege-task--wordform");
    var prefix = topicId + "_" + task.id;

    var body = document.createElement("div");
    body.className = "ege-wordform-list";

    var inputs = [];

    task.items.forEach(function (item, index) {
      var breakTitle = wordformPassageBreakTitle(task, item, index);
      if (breakTitle) {
        var breakEl = document.createElement("h3");
        breakEl.className = "ege-wordform-break";
        breakEl.textContent = breakTitle;
        body.appendChild(breakEl);
      }

      var line = document.createElement("p");
      line.className = "ege-wordform";

      var num = document.createElement("span");
      num.className = "ege-wordform__num";
      num.textContent = index + 1 + ".";
      line.appendChild(num);

      line.appendChild(document.createTextNode(item.pre + " "));

      var input = document.createElement("input");
      input.type = "text";
      input.className = "ege-input ege-wordform__input";
      input.id = prefix + "_wf_" + index;
      input.setAttribute("aria-label", "Gap " + (index + 1) + ": form of " + item.word);
      input.autocomplete = "off";
      input.spellcheck = false;
      input.dataset.wfIndex = String(index);
      if (item.answer) {
        var approxCh = Math.min(28, Math.max(10, String(item.answer).length + 2));
        input.style.width = approxCh + "ch";
      }
      line.appendChild(input);
      inputs.push(input);

      var hint = document.createElement("span");
      hint.className = "ege-wordform__hint";
      hint.textContent = "(" + item.word + ")";
      line.appendChild(hint);
      line.appendChild(document.createTextNode(" " + item.post));
      body.appendChild(line);
    });

    inputs.forEach(function (input, inputIndex) {
      input.addEventListener("input", function () {
        input.classList.remove("is-correct", "is-wrong", "is-empty");
        input.removeAttribute("title");
        hideScoreFeedback(task.id);
        syncWordformCheckEnabled(task.id);
      });

      input.addEventListener("keydown", function (event) {
        var delta = 0;
        if (event.key === "Enter" || event.key === "ArrowDown") delta = 1;
        else if (event.key === "ArrowUp") delta = -1;
        else return;

        var nextInput = inputs[inputIndex + delta];
        if (!nextInput) return;
        event.preventDefault();
        nextInput.focus();
        if (typeof nextInput.select === "function") nextInput.select();
      });
    });

    wrap.appendChild(buildPanel("", body, "ege-panel--solo"));
    wrap.appendChild(buildTaskFooter(task.id, max, { showAnswers: true }));
    syncWordformCheckEnabled(task.id);
    return wrap;
  }

  function bindResetButton(btn, taskId) {
    var armed = false;
    var timer = 0;

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
      resetTask(taskId);
    });
  }

  function buildTaskFooter(taskId, max, options) {
    var footer = document.createElement("div");
    footer.className = "ege-task__footer";

    var actions = document.createElement("div");
    actions.className = "ege-task__actions";

    var checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "ege-btn ege-btn--primary";
    checkBtn.id = "check-" + taskId;
    checkBtn.textContent = "Check answers";
    checkBtn.disabled = true;
    checkBtn.title = "Answer all questions first";
    checkBtn.addEventListener("click", function () {
      checkTask(taskId);
    });

    actions.appendChild(checkBtn);

    var checkHint = document.createElement("p");
    checkHint.className = "ege-check-hint";
    checkHint.id = "check-hint-" + taskId;
    checkHint.hidden = true;

    if (!(options && options.omitReset)) {
      var resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "ege-btn ege-btn--ghost";
      resetBtn.textContent = "Reset";
      bindResetButton(resetBtn, taskId);
      actions.appendChild(resetBtn);
    }

    if (options && options.showAnswers) {
      var showBtn = document.createElement("button");
      showBtn.type = "button";
      showBtn.className = "ege-btn ege-btn--ghost";
      showBtn.id = "show-" + taskId;
      showBtn.textContent = "Show answers";
      showBtn.addEventListener("click", function () {
        revealTask(taskId);
      });
      actions.appendChild(showBtn);
    }

    footer.appendChild(actions);
    footer.appendChild(checkHint);

    var score = document.createElement("p");
    score.className = "ege-task__score";
    score.id = "score-" + taskId;
    score.hidden = true;
    score.setAttribute("aria-live", "polite");

    footer.appendChild(score);
    footer.dataset.max = String(max);
    syncCheckButton(taskId);
    return footer;
  }

  var state = {
    topic: null,
    topicId: "",
    sectionMeta: null,
    scores: {},
    activeTaskId: null,
    listeningSelections: {},
    listeningRuns: {},
    listeningSteps: {},
    prepLayouts: {},
  };

  function renderTaskPanel(task) {
    if (task.type === "matching") return renderMatching(task, state.topicId);
    if (task.type === "gapfill") return renderGapfill(task, state.topicId);
    if (task.type === "mc" && isVocabCloze(task)) return renderVocabCloze(task, state.topicId);
    if (task.type === "mc") return renderMc(task, state.topicId);
    if (task.type === "wordform") return renderWordform(task, state.topicId);
    if (task.type === "listening") return renderListening(task, state.topicId);
    return document.createElement("div");
  }

  function setNavStatus(taskId, score, max) {
    var btn = document.getElementById("nav-" + taskId);
    if (!btn) return;
    btn.classList.remove("is-perfect", "is-partial", "is-empty");
    if (score === max && max > 0) btn.classList.add("is-perfect");
    else if (score > 0) btn.classList.add("is-partial");
    else btn.classList.add("is-empty");
    btn.setAttribute("aria-label", btn.textContent + ": " + score + " of " + max);
  }

  function setNavOpen(open) {
    var page = document.getElementById("egePage");
    var currentBtn = document.getElementById("egeMobileCurrent");
    if (page) page.classList.toggle("is-nav-open", open);
    if (currentBtn) currentBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function syncMobileTaskControls() {
    if (!state.topic || !state.activeTaskId) return;
    var ids = state.topic.tasks.map(function (task) {
      return task.id;
    });
    var idx = ids.indexOf(state.activeTaskId);
    var prevBtn = document.getElementById("egePrevTask");
    var nextBtn = document.getElementById("egeNextTask");
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx < 0 || idx >= ids.length - 1;
  }

  function showAdjacentTask(delta) {
    if (!state.topic) return;
    var ids = state.topic.tasks.map(function (task) {
      return task.id;
    });
    var idx = ids.indexOf(state.activeTaskId);
    if (idx < 0) return;
    var next = idx + delta;
    if (next < 0 || next >= ids.length) return;
    setNavOpen(false);
    showTask(ids[next]);
  }

  function showTask(taskId) {
    state.activeTaskId = taskId;
    resetTaskDigitBuffer();
    resetMcKeyboardState(taskId);
    document.querySelectorAll(".ege-task-panel").forEach(function (panel) {
      panel.hidden = panel.dataset.taskId !== taskId;
    });
    document.querySelectorAll(".ege-nav__btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.taskId === taskId);
    });

    var task = findTask(taskId);
    var currentBtn = document.getElementById("egeMobileCurrent");
    if (currentBtn && task) currentBtn.textContent = task.nav || task.title || "Task";
    syncMobileTaskControls();

    var instructions = document.getElementById("egeInstructions");
    if (instructions && task) {
      if (task.type === "listening") {
        syncListeningInstructions(taskId);
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
      mountListeningChrome(taskId);
      syncListeningStepUI(taskId);
      scheduleListeningNavAlign(taskId);
      if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
    } else {
      mountListeningChrome(null);
    }
    if (task && task.type === "matching") syncMatchingCheckEnabled(taskId);
    if (task && task.type === "wordform") syncWordformCheckEnabled(taskId);
    if (task && (task.type === "mc" || task.type === "gapfill")) syncCheckButton(taskId);
    var panel = document.getElementById("panel-" + taskId);
    if (panel && window.EgeHighlight && task && task.type !== "listening") {
      EgeHighlight.attachAll(panel, state.topicId, taskId);
    }
    syncTopicLayout(taskId);
    if (task && usesTopicLayout(state.topicId) && task.type !== "listening") {
      observeTopicExercisePanel(taskId);
      scheduleTopicNavAlign(taskId);
      scrollActiveNavIntoView(taskId);
    }
  }

  function checkTask(taskId) {
    var task = findTask(taskId);
    if (!task) return;

    var revealedEl = document.getElementById("task-" + taskId);
    if (
      task.type !== "listening" &&
      revealedEl &&
      revealedEl.dataset.answersRevealed === "1"
    ) {
      return;
    }

    if (task.type === "mc" && !isVocabCloze(task)) {
      var prefixGate = taskPrefix(taskId);
      var incomplete = task.questions.some(function (_question, index) {
        return !getCheckedValue(prefixGate + "_q_" + index);
      });
      if (incomplete) {
        updateAnsweredCount(taskId);
        var scoreElMc = document.getElementById("score-" + taskId);
        if (scoreElMc) {
          scoreElMc.hidden = false;
          scoreElMc.textContent = "Answer all questions before checking.";
          scoreElMc.className = "ege-task__score is-bad";
        }
        return;
      }
    }

    if (task.type === "listening") {
      var listeningKindGate = getListeningStepKind(task, getListeningStep(taskId));
      if (listeningKindGate === "mc" && !isListeningMcComplete(taskId)) {
        syncListeningMcFooterUI(taskId);
        var scoreElListenMc = document.getElementById("score-" + taskId);
        if (scoreElListenMc) {
          scoreElListenMc.hidden = false;
          scoreElListenMc.textContent = "Answer all questions before checking.";
          scoreElListenMc.className = "ege-task__score is-bad";
        }
        return;
      }
    }

    var correct = 0;
    var max = taskMaxScore(task);
    var prefix = taskPrefix(taskId);

    if (task.type === "matching") {
      var board = document.querySelector("#task-" + taskId + " .ege-match-picks");

      if (!allMatchingFilled(taskId)) {
        var scoreEl = document.getElementById("score-" + taskId);
        if (scoreEl) {
          scoreEl.hidden = false;
          scoreEl.textContent = "Match all texts before checking.";
          scoreEl.className = "ege-task__score is-bad";
        }
        task.texts.forEach(function (item) {
          var name = prefix + "_" + item.letter;
          var empty = !getCheckedValue(name);
          var block = getMatchingTextBlock(taskId, item.letter);
          if (block) block.classList.toggle("is-empty", empty);
          var cell = getAnswerTrackCell(taskId, item.letter);
          if (cell) cell.classList.toggle("is-empty", empty);
        });
        syncMatchingCheckEnabled(taskId);
        return;
      }

      task.texts.forEach(function (item) {
        var name = prefix + "_" + item.letter;
        var value = getCheckedValue(name);
        var ok = markChoiceGroup(name, value, task.answers[item.letter]);
        if (ok) correct += 1;

        var block = getMatchingTextBlock(taskId, item.letter);
        if (block) {
          block.classList.remove("is-empty");
          block.classList.toggle("is-correct", !!ok);
          block.classList.toggle("is-wrong", value && !ok);
        }
        var cell = getAnswerTrackCell(taskId, item.letter);
        if (cell) {
          cell.classList.remove("is-empty");
          cell.classList.toggle("is-correct", !!ok);
          cell.classList.toggle("is-wrong", value && !ok);
          var valEl = cell.querySelector(".ege-answer-track__val");
          if (valEl) valEl.textContent = value || "";
        }
      });
      if (board && board.syncUsedState) board.syncUsedState();
    }

    if (task.type === "gapfill") {
      var board = document.querySelector("#task-" + taskId + " .ege-gap-picks");
      task.gaps.forEach(function (gap) {
        var name = prefix + "_gap_" + gap;
        var value = getCheckedValue(name);
        var ok = markChoiceGroup(name, value, task.answers[gap]);
        if (ok) correct += 1;

        markGapInsert(taskId, gap, ok, !!value);

        var cell = getAnswerTrackCell(taskId, gap);
        if (cell) {
          cell.classList.toggle("is-correct", !!ok);
          cell.classList.toggle("is-wrong", value && !ok);
        }
      });
      if (board && board.syncUsedState) board.syncUsedState();
    }

    if (task.type === "mc" && isVocabCloze(task)) {
      task.questions.forEach(function (question, index) {
        var name = prefix + "_q_" + index;
        var value = getCheckedValue(name);
        var gapNum = vocabGapNum(question);
        var ok = gradeMcQuestion(name, String(question.correct));
        if (ok) correct += 1;
        markGapInsert(taskId, gapNum, ok, !!value);
      });
    } else if (task.type === "mc") {
      task.questions.forEach(function (question, index) {
        if (gradeMcQuestion(prefix + "_q_" + index, String(question.correct))) {
          correct += 1;
        }
      });
      var attemptEl = document.getElementById("task-" + taskId);
      if (attemptEl) attemptEl.dataset.hasAttempt = "1";
      updateAnsweredCount(taskId);
    }

    if (task.type === "wordform") {
      if (!allWordformFilled(taskId)) {
        var scoreElWf = document.getElementById("score-" + taskId);
        if (scoreElWf) {
          scoreElWf.hidden = false;
          scoreElWf.textContent = "Fill all gaps before checking.";
          scoreElWf.className = "ege-task__score is-bad";
        }
        task.items.forEach(function (_item, index) {
          var inputEmpty = document.getElementById(prefix + "_wf_" + index);
          if (!inputEmpty) return;
          var empty = !normalize(inputEmpty.value);
          inputEmpty.classList.toggle("is-empty", empty);
          inputEmpty.classList.remove("is-correct", "is-wrong");
        });
        syncWordformCheckEnabled(taskId);
        return;
      }

      task.items.forEach(function (item, index) {
        var input = document.getElementById(prefix + "_wf_" + index);
        if (!input) return;
        var val = normalize(input.value);
        var valid = buildAcceptedAnswers(item.answer, item.alt);
        var ok = valid.indexOf(val) !== -1;
        input.classList.remove("is-empty");
        input.classList.toggle("is-correct", ok);
        input.classList.toggle("is-wrong", !!input.value && !ok);
        if (ok) {
          correct += 1;
          input.removeAttribute("title");
        } else {
          input.removeAttribute("title");
        }
      });
    }

    if (task.type === "listening") {
      var listeningStep = getListeningStep(taskId);
      var stepKind = getListeningStepKind(task, listeningStep);
      var gapMax = listeningGapMax(task);
      var revealed = consumeListeningReveal(taskId);

      if (stepKind === "prep-gap" || (stepKind === "prep" && !isPrepMatchingUnlocked(taskId))) {
        var prepCorrect = 0;
        var gapFillMax = 0;

        if (task.prep.gapFill && task.prep.gapFill.items) {
          var prepGapEl = document.querySelector("#task-" + taskId + " .ege-prep-gapfill");
          var prepGapLive = prepGapEl && prepGapEl.querySelector(".ege-prep-gapfill-live");

          task.prep.gapFill.items.forEach(function (item) {
            gapFillMax += 1;
            var prepSlot = document.getElementById(prefix + "_prep_gf_" + item.id);
            if (!prepSlot) return;
            var prepVal = prepGapSlotValue(prepSlot);
            var prepOk = normalize(prepVal) === normalize(item.answer);
            applyGapCheckClasses(prepSlot, prepOk, !!prepVal);
            if (prepOk) prepCorrect += 1;
            else if (prepVal) prepSlot.title = "Correct answer: " + item.answer;
          });

          if (prepGapLive) {
            prepGapLive.textContent = revealed
              ? ""
              : prepCorrect + " of " + gapFillMax + " gaps correct.";
          }

          if (prepCorrect === gapFillMax && gapFillMax > 0) {
            setPrepMatchingUnlocked(taskId, true);
            setPrepGapReviewMode(taskId, true);
            syncListeningPrepVisibility(taskId);
            syncListeningPrepFooterUI(taskId);
            syncListeningPrepGapInstructionUI(taskId);
            syncListeningProgressUI(taskId);
          }
          if (revealed) hideScoreFeedback(taskId);
          else showScoreFeedback(taskId, prepCorrect, gapFillMax);
        }
        return;
      }

      if (stepKind === "prep-match" || (stepKind === "prep" && isPrepMatchingUnlocked(taskId))) {
        var matchCorrect = 0;
        var matchMax = 0;
        var prepMatch = document.querySelector("#task-" + taskId + " .ege-prep-match");

        if (task.prep.matching && task.prep.matching.expressions) {
          var prepAnswers = task.prep.matching.answers || {};
          task.prep.matching.expressions.forEach(function (expr) {
            matchMax += 1;
            var prepName = prefix + "_prep_m_" + expr.id;
            var prepValue = getCheckedValue(prepName);
            var prepExpected = prepAnswers[String(expr.id)];
            var matchOk = prepValue === prepExpected;
            if (matchOk) matchCorrect += 1;
            markChoiceGroup(prepName, prepValue, prepExpected);

            if (prepMatch) {
              var exprCard = prepMatch.querySelector('[data-expr-id="' + expr.id + '"]');
              if (exprCard) {
                exprCard.classList.toggle("is-correct", !!matchOk);
                exprCard.classList.toggle("is-wrong", prepValue && !matchOk);
              }
            }
          });
        }

        if (revealed) hideScoreFeedback(taskId);
        else showScoreFeedback(taskId, matchCorrect, matchMax);
        if (matchCorrect === matchMax && matchMax > 0) {
          setPrepMatchPassed(taskId, true);
          syncListeningPrepFooterUI(taskId);
          syncListeningProgressUI(taskId);
        }
        return;
      }

      getActiveListeningGaps(task).forEach(function (gap) {
        var input = document.getElementById(prefix + "_gap_" + gap.num);
        if (!input) return;
        var val = normalize(input.value);
        var valid = buildAcceptedAnswers(gap.answer, gap.alt);
        var ok = valid.indexOf(val) !== -1;
        applyGapCheckClasses(input, ok, !!input.value);
        markListeningGap(taskId, gap.num, ok, !!input.value);
        if (ok) correct += 1;
        else if (input.value) input.title = "Correct answer: " + gap.answer;
      });

      if (stepKind === "mc") {
        (task.questions || []).forEach(function (question, index) {
          var name = prefix + "_q_" + index;
          var ok = gradeMcQuestion(name, String(question.correct));
          if (ok) correct += 1;
        });
      }

      state.scores[taskId] = correct;
      saveScore(state.topicId, taskId, correct, max);
      setNavStatus(taskId, correct, max);
      if (revealed) hideScoreFeedback(taskId);
      else {
        showScoreFeedback(
          taskId,
          correct,
          stepKind === "listening" ? gapMax : stepKind === "mc" ? max : 0
        );
      }
      if (stepKind === "listening" && gapMax > 0 && correct === gapMax) {
        setListeningGapsPassed(taskId, true);
        syncListeningGapsFooterUI(taskId);
        syncListeningProgressUI(taskId);
      }
      if (stepKind === "mc") {
        var taskElMc = document.getElementById("task-" + taskId);
        if (taskElMc) taskElMc.dataset.hasAttempt = "1";
        if (max > 0 && correct === max) setListeningMcPassed(taskId, true);
        syncListeningMcFooterUI(taskId);
      }
      return;
    }

    state.scores[taskId] = correct;
    saveScore(state.topicId, taskId, correct, max);
    setNavStatus(taskId, correct, max);
    if (task.type === "matching") {
      showScoreFeedback(taskId, correct, max, {
        lines: buildMatchingScoreLines(taskId, task, { revealKey: correct === max }),
      });
    } else if (task.type === "wordform") {
      showScoreFeedback(taskId, correct, max, {
        lines: buildWordformScoreLines(taskId, task, { revealKey: correct === max }),
      });
    } else {
      showScoreFeedback(taskId, correct, max);
    }
  }

  function fillActiveCorrectAnswers() {
    var taskId = state.activeTaskId;
    var task = findTask(taskId);
    if (!task) return;

    if (task.type === "listening") {
      var stepKind = getListeningStepKind(task, getListeningStep(taskId));
      var prefix = taskPrefix(taskId);

      if (stepKind === "prep-gap" || (stepKind === "prep" && !isPrepMatchingUnlocked(taskId))) {
        var prepGap = document.querySelector("#task-" + taskId + " .ege-prep-gapfill");
        if (prepGap && prepGap.fillCorrectAnswers) prepGap.fillCorrectAnswers();
        checkTask(taskId);
        return;
      }

      if (stepKind === "prep-match" || (stepKind === "prep" && isPrepMatchingUnlocked(taskId))) {
        var prepMatch = document.querySelector("#task-" + taskId + " .ege-prep-match");
        if (prepMatch && prepMatch.fillCorrectAnswers) prepMatch.fillCorrectAnswers();
        checkTask(taskId);
        return;
      }

      getActiveListeningGaps(task).forEach(function (gap) {
        var input = document.getElementById(prefix + "_gap_" + gap.num);
        if (!input) return;
        input.value = gap.answer;
        clearGapCheckClasses(input);
        input.removeAttribute("title");
      });

      if (stepKind === "mc") {
        (task.questions || []).forEach(function (question, index) {
          setRadioValue(prefix + "_q_" + index, String(question.correct));
        });
      }

      checkTask(taskId);
      return;
    }

    revealTask(taskId);
  }

  function markListeningReveal(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    if (taskEl) taskEl.dataset.revealedStep = "1";
  }

  function revealTask(taskId) {
    var task = findTask(taskId);
    if (!task) return;

    var prefix = taskPrefix(taskId);

    if (task.type === "gapfill") {
      var board = document.querySelector("#task-" + taskId + " .ege-gap-picks");

      task.gaps.forEach(function (gap) {
        var answer = String(task.answers[gap]);
        setRadioValue(prefix + "_gap_" + gap, answer);
        if (board && board.updateInsert) board.updateInsert(gap, answer);
        markGapInsert(taskId, gap, true, true);
        markChoiceGroup(prefix + "_gap_" + gap, answer, answer);
      });

      if (board) {
        if (board.syncUsedState) board.syncUsedState();
        if (board.syncNumberRow) board.syncNumberRow();
      }
      var gapEl = document.getElementById("task-" + taskId);
      if (gapEl) gapEl.dataset.answersRevealed = "1";
    } else if (task.type === "matching") {
      var matchBoard = document.querySelector("#task-" + taskId + " .ege-match-picks");
      task.texts.forEach(function (item) {
        var answer = String(task.answers[item.letter]);
        setRadioValue(prefix + "_" + item.letter, answer);
        markChoiceGroup(prefix + "_" + item.letter, answer, answer);
        var block = getMatchingTextBlock(taskId, item.letter);
        if (block) {
          block.classList.add("is-correct", "is-used");
          block.classList.remove("is-wrong", "is-empty");
        }
        var cell = getAnswerTrackCell(taskId, item.letter);
        if (cell) {
          cell.classList.add("is-correct", "is-filled");
          cell.classList.remove("is-wrong", "is-empty");
          var valEl = cell.querySelector(".ege-answer-track__val");
          if (valEl) valEl.textContent = answer;
        }
      });
      if (matchBoard && matchBoard.syncUsedState) matchBoard.syncUsedState();
      var matchEl = document.getElementById("task-" + taskId);
      if (matchEl) matchEl.dataset.answersRevealed = "1";
      showScoreFeedback(taskId, 0, taskMaxScore(task), {
        revealed: true,
        lines: buildMatchingScoreLines(taskId, task, { keyOnly: true }),
      });
      syncMatchingCheckEnabled(taskId);
      showToast("Answers shown.");
      return;
    } else if (task.type === "wordform") {
      task.items.forEach(function (item, index) {
        var input = document.getElementById(prefix + "_wf_" + index);
        if (!input) return;
        input.value = item.answer;
        input.classList.remove("is-wrong", "is-empty");
        input.classList.add("is-correct");
        input.removeAttribute("title");
      });
      var wfEl = document.getElementById("task-" + taskId);
      if (wfEl) wfEl.dataset.answersRevealed = "1";
      showScoreFeedback(taskId, 0, taskMaxScore(task), {
        revealed: true,
        lines: buildWordformScoreLines(taskId, task, { keyOnly: true }),
      });
      syncWordformCheckEnabled(taskId);
      showToast("Answers shown.");
      return;
    } else if (task.type === "mc") {
      task.questions.forEach(function (question, index) {
        var name = prefix + "_q_" + index;
        var correctVal = String(question.correct);
        setRadioValue(name, correctVal);
        markChoiceGroup(name, correctVal, correctVal);
      });
      if (isVocabCloze(task)) {
        var vocabBoard = document.querySelector("#task-" + taskId + " .ege-vocab-picks");
        if (vocabBoard && vocabBoard.syncInserts) vocabBoard.syncInserts();
      }
      var taskEl = document.getElementById("task-" + taskId);
      if (taskEl) taskEl.dataset.answersRevealed = "1";
    } else if (task.type === "listening") {
      var stepKind = getListeningStepKind(task, getListeningStep(taskId));

      if (
        stepKind === "prep-gap" ||
        (stepKind === "prep" && !isPrepMatchingUnlocked(taskId))
      ) {
        var prepGap = document.querySelector("#task-" + taskId + " .ege-prep-gapfill");
        markListeningReveal(taskId);
        if (prepGap && prepGap.fillCorrectAnswers) prepGap.fillCorrectAnswers();
        checkTask(taskId);
        showToast("Answers shown.");
        return;
      }

      if (
        stepKind === "prep-match" ||
        (stepKind === "prep" && isPrepMatchingUnlocked(taskId))
      ) {
        var prepMatch = document.querySelector("#task-" + taskId + " .ege-prep-match");
        markListeningReveal(taskId);
        if (prepMatch && prepMatch.fillCorrectAnswers) prepMatch.fillCorrectAnswers();
        checkTask(taskId);
        showToast("Answers shown.");
        return;
      }

      if (stepKind === "listening") {
        getActiveListeningGaps(task).forEach(function (gap) {
          var input = document.getElementById(prefix + "_gap_" + gap.num);
          if (!input) return;
          input.value = gap.answer;
          input.classList.add("is-filled");
          clearGapCheckClasses(input);
          input.removeAttribute("title");
          setListeningMarkText(taskId, gap.num, gap.answer);
          markListeningGap(taskId, gap.num, true, true);
        });
        markListeningReveal(taskId);
        checkTask(taskId);
        showToast("Answers shown.");
        return;
      }

      if (stepKind === "mc") {
        (task.questions || []).forEach(function (question, index) {
          var name = prefix + "_q_" + index;
          var correctVal = String(question.correct);
          setRadioValue(name, correctVal);
          markChoiceGroup(name, correctVal, correctVal);
        });
        var taskElMc = document.getElementById("task-" + taskId);
        if (taskElMc) taskElMc.dataset.answersRevealed = "1";
        markListeningReveal(taskId);
        checkTask(taskId);
        showToast("Answers shown.");
        return;
      }
    } else {
      return;
    }

    hideScoreFeedback(taskId);
    updateAnsweredCount(taskId);
    showToast("Answers shown.");
  }

  function resetTask(taskId) {
    var task = findTask(taskId);
    if (!task) return;

    var prefix = taskPrefix(taskId);

    if (task.type === "matching") {
      var board = document.querySelector("#task-" + taskId + " .ege-match-picks");
      task.texts.forEach(function (item) {
        clearChoiceGroup(prefix + "_" + item.letter);
        var block = getMatchingTextBlock(taskId, item.letter);
        if (block) block.classList.remove("is-correct", "is-wrong", "is-used", "is-empty");
        var cell = getAnswerTrackCell(taskId, item.letter);
        if (cell) {
          cell.classList.remove("is-correct", "is-wrong", "is-used", "is-empty", "is-filled", "is-active");
          var valEl = cell.querySelector(".ege-answer-track__val");
          if (valEl) valEl.textContent = "";
        }
      });
      if (board) {
        if (board.syncUsedState) board.syncUsedState();
        if (board.setActiveLetter) board.setActiveLetter("");
      }
      var matchResetEl = document.getElementById("task-" + taskId);
      if (matchResetEl) delete matchResetEl.dataset.answersRevealed;
      syncMatchingCheckEnabled(taskId);
    }

    if (task.type === "gapfill") {
      var board = document.querySelector("#task-" + taskId + " .ege-gap-picks");
      task.gaps.forEach(function (gap) {
        clearChoiceGroup(prefix + "_gap_" + gap);
        var insert = document.querySelector(
          "#task-" + taskId + ' .ege-gap-insert[data-gap="' + gap + '"]'
        );
        if (insert) {
          insert.classList.remove("is-correct", "is-wrong", "is-filled", "is-active");
          var textSpan = insert.querySelector(".ege-gap-insert__text");
          if (textSpan) textSpan.textContent = "";
        }
        var cell = getAnswerTrackCell(taskId, gap);
        if (cell) {
          cell.classList.remove("is-correct", "is-wrong", "is-filled", "is-active");
          var valEl = cell.querySelector(".ege-answer-track__val");
          if (valEl) valEl.textContent = "";
        }
      });
      if (board) {
        if (board.syncUsedState) board.syncUsedState();
        if (board.setActiveGap) board.setActiveGap("");
      }
      var gapResetEl = document.getElementById("task-" + taskId);
      if (gapResetEl) delete gapResetEl.dataset.answersRevealed;
      syncCheckButton(taskId);
    }

    if (task.type === "mc" && isVocabCloze(task)) {
      var vocabBoard = document.querySelector("#task-" + taskId + " .ege-vocab-picks");
      var vocabResetEl = document.getElementById("task-" + taskId);
      if (vocabResetEl) delete vocabResetEl.dataset.answersRevealed;
      task.questions.forEach(function (question, index) {
        clearChoiceGroup(prefix + "_q_" + index);
        var gapNum = vocabGapNum(question);
        var insert = document.querySelector(
          "#task-" + taskId + ' .ege-gap-insert[data-gap="' + gapNum + '"]'
        );
        if (insert) {
          insert.classList.remove("is-correct", "is-wrong", "is-filled", "is-active");
          var textSpan = insert.querySelector(".ege-gap-insert__text");
          if (textSpan) textSpan.textContent = "";
        }
      });
      if (vocabBoard && vocabBoard.setActiveGap) vocabBoard.setActiveGap("");
      syncCheckButton(taskId);
    } else if (task.type === "mc") {
      var taskEl = document.getElementById("task-" + taskId);
      if (taskEl) {
        delete taskEl.dataset.answersRevealed;
        delete taskEl.dataset.hasAttempt;
      }
      task.questions.forEach(function (_question, index) {
        clearChoiceGroup(prefix + "_q_" + index);
      });
      updateAnsweredCount(taskId);
    }

    if (task.type === "wordform") {
      var wfResetEl = document.getElementById("task-" + taskId);
      if (wfResetEl) delete wfResetEl.dataset.answersRevealed;
      task.items.forEach(function (_item, index) {
        var input = document.getElementById(prefix + "_wf_" + index);
        if (!input) return;
        input.value = "";
        input.classList.remove("is-correct", "is-wrong", "is-empty");
        input.removeAttribute("title");
      });
      syncWordformCheckEnabled(taskId);
    }

    if (task.type === "listening") {
      var audio = document.getElementById(prefix + "_audio");
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }

      if (task.prep) {
        if (task.prep.gapFill && task.prep.gapFill.items) {
          var prepGap = document.querySelector("#task-" + taskId + " .ege-prep-gapfill");
          if (prepGap && prepGap.resetPrepGapFill) {
            prepGap.resetPrepGapFill();
          } else {
            task.prep.gapFill.items.forEach(function (item) {
              var prepSlot = document.getElementById(prefix + "_prep_gf_" + item.id);
              if (prepSlot) {
                setPrepGapSlotValue(prepSlot, "");
                clearGapCheckClasses(prepSlot);
                prepSlot.classList.remove("is-filled");
                prepSlot.removeAttribute("title");
              }
            });
          }
        }

        if (task.prep.matching && task.prep.matching.expressions) {
          var prepMatchEl = document.querySelector("#task-" + taskId + " .ege-prep-match");
          if (prepMatchEl && prepMatchEl.resetPrepMatch) {
            prepMatchEl.resetPrepMatch();
          } else {
            task.prep.matching.expressions.forEach(function (expr) {
              clearChoiceGroup(prefix + "_prep_m_" + expr.id);
            });
          }
        }

        setPrepMatchingUnlocked(taskId, false);
        setPrepMatchPassed(taskId, false);
        setPrepGapReviewMode(taskId, false);
        syncListeningPrepVisibility(taskId);
        syncListeningPrepFooterUI(taskId);
        syncListeningPrepGapInstructionUI(taskId);
      }

      getActiveListeningGaps(task).forEach(function (gap) {
        var input = document.getElementById(prefix + "_gap_" + gap.num);
        if (input) {
          input.value = "";
          input.classList.remove("is-filled");
          clearGapCheckClasses(input);
          input.removeAttribute("title");
        }
        clearListeningMark(taskId, gap.num);
      });
      (task.questions || []).forEach(function (_question, index) {
        clearChoiceGroup(prefix + "_q_" + index);
      });
      setListeningGapsPassed(taskId, false);
      setListeningMcPassed(taskId, false);
      var taskElReset = document.getElementById("task-" + taskId);
      if (taskElReset) {
        delete taskElReset.dataset.hasAttempt;
        delete taskElReset.dataset.revealedStep;
      }
      setListeningStep(taskId, 1);
      syncListeningStepUI(taskId);
    }

    state.scores[taskId] = 0;
    clearScore(state.topicId, taskId);
    setNavStatus(taskId, 0, taskMaxScore(task));
    hideScoreFeedback(taskId);
  }

  function restoreTopicLayoutTools() {
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

  function restoreTopicLayoutTitle() {
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

  function restoreTopicLayoutIntros() {
    restoreTopicLayoutTitle();
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

  function teardownTopicLayout() {
    restoreTopicLayoutIntros();
    restoreTopicLayoutTools();
  }

  function syncTopicLayout() {
    restoreTopicLayoutIntros();
    restoreTopicLayoutTools();
  }

  function setRailHeadVisible(visible) {
    var railHead = document.getElementById("egeRailHead");
    if (railHead) railHead.hidden = !visible;
  }

  function applySectionMeta(section) {
    if (!section) return;
    state.sectionMeta = section;

    var topicLayout = usesTopicLayout(section.id);

    setRailHeadVisible(!topicLayout);

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
        var label = formatExamRange(section.examFrom, section.examTo);
        if (label) {
          examEl.textContent = label;
          examEl.hidden = false;
        }
      }
    }
  }

  function sectionDisplayTitle(topic) {
    if (state.sectionMeta && state.sectionMeta.title) {
      return state.sectionMeta.title;
    }
    return topic.title;
  }

  function mountTopic(topic, topicId) {
    state.topic = topic;
    state.topicId = topicId;
    state.scores = {};
    state.listeningSelections = {};
    state.listeningRuns = {};
    state.prepLayouts = {};

    topic.tasks.forEach(function (task) {
      if (task.type === "listening") {
        if (task.prep && task.prep.matching) {
          shuffleMatchingMeaningContent(task.prep.matching, task.id);
        }
        state.listeningSelections[task.id] = chooseListeningGaps(task);
        state.listeningRuns[task.id] = buildListeningRun(state.listeningSelections[task.id]);
        state.listeningSteps[task.id] = 1;
      }
    });

    var saved = loadScores(topicId);
    topic.tasks.forEach(function (task) {
      state.scores[task.id] = saved[task.id] ? saved[task.id].score : 0;
    });

    document.title = sectionDisplayTitle(topic) + " – Time to ЕГЭ – Yap O'Clock";
    setRailHeadVisible(!usesTopicLayout(topicId));

    var railTitle = document.getElementById("egeRailTitle");
    if (railTitle && !usesTopicLayout(topicId) && topicId !== "listening") {
      railTitle.hidden = false;
      railTitle.textContent = sectionDisplayTitle(topic);
    }

    var nav = document.getElementById("egeNav");
    var panels = document.getElementById("egePanels");
    nav.textContent = "";
    panels.textContent = "";
    clearTopicLoading();
    teardownTopicLayout();

    var page = document.getElementById("egePage");
    if (page) {
      page.classList.toggle("ege-page--listening", topicId === "listening");
      page.classList.toggle("ege-page--topic-layout", usesTopicLayout(topicId));
    }

    topic.tasks.forEach(function (task, index) {
      var max = taskMaxScore(task);
      var savedScore = state.scores[task.id] || 0;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ege-nav__btn";
      btn.id = "nav-" + task.id;
      btn.dataset.taskId = task.id;
      btn.textContent = task.nav;
      btn.addEventListener("click", function () {
        setNavOpen(false);
        showTask(task.id);
      });
      nav.appendChild(btn);
      setNavStatus(task.id, savedScore, max);

      var shell = document.createElement("section");
      shell.className = "ege-task-panel";
      shell.id = "panel-" + task.id;
      shell.dataset.taskId = task.id;

      var intro = buildTaskIntro(task);
      if (intro) shell.appendChild(intro);
      shell.appendChild(renderTaskPanel(task));
      if (window.EgeHighlight) {
        EgeHighlight.attachAll(shell, topicId, task.id);
      }
      shell.hidden = index !== 0;
      panels.appendChild(shell);
    });

    showTask(topic.tasks[0].id);
    bindMobileTaskSwitch();
    bindTopicNavAlign();
    observeTopicExercisePanel(topic.tasks[0].id);
    scheduleTopicNavAlign(topic.tasks[0].id);

    if (!window._egeTopicLayoutResizeBound) {
      window._egeTopicLayoutResizeBound = true;
      window.addEventListener("resize", function () {
        if (state.activeTaskId) syncTopicLayout(state.activeTaskId);
        if (usesTopicLayout(state.topicId)) {
          observeTopicExercisePanel(state.activeTaskId);
          scheduleTopicNavAlign(state.activeTaskId);
        }
      });
    }

    if (topicId === "listening" && !window._egeListeningNavAlignBound) {
      window._egeListeningNavAlignBound = true;
      window.addEventListener("resize", function () {
        if (state.topicId === "listening" && state.activeTaskId) {
          scheduleListeningNavAlign(state.activeTaskId);
        }
      });
    }

    if (!window._egeDevFillBound) {
      window._egeDevFillBound = true;
      document.addEventListener("keydown", function (event) {
        if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
        if (event.code !== "Digit9") return;
        event.preventDefault();
        fillActiveCorrectAnswers();
      });
    }

    if (!window._egeCheckKeyBound) {
      window._egeCheckKeyBound = true;
      document.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        if (!state.activeTaskId) return;

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

        if (state.topicId === "listening") {
          var nextInterviewBtn = document.getElementById(
            "next-interview-" + state.activeTaskId
          );
          if (nextInterviewBtn && !nextInterviewBtn.hidden) return;
          var prepNextBtn = document.getElementById("prep-next-" + state.activeTaskId);
          if (prepNextBtn && !prepNextBtn.hidden) return;
        }

        var checkBtn = document.getElementById("check-" + state.activeTaskId);
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
        if (state.topicId !== "listening" || !state.activeTaskId) return;

        var target = event.target;
        if (target) {
          var tag = (target.tagName || "").toLowerCase();
          if (tag === "input" || tag === "textarea" || tag === "select") return;
          if (target.isContentEditable) return;
        }

        var nextInterviewBtn = document.getElementById(
          "next-interview-" + state.activeTaskId
        );
        if (nextInterviewBtn && !nextInterviewBtn.hidden) {
          event.preventDefault();
          nextInterviewBtn.click();
          return;
        }

        var nextBtn = document.getElementById("prep-next-" + state.activeTaskId);
        if (!nextBtn || nextBtn.hidden) return;

        event.preventDefault();
        nextBtn.click();
      });
    }

    if (topicId === "listening" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        scheduleListeningNavAlign(state.activeTaskId);
      });
    }
  }

  function bindMobileTaskSwitch() {
    var prevBtn = document.getElementById("egePrevTask");
    var nextBtn = document.getElementById("egeNextTask");
    var currentBtn = document.getElementById("egeMobileCurrent");
    if (prevBtn && !prevBtn.dataset.bound) {
      prevBtn.dataset.bound = "1";
      prevBtn.addEventListener("click", function () {
        showAdjacentTask(-1);
      });
    }
    if (nextBtn && !nextBtn.dataset.bound) {
      nextBtn.dataset.bound = "1";
      nextBtn.addEventListener("click", function () {
        showAdjacentTask(1);
      });
    }
    if (currentBtn && !currentBtn.dataset.bound) {
      currentBtn.dataset.bound = "1";
      currentBtn.addEventListener("click", function () {
        var page = document.getElementById("egePage");
        setNavOpen(!(page && page.classList.contains("is-nav-open")));
      });
    }
  }

  function getTopicIdFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get("t") || "";
  }

  function initTopicPage() {
    var topicId = getTopicIdFromUrl();
    if (!topicId) {
      window.location.href = "index.html";
      return;
    }

    showTopicLoading();

    Promise.all([
      fetch("data/" + topicId + ".json").then(function (res) {
        if (!res.ok) throw new Error("Topic not found");
        return res.json();
      }),
      fetch("sections.json")
        .then(function (res) {
          return res.ok ? res.json() : { sections: [] };
        })
        .catch(function () {
          return { sections: [] };
        }),
    ])
      .then(function (results) {
        var topic = results[0];
        var catalog = results[1];
        var section = (catalog.sections || []).find(function (entry) {
          return entry.id === topicId;
        });
        if (section && section.available === false) {
          window.location.href = "index.html";
          return null;
        }
        applySectionMeta(section);
        return loadTaskTranscripts(topic).then(function () {
          mountTopic(topic, topicId);
        });
      })
      .catch(function () {
        clearTopicLoading();
        var panels = document.getElementById("egePanels");
        if (panels) {
          panels.innerHTML =
            '<p class="ege-error">Section not found. <a href="index.html">Back to sections</a>.</p>';
        }
      });
  }

  window.EgePrep = {
    initTopicPage: initTopicPage,
  };

  if (!window._egeTaskKeysBound) {
    window._egeTaskKeysBound = true;
    document.addEventListener("keydown", handleTaskKeyboard);
  }
})();
