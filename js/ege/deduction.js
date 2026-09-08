import { E } from "./runtime.js";

/* "deduction" tasks are Data Deduction: the table's percentages are missing
   and must be worked out from comparative-English clues, then dragged (or
   tapped) onto the row they belong to. Percentage chips live in a pool until
   placed; dropping one on an already-filled slot bumps the previous occupant
   back to the pool, since each percentage can only sit in one row at a time. */

var selection = {};

E.deductionState = function deductionState(taskId) {
  if (!selection[taskId]) selection[taskId] = { assign: {}, selectedChip: "" };
  return selection[taskId];
};

E.resetDeductionState = function resetDeductionState(taskId) {
  selection[taskId] = { assign: {}, selectedChip: "" };
};

E.deductionSlot = function deductionSlot(taskId, optionId) {
  return document.querySelector(
    "#task-" + taskId + ' .ege-deduction__slot[data-option-id="' + optionId + '"]'
  );
};

E.deductionChip = function deductionChip(taskId, percentageId) {
  return document.querySelector(
    "#task-" + taskId + ' .ege-deduction__chip[data-percentage-id="' + percentageId + '"]'
  );
};

E.deductionPool = function deductionPool(taskId) {
  return document.querySelector("#task-" + taskId + " .ege-deduction__pool-chips");
};

E.allDeductionPlaced = function allDeductionPlaced(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "deduction") return false;
  var assign = E.deductionState(taskId).assign;
  return (task.left || []).every(function (item) {
    return !!assign[item.id];
  });
};

E.syncDeductionProgress = function syncDeductionProgress(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "deduction") return;
  var counter = document.querySelector("#task-" + taskId + " .ege-deduction__progress");
  if (!counter) return;
  var assign = E.deductionState(taskId).assign;
  var placed = (task.left || []).filter(function (item) {
    return !!assign[item.id];
  }).length;
  counter.textContent = placed + " / " + (task.left || []).length + " placed";
};

E.syncDeductionBoard = function syncDeductionBoard(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "deduction") return;
  var state = E.deductionState(taskId);
  var pool = E.deductionPool(taskId);
  var placedIds = {};

  (task.left || []).forEach(function (item) {
    var slot = E.deductionSlot(taskId, item.id);
    if (!slot) return;
    var percentageId = state.assign[item.id];
    var placeholder = slot.querySelector(".ege-deduction__placeholder");
    if (percentageId) {
      placedIds[percentageId] = true;
      var chip = E.deductionChip(taskId, percentageId);
      if (chip && chip.parentElement !== slot) slot.appendChild(chip);
      if (placeholder) placeholder.hidden = true;
      slot.classList.add("is-filled");
    } else {
      if (placeholder) placeholder.hidden = false;
      slot.classList.remove("is-filled");
    }
  });

  (task.right || []).forEach(function (item) {
    var chip = E.deductionChip(taskId, item.id);
    if (!chip) return;
    chip.classList.toggle("is-selected", state.selectedChip === item.id);
    if (!placedIds[item.id] && pool && chip.parentElement !== pool) {
      pool.appendChild(chip);
    }
  });

  E.syncDeductionProgress(taskId);
};

E.syncDeductionCheckEnabled = function syncDeductionCheckEnabled(taskId) {
  E.syncDeductionBoard(taskId);
  E.syncCheckButton(taskId);
  E.syncResetButton(taskId);
  E.syncShowAnswersButton(taskId);
};

E.assignDeductionChip = function assignDeductionChip(taskId, percentageId, optionId) {
  var state = E.deductionState(taskId);
  // A percentage can only sit in one row -- drop it from wherever it was.
  Object.keys(state.assign).forEach(function (key) {
    if (state.assign[key] === percentageId) delete state.assign[key];
  });
  // Whatever previously sat in the target row is simply no longer
  // referenced, so the sync pass below returns it to the pool.
  state.assign[optionId] = percentageId;
  state.selectedChip = "";
};

E.unassignDeductionChip = function unassignDeductionChip(taskId, percentageId) {
  var state = E.deductionState(taskId);
  Object.keys(state.assign).forEach(function (key) {
    if (state.assign[key] === percentageId) delete state.assign[key];
  });
  state.selectedChip = "";
};

E.deductionAnswersRevealed = function deductionAnswersRevealed(taskId) {
  var taskEl = document.getElementById("task-" + taskId);
  return !!(taskEl && taskEl.dataset.answersRevealed === "1");
};

