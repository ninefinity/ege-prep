import { E } from "./runtime.js";
import "./pronounce-deck.js";

/* "pronounce" tasks drill task 39's reading-aloud skill. One word at a time:
   the student reads it aloud, self-reports whether they matched the model,
   and a wrong mark reveals the IPA + note right there and sends the word to
   the back of the deck so it comes round again.

   The card shows the word and nothing else by default -- no IPA, no gating,
   no second listen button. IPA only appears once the student has gotten a
   word wrong (or all the time, if "Show IPA" is on). Prev/Next page through
   the deck freely, independent of marking; marking auto-advances on its own
   because the array shrinks (or the word moves to the back) under the
   cursor -- see pronounce-deck.js for why that can't skip a word the way the
   original implementation did.

   Order, recycling and mastery live in pronounce-deck.js. Here the array is
   read-only except through E.markPronounceWord / E.stepPronounceCursor: the
   current card is order[index], and the strip never holds more than the
   current card and the one after it -- the old code rebuilt every card in
   the deck on every tap, which cost a full localStorage re-read per word and
   destroyed the reward animation a frame after it started. */

var STICKER_HOLD_MS = 380;

// taskId -> true while a slide is running, so a double-tap can't start two.
var sliding = {};
// taskId -> true when the card on screen is a wrong-mark reveal that the
// array has already moved past (see revealInPlace). The screen is
// deliberately left showing the word the student just got wrong rather than
// the array's new current entry, so the array and the DOM disagree about
// "current" until the student navigates away -- exactly the mismatch that
// caused the original skip bug, just held open on purpose for one card. The
// first Prev/Next/swipe after a reveal has to resolve that mismatch by
// catching the screen up to the array, not by ALSO stepping the cursor --
// stepping on top of an already-advanced array is what skipped a word
// before.
var pendingReveal = {};

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (err) {
    return false;
  }
}

/* ------------------------------------------------------------- speech */

/* getVoices() is empty on the first call in Chrome and fills in later, so an
   empty list cannot be read as "this device has no English voice" until the
   browser says so. Stay optimistic while pending; only report "none" once
   voiceschanged has fired (or the wait has clearly timed out). */
var speechState = "pending"; // "pending" | "ok" | "none"
var speechWired = false;

function englishVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  var voices = [];
  try {
    voices = window.speechSynthesis.getVoices() || [];
  } catch (err) {
    return null;
  }
  var gb = null;
  var any = null;
  for (var i = 0; i < voices.length; i += 1) {
    var lang = String(voices[i].lang || "").replace("_", "-");
    if (lang === "en-GB" && !gb) gb = voices[i];
    if (lang.indexOf("en") === 0 && !any) any = voices[i];
  }
  return gb || any;
}

function settleSpeechState() {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    speechState = "none";
  } else {
    speechState = englishVoice() ? "ok" : "none";
  }
  syncAllListenButtons();
}

function ensureSpeechWatch() {
  if (speechWired || typeof window === "undefined" || !window.speechSynthesis) return;
  speechWired = true;
  if (englishVoice()) {
    speechState = "ok";
    return;
  }
  try {
    window.speechSynthesis.addEventListener("voiceschanged", settleSpeechState);
  } catch (err) {
    /* older hosts only expose the onvoiceschanged property */
    window.speechSynthesis.onvoiceschanged = settleSpeechState;
  }
  // Hosts with no voices at all never fire the event, so stop waiting.
  setTimeout(function () {
    if (speechState === "pending") settleSpeechState();
  }, 2000);
}

E.speakPronounceWord = function speakPronounceWord(text) {
  if (!text || typeof window === "undefined" || !window.speechSynthesis) return false;
  try {
    var voice = englishVoice();
    window.speechSynthesis.cancel();
    var utter = new window.SpeechSynthesisUtterance(text);
    // Pinning the voice matters more than the tag: with lang alone, a device
    // without an English voice reads the word in whatever the default is --
    // a Russian voice pronouncing "psychology" teaches the wrong thing.
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else {
      utter.lang = "en-GB";
    }
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
    return true;
  } catch (err) {
    return false;
  }
};

