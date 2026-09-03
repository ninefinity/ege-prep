import { E } from "./runtime.js";

E.WRITTEN_MAX = {
  listening: 12,
  reading: 12,
  grammar: 18,
  writing: 20,
  task1: 3,
  task2: 2,
  task10: 3,
  task11: 2,
  task37: 6,
  task38: 14,
  total: 82,
};

E.examBandPrimary = function examBandPrimary(rawCorrect, rawMax, primaryMax) {
  var raw = E.limitScore(rawCorrect, rawMax);
  if (!rawMax || rawMax <= primaryMax) return E.limitScore(raw, primaryMax);
  return E.limitScore(raw - (rawMax - primaryMax), primaryMax);
};

E.officialTaskRaw = function officialTaskRaw(task) {
  var saved = E.state.scores[task.id] || 0;
  var max = E.taskMaxScore(task);
  return { correct: E.limitScore(saved, max), max: max };
};

E.writingStorageKey = function writingStorageKey(taskNum, variantKey) {
  return "ege-prep:written-" + taskNum + ":" + String(variantKey || "demo");
};

E.loadWritingScore = function loadWritingScore(taskNum, variantKey) {
  try {
    var raw = sessionStorage.getItem(E.writingStorageKey(taskNum, variantKey));
    if (raw == null || raw === "") return 0;
    return E.limitScore(
      raw,
      taskNum === 38 ? E.WRITTEN_MAX.task38 : E.WRITTEN_MAX.task37
    );
  } catch (err) {
    return 0;
  }
};

E.saveWritingScore = function saveWritingScore(taskNum, variantKey, value) {
  try {
    sessionStorage.setItem(
      E.writingStorageKey(taskNum, variantKey),
      String(E.limitScore(value, taskNum === 38 ? E.WRITTEN_MAX.task38 : E.WRITTEN_MAX.task37))
    );
  } catch (err) {
    /* ignore quota / private mode */
  }
};

E.collectWrittenResults = function collectWrittenResults() {
  var results = {
    task_37_score: E.loadWritingScore(37, E.state.examTimerKey),
    task_38_score: E.loadWritingScore(38, E.state.examTimerKey),
  };
  if (!E.state.topic || !E.state.topic.tasks) return results;

  (E.state.topic.tasks || []).forEach(function (task) {
    if (typeof E.taskExamFrom !== "function") return;
    var from = E.taskExamFrom(task);
    if (from == null || from >= 40) return;
    var to = typeof E.taskExamTo === "function" ? E.taskExamTo(task) : from;

    if (task.type === "writing") {
      var writeScore =
        typeof E.buildWritingEvaluation === "function"
          ? E.buildWritingEvaluation(task).score
          : E.loadWritingScore(from, E.state.examTimerKey);
      if (from === 37) results.task_37_score = writeScore;
      else if (from === 38) results.task_38_score = writeScore;
      return;
    }

    var raw = E.officialTaskRaw(task);

    if (from === to && from === 1) {
      results.task_1_correct = E.examBandPrimary(raw.correct, raw.max, E.WRITTEN_MAX.task1);
      return;
    }
    if (from === to && from === 2) {
      results.task_2_correct = E.examBandPrimary(raw.correct, raw.max, E.WRITTEN_MAX.task2);
      return;
    }
    if (from === to && from === 10) {
      results.task_10_correct = E.examBandPrimary(raw.correct, raw.max, E.WRITTEN_MAX.task10);
      return;
    }
    if (from === to && from === 11) {
      results.task_11_correct = E.examBandPrimary(raw.correct, raw.max, E.WRITTEN_MAX.task11);
      return;
    }
    if (from === to && from === 37) {
      results.task_37_score = E.limitScore(raw.correct, E.WRITTEN_MAX.task37);
      return;
    }
    if (from === to && from === 38) {
      results.task_38_score = E.limitScore(raw.correct, E.WRITTEN_MAX.task38);
      return;
    }

    results["tasks_" + from + "_" + to] = E.limitScore(raw.correct, to - from + 1);
  });

  return results;
};

E.rangePoints = function rangePoints(results, from, to, key) {
  if (results[key] != null) return E.limitScore(results[key], to - from + 1);
  var sum = 0;
  for (var n = from; n <= to; n += 1) {
    sum += E.limitScore(results["task_" + n], 1);
  }
  return sum;
};

