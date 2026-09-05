import { E } from "./runtime.js";

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trimSnippet(text, max) {
  var s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function sectionLabel(key) {
  var labels = {
    listening: "Аудирование",
    reading: "Чтение",
    useOfEnglish: "Грамматика и лексика",
    writing: "Письменная часть",
    speaking: "Устная часть",
  };
  return labels[key] || key;
}

function pct(score, max) {
  if (!max) return 0;
  return Math.round((score / max) * 100);
}

// Writing/speaking are never auto-graded (see calculatePrimaryScore), but a
// teacher may have graded the printed/recorded work by hand -- this just
// remembers whatever number they were given so it shows on the results
// screen instead of a permanent "0/20". Display-only: it never feeds back
// into primaryScore/testScore, which stay auto-only by design.
E.manualScoreKey = function manualScoreKey(section) {
  return "ege-prep:manual-score:" + String(section || "");
};

E.getManualSectionScore = function getManualSectionScore(section) {
  try {
    var raw = localStorage.getItem(E.manualScoreKey(section));
    if (raw == null || raw === "") return null;
    var n = Number(raw);
    return isFinite(n) ? n : null;
  } catch (_err) {
    return null;
  }
};

E.setManualSectionScore = function setManualSectionScore(section, value) {
  try {
    localStorage.setItem(E.manualScoreKey(section), String(value));
  } catch (_err) {
    /* ignore */
  }
};

E.promptManualSectionScore = function promptManualSectionScore(section) {
  var btn = document.querySelector('[data-add-score="' + section + '"]');
  if (!btn) return;
  var max = (E.EXAM_SCORING_CONFIG.sections || {})[section] || 0;
  var current = E.getManualSectionScore(section);

  var wrap = document.createElement("span");
  wrap.className = "ege-results-sections__editor";

  var input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = String(max);
  input.value = current != null ? String(current) : "";
  input.className = "ege-results-sections__input";
  input.setAttribute("aria-label", "Балл из " + max);

  var save = document.createElement("button");
  save.type = "button";
  save.className = "ege-btn ege-btn--ghost ege-btn--small";
  save.textContent = "Сохранить";

  wrap.appendChild(input);
  wrap.appendChild(save);
  btn.replaceWith(wrap);
  input.focus();

  function commit() {
    var value = Math.max(0, Math.min(max, Math.round(Number(input.value) || 0)));
    E.setManualSectionScore(section, value);
    E.showExamResultsScreen();
  }
  save.addEventListener("click", commit);
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") commit();
  });
};

E.examItemNumber = function examItemNumber(task, index) {
  var from = E.taskExamFrom(task);
  if (from == null) return "";
  var to = E.taskExamTo(task);
  if (to > from && index != null) return String(from + index);
  return String(from);
};

E.mistakeSectionKey = function mistakeSectionKey(task, examNum) {
  var num = parseInt(examNum, 10);
  if (task && task._sectionId) {
    if (task._sectionId.indexOf("listening") === 0) return "listening";
    if (
      task._sectionId.indexOf("reading") === 0 ||
      task._sectionId === "matching-headings" ||
      task._sectionId === "gap-fill" ||
      task._sectionId === "reading-comprehension"
    ) {
      return "reading";
    }
    if (
      task._sectionId.indexOf("grammar") === 0 ||
      task._sectionId === "word-formation" ||
      task._sectionId === "vocabulary-cloze"
    ) {
      return "useOfEnglish";
    }
  }
  return E.examSectionKeyFromNum(num) || "useOfEnglish";
};

E.formatGapOption = function formatGapOption(task, value) {
  if (!value) return "—";
  var idx = parseInt(value, 10);
  if (!task.options || !idx || idx < 1 || idx > task.options.length) return value;
  return idx + ". " + task.options[idx - 1];
};

E.formatMcOption = function formatMcOption(question, value) {
  if (value === "" || value == null) return "—";
  var idx = parseInt(value, 10);
  if (!question.opts || isNaN(idx) || !question.opts[idx]) return String(value);
  return idx + 1 + ". " + question.opts[idx];
};

E.formatHeadingOption = function formatHeadingOption(task, value) {
  if (!value) return "—";
  var idx = parseInt(value, 10);
  if (!task.headings || !idx || idx < 1 || idx > task.headings.length) return value;
  return idx + ". " + task.headings[idx - 1];
};

