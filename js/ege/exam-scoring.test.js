import test from "node:test";
import assert from "node:assert/strict";
import { E } from "./runtime.js";
import "./util.js";
import "./exam-scoring.config.js";
import "./exam-scoring.js";
import "./points.js";

test("normalizeAnswer trims, uppercases, strips spaces and hyphens", () => {
  assert.equal(E.normalizeAnswer("  hello-world  "), "HELLOWORLD");
  assert.equal(E.normalizeAnswer("New York"), "NEWYORK");
});

test("scoreShortAnswer does not credit a blank answer against a missing key", () => {
  assert.equal(E.scoreShortAnswer("", undefined), 0);
  assert.equal(E.scoreShortAnswer("", ""), 0);
  assert.equal(E.scoreShortAnswer("anything", ""), 0);
  // A real key still grades normally, index 0 included.
  assert.equal(E.scoreShortAnswer("5", "5"), 1);
  assert.equal(E.scoreShortAnswer(0, 0), 1);
  assert.equal(E.scoreShortAnswer("", "5"), 0);
});

test("buildAcceptedAnswers keeps BrE/AmE pairs but not -ise misspellings", () => {
  const has = (answer, variant) =>
    E.buildAcceptedAnswers(answer).indexOf(variant) !== -1;

  // -ise is the stem here, not the verb suffix: there is no -ize twin.
  assert.equal(has("otherwise", "otherwize"), false);
  assert.equal(has("surprise", "surprize"), false);
  assert.equal(has("exercise", "exercize"), false);
  assert.equal(has("promise", "promize"), false);
  assert.equal(has("capsize", "capsise"), false);
  // Inflected forms resolve to the same lemma.
  assert.equal(has("surprised", "surprized"), false);

  // Genuine spelling pairs still accepted, both directions.
  assert.equal(has("colonise", "colonize"), true);
  assert.equal(has("energized", "energised"), true);
  assert.equal(has("empathize", "empathise"), true);
  assert.equal(has("organisations", "organizations"), true);
  assert.equal(has("well-organised", "well-organized"), true);
});

test("convertToTestScore at key boundaries", () => {
  assert.equal(E.convertToTestScore(0), 0);
  assert.equal(E.convertToTestScore(22), 26);
  assert.equal(E.convertToTestScore(30), 36);
  assert.equal(E.convertToTestScore(82), 100);
});

test("examBandPrimary converts task 1 raw scores", () => {
  assert.equal(E.examBandPrimary(6, 6, 3), 3);
  assert.equal(E.examBandPrimary(0, 6, 3), 0);
});

test("getGrowthPotential uses section deltas not mistake count", () => {
  var growth = E.getGrowthPotential(
    { listening: 10, reading: 12, useOfEnglish: 18, writing: 0, speaking: 0 },
    [{ examNum: "1" }, { examNum: "2" }],
    40
  );
  assert.equal(growth.recoverablePrimary, 2);
});

test("buildExamSectionInputs returns zeros without topic", () => {
  var prev = E.state.topic;
  E.state.topic = null;
  var inputs = E.buildExamSectionInputs();
  E.state.topic = prev;
  assert.equal(inputs.listening, 0);
  assert.equal(inputs.speakingEval.total, 0);
});
