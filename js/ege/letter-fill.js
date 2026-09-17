import { E } from "./runtime.js";

/* "letterfill" drills a set-phrase gap fill: a short passage (a letter,
   most often) with certain words blanked out one letter-box at a time --
   see the freshwater-ecosystems mock in the design brief. Each gap can
   optionally reveal its first few letters (item.gap.given) as a nudge;
   the rest render as empty boxes the student types into, one character
   per box, focus auto-advancing as they go.

   Unlike wordform (one gap = one text input, answered from a side panel),
   here the boxes sit directly inline in the flowing text and there is no
   panel -- the passage IS the work area. That's also why this type lives
   in SKILLS_TASK_TYPES: no highlighter, no split-panel chrome, just the
   passage and a footer. */

function gapAnswerLength(gap) {
  return String(gap.answer || "").length;
}

function gapGivenLength(gap) {
  var given = gap.given || 0;
  var answerLen = gapAnswerLength(gap);
  return Math.max(0, Math.min(given, answerLen - 1));
}

E.letterfillGaps = function letterfillGaps(task) {
  var gaps = [];
  (task.lines || []).forEach(function (line) {
    (line.segments || []).forEach(function (segment) {
      if (segment.gap) gaps.push(segment.gap);
    });
  });
  return gaps;
};

// The full typed-so-far reconstruction of a gap: given letters, typed
// letters, AND the space separators of a multi-word answer (e.g. "have
// been") all in DOM order -- comparison strips whitespace anyway
// (E.normalizeAnswer), so this only has to read back what's on screen.
E.letterfillGapValue = function letterfillGapValue(taskId, gapIndex) {
  var boxes = document.querySelectorAll(
    '#task-' + taskId + ' .ege-letterfill-gap[data-gap-index="' + gapIndex + '"] .ege-letterfill-box'
  );
  var value = "";
  boxes.forEach(function (box) {
    if (box.classList.contains("ege-letterfill-box--blank")) {
      var input = box.querySelector(".ege-letterfill-box__input");
      value += (input && input.value) || "";
    } else if (box.classList.contains("ege-letterfill-box--given")) {
      value += box.textContent || "";
    } else {
      value += " ";
    }
  });
  return value;
};

E.letterfillGapBlankInputs = function letterfillGapBlankInputs(taskId, gapIndex) {
  return Array.prototype.slice.call(
    document.querySelectorAll(
      '#task-' +
        taskId +
        ' .ege-letterfill-gap[data-gap-index="' +
        gapIndex +
        '"] .ege-letterfill-box--blank .ege-letterfill-box__input'
    )
  );
};

E.allLetterfillFilled = function allLetterfillFilled(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "letterfill") return false;
  var gaps = E.letterfillGaps(task);
  return gaps.every(function (gap, index) {
    return E.letterfillGapBlankInputs(taskId, index).every(function (input) {
      return !!input.value;
    });
  });
};

E.letterfillHasAnyAnswer = function letterfillHasAnyAnswer(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "letterfill") return false;
  var gaps = E.letterfillGaps(task);
  return gaps.some(function (gap, index) {
    return E.letterfillGapBlankInputs(taskId, index).some(function (input) {
      return !!input.value;
    });
  });
};

E.syncLetterfillCheckEnabled = function syncLetterfillCheckEnabled(taskId) {
  E.syncCheckButton(taskId);
  E.syncResetButton(taskId);
  E.syncShowAnswersButton(taskId);
};

function focusInput(input) {
  if (!input) return;
  input.focus();
  if (typeof input.select === "function") input.select();
}

E.markLetterfillGap = function markLetterfillGap(taskId, task, gapIndex, opts) {
  opts = opts || {};
  var gap = E.letterfillGaps(task)[gapIndex];
  var group = document.querySelector(
    '#task-' + taskId + ' .ege-letterfill-gap[data-gap-index="' + gapIndex + '"]'
  );
  if (!gap || !group) return false;

  if (opts.reveal) {
    E.letterfillGapBlankInputs(taskId, gapIndex).forEach(function (input) {
      input.value = input.dataset.answerChar || "";
    });
    group.classList.remove("is-correct", "is-wrong");
    group.classList.add("is-revealed");
    return true;
  }

  var typed = E.letterfillGapValue(taskId, gapIndex);
  var valid = E.buildAcceptedAnswers(gap.answer, gap.alt).map(E.normalizeAnswer);
  var ok = !!typed && valid.indexOf(E.normalizeAnswer(typed)) !== -1;

  group.classList.remove("is-correct", "is-wrong", "is-revealed");
  if (typed) group.classList.add(ok ? "is-correct" : "is-wrong");
  return ok;
};

E.clearLetterfillGapMarks = function clearLetterfillGapMarks(taskId, gapIndex) {
  var group = document.querySelector(
    '#task-' + taskId + ' .ege-letterfill-gap[data-gap-index="' + gapIndex + '"]'
  );
  if (group) group.classList.remove("is-correct", "is-wrong", "is-revealed");
};

E.clearLetterfillGap = function clearLetterfillGap(taskId, gapIndex) {
  E.clearLetterfillGapMarks(taskId, gapIndex);
  E.letterfillGapBlankInputs(taskId, gapIndex).forEach(function (input) {
    input.value = "";
  });
};

