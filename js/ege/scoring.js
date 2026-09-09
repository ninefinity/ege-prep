import { E } from "./runtime.js";

E.checkTask = function checkTask(taskId) {
    if (typeof E.hidesPracticeControls === "function" && E.hidesPracticeControls()) return;
    var task = E.findTask(taskId);
    if (!task) return;

    var revealedEl = document.getElementById("task-" + taskId);
    if (
      task.type !== "listening" &&
      revealedEl &&
      revealedEl.dataset.answersRevealed === "1"
    ) {
      return;
    }

    if (task.type === "mc" && !E.isVocabCloze(task)) {
      var prefixGate = E.taskPrefix(taskId);
      var incomplete = task.questions.some(function (_question, index) {
        return !E.getCheckedValue(prefixGate + "_q_" + index);
      });
      if (incomplete) {
        E.updateAnsweredCount(taskId);
        return;
      }
    }

    if (task.type === "listening") {
      var listeningKindGate = E.getListeningStepKind(task, E.getListeningStep(taskId));
      if (listeningKindGate === "exam-match" && !E.isListeningExamMatchComplete(taskId)) {
        E.syncListeningExamMatchFooterUI(taskId);
        return;
      }
      if (listeningKindGate === "exam-tfn" && !E.isListeningExamTfnComplete(taskId)) {
        E.syncListeningExamTfnFooterUI(taskId);
        return;
      }
      if (listeningKindGate === "mc" && !E.isListeningMcComplete(taskId)) {
        E.syncListeningMcFooterUI(taskId);
        return;
      }
    }

    if (task.type === "spider-web") return;

    var correct = 0;
    var max = E.taskMaxScore(task);
    var prefix = E.taskPrefix(taskId);

    if (task.type === "matching") {
      var board = document.querySelector("#task-" + taskId + " .ege-match-picks");

      if (!E.allMatchingFilled(taskId)) {
        task.texts.forEach(function (item) {
          var name = prefix + "_" + item.letter;
          var empty = !E.getCheckedValue(name);
          var block = E.getMatchingTextBlock(taskId, item.letter);
          if (block) block.classList.toggle("is-empty", empty);
          var cell = E.getAnswerTrackCell(taskId, item.letter);
          if (cell) cell.classList.toggle("is-empty", empty);
        });
        E.syncMatchingCheckEnabled(taskId);
        return;
      }

      task.texts.forEach(function (item) {
        var name = prefix + "_" + item.letter;
        var value = E.getCheckedValue(name);
        var ok = E.markChoiceGroup(name, value, task.answers[item.letter]);
        if (ok) correct += 1;

        var block = E.getMatchingTextBlock(taskId, item.letter);
        if (block) {
          block.classList.remove("is-empty");
          block.classList.toggle("is-correct", !!ok);
          block.classList.toggle("is-wrong", value && !ok);
        }
        var cell = E.getAnswerTrackCell(taskId, item.letter);
        if (cell) {
          cell.classList.remove("is-empty");
          cell.classList.toggle("is-correct", !!ok);
          cell.classList.toggle("is-wrong", value && !ok);
          var valEl = cell.querySelector(".ege-answer-track__val");
          if (valEl) valEl.textContent = value || "";
        }
      });
      if (board && board.syncUsedState) board.syncUsedState();
    }

    if (task.type === "gapfill") {
      var board = document.querySelector("#task-" + taskId + " .ege-gap-picks");
      task.gaps.forEach(function (gap) {
        var name = prefix + "_gap_" + gap;
        var value = E.getCheckedValue(name);
        var ok = E.markChoiceGroup(name, value, task.answers[gap]);
        if (ok) correct += 1;

        E.markGapInsert(taskId, gap, ok, !!value);

        var cell = E.getAnswerTrackCell(taskId, gap);
        if (cell) {
          cell.classList.toggle("is-correct", !!ok);
          cell.classList.toggle("is-wrong", value && !ok);
        }
      });
      if (board && board.syncUsedState) board.syncUsedState();
    }

    if (task.type === "mc" && E.isVocabCloze(task)) {
      task.questions.forEach(function (question, index) {
        var name = prefix + "_q_" + index;
        var value = E.getCheckedValue(name);
        var gapNum = E.vocabGapNum(question);
        var ok = E.gradeMcQuestion(name, String(question.correct));
        if (ok) correct += 1;
        E.markGapInsert(taskId, gapNum, ok, !!value);
      });
    } else if (task.type === "mc") {
      task.questions.forEach(function (question, index) {
        if (E.gradeMcQuestion(prefix + "_q_" + index, String(question.correct))) {
          correct += 1;
        }
      });
      var attemptEl = document.getElementById("task-" + taskId);
      if (attemptEl) attemptEl.dataset.hasAttempt = "1";
      E.updateAnsweredCount(taskId);
    }

    if (task.type === "pairing") {
      if (!E.allPairingBound(taskId)) {
        E.syncPairingCheckEnabled(taskId);
        return;
      }
      correct += E.markPairing(taskId, false);
      E.syncPairingProgress(taskId);
    }

    if (task.type === "deduction") {
      if (!E.allDeductionPlaced(taskId)) {
        E.syncDeductionCheckEnabled(taskId);
        return;
      }
      correct += E.markDeduction(taskId, false);
      E.syncDeductionProgress(taskId);
    }

    if (task.type === "ordering") {
      if (!E.allOrderingPlaced(taskId)) {
        E.syncOrderingCheckEnabled(taskId);
        return;
      }
      correct += E.markOrdering(taskId, false);
    }

    if (task.type === "choice") {
      if (!E.allChoiceAnswered(taskId)) {
        E.syncChoiceCheckEnabled(taskId);
        return;
      }
      task.questions.forEach(function (question) {
        var name = E.choiceQuestionName(taskId, question.id);
        var expected = E.choiceExpectedValue(question);
        var value = E.getCheckedValue(name);
        E.markChoiceGroup(name, value, expected);
        E.markChoiceQuestion(taskId, question, value);
        if (value && value === expected) correct += 1;
      });
      E.syncChoiceProgress(taskId);
    }

    if (task.type === "judge") {
      if (!E.allJudgeAnswered(taskId)) {
        E.syncJudgeCheckEnabled(taskId);
        return;
      }
      task.items.forEach(function (item) {
        var name = E.judgeItemName(taskId, item.id);
        var expected = E.judgeExpectedValue(item);
        var value = E.getCheckedValue(name);
        var ok = value === expected;
        E.markChoiceGroup(name, value, expected);
        E.setJudgeItemFeedback(taskId, item, ok ? "correct" : "wrong");
        var tag = E.getJudgeCard(taskId, item.id);
        tag = tag && tag.querySelector(".ege-judge__tag");
        if (tag) tag.hidden = ok;
        if (ok) correct += 1;
      });
      E.syncJudgeProgress(taskId);
    }

    if (task.type === "wordform") {
      if (!E.allWordformFilled(taskId)) {
        task.items.forEach(function (_item, index) {
          var inputEmpty = document.getElementById(prefix + "_wf_" + index);
          if (!inputEmpty) return;
          var empty = !E.normalize(inputEmpty.value);
          inputEmpty.classList.toggle("is-empty", empty);
          inputEmpty.classList.remove("is-correct", "is-wrong");
          var markEmpty = E.getWordformMark(taskId, index);
          if (markEmpty) markEmpty.classList.remove("is-correct", "is-wrong");
        });
        E.syncWordformCheckEnabled(taskId);
        return;
      }

      task.items.forEach(function (item, index) {
        var input = document.getElementById(prefix + "_wf_" + index);
        if (!input) return;
        var val = E.normalizeAnswer(input.value);
        var valid = E.buildAcceptedAnswers(item.answer, item.alt).map(E.normalizeAnswer);
        var ok = val && valid.indexOf(val) !== -1;
        input.classList.remove("is-empty");
        input.classList.toggle("is-correct", ok);
        input.classList.toggle("is-wrong", !!input.value && !ok);
        var mark = E.getWordformMark(taskId, index);
        if (mark) {
          mark.classList.toggle("is-correct", ok);
          mark.classList.toggle("is-wrong", !!input.value && !ok);
        }
        if (ok) {
          correct += 1;
          input.removeAttribute("title");
        } else {
          input.removeAttribute("title");
        }
      });
    }

    if (task.type === "listening") {
      var listeningStep = E.getListeningStep(taskId);
      var stepKind = E.getListeningStepKind(task, listeningStep);
      var gapMax = E.listeningGapMax(task);
      var revealed = E.consumeListeningReveal(taskId);

      if (stepKind === "prep-gap" || (stepKind === "prep" && !E.isPrepMatchingUnlocked(taskId))) {
        var prepCorrect = 0;
        var gapFillMax = 0;

        if (task.prep.gapFill && task.prep.gapFill.items) {
          var prepGapEl = document.querySelector("#task-" + taskId + " .ege-prep-gapfill");
          var prepGapLive = prepGapEl && prepGapEl.querySelector(".ege-prep-gapfill-live");

          task.prep.gapFill.items.forEach(function (item) {
            gapFillMax += 1;
            var prepSlot = document.getElementById(prefix + "_prep_gf_" + item.id);
            if (!prepSlot) return;
            var prepVal = E.prepGapSlotValue(prepSlot);
            var prepOk = E.normalize(prepVal) === E.normalize(item.answer);
            E.applyGapCheckClasses(prepSlot, prepOk, !!prepVal);
            if (prepOk) prepCorrect += 1;
            else if (prepVal) prepSlot.title = "Correct answer: " + item.answer;
          });

          if (prepGapLive) {
            prepGapLive.textContent = revealed
              ? ""
              : prepCorrect + " of " + gapFillMax + " gaps correct.";
          }

          if (prepCorrect === gapFillMax && gapFillMax > 0) {
            E.setPrepMatchingUnlocked(taskId, true);
            E.setPrepGapReviewMode(taskId, true);
            E.syncListeningPrepVisibility(taskId);
            E.syncListeningPrepFooterUI(taskId);
            E.syncListeningPrepGapInstructionUI(taskId);
            E.syncListeningProgressUI(taskId);
          }
          if (revealed) E.hideScoreFeedback(taskId);
          else E.showScoreFeedback(taskId, prepCorrect, gapFillMax);
        }
        return;
      }

      if (stepKind === "prep-match" || (stepKind === "prep" && E.isPrepMatchingUnlocked(taskId))) {
        var matchCorrect = 0;
        var matchMax = 0;
        var prepMatch = document.querySelector("#task-" + taskId + " .ege-prep-match");

        if (task.prep.matching && task.prep.matching.expressions) {
          var prepAnswers = task.prep.matching.answers || {};
          task.prep.matching.expressions.forEach(function (expr) {
            matchMax += 1;
            var prepName = prefix + "_prep_m_" + expr.id;
            var prepValue = E.getCheckedValue(prepName);
            var prepExpected = prepAnswers[String(expr.id)];
            var matchOk = prepValue === prepExpected;
            if (matchOk) matchCorrect += 1;
            E.markChoiceGroup(prepName, prepValue, prepExpected);

            if (prepMatch) {
              var exprCard = prepMatch.querySelector('[data-expr-id="' + expr.id + '"]');
              if (exprCard) {
                exprCard.classList.toggle("is-correct", !!matchOk);
                exprCard.classList.toggle("is-wrong", prepValue && !matchOk);
              }
            }
          });
        }

        if (revealed) E.hideScoreFeedback(taskId);
        else E.showScoreFeedback(taskId, matchCorrect, matchMax);
        if (matchCorrect === matchMax && matchMax > 0) {
          E.setPrepMatchPassed(taskId, true);
          E.syncListeningPrepFooterUI(taskId);
          E.syncListeningProgressUI(taskId);
        }
        return;
      }

      if (stepKind === "exam-match" && task.examMatch) {
        var emCorrect = 0;
        var emMax = (task.examMatch.speakers || []).length;
        var emAnswers = task.examMatch.answers || {};
        (task.examMatch.speakers || []).forEach(function (speaker) {
          var name = prefix + "_em_" + speaker;
          var val = E.getCheckedValue(name);
          var expected = String(emAnswers[speaker] || "");
          var ok = E.scoreShortAnswer(val, expected);
          E.markChoiceGroup(name, val, expected);
          var matchWrap = document.querySelector(
            "#task-" + taskId + " .ege-listening-exam-match"
          );
          if (matchWrap && typeof E.syncListeningExamMatchTable === "function") {
            E.syncListeningExamMatchTable(matchWrap);
          }
          if (ok) emCorrect += 1;
        });
        if (revealed) E.hideScoreFeedback(taskId);
        else E.showScoreFeedback(taskId, emCorrect, emMax);
        if (emCorrect === emMax && emMax > 0) {
          E.setListeningExamMatchPassed(taskId, true);
          E.syncListeningExamMatchFooterUI(taskId);
          E.syncListeningProgressUI(taskId);
        }
        return;
      }

      if (stepKind === "exam-tfn" && task.examTfn) {
        var etCorrect = 0;
        var etMax = (task.examTfn.statements || []).length;
        var etAnswers = task.examTfn.answers || {};
        (task.examTfn.statements || []).forEach(function (item) {
          var name = prefix + "_etfn_" + item.letter;
          var val = E.getCheckedValue(name);
          var expected = String(etAnswers[item.letter] || "");
          var ok = E.scoreShortAnswer(val, expected);
          if (ok) etCorrect += 1;
          E.markChoiceGroup(name, val, expected);
        });
        var tfnWrap = document.querySelector("#task-" + taskId + " .ege-listening-exam-tfn");
        if (tfnWrap && typeof E.syncListeningExamTfnRows === "function") {
          E.syncListeningExamTfnRows(tfnWrap);
        }
        if (revealed) E.hideScoreFeedback(taskId);
        else E.showScoreFeedback(taskId, etCorrect, etMax);
        if (etCorrect === etMax && etMax > 0) {
          E.setListeningExamTfnPassed(taskId, true);
          E.syncListeningExamTfnFooterUI(taskId);
          E.syncListeningProgressUI(taskId);
        }
        return;
      }

      E.getActiveListeningGaps(task).forEach(function (gap) {
        var input = document.getElementById(prefix + "_gap_" + gap.num);
        if (!input) return;
        var val = E.normalizeAnswer(input.value);
        var valid = E.buildAcceptedAnswers(gap.answer, gap.alt).map(E.normalizeAnswer);
        var ok = val && valid.indexOf(val) !== -1;
        E.applyGapCheckClasses(input, ok, !!input.value);
        E.markListeningGap(taskId, gap.num, ok, !!input.value);
        if (ok) correct += 1;
        else if (input.value) input.title = "Correct answer: " + gap.answer;
      });

      if (task.examMatch) {
        var emAnswersAll = task.examMatch.answers || {};
        (task.examMatch.speakers || []).forEach(function (speaker) {
          var val = E.getCheckedValue(prefix + "_em_" + speaker);
          if (E.scoreShortAnswer(val, String(emAnswersAll[speaker] || ""))) correct += 1;
        });
      }

      if (task.examTfn) {
        var etAnswersAll = task.examTfn.answers || {};
        (task.examTfn.statements || []).forEach(function (item) {
          var val = E.getCheckedValue(prefix + "_etfn_" + item.letter);
          if (E.scoreShortAnswer(val, String(etAnswersAll[item.letter] || ""))) correct += 1;
        });
      }

      if (stepKind === "mc") {
        (task.questions || []).forEach(function (question, index) {
          var name = prefix + "_q_" + index;
          var ok = E.gradeMcQuestion(name, String(question.correct));
          if (ok) correct += 1;
        });
      }

      E.state.scores[taskId] = correct;
      E.saveTaskScore(taskId, correct, max);
      E.setNavStatus(taskId, correct, max);
      if (revealed) E.hideScoreFeedback(taskId);
      else {
        E.showScoreFeedback(
          taskId,
          correct,
          stepKind === "listening" ? gapMax : stepKind === "mc" ? max : 0
        );
      }
      if (stepKind === "listening" && gapMax > 0 && correct === gapMax) {
        E.setListeningGapsPassed(taskId, true);
        E.syncListeningGapsFooterUI(taskId);
        E.syncListeningProgressUI(taskId);
      }
      if (stepKind === "mc") {
        var taskElMc = document.getElementById("task-" + taskId);
        if (taskElMc) taskElMc.dataset.hasAttempt = "1";
        if (max > 0 && correct === max) E.setListeningMcPassed(taskId, true);
        E.syncListeningMcFooterUI(taskId);
      }
      if (typeof E.syncExamPoints === "function") E.syncExamPoints();
      return;
    }

    E.state.scores[taskId] = correct;
    E.saveTaskScore(taskId, correct, max);
    E.setNavStatus(taskId, correct, max);
    if (task.type === "matching") {
      E.showScoreFeedback(taskId, correct, max, {
        lines: E.buildMatchingScoreLines(taskId, task, { revealKey: correct === max }),
      });
    } else if (task.type === "wordform") {
      E.showScoreFeedback(taskId, correct, max, {
        lines: E.buildWordformScoreLines(taskId, task, { revealKey: correct === max }),
      });
    } else if (E.SKILLS_TASK_TYPES.indexOf(task.type) !== -1) {
      // Every drill item already carries its own verdict and note, so a
      // per-item list under the score would say all of it twice.
      E.showScoreFeedback(taskId, correct, max);
      if (typeof E.flashMoodSticker === "function") {
        var moodTaskEl = document.getElementById("task-" + taskId);
        var moodScoreEl = document.getElementById("score-" + taskId);
        var prevCorrectRaw = moodTaskEl && moodTaskEl.dataset.prevCorrect;
        var prevCorrect = prevCorrectRaw != null ? parseInt(prevCorrectRaw, 10) : null;
        if (moodScoreEl && !moodScoreEl.hidden) {
          if (max > 0 && correct === max) {
            E.flashMoodSticker(moodScoreEl, "confetti");
          } else if (prevCorrect != null && correct > prevCorrect) {
            // At least one item that was wrong last check is right now.
            E.flashMoodSticker(moodScoreEl, "like");
          }
        }
        if (moodTaskEl) moodTaskEl.dataset.prevCorrect = String(correct);
      }
    } else {
      E.showScoreFeedback(taskId, correct, max);
    }
    E.syncCheckButton(taskId);
    E.syncShowAnswersButton(taskId);
    if (typeof E.syncExamPoints === "function") E.syncExamPoints();
  }