E.formatListeningStatement = function formatListeningStatement(task, value) {
  if (!value) return "—";
  var idx = parseInt(value, 10);
  if (!task.examMatch || !task.examMatch.statements || !idx) return value;
  if (idx < 1 || idx > task.examMatch.statements.length) return value;
  return idx + ". " + task.examMatch.statements[idx - 1];
};

E.formatTfnAnswer = function formatTfnAnswer(task, value) {
  if (!value) return "—";
  var labels =
    task.examTfn && task.examTfn.labels
      ? task.examTfn.labels
      : ["True", "False", "Not stated"];
  var idx = parseInt(value, 10) - 1;
  if (idx >= 0 && idx < labels.length) return labels[idx] + " (" + value + ")";
  return value;
};

E.pushMistake = function pushMistake(list, item) {
  if (!item) return;
  list.push(item);
};

function mistakeDisplayTitle(item) {
  if (!item) return "";
  if (item.label && item.examNum) return "№ " + item.examNum + " · " + item.label;
  if (item.label) return item.label;
  if (item.examNum) return "№ " + item.examNum;
  return "";
}

E.mistakeDisplayTitle = mistakeDisplayTitle;

function collectGapfillMistakes(task) {
  var mistakes = [];
  if (!task || task.type !== "gapfill") return mistakes;
  var taskId = task.id;
  var prefix = E.taskPrefix(taskId);

  task.gaps.forEach(function (gap, index) {
      var name = prefix + "_gap_" + gap;
      var user = E.getTaskRadioAnswer(taskId, name);
      var correct = String(task.answers[gap] || "");
      if (E.scoreShortAnswer(user, correct)) return;
      E.pushMistake(mistakes, {
        taskId: taskId,
        examNum: E.examItemNumber(task, index),
        section: E.mistakeSectionKey(task, E.examItemNumber(task, index)),
        label: "Gap " + gap,
        user: E.formatGapOption(task, user),
        correct: E.formatGapOption(task, correct),
        explanation:
          "Sentence part " +
          correct +
          " fits gap " +
          gap +
          ": " +
          trimSnippet(task.options[parseInt(correct, 10) - 1], 140),
      });
    });
  return mistakes;
}

function collectMatchingMistakes(task) {
  var mistakes = [];
  if (!task) return mistakes;
  var taskId = task.id;
  var prefix = E.taskPrefix(taskId);

  if (task.type !== "matching") return mistakes;

  task.texts.forEach(function (item, index) {
      var name = prefix + "_" + item.letter;
      var user = E.getTaskRadioAnswer(taskId, name);
      var correct = String(task.answers[item.letter] || "");
      if (E.scoreShortAnswer(user, correct)) return;
      E.pushMistake(mistakes, {
        taskId: taskId,
        examNum: E.examItemNumber(task, index),
        section: E.mistakeSectionKey(task, E.examItemNumber(task, index)),
        label: "Text " + item.letter,
        user: E.formatHeadingOption(task, user),
        correct: E.formatHeadingOption(task, correct),
        explanation:
          "Paragraph " +
          item.letter +
          " matches heading " +
          correct +
          ": " +
          trimSnippet(task.headings[parseInt(correct, 10) - 1], 140),
      });
    });
  return mistakes;
}

function collectMcMistakes(task) {
  var mistakes = [];
  if (!task) return mistakes;
  var taskId = task.id;
  var prefix = E.taskPrefix(taskId);

  if (task.type !== "mc") return mistakes;

  task.questions.forEach(function (question, index) {
      var name = prefix + "_q_" + index;
      var user = E.getTaskRadioAnswer(taskId, name);
      var correct = String(question.correct);
      if (E.scoreShortAnswer(user, correct)) return;
      E.pushMistake(mistakes, {
        taskId: taskId,
        examNum: E.examItemNumber(task, index),
        section: E.mistakeSectionKey(task, E.examItemNumber(task, index)),
        label: "Question " + (index + 1),
        user: E.formatMcOption(question, user),
        correct: E.formatMcOption(question, correct),
        explanation: trimSnippet(question.q, 180),
      });
    });
  return mistakes;
}

