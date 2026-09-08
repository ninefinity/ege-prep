import { E } from "./runtime.js";

/* "pronounce" tasks drill task 39's reading-aloud skill: a word is shown,
   the student reads it aloud to themselves, presses Listen to hear the
   correct pronunciation, and self-reports whether they matched it. There is
   no right-answer key to check against, so this type has no
   Check/Reset/Show-answers footer.

   Words are one card at a time in a horizontally scroll-snapped strip --
   Prev/Next move it, but so does a plain swipe/drag, since the strip is a
   real scroll container rather than a JS-driven slider. A word marked
   correct is "mastered" and persists in localStorage forever; a wrong mark
   reveals the IPA + note as a tip and leaves the word in the deck. The
   "Hide mastered" toggle (shared across every reading-skills deck) filters
   mastered words out of the strip rather than the app auto-cycling them --
   flipping it off brings everything back, mastered words included, so
   progress stays visible instead of disappearing. Shuffle reorders the
   deck; the order is session-only, not persisted. */

var MASTERED_KEY = "ege-prep.pronounce.mastered.v1";
var HIDE_KEY = "ege-prep.pronounce.hideCompleted.v1";
var revealed = {}; // taskId -> { [wordId]: true } -- session-only, not persisted
var order = {}; // taskId -> word ids in current (possibly shuffled) order
var index = {}; // taskId -> current card position within the active (filtered) list
// taskId -> word id that stays in the deck even though "Hide mastered" would
// otherwise drop it -- without this, marking a word correct instantly
// removed its own card (hide-mastered filters live), so a student who
// immediately realized they'd mismarked it had nothing left on screen to
// correct themselves with. Cleared once they move to a different card,
// since staying put is only for "let me reconsider this one right now".
var pinned = {};

function loadMasteredStore() {
  try {
    return JSON.parse(localStorage.getItem(MASTERED_KEY) || "{}") || {};
  } catch (err) {
    return {};
  }
}

function saveMasteredStore(store) {
  try {
    localStorage.setItem(MASTERED_KEY, JSON.stringify(store));
  } catch (err) {
    /* ignore */
  }
}

E.pronounceMasteredIds = function pronounceMasteredIds(taskId) {
  return loadMasteredStore()[taskId] || [];
};

E.isPronounceWordMastered = function isPronounceWordMastered(taskId, wordId) {
  return E.pronounceMasteredIds(taskId).indexOf(wordId) !== -1;
};

E.setPronounceWordMastered = function setPronounceWordMastered(taskId, wordId, mastered) {
  var store = loadMasteredStore();
  var ids = store[taskId] || [];
  var at = ids.indexOf(wordId);
  if (mastered && at === -1) ids = ids.concat([wordId]);
  else if (!mastered && at !== -1) ids = ids.slice(0, at).concat(ids.slice(at + 1));
  else return;
  store[taskId] = ids;
  saveMasteredStore(store);
};

E.resetPronounceMastered = function resetPronounceMastered(taskId) {
  var store = loadMasteredStore();
  delete store[taskId];
  saveMasteredStore(store);
};

E.loadPronounceHideCompleted = function loadPronounceHideCompleted() {
  try {
    // Hidden by default -- a mastered word is meant to stop appearing.
    var raw = localStorage.getItem(HIDE_KEY);
    return raw == null ? true : raw === "1";
  } catch (err) {
    return true;
  }
};

E.savePronounceHideCompleted = function savePronounceHideCompleted(hide) {
  try {
    localStorage.setItem(HIDE_KEY, hide ? "1" : "0");
  } catch (err) {
    /* ignore */
  }
};

E.speakPronounceWord = function speakPronounceWord(text) {
  if (!text || typeof window === "undefined" || !window.speechSynthesis) return false;
  try {
    window.speechSynthesis.cancel();
    var utter = new window.SpeechSynthesisUtterance(text);
    utter.lang = "en-GB";
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
    return true;
  } catch (err) {
    return false;
  }
};

function wordOrder(task) {
  if (!order[task.id]) {
    order[task.id] = (task.words || []).map(function (word) {
      return word.id;
    });
  }
  return order[task.id];
}