E.fillActiveCorrectAnswers = function fillActiveCorrectAnswers() {
    var taskId = E.state.activeTaskId;
    var task = E.findTask(taskId);
    if (!task) return;

    if (task.type === "listening") {
      var stepKind = E.getListeningStepKind(task, E.getListeningStep(taskId));
      var prefix = E.taskPrefix(taskId);

      if (stepKind === "prep-gap" || (stepKind === "prep" && !E.isPrepMatchingUnlocked(taskId))) {
        var prepGap = document.querySelector("#task-" + taskId + " .ege-prep-gapfill");
        if (prepGap && prepGap.fillCorrectAnswers) prepGap.fillCorrectAnswers();
        E.checkTask(taskId);
        return;
      }

      if (stepKind === "prep-match" || (stepKind === "prep" && E.isPrepMatchingUnlocked(taskId))) {
        var prepMatch = document.querySelector("#task-" + taskId + " .ege-prep-match");
        if (prepMatch && prepMatch.fillCorrectAnswers) prepMatch.fillCorrectAnswers();
        E.checkTask(taskId);
        return;
      }

      if (stepKind === "exam-match" && task.examMatch) {
        var emReveal = task.examMatch.answers || {};
        (task.examMatch.speakers || []).forEach(function (speaker) {
          E.setRadioValue(prefix + "_em_" + speaker, String(emReveal[speaker] || ""));
        });
        E.checkTask(taskId);
        return;
      }

      if (stepKind === "exam-tfn" && task.examTfn) {
        var etReveal = task.examTfn.answers || {};
        (task.examTfn.statements || []).forEach(function (item) {
          E.setRadioValue(prefix + "_etfn_" + item.letter, String(etReveal[item.letter] || ""));
        });
        E.checkTask(taskId);
        return;
      }

      E.getActiveListeningGaps(task).forEach(function (gap) {
        var input = document.getElementById(prefix + "_gap_" + gap.num);
        if (!input) return;
        input.value = gap.answer;
        E.clearGapCheckClasses(input);
        input.removeAttribute("title");
      });

      if (stepKind === "mc") {
        (task.questions || []).forEach(function (question, index) {
          E.setRadioValue(prefix + "_q_" + index, String(question.correct));
        });
      }

      E.checkTask(taskId);
      return;
    }

    E.revealTask(taskId);
  }