E.selectDeductionChip = function selectDeductionChip(taskId, percentageId) {
  if (E.deductionAnswersRevealed(taskId)) return;
  var state = E.deductionState(taskId);
  state.selectedChip = state.selectedChip === percentageId ? "" : percentageId;
  E.clearDeductionFeedback(taskId);
  E.hideScoreFeedback(taskId);
  E.syncDeductionCheckEnabled(taskId);
};

E.clickDeductionSlot = function clickDeductionSlot(taskId, optionId) {
  if (E.deductionAnswersRevealed(taskId)) return;
  var state = E.deductionState(taskId);
  E.clearDeductionFeedback(taskId);
  E.hideScoreFeedback(taskId);

  if (state.selectedChip) {
    E.assignDeductionChip(taskId, state.selectedChip, optionId);
  } else if (state.assign[optionId]) {
    // Nothing selected: clicking a filled slot picks its chip back up so it
    // can be moved elsewhere with a second click.
    state.selectedChip = state.assign[optionId];
    delete state.assign[optionId];
  }
  E.syncDeductionCheckEnabled(taskId);
};

E.clickDeductionPool = function clickDeductionPool(taskId) {
  if (E.deductionAnswersRevealed(taskId)) return;
  var state = E.deductionState(taskId);
  if (!state.selectedChip) return;
  E.unassignDeductionChip(taskId, state.selectedChip);
  E.clearDeductionFeedback(taskId);
  E.hideScoreFeedback(taskId);
  E.syncDeductionCheckEnabled(taskId);
};

E.clearDeductionFeedback = function clearDeductionFeedback(taskId) {
  var taskEl = document.getElementById("task-" + taskId);
  if (!taskEl) return;
  taskEl.querySelectorAll(".ege-deduction__slot").forEach(function (slot) {
    slot.classList.remove("is-correct", "is-wrong", "is-revealed");
  });
  taskEl.querySelectorAll(".ege-deduction__feedback").forEach(function (note) {
    note.hidden = true;
    note.textContent = "";
  });
};

E.markDeduction = function markDeduction(taskId, revealed) {
  var task = E.findTask(taskId);
  if (!task) return 0;
  var state = E.deductionState(taskId);
  var correct = 0;

  (task.left || []).forEach(function (item) {
    var slot = E.deductionSlot(taskId, item.id);
    var row = slot ? slot.closest(".ege-deduction__row") : null;
    var chosen = state.assign[item.id];
    var ok = chosen === item.match;
    if (ok) correct += 1;
    if (!slot) return;

    slot.classList.remove("is-correct", "is-wrong", "is-revealed");
    if (revealed) slot.classList.add("is-revealed");
    else slot.classList.add(ok ? "is-correct" : "is-wrong");

    var note = row ? row.querySelector(".ege-deduction__feedback") : null;
    if (note) {
      var shouldShow = (ok || revealed) && item.feedback;
      note.hidden = !shouldShow;
      note.textContent = shouldShow ? item.feedback : "";
    }
  });

  return correct;
};

function buildChip(taskId, item) {
  var chip = document.createElement("div");
  chip.className = "ege-deduction__chip";
  chip.dataset.percentageId = item.id;
  chip.draggable = true;
  chip.setAttribute("role", "button");
  chip.tabIndex = 0;
  chip.textContent = item.code || "";

  function pick() {
    E.selectDeductionChip(taskId, item.id);
  }
  chip.addEventListener("click", pick);
  chip.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    pick();
  });
  chip.addEventListener("dragstart", function (event) {
    event.dataTransfer.setData("text/plain", item.id);
    event.dataTransfer.effectAllowed = "move";
    chip.classList.add("is-dragging");
  });
  chip.addEventListener("dragend", function () {
    chip.classList.remove("is-dragging");
  });

  return chip;
}