/* Voices load asynchronously, so a Listen button built before the list
   resolved would otherwise stay wrongly enabled or disabled forever. Walk
   whatever cards are on screen right now instead of tracking per-card
   listeners. */
function syncAllListenButtons() {
  if (typeof document === "undefined") return;
  var live = speechState !== "none";
  document.querySelectorAll(".ege-pronounce__listen").forEach(function (btn) {
    btn.disabled = !live;
  });
  document.querySelectorAll(".ege-pronounce__audio-hint").forEach(function (hint) {
    hint.textContent = live ? "" : "No English voice on this device — use the IPA.";
  });
}

/* ---------------------------------------------------------------- DOM */

/* All ten task panels (the nine named decks plus Mixed practice) are built
   once up front, then just shown/hidden by nav -- so a deck sitting hidden
   never hears about a word it owns being mastered through Mixed practice.
   One shared observer, set up the first time any pronounce deck renders,
   catches every panel's hidden flip and prunes+repaints just that deck --
   E.prunePronounceOrder deliberately doesn't reset the cursor, so revisiting
   a deck via nav lands back where the student left it, not at card 1. */
var panelWatcherWired = false;
function ensurePanelWatcher() {
  if (panelWatcherWired || typeof MutationObserver === "undefined") return;
  panelWatcherWired = true;
  var root = document.querySelector(".ege-workspace") || document.body;
  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      var panel = mutation.target;
      if (!panel || panel.hidden) return;
      var taskId = panel.dataset && panel.dataset.taskId;
      var task = taskId && E.findTask(taskId);
      if (!task || task.type !== "pronounce") return;
      E.prunePronounceOrder(task);
      paintWindow(task.id);
    });
  }).observe(root, { attributes: true, attributeFilter: ["hidden"], subtree: true });
}

function taskEl(taskId) {
  return document.getElementById("task-" + taskId);
}

function viewportEl(taskId) {
  var el = taskEl(taskId);
  return el && el.querySelector(".ege-pronounce__viewport");
}

function wordById(task, wordId) {
  var words = task.words || [];
  for (var i = 0; i < words.length; i += 1) {
    if (words[i].id === wordId) return words[i];
  }
  return null;
}

function resolveWord(task, orderEntry) {
  var owner = E.pronounceWordOwner(task.id, orderEntry);
  var ownerTask = owner.taskId === task.id ? task : E.findTask(owner.taskId);
  return ownerTask && wordById(ownerTask, owner.wordId);
}

function foldWord(text) {
  return String(text || "").replace(/[-\s]/g, "").toLowerCase();
}

/* A `sense` field does one of two unrelated jobs. On a spelling that repeats
   within its own deck (record the noun / record the verb), it's a grammar
   tag the two cards need just to be readable before marking -- there's no
   other way to tell them apart, so it's never hidden. On a spelling that
   appears only once, it's a plain vocabulary gloss, which is extra
   information rather than a requirement -- that's the one "Show meanings"
   controls. */
E.pronounceSenseIsMeaning = function pronounceSenseIsMeaning(ownerTask, word) {
  if (!ownerTask || !word || !word.sense) return false;
  var words = ownerTask.words || [];
  var folded = foldWord(word.text);
  var repeats = words.some(function (other) {
    return other !== word && foldWord(other.text) === folded;
  });
  return !repeats;
}

/* The primary-stress mark is the one symbol in a transcription that students
   read straight past, so give it its own colour rather than leaving it as one
   more tick of punctuation. */
function buildIpa(ipa) {
  var frag = document.createDocumentFragment();
  String(ipa || "").split(/([ˈˌ])/).forEach(function (part) {
    if (!part) return;
    if (part === "ˈ" || part === "ˌ") {
      var mark = document.createElement("span");
      mark.className =
        "ege-pronounce__stress-mark" + (part === "ˌ" ? " is-secondary" : "");
      mark.textContent = part;
      frag.appendChild(mark);
      return;
    }
    frag.appendChild(document.createTextNode(part));
  });
  return frag;
}

