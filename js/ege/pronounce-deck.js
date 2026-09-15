import { E } from "./runtime.js";

/* Deck state for "pronounce" drills: the progress store, the per-deck word
   order, the cursor into it, and the rules that move a word through it.
   Deliberately DOM-free -- pronounce.js does all the rendering -- so the
   rotation rules can be driven directly from node:test without a browser.

   The model is an ordered array plus a cursor, the same shape the original
   app used -- Prev/Next need to page freely back and forth, which a
   self-consuming queue can't do. The original bug wasn't the shape, it was
   this: "Hide mastered" filtered the array LIVE (on every render) while a
   positional index pointed into it, so marking a word correct shrank the
   array under the cursor and ALSO advanced the index, skipping the word
   after it. The fix here is a rule, not a rewrite: filtering only ever
   happens at seed time (deck open, Shuffle, a toggle flip); marking a word
   only ever does ONE explicit splice at the known current index, and the
   index itself is never separately incremented on a mark -- the array
   shrinking (or the marked word moving to the back) is what slides the next
   word into the same slot. Prev/Next are the only things that move the
   cursor, and they never touch the array.

   A word leaves the deck after exactly one correct mark -- there's nothing
   left (no stress/choice check) to justify asking a self-report to repeat
   itself, so a streak would just be friction. A wrong mark sends the word to
   the back of the array, unconditionally, regardless of Hide mastered. */

var PROGRESS_KEY = "ege-prep.pronounce.progress.v2";
var LEGACY_MASTERED_KEY = "ege-prep.pronounce.mastered.v1";
var HIDE_KEY = "ege-prep.pronounce.hideCompleted.v1";
var SHOW_IPA_KEY = "ege-prep.pronounce.showIpa.v1";
var SHOW_MEANING_KEY = "ege-prep.pronounce.showMeaning.v1";

var MASTERY_STREAK = 1; // one correct mark masters a word
var MIXED_POOL_SIZE = 10;
// Owner-task id -> compound id separator for the pooled Mixed practice deck.
// Plain word ids ("w1", "w2", ...) collide across decks, so a mixed deck's
// array holds "ownerTaskId|wordId" instead of a bare word id.
var MIXED_SEP = "|";

E.PRONOUNCE_MASTERY_STREAK = MASTERY_STREAK;
E.PRONOUNCE_MIXED_POOL_SIZE = MIXED_POOL_SIZE;
E.PRONOUNCE_MIXED_TASK_ID = "skills39-mixed";

// Loaded once per session and mutated in place -- the old code re-read and
// re-parsed the whole store from localStorage for every single word on every
// refresh: 45 reads and 43 JSON.parse calls for one tick of a 15-word deck.
var store = null;
var order = {}; // taskId -> word ids (or, for a mixed deck, compound ids)
var index = {}; // taskId -> current position within order[taskId]

/* ------------------------------------------------------------- storage */

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    /* ignore -- the drill still works for the rest of the session */
  }
}

function blankRecord() {
  return { s: 0, w: 0, n: 0 };
}

/* The v1 store was { taskId: [masteredWordId, ...] }. Import those as fully
   mastered and leave v1 on disk untouched: if this version is ever rolled
   back, a student's progress is still where the old code looks for it. */
function migrateLegacyStore() {
  var migrated = {};
  var raw = readStorage(LEGACY_MASTERED_KEY);
  if (!raw) return migrated;
  var legacy;
  try {
    legacy = JSON.parse(raw) || {};
  } catch (err) {
    return migrated;
  }
  Object.keys(legacy).forEach(function (taskId) {
    var ids = legacy[taskId];
    if (!Array.isArray(ids) || !ids.length) return;
    migrated[taskId] = {};
    ids.forEach(function (wordId) {
      migrated[taskId][wordId] = { s: MASTERY_STREAK, w: 0, n: 1 };
    });
  });
  if (Object.keys(migrated).length) writeStorage(PROGRESS_KEY, JSON.stringify(migrated));
  return migrated;
}

function loadStore() {
  if (store) return store;
  var raw = readStorage(PROGRESS_KEY);
  if (raw) {
    try {
      store = JSON.parse(raw) || {};
    } catch (err) {
      store = {};
    }
  } else {
    store = migrateLegacyStore();
  }
  return store;
}

function saveStore() {
  writeStorage(PROGRESS_KEY, JSON.stringify(loadStore()));
}

function recordFor(taskId, wordId, create) {
  var all = loadStore();
  var deck = all[taskId];
  if (!deck) {
    if (!create) return null;
    deck = all[taskId] = {};
  }
  var rec = deck[wordId];
  if (!rec) {
    if (!create) return null;
    rec = deck[wordId] = blankRecord();
  }
  return rec;
}

// Test seam: node:test has no localStorage, so every run would otherwise share
// one in-memory store across cases.
E.resetPronounceState = function resetPronounceState() {
  store = null;
  order = {};
  index = {};
};

