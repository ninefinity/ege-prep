import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { E } from "./runtime.js";
import "./crossword-gen.js";

const doc = JSON.parse(
  readFileSync(new URL("../../data/word-formation-crossword.json", import.meta.url))
);
const task = doc.tasks[0];

test("the word-formation-crossword topic carries one crossword task with a word pool", () => {
  assert.equal(doc.tasks.length, 1);
  assert.equal(task.type, "crossword");
  assert.ok(Array.isArray(task.pool) && task.pool.length >= 8);
});

test("every pool word is alphabetic, at least 3 letters, with a clue and a hint letter", () => {
  task.pool.forEach((pair, i) => {
    assert.match(pair.answer, /^[A-Z]+$/, `pool[${i}] answer "${pair.answer}" is not all-caps letters`);
    assert.ok(pair.answer.length >= 3, `pool[${i}] answer "${pair.answer}" is shorter than 3 letters`);
    assert.ok(pair.clue && pair.clue.trim(), `pool[${i}] (${pair.answer}) has no clue`);
    assert.match(pair.hint, /^[A-Z]$/, `pool[${i}] (${pair.answer}) hint "${pair.hint}" is not a single letter`);
  });
});

test("every hint sits on the answer square where the base word starts", () => {
  task.pool.forEach((pair) => {
    assert.equal(
      pair.answer[pair.hintAt],
      pair.hint,
      `${pair.answer}: hint "${pair.hint}" at index ${pair.hintAt} lands on "${pair.answer[pair.hintAt]}"`
    );
  });
  const unable = task.pool.find((p) => p.answer === "UNABLE");
  if (unable) assert.equal(unable.hintAt, 2);
});

const hintTasks = JSON.parse(
  readFileSync(new URL("../../data/crossword-hint-tasks.json", import.meta.url))
);

test("choose-letter hint tasks: one gap each, 3+ options, valid answer, no stray gap markers", () => {
  assert.ok(hintTasks.choose.length > 0);
  hintTasks.choose.forEach((item, i) => {
    assert.equal(item.text.split("___").length - 1, 1, `choose[${i}] should have exactly one gap`);
    assert.doesNotMatch(item.text, /\[\d+\]/, `choose[${i}] still has an unfilled [NN] gap`);
    assert.ok(item.options.length >= 3, `choose[${i}] needs 3+ options to offer three`);
    assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.options.length);
  });
});

test("choose-letter context is the gap sentence with a sentence either side", () => {
  const sandy = hintTasks.choose.find((item) => item.text.includes("She hoped he would ___"));
  assert.ok(sandy, "the Sandy gap should be in the pool");
  assert.equal(sandy.options[sandy.answer], "agree");
  assert.match(sandy.text, /^Sandy called Dan Atkins/);
  assert.match(sandy.text, /woken him out of a sound sleep\.$/);
});

test("show-mistakes verbs: each has accepted lowercase participles that differ from the verb", () => {
  assert.ok(hintTasks.verbs.length >= 20);
  const seen = new Set();
  hintTasks.verbs.forEach((v) => {
    assert.match(v.verb, /^[a-z]+$/, `verb "${v.verb}" should be a lowercase word`);
    assert.ok(!seen.has(v.verb), `duplicate verb ${v.verb}`);
    seen.add(v.verb);
    assert.ok(v.answers.length >= 1);
    v.answers.forEach((a) => assert.match(a, /^[a-z]+$/, `${v.verb}: answer "${a}" should be lowercase letters`));
    assert.ok(!v.answers.includes(v.verb), `${v.verb}: participle equals the prompt`);
  });
  const learn = hintTasks.verbs.find((v) => v.verb === "learn");
  assert.deepEqual(learn.answers.sort(), ["learned", "learnt"]);
});

