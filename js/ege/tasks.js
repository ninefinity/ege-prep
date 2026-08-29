import { E } from "./runtime.js";

E.buildMatchingRead = function buildMatchingRead(task, topicId, textsRoot) {
    var prefix = topicId + "_" + task.id;
    var read = document.createElement("div");
    read.className = "ege-match-read";

    var refStrip = E.buildRefStrip("Headings", task.headings);
    var refList = refStrip.querySelector(".ege-ref__list");
    read.appendChild(refStrip);

    var track = E.buildAnswerTrack(
      task.texts.map(function (item) {
        return { id: item.letter, label: item.letter };
      }),
      null
    );
    read.appendChild(track);

    var picks = document.createElement("div");
    picks.className = "ege-match-picks ege-picks-controller";
    picks.setAttribute("aria-hidden", "true");

    var hidden = document.createElement("div");
    hidden.className = "ege-match-hidden";

    var activeLetter = "";

    function radioName(letter) {
      return prefix + "_" + letter;
    }

    function syncCheckGate() {
      E.syncMatchingCheckEnabled(task.id);
    }

    function clearLetterMarks(letter) {
      if (textsRoot) {
        var block = textsRoot.querySelector('[data-letter="' + letter + '"]');
        if (block) block.classList.remove("is-correct", "is-wrong", "is-empty");
      }
      if (refList) {
        refList.querySelectorAll("li").forEach(function (li) {
          li.classList.remove("is-correct", "is-wrong");
        });
      }
      var cell = track.querySelector('[data-slot="' + letter + '"]');
      if (cell) cell.classList.remove("is-correct", "is-wrong", "is-empty");
    }

    function syncActiveText() {
      if (!textsRoot) return;
      textsRoot.querySelectorAll(".ege-text-block").forEach(function (block) {
        block.classList.toggle("is-active", block.dataset.letter === activeLetter);
      });
    }

    function syncTextBlocks() {
      if (!textsRoot) return;
      textsRoot.querySelectorAll(".ege-text-block").forEach(function (block) {
        var letter = block.dataset.letter;
        var val = E.getCheckedValue(radioName(letter));
        block.classList.toggle("is-used", !!val);
      });
    }

    function syncTrack() {
      track.querySelectorAll(".ege-answer-track__cell").forEach(function (cell) {
        var letter = cell.dataset.slot;
        var val = E.getCheckedValue(radioName(letter));
        var valEl = cell.querySelector(".ege-answer-track__val");
        if (valEl) valEl.textContent = val || "";
        cell.classList.toggle("is-filled", !!val);
        cell.classList.toggle("is-active", letter === activeLetter);
      });
    }

    function syncNumberRow() {
      var value = activeLetter ? E.getCheckedValue(radioName(activeLetter)) : "";
      if (!refList) return;
      refList.querySelectorAll("li").forEach(function (li, index) {
        li.classList.toggle("is-selected", li.dataset.value === value);
        li.classList.remove("is-correct", "is-wrong");
      });
    }

    function syncUsedState() {
      var usedNumbers = {};
      task.texts.forEach(function (item) {
        var val = E.getCheckedValue(radioName(item.letter));
        if (val) usedNumbers[val] = true;
      });

      if (refList) {
        refList.querySelectorAll("li").forEach(function (li) {
          li.classList.toggle("is-used", !!usedNumbers[li.dataset.value]);
        });
      }

      syncTextBlocks();
      syncTrack();
    }

    function clearLetter(letter) {
      E.clearChoiceGroup(radioName(letter));
      clearLetterMarks(letter);
      if (letter === activeLetter) syncNumberRow();
      syncUsedState();
      E.hideScoreFeedback(task.id);
      syncCheckGate();
    }

    function nextEmptyLetter(fromLetter) {
      var letters = task.texts.map(function (item) {
        return item.letter;
      });
      var start = letters.indexOf(fromLetter);
      if (start < 0) start = 0;
      for (var i = 1; i <= letters.length; i += 1) {
        var letter = letters[(start + i) % letters.length];
        if (!E.getCheckedValue(radioName(letter))) return letter;
      }
      return fromLetter;
    }

    function assignNumber(num) {
      if (!activeLetter) {
        var first = nextEmptyLetter("");
        if (!first && task.texts.length) first = task.texts[0].letter;
        if (first) setActiveLetter(first);
      }
      if (!activeLetter) return;

      var numStr = String(num);
      var current = E.getCheckedValue(radioName(activeLetter));
      if (current === numStr) {
        clearLetter(activeLetter);
        return;
      }

      var ownerLetter = "";
      task.texts.forEach(function (item) {
        if (E.getCheckedValue(radioName(item.letter)) === numStr) {
          ownerLetter = item.letter;
        }
      });

      if (ownerLetter) {
        clearLetter(ownerLetter);
        syncNumberRow();
        return;
      }

      E.setRadioValue(radioName(activeLetter), numStr);
      clearLetterMarks(activeLetter);
      E.hideScoreFeedback(task.id);
      syncNumberRow();
      syncUsedState();
      syncCheckGate();
    }

    function setActiveLetter(letter) {
      activeLetter = letter || "";
      syncActiveText();
      syncNumberRow();
      syncTrack();
    }

    function activateTextBlock(letter) {
      if (letter === activeLetter) {
        if (E.getCheckedValue(radioName(letter))) {
          clearLetter(letter);
        } else {
          setActiveLetter("");
        }
        return;
      }
      setActiveLetter(letter);
    }

    task.texts.forEach(function (item) {
      hidden.appendChild(
        E.buildChoiceGroup(radioName(item.letter), task.headings.length, {
          label: "Heading for text " + item.letter,
        })
      );
    });

    if (textsRoot) {
      textsRoot.querySelectorAll(".ege-text-block").forEach(function (block) {
        block.setAttribute("role", "button");
        block.tabIndex = 0;
        block.setAttribute("aria-label", "Select text " + block.dataset.letter);
        block.addEventListener("click", function (event) {
          if (event.detail > 1) return;
          var sel = window.getSelection();
          if (
            sel &&
            !sel.isCollapsed &&
            sel.anchorNode &&
            block.contains(sel.anchorNode)
          ) {
            return;
          }
          if (event.target.closest && event.target.closest(".ege-highlight-tools")) {
            return;
          }
          activateTextBlock(block.dataset.letter);
        });
        block.addEventListener("keydown", function (event) {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          activateTextBlock(block.dataset.letter);
        });
      });
    }

    task.texts.forEach(function (item) {
      var cell = track.querySelector('[data-slot="' + item.letter + '"]');
      if (!cell) return;
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
      cell.setAttribute("aria-label", "Select text " + item.letter);
      cell.addEventListener("click", function () {
        activateTextBlock(item.letter);
      });
      cell.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateTextBlock(item.letter);
      });
    });

    E.wirePickableRefList(refList, assignNumber, "Heading");

    picks.dataset.taskId = task.id;
    picks.syncUsedState = syncUsedState;
    picks.syncNumberRow = syncNumberRow;
    picks.setActiveLetter = setActiveLetter;
    picks.assignNumber = assignNumber;
    picks.clearLetter = clearLetter;
    picks.activateLetter = activateTextBlock;
    picks.getActiveLetter = function () {
      return activeLetter;
    };

    picks.appendChild(hidden);
    read.appendChild(picks);
    syncActiveText();
    syncUsedState();
    syncCheckGate();
    return read;
  }

