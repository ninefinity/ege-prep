import { E } from "./runtime.js";

/* "crossword": a task-25-29 (word formation) vocab drill laid out as a
   grid. A fresh 8-word puzzle is dealt from the task's word pool by
   E.generateCrossword (see crossword-gen.js) the first time the drill is
   opened, and again on "New puzzle" -- there is no fixed, repeatable
   layout to author or bake, and no notion of levels: every puzzle is an
   independent, one-off draw from the same pool.

   Each entry's clue is the same sentence-with-a-blank the real exam task
   uses. Rather than a permanent Across/Down list (which for these
   multi-sentence clues turned the drill into more text than grid), the clue
   for whatever cell has focus shows in one line above the grid -- clicking
   a square reveals its sentence. Each entry also comes with one letter
   pre-filled and locked: the original word's first letter, on the square
   where that word starts inside the answer (entry.hintAt) -- so base "able"
   -> UNABLE gives "A" on the third square, not the U.

   Cells are shared between an across and a down entry wherever they cross,
   so correctness lives on the CELL (typed letter vs. that cell's own
   solution letter, baked into input.dataset.answerChar at paint time)
   rather than on either entry -- an entry is "correct" once every cell
   along it is. That sidesteps the two entries through one cell ever
   disagreeing about whether it's right. */

var MIN_WORDS = 5;
var MAX_WORDS = 10;

// taskId -> { puzzle: {rows, cols, cells, entries}, dir: "across"|"down", wordCount }
var state = {};

function ensureState(taskId, task) {
  if (!state[taskId]) {
    state[taskId] = {
      puzzle: null,
      dir: "across",
      wordCount: (task && task.wordsPerPuzzle) || 8,
      // Whether the word-count picker is showing in place of the grid --
      // "New puzzle" opens it instead of regenerating immediately, so the
      // count is chosen fresh each time rather than sitting in a
      // persistent, easy-to-miss toolbar control.
      picking: false,
    };
  }
  return state[taskId];
}

function getActiveDir(taskId) {
  return ensureState(taskId).dir;
}

function setActiveDir(taskId, dir) {
  ensureState(taskId).dir = dir;
}

function ensurePuzzle(task) {
  var s = ensureState(task.id, task);
  if (!s.puzzle) {
    s.puzzle = E.generateCrossword(task.pool || [], s.wordCount);
  }
  return s.puzzle;
}

function taskEl(taskId) {
  return document.getElementById("task-" + taskId);
}

function cellInput(taskId, r, c) {
  return document.querySelector(
    '#task-' + taskId + ' .ege-crossword-cell__input[data-row="' + r + '"][data-col="' + c + '"]'
  );
}

function entryCellPositions(entry) {
  var dr = entry.dir === "down" ? 1 : 0;
  var dc = entry.dir === "down" ? 0 : 1;
  var cells = [];
  for (var k = 0; k < entry.answer.length; k += 1) {
    cells.push({ r: entry.row + dr * k, c: entry.col + dc * k });
  }
  return cells;
}

E.crosswordEntries = function crosswordEntries(task) {
  if (!task || task.type !== "crossword") return [];
  return ensurePuzzle(task).entries || [];
};

E.allCrosswordFilled = function allCrosswordFilled(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "crossword") return false;
  return ensurePuzzle(task).cells.every(function (cell) {
    var input = cellInput(taskId, cell[0], cell[1]);
    return !!(input && input.value);
  });
};

// Only letters the player typed count -- given and hint-revealed letters are
// locked (read-only) and Reset leaves them in place anyway.
E.crosswordHasAnyAnswer = function crosswordHasAnyAnswer(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "crossword") return false;
  return ensurePuzzle(task).cells.some(function (cell) {
    var input = cellInput(taskId, cell[0], cell[1]);
    return !!(input && input.value && !input.readOnly);
  });
};

E.syncCrosswordCheckEnabled = function syncCrosswordCheckEnabled(taskId) {
  E.syncCheckButton(taskId);
  E.syncResetButton(taskId);
  E.syncShowAnswersButton(taskId);
};

E.markCrosswordEntry = function markCrosswordEntry(taskId, task, entryIndex, opts) {
  opts = opts || {};
  var entry = E.crosswordEntries(task)[entryIndex];
  if (!entry) return false;

  var ok = true;
  entryCellPositions(entry).forEach(function (pos) {
    var input = cellInput(taskId, pos.r, pos.c);
    if (!input) {
      ok = false;
      return;
    }
    if (opts.reveal) {
      input.value = input.dataset.answerChar || "";
      input.classList.remove("is-correct", "is-wrong");
      input.classList.add("is-revealed");
      return;
    }
    var typed = (input.value || "").toUpperCase();
    var solved = !!typed && typed === (input.dataset.answerChar || "").toUpperCase();
    input.classList.remove("is-correct", "is-wrong", "is-revealed");
    if (typed) input.classList.toggle(solved ? "is-correct" : "is-wrong", true);
    if (!solved) ok = false;
  });

  return ok;
};

E.clearCrosswordEntry = function clearCrosswordEntry(taskId, entryIndex) {
  var task = E.findTask(taskId);
  var entry = task && E.crosswordEntries(task)[entryIndex];
  if (!entry) return;
  entryCellPositions(entry).forEach(function (pos) {
    var input = cellInput(taskId, pos.r, pos.c);
    if (!input) return;
    // Letters earned from a hint quiz survive Reset -- they aren't the
    // player's own answers, and they paid a quiz for them.
    if (input.readOnly) {
      input.classList.remove("is-correct", "is-wrong", "is-revealed");
      return;
    }
    input.value = "";
    input.classList.remove("is-correct", "is-wrong", "is-revealed");
  });
};

