#!/usr/bin/env node
// Brute-force uniqueness checker for data/writing.json's "Data Deduction"
// clue sets (the `deduction-*` tasks). For each task carrying a `_validate`
// block, tries every permutation of `_validate.percentages` against
// `_validate.options` and asserts that exactly one permutation satisfies
// every clue in `_validate.checks` — and that it's the one encoded in the
// task's `left[].match` / `right[]` pairing data. Run this whenever a task
// is added or edited:
//
//   node scripts/validate-deduction.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EPS = 1e-9;

function checkCondition(assignment, check) {
  switch (check.op) {
    case "max":
      return assignment[check.a] === Math.max(...Object.values(assignment));
    case "min":
      return assignment[check.a] === Math.min(...Object.values(assignment));
    case "ratio":
      return Math.abs(assignment[check.a] - check.factor * assignment[check.b]) < EPS;
    case "margin":
      return Math.abs(assignment[check.high] - assignment[check.low] - check.points) < EPS;
    case "between":
      return assignment[check.low] < assignment[check.mid] && assignment[check.mid] < assignment[check.high];
    case "fraction":
      return Math.abs(assignment[check.a] - check.value * 100) < EPS;
    case "threshold": {
      const target = check.value * 100;
      if (check.cmp === "gt") return assignment[check.a] > target;
      if (check.cmp === "gte") return assignment[check.a] >= target;
      if (check.cmp === "lt") return assignment[check.a] < target;
      if (check.cmp === "lte") return assignment[check.a] <= target;
      throw new Error("unknown threshold cmp: " + check.cmp);
    }
    case "onlyAbove": {
      const target = check.threshold * 100;
      return Object.keys(assignment).every((key) =>
        key === check.a ? assignment[key] > target : assignment[key] <= target
      );
    }
    default:
      throw new Error("unknown check op: " + check.op);
  }
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((item, i) => {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    permutations(rest).forEach((p) => out.push([item, ...p]));
  });
  return out;
}

// Reusable entry point: throws if `task._validate` doesn't have exactly one
// permutation satisfying all its checks, or if that permutation disagrees
// with the task's authored `left`/`right` pairing (the actual answer key).
export function validateTask(task) {
  const v = task._validate;
  if (!v) throw new Error(task.id + ": missing _validate block");
  const { options, percentages, checks } = v;
  if (options.length !== percentages.length) {
    throw new Error(task.id + ": options/percentages length mismatch");
  }

  const solutions = permutations(percentages).filter((perm) => {
    const assignment = {};
    options.forEach((opt, i) => (assignment[opt] = perm[i]));
    return checks.every((check) => checkCondition(assignment, check));
  });

  if (solutions.length !== 1) {
    throw new Error(
      task.id + ": expected exactly one valid permutation, found " + solutions.length
    );
  }

  const solved = {};
  options.forEach((opt, i) => (solved[opt] = solutions[0][i]));

  if (task.left && task.right) {
    const percentByRightId = {};
    task.right.forEach((r) => (percentByRightId[r.id] = parseInt(r.code, 10)));
    task.left.forEach((item) => {
      const keyed = percentByRightId[item.match];
      if (keyed !== solved[item.text]) {
        throw new Error(
          task.id + ": clue-derived answer disagrees with authored key for \"" + item.text +
            "\" (clues say " + solved[item.text] + ", key says " + keyed + ")"
        );
      }
    });
  }

  return solved;
}

function main() {
  const dataPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "data",
    "writing.json"
  );
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  let failures = 0;

  data.tasks.filter((task) => task._validate).forEach((task) => {
    try {
      validateTask(task);
      console.log("OK   " + task.id);
    } catch (err) {
      failures += 1;
      console.error("FAIL " + task.id + ": " + err.message);
    }
  });

  if (failures > 0) {
    console.error("\n" + failures + " task(s) failed validation.");
    process.exit(1);
  }
  console.log("\nAll tasks have exactly one valid solution.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