function buildWordCard(task, orderEntry) {
  var word = resolveWord(task, orderEntry);
  if (!word) return document.createElement("div");

  var owner = E.pronounceWordOwner(task.id, orderEntry);
  var ownerTask = owner.taskId === task.id ? task : E.findTask(owner.taskId);
  var state = E.pronounceWordState(owner.taskId, owner.wordId);
  var mastered = state.s >= E.PRONOUNCE_MASTERY_STREAK;
  var showIpa = E.loadPronounceShowIpa();
  // A word that has been wrong at some point but is not currently mastered
  // was, by construction, wrong on its most recent mark (any correct mark
  // masters immediately) -- so this is exactly "show the correction until
  // it's fixed," and it stops once it is, matching the original app.
  var revealed = showIpa || (state.w > 0 && !mastered);

  var card = document.createElement("div");
  card.className = "ege-pronounce__card" + (mastered ? " is-mastered" : "");
  card.dataset.orderEntry = orderEntry;

  var head = document.createElement("div");
  head.className = "ege-pronounce__head";
  var text = document.createElement("span");
  text.className = "ege-pronounce__word";
  text.textContent = word.text;
  head.appendChild(text);
  // A dictionary-style tag, not a sentence: the only content two identically
  // spelled cards (record the noun, record the verb) need to be readable
  // before marking is which one they are.
  if (word.sense && (!E.pronounceSenseIsMeaning(ownerTask, word) || E.loadPronounceShowMeaning())) {
    var sense = document.createElement("span");
    sense.className = "ege-pronounce__sense";
    sense.textContent = word.sense;
    head.appendChild(sense);
  }
  card.appendChild(head);

  var reveal = document.createElement("div");
  reveal.className = "ege-pronounce__reveal";
  var ipa = document.createElement("p");
  ipa.className = "ege-pronounce__ipa";
  ipa.appendChild(buildIpa(word.ipa));
  reveal.appendChild(ipa);
  var note = document.createElement("p");
  note.className = "ege-pronounce__note";
  note.textContent = word.note || "";
  reveal.appendChild(note);
  card.appendChild(reveal);
  // The real text is always laid out, at its real height, whether revealed
  // or not -- masked with visibility rather than [hidden] (which drops it to
  // zero height) so revealing it doesn't grow the card and push the buttons
  // below it down a beat later.
  setPronounceRevealed(ipa, note, revealed);

  card.appendChild(buildAudio(word));
  card.appendChild(buildMarks(task, orderEntry));
  return card;
}

function buildAudio(word) {
  var box = document.createElement("div");
  box.className = "ege-pronounce__audio";

  var listen = document.createElement("button");
  listen.type = "button";
  listen.className = "ege-pronounce__listen";
  listen.textContent = "🔊";
  listen.title = "Listen";
  listen.setAttribute("aria-label", "Listen");
  listen.disabled = speechState === "none";
  listen.addEventListener("click", function () {
    E.speakPronounceWord(word.text);
  });
  box.appendChild(listen);

  var hint = document.createElement("span");
  hint.className = "ege-pronounce__audio-hint";
  if (speechState === "none") hint.textContent = "No English voice on this device — use the IPA.";
  box.appendChild(hint);

  return box;
}

function buildMarks(task, orderEntry) {
  var marks = document.createElement("div");
  marks.className = "ege-pronounce__marks";

  [
    { correct: true, label: "Said it right", glyph: "✓", cls: "correct" },
    { correct: false, label: "Got it wrong", glyph: "✗", cls: "wrong" },
  ].forEach(function (spec) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ege-pronounce__mark ege-pronounce__mark--" + spec.cls;
    btn.dataset.pronounceMark = spec.cls;
    btn.title = spec.label;
    btn.setAttribute("aria-label", spec.label);
    btn.textContent = spec.glyph;
    btn.addEventListener("click", function () {
      E.markPronounceCard(task.id, orderEntry, spec.correct);
    });
    marks.appendChild(btn);
  });

  return marks;
}

