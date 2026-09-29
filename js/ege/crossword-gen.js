import { E } from "./runtime.js";

/* Client-side crossword layout, a straight port of the greedy generator
   that used to run at build time (scripts/build_word_formation_crossword.py
   -- see git history). It now runs in the browser instead, dealing a fresh
   random 8 words out of the task's word pool and laying them out every
   time the drill opens, so no two visits (or "New puzzle" clicks) see the
   same grid. Kept as its own module so it can be unit-tested without a DOM.

   Algorithm: place the first word, then for every other candidate word try
   every (letter, already-placed cell) pair where the letters match, check
   whether crossing there is legal (is_valid_placement), and take whichever
   legal placement shares the most letters with the existing grid, breaking
   ties toward whatever grows the puzzle's bounding box the least (keeps it
   squarish instead of sprawling). A word with no legal placement sits out
   of that attempt. Every attempt is scored by its total crossings, and all
   `attempts` random samples/orderings are tried (not just until one fits)
   so the densest, most-connected fully-placed layout can be kept instead of
   just the first one that happens to fit every word. */

function shuffle(list, rng) {
  var arr = list.slice();
  for (var i = arr.length - 1; i > 0; i -= 1) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function sample(pool, count, rng) {
  return shuffle(pool, rng).slice(0, count);
}

function cellKey(r, c) {
  return r + "," + c;
}

function bboxOf(grid) {
  var minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  Object.keys(grid).forEach(function (key) {
    var parts = key.split(",");
    var r = parseInt(parts[0], 10);
    var c = parseInt(parts[1], 10);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  });
  return { minR: minR, maxR: maxR, minC: minC, maxC: maxC };
}

function bboxGrowth(bbox, startR, startC, dr, dc, n) {
  var endR = startR + dr * (n - 1);
  var endC = startC + dc * (n - 1);
  var newMinR = Math.min(bbox.minR, startR, endR);
  var newMaxR = Math.max(bbox.maxR, startR, endR);
  var newMinC = Math.min(bbox.minC, startC, endC);
  var newMaxC = Math.max(bbox.maxC, startC, endC);
  var oldArea = (bbox.maxR - bbox.minR + 1) * (bbox.maxC - bbox.minC + 1);
  var newArea = (newMaxR - newMinR + 1) * (newMaxC - newMinC + 1);
  return newArea - oldArea;
}

function isValidPlacement(grid, answer, startR, startC, dr, dc) {
  var n = answer.length;
  var before = cellKey(startR - dr, startC - dc);
  var after = cellKey(startR + dr * n, startC + dc * n);
  if (grid[before] || grid[after]) return false;

  var intersections = 0;
  for (var k = 0; k < n; k += 1) {
    var r = startR + dr * k;
    var c = startC + dc * k;
    var ch = answer[k];
    var existing = grid[cellKey(r, c)];
    if (existing) {
      if (existing !== ch) return false;
      intersections += 1;
    } else if (dr === 0) {
      if (grid[cellKey(r - 1, c)] || grid[cellKey(r + 1, c)]) return false;
    } else {
      if (grid[cellKey(r, c - 1)] || grid[cellKey(r, c + 1)]) return false;
    }
  }
  return intersections >= 1;
}

function findBestPlacement(grid, answer) {
  var bbox = bboxOf(grid);
  var best = null;
  Object.keys(grid).forEach(function (key) {
    var letter = grid[key];
    var parts = key.split(",");
    var r = parseInt(parts[0], 10);
    var c = parseInt(parts[1], 10);
    for (var i = 0; i < answer.length; i += 1) {
      if (answer[i] !== letter) continue;
      [[0, 1], [1, 0]].forEach(function (dir) {
        var dr = dir[0], dc = dir[1];
        var startR = r - dr * i;
        var startC = c - dc * i;
        if (!isValidPlacement(grid, answer, startR, startC, dr, dc)) return;
        var intersections = 0;
        for (var k = 0; k < answer.length; k += 1) {
          if (grid[cellKey(startR + dr * k, startC + dc * k)]) intersections += 1;
        }
        var growth = bboxGrowth(bbox, startR, startC, dr, dc, answer.length);
        if (
          !best ||
          intersections > best.intersections ||
          (intersections === best.intersections && growth < best.growth)
        ) {
          best = { row: startR, col: startC, dr: dr, dc: dc, intersections: intersections, growth: growth };
        }
      });
    }
  });
  return best;
}

function placeWord(grid, placed, pair, row, col, dr, dc, intersections) {
  for (var k = 0; k < pair.answer.length; k += 1) {
    grid[cellKey(row + dr * k, col + dc * k)] = pair.answer[k];
  }
  placed.push({
    answer: pair.answer,
    clue: pair.clue,
    hint: pair.hint,
    hintAt: pair.hintAt || 0,
    row: row,
    col: col,
    dir: dc ? "across" : "down",
    intersections: intersections || 0,
  });
}

function attemptLayout(pairs, rng) {
  var order = shuffle(pairs, rng).sort(function (a, b) {
    return b.answer.length - a.answer.length;
  });

  var grid = {};
  var placed = [];
  placeWord(grid, placed, order[0], 0, 0, 0, 1, 0);

  var totalIntersections = 0;
  var remaining = order.slice(1);
  var progress = true;
  while (remaining.length && progress) {
    progress = false;
    var still = [];
    remaining.forEach(function (pair) {
      var best = findBestPlacement(grid, pair.answer);
      if (best) {
        placeWord(grid, placed, pair, best.row, best.col, best.dr, best.dc, best.intersections);
        totalIntersections += best.intersections;
        progress = true;
      } else {
        still.push(pair);
      }
    });
    remaining = still;
  }

  return { grid: grid, placed: placed, totalIntersections: totalIntersections };
}

function numberEntries(placed) {
  var starts = {};
  placed.forEach(function (entry) {
    var key = cellKey(entry.row, entry.col);
    (starts[key] = starts[key] || []).push(entry);
  });
  var keys = Object.keys(starts).sort(function (a, b) {
    var ap = a.split(",").map(Number);
    var bp = b.split(",").map(Number);
    return ap[0] - bp[0] || ap[1] - bp[1];
  });
  var numbered = [];
  keys.forEach(function (key, index) {
    starts[key].forEach(function (entry) {
      numbered.push(Object.assign({}, entry, { number: index + 1 }));
    });
  });
  numbered.sort(function (a, b) {
    return a.dir === b.dir ? a.number - b.number : a.dir === "across" ? -1 : 1;
  });
  return numbered;
}

// Mirrors a layout along its diagonal: rows become columns and across words
// become down words, so every crossing (and every letter) is kept. This is
// how a puzzle that came out tall is turned on its side to grow wide (or the
// reverse) without touching how densely it packs.
function transposeLayout(grid, placed) {
  var flipped = {};
  Object.keys(grid).forEach(function (key) {
    var parts = key.split(",");
    flipped[parts[1] + "," + parts[0]] = grid[key];
  });
  return {
    grid: flipped,
    placed: placed.map(function (entry) {
      return Object.assign({}, entry, {
        row: entry.col,
        col: entry.row,
        dir: entry.dir === "across" ? "down" : "across",
      });
    }),
  };
}

// orientation: "wide" makes the puzzle at least as wide as it is tall,
// "tall" the opposite, anything else leaves it however it fell.
function orient(grid, placed, orientation) {
  var bbox = bboxOf(grid);
  var height = bbox.maxR - bbox.minR + 1;
  var width = bbox.maxC - bbox.minC + 1;
  var wrongWay = orientation === "wide" ? height > width : orientation === "tall" ? width > height : false;
  return wrongWay ? transposeLayout(grid, placed) : { grid: grid, placed: placed };
}

function emitPuzzle(grid, placed) {
  var bbox = bboxOf(grid);
  var cells = Object.keys(grid).map(function (key) {
    var parts = key.split(",");
    return [parseInt(parts[0], 10) - bbox.minR, parseInt(parts[1], 10) - bbox.minC, grid[key]];
  });
  var entries = numberEntries(placed).map(function (entry) {
    return {
      number: entry.number,
      dir: entry.dir,
      row: entry.row - bbox.minR,
      col: entry.col - bbox.minC,
      answer: entry.answer,
      clue: entry.clue,
      hint: entry.hint,
      hintAt: entry.hintAt,
    };
  });
  return {
    rows: bbox.maxR - bbox.minR + 1,
    cols: bbox.maxC - bbox.minC + 1,
    cells: cells,
    entries: entries,
  };
}

/* Mulberry32 -- a tiny seedable PRNG so tests can ask for a deterministic
   puzzle. Real play always calls E.generateCrossword with no seed, which
   falls back to Math.random. */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fillDensity(grid) {
  var bbox = bboxOf(grid);
  var area = (bbox.maxR - bbox.minR + 1) * (bbox.maxC - bbox.minC + 1);
  return Object.keys(grid).length / area;
}

// How lopsided a layout is, always >= 1 (long side / short side), since a
// layout can be turned on its side for free and only its shape matters.
function aspectOf(grid) {
  var bbox = bboxOf(grid);
  var h = bbox.maxR - bbox.minR + 1;
  var w = bbox.maxC - bbox.minC + 1;
  return Math.max(h, w) / Math.min(h, w);
}

// Tuned by sampling 60 puzzles each at 6, 8 and 10 words. A 10-word puzzle
// comes out at most 11 rows tall (about 13, up to 17, when only density
// counts) for a density near 0.40 instead of 0.44; raising the weight or cap
// buys a little more width at a real cost in dark filler squares. Past the
// cap, stretching further only costs density.
var ASPECT_CAP = 1.8;
var ASPECT_WEIGHT = 1.0;

// Density alone, or -- when a lopsided (wide or tall) puzzle is wanted --
// density scaled up by how lopsided the layout is, so the search prefers a
// long thin puzzle over an equally dense square one.
function layoutScore(grid, orientation) {
  var density = fillDensity(grid);
  if (orientation !== "wide" && orientation !== "tall") return density;
  return density * Math.pow(Math.min(aspectOf(grid), ASPECT_CAP), ASPECT_WEIGHT);
}

E.generateCrossword = function generateCrossword(pool, wordCount, options) {
  options = options || {};
  var count = Math.min(wordCount || 8, pool.length);
  var attempts = options.attempts || 150;
  var rng = options.seed != null ? mulberry32(options.seed) : Math.random;

  // Run every attempt (rather than stopping at the first full placement)
  // and keep whichever fully-placed layout packs its letters most densely
  // into its own bounding box. Raw total crossings alone can pick a layout
  // where one long word juts far out for a single extra crossing, ballooning
  // the bounding box into a mostly-empty rectangle of blocked squares --
  // density (filled cells / bbox area) rewards being well-connected AND
  // compact, which is what actually keeps the grid free of dead space.
  var bestFull = null;
  var bestPartial = null;
  for (var i = 0; i < attempts; i += 1) {
    var picked = sample(pool, count, rng);
    var result = attemptLayout(picked, rng);
    if (result.placed.length === count) {
      result.score = layoutScore(result.grid, options.orientation);
      if (!bestFull || result.score > bestFull.score) {
        bestFull = result;
      }
    } else if (!bestPartial || result.placed.length > bestPartial.placed.length) {
      // Every attempt fell short of the full count (rare) -- ship the best
      // partial layout rather than fail the drill outright.
      bestPartial = result;
    }
  }
  var chosen = bestFull || bestPartial;
  var oriented = orient(chosen.grid, chosen.placed, options.orientation);
  return emitPuzzle(oriented.grid, oriented.placed);
};

export { mulberry32 };
