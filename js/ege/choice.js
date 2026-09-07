import { E } from "./runtime.js";

/* "choice" tasks drill the other half of the writing skills: given a stem --
   a pen-friend's question, or an essay sentence with a blank -- pick the one
   option that works. Every option carries its own feedback, so a wrong pick
   explains the error rather than just marking it. */

E.choiceQuestionName = function choiceQuestionName(taskId, questionId) {
  return E.taskPrefix(taskId) + "_choice_" + questionId;
};

E.choiceCorrectIndex = function choiceCorrectIndex(question) {
  var options = (question && question.options) || [];
  for (var i = 0; i < options.length; i += 1) {
    if (options[i].correct) return i;
  }
  return -1;
};

E.choiceExpectedValue = function choiceExpectedValue(question) {
  var index = E.choiceCorrectIndex(question);
  return index < 0 ? "" : String(index + 1);
};

E.getChoiceCard = function getChoiceCard(taskId, questionId) {
  return document.querySelector(
    "#task-" + taskId + ' .ege-choice__item[data-question-id="' + questionId + '"]'
  );
};

E.allChoiceAnswered = function allChoiceAnswered(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "choice") return false;
  return (task.questions || []).every(function (question) {
    return !!E.getCheckedValue(E.choiceQuestionName(taskId, question.id));
  });
};

E.choiceAnsweredCount = function choiceAnsweredCount(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "choice") return 0;
  return (task.questions || []).filter(function (question) {
    return !!E.getCheckedValue(E.choiceQuestionName(taskId, question.id));
  }).length;
};

E.syncChoiceProgress = function syncChoiceProgress(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "choice") return;
  var counter = document.querySelector("#task-" + taskId + " .ege-choice__progress");
  if (!counter) return;
  counter.textContent =
    E.choiceAnsweredCount(taskId) + " / " + (task.questions || []).length + " answered";
};

E.syncChoiceCheckEnabled = function syncChoiceCheckEnabled(taskId) {
  E.syncChoiceProgress(taskId);
  E.syncCheckButton(taskId);
  E.syncResetButton(taskId);
  E.syncShowAnswersButton(taskId);
};

/* Feedback belongs to the option that was picked, plus the correct one when
   the pick was wrong -- so the student sees both why theirs fails and why the
   answer works. */
E.markChoiceQuestion = function markChoiceQuestion(taskId, question, value, revealed) {
  var card = E.getChoiceCard(taskId, question.id);
  if (!card) return;
  var correctIndex = E.choiceCorrectIndex(question);
  var pickedIndex = value ? Number(value) - 1 : -1;
  var ok = pickedIndex === correctIndex;

  card.classList.remove("is-correct", "is-wrong", "is-revealed");
  if (revealed) card.classList.add("is-revealed");
  else if (ok) card.classList.add("is-correct");
  else if (pickedIndex >= 0) card.classList.add("is-wrong");

  card.querySelectorAll(".ege-choice__feedback").forEach(function (note, index) {
    var show = index === pickedIndex || (!ok && index === correctIndex);
    note.hidden = !show;
    note.classList.toggle("is-correct", !revealed && index === correctIndex);
    note.classList.toggle("is-revealed", !!revealed && index === correctIndex);
  });
};

E.clearChoiceQuestion = function clearChoiceQuestion(taskId, questionId) {
  var card = E.getChoiceCard(taskId, questionId);
  if (!card) return;
  card.classList.remove("is-correct", "is-wrong", "is-revealed");
  card.querySelectorAll(".ege-choice__feedback").forEach(function (note) {
    note.hidden = true;
    note.classList.remove("is-correct", "is-revealed");
  });
};


E.renderChoice = function renderChoice(task, topicId) {
  var max = E.taskMaxScore(task);
  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--choice");

  var tools = document.createElement("div");
  tools.className = "ege-skills-tools";
  if (typeof E.buildListeningNotesToggle === "function") {
    tools.appendChild(E.buildListeningNotesToggle(task.id));
  }
  wrap.appendChild(tools);

  var read = document.createElement("div");
  read.className = "ege-passage ege-choice__context";
  if (task.contextTitle) {
    var meta = document.createElement("p");
    meta.className = "ege-choice__context-meta";
    meta.textContent = task.contextTitle;
    read.appendChild(meta);
  }
  if (task.contextHtml) {
    var body = document.createElement("div");
    body.innerHTML = task.contextHtml;
    read.appendChild(body);
  }
  var chart =
    task.chart && typeof E.buildSurveyChart === "function"
      ? E.buildSurveyChart(task.chart)
      : null;

  var work = document.createElement("div");
  work.className = "ege-choice__list";

  var progress = document.createElement("p");
  progress.className = "ege-choice__progress";
  progress.textContent = "0 / " + (task.questions || []).length + " answered";
  (task.questions || []).forEach(function (question, index) {
    var card = document.createElement("div");
    card.className = "ege-choice__item";
    card.dataset.questionId = question.id;

    var stem = document.createElement("p");
    stem.className = "ege-choice__stem";
    var num = document.createElement("span");
    num.className = "ege-exam-num";
    num.textContent = index + 1 + ".";
    stem.appendChild(num);
    stem.appendChild(document.createTextNode(" " + question.stem));
    card.appendChild(stem);

    var name = E.choiceQuestionName(task.id, question.id);
    var options = question.options || [];
    var group = E.buildChoiceGroup(name, options.length, {
      text: options.map(function (option) {
        return option.text;
      }),
      label: question.stem,
    });
    group.addEventListener("change", function () {
      E.clearChoiceQuestion(task.id, question.id);
      E.hideScoreFeedback(task.id);
      E.syncChoiceCheckEnabled(task.id);
    });
    card.appendChild(group);

    options.forEach(function (option) {
      var note = document.createElement("p");
      note.className = "ege-choice__feedback";
      note.textContent = option.feedback || "";
      note.hidden = true;
      card.appendChild(note);
    });

    work.appendChild(card);
  });
  // The count sits under the items: it reports on them, so it reads as a
  // footer rather than a heading.
  work.appendChild(progress);


  if (chart) {
    // The questions are the work, so they take the main column; the graph is
    // reference material and sits beside them.
    var main = document.createElement("div");
    main.className = "ege-choice__main";
    main.appendChild(read);
    main.appendChild(work);

    var side = document.createElement("div");
    side.className = "ege-skills-chart";
    side.appendChild(chart);

    // Even columns: the graph is unreadable squeezed into a side rail.
    wrap.appendChild(
      E.buildLongreadSplit(main, side, {
        workLabel: "Graph",
        splitClass: "ege-split--even",
      })
    );
  } else {
    // Without a chart the context is a short quote, so a reading column beside
    // the questions would be mostly empty. Stack, as the judge drills do.
    var stack = document.createElement("div");
    stack.className = "ege-stack";
    stack.appendChild(E.buildPanel("", read, "ege-panel--read ege-panel--quote"));
    stack.appendChild(E.buildWorkPanel("questions", work, "ege-panel--work ege-panel--solo"));
    wrap.appendChild(stack);
  }
  wrap.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));
  return wrap;
};
