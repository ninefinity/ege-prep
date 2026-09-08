import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { E } from "./runtime.js";
import "./pronounce.js";

const doc = JSON.parse(
  readFileSync(new URL("../../data/reading-skills.json", import.meta.url))
);

test("every reading-skills task is a pronounce drill with a word deck", () => {
  assert.ok(doc.tasks.length > 0);
  doc.tasks.forEach((task) => {
    assert.equal(task.type, "pronounce", task.id);
    assert.ok(Array.isArray(task.words) && task.words.length > 0, task.id);
  });
});

test("word decks have no duplicate ids or duplicate words, and carry ipa + note", () => {
  doc.tasks.forEach((task) => {
    const ids = new Set();
    const words = new Set();
    task.words.forEach((word, index) => {
      assert.ok(word.id, `${task.id} word ${index}: missing id`);
      assert.ok(!ids.has(word.id), `${task.id} word ${index}: duplicate id`);
      ids.add(word.id);

      assert.ok(word.text, `${task.id} word ${index}: missing text`);
      const folded = word.text.trim().toLowerCase();
      assert.ok(!words.has(folded), `${task.id} word ${index}: duplicate word ${word.text}`);
      words.add(folded);

      assert.ok(word.ipa, `${task.id} ${word.text}: missing ipa`);
      assert.ok(word.note, `${task.id} ${word.text}: missing note`);
    });
  });
});

test("without localStorage, mastery reads default to unmastered and hidden-by-default", () => {
  // These modules run outside a browser here -- every localStorage access is
  // wrapped in try/catch, so the pure logic still has to degrade safely.
  assert.equal(E.isPronounceWordMastered("any-task", "any-word"), false);
  assert.equal(E.pronounceMasteredIds("any-task").length, 0);
  assert.equal(E.loadPronounceHideCompleted(), true);
});

test("speakPronounceWord degrades to false without a speechSynthesis host", () => {
  assert.equal(E.speakPronounceWord("hello"), false);
  assert.equal(E.speakPronounceWord(""), false);
});