/* ---- Hint reveals ----
   Every entry starts with its base word's first letter pre-filled and
   locked (see paintCrossword). Beyond that, "Hint" earns one more letter:
   click a word on the grid, then
   - Choose letter: pick the square, then answer a task 30-36 gap (3 of its
     4 options). Right first time reveals that square. A wrong answer leaves
     a 50/50; getting that right reveals a random square in the word instead.
   - Random letter: answer an easier task 10 heading match (3 headings).
     Right first time reveals a random square in the word; right on the
     50/50 reveals one in a different word.
   Random reveals never land on a crossing square -- that would give away a
   letter of two words at once. A chosen square may be a crossing: it was
   earned by getting the harder task right first time. Two wrong answers
   close the hint, and the next attempt gets a different task.
   Revealed letters are locked: read-only, skipped by typing/backspace, and
   kept through Reset. Tasks come from data/crossword-hint-tasks.json (built
   by scripts/build_word_formation_crossword.py), fetched on first use. */

var hintTasksPromise = null;

function loadHintTasks() {
  if (!hintTasksPromise) {
    hintTasksPromise = fetch("data/crossword-hint-tasks.json").then(function (res) {
      if (!res.ok) throw new Error("crossword-hint-tasks.json: " + res.status);
      return res.json();
    });
    hintTasksPromise.catch(function () {
      hintTasksPromise = null;
    });
  }
  return hintTasksPromise;
}

var usedHintTasks = { choose: [], random: [] };

function pickUnusedIndex(kind, count) {
  var used = usedHintTasks[kind];
  if (used.length >= count) used.length = 0;
  var i;
  do {
    i = Math.floor(Math.random() * count);
  } while (used.indexOf(i) !== -1);
  used.push(i);
  return i;
}