E.markListeningReveal = function markListeningReveal(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    if (taskEl) taskEl.dataset.revealedStep = "1";
  }

E.revealTask = function revealTask(taskId) {
    if (typeof E.hidesShowAnswers === "function" && E.hidesShowAnswers()) return;
    var task = E.findTask(taskId);
    if (!task) return;

    var prefix = E.taskPrefix(taskId);

    if (task.type === "gapfill") {
      var board = document.querySelector("#task-" + taskId + " .ege-gap-picks");

      task.gaps.forEach(function (gap) {
        var answer = String(task.answers[gap]);
        E.setRadioValue(prefix + "_gap_" + gap, answer);
        if (board && board.updateInsert) board.updateInsert(gap, answer);
        E.markGapInsert(taskId, gap, true, true);
        E.markChoiceGroup(prefix + "_gap_" + gap, answer, answer);
      });

      if (board) {
        if (board.syncUsedState) board.syncUsedState();
        if (board.syncNumberRow) board.syncNumberRow();
      }
      var gapEl = document.getElementById("task-" + taskId);
      if (gapEl) gapEl.dataset.answersRevealed = "1";
    } else if (task.type === "matching") {
      var matchBoard = document.querySelector("#task-" + taskId + " .ege-match-picks");
      task.texts.forEach(function (item) {
        var answer = String(task.answers[item.letter]);
        E.setRadioValue(prefix + "_" + item.letter, answer);
        E.markChoiceGroup(prefix + "_" + item.letter, answer, answer);
        var block = E.getMatchingTextBlock(taskId, item.letter);
        if (block) {
          block.classList.add("is-correct", "is-used");
          block.classList.remove("is-wrong", "is-empty");
        }
        var cell = E.getAnswerTrackCell(taskId, item.letter);
        if (cell) {
          cell.classList.add("is-correct", "is-filled");
          cell.classList.remove("is-wrong", "is-empty");
          var valEl = cell.querySelector(".ege-answer-track__val");
          if (valEl) valEl.textContent = answer;
        }
      });
      if (matchBoard && matchBoard.syncUsedState) matchBoard.syncUsedState();
      var matchEl = document.getElementById("task-" + taskId);
      if (matchEl) matchEl.dataset.answersRevealed = "1";
      E.showScoreFeedback(taskId, 0, E.taskMaxScore(task), {
        revealed: true,
        lines: E.buildMatchingScoreLines(taskId, task, { keyOnly: true }),
      });
      E.syncMatchingCheckEnabled(taskId);
      E.showToast("Answers shown.");
      return;
    } else if (task.type === "pairing") {
      var pairState = E.pairingState(taskId);
      pairState.pairs = {};
      (task.left || []).forEach(function (item) {
        pairState.pairs[item.id] = item.match;
      });
      pairState.left = "";
      pairState.right = "";
      E.syncPairingBoard(taskId);
      E.markPairing(taskId, true);
      var pairEl = document.getElementById("task-" + taskId);
      if (pairEl) pairEl.dataset.answersRevealed = "1";
      // Reveal fills the board in, so the panel only has to say it was
      // revealed rather than list the key a second time.
      E.showScoreFeedback(taskId, 0, E.taskMaxScore(task), { revealed: true });
      E.syncPairingCheckEnabled(taskId);
      E.showToast("Answers shown.");
      return;
    } else if (task.type === "deduction") {
      var dedState = E.deductionState(taskId);
      dedState.assign = {};
      (task.left || []).forEach(function (item) {
        dedState.assign[item.id] = item.match;
      });
      dedState.selectedChip = "";
      E.syncDeductionBoard(taskId);
      E.markDeduction(taskId, true);
      var dedEl = document.getElementById("task-" + taskId);
      if (dedEl) dedEl.dataset.answersRevealed = "1";
      // Reveal fills the board in, so the panel only has to say it was
      // revealed rather than list the key a second time.
      E.showScoreFeedback(taskId, 0, E.taskMaxScore(task), { revealed: true });
      E.syncDeductionCheckEnabled(taskId);
      E.showToast("Answers shown.");
      return;
    } else if (task.type === "ordering") {
      var orderState = E.orderingState(taskId);
      orderState.slots = {};
      (task.pool || []).forEach(function (item) {
        orderState.slots[item.slot] = item.id;
      });
      orderState.picked = "";
      E.syncOrderingBoard(taskId);
      E.markOrdering(taskId, true);
      var orderEl = document.getElementById("task-" + taskId);
      if (orderEl) orderEl.dataset.answersRevealed = "1";
      // Reveal fills the board in, so the panel only has to say it was
      // revealed rather than list the key a second time.
      E.showScoreFeedback(taskId, 0, E.taskMaxScore(task), { revealed: true });
      E.syncOrderingCheckEnabled(taskId);
      E.showToast("Answers shown.");
      return;
    } else if (task.type === "choice") {
      task.questions.forEach(function (question) {
        var name = E.choiceQuestionName(taskId, question.id);
        var expected = E.choiceExpectedValue(question);
        E.setRadioValue(name, expected);
        E.markChoiceGroupRevealed(name, expected);
        E.markChoiceQuestion(taskId, question, expected, true);
      });
      var choiceEl = document.getElementById("task-" + taskId);
      if (choiceEl) choiceEl.dataset.answersRevealed = "1";
      // Reveal fills the board in, so the panel only has to say it was
      // revealed rather than list the key a second time.
      E.showScoreFeedback(taskId, 0, E.taskMaxScore(task), { revealed: true });
      E.syncChoiceCheckEnabled(taskId);
      E.showToast("Answers shown.");
      return;
    } else if (task.type === "judge") {
      task.items.forEach(function (item) {
        var name = E.judgeItemName(taskId, item.id);
        var expected = E.judgeExpectedValue(item);
        E.setRadioValue(name, expected);
        E.markChoiceGroupRevealed(name, expected);
        E.setJudgeItemFeedback(taskId, item, "revealed");
      });
      var judgeEl = document.getElementById("task-" + taskId);
      if (judgeEl) judgeEl.dataset.answersRevealed = "1";
      // Reveal fills the board in, so the panel only has to say it was
      // revealed rather than list the key a second time.
      E.showScoreFeedback(taskId, 0, E.taskMaxScore(task), { revealed: true });
      E.syncJudgeCheckEnabled(taskId);
      E.showToast("Answers shown.");
      return;
    } else if (task.type === "wordform") {
      task.items.forEach(function (item, index) {
        var input = document.getElementById(prefix + "_wf_" + index);
        if (!input) return;
        input.value = item.answer;
        input.classList.remove("is-wrong", "is-empty");
        input.classList.add("is-correct", "is-filled");
        input.removeAttribute("title");
        E.setWordformMarkText(taskId, index, item.answer);
        var mark = E.getWordformMark(taskId, index);
        if (mark) {
          mark.classList.add("is-correct");
          mark.classList.remove("is-wrong");
        }
      });
      var wfEl = document.getElementById("task-" + taskId);
      if (wfEl) wfEl.dataset.answersRevealed = "1";
      E.showScoreFeedback(taskId, 0, E.taskMaxScore(task), {
        revealed: true,
        lines: E.buildWordformScoreLines(taskId, task, { keyOnly: true }),
      });
      E.syncWordformCheckEnabled(taskId);
      E.showToast("Answers shown.");
      return;
    } else if (task.type === "spider-web") {
      if (typeof E.revealSpiderWeb === "function") E.revealSpiderWeb(taskId);
      E.showToast("Answers shown.");
      return;
    } else if (task.type === "mc") {
      task.questions.forEach(function (question, index) {
        var name = prefix + "_q_" + index;
        var correctVal = String(question.correct);
        E.setRadioValue(name, correctVal);
        E.markChoiceGroup(name, correctVal, correctVal);
      });
      if (E.isVocabCloze(task)) {
        var vocabBoard = document.querySelector("#task-" + taskId + " .ege-vocab-picks");
        if (vocabBoard && vocabBoard.syncInserts) vocabBoard.syncInserts();
      }
      var taskEl = document.getElementById("task-" + taskId);
      if (taskEl) taskEl.dataset.answersRevealed = "1";
    } else if (task.type === "listening") {
      var stepKind = E.getListeningStepKind(task, E.getListeningStep(taskId));

      if (
        stepKind === "prep-gap" ||
        (stepKind === "prep" && !E.isPrepMatchingUnlocked(taskId))
      ) {
        var prepGap = document.querySelector("#task-" + taskId + " .ege-prep-gapfill");
        E.markListeningReveal(taskId);
        if (prepGap && prepGap.fillCorrectAnswers) prepGap.fillCorrectAnswers();
        E.checkTask(taskId);
        E.showToast("Answers shown.");
        return;
      }

      if (
        stepKind === "prep-match" ||
        (stepKind === "prep" && E.isPrepMatchingUnlocked(taskId))
      ) {
        var prepMatch = document.querySelector("#task-" + taskId + " .ege-prep-match");
        E.markListeningReveal(taskId);
        if (prepMatch && prepMatch.fillCorrectAnswers) prepMatch.fillCorrectAnswers();
        E.checkTask(taskId);
        E.showToast("Answers shown.");
        return;
      }

      if (stepKind === "listening") {
        E.getActiveListeningGaps(task).forEach(function (gap) {
          var input = document.getElementById(prefix + "_gap_" + gap.num);
          if (!input) return;
          input.value = gap.answer;
          input.classList.add("is-filled");
          E.clearGapCheckClasses(input);
          input.removeAttribute("title");
          E.setListeningMarkText(taskId, gap.num, gap.answer);
          E.markListeningGap(taskId, gap.num, true, true);
        });
        E.markListeningReveal(taskId);
        E.checkTask(taskId);
        E.showToast("Answers shown.");
        return;
      }

      if (stepKind === "mc") {
        (task.questions || []).forEach(function (question, index) {
          var name = prefix + "_q_" + index;
          var correctVal = String(question.correct);
          E.setRadioValue(name, correctVal);
          E.markChoiceGroup(name, correctVal, correctVal);
        });
        var taskElMc = document.getElementById("task-" + taskId);
        if (taskElMc) taskElMc.dataset.answersRevealed = "1";
        E.markListeningReveal(taskId);
        E.checkTask(taskId);
        E.showToast("Answers shown.");
        return;
      }
    } else {
      return;
    }

    E.hideScoreFeedback(taskId);
    E.updateAnsweredCount(taskId);
    E.showToast("Answers shown.");
  }

