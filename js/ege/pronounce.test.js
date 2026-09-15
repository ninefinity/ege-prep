import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { E } from "./runtime.js";
import "./pronounce-deck.js";

const doc = JSON.parse(
  readFileSync(new URL("../../data/reading-skills.json", import.meta.url))
);

const namedDecks = doc.tasks.filter((task) => !task.mixed);
const mixedDeck = doc.tasks.find((task) => task.mixed);

const fold = (value) => String(value).replace(/[-\s]/g, "").toLowerCase();

test("every reading-skills task is a pronounce drill", () => {
  assert.ok(doc.tasks.length > 0);
  doc.tasks.forEach((task) => {
    assert.equal(task.type, "pronounce", task.id);
    assert.ok(task.instructions, `${task.id}: missing instructions`);
  });
});

test("the named decks each carry a word list; the mixed deck carries none of its own", () => {
  namedDecks.forEach((task) => {
    assert.ok(Array.isArray(task.words) && task.words.length > 0, task.id);
  });
  assert.ok(mixedDeck, "no mixed practice deck found");
  assert.deepEqual(mixedDeck.words, []);
});

test("ids are unique, and a spelling repeats only with a different transcription", () => {
  // A heteronym deck shows one spelling twice on purpose, so a repeat only
  // counts as a duplicate when the transcription matches too. "Barren" once
  // shipped in two decks with contradictory notes because the old check
  // compared spellings within a single deck.
  const seen = new Map();
  namedDecks.forEach((task) => {
    const ids = new Set();
    task.words.forEach((word, index) => {
      assert.ok(word.id, `${task.id} word ${index}: missing id`);
      assert.ok(!ids.has(word.id), `${task.id} word ${index}: duplicate id`);
      ids.add(word.id);

      assert.ok(word.text, `${task.id} word ${index}: missing text`);
      const key = `${fold(word.text)}|${word.ipa}`;
      assert.ok(!seen.has(key), `${task.id}/${word.id}: duplicate of ${seen.get(key)}`);
      seen.set(key, `${task.id}/${word.id}`);
    });
  });
});

test("every word carries the ipa, note and syllable data the tests check it with", () => {
  // Nothing on the card taps a syllable or shows a transcription picker any
  // more, but syllables/stress are still what catches a mistranscribed word
  // (a real bug this caught: a note claiming a stressed syllable the ipa's ˈ
  // mark disagreed with) -- so they still have to be right, even unrendered.
  namedDecks.forEach((task) => {
    task.words.forEach((word) => {
      const where = `${task.id} ${word.text}`;
      assert.ok(word.ipa, `${where}: missing ipa`);
      assert.ok(word.note, `${where}: missing note`);

      assert.ok(Array.isArray(word.syllables) && word.syllables.length, `${where}: no syllables`);
      assert.equal(
        fold(word.syllables.join("")),
        fold(word.text),
        `${where}: syllables do not join to the word`
      );
      assert.ok(
        Number.isInteger(word.stress) && word.stress >= 0 && word.stress < word.syllables.length,
        `${where}: stress ${word.stress} out of range`
      );
      if (word.syllables.length > 1) {
        assert.ok(word.ipa.includes("ˈ"), `${where}: polysyllabic but no ˈ in ${word.ipa}`);
      }
    });
  });
});

test("notes describe pronunciation, not meaning", () => {
  // 24% of the original notes were dictionary definitions -- "Bonfire: large
  // outdoor fire used for warmth" says nothing about saying /ˈbɒnfaɪə/. A
  // gloss belongs in `sense`; the note has to teach the mouth.
  const phonetic =
    /[/ˈˌ⟨]|stress|syllab|vowel|consonant|silent|cluster|diphthong|schwa|voiced|voiceless|glide|digraph|rhyme|rhymes|reduce|weak|short|long|tense/i;
  namedDecks.forEach((task) => {
    task.words.forEach((word) => {
      assert.ok(
        phonetic.test(word.note),
        `${task.id} ${word.text}: note carries no pronunciation information — "${word.note}"`
      );
    });
  });
});

