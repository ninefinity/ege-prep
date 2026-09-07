import { E } from "./runtime.js";

/* "pairing" tasks drill task 38's problem/solution paragraph: bind each
   problem to the one solution that resolves its root cause. Binding is
   two-click (pick one side, then the other) and strictly 1:1 -- reusing a
   solution releases whatever held it -- and one option is a distractor that
   pairs with nothing. */

var selection = {};

E.pairingState = function pairingState(taskId) {
  if (!selection[taskId]) selection[taskId] = { left: "", right: "", pairs: {} };
  return selection[taskId];
};

E.resetPairingState = function resetPairingState(taskId) {
  selection[taskId] = { left: "", right: "", pairs: {} };
};

E.pairingCard = function pairingCard(taskId, side, id) {
  return document.querySelector(
    "#task-" + taskId + ' .ege-pairing__card[data-side="' + side + '"][data-id="' + id + '"]'
  );
};

E.pairingRightCode = function pairingRightCode(task, id) {
  var found = (task.right || []).filter(function (item) {
    return item.id === id;
  })[0];
  return found ? found.code || "" : "";
};

E.allPairingBound = function allPairingBound(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "pairing") return false;
  var pairs = E.pairingState(taskId).pairs;
  return (task.left || []).every(function (item) {
    return !!pairs[item.id];
  });
};

E.syncPairingProgress = function syncPairingProgress(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "pairing") return;
  var counter = document.querySelector("#task-" + taskId + " .ege-pairing__progress");
  if (!counter) return;
  var pairs = E.pairingState(taskId).pairs;
  var bound = (task.left || []).filter(function (item) {
    return !!pairs[item.id];
  }).length;
  counter.textContent = bound + " / " + (task.left || []).length + " paired";
};

E.syncPairingBoard = function syncPairingBoard(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "pairing") return;
  var state = E.pairingState(taskId);
  var takenBy = {};
  Object.keys(state.pairs).forEach(function (leftId) {
    takenBy[state.pairs[leftId]] = leftId;
  });

  (task.left || []).forEach(function (item) {
    var card = E.pairingCard(taskId, "left", item.id);
    if (!card) return;
    var partner = state.pairs[item.id];
    card.classList.toggle("is-active", state.left === item.id);
    card.classList.toggle("is-paired", !!partner);
    var badge = card.querySelector(".ege-pairing__badge");
    if (badge) {
      badge.textContent = partner
        ? (item.code || "") + " → " + E.pairingRightCode(task, partner)
        : item.code || "";
    }
  });

  (task.right || []).forEach(function (item) {
    var card = E.pairingCard(taskId, "right", item.id);
    if (!card) return;
    var owner = takenBy[item.id];
    card.classList.toggle("is-active", state.right === item.id);
    card.classList.toggle("is-paired", !!owner);
    var badge = card.querySelector(".ege-pairing__badge");
    if (badge) badge.textContent = item.code || "";
  });

  E.syncPairingProgress(taskId);
};

E.syncPairingCheckEnabled = function syncPairingCheckEnabled(taskId) {
  E.syncPairingBoard(taskId);
  E.syncCheckButton(taskId);
  E.syncResetButton(taskId);
  E.syncShowAnswersButton(taskId);
};

E.bindPair = function bindPair(taskId, leftId, rightId) {
  var state = E.pairingState(taskId);
  // 1:1 -- whoever held this solution loses it.
  Object.keys(state.pairs).forEach(function (key) {
    if (state.pairs[key] === rightId) delete state.pairs[key];
  });
  state.pairs[leftId] = rightId;
  state.left = "";
  state.right = "";
};

E.selectPairingCard = function selectPairingCard(taskId, side, id) {
  var taskEl = document.getElementById("task-" + taskId);
  if (taskEl && taskEl.dataset.answersRevealed === "1") return;
  var state = E.pairingState(taskId);
  var other = side === "left" ? "right" : "left";

  if (state[side] === id) {
    state[side] = "";
  } else if (state[other]) {
    if (side === "left") E.bindPair(taskId, id, state.right);
    else E.bindPair(taskId, state.left, id);
  } else if (side === "left" && state.pairs[id]) {
    // Clicking a bound problem with nothing selected releases it.
    delete state.pairs[id];
  } else {
    state[side] = id;
  }

  E.clearPairingFeedback(taskId);
  E.hideScoreFeedback(taskId);
  E.syncPairingCheckEnabled(taskId);
};

E.clearPairingFeedback = function clearPairingFeedback(taskId) {
  var taskEl = document.getElementById("task-" + taskId);
  if (!taskEl) return;
  taskEl.querySelectorAll(".ege-pairing__card").forEach(function (card) {
    card.classList.remove("is-correct", "is-wrong", "is-revealed");
  });
  taskEl.querySelectorAll(".ege-pairing__feedback").forEach(function (note) {
    note.hidden = true;
    note.textContent = "";
  });
};