E.shufflePronounceDeck = function shufflePronounceDeck(taskId) {
  var task = E.findTask(taskId);
  if (!task) return;
  var ids = wordOrder(task).slice();
  for (var i = ids.length - 1; i > 0; i -= 1) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }
  order[taskId] = ids;
  index[taskId] = 0;
  delete pinned[taskId];
  E.refreshPronounceDeck(taskId, { instant: true });
};

function activeWords(task) {
  var byId = {};
  (task.words || []).forEach(function (word) {
    byId[word.id] = word;
  });
  var hide = E.loadPronounceHideCompleted();
  var pin = pinned[task.id];
  return wordOrder(task)
    .filter(function (id) {
      return !hide || id === pin || !E.isPronounceWordMastered(task.id, id);
    })
    .map(function (id) {
      return byId[id];
    })
    .filter(Boolean);
}

function clampIndex(taskId, len) {
  var current = index[taskId] || 0;
  index[taskId] = len <= 0 ? 0 : Math.max(0, Math.min(current, len - 1));
  return index[taskId];
}

function getViewport(taskId) {
  var taskEl = document.getElementById("task-" + taskId);
  return taskEl && taskEl.querySelector(".ege-pronounce__viewport");
}

function scrollToIndex(taskId, opts) {
  var viewport = getViewport(taskId);
  if (!viewport) return;
  var card = viewport.querySelectorAll(".ege-pronounce__card")[index[taskId] || 0];
  if (!card) return;
  viewport.scrollTo({
    left: card.offsetLeft,
    behavior: opts && opts.instant ? "auto" : "smooth",
  });
}

function syncNav(taskId, words) {
  var taskEl = document.getElementById("task-" + taskId);
  if (!taskEl) return;
  var i = index[taskId] || 0;
  var counter = taskEl.querySelector(".ege-pronounce__counter");
  if (counter) counter.textContent = words.length ? i + 1 + " / " + words.length : "";
  var prevBtn = taskEl.querySelector(".ege-pronounce__nav--prev");
  var nextBtn = taskEl.querySelector(".ege-pronounce__nav--next");
  if (prevBtn) prevBtn.disabled = i <= 0;
  if (nextBtn) nextBtn.disabled = i >= words.length - 1;
}

function buildWordCard(task, word) {
  var mastered = E.isPronounceWordMastered(task.id, word.id);
  var isRevealed = !!(revealed[task.id] && revealed[task.id][word.id]);

  var card = document.createElement("div");
  card.className = "ege-pronounce__card" + (mastered ? " is-mastered" : "");
  card.dataset.wordId = word.id;

  var head = document.createElement("div");
  head.className = "ege-pronounce__head";

  var text = document.createElement("span");
  text.className = "ege-pronounce__word";
  text.textContent = word.text;
  head.appendChild(text);

  var listenBtn = document.createElement("button");
  listenBtn.type = "button";
  listenBtn.className = "ege-pronounce__listen";
  listenBtn.textContent = "🔊 Listen";
  listenBtn.addEventListener("click", function () {
    E.speakPronounceWord(word.text);
  });
  head.appendChild(listenBtn);

  card.appendChild(head);

  var marks = document.createElement("div");
  marks.className = "ege-pronounce__marks";

  var tick = document.createElement("button");
  tick.type = "button";
  tick.className =
    "ege-pronounce__mark ege-pronounce__mark--correct" + (mastered ? " is-active" : "");
  tick.dataset.pronounceMark = "correct";
  tick.setAttribute("aria-label", "I said it correctly");
  tick.textContent = "✓";
  tick.addEventListener("click", function () {
    E.markPronounceWord(task.id, word.id, true);
  });
  marks.appendChild(tick);

  var cross = document.createElement("button");
  cross.type = "button";
  cross.className =
    "ege-pronounce__mark ege-pronounce__mark--wrong" + (isRevealed && !mastered ? " is-active" : "");
  cross.dataset.pronounceMark = "wrong";
  cross.setAttribute("aria-label", "I said it wrong");
  cross.textContent = "✗";
  cross.addEventListener("click", function () {
    E.markPronounceWord(task.id, word.id, false);
  });
  marks.appendChild(cross);

  card.appendChild(marks);

  var tip = document.createElement("p");
  tip.className = "ege-pronounce__tip";
  tip.hidden = !isRevealed;
  var ipa = document.createElement("span");
  ipa.className = "ege-pronounce__tip-ipa";
  ipa.textContent = word.ipa || "";
  tip.appendChild(ipa);
  if (word.note) {
    tip.appendChild(document.createTextNode(" " + word.note));
  }
  card.appendChild(tip);

  return card;
}