function collectWordformMistakes(task) {
  var mistakes = [];
  if (!task) return mistakes;
  var taskId = task.id;
  var prefix = E.taskPrefix(taskId);

  if (task.type !== "wordform") return mistakes;

  task.items.forEach(function (item, index) {
      var fieldId = prefix + "_wf_" + index;
      var user = E.normalizeAnswer(E.getTaskTextAnswer(taskId, fieldId));
      var valid = E.buildAcceptedAnswers(item.answer, item.alt).map(E.normalizeAnswer);
      if (!user) {
        E.pushMistake(mistakes, {
          taskId: taskId,
          examNum: E.examItemNumber(task, index),
          section: E.mistakeSectionKey(task, E.examItemNumber(task, index)),
          label: "Item " + (index + 1),
          user: "—",
          correct: item.answer,
          explanation:
            "Transform " +
            item.word +
            " → " +
            item.answer +
            ". " +
            trimSnippet(item.pre + " … " + item.post, 160),
        });
        return;
      }
      if (valid.indexOf(user) !== -1) return;
      E.pushMistake(mistakes, {
        taskId: taskId,
        examNum: E.examItemNumber(task, index),
        section: E.mistakeSectionKey(task, E.examItemNumber(task, index)),
        label: "Item " + (index + 1),
        user: user,
        correct: item.answer,
        explanation:
          "From " +
          item.word +
          " use " +
          item.answer +
          ". " +
          trimSnippet(item.pre + " … " + item.post, 160),
      });
    });
  return mistakes;
}

function collectListeningMistakes(task) {
  var mistakes = [];
  if (!task || task.type !== "listening") return mistakes;

  var taskId = task.id;
  var prefix = E.taskPrefix(taskId);

  if (task.examMatch) {
      var emAnswers = task.examMatch.answers || {};
      (task.examMatch.speakers || []).forEach(function (speaker, index) {
        var name = prefix + "_em_" + speaker;
        var user = E.getTaskRadioAnswer(taskId, name);
        var correct = String(emAnswers[speaker] || "");
        if (E.scoreShortAnswer(user, correct)) return;
        E.pushMistake(mistakes, {
          taskId: taskId,
          examNum: E.examItemNumber(task, index),
          section: "listening",
          label: "Speaker " + speaker,
          user: E.formatListeningStatement(task, user),
          correct: E.formatListeningStatement(task, correct),
          explanation: "Match speaker " + speaker + " to statement " + correct + ".",
        });
      });
    }

    if (task.examTfn) {
      var etAnswers = task.examTfn.answers || {};
      (task.examTfn.statements || []).forEach(function (item, index) {
        var name = prefix + "_etfn_" + item.letter;
        var user = E.getTaskRadioAnswer(taskId, name);
        var correct = String(etAnswers[item.letter] || "");
        if (E.scoreShortAnswer(user, correct)) return;
        E.pushMistake(mistakes, {
          taskId: taskId,
          examNum: E.examItemNumber(task, index),
          section: "listening",
          label: "Statement " + item.letter,
          user: E.formatTfnAnswer(task, user),
          correct: E.formatTfnAnswer(task, correct),
          explanation: trimSnippet(item.text, 180),
        });
      });
    }

    E.getActiveListeningGaps(task).forEach(function (gap, index) {
      var fieldId = prefix + "_gap_" + gap.num;
      var user = E.normalizeAnswer(E.getTaskTextAnswer(taskId, fieldId));
      var valid = E.buildAcceptedAnswers(gap.answer, gap.alt).map(E.normalizeAnswer);
      if (user && valid.indexOf(user) !== -1) return;
      E.pushMistake(mistakes, {
        taskId: taskId,
        examNum: E.examItemNumber(task, index),
        section: "listening",
        label: "Gap " + (gap.label || gap.num),
        user: user || "—",
        correct: gap.answer,
        explanation: gap.prompt ? trimSnippet(gap.prompt, 180) : "Check spelling and word form.",
      });
    });

    (task.questions || []).forEach(function (question, index) {
      var name = prefix + "_q_" + index;
      var user = E.getTaskRadioAnswer(taskId, name);
      var correct = String(question.correct);
      if (E.scoreShortAnswer(user, correct)) return;
      E.pushMistake(mistakes, {
        taskId: taskId,
        examNum: E.examItemNumber(task, index),
        section: "listening",
        label: "Question " + (index + 1),
        user: E.formatMcOption(question, user),
        correct: E.formatMcOption(question, correct),
        explanation: trimSnippet(question.q, 180),
      });
    });

  return mistakes;
}