E.resetTask = function resetTask(taskId, options) {
    options = options || {};
    if (
      !options.force &&
      typeof E.hidesPracticeControls === "function" &&
      E.hidesPracticeControls()
    ) {
      return;
    }
    var task = E.findTask(taskId);
    if (!task) return;

    var prefix = E.taskPrefix(taskId);

    if (task.type === "matching") {
      var board = document.querySelector("#task-" + taskId + " .ege-match-picks");
      task.texts.forEach(function (item) {
        E.clearChoiceGroup(prefix + "_" + item.letter);
        var block = E.getMatchingTextBlock(taskId, item.letter);
        if (block) block.classList.remove("is-correct", "is-wrong", "is-used", "is-empty");
        var cell = E.getAnswerTrackCell(taskId, item.letter);
        if (cell) {
          cell.classList.remove("is-correct", "is-wrong", "is-used", "is-empty", "is-filled", "is-active");
          var valEl = cell.querySelector(".ege-answer-track__val");
          if (valEl) valEl.textContent = "";
        }
      });
      if (board) {
        if (board.syncUsedState) board.syncUsedState();
        if (board.setActiveLetter) board.setActiveLetter("");
      }
      var matchResetEl = document.getElementById("task-" + taskId);
      if (matchResetEl) delete matchResetEl.dataset.answersRevealed;
      E.syncMatchingCheckEnabled(taskId);
    }

    if (task.type === "gapfill") {
      var board = document.querySelector("#task-" + taskId + " .ege-gap-picks");
      task.gaps.forEach(function (gap) {
        E.clearChoiceGroup(prefix + "_gap_" + gap);
        var insert = document.querySelector(
          "#task-" + taskId + ' .ege-gap-insert[data-gap="' + gap + '"]'
        );
        if (insert) {
          insert.classList.remove("is-correct", "is-wrong", "is-filled", "is-active");
          var textSpan = insert.querySelector(".ege-gap-insert__text");
          if (textSpan) textSpan.textContent = "";
        }
        var cell = E.getAnswerTrackCell(taskId, gap);
        if (cell) {
          cell.classList.remove("is-correct", "is-wrong", "is-filled", "is-active");
          var valEl = cell.querySelector(".ege-answer-track__val");
          if (valEl) valEl.textContent = "";
        }
      });
      if (board) {
        if (board.syncUsedState) board.syncUsedState();
        if (board.setActiveGap) board.setActiveGap("");
        if (board.syncNumberRow) board.syncNumberRow();
      }
      var gapResetEl = document.getElementById("task-" + taskId);
      if (gapResetEl) {
        delete gapResetEl.dataset.answersRevealed;
        gapResetEl.querySelectorAll(".ege-ref__list li.is-selected").forEach(function (li) {
          li.classList.remove("is-selected");
        });
      }
      E.syncCheckButton(taskId);
    }

    if (task.type === "mc" && E.isVocabCloze(task)) {
      var vocabBoard = document.querySelector("#task-" + taskId + " .ege-vocab-picks");
      var vocabResetEl = document.getElementById("task-" + taskId);
      if (vocabResetEl) delete vocabResetEl.dataset.answersRevealed;
      task.questions.forEach(function (question, index) {
        E.clearChoiceGroup(prefix + "_q_" + index);
        var gapNum = E.vocabGapNum(question);
        var insert = document.querySelector(
          "#task-" + taskId + ' .ege-gap-insert[data-gap="' + gapNum + '"]'
        );
        if (insert) {
          insert.classList.remove("is-correct", "is-wrong", "is-filled", "is-active");
          var textSpan = insert.querySelector(".ege-gap-insert__text");
          if (textSpan) textSpan.textContent = "";
        }
      });
      if (vocabBoard) {
        if (vocabBoard.setActiveGap) vocabBoard.setActiveGap("");
        if (vocabBoard.syncInserts) vocabBoard.syncInserts();
      }
      E.syncCheckButton(taskId);
    } else if (task.type === "mc") {
      var taskEl = document.getElementById("task-" + taskId);
      if (taskEl) {
        delete taskEl.dataset.answersRevealed;
        delete taskEl.dataset.hasAttempt;
        taskEl.querySelectorAll(".ege-mc-card.is-active").forEach(function (card) {
          card.classList.remove("is-active");
        });
        taskEl.querySelectorAll(".ege-pill.is-selected").forEach(function (pill) {
          pill.classList.remove("is-selected");
        });
      }
      task.questions.forEach(function (_question, index) {
        E.clearChoiceGroup(prefix + "_q_" + index);
      });
      E.updateAnsweredCount(taskId);
    }

    if (task.type === "pairing") {
      var pairResetEl = document.getElementById("task-" + taskId);
      if (pairResetEl) delete pairResetEl.dataset.answersRevealed;
      if (pairResetEl) delete pairResetEl.dataset.prevCorrect;
      E.resetPairingState(taskId);
      E.clearPairingFeedback(taskId);
      E.syncPairingCheckEnabled(taskId);
    }

    if (task.type === "deduction") {
      var dedResetEl = document.getElementById("task-" + taskId);
      if (dedResetEl) delete dedResetEl.dataset.answersRevealed;
      if (dedResetEl) delete dedResetEl.dataset.prevCorrect;
      E.resetDeductionState(taskId);
      E.clearDeductionFeedback(taskId);
      E.syncDeductionCheckEnabled(taskId);
    }

    if (task.type === "ordering") {
      var orderResetEl = document.getElementById("task-" + taskId);
      if (orderResetEl) delete orderResetEl.dataset.answersRevealed;
      if (orderResetEl) delete orderResetEl.dataset.prevCorrect;
      E.resetOrderingState(taskId);
      E.clearOrderingFeedback(taskId);
      E.syncOrderingCheckEnabled(taskId);
    }

    if (task.type === "choice") {
      var choiceResetEl = document.getElementById("task-" + taskId);
      if (choiceResetEl) delete choiceResetEl.dataset.answersRevealed;
      if (choiceResetEl) delete choiceResetEl.dataset.prevCorrect;
      task.questions.forEach(function (question) {
        E.clearChoiceGroup(E.choiceQuestionName(taskId, question.id));
        E.clearChoiceQuestion(taskId, question.id);
      });
      E.syncChoiceCheckEnabled(taskId);
    }

    if (task.type === "judge") {
      var judgeResetEl = document.getElementById("task-" + taskId);
      if (judgeResetEl) delete judgeResetEl.dataset.answersRevealed;
      if (judgeResetEl) delete judgeResetEl.dataset.prevCorrect;
      task.items.forEach(function (item) {
        E.clearChoiceGroup(E.judgeItemName(taskId, item.id));
        E.clearJudgeItemFeedback(taskId, item.id);
        var card = E.getJudgeCard(taskId, item.id);
        var tag = card && card.querySelector(".ege-judge__tag");
        if (tag) tag.hidden = true;
      });
      E.syncJudgeCheckEnabled(taskId);
    }

    if (task.type === "spider-web") {
      if (typeof E.resetSpiderWeb === "function") E.resetSpiderWeb(taskId);
    }

    if (task.type === "wordform") {
      var wfResetEl = document.getElementById("task-" + taskId);
      if (wfResetEl) delete wfResetEl.dataset.answersRevealed;
      task.items.forEach(function (item, index) {
        var input = document.getElementById(prefix + "_wf_" + index);
        if (!input) return;
        input.value = "";
        input.classList.remove("is-correct", "is-wrong", "is-empty", "is-filled");
        input.removeAttribute("title");
        E.clearWordformMark(taskId, index, item.word);
      });
      E.syncWordformCheckEnabled(taskId);
    }

    if (task.type === "listening") {
      var audio = document.getElementById(prefix + "_audio");
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }

      if (task.prep) {
        if (task.prep.gapFill && task.prep.gapFill.items) {
          var prepGap = document.querySelector("#task-" + taskId + " .ege-prep-gapfill");
          if (prepGap && prepGap.resetPrepGapFill) {
            prepGap.resetPrepGapFill();
          } else {
            task.prep.gapFill.items.forEach(function (item) {
              var prepSlot = document.getElementById(prefix + "_prep_gf_" + item.id);
              if (prepSlot) {
                E.setPrepGapSlotValue(prepSlot, "");
                E.clearGapCheckClasses(prepSlot);
                prepSlot.classList.remove("is-filled");
                prepSlot.removeAttribute("title");
              }
            });
          }
        }

        if (task.prep.matching && task.prep.matching.expressions) {
          var prepMatchEl = document.querySelector("#task-" + taskId + " .ege-prep-match");
          if (prepMatchEl && prepMatchEl.resetPrepMatch) {
            prepMatchEl.resetPrepMatch();
          } else {
            task.prep.matching.expressions.forEach(function (expr) {
              E.clearChoiceGroup(prefix + "_prep_m_" + expr.id);
            });
          }
        }

        E.setPrepMatchingUnlocked(taskId, false);
        E.setPrepMatchPassed(taskId, false);
        E.setPrepGapReviewMode(taskId, false);
        E.syncListeningPrepVisibility(taskId);
        E.syncListeningPrepFooterUI(taskId);
        E.syncListeningPrepGapInstructionUI(taskId);
      }

      E.getActiveListeningGaps(task).forEach(function (gap) {
        var input = document.getElementById(prefix + "_gap_" + gap.num);
        if (input) {
          input.value = "";
          input.classList.remove("is-filled");
          E.clearGapCheckClasses(input);
          input.removeAttribute("title");
        }
        E.clearListeningMark(taskId, gap.num);
      });
      (task.questions || []).forEach(function (_question, index) {
        E.clearChoiceGroup(prefix + "_q_" + index);
      });
      var listeningMcRoot = document.querySelector(
        "#task-" + taskId + " .ege-listening-exam-mc, #task-" + taskId + " .ege-panel--listening-mc, #task-" + taskId + " .ege-mc-stack"
      );
      if (listeningMcRoot) {
        listeningMcRoot.querySelectorAll(".is-selected, .is-active, .is-answered, .is-filled").forEach(function (el) {
          el.classList.remove("is-selected", "is-active", "is-answered", "is-filled");
        });
        listeningMcRoot.querySelectorAll(".ege-answer-track__val").forEach(function (valEl) {
          valEl.textContent = "";
        });
        if (typeof listeningMcRoot.setActiveLetter === "function") listeningMcRoot.setActiveLetter("");
        if (typeof E.syncListeningExamMcRows === "function") {
          var examMcWrap = document.querySelector("#task-" + taskId + " .ege-listening-exam-mc");
          if (examMcWrap) E.syncListeningExamMcRows(examMcWrap);
        } else if (typeof listeningMcRoot.syncListeningExamMc === "function") {
          listeningMcRoot.syncListeningExamMc();
        }
      }
      if (task.examMatch) {
        (task.examMatch.speakers || []).forEach(function (speaker) {
          E.clearChoiceGroup(prefix + "_em_" + speaker);
        });
        var matchWrap = document.querySelector("#task-" + taskId + " .ege-listening-exam-match");
        if (matchWrap) {
          if (typeof matchWrap.setActiveLetter === "function") matchWrap.setActiveLetter("");
          if (typeof E.syncListeningExamMatchTable === "function") {
            E.syncListeningExamMatchTable(matchWrap);
          }
        }
      }
      if (task.examTfn) {
        (task.examTfn.statements || []).forEach(function (item) {
          E.clearChoiceGroup(prefix + "_etfn_" + item.letter);
        });
        var tfnWrapReset = document.querySelector("#task-" + taskId + " .ege-listening-exam-tfn");
        if (tfnWrapReset) {
          if (typeof tfnWrapReset.setActiveLetter === "function") tfnWrapReset.setActiveLetter("");
          if (typeof E.syncListeningExamTfnRows === "function") {
            E.syncListeningExamTfnRows(tfnWrapReset);
          }
        }
      }
      E.setListeningGapsPassed(taskId, false);
      E.setListeningMcPassed(taskId, false);
      E.setListeningExamMatchPassed(taskId, false);
      E.setListeningExamTfnPassed(taskId, false);
      var taskElReset = document.getElementById("task-" + taskId);
      if (taskElReset) {
        delete taskElReset.dataset.hasAttempt;
        delete taskElReset.dataset.revealedStep;
      }
      E.setListeningStep(taskId, 1);
      E.syncListeningStepUI(taskId);
    }

    E.state.scores[taskId] = 0;
    E.clearTaskScore(taskId);
    E.setNavStatus(taskId, 0, E.taskMaxScore(task));
    E.hideScoreFeedback(taskId);

    if (E.isSpeakingPractice(task)) {
      E.resetSpeakingTimers(taskId);
    }

    E.syncResetButton(taskId);
    if (typeof E.syncExamPoints === "function") E.syncExamPoints();
  }
