import { E } from "./runtime.js";

/* "pronounce" tasks drill task 39's reading-aloud skill: a word is shown,
   the student reads it aloud to themselves, presses Listen to hear the
   correct pronunciation, and self-reports whether they matched it. There is
   no right-answer key to check against -- the tick/cross is the student's
   own judgement, so this type has no Check/Reset/Show-answers footer.

   A word marked correct is "mastered" and persists in localStorage forever;
   a wrong mark reveals the IPA + note as a tip and leaves the word in the
   rotation. The "Hide mastered" toggle (shared across every reading-skills
   deck) filters mastered words out of the list rather than the app
   auto-cycling them -- flipping it off brings everything back, mastered
   words included, so progress stays visible instead of disappearing. */

var MASTERED_KEY = "ege-prep.pronounce.mastered.v1";
var HIDE_KEY = "ege-prep.pronounce.hideCompleted.v1";
var revealed = {}; // taskId -> { [wordId]: true } -- session-only, not persisted

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

E.syncPronounceCard = function syncPronounceCard(taskId, word) {
  var card = document.querySelector(
    '#task-' + taskId + ' .ege-pronounce__card[data-word-id="' + word.id + '"]'
  );
  if (!card) return;
  var mastered = E.isPronounceWordMastered(taskId, word.id);
  var isRevealed = !!(revealed[taskId] && revealed[taskId][word.id]);
  card.classList.toggle("is-mastered", mastered);
  card.hidden = mastered && E.loadPronounceHideCompleted();

  var tip = card.querySelector(".ege-pronounce__tip");
  if (tip) tip.hidden = !isRevealed;

  var tick = card.querySelector('[data-pronounce-mark="correct"]');
  var cross = card.querySelector('[data-pronounce-mark="wrong"]');
  if (tick) tick.classList.toggle("is-active", mastered);
  if (cross) cross.classList.toggle("is-active", isRevealed && !mastered);
};

E.syncPronounceDeck = function syncPronounceDeck(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "pronounce") return;
  var taskEl = document.getElementById("task-" + taskId);
  if (!taskEl) return;
  var words = task.words || [];
  var hide = E.loadPronounceHideCompleted();
  var masteredCount = words.filter(function (word) {
    return E.isPronounceWordMastered(taskId, word.id);
  }).length;

  words.forEach(function (word) {
    E.syncPronounceCard(taskId, word);
  });

  var progress = taskEl.querySelector(".ege-pronounce__progress");
  if (progress) {
    progress.textContent = masteredCount + " / " + words.length + " mastered";
  }

  var toggle = taskEl.querySelector(".ege-pronounce__hide-toggle");
  if (toggle) {
    toggle.classList.toggle("is-active", hide);
    toggle.setAttribute("aria-pressed", hide ? "true" : "false");
  }

  var empty = taskEl.querySelector(".ege-pronounce__empty");
  var allMastered = words.length > 0 && masteredCount === words.length;
  if (empty) empty.hidden = !(hide && allMastered);

  var wasFullyMastered = taskEl.dataset.pronounceMastered === "1";
  if (allMastered && !wasFullyMastered) {
    var anchor = taskEl.querySelector(".ege-pronounce__progress");
    if (anchor && typeof E.flashMoodSticker === "function") {
      E.flashMoodSticker(anchor, "confetti");
    }
  }
  taskEl.dataset.pronounceMastered = allMastered ? "1" : "0";
};

E.markPronounceWord = function markPronounceWord(taskId, wordId, correct) {
  var taskEl = document.getElementById("task-" + taskId);
  if (taskEl && taskEl.dataset.answersRevealed === "1") return;
  E.setPronounceWordMastered(taskId, wordId, correct);
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

  E.syncPronounceDeck(taskId);
};

E.togglePronounceHideCompleted = function togglePronounceHideCompleted(taskId) {
  E.savePronounceHideCompleted(!E.loadPronounceHideCompleted());
  E.syncPronounceDeck(taskId);
};

function buildWordCard(task, word) {
  var mastered = E.isPronounceWordMastered(task.id, word.id);
  var hide = E.loadPronounceHideCompleted();

  var card = document.createElement("div");
  card.className = "ege-pronounce__card" + (mastered ? " is-mastered" : "");
  card.dataset.wordId = word.id;
  card.hidden = mastered && hide;

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
  cross.className = "ege-pronounce__mark ege-pronounce__mark--wrong";
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
  tip.hidden = true;
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

E.renderPronounce = function renderPronounce(task, topicId) {
  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--pronounce");

  var tools = document.createElement("div");
  tools.className = "ege-skills-tools";

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
    E.syncPronounceDeck(task.id);
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

  var list = document.createElement("div");
  list.className = "ege-pronounce__list";
  words.forEach(function (word) {
    list.appendChild(buildWordCard(task, word));
  });
  wrap.appendChild(list);

  var allMastered = words.length > 0 && masteredCount === words.length;
  wrap.dataset.pronounceMastered = allMastered ? "1" : "0";

  var empty = document.createElement("p");
  empty.className = "ege-pronounce__empty";
  empty.hidden = !(hide && allMastered);
  empty.textContent = "All words mastered! Turn off “Hide mastered” to practise them again.";
  wrap.appendChild(empty);

  return wrap;
};