E.allMatchingFilled = function allMatchingFilled(taskId) {
    var task = E.findTask(taskId);
    if (!task || task.type !== "matching") return false;
    var prefix = E.taskPrefix(taskId);
    return task.texts.every(function (item) {
      return !!E.getCheckedValue(prefix + "_" + item.letter);
    });
  }

E.syncMatchingCheckEnabled = function syncMatchingCheckEnabled(taskId) {
    E.syncCheckButton(taskId);
    E.syncResetButton(taskId);
    E.syncShowAnswersButton(taskId);
  }

E.buildMatchingScoreLines = function buildMatchingScoreLines(taskId, task, opts) {
    var lines = [];
    if (!task || !task.texts) return lines;
    var revealKey = opts && opts.revealKey;
    var keyOnly = opts && opts.keyOnly;
    var prefix = E.taskPrefix(taskId);
    task.texts.forEach(function (item) {
      var value = E.getCheckedValue(prefix + "_" + item.letter);
      var expected = String(task.answers[item.letter]);
      if (keyOnly) {
        lines.push(item.letter + " → " + expected);
      } else if (value && value === expected) {
        lines.push(item.letter + ": " + value + " ✓");
      } else if (revealKey) {
        lines.push(item.letter + ": " + (value || "—") + " → " + expected);
      } else if (value) {
        lines.push(item.letter + ": " + value + " ✗");
      } else {
        lines.push(item.letter + ": —");
      }
    });
    return lines;
  }

