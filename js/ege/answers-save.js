import { E } from "./runtime.js";

var ANSWERS_STORE_KEY = "ege-prep.saved-answers.v2";
var AUTOSAVE_DEBOUNCE_MS = 400;
var autosaveTimer = 0;
var autosaveBound = false;

E.answersSaveVariantKey = function answersSaveVariantKey() {
  if (E.state.examTimerKey) return String(E.state.examTimerKey);
  var topicId = String(E.state.topicId || "");
  if (topicId.indexOf("variant:") === 0) return topicId.slice("variant:".length);
  return topicId || "demo";
};

E.shouldAutosave = function shouldAutosave() {
  return (
    typeof E.isFullWrittenExam === "function" &&
    E.isFullWrittenExam() &&
    typeof E.isWrittenSubmitted === "function" &&
    !E.isWrittenSubmitted() &&
    (E.isWrittenActive() || E.getExamPhase() === E.EXAM_PHASES.WRITTEN_READY)
  );
};

E.loadAnswersSaveStore = function loadAnswersSaveStore() {
  try {
    var raw = localStorage.getItem(ANSWERS_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_err) {
    return {};
  }
};

E.persistAnswersSaveStore = function persistAnswersSaveStore(store) {
  try {
    localStorage.setItem(ANSWERS_STORE_KEY, JSON.stringify(store));
  } catch (_err) {
    /* ignore quota / private mode */
  }
};

E.getSavedTaskAnswers = function getSavedTaskAnswers(taskId) {
  var store = E.loadAnswersSaveStore();
  var key = E.answersSaveVariantKey();
  var bucket = store[key];
  return bucket && bucket.tasks ? bucket.tasks[taskId] || null : null;
};

E.getTaskRadioAnswer = function getTaskRadioAnswer(taskId, name) {
  var live = E.getCheckedValue(name);
  if (live) return live;
  var saved = E.getSavedTaskAnswers(taskId);
  return saved && saved.radios ? saved.radios[name] || "" : "";
};

E.getTaskTextAnswer = function getTaskTextAnswer(taskId, fieldId) {
  var input = document.getElementById(fieldId);
  if (input && E.normalize(input.value)) return input.value;
  var saved = E.getSavedTaskAnswers(taskId);
  return saved && saved.text ? saved.text[fieldId] || "" : "";
};

E.getTaskSelectAnswer = function getTaskSelectAnswer(taskId, fieldId) {
  var select = document.getElementById(fieldId);
  if (select && select.value) return select.value;
  var saved = E.getSavedTaskAnswers(taskId);
  return saved && saved.selects ? saved.selects[fieldId] || "" : "";
};

E.serializeVariantAnswers = function serializeVariantAnswers() {
  if (!E.state.topic || !E.state.topic.tasks) return null;
  var tasks = {};
  var meta = {
    activeTaskId: E.state.activeTaskId || "",
    examPhase: E.getExamPhase ? E.getExamPhase() : "",
    writing38Choice: E.state.writing38Choice || "",
  };

  E.state.topic.tasks.forEach(function (task) {
    if (E.isOralTask && E.isOralTask(task)) return;
    var payload = E.serializeTaskAnswers(task.id);
    if (payload) tasks[task.id] = payload;
  });

  return { savedAt: Date.now(), tasks: tasks, meta: meta };
};

E.serializeTaskAnswers = function serializeTaskAnswers(taskId) {
  var taskEl = document.getElementById("task-" + taskId);
  if (!taskEl) return null;

  var radios = {};
  taskEl.querySelectorAll('input[type="radio"]:checked').forEach(function (radio) {
    if (radio.name) radios[radio.name] = radio.value;
  });

  var selects = {};
  taskEl.querySelectorAll("select").forEach(function (select) {
    if (select.id) selects[select.id] = select.value;
  });

  var text = {};
  taskEl.querySelectorAll("input[type='text'], textarea").forEach(function (input) {
    if (input.id) text[input.id] = input.value;
  });

  var prepGaps = {};
  taskEl.querySelectorAll(".ege-prep-gapfill__slot").forEach(function (slot) {
    if (slot.id) prepGaps[slot.id] = E.prepGapSlotValue(slot);
  });

  var meta = {};
  var task = E.findTask(taskId);
  if (task && task.type === "listening") {
    meta.listeningStep = E.getListeningStep(taskId);
    meta.prepMatchUnlocked = E.isPrepMatchingUnlocked(taskId);
    meta.prepMatchPassed = E.isPrepMatchPassed(taskId);
    meta.listeningGapsPassed = E.isListeningGapsPassed(taskId);
    meta.listeningMcPassed = E.isListeningMcPassed(taskId);
    meta.examMatchPassed = E.isListeningExamMatchPassed(taskId);
    meta.examTfnPassed = E.isListeningExamTfnPassed(taskId);
    meta.prepGapReview = !!taskEl.querySelector(".ege-prep-gapfill.is-review");
  }
  if (task && task.type === "writing" && task.examNum === 38) {
    meta.writing38Choice = E.state.writing38Choice || "";
    if (!E.state.writing38Drafts) E.state.writing38Drafts = {};
    var textarea38 = document.getElementById("writing-draft-" + taskId);
    var choice38 = E.getWriting38Choice ? E.getWriting38Choice(task) : "";
    if (textarea38 && choice38) E.state.writing38Drafts[choice38] = textarea38.value;
    if (E.state.writing38Drafts) meta.writing38Drafts = E.state.writing38Drafts;
  }

  return {
    savedAt: Date.now(),
    radios: radios,
    selects: selects,
    text: text,
    prepGaps: prepGaps,
    meta: meta,
  };
};

E.applyTaskAnswers = function applyTaskAnswers(taskId, payload) {
  if (!payload) return;
  var task = E.findTask(taskId);
  var taskEl = document.getElementById("task-" + taskId);
  if (!task || !taskEl) return;

  var radios = Object.assign({}, payload.radios || {});
  if (task.type === "listening" && task.examMc && typeof E.migrateListeningExamMcAnswers === "function") {
    radios = E.migrateListeningExamMcAnswers(task, radios) || radios;
  }

  Object.keys(radios).forEach(function (name) {
    E.setRadioValue(name, radios[name]);
  });

  Object.keys(payload.selects || {}).forEach(function (id) {
    var select = document.getElementById(id);
    if (select) {
      select.value = payload.selects[id];
      return;
    }
    if (/_em_[A-G]$/.test(id) || /_em_[A-Z]$/.test(id)) {
      E.setRadioValue(id, payload.selects[id]);
    }
  });

  Object.keys(payload.text || {}).forEach(function (id) {
    var input = document.getElementById(id);
    if (input) input.value = payload.text[id];
  });

  Object.keys(payload.prepGaps || {}).forEach(function (id) {
    var slot = document.getElementById(id);
    if (slot) E.setPrepGapSlotValue(slot, payload.prepGaps[id]);
  });

  taskEl.querySelectorAll('input[type="radio"]:checked').forEach(function (radio) {
    radio.dispatchEvent(new Event("change", { bubbles: true }));
  });

  if (task.type === "wordform" && task.items) {
    task.items.forEach(function (item, index) {
      E.syncWordformMarkFromInput(taskId, index, item.word || "");
    });
    if (typeof E.syncWordformPanelUI === "function") E.syncWordformPanelUI(taskId);
  }

  if (task.type === "writing") {
    E.syncWritingWordCount(taskId);
    if (task.examNum === 38 && typeof E.syncWriting38Workspace === "function") {
      E.syncWriting38Workspace(taskId);
    }
  }

  if (task.type === "listening" && payload.meta) {
    var meta = payload.meta;
    if (meta.prepMatchUnlocked) E.setPrepMatchingUnlocked(taskId, true);
    if (meta.prepMatchPassed) E.setPrepMatchPassed(taskId, true);
    if (meta.listeningGapsPassed) E.setListeningGapsPassed(taskId, true);
    if (meta.listeningMcPassed) E.setListeningMcPassed(taskId, true);
    if (meta.examMatchPassed) E.setListeningExamMatchPassed(taskId, true);
    if (meta.examTfnPassed) E.setListeningExamTfnPassed(taskId, true);
    if (meta.prepGapReview && typeof E.setPrepGapReviewMode === "function") {
      E.setPrepGapReviewMode(taskId, true);
    }
    if (meta.listeningStep) E.setListeningStep(taskId, meta.listeningStep);
    E.syncListeningStepUI(taskId);
    E.syncListeningPrepVisibility(taskId);
    E.syncListeningPrepFooterUI(taskId);
    E.syncListeningPrepGapInstructionUI(taskId);
    E.syncListeningProgressUI(taskId);
    E.syncListeningGapsFooterUI(taskId);
    E.syncListeningMcFooterUI(taskId);
    if (typeof E.syncListeningExamMatchFooterUI === "function") {
      E.syncListeningExamMatchFooterUI(taskId);
    }
    if (task.examMatch) {
      var matchWrap = document.querySelector("#task-" + taskId + " .ege-listening-exam-match");
      if (matchWrap && typeof E.syncListeningExamMatchTable === "function") {
        E.syncListeningExamMatchTable(matchWrap);
      }
    }
    if (task.examTfn) {
      var tfnWrap = document.querySelector("#task-" + taskId + " .ege-listening-exam-tfn");
      if (tfnWrap && typeof E.syncListeningExamTfnRows === "function") {
        E.syncListeningExamTfnRows(tfnWrap);
      }
    }
    if (typeof E.syncListeningExamTfnFooterUI === "function") {
      E.syncListeningExamTfnFooterUI(taskId);
    }
  }

  if (task.type === "writing" && task.examNum === 38 && payload.meta) {
    if (payload.meta.writing38Choice) E.state.writing38Choice = payload.meta.writing38Choice;
    if (payload.meta.writing38Drafts) E.state.writing38Drafts = payload.meta.writing38Drafts;
    if (typeof E.syncWriting38ChoiceUI === "function") E.syncWriting38ChoiceUI(taskId);
  }

  if (typeof E.updateAnsweredCount === "function") E.updateAnsweredCount(taskId);
};

E.flushAutosave = function flushAutosave() {
  if (autosaveTimer) {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = 0;
  }
  if (!E.shouldAutosave()) return;
  var variantKey = E.answersSaveVariantKey();
  var snapshot = E.serializeVariantAnswers();
  if (!snapshot) return;
  var store = E.loadAnswersSaveStore();
  store[variantKey] = snapshot;
  E.persistAnswersSaveStore(store);
  if (typeof E.syncFinishWrittenButton === "function") E.syncFinishWrittenButton();
};

E.cancelAutosave = function cancelAutosave() {
  if (!autosaveTimer) return;
  window.clearTimeout(autosaveTimer);
  autosaveTimer = 0;
};

E.scheduleAutosave = function scheduleAutosave() {
  if (!E.shouldAutosave()) return;
  if (autosaveTimer) window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(function () {
    autosaveTimer = 0;
    E.flushAutosave();
  }, AUTOSAVE_DEBOUNCE_MS);
};

E.bindAutosave = function bindAutosave() {
  if (autosaveBound) return;
  autosaveBound = true;

  document.addEventListener(
    "input",
    function (event) {
      if (!E.shouldAutosave()) return;
      var target = event.target;
      if (!target || !target.closest(".ege-task")) return;
      E.scheduleAutosave();
      if (typeof E.syncFinishWrittenButton === "function") E.syncFinishWrittenButton();
    },
    true
  );

  document.addEventListener(
    "change",
    function (event) {
      if (!E.shouldAutosave()) return;
      var target = event.target;
      if (!target || !target.closest(".ege-task")) return;
      E.scheduleAutosave();
      if (typeof E.syncFinishWrittenButton === "function") E.syncFinishWrittenButton();
    },
    true
  );

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") E.flushAutosave();
  });
};

