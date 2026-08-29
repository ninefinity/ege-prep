import { E } from "./runtime.js";

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

E.generateSpellingVariants = function generateSpellingVariants(value) {
    var out = [];

    function pushVariant(next) {
      if (next && next !== value && out.indexOf(next) === -1) out.push(next);
    }

    // -ise/-ize family (realise/realize, organised/organized, etc.)
    pushVariant(value.replace(/([a-z]{3,})ise\b/g, "$1ize"));
    pushVariant(value.replace(/([a-z]{3,})ised\b/g, "$1ized"));
    pushVariant(value.replace(/([a-z]{3,})ises\b/g, "$1izes"));
    pushVariant(value.replace(/([a-z]{3,})ising\b/g, "$1izing"));
    pushVariant(value.replace(/([a-z]{3,})isation\b/g, "$1ization"));
    pushVariant(value.replace(/([a-z]{3,})isations\b/g, "$1izations"));
    pushVariant(value.replace(/([a-z]{3,})ize\b/g, "$1ise"));
    pushVariant(value.replace(/([a-z]{3,})ized\b/g, "$1ised"));
    pushVariant(value.replace(/([a-z]{3,})izes\b/g, "$1ises"));
    pushVariant(value.replace(/([a-z]{3,})izing\b/g, "$1ising"));
    pushVariant(value.replace(/([a-z]{3,})ization\b/g, "$1isation"));
    pushVariant(value.replace(/([a-z]{3,})izations\b/g, "$1isations"));

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
    (alt || []).forEach(add);

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
    if (task.type === "listening") {
      var gapCount = E.getActiveListeningGaps(task).length;
      var questionCount = task.questions ? task.questions.length : 0;
      return gapCount + questionCount;
    }
    if (task.type === "speaking" || task.type === "speaking-questions") return 1;
    return 0;
  }
