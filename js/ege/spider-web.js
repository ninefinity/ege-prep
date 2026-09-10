import { E } from "./runtime.js";

/* "spider-web" is a self-scoring skills drill (like "pronounce"): the task
   root word sits at the center of a web, its derivatives hang around it as
   flies, and the student types the missing derivative into a cloze sentence
   and presses Enter to guess. A correct guess sends the fly flying into the
   spider's jaws; a wrong guess costs one of three patience points. Losing
   all patience makes the spider flee (round over, loss). Catching every fly
   also ends the round (win). There is no Check/Reset/Show-answers footer --
   the game manages its own state and its own Reveal button.

   Ported from the standalone Spider Web game (game.js / style.css). Menu,
   level grid, level navigation, localStorage level persistence and the Hub
   dictionary lookup are intentionally NOT ported -- the task IS the level:
   task.root and task.derivatives supply everything the standalone game used
   to load from levels.json. */

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_WRONG = 3;

/* Polar-tree layout constants -- see computeWordLayout(). */
const R_INNER_MIN = 24;
const R_OUTER_MAX = 41;
const COMPOUND_GAP_BONUS = 2;
const TOP_GAP = (40 * Math.PI) / 180;
const LAYOUT_CX = 50;
const LAYOUT_CY = 50;

const REVEAL_STAGGER_MS = 90;
const FLY_TO_SPIDER_MS = 750;

// taskId -> game state (found words, misses, streak, layout cache, ...)
var games = {};
// taskId -> live DOM references into the article built for that task
var doms = {};

/* ---------------------------------------------------------------- utils */

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function toMatchKey(value) {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function hashString(str) {
  var h = 2166136261;
  var s = String(str || "");
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* Mulberry32 PRNG: deterministic, lightweight; seeded by an integer -- keeps
   the background web's spiral/dew jitter stable across re-renders. */
function makeSeededRng(seed) {
  var t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    var r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const POS_SLUGS = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "preposition",
  "pronoun",
  "conjunction",
  "interjection",
];

const POS_ALIAS = {
  noun: "noun",
  n: "noun",
  verb: "verb",
  v: "verb",
  adjective: "adjective",
  adj: "adjective",
  adverb: "adverb",
  adv: "adverb",
  preposition: "preposition",
  prep: "preposition",
  pronoun: "pronoun",
  pron: "pronoun",
  conjunction: "conjunction",
  conj: "conjunction",
  interjection: "interjection",
  int: "interjection",
  participle: "verb",
  gerund: "verb",
};

function normalizePartOfSpeechSlug(input) {
  var s = normalize(String(input || "")).replace(/[^a-z]/g, "");
  if (POS_ALIAS[s]) return POS_ALIAS[s];
  if (POS_SLUGS.indexOf(s) !== -1) return s;
  return "noun";
}

function partOfSpeechSlugs(raw) {
  if (Array.isArray(raw)) return raw.map(normalizePartOfSpeechSlug);
  if (typeof raw === "string" && raw.trim()) return [normalizePartOfSpeechSlug(raw)];
  return [];
}

function primaryPosSlug(slugs) {
  return slugs.length ? slugs[0] : "noun";
}

function rawPrimaryPos(item) {
  var raw = Array.isArray(item && item.pos) ? item.pos[0] : item && item.pos;
  return normalize(String(raw || "")).replace(/[\s-]+/g, "_");
}

function isCompoundWord(item) {
  return normalize(item && item.quality) === "compound";
}

/* Map a derivative's attributes to the best matching fly sprite. */
const FLY_SPRITES = {
  noun: "assets/fly_noun.png",
  verb: "assets/fly_verb.png",
  adjective: "assets/fly_adjective.png",
  adverb: "assets/fly_adverb.png",
  gerund: "assets/fly_gerund.png",
  past_participle: "assets/fly_past_participle.png",
  compound_noun: "assets/fly_compound_noun.png",
  compound_adjective: "assets/fly_compound_adjective.png",
};

function flySpriteForItem(item) {
  var normalizedPos = primaryPosSlug(partOfSpeechSlugs(item && item.pos));
  var rawPos = rawPrimaryPos(item);
  var compound = isCompoundWord(item);

  if (compound) {
    var compoundKey = "compound_" + normalizedPos;
    return FLY_SPRITES[compoundKey] || FLY_SPRITES[normalizedPos] || FLY_SPRITES.noun;
  }
  if (rawPos === "gerund") return FLY_SPRITES.gerund || FLY_SPRITES.verb;
  if (rawPos === "past_participle" || rawPos === "pastparticiple") {
    return FLY_SPRITES.past_participle || FLY_SPRITES.verb;
  }
  return FLY_SPRITES[normalizedPos] || FLY_SPRITES.noun;
}

function definitionTextForDerivative(item) {
  var fromTask = item && typeof item.definition === "string" ? item.definition.trim() : "";
  return fromTask;
}

function fallbackDerivativeDefinition(task) {
  var root = (task && task.root) || "root";
  return 'Word related to "' + root + '".';
}

function displayDefinitionForDerivative(task, item) {
  var gloss = definitionTextForDerivative(item);
  if (gloss) return gloss;
  return fallbackDerivativeDefinition(task);
}

function getDerivatives(task) {
  return Array.isArray(task && task.derivatives) ? task.derivatives : [];
}

/* -------------------------------------------------------------- layout */

function computeWordLayout(derivatives, rootStr) {
  var rootNorm = normalize(rootStr);
  var byWord = Object.create(null);
  derivatives.forEach(function (item) {
    byWord[normalize(item.word)] = item;
  });

  function resolveParentKey(item) {
    var wordNorm = normalize(item.word);
    var fromNorm = normalize(item.from);
    if (!fromNorm || fromNorm === wordNorm || fromNorm === rootNorm) return rootNorm;
    return byWord[fromNorm] ? fromNorm : rootNorm;
  }

  var parentOf = Object.create(null);
  var children = Object.create(null);
  children[rootNorm] = [];
  derivatives.forEach(function (item) {
    var w = normalize(item.word);
    var p = resolveParentKey(item);
    parentOf[w] = p;
    if (!children[p]) children[p] = [];
    children[p].push(item);
  });
  Object.keys(children).forEach(function (k) {
    children[k].sort(function (a, b) {
      return normalize(a.word).localeCompare(normalize(b.word));
    });
  });

  var isOuter = Object.create(null);
  isOuter[rootNorm] = false;
  function markZone(nodeKey) {
    (children[nodeKey] || []).forEach(function (item) {
      var w = normalize(item.word);
      isOuter[w] = isCompoundWord(item) || !!isOuter[nodeKey];
      markZone(w);
    });
  }
  markZone(rootNorm);

  var innerDepthOf = Object.create(null);
  var outerDepthOf = Object.create(null);
  innerDepthOf[rootNorm] = 0;
  function assignDepths(nodeKey) {
    (children[nodeKey] || []).forEach(function (item) {
      var w = normalize(item.word);
      if (isOuter[w]) {
        outerDepthOf[w] = isOuter[nodeKey] ? (outerDepthOf[nodeKey] || 0) + 1 : 0;
      } else {
        innerDepthOf[w] = (innerDepthOf[nodeKey] || 0) + 1;
      }
      assignDepths(w);
    });
  }
  assignDepths(rootNorm);

  var maxInnerRing = 0;
  Object.keys(innerDepthOf).forEach(function (k) {
    if (k === rootNorm) return;
    if (innerDepthOf[k] > maxInnerRing) maxInnerRing = innerDepthOf[k];
  });

  var ringIdx = Object.create(null);
  derivatives.forEach(function (item) {
    var w = normalize(item.word);
    ringIdx[w] = isOuter[w]
      ? maxInnerRing + 1 + (outerDepthOf[w] || 0)
      : innerDepthOf[w] || 1;
  });

  var totalRings = 0;
  derivatives.forEach(function (item) {
    var r = ringIdx[normalize(item.word)] || 1;
    if (r > totalRings) totalRings = r;
  });
  if (totalRings < 1) totalRings = 1;

  var radii = new Array(totalRings + 1);
  radii[0] = 0;
  if (totalRings === 1) {
    radii[1] = (R_INNER_MIN + R_OUTER_MAX) / 2;
  } else {
    var span = R_OUTER_MAX - R_INNER_MIN;
    for (var i = 1; i <= totalRings; i++) {
      radii[i] = R_INNER_MIN + ((i - 1) * span) / (totalRings - 1);
    }
  }
  if (maxInnerRing >= 1) {
    for (var j = maxInnerRing + 1; j <= totalRings; j++) {
      radii[j] = Math.min(R_OUTER_MAX, radii[j] + COMPOUND_GAP_BONUS);
    }
  }

  var angleByWord = Object.create(null);
  var sweepStart = -Math.PI / 2 + TOP_GAP / 2;
  var sweepEnd = sweepStart + (Math.PI * 2 - TOP_GAP);

  function assignWedge(nodeKey, startAngle, endAngle) {
    angleByWord[nodeKey] = (startAngle + endAngle) / 2;
    var kids = children[nodeKey] || [];
    if (!kids.length) return;
    var slice = (endAngle - startAngle) / kids.length;
    kids.forEach(function (item, idx) {
      var w = normalize(item.word);
      assignWedge(w, startAngle + idx * slice, startAngle + (idx + 1) * slice);
    });
  }
  assignWedge(rootNorm, sweepStart, sweepEnd);

  var pos = Object.create(null);
  pos[rootNorm] = { x: LAYOUT_CX, y: LAYOUT_CY };
  derivatives.forEach(function (item) {
    var w = normalize(item.word);
    var r = radii[ringIdx[w] || 1] || R_INNER_MIN;
    var a = angleByWord[w];
    var angle = typeof a === "number" ? a : -Math.PI / 2;
    pos[w] = {
      x: LAYOUT_CX + Math.cos(angle) * r,
      y: LAYOUT_CY + Math.sin(angle) * r,
    };
  });

  return { pos: pos, resolveParentKey: resolveParentKey, parentOf: parentOf };
}

function getLayout(taskId) {
  var g = games[taskId];
  if (!g.layoutCache) {
    g.layoutCache = computeWordLayout(getDerivatives(g.task), g.task.root);
  }
  return g.layoutCache;
}

/* -------------------------------------------------------------- markup */

function fillWebNodeInner(inner, wordText, slugs) {
  inner.className = "sw-node-inner";
  var wordEl = document.createElement("span");
  var primary = primaryPosSlug(slugs);
  wordEl.className =
    "sw-node-word pos-word pos-word--" +
    primary +
    (wordText === "?" ? " sw-node-word--hidden" : "");
  wordEl.textContent = wordText;
  inner.appendChild(wordEl);
}

function getFlyLiftViewBox(refs) {
  var svg = refs.webBranchLines && refs.webBranchLines.ownerSVGElement;
  if (!svg) return 0;
  var rect = svg.getBoundingClientRect();
  if (!rect.height) return 0;
  var styles = getComputedStyle(svg);
  var liftRaw = styles.getPropertyValue("--fly-lift").trim();
  var liftPx = parseFloat(liftRaw) || 18;
  return (liftPx / rect.height) * 100;
}

function renderBranchLines(taskId) {
  var g = games[taskId];
  var refs = doms[taskId];
  if (!refs.webBranchLines) return;
  refs.webBranchLines.innerHTML = "";
  var rootKey = normalize(g.task.root);
  var layout = getLayout(taskId);
  var flyLiftVb = getFlyLiftViewBox(refs);

  getDerivatives(g.task).forEach(function (item) {
    var w = normalize(item.word);
    var parentKey = layout.resolveParentKey(item);
    if (parentKey === rootKey && isCompoundWord(item)) return;
    var p0 = layout.pos[parentKey];
    var p1 = layout.pos[w];
    if (!p0 || !p1) return;

    var parentLifted = parentKey !== rootKey && !g.foundWords.has(parentKey);
    var childLifted = !g.foundWords.has(w);
    var y1 = parentLifted ? p0.y - flyLiftVb : p0.y;
    var y2 = childLifted ? p1.y - flyLiftVb : p1.y;

    var line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(p0.x));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(p1.x));
    line.setAttribute("y2", String(y2));
    refs.webBranchLines.appendChild(line);
  });
}