E.restoreVariantSavedAnswers = function restoreVariantSavedAnswers() {
  if (!E.state.topic || !E.state.topic.tasks) return;
  var variantKey = E.answersSaveVariantKey();
  var saved = E.loadAnswersSaveStore()[variantKey];
  if (!saved) return;

  var tasks = saved.tasks || saved;
  if (saved.meta) {
    if (saved.meta.writing38Choice) E.state.writing38Choice = saved.meta.writing38Choice;
    if (saved.meta.writing38Drafts) E.state.writing38Drafts = saved.meta.writing38Drafts;
    if (saved.meta.examPhase && E.persistExamPhase) {
      /* phase restored separately in initExamPhase */
    }
  }

  if (saved.tasks) {
    Object.keys(saved.tasks).forEach(function (taskId) {
      E.applyTaskAnswers(taskId, saved.tasks[taskId]);
    });
  } else {
    Object.keys(tasks).forEach(function (taskId) {
      if (taskId === "savedAt" || taskId === "meta") return;
      E.applyTaskAnswers(taskId, tasks[taskId]);
    });
  }

  if (E.isWrittenSubmitted && E.isWrittenSubmitted()) {
    E.writtenExamTasks().forEach(function (task) {
      E.lockTaskInputs(task.id);
    });
  }

  if (typeof E.syncFinishWrittenButton === "function") E.syncFinishWrittenButton();
};