/* ------------------------------------------------------------ the deck */

function syncStatus(task) {
  var el = taskEl(task.id);
  if (!el) return;
  var counts = E.pronounceCounts(task);
  var progress = el.querySelector(".ege-pronounce__progress-text");
  if (progress) {
    progress.textContent = task.mixed
      ? counts.mastered + " / " + counts.total + " mastered overall · " + counts.left + " in this round"
      : counts.mastered + " / " + counts.total + " mastered";
  }

  var order = E.pronounceOrderIds(task.id);
  var i = E.pronounceIndex(task);
  var counter = el.querySelector(".ege-pronounce__counter");
  if (counter) counter.textContent = order.length ? i + 1 + " / " + order.length : "";
  var prevBtn = el.querySelector(".ege-pronounce__nav--prev");
  var nextBtn = el.querySelector(".ege-pronounce__nav--next");
  if (prevBtn) prevBtn.disabled = i <= 0;
  if (nextBtn) nextBtn.disabled = i >= order.length - 1;

  var empty = el.querySelector(".ege-pronounce__empty");
  var viewport = el.querySelector(".ege-pronounce__viewport");
  var navbar = el.querySelector(".ege-pronounce__navbar");
  if (empty) {
    empty.hidden = order.length > 0;
    empty.textContent = task.mixed
      ? "Round complete — press Shuffle for another 10."
      : counts.total && counts.mastered === counts.total
      ? "Every word mastered. Turn off “Hide mastered” to run the deck again."
      : "Nothing left in this round. Turn off “Hide mastered” to bring words back.";
  }
  if (viewport) viewport.hidden = order.length === 0;
  if (navbar) navbar.hidden = order.length === 0;

  if (!task.mixed) {
    var allMastered = counts.total > 0 && counts.mastered === counts.total;
    var wasAll = el.dataset.pronounceMastered === "1";
    if (allMastered && !wasAll) flashAt(task.id, "confetti");
    el.dataset.pronounceMastered = allMastered ? "1" : "0";
  }
}

/* Anchored on the progress line rather than the button that was tapped: the
   strip is an overflow-x container, so a sticker parented inside it is
   clipped (and the card it hangs on is about to slide away regardless). */
function flashAt(taskId, mood) {
  var el = taskEl(taskId);
  var anchor = el && el.querySelector(".ege-pronounce__sticker-anchor");
  if (anchor && typeof E.flashMoodSticker === "function") E.flashMoodSticker(anchor, mood);
}

// The strip holds the current card and the one after it -- nothing else.
function paintWindow(taskId) {
  var task = E.findTask(taskId);
  var viewport = viewportEl(taskId);
  if (!task || !viewport) return;
  // Any repaint resynchronizes the screen with the true cursor, so whatever
  // mismatch a pending reveal was holding open is resolved by this alone.
  pendingReveal[taskId] = false;
  var list = E.pronounceOrderIds(task.id);
  var i = E.pronounceIndex(task);
  var track = viewport.querySelector(".ege-pronounce__track");
  if (!track) {
    track = document.createElement("div");
    track.className = "ege-pronounce__track";
    viewport.appendChild(track);
  }
  track.innerHTML = "";
  list.slice(i, i + 2).forEach(function (orderEntry) {
    track.appendChild(buildWordCard(task, orderEntry));
  });
  viewport.scrollLeft = 0;
  syncAllListenButtons();
  syncStatus(task);
}

/* Slide the current card out and the next one in. Only called when a mark
   (not Prev/Next) moved the array under the cursor -- Prev/Next repaint
   directly, since there's nothing to animate away from. */