E.buildGapfillPicker = function buildGapfillPicker(task, topicId, inserts, refList) {
    var prefix = topicId + "_" + task.id;

    var track = E.buildAnswerTrack(
      task.gaps.map(function (gap) {
        return { id: gap, label: gap };
      }),
      null
    );

    var picks = document.createElement("div");
    picks.className = "ege-gap-picks ege-picks-controller";
    picks.setAttribute("aria-hidden", "true");

    var hidden = document.createElement("div");
    hidden.className = "ege-match-hidden";

    var activeGap = "";

    function radioName(gap) {
      return prefix + "_gap_" + gap;
    }

    function updateInsert(gap, num) {
      /* Live query: highlight restore can replace passage DOM and orphan cached nodes */
      var insert = E.getGapInsert(task.id, gap) || inserts[gap];
      if (!insert || !insert.isConnected) return;
      inserts[gap] = insert;
      var textSpan = insert.querySelector(".ege-gap-insert__text");
      if (!textSpan) {
        textSpan = document.createElement("span");
        textSpan.className = "ege-gap-insert__text";
        insert.appendChild(textSpan);
      }
      if (num) {
        textSpan.textContent = task.options[parseInt(num, 10) - 1] || "";
        insert.classList.add("is-filled");
      } else {
        textSpan.textContent = "";
        insert.classList.remove("is-filled");
      }
    }

    function syncActiveGap() {
      task.gaps.forEach(function (gap) {
        var insert = E.getGapInsert(task.id, gap) || inserts[gap];
        if (insert) insert.classList.toggle("is-active", gap === activeGap);
      });
    }

    function syncNumberRow() {
      var value = activeGap ? E.getCheckedValue(radioName(activeGap)) : "";
      if (!refList) return;
      refList.querySelectorAll("li").forEach(function (li) {
        li.classList.toggle("is-selected", li.dataset.value === value);
        li.classList.remove("is-correct", "is-wrong");
      });
    }

    function syncTrack() {
      track.querySelectorAll(".ege-answer-track__cell").forEach(function (cell) {
        var gap = cell.dataset.slot;
        var val = E.getCheckedValue(radioName(gap));
        var valEl = cell.querySelector(".ege-answer-track__val");
        if (valEl) valEl.textContent = val || "";
        cell.classList.toggle("is-filled", !!val);
        cell.classList.toggle("is-active", gap === activeGap);
      });
    }

    function syncUsedState() {
      var usedNumbers = {};
      task.gaps.forEach(function (gap) {
        var val = E.getCheckedValue(radioName(gap));
        if (val) usedNumbers[val] = true;
      });

      if (refList) {
        refList.querySelectorAll("li").forEach(function (li) {
          li.classList.toggle("is-used", !!usedNumbers[li.dataset.value]);
        });
      }

      syncTrack();
    }

    function clearGapMarks(gap) {
      var insert = E.getGapInsert(task.id, gap) || inserts[gap];
      if (insert) insert.classList.remove("is-correct", "is-wrong");
      if (refList) {
        refList.querySelectorAll("li").forEach(function (li) {
          li.classList.remove("is-correct", "is-wrong");
        });
      }
      var cell = track.querySelector('[data-slot="' + gap + '"]');
      if (cell) cell.classList.remove("is-correct", "is-wrong", "is-empty");
    }

    function clearGap(gap) {
      E.clearChoiceGroup(radioName(gap));
      updateInsert(gap, null);
      clearGapMarks(gap);
      if (gap === activeGap) syncNumberRow();
      syncUsedState();
      E.updateAnsweredCount(task.id);
    }

    function nextEmptyGap(fromGap) {
      var start = task.gaps.indexOf(fromGap);
      if (start < 0) start = 0;
      for (var i = 1; i <= task.gaps.length; i += 1) {
        var gap = task.gaps[(start + i) % task.gaps.length];
        if (!E.getCheckedValue(radioName(gap))) return gap;
      }
      return fromGap || task.gaps[0];
    }

    function assignNumber(num) {
      if (!activeGap) {
        var first = nextEmptyGap("");
        if (first) setActiveGap(first);
      }
      if (!activeGap) return;

      var numStr = String(num);
      var current = E.getCheckedValue(radioName(activeGap));
      if (current === numStr) {
        clearGap(activeGap);
        return;
      }

      var ownerGap = "";
      task.gaps.forEach(function (gap) {
        if (E.getCheckedValue(radioName(gap)) === numStr) {
          ownerGap = gap;
        }
      });

      if (ownerGap) {
        clearGap(ownerGap);
        syncNumberRow();
        return;
      }

      E.setRadioValue(radioName(activeGap), numStr);
      updateInsert(activeGap, numStr);
      clearGapMarks(activeGap);
      syncNumberRow();
      syncUsedState();
      E.updateAnsweredCount(task.id);
    }

    function setActiveGap(gap) {
      activeGap = gap || "";
      syncActiveGap();
      syncNumberRow();
      syncTrack();
    }

    function activateGapInsert(gap) {
      if (gap === activeGap) {
        if (E.getCheckedValue(radioName(gap))) {
          clearGap(gap);
        } else {
          setActiveGap("");
        }
        return;
      }
      setActiveGap(gap);
    }

    task.gaps.forEach(function (gap) {
      hidden.appendChild(
        E.buildChoiceGroup(radioName(gap), task.options.length, {
          label: "Sentence part for gap " + gap,
        })
      );

      var insert = inserts[gap];
      if (!insert) return;
      insert.setAttribute("role", "button");
      insert.tabIndex = 0;
      insert.setAttribute("aria-label", "Select gap " + gap);
      insert.addEventListener("click", function () {
        activateGapInsert(gap);
      });
      insert.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateGapInsert(gap);
      });
    });

    E.wirePickableRefList(refList, assignNumber, "Sentence part");

    task.gaps.forEach(function (gap) {
      var cell = track.querySelector('[data-slot="' + gap + '"]');
      if (!cell) return;
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
      cell.setAttribute("aria-label", "Select gap " + gap);
      cell.addEventListener("click", function () {
        activateGapInsert(gap);
      });
      cell.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateGapInsert(gap);
      });
    });

    picks.appendChild(hidden);
    picks.dataset.taskId = task.id;
    picks.syncUsedState = syncUsedState;
    picks.syncNumberRow = syncNumberRow;
    picks.updateInsert = updateInsert;
    picks.clearGap = clearGap;
    picks.setActiveGap = setActiveGap;
    picks.assignNumber = assignNumber;
    picks.activateGap = activateGapInsert;
    picks.activateLetter = activateGapInsert;
    picks.getActiveGap = function () {
      return activeGap;
    };
    picks.inserts = inserts;
    syncUsedState();
    syncActiveGap();

    return { picks: picks, track: track };
  }