E.markPairing = function markPairing(taskId, revealed) {
  var task = E.findTask(taskId);
  if (!task) return 0;
  var state = E.pairingState(taskId);
  var correct = 0;

  (task.left || []).forEach(function (item) {
    var card = E.pairingCard(taskId, "left", item.id);
    var chosen = state.pairs[item.id];
    var ok = chosen === item.match;
    if (ok) correct += 1;
    if (!card) return;

    card.classList.remove("is-correct", "is-wrong", "is-revealed");
    if (revealed) card.classList.add("is-revealed");
    else card.classList.add(ok ? "is-correct" : "is-wrong");

    var note = card.querySelector(".ege-pairing__feedback");
    if (note) {
      note.hidden = false;
      note.textContent = ok || revealed
        ? item.feedback || ""
        : "Expected " + E.pairingRightCode(task, item.match) + ". " + (item.feedback || "");
    }
  });

  // A distractor that was never used is worth saying out loud.
  (task.right || []).forEach(function (item) {
    var card = E.pairingCard(taskId, "right", item.id);
    if (!card) return;
    var used = Object.keys(state.pairs).some(function (key) {
      return state.pairs[key] === item.id;
    });
    var note = card.querySelector(".ege-pairing__feedback");
    if (note && item.distractor && (used || revealed)) {
      note.hidden = false;
      note.textContent = item.feedback || "";
    }
    if (item.distractor && used && !revealed) card.classList.add("is-wrong");
  });

  return correct;
};


function buildColumn(task, taskId, side, title) {
  var col = document.createElement("div");
  // Pictures read better tiled than stacked, so a column can ask for a grid.
  var layout = side === "left" ? task.leftLayout : task.rightLayout;
  col.className =
    "ege-pairing__col" + (layout === "grid" ? " ege-pairing__col--grid" : "");

  var head = document.createElement("p");
  head.className = "ege-pairing__col-title";
  head.textContent = title;
  col.appendChild(head);

  (task[side] || []).forEach(function (item) {
    var card = document.createElement("div");
    card.className = "ege-pairing__card";
    card.dataset.side = side;
    card.dataset.id = item.id;
    card.setAttribute("role", "button");
    card.tabIndex = 0;

    var badge = document.createElement("span");
    badge.className = "ege-pairing__badge";
    badge.textContent = item.code || "";
    card.appendChild(badge);

    if (item.image && item.image.src) {
      var img = document.createElement("img");
      img.className = "ege-pairing__image";
      img.src = item.image.src;
      img.alt = item.image.alt || "";
      img.loading = "lazy";
      card.appendChild(img);
    }

    if (item.text) {
      var text = document.createElement("span");
      text.className = "ege-pairing__text";
      text.textContent = item.text;
      card.appendChild(text);
    }

    var note = document.createElement("p");
    note.className = "ege-pairing__feedback";
    note.hidden = true;
    card.appendChild(note);

    function pick() {
      E.selectPairingCard(taskId, side, item.id);
    }
    card.addEventListener("click", pick);
    card.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      pick();
    });

    col.appendChild(card);
  });

  return col;
}

E.renderPairing = function renderPairing(task, topicId) {
  var max = E.taskMaxScore(task);
  E.resetPairingState(task.id);

  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--pairing");

  var tools = document.createElement("div");
  tools.className = "ege-skills-tools";
  if (typeof E.buildListeningNotesToggle === "function") {
    tools.appendChild(E.buildListeningNotesToggle(task.id));
  }
  wrap.appendChild(tools);

  var hasContext = !!(task.contextTitle || task.contextHtml);
  var read = document.createElement("div");
  read.className = "ege-passage ege-pairing__context";
  if (task.contextTitle) {
    var meta = document.createElement("p");
    meta.className = "ege-pairing__context-meta";
    meta.textContent = task.contextTitle;
    read.appendChild(meta);
  }
  if (task.contextHtml) {
    var body = document.createElement("div");
    body.innerHTML = task.contextHtml;
    read.appendChild(body);
  }

  var work = document.createElement("div");
  work.className = "ege-pairing__work";

  var progress = document.createElement("p");
  progress.className = "ege-pairing__progress";
  progress.textContent = "0 / " + (task.left || []).length + " paired";
  work.appendChild(progress);

  var board = document.createElement("div");
  // Photographs need room for detail, so they take the full width in a row of
  // their own with the descriptions beneath, rather than half the board.
  board.className =
    "ege-pairing__board" +
    (task.leftLayout === "grid" ? " ege-pairing__board--stacked" : "");
  board.appendChild(buildColumn(task, task.id, "left", task.leftTitle || "Problems"));
  board.appendChild(buildColumn(task, task.id, "right", task.rightTitle || "Solutions"));
  work.appendChild(board);

  // The board is two columns of its own, so it needs the full width either
  // way. A context block stacks above it rather than taking a column.
  wrap.classList.add("ege-task--pairing-solo");
  if (hasContext) {
    var stack = document.createElement("div");
    stack.className = "ege-stack";
    stack.appendChild(E.buildPanel("", read, "ege-panel--read ege-panel--quote"));
    stack.appendChild(E.buildWorkPanel("questions", work, "ege-panel--work ege-panel--solo"));
    wrap.appendChild(stack);
  } else {
    wrap.appendChild(E.buildWorkPanel("questions", work, "ege-panel--solo"));
  }
  wrap.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));
  return wrap;
};