function advance(taskId) {
  var viewport = viewportEl(taskId);
  if (!viewport || prefersReducedMotion()) {
    paintWindow(taskId);
    return;
  }
  var cards = viewport.querySelectorAll(".ege-pronounce__card");
  if (cards.length < 2) {
    paintWindow(taskId);
    return;
  }
  sliding[taskId] = true;
  viewport.scrollTo({ left: cards[1].offsetLeft, behavior: "smooth" });
  setTimeout(function () {
    sliding[taskId] = false;
    paintWindow(taskId);
  }, STICKER_HOLD_MS);
}

/* Reveal the IPA/note on the card that's already on screen, without
   repainting from the array -- the word being marked wrong just moved to the
   back of it, so a repaint would show whatever comes next instead of the
   correction the student needs to read first. */
// Masks with visibility, not [hidden]/display:none -- the text is already
// laid out at its real height either way, so switching this never changes
// how tall the card is. See the reveal-jump comment at the call site.
function setPronounceRevealed(ipa, note, revealed) {
  if (ipa) ipa.classList.toggle("is-masked", !revealed);
  if (note) note.classList.toggle("is-masked", !revealed);
}

function revealInPlace(taskId, orderEntry) {
  var viewport = viewportEl(taskId);
  var card = viewport && viewport.querySelector(".ege-pronounce__card");
  if (!card || card.dataset.orderEntry !== orderEntry) {
    paintWindow(taskId);
    return;
  }
  var ipa = card.querySelector(".ege-pronounce__ipa");
  var note = card.querySelector(".ege-pronounce__note");
  setPronounceRevealed(ipa, note, true);
  pendingReveal[taskId] = true;
}

E.markPronounceCard = function markPronounceCard(taskId, orderEntry, correct) {
  if (sliding[taskId]) return;
  E.markPronounceWord(taskId, orderEntry, correct);
  var task = E.findTask(taskId);
  syncStatus(task);

  if (!correct) {
    revealInPlace(taskId, orderEntry);
    return;
  }

  flashAt(taskId, "like");
  setTimeout(function () {
    advance(taskId);
  }, prefersReducedMotion() ? 0 : STICKER_HOLD_MS);
};

E.stepPronounce = function stepPronounce(taskId, delta) {
  if (sliding[taskId]) return;
  var task = E.findTask(taskId);
  if (!task) return;
  if (pendingReveal[taskId]) {
    // The array already moved the just-revealed word away from this
    // position when it was marked wrong, so the array's current entry IS
    // the next card -- catching the screen up to it is the whole step.
    // Stepping the cursor as well would skip over it.
    paintWindow(taskId);
    return;
  }
  E.stepPronounceCursor(task, delta);
  paintWindow(taskId);
};

// Only ever wired to Mixed practice's Shuffle button -- seeding a mixed
// deck always draws a fresh random 10 regardless of any option, since a
// pool that big has no fixed order to preserve.
E.shufflePronounceDeck = function shufflePronounceDeck(taskId) {
  var task = E.findTask(taskId);
  if (!task) return;
  E.seedPronounceQueue(task);
  paintWindow(taskId);
};

E.togglePronounceHideCompleted = function togglePronounceHideCompleted() {
  E.savePronounceHideCompleted(!E.loadPronounceHideCompleted());
  forEachRenderedDeck(function (task) {
    // Reseeding here, rather than filtering the live array, is what keeps a
    // deck from mutating under the card the student is looking at.
    E.seedPronounceQueue(task);
    syncToggles(task.id);
    paintWindow(task.id);
  });
};

E.togglePronounceShowIpa = function togglePronounceShowIpa() {
  E.savePronounceShowIpa(!E.loadPronounceShowIpa());
  forEachRenderedDeck(function (task) {
    syncToggles(task.id);
    paintWindow(task.id);
  });
};

E.togglePronounceShowMeaning = function togglePronounceShowMeaning() {
  E.savePronounceShowMeaning(!E.loadPronounceShowMeaning());
  forEachRenderedDeck(function (task) {
    syncToggles(task.id);
    paintWindow(task.id);
  });
};