E.calculateWrittenScore = function calculateWrittenScore(results) {
  var data = results || {};

  var listening =
    E.limitScore(data.task_1_correct, E.WRITTEN_MAX.task1) +
    E.limitScore(data.task_2_correct, E.WRITTEN_MAX.task2) +
    E.rangePoints(data, 3, 9, "tasks_3_9");

  var reading =
    E.limitScore(data.task_10_correct, E.WRITTEN_MAX.task10) +
    E.limitScore(data.task_11_correct, E.WRITTEN_MAX.task11) +
    E.rangePoints(data, 12, 18, "tasks_12_18");

  var grammar =
    E.rangePoints(data, 19, 24, "tasks_19_24") +
    E.rangePoints(data, 25, 29, "tasks_25_29") +
    E.rangePoints(data, 30, 36, "tasks_30_36");
  if (data.tasks_19_36 != null) {
    grammar = E.limitScore(data.tasks_19_36, E.WRITTEN_MAX.grammar);
  }

  var task37 = E.limitScore(data.task_37_score, E.WRITTEN_MAX.task37);
  var task38 = E.limitScore(data.task_38_score, E.WRITTEN_MAX.task38);
  var writing = task37 + task38;

  return {
    listening: listening,
    reading: reading,
    grammar: grammar,
    writing37: task37,
    writing38: task38,
    writing: writing,
    total: listening + reading + grammar + writing,
    maximum:
      E.EXAM_SCORING_CONFIG && E.EXAM_SCORING_CONFIG.maxPrimaryScore
        ? E.EXAM_SCORING_CONFIG.maxPrimaryScore
        : E.WRITTEN_MAX.total,
  };
};

E.writtenExamTasks = function writtenExamTasks() {
  if (!E.state.topic || !E.state.topic.tasks) return [];
  return E.state.topic.tasks.filter(function (task) {
    var section = E.taskSectionMeta(task);
    return section && section.examFrom != null && section.examFrom < 40;
  });
};

E.variantHasWrittenPoints = function variantHasWrittenPoints() {
  return E.writtenExamTasks().length > 0 && !!E.state.playlist;
};

E.isVariantPlaylist = function isVariantPlaylist() {
  return String(E.state.topicId || "").indexOf("variant:") === 0;
};

E.isExamInProgress = function isExamInProgress() {
  if (!E.isVariantPlaylist()) return false;
  if (E.isExamFinished()) return false;
  return Number(E.state.examMinutes) > 0;
};

E.isFullWrittenExam = function isFullWrittenExam() {
  if (String(E.state.topicId || "").indexOf("variant:") !== 0) return false;
  if (!E.state.topic || !E.state.topic.tasks || !E.state.playlist) return false;

  var hasOral = false;
  var hasWritten = false;
  E.state.topic.tasks.forEach(function (task) {
    if (typeof E.isOralTask === "function" && E.isOralTask(task)) hasOral = true;
    else hasWritten = true;
  });
  return hasOral && hasWritten;
};

E.isPlacementExam = function isPlacementExam() {
  return E.isFullWrittenExam();
};

E.hidesShowAnswers = function hidesShowAnswers() {
  return E.isPlacementExam();
};

E.hidesPracticeControls = function hidesPracticeControls() {
  return E.isPlacementExam();
};

E.isPlacementTaskFilled = function isPlacementTaskFilled(taskId) {
  var task = E.findTask(taskId);
  if (!task) return false;
  var prefix = E.taskPrefix(taskId);

  if (task.type === "listening") {
    if (task.prep && task.prep.gapFill && task.prep.gapFill.items && task.prep.gapFill.items.length) {
      if (!E.eachPrepGapInputFilled(prefix, task.prep.gapFill.items)) return false;
    }
    if (task.prep && task.prep.matching && task.prep.matching.expressions && task.prep.matching.expressions.length) {
      for (var mi = 0; mi < task.prep.matching.expressions.length; mi += 1) {
        var expr = task.prep.matching.expressions[mi];
        if (!E.getCheckedValue(prefix + "_prep_m_" + expr.id)) return false;
      }
    }
    var gaps = E.getActiveListeningGaps(task);
    if (
      gaps.length &&
      !gaps.every(function (gap) {
        var input = document.getElementById(prefix + "_gap_" + gap.num);
        return input && E.normalize(input.value);
      })
    ) {
      return false;
    }
    if (task.examMatch && !E.isListeningExamMatchComplete(taskId)) return false;
    if (task.examTfn && !E.isListeningExamTfnComplete(taskId)) return false;
    if (task.questions && task.questions.length && !E.isListeningMcComplete(taskId)) {
      return false;
    }
    return true;
  }

  if (task.type === "writing") {
    var textarea = document.getElementById("writing-draft-" + taskId);
    return !!(textarea && E.normalize(textarea.value));
  }

  return typeof E.isTaskFullyAnswered === "function" && E.isTaskFullyAnswered(taskId);
};