function shuffled(list) {
  var arr = list.slice();
  for (var i = arr.length - 1; i > 0; i -= 1) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Three options: the right one plus two random wrong ones from the source.
function threeOptions(options, answer) {
  var wrong = shuffled(options.filter(function (_opt, i) { return i !== answer; })).slice(0, 2);
  return shuffled([options[answer]].concat(wrong));
}

function buildHintQuestion(mode, data) {
  if (mode === "choose") {
    var item = data.choose[pickUnusedIndex("choose", data.choose.length)];
    return {
      prompt: "Which word fills the gap?",
      text: item.text,
      correct: item.options[item.answer],
      options: threeOptions(item.options, item.answer),
    };
  }
  var flat = [];
  data.random.forEach(function (set) {
    set.paragraphs.forEach(function (para) {
      flat.push({ headings: set.headings, para: para });
    });
  });
  var pick = flat[pickUnusedIndex("random", flat.length)];
  return {
    prompt: "Which heading fits this paragraph best?",
    text: pick.para.text,
    correct: pick.headings[pick.para.answer],
    options: threeOptions(pick.headings, pick.para.answer),
  };
}

function entryName(entry) {
  return entry.number + " " + (entry.dir === "across" ? "Across" : "Down");
}

function entryInputs(taskId, entry) {
  return entryCellPositions(entry).map(function (pos) {
    return cellInput(taskId, pos.r, pos.c);
  }).filter(Boolean);
}

function crossingCounts(entries) {
  var counts = {};
  entries.forEach(function (entry) {
    entryCellPositions(entry).forEach(function (pos) {
      var key = pos.r + "," + pos.c;
      counts[key] = (counts[key] || 0) + 1;
    });
  });
  return counts;
}

// Squares a random reveal may land on: still open, not already right, and
// not shared with another word.
function randomRevealCells(taskId, entries, entry) {
  var counts = crossingCounts(entries);
  return entryInputs(taskId, entry).filter(function (input) {
    var key = input.dataset.row + "," + input.dataset.col;
    return !input.readOnly && input.value !== input.dataset.answerChar && counts[key] === 1;
  });
}

function hasOpenCell(taskId, entry) {
  return entryInputs(taskId, entry).some(function (input) {
    return !input.readOnly;
  });
}

function revealCrosswordCell(taskId, input) {
  input.value = input.dataset.answerChar || "";
  input.readOnly = true;
  input.classList.remove("is-correct", "is-wrong", "is-revealed");
  input.classList.add("is-hinted", "is-just-hinted");
  window.setTimeout(function () {
    input.classList.remove("is-just-hinted");
  }, 1600);
  E.hideScoreFeedback(taskId);
  E.syncCrosswordCheckEnabled(taskId);
}

function revealAndAnnounce(taskId, input, entry) {
  revealCrosswordCell(taskId, input);
  E.showToast("Letter revealed in " + entryName(entry) + ".");
}

// Random reveal in the first of `preferred` / `fallback` that has a legal
// square -- preferred words are tried before falling back.
function revealRandomLetter(taskId, entries, preferred, fallback) {
  var groups = [preferred, fallback];
  for (var g = 0; g < groups.length; g += 1) {
    var options = shuffled(groups[g]).map(function (entry) {
      return { entry: entry, cells: randomRevealCells(taskId, entries, entry) };
    }).filter(function (option) {
      return option.cells.length;
    });
    if (options.length) {
      var cells = options[0].cells;
      revealAndAnnounce(taskId, cells[Math.floor(Math.random() * cells.length)], options[0].entry);
      return;
    }
  }
  E.showToast("No letter left to reveal.");
}

var hint = null;

function closeHint() {
  var overlay = document.getElementById("crossword-hint");
  if (overlay) overlay.remove();
  document.removeEventListener("keydown", onHintKeydown);
  hint = null;
}

function onHintKeydown(event) {
  if (event.key === "Escape") closeHint();
}

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function hintButton(className, text, onClick) {
  var btn = el("button", className, text);
  btn.type = "button";
  btn.addEventListener("click", onClick);
  return btn;
}

// The word as a row of small squares showing what's already in the grid.
function wordPattern(inputs) {
  var row = el("div", "ege-crossword__hint-pattern");
  inputs.forEach(function (input) {
    var box = el("span", "ege-crossword__hint-box", input.value || "");
    if (input.classList.contains("is-given")) box.classList.add("is-given");
    else if (input.readOnly) box.classList.add("is-locked");
    row.appendChild(box);
  });
  return row;
}

function hintActions(onBack) {
  var actions = el("div", "ege-crossword__hint-actions");
  if (onBack) actions.appendChild(hintButton("ege-btn ege-btn--ghost ege-btn--small", "Back", onBack));
  actions.appendChild(hintButton("ege-btn ege-btn--ghost ege-btn--small", "Cancel", closeHint));
  return actions;
}

function focusFirst(card) {
  var first = card.querySelector("button:not([disabled])");
  if (first) first.focus();
}

// Only reached when the clicked square is where two words cross.
function renderHintWords(card) {
  card.innerHTML = "";
  card.appendChild(el("p", "ege-crossword__hint-title", "Hint"));
  card.appendChild(el("p", "ege-crossword__hint-prompt", "Which word?"));
  var list = el("div", "ege-crossword__hint-words");
  hint.candidates.forEach(function (entry) {
    var btn = hintButton("ege-crossword__hint-word", "", function () {
      hint.entry = entry;
      renderHintModes(card);
    });
    btn.appendChild(el("span", "ege-crossword__hint-word-name", entryName(entry)));
    btn.appendChild(wordPattern(entryInputs(hint.taskId, entry)));
    list.appendChild(btn);
  });
  card.appendChild(list);
  card.appendChild(hintActions());
  focusFirst(card);
}

function renderHintModes(card) {
  var entry = hint.entry;
  var canRandom = randomRevealCells(hint.taskId, hint.entries, entry).length > 0;
  card.innerHTML = "";
  card.appendChild(el("p", "ege-crossword__hint-title", "Hint · " + entryName(entry)));
  card.appendChild(wordPattern(entryInputs(hint.taskId, entry)));

  var modes = el("div", "ege-crossword__hint-modes");
  var choose = hintButton("ege-crossword__hint-mode", "", function () {
    var session = hint;
    session.mode = "choose";
    closeHint();
    startLetterPick(session);
  });
  choose.appendChild(el("span", "ege-crossword__hint-mode-name", "Choose letter"));
  choose.appendChild(el("span", "ege-crossword__hint-mode-sub", "Vocabulary task · you pick the square"));
  modes.appendChild(choose);

  var random = hintButton("ege-crossword__hint-mode", "", function () {
    hint.mode = "random";
    renderHintTask(card);
  });
  random.disabled = !canRandom;
  random.appendChild(el("span", "ege-crossword__hint-mode-name", "Random letter"));
  random.appendChild(el(
    "span",
    "ege-crossword__hint-mode-sub",
    canRandom ? "Easier reading task · a random square" : "No square left to reveal at random"
  ));
  modes.appendChild(random);

  card.appendChild(modes);
  card.appendChild(hintActions(function () {
    if (hint.candidates.length > 1) {
      renderHintWords(card);
      return;
    }
    var taskId = hint.taskId;
    closeHint();
    startWordPick(taskId);
  }));
  focusFirst(card);
}

function renderHintTask(card) {
  card.innerHTML = "";
  var label = (hint.mode === "choose" ? "Choose letter · " : "Random letter · ") + entryName(hint.entry);
  card.appendChild(el("p", "ege-crossword__hint-title", label));
  var body = el("div", "ege-crossword__hint-body");
  body.appendChild(el("p", "ege-crossword__hint-prompt", "Loading…"));
  card.appendChild(body);
  card.appendChild(hintActions());

  var session = hint;
  loadHintTasks().then(function (data) {
    if (hint !== session) return;
    hint.question = buildHintQuestion(hint.mode, data);
    hint.attempt = 1;
    renderHintQuestion(body);
    focusFirst(body);
  }, function () {
    if (hint !== session) return;
    body.innerHTML = "";
    body.appendChild(el("p", "ege-crossword__hint-feedback", "Couldn't load the task. Try again."));
  });
}

function renderHintQuestion(body) {
  var q = hint.question;
  body.innerHTML = "";
  body.appendChild(el("p", "ege-crossword__hint-prompt", q.prompt));

  var text = el("p", "ege-crossword__hint-text");
  q.text.split("___").forEach(function (part, i) {
    if (i > 0) text.appendChild(el("span", "ege-crossword__hint-gap", "_____"));
    text.appendChild(document.createTextNode(part));
  });
  body.appendChild(text);

  var options = el("div", "ege-crossword__hint-options");
  var feedback = el("p", "ege-crossword__hint-feedback");
  feedback.setAttribute("aria-live", "polite");
  q.options.forEach(function (option) {
    var btn = hintButton("ege-crossword__hint-option", option, function () {
      answerHint(option, btn, feedback);
    });
    options.appendChild(btn);
  });
  body.appendChild(options);
  body.appendChild(feedback);
}

function answerHint(option, btn, feedback) {
  var h = hint;
  var right = option === h.question.correct;
  if (!right && h.attempt === 1) {
    h.attempt = 2;
    btn.disabled = true;
    btn.classList.add("is-wrong");
    feedback.textContent = h.mode === "choose"
      ? "Not quite. One more try. A right answer now reveals a random letter in this word."
      : "Not quite. One more try. A right answer now reveals a letter in a different word.";
    return;
  }

  closeHint();
  if (!right) {
    var answer = h.question.correct;
    E.showToast("No hint this time. The answer was “" + answer + "”" + (/[.!?]$/.test(answer) ? "" : "."));
    return;
  }
  var others = h.entries.filter(function (entry) { return entry !== h.entry; });
  if (h.mode === "choose" && h.attempt === 1) {
    revealAndAnnounce(h.taskId, h.target, h.entry);
  } else if (h.mode === "random" && h.attempt === 2) {
    revealRandomLetter(h.taskId, h.entries, others, [h.entry]);
  } else {
    revealRandomLetter(h.taskId, h.entries, [h.entry], others);
  }
}

/* Step one of a hint happens on the grid itself: "Hint" puts the grid in
   word-pick mode, and clicking a square picks the word through it. A
   crossing square belongs to two words, so the modal then asks which. */

var wordPickFor = null;
var letterPickSession = null;

function hintToolbarButton(taskId) {
  return document.getElementById("crossword-hint-btn-" + taskId);
}

function entriesAt(taskId, input) {
  var task = E.findTask(taskId);
  var r = parseInt(input.dataset.row, 10);
  var c = parseInt(input.dataset.col, 10);
  return E.crosswordEntries(task).filter(function (entry) {
    return entryCellPositions(entry).some(function (pos) {
      return pos.r === r && pos.c === c;
    });
  });
}

function clearWordPickHighlight(taskId) {
  var root = taskEl(taskId);
  if (!root) return;
  root.querySelectorAll(".ege-crossword-cell__input.is-hint-target").forEach(function (input) {
    input.classList.remove("is-hint-target");
  });
}

function highlightWordsAt(taskId, input) {
  clearWordPickHighlight(taskId);
  entriesAt(taskId, input).forEach(function (entry) {
    entryInputs(taskId, entry).forEach(function (cell) {
      cell.classList.add("is-hint-target");
    });
  });
}

function onWordPickOutsideClick(event) {
  var taskId = wordPickFor;
  if (!taskId) return;
  var root = taskEl(taskId);
  var grid = root && root.querySelector(".ege-crossword__grid");
  if (grid && grid.contains(event.target)) return;
  if (hintToolbarButton(taskId) === event.target) return;
  stopWordPick();
}

function onWordPickKeydown(event) {
  if (event.key === "Escape") stopWordPick();
}

function startWordPick(taskId) {
  startGridPick(taskId, "is-picking-word", "Click the word you need help with.");
}

// "Choose letter": the chosen word stays highlighted and the player clicks
// the square they want in it. The hint session rides along until then.
function startLetterPick(session) {
  letterPickSession = session;
  startGridPick(
    session.taskId,
    "is-picking-letter",
    "Click the letter you want in " + entryName(session.entry) + "."
  );
  entryInputs(session.taskId, session.entry).forEach(function (cell) {
    cell.classList.add("is-hint-target");
  });
}

function startGridPick(taskId, gridClass, statusText) {
  wordPickFor = taskId;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  var root = taskEl(taskId);
  var grid = root && root.querySelector(".ege-crossword__grid");
  if (grid) grid.classList.add(gridClass);
  var btn = hintToolbarButton(taskId);
  if (btn) btn.textContent = "Cancel hint";
  var status = document.getElementById("crossword-hint-status-" + taskId);
  if (status) status.textContent = statusText;
  document.addEventListener("keydown", onWordPickKeydown);
  // Deferred: the click that started pick mode (Hint, or the modal's Back)
  // is still bubbling and would otherwise count as a click outside.
  window.setTimeout(function () {
    if (wordPickFor === taskId) document.addEventListener("click", onWordPickOutsideClick);
  }, 0);
}

function stopWordPick() {
  var taskId = wordPickFor;
  wordPickFor = null;
  letterPickSession = null;
  document.removeEventListener("click", onWordPickOutsideClick);
  document.removeEventListener("keydown", onWordPickKeydown);
  if (!taskId) return;
  clearWordPickHighlight(taskId);
  var root = taskEl(taskId);
  var grid = root && root.querySelector(".ege-crossword__grid");
  if (grid) grid.classList.remove("is-picking-word", "is-picking-letter");
  var btn = hintToolbarButton(taskId);
  if (btn) btn.textContent = "Hint";
  var status = document.getElementById("crossword-hint-status-" + taskId);
  if (status) status.textContent = "";
}

function pickWordAt(taskId, input) {
  var candidates = entriesAt(taskId, input).filter(function (entry) {
    return hasOpenCell(taskId, entry);
  });
  if (!candidates.length) {
    E.showToast("Nothing left to reveal in this word.");
    return;
  }
  stopWordPick();
  openHintModal(taskId, candidates);
}

function pickLetterAt(taskId, input) {
  var session = letterPickSession;
  if (entryInputs(taskId, session.entry).indexOf(input) === -1) {
    E.showToast("Pick a letter in " + entryName(session.entry) + ".");
    return;
  }
  if (input.readOnly) {
    E.showToast("That letter is already revealed.");
    return;
  }
  session.target = input;
  stopWordPick();
  resumeHintModal(session);
}

// Wires word-pick clicks on the grid. Capture phase, so a pick never also
// focuses the square (no caret, no mobile keyboard) or flips direction.
function bindWordPick(grid, taskId) {
  function cellFrom(event) {
    if (wordPickFor !== taskId || !event.target.closest) return null;
    return event.target.closest(".ege-crossword-cell__input");
  }
  grid.addEventListener("mousedown", function (event) {
    if (cellFrom(event)) event.preventDefault();
  }, true);
  grid.addEventListener("click", function (event) {
    var input = cellFrom(event);
    if (!input) return;
    event.preventDefault();
    event.stopPropagation();
    if (letterPickSession) pickLetterAt(taskId, input);
    else pickWordAt(taskId, input);
  }, true);
  // Word pick previews whichever word is under the cursor; letter pick keeps
  // the already-chosen word highlighted instead.
  grid.addEventListener("mouseover", function (event) {
    var input = cellFrom(event);
    if (input && !letterPickSession) highlightWordsAt(taskId, input);
  });
  grid.addEventListener("mouseleave", function () {
    if (wordPickFor === taskId && !letterPickSession) clearWordPickHighlight(taskId);
  });
}

E.openCrosswordHint = function openCrosswordHint(taskId) {
  if (wordPickFor === taskId) {
    stopWordPick();
    return;
  }
  var task = E.findTask(taskId);
  if (!task) return;
  if (!E.crosswordEntries(task).some(function (entry) { return hasOpenCell(taskId, entry); })) {
    E.showToast("Nothing left to reveal.");
    return;
  }
  loadHintTasks();
  startWordPick(taskId);
};

function openHintModal(taskId, candidates) {
  var task = E.findTask(taskId);
  closeHint();
  hint = {
    taskId: taskId,
    entries: E.crosswordEntries(task),
    candidates: candidates,
    entry: candidates.length === 1 ? candidates[0] : null,
    mode: null,
    target: null,
    question: null,
    attempt: 1,
  };
  var card = mountHintOverlay();
  if (hint.entry) renderHintModes(card);
  else renderHintWords(card);
}

// Back from the grid letter pick with the square chosen: straight to the task.
function resumeHintModal(session) {
  closeHint();
  hint = session;
  renderHintTask(mountHintOverlay());
}

// Mounted on <body> as a true modal, rather than inside the grid, so it's
// on screen wherever the player has scrolled the puzzle to.
function mountHintOverlay() {
  var overlay = el("div", "ege-crossword__hint");
  overlay.id = "crossword-hint";
  overlay.addEventListener("click", function (event) {
    if (event.target === overlay) closeHint();
  });
  var card = el("div", "ege-crossword__hint-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Hint");
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onHintKeydown);
  return card;
}

