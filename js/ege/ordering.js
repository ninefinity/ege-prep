import { E } from "./runtime.js";

/* "ordering" tasks drill task 37's answer paragraph. The paragraph itself is
   the work surface, the way gap-fill's passage is: positions start as numbered
   gaps and a placed sentence drops into the running text, so what the student
   reads back is the email rather than six boxes. Pick a sentence, then a gap;
   clicking a filled gap returns its sentence to the pool. Scoring is per
   position, so a sentence one place out still costs a point, which is the
   discourse skill being taught. */

var selection = {};

E.orderingState = function orderingState(taskId) {
  if (!selection[taskId]) selection[taskId] = { picked: "", slots: {} };
  return selection[taskId];
};

E.resetOrderingState = function resetOrderingState(taskId) {
  selection[taskId] = { picked: "", slots: {} };
};

E.orderingSlots = function orderingSlots(task) {
  var slots = [];
  ((task && task.groups) || []).forEach(function (group) {
    (group.slots || []).forEach(function (slot) {
      slots.push(slot);
    });
  });
  return slots;
};

E.orderingSentence = function orderingSentence(task, id) {
  return ((task && task.pool) || []).filter(function (item) {
    return item.id === id;
  })[0];
};

E.allOrderingPlaced = function allOrderingPlaced(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "ordering") return false;
  var placed = E.orderingState(taskId).slots;
  return E.orderingSlots(task).every(function (slot) {
    return !!placed[slot.id];
  });
};

E.syncOrderingBoard = function syncOrderingBoard(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "ordering") return;
  var taskEl = document.getElementById("task-" + taskId);
  if (!taskEl) return;
  var state = E.orderingState(taskId);
  var used = Object.keys(state.slots).map(function (slotId) {
    return state.slots[slotId];
  });

  taskEl.querySelectorAll(".ege-ordering__chip").forEach(function (chip) {
    var id = chip.dataset.sentenceId;
    chip.hidden = used.indexOf(id) !== -1;
    chip.classList.toggle("is-active", state.picked === id);
  });

  E.orderingSlots(task).forEach(function (slot, index) {
    var el = taskEl.querySelector('.ege-ordering__gap[data-slot-id="' + slot.id + '"]');
    if (!el) return;
    var sentence = E.orderingSentence(task, state.slots[slot.id]);
    var body = el.querySelector(".ege-ordering__gap-text");
    if (body) body.textContent = sentence ? sentence.text : "";
    el.classList.toggle("is-filled", !!sentence);
    el.setAttribute(
      "aria-label",
      sentence
        ? "Position " + (index + 1) + ": " + sentence.text + ". Press to take it back."
        : "Position " + (index + 1) + ", empty."
    );
  });

  var counter = taskEl.querySelector(".ege-ordering__progress");
  if (counter) {
    counter.textContent =
      used.length + " / " + E.orderingSlots(task).length + " placed";
  }
};

E.syncOrderingCheckEnabled = function syncOrderingCheckEnabled(taskId) {
  E.syncOrderingBoard(taskId);
  E.syncCheckButton(taskId);
  E.syncResetButton(taskId);
  E.syncShowAnswersButton(taskId);
};

E.pickOrderingSentence = function pickOrderingSentence(taskId, id) {
  var taskEl = document.getElementById("task-" + taskId);
  if (taskEl && taskEl.dataset.answersRevealed === "1") return;
  var state = E.orderingState(taskId);
  state.picked = state.picked === id ? "" : id;
  E.clearOrderingFeedback(taskId);
  E.hideScoreFeedback(taskId);
  E.syncOrderingCheckEnabled(taskId);
};

E.placeOrderingSlot = function placeOrderingSlot(taskId, slotId) {
  var taskEl = document.getElementById("task-" + taskId);
  if (taskEl && taskEl.dataset.answersRevealed === "1") return;
  var state = E.orderingState(taskId);

  if (state.picked) {
    // A sentence lives in one slot at a time.
    Object.keys(state.slots).forEach(function (key) {
      if (state.slots[key] === state.picked) delete state.slots[key];
    });
    state.slots[slotId] = state.picked;
    state.picked = "";
  } else if (state.slots[slotId]) {
    delete state.slots[slotId];
  }

  E.clearOrderingFeedback(taskId);
  E.hideScoreFeedback(taskId);
  E.syncOrderingCheckEnabled(taskId);
};