/* Whether a "Show meanings" toggle is worth offering at all: a mixed deck
   asks across every source deck (any of the ten could deal one), a named
   deck asks only about its own words. */
function deckHasMeanings(task) {
  if (task.mixed) {
    var topic = E.state && E.state.topic;
    var tasks = (topic && topic.tasks) || [];
    return tasks.some(function (source) {
      return (
        source.type === "pronounce" &&
        !source.mixed &&
        (source.words || []).some(function (word) {
          return E.pronounceSenseIsMeaning(source, word);
        })
      );
    });
  }
  return (task.words || []).some(function (word) {
    return E.pronounceSenseIsMeaning(task, word);
  });
}

/* Both toggles are one setting shared by all ten decks, but each deck renders
   its own article once and keeps it, so flipping a switch has to reach the
   decks that are already built -- otherwise the student turns Show IPA on,
   walks to the next deck and finds it apparently ignored. */
function forEachRenderedDeck(fn) {
  document.querySelectorAll(".ege-task--pronounce").forEach(function (el) {
    var task = el.dataset.taskId && E.findTask(el.dataset.taskId);
    if (task) fn(task);
  });
}

function syncToggles(taskId) {
  var el = taskEl(taskId);
  if (!el) return;
  [
    [".ege-pronounce__toggle--hide", E.loadPronounceHideCompleted()],
    [".ege-pronounce__toggle--ipa", E.loadPronounceShowIpa()],
    [".ege-pronounce__toggle--meaning", E.loadPronounceShowMeaning()],
  ].forEach(function (pair) {
    var btn = el.querySelector(pair[0]);
    if (!btn) return;
    btn.classList.toggle("is-active", pair[1]);
    btn.setAttribute("aria-pressed", pair[1] ? "true" : "false");
  });
}

/* A swipe is the mobile way to page, so landing on the next card means the
   same thing pressing Next does -- pure cursor movement, no scoring. */
function bindViewportScroll(taskId, viewport) {
  var timer = 0;
  viewport.addEventListener("scroll", function () {
    if (sliding[taskId]) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      if (sliding[taskId]) return;
      var cards = viewport.querySelectorAll(".ege-pronounce__card");
      if (cards.length < 2) return;
      var mid = (cards[0].offsetLeft + cards[1].offsetLeft) / 2;
      if (viewport.scrollLeft > mid) E.stepPronounce(taskId, 1);
      else viewport.scrollTo({ left: 0, behavior: "smooth" });
    }, 140);
  });
}