E.isTaskLocked = function isTaskLocked(taskId) {
  var taskEl = document.getElementById("task-" + taskId);
  return !!(taskEl && taskEl.dataset.answersLocked === "1");
};

E.lockTaskInputs = function lockTaskInputs(taskId) {
  var taskEl = document.getElementById("task-" + taskId);
  if (!taskEl) return;
  taskEl.dataset.answersLocked = "1";
  taskEl.classList.add("is-answers-locked");

  taskEl.querySelectorAll("input, textarea, select, button.ege-pill").forEach(function (el) {
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "button" && !el.classList.contains("ege-pill")) return;
    if (el.type === "button" || el.type === "submit") return;
    el.disabled = true;
    el.setAttribute("aria-disabled", "true");
  });

  taskEl.querySelectorAll(".ege-ref__list--pickable li").forEach(function (li) {
    li.setAttribute("aria-disabled", "true");
    li.style.pointerEvents = "none";
  });

  taskEl.querySelectorAll(".ege-text-block[role='button'], .ege-gap-insert, .ege-answer-track__cell").forEach(
    function (el) {
      el.setAttribute("aria-disabled", "true");
      el.style.pointerEvents = "none";
    }
  );
};

/* Legacy no-ops — removed Save/Edit UI */
E.shouldOfferAnswerSave = function shouldOfferAnswerSave() {
  return false;
};
E.appendSaveAnswersAction = function appendSaveAnswersAction() {};
E.syncSaveAnswersButton = function syncSaveAnswersButton() {};
E.syncNavSavedStatus = function syncNavSavedStatus() {};
E.saveTaskAnswers = function saveTaskAnswers() {
  return false;
};
E.isTaskAnswersSaved = function isTaskAnswersSaved() {
  return false;
};
E.lockTaskAnswers = function lockTaskAnswers(taskId) {
  E.lockTaskInputs(taskId);
};