/* Background spider web: 12 spokes, spiral threads, scattered dewdrops. */
function renderWebBackground(taskId) {
  var g = games[taskId];
  var refs = doms[taskId];
  if (!refs.webSpokes || !refs.webSpirals || !refs.webDew) return;

  refs.webSpokes.innerHTML = "";
  refs.webSpirals.innerHTML = "";
  refs.webDew.innerHTML = "";

  var SPOKE_COUNT = 12;
  var SPOKE_REACH = R_OUTER_MAX + 6;
  var seed = hashString(g.task.id || "spider-web");
  var rng = makeSeededRng(seed);

  var spokeAngles = [];
  for (var i = 0; i < SPOKE_COUNT; i++) {
    var base = -Math.PI / 2 + (i / SPOKE_COUNT) * Math.PI * 2;
    var jitter = (rng() - 0.5) * 0.08;
    spokeAngles.push(base + jitter);
  }

  var gradRef = "url(#sw-thread-gradient" + refs.svgIdSuffix + ")";
  var filterRef = "url(#sw-thread-glow" + refs.svgIdSuffix + ")";
  var dewRef = "url(#sw-dew-gradient" + refs.svgIdSuffix + ")";

  spokeAngles.forEach(function (angle) {
    var x2 = LAYOUT_CX + Math.cos(angle) * SPOKE_REACH;
    var y2 = LAYOUT_CY + Math.sin(angle) * SPOKE_REACH;
    var line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(LAYOUT_CX));
    line.setAttribute("y1", String(LAYOUT_CY));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    line.setAttribute("stroke", gradRef);
    line.setAttribute("filter", filterRef);
    refs.webSpokes.appendChild(line);
  });

  var spiralRadii = [12, 19, 27, 35, 42];
  spiralRadii.forEach(function (baseRadius, ringIdx) {
    var points = [];
    for (var k = 0; k <= SPOKE_COUNT; k++) {
      var angle = spokeAngles[k % SPOKE_COUNT];
      var drift = (rng() - 0.5) * 1.6;
      var radius = baseRadius + drift;
      var x = LAYOUT_CX + Math.cos(angle) * radius;
      var y = LAYOUT_CY + Math.sin(angle) * radius;
      points.push(x.toFixed(2) + "," + y.toFixed(2));
    }
    var polyline = document.createElementNS(SVG_NS, "polyline");
    polyline.setAttribute("points", points.join(" "));
    polyline.setAttribute("filter", filterRef);
    if (ringIdx >= spiralRadii.length - 1) {
      polyline.setAttribute("class", "sw-spiral--outer");
    }
    refs.webSpirals.appendChild(polyline);
  });

  var DEW_COUNT = 14;
  for (var d = 0; d < DEW_COUNT; d++) {
    var ringIdx2 = Math.floor(rng() * spiralRadii.length);
    var baseRadius2 = spiralRadii[ringIdx2];
    var segIdx = Math.floor(rng() * SPOKE_COUNT);
    var t = rng();
    var a0 = spokeAngles[segIdx];
    var a1 = spokeAngles[(segIdx + 1) % SPOKE_COUNT];
    var da = a1 - a0;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    var angle2 = a0 + da * t;
    var drift2 = (rng() - 0.5) * 1.4;
    var radius2 = baseRadius2 + drift2;
    var cx = LAYOUT_CX + Math.cos(angle2) * radius2;
    var cy = LAYOUT_CY + Math.sin(angle2) * radius2;
    var r = 0.45 + rng() * 0.6;
    var drop = document.createElementNS(SVG_NS, "circle");
    drop.setAttribute("cx", cx.toFixed(2));
    drop.setAttribute("cy", cy.toFixed(2));
    drop.setAttribute("r", r.toFixed(2));
    drop.setAttribute("fill", dewRef);
    refs.webDew.appendChild(drop);
  }
}

function buildFlyElement(item) {
  var wrap = document.createElement("span");
  wrap.className = "fly";
  var h = hashString(item.word || "");
  var rotation = (h % 30) - 15;
  var jitterDelay = h % 1200;
  wrap.style.setProperty("--fly-rotation", rotation + "deg");
  wrap.style.setProperty("--jitter-delay", jitterDelay + "ms");

  var img = document.createElement("img");
  img.className = "fly__img";
  img.src = flySpriteForItem(item);
  img.alt = "";
  img.setAttribute("aria-hidden", "true");
  img.setAttribute("draggable", "false");

  wrap.appendChild(img);
  return wrap;
}

function buildClozeInput(taskId, item) {
  var input = document.createElement("input");
  var word = normalize(item.word);
  input.className = "cloze-input";
  input.type = "text";
  input.autocomplete = "off";
  input.autocorrect = "off";
  input.autocapitalize = "off";
  input.spellcheck = false;
  input.placeholder = "type the form";
  input.title = "type the form";
  input.dataset.word = word;
  input.dataset.matchKey = toMatchKey(item.word);
  input.setAttribute("aria-label", "Type the missing word for this sentence");
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitSentenceGuess(taskId, input);
    }
  });
  return input;
}

/* Build a sentence fragment with `\bword\b` (case-insensitive) replaced by
   either an inline answer input (pre-catch) or a POS-coloured word
   (post-catch). Only the first pre-catch occurrence becomes an input; later
   occurrences stay redacted so a repeated word doesn't create duplicates. */