E.renderPronounce = function renderPronounce(task, topicId) {
  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--pronounce");
  ensureSpeechWatch();
  ensurePanelWatcher();
  E.seedPronounceQueue(task);

  var tools = document.createElement("div");
  tools.className = "ege-skills-tools";

  // Shuffle and Hide mastered only mean anything against a big random pool --
  // reordering (or hiding words from) a small, fixed, hand-ordered deck of
  // 7-23 words isn't a real choice the way it is against the 115-word mixed
  // pool. Both live only on Mixed practice, first in its toolbar.
  if (task.mixed) {
    var shuffleBtn = document.createElement("button");
    shuffleBtn.type = "button";
    shuffleBtn.className = "ege-pronounce__toggle";
    shuffleBtn.textContent = "🔀 Shuffle";
    shuffleBtn.addEventListener("click", function () {
      E.shufflePronounceDeck(task.id);
    });
    tools.appendChild(shuffleBtn);

    var hide = E.loadPronounceHideCompleted();
    var hideToggle = document.createElement("button");
    hideToggle.type = "button";
    hideToggle.className =
      "ege-pronounce__toggle ege-pronounce__toggle--hide" + (hide ? " is-active" : "");
    hideToggle.textContent = "Hide mastered";
    hideToggle.setAttribute("aria-pressed", hide ? "true" : "false");
    hideToggle.addEventListener("click", function () {
      E.togglePronounceHideCompleted();
    });
    tools.appendChild(hideToggle);
  }

  var showIpa = E.loadPronounceShowIpa();
  var ipaToggle = document.createElement("button");
  ipaToggle.type = "button";
  ipaToggle.className =
    "ege-pronounce__toggle ege-pronounce__toggle--ipa" + (showIpa ? " is-active" : "");
  ipaToggle.textContent = "Show IPA";
  ipaToggle.setAttribute("aria-pressed", showIpa ? "true" : "false");
  ipaToggle.addEventListener("click", function () {
    E.togglePronounceShowIpa();
  });
  tools.appendChild(ipaToggle);

  // Only worth showing where a word actually has a hideable gloss -- a dead
  // toggle that changes nothing on most decks (only Academic words has any
  // right now) is worse than not offering it.
  if (deckHasMeanings(task)) {
    var showMeaning = E.loadPronounceShowMeaning();
    var meaningToggle = document.createElement("button");
    meaningToggle.type = "button";
    meaningToggle.className =
      "ege-pronounce__toggle ege-pronounce__toggle--meaning" + (showMeaning ? " is-active" : "");
    meaningToggle.textContent = "Show meanings";
    meaningToggle.setAttribute("aria-pressed", showMeaning ? "true" : "false");
    meaningToggle.addEventListener("click", function () {
      E.togglePronounceShowMeaning();
    });
    tools.appendChild(meaningToggle);
  }

  // A mixed deck has no progress of its own to reset -- it's a lens onto the
  // other nine decks' shared mastery flags. Resetting belongs on the deck
  // where a word actually lives.
  if (!task.mixed) {
    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ege-btn ege-btn--ghost ege-btn--small";
    resetBtn.textContent = "Reset progress";
    resetBtn.addEventListener("click", function () {
      E.resetPronounceMastered(task.id);
      E.seedPronounceQueue(task);
      paintWindow(task.id);
    });
    tools.appendChild(resetBtn);
  }

  wrap.appendChild(tools);

  var progress = document.createElement("p");
  progress.className = "ege-pronounce__progress";
  var progressText = document.createElement("span");
  progressText.className = "ege-pronounce__progress-text";
  progress.appendChild(progressText);
  var anchor = document.createElement("span");
  anchor.className = "ege-pronounce__sticker-anchor";
  progress.appendChild(anchor);
  wrap.appendChild(progress);

  var viewport = document.createElement("div");
  viewport.className = "ege-pronounce__viewport";
  var track = document.createElement("div");
  track.className = "ege-pronounce__track";
  viewport.appendChild(track);
  wrap.appendChild(viewport);
  bindViewportScroll(task.id, viewport);

  var navbar = document.createElement("div");
  navbar.className = "ege-pronounce__navbar";

  var prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "ege-pronounce__nav ege-pronounce__nav--prev";
  prevBtn.title = "Previous word";
  prevBtn.setAttribute("aria-label", "Previous word");
  prevBtn.textContent = "‹";
  prevBtn.addEventListener("click", function () {
    E.stepPronounce(task.id, -1);
  });
  navbar.appendChild(prevBtn);

  var counter = document.createElement("span");
  counter.className = "ege-pronounce__counter";
  navbar.appendChild(counter);

  var nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "ege-pronounce__nav ege-pronounce__nav--next";
  nextBtn.title = "Next word";
  nextBtn.setAttribute("aria-label", "Next word");
  nextBtn.textContent = "›";
  nextBtn.addEventListener("click", function () {
    E.stepPronounce(task.id, 1);
  });
  navbar.appendChild(nextBtn);

  wrap.appendChild(navbar);

  var empty = document.createElement("p");
  empty.className = "ege-pronounce__empty";
  wrap.appendChild(empty);

  // The article is not in the document yet, so fill the strip once it is.
  setTimeout(function () {
    paintWindow(task.id);
  }, 0);

  return wrap;
};