function buildGapEl(task, taskId, gap, gapIndex, order) {
  var group = document.createElement("span");
  group.className = "ege-letterfill-gap";
  group.dataset.gapIndex = String(gapIndex);

  var answer = String(gap.answer || "");
  var givenLen = gapGivenLength(gap);

  // Character by character, not given-slice-then-blank-slice: a multi-word
  // answer like "have been" carries a space partway through, and a space is
  // never itself typed (see buildBlankBox's input filter) -- it renders as
  // plain spacing so the two words read naturally, and given/blank status is
  // decided per letter around it.
  answer.split("").forEach(function (ch, i) {
    if (ch === " ") {
      var spacer = document.createElement("span");
      spacer.className = "ege-letterfill-box ege-letterfill-box--space";
      spacer.setAttribute("aria-hidden", "true");
      group.appendChild(spacer);
      return;
    }
    if (i < givenLen) {
      var box = document.createElement("span");
      box.className = "ege-letterfill-box ege-letterfill-box--given";
      box.textContent = ch;
      group.appendChild(box);
      return;
    }
    group.appendChild(buildBlankBox(task, taskId, gapIndex, ch, i, answer.length, order));
  });

  return group;
}

function marksIndexOf(el, fallbackGapIndex) {
  var group = el.closest(".ege-letterfill-gap");
  return group ? parseInt(group.dataset.gapIndex, 10) : fallbackGapIndex;
}

// A dedicated function per box -- not inlined in the for loop above -- so
// each box's listeners close over ITS OWN `input`/`box` bindings. A `var`
// inside a for loop is shared by every iteration, so inlining this left
// every box in a gap firing on the last box created, not the one the
// student actually typed into.
function buildBlankBox(task, taskId, gapIndex, letter, letterIndex, answerLen, order) {
  var box = document.createElement("span");
  box.className = "ege-letterfill-box ege-letterfill-box--blank";

  var input = document.createElement("input");
  input.type = "text";
  input.className = "ege-letterfill-box__input";
  input.maxLength = 1;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.dataset.answerChar = letter;
  input.setAttribute(
    "aria-label",
    "Gap " + (gapIndex + 1) + ", letter " + (letterIndex + 1) + " of " + answerLen
  );

  input.addEventListener("input", function () {
    input.value = input.value.replace(/[^a-zA-Z]/g, "").slice(-1);
    E.clearLetterfillGapMarks(taskId, marksIndexOf(input, gapIndex));
    E.hideScoreFeedback(task.id);
    E.syncLetterfillCheckEnabled(task.id);
    if (input.value) {
      var pos = order.indexOf(input);
      focusInput(order[pos + 1]);
    }
  });

  input.addEventListener("keydown", function (event) {
    var pos = order.indexOf(input);
    if (event.key === "Backspace" && !input.value && pos > 0) {
      event.preventDefault();
      var prev = order[pos - 1];
      focusInput(prev);
      prev.value = "";
      E.clearLetterfillGapMarks(taskId, marksIndexOf(prev, gapIndex));
      E.hideScoreFeedback(task.id);
      E.syncLetterfillCheckEnabled(task.id);
      return;
    }
    if (event.key === "ArrowLeft" && pos > 0) {
      event.preventDefault();
      focusInput(order[pos - 1]);
      return;
    }
    if (event.key === "ArrowRight" && pos < order.length - 1) {
      event.preventDefault();
      focusInput(order[pos + 1]);
    }
  });

  order.push(input);
  box.appendChild(input);
  return box;
}

E.renderLetterFill = function renderLetterFill(task, topicId) {
  var max = E.taskMaxScore(task);
  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--letterfill");

  if (task.promptHtml) {
    var prompt = document.createElement("div");
    prompt.className = "ege-letterfill-prompt ege-writing-prompt ege-passage";
    prompt.innerHTML = task.promptHtml;
    wrap.appendChild(prompt);
  }

  var passage = document.createElement("div");
  passage.className = "ege-passage ege-letterfill-passage";
  if (task.contextTitle) {
    var meta = document.createElement("p");
    meta.className = "ege-letterfill-passage__title";
    meta.textContent = task.contextTitle;
    passage.appendChild(meta);
  }

  // Every blank input in the passage, in document order -- typing a letter
  // advances into this list regardless of which gap it belongs to, so
  // filling the passage reads as one continuous pass, not word-by-word.
  var order = [];
  var gapIndex = 0;
  (task.lines || []).forEach(function (line) {
    var p = document.createElement("p");
    p.className = "ege-letterfill-line";
    (line.segments || []).forEach(function (segment) {
      if (segment.gap) {
        p.appendChild(buildGapEl(task, task.id, segment.gap, gapIndex, order));
        gapIndex += 1;
      } else {
        p.appendChild(document.createTextNode(segment.text || ""));
      }
    });
    passage.appendChild(p);
  });

  // No "ege-panel--solo" here: that class caps the panel at a fixed
  // viewport-relative height with its own internal scrollbar, meant for a
  // side-by-side work panel. The reply letter is short and IS the task --
  // it should just grow to fit so nothing is hidden behind a scroll.
  wrap.appendChild(E.buildPanel("", passage, "ege-panel--read"));
  wrap.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));

  E.syncLetterfillCheckEnabled(task.id);
  return wrap;
};