/* ------------------------------------------------------- word progress */

E.pronounceWordState = function pronounceWordState(taskId, wordId) {
  return recordFor(taskId, wordId, false) || blankRecord();
};

E.isPronounceWordMastered = function isPronounceWordMastered(taskId, wordId) {
  return E.pronounceWordState(taskId, wordId).s >= MASTERY_STREAK;
};

E.pronounceMasteredIds = function pronounceMasteredIds(taskId) {
  var deck = loadStore()[taskId] || {};
  return Object.keys(deck).filter(function (wordId) {
    return deck[wordId].s >= MASTERY_STREAK;
  });
};

E.resetPronounceMastered = function resetPronounceMastered(taskId) {
  delete loadStore()[taskId];
  delete order[taskId];
  delete index[taskId];
  saveStore();
};

/* total/mastered for a normal deck are its own words. A mixed deck has no
   words of its own -- it's a lens onto the other 9 -- so it reports mastery
   globally across every source deck instead. */
E.pronounceCounts = function pronounceCounts(task) {
  if (task && task.mixed) {
    var totals = { total: 0, mastered: 0 };
    pronounceSourceTasks(task).forEach(function (source) {
      var words = source.words || [];
      totals.total += words.length;
      words.forEach(function (word) {
        if (E.isPronounceWordMastered(source.id, word.id)) totals.mastered += 1;
      });
    });
    return { total: totals.total, mastered: totals.mastered, left: (order[task.id] || []).length };
  }
  var words = (task && task.words) || [];
  var mastered = 0;
  words.forEach(function (word) {
    if (E.isPronounceWordMastered(task.id, word.id)) mastered += 1;
  });
  return { total: words.length, mastered: mastered, left: (order[task.id] || []).length };
};

/* ------------------------------------------------------------ settings */

E.loadPronounceHideCompleted = function loadPronounceHideCompleted() {
  // Hidden by default -- a mastered word is meant to stop appearing.
  var raw = readStorage(HIDE_KEY);
  return raw == null ? true : raw === "1";
};

E.savePronounceHideCompleted = function savePronounceHideCompleted(hide) {
  writeStorage(HIDE_KEY, hide ? "1" : "0");
};

/* Off by default: the drill is worth more when the student has to produce the
   word before seeing how it is written. Turning it on makes every card show
   its IPA from the start instead of only after a wrong mark. */
E.loadPronounceShowIpa = function loadPronounceShowIpa() {
  return readStorage(SHOW_IPA_KEY) === "1";
};

E.savePronounceShowIpa = function savePronounceShowIpa(show) {
  writeStorage(SHOW_IPA_KEY, show ? "1" : "0");
};

/* Some words carry a `sense` field for two different reasons: a grammar tag
   ("noun" / "past tense") that a duplicate-spelling pair needs just to be
   readable -- record the noun vs record the verb -- and a plain vocabulary
   gloss on an otherwise-solo word, which is extra information, not a
   requirement. Only the second kind is worth hiding; see
   E.pronounceSenseIsMeaning in pronounce.js for how the two are told apart.
   Off by default, same reasoning as Show IPA. */
E.loadPronounceShowMeaning = function loadPronounceShowMeaning() {
  return readStorage(SHOW_MEANING_KEY) === "1";
};

E.savePronounceShowMeaning = function savePronounceShowMeaning(show) {
  writeStorage(SHOW_MEANING_KEY, show ? "1" : "0");
};

/* ---------------------------------------------------------- mixed pool */

function pronounceSourceTasks(mixedTask) {
  var topic = E.state && E.state.topic;
  var tasks = (topic && topic.tasks) || [];
  return tasks.filter(function (t) {
    return t && t.type === "pronounce" && !t.mixed && t.id !== mixedTask.id;
  });
}

function compoundId(ownerTaskId, wordId) {
  return ownerTaskId + MIXED_SEP + wordId;
}

/* Identity for a normal deck's own word id; parsed back into {taskId, wordId}
   for a mixed deck's compound id. Everything downstream (marking, progress)
   is recorded against the real owner, never against "skills39-mixed" --
   that's what makes mastering a word in Mixed practice also master it in its
   home deck, and what makes a word already mastered at home correctly drop
   out of future mixed draws. */
E.pronounceWordOwner = function pronounceWordOwner(taskId, orderEntry) {
  var at = String(orderEntry).indexOf(MIXED_SEP);
  if (at === -1) return { taskId: taskId, wordId: orderEntry };
  return { taskId: orderEntry.slice(0, at), wordId: orderEntry.slice(at + 1) };
};

function seedMixedPool(task) {
  var hide = E.loadPronounceHideCompleted();
  var pool = [];
  pronounceSourceTasks(task).forEach(function (source) {
    (source.words || []).forEach(function (word) {
      if (hide && E.isPronounceWordMastered(source.id, word.id)) return;
      pool.push(compoundId(source.id, word.id));
    });
  });
  shuffleIds(pool);
  return pool.slice(0, MIXED_POOL_SIZE);
}