function clueBarEl(taskId) {
  return document.getElementById("crossword-clue-" + taskId);
}

var CLUE_GAP = 8;
var CLUE_MIN_SIDE_WIDTH = 220;

// Places the clue next to the word it explains without ever covering any
// of that word's squares: an across word gets it above (or below) its row,
// a down word beside its column -- narrowing the clue to fit if needed --
// and only above/below the whole column when there's no room at the sides.
function positionClueBar(bar, anchorEl, wordEls) {
  var wrap = bar.closest(".ege-crossword__grid-wrap");
  if (!wrap || !anchorEl) return;
  var wrapRect = wrap.getBoundingClientRect();
  var W = wrapRect.width;
  var H = wrapRect.height;
  var els = wordEls && wordEls.length ? wordEls : [anchorEl];
  var word = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  els.forEach(function (node) {
    var r = node.getBoundingClientRect();
    word.left = Math.min(word.left, r.left - wrapRect.left);
    word.top = Math.min(word.top, r.top - wrapRect.top);
    word.right = Math.max(word.right, r.right - wrapRect.left);
    word.bottom = Math.max(word.bottom, r.bottom - wrapRect.top);
  });
  var cellRect = anchorEl.getBoundingClientRect();
  var cx = cellRect.left - wrapRect.left + cellRect.width / 2;
  var cy = cellRect.top - wrapRect.top + cellRect.height / 2;

  bar.style.width = "";
  bar.style.left = "0px";
  bar.style.top = "0px";
  var size = bar.getBoundingClientRect();

  function clamp(v, max) {
    return Math.max(0, Math.min(v, max));
  }

  function place(left, top) {
    bar.style.left = left + "px";
    bar.style.top = top + "px";
  }

  function placeAboveOrBelow() {
    var h = bar.getBoundingClientRect().height;
    var above = word.top - CLUE_GAP - h;
    var below = word.bottom + CLUE_GAP;
    var roomAbove = word.top;
    var roomBelow = H - word.bottom;
    var top = above >= 0 || (below + h > H && roomAbove >= roomBelow) ? above : below;
    place(clamp(cx - size.width / 2, W - size.width), top);
  }

  var isDown = word.bottom - word.top > word.right - word.left;
  if (!isDown) {
    placeAboveOrBelow();
    return;
  }

  var roomRight = W - word.right - CLUE_GAP;
  var roomLeft = word.left - CLUE_GAP;
  var side = roomRight >= size.width ? "right"
    : roomLeft >= size.width ? "left"
    : Math.max(roomRight, roomLeft) >= CLUE_MIN_SIDE_WIDTH ? (roomRight >= roomLeft ? "right" : "left")
    : null;
  if (!side) {
    placeAboveOrBelow();
    return;
  }
  var room = side === "right" ? roomRight : roomLeft;
  if (room < size.width) bar.style.width = room + "px";
  var fitted = bar.getBoundingClientRect();
  var left = side === "right" ? word.right + CLUE_GAP : word.left - CLUE_GAP - fitted.width;
  place(left, clamp(cy - fitted.height / 2, Math.max(0, H - fitted.height)));
}