function buildSentenceFragment(taskId, sentence, item, slugs, reveal) {
  var frag = document.createDocumentFragment();
  var text = String(sentence || "");
  var target = String((item && item.word) || "").trim();
  if (!text || !target) {
    frag.appendChild(document.createTextNode(text));
    return frag;
  }
  var escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var re = new RegExp("\\b" + escaped + "\\b", "gi");
  var lastIndex = 0;
  var match;
  var matched = false;
  var inputAdded = false;
  while ((match = re.exec(text)) !== null) {
    matched = true;
    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    if (reveal) {
      var slug = primaryPosSlug(slugs);
      var pill = document.createElement("span");
      pill.className = "cloze-reveal pos-word pos-word--" + slug;
      pill.textContent = match[0];
      frag.appendChild(pill);
    } else if (!inputAdded) {
      frag.appendChild(buildClozeInput(taskId, item));
      inputAdded = true;
    } else {
      var blank = document.createElement("span");
      blank.className = "cloze-blank";
      blank.setAttribute("aria-label", "missing word");
      blank.textContent = "______";
      frag.appendChild(blank);
    }
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) re.lastIndex++;
  }
  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  if (!matched) {
    frag.textContent = "";
    frag.appendChild(document.createTextNode(text));
    if (!reveal) {
      frag.appendChild(document.createTextNode(" "));
      frag.appendChild(buildClozeInput(taskId, item));
    }
  }
  return frag;
}

function renderFoundList(taskId) {
  var g = games[taskId];
  var refs = doms[taskId];
  refs.foundList.innerHTML = "";

  getDerivatives(g.task).forEach(function (item) {
    var word = normalize(item.word);
    var isFound = g.foundWords.has(word);
    var row = document.createElement("div");
    row.className = "sw-found-item" + (isFound ? " sw-found-item--found" : "");
    row.dataset.word = word;

    var slugs = partOfSpeechSlugs(item.pos);
    var sentenceText = String(item.sentence || "").trim();

    var sentenceEl = document.createElement("p");
    sentenceEl.className = "sw-found-sentence";
    if (sentenceText) {
      sentenceEl.appendChild(buildSentenceFragment(taskId, sentenceText, item, slugs, isFound));
    } else {
      sentenceEl.classList.add("sw-found-sentence--empty");
      sentenceEl.appendChild(document.createTextNode("Sentence coming soon. "));
      if (!isFound) sentenceEl.appendChild(buildClozeInput(taskId, item));
    }
    row.appendChild(sentenceEl);

    var defEl = document.createElement("p");
    defEl.className = "sw-found-definition" + (isFound ? "" : " sw-found-definition--reserved");
    defEl.textContent = displayDefinitionForDerivative(g.task, item);
    if (!isFound) defEl.setAttribute("aria-hidden", "true");
    row.appendChild(defEl);

    refs.foundList.appendChild(row);
  });
}

function renderRootIntoWeb(taskId) {
  var g = games[taskId];
  var refs = doms[taskId];
  if (!refs.webRoot) return;
  var existingInner = refs.webRoot.querySelector(".sw-node-inner");
  if (existingInner) {
    existingInner.innerHTML = "";
    fillWebNodeInner(existingInner, g.task.root || "?", []);
  } else {
    var inner = document.createElement("span");
    fillWebNodeInner(inner, g.task.root || "?", []);
    refs.webRoot.appendChild(inner);
  }
}

function setFlyTargetsForCatchingNodes(taskId) {
  var refs = doms[taskId];
  var catching = refs.webNodes ? refs.webNodes.querySelectorAll(".sw-node--catching") : null;
  if (!catching || !catching.length) return;
  var spider = refs.webRoot ? refs.webRoot.querySelector(".sw-spider") : null;
  var spiderTargetEl = spider || refs.webRoot;
  if (!spiderTargetEl) return;

  var targetRect = spiderTargetEl.getBoundingClientRect();
  if (targetRect.width < 4 || targetRect.height < 4) {
    requestAnimationFrame(function () {
      setFlyTargetsForCatchingNodes(taskId);
    });
    return;
  }
  var targetX = targetRect.left + targetRect.width / 2;
  var targetY = targetRect.top + targetRect.height * 0.88;

  catching.forEach(function (node) {
    var r = node.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    node.style.setProperty("--fly-target-x", (targetX - cx).toFixed(2) + "px");
    node.style.setProperty("--fly-target-y", (targetY - cy).toFixed(2) + "px");
    node.classList.add("sw-node--armed");
  });
}

function renderWeb(taskId) {
  var g = games[taskId];
  var refs = doms[taskId];
  var derivatives = getDerivatives(g.task);
  var layout = getLayout(taskId);
  renderWebBackground(taskId);
  renderBranchLines(taskId);

  var popTarget = g.animatePopForWord;
  g.animatePopForWord = null;
  var staggerList = g.revealStaggerForWords;

  refs.webNodes.innerHTML = "";

  derivatives.forEach(function (item) {
    var word = normalize(item.word);
    var position = layout.pos[word];
    if (!position) return;

    var node = document.createElement("div");
    var found = g.foundWords.has(word);
    var cls = "sw-node sw-node--answer";
    if (found) cls += " sw-node--found";

    var catchDelayMs = null;
    if (found && popTarget === word) {
      cls += " sw-node--catching";
      catchDelayMs = 0;
    } else if (found && staggerList) {
      var idx = staggerList.indexOf(word);
      if (idx >= 0) {
        cls += " sw-node--catching";
        catchDelayMs = idx * REVEAL_STAGGER_MS;
      }
    }

    node.className = cls;
    node.dataset.word = word;
    node.style.left = position.x + "%";
    node.style.top = position.y + "%";
    if (catchDelayMs !== null) {
      node.style.setProperty("--catch-delay", catchDelayMs + "ms");
    }

    if (!found || catchDelayMs !== null) {
      node.appendChild(buildFlyElement(item));
    }

    var inner = document.createElement("span");
    var wordShown = found ? item.word : "";
    fillWebNodeInner(inner, wordShown, partOfSpeechSlugs(item.pos));
    if (!found) inner.style.display = "none";
    node.appendChild(inner);

    refs.webNodes.appendChild(node);
  });

  setFlyTargetsForCatchingNodes(taskId);

  if (staggerList) g.revealStaggerForWords = null;
}

/* ------------------------------------------------------------- feedback */

function setFeedback(taskId, message, tone) {
  var refs = doms[taskId];
  refs.feedback.textContent = message || "";
  refs.feedback.className = "sw-feedback" + (tone ? " sw-feedback--" + tone : "");
}

function disableSentenceInputs(taskId, disabled) {
  var refs = doms[taskId];
  refs.foundList.querySelectorAll(".cloze-input").forEach(function (input) {
    input.disabled = disabled;
  });
}

function focusInput(taskId) {
  var refs = doms[taskId];
  var input = refs.foundList.querySelector(".cloze-input:not(:disabled)");
  if (!(input instanceof HTMLInputElement)) return;
  try {
    input.focus({ preventScroll: true });
  } catch (err) {
    input.focus();
  }
}

function getSpiderEl(taskId) {
  var refs = doms[taskId];
  return refs.webRoot ? refs.webRoot.querySelector(".sw-spider") : null;
}

function updateScore(taskId) {
  var g = games[taskId];
  var refs = doms[taskId];
  var total = getDerivatives(g.task).length;
  var found = g.foundWords.size;
  refs.scoreText.textContent = found + " / " + total + " caught";
  var ratio = total > 0 ? found / total : 0;
  var empty = Math.max(0, Math.min(100, (1 - ratio) * 100));
  refs.scorePill.style.setProperty("--belly-empty", empty + "%");
}

function updateStreakUI(taskId) {
  var g = games[taskId];
  var refs = doms[taskId];
  var display = g.bestStreak >= 2 ? g.streak + " (best " + g.bestStreak + ")" : String(g.streak);
  refs.streakText.textContent = display;
  refs.streakPill.classList.toggle("is-hot", g.streak >= 3);
}

function updatePatienceUI(taskId) {
  var g = games[taskId];
  var refs = doms[taskId];
  var dots = refs.patience.querySelectorAll(".sw-patience__dot");
  dots.forEach(function (dot, idx) {
    dot.classList.toggle("is-spent", idx < g.wrongCount);
  });
  refs.patience.classList.toggle("is-empty", g.wrongCount >= MAX_WRONG);

  var spider = getSpiderEl(taskId);
  if (spider) {
    spider.classList.remove("sw-spider--anger-1", "sw-spider--anger-2");
    if (g.wrongCount === 1) spider.classList.add("sw-spider--anger-1");
    else if (g.wrongCount === 2) spider.classList.add("sw-spider--anger-2");
  }
}

