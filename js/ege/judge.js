import { E } from "./runtime.js";

/* "judge" tasks drill one skill: holding a candidate sentence against a
   criterion and deciding whether an examiner would accept it. The same shape
   covers task 37 (is this a valid question about the trigger sentence?) and
   task 38 (does this sentence report the table accurately?) -- only the two
   pill labels change, so they come from the task data. */

E.JUDGE_YES = "1";
E.JUDGE_NO = "2";

E.judgeItemName = function judgeItemName(taskId, itemId) {
  return E.taskPrefix(taskId) + "_judge_" + itemId;
};

E.judgeExpectedValue = function judgeExpectedValue(item) {
  return item.correct ? E.JUDGE_YES : E.JUDGE_NO;
};

E.judgeLabels = function judgeLabels(task) {
  var labels = (task && task.labels) || {};
  return [labels.yes || "Valid", labels.no || "Invalid"];
};

/* A pill can read as a bare tick or cross, which says nothing out loud and
   nothing useful in the score breakdown -- those fall back to the spoken
   names when the data supplies them. */
E.judgeAriaLabels = function judgeAriaLabels(task) {
  var labels = (task && task.labels) || {};
  var shown = E.judgeLabels(task);
  return [labels.yesAria || shown[0], labels.noAria || shown[1]];
};

E.getJudgeCard = function getJudgeCard(taskId, itemId) {
  return document.querySelector(
    "#task-" + taskId + ' .ege-judge__item[data-item-id="' + itemId + '"]'
  );
};

E.allJudgeAnswered = function allJudgeAnswered(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "judge") return false;
  return (task.items || []).every(function (item) {
    return !!E.getCheckedValue(E.judgeItemName(taskId, item.id));
  });
};

E.judgeAnsweredCount = function judgeAnsweredCount(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "judge") return 0;
  return (task.items || []).filter(function (item) {
    return !!E.getCheckedValue(E.judgeItemName(taskId, item.id));
  }).length;
};

/* The progress line reports how many are classified, not how many are
   "invalid" -- the source trainers hardcoded a target count, which drifted
   out of step with their own data. */
E.syncJudgeProgress = function syncJudgeProgress(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "judge") return;
  var counter = document.querySelector("#task-" + taskId + " .ege-judge__progress");
  if (!counter) return;
  var total = (task.items || []).length;
  counter.textContent = E.judgeAnsweredCount(taskId) + " / " + total + " classified";
};

E.syncJudgeCheckEnabled = function syncJudgeCheckEnabled(taskId) {
  E.syncJudgeProgress(taskId);
  E.syncCheckButton(taskId);
  E.syncResetButton(taskId);
  E.syncShowAnswersButton(taskId);
};

E.setJudgeItemFeedback = function setJudgeItemFeedback(taskId, item, state) {
  var card = E.getJudgeCard(taskId, item.id);
  if (!card) return;
  card.classList.remove("is-correct", "is-wrong", "is-revealed");
  if (state === "correct") card.classList.add("is-correct");
  else if (state === "wrong") card.classList.add("is-wrong");
  else if (state === "revealed") card.classList.add("is-revealed");

  var note = card.querySelector(".ege-judge__feedback");
  if (!note) return;
  note.hidden = !state;
  note.textContent = state ? item.feedback || "" : "";
};

E.clearJudgeItemFeedback = function clearJudgeItemFeedback(taskId, itemId) {
  var card = E.getJudgeCard(taskId, itemId);
  if (!card) return;
  card.classList.remove("is-correct", "is-wrong", "is-revealed");
  var note = card.querySelector(".ege-judge__feedback");
  if (note) {
    note.hidden = true;
    note.textContent = "";
  }
};


E.renderJudge = function renderJudge(task, topicId) {
  var max = E.taskMaxScore(task);
  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--judge");

  var tools = document.createElement("div");
  tools.className = "ege-skills-tools";
  if (typeof E.buildListeningNotesToggle === "function") {
    tools.appendChild(E.buildListeningNotesToggle(task.id));
  }
  wrap.appendChild(tools);

  var read = document.createElement("div");
  read.className = "ege-passage ege-judge__context";
  if (task.contextTitle) {
    var meta = document.createElement("p");
    meta.className = "ege-judge__context-meta";
    meta.textContent = task.contextTitle;
    read.appendChild(meta);
  }
  if (task.contextHtml) {
    var body = document.createElement("div");
    body.className = "ege-judge__context-body";
    body.innerHTML = task.contextHtml;
    read.appendChild(body);
  }
  if (task.chart && typeof E.buildSurveyChart === "function") {
    var chart = E.buildSurveyChart(task.chart);
    if (chart) read.appendChild(chart);
  }

  var work = document.createElement("div");
  work.className = "ege-judge__list";

  // Nothing is answered at build time and the node is not in the document
  // yet, so seed the text here; syncJudgeProgress takes over from the first
  // change event onwards.
  var progress = document.createElement("p");
  progress.className = "ege-judge__progress";
  progress.textContent = "0 / " + (task.items || []).length + " classified";
  work.appendChild(progress);

  var labels = E.judgeLabels(task);
  var aria = E.judgeAriaLabels(task);

  (task.items || []).forEach(function (item, index) {
    var card = document.createElement("div");
    card.className = "ege-judge__item";
    card.dataset.itemId = item.id;

    var head = document.createElement("p");
    head.className = "ege-judge__text";
    var num = document.createElement("span");
    num.className = "ege-exam-num";
    num.textContent = index + 1 + ".";
    head.appendChild(num);
    head.appendChild(document.createTextNode(" " + item.text));
    card.appendChild(head);

    var name = E.judgeItemName(task.id, item.id);
    var group = E.buildChoiceGroup(name, 2, {
      text: labels,
      label: aria[0] + " or " + aria[1] + " — item " + (index + 1),
    });
    group.addEventListener("change", function () {
      E.clearJudgeItemFeedback(task.id, item.id);
      E.hideScoreFeedback(task.id);
      E.syncJudgeCheckEnabled(task.id);
    });
    card.appendChild(group);

    // Populated on check. The item's `tag` names the trap for authoring; it
    // is not rendered, because on screen it would sit under exactly the
    // invalid items and hand over the answer.
    var note = document.createElement("p");
    note.className = "ege-judge__feedback";
    note.hidden = true;
    card.appendChild(note);

    work.appendChild(card);
  });

  if (task.chart) {
    wrap.appendChild(
      E.buildLongreadSplit(read, work, { workLabelKind: "questions" })
    );
  } else {
    // Without a chart the context is a single quoted sentence, so a reading
    // column beside the questions would be mostly empty. Stack instead: the
    // quote hugs its own text and the questions run full width below it.
    var stack = document.createElement("div");
    stack.className = "ege-stack";
    stack.appendChild(E.buildPanel("", read, "ege-panel--read ege-panel--quote"));
    stack.appendChild(E.buildWorkPanel("questions", work, "ege-panel--work ege-panel--solo"));
    wrap.appendChild(stack);
  }
  wrap.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));
  return wrap;
};