test("a repeated spelling carries a sense tag so the two cards are tellable apart", () => {
  // With no context sentence, `sense` ("noun", "past tense") is the only
  // thing on the card distinguishing "Record" the noun from "Record" the
  // verb before the student marks it.
  namedDecks.forEach((task) => {
    const counts = new Map();
    task.words.forEach((word) => {
      const key = fold(word.text);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    task.words.forEach((word) => {
      if (counts.get(fold(word.text)) > 1) {
        assert.ok(word.sense, `${task.id} ${word.text}: repeated spelling with no sense tag`);
      }
    });
  });
});

test("without localStorage, mastery reads default to unmastered and hidden-by-default", () => {
  // These modules run outside a browser here -- every localStorage access is
  // wrapped in try/catch, so the pure logic still has to degrade safely.
  E.resetPronounceState();
  assert.equal(E.isPronounceWordMastered("any-task", "any-word"), false);
  assert.equal(E.pronounceMasteredIds("any-task").length, 0);
  assert.equal(E.loadPronounceHideCompleted(), true);
  assert.equal(E.loadPronounceShowIpa(), false);
  assert.equal(E.loadPronounceShowMeaning(), false);
});

test("speakPronounceWord degrades to false without a speechSynthesis host", async () => {
  const { E: live } = await import("./runtime.js");
  await import("./pronounce.js");
  assert.equal(live.speakPronounceWord("hello"), false);
  assert.equal(live.speakPronounceWord(""), false);
});

test("a sense field disambiguates a repeated spelling, but glosses a solo word", async () => {
  // Same field, two unrelated jobs -- "Record: noun" vs "Record: verb" is
  // the only way to tell two identical cards apart before marking, so it's
  // never hidden. "Huddle: to gather closely together" is a plain
  // vocabulary gloss on a word with no twin, which is what "Show meanings"
  // hides by default.
  const { E: live } = await import("./runtime.js");
  await import("./pronounce.js");
  const pairDeck = {
    id: "pairDeck",
    words: [
      { id: "a", text: "Record", sense: "noun" },
      { id: "b", text: "Record", sense: "verb" },
    ],
  };
  const soloDeck = {
    id: "soloDeck",
    words: [{ id: "c", text: "Huddle", sense: "to gather closely together" }],
  };
  assert.equal(live.pronounceSenseIsMeaning(pairDeck, pairDeck.words[0]), false);
  assert.equal(live.pronounceSenseIsMeaning(soloDeck, soloDeck.words[0]), true);
});

/* ------------------------------------------------------- array + cursor */

const deckOf = (n) => ({
  id: "deck",
  type: "pronounce",
  words: Array.from({ length: n }, (_, i) => ({ id: `w${i + 1}`, text: `word${i + 1}` })),
});

function freshDeck(n) {
  E.resetPronounceState();
  const task = deckOf(n);
  E.state.topic = { tasks: [task] };
  E.seedPronounceQueue(task);
  return task;
}

test("a correct mark on a named deck leaves the word in place -- Hide mastered doesn't apply there", () => {
  // Against a small, fixed, hand-ordered deck (7-23 words) there's no real
  // pool to thin out, so a named deck always keeps its full list; a mastered
  // word just carries the green "is-mastered" style. This used to be
  // conditional on the Hide mastered setting; now it never removes at all.
  const task = freshDeck(3);
  E.markPronounceWord(task.id, "w1", true);
  assert.deepEqual(E.pronounceOrderIds(task.id), ["w1", "w2", "w3"]);
  assert.equal(E.isPronounceWordMastered(task.id, "w1"), true);
});

test("reseeding a named deck never drops a mastered word -- Hide mastered doesn't apply there either", () => {
  const task = freshDeck(4);
  E.markPronounceWord(task.id, "w1", true);
  E.seedPronounceQueue(task);
  assert.deepEqual(E.pronounceOrderIds(task.id), ["w1", "w2", "w3", "w4"]);
});

test("Prev and Next page the deck without marking or reordering it", () => {
  const task = freshDeck(4);
  E.stepPronounceCursor(task, 1);
  assert.equal(E.pronounceCurrentId(task), "w2");
  E.stepPronounceCursor(task, 1);
  assert.equal(E.pronounceCurrentId(task), "w3");
  E.stepPronounceCursor(task, -1);
  assert.equal(E.pronounceCurrentId(task), "w2");
  assert.deepEqual(E.pronounceOrderIds(task.id), ["w1", "w2", "w3", "w4"]);
  assert.equal(E.pronounceWordState(task.id, "w2").n, 0, "paging must not score anything");
});

test("Prev is a no-op at the first card, Next a no-op at the last", () => {
  const task = freshDeck(3);
  E.stepPronounceCursor(task, -1);
  assert.equal(E.pronounceCurrentId(task), "w1");
  E.stepPronounceCursor(task, 1);
  E.stepPronounceCursor(task, 1);
  E.stepPronounceCursor(task, 1);
  assert.equal(E.pronounceCurrentId(task), "w3");
});

test("one correct mark masters a word -- no streak", () => {
  const task = freshDeck(3);
  const result = E.markPronounceWord(task.id, "w1", true);
  assert.equal(result.mastered, true);
  assert.equal(E.isPronounceWordMastered(task.id, "w1"), true);
});

test("a wrong mark sends the word to the back of the deck, regardless of Hide mastered", () => {
  const task = freshDeck(5);
  E.markPronounceWord(task.id, "w1", false);
  assert.deepEqual(E.pronounceOrderIds(task.id), ["w2", "w3", "w4", "w5", "w1"]);
  assert.equal(E.isPronounceWordMastered(task.id, "w1"), false);
});

test("a word requeued after a wrong mark is mastered by the very next correct mark", () => {
  const task = freshDeck(4);
  E.markPronounceWord(task.id, "w1", false);
  // w1 is now at the back (order is [w2, w3, w4, w1]); a named deck's
  // correct mark no longer moves the cursor on its own, so walk there with
  // Next rather than by marking the words along the way.
  E.stepPronounceCursor(task, 1);
  E.stepPronounceCursor(task, 1);
  E.stepPronounceCursor(task, 1);
  assert.equal(E.pronounceCurrentId(task), "w1");
  const result = E.markPronounceWord(task.id, "w1", true);
  assert.equal(result.mastered, true);
});

// save/load only round-trip through a real localStorage, which node:test
// doesn't have, so these two need a fake one installed to actually exercise
// the toggle rather than coast on its true-by-default fallback.
function withFakeStorage(fn) {
  const backing = new Map();
  globalThis.localStorage = {
    getItem: (key) => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: (key) => backing.delete(key),
  };
  try {
    fn();
  } finally {
    delete globalThis.localStorage;
  }
}

test("toggling Hide mastered has no effect on a named deck either way", () => {
  withFakeStorage(() => {
    const task = freshDeck(3);
    [true, false].forEach((hide) => {
      E.savePronounceHideCompleted(hide);
      E.resetPronounceMastered(task.id);
      E.seedPronounceQueue(task);
      E.markPronounceWord(task.id, "w1", true);
      assert.deepEqual(
        E.pronounceOrderIds(task.id),
        ["w1", "w2", "w3"],
        `hide=${hide} should not remove a mastered word from a named deck`
      );
    });
  });
});

test("a deck down to its last word keeps drilling it rather than emptying", () => {
  const task = freshDeck(1);
  E.markPronounceWord(task.id, "w1", false);
  assert.deepEqual(E.pronounceOrderIds(task.id), ["w1"]);
});

test("progress saved by the previous version is imported as mastered", () => {
  E.resetPronounceState();
  const backing = new Map([
    ["ege-prep.pronounce.mastered.v1", JSON.stringify({ deck: ["w1", "w3"] })],
  ]);
  globalThis.localStorage = {
    getItem: (key) => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: (key) => backing.delete(key),
  };
  try {
    assert.equal(E.isPronounceWordMastered("deck", "w1"), true);
    assert.equal(E.isPronounceWordMastered("deck", "w3"), true);
    assert.equal(E.isPronounceWordMastered("deck", "w2"), false);
    assert.deepEqual(E.pronounceMasteredIds("deck").sort(), ["w1", "w3"]);
    // The old key is left where it is, so rolling this version back does not
    // wipe a student's progress.
    assert.ok(backing.has("ege-prep.pronounce.mastered.v1"));
    assert.ok(backing.has("ege-prep.pronounce.progress.v2"));
  } finally {
    delete globalThis.localStorage;
    E.resetPronounceState();
  }
});

/* -------------------------------------------------------------- mixed */

function freshMixedWorld() {
  E.resetPronounceState();
  const a = {
    id: "deckA",
    type: "pronounce",
    words: Array.from({ length: 6 }, (_, i) => ({ id: `a${i + 1}`, text: `alpha${i + 1}` })),
  };
  const b = {
    id: "deckB",
    type: "pronounce",
    words: Array.from({ length: 6 }, (_, i) => ({ id: `b${i + 1}`, text: `beta${i + 1}` })),
  };
  const mixed = { id: E.PRONOUNCE_MIXED_TASK_ID, type: "pronounce", mixed: true, words: [] };
  E.state.topic = { tasks: [a, b, mixed] };
  return { a, b, mixed };
}

test("the mixed deck pools a fixed-size random draw from every other deck", () => {
  const { mixed } = freshMixedWorld();
  const drawn = E.pronounceOrder(mixed);
  assert.equal(drawn.length, E.PRONOUNCE_MIXED_POOL_SIZE);
  const owners = new Set(drawn.map((entry) => E.pronounceWordOwner(mixed.id, entry).taskId));
  assert.ok(owners.has("deckA") || owners.has("deckB"));
});

test("marking a word correct through the mixed deck masters it in its home deck", () => {
  const { a, mixed } = freshMixedWorld();
  E.seedPronounceQueue(mixed);
  const fromA = E.pronounceOrderIds(mixed.id).find(
    (entry) => E.pronounceWordOwner(mixed.id, entry).taskId === "deckA"
  );
  assert.ok(fromA, "expected at least one deckA word in the draw");
  const { wordId } = E.pronounceWordOwner(mixed.id, fromA);
  E.markPronounceWord(mixed.id, fromA, true);
  assert.equal(E.isPronounceWordMastered("deckA", wordId), true);
  // Hide mastered only thins the mixed pool -- deckA itself is a named deck,
  // so it keeps showing every word regardless; the word just now carries the
  // mastered flag.
  E.seedPronounceQueue(a);
  assert.ok(E.pronounceOrderIds("deckA").includes(wordId));
  assert.equal(E.isPronounceWordMastered("deckA", wordId), true);
});

test("a word already mastered at home is excluded from the mixed draw", () => {
  const { a, mixed } = freshMixedWorld();
  a.words.forEach((word) => E.markPronounceWord("deckA", word.id, true));
  const drawn = E.pronounceOrder(mixed);
  const owners = drawn.map((entry) => E.pronounceWordOwner(mixed.id, entry).taskId);
  assert.ok(!owners.includes("deckA"), "mastered deckA words should not be drawn");
});