E.unlockTaskInputs = function unlockTaskInputs(taskId) {
  var taskEl = document.getElementById("task-" + taskId);
  if (!taskEl) return;
  delete taskEl.dataset.answersLocked;
  taskEl.classList.remove("is-answers-locked");

  taskEl.querySelectorAll("input, textarea, select").forEach(function (el) {
    el.disabled = false;
    el.removeAttribute("aria-disabled");
  });

  taskEl.querySelectorAll(".ege-ref__list--pickable li").forEach(function (li) {
    li.removeAttribute("aria-disabled");
    li.style.removeProperty("pointer-events");
  });

  taskEl.querySelectorAll(
    ".ege-text-block[role='button'], .ege-gap-insert, .ege-answer-track__cell"
  ).forEach(function (el) {
    el.removeAttribute("aria-disabled");
    el.style.removeProperty("pointer-events");
  });
};

E.unlockTaskAnswers = function unlockTaskAnswers(taskId) {
  if (taskId) {
    E.unlockTaskInputs(taskId);
    return;
  }
  if (!E.state.topic || !E.state.topic.tasks) return;
  E.state.topic.tasks.forEach(function (task) {
    E.unlockTaskInputs(task.id);
  });
};

E.clearVariantSavedAnswers = function clearVariantSavedAnswers() {
  if (typeof E.cancelAutosave === "function") E.cancelAutosave();
  var variantKey = E.answersSaveVariantKey();
  var store = E.loadAnswersSaveStore();
  if (!store[variantKey]) return;
  delete store[variantKey];
  E.persistAnswersSaveStore(store);
};

E.clearExamTimerSession = function clearExamTimerSession() {
  var key = E.state.examTimerKey || E.answersSaveVariantKey();
  if (!key) return;
  try {
    sessionStorage.removeItem(E.examTimerStorageKey(key));
  } catch (_err) {
    /* ignore */
  }
};

E.clearVariantSessionData = function clearVariantSessionData() {
  var variantKey = E.answersSaveVariantKey();
  if (!E.state.topic || !E.state.topic.tasks) return;

  E.state.topic.tasks.forEach(function (task) {
    try {
      if (typeof E.listeningNotesKey === "function") {
        sessionStorage.removeItem(E.listeningNotesKey(task.id));
      }
      if (task.type === "writing") {
        if (typeof E.writingRubricKey === "function") {
          sessionStorage.removeItem(E.writingRubricKey(task.id));
        }
        if (task.choices && task.choices.length) {
          task.choices.forEach(function (choice) {
            if (typeof E.writingDraftKey === "function") {
              sessionStorage.removeItem(E.writingDraftKey(task.id, choice.id));
            }
          });
        } else if (typeof E.writingDraftKey === "function") {
          sessionStorage.removeItem(E.writingDraftKey(task.id, ""));
        }
      }
      if (typeof E.isOralTask === "function" && E.isOralTask(task)) {
        var oralNum = task.examNum || task.num;
        if (oralNum && typeof E.speakingStorageKey === "function") {
          sessionStorage.removeItem(E.speakingStorageKey(oralNum, variantKey));
        }
      }
      var writtenNum = task.examNum || task.num;
      if (writtenNum && typeof E.writingStorageKey === "function") {
        sessionStorage.removeItem(E.writingStorageKey(writtenNum, variantKey));
      }
    } catch (_err) {
      /* ignore */
    }
  });
};