function setClueBarText(taskId, text, anchorEl, wordEls) {
  var bar = clueBarEl(taskId);
  if (!bar) return;
  bar.textContent = text;
  bar.hidden = !text;
  if (text && anchorEl) positionClueBar(bar, anchorEl, wordEls);
}

function entryClueLabel(entry) {
  return entry.number + " " + (entry.dir === "across" ? "Across" : "Down") + ": " + entry.clue;
}

function paintCrosswordActive(taskId, entries, membership) {
  var el = taskEl(taskId);
  if (!el) return;
  el.querySelectorAll(".ege-crossword-cell__input.is-active-cell").forEach(function (input) {
    input.classList.remove("is-active-cell");
  });

  var active = document.activeElement;
  if (!active || !el.contains(active) || !active.classList.contains("ege-crossword-cell__input")) {
    setClueBarText(taskId, "");
    return;
  }
  var r = parseInt(active.dataset.row, 10);
  var c = parseInt(active.dataset.col, 10);
  var dir = getActiveDir(taskId);
  var memb = membership[r + "," + c] || {};
  var entryIndex = memb[dir] != null ? memb[dir] : memb.across != null ? memb.across : memb.down;
  if (entryIndex == null) return;

  var entry = entries[entryIndex];
  entryCellPositions(entry).forEach(function (pos) {
    var input = cellInput(taskId, pos.r, pos.c);
    if (input) input.classList.add("is-active-cell");
  });
  setClueBarText(taskId, entryClueLabel(entry), active, entryInputs(taskId, entry));
}