E.isPlacementWrittenFilled = function isPlacementWrittenFilled() {
  if (!E.isPlacementExam()) return false;
  var written = E.writtenExamTasks();
  return (
    written.length > 0 &&
    written.every(function (task) {
      return E.isPlacementTaskFilled(task.id);
    })
  );
};

E.isExamTimerStarted = function isExamTimerStarted() {
  if (!E.state.examTimerKey) return false;
  try {
    var started =
      parseInt(sessionStorage.getItem(E.examTimerStorageKey(E.state.examTimerKey)), 10) || 0;
    return started > 0;
  } catch (err) {
    return false;
  }
};

E.isExamTimeUp = function isExamTimeUp() {
  var mins = Number(E.state.examMinutes);
  if (mins > 0 && E.state.examEndsAt) return Date.now() >= E.state.examEndsAt;
  if (!mins || !E.state.examTimerKey) return false;
  try {
    var started =
      parseInt(sessionStorage.getItem(E.examTimerStorageKey(E.state.examTimerKey)), 10) || 0;
    if (!started) return false;
    return Date.now() >= started + mins * 60 * 1000;
  } catch (err) {
    return false;
  }
};

E.isWrittenExamDone = function isWrittenExamDone() {
  var written = E.writtenExamTasks();
  return written.length > 0 && written.every(function (task) {
    return E.isTaskComplete(task);
  });
};

E.isExamFinished = function isExamFinished() {
  if (E.isPlacementExam()) {
    if (typeof E.isWrittenSubmitted === "function" && E.isWrittenSubmitted()) return true;
    if (!E.isExamTimerStarted() && !E.isExamTimeUp()) return false;
    return E.isExamTimeUp() || E.isPlacementWrittenFilled();
  }
  return E.isExamTimeUp() || E.isWrittenExamDone();
};

