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
  total: 62,
};

E.limitScore = function limitScore(score, maximum) {
  var n = Number(score);
  if (!isFinite(n)) n = 0;
  return Math.max(0, Math.min(n, maximum));
};

E.examBandPrimary = function examBandPrimary(rawCorrect, rawMax, primaryMax) {
  var raw = E.limitScore(rawCorrect, rawMax);
  if (!rawMax || rawMax <= primaryMax) return E.limitScore(raw, primaryMax);
  return E.limitScore(raw - (rawMax - primaryMax), primaryMax);
};

E.officialTaskRaw = function officialTaskRaw(task) {
  var saved = E.state.scores[task.id] || 0;
  if (task.type === "listening" && task.questions && task.questions.length) {
    return {
      correct: E.limitScore(saved, task.questions.length),
      max: task.questions.length,
    };
  }
  return { correct: saved, max: E.taskMaxScore(task) };
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
    var section = E.taskSectionMeta(task);
    if (!section || section.examFrom == null) return;
    var from = section.examFrom;
    var to = section.examTo == null ? from : section.examTo;
    if (from >= 40) return;

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
    maximum: E.WRITTEN_MAX.total,
  };
};

E.variantHasWrittenPoints = function variantHasWrittenPoints() {
  if (!E.state.playlist || !E.state.topic || !E.state.topic.tasks) return false;
  return E.state.topic.tasks.some(function (task) {
    var section = E.taskSectionMeta(task);
    return section && section.examFrom != null && section.examFrom < 40;
  });
};

E.hideExamPoints = function hideExamPoints() {
  var wrap = document.getElementById("egeExamPoints");
  if (wrap) wrap.hidden = true;
  var bar = document.getElementById("egeExamBar");
  var timer = document.getElementById("egeExamTimer");
  if (bar && (!timer || timer.hidden) && wrap && wrap.hidden) bar.hidden = true;
};

E.syncExamPoints = function syncExamPoints() {
  if (!E.variantHasWrittenPoints()) {
    E.hideExamPoints();
    return;
  }

  var score = E.calculateWrittenScore(E.collectWrittenResults());
  var wrap = document.getElementById("egeExamPoints");
  var totalBtn = document.getElementById("egeExamPointsTotal");
  var detail = document.getElementById("egeExamPointsDetail");
  var bar = document.getElementById("egeExamBar");
  if (!wrap || !totalBtn) return;

  if (bar) bar.hidden = false;
  wrap.hidden = false;
  totalBtn.textContent = score.total + " / " + score.maximum;
  totalBtn.setAttribute("aria-label", "Primary score " + score.total + " of " + score.maximum);

  if (!detail) return;
  var detailOpen = !detail.hidden;
  var input37 = detail.querySelector("#egeWrite37");
  var input38 = detail.querySelector("#egeWrite38");
  var v37 = input37 ? input37.value : String(score.writing37);
  var v38 = input38 ? input38.value : String(score.writing38);

  detail.innerHTML =
    '<div class="ege-exam-points__row"><span>Listening</span><span>' +
    score.listening +
    " / " +
    E.WRITTEN_MAX.listening +
    "</span></div>" +
    '<div class="ege-exam-points__row"><span>Reading</span><span>' +
    score.reading +
    " / " +
    E.WRITTEN_MAX.reading +
    "</span></div>" +
    '<div class="ege-exam-points__row"><span>Grammar</span><span>' +
    score.grammar +
    " / " +
    E.WRITTEN_MAX.grammar +
    "</span></div>" +
    '<label class="ege-exam-points__row">37 <input id="egeWrite37" type="number" min="0" max="6" inputmode="numeric" value="' +
    E.limitScore(v37, 6) +
    '"></label>' +
    '<label class="ege-exam-points__row">38 <input id="egeWrite38" type="number" min="0" max="14" inputmode="numeric" value="' +
    E.limitScore(v38, 14) +
    '"></label>';

  detail.hidden = !detailOpen;
  totalBtn.setAttribute("aria-expanded", detailOpen ? "true" : "false");
  E.bindWritingInputs();
};

E.bindWritingInputs = function bindWritingInputs() {
  var key = E.state.examTimerKey;
  ["37", "38"].forEach(function (num) {
    var input = document.getElementById("egeWrite" + num);
    if (!input) return;
    input.addEventListener("change", function () {
      E.saveWritingScore(Number(num), key, input.value);
      E.syncExamPoints();
    });
  });
};