E.clearOrderingFeedback = function clearOrderingFeedback(taskId) {
  var taskEl = document.getElementById("task-" + taskId);
  if (!taskEl) return;
  taskEl.querySelectorAll(".ege-ordering__gap").forEach(function (el) {
    el.classList.remove("is-correct", "is-wrong", "is-revealed");
  });
};

E.markOrdering = function markOrdering(taskId, revealed) {
  var task = E.findTask(taskId);
  if (!task) return 0;
  var taskEl = document.getElementById("task-" + taskId);
  var state = E.orderingState(taskId);
  var correct = 0;

  E.orderingSlots(task).forEach(function (slot) {
    var placed = state.slots[slot.id];
    var expected = ((task.pool || []).filter(function (item) {
      return item.slot === slot.id;
    })[0] || {}).id;
    var ok = placed && placed === expected;
    if (ok) correct += 1;
    if (!taskEl) return;

    var el = taskEl.querySelector('.ege-ordering__gap[data-slot-id="' + slot.id + '"]');
    if (!el) return;
    el.classList.remove("is-correct", "is-wrong", "is-revealed");
    // Like gap-fill, a check marks each position without naming what belongs
    // there -- that is what Show answers is for.
    if (revealed) el.classList.add("is-revealed");
    else el.classList.add(ok ? "is-correct" : "is-wrong");
  });

  return correct;
};


E.renderOrdering = function renderOrdering(task, topicId) {
  var max = E.taskMaxScore(task);
  E.resetOrderingState(task.id);

  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--ordering");

  var tools = document.createElement("div");
  tools.className = "ege-skills-tools";
  if (typeof E.buildListeningNotesToggle === "function") {
    tools.appendChild(E.buildListeningNotesToggle(task.id));
  }
  wrap.appendChild(tools);

  // The reply being assembled is the centrepiece, so it takes the wide panel;
  // the sentences to place sit in the narrow one beside it.
  var read = document.createElement("div");
  read.className = "ege-ordering__reply";

  var context = document.createElement("div");
  context.className = "ege-passage ege-ordering__context";
  if (task.contextTitle) {
    var meta = document.createElement("p");
    meta.className = "ege-ordering__context-meta";
    meta.textContent = task.contextTitle;
    context.appendChild(meta);
  }
  if (task.contextHtml) {
    var body = document.createElement("div");
    body.innerHTML = task.contextHtml;
    context.appendChild(body);
  }
  read.appendChild(context);

  var pool = document.createElement("div");
  pool.className = "ege-ordering__pool";

  (task.pool || []).forEach(function (item) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ege-ordering__chip";
    chip.dataset.sentenceId = item.id;
    chip.textContent = item.text;
    chip.addEventListener("click", function () {
      E.pickOrderingSentence(task.id, item.id);
    });
    pool.appendChild(chip);
  });

  var work = document.createElement("div");
  work.className = "ege-ordering__work";

  var progress = document.createElement("p");
  progress.className = "ege-ordering__progress";
  progress.textContent = "0 / " + E.orderingSlots(task).length + " placed";
  work.appendChild(progress);

  // The email is the work surface: every position is a gap in the running
  // text, so placing a sentence writes it into the paragraph.
  if (task.preview) {
    var emailTitle = document.createElement("p");
    emailTitle.className = "ege-ordering__email-title";
    emailTitle.textContent = task.preview;
    work.appendChild(emailTitle);
  }

  var email = document.createElement("p");
  email.className = "ege-ordering__email";
  E.orderingSlots(task).forEach(function (slot, index) {
    if (index) email.appendChild(document.createTextNode(" "));

    var gap = document.createElement("span");
    gap.className = "ege-ordering__gap";
    gap.dataset.slotId = slot.id;
    gap.dataset.gap = String(index + 1);
    gap.setAttribute("role", "button");
    gap.setAttribute("aria-label", "Position " + (index + 1) + ", empty.");
    gap.tabIndex = 0;

    var text = document.createElement("span");
    text.className = "ege-ordering__gap-text";
    gap.appendChild(text);

    function place() {
      E.placeOrderingSlot(task.id, slot.id);
    }
    gap.addEventListener("click", place);
    gap.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      place();
    });

    email.appendChild(gap);
  });
  work.appendChild(email);

  read.appendChild(work);

  wrap.appendChild(E.buildLongreadSplit(read, pool, { workLabel: "Sentences" }));
  wrap.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));
  return wrap;
};
