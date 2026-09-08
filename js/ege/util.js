import { E } from "./runtime.js";

E.clamp = function clamp(value, min, max) {
  var n = Number(value);
  if (!isFinite(n)) n = 0;
  return Math.max(min, Math.min(n, max));
};

E.limitScore = function limitScore(score, maximum) {
  return E.clamp(score, 0, maximum);
};

E.normalize = function normalize(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

E.escapeRegExp = function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

E.swapWholeWord = function swapWholeWord(input, fromWord, toWord) {
    var pattern = new RegExp("\\b" + E.escapeRegExp(fromWord) + "\\b", "g");
    return input.replace(pattern, toWord);
  }

// Words where -ise is part of the stem rather than the verb-forming suffix,
// so they have no -ize twin. Without this, "otherwise" would accept
// "otherwize" and "surprise" would accept "surprize" as correct spellings.
var ISE_NOT_IZE = {};
[
  "advertise", "advise", "apprise", "arise", "chastise", "comprise",
  "compromise", "demise", "despise", "devise", "disguise", "enterprise",
  "excise", "exercise", "franchise", "improvise", "incise", "merchandise",
  "otherwise", "paradise", "precise", "premise", "promise", "revise", "rise",
  "supervise", "surmise", "surprise", "televise", "treatise", "wise",
].forEach(function (word) {
  ISE_NOT_IZE[word] = true;
});

// The -size compounds: their -ize is the noun "size", not the suffix.
var IZE_NOT_ISE = {};
["capsize", "downsize", "midsize", "oversize", "resize", "upsize"].forEach(
  function (word) {
    IZE_NOT_ISE[word] = true;
  }
);

var ISE_SUFFIX_RE = /\b([a-z]{3,})(ise|ised|ises|ising|isation|isations)\b/g;
var IZE_SUFFIX_RE = /\b([a-z]{3,})(ize|ized|izes|izing|ization|izations)\b/g;

// Swap the -ise/-ize spelling of every eligible word in `input`. `lemmaSuffix`
// rebuilds the dictionary form ("real" + "ised" -> "realise") so inflected
// inputs are checked against the exclusion list too.
function swapSuffixSpelling(input, pattern, lemmaSuffix, excluded, from, to) {
  return input.replace(pattern, function (match, stem, suffix) {
    if (excluded[stem + lemmaSuffix]) return match;
    return stem + to + suffix.slice(from.length);
  });
}

E.generateSpellingVariants = function generateSpellingVariants(value) {
    var out = [];

    function pushVariant(next) {
      if (next && next !== value && out.indexOf(next) === -1) out.push(next);
    }

    // -ise/-ize family (realise/realize, organised/organized, etc.)
    pushVariant(
      swapSuffixSpelling(value, ISE_SUFFIX_RE, "ise", ISE_NOT_IZE, "is", "iz")
    );
    pushVariant(
      swapSuffixSpelling(value, IZE_SUFFIX_RE, "ize", IZE_NOT_ISE, "iz", "is")
    );

    // High-frequency BrE/AmE lexical pairs.
    [
      ["colour", "color"],
      ["favourite", "favorite"],
      ["favour", "favor"],
      ["honour", "honor"],
      ["labour", "labor"],
      ["neighbour", "neighbor"],
      ["centre", "center"],
      ["theatre", "theater"],
      ["metre", "meter"],
      ["litre", "liter"],
      ["defence", "defense"],
      ["offence", "offense"],
      ["travelling", "traveling"],
      ["travelled", "traveled"],
      ["traveller", "traveler"],
      ["cancelling", "canceling"],
      ["cancelled", "canceled"],
      ["jewellery", "jewelry"],
      ["dialogue", "dialog"],
    ].forEach(function (pair) {
      pushVariant(E.swapWholeWord(value, pair[0], pair[1]));
      pushVariant(E.swapWholeWord(value, pair[1], pair[0]));
    });

    return out;
  }

E.buildAcceptedAnswers = function buildAcceptedAnswers(answer, alt) {
    var accepted = {};
    var queue = [];

    function add(value) {
      var normalized = E.normalize(value);
      if (!normalized || accepted[normalized]) return;
      accepted[normalized] = true;
      queue.push(normalized);
    }

    add(answer);
    var altList = [];
    if (Array.isArray(alt)) altList = alt;
    else if (alt != null && alt !== "") altList = [alt];
    altList.forEach(add);

    for (var i = 0; i < queue.length; i += 1) {
      E.generateSpellingVariants(queue[i]).forEach(add);
    }

    return Object.keys(accepted);
  }

E.taskMaxScore = function taskMaxScore(task) {
    if (task.type === "matching") return task.texts.length;
    if (task.type === "gapfill") return task.gaps.length;
    if (task.type === "mc") return task.questions.length;
    if (task.type === "wordform") return task.items.length;
    if (task.type === "judge") return (task.items || []).length;
    if (task.type === "choice") return (task.questions || []).length;
    if (task.type === "pairing") return (task.left || []).length;
    if (task.type === "deduction") return (task.left || []).length;
    if (task.type === "ordering") return E.orderingSlots(task).length;
    if (task.type === "pronounce") return (task.words || []).length;
    if (task.type === "listening") {
      var gapCount = E.getActiveListeningGaps(task).length;
      var questionCount = task.questions ? task.questions.length : 0;
      var examMatchCount = task.examMatch ? (task.examMatch.speakers || []).length : 0;
      var examTfnCount = task.examTfn ? (task.examTfn.statements || []).length : 0;
      return gapCount + questionCount + examMatchCount + examTfnCount;
    }
    if (
      task.type === "speaking" ||
      task.type === "speaking-questions" ||
      task.type === "speaking-interview" ||
      task.type === "speaking-aloud"
    ) {
      return 1;
    }
    if (task.type === "writing") {
      return task.maxScore || 6;
    }
    return 0;
  }
