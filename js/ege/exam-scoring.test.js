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
