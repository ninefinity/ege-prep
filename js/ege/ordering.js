import { E } from "./runtime.js";

/* "ordering" tasks drill task 37's answer paragraph: sentences start in a
   pool and go into numbered positions, and the assembled text is the point --
   a `preview` label turns on a panel that reads back what has been built so
   far. Slots may carry a `role` when the positions mean different things;
   without one they are simply numbered. Scoring is per position, so a
   sentence one place out still costs a point, which is the discourse skill
   being taught. */

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

  E.orderingSlots(task).forEach(function (slot) {
    var el = taskEl.querySelector('.ege-ordering__slot[data-slot-id="' + slot.id + '"]');
    if (!el) return;
    var sentence = E.orderingSentence(task, state.slots[slot.id]);
    var body = el.querySelector(".ege-ordering__slot-text");
    if (body) {
      body.textContent = sentence ? sentence.text : "Pick a sentence, then this slot";
      body.classList.toggle("is-empty", !sentence);
    }
    el.classList.toggle("is-filled", !!sentence);
  });

  var counter = taskEl.querySelector(".ege-ordering__progress");
  if (counter) {
    counter.textContent =
      used.length + " / " + E.orderingSlots(task).length + " placed";
  }

  var previewBody = taskEl.querySelector(".ege-ordering__preview-body");
  if (previewBody) {
    previewBody.textContent = "";
    E.orderingSlots(task).forEach(function (slot, index) {
      var sentence = E.orderingSentence(task, state.slots[slot.id]);
      if (index) previewBody.appendChild(document.createTextNode(" "));
      if (sentence) {
        previewBody.appendChild(document.createTextNode(sentence.text));
        return;
      }
      // An empty position reads as a gap rather than silently closing up.
      var gap = document.createElement("span");
      gap.className = "ege-ordering__preview-gap";
      gap.textContent = index + 1;
      previewBody.appendChild(gap);
    });
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
  taskEl.querySelectorAll(".ege-ordering__slot").forEach(function (el) {
    el.classList.remove("is-correct", "is-wrong", "is-revealed");
  });
  taskEl.querySelectorAll(".ege-ordering__feedback").forEach(function (note) {
    note.hidden = true;
    note.textContent = "";
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

    var el = taskEl.querySelector('.ege-ordering__slot[data-slot-id="' + slot.id + '"]');
    if (!el) return;
    el.classList.remove("is-correct", "is-wrong", "is-revealed");
    if (revealed) el.classList.add("is-revealed");
    else el.classList.add(ok ? "is-correct" : "is-wrong");

    var note = el.querySelector(".ege-ordering__feedback");
    if (!note) return;
    var right = E.orderingSentence(task, expected);
    note.hidden = false;
    note.textContent = ok || revealed
      ? (right && right.feedback) || ""
      : "This slot wants: " + ((right && right.text) || "");
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

  var slotNumber = 0;
  (task.groups || []).forEach(function (group, groupIndex) {
    var card = document.createElement("div");
    card.className = "ege-ordering__group";

    var head = document.createElement("p");
    head.className = "ege-ordering__group-title";
    var num = document.createElement("span");
    num.className = "ege-exam-num";
    num.textContent = groupIndex + 1 + ".";
    head.appendChild(num);
    head.appendChild(document.createTextNode(" " + group.title));
    card.appendChild(head);

    (group.slots || []).forEach(function (slot) {
      slotNumber += 1;
      var el = document.createElement("div");
      el.className = "ege-ordering__slot";
      el.dataset.slotId = slot.id;
      el.setAttribute("role", "button");
      el.tabIndex = 0;

      var role = document.createElement("span");
      role.className = "ege-ordering__slot-role";
      // A pure sequencing drill has no roles to name, so the position is the
      // only label the slot needs.
      role.textContent = slot.role || String(slotNumber);
      el.appendChild(role);

      var text = document.createElement("span");
      text.className = "ege-ordering__slot-text is-empty";
      text.textContent = "Pick a sentence, then this slot";
      el.appendChild(text);

      var note = document.createElement("p");
      note.className = "ege-ordering__feedback";
      note.hidden = true;
      el.appendChild(note);

      function place() {
        E.placeOrderingSlot(task.id, slot.id);
      }
      el.addEventListener("click", place);
      el.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        place();
      });

      card.appendChild(el);
    });

    work.appendChild(card);
  });

  // The point of the drill is the finished paragraph, so it is on screen and
  // builds up as sentences are placed rather than waiting for a check.
  if (task.preview) {
    var preview = document.createElement("section");
    preview.className = "ege-ordering__preview";

    var previewTitle = document.createElement("p");
    previewTitle.className = "ege-ordering__preview-title";
    previewTitle.textContent = task.preview;
    preview.appendChild(previewTitle);

    var previewBody = document.createElement("p");
    previewBody.className = "ege-ordering__preview-body";
    // Seeded here because syncOrderingBoard needs the node in the document,
    // and nothing is placed at build time anyway.
    E.orderingSlots(task).forEach(function (_slot, index) {
      if (index) previewBody.appendChild(document.createTextNode(" "));
      var gap = document.createElement("span");
      gap.className = "ege-ordering__preview-gap";
      gap.textContent = index + 1;
      previewBody.appendChild(gap);
    });
    preview.appendChild(previewBody);
    work.appendChild(preview);
  }

  read.appendChild(work);

  wrap.appendChild(E.buildLongreadSplit(read, pool, { workLabel: "Sentences" }));
  wrap.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));
  return wrap;
};