E.buildVocabClozePicker = function buildVocabClozePicker(task, topicId, inserts) {
    var prefix = topicId + "_" + task.id;
    var activeGapNum = "";

    var picks = document.createElement("div");
    picks.className = "ege-mc-stack ege-vocab-picks";
    picks.setAttribute("aria-label", "Choose a word for each gap");

    function radioName(index) {
      return prefix + "_q_" + index;
    }

    function questionIndexForGap(gapNum) {
      for (var i = 0; i < task.questions.length; i += 1) {
        if (E.vocabGapNum(task.questions[i]) === String(gapNum)) return i;
      }
      return -1;
    }

    function updateInsert(gapNum, word) {
      var insert = E.getGapInsert(task.id, gapNum) || inserts[gapNum];
      if (!insert || !insert.isConnected) return;
      inserts[gapNum] = insert;
      var textSpan = insert.querySelector(".ege-gap-insert__text");
      if (!textSpan) {
        textSpan = document.createElement("span");
        textSpan.className = "ege-gap-insert__text";
        insert.appendChild(textSpan);
      }
      if (word) {
        textSpan.textContent = word;
        insert.classList.add("is-filled");
      } else {
        textSpan.textContent = "";
        insert.classList.remove("is-filled");
      }
    }

    function syncActiveGap() {
      task.questions.forEach(function (question) {
        var gapNum = E.vocabGapNum(question);
        var insert = E.getGapInsert(task.id, gapNum) || inserts[gapNum];
        if (insert) insert.classList.toggle("is-active", gapNum === activeGapNum);
      });
    }

    function syncActiveCard() {
      picks.querySelectorAll(".ege-mc-card").forEach(function (card) {
        card.classList.toggle("is-active", card.dataset.gap === activeGapNum);
      });
    }

    function syncInserts() {
      task.questions.forEach(function (question, index) {
        var value = E.getCheckedValue(radioName(index));
        var word = value === "" ? "" : question.opts[parseInt(value, 10)] || "";
        updateInsert(E.vocabGapNum(question), word);
      });
      E.updateAnsweredCount(task.id);
    }

    function setActiveGap(gapNum) {
      activeGapNum = gapNum || "";
      syncActiveGap();
      syncActiveCard();
      if (!activeGapNum) return;
      var card = picks.querySelector('[data-gap="' + activeGapNum + '"]');
      if (card) card.scrollIntoView({ block: "nearest" });
    }

    function clearGapAnswer(gapNum) {
      var index = questionIndexForGap(gapNum);
      if (index < 0) return;
      E.clearChoiceGroup(radioName(index));
      updateInsert(gapNum, "");
      var insert = E.getGapInsert(task.id, gapNum) || inserts[gapNum];
      if (insert) insert.classList.remove("is-correct", "is-wrong");
      syncInserts();
    }

    function activateGapInsert(gapNum) {
      if (gapNum === activeGapNum) {
        var index = questionIndexForGap(gapNum);
        if (index >= 0 && E.getCheckedValue(radioName(index))) {
          clearGapAnswer(gapNum);
        } else {
          setActiveGap("");
        }
        return;
      }
      setActiveGap(gapNum);
    }

    picks.syncInserts = syncInserts;
    picks.setActiveGap = setActiveGap;
    picks.getActiveGap = function () {
      return activeGapNum;
    };

    task.questions.forEach(function (question, index) {
      var block = document.createElement("div");
      block.className = "ege-mc-card";
      block.id = prefix + "_q_" + index;
      block.dataset.gap = E.vocabGapNum(question);

      var prompt = document.createElement("p");
      prompt.className = "ege-mc__prompt";
      prompt.textContent = question.q;
      block.appendChild(prompt);
      block.appendChild(E.buildMcChoiceGroup(radioName(index), question.opts, question.q));
      block.addEventListener("click", function () {
        setActiveGap(block.dataset.gap);
      });
      picks.appendChild(block);
    });

    Object.keys(inserts).forEach(function (gapNum) {
      var insert = inserts[gapNum];
      if (!insert) return;
      insert.setAttribute("role", "button");
      insert.tabIndex = 0;
      insert.setAttribute("aria-label", "Select gap " + gapNum);
      insert.addEventListener("click", function (event) {
        event.stopPropagation();
        activateGapInsert(gapNum);
      });
      insert.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateGapInsert(gapNum);
      });
    });

    picks.addEventListener("change", function (event) {
      var card = event.target.closest(".ege-mc-card");
      if (card) setActiveGap(card.dataset.gap);
    });

    syncInserts();
    syncActiveGap();
    syncActiveCard();

    return picks;
  }