E.collectTaskMistakes = function collectTaskMistakes(task) {
  if (!task || E.isOralTask(task) || task.type === "writing") return [];
  if (task.type === "gapfill") return collectGapfillMistakes(task);
  if (task.type === "matching") return collectMatchingMistakes(task);
  if (task.type === "mc") return collectMcMistakes(task);
  if (task.type === "wordform") return collectWordformMistakes(task);
  if (task.type === "listening") return collectListeningMistakes(task);
  return [];
};

function formatSpeakingPendingNote(key, item) {
  var examNum = parseInt(String(key).replace("task", ""), 10) + 38;
  if (!item.hasAudio) return String(examNum) + " — нет записи/таймера";
  if (item.pendingReview) return String(examNum) + " — нет оценки";
  return "";
}

E.buildExamResultsReport = function buildExamResultsReport() {
  if (typeof E.finalizePlacementExam === "function") E.finalizePlacementExam();

  var bundle = E.calculateExamResultFromStateWithInputs();
  var result = bundle.result;
  var inputs = bundle.inputs;

  // "Only oral" mode never touches listening/reading/grammar -- those are
  // the only sections behind testScore/primaryScore, so left alone this
  // reads as a 0/100 "below threshold" fail instead of a deliberate skip.
  // getResultStatus stays mode-agnostic; this is the one place to say so.
  // Only .label actually renders (see renderExamResultsScreen) -- .message
  // is kept only for shape parity with getResultStatus's return value,
  // same as everywhere else that's unused today.
  if (typeof E.getExamMode === "function" && E.getExamMode() === E.EXAM_MODES.ORAL) {
    result.status = {
      level: "written-skipped",
      label: "Письменная часть не выполнялась — баллы её не учитывают",
      message: "Экзамен был выбран в режиме «только устная часть».",
    };
  }
  var mistakes = [];
  var writingNotes = [];

  E.writtenExamTasks().forEach(function (task) {
    mistakes = mistakes.concat(E.collectTaskMistakes(task));
    if (task.type === "writing") {
      var ev = E.buildWritingEvaluation(task);
      if (ev.pendingReview) {
        writingNotes.push({
          examNum: task.examNum || E.taskExamFrom(task),
          wordCount: ev.wordCount,
        });
      }
    }
  });

  var speakingNotes = [];
  Object.keys(inputs.speakingEval.tasks || {}).forEach(function (key) {
    var item = inputs.speakingEval.tasks[key];
    var note = formatSpeakingPendingNote(key, item);
    if (note) speakingNotes.push(note);
  });

  mistakes.sort(function (a, b) {
    var an = parseInt(a.examNum, 10) || 0;
    var bn = parseInt(b.examNum, 10) || 0;
    return an - bn;
  });

  var growth = E.getGrowthPotential(result.sections, mistakes, result.primaryScore);

  return {
    result: result,
    inputs: inputs,
    mistakes: mistakes,
    writingNotes: writingNotes,
    speakingNotes: speakingNotes,
    growth: growth,
  };
};

// Letter-suffixed labels ("Text A", "Gap B", "Speaker D", "Statement A")
// map to an explanations entry via its "part" field; a bare task_id match
// with a single unpartitioned item (most listening/reading MC questions)
// is used directly instead.
function explanationLetterFromLabel(label) {
  var m = /([A-Za-z])\s*$/.exec(String(label || "").trim());
  return m ? m[1].toUpperCase() : null;
}

E.findMistakeExplanationData = function findMistakeExplanationData(item, doc) {
  if (!doc || !item) return null;
  var tasks = doc.tasks || [];
  var key = String(item.examNum);
  var byId = null;
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].task_id === key) {
      byId = tasks[i];
      break;
    }
  }
  if (byId) {
    var items = byId.items || [];
    if (items.length === 1 && items[0].part == null) return items[0];
    var letter = explanationLetterFromLabel(item.label);
    if (letter) {
      for (var j = 0; j < items.length; j++) {
        if (String(items[j].part).toUpperCase() === letter) return items[j];
      }
    }
  }
  // Composite task groups (wordform 19-24/25-29, grammar mc 30-36) have no
  // single task_id matching an individual item's exam number -- their
  // items carry the real absolute number in "part" instead, so search by
  // that across every task's items rather than by task_id.
  for (var k = 0; k < tasks.length; k++) {
    var arr = tasks[k].items || [];
    for (var n = 0; n < arr.length; n++) {
      if (String(arr[n].part) === key) return arr[n];
    }
  }
  return null;
};