E.computeTaskScoreSilent = function computeTaskScoreSilent(taskId) {
  var task = E.findTask(taskId);
  if (!task) return 0;
  var prefix = E.taskPrefix(taskId);
  var correct = 0;
  var radioAnswer = E.getTaskRadioAnswer
    ? function (name) {
        return E.getTaskRadioAnswer(taskId, name);
      }
    : function (name) {
        return E.getCheckedValue(name);
      };
  var textAnswer = E.getTaskTextAnswer
    ? function (fieldId) {
        return E.getTaskTextAnswer(taskId, fieldId);
      }
    : function (fieldId) {
        var input = document.getElementById(fieldId);
        return input ? input.value : "";
      };
  var selectAnswer = E.getTaskSelectAnswer
    ? function (fieldId) {
        return E.getTaskSelectAnswer(taskId, fieldId);
      }
    : function (fieldId) {
        var select = document.getElementById(fieldId);
        return select ? select.value : "";
      };

  if (task.type === "matching") {
    task.texts.forEach(function (item) {
      var value = radioAnswer(prefix + "_" + item.letter);
      if (E.scoreShortAnswer(value, task.answers[item.letter])) correct += 1;
    });
    return correct;
  }

  if (task.type === "gapfill") {
    task.gaps.forEach(function (gap) {
      var value = radioAnswer(prefix + "_gap_" + gap);
      if (E.scoreShortAnswer(value, task.answers[gap])) correct += 1;
    });
    return correct;
  }

  if (task.type === "mc") {
    task.questions.forEach(function (question, index) {
      var value = radioAnswer(prefix + "_q_" + index);
      if (E.scoreShortAnswer(value, question.correct)) correct += 1;
    });
    return correct;
  }

  if (task.type === "wordform") {
    task.items.forEach(function (item, index) {
      var fieldId = prefix + "_wf_" + index;
      var val = E.normalizeAnswer(textAnswer(fieldId));
      var valid = E.buildAcceptedAnswers(item.answer, item.alt).map(E.normalizeAnswer);
      if (valid.indexOf(val) !== -1) correct += 1;
    });
    return correct;
  }

  if (task.type === "listening") {
    E.getActiveListeningGaps(task).forEach(function (gap) {
      var fieldId = prefix + "_gap_" + gap.num;
      var val = E.normalizeAnswer(textAnswer(fieldId));
      var valid = E.buildAcceptedAnswers(gap.answer, gap.alt).map(E.normalizeAnswer);
      if (valid.indexOf(val) !== -1) correct += 1;
    });
    if (task.examMatch) {
      var emAnswers = task.examMatch.answers || {};
      (task.examMatch.speakers || []).forEach(function (speaker) {
        var name = prefix + "_em_" + speaker;
        if (E.scoreShortAnswer(radioAnswer(name), emAnswers[speaker] || "")) correct += 1;
      });
    }
    if (task.examTfn) {
      var etAnswers = task.examTfn.answers || {};
      (task.examTfn.statements || []).forEach(function (item) {
        var value = radioAnswer(prefix + "_etfn_" + item.letter);
        if (E.scoreShortAnswer(value, etAnswers[item.letter] || "")) correct += 1;
      });
    }
    (task.questions || []).forEach(function (question, index) {
      var value = radioAnswer(prefix + "_q_" + index);
      if (E.scoreShortAnswer(value, question.correct)) correct += 1;
    });
    return correct;
  }

  return E.state.scores[taskId] || 0;
};

E.finalizePlacementExam = function finalizePlacementExam() {
  if (!E.isPlacementExam() || E.state.placementFinalized) return;
  E.state.placementFinalized = true;
  if (!E.state.topic || !E.state.topic.tasks) return;

  E.state.topic.tasks.forEach(function (task) {
    var max = E.taskMaxScore(task);
    var score = E.computeTaskScoreSilent(task.id);
    E.state.scores[task.id] = score;
    E.saveTaskScore(task.id, score, max);
    if (typeof E.setNavStatus === "function") E.setNavStatus(task.id, score, max);
  });
};

E.hideExamPoints = function hideExamPoints() {
  var bar = document.getElementById("egeExamBar");
  if (!bar) return;
  var timer = document.getElementById("egeExamTimer");
  var finishBtn = document.getElementById("egeFinishWritten");
  var phaseActions = document.getElementById("egeExamPhaseActions");
  var manageActions = document.getElementById("egeExamManageActions");
  var timerVisible = !!(timer && !timer.hidden);
  var finishVisible = !!(finishBtn && !finishBtn.hidden);
  var phaseVisible = !!(phaseActions && !phaseActions.hidden);
  var manageVisible = !!(manageActions && !manageActions.hidden && manageActions.childElementCount > 0);
  if (typeof E.useExamSidebarControls === "function" && E.useExamSidebarControls()) {
    if (typeof E.syncExamSideRail === "function") E.syncExamSideRail();
    return;
  }
  if (!timerVisible && !finishVisible && !phaseVisible && !manageVisible) bar.hidden = true;
};

E.syncExamPoints = function syncExamPoints() {
  if (typeof E.isPlacementExam === "function" && E.isPlacementExam()) {
    if (typeof E.isWrittenSubmitted === "function" && E.isWrittenSubmitted()) {
      if (typeof E.finalizePlacementExam === "function") E.finalizePlacementExam();
    } else {
      E.hideExamPoints();
      if (typeof E.syncExamPracticeUI === "function") E.syncExamPracticeUI();
      return;
    }
  }

  if (!E.isFullWrittenExam() || !E.isExamFinished()) {
    E.hideExamPoints();
    if (typeof E.syncExamPracticeUI === "function") E.syncExamPracticeUI();
    return;
  }

  if (typeof E.finalizePlacementExam === "function") E.finalizePlacementExam();
  E.hideExamPoints();
  if (typeof E.syncExamPracticeUI === "function") E.syncExamPracticeUI();
};