E.buildSplit = function buildSplit(readEl, workEl, modifier) {
    var split = document.createElement("div");
    split.className = "ege-split" + (modifier ? " " + modifier : "");

    var read = document.createElement("div");
    read.className = "ege-split__read";
    read.appendChild(readEl);

    var work = document.createElement("div");
    work.className = "ege-split__work";
    work.appendChild(workEl);

    split.appendChild(read);
    split.appendChild(work);
    return split;
  }

E.getCheckedValue = function getCheckedValue(name) {
    var checked = document.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : "";
  }

E.clearChoiceGroup = function clearChoiceGroup(name) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (radio) {
      radio.checked = false;
      radio.dataset.wasChecked = "0";
      var pill = radio.closest(".ege-pill");
      if (pill) pill.classList.remove("is-correct", "is-wrong");
    });
  }

E.markChoiceGroup = function markChoiceGroup(name, value, correctValue) {
    var pills = [];
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (radio) {
      var pill = radio.closest(".ege-pill");
      if (pill) {
        pill.classList.remove("is-correct", "is-wrong");
        pills.push({ pill: pill, value: radio.value, checked: radio.checked });
      }
    });

    var ok = value === correctValue;
    pills.forEach(function (item) {
      if (item.checked) {
        item.pill.classList.add(ok ? "is-correct" : "is-wrong");
      } else if (!ok && item.value === correctValue) {
        item.pill.classList.add("is-correct");
      }
    });
    return ok;
  }