function buildRow(taskId, item) {
  var row = document.createElement("div");
  row.className = "ege-deduction__row";
  row.dataset.optionId = item.id;

  var line = document.createElement("div");
  line.className = "ege-deduction__row-line";

  var num = document.createElement("span");
  num.className = "ege-deduction__num";
  num.textContent = item.code || "";
  line.appendChild(num);

  var text = document.createElement("span");
  text.className = "ege-deduction__option-text";
  text.textContent = item.text || "";
  line.appendChild(text);

  var slot = document.createElement("div");
  slot.className = "ege-deduction__slot";
  slot.dataset.optionId = item.id;
  slot.setAttribute("role", "button");
  slot.tabIndex = 0;

  var placeholder = document.createElement("span");
  placeholder.className = "ege-deduction__placeholder";
  placeholder.textContent = "?";
  slot.appendChild(placeholder);

  function drop() {
    E.clickDeductionSlot(taskId, item.id);
  }
  slot.addEventListener("click", drop);
  slot.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    drop();
  });
  slot.addEventListener("dragover", function (event) {
    event.preventDefault();
    slot.classList.add("is-dragover");
  });
  slot.addEventListener("dragleave", function () {
    slot.classList.remove("is-dragover");
  });
  slot.addEventListener("drop", function (event) {
    event.preventDefault();
    slot.classList.remove("is-dragover");
    if (E.deductionAnswersRevealed(taskId)) return;
    var percentageId = event.dataTransfer.getData("text/plain");
    if (!percentageId) return;
    E.assignDeductionChip(taskId, percentageId, item.id);
    E.clearDeductionFeedback(taskId);
    E.hideScoreFeedback(taskId);
    E.syncDeductionCheckEnabled(taskId);
  });

  line.appendChild(slot);
  row.appendChild(line);

  var note = document.createElement("p");
  note.className = "ege-deduction__feedback";
  note.hidden = true;
  row.appendChild(note);

  return row;
}

E.renderDeduction = function renderDeduction(task, topicId) {
  var max = E.taskMaxScore(task);
  E.resetDeductionState(task.id);

  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--deduction");

  var tools = document.createElement("div");
  tools.className = "ege-skills-tools";
  if (typeof E.buildListeningNotesToggle === "function") {
    tools.appendChild(E.buildListeningNotesToggle(task.id));
  }
  wrap.appendChild(tools);

  var hasContext = !!(task.contextTitle || task.contextHtml);
  var read = document.createElement("div");
  read.className = "ege-passage ege-deduction__context";
  if (task.contextTitle) {
    var meta = document.createElement("p");
    meta.className = "ege-deduction__context-meta";
    meta.textContent = task.contextTitle;
    read.appendChild(meta);
  }
  if (task.contextHtml) {
    var body = document.createElement("div");
    body.innerHTML = task.contextHtml;
    read.appendChild(body);
  }

  var work = document.createElement("div");
  work.className = "ege-deduction__work";

  var tableLabel = document.createElement("p");
  tableLabel.className = "ege-deduction__table-label";
  tableLabel.textContent = task.leftTitle || "Options";
  work.appendChild(tableLabel);

  var table = document.createElement("div");
  table.className = "ege-deduction__table";
  (task.left || []).forEach(function (item) {
    table.appendChild(buildRow(task.id, item));
  });
  work.appendChild(table);

  var pool = document.createElement("div");
  pool.className = "ege-deduction__pool";
  var poolLabel = document.createElement("p");
  poolLabel.className = "ege-deduction__pool-label";
  poolLabel.textContent = task.rightTitle || "Percentages";
  pool.appendChild(poolLabel);

  var poolChips = document.createElement("div");
  poolChips.className = "ege-deduction__pool-chips";
  (task.right || []).forEach(function (item) {
    poolChips.appendChild(buildChip(task.id, item));
  });
  pool.appendChild(poolChips);

  pool.addEventListener("dragover", function (event) {
    event.preventDefault();
    pool.classList.add("is-dragover");
  });
  pool.addEventListener("dragleave", function () {
    pool.classList.remove("is-dragover");
  });
  pool.addEventListener("drop", function (event) {
    event.preventDefault();
    pool.classList.remove("is-dragover");
    if (E.deductionAnswersRevealed(task.id)) return;
    var percentageId = event.dataTransfer.getData("text/plain");
    if (!percentageId) return;
    E.unassignDeductionChip(task.id, percentageId);
    E.clearDeductionFeedback(task.id);
    E.hideScoreFeedback(task.id);
    E.syncDeductionCheckEnabled(task.id);
  });
  pool.addEventListener("click", function (event) {
    if (event.target.closest(".ege-deduction__chip")) return;
    E.clickDeductionPool(task.id);
  });

  work.appendChild(pool);

  var progress = document.createElement("p");
  progress.className = "ege-deduction__progress";
  progress.textContent = "0 / " + (task.left || []).length + " placed";
  work.appendChild(progress);

  if (hasContext) {
    var stack = document.createElement("div");
    stack.className = "ege-stack";
    stack.appendChild(E.buildPanel("", read, "ege-panel--read ege-panel--quote"));
    stack.appendChild(E.buildPanel("", work, "ege-panel--work ege-panel--solo"));
    wrap.appendChild(stack);
  } else {
    wrap.appendChild(E.buildPanel("", work, "ege-panel--solo"));
  }
  wrap.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));
  return wrap;
};