function buildTrack(task, words) {
  var track = document.createElement("div");
  track.className = "ege-pronounce__track";
  words.forEach(function (word) {
    track.appendChild(buildWordCard(task, word));
  });
  return track;
}

E.refreshPronounceDeck = function refreshPronounceDeck(taskId, opts) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "pronounce") return;
  var taskEl = document.getElementById("task-" + taskId);
  if (!taskEl) return;

  var words = activeWords(task);
  clampIndex(taskId, words.length);

  var viewport = taskEl.querySelector(".ege-pronounce__viewport");
  if (viewport) {
    viewport.innerHTML = "";
    viewport.appendChild(buildTrack(task, words));
  }

  var allWords = task.words || [];
  var masteredCount = allWords.filter(function (word) {
    return E.isPronounceWordMastered(taskId, word.id);
  }).length;
  var progress = taskEl.querySelector(".ege-pronounce__progress");
  if (progress) progress.textContent = masteredCount + " / " + allWords.length + " mastered";

  var toggle = taskEl.querySelector(".ege-pronounce__hide-toggle");
  var hide = E.loadPronounceHideCompleted();
  if (toggle) {
    toggle.classList.toggle("is-active", hide);
    toggle.setAttribute("aria-pressed", hide ? "true" : "false");
  }

  var allMastered = allWords.length > 0 && masteredCount === allWords.length;
  var empty = taskEl.querySelector(".ege-pronounce__empty");
  if (empty) empty.hidden = words.length > 0;
  if (viewport) viewport.hidden = words.length === 0;
  var nav = taskEl.querySelector(".ege-pronounce__navbar");
  if (nav) nav.hidden = words.length === 0;

  syncNav(taskId, words);
  scrollToIndex(taskId, opts);

  var wasFullyMastered = taskEl.dataset.pronounceMastered === "1";
  if (allMastered && !wasFullyMastered && progress) {
    if (typeof E.flashMoodSticker === "function") E.flashMoodSticker(progress, "confetti");
  }
  taskEl.dataset.pronounceMastered = allMastered ? "1" : "0";
};

E.markPronounceWord = function markPronounceWord(taskId, wordId, correct) {
  E.setPronounceWordMastered(taskId, wordId, correct);
  pinned[taskId] = wordId;
  if (!revealed[taskId]) revealed[taskId] = {};
  revealed[taskId][wordId] = !correct;

  if (correct) {
    var card = document.querySelector(
      '#task-' + taskId + ' .ege-pronounce__card[data-word-id="' + wordId + '"]'
    );
    var tick = card && card.querySelector('[data-pronounce-mark="correct"]');
    if (tick && typeof E.flashMoodSticker === "function") {
      E.flashMoodSticker(tick, "like");
    }
  }

  E.refreshPronounceDeck(taskId, { instant: true });
};

E.togglePronounceHideCompleted = function togglePronounceHideCompleted(taskId) {
  E.savePronounceHideCompleted(!E.loadPronounceHideCompleted());
  E.refreshPronounceDeck(taskId, { instant: true });
};

E.stepPronounceDeck = function stepPronounceDeck(taskId, delta) {
  var task = E.findTask(taskId);
  if (!task) return;
  // Clearing the pin here can change what activeWords() returns (a word
  // pinned in view while the student reconsidered it now drops out) --
  // rebuild the track instead of just scrolling the existing one, or the
  // strip and the "x / y" counter drift out of sync with what's rendered.
  var hadPin = pinned[taskId] != null;
  delete pinned[taskId];
  var words = activeWords(task);
  var next = (index[taskId] || 0) + delta;
  index[taskId] = Math.max(0, Math.min(next, words.length - 1));
  if (hadPin) {
    E.refreshPronounceDeck(taskId, { instant: true });
    return;
  }
  syncNav(taskId, words);
  scrollToIndex(taskId);
};