E.renderMatching = function renderMatching(task, topicId) {
    var max = E.taskMaxScore(task);
    var wrap = E.buildTaskArticle(task);
    wrap.classList.add("ege-task--matching");

    var texts = document.createElement("div");
    texts.className = "ege-match-texts";
    task.texts.forEach(function (item) {
      var block = document.createElement("div");
      block.className = "ege-text-block";
      block.dataset.letter = item.letter;
      block.innerHTML = "<strong>" + item.letter + ".</strong> " + item.text;
      texts.appendChild(block);
    });

    wrap.appendChild(
      E.buildSplit(
        E.buildPanel("", texts, "ege-panel--read"),
        E.buildPanel("", E.buildMatchingRead(task, topicId, texts), "ege-panel--work"),
        "ege-split--panels"
      )
    );
    wrap.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));
    return wrap;
  }

E.renderGapfill = function renderGapfill(task, topicId) {
    var max = E.taskMaxScore(task);
    var wrap = E.buildTaskArticle(task);
    wrap.classList.add("ege-task--gapfill");

    var text = document.createElement("div");
    text.className = "ege-passage ege-gapfill-passage";
    text.innerHTML = task.html;

    var inserts = E.replaceGapPlaceholders(
      text,
      task.gaps.map(function (gap) {
        return { selector: '[data-gap="' + gap + '"]', gapId: gap };
      })
    );

    var refStrip = E.buildRefStrip("Sentence parts", task.options);
    var refList = refStrip.querySelector(".ege-ref__list");

    var side = document.createElement("div");
    side.className = "ege-sidebar-work";
    var picker = E.buildGapfillPicker(task, topicId, inserts, refList);
    side.appendChild(refStrip);
    side.appendChild(picker.track);
    side.appendChild(picker.picks);

    wrap.appendChild(
      E.buildSplit(
        E.buildPanel("", text, "ege-panel--read"),
        E.buildPanel("", side, "ege-panel--work"),
        "ege-split--panels"
      )
    );
    wrap.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));
    return wrap;
  }