function stepAny(inputsByCell, r, c, dr, dc) {
  return inputsByCell[(r + dr) + "," + (c + dc)] || null;
}

function stepInEntry(inputsByCell, membership, r, c, dir, sign) {
  var dr = dir === "down" ? sign : 0;
  var dc = dir === "down" ? 0 : sign;
  var key = (r + dr) + "," + (c + dc);
  var input = inputsByCell[key];
  if (!input) return null;
  var memb = membership[key] || {};
  return memb[dir] != null ? input : null;
}

// Like stepInEntry, but hops over hint-revealed (read-only) squares so
// typing and backspacing flow straight past a locked letter.
function stepPastHinted(inputsByCell, membership, r, c, dir, sign) {
  var next = stepInEntry(inputsByCell, membership, r, c, dir, sign);
  while (next && next.readOnly) {
    next = stepInEntry(
      inputsByCell, membership,
      parseInt(next.dataset.row, 10), parseInt(next.dataset.col, 10),
      dir, sign
    );
  }
  return next;
}

// A dedicated function per cell -- not inlined in the row/col loop -- so
// each cell's listeners close over ITS OWN `input`/`row`/`col` bindings.
// `var input` inside a nested for loop is one shared binding for every
// iteration, so building the input inline left every cell's listener
// reading whichever input the loop had most recently created by the time
// the listener actually fired (a click, a keystroke) -- typing in the
// first cell silently changed the value of the last cell in the grid.
function buildCrosswordCellInput(taskId, row, col, answerChar, membership, inputsByCell, entries) {
  var input = document.createElement("input");
  input.type = "text";
  input.className = "ege-crossword-cell__input";
  input.maxLength = 1;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.dataset.row = String(row);
  input.dataset.col = String(col);
  input.dataset.answerChar = answerChar;
  input.setAttribute("aria-label", "Row " + (row + 1) + ", column " + (col + 1));

  input.addEventListener("mousedown", function () {
    if (document.activeElement !== input) return;
    var memb = membership[row + "," + col] || {};
    if (memb.across != null && memb.down != null) {
      setActiveDir(taskId, getActiveDir(taskId) === "across" ? "down" : "across");
      paintCrosswordActive(taskId, entries, membership);
    }
  });

  input.addEventListener("focus", function () {
    var memb = membership[row + "," + col] || {};
    var dir = getActiveDir(taskId);
    if (memb[dir] == null) dir = memb.across != null ? "across" : "down";
    setActiveDir(taskId, dir);
    paintCrosswordActive(taskId, entries, membership);
  });

  // Hovering a cell previews its clue too, without touching focus/typing --
  // moving away falls back to whatever's actually focused (or nothing).
  input.addEventListener("mouseenter", function () {
    if (document.activeElement === input) return;
    var memb = membership[row + "," + col] || {};
    var dir = memb.across != null ? "across" : "down";
    var entry = entries[memb[dir]];
    if (entry) setClueBarText(taskId, entryClueLabel(entry), input, entryInputs(taskId, entry));
  });

  input.addEventListener("mouseleave", function () {
    if (document.activeElement === input) return;
    paintCrosswordActive(taskId, entries, membership);
  });

  input.addEventListener("input", function () {
    input.value = input.value.replace(/[^a-zA-Z]/g, "").slice(-1).toUpperCase();
    input.classList.remove("is-correct", "is-wrong", "is-revealed");
    E.hideScoreFeedback(taskId);
    E.syncCrosswordCheckEnabled(taskId);
    if (input.value) {
      var next = stepPastHinted(inputsByCell, membership, row, col, getActiveDir(taskId), 1);
      if (next) next.focus();
    }
  });

  input.addEventListener("keydown", function (event) {
    var dir = getActiveDir(taskId);
    // A locked (hint-revealed) square swallows typing, so pass a typed
    // letter on to the next open square instead of stalling there.
    if (input.readOnly && /^[a-zA-Z]$/.test(event.key)) {
      event.preventDefault();
      var ahead = stepPastHinted(inputsByCell, membership, row, col, dir, 1);
      if (ahead) {
        ahead.focus();
        ahead.value = event.key;
        ahead.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    if (event.key === "Backspace" && (!input.value || input.readOnly)) {
      var prev = stepPastHinted(inputsByCell, membership, row, col, dir, -1);
      if (prev) {
        event.preventDefault();
        prev.value = "";
        prev.classList.remove("is-correct", "is-wrong", "is-revealed");
        E.hideScoreFeedback(taskId);
        E.syncCrosswordCheckEnabled(taskId);
        prev.focus();
      }
      return;
    }
    var moves = {
      ArrowLeft: [0, -1, "across"],
      ArrowRight: [0, 1, "across"],
      ArrowUp: [-1, 0, "down"],
      ArrowDown: [1, 0, "down"],
    };
    var move = moves[event.key];
    if (!move) return;
    var target = stepAny(inputsByCell, row, col, move[0], move[1]);
    if (!target) return;
    event.preventDefault();
    setActiveDir(taskId, move[2]);
    target.focus();
  });

  return input;
}

function paintCrossword(taskId) {
  var task = E.findTask(taskId);
  var el = taskEl(taskId);
  if (!task || !el) return;
  var puzzle = ensurePuzzle(task);

  var solution = {};
  var numberAt = {};
  var givenAt = {};
  var membership = {};
  puzzle.entries.forEach(function (entry, index) {
    var key = entry.row + "," + entry.col;
    if (!numberAt[key]) numberAt[key] = entry.number;
    if (entry.hint) {
      // The base word's first letter comes pre-filled, on the square where
      // that word starts inside the answer -- past any prefix (UNABLE's "A"
      // is its third square, not the U).
      var hintPos = entryCellPositions(entry)[entry.hintAt || 0];
      givenAt[hintPos.r + "," + hintPos.c] = true;
    }
    entryCellPositions(entry).forEach(function (pos) {
      var posKey = pos.r + "," + pos.c;
      if (!membership[posKey]) membership[posKey] = {};
      membership[posKey][entry.dir] = index;
    });
  });
  puzzle.cells.forEach(function (cell) {
    solution[cell[0] + "," + cell[1]] = cell[2];
  });

  var grid = el.querySelector(".ege-crossword__grid");
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = "repeat(" + puzzle.cols + ", var(--ege-crossword-cell, 2.1em))";

  var inputsByCell = {};

  for (var r = 0; r < puzzle.rows; r += 1) {
    for (var c = 0; c < puzzle.cols; c += 1) {
      var key = r + "," + c;
      if (!(key in solution)) {
        var blocked = document.createElement("div");
        blocked.className = "ege-crossword-cell ege-crossword-cell--blocked";
        blocked.setAttribute("aria-hidden", "true");
        grid.appendChild(blocked);
        continue;
      }

      var cellElNode = document.createElement("div");
      cellElNode.className = "ege-crossword-cell";

      if (numberAt[key]) {
        var num = document.createElement("span");
        num.className = "ege-crossword-cell__num";
        num.textContent = String(numberAt[key]);
        cellElNode.appendChild(num);
      }

      var input = buildCrosswordCellInput(taskId, r, c, solution[key], membership, inputsByCell, puzzle.entries);
      if (givenAt[key]) {
        // Locked like a hint-revealed letter: skipped by typing/backspace,
        // kept through Reset, never offered as a hint target.
        input.value = solution[key];
        input.readOnly = true;
        input.classList.add("is-given");
        input.setAttribute("aria-label", input.getAttribute("aria-label") + ", given letter " + solution[key]);
      }
      cellElNode.appendChild(input);
      grid.appendChild(cellElNode);
      inputsByCell[key] = input;
    }
  }

  setClueBarText(taskId, "");
  if (wordPickFor === taskId) stopWordPick();
  E.hideScoreFeedback(taskId);
  var taskArticle = document.getElementById("task-" + taskId);
  if (taskArticle) delete taskArticle.dataset.answersRevealed;
  E.syncCrosswordCheckEnabled(taskId);
}

E.newCrosswordPuzzle = function newCrosswordPuzzle(taskId) {
  var task = E.findTask(taskId);
  if (!task) return;
  ensureState(taskId).puzzle = null;
  paintCrossword(taskId);
};

function crosswordStartEl(taskId) {
  return document.getElementById("crossword-start-" + taskId);
}

function crosswordBoardBodyEl(taskId) {
  return document.getElementById("crossword-board-" + taskId);
}

// "New puzzle" opens this picker instead of regenerating outright, so
// picking a word count is a deliberate pre-game step every time rather
// than a toolbar control easy to leave on whatever it last was.
E.showCrosswordPicker = function showCrosswordPicker(taskId) {
  if (wordPickFor === taskId) stopWordPick();
  var s = ensureState(taskId);
  s.picking = true;
  var startEl = crosswordStartEl(taskId);
  var boardBody = crosswordBoardBodyEl(taskId);
  if (startEl) startEl.hidden = false;
  if (boardBody) boardBody.hidden = true;
  // No grid on the setup screen, so Check/Show answers would be dead buttons.
  var article = taskEl(taskId);
  if (article) article.classList.add("is-crossword-setup");
  E.hideScoreFeedback(taskId);
};

E.hideCrosswordPicker = function hideCrosswordPicker(taskId) {
  var s = ensureState(taskId);
  s.picking = false;
  var startEl = crosswordStartEl(taskId);
  var boardBody = crosswordBoardBodyEl(taskId);
  if (startEl) startEl.hidden = true;
  if (boardBody) boardBody.hidden = false;
  var article = taskEl(taskId);
  if (article) article.classList.remove("is-crossword-setup");
};

E.startCrosswordPuzzle = function startCrosswordPuzzle(taskId, count) {
  var s = ensureState(taskId);
  s.wordCount = Math.max(MIN_WORDS, Math.min(MAX_WORDS, parseInt(count, 10) || s.wordCount));
  s.puzzle = null;
  E.hideCrosswordPicker(taskId);
  paintCrossword(taskId);
};

// Word-count picker shown in place of the grid, as its own pre-game step --
// see E.showCrosswordPicker/startCrosswordPuzzle above.
function buildCrosswordStartPanel(task) {
  var start = document.createElement("div");
  start.className = "ege-crossword__start";
  start.id = "crossword-start-" + task.id;
  start.hidden = true;

  var icon = document.createElement("img");
  icon.className = "ege-crossword__start-icon";
  icon.src = "assets/shuffle.png";
  icon.alt = "";
  start.appendChild(icon);

  var heading = document.createElement("p");
  heading.className = "ege-crossword__start-title";
  heading.textContent = "New crossword";
  start.appendChild(heading);

  var subtitle = document.createElement("p");
  subtitle.className = "ege-crossword__start-label";
  subtitle.textContent = "How many words?";
  start.appendChild(subtitle);

  var chips = document.createElement("div");
  chips.className = "ege-crossword__count-chips";
  var selected = ensureState(task.id, task).wordCount;
  var chipButtons = [];
  for (var n = MIN_WORDS; n <= MAX_WORDS; n += 1) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ege-crossword__count-chip";
    chip.textContent = String(n);
    chip.dataset.count = String(n);
    chip.setAttribute("aria-pressed", String(n === selected));
    chip.classList.toggle("is-selected", n === selected);
    chip.addEventListener("click", function () {
      selected = parseInt(this.dataset.count, 10);
      chipButtons.forEach(function (btn) {
        var isSelected = parseInt(btn.dataset.count, 10) === selected;
        btn.classList.toggle("is-selected", isSelected);
        btn.setAttribute("aria-pressed", String(isSelected));
      });
    });
    chipButtons.push(chip);
    chips.appendChild(chip);
  }
  start.appendChild(chips);

  var generateBtn = document.createElement("button");
  generateBtn.type = "button";
  generateBtn.className = "ege-btn ege-btn--primary ege-btn--small";
  generateBtn.textContent = "Generate puzzle";
  generateBtn.addEventListener("click", function () {
    E.startCrosswordPuzzle(task.id, selected);
  });
  start.appendChild(generateBtn);

  return start;
}

E.renderCrossword = function renderCrossword(task, topicId) {
  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--crossword");

  var board = document.createElement("div");
  board.className = "ege-crossword";
  board.id = "crossword-" + task.id;
  board.appendChild(buildCrosswordStartPanel(task));

  // boardBody (toolbar + grid) hides in favor of the start panel above
  // while a new puzzle's word count is being chosen.
  var boardBody = document.createElement("div");
  boardBody.className = "ege-crossword__body";
  boardBody.id = "crossword-board-" + task.id;

  var toolbar = document.createElement("div");
  toolbar.className = "ege-crossword__toolbar";

  var hintGroup = document.createElement("div");
  hintGroup.className = "ege-crossword__hint-group";
  var hintBtn = document.createElement("button");
  hintBtn.type = "button";
  hintBtn.id = "crossword-hint-btn-" + task.id;
  hintBtn.className = "ege-btn ege-btn--ghost ege-btn--small";
  hintBtn.textContent = "Hint";
  hintBtn.addEventListener("click", function () {
    E.openCrosswordHint(task.id);
  });
  hintGroup.appendChild(hintBtn);
  var hintStatus = document.createElement("span");
  hintStatus.className = "ege-crossword__hint-status";
  hintStatus.id = "crossword-hint-status-" + task.id;
  hintStatus.setAttribute("aria-live", "polite");
  hintGroup.appendChild(hintStatus);
  toolbar.appendChild(hintGroup);

  var newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "ege-btn ege-btn--ghost ege-btn--small";
  newBtn.textContent = "New puzzle";
  newBtn.addEventListener("click", function () {
    E.showCrosswordPicker(task.id);
  });
  toolbar.appendChild(newBtn);
  boardBody.appendChild(toolbar);

  // gridWrap only anchors the floating clue tooltip (position: relative) and
  // must not clip it, so the horizontally-scrolling area (needed for wide
  // puzzles) is a separate inner element -- gridScroll -- rather than
  // gridWrap itself: overflow-x: auto on gridWrap would also clip the
  // tooltip's vertical overflow above it.
  var gridWrap = document.createElement("div");
  gridWrap.className = "ege-crossword__grid-wrap";

  // The clue floats as an overlay anchored to gridWrap (see .ege-crossword__
  // clue's position: absolute) instead of sitting in normal flow, so
  // showing/hiding it on hover or click never shifts the grid or anything
  // else on the page -- the puzzle's position stays fixed at all times.
  var clueBar = document.createElement("p");
  clueBar.className = "ege-crossword__clue";
  clueBar.id = "crossword-clue-" + task.id;
  clueBar.hidden = true;
  gridWrap.appendChild(clueBar);

  var gridScroll = document.createElement("div");
  gridScroll.className = "ege-crossword__grid-scroll";
  var grid = document.createElement("div");
  grid.className = "ege-crossword__grid";
  bindWordPick(grid, task.id);
  gridScroll.appendChild(grid);
  gridWrap.appendChild(gridScroll);
  boardBody.appendChild(gridWrap);
  board.appendChild(boardBody);

  wrap.appendChild(E.buildPanel("", board, "ege-panel--work ege-panel--crossword"));
  wrap.appendChild(E.buildTaskFooter(task.id, E.taskMaxScore(task), { showAnswers: true }));

  // The article is not in the document yet, so paint once it is.
  setTimeout(function () {
    paintCrossword(task.id);
  }, 0);

  return wrap;
};
