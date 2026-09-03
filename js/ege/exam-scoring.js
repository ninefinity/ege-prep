import { E } from "./runtime.js";
import "./exam-scoring.config.js";

E.normalizeAnswer = function normalizeAnswer(value) {
  return String(value == null ? "" : value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
};

E.scoreShortAnswer = function scoreShortAnswer(userAnswer, correctAnswer, points) {
  var pts = points == null ? 1 : points;
  return E.normalizeAnswer(userAnswer) === E.normalizeAnswer(correctAnswer) ? pts : 0;
};

E.sumCriteria = function sumCriteria(criteria) {
  if (!criteria) return 0;
  return Object.keys(criteria).reduce(function (sum, key) {
    var val = Number(criteria[key]);
    return sum + (isFinite(val) ? val : 0);
  }, 0);
};

E.scoreWritingByConfig = function scoreWritingByConfig(evaluation, configKey) {
  var cfg = E.EXAM_SCORING_CONFIG[configKey];
  if (!cfg) return 0;
  var maxScore = cfg.maxScore || 0;

  if (!evaluation || evaluation.isBlank || evaluation.isOffTopic) return 0;

  var score = E.sumCriteria(evaluation.criteria);
  if (evaluation.wordCount != null && evaluation.wordCount < cfg.wordCountMin) {
    score = Math.min(score, cfg.wordCountCap);
  }
  return E.clamp(score, 0, maxScore);
};

E.scoreWriting37 = function scoreWriting37(evaluation, config) {
  return E.scoreWritingByConfig(evaluation, "writing37");
};

E.scoreWriting38 = function scoreWriting38(evaluation, config) {
  return E.scoreWritingByConfig(evaluation, "writing38");
};

E.calculatePrimaryScore = function calculatePrimaryScore(results) {
  var cfg = E.EXAM_SCORING_CONFIG.sections;
  var listening = E.clamp(results.listening, 0, cfg.listening);
  var reading = E.clamp(results.reading, 0, cfg.reading);
  var useOfEnglish = E.clamp(results.useOfEnglish, 0, cfg.useOfEnglish);
  var writing = E.clamp(results.writing, 0, cfg.writing);
  var speaking = E.clamp(results.speaking, 0, cfg.speaking);

  return {
    primaryScore: listening + reading + useOfEnglish + writing + speaking,
    sections: {
      listening: listening,
      reading: reading,
      useOfEnglish: useOfEnglish,
      writing: writing,
      speaking: speaking,
    },
    sectionMax: cfg,
    maxPrimaryScore: E.EXAM_SCORING_CONFIG.maxPrimaryScore,
  };
};

E.convertToTestScore = function convertToTestScore(primaryScore) {
  var safe = E.clamp(Math.round(primaryScore), 0, E.EXAM_SCORING_CONFIG.maxPrimaryScore);
  return E.EXAM_PRIMARY_TO_TEST[safe] || 0;
};

E.getResultStatus = function getResultStatus(testScore) {
  if (testScore < 22) {
    return {
      level: "below-threshold",
      label: "Пока ниже минимального порога",
      message:
        "Нужно усилить базовые задания и закрыть самые частые ошибки.",
    };
  }
  if (testScore < 30) {
    return {
      level: "exam-passed",
      label: "Минимальный порог преодолён",
      message: "Экзамен сдан, но для поступления результат обычно недостаточен.",
    };
  }
  if (testScore < 60) {
    return {
      level: "developing",
      label: "Есть база для поступления",
      message: "Следующая цель — повысить стабильность в письменной и устной частях.",
    };
  }
  if (testScore < 80) {
    return {
      level: "strong",
      label: "Сильный результат",
      message:
        "Работайте над дорогими заданиями и точностью, чтобы выйти на высокий диапазон.",
    };
  }
  return {
    level: "excellent",
    label: "Высокий результат",
    message: "Фокус — на сохранении стабильности и отработке редких ошибок.",
  };
};

E.calculateExamResult = function calculateExamResult(results) {
  var primaryResult = E.calculatePrimaryScore(results);
  var testScore = E.convertToTestScore(primaryResult.primaryScore);
  return Object.assign({}, primaryResult, {
    testScore: testScore,
    passedExam: testScore >= 22,
    meetsTypicalUniversityMinimum: testScore >= 30,
    status: E.getResultStatus(testScore),
  });
};

E.getGrowthPotential = function getGrowthPotential(sections, mistakes, primaryScore) {
  var sectionMax = E.EXAM_SCORING_CONFIG.sections;
  var lostAuto =
    sectionMax.listening -
    E.clamp(sections.listening, 0, sectionMax.listening) +
    (sectionMax.reading - E.clamp(sections.reading, 0, sectionMax.reading)) +
    (sectionMax.useOfEnglish -
      E.clamp(sections.useOfEnglish, 0, sectionMax.useOfEnglish));
  var recoverablePrimary = Math.max(0, lostAuto);
  var testNow = E.convertToTestScore(primaryScore);
  var testPotential = E.convertToTestScore(primaryScore + recoverablePrimary);
  return {
    recoverablePrimary: recoverablePrimary,
    potentialTestGain: Math.max(0, testPotential - testNow),
  };
};

E.examSectionKeyFromNum = function examSectionKeyFromNum(examNum) {
  if (examNum == null || examNum < 1) return "";
  if (examNum <= 9) return "listening";
  if (examNum <= 18) return "reading";
  if (examNum <= 36) return "useOfEnglish";
  if (examNum <= 38) return "writing";
  if (examNum <= 42) return "speaking";
  return "";
};

E.speakingStorageKey = function speakingStorageKey(examNum, variantKey) {
  return "ege-prep:speaking-" + examNum + ":" + String(variantKey || "demo");
};

E.loadSpeakingScore = function loadSpeakingScore(examNum, variantKey) {
  var cfg = E.EXAM_SCORING_CONFIG.speaking[examNum];
  if (!cfg) return 0;
  try {
    var raw = sessionStorage.getItem(E.speakingStorageKey(examNum, variantKey));
    if (raw == null || raw === "") return 0;
    return E.clamp(raw, 0, cfg.maxScore);
  } catch (_err) {
    return 0;
  }
};

E.saveSpeakingScore = function saveSpeakingScore(examNum, variantKey, value) {
  var cfg = E.EXAM_SCORING_CONFIG.speaking[examNum];
  if (!cfg) return;
  try {
    sessionStorage.setItem(
      E.speakingStorageKey(examNum, variantKey),
      String(E.clamp(value, 0, cfg.maxScore))
    );
  } catch (_err) {
    /* ignore */
  }
};

E.getWritingDraftText = function getWritingDraftText(task) {
  if (!task) return "";
  var textarea = document.getElementById("writing-draft-" + task.id);
  if (textarea && E.normalize(textarea.value)) return textarea.value;
  var choiceId = task.choices ? E.getWriting38Choice(task) : "";
  return E.loadWritingDraft(task.id, choiceId || undefined);
};

E.isWritingRubricComplete = function isWritingRubricComplete(task) {
  if (!task || !task.rubric || !task.rubric.length) return false;
  return task.rubric.every(function (criterion) {
    var saved = E.loadWritingRubric(task.id);
    return saved[criterion.id] != null && saved[criterion.id] !== "";
  });
};

E.buildWritingEvaluation = function buildWritingEvaluation(task) {
  var examNum = task.examNum || E.taskExamFrom(task);
  var text = E.getWritingDraftText(task);
  var wordCount = E.countWritingWords(text);
  var isBlank = !E.normalize(text);
  var rubric = E.loadWritingRubric(task.id);
  var criteria = {};
  var rubricComplete = false;

  if (task.rubric && task.rubric.length) {
    rubricComplete = E.isWritingRubricComplete(task);
    if (rubricComplete) {
      task.rubric.forEach(function (criterion) {
        criteria[criterion.id] = Number(rubric[criterion.id]) || 0;
      });
    }
  }

  var evaluation = {
    taskId: examNum,
    text: text,
    wordCount: wordCount,
    criteria: criteria,
    isBlank: isBlank,
    isOffTopic: false,
    rubricComplete: rubricComplete,
    pendingReview: !isBlank && !rubricComplete,
  };

  if (task.rubric && task.rubric.length && rubricComplete) {
    task.rubric.forEach(function (criterion) {
      if (criterion.zeroAll && criteria[criterion.id] === 0) {
        evaluation.isOffTopic = true;
      }
    });
  }

  var manual =
    typeof E.loadWritingScore === "function"
      ? E.loadWritingScore(examNum, E.state.examTimerKey)
      : 0;
  var scored =
    examNum === 37
      ? E.scoreWriting37(evaluation)
      : E.scoreWriting38(evaluation);

  if (!rubricComplete && manual > 0) scored = manual;
  if (!rubricComplete && manual <= 0 && !isBlank) scored = 0;

  evaluation.score = scored;
  return evaluation;
};

E.buildSpeakingEvaluation = function buildSpeakingEvaluation() {
  var evals = {};
  var variantKey = E.state.examTimerKey;
  var total = 0;

  (E.state.topic.tasks || []).forEach(function (task) {
    if (!E.isOralTask(task)) return;
    var examNum = E.taskExamFrom(task);
    var cfg = E.EXAM_SCORING_CONFIG.speaking[examNum];
    if (!cfg) return;

    var hasAudio =
      E.isSpeakingMarkedComplete(task.id) ||
      !!(E.state.speakingTimerTouched && E.state.speakingTimerTouched[task.id]);
    var manual = E.loadSpeakingScore(examNum, variantKey);
    var score = hasAudio ? manual : 0;

    evals["task" + (examNum - 38)] = {
      maxScore: cfg.maxScore,
      score: score,
      hasAudio: hasAudio,
      pendingReview: hasAudio && manual <= 0,
    };
    total += hasAudio ? E.clamp(score, 0, cfg.maxScore) : 0;
  });

  return { tasks: evals, total: total };
};

E.collectAutoSectionScores = function collectAutoSectionScores() {
  if (typeof E.finalizePlacementExam === "function") E.finalizePlacementExam();
  var written = E.calculateWrittenScore(E.collectWrittenResults());
  return {
    listening: written.listening,
    reading: written.reading,
    useOfEnglish: written.grammar,
    writing37: written.writing37,
    writing38: written.writing38,
  };
};

E.buildExamSectionInputs = function buildExamSectionInputs() {
  var emptyInputs = {
    listening: 0,
    reading: 0,
    useOfEnglish: 0,
    writing: 0,
    speaking: 0,
    writing37: 0,
    writing38: 0,
    speakingEval: { tasks: {}, total: 0 },
  };
  if (!E.state.topic || !E.state.topic.tasks) return emptyInputs;

  var auto = E.collectAutoSectionScores();
  var writing37 = auto.writing37;
  var writing38 = auto.writing38;

  (E.state.topic.tasks || []).forEach(function (task) {
    if (task.type !== "writing") return;
    var ev = E.buildWritingEvaluation(task);
    if (task.examNum === 37 || E.taskExamFrom(task) === 37) writing37 = ev.score;
    if (task.examNum === 38 || E.taskExamFrom(task) === 38) writing38 = ev.score;
  });

  var speakingEval = E.buildSpeakingEvaluation();
  return {
    listening: auto.listening,
    reading: auto.reading,
    useOfEnglish: auto.useOfEnglish,
    writing: writing37 + writing38,
    speaking: speakingEval.total,
    writing37: writing37,
    writing38: writing38,
    speakingEval: speakingEval,
  };
};

E.calculateExamResultFromStateWithInputs = function calculateExamResultFromStateWithInputs() {
  var inputs = E.buildExamSectionInputs();
  return {
    inputs: inputs,
    result: E.calculateExamResult({
      listening: inputs.listening,
      reading: inputs.reading,
      useOfEnglish: inputs.useOfEnglish,
      writing: inputs.writing,
      speaking: inputs.speaking,
    }),
  };
};

E.calculateExamResultFromState = function calculateExamResultFromState() {
  return E.calculateExamResultFromStateWithInputs().result;
};

E.hasOralPendingReview = function hasOralPendingReview() {
  if (!E.state.topic || !E.state.topic.tasks) return false;
  var inputs = E.buildExamSectionInputs();
  var tasks = inputs.speakingEval.tasks || {};
  return Object.keys(tasks).some(function (key) {
    var item = tasks[key];
    return item.pendingReview || !item.hasAudio;
  });
};