E.renderMistakesBySection = function renderMistakesBySection(mistakes, explanationsDoc) {
  if (!mistakes.length) {
    return '<p class="ege-results-mistakes__empty">Ошибок в автопроверяемых заданиях нет.</p>';
  }

  var groups = {};
  mistakes.forEach(function (item) {
    var key = item.section || "useOfEnglish";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  var order = ["listening", "reading", "useOfEnglish"];
  var html = '<section class="ege-results-mistakes" aria-label="Ошибки">';

  order.forEach(function (key) {
    var items = groups[key];
    if (!items || !items.length) return;
    html +=
      '<div class="ege-results-mistakes__group">' +
      '<h4 class="ege-results-mistakes__group-title">' +
      esc(sectionLabel(key)) +
      "</h4><ol class=\"ege-results-mistakes__list\">";
    items.forEach(function (item) {
      var found = E.findMistakeExplanationData(item, explanationsDoc);
      var explanationText = (found && found.full_explanation) || item.explanation || "";
      html +=
        '<li class="ege-results-mistakes__item">' +
        '<p class="ege-results-mistakes__head"><span class="ege-results-mistakes__num">' +
        esc(mistakeDisplayTitle(item)) +
        "</span></p>" +
        '<p class="ege-results-mistakes__answer ege-results-mistakes__answer--wrong"><span>Ваш ответ</span> ' +
        esc(item.user) +
        "</p>" +
        '<p class="ege-results-mistakes__answer ege-results-mistakes__answer--correct"><span>Верно</span> ' +
        esc(item.correct) +
        "</p>" +
        (explanationText
          ? "<details class=\"ege-results-mistakes__explain\"><summary>Показать объяснение</summary><p>" +
            esc(explanationText) +
            "</p></details>"
          : "") +
        '<button type="button" class="ege-results-mistakes__review" data-results-task="' +
        esc(item.taskId) +
        '">Открыть задание</button>' +
        "</li>";
    });
    html += "</ol></div>";
  });

  html += "</section>";
  return html;
};

E.renderMistakesEntryPoint = function renderMistakesEntryPoint(mistakes) {
  if (!mistakes || !mistakes.length) {
    return '<p class="ege-exam-phase__note">Ошибок в автопроверяемых заданиях нет.</p>';
  }
  return (
    '<div class="ege-exam-phase__actions ege-results-mistakes-entry">' +
    '<button type="button" class="ege-btn ege-btn--primary" id="egeGotoMistakes">' +
    "Перейти к работе над ошибками (" +
    mistakes.length +
    ")</button>" +
    "</div>"
  );
};

E.renderMistakesReviewScreen = function renderMistakesReviewScreen(mistakes, explanationsDoc) {
  return (
    '<div class="ege-exam-phase__panel ege-exam-phase__panel--mistakes" role="region" aria-labelledby="egeMistakesTitle">' +
    '<button type="button" class="ege-btn ege-btn--ghost ege-exam-phase__back" id="egeMistakesBack">← Назад к результатам</button>' +
    '<h2 class="ege-exam-phase__title" id="egeMistakesTitle">Работа над ошибками</h2>' +
    E.renderMistakesBySection(mistakes, explanationsDoc) +
    "</div>"
  );
};

E.loadAnswerExplanations = function loadAnswerExplanations() {
  if (!E._answerExplanationsPromise) {
    E._answerExplanationsPromise = fetch("ege_2027_answer_explanations.json")
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .catch(function () {
        return null;
      });
  }
  return E._answerExplanationsPromise;
};

E.showMistakesReviewScreen = function showMistakesReviewScreen() {
  var report = E.buildExamResultsReport();
  E.loadAnswerExplanations().then(function (doc) {
    E.showExamPhaseScreen(E.renderMistakesReviewScreen(report.mistakes, doc));
    E.bindMistakesReviewScreen();
  });
};

E.bindMistakesReviewScreen = function bindMistakesReviewScreen() {
  var backBtn = document.getElementById("egeMistakesBack");
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      E.showExamResultsScreen();
    });
  }
  document.querySelectorAll("[data-results-task]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var taskId = btn.getAttribute("data-results-task");
      if (!taskId) return;
      if (typeof E.enterExamReview === "function") E.enterExamReview();
      E.showTask(taskId);
    });
  });
};