function bindViewportScroll(taskId, viewport) {
  var timer = 0;
  viewport.addEventListener("scroll", function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      var task = E.findTask(taskId);
      if (!task) return;
      var cards = viewport.querySelectorAll(".ege-pronounce__card");
      var left = viewport.scrollLeft;
      var nearest = 0;
      var best = Infinity;
      cards.forEach(function (card, i) {
        var d = Math.abs(card.offsetLeft - left);
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      index[taskId] = nearest;
      syncNav(taskId, activeWords(task));
    }, 120);
  });
}

E.renderPronounce = function renderPronounce(task, topicId) {
  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--pronounce");

  var tools = document.createElement("div");
  tools.className = "ege-skills-tools";

  var shuffleBtn = document.createElement("button");
  shuffleBtn.type = "button";
  shuffleBtn.className = "ege-pronounce__hide-toggle";
  shuffleBtn.textContent = "🔀 Shuffle";
  shuffleBtn.addEventListener("click", function () {
    E.shufflePronounceDeck(task.id);
  });
  tools.appendChild(shuffleBtn);

  var hide = E.loadPronounceHideCompleted();
  var hideToggle = document.createElement("button");
  hideToggle.type = "button";
  hideToggle.className = "ege-pronounce__hide-toggle" + (hide ? " is-active" : "");
  hideToggle.textContent = "Hide mastered";
  hideToggle.setAttribute("aria-pressed", hide ? "true" : "false");
  hideToggle.addEventListener("click", function () {
    E.togglePronounceHideCompleted(task.id);
  });
  tools.appendChild(hideToggle);

  var resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "ege-btn ege-btn--ghost ege-btn--small";
  resetBtn.textContent = "Reset progress";
  resetBtn.addEventListener("click", function () {
    E.resetPronounceMastered(task.id);
    revealed[task.id] = {};
    E.refreshPronounceDeck(task.id, { instant: true });
  });
  tools.appendChild(resetBtn);

  wrap.appendChild(tools);

  var words = task.words || [];
  var masteredCount = words.filter(function (word) {
    return E.isPronounceWordMastered(task.id, word.id);
  }).length;

  var progress = document.createElement("p");
  progress.className = "ege-pronounce__progress";
  progress.textContent = masteredCount + " / " + words.length + " mastered";
  wrap.appendChild(progress);

  var active = activeWords(task);
  clampIndex(task.id, active.length);

  var viewport = document.createElement("div");
  viewport.className = "ege-pronounce__viewport";
  viewport.hidden = active.length === 0;
  viewport.appendChild(buildTrack(task, active));
  wrap.appendChild(viewport);
  bindViewportScroll(task.id, viewport);

  var navbar = document.createElement("div");
  navbar.className = "ege-pronounce__navbar";
  navbar.hidden = active.length === 0;

  var prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "ege-pronounce__nav ege-pronounce__nav--prev";
  prevBtn.textContent = "‹ Prev";
  prevBtn.disabled = (index[task.id] || 0) <= 0;
  prevBtn.addEventListener("click", function () {
    E.stepPronounceDeck(task.id, -1);
  });
  navbar.appendChild(prevBtn);

  var counter = document.createElement("span");
  counter.className = "ege-pronounce__counter";
  counter.textContent = active.length ? (index[task.id] || 0) + 1 + " / " + active.length : "";
  navbar.appendChild(counter);

  var nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "ege-pronounce__nav ege-pronounce__nav--next";
  nextBtn.textContent = "Next ›";
  nextBtn.disabled = (index[task.id] || 0) >= active.length - 1;
  nextBtn.addEventListener("click", function () {
    E.stepPronounceDeck(task.id, 1);
  });
  navbar.appendChild(nextBtn);

  wrap.appendChild(navbar);

  var allMastered = words.length > 0 && masteredCount === words.length;
  wrap.dataset.pronounceMastered = allMastered ? "1" : "0";

  var empty = document.createElement("p");
  empty.className = "ege-pronounce__empty";
  empty.hidden = active.length > 0;
  empty.textContent = "All words mastered! Turn off “Hide mastered” to practise them again.";
  wrap.appendChild(empty);

  return wrap;
};