test("random-letter hint tasks: each paragraph's answer is one of its set's headings", () => {
  assert.ok(hintTasks.random.length > 0);
  hintTasks.random.forEach((set, i) => {
    assert.ok(set.headings.length >= 3, `random[${i}] needs 3+ headings to offer three`);
    set.paragraphs.forEach((para, j) => {
      assert.ok(para.text.trim(), `random[${i}].paragraphs[${j}] is empty`);
      assert.ok(Number.isInteger(para.answer) && para.answer >= 0 && para.answer < set.headings.length);
    });
  });
});

test("no two pool words share a spelling", () => {
  const seen = new Set();
  task.pool.forEach((pair) => {
    const key = pair.answer.toLowerCase();
    assert.ok(!seen.has(key), `duplicate answer in pool: ${pair.answer}`);
    seen.add(key);
  });
});

function checkPuzzleShape(puzzle, wordCount, label) {
  assert.equal(puzzle.entries.length, wordCount, `${label}: expected ${wordCount} entries`);

  const solved = new Map(puzzle.cells.map((c) => [`${c[0]},${c[1]}`, c[2]]));
  const covered = new Set();

  puzzle.entries.forEach((entry) => {
    assert.match(entry.answer, /^[A-Z]+$/, `${label}: entry answer not all letters`);
    assert.ok(entry.clue && entry.clue.trim(), `${label}: entry ${entry.number} ${entry.dir} has no clue`);
    assert.match(entry.hint, /^[A-Z]$/, `${label}: entry ${entry.number} ${entry.dir} has no hint letter`);
    const dr = entry.dir === "down" ? 1 : 0;
    const dc = entry.dir === "down" ? 0 : 1;
    entry.answer.split("").forEach((ch, k) => {
      const key = `${entry.row + dr * k},${entry.col + dc * k}`;
      assert.equal(solved.get(key), ch, `${label}: ${entry.dir} ${entry.answer} disagrees with the grid at ${key}`);
      covered.add(key);
    });
  });

  // Every solution cell is reachable within [0,rows)x[0,cols) -- the bbox
  // trim in crossword-gen.js should leave no cell outside those bounds and
  // no row/column that is entirely empty framing the puzzle.
  solved.forEach((_letter, key) => {
    assert.ok(covered.has(key), `${label}: cell ${key} has a letter but no entry crosses it`);
    const [r, c] = key.split(",").map(Number);
    assert.ok(r >= 0 && r < puzzle.rows, `${label}: cell ${key} outside rows`);
    assert.ok(c >= 0 && c < puzzle.cols, `${label}: cell ${key} outside cols`);
  });

  // Numbering: a number is shared by an across and a down entry only when
  // they start at the same cell, and numbers are otherwise unique per cell.
  const numberToCell = new Map();
  puzzle.entries.forEach((entry) => {
    const cellKey = `${entry.row},${entry.col}`;
    if (numberToCell.has(entry.number)) {
      assert.equal(numberToCell.get(entry.number), cellKey, `${label}: entry number ${entry.number} used at two different cells`);
    } else {
      numberToCell.set(entry.number, cellKey);
    }
  });
}

test("E.generateCrossword lays out a full, internally-consistent puzzle (seeded, repeated)", () => {
  for (let seed = 0; seed < 15; seed += 1) {
    const puzzle = E.generateCrossword(task.pool, 8, { seed });
    checkPuzzleShape(puzzle, 8, `seed ${seed}`);
  }
});

test("E.generateCrossword deals a different puzzle on different seeds", () => {
  const a = E.generateCrossword(task.pool, 8, { seed: 1 });
  const b = E.generateCrossword(task.pool, 8, { seed: 2 });
  const wordsA = a.entries.map((e) => e.answer).sort().join(",");
  const wordsB = b.entries.map((e) => e.answer).sort().join(",");
  assert.notEqual(wordsA, wordsB);
});

test("E.generateCrossword respects a smaller word count", () => {
  const puzzle = E.generateCrossword(task.pool, 5, { seed: 7 });
  checkPuzzleShape(puzzle, 5, "count 5");
});