E.renderSectionBreakdown = function renderSectionBreakdown(result) {
  var max = result.sectionMax || E.EXAM_SCORING_CONFIG.sections;
  // Writing/speaking aren't auto-checked (see calculatePrimaryScore), so
  // they never show a computed score here -- only whatever a teacher
  // entered by hand (see E.getManualSectionScore), or an "Добавить балл"
  // prompt if nothing's been entered yet.
  var ungraded = { writing: true, speaking: true };
  var breakdown = '<div class="ege-exam-phase__breakdown ege-results-sections">';
  ["listening", "reading", "useOfEnglish", "writing", "speaking"].forEach(function (key) {
    var sectionMax = max[key] || 0;
    if (ungraded[key]) {
      var manual = E.getManualSectionScore(key);
      breakdown +=
        '<div class="ege-exam-phase__row ege-results-sections__row ege-results-sections__row--ungraded">' +
        "<span>" +
        esc(sectionLabel(key)) +
        "</span>" +
        (manual == null
          ? '<button type="button" class="ege-btn ege-btn--ghost ege-btn--small" data-add-score="' +
            key +
            '">Добавить балл</button>'
          : "<span>" +
            manual +
            " / " +
            sectionMax +
            ' <button type="button" class="ege-results-sections__edit" data-add-score="' +
            key +
            '">изменить</button></span>') +
        "</div>";
      return;
    }
    var score = result.sections[key] || 0;
    breakdown +=
      '<div class="ege-exam-phase__row ege-results-sections__row">' +
      "<span>" +
      esc(sectionLabel(key)) +
      "</span>" +
      "<span>" +
      score +
      " / " +
      sectionMax +
      ' <span class="ege-results-sections__pct">(' + pct(score, sectionMax) + "%)</span>" +
      "</span>" +
      "</div>";
  });
  breakdown += "</div>";
  return breakdown;
};

E.buildExamResultsText = function buildExamResultsText(report) {
  var data = report || E.buildExamResultsReport();
  var result = data.result;
  var lines = [];
  lines.push("Результаты — Time to ЕГЭ 2027");
  lines.push("");
  lines.push("Тестовый балл (автопроверка): " + result.testScore + " / 100");
  lines.push("Первичный балл (автопроверка): " + result.primaryScore + " / " + result.maxPrimaryScore);
  lines.push(result.status.label);
  lines.push("");
  lines.push("По разделам:");
  var max = result.sectionMax || {};
  var ungraded = { writing: true, speaking: true };
  ["listening", "reading", "useOfEnglish", "writing", "speaking"].forEach(function (key) {
    var sectionMax = max[key] || 0;
    if (ungraded[key]) {
      var manual = E.getManualSectionScore(key);
      var suffix = manual == null ? " (нет балла от учителя)" : " (балл добавлен учителем)";
      lines.push(
        "- " + sectionLabel(key) + ": " + (manual == null ? "—" : manual) + " / " + sectionMax + suffix
      );
      return;
    }
    var score = result.sections[key] || 0;
    lines.push("- " + sectionLabel(key) + ": " + score + " / " + sectionMax + " (" + pct(score, sectionMax) + "%)");
  });
  if (data.mistakes && data.mistakes.length) {
    lines.push("");
    lines.push("Ошибки (" + data.mistakes.length + "):");
    data.mistakes.forEach(function (item) {
      lines.push("- " + mistakeDisplayTitle(item) + ": " + (item.explanation || ""));
    });
  }
  return lines.join("\n");
};

