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

E.renderMistakesBySection = function renderMistakesBySection(mistakes) {
  if (!mistakes.length) {
    return '<p class="ege-results-mistakes__empty">Нет ошибок в автопроверяемых заданиях.</p>';
  }

  var groups = {};
  mistakes.forEach(function (item) {
    var key = item.section || "useOfEnglish";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  var order = ["listening", "reading", "useOfEnglish"];
  var html =
    '<section class="ege-results-mistakes" aria-labelledby="egeResultsMistakesTitle">' +
    '<h3 class="ege-results-mistakes__title" id="egeResultsMistakesTitle">Ошибки (' +
    mistakes.length +
    ")</h3>";

  order.forEach(function (key) {
    var items = groups[key];
    if (!items || !items.length) return;
    html +=
      '<div class="ege-results-mistakes__group">' +
      '<h4 class="ege-results-mistakes__group-title">' +
      esc(sectionLabel(key)) +
      "</h4><ol class=\"ege-results-mistakes__list\">";
    items.forEach(function (item) {
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
        '<p class="ege-results-mistakes__explain">' +
        esc(item.explanation) +
        "</p>" +
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

E.renderSectionBreakdown = function renderSectionBreakdown(result) {
  var max = result.sectionMax || E.EXAM_SCORING_CONFIG.sections;
  var breakdown = '<div class="ege-exam-phase__breakdown ege-results-sections">';
  ["listening", "reading", "useOfEnglish", "writing", "speaking"].forEach(function (key) {
    var score = result.sections[key] || 0;
    var sectionMax = max[key] || 0;
    breakdown +=
      '<div class="ege-exam-phase__row ege-results-sections__row">' +
      "<span>" +
      esc(sectionLabel(key)) +
      "</span>" +
      "<span>" +
      score +
      " / " +
      sectionMax +
      ' <span class="ege-results-sections__pct">(' +
      pct(score, sectionMax) +
      "%)</span></span>" +
      "</div>";
  });
  breakdown += "</div>";
  return breakdown;
};

E.renderGrowthBlock = function renderGrowthBlock(growth) {
  if (!growth || growth.recoverablePrimary <= 0) return "";
  return (
    '<p class="ege-results-growth">Потенциал роста: ~' +
    growth.potentialTestGain +
    " тестовых баллов при восстановлении " +
    growth.recoverablePrimary +
    " первичных баллов в автопроверяемых разделах.</p>"
  );
};

E.renderPendingNotes = function renderPendingNotes(writingNotes, speakingNotes) {
  var pendingHtml = "";
  if (writingNotes && writingNotes.length) {
    pendingHtml =
      '<p class="ege-exam-phase__meta">Письменные задания ' +
      writingNotes
        .map(function (note) {
          return String(note.examNum);
        })
        .join(", ") +
      ": ожидают оценки по критериям.</p>";
  }
  if (speakingNotes && speakingNotes.length) {
    pendingHtml +=
      '<p class="ege-exam-phase__meta">Устная часть: ' +
      esc(speakingNotes.join("; ")) +
      ".</p>";
  }
  return pendingHtml;
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
    '<p class="ege-exam-phase__lead">Тестовый балл</p>' +
    '<p class="ege-exam-phase__score ege-exam-phase__score--primary">' +
    result.primaryScore +
    " / " +
    result.maxPrimaryScore +
    "</p>" +
    '<p class="ege-exam-phase__lead">Первичный балл</p>' +
    '<p class="result-status result-status--' +
    esc(result.status.level) +
    '">' +
    esc(result.status.label) +
    "</p>" +
    '<p class="ege-exam-phase__note">' +
    esc(result.status.message) +
    "</p>" +
    E.renderSectionBreakdown(result) +
    E.renderGrowthBlock(data.growth) +
    E.renderPendingNotes(data.writingNotes, data.speakingNotes) +
    E.renderMistakesBySection(data.mistakes) +
    '<div class="ege-exam-phase__actions">' +
    '<button type="button" class="ege-btn ege-btn--primary" id="egeResultsReviewTasks">К заданиям</button>' +
    '<a class="ege-btn ege-btn--ghost" href="index.html">На главную</a>' +
    "</div>" +
    "</div>"
  );
};

E.bindExamResultsScreen = function bindExamResultsScreen() {
  var review = document.getElementById("egeResultsReviewTasks");
  if (review) {
    review.addEventListener("click", function () {
      if (typeof E.enterExamReview === "function") E.enterExamReview();
      var first = E.writtenExamTasks()[0];
      if (first) E.showTask(first.id);
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
