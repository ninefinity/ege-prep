import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { E } from "./runtime.js";
import "./util.js";
import "./exam-scoring.config.js";
import "./exam-scoring.js";
import "./chart.js";
import "./judge.js";
import "./choice.js";
import "./pairing.js";
import "./ordering.js";

const tasks = ["writing-skills-questions", "writing-skills-facts"].flatMap(
  (id) => JSON.parse(readFileSync(new URL(`../../data/${id}.json`, import.meta.url))).tasks
);
const judged = tasks.filter((t) => t.type === "judge");
const chosen = tasks.filter((t) => t.type === "choice");
const paired = tasks.filter((t) => t.type === "pairing");
const ordered = tasks.filter((t) => t.type === "ordering");

test("judge verdicts map onto the two pill values", () => {
  assert.equal(E.judgeExpectedValue({ correct: true }), E.JUDGE_YES);
  assert.equal(E.judgeExpectedValue({ correct: false }), E.JUDGE_NO);
  assert.notEqual(E.JUDGE_YES, E.JUDGE_NO);
});

test("judgeLabels falls back when a task omits them", () => {
  assert.deepEqual(E.judgeLabels({ labels: { yes: "Accurate", no: "Inaccurate" } }), [
    "Accurate",
    "Inaccurate",
  ]);
  assert.deepEqual(E.judgeLabels({}), ["Valid", "Invalid"]);
  assert.deepEqual(E.judgeLabels(null), ["Valid", "Invalid"]);
});

test("choice expected value is the 1-based index of the correct option", () => {
  const q = { options: [{ correct: false }, { correct: true }, { correct: false }] };
  assert.equal(E.choiceCorrectIndex(q), 1);
  assert.equal(E.choiceExpectedValue(q), "2");
  // A question with no correct option must not silently grade as blank-correct.
  assert.equal(E.choiceExpectedValue({ options: [{ correct: false }] }), "");
});

test("taskMaxScore counts one point per item, question, pair or slot", () => {
  judged.forEach((task) => assert.equal(E.taskMaxScore(task), task.items.length));
  chosen.forEach((task) => assert.equal(E.taskMaxScore(task), task.questions.length));
  paired.forEach((task) => assert.equal(E.taskMaxScore(task), task.left.length));
  ordered.forEach((task) =>
    assert.equal(E.taskMaxScore(task), E.orderingSlots(task).length)
  );
});

test("pairing keeps a 1:1 map and leaves a distractor spare", () => {
  assert.ok(paired.length > 0);
  paired.forEach((task) => {
    const rightIds = new Set(task.right.map((r) => r.id));
    const matches = task.left.map((l) => l.match);
    matches.forEach((m) => assert.ok(rightIds.has(m), `${task.id}: ${m}`));
    assert.equal(new Set(matches).size, matches.length, `${task.id}: shared solution`);
    assert.ok(task.right.length > task.left.length, `${task.id}: no distractor`);
    task.right
      .filter((r) => r.distractor)
      .forEach((r) =>
        assert.ok(!matches.includes(r.id), `${task.id}: ${r.id} is both distractor and answer`)
      );
  });
});

test("pairing binds two-click and stays 1:1", () => {
  const taskId = "unit-pairing";
  E.resetPairingState(taskId);
  E.bindPair(taskId, "p1", "s1");
  E.bindPair(taskId, "p2", "s2");
  assert.deepEqual(E.pairingState(taskId).pairs, { p1: "s1", p2: "s2" });
  // Re-using s1 must release p1 rather than double-book the solution.
  E.bindPair(taskId, "p3", "s1");
  assert.deepEqual(E.pairingState(taskId).pairs, { p2: "s2", p3: "s1" });
  E.resetPairingState(taskId);
  assert.deepEqual(E.pairingState(taskId).pairs, {});
});

test("ordering fills every slot exactly once", () => {
  assert.ok(ordered.length > 0);
  ordered.forEach((task) => {
    const slotIds = E.orderingSlots(task).map((s) => s.id);
    assert.equal(new Set(slotIds).size, slotIds.length, `${task.id}: duplicate slot`);
    assert.equal(task.pool.length, slotIds.length, `${task.id}: pool/slot mismatch`);
    const targets = task.pool.map((p) => p.slot);
    assert.equal(new Set(targets).size, targets.length, `${task.id}: two sentences per slot`);
    targets.forEach((t) => assert.ok(slotIds.includes(t), `${task.id}: ${t} has no slot`));
  });
});

test("every judge drill can discriminate", () => {
  assert.ok(judged.length > 0);
  judged.forEach((task) => {
    assert.ok(task.items.length >= 2, task.id);
    const verdicts = new Set(task.items.map((i) => i.correct));
    assert.equal(verdicts.size, 2, task.id);
    const ids = task.items.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, task.id);
    task.items.forEach((item) => {
      assert.equal(typeof item.correct, "boolean", `${task.id}/${item.id}`);
      assert.ok(item.text && item.feedback, `${task.id}/${item.id}`);
    });
  });
});

test("every choice question has exactly one answer", () => {
  assert.ok(chosen.length > 0);
  chosen.forEach((task) => {
    const ids = task.questions.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length, task.id);
    task.questions.forEach((q) => {
      assert.ok(q.stem, `${task.id}/${q.id}`);
      assert.ok(q.options.length >= 2, `${task.id}/${q.id}`);
      assert.equal(
        q.options.filter((o) => o.correct).length,
        1,
        `${task.id}/${q.id} must have exactly one correct option`
      );
      q.options.forEach((o) => assert.ok(o.text, `${task.id}/${q.id}`));
    });
  });
});

test("chart specs are shaped for the renderer", () => {
  const charted = tasks.filter((t) => t.chart);
  assert.ok(charted.length > 0);
  charted.forEach((task) => {
    assert.ok(["bar", "pie"].includes(task.chart.kind), task.id);
    const rows = E.chartRows(task.chart);
    assert.equal(rows.length, task.chart.data.length, task.id);
    assert.ok(rows.length >= 2, task.id);
    // Axis rounds up to the next ten so bars never touch the edge.
    assert.ok(E.chartAxisMax(rows) >= Math.max(...rows.map((r) => r.value)), task.id);
  });
});

test("callout relaxation separates overlapping labels", () => {
  const items = [
    { y: 100, boxH: 40 },
    { y: 104, boxH: 40 },
    { y: 108, boxH: 40 },
  ];
  E.relaxChartCallouts(items, 0, 400, 10);
  for (let i = 1; i < items.length; i += 1) {
    const need = items[i - 1].boxH / 2 + items[i].boxH / 2 + 10;
    assert.ok(items[i].y - items[i - 1].y >= need - 0.01, "labels still overlap");
  }
});