E.downloadExamResultsText = function downloadExamResultsText() {
  var text = E.buildExamResultsText();
  var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "ege-2027-results.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

E.copyExamResultsText = function copyExamResultsText(btn) {
  var text = E.buildExamResultsText();
  function done(ok) {
    if (!btn) return;
    var original = btn.dataset.originalLabel || btn.textContent;
    btn.dataset.originalLabel = original;
    btn.textContent = ok ? "Скопировано" : "Не удалось скопировать";
    window.setTimeout(function () {
      btn.textContent = original;
    }, 1500);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () {
        done(true);
      },
      function () {
        done(false);
      }
    );
  } else {
    done(false);
  }
};

E.renderRecordingsSection = function renderRecordingsSection() {
  var tasks =
    typeof E.getRecordedOralTasks === "function" ? E.getRecordedOralTasks() : [];
  if (!tasks.length) return "";

  var items = tasks
    .map(function (task) {
      var examNum = E.taskExamFrom(task) || task.id;
      return (
        '<button type="button" class="ege-btn ege-btn--ghost ege-btn--small" data-download-recording="' +
        esc(task.id) +
        '">Задание ' +
        esc(String(examNum)) +
        " (.mp3)</button>"
      );
    })
    .join("");

  return (
    '<div class="ege-exam-phase__block ege-results-recordings">' +
    '<p class="ege-panel__label">Записи устной части</p>' +
    '<div class="ege-results-recordings__list">' +
    items +
    "</div>" +
    "</div>"
  );
};

E.renderExamResultsScreen = function renderExamResultsScreen(report) {
  var data = report || E.buildExamResultsReport();
  var result = data.result;

  return (
    '<div class="ege-exam-phase__panel ege-exam-phase__panel--results" role="region" aria-labelledby="egeResultsTitle">' +
    '<h2 class="ege-exam-phase__title" id="egeResultsTitle">Результаты</h2>' +
    '<p class="ege-exam-phase__score ege-exam-phase__score--test">' +
    result.testScore +
    " / 100</p>" +
    '<p class="ege-exam-phase__lead">Тестовый балл (автопроверка)</p>' +
    '<p class="ege-exam-phase__score ege-exam-phase__score--primary">' +
    result.primaryScore +
    " / " +
    result.maxPrimaryScore +
    "</p>" +
    '<p class="ege-exam-phase__lead">Первичный балл (автопроверка)</p>' +
    '<p class="result-status result-status--' +
    esc(result.status.level) +
    '">' +
    esc(result.status.label) +
    "</p>" +
    E.renderSectionBreakdown(result) +
    E.renderRecordingsSection() +
    '<div class="ege-exam-phase__actions ege-results-export">' +
    '<button type="button" class="ege-btn ege-btn--ghost" id="egeResultsDownload">Скачать .txt</button>' +
    '<button type="button" class="ege-btn ege-btn--ghost" id="egeResultsCopy">Копировать</button>' +
    "</div>" +
    E.renderMistakesEntryPoint(data.mistakes) +
    "</div>"
  );
};

E.bindExamResultsScreen = function bindExamResultsScreen() {
  var gotoMistakesBtn = document.getElementById("egeGotoMistakes");
  if (gotoMistakesBtn) {
    gotoMistakesBtn.addEventListener("click", function () {
      E.showMistakesReviewScreen();
    });
  }

  document.querySelectorAll("[data-add-score]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      E.promptManualSectionScore(btn.getAttribute("data-add-score"));
    });
  });

  var downloadBtn = document.getElementById("egeResultsDownload");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", function () {
      E.downloadExamResultsText();
    });
  }

  var copyBtn = document.getElementById("egeResultsCopy");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      E.copyExamResultsText(copyBtn);
    });
  }

  document.querySelectorAll("[data-download-recording]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var taskId = btn.getAttribute("data-download-recording");
      if (!taskId || btn.disabled) return;
      var originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Кодирование…";
      E.exportSpeakingRecording(taskId, function () {
        btn.disabled = false;
        btn.textContent = originalLabel;
      });
    });
  });
};

E.showExamResultsScreen = function showExamResultsScreen() {
  E.state.examReviewing = false;
  var report = E.buildExamResultsReport();
  E.showExamPhaseScreen(E.renderExamResultsScreen(report));
  E.bindExamResultsScreen();
};

E.viewExamResults = function viewExamResults() {
  E.state.examReviewing = false;
  E.persistExamPhase(E.EXAM_PHASES.COMPLETE);
};

E.confirmOralResults = function confirmOralResults() {
  E.viewExamResults();
};