function playMissAnimation(taskId) {
  var refs = doms[taskId];
  var spider = getSpiderEl(taskId);
  if (spider) {
    spider.classList.remove("is-lunging");
    void spider.offsetWidth;
    spider.classList.add("is-lunging");
    spider.addEventListener(
      "animationend",
      function onEnd() {
        spider.classList.remove("is-lunging");
        spider.removeEventListener("animationend", onEnd);
      }
    );
  }

  if (refs.webCard) {
    refs.webCard.classList.remove("is-wobbling");
    void refs.webCard.offsetWidth;
    refs.webCard.classList.add("is-wobbling");
    refs.webCard.addEventListener(
      "animationend",
      function onEnd() {
        refs.webCard.classList.remove("is-wobbling");
        refs.webCard.removeEventListener("animationend", onEnd);
      }
    );
  }

  var uncaught = Array.from(
    refs.webNodes.querySelectorAll(".sw-node--answer:not(.sw-node--found)")
  );
  if (uncaught.length) {
    var target = uncaught[Math.floor(Math.random() * uncaught.length)];
    target.classList.remove("sw-node--buzzing");
    void target.offsetWidth;
    target.classList.add("sw-node--buzzing");
    target.addEventListener(
      "animationend",
      function onEnd() {
        target.classList.remove("sw-node--buzzing");
        target.removeEventListener("animationend", onEnd);
      }
    );
  }
}

function playSpiderChomp(taskId, delayMs) {
  var spider = getSpiderEl(taskId);
  if (!spider) return;
  function trigger() {
    spider.classList.remove("is-chomping");
    void spider.offsetWidth;
    spider.classList.add("is-chomping");
    spider.addEventListener(
      "animationend",
      function onEnd() {
        spider.classList.remove("is-chomping");
        spider.removeEventListener("animationend", onEnd);
      }
    );
  }
  if (delayMs > 0) setTimeout(trigger, delayMs);
  else trigger();
}

/* Most common POS among unfound derivatives, used for nudging miss feedback. */
function getSuggestedPosToTry(task, foundWords) {
  var remaining = getDerivatives(task).filter(function (d) {
    return !foundWords.has(normalize(d.word));
  });
  if (!remaining.length) return null;
  var counts = Object.create(null);
  remaining.forEach(function (d) {
    var slug = primaryPosSlug(partOfSpeechSlugs(d.pos));
    counts[slug] = (counts[slug] || 0) + 1;
  });
  var best = null;
  var bestN = 0;
  Object.keys(counts).forEach(function (k) {
    if (counts[k] > bestN) {
      best = k;
      bestN = counts[k];
    }
  });
  return best;
}

function articleFor(word) {
  return /^[aeiou]/i.test(String(word || "")) ? "an" : "a";
}

/* ------------------------------------------------------------- outcome */

function finishRound(taskId, outcome) {
  var g = games[taskId];
  if (g.completed) return;
  g.completed = true;

  var task = g.task;
  var total = getDerivatives(task).length;
  var correct = g.revealUsed ? 0 : g.foundWords.size;

  E.state.scores[task.id] = correct;
  if (typeof E.saveTaskScore === "function") E.saveTaskScore(task.id, correct, total);
  if (typeof E.setNavStatus === "function") E.setNavStatus(task.id, correct, total);
  if (typeof E.showScoreFeedback === "function") {
    E.showScoreFeedback(task.id, correct, total);
  }

  showRoundSummary(taskId, outcome);
}

function showRoundSummary(taskId, outcome) {
  var g = games[taskId];
  var refs = doms[taskId];
  if (!refs.roundSummary) return;

  var total = getDerivatives(g.task).length;
  var caught = g.foundWords.size;
  var cleanCatch = outcome === "win" && g.wrongCount === 0 && !g.revealUsed;

  refs.roundSummary.querySelectorAll(".sw-round-summary__badge, .sw-round-summary__focus").forEach(
    function (el) {
      el.remove();
    }
  );

  var title = outcome === "lose" ? "The spider gave up." : "Web complete!";
  refs.roundSummary.setAttribute("data-tone", outcome === "lose" ? "lose" : "win");
  refs.roundSummaryTitle.textContent = title;

  var lines = [];
  lines.push(caught + " / " + total + " caught");
  lines.push(g.wrongCount + " miss" + (g.wrongCount === 1 ? "" : "es"));
  lines.push("Best streak: " + g.bestStreak);
  refs.roundSummaryText.textContent = lines.join("  –  ");

  if (cleanCatch) {
    var badge = document.createElement("span");
    badge.className = "sw-round-summary__badge";
    badge.textContent = "Clean catch";
    refs.roundSummaryText.insertAdjacentElement("afterend", badge);
  }

  if (outcome === "lose") {
    var review = getDerivatives(g.task)
      .filter(function (d) {
        return !g.foundWords.has(normalize(d.word));
      })
      .slice()
      .sort(function (a, b) {
        return String(b.word).length - String(a.word).length;
      })
      .slice(0, 3);
    if (review.length) {
      var list = document.createElement("ul");
      list.className = "sw-round-summary__focus";
      review.forEach(function (item) {
        var li = document.createElement("li");
        var b = document.createElement("b");
        b.textContent = item.word;
        li.appendChild(b);
        li.appendChild(document.createTextNode(" – " + displayDefinitionForDerivative(g.task, item)));
        list.appendChild(li);
      });
      (refs.roundSummary.querySelector(".sw-round-summary__badge") || refs.roundSummaryText).insertAdjacentElement(
        "afterend",
        list
      );
    }
  }

  refs.roundSummary.hidden = false;
}

/* ------------------------------------------------------------- guesses */

function handleCorrectGuess(taskId, item) {
  var g = games[taskId];
  var word = normalize(item.word);
  g.foundWords.add(word);
  g.animatePopForWord = word;
  if (g.wrongCount > 0) g.wrongCount = Math.max(0, g.wrongCount - 1);
  g.streak += 1;
  if (g.streak > g.bestStreak) g.bestStreak = g.streak;

  render(taskId);
  updatePatienceUI(taskId);
  updateStreakUI(taskId);

  playSpiderChomp(taskId, 620);

  if (g.foundWords.size === getDerivatives(g.task).length) {
    setFeedback(taskId, "Web complete! You caught every derivative.", "success");
    disableSentenceInputs(taskId, true);
    finishRound(taskId, "win");
    return;
  }

  setFeedback(taskId, "");
  focusInput(taskId);
}

function triggerSpiderFlee(taskId) {
  var spider = getSpiderEl(taskId);
  if (spider) {
    spider.classList.remove(
      "is-lunging",
      "is-chomping",
      "sw-spider--anger-1",
      "sw-spider--anger-2"
    );
    void spider.offsetWidth;
    spider.classList.add("is-fleeing");
  }
  disableSentenceInputs(taskId, true);
  setFeedback(taskId, "The spider lost patience and skittered away.", "error");
  finishRound(taskId, "lose");
}

function handleWrongGuess(taskId) {
  var g = games[taskId];
  g.streak = 0;
  updateStreakUI(taskId);
  g.wrongCount = Math.min(MAX_WRONG, g.wrongCount + 1);
  updatePatienceUI(taskId);
  if (g.wrongCount >= MAX_WRONG) {
    triggerSpiderFlee(taskId);
    return;
  }
  var remainingMisses = MAX_WRONG - g.wrongCount;
  var tail =
    remainingMisses === 1
      ? "One more miss and the spider runs."
      : remainingMisses + " misses left before the spider gives up.";
  var clue = "";
  if (g.foundWords.size > 0) {
    var pos = getSuggestedPosToTry(g.task, g.foundWords);
    if (pos) clue = " Try " + articleFor(pos) + " " + pos + ".";
  }
  setFeedback(taskId, "Not in this root set." + clue + " " + tail, "error");
  playMissAnimation(taskId);
  focusInput(taskId);
}