/* --------------------------------------------------------------- order */

function shuffleIds(ids) {
  for (var i = ids.length - 1; i > 0; i -= 1) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }
  return ids;
}

/* "Hide mastered" only ever applies to the mixed pool now -- against a
   fixed, hand-ordered deck of 7-23 words there's no real pool to thin out,
   so a named deck always shows its full list; a mastered word just carries
   the green "is-mastered" style instead of disappearing. Seeding is the ONLY
   place the mixed pool applies the filter -- filtering live is what made the
   old deck skip words. */
E.seedPronounceQueue = function seedPronounceQueue(task) {
  var ids = task.mixed
    ? seedMixedPool(task)
    : ((task && task.words) || []).map(function (word) {
        return word.id;
      });
  order[task.id] = ids;
  index[task.id] = 0;
  return ids;
};

E.pronounceOrder = function pronounceOrder(task) {
  if (!order[task.id]) E.seedPronounceQueue(task);
  return order[task.id];
};

E.pronounceOrderIds = function pronounceOrderIds(taskId) {
  return order[taskId] || [];
};

/* All ten task panels (the nine named decks plus Mixed practice) are built
   once, up front, and just shown/hidden by nav after that -- so a word
   mastered via the mixed pool while a deck's own panel sits built-but-hidden
   won't drop out of that deck's rotation on its own. This drops anything
   that's since become mastered, without resetting the cursor to 0 the way a
   full reseed would -- if the word on screen survives the prune, the student
   is left looking at the same card; only ever meaningful with Hide mastered
   on, since with it off a mastered word is meant to keep showing anyway. */
E.prunePronounceOrder = function prunePronounceOrder(task) {
  if (!task.mixed || !E.loadPronounceHideCompleted()) return;
  var list = order[task.id];
  if (!list || !list.length) return;
  var current = list[clampIndex(task.id)];
  var kept = list.filter(function (entry) {
    var owner = E.pronounceWordOwner(task.id, entry);
    return !E.isPronounceWordMastered(owner.taskId, owner.wordId);
  });
  if (kept.length === list.length) return;
  order[task.id] = kept;
  var at = kept.indexOf(current);
  index[task.id] = at !== -1 ? at : 0;
  clampIndex(task.id);
};

function clampIndex(taskId) {
  var list = order[taskId] || [];
  var i = index[taskId] || 0;
  index[taskId] = list.length ? Math.max(0, Math.min(i, list.length - 1)) : 0;
  return index[taskId];
}

E.pronounceIndex = function pronounceIndex(task) {
  E.pronounceOrder(task);
  return clampIndex(task.id);
};

E.pronounceCurrentId = function pronounceCurrentId(task) {
  var list = E.pronounceOrder(task);
  return list[E.pronounceIndex(task)] || null;
};

/* Pure navigation -- never mutates order[], only moves the cursor. No
   wraparound, matching the original: Prev is disabled at the first card,
   Next at the last. */
E.stepPronounceCursor = function stepPronounceCursor(task, delta) {
  E.pronounceOrder(task);
  var list = order[task.id] || [];
  var next = clampIndex(task.id) + delta;
  index[task.id] = Math.max(0, Math.min(next, list.length - 1));
  return index[task.id];
};

/* --------------------------------------------------------------- mark */

/* One explicit splice at the known current index -- never a live filter over
   the whole array -- is what keeps this from ever double-advancing. index is
   deliberately left untouched by either branch: removing the current entry
   (splice) or moving it to the end (splice + push) both slide the next word
   into the same slot on their own, which IS the auto-advance. Touching index
   as well on top of that is exactly the bug the original code had. */
E.markPronounceWord = function markPronounceWord(taskId, orderEntry, correct) {
  var owner = E.pronounceWordOwner(taskId, orderEntry);
  var rec = recordFor(owner.taskId, owner.wordId, true);
  rec.n += 1;

  if (correct) {
    rec.s = MASTERY_STREAK;
  } else {
    rec.s = 0;
    rec.w += 1;
  }
  saveStore();

  var mastered = rec.s >= MASTERY_STREAK;
  var list = order[taskId] || [];
  var at = list.indexOf(orderEntry);
  if (at !== -1) {
    if (!correct) {
      // Wrong always recycles, regardless of Hide mastered.
      list.splice(at, 1);
      list.push(orderEntry);
    } else if (taskId === E.PRONOUNCE_MIXED_TASK_ID && E.loadPronounceHideCompleted()) {
      // Correct + Hide mastered, mixed pool only: the word leaves this
      // round. A named deck always keeps showing its full list -- a
      // mastered word there just carries the green "is-mastered" style.
      list.splice(at, 1);
    }
  }
  clampIndex(taskId);

  return { mastered: mastered, wrong: rec.w };
};