E.renderVocabCloze = function renderVocabCloze(task, topicId) {
    var max = E.taskMaxScore(task);
    var wrap = E.buildTaskArticle(task);
    wrap.classList.add("ege-task--vocab");

    var html = task.passage;
    task.questions.forEach(function (question) {
      var gapNum = E.vocabGapNum(question);
      html = html.split("[" + gapNum + "]").join('<span data-vocab-gap="' + gapNum + '"></span>');
    });

    var passage = document.createElement("div");
    passage.className = "ege-passage ege-gapfill-passage";
    passage.innerHTML = html;

    var inserts = E.replaceGapPlaceholders(
      passage,
      task.questions.map(function (question) {
        var gapNum = E.vocabGapNum(question);
        return { selector: '[data-vocab-gap="' + gapNum + '"]', gapId: gapNum };
      })
    );

    var picker = E.buildVocabClozePicker(task, topicId, inserts);
    var side = document.createElement("div");
    side.className = "ege-sidebar-work";
    side.appendChild(picker);

    wrap.appendChild(
      E.buildSplit(
        E.buildPanel("", passage, "ege-panel--read"),
        E.buildPanel("", side, "ege-panel--work"),
        "ege-split--panels"
      )
    );
    wrap.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));
    return wrap;
  }

E.renderMc = function renderMc(task, topicId) {
    var max = E.taskMaxScore(task);
    var wrap = E.buildTaskArticle(task);

    var work = document.createElement("div");
    work.className = "ege-mc-stack";

    task.questions.forEach(function (question, index) {
      var block = document.createElement("div");
      block.className = "ege-mc-card";
      block.id = topicId + "_" + task.id + "_q_" + index;

      var prompt = document.createElement("p");
      prompt.className = "ege-mc__prompt";
      prompt.textContent = question.q;
      block.appendChild(prompt);

      block.appendChild(
        E.buildMcChoiceGroup(topicId + "_" + task.id + "_q_" + index, question.opts, question.q)
      );
      work.appendChild(block);
    });

    if (task.passage) {
      var passage = document.createElement("div");
      passage.className = "ege-passage";
      passage.innerHTML = task.passage;

      var readScroll = document.createElement("div");
      readScroll.className = "ege-read-scroll";
      readScroll.appendChild(passage);

      var scrollWrap = document.createElement("div");
      scrollWrap.className = "ege-work-scroll";
      scrollWrap.appendChild(work);

      var workPanel = E.buildPanel("Questions", scrollWrap, "ege-panel--work");
      var workCol = document.createElement("div");
      workCol.className = "ege-work-col";
      workCol.appendChild(workPanel);

      var body = document.createElement("div");
      body.className = "ege-reading-mc-body";

      wrap.classList.add("ege-task--reading-mc");
      body.appendChild(
        E.buildSplit(E.buildPanel("Text", readScroll, "ege-panel--read"), workCol, "ege-split--panels")
      );
      body.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));
      wrap.appendChild(body);
    } else {
      wrap.appendChild(E.buildPanel("Questions", work, "ege-panel--solo"));
      wrap.appendChild(E.buildTaskFooter(task.id, max, { showAnswers: true }));
    }
    return wrap;
  }