function submitSentenceGuess(taskId, input) {
  var g = games[taskId];
  if (!g || g.completed) return;
  if (!(input instanceof HTMLInputElement) || input.disabled) return;
  var guess = normalize(input.value);
  var guessKey = toMatchKey(guess);
  if (!guess) {
    setFeedback(taskId, "Type the missing word in the sentence blank.", "muted");
    return;
  }

  if (guess === normalize(g.task.root)) {
    setFeedback(taskId, "The root word is already in the center. Try a derivative.", "muted");
    focusInput(taskId);
    return;
  }

  var derivatives = getDerivatives(g.task);
  var targetWord = normalize(input.dataset.word);
  var targetItem = derivatives.find(function (entry) {
    return normalize(entry.word) === targetWord;
  });
  if (!targetItem) return;

  var byGuess = derivatives.find(function (entry) {
    return normalize(entry.word) === guess || toMatchKey(entry.word) === guessKey;
  });
  if (byGuess && g.foundWords.has(normalize(byGuess.word))) {
    setFeedback(taskId, "Already caught. Try another branch.", "muted");
    input.value = "";
    focusInput(taskId);
    return;
  }

  var targetKey = toMatchKey(targetItem.word);
  if (normalize(targetItem.word) === guess || targetKey === guessKey) {
    handleCorrectGuess(taskId, targetItem);
    return;
  }

  if (byGuess) {
    setFeedback(taskId, '"' + byGuess.word + '" belongs in another sentence. Try this blank’s word.', "muted");
    input.focus();
    input.select();
    return;
  }

  input.value = "";
  handleWrongGuess(taskId);
}

function revealAll(taskId) {
  var g = games[taskId];
  if (g.completed) return;
  g.animatePopForWord = null;
  g.revealUsed = true;
  var derivatives = getDerivatives(g.task);
  var remaining = derivatives
    .map(function (item) {
      return normalize(item.word);
    })
    .filter(function (w) {
      return !g.foundWords.has(w);
    });
  derivatives.forEach(function (item) {
    g.foundWords.add(normalize(item.word));
  });
  g.revealStaggerForWords = remaining;
  render(taskId);

  remaining.forEach(function (_, idx) {
    var catchDelay = idx * REVEAL_STAGGER_MS;
    var chompDelay = catchDelay + Math.max(0, FLY_TO_SPIDER_MS - 130);
    playSpiderChomp(taskId, chompDelay);
  });

  setFeedback(taskId, "");
  disableSentenceInputs(taskId, true);

  var total = derivatives.length;
  if (total > 0) finishRound(taskId, "win");
}

/* --------------------------------------------------------------- link */

function setLinkedHighlight(taskId, word, on) {
  if (!word) return;
  var refs = doms[taskId];
  var safeWord = String(word).replace(/"/g, '\\"');
  refs.webNodes.querySelectorAll('.sw-node--answer[data-word="' + safeWord + '"]').forEach(function (el) {
    el.classList.toggle("is-fly-active", on);
  });
  refs.foundList.querySelectorAll('.sw-found-item[data-word="' + safeWord + '"]').forEach(function (el) {
    el.classList.toggle("is-sentence-active", on);
  });
}

function bindLinkedEnter(taskId, host, selector) {
  if (!host) return;
  function closest(event) {
    return event.target instanceof Element ? event.target.closest(selector) : null;
  }
  host.addEventListener("mouseover", function (event) {
    var node = closest(event);
    if (!node) return;
    var related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (related && node.contains(related)) return;
    if (node.dataset && node.dataset.word) setLinkedHighlight(taskId, node.dataset.word, true);
  });
  host.addEventListener("mouseout", function (event) {
    var node = closest(event);
    if (!node) return;
    var related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (related && node.contains(related)) return;
    if (node.dataset && node.dataset.word) setLinkedHighlight(taskId, node.dataset.word, false);
  });
  host.addEventListener("focusin", function (event) {
    var node = closest(event);
    if (node && node.dataset && node.dataset.word) setLinkedHighlight(taskId, node.dataset.word, true);
  });
  host.addEventListener("focusout", function (event) {
    var node = closest(event);
    if (node && node.dataset && node.dataset.word) setLinkedHighlight(taskId, node.dataset.word, false);
  });
}

/* ------------------------------------------------------------- render */

function render(taskId) {
  var g = games[taskId];
  var refs = doms[taskId];
  refs.rootWordLabel.textContent = g.task.root;
  renderRootIntoWeb(taskId);
  updateScore(taskId);
  renderWeb(taskId);
  renderFoundList(taskId);
  updateStreakUI(taskId);
}

/* --------------------------------------------------------------- DOM */

function buildDom(task) {
  var refs = {};

  var feedback = document.createElement("p");
  feedback.className = "sw-feedback";
  feedback.setAttribute("aria-live", "polite");
  refs.feedback = feedback;

  var roundSummary = document.createElement("section");
  roundSummary.className = "sw-round-summary";
  roundSummary.setAttribute("aria-live", "polite");
  roundSummary.hidden = true;
  var roundSummaryTitle = document.createElement("h3");
  roundSummaryTitle.className = "sw-round-summary__title";
  var roundSummaryText = document.createElement("p");
  roundSummaryText.className = "sw-round-summary__text";
  roundSummary.appendChild(roundSummaryTitle);
  roundSummary.appendChild(roundSummaryText);
  refs.roundSummary = roundSummary;
  refs.roundSummaryTitle = roundSummaryTitle;
  refs.roundSummaryText = roundSummaryText;

  var layout = document.createElement("div");
  layout.className = "sw-layout";

  var stack = document.createElement("div");
  stack.className = "sw-stack";

  var patience = document.createElement("div");
  patience.className = "sw-patience";
  patience.setAttribute("aria-label", "Spider patience");
  var patienceLabel = document.createElement("span");
  patienceLabel.className = "sw-patience__label";
  patienceLabel.textContent = "Patience";
  var patienceDots = document.createElement("span");
  patienceDots.className = "sw-patience__dots";
  for (var i = 0; i < MAX_WRONG; i++) {
    var dot = document.createElement("span");
    dot.className = "sw-patience__dot";
    patienceDots.appendChild(dot);
  }
  patience.appendChild(patienceLabel);
  patience.appendChild(patienceDots);
  refs.patience = patience;

  var webCard = document.createElement("div");
  webCard.className = "sw-card";
  webCard.setAttribute("aria-label", "Spider web of found derivatives");

  var svgIdSuffix = "--" + task.id;
  var bgSvg = document.createElementNS(SVG_NS, "svg");
  bgSvg.setAttribute("class", "sw-lines");
  bgSvg.setAttribute("viewBox", "0 0 100 100");
  bgSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  bgSvg.setAttribute("aria-hidden", "true");
  bgSvg.innerHTML =
    '<defs>' +
    '<radialGradient id="sw-thread-gradient' + svgIdSuffix + '" cx="50%" cy="50%" r="60%">' +
    '<stop offset="0%" stop-color="rgba(1,8,100,0.55)" />' +
    '<stop offset="100%" stop-color="rgba(1,8,100,0.15)" />' +
    '</radialGradient>' +
    '<radialGradient id="sw-dew-gradient' + svgIdSuffix + '" cx="35%" cy="32%" r="65%">' +
    '<stop offset="0%" stop-color="rgba(255,255,255,0.95)" />' +
    '<stop offset="55%" stop-color="rgba(214,224,255,0.55)" />' +
    '<stop offset="100%" stop-color="rgba(1,8,158,0.18)" />' +
    '</radialGradient>' +
    '<filter id="sw-thread-glow' + svgIdSuffix + '" x="-20%" y="-20%" width="140%" height="140%">' +
    '<feGaussianBlur stdDeviation="0.18" />' +
    '</filter>' +
    '</defs>';
  refs.svgIdSuffix = svgIdSuffix;
  var webSpokes = document.createElementNS(SVG_NS, "g");
  webSpokes.setAttribute("class", "sw-spokes");
  var webSpirals = document.createElementNS(SVG_NS, "g");
  webSpirals.setAttribute("class", "sw-spirals");
  var webDew = document.createElementNS(SVG_NS, "g");
  webDew.setAttribute("class", "sw-dew");
  bgSvg.appendChild(webSpokes);
  bgSvg.appendChild(webSpirals);
  bgSvg.appendChild(webDew);
  refs.webSpokes = webSpokes;
  refs.webSpirals = webSpirals;
  refs.webDew = webDew;

  var branchSvg = document.createElementNS(SVG_NS, "svg");
  branchSvg.setAttribute("class", "sw-lines sw-lines--branches");
  branchSvg.setAttribute("viewBox", "0 0 100 100");
  branchSvg.setAttribute("preserveAspectRatio", "none");
  branchSvg.setAttribute("aria-hidden", "true");
  var webBranchLines = document.createElementNS(SVG_NS, "g");
  webBranchLines.setAttribute("class", "sw-branch-lines");
  branchSvg.appendChild(webBranchLines);
  refs.webBranchLines = webBranchLines;

  var webRoot = document.createElement("div");
  webRoot.className = "sw-node sw-node--root";
  var spiderImg = document.createElement("img");
  spiderImg.className = "sw-spider";
  spiderImg.src = "assets/spider_sprite.png";
  spiderImg.alt = "";
  spiderImg.setAttribute("aria-hidden", "true");
  webRoot.appendChild(spiderImg);
  refs.webRoot = webRoot;

  var webNodes = document.createElement("div");
  webNodes.className = "sw-nodes";
  refs.webNodes = webNodes;

  webCard.appendChild(bgSvg);
  webCard.appendChild(branchSvg);
  webCard.appendChild(webRoot);
  webCard.appendChild(webNodes);
  refs.webCard = webCard;

  stack.appendChild(patience);
  stack.appendChild(webCard);

  var found = document.createElement("aside");
  found.className = "sw-found-panel";
  found.setAttribute("aria-labelledby", "sw-found-title-" + task.id);

  var meters = document.createElement("div");
  meters.className = "sw-found-panel__meters";
  meters.setAttribute("aria-label", "Progress this round");

  var scorePill = document.createElement("div");
  scorePill.className = "sw-score-pill";
  scorePill.setAttribute("aria-live", "polite");
  scorePill.style.setProperty("--belly-empty", "100%");
  var bellySvg = document.createElementNS(SVG_NS, "svg");
  bellySvg.setAttribute("class", "sw-belly");
  bellySvg.setAttribute("viewBox", "0 0 24 24");
  bellySvg.setAttribute("aria-hidden", "true");
  bellySvg.innerHTML =
    '<ellipse class="sw-belly-bg" cx="12" cy="12" rx="10" ry="9" />' +
    '<ellipse class="sw-belly-fill" cx="12" cy="12" rx="10" ry="9" />';
  var scoreText = document.createElement("span");
  scoreText.className = "sw-score-text";
  scoreText.textContent = "0 / 0 caught";
  scorePill.appendChild(bellySvg);
  scorePill.appendChild(scoreText);
  refs.scorePill = scorePill;
  refs.scoreText = scoreText;

  var streakPill = document.createElement("div");
  streakPill.className = "sw-status-pill sw-status-pill--streak";
  var streakLabel = document.createElement("span");
  streakLabel.className = "sw-status-pill__label";
  streakLabel.textContent = "Streak";
  var streakText = document.createElement("span");
  streakText.className = "sw-status-pill__value";
  streakText.textContent = "0";
  streakPill.appendChild(streakLabel);
  streakPill.appendChild(streakText);
  refs.streakPill = streakPill;
  refs.streakText = streakText;

  meters.appendChild(scorePill);
  meters.appendChild(streakPill);

  var title = document.createElement("h3");
  title.id = "sw-found-title-" + task.id;
  title.textContent = "Sample sentences";

  var hint = document.createElement("p");
  hint.className = "sw-found-panel__hint";
  hint.textContent = "Hover a fly to find its sentence, then type the missing word in the blank.";

  var foundList = document.createElement("div");
  foundList.className = "sw-found-list";
  refs.foundList = foundList;

  found.appendChild(meters);
  found.appendChild(title);
  found.appendChild(hint);
  found.appendChild(foundList);

  layout.appendChild(stack);
  layout.appendChild(found);

  var rootWordLabel = document.createElement("h2");
  rootWordLabel.className = "sw-root-word";
  refs.rootWordLabel = rootWordLabel;

  var container = document.createDocumentFragment();
  container.appendChild(rootWordLabel);
  container.appendChild(feedback);
  container.appendChild(roundSummary);
  container.appendChild(layout);

  bindLinkedEnter(task.id, webNodes, ".sw-node--answer");
  bindLinkedEnter(task.id, foundList, ".sw-found-item");

  return { fragment: container, refs: refs };
}

/* --------------------------------------------------------------- CSS */

var STYLE_ID = "ege-spider-web-styles";

function ensureStylesInjected() {
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = SPIDER_WEB_CSS;
  document.head.appendChild(style);
}

var SPIDER_WEB_CSS =
  ".ege-task--spider-web{--sw-ink:#0b072e;--sw-muted:#6a69a5;--sw-line:#c4c5d8;--sw-accent:#01089e;--sw-accent-dark:#00003b;--sw-accent-soft:#eef0fa;--sw-good:#27ae60;--sw-bad:#c0392b;--fly-lift:18px;}" +
  ".ege-task--spider-web .sw-root-word{margin:0 0 6px;font-size:clamp(1.6rem,3.6vw,2.4rem);color:var(--sw-ink);}" +
  ".ege-task--spider-web .sw-feedback{min-height:0;margin:0 2px;line-height:1.35;color:var(--sw-muted);font-weight:600;}" +
  ".ege-task--spider-web .sw-feedback:not(:empty){margin:4px 2px 8px;}" +
  ".ege-task--spider-web .sw-feedback--success{color:var(--sw-good);}" +
  ".ege-task--spider-web .sw-feedback--error{color:var(--sw-bad);}" +
  ".ege-task--spider-web .sw-feedback--muted{color:var(--sw-muted);}" +
  ".ege-task--spider-web .sw-round-summary{margin:0 0 14px;padding:14px 16px;border:2px solid rgba(1,8,158,0.4);border-radius:16px;background:rgba(255,255,255,0.9);color:var(--sw-ink);}" +
  ".ege-task--spider-web .sw-round-summary[data-tone='lose']{border-color:rgba(192,57,43,0.5);background:rgba(250,219,216,0.96);}" +
  ".ege-task--spider-web .sw-round-summary__title{margin:0 0 6px;font-size:1.25rem;color:var(--sw-accent-dark);}" +
  ".ege-task--spider-web .sw-round-summary[data-tone='lose'] .sw-round-summary__title{color:var(--sw-bad);}" +
  ".ege-task--spider-web .sw-round-summary__text{margin:0 0 10px;font-weight:600;line-height:1.4;}" +
  ".ege-task--spider-web .sw-round-summary__badge{display:inline-block;margin:0 0 10px;padding:4px 10px;border-radius:999px;background:rgba(39,174,96,0.15);color:var(--sw-good);font-size:0.78rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;}" +
  ".ege-task--spider-web .sw-round-summary__focus{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;}" +
  ".ege-task--spider-web .sw-round-summary__focus li{padding:8px 12px;border-radius:12px;background:rgba(1,8,158,0.08);font-weight:600;font-size:0.92rem;}" +
  ".ege-task--spider-web .sw-round-summary__focus li b{color:var(--sw-accent-dark);}" +
  ".ege-task--spider-web .sw-layout{display:grid;grid-template-columns:minmax(260px,1fr) minmax(320px,min(480px,42vw));gap:18px;align-items:stretch;height:clamp(420px,62vh,600px);}" +
  ".ege-task--spider-web .sw-stack{display:flex;flex-direction:column;gap:10px;min-height:0;height:100%;}" +
  ".ege-task--spider-web .sw-stack .sw-patience{flex-shrink:0;}" +
  ".ege-task--spider-web .sw-stack .sw-card{flex:1 1 auto;min-height:0;}" +
  ".ege-task--spider-web .sw-patience{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,0.85);color:var(--sw-ink);font-weight:800;font-size:0.78rem;letter-spacing:0.06em;text-transform:uppercase;transition:background 0.2s ease;width:fit-content;}" +
  ".ege-task--spider-web .sw-patience__label{color:var(--sw-muted);}" +
  ".ege-task--spider-web .sw-patience__dots{display:inline-flex;gap:5px;}" +
  ".ege-task--spider-web .sw-patience__dot{width:11px;height:11px;border-radius:50%;background:rgba(11,7,46,0.85);transition:background 0.2s ease,transform 0.2s ease,box-shadow 0.2s ease;}" +
  ".ege-task--spider-web .sw-patience__dot.is-spent{background:var(--sw-bad);transform:scale(0.78);box-shadow:0 0 6px rgba(192,57,43,0.6);animation:sw-angerPulse 0.55s ease;}" +
  "@keyframes sw-angerPulse{0%{transform:scale(1);box-shadow:0 0 0 rgba(192,57,43,0);}35%{transform:scale(1.45);box-shadow:0 0 14px rgba(192,57,43,0.85);}100%{transform:scale(0.78);box-shadow:0 0 6px rgba(192,57,43,0.6);}}" +
  ".ege-task--spider-web .sw-patience.is-empty{background:rgba(192,57,43,0.18);}" +
  ".ege-task--spider-web .sw-card{position:relative;height:100%;overflow:hidden;border:2px solid rgba(1,8,158,0.14);border-radius:18px;background:radial-gradient(circle,rgba(1,8,158,0.06) 1px,transparent 1px),linear-gradient(135deg,rgba(238,240,250,0.95),rgba(238,240,250,0.45));background-size:28px 28px,auto;}" +
    ".ege-task--spider-web .sw-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible;z-index:1;pointer-events:none;}" +
  ".ege-task--spider-web .sw-spokes line{fill:none;stroke-width:0.32;stroke-linecap:round;opacity:0.78;}" +
  ".ege-task--spider-web .sw-spirals polyline{fill:none;stroke:rgba(1,8,100,0.32);stroke-width:0.22;stroke-linecap:round;stroke-linejoin:round;}" +
  ".ege-task--spider-web .sw-spirals polyline.sw-spiral--outer{stroke:rgba(1,8,100,0.18);stroke-width:0.18;}" +
  ".ege-task--spider-web .sw-dew circle{filter:drop-shadow(0 0.18px 0.4px rgba(1,8,100,0.35));}" +
  ".ege-task--spider-web .sw-branch-lines line{fill:none;stroke:rgba(1,8,100,0.5);stroke-width:2.4px;stroke-linecap:round;vector-effect:non-scaling-stroke;}" +
  ".ege-task--spider-web .sw-node{position:absolute;z-index:2;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:60px;min-height:32px;padding:5px 10px;border-radius:999px;font-weight:800;text-align:center;transform:translate(-50%,-50%);}" +
  ".ege-task--spider-web .sw-node-inner{display:flex;flex-direction:column;align-items:center;justify-content:center;max-width:132px;position:relative;z-index:5;}" +
  ".ege-task--spider-web .sw-node-word{line-height:1.15;}" +
  ".ege-task--spider-web .pos-word--noun{color:#2d2d2d;}" +
  ".ege-task--spider-web .pos-word--verb{color:#b8392d;}" +
  ".ege-task--spider-web .pos-word--adjective{color:#2667a6;}" +
  ".ege-task--spider-web .pos-word--adverb{color:#27ae60;}" +
  ".ege-task--spider-web .pos-word--preposition{color:#7b4aaa;}" +
  ".ege-task--spider-web .pos-word--pronoun{color:#d67e19;}" +
  ".ege-task--spider-web .pos-word--conjunction{color:#29808a;}" +
  ".ege-task--spider-web .pos-word--interjection{color:#b83d84;}" +
  ".ege-task--spider-web .sw-node--answer .sw-node-word--hidden{letter-spacing:0.06em;opacity:0;}" +
  ".ege-task--spider-web .sw-node--root{left:50%;top:50%;min-width:96px;min-height:44px;padding:8px 14px;background:#fff;border:3px solid var(--sw-accent);font-size:1rem;box-shadow:0 12px 26px rgba(1,8,100,0.18);z-index:3;overflow:visible;}" +
  ".ege-task--spider-web .sw-node--root .sw-node-word{font-size:1.3rem;}" +
  ".ege-task--spider-web .sw-spider{position:absolute;left:50%;top:0;width:84px;height:auto;transform:translate(-50%,-65%);pointer-events:none;filter:drop-shadow(0 6px 10px rgba(11,7,46,0.45));transform-origin:50% 90%;z-index:0;animation:sw-spiderIdle 4.5s ease-in-out infinite;}" +
  ".ege-task--spider-web .sw-spider.is-lunging{animation:sw-spiderLunge 0.42s cubic-bezier(0.45,0.2,0.2,1.4) both;}" +
  ".ege-task--spider-web .sw-spider.is-fleeing{animation:sw-spiderFlee 1.05s cubic-bezier(0.55,0.05,0.7,0.7) forwards;}" +
  "@keyframes sw-spiderFlee{0%{transform:translate(-50%,-65%) scale(1) rotate(0deg);opacity:1;}20%{transform:translate(-50%,-85%) scale(1.08) rotate(-6deg);opacity:1;}55%{transform:translate(-130%,-200%) scale(0.78) rotate(-32deg);opacity:0.9;}100%{transform:translate(-280%,-450%) scale(0.3) rotate(-75deg);opacity:0;}}" +
  "@keyframes sw-spiderIdle{0%,100%{transform:translate(-50%,-65%) scale(1);}50%{transform:translate(-50%,-67%) scale(1.015);}}" +
  "@keyframes sw-spiderLunge{0%{transform:translate(-50%,-65%) scale(1);}35%{transform:translate(-50%,-47%) scale(1.18) rotate(-2deg);}60%{transform:translate(-50%,-59%) scale(0.94) rotate(1.5deg);}100%{transform:translate(-50%,-65%) scale(1);}}" +
  ".ege-task--spider-web .sw-spider--anger-1{filter:drop-shadow(0 6px 12px rgba(192,57,43,0.55)) saturate(1.15);animation-duration:3.4s;}" +
  ".ege-task--spider-web .sw-spider--anger-2{filter:drop-shadow(0 6px 16px rgba(192,57,43,0.85)) drop-shadow(0 0 6px rgba(192,57,43,0.45)) saturate(1.35);animation-duration:2.4s;}" +
  ".ege-task--spider-web .sw-node--answer .sw-node-word:not(.sw-node-word--hidden){font-size:1.02rem;}" +
  ".ege-task--spider-web .sw-node--answer{background:transparent;border:none;color:var(--sw-muted);padding:2px 4px;min-width:36px;min-height:36px;z-index:7;}" +
  ".ege-task--spider-web .sw-node--found{background:transparent;border:none;box-shadow:none;padding:0;min-width:0;min-height:0;z-index:8;}" +
  ".ege-task--spider-web .sw-node--catching{z-index:9;min-width:0;min-height:0;padding:0;}" +
  ".ege-task--spider-web .fly{position:relative;display:inline-block;width:52px;height:52px;pointer-events:none;z-index:10;transform:translateY(calc(-1 * var(--fly-lift))) rotate(var(--fly-rotation,0deg));animation:sw-flyJitter 0.9s ease-in-out infinite;animation-delay:var(--jitter-delay,0ms);filter:drop-shadow(0 3px 4px rgba(11,7,46,0.4));}" +
  ".ege-task--spider-web .fly__img{display:block;width:100%;height:100%;object-fit:contain;-webkit-user-drag:none;user-select:none;transition:transform 0.16s ease;}" +
  "@keyframes sw-flyJitter{0%,100%{translate:0 0;}25%{translate:0.6px -0.8px;}50%{translate:-0.4px 0.6px;}75%{translate:-0.7px -0.4px;}}" +
  ".ege-task--spider-web .sw-node--buzzing .fly{animation:sw-flyBuzz 0.55s ease-in-out both;}" +
  "@keyframes sw-flyBuzz{0%{translate:0 0;opacity:1;}20%{translate:6px -4px;opacity:0.7;}40%{translate:-7px 3px;opacity:0.85;}60%{translate:5px 4px;opacity:0.6;}80%{translate:-3px -2px;opacity:0.9;}100%{translate:0 0;opacity:1;}}" +
  ".ege-task--spider-web .sw-node--catching.sw-node--armed .fly{position:relative;z-index:10;animation:sw-flyToSpider 0.75s cubic-bezier(0.4,0,0.55,1) forwards;animation-delay:var(--catch-delay,0ms);}" +
  "@keyframes sw-flyToSpider{0%{transform:translateY(calc(-1 * var(--fly-lift))) rotate(var(--fly-rotation,0deg)) translate(0,0) scale(1);opacity:1;}60%{transform:translate(calc(var(--fly-target-x,0px) * 0.78),calc(var(--fly-target-y,0px) * 0.78 - var(--fly-lift))) rotate(calc(var(--fly-rotation,0deg) * 0.4)) scale(0.7);opacity:1;}92%{transform:translate(calc(var(--fly-target-x,0px) * 0.98),calc(var(--fly-target-y,0px) * 0.98 - var(--fly-lift))) rotate(0deg) scale(0.32);opacity:1;}100%{transform:translate(var(--fly-target-x,0px),calc(var(--fly-target-y,0px) - var(--fly-lift))) rotate(0deg) scale(0.12);opacity:0;}}" +
  ".ege-task--spider-web .sw-node--catching.sw-node--armed .sw-node-inner{animation:sw-wordReveal 0.4s ease forwards;animation-delay:calc(var(--catch-delay,0ms) + 0.72s);opacity:0;}" +
  "@keyframes sw-wordReveal{from{opacity:0;transform:translateY(2px);}to{opacity:1;transform:translateY(0);}}" +
  ".ege-task--spider-web .sw-spider.is-chomping{animation:sw-spiderChomp 0.32s ease both;}" +
  "@keyframes sw-spiderChomp{0%{transform:translate(-50%,-65%) scale(1);}40%{transform:translate(-50%,-65%) scale(1.14,0.92);}70%{transform:translate(-50%,-65%) scale(0.96,1.08);}100%{transform:translate(-50%,-65%) scale(1);}}" +
  ".ege-task--spider-web .sw-card.is-wobbling{animation:sw-webWobble 0.32s ease both;}" +
  "@keyframes sw-webWobble{0%,100%{transform:translate(0,0);}20%{transform:translate(-2px,1px);}40%{transform:translate(2px,-1px);}60%{transform:translate(-1px,-2px);}80%{transform:translate(1px,2px);}}" +
  "@media (prefers-reduced-motion: reduce){.ege-task--spider-web .fly,.ege-task--spider-web .sw-spider{animation:none !important;}.ege-task--spider-web .sw-node--buzzing .fly,.ege-task--spider-web .sw-card.is-wobbling,.ege-task--spider-web .sw-spider.is-lunging,.ege-task--spider-web .sw-spider.is-chomping{animation:none !important;}}" +
  ".ege-task--spider-web .sw-found-panel__meters{display:flex;align-items:center;flex-wrap:wrap;margin:0 0 6px;gap:8px;}" +
  ".ege-task--spider-web .sw-found-panel{display:flex;position:relative;min-width:0;flex-direction:column;gap:8px;padding:16px;border:2px solid var(--sw-line);border-radius:20px;background:rgba(255,255,255,0.74);height:100%;min-height:0;overflow:hidden;}" +
  ".ege-task--spider-web .sw-found-panel h3{margin:0;font-size:1.1rem;color:var(--sw-ink);}" +
  ".ege-task--spider-web .sw-found-list{display:flex;flex-direction:column;gap:8px;flex:1 1 auto;min-height:0;overflow-y:auto;padding-right:4px;scrollbar-width:thin;}" +
  ".ege-task--spider-web .sw-found-panel__hint{margin:0;font-size:0.8rem;color:var(--sw-muted);opacity:0.85;}" +
  ".ege-task--spider-web .sw-found-item{padding:10px 12px;border-radius:14px;background:#e6e7f4;color:var(--sw-muted);border:2px solid transparent;transition:background 0.18s ease,border-color 0.18s ease,box-shadow 0.18s ease;}" +
  ".ege-task--spider-web .sw-found-item--found{background:#d5f5e3;color:#1e8449;}" +
  ".ege-task--spider-web .sw-found-sentence{margin:0;font-size:0.9rem;font-weight:600;line-height:1.4;color:inherit;}" +
  ".ege-task--spider-web .sw-found-sentence--empty{font-style:italic;opacity:0.65;}" +
  ".ege-task--spider-web .sw-found-definition{margin:6px 0 0;font-size:0.82rem;font-weight:700;line-height:1.32;opacity:0.82;}" +
  ".ege-task--spider-web .sw-found-definition--reserved{visibility:hidden;}" +
  ".ege-task--spider-web .cloze-blank{display:inline-block;min-width:4.5ch;border-bottom:2px solid currentColor;opacity:0.55;vertical-align:baseline;letter-spacing:0.05em;color:transparent;}" +
  ".ege-task--spider-web .cloze-input{display:inline-block;width:9.5ch;min-height:1.9em;margin:0 0.12em;padding:0.12em 0.35em;border:0;border-bottom:2px solid currentColor;border-radius:8px 8px 0 0;background:rgba(255,255,255,0.72);color:var(--sw-ink);font:inherit;font-weight:800;text-align:center;outline:none;vertical-align:baseline;}" +
  ".ege-task--spider-web .cloze-input::placeholder{color:currentColor;font-size:0.82em;font-weight:700;opacity:0.45;}" +
  ".ege-task--spider-web .cloze-input:focus{background:#fff;box-shadow:0 0 0 4px rgba(1,8,158,0.12);color:var(--sw-accent-dark);}" +
  ".ege-task--spider-web .cloze-input:disabled{opacity:0.55;}" +
  ".ege-task--spider-web .cloze-reveal{font-weight:800;color:var(--sw-ink)!important;}" +
  ".ege-task--spider-web .sw-found-item.is-sentence-active{background:var(--sw-accent-soft);border-color:var(--sw-accent);box-shadow:0 6px 14px rgba(1,8,158,0.18);color:var(--sw-accent-dark);}" +
  ".ege-task--spider-web .sw-found-item--found.is-sentence-active{background:#d5f5e3;border-color:#27ae60;box-shadow:0 6px 14px rgba(39,174,96,0.2);color:#1e8449;}" +
  ".ege-task--spider-web .sw-node--answer.is-fly-active .fly{filter:drop-shadow(0 0 6px rgba(1,8,158,0.6)) drop-shadow(0 0 14px rgba(1,8,158,0.45));}" +
  ".ege-task--spider-web .sw-node--answer.is-fly-active .fly__img{transform:scale(1.22);}" +
  ".ege-task--spider-web .sw-score-pill{display:inline-flex;align-items:center;gap:8px;flex-shrink:0;padding:6px 14px 6px 8px;border-radius:999px;background:var(--sw-accent-soft);color:var(--sw-accent-dark);font-weight:800;}" +
  ".ege-task--spider-web .sw-belly{flex-shrink:0;width:24px;height:24px;overflow:visible;filter:drop-shadow(0 1px 2px rgba(1,8,100,0.25));}" +
  ".ege-task--spider-web .sw-belly-bg{fill:rgba(255,255,255,0.9);stroke:rgba(1,8,100,0.4);stroke-width:1.2;}" +
  ".ege-task--spider-web .sw-belly-fill{fill:#0b072e;clip-path:inset(var(--belly-empty,100%) 0 0 0);transition:clip-path 0.45s ease;}" +
  ".ege-task--spider-web .sw-score-text{white-space:nowrap;}" +
  ".ege-task--spider-web .sw-status-pill{display:inline-flex;align-items:baseline;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,0.78);border:1px solid rgba(255,255,255,0.9);box-shadow:0 3px 8px rgba(11,7,46,0.04);}" +
  ".ege-task--spider-web .sw-status-pill__label{color:var(--sw-muted);font-size:0.7rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;}" +
  ".ege-task--spider-web .sw-status-pill__value{color:var(--sw-ink);font-weight:800;font-size:0.92rem;transition:color 0.2s ease,text-shadow 0.2s ease;}" +
  ".ege-task--spider-web .sw-status-pill--streak.is-hot .sw-status-pill__value{color:var(--sw-good);text-shadow:0 0 8px rgba(39,174,96,0.35);}" +
  ".ege-task--spider-web .sw-btn{min-height:34px;padding:6px 12px;border-radius:999px;border:2px solid transparent;cursor:pointer;font-weight:800;transition:transform 0.15s ease,opacity 0.15s ease,background 0.15s ease;margin-inline-start:auto;flex-shrink:0;}" +
  ".ege-task--spider-web .sw-btn:hover:not(:disabled){transform:translateY(-1px);}" +
  ".ege-task--spider-web .sw-btn--reveal{background:#fff;border-color:var(--sw-line);color:var(--sw-muted);}" +
  "@media (max-width: 900px){.ege-task--spider-web .sw-layout{grid-template-columns:1fr;height:auto;}.ege-task--spider-web .sw-found-panel{min-width:0;height:auto;overflow:visible;}.ege-task--spider-web .sw-found-list{overflow:visible;flex:none;padding-right:0;}.ege-task--spider-web .sw-card{height:clamp(300px,48vh,460px);}}" +
  "@media (max-width: 560px){.ege-task--spider-web .sw-card{height:clamp(260px,42vh,380px);}.ege-task--spider-web .sw-node{min-width:64px;min-height:34px;padding:6px 9px;font-size:0.85rem;}}";

/* ------------------------------------------------------------- public */

E.renderSpiderWeb = function renderSpiderWeb(task, topicId) {
  ensureStylesInjected();

  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--spider-web");

  var built = buildDom(task);
  doms[task.id] = built.refs;
  games[task.id] = {
    task: task,
    foundWords: new Set(),
    wrongCount: 0,
    streak: 0,
    bestStreak: 0,
    revealUsed: false,
    completed: false,
    layoutCache: null,
    animatePopForWord: null,
    revealStaggerForWords: null,
  };

  wrap.appendChild(built.fragment);

  // Minimal self-scoring score line, matching E.showScoreFeedback()'s target.
  var score = document.createElement("p");
  score.className = "ege-task__score";
  score.id = "score-" + task.id;
  score.hidden = true;
  score.setAttribute("aria-live", "polite");
  wrap.appendChild(score);

  render(task.id);
  updatePatienceUI(task.id);

  return wrap;
};

E.resetSpiderWeb = function resetSpiderWeb(taskId) {
  var task = games[taskId] ? games[taskId].task : E.findTask(taskId);
  if (!task) return;
  var article = document.getElementById("task-" + taskId);
  if (!article || !article.parentNode) return;
  delete games[taskId];
  delete doms[taskId];
  var fresh = E.renderSpiderWeb(task, E.state.topicId);
  article.parentNode.replaceChild(fresh, article);
  if (typeof E.hideScoreFeedback === "function") E.hideScoreFeedback(taskId);
};

E.revealSpiderWeb = function revealSpiderWeb(taskId) {
  if (!games[taskId]) return;
  revealAll(taskId);
};
