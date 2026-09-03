import { E } from "./runtime.js";

E.getListeningGaps = function getListeningGaps(task) {
    return task && task.type === "listening" ? task.gaps || [] : [];
  }

E.buildListeningRun = function buildListeningRun(selectedSourceGaps) {
    return (selectedSourceGaps || []).map(function (gap, index) {
      return {
        num: index + 1,
        sourceNum: gap.num,
        answer: gap.answer,
        alt: gap.alt || [],
      };
    });
  }

E.computeRunStats = function computeRunStats(items) {
    if (!items.length) return { adjacentPairs: 0, maxRun: 0 };
    var adjacentPairs = 0;
    var run = 1;
    var maxRun = 1;
    for (var i = 1; i < items.length; i += 1) {
      if (items[i].num - items[i - 1].num === 1) {
        adjacentPairs += 1;
        run += 1;
        if (run > maxRun) maxRun = run;
      } else {
        run = 1;
      }
    }
    return { adjacentPairs: adjacentPairs, maxRun: maxRun };
  }

E.chooseListeningGaps = function chooseListeningGaps(task) {
    var all = E.getListeningGaps(task).slice().sort(function (a, b) {
      return a.num - b.num;
    });
    var target = Math.min(E.LISTENING_TARGET_GAPS, all.length);
    if (target === all.length) return all;

    var best = null;
    var bestScore = Infinity;

    for (var attempt = 0; attempt < 260; attempt += 1) {
      var shuffled = all.slice();
      for (var i = shuffled.length - 1; i > 0; i -= 1) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }
      var sample = shuffled.slice(0, target).sort(function (a, b) {
        return a.num - b.num;
      });
      var stats = E.computeRunStats(sample);
      var score = stats.adjacentPairs * 100 + stats.maxRun * 10;
      if (score < bestScore) {
        bestScore = score;
        best = sample;
        if (score === 0) break;
      }
    }

    return best || all.slice(0, target);
  }

E.getActiveListeningGaps = function getActiveListeningGaps(task) {
    var allSource = E.getListeningGaps(task);
    if (!allSource.length) return [];

    var selectedSource = E.state.listeningSelections[task.id];
    if (!selectedSource || !selectedSource.length) {
      selectedSource = E.chooseListeningGaps(task);
      E.state.listeningSelections[task.id] = selectedSource;
    }

    var run = E.state.listeningRuns[task.id];
    if (!run || !run.length) {
      run = E.buildListeningRun(selectedSource);
      E.state.listeningRuns[task.id] = run;
    }
    return run;
  }

E.getListeningStep = function getListeningStep(taskId) {
    return E.state.listeningSteps[taskId] || 1;
  }

E.taskHasSplitPrep = function taskHasSplitPrep(task) {
    if (!task || !task.prep) return false;
    var gapItems = task.prep.gapFill && task.prep.gapFill.items;
    var matchItems = task.prep.matching && task.prep.matching.expressions;
    return !!(gapItems && gapItems.length && matchItems && matchItems.length);
  }

E.taskHasExamListening = function taskHasExamListening(task) {
    return !!(
      task &&
      task.type === "listening" &&
      (task.examMatch || task.examTfn || task.examMc)
    );
  }

E.taskUsesExamSinglePage = function taskUsesExamSinglePage(task) {
    return !!(task && task.examSinglePage && E.taskHasExamListening(task));
  }

E.showsListeningTranscript = function showsListeningTranscript() {
    return !(typeof E.isPlacementExam === "function" && E.isPlacementExam());
  }

E.listeningHasStageNav = function listeningHasStageNav(task) {
    if (E.taskUsesExamSinglePage(task)) return false;
    return E.listeningStagePlan(task).length > 1;
  }

E.listeningStagePlan = function listeningStagePlan(task) {
    if (!task || task.type !== "listening") return [];
    if (task.examMc) return ["mc"];
    if (E.taskHasSplitPrep(task)) {
      var split = ["prep-gap", "prep-match", "listening"];
      if (E.listeningMcMax(task) > 0) split.push("mc");
      return split;
    }
    if (E.taskHasExamListening(task)) {
      var exam = [];
      if (task.examMatch) exam.push("exam-match");
      if (task.examTfn) exam.push("exam-tfn");
      if (E.listeningMcMax(task) > 0) exam.push("mc");
      return exam;
    }
    if (task.prep) {
      var prep = ["prep", "listening"];
      if (E.listeningMcMax(task) > 0) prep.push("mc");
      return prep;
    }
    var basic = ["listening"];
    if (E.listeningMcMax(task) > 0) basic.push("mc");
    return basic;
  }

E.getListeningStepKind = function getListeningStepKind(task, step) {
    if (!task) return null;
    var plan = E.listeningStagePlan(task);
    return plan[step - 1] || null;
  }

E.isListeningExamMatchComplete = function isListeningExamMatchComplete(taskId) {
    var task = E.findTask(taskId);
    if (!task || !task.examMatch) return true;
    var prefix = E.taskPrefix(taskId);
    return (task.examMatch.speakers || []).every(function (speaker) {
      return !!E.getListeningExamMatchValue(prefix, speaker);
    });
  }

E.isListeningExamTfnComplete = function isListeningExamTfnComplete(taskId) {
    var task = E.findTask(taskId);
    if (!task || !task.examTfn) return true;
    var prefix = E.taskPrefix(taskId);
    return (task.examTfn.statements || []).every(function (item) {
      return !!E.getCheckedValue(prefix + "_etfn_" + item.letter);
    });
  }

E.isListeningExamMatchPassed = function isListeningExamMatchPassed(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    return !!(taskEl && taskEl.dataset.examMatchPassed === "1");
  }

E.setListeningExamMatchPassed = function setListeningExamMatchPassed(taskId, passed) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;
    if (passed) taskEl.dataset.examMatchPassed = "1";
    else delete taskEl.dataset.examMatchPassed;
  }

E.isListeningExamTfnPassed = function isListeningExamTfnPassed(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    return !!(taskEl && taskEl.dataset.examTfnPassed === "1");
  }

E.setListeningExamTfnPassed = function setListeningExamTfnPassed(taskId, passed) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;
    if (passed) taskEl.dataset.examTfnPassed = "1";
    else delete taskEl.dataset.examTfnPassed;
  }

E.isPrepMatchingComplete = function isPrepMatchingComplete(taskId) {
    var task = E.findTask(taskId);
    if (!task || !task.prep || !task.prep.matching || !task.prep.matching.expressions) return true;
    if (!E.isPrepMatchingUnlocked(taskId)) return false;
    var prefix = E.taskPrefix(taskId);
    var expressions = task.prep.matching.expressions;
    for (var i = 0; i < expressions.length; i += 1) {
      if (!E.getCheckedValue(prefix + "_prep_m_" + expressions[i].id)) return false;
    }
    return true;
  }

E.isListeningStepComplete = function isListeningStepComplete(taskId, step) {
    var task = E.findTask(taskId);
    if (!task || task.type !== "listening") return false;
    var prefix = E.taskPrefix(taskId);
    var kind = E.getListeningStepKind(task, step);

    if (kind === "prep-gap") return E.isPrepMatchingUnlocked(taskId);
    if (kind === "prep-match") return E.isPrepMatchPassed(taskId);
    if (kind === "prep") return E.isListeningPrepComplete(taskId);

    if (kind === "listening") {
      if (!E.getActiveListeningGaps(task).length) return true;
      return E.isListeningGapsPassed(taskId);
    }

    if (kind === "exam-match") return E.isListeningExamMatchPassed(taskId);
    if (kind === "exam-tfn") return E.isListeningExamTfnPassed(taskId);

    if (kind === "mc") {
      return (task.questions || []).every(function (_question, index) {
        return !!E.getCheckedValue(prefix + "_q_" + index);
      });
    }

    return false;
  }

E.canGoToListeningStep = function canGoToListeningStep(taskId, targetStep) {
    var current = E.getListeningStep(taskId);
    if (targetStep === current) return true;
    if (targetStep < current) return true;
    for (var step = 1; step < targetStep; step += 1) {
      if (!E.isListeningStepComplete(taskId, step)) return false;
    }
    return true;
  }

E.setListeningStep = function setListeningStep(taskId, step) {
    if (!E.canGoToListeningStep(taskId, step)) return;
    E.state.listeningSteps[taskId] = step;
    E.syncListeningStepUI(taskId);
    if (E.state.activeTaskId === taskId) {
      E.syncListeningInstructions(taskId);
    }
  }

E.listeningGapMax = function listeningGapMax(task) {
    return E.getActiveListeningGaps(task).length;
  }

E.listeningMcMax = function listeningMcMax(task) {
    return task.questions ? task.questions.length : 0;
  }

E.listeningStepInstructions = function listeningStepInstructions(task, step) {
    var kind = E.getListeningStepKind(task, step);
    if (kind === "exam-match" && task.examMatch) {
      return task.examMatch.instructions || "";
    }
    if (kind === "exam-tfn" && task.examTfn) {
      return task.examTfn.instructions || "";
    }
    if (kind === "mc") {
      return (
        "Вы услышите интервью. В заданиях 3–9 запишите в поле ответа цифру 1, 2 или 3, " +
        "соответствующую выбранному Вами варианту ответа. Вы услышите запись дважды."
      );
    }
    if (kind === "listening") {
      return "Вы услышите запись дважды. Заполните пропуски в тексте словами, которые вы услышите.";
    }
    return "";
  }

E.syncListeningProgressUI = function syncListeningProgressUI(taskId) {
    var progress = document.getElementById("listening-progress-" + taskId);
    if (!progress) return;

    var step = E.getListeningStep(taskId);

    progress.querySelectorAll(".ege-listening-progress__step").forEach(function (btn) {
      var num = parseInt(btn.dataset.step, 10);
      btn.classList.toggle("is-current", num === step);
      btn.classList.toggle("is-complete", E.isListeningStepComplete(taskId, num));
      btn.disabled = !E.canGoToListeningStep(taskId, num);
    });

    progress.querySelectorAll(".ege-listening-progress__line").forEach(function (line, index) {
      line.classList.toggle("is-complete", E.isListeningStepComplete(taskId, index + 1));
    });

    E.syncListeningPrepVisibility(taskId);
  }

E.syncListeningInstructions = function syncListeningInstructions(taskId) {
    var task = E.findTask(taskId);
    var instructions = document.getElementById("egeInstructions");
    if (!task || task.type !== "listening" || !instructions) return;

    var text = E.listeningStepInstructions(task, E.getListeningStep(taskId));
    if (!text) {
      instructions.hidden = true;
      instructions.textContent = "";
      return;
    }

    instructions.hidden = false;
    instructions.textContent = text;
  }

E.syncListeningStepUI = function syncListeningStepUI(taskId) {
    var task = E.findTask(taskId);
    if (!task || task.type !== "listening") return;

    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;

    if (typeof E.syncListeningNotesToggle === "function") E.syncListeningNotesToggle(taskId);

    if (E.taskUsesExamSinglePage(task)) {
      var examPageStep = taskEl.querySelector(".ege-listening-step--exam-page");
      if (examPageStep) examPageStep.hidden = false;
      taskEl.dataset.listeningStep = "1";
      taskEl.dataset.listeningKind = "exam-page";
      E.syncListeningExamSinglePageFooterUI(taskId);
      return;
    }

    var step = E.getListeningStep(taskId);
    var kind = E.getListeningStepKind(task, step);
    E.hideScoreFeedback(taskId);
    var prepStep = taskEl.querySelector(".ege-listening-step--prep");
    var examMatchStep = taskEl.querySelector(".ege-listening-step--exam-match");
    var examTfnStep = taskEl.querySelector(".ege-listening-step--exam-tfn");
    var gapsStep = taskEl.querySelector(".ege-listening-step--gaps");
    var mcStep = taskEl.querySelector(".ege-listening-step--mc");
    if (prepStep) {
      prepStep.hidden = kind !== "prep-gap" && kind !== "prep-match" && kind !== "prep";
    }
    if (examMatchStep) examMatchStep.hidden = kind !== "exam-match";
    if (examTfnStep) examTfnStep.hidden = kind !== "exam-tfn";
    if (gapsStep) gapsStep.hidden = kind !== "listening";
    if (mcStep) mcStep.hidden = kind !== "mc";

    taskEl.dataset.listeningStep = String(step);
    if (kind) taskEl.dataset.listeningKind = kind;
    else delete taskEl.dataset.listeningKind;
    E.syncListeningProgressUI(taskId);
    E.syncListeningPrepVisibility(taskId);

    var panel = document.getElementById("panel-" + taskId);
    if (panel && window.EgeHighlight) {
      var hlTask = E.findTask(taskId);
      EgeHighlight.attachAll(
        panel,
        E.scoreStoreTopicId(hlTask),
        E.scoreStoreTaskId(hlTask, taskId)
      );
    }

    var checkBtn = document.getElementById("check-" + taskId);

    if (kind === "prep-gap" || kind === "prep-match" || kind === "prep") {
      E.syncListeningPrepFooterUI(taskId);
      if (kind === "prep-gap" && E.isPrepMatchingUnlocked(taskId)) {
        var gapWrap = taskEl.querySelector(".ege-prep-gapfill");
        if (gapWrap && !gapWrap.classList.contains("is-review")) {
          E.setPrepGapReviewMode(taskId, true);
        }
      }
    } else {
      var prepFillEl = document.getElementById("prep-fill-" + taskId);
      if (prepFillEl) prepFillEl.hidden = true;
      if (kind === "listening") {
        E.hideListeningFinishButtons(taskId);
        E.syncListeningGapsFooterUI(taskId);
      } else if (kind === "exam-match") {
        E.hidePrepNextButton(taskId);
        E.syncListeningExamMatchFooterUI(taskId);
      } else if (kind === "exam-tfn") {
        E.hidePrepNextButton(taskId);
        E.syncListeningExamTfnFooterUI(taskId);
      } else if (kind === "mc") {
        E.hidePrepNextButton(taskId);
        E.syncListeningMcFooterUI(taskId);
      } else {
        E.hideListeningFinishButtons(taskId);
        if (checkBtn) checkBtn.hidden = false;
        E.syncResetButton(taskId);
        E.hidePrepNextButton(taskId);
      }
    }
    if (kind === "prep-gap" || kind === "prep-match" || kind === "prep") {
      E.hideListeningFinishButtons(taskId);
    }
    E.syncListeningPrepGapInstructionUI(taskId);
    if (E.isListeningMode() && E.state.activeTaskId === taskId) {
      E.scheduleListeningNavAlign(taskId);
    }
  }

E.cleanListeningTranscript = function cleanListeningTranscript(text) {
    var lines = String(text || "").split(/\r?\n/);
    var out = [];
    var inSecondPlay = false;

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      if (/^\d{2}:\d{2}$/.test(line)) return;
      if (/transcribed by/i.test(line)) return;
      if (/uniscribe|turboscribe/i.test(line)) return;
      if (/you will hear the (text|recording) again/i.test(line)) {
        inSecondPlay = true;
        return;
      }
      if (/this is the end of the (task|listening)/i.test(line)) {
        inSecondPlay = true;
        return;
      }
      if (
        /you have \d+ seconds/i.test(line) &&
        /complete the task|check your answers|familiarize|ознакомиться/i.test(line) &&
        out.length > 4
      ) {
        inSecondPlay = true;
        return;
      }
      if (/^task 3-9/i.test(line)) return;
      if (/^задание 3-9/i.test(line)) return;
      if (
        /write (down|in) the (number|digit|answer)|соответствующую выбранному/i.test(line) &&
        line.length < 160
      ) {
        return;
      }
      if (/^now,? we are ready to start\.?$/i.test(line)) return;
      line = line.replace(/^(@(?:narrator|host|guest)\|)\s*now,? we are ready to start\.?\s*/i, "$1");
      line = line.replace(/^now,? we are ready to start\.?\s*/i, "");
      if (!line || /^@(?:narrator|host|guest)\|\s*$/i.test(line)) return;
      if (inSecondPlay) return;
      out.push(line);
    });

    return out.join("\n\n");
  }

E.loadTaskTranscripts = function loadTaskTranscripts(topic) {
    var jobs = topic.tasks.map(function (task) {
      if (task.transcript || !task.transcriptFile) return Promise.resolve();
      return fetch(encodeURI(task.transcriptFile))
        .then(function (res) {
          if (!res.ok) throw new Error("Transcript not found");
          return res.text();
        })
        .then(function (text) {
          task.transcript = E.cleanListeningTranscript(text);
        })
        .catch(function () {
          task.transcript = "";
        });
    });
    return Promise.all(jobs);
  }

E.listeningGuestLabel = function listeningGuestLabel(task) {
    if (task.guest) return String(task.guest).split(/\s+/)[0];
    var match = task.title && task.title.match(/—\s*(.+)$/);
    return match ? match[1].trim().split(/\s+/)[0] : "Guest";
  }

E.applyListeningGaps = function applyListeningGaps(html, allGaps, activeGaps) {
    var out = html || "";
    var selected = {};
    (activeGaps || []).forEach(function (gap) {
      selected[String(gap.sourceNum)] = gap;
    });

    (allGaps || []).forEach(function (gap) {
      var num = String(gap.num);
      if (selected[num]) {
        var slot = selected[num];
        out = out.split("[" + num + "]").join(
          '<button type="button" class="ege-listening-mark" data-gap="' +
            String(slot.num) +
            '" aria-label="Go to gap ' +
            String(slot.num) +
            '">' +
            String(slot.num) +
            "</button>"
        );
      } else {
        out = out.split("[" + num + "]").join(gap.answer || "");
      }
    });
    return out;
  }

E.parseDialogueTranscript = function parseDialogueTranscript(text) {
    if (!/@(?:narrator|host|guest)\|/i.test(text)) return null;
    return text.split(/\r?\n/).map(function (line) {
      var match = line.match(/^@(narrator|host|guest)\|([\s\S]+)$/i);
      if (!match) return null;
      return { role: match[1].toLowerCase(), text: match[2].trim() };
    }).filter(Boolean);
  }

E.mergeDialogueTurns = function mergeDialogueTurns(turns) {
    if (!turns || !turns.length) return [];
    var merged = [];

    turns.forEach(function (turn) {
      var role = turn.role === "narrator" ? "host" : turn.role;
      var prev = merged[merged.length - 1];
      if (prev && prev.role === role) {
        prev.text = prev.text + " " + turn.text;
      } else {
        merged.push({ role: role, text: turn.text });
      }
    });

    return merged;
  }

E.dialogueSpeakerLabel = function dialogueSpeakerLabel(role, task) {
    if (role === "guest") return E.listeningGuestLabel(task);
    return "Interviewer";
  }

E.renderDialogueTurn = function renderDialogueTurn(turn, task, allGaps, activeGaps) {
    var block = document.createElement("div");
    var role = turn.role === "narrator" ? "host" : turn.role;
    block.className = "ege-dialogue__turn ege-dialogue__turn--" + role;

    var body = document.createElement("p");
    body.className = "ege-dialogue__text";
    body.innerHTML = E.applyListeningGaps(turn.text, allGaps, activeGaps);

    block.appendChild(body);
    return block;
  }

E.markListeningGap = function markListeningGap(taskId, gapNum, ok, hasValue) {
    var mark = document.querySelector(
      "#task-" + taskId + ' .ege-listening-mark[data-gap="' + String(gapNum) + '"]'
    );
    if (!mark) return;
    mark.classList.toggle("is-checked-correct", ok);
    mark.classList.toggle("is-checked-wrong", hasValue && !ok);
  }

E.clearGapCheckClasses = function clearGapCheckClasses(el) {
    if (!el) return;
    el.classList.remove("is-checked-correct", "is-checked-wrong");
  }

E.applyGapCheckClasses = function applyGapCheckClasses(el, ok, hasValue) {
    if (!el) return;
    el.classList.toggle("is-checked-correct", !!ok);
    el.classList.toggle("is-checked-wrong", !!hasValue && !ok);
  }

E.setListeningMarkText = function setListeningMarkText(taskId, gapNum, text) {
    var mark = document.querySelector(
      "#task-" + taskId + ' .ege-listening-mark[data-gap="' + String(gapNum) + '"]'
    );
    if (!mark) return;
    mark.textContent = text;
    E.clearGapCheckClasses(mark);
    mark.classList.add("is-filled");
  }

E.resetListeningGapsFeedback = function resetListeningGapsFeedback(taskId) {
    var task = E.findTask(taskId);
    if (!task) return;
    var prefix = E.taskPrefix(taskId);
    E.getActiveListeningGaps(task).forEach(function (gap) {
      var input = document.getElementById(prefix + "_gap_" + gap.num);
      if (input) {
        E.clearGapCheckClasses(input);
        input.removeAttribute("title");
      }
      E.markListeningGap(taskId, gap.num, false, false);
    });
  }

E.resetPrepGapFeedback = function resetPrepGapFeedback(taskId) {
    var task = E.findTask(taskId);
    if (!task || !task.prep || !task.prep.gapFill || !task.prep.gapFill.items) return;
    var prefix = E.taskPrefix(taskId);
    task.prep.gapFill.items.forEach(function (item) {
      var slot = document.getElementById(prefix + "_prep_gf_" + item.id);
      if (!slot) return;
      E.clearGapCheckClasses(slot);
      slot.removeAttribute("title");
    });
  }

E.clearListeningMark = function clearListeningMark(taskId, gapNum) {
    var mark = document.querySelector(
      "#task-" + taskId + ' .ege-listening-mark[data-gap="' + String(gapNum) + '"]'
    );
    if (!mark) return;
    mark.textContent = String(gapNum);
    mark.classList.remove("is-checked-correct", "is-checked-wrong", "is-filled");
  }

E.parseListeningTime = function parseListeningTime(value) {
    if (typeof value === "number" && isFinite(value) && value >= 0) return value;
    if (typeof value !== "string") return null;
    var trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    var parts = trimmed.split(":").map(Number);
    if (parts.some(function (n) { return !isFinite(n) || n < 0; })) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

E.getListeningSegmentBounds = function getListeningSegmentBounds(task) {
    if (!task) return { start: 0, end: null };
    var start =
      task.audioStart != null ? E.parseListeningTime(task.audioStart) : null;
    var end = task.audioEnd != null ? E.parseListeningTime(task.audioEnd) : null;
    return {
      start: start != null ? start : 0,
      end: end != null ? end : null,
    };
  };

E.getActiveListeningSegmentBounds = function getActiveListeningSegmentBounds() {
    if (!E.state.activeTaskId || typeof E.findTask !== "function") {
      return { start: 0, end: null };
    }
    return E.getListeningSegmentBounds(E.findTask(E.state.activeTaskId));
  };

E.syncSharedListeningSegment = function syncSharedListeningSegment(task) {
    if (!task || !sharedListeningState.audio) return;
    var bounds = E.getListeningSegmentBounds(task);
    var audio = sharedListeningState.audio;
    audio.pause();
    audio.currentTime = bounds.start;
  };

E.getListeningPlaythroughStarts = function getListeningPlaythroughStarts(task) {
    var raw = task && (task.playthroughStarts || task.audioMarks);
    if (!raw || !raw.length) return [];
    var starts = [];
    for (var i = 0; i < raw.length; i += 1) {
      var item = raw[i];
      var sec =
        typeof item === "object" && item
          ? E.parseListeningTime(item.at != null ? item.at : item.time)
          : E.parseListeningTime(item);
      if (sec == null) continue;
      starts.push({
        at: sec,
        label: String(
          (typeof item === "object" && item && item.label) || starts.length + 1
        ),
      });
    }
    return starts;
  }

E.listeningUsesSharedAudio = function listeningUsesSharedAudio(task) {
    if (!task || task.type !== "listening" || !task.audio) return false;
    if (typeof E.isFullWrittenExam !== "function" || !E.isFullWrittenExam()) return false;
    return String(task.audio).indexOf("Demo2027-PCh") !== -1;
  };

E.getVariantListeningMarks = function getVariantListeningMarks(task) {
    if (!E.state.topic || !E.state.topic.tasks) return E.getListeningPlaythroughStarts(task);
    var marks = [];
    var seen = {};
    E.state.topic.tasks.forEach(function (entry) {
      if (entry.type !== "listening" || !E.listeningUsesSharedAudio(entry)) return;
      var raw = entry.audioMarks || entry.playthroughStarts || [];
      raw.forEach(function (item) {
        var at =
          typeof item === "object" && item
            ? E.parseListeningTime(item.at != null ? item.at : item.time)
            : E.parseListeningTime(item);
        if (at == null) return;
        var label = String((typeof item === "object" && item && item.label) || "");
        var key = at + ":" + label;
        if (seen[key]) return;
        seen[key] = true;
        marks.push({ at: at, label: label || String(marks.length + 1) });
      });
    });
    marks.sort(function (a, b) {
      return a.at - b.at;
    });
    return marks.length ? marks : E.getListeningPlaythroughStarts(task);
  };

E.getVariantListeningSegments = function getVariantListeningSegments(task) {
    var segments = [];
    var audioRef = task && task.audio ? String(task.audio) : "";

    function pushSegment(entry) {
      if (!entry || entry.type !== "listening") return;
      if (audioRef && entry.audio !== audioRef) return;
      if (String(entry.audio || "").indexOf("Demo2027-PCh") === -1) return;
      var bounds = E.getListeningSegmentBounds(entry);
      var label =
        entry.examFrom != null && entry.examTo != null && entry.examFrom !== entry.examTo
          ? entry.examFrom + "–" + entry.examTo
          : String(entry.examFrom != null ? entry.examFrom : segments.length + 1);
      segments.push({
        taskId: entry.id,
        label: label,
        start: bounds.start,
        end: bounds.end,
      });
    }

    if (E.state.topic && E.state.topic.tasks) {
      E.state.topic.tasks.forEach(pushSegment);
    } else if (task) {
      pushSegment(task);
    }

    segments.sort(function (a, b) {
      return a.start - b.start;
    });
    return segments;
  };

E.listeningUsesExamSegments = function listeningUsesExamSegments(task) {
    if (!task || task.type !== "listening" || !task.audio) return false;
    if (String(task.audio).indexOf("Demo2027-PCh") === -1) return false;
    return E.getVariantListeningSegments(task).length >= 2;
  };

var sharedListeningState = {
  audio: null,
  bar: null,
  src: "",
  playFromStartCounts: {},
};

E.pauseSharedListeningAudio = function pauseSharedListeningAudio() {
    if (sharedListeningState.audio) sharedListeningState.audio.pause();
  };

E.attachSharedListeningBar = function attachSharedListeningBar(task, topicId) {
    if (!sharedListeningState.audio || sharedListeningState.src !== task.audio) {
      sharedListeningState.src = task.audio;
      sharedListeningState.playFromStartCounts = {};
      sharedListeningState.bar = E.buildListeningAudio(task, topicId, { shared: true });
    } else if (!sharedListeningState.bar) {
      sharedListeningState.bar = E.buildListeningAudio(task, topicId, { shared: true });
    }
    return sharedListeningState.bar;
  };

E.mountListeningNotesToPlayerSlot = function mountListeningNotesToPlayerSlot(root, taskId) {
    if (!root || !taskId) return;
    var slot = root.querySelector(".ege-listening-player__notes-slot");
    if (!slot) return;
    var existing =
      document.getElementById("listening-notes-" + taskId) ||
      root.querySelector(".ege-listening-notes-toggle");
    if (existing) {
      if (existing.parentNode !== slot) slot.appendChild(existing);
      return;
    }
    if (typeof E.buildListeningNotesToggle === "function") {
      slot.appendChild(E.buildListeningNotesToggle(taskId));
    }
  };

E.buildListeningAudio = function buildListeningAudio(task, topicId, options) {
    var shared = options && options.shared;
    var workspaceMarks = !!(options && options.workspaceMarks);
    var usePlayerLayout =
      workspaceMarks || (shared && E.listeningUsesExamSegments(task));
    if (E.listeningUsesSharedAudio(task) && !shared) {
      return E.attachSharedListeningBar(task, topicId);
    }

    var bar = document.createElement("div");
    bar.className = "ege-listening-audio";
    if (workspaceMarks || usePlayerLayout) bar.dataset.workspaceMarks = "true";

    var audio;
    if (shared && sharedListeningState.audio) {
      audio = sharedListeningState.audio;
    } else {
      audio = document.createElement("audio");
      if (shared) sharedListeningState.audio = audio;
    }
    audio.id = topicId + "_" + task.id + "_audio";
    audio.preload = "auto";
    audio.playbackRate = 1;
    if (task.audio) audio.src = task.audio;

    var seek = document.createElement("div");
    seek.className = "ege-listening-seek";
    seek.setAttribute("role", "slider");
    seek.setAttribute("tabindex", "0");
    seek.setAttribute("aria-label", "Recording position");
    seek.setAttribute("aria-valuemin", "0");
    seek.setAttribute("aria-valuenow", "0");
    seek.setAttribute("aria-valuetext", "0:00");

    var track = document.createElement("div");
    track.className = "ege-listening-seek__track";

    var segmentsEl = document.createElement("div");
    segmentsEl.className = "ege-listening-seek__segments";
    segmentsEl.setAttribute("aria-hidden", "true");

    var marks = document.createElement("div");
    marks.className = "ege-listening-seek__marks";

    var thumb = document.createElement("div");
    thumb.className = "ege-listening-seek__thumb";
    thumb.setAttribute("aria-hidden", "true");

    var timeEl = document.createElement("span");
    timeEl.className = "ege-listening-seek__time";
    timeEl.setAttribute("aria-hidden", "true");

    var useExamSegments =
      (shared || workspaceMarks) && E.listeningUsesExamSegments(task);

    var dividersEl = document.createElement("div");
    dividersEl.className = "ege-listening-seek__dividers";
    dividersEl.setAttribute("aria-hidden", "true");
    dividersEl.hidden = true;
    var dividerOne = document.createElement("div");
    dividerOne.className = "ege-listening-seek__divider ege-listening-seek__divider--one";
    var dividerTwo = document.createElement("div");
    dividerTwo.className = "ege-listening-seek__divider ege-listening-seek__divider--two";
    dividersEl.appendChild(dividerOne);
    dividersEl.appendChild(dividerTwo);

    track.appendChild(segmentsEl);
    track.appendChild(dividersEl);
    track.appendChild(marks);
    track.appendChild(thumb);
    seek.appendChild(track);

    var player = null;
    var playerContent = null;
    var labelsEl = null;
    var notesSlot = null;
    var actionsStart = null;

    if (usePlayerLayout) {
      player = document.createElement("div");
      player.className = "ege-listening-player";

      playerContent = document.createElement("div");
      playerContent.className = "ege-listening-player__content";

      var header = document.createElement("div");
      header.className = "ege-listening-player__header";

      labelsEl = document.createElement("div");
      labelsEl.className = "ege-listening-player__labels";
      labelsEl.hidden = true;
      header.appendChild(labelsEl);

      playerContent.appendChild(header);
    }

    if (!usePlayerLayout) {
      seek.appendChild(timeEl);
    }

    var controls = document.createElement("div");
    controls.className = "ege-listening-audio__controls";

    var playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "ege-listening-play";
    playBtn.setAttribute("aria-label", "Play recording");
    playBtn.setAttribute("title", "Play / Pause (P)");

    var icon = document.createElement("span");
    icon.className = "ege-listening-play__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "▶";

    var label = document.createElement("span");
    label.className = "ege-listening-play__label";
    label.textContent = "Listen";

    playBtn.appendChild(icon);
    playBtn.appendChild(label);

    function formatTime(sec) {
      if (!isFinite(sec) || sec < 0) sec = 0;
      var total = Math.floor(sec);
      var m = Math.floor(total / 60);
      var s = total % 60;
      return m + ":" + (s < 10 ? "0" : "") + s;
    }

    function duration() {
      return isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    }

    function setPlaying(isPlaying) {
      playBtn.classList.toggle("is-playing", isPlaying);
      seek.classList.toggle("is-playing", isPlaying);
      icon.textContent = isPlaying ? "❚❚" : "▶";
      label.textContent = isPlaying ? "Pause" : "Listen";
      playBtn.setAttribute("aria-label", isPlaying ? "Pause recording" : "Play recording");
    }

    function segmentBoundsForTask(activeTask) {
      return E.getListeningSegmentBounds(activeTask || task);
    }

    function isAtSegmentStart(activeTask) {
      var bounds = segmentBoundsForTask(activeTask);
      return (audio.currentTime || 0) < bounds.start + 0.5;
    }

    function playFromStartCount(activeTask) {
      var active = activeTask || task;
      var key = active && active.id ? active.id : task.id;
      return sharedListeningState.playFromStartCounts[key] || 0;
    }

    function incrementPlayFromStartCount(activeTask) {
      var active = activeTask || task;
      var key = active && active.id ? active.id : task.id;
      sharedListeningState.playFromStartCounts[key] = playFromStartCount(active) + 1;
    }

    function clampToSegment(activeTask) {
      var bounds = segmentBoundsForTask(activeTask);
      var t = audio.currentTime || 0;
      if (t < bounds.start - 0.05) {
        audio.currentTime = bounds.start;
        return;
      }
      if (bounds.end != null && t >= bounds.end) {
        audio.pause();
        audio.currentTime = bounds.end;
      }
    }

    function ensureSegmentStart(activeTask) {
      var bounds = segmentBoundsForTask(activeTask);
      var t = audio.currentTime || 0;
      if (t < bounds.start - 0.05 || (bounds.end != null && t >= bounds.end - 0.05)) {
        audio.currentTime = bounds.start;
      }
    }

    function updateExamSegmentsUI() {
      if (!useExamSegments || !segmentsEl) return;
      var dur = duration();
      var segments = E.getVariantListeningSegments(task);
      if (!dur || segments.length < 2) return;

      var t = audio.currentTime || 0;
      var activeId = E.state.activeTaskId || task.id;
      var activeIdx = -1;
      segments.forEach(function (seg, index) {
        if (seg.taskId === activeId) activeIdx = index;
      });

      segmentsEl.querySelectorAll(".ege-listening-seek__segment").forEach(function (el, index) {
        var seg = segments[index];
        if (!seg) return;
        var segEnd = seg.end != null ? seg.end : dur;
        el.classList.remove("is-done", "is-current", "is-upcoming");
        el.style.removeProperty("--segment-progress");

        if (activeIdx >= 0) {
          if (index < activeIdx) {
            el.classList.add("is-done");
          } else if (index === activeIdx) {
            el.classList.add("is-current");
            var segDur = Math.max(0.001, segEnd - seg.start);
            var progress = Math.min(100, Math.max(0, ((t - seg.start) / segDur) * 100));
            el.style.setProperty("--segment-progress", progress + "%");
          } else {
            el.classList.add("is-upcoming");
          }
          return;
        }

        if (t >= segEnd - 0.05) el.classList.add("is-done");
        else if (t >= seg.start) {
          el.classList.add("is-current");
          var fallbackDur = Math.max(0.001, segEnd - seg.start);
          var fallbackProgress = Math.min(
            100,
            Math.max(0, ((t - seg.start) / fallbackDur) * 100)
          );
          el.style.setProperty("--segment-progress", fallbackProgress + "%");
        } else el.classList.add("is-upcoming");
      });
    }

    function setSegmentLayoutVars(dur, segments) {
      var layoutRoot = playerContent || seek;
      if (!layoutRoot || !dur || !segments || segments.length < 2) return;
      var boundaryOne =
        segments[0].end != null
          ? segments[0].end
          : segments[1]
            ? segments[1].start
            : dur;
      var boundaryTwo =
        segments.length >= 3
          ? segments[1].end != null
            ? segments[1].end
            : segments[2].start
          : dur;
      var pctOne = Math.min(100, Math.max(0, (boundaryOne / dur) * 100));
      var pctTwo = Math.min(100, Math.max(0, (boundaryTwo / dur) * 100));
      layoutRoot.style.setProperty("--segment-one", pctOne + "%");
      layoutRoot.style.setProperty("--segment-two", pctTwo + "%");
    }

    function renderWorkspaceLabels(dur, segments) {
      if (!labelsEl || !usePlayerLayout) return;
      if (!dur || !segments || segments.length < 2 || !useExamSegments) {
        labelsEl.hidden = true;
        seek.classList.remove("ege-listening-seek--has-label-row");
        return;
      }
      labelsEl.hidden = false;
      seek.classList.add("ege-listening-seek--has-label-row");
      labelsEl.textContent = "";
      segments.forEach(function (seg) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ege-listening-player__label";
        btn.textContent = seg.label;
        btn.setAttribute("aria-label", "Jump to task " + seg.label);
        btn.title = "Task " + seg.label + " · " + formatTime(seg.start);
        btn.addEventListener("click", function (event) {
          event.stopPropagation();
          seekTo(seg.start);
        });
        labelsEl.appendChild(btn);
      });
    }

    function renderExamSegments() {
      if (!useExamSegments || !segmentsEl) return;
      var dur = duration();
      var segments = E.getVariantListeningSegments(task);
      if (!dur || segments.length < 2) {
        segmentsEl.hidden = true;
        if (dividersEl) dividersEl.hidden = true;
        seek.classList.remove("ege-listening-seek--exam");
        renderWorkspaceLabels(dur, segments);
        return;
      }

      seek.classList.add("ege-listening-seek--exam");
      segmentsEl.hidden = false;
      if (dividersEl) dividersEl.hidden = false;
      segmentsEl.textContent = "";
      segments.forEach(function (seg) {
        var segEnd = seg.end != null ? seg.end : dur;
        var widthPct = Math.max(0, ((segEnd - seg.start) / dur) * 100);
        var segment = document.createElement("div");
        segment.className = "ege-listening-seek__segment";
        segment.style.flexBasis = widthPct + "%";
        segment.dataset.taskId = seg.taskId;
        segment.dataset.label = seg.label;
        segmentsEl.appendChild(segment);
      });
      setSegmentLayoutVars(dur, segments);
      renderWorkspaceLabels(dur, segments);
      updateExamSegmentsUI();
    }

    function updateSeekUI() {
      var dur = duration();
      clampToSegment(typeof E.findTask === "function" ? E.findTask(E.state.activeTaskId) : null);
      var t = audio.currentTime || 0;
      var pct = dur ? Math.min(100, Math.max(0, (t / dur) * 100)) : 0;
      thumb.style.left = pct + "%";
      seek.style.setProperty("--ege-seek-progress", pct + "%");
      seek.setAttribute("aria-valuemax", String(Math.round(dur)));
      seek.setAttribute("aria-valuenow", String(Math.round(t)));
      seek.setAttribute("aria-valuetext", formatTime(t) + " / " + formatTime(dur));
      if (timeEl && timeEl.isConnected) {
        timeEl.textContent = formatTime(t) + " / " + formatTime(dur);
      }
      updateExamSegmentsUI();
    }

    function seekTo(time) {
      var dur = duration();
      if (!dur) return;
      audio.currentTime = Math.min(dur, Math.max(0, time));
      updateSeekUI();
    }

    function seekFromClientX(clientX) {
      var dur = duration();
      if (!dur) return;
      var rect = track.getBoundingClientRect();
      if (!rect.width) return;
      var ratio = (clientX - rect.left) / rect.width;
      seekTo(Math.min(1, Math.max(0, ratio)) * dur);
    }

    function renderPlaythroughMarks() {
      marks.textContent = "";
      var dur = duration();
      var starts = shared ? E.getVariantListeningMarks(task) : E.getListeningPlaythroughStarts(task);
      if (!dur || !starts.length) return;
      var labeledMarks =
        !usePlayerLayout &&
        (bar.dataset.workspaceMarks === "true" ||
          !!(bar.closest && bar.closest(".ege-listening-bar")));
      if (usePlayerLayout && useExamSegments) return;
      starts.forEach(function (mark) {
        if (mark.at > dur) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ege-listening-seek__mark";
        if (labeledMarks) btn.classList.add("ege-listening-seek__mark--labeled");
        btn.style.left = (mark.at / dur) * 100 + "%";
        btn.setAttribute("aria-label", "Jump to playthrough " + mark.label);
        btn.title = "Playthrough " + mark.label + " · " + formatTime(mark.at);
        if (labeledMarks) btn.textContent = mark.label;
        btn.addEventListener("click", function (event) {
          event.stopPropagation();
          seekTo(mark.at);
        });
        marks.appendChild(btn);
      });
    }

    var dragging = false;

    seek.addEventListener("pointerdown", function (event) {
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest(".ege-listening-seek__mark")) return;
      dragging = true;
      seek.classList.add("is-dragging");
      seek.setPointerCapture(event.pointerId);
      seekFromClientX(event.clientX);
      event.preventDefault();
    });

    seek.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      seekFromClientX(event.clientX);
    });

    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      seek.classList.remove("is-dragging");
      if (seek.hasPointerCapture && seek.hasPointerCapture(event.pointerId)) {
        seek.releasePointerCapture(event.pointerId);
      }
    }

    seek.addEventListener("pointerup", endDrag);
    seek.addEventListener("pointercancel", endDrag);

    seek.addEventListener("keydown", function (event) {
      var dur = duration();
      if (!dur) return;
      if (event.key === "Home") {
        event.preventDefault();
        seekTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        seekTo(dur);
      }
    });

    playBtn.addEventListener("click", function () {
      if (audio.paused) {
        var activeTask =
          typeof E.findTask === "function" ? E.findTask(E.state.activeTaskId) : null;
        if (
          typeof E.isPlacementExam === "function" &&
          E.isPlacementExam() &&
          isAtSegmentStart(activeTask) &&
          playFromStartCount(activeTask) >= 2
        ) {
          E.showToast("Запись можно прослушать только дважды.");
          return;
        }
        ensureSegmentStart(activeTask);
        var playPromise = audio.play();
        if (playPromise && playPromise.catch) {
          playPromise.catch(function () {
            E.showListeningAudioError(bar, task, topicId);
          });
        }
      } else {
        audio.pause();
      }
    });

    audio.addEventListener("play", function () {
      var activeTask =
        typeof E.findTask === "function" ? E.findTask(E.state.activeTaskId) : null;
      if (
        typeof E.isPlacementExam === "function" &&
        E.isPlacementExam() &&
        isAtSegmentStart(activeTask)
      ) {
        incrementPlayFromStartCount(activeTask);
      }
      setPlaying(true);
    });
    audio.addEventListener("pause", function () {
      setPlaying(false);
    });
    audio.addEventListener("ended", function () {
      setPlaying(false);
      updateSeekUI();
    });
    audio.addEventListener("timeupdate", updateSeekUI);
    audio.addEventListener("loadedmetadata", function () {
      updateSeekUI();
      renderExamSegments();
      renderPlaythroughMarks();
    });
    audio.addEventListener("durationchange", function () {
      updateSeekUI();
      renderExamSegments();
      renderPlaythroughMarks();
    });

    var speeds = [0.85, 1, 1.25, 1.5, 2];
    var showSpeed =
      !(typeof E.isPlacementExam === "function" && E.isPlacementExam());
    var speedGroup = document.createElement("div");
    speedGroup.className = "ege-listening-speed";
    speedGroup.setAttribute("role", "group");
    speedGroup.setAttribute("aria-label", "Playback speed");

    function setSpeed(rate) {
      audio.playbackRate = rate;
      speedGroup.querySelectorAll(".ege-listening-speed__btn").forEach(function (btn) {
        var active = Number(btn.dataset.rate) === rate;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    if (showSpeed) {
      speeds.forEach(function (rate) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ege-listening-speed__btn";
        btn.dataset.rate = String(rate);
        btn.textContent = rate === 1 ? "1×" : rate + "×";
        btn.setAttribute("aria-label", "Play at " + rate + "× speed");
        btn.setAttribute("aria-pressed", rate === 1 ? "true" : "false");
        if (rate === 1) btn.classList.add("is-active");
        btn.addEventListener("click", function () {
          setSpeed(rate);
        });
        speedGroup.appendChild(btn);
      });
    }

    controls.appendChild(playBtn);
    if (showSpeed) controls.appendChild(speedGroup);
    if (!usePlayerLayout) controls.appendChild(audio);

    if (usePlayerLayout) {
      var actions = document.createElement("div");
      actions.className = "ege-listening-player__actions";

      actionsStart = document.createElement("div");
      actionsStart.className = "ege-listening-player__actions-start";
      actionsStart.appendChild(playBtn);
      if (showSpeed) actionsStart.appendChild(speedGroup);

      notesSlot = document.createElement("div");
      notesSlot.className = "ege-listening-player__notes-slot";

      actions.appendChild(actionsStart);
      actions.appendChild(notesSlot);

      playerContent.appendChild(seek);
      playerContent.appendChild(actions);
      player.appendChild(playerContent);
      bar.appendChild(player);
      bar.appendChild(audio);
    } else {
      bar.appendChild(seek);
      bar.appendChild(controls);
    }
    updateSeekUI();
    renderExamSegments();
    bar._refreshSeekUI = updateSeekUI;
    if (shared) sharedListeningState.bar = bar;
    return bar;
  };

E.showListeningAudioError = function showListeningAudioError(bar, task, topicId) {
    if (!bar || bar.querySelector(".ege-listening-audio__error")) return;
    var msg = document.createElement("p");
    msg.className = "ege-listening-audio__error";
    msg.textContent = "Не удалось воспроизвести запись.";
    var retry = document.createElement("button");
    retry.type = "button";
    retry.className = "ege-btn ege-btn--ghost ege-btn--small";
    retry.textContent = "Повторить";
    retry.addEventListener("click", function () {
      msg.remove();
      var audio = bar.querySelector("audio");
      if (audio) {
        var playPromise = audio.play();
        if (playPromise && playPromise.catch) {
          playPromise.catch(function () {
            E.showListeningAudioError(bar, task, topicId);
          });
        }
      }
    });
    msg.appendChild(retry);
    bar.appendChild(msg);
  };

E.attachListeningGapLinks = function attachListeningGapLinks(transcript, topicId, taskId) {
    if (!transcript) return;

    transcript.addEventListener("click", function (event) {
      var mark = event.target.closest(".ege-listening-mark");
      if (!mark || !transcript.contains(mark)) return;

      var gapNum = mark.getAttribute("data-gap");
      if (!gapNum) return;

      var input = document.getElementById(topicId + "_" + taskId + "_gap_" + gapNum);
      if (!input) return;

      event.preventDefault();
      input.focus();
      if (typeof input.select === "function") input.select();
    });
  }

E.buildListeningTranscript = function buildListeningTranscript(task) {
    var transcript = document.createElement("div");
    transcript.className = "ege-passage ege-listening-transcript";

    var text = task.transcript || "";
    var allGaps = E.getListeningGaps(task);
    var activeGaps = E.getActiveListeningGaps(task);
    var dialogue = E.parseDialogueTranscript(text);

    if (dialogue && dialogue.length) {
      dialogue = E.mergeDialogueTurns(dialogue);
      var wrap = document.createElement("div");
      wrap.className = "ege-dialogue";
      dialogue.forEach(function (turn, index) {
        var turnEl = E.renderDialogueTurn(turn, task, allGaps, activeGaps);
        if (index === 0) turnEl.classList.add("ege-dialogue__turn--intro");
        wrap.appendChild(turnEl);
      });
      transcript.appendChild(wrap);
      return transcript;
    }

    if (!allGaps.length) {
      text.split(/\n\n+/).forEach(function (paragraph) {
        var trimmed = paragraph.replace(/\n/g, " ").trim();
        if (!trimmed) return;
        var para = document.createElement("p");
        para.textContent = trimmed;
        transcript.appendChild(para);
      });
      return transcript;
    }

    var html = E.applyListeningGaps(text, allGaps, activeGaps);
    transcript.innerHTML = html;
    return transcript;
  }

E.buildListeningMcStack = function buildListeningMcStack(task, topicId) {
    var work = document.createElement("div");
    work.className = "ege-mc-stack";

    (task.questions || []).forEach(function (question, index) {
      var block = document.createElement("div");
      block.className = "ege-mc-card";
      block.id = topicId + "_" + task.id + "_q_" + index;
      var promptText = E.formatMcPrompt(task, question, index);

      block.appendChild(E.buildMcPrompt(task, question, index));

      block.appendChild(
        E.buildMcChoiceGroup(topicId + "_" + task.id + "_q_" + index, question.opts, promptText)
      );
      work.appendChild(block);
    });

    return work;
  }

E.migrateListeningExamMcAnswers = function migrateListeningExamMcAnswers(task, radios) {
    if (!task || !task.examMc || !task.questions || !radios) return radios;
    var prefix = E.taskPrefix(task.id);
    var names = task.questions.map(function (_question, index) {
      return prefix + "_q_" + index;
    });
    var values = names.map(function (name) {
      return radios[name] || "";
    });
    if (values.some(function (value) { return value === "0"; })) return radios;
    var looksLegacy = values.some(Boolean) && values.every(function (value) {
      return !value || value === "1" || value === "2" || value === "3";
    });
    if (!looksLegacy) return radios;
    names.forEach(function (name, index) {
      var val = radios[name];
      if (!val) return;
      var n = Number(val);
      var max = (task.questions[index].opts || []).length;
      if (n >= 1 && n <= max) radios[name] = String(n - 1);
    });
    return radios;
  };

E.listeningExamMatchRadioName = function listeningExamMatchRadioName(prefix, speaker) {
    return prefix + "_em_" + speaker;
  }

E.getListeningExamMatchValue = function getListeningExamMatchValue(prefix, speaker) {
    return E.getCheckedValue(E.listeningExamMatchRadioName(prefix, speaker));
  }

E.listeningExamTfnRadioName = function listeningExamTfnRadioName(prefix, letter) {
    return prefix + "_etfn_" + letter;
  }

E.getListeningExamTfnValue = function getListeningExamTfnValue(prefix, letter) {
    return E.getCheckedValue(E.listeningExamTfnRadioName(prefix, letter));
  }

E.listeningExamTfnDisplayLabel = function listeningExamTfnDisplayLabel(value) {
    if (!value) return "";
    return String(value);
  }

E.listeningExamTfnLabelsFromWrap = function listeningExamTfnLabelsFromWrap(wrap) {
    var raw = wrap && wrap.dataset.tfnLabels;
    if (!raw) return ["True", "False", "Not stated"];
    return raw.split("|");
  }

E.buildListeningExamMatch = function buildListeningExamMatch(task, topicId) {
    var exam = task.examMatch;
    var prefix = topicId + "_" + task.id;
    var wrap = document.createElement("div");
    wrap.className = "ege-listening-exam-match";
    wrap.dataset.examPrefix = prefix;
    wrap.dataset.taskId = task.id;

    var speakers = exam.speakers || [];
    var statements = exam.statements || [];

    var body = document.createElement("div");
    body.className = "ege-listening-exam-match__body";

    var stmtList = document.createElement("div");
    stmtList.className = "ege-listening-exam-match__statements";
    statements.forEach(function (text, index) {
      var item = document.createElement("div");
      item.className = "ege-text-block ege-listening-exam-match__stmt";
      item.dataset.stmt = String(index + 1);
      item.innerHTML = "<strong>" + (index + 1) + ".</strong> " + text;
      stmtList.appendChild(item);
    });
    body.appendChild(stmtList);

    var assign = document.createElement("div");
    assign.className = "ege-listening-exam-match__answers";

    var track = E.buildAnswerTrack(
      speakers.map(function (speaker) {
        return { id: speaker, label: speaker };
      }),
      null
    );
    assign.appendChild(track);

    var hidden = document.createElement("div");
    hidden.className = "ege-match-hidden";

    var live = document.createElement("div");
    live.className = "ege-sr-live";
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    assign.appendChild(live);

    var activeSpeaker = "";
    var pendingStatement = "";

    function radioName(speaker) {
      return E.listeningExamMatchRadioName(prefix, speaker);
    }

    function announce(text) {
      if (live) live.textContent = text || "";
    }

    function syncFooter() {
      E.syncListeningExamMatchFooterUI(task.id);
      if (typeof E.syncFinishWrittenButton === "function") E.syncFinishWrittenButton();
    }

    function findSpeakerWithValue(numStr) {
      var owner = "";
      speakers.forEach(function (sp) {
        if (E.getListeningExamMatchValue(prefix, sp) === numStr) owner = sp;
      });
      return owner;
    }

    function clearSpeakerMarks(speaker) {
      var cell = track.querySelector('[data-slot="' + speaker + '"]');
      if (cell) cell.classList.remove("is-correct", "is-wrong", "is-empty");
      wrap.querySelectorAll(".ege-listening-exam-match__stmt").forEach(function (stmt) {
        stmt.classList.remove("is-correct", "is-wrong");
      });
    }

    function syncActiveSpeakerUI() {
      track.querySelectorAll(".ege-answer-track__cell").forEach(function (cell) {
        cell.classList.toggle("is-active", cell.dataset.slot === activeSpeaker);
      });
    }

    function syncStatementRow() {
      var value = activeSpeaker ? E.getListeningExamMatchValue(prefix, activeSpeaker) : "";
      wrap.querySelectorAll(".ege-listening-exam-match__stmt").forEach(function (stmt) {
        stmt.classList.toggle("is-selected", stmt.dataset.stmt === value);
        stmt.classList.remove("is-correct", "is-wrong");
      });
    }

    function syncPendingStatementUI() {
      wrap.querySelectorAll(".ege-listening-exam-match__stmt").forEach(function (stmt) {
        if (!activeSpeaker) {
          stmt.classList.toggle("is-selected", stmt.dataset.stmt === pendingStatement);
        }
      });
    }

    function syncUsedState() {
      var used = {};
      speakers.forEach(function (sp) {
        var val = E.getListeningExamMatchValue(prefix, sp);
        if (val) used[val] = true;
      });

      wrap.querySelectorAll(".ege-listening-exam-match__stmt").forEach(function (stmt) {
        stmt.classList.toggle("is-used", !!used[stmt.dataset.stmt]);
      });

      track.querySelectorAll(".ege-answer-track__cell").forEach(function (cell) {
        var sp = cell.dataset.slot;
        var val = E.getListeningExamMatchValue(prefix, sp);
        var valEl = cell.querySelector(".ege-answer-track__val");
        if (valEl) valEl.textContent = val || "";
        cell.classList.toggle("is-filled", !!val);
      });

      var filledCount = speakers.filter(function (sp) {
        return !!E.getListeningExamMatchValue(prefix, sp);
      }).length;
      var allFilled = filledCount === speakers.length && speakers.length > 0;
      wrap.querySelectorAll(".ege-listening-exam-match__stmt").forEach(function (stmt) {
        var num = stmt.dataset.stmt;
        var isExtra = allFilled && num && !used[num];
        stmt.classList.toggle("ege-listening-exam-match__stmt--extra", !!isExtra);
      });
    }

    function syncScoreMarks() {
      speakers.forEach(function (sp) {
        var name = radioName(sp);
        var checked = document.querySelector('input[name="' + name + '"]:checked');
        var pill = checked ? checked.closest(".ege-pill") : null;
        var cell = track.querySelector('[data-slot="' + sp + '"]');
        var isCorrect = !!(pill && pill.classList.contains("is-correct"));
        var isWrong = !!(pill && pill.classList.contains("is-wrong"));
        if (cell) {
          cell.classList.toggle("is-correct", isCorrect);
          cell.classList.toggle("is-wrong", isWrong);
        }
      });
    }

    function syncAll() {
      syncActiveSpeakerUI();
      syncStatementRow();
      syncPendingStatementUI();
      syncUsedState();
      syncScoreMarks();
    }

    function clearSpeaker(speaker) {
      E.clearChoiceGroup(radioName(speaker));
      clearSpeakerMarks(speaker);
      if (speaker === activeSpeaker) syncStatementRow();
      pendingStatement = "";
      E.hideScoreFeedback(task.id);
      syncAll();
      syncFooter();
    }

    function assignStatement(num) {
      var numStr = String(num);

      if (!activeSpeaker) {
        // Statement-first: click selects, click again deselects, click other changes pending.
        // Do not clear table cells from statement clicks when no speaker is active.
        pendingStatement = pendingStatement === numStr ? "" : numStr;
        syncPendingStatementUI();
        if (pendingStatement) announce("Statement " + pendingStatement + " selected");
        else announce("");
        return;
      }

      var current = E.getListeningExamMatchValue(prefix, activeSpeaker);
      if (current === numStr) {
        clearSpeaker(activeSpeaker);
        announce("Speaker " + activeSpeaker + " cleared");
        return;
      }

      // Change answer: steal statement from another speaker if needed, then assign.
      var ownerSpeaker = findSpeakerWithValue(numStr);
      if (ownerSpeaker && ownerSpeaker !== activeSpeaker) clearSpeaker(ownerSpeaker);

      E.setRadioValue(radioName(activeSpeaker), numStr);
      clearSpeakerMarks(activeSpeaker);
      pendingStatement = "";
      E.hideScoreFeedback(task.id);
      syncStatementRow();
      syncAll();
      syncFooter();
      announce("Speaker " + activeSpeaker + " matched to statement " + numStr);
    }

    function setActiveSpeaker(speaker) {
      activeSpeaker = speaker || "";
      pendingStatement = "";
      syncAll();
    }

    function activateSpeaker(speaker) {
      if (pendingStatement) {
        var stmtNum = pendingStatement;
        pendingStatement = "";
        activeSpeaker = speaker;

        var numStr = String(stmtNum);
        var ownerSpeaker = findSpeakerWithValue(numStr);
        if (ownerSpeaker && ownerSpeaker !== speaker) clearSpeaker(ownerSpeaker);

        var current = E.getListeningExamMatchValue(prefix, speaker);
        if (current === numStr) {
          clearSpeaker(speaker);
          announce("Speaker " + speaker + " cleared");
          return;
        }

        E.setRadioValue(radioName(speaker), numStr);
        clearSpeakerMarks(speaker);
        E.hideScoreFeedback(task.id);
        syncAll();
        syncFooter();
        announce("Speaker " + speaker + " matched to statement " + numStr);
        return;
      }

      if (speaker === activeSpeaker) {
        if (E.getListeningExamMatchValue(prefix, speaker)) clearSpeaker(speaker);
        else setActiveSpeaker("");
        return;
      }
      setActiveSpeaker(speaker);
      announce("Speaker " + speaker + " selected");
    }

    speakers.forEach(function (speaker) {
      hidden.appendChild(
        E.buildChoiceGroup(radioName(speaker), statements.length, {
          label: "Statement for speaker " + speaker,
        })
      );
    });

    speakers.forEach(function (speaker) {
      var cell = track.querySelector('[data-slot="' + speaker + '"]');
      if (!cell) return;
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
      cell.setAttribute("aria-label", "Select speaker " + speaker);
      cell.addEventListener("click", function () {
        activateSpeaker(speaker);
      });
      cell.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateSpeaker(speaker);
      });
    });

    assign.appendChild(hidden);
    body.appendChild(assign);
    wrap.appendChild(body);

    wrap.querySelectorAll(".ege-listening-exam-match__stmt").forEach(function (stmt) {
      stmt.setAttribute("role", "button");
      stmt.tabIndex = 0;
      stmt.setAttribute("aria-label", "Select statement " + stmt.dataset.stmt);
      stmt.addEventListener("click", function (event) {
        if (event.detail > 1) return;
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.anchorNode && stmt.contains(sel.anchorNode)) return;
        assignStatement(Number(stmt.dataset.stmt));
      });
      stmt.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        assignStatement(Number(stmt.dataset.stmt));
      });
    });

    wrap.syncListeningExamMatch = syncAll;

    wrap.classList.add("ege-picks-controller");
    wrap._pickSlots = speakers.slice();
    wrap._pickMaxOption = statements.length;
    wrap.assignNumber = function (num) {
      assignStatement(num);
    };
    wrap.setActiveLetter = function (letter) {
      setActiveSpeaker(letter);
      if (letter) announce("Speaker " + letter + " selected");
    };
    wrap.activateLetter = function (letter) {
      activateSpeaker(letter);
    };
    wrap.getActiveLetter = function () {
      return activeSpeaker;
    };

    syncAll();
    return wrap;
  }

E.syncListeningExamMatchTable = function syncListeningExamMatchTable(wrap) {
    if (!wrap) return;
    if (typeof wrap.syncListeningExamMatch === "function") {
      wrap.syncListeningExamMatch();
      return;
    }

    var prefix = wrap.dataset.examPrefix;
    if (!prefix) return;

    var used = {};
    wrap.querySelectorAll(".ege-answer-track__cell").forEach(function (cell) {
      var speaker = cell.dataset.slot;
      var val = E.getListeningExamMatchValue(prefix, speaker);
      var valEl = cell.querySelector(".ege-answer-track__val");
      if (valEl) valEl.textContent = val || "";
      cell.classList.toggle("is-filled", !!val);
    });

    wrap.querySelectorAll(".ege-listening-exam-match__stmt").forEach(function (stmt) {
      var num = stmt.dataset.stmt;
      stmt.classList.toggle("is-used", !!(num && used[num]));
    });
  }

E.buildListeningExamTfn = function buildListeningExamTfn(task, topicId) {
    var exam = task.examTfn;
    var prefix = topicId + "_" + task.id;
    var labels = exam.labels || ["True", "False", "Not stated"];
    var statements = exam.statements || [];
    var letters = statements.map(function (item) {
      return item.letter;
    });
    var wrap = document.createElement("div");
    wrap.className = "ege-listening-exam-tfn";
    wrap.dataset.examPrefix = prefix;
    wrap.dataset.taskId = task.id;
    wrap.dataset.tfnLabels = labels.join("|");

    var body = document.createElement("div");
    body.className = "ege-listening-exam-tfn__body";

    var stmtList = document.createElement("div");
    stmtList.className = "ege-listening-exam-tfn__statements";
    statements.forEach(function (item) {
      var stmt = document.createElement("div");
      stmt.className = "ege-text-block ege-listening-exam-tfn__stmt";
      stmt.dataset.letter = item.letter;
      stmt.innerHTML = "<strong>" + item.letter + ".</strong> " + item.text;
      stmtList.appendChild(stmt);
    });
    body.appendChild(stmtList);

    var assign = document.createElement("div");
    assign.className = "ege-listening-exam-tfn__answers";

    var picker = document.createElement("div");
    picker.className = "ege-listening-exam-tfn__picker";

    var choices = document.createElement("div");
    choices.className = "ege-listening-exam-tfn__choices";
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", "1 True, 2 False, 3 Not stated");
    labels.forEach(function (label, index) {
      var num = String(index + 1);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ege-pill ege-pill--option ege-pill--text";
      btn.dataset.value = num;
      btn.textContent = num + " " + label;
      btn.setAttribute("aria-label", num + " " + label);
      choices.appendChild(btn);
    });
    picker.appendChild(choices);
    assign.appendChild(picker);

    var track = E.buildAnswerTrack(
      letters.map(function (letter) {
        return { id: letter, label: letter };
      }),
      null
    );
    assign.appendChild(track);

    var hidden = document.createElement("div");
    hidden.className = "ege-match-hidden";

    var live = document.createElement("div");
    live.className = "ege-sr-live";
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    assign.appendChild(live);

    var activeLetter = "";

    function radioName(letter) {
      return E.listeningExamTfnRadioName(prefix, letter);
    }

    function announce(text) {
      if (live) live.textContent = text || "";
    }

    function syncFooter() {
      E.syncListeningExamTfnFooterUI(task.id);
      if (typeof E.syncFinishWrittenButton === "function") E.syncFinishWrittenButton();
    }

    function clearLetterMarks(letter) {
      var cell = track.querySelector('[data-slot="' + letter + '"]');
      if (cell) cell.classList.remove("is-correct", "is-wrong", "is-empty");
      var stmt = wrap.querySelector('.ege-listening-exam-tfn__stmt[data-letter="' + letter + '"]');
      if (stmt) stmt.classList.remove("is-correct", "is-wrong");
    }

    function syncActiveLetterUI() {
      track.querySelectorAll(".ege-answer-track__cell").forEach(function (cell) {
        cell.classList.toggle("is-active", cell.dataset.slot === activeLetter);
      });
      wrap.querySelectorAll(".ege-listening-exam-tfn__stmt").forEach(function (stmt) {
        stmt.classList.toggle("is-selected", stmt.dataset.letter === activeLetter);
        stmt.classList.remove("is-correct", "is-wrong");
      });
    }

    function syncPickerUI() {
      var value = activeLetter ? E.getListeningExamTfnValue(prefix, activeLetter) : "";
      choices.querySelectorAll("[data-value]").forEach(function (btn) {
        btn.classList.toggle("is-selected", !!activeLetter && btn.dataset.value === value);
        btn.classList.remove("is-correct", "is-wrong");
      });
      if (!activeLetter || !value) return;
      var name = radioName(activeLetter);
      var checked = document.querySelector('input[name="' + name + '"]:checked');
      var pill = checked ? checked.closest(".ege-pill") : null;
      var activeBtn = choices.querySelector('[data-value="' + value + '"]');
      if (activeBtn && pill) {
        activeBtn.classList.toggle("is-correct", pill.classList.contains("is-correct"));
        activeBtn.classList.toggle("is-wrong", pill.classList.contains("is-wrong"));
      }
    }

    function syncFilledState() {
      letters.forEach(function (letter) {
        var val = E.getListeningExamTfnValue(prefix, letter);
        var cell = track.querySelector('[data-slot="' + letter + '"]');
        if (cell) {
          var valEl = cell.querySelector(".ege-answer-track__val");
          if (valEl) {
            valEl.textContent = E.listeningExamTfnDisplayLabel(val, labels);
          }
          cell.classList.toggle("is-filled", !!val);
        }
        var stmt = wrap.querySelector('.ege-listening-exam-tfn__stmt[data-letter="' + letter + '"]');
        if (stmt) stmt.classList.toggle("is-answered", !!val);
      });
    }

    function syncScoreMarks() {
      letters.forEach(function (letter) {
        var name = radioName(letter);
        var checked = document.querySelector('input[name="' + name + '"]:checked');
        var pill = checked ? checked.closest(".ege-pill") : null;
        var cell = track.querySelector('[data-slot="' + letter + '"]');
        var stmt = wrap.querySelector('.ege-listening-exam-tfn__stmt[data-letter="' + letter + '"]');
        var isCorrect = !!(pill && pill.classList.contains("is-correct"));
        var isWrong = !!(pill && pill.classList.contains("is-wrong"));
        [cell, stmt].forEach(function (el) {
          if (!el) return;
          el.classList.toggle("is-correct", isCorrect);
          el.classList.toggle("is-wrong", isWrong);
        });
      });
    }

    function syncAll() {
      syncActiveLetterUI();
      syncPickerUI();
      syncFilledState();
      syncScoreMarks();
    }

    function nextEmptyLetter(fromLetter) {
      var start = letters.indexOf(fromLetter);
      if (start < 0) start = 0;
      for (var i = 1; i <= letters.length; i += 1) {
        var letter = letters[(start + i) % letters.length];
        if (!E.getListeningExamTfnValue(prefix, letter)) return letter;
      }
      return fromLetter;
    }

    function clearLetter(letter) {
      E.clearChoiceGroup(radioName(letter));
      clearLetterMarks(letter);
      E.hideScoreFeedback(task.id);
      syncAll();
      syncFooter();
    }

    function assignTfn(num) {
      var numStr = String(num);
      if (!activeLetter) {
        var first = nextEmptyLetter("");
        if (!first && letters.length) first = letters[0];
        if (first) activeLetter = first;
      }
      if (!activeLetter) return;
      var current = E.getListeningExamTfnValue(prefix, activeLetter);
      if (current === numStr) {
        clearLetter(activeLetter);
        announce("Statement " + activeLetter + " cleared");
        return;
      }
      E.setRadioValue(radioName(activeLetter), numStr);
      clearLetterMarks(activeLetter);
      E.hideScoreFeedback(task.id);
      syncAll();
      syncFooter();
      announce("Statement " + activeLetter + ": " + labels[num - 1]);
    }

    function activateLetter(letter) {
      if (letter === activeLetter) {
        if (E.getListeningExamTfnValue(prefix, letter)) {
          clearLetter(letter);
          announce("Statement " + letter + " cleared");
        } else {
          activeLetter = "";
          syncAll();
          announce("");
        }
        return;
      }
      activeLetter = letter || "";
      syncAll();
      if (activeLetter) announce("Statement " + activeLetter + " selected");
    }

    letters.forEach(function (letter) {
      hidden.appendChild(
        E.buildChoiceGroup(radioName(letter), 3, {
          label: "Answer for statement " + letter,
          text: labels,
        })
      );
    });

    letters.forEach(function (letter) {
      var cell = track.querySelector('[data-slot="' + letter + '"]');
      if (!cell) return;
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
      cell.setAttribute("aria-label", "Select statement " + letter);
      cell.addEventListener("click", function () {
        activateLetter(letter);
      });
      cell.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateLetter(letter);
      });
    });

    choices.querySelectorAll("[data-value]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        assignTfn(Number(btn.dataset.value));
      });
    });

    assign.appendChild(hidden);
    body.appendChild(assign);
    wrap.appendChild(body);

    wrap.querySelectorAll(".ege-listening-exam-tfn__stmt").forEach(function (stmt) {
      stmt.setAttribute("role", "button");
      stmt.tabIndex = 0;
      stmt.setAttribute("aria-label", "Select statement " + stmt.dataset.letter);
      stmt.addEventListener("click", function (event) {
        if (event.detail > 1) return;
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.anchorNode && stmt.contains(sel.anchorNode)) return;
        activateLetter(stmt.dataset.letter);
      });
      stmt.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateLetter(stmt.dataset.letter);
      });
    });

    wrap.syncListeningExamTfn = syncAll;

    wrap.classList.add("ege-picks-controller");
    wrap._pickSlots = letters.slice();
    wrap._pickMaxOption = labels.length;
    wrap.assignNumber = function (num) {
      assignTfn(num);
    };
    wrap.setActiveLetter = function (letter) {
      activeLetter = letter || "";
      syncAll();
      if (activeLetter) announce("Statement " + activeLetter + " selected");
      else announce("");
    };
    wrap.activateLetter = function (letter) {
      activateLetter(letter);
    };
    wrap.getActiveLetter = function () {
      return activeLetter;
    };

    if (letters.length) activeLetter = letters[0];
    syncAll();
    return wrap;
  }

E.syncListeningExamTfnRows = function syncListeningExamTfnRows(wrap) {
    if (!wrap) return;
    if (typeof wrap.syncListeningExamTfn === "function") {
      wrap.syncListeningExamTfn();
      return;
    }

    var prefix = wrap.dataset.examPrefix;
    if (!prefix) return;

    var labels = E.listeningExamTfnLabelsFromWrap(wrap);

    wrap.querySelectorAll(".ege-answer-track__cell").forEach(function (cell) {
      var letter = cell.dataset.slot;
      var val = E.getListeningExamTfnValue(prefix, letter);
      var valEl = cell.querySelector(".ege-answer-track__val");
      if (valEl) valEl.textContent = E.listeningExamTfnDisplayLabel(val, labels);
      cell.classList.toggle("is-filled", !!val);
      var name = E.listeningExamTfnRadioName(prefix, letter);
      var checked = document.querySelector('input[name="' + name + '"]:checked');
      var pill = checked ? checked.closest(".ege-pill") : null;
      cell.classList.toggle("is-correct", !!(pill && pill.classList.contains("is-correct")));
      cell.classList.toggle("is-wrong", !!(pill && pill.classList.contains("is-wrong")));
    });

    wrap.querySelectorAll(".ege-listening-exam-tfn__stmt").forEach(function (stmt) {
      var letter = stmt.dataset.letter;
      var val = E.getListeningExamTfnValue(prefix, letter);
      stmt.classList.toggle("is-answered", !!val);
    });
  }

E.syncListeningExamSinglePageFooterUI = function syncListeningExamSinglePageFooterUI(taskId) {
    var checkBtn = document.getElementById("check-" + taskId);
    if (checkBtn) checkBtn.hidden = true;
    E.hidePrepNextButton(taskId);
    E.syncResetButton(taskId);
    if (typeof E.syncSaveAnswersButton === "function") E.syncSaveAnswersButton(taskId);
  }

E.buildListeningExamPageBlock = function buildListeningExamPageBlock(label, instructions, content) {
    var block = document.createElement("section");
    block.className = "ege-listening-exam-page__block";

    if (instructions) {
      var instr = document.createElement("p");
      instr.className = "ege-instructions";
      instr.lang = "ru";
      instr.textContent = instructions;
      block.appendChild(instr);
    }

    block.appendChild(content);
    return block;
  }

E.buildListeningExamSinglePageWork = function buildListeningExamSinglePageWork(task, topicId) {
    var stack = document.createElement("div");
    stack.className = "ege-listening-exam-page";
    var parts = [];

    if (task.examMatch) {
      parts.push({
        label: "Listening for main idea",
        instructions: task.examMatch.instructions || "",
        content: E.buildListeningExamMatch(task, topicId),
      });
    }

    if (task.examTfn) {
      parts.push({
        label: "Listening for specific information",
        instructions: task.examTfn.instructions || "",
        content: E.buildListeningExamTfn(task, topicId),
      });
    }

    if (task.questions && task.questions.length) {
      parts.push({
        label: "Full listening comprehension",
        instructions: task.mcInstructions || "",
        content: E.buildWorkPanel(
          "questions",
          E.buildListeningMcStack(task, topicId),
          "ege-panel--listening-mc"
        ),
      });
    }

    var singlePart = parts.length === 1;
    parts.forEach(function (part) {
      stack.appendChild(
        E.buildListeningExamPageBlock(
          singlePart ? "" : part.label,
          singlePart ? "" : part.instructions,
          part.content
        )
      );
    });

    return stack;
  }

E.syncSharedListeningMount = function syncSharedListeningMount(taskId) {
    var task = E.findTask(taskId);
    if (!task || !E.listeningUsesSharedAudio(task)) return;
    var panel = document.getElementById("panel-" + taskId);
    if (!panel) return;
    var wrap = panel.querySelector(".ege-listening-bar__audio, .ege-task-intro__audio");
    if (!wrap) {
      E.mountListeningExamAudio(task, E.state.topicId, panel);
      wrap = panel.querySelector(".ege-listening-bar__audio, .ege-task-intro__audio");
    }
    if (!wrap || !sharedListeningState.bar) return;
    if (wrap.closest(".ege-listening-bar")) {
      sharedListeningState.bar.dataset.workspaceMarks = "true";
    }
    if (sharedListeningState.bar.parentNode !== wrap) {
      if (sharedListeningState.bar.parentNode) {
        sharedListeningState.bar.parentNode.removeChild(sharedListeningState.bar);
      }
      wrap.appendChild(sharedListeningState.bar);
    }
    E.syncSharedListeningSegment(task);
    if (sharedListeningState.bar && sharedListeningState.bar._refreshSeekUI) {
      sharedListeningState.bar._refreshSeekUI();
    }
    if (typeof E.syncExamTimerPlacement === "function") E.syncExamTimerPlacement();
    var listeningBar = wrap && wrap.closest(".ege-listening-bar");
    if (listeningBar) E.mountListeningNotesToPlayerSlot(listeningBar, task.id);
  };

E.mountListeningExamAudio = function mountListeningExamAudio(task, topicId, panel) {
    if (!panel || !task) return;
    var intro = panel.querySelector(".ege-task-intro");
    if (!intro || intro.querySelector(".ege-listening-bar")) return;

    var bar = document.createElement("div");
    bar.className = "ege-listening-bar ege-listening-bar--workspace";

    var audioSlot = document.createElement("div");
    audioSlot.className = "ege-listening-bar__audio";
    if (E.listeningUsesSharedAudio(task)) {
      var sharedBar = E.attachSharedListeningBar(task, topicId);
      sharedBar.dataset.workspaceMarks = "true";
      if (sharedBar.parentNode) sharedBar.parentNode.removeChild(sharedBar);
      audioSlot.appendChild(sharedBar);
      var sharedAudio = sharedBar.querySelector("audio");
      if (sharedAudio) sharedAudio.dispatchEvent(new Event("durationchange"));
    } else {
      audioSlot.appendChild(E.buildListeningAudio(task, topicId, { workspaceMarks: true }));
    }
    bar.appendChild(audioSlot);
    E.mountListeningNotesToPlayerSlot(bar, task.id);

    intro.appendChild(bar);

    if (typeof E.syncExamTimerPlacement === "function") E.syncExamTimerPlacement();

    if (E.showsListeningTranscript() && task.transcript) {
      var lead = intro.querySelector(".ege-task-intro__lead");
      if (lead && !lead.querySelector(".ege-listening-transcript")) {
        lead.appendChild(E.buildListeningTranscript(task));
      }
    }
  }

E.renderListeningExamSinglePage = function renderListeningExamSinglePage(task, topicId, wrap) {
    wrap.classList.add("ege-task--listening-exam-page");

    var step = document.createElement("div");
    step.className = "ege-listening-step ege-listening-step--exam-page";
    step.appendChild(E.buildListeningExamSinglePageWork(task, topicId));
    wrap.appendChild(step);
    wrap.appendChild(E.buildListeningFooter(task));

    var syncAll = function () {
      E.syncListeningExamSinglePageFooterUI(task.id);
      wrap.querySelectorAll(".ege-listening-exam-match").forEach(function (matchWrap) {
        E.syncListeningExamMatchTable(matchWrap);
      });
      wrap.querySelectorAll(".ege-listening-exam-tfn").forEach(function (tfnWrap) {
        E.syncListeningExamTfnRows(tfnWrap);
      });
      if (typeof E.isPlacementExam === "function" && E.isPlacementExam() && typeof E.syncExamPoints === "function") {
        E.syncExamPoints();
      }
      if (typeof E.scheduleTopicNavAlign === "function") E.scheduleTopicNavAlign(task.id);
    };
    wrap.addEventListener("input", syncAll);
    wrap.addEventListener("change", syncAll);
    E.syncListeningExamSinglePageFooterUI(task.id);
    return E.wrapListeningRoot(task, wrap);
  }

E.syncListeningExamMatchFooterUI = function syncListeningExamMatchFooterUI(taskId) {
    var task = E.findTask(taskId);
    if (!task || task.type !== "listening") return;
    if (E.getListeningStepKind(task, E.getListeningStep(taskId)) !== "exam-match") return;

    var checkBtn = document.getElementById("check-" + taskId);
    var placement =
      typeof E.hidesPracticeControls === "function" && E.hidesPracticeControls();
    var complete = E.isListeningExamMatchComplete(taskId);

    if (placement && complete) {
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId);
      E.setListeningRevealVisible(taskId, false);
      E.showPrepNextButton(taskId);
      return;
    }

    if (E.isListeningExamMatchPassed(taskId)) {
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId);
      E.setListeningRevealVisible(taskId, false);
      E.showPrepNextButton(taskId);
      return;
    }

    E.hidePrepNextButton(taskId);
    if (checkBtn) checkBtn.hidden = !complete;
    E.syncResetButton(taskId);
    E.setListeningRevealVisible(taskId, complete);
    if (typeof E.syncSaveAnswersButton === "function") E.syncSaveAnswersButton(taskId);
  }

E.syncListeningExamTfnFooterUI = function syncListeningExamTfnFooterUI(taskId) {
    var task = E.findTask(taskId);
    if (!task || task.type !== "listening") return;
    if (E.getListeningStepKind(task, E.getListeningStep(taskId)) !== "exam-tfn") return;

    var checkBtn = document.getElementById("check-" + taskId);
    var placement =
      typeof E.hidesPracticeControls === "function" && E.hidesPracticeControls();
    var complete = E.isListeningExamTfnComplete(taskId);

    if (placement && complete) {
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId);
      E.setListeningRevealVisible(taskId, false);
      if (E.listeningMcMax(task) > 0) E.showPrepNextButton(taskId);
      else E.hidePrepNextButton(taskId);
      return;
    }

    if (E.isListeningExamTfnPassed(taskId)) {
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId);
      E.setListeningRevealVisible(taskId, false);
      if (E.listeningMcMax(task) > 0) E.showPrepNextButton(taskId);
      else E.hidePrepNextButton(taskId);
      return;
    }

    E.hidePrepNextButton(taskId);
    if (checkBtn) checkBtn.hidden = !complete;
    E.syncResetButton(taskId);
    E.setListeningRevealVisible(taskId, complete);
    if (typeof E.syncSaveAnswersButton === "function") E.syncSaveAnswersButton(taskId);
  }

E.buildListeningProgress = function buildListeningProgress(task) {
    if (!E.listeningHasStageNav(task)) return null;
    var taskId = task.id;
    var nav = document.createElement("nav");
    nav.className = "ege-listening-progress";
    nav.id = "listening-progress-" + taskId;
    nav.setAttribute("aria-label", "Listening stages");

    var track = document.createElement("div");
    track.className = "ege-listening-progress__track";

    var labelMap = {
      "prep-gap": "Gap fill",
      "prep-match": "Matching",
      prep: "Pre-listening",
      listening: "Listening",
      "exam-match": "Listening for main idea",
      "exam-tfn": "Listening for specific information",
      mc: "Full listening comprehension",
    };
    var stages = E.listeningStagePlan(task).map(function (kind, index) {
      return { num: index + 1, label: labelMap[kind] || kind };
    });

    stages.forEach(function (stage, index) {
      if (index > 0) {
        var line = document.createElement("span");
        line.className = "ege-listening-progress__line";
        line.setAttribute("aria-hidden", "true");
        track.appendChild(line);
      }

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ege-listening-progress__step";
      btn.dataset.step = String(stage.num);
      btn.textContent = stage.label;
      btn.addEventListener("click", function () {
        E.setListeningStep(taskId, stage.num);
      });
      track.appendChild(btn);
    });

    nav.appendChild(track);
    return nav;
  }

E.prepGapSlotValue = function prepGapSlotValue(slot) {
    if (!slot) return "";
    return slot.dataset.value || "";
  }

E.setPrepGapSlotValue = function setPrepGapSlotValue(slot, word) {
    if (!slot) return;
    slot.dataset.value = word || "";
    var textEl = slot.querySelector(".ege-prep-gapfill__slot-text");
    if (textEl) textEl.textContent = word || "";
    slot.classList.remove("is-checked-correct", "is-checked-wrong");
    slot.classList.toggle("is-filled", !!word);
  }

E.eachPrepGapInputFilled = function eachPrepGapInputFilled(prefix, items) {
    for (var i = 0; i < items.length; i += 1) {
      var slot = document.getElementById(prefix + "_prep_gf_" + items[i].id);
      if (!slot || !E.normalize(E.prepGapSlotValue(slot))) return false;
    }
    return true;
  }

E.countPrepGapFilled = function countPrepGapFilled(prefix, items) {
    var filled = 0;
    for (var i = 0; i < items.length; i += 1) {
      var slot = document.getElementById(prefix + "_prep_gf_" + items[i].id);
      if (slot && E.normalize(E.prepGapSlotValue(slot))) filled += 1;
    }
    return filled;
  }

E.isPrepMatchingUnlocked = function isPrepMatchingUnlocked(taskId) {
    var task = E.findTask(taskId);
    if (!task || !task.prep) return true;
    if (!task.prep.gapFill || !task.prep.gapFill.items || !task.prep.gapFill.items.length) return true;

    var taskEl = document.getElementById("task-" + taskId);
    return !!(taskEl && taskEl.dataset.prepMatchUnlocked === "1");
  }

E.setPrepMatchingUnlocked = function setPrepMatchingUnlocked(taskId, unlocked) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;
    if (unlocked) taskEl.dataset.prepMatchUnlocked = "1";
    else delete taskEl.dataset.prepMatchUnlocked;
  }

E.isPrepMatchPassed = function isPrepMatchPassed(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    return !!(taskEl && taskEl.dataset.prepMatchPassed === "1");
  }

E.setPrepMatchPassed = function setPrepMatchPassed(taskId, passed) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;
    if (passed) taskEl.dataset.prepMatchPassed = "1";
    else delete taskEl.dataset.prepMatchPassed;
  }

E.isListeningGapsPassed = function isListeningGapsPassed(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    return !!(taskEl && taskEl.dataset.listeningGapsPassed === "1");
  }

E.setListeningGapsPassed = function setListeningGapsPassed(taskId, passed) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;
    if (passed) taskEl.dataset.listeningGapsPassed = "1";
    else delete taskEl.dataset.listeningGapsPassed;
  }

E.isListeningMcPassed = function isListeningMcPassed(taskId) {
    var taskEl = document.getElementById("task-" + taskId);
    return !!(taskEl && taskEl.dataset.listeningMcPassed === "1");
  }

E.setListeningMcPassed = function setListeningMcPassed(taskId, passed) {
    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl) return;
    if (passed) taskEl.dataset.listeningMcPassed = "1";
    else delete taskEl.dataset.listeningMcPassed;
  }

E.fillPrepGapSentence = function fillPrepGapSentence(sentence, answer) {
    return String(sentence || "").replace(/_{2,}/, answer || "");
  }

E.buildPrepGapFillReviewLine = function buildPrepGapFillReviewLine(item, displayNum) {
    var line = document.createElement("p");
    line.className = "ege-prep-gapfill__item ege-prep-gapfill__item--review";

    var num = document.createElement("span");
    num.className = "ege-prep-gapfill__num ege-exam-num";
    num.textContent = displayNum + ".";
    line.appendChild(num);

    var text = document.createElement("span");
    text.className = "ege-prep-gapfill__full";
    var parts = String(item.sentence || "").split(/_{2,}/);
    if (parts[0]) text.appendChild(document.createTextNode(parts[0]));
    var answer = document.createElement("span");
    answer.className = "ege-prep-gapfill__answer";
    answer.textContent = item.answer || "";
    text.appendChild(answer);
    if (parts[1]) text.appendChild(document.createTextNode(parts[1]));
    line.appendChild(text);
    return line;
  }

E.setPrepGapReviewMode = function setPrepGapReviewMode(taskId, enabled) {
    var wrap = document.querySelector("#task-" + taskId + " .ege-prep-gapfill");
    if (!wrap || !wrap._prepGapFillConfig) return;

    var cfg = wrap._prepGapFillConfig;
    var bank = wrap.querySelector(".ege-prep-wordbank");
    var list = wrap.querySelector(".ege-prep-gapfill__items");
    wrap.classList.toggle("is-review", !!enabled);
    if (bank) bank.hidden = !!enabled;
    if (!list) return;

    var layout = E.ensurePrepLayout(taskId, {
      gapFill: {
        items: cfg.items,
        wordBank: cfg.wordBank,
      },
    });

    if (enabled) {
      list.textContent = "";
      E.orderPrepByIds(cfg.items, E.resolvePrepIdOrder(layout.gapItemIds, cfg.items)).forEach(
        function (item, index) {
          list.appendChild(E.buildPrepGapFillReviewLine(item, index + 1));
        }
      );
      return;
    }

    if (bank) {
      bank.hidden = false;
      E.renderPrepWordBank(bank, cfg.wordBank, layout.wordBank);
    }
    E.renderPrepGapFillItems(list, cfg.items, cfg.prefix, layout.gapItemIds);
  }

E.setListeningRevealVisible = function setListeningRevealVisible(taskId, visible) {
    var showBtn = document.getElementById("show-" + taskId);
    if (!showBtn) return;
    if (typeof E.hidesShowAnswers === "function" && E.hidesShowAnswers()) {
      showBtn.hidden = true;
      return;
    }
    showBtn.hidden = !visible;
  }

E.syncListeningPrepFooterUI = function syncListeningPrepFooterUI(taskId) {
    var task = E.findTask(taskId);
    if (!task || task.type !== "listening" || !task.prep) return;

    var kind = E.getListeningStepKind(task, E.getListeningStep(taskId));
    var checkBtn = document.getElementById("check-" + taskId);
    var progressEl = document.getElementById("prep-fill-" + taskId);
    var gapItems = task.prep.gapFill && task.prep.gapFill.items;
    var placement =
      typeof E.hidesPracticeControls === "function" && E.hidesPracticeControls();

    if (kind !== "prep-gap" && kind !== "prep-match" && kind !== "prep") {
      E.hidePrepNextButton(taskId);
      E.syncResetButton(taskId);
      return;
    }

    if (kind === "prep-match") {
      if (progressEl) progressEl.hidden = true;
      if (E.isPrepMatchingComplete(taskId)) {
        if (!E.isPrepMatchPassed(taskId)) {
          E.setPrepMatchPassed(taskId, true);
          if (!placement) {
            var matchCount =
              (task.prep.matching && task.prep.matching.expressions
                ? task.prep.matching.expressions.length
                : 0) || 0;
            if (matchCount) {
              var taskElMatch = document.getElementById("task-" + taskId);
              if (!(taskElMatch && taskElMatch.dataset.revealedStep === "1")) {
                E.showScoreFeedback(taskId, matchCount, matchCount);
              }
            }
          }
          E.syncListeningProgressUI(taskId);
        }
        if (checkBtn) checkBtn.hidden = true;
        E.syncResetButton(taskId);
        E.setListeningRevealVisible(taskId, false);
        E.showPrepNextButton(taskId);
        return;
      }
      if (checkBtn) checkBtn.hidden = placement || true;
      E.hidePrepNextButton(taskId);
      E.syncResetButton(taskId);
      E.setListeningRevealVisible(taskId, true);
      return;
    }

    if (kind === "prep" && E.isPrepMatchingUnlocked(taskId)) {
      if (progressEl) progressEl.hidden = true;
      if (E.isPrepMatchingComplete(taskId)) {
        if (!E.isPrepMatchPassed(taskId)) {
          E.setPrepMatchPassed(taskId, true);
          if (!placement) {
            var prepMatchCount =
              (task.prep.matching && task.prep.matching.expressions
                ? task.prep.matching.expressions.length
                : 0) || 0;
            if (prepMatchCount) {
              var taskElPrepMatch = document.getElementById("task-" + taskId);
              if (!(taskElPrepMatch && taskElPrepMatch.dataset.revealedStep === "1")) {
                E.showScoreFeedback(taskId, prepMatchCount, prepMatchCount);
              }
            }
          }
          E.syncListeningProgressUI(taskId);
        }
        if (checkBtn) checkBtn.hidden = true;
        E.syncResetButton(taskId);
        E.setListeningRevealVisible(taskId, false);
        E.showPrepNextButton(taskId);
        return;
      }
      if (checkBtn) checkBtn.hidden = placement || true;
      E.hidePrepNextButton(taskId);
      E.syncResetButton(taskId);
      E.setListeningRevealVisible(taskId, true);
      return;
    }

    if (kind === "prep-gap" && E.isPrepMatchingUnlocked(taskId)) {
      if (progressEl) progressEl.hidden = true;
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId);
      E.setListeningRevealVisible(taskId, false);
      E.showPrepNextButton(taskId);
      return;
    }

    E.hidePrepNextButton(taskId);
    E.syncResetButton(taskId);
    E.setListeningRevealVisible(taskId, true);

    if (!gapItems || !gapItems.length) {
      var prepReady = E.isListeningPrepComplete(taskId);
      if (progressEl) progressEl.hidden = true;
      if (checkBtn) checkBtn.hidden = !prepReady;
      return;
    }

    var prefix = E.taskPrefix(taskId);
    var total = gapItems.length;
    var filled = E.countPrepGapFilled(prefix, gapItems);
    var gapReady = filled === total;

    if (placement && kind === "prep-gap" && gapReady) {
      if (progressEl) progressEl.hidden = true;
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId);
      E.setListeningRevealVisible(taskId, false);
      E.showPrepNextButton(taskId);
      return;
    }

    if (progressEl) {
      progressEl.textContent = filled + " / " + total;
      progressEl.hidden = gapReady;
    }

    if (checkBtn) checkBtn.hidden = placement || !gapReady;
  }

E.syncListeningGapsFooterUI = function syncListeningGapsFooterUI(taskId) {
    var task = E.findTask(taskId);
    if (!task || task.type !== "listening") return;
    if (E.getListeningStepKind(task, E.getListeningStep(taskId)) !== "listening") return;

    var checkBtn = document.getElementById("check-" + taskId);
    var placement =
      typeof E.hidesPracticeControls === "function" && E.hidesPracticeControls();
    var prefix = E.taskPrefix(taskId);
    var gaps = E.getActiveListeningGaps(task);
    var gapsFilled =
      !gaps.length ||
      gaps.every(function (gap) {
        var input = document.getElementById(prefix + "_gap_" + gap.num);
        return input && E.normalize(input.value);
      });

    if (placement && gapsFilled) {
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId);
      E.setListeningRevealVisible(taskId, false);
      if (E.listeningMcMax(task) > 0) E.showPrepNextButton(taskId);
      else E.hidePrepNextButton(taskId);
      return;
    }

    if (E.isListeningGapsPassed(taskId)) {
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId);
      E.setListeningRevealVisible(taskId, false);
      if (E.listeningMcMax(task) > 0) E.showPrepNextButton(taskId);
      else E.hidePrepNextButton(taskId);
      return;
    }

    E.hidePrepNextButton(taskId);
    if (checkBtn) checkBtn.hidden = false;
    E.syncResetButton(taskId);
    E.setListeningRevealVisible(taskId, true);
  }

E.isListeningMcComplete = function isListeningMcComplete(taskId) {
    var task = E.findTask(taskId);
    if (!task || !task.questions || !task.questions.length) return true;
    var prefix = E.taskPrefix(taskId);
    for (var i = 0; i < task.questions.length; i += 1) {
      if (!E.getCheckedValue(prefix + "_q_" + i)) return false;
    }
    return true;
  }

E.hasNextInterview = function hasNextInterview(taskId) {
    if (!E.state.topic || !E.state.topic.tasks) return false;
    var ids = E.state.topic.tasks.map(function (task) {
      return task.id;
    });
    var idx = ids.indexOf(taskId);
    return idx >= 0 && idx < ids.length - 1;
  }

E.hideListeningFinishButtons = function hideListeningFinishButtons(taskId) {
    var nextInterviewBtn = document.getElementById("next-interview-" + taskId);
    if (E.prepNextPulseTimers["interview-" + taskId]) {
      window.clearTimeout(E.prepNextPulseTimers["interview-" + taskId]);
      delete E.prepNextPulseTimers["interview-" + taskId];
    }
    if (nextInterviewBtn) {
      nextInterviewBtn.hidden = true;
      nextInterviewBtn.classList.remove("ege-btn--pulse");
    }
  }

E.syncListeningMcFooterUI = function syncListeningMcFooterUI(taskId) {
    var task = E.findTask(taskId);
    if (!task || task.type !== "listening") return;
    if (E.getListeningStepKind(task, E.getListeningStep(taskId)) !== "mc") return;

    var checkBtn = document.getElementById("check-" + taskId);
    var showBtn = document.getElementById("show-" + taskId);
    var nextInterviewBtn = document.getElementById("next-interview-" + taskId);
    var placement =
      typeof E.hidesPracticeControls === "function" && E.hidesPracticeControls();

    E.hidePrepNextButton(taskId);

    if (placement && E.isListeningMcComplete(taskId)) {
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId);
      if (showBtn) showBtn.hidden = true;
      if (nextInterviewBtn) {
        var canNextPlacement = E.hasNextInterview(taskId);
        nextInterviewBtn.hidden = !canNextPlacement;
      }
      if (typeof E.syncSaveAnswersButton === "function") E.syncSaveAnswersButton(taskId);
      return;
    }

    if (E.isListeningMcPassed(taskId)) {
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId);
      if (showBtn) showBtn.hidden = true;
      if (nextInterviewBtn) {
        var canNext = E.hasNextInterview(taskId);
        nextInterviewBtn.hidden = !canNext;
        if (
          canNext &&
          !nextInterviewBtn.classList.contains("ege-btn--pulse") &&
          !E.prepNextPulseTimers["interview-" + taskId]
        ) {
          E.prepNextPulseTimers["interview-" + taskId] = window.setTimeout(function () {
            delete E.prepNextPulseTimers["interview-" + taskId];
            var btn = document.getElementById("next-interview-" + taskId);
            if (btn && !btn.hidden) btn.classList.add("ege-btn--pulse");
          }, 2000);
        }
      }
      if (typeof E.syncSaveAnswersButton === "function") E.syncSaveAnswersButton(taskId);
      return;
    }

    E.hideListeningFinishButtons(taskId);
    E.syncResetButton(taskId);
    if (checkBtn) checkBtn.hidden = !E.isListeningMcComplete(taskId);
    if (showBtn) {
      showBtn.hidden =
        typeof E.hidesShowAnswers === "function" && E.hidesShowAnswers();
    }
    if (typeof E.syncSaveAnswersButton === "function") E.syncSaveAnswersButton(taskId);
  }

E.isListeningPrepGapFillComplete = function isListeningPrepGapFillComplete(taskId) {
    var task = E.findTask(taskId);
    if (!task || !task.prep || !task.prep.gapFill || !task.prep.gapFill.items) return true;
    return E.eachPrepGapInputFilled(E.taskPrefix(taskId), task.prep.gapFill.items);
  }

E.syncListeningPrepVisibility = function syncListeningPrepVisibility(taskId) {
    var task = E.findTask(taskId);
    var taskEl = document.getElementById("task-" + taskId);
    if (!task || !taskEl) return;

    var gapPanel = taskEl.querySelector(".ege-panel--prep-gapfill");
    var matchPanel = taskEl.querySelector(".ege-panel--prep-match");
    var kind = E.getListeningStepKind(task, E.getListeningStep(taskId));

    if (E.taskHasSplitPrep(task)) {
      if (gapPanel) gapPanel.hidden = kind !== "prep-gap";
      if (matchPanel) {
        matchPanel.hidden = kind !== "prep-match" || !E.isPrepMatchingUnlocked(taskId);
      }
      return;
    }

    if (matchPanel) matchPanel.hidden = !E.isPrepMatchingUnlocked(taskId);
  }

E.isListeningPrepComplete = function isListeningPrepComplete(taskId) {
    var task = E.findTask(taskId);
    if (!task || !task.prep) return true;

    var prefix = E.taskPrefix(taskId);
    var prep = task.prep;

    if (prep.gapFill && prep.gapFill.items && prep.gapFill.items.length) {
      if (!E.isPrepMatchingUnlocked(taskId)) return false;
    }

    if (prep.matching && prep.matching.expressions) {
      for (var j = 0; j < prep.matching.expressions.length; j += 1) {
        var expr = prep.matching.expressions[j];
        if (!E.getCheckedValue(prefix + "_prep_m_" + expr.id)) return false;
      }
    }

    return true;
  }

E.attachListeningPrepGapFill = function attachListeningPrepGapFill(wrap) {
    var bank = wrap.querySelector(".ege-prep-wordbank");
    var list = wrap.querySelector(".ege-prep-gapfill__items");
    if (!bank || !list) return;

    var pickedChip = null;
    var dragWord = null;
    var activeDrop = null;
    var live = wrap.querySelector(".ege-prep-gapfill-live");

    function prepTaskId() {
      var taskEl = wrap.closest(".ege-task");
      return taskEl ? taskEl.dataset.taskId : null;
    }

    function getChips() {
      return Array.prototype.slice.call(wrap.querySelectorAll(".ege-prep-wordbank__word"));
    }

    function getDrops() {
      return Array.prototype.slice.call(wrap.querySelectorAll(".ege-prep-gapfill__slot"));
    }

    function notifyChange() {
      wrap.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function announce(message) {
      if (live) live.textContent = message;
    }

    function updateProgress() {
      notifyChange();
      var taskId = prepTaskId();
      if (taskId) {
        E.syncListeningPrepFooterUI(taskId);
        if (typeof E.isPlacementExam === "function" && E.isPlacementExam() && typeof E.syncExamPoints === "function") {
          E.syncExamPoints();
        }
      }
    }

    function chipIsAvailable(chip) {
      return chip && !chip.classList.contains("is-used");
    }

    function findAvailableChip(word) {
      var chips = getChips();
      for (var i = 0; i < chips.length; i += 1) {
        if (chips[i].dataset.word === word && chipIsAvailable(chips[i])) return chips[i];
      }
      return null;
    }

    function setChipUsed(word, used) {
      getChips().forEach(function (chip) {
        if (chip.dataset.word !== word) return;
        chip.classList.toggle("is-used", used);
        chip.classList.remove("is-selected");
        chip.setAttribute("aria-pressed", used ? "true" : "false");
        if (used) chip.draggable = false;
        else chip.draggable = true;
      });
    }

    function releaseWord(word) {
      if (!word) return;
      setChipUsed(word, false);
    }

    function resetDropAppearance(drop) {
      drop.classList.remove("is-filled", "is-checked-correct", "is-checked-wrong", "is-dragover");
      drop.removeAttribute("title");
    }

    function gapLabel(drop) {
      return drop.getAttribute("aria-label") || "gap";
    }

    function clearDrop(drop) {
      var word = E.prepGapSlotValue(drop);
      if (!drop || !word) return;
      releaseWord(word);
      E.setPrepGapSlotValue(drop, "");
      resetDropAppearance(drop);
      var taskId = prepTaskId();
      if (taskId) E.resetPrepGapFeedback(taskId);
      updateProgress();
      announce(gapLabel(drop) + " cleared. " + word + " returned to word bank.");
    }

    function assignWord(drop, word) {
      if (!word || !drop) return;
      if (!findAvailableChip(word) && E.prepGapSlotValue(drop) !== word) return;

      getDrops().forEach(function (slot) {
        if (slot !== drop && E.prepGapSlotValue(slot) === word) {
          E.setPrepGapSlotValue(slot, "");
          resetDropAppearance(slot);
        }
      });

      var current = E.prepGapSlotValue(drop);
      if (current && current !== word) releaseWord(current);

      var taskId = prepTaskId();
      if (taskId) E.resetPrepGapFeedback(taskId);

      E.setPrepGapSlotValue(drop, word);
      setChipUsed(word, true);
      drop.classList.remove("is-dragover");
      drop.removeAttribute("title");
      updateProgress();
      announce(word + " placed in " + gapLabel(drop) + ".");
    }

    function clearDragover() {
      getDrops().forEach(function (drop) {
        drop.classList.remove("is-dragover");
      });
      bank.classList.remove("is-dragover");
    }

    function selectChip(chip) {
      if (!chipIsAvailable(chip)) return;
      if (pickedChip === chip) {
        pickedChip.classList.remove("is-selected");
        pickedChip.setAttribute("aria-pressed", "false");
        pickedChip = null;
        return;
      }
      getChips().forEach(function (item) {
        item.classList.remove("is-selected");
        item.setAttribute("aria-pressed", "false");
      });
      pickedChip = chip;
      chip.classList.add("is-selected");
      chip.setAttribute("aria-pressed", "true");
    }

    function syncActiveDropUI() {
      getDrops().forEach(function (drop) {
        drop.classList.toggle("is-active", drop === activeDrop);
      });
    }

    function setActiveDrop(numStr) {
      var idx = parseInt(numStr, 10) - 1;
      var drops = getDrops();
      if (idx < 0 || idx >= drops.length) return;
      activeDrop = drops[idx];
      syncActiveDropUI();
      activeDrop.focus();
      announce("Sentence " + numStr + " selected");
    }

    function refreshPickSlots() {
      wrap._pickSlots = getDrops().map(function (_drop, index) {
        return String(index + 1);
      });
      wrap._pickMaxOption = Math.max(
        (wrap._prepGapFillConfig && wrap._prepGapFillConfig.wordBank
          ? wrap._prepGapFillConfig.wordBank.length
          : 0),
        wrap._pickSlots.length
      );
    }

    function activateDrop(drop) {
      if (pickedChip) {
        assignWord(drop, pickedChip.dataset.word);
        pickedChip.classList.remove("is-selected");
        pickedChip.setAttribute("aria-pressed", "false");
        pickedChip = null;
        activeDrop = null;
        syncActiveDropUI();
        return;
      }
      activeDrop = drop;
      syncActiveDropUI();
      if (E.prepGapSlotValue(drop)) clearDrop(drop);
    }

    wrap.resetPrepGapFill = function () {
      activeDrop = null;
      getDrops().forEach(function (drop) {
        var word = E.prepGapSlotValue(drop);
        if (word) releaseWord(word);
        E.setPrepGapSlotValue(drop, "");
        resetDropAppearance(drop);
      });
      pickedChip = null;
      dragWord = null;
      getChips().forEach(function (chip) {
        chip.classList.remove("is-selected", "is-used", "is-dragging");
        chip.setAttribute("aria-pressed", "false");
        chip.draggable = true;
      });
      if (wrap._prepGapFillConfig) {
        var layout = E.ensurePrepLayout(wrap.dataset.prepTaskId, {
          gapFill: {
            items: wrap._prepGapFillConfig.items,
            wordBank: wrap._prepGapFillConfig.wordBank,
          },
        });
        E.renderPrepWordBank(bank, wrap._prepGapFillConfig.wordBank, layout.wordBank);
        E.renderPrepGapFillItems(
          list,
          wrap._prepGapFillConfig.items,
          wrap._prepGapFillConfig.prefix,
          layout.gapItemIds
        );
      }
      clearDragover();
      updateProgress();
      if (live) live.textContent = "";
    };

    wrap.fillCorrectAnswers = function () {
      var cfg = wrap._prepGapFillConfig;
      if (!cfg || !cfg.items || !cfg.prefix) return;
      if (wrap.classList.contains("is-review")) return;
      cfg.items.forEach(function (item) {
        var drop = document.getElementById(cfg.prefix + "_prep_gf_" + item.id);
        if (drop) assignWord(drop, item.answer);
      });
    };

    wrap.addEventListener("dragstart", function (event) {
      var chip = event.target.closest(".ege-prep-wordbank__word");
      if (!chip || !wrap.contains(chip)) return;
      if (!chipIsAvailable(chip)) {
        event.preventDefault();
        return;
      }
      dragWord = chip.dataset.word;
      chip.classList.add("is-dragging");
      event.dataTransfer.setData("text/plain", dragWord);
      event.dataTransfer.effectAllowed = "move";
    });

    wrap.addEventListener("dragend", function (event) {
      var chip = event.target.closest(".ege-prep-wordbank__word");
      if (!chip || !wrap.contains(chip)) return;
      chip.classList.remove("is-dragging");
      dragWord = null;
      clearDragover();
    });

    wrap.addEventListener("dragover", function (event) {
      var drop = event.target.closest(".ege-prep-gapfill__slot");
      var bankEl = event.target.closest(".ege-prep-wordbank");
      if (!drop && !bankEl) return;
      event.preventDefault();
      clearDragover();
      if (drop) {
        drop.classList.add("is-dragover");
        event.dataTransfer.dropEffect = "move";
      } else {
        bank.classList.add("is-dragover");
      }
    });

    wrap.addEventListener("drop", function (event) {
      var drop = event.target.closest(".ege-prep-gapfill__slot");
      var bankEl = event.target.closest(".ege-prep-wordbank");
      if (!drop && !bankEl) return;
      event.preventDefault();
      clearDragover();
      var word = event.dataTransfer.getData("text/plain") || dragWord;
      if (drop && word) {
        assignWord(drop, word);
        if (pickedChip) {
          pickedChip.classList.remove("is-selected");
          pickedChip.setAttribute("aria-pressed", "false");
        }
        pickedChip = null;
        return;
      }
      if (bankEl && word) {
        getDrops().forEach(function (slot) {
          if (E.prepGapSlotValue(slot) === word) clearDrop(slot);
        });
      }
    });

    wrap.addEventListener("click", function (event) {
      var chip = event.target.closest(".ege-prep-wordbank__word");
      var drop = event.target.closest(".ege-prep-gapfill__slot");
      if (chip && wrap.contains(chip)) {
        selectChip(chip);
        return;
      }
      if (drop && wrap.contains(drop)) activateDrop(drop);
    });

    wrap.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      var chip = event.target.closest(".ege-prep-wordbank__word");
      var drop = event.target.closest(".ege-prep-gapfill__slot");
      if (!chip && !drop) return;
      event.preventDefault();
      if (chip && wrap.contains(chip)) selectChip(chip);
      else if (drop && wrap.contains(drop)) activateDrop(drop);
    });

    wrap.classList.add("ege-picks-controller");
    wrap.refreshPickSlots = refreshPickSlots;
    wrap.getActiveGap = function () {
      if (!activeDrop) return "";
      var drops = getDrops();
      var idx = drops.indexOf(activeDrop);
      return idx >= 0 ? String(idx + 1) : "";
    };
    wrap.setActiveGap = setActiveDrop;
    wrap.activateGap = setActiveDrop;
    wrap.assignNumber = function (num) {
      refreshPickSlots();
      var drops = getDrops();
      if (!activeDrop) {
        if (num <= drops.length) setActiveDrop(String(num));
        return;
      }
      if (pickedChip) {
        assignWord(activeDrop, pickedChip.dataset.word);
        pickedChip.classList.remove("is-selected");
        pickedChip.setAttribute("aria-pressed", "false");
        pickedChip = null;
        activeDrop = null;
        syncActiveDropUI();
        return;
      }
      var available = getChips().filter(chipIsAvailable);
      if (num > 0 && num <= available.length) {
        assignWord(activeDrop, available[num - 1].dataset.word);
        activeDrop = null;
        syncActiveDropUI();
      }
    };
    refreshPickSlots();

    updateProgress();
  }

E.ensurePrepLayout = function ensurePrepLayout(taskId, prep) {
    if (!E.state.prepLayouts[taskId]) E.state.prepLayouts[taskId] = {};
    var layout = E.state.prepLayouts[taskId];
    var gapItems = prep.gapFill && prep.gapFill.items;
    if (gapItems && gapItems.length && !layout.gapItemIds) {
      layout.gapItemIds = E.shuffleList(E.prepItemIds(gapItems));
    }
    var wordBank = prep.gapFill && prep.gapFill.wordBank;
    if (wordBank && wordBank.length && !layout.wordBank) {
      layout.wordBank = E.shuffleList(wordBank.slice());
    }
    return layout;
  }

E.buildListeningPrepGapFill = function buildListeningPrepGapFill(prep, topicId, taskId) {
    var gapFill = prep.gapFill;
    if (!gapFill) return null;

    var prefix = topicId + "_" + taskId;
    var wrap = document.createElement("div");
    wrap.className = "ege-prep-gapfill";
    wrap.dataset.prepTaskId = taskId;

    wrap._prepGapFillConfig = {
      items: gapFill.items || [],
      wordBank: gapFill.wordBank || [],
      prefix: prefix,
    };

    var itemCount = (gapFill.items || []).length;
    if (itemCount) {
      var live = document.createElement("p");
      live.className = "ege-prep-gapfill-live ege-match-hidden";
      live.setAttribute("aria-live", "polite");
      live.setAttribute("aria-atomic", "true");
      wrap.appendChild(live);
    }

    var layout = E.ensurePrepLayout(taskId, prep);

    if (gapFill.wordBank && gapFill.wordBank.length) {
      var bank = document.createElement("div");
      bank.className = "ege-prep-wordbank";
      bank.setAttribute("aria-label", "Word bank");
      E.renderPrepWordBank(bank, gapFill.wordBank, layout.wordBank);
      wrap.appendChild(bank);
    }

    var list = document.createElement("div");
    list.className = "ege-prep-gapfill__items";
    E.renderPrepGapFillItems(list, gapFill.items || [], prefix, layout.gapItemIds);
    wrap.appendChild(list);
    E.attachListeningPrepGapFill(wrap);
    return wrap;
  }

E.shuffleList = function shuffleList(items) {
    var list = items.slice();
    for (var i = list.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

E.seededShuffleList = function seededShuffleList(items, seed) {
    var list = items.slice();
    var hash = 0;
    for (var s = 0; s < seed.length; s += 1) {
      hash = ((hash << 5) - hash + seed.charCodeAt(s)) | 0;
    }
    for (var i = list.length - 1; i > 0; i -= 1) {
      hash = (hash * 1103515245 + 12345) | 0;
      var j = Math.abs(hash) % (i + 1);
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

E.compareMeaningIds = function compareMeaningIds(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }

E.sortedMeanings = function sortedMeanings(meanings) {
    return meanings.slice().sort(function (a, b) {
      return E.compareMeaningIds(a.id, b.id);
    });
  }

E.shuffleMatchingMeaningContent = function shuffleMatchingMeaningContent(matching, seed) {
    var meanings = matching.meanings || [];
    var answers = matching.answers || {};
    if (meanings.length < 2) return;

    var ordered = E.sortedMeanings(meanings);
    var originalTextById = {};
    meanings.forEach(function (meaning) {
      originalTextById[meaning.id] = meaning.text;
    });

    var texts = ordered.map(function (meaning) {
      return originalTextById[meaning.id];
    });
    var shuffledTexts = E.seededShuffleList(texts, seed || "matching");
    if (shuffledTexts.every(function (text, index) {
      return text === texts[index];
    })) {
      shuffledTexts.push(shuffledTexts.shift());
    }

    ordered.forEach(function (meaning, index) {
      meaning.text = shuffledTexts[index];
    });

    var letterForText = {};
    ordered.forEach(function (meaning) {
      letterForText[meaning.text] = meaning.id;
    });

    Object.keys(answers).forEach(function (exprId) {
      var originalLetter = answers[exprId];
      var targetText = originalTextById[originalLetter];
      if (targetText && letterForText[targetText]) {
        answers[exprId] = letterForText[targetText];
      }
    });
  }

E.orderPrepByIds = function orderPrepByIds(items, idOrder) {
    var map = {};
    items.forEach(function (item) {
      map[item.id] = item;
    });
    return idOrder
      .map(function (id) {
        return map[id];
      })
      .filter(Boolean);
  }

E.prepItemIds = function prepItemIds(items) {
    return items.map(function (item) {
      return item.id;
    });
  }

E.resolvePrepIdOrder = function resolvePrepIdOrder(idOrder, items) {
    if (idOrder && idOrder.length) return idOrder.slice();
    return E.shuffleList(E.prepItemIds(items));
  }

E.renderPrepWordBank = function renderPrepWordBank(bank, words, wordOrder) {
    bank.textContent = "";
    var ordered =
      wordOrder && wordOrder.length ? wordOrder.slice() : E.shuffleList(words.slice());
    ordered.forEach(function (word) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ege-prep-wordbank__word";
      chip.draggable = true;
      chip.dataset.word = word;
      chip.setAttribute("aria-pressed", "false");
      chip.textContent = word;
      bank.appendChild(chip);
    });
  }

E.buildPrepGapFillLine = function buildPrepGapFillLine(item, prefix, displayNum) {
    var line = document.createElement("p");
    line.className = "ege-prep-gapfill__item";

    var num = document.createElement("span");
    num.className = "ege-prep-gapfill__num ege-exam-num";
    num.textContent = displayNum + ".";
    line.appendChild(num);

    var parts = String(item.sentence || "").split(/_{2,}/);
    if (parts[0]) line.appendChild(document.createTextNode(parts[0]));

    var slot = document.createElement("button");
    slot.type = "button";
    slot.className = "ege-prep-gapfill__slot";
    slot.id = prefix + "_prep_gf_" + item.id;
    slot.setAttribute("aria-label", "Gap " + displayNum);

    var slotText = document.createElement("span");
    slotText.className = "ege-prep-gapfill__slot-text";
    slot.appendChild(slotText);
    line.appendChild(slot);

    if (parts[1]) line.appendChild(document.createTextNode(parts[1]));
    return line;
  }

E.renderPrepGapFillItems = function renderPrepGapFillItems(list, items, prefix, idOrder) {
    list.textContent = "";
    E.orderPrepByIds(items, E.resolvePrepIdOrder(idOrder, items)).forEach(function (item, index) {
      list.appendChild(E.buildPrepGapFillLine(item, prefix, index + 1));
    });
  }

E.buildPrepPairCard = function buildPrepPairCard(kind, badge, text, id) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "ege-prep-pair-card";
    card.setAttribute("aria-pressed", "false");

    if (kind === "expr") {
      card.dataset.exprId = String(id);
      card.setAttribute("aria-label", "Expression " + id + ": " + text);
    } else {
      card.dataset.meanId = String(id);
      card.setAttribute("aria-label", "Meaning " + id + ": " + text);
    }

    var badgeEl = document.createElement("span");
    badgeEl.className = "ege-prep-pair-badge";
    badgeEl.textContent = badge;
    badgeEl.setAttribute("aria-hidden", "true");

    var textEl = document.createElement("span");
    textEl.className = "ege-prep-pair-text";
    textEl.textContent = text;

    card.appendChild(badgeEl);
    card.appendChild(textEl);

    var link = document.createElement("span");
    link.className = "ege-prep-pair-link";
    link.hidden = true;
    link.setAttribute("aria-hidden", "true");
    card.appendChild(link);

    return card;
  }

E.orderedPrepExpressions = function orderedPrepExpressions(expressions, idOrder) {
    if (idOrder && idOrder.length) return E.orderPrepByIds(expressions, idOrder);
    return expressions.slice().sort(function (a, b) {
      return a.id - b.id;
    });
  }

E.renderPrepExpressions = function renderPrepExpressions(exprCol, expressions, idOrder) {
    exprCol.textContent = "";
    E.orderedPrepExpressions(expressions, idOrder).forEach(function (expr) {
      exprCol.appendChild(E.buildPrepPairCard("expr", String(expr.id), expr.text, expr.id));
    });
  }

E.renderPrepMeanings = function renderPrepMeanings(meanCol, meanings) {
    meanCol.textContent = "";
    E.sortedMeanings(meanings).forEach(function (meaning) {
      meanCol.appendChild(E.buildPrepPairCard("mean", meaning.id, meaning.text, meaning.id));
    });
  }

E.attachListeningPrepPairing = function attachListeningPrepPairing(wrap, config) {
    var prefix = config.prefix;
    var answers = config.answers;
    var expressions = config.expressions;
    var meanings = config.meanings;
    var total = expressions.length;
    var exprCol = wrap.querySelector(".ege-prep-pair-col--expr");
    var meanCol = wrap.querySelector(".ege-prep-pair-col--mean");
    var hidden = wrap.querySelector(".ege-prep-pair-hidden");
    var countEl = wrap.querySelector(".ege-prep-pair-count");
    var live = wrap.querySelector(".ege-prep-pair-live");

    var selectedExpr = null;
    var selectedMean = null;
    var matchedCount = 0;

    expressions.forEach(function (expr) {
      var group = document.createElement("div");
      group.className = "ege-choice-group ege-choice-group--inline";
      group.setAttribute("role", "radiogroup");
      meanings.forEach(function (meaning) {
        var label = document.createElement("label");
        label.className = "ege-pill";
        var input = document.createElement("input");
        input.type = "radio";
        input.name = prefix + "_" + expr.id;
        input.value = meaning.id;
        label.appendChild(input);
        label.appendChild(document.createTextNode(meaning.id));
        group.appendChild(label);
      });
      hidden.appendChild(group);
    });

    function notifyChange() {
      wrap.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function announce(message) {
      if (live) live.textContent = message;
    }

    function updateProgress() {
      if (countEl) countEl.textContent = matchedCount + " / " + total + " matched";
      notifyChange();
      var taskId = wrap.dataset.prepTaskId;
      if (taskId && E.isPrepMatchingUnlocked(taskId)) E.syncListeningPrepFooterUI(taskId);
    }

    function exprCards() {
      return wrap.querySelectorAll(".ege-prep-pair-card[data-expr-id]");
    }

    function meanCards() {
      return wrap.querySelectorAll(".ege-prep-pair-card[data-mean-id]");
    }

    function clearSelection() {
      selectedExpr = null;
      selectedMean = null;
      exprCards().forEach(function (card) {
        if (!card.disabled) {
          card.classList.remove("is-selected");
          card.setAttribute("aria-pressed", "false");
        }
      });
      meanCards().forEach(function (card) {
        if (!card.disabled) {
          card.classList.remove("is-selected");
          card.setAttribute("aria-pressed", "false");
        }
      });
    }

    function alignMatchedColumns() {
      var orderedExprs = Array.prototype.slice.call(exprCards());
      orderedExprs.forEach(function (exprCard) {
        var letter = answers[String(exprCard.dataset.exprId)];
        if (!letter) return;
        var meanCard = wrap.querySelector(
          '.ege-prep-pair-card[data-mean-id="' + letter + '"]'
        );
        if (meanCard && meanCard.parentElement === meanCol) {
          meanCol.appendChild(meanCard);
        }
      });
    }

    function lockPair(exprCard, meanCard, letter) {
      exprCard.classList.add("is-matched");
      exprCard.classList.remove("is-selected", "is-error");
      exprCard.setAttribute("aria-pressed", "true");
      exprCard.disabled = true;

      meanCard.classList.add("is-matched");
      meanCard.classList.remove("is-selected", "is-error");
      meanCard.setAttribute("aria-pressed", "true");
      meanCard.disabled = true;

      var exprLink = exprCard.querySelector(".ege-prep-pair-link");
      if (exprLink) {
        exprLink.textContent = "→ " + letter;
        exprLink.hidden = false;
      }
      var meanLink = meanCard.querySelector(".ege-prep-pair-link");
      if (meanLink) {
        meanLink.textContent = "← " + exprCard.dataset.exprId;
        meanLink.hidden = false;
      }

      E.setRadioValue(prefix + "_" + exprCard.dataset.exprId, letter);
      matchedCount += 1;
      if (matchedCount >= total) alignMatchedColumns();
      updateProgress();
      announce("Expression " + exprCard.dataset.exprId + " matched with " + letter + ". Correct.");
    }

    function flashError(exprCard, meanCard) {
      exprCard.classList.add("is-error");
      meanCard.classList.add("is-error");
      announce("Incorrect match. Try again.");
      window.setTimeout(function () {
        exprCard.classList.remove("is-error", "is-selected");
        meanCard.classList.remove("is-error", "is-selected");
        clearSelection();
      }, 400);
    }

    function tryPair(exprCard, meanCard) {
      var exprId = exprCard.dataset.exprId;
      var letter = meanCard.dataset.meanId;
      if (answers[String(exprId)] === letter) {
        lockPair(exprCard, meanCard, letter);
        clearSelection();
      } else {
        flashError(exprCard, meanCard);
      }
    }

    function selectExpr(card) {
      if (card.classList.contains("is-selected")) {
        card.classList.remove("is-selected");
        card.setAttribute("aria-pressed", "false");
        selectedExpr = null;
        return;
      }
      if (selectedMean) {
        tryPair(card, selectedMean);
        return;
      }
      exprCards().forEach(function (other) {
        if (other !== card && !other.disabled) {
          other.classList.remove("is-selected");
          other.setAttribute("aria-pressed", "false");
        }
      });
      card.classList.add("is-selected");
      card.setAttribute("aria-pressed", "true");
      selectedExpr = card;
      selectedMean = null;
      meanCards().forEach(function (other) {
        if (!other.disabled) {
          other.classList.remove("is-selected");
          other.setAttribute("aria-pressed", "false");
        }
      });
    }

    function selectMean(card) {
      if (card.classList.contains("is-selected")) {
        card.classList.remove("is-selected");
        card.setAttribute("aria-pressed", "false");
        selectedMean = null;
        return;
      }
      if (selectedExpr) {
        tryPair(selectedExpr, card);
        return;
      }
      meanCards().forEach(function (other) {
        if (other !== card && !other.disabled) {
          other.classList.remove("is-selected");
          other.setAttribute("aria-pressed", "false");
        }
      });
      card.classList.add("is-selected");
      card.setAttribute("aria-pressed", "true");
      selectedMean = card;
      selectedExpr = null;
      exprCards().forEach(function (other) {
        if (!other.disabled) {
          other.classList.remove("is-selected");
          other.setAttribute("aria-pressed", "false");
        }
      });
    }

    wrap.addEventListener("click", function (event) {
      var exprCard = event.target.closest(".ege-prep-pair-card[data-expr-id]");
      var meanCard = event.target.closest(".ege-prep-pair-card[data-mean-id]");
      if (exprCard && !exprCard.disabled) {
        selectExpr(exprCard);
        return;
      }
      if (meanCard && !meanCard.disabled) {
        selectMean(meanCard);
      }
    });

    wrap.resetPrepMatch = function () {
      matchedCount = 0;
      clearSelection();
      exprCards().forEach(function (card) {
        card.disabled = false;
        card.classList.remove("is-matched", "is-selected", "is-error", "is-correct", "is-wrong");
        card.setAttribute("aria-pressed", "false");
        E.clearChoiceGroup(prefix + "_" + card.dataset.exprId);
      });
      meanCards().forEach(function (card) {
        card.disabled = false;
        card.classList.remove("is-matched", "is-selected", "is-error", "is-correct", "is-wrong");
        card.setAttribute("aria-pressed", "false");
      });
      E.renderPrepExpressions(exprCol, expressions);
      E.renderPrepMeanings(meanCol, meanings);
      updateProgress();
      if (live) live.textContent = "";
    };

    wrap.fillCorrectAnswers = function () {
      Object.keys(answers).forEach(function (exprId) {
        var letter = answers[exprId];
        var exprCard = wrap.querySelector(
          '.ege-prep-pair-card[data-expr-id="' + exprId + '"]'
        );
        var meanCard = wrap.querySelector(
          '.ege-prep-pair-card[data-mean-id="' + letter + '"]'
        );
        if (exprCard && meanCard && !exprCard.disabled) {
          lockPair(exprCard, meanCard, letter);
        } else if (exprCard && meanCard) {
          var exprLink = exprCard.querySelector(".ege-prep-pair-link");
          if (exprLink) {
            exprLink.textContent = "→ " + letter;
            exprLink.hidden = false;
          }
          var meanLink = meanCard.querySelector(".ege-prep-pair-link");
          if (meanLink) {
            meanLink.textContent = "← " + exprId;
            meanLink.hidden = false;
          }
        }
      });
      alignMatchedColumns();
    };

    wrap.classList.add("ege-picks-controller");
    wrap._pickSlots = meanings.map(function (meaning) {
      return meaning.id;
    });
    wrap._pickMaxOption = expressions.length;
    wrap.activateLetter = function (letter) {
      var card = wrap.querySelector('.ege-prep-pair-card[data-mean-id="' + letter + '"]');
      if (card && !card.disabled) selectMean(card);
    };
    wrap.assignNumber = function (num) {
      var card = wrap.querySelector('.ege-prep-pair-card[data-expr-id="' + num + '"]');
      if (card && !card.disabled) selectExpr(card);
    };
    wrap.getActiveLetter = function () {
      if (selectedMean) return selectedMean.dataset.meanId;
      if (selectedExpr) return selectedExpr.dataset.exprId;
      return "";
    };

    updateProgress();
  }

E.buildListeningPrepMatching = function buildListeningPrepMatching(prep, topicId, taskId) {
    var match = prep.matching;
    if (!match) return null;

    var expressions = match.expressions || [];
    var meanings = match.meanings || [];
    if (!expressions.length || !meanings.length) return null;

    var prefix = topicId + "_" + taskId + "_prep_m";
    var wrap = document.createElement("div");
    wrap.className = "ege-prep-match";
    wrap.dataset.prepTaskId = taskId;
    wrap._prepExpressions = expressions;

    var layout = E.ensurePrepLayout(taskId, prep);

    if (match.instruction) {
      var instr = document.createElement("p");
      instr.className = "ege-instructions";
      instr.textContent = match.instruction;
      wrap.appendChild(instr);
    }

    var status = document.createElement("div");
    status.className = "ege-prep-pair-status";

    var count = document.createElement("p");
    count.className = "ege-prep-pair-count";
    status.appendChild(count);
    wrap.appendChild(status);

    var live = document.createElement("p");
    live.className = "ege-prep-pair-live ege-match-hidden";
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    wrap.appendChild(live);

    var board = document.createElement("div");
    board.className = "ege-prep-pair-board";

    var exprCol = document.createElement("div");
    exprCol.className = "ege-prep-pair-col ege-prep-pair-col--expr";
    E.renderPrepExpressions(exprCol, expressions);

    var meanCol = document.createElement("div");
    meanCol.className = "ege-prep-pair-col ege-prep-pair-col--mean";
    E.renderPrepMeanings(meanCol, meanings);

    board.appendChild(exprCol);
    board.appendChild(meanCol);
    wrap.appendChild(board);

    var hidden = document.createElement("div");
    hidden.className = "ege-prep-pair-hidden ege-match-hidden";
    wrap.appendChild(hidden);

    E.attachListeningPrepPairing(wrap, {
      prefix: prefix,
      answers: match.answers || {},
      expressions: expressions,
      meanings: meanings,
    });

    return wrap;
  }

E.buildListeningPrepGapInstruction = function buildListeningPrepGapInstruction(task) {
    var gapFill = task.prep && task.prep.gapFill;
    if (!gapFill || !gapFill.instruction) return null;

    var instr = document.createElement("p");
    instr.className =
      E.usesTopicLayoutForTask(task) ? "ege-instructions" : "ege-listening-prep-instr";
    instr.lang = E.usesTopicLayoutForTask(task) ? "ru" : "";
    instr.id = "prep-gap-instr-" + task.id;
    instr.textContent = gapFill.instruction;
    return instr;
  }

E.syncListeningPrepGapInstructionUI = function syncListeningPrepGapInstructionUI(taskId) {
    var instr = document.getElementById("prep-gap-instr-" + taskId);
    if (!instr) return;

    var task = E.findTask(taskId);
    var kind = task && E.getListeningStepKind(task, E.getListeningStep(taskId));
    var show =
      task &&
      task.type === "listening" &&
      kind === "prep-gap" &&
      !E.isPrepMatchingUnlocked(taskId) &&
      task.prep &&
      task.prep.gapFill &&
      task.prep.gapFill.instruction;

    instr.hidden = !show;
  }

E.buildListeningPrepStep = function buildListeningPrepStep(task, topicId) {
    var step = document.createElement("div");
    step.className = "ege-listening-step ege-listening-step--prep";

    if (!task.prep) {
      step.hidden = true;
      return step;
    }

    var stack = document.createElement("div");
    stack.className = "ege-prep-stack";

    var gapFill = E.buildListeningPrepGapFill(task.prep, topicId, task.id);
    if (gapFill) stack.appendChild(E.buildPanel("", gapFill, "ege-panel--prep-gapfill"));

    var matching = E.buildListeningPrepMatching(task.prep, topicId, task.id);
    if (matching) {
      var matchPanel = E.buildPanel("", matching, "ege-panel--prep-match");
      matchPanel.hidden = !!(task.prep.gapFill && task.prep.gapFill.items && task.prep.gapFill.items.length);
      stack.appendChild(matchPanel);
    }

    step.appendChild(stack);
    return step;
  }

E.buildListeningFooter = function buildListeningFooter(task) {
    var taskId = task.id;
    var max = E.taskMaxScore(task);
    var extrasBefore = [];

    if (task.prep && task.prep.gapFill && task.prep.gapFill.items && task.prep.gapFill.items.length) {
      var prepFill = document.createElement("p");
      prepFill.className = "ege-listening-prep-fill";
      prepFill.id = "prep-fill-" + taskId;
      prepFill.textContent = "0 / " + task.prep.gapFill.items.length;
      extrasBefore.push(prepFill);
    }

    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "ege-btn ege-btn--primary";
    nextBtn.id = "prep-next-" + taskId;
    nextBtn.textContent = "Next";
    nextBtn.hidden = true;
    nextBtn.title = "Next (Enter)";
    nextBtn.setAttribute("aria-keyshortcuts", "Enter");
    nextBtn.addEventListener("click", function () {
      var current = E.findTask(taskId);
      if (!current) return;
      var kind = E.getListeningStepKind(current, E.getListeningStep(taskId));
      var placement =
        typeof E.isPlacementExam === "function" &&
        E.isPlacementExam() &&
        !E.state.placementFinalized;
      E.hideScoreFeedback(taskId);
      E.hidePrepNextButton(taskId);
      if (kind === "prep-gap") {
        if (placement || E.isPrepMatchingUnlocked(taskId)) {
          if (placement && !E.isPrepMatchingUnlocked(taskId)) {
            E.setPrepMatchingUnlocked(taskId, true);
          }
          E.setListeningStep(taskId, 2);
          return;
        }
      }
      if (kind === "prep-match" && (placement ? E.isPrepMatchingComplete(taskId) : E.isPrepMatchPassed(taskId))) {
        if (placement && !E.isPrepMatchPassed(taskId)) E.setPrepMatchPassed(taskId, true);
        E.setListeningStep(taskId, 3);
        return;
      }
      if (kind === "prep" && E.isPrepMatchingUnlocked(taskId)) {
        if (placement ? E.isPrepMatchingComplete(taskId) : E.isPrepMatchPassed(taskId)) {
          if (placement && !E.isPrepMatchPassed(taskId)) E.setPrepMatchPassed(taskId, true);
          E.setListeningStep(taskId, E.taskHasSplitPrep(current) ? 3 : 2);
          return;
        }
      }
      if (kind === "listening") {
        var prefix = E.taskPrefix(taskId);
        var gaps = E.getActiveListeningGaps(current);
        var gapsFilled =
          !gaps.length ||
          gaps.every(function (gap) {
            var input = document.getElementById(prefix + "_gap_" + gap.num);
            return input && E.normalize(input.value);
          });
        if ((placement && gapsFilled) || E.isListeningGapsPassed(taskId)) {
          if (placement && !E.isListeningGapsPassed(taskId)) E.setListeningGapsPassed(taskId, true);
          if (E.listeningMcMax(current) > 0) {
            var mcStep = E.listeningStagePlan(current).indexOf("mc") + 1;
            if (mcStep > 0) E.setListeningStep(taskId, mcStep);
          }
        }
        return;
      }
      if (kind === "exam-match") {
        if (
          (placement && E.isListeningExamMatchComplete(taskId)) ||
          E.isListeningExamMatchPassed(taskId)
        ) {
          if (placement && !E.isListeningExamMatchPassed(taskId)) {
            E.setListeningExamMatchPassed(taskId, true);
          }
          var matchPlan = E.listeningStagePlan(current);
          var tfnStep = matchPlan.indexOf("exam-tfn") + 1;
          if (tfnStep > 0) E.setListeningStep(taskId, tfnStep);
        }
        return;
      }
      if (kind === "exam-tfn") {
        if (
          (placement && E.isListeningExamTfnComplete(taskId)) ||
          E.isListeningExamTfnPassed(taskId)
        ) {
          if (placement && !E.isListeningExamTfnPassed(taskId)) {
            E.setListeningExamTfnPassed(taskId, true);
          }
          if (E.listeningMcMax(current) > 0) {
            var tfnPlan = E.listeningStagePlan(current);
            var mcAfterTfn = tfnPlan.indexOf("mc") + 1;
            if (mcAfterTfn > 0) E.setListeningStep(taskId, mcAfterTfn);
          }
        }
        return;
      }
    });

    var nextInterviewBtn = document.createElement("button");
    nextInterviewBtn.type = "button";
    nextInterviewBtn.className = "ege-btn ege-btn--primary";
    nextInterviewBtn.id = "next-interview-" + taskId;
    nextInterviewBtn.textContent = "Next task";
    nextInterviewBtn.hidden = true;
    nextInterviewBtn.title = "Next task (Enter)";
    nextInterviewBtn.setAttribute("aria-keyshortcuts", "Enter");
    nextInterviewBtn.addEventListener("click", function () {
      E.showAdjacentTask(1);
    });

    return E.buildTaskFooter(taskId, max, {
      showAnswers: true,
      checkHidden: true,
      scoreBeforeActions: true,
      extrasBefore: extrasBefore,
      extrasAfter: [nextBtn, nextInterviewBtn],
    });
  }

E.restoreAllListeningChromes = function restoreAllListeningChromes() {
    document.querySelectorAll(".ege-listening-chrome[data-home-panel]").forEach(function (chrome) {
      var root = document.querySelector("#" + chrome.dataset.homePanel + " .ege-listening-root");
      if (root && chrome.parentElement !== root) {
        root.insertBefore(chrome, root.firstChild);
      }
    });
  }

E.mountListeningChrome = function mountListeningChrome(taskId) {
    var host = document.getElementById("egeListeningChrome");
    E.restoreAllListeningChromes();
    if (!host) return;

    if (!E.isListeningMode() || !taskId) {
      host.classList.remove("is-mounted");
      host.replaceChildren();
      host.setAttribute("aria-hidden", "true");
      if (typeof E.clearListeningNotesPlacing === "function") E.clearListeningNotesPlacing();
      return;
    }

    var task = E.findTask(taskId);
    if (!task || task.type !== "listening") {
      host.classList.remove("is-mounted");
      host.replaceChildren();
      host.setAttribute("aria-hidden", "true");
      if (typeof E.clearListeningNotesPlacing === "function") E.clearListeningNotesPlacing();
      return;
    }

    if (E.usesTopicLayoutForTask(task)) {
      host.classList.remove("is-mounted");
      host.replaceChildren();
      host.setAttribute("aria-hidden", "true");
      return;
    }

    var chrome = document.querySelector("#panel-" + taskId + " .ege-listening-chrome");
    if (!chrome) {
      host.classList.remove("is-mounted");
      host.replaceChildren();
      host.setAttribute("aria-hidden", "true");
      return;
    }

    host.classList.add("is-mounted");
    host.removeAttribute("aria-hidden");
    host.replaceChildren(chrome);
  }

E.syncListeningChromeAlign = function syncListeningChromeAlign() {
    if (!E.isListeningMode()) return;
    var task = E.findTask(E.state.activeTaskId);
    if (task && E.usesTopicLayoutForTask(task)) return;
    if (window.matchMedia("(max-width: 860px)").matches) return;

    var host = document.getElementById("egeListeningChrome");
    var back = document.querySelector(".ege-topic-sidebar__back");
    if (!host || !host.classList.contains("is-mounted")) return;

    var progress = host.querySelector(".ege-listening-progress");
    var instr = host.querySelector(".ege-listening-prep-instr");

    // Keep progress at the top — do not invent margin from viewport midpoints
    // (that created a large empty band above the bar after layout/scroll).
    if (progress) progress.style.marginTop = "";

    if (instr) {
      instr.style.marginTop = "";
      if (!instr.hidden && back) {
        var delta = back.getBoundingClientRect().top - instr.getBoundingClientRect().top;
        if (Math.abs(delta) < 120) {
          instr.style.marginTop = Math.round(delta) + "px";
        }
      }
    }
  }

E.scheduleListeningNavAlign = function scheduleListeningNavAlign(taskId) {
    if (E.listeningNavAlignRaf) cancelAnimationFrame(E.listeningNavAlignRaf);
    E.listeningNavAlignRaf = requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        E.listeningNavAlignRaf = 0;
        E.syncListeningChromeAlign();
        E.syncListeningNavAlign(taskId || E.state.activeTaskId);
      });
    });
  }

E.syncListeningNavAlign = function syncListeningNavAlign(taskId) {
    if (!E.isListeningMode()) return;
    if (window.matchMedia("(max-width: 860px)").matches) return;

    var scroller = document.querySelector(".ege-page--topic-layout > .ege-topics");
    var btn = document.getElementById("nav-" + taskId);
    if (!scroller || !btn) return;

    var nav = document.getElementById("egeNav");
    if (nav) nav.style.paddingTop = "";

    var wordBank = null;
    var taskForAlign = E.findTask(taskId);
    var alignKind = taskForAlign && E.getListeningStepKind(taskForAlign, E.getListeningStep(taskId));
    if (alignKind === "prep-gap") {
      var taskEl = document.getElementById("task-" + taskId);
      if (taskEl) wordBank = taskEl.querySelector(".ege-prep-wordbank");
    }

    if (!wordBank) {
      scroller.scrollTop = 0;
      return;
    }

    scroller.scrollTop = 0;

    var delta = btn.getBoundingClientRect().top - wordBank.getBoundingClientRect().top;
    if (Math.abs(delta) >= 1) {
      scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
    }
  }

E.getTopicExercisePanel = function getTopicExercisePanel(taskId) {
    var task = document.getElementById("task-" + taskId);
    if (!task) return null;

    if (task.classList.contains("ege-task--reading-mc")) {
      var workCol = task.querySelector(".ege-work-col");
      if (workCol) return workCol;
    }

    var panel = task.querySelector(".ege-split__work .ege-panel--work");
    if (panel) return panel;

    panel = task.querySelector(".ege-work-col");
    if (panel) return panel;

    panel = task.querySelector(".ege-split__work");
    if (panel) return panel;

    return task;
  }

E.scrollActiveNavIntoView = function scrollActiveNavIntoView(taskId) {
    if (window.matchMedia("(max-width: 860px)").matches) return;

    var btn = document.getElementById("nav-" + taskId);
    if (!btn) return;

    var scroller = document.querySelector(".ege-page--topic-layout > .ege-topics");
    if (!scroller) return;

    var scrollerRect = scroller.getBoundingClientRect();
    var btnRect = btn.getBoundingClientRect();
    if (btnRect.top < scrollerRect.top + 8) {
      scroller.scrollTop += btnRect.top - scrollerRect.top - 8;
    } else if (btnRect.bottom > scrollerRect.bottom - 8) {
      scroller.scrollTop += btnRect.bottom - scrollerRect.bottom + 8;
    }
  }

E.isScrollAtEnd = function isScrollAtEnd(el) {
    if (!el) return true;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
  }

E.syncScrollFadeState = function syncScrollFadeState(shell, scroller) {
    if (!shell || !scroller) return;
    var canScroll = scroller.scrollHeight > scroller.clientHeight + 1;
    shell.classList.toggle("is-scrollable", canScroll);
    shell.classList.toggle("is-at-end", !canScroll || E.isScrollAtEnd(scroller));
  }

E.syncTopicNavAlign = function syncTopicNavAlign() {
    if (!E.usesTopicLayout(E.state.topicId)) return;
    if (window.matchMedia("(max-width: 860px)").matches) return;

    var navShell = document.getElementById("egeTopicNav");
    var nav = document.getElementById("egeNav");
    if (!navShell || !nav) return;

    navShell.style.maxHeight = "";
    nav.style.maxHeight = "";
    navShell.classList.remove("is-scrollable", "is-at-end");
  }

E.observeTopicExercisePanel = function observeTopicExercisePanel(taskId) {
    if (!E.topicNavResizeObserver || !E.usesTopicLayout(E.state.topicId)) return;

    E.topicNavResizeObserver.disconnect();
    var panel = E.getTopicExercisePanel(taskId || E.state.activeTaskId);
    if (panel) E.topicNavResizeObserver.observe(panel);
  }

E.scheduleTopicNavAlign = function scheduleTopicNavAlign(taskId) {
    if (!E.usesTopicLayout(E.state.topicId)) return;

    if (E.topicNavAlignRaf) cancelAnimationFrame(E.topicNavAlignRaf);
    E.topicNavAlignRaf = requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        E.topicNavAlignRaf = 0;
        E.syncTopicNavAlign(taskId || E.state.activeTaskId);
        E.syncReadingMcScrollState(taskId || E.state.activeTaskId);
      });
    });
  }

E.syncReadingMcScrollState = function syncReadingMcScrollState(taskId) {
    if (!E.usesTopicLayout(E.state.topicId)) return;
    var panel = document.getElementById("panel-" + (taskId || E.state.activeTaskId));
    if (!panel) return;

    panel.querySelectorAll(".ege-read-scroll, .ege-work-scroll").forEach(function (scroller) {
      var shell =
        scroller.closest(".ege-panel--read, .ege-panel--work, .ege-work-col") ||
        scroller.parentElement;
      E.syncScrollFadeState(shell, scroller);
    });
  }

E.bindTopicNavAlign = function bindTopicNavAlign() {
    if (window._egeTopicNavAlignBound) return;
    window._egeTopicNavAlignBound = true;

    if (typeof ResizeObserver !== "undefined") {
      E.topicNavResizeObserver = new ResizeObserver(function () {
        E.scheduleTopicNavAlign(E.state.activeTaskId);
      });
    }

    window.addEventListener("resize", function () {
      if (E.usesTopicLayout(E.state.topicId)) {
        E.observeTopicExercisePanel(E.state.activeTaskId);
        E.scheduleTopicNavAlign(E.state.activeTaskId);
      }
    });

    document.addEventListener(
      "scroll",
      function (event) {
        var target = event.target;
        if (!target || !target.classList) return;

        if (
          target.classList.contains("ege-read-scroll") ||
          target.classList.contains("ege-work-scroll")
        ) {
          var shell =
            target.closest(".ege-panel--read, .ege-panel--work, .ege-work-col") ||
            target.parentElement;
          E.syncScrollFadeState(shell, target);
        }
      },
      true
    );
  }

E.wrapListeningRoot = function wrapListeningRoot(task, article) {
    var root = document.createElement("div");
    root.className = "ege-listening-root";

    var chrome = document.createElement("div");
    chrome.className = "ege-listening-chrome";
    chrome.dataset.homePanel = "panel-" + task.id;
    var progress = E.buildListeningProgress(task);
    if (progress) chrome.appendChild(progress);
    var prepGapInstr = E.buildListeningPrepGapInstruction(task);
    if (prepGapInstr) chrome.appendChild(prepGapInstr);
    if (chrome.childElementCount) root.appendChild(chrome);
    root.appendChild(article);

    return root;
  }

E.renderListening = function renderListening(task, topicId) {
    var gaps = E.getActiveListeningGaps(task);
    var wrap = E.buildTaskArticle(task);
    wrap.classList.add("ege-task--listening");

    wrap.appendChild(E.buildListeningPrepStep(task, topicId));

    var readContent = document.createElement("div");
    readContent.className = "ege-listening-read";
    readContent.appendChild(E.buildListeningAudio(task, topicId));
    if (task.transcript) {
      var transcript = E.buildListeningTranscript(task);
      readContent.appendChild(transcript);
      if (gaps.length) E.attachListeningGapLinks(transcript, topicId, task.id);
    }

    if (E.taskHasExamListening(task)) {
      if (E.taskUsesExamSinglePage(task)) {
        return E.renderListeningExamSinglePage(task, topicId, wrap);
      }

      if (task.examMatch) {
        var examMatchStep = document.createElement("div");
        examMatchStep.className = "ege-listening-step ege-listening-step--exam-match";
        examMatchStep.hidden = true;
        var matchRead = document.createElement("div");
        matchRead.className = "ege-listening-read";
        matchRead.appendChild(E.buildListeningAudio(task, topicId));
        var matchStack = document.createElement("div");
        matchStack.className = "ege-listening-exam-match-stack";
        matchStack.appendChild(matchRead);
        matchStack.appendChild(E.buildListeningExamMatch(task, topicId));
        examMatchStep.appendChild(matchStack);
        wrap.appendChild(examMatchStep);
      }

      if (task.examTfn) {
        var examTfnStep = document.createElement("div");
        examTfnStep.className = "ege-listening-step ege-listening-step--exam-tfn";
        examTfnStep.hidden = true;
        var tfnRead = document.createElement("div");
        tfnRead.className = "ege-listening-read";
        tfnRead.appendChild(E.buildListeningAudio(task, topicId));
        var tfnStack = document.createElement("div");
        tfnStack.className = "ege-listening-exam-match-stack";
        tfnStack.appendChild(tfnRead);
        tfnStack.appendChild(E.buildListeningExamTfn(task, topicId));
        examTfnStep.appendChild(tfnStack);
        wrap.appendChild(examTfnStep);
      }

      if (task.questions && task.questions.length) {
        var soloMcStep = document.createElement("div");
        soloMcStep.className = "ege-listening-step ege-listening-step--mc";
        soloMcStep.hidden = true;
        var mcRead = document.createElement("div");
        mcRead.className = "ege-listening-read";
        mcRead.appendChild(E.buildListeningAudio(task, topicId));
        if (E.showsListeningTranscript() && task.transcript) {
          mcRead.appendChild(E.buildListeningTranscript(task));
        }
        soloMcStep.appendChild(
          E.buildLongreadSplit(mcRead, E.buildListeningMcStack(task, topicId), {
            workLabelKind: "questions",
            workClass: "ege-panel--work ege-panel--listening-mc",
          })
        );
        wrap.appendChild(soloMcStep);
      }

      wrap.appendChild(E.buildListeningFooter(task));
      wrap.addEventListener("input", function () {
        E.syncListeningProgressUI(task.id);
        E.syncListeningExamMatchFooterUI(task.id);
        E.syncListeningExamTfnFooterUI(task.id);
        E.syncListeningMcFooterUI(task.id);
        if (typeof E.isPlacementExam === "function" && E.isPlacementExam() && typeof E.syncExamPoints === "function") {
          E.syncExamPoints();
        }
      });
      wrap.addEventListener("change", function () {
        E.syncListeningProgressUI(task.id);
        E.syncListeningExamMatchFooterUI(task.id);
        E.syncListeningExamTfnFooterUI(task.id);
        E.syncListeningMcFooterUI(task.id);
        if (typeof E.isPlacementExam === "function" && E.isPlacementExam() && typeof E.syncExamPoints === "function") {
          E.syncExamPoints();
        }
      });
      E.syncListeningPrepFooterUI(task.id);
      E.syncListeningPrepGapInstructionUI(task.id);
      return E.wrapListeningRoot(task, wrap);
    }

    if (!gaps.length) {
      if (task.transcript) {
        var soloGapsStep = document.createElement("div");
        soloGapsStep.className = "ege-listening-step ege-listening-step--gaps";
        soloGapsStep.hidden = true;
        soloGapsStep.appendChild(E.buildPanel("", readContent, "ege-panel--solo"));
        wrap.appendChild(soloGapsStep);
      }
      if (task.questions && task.questions.length) {
        var soloMcStep = document.createElement("div");
        soloMcStep.className = "ege-listening-step ege-listening-step--mc";
        soloMcStep.hidden = true;
        soloMcStep.appendChild(
          E.buildWorkPanel("questions", E.buildListeningMcStack(task, topicId), "ege-panel--listening-mc")
        );
        wrap.appendChild(soloMcStep);
      }
      wrap.appendChild(E.buildListeningFooter(task));
      wrap.addEventListener("input", function () {
        E.syncListeningProgressUI(task.id);
        E.syncListeningGapsFooterUI(task.id);
        E.syncListeningMcFooterUI(task.id);
        if (typeof E.isPlacementExam === "function" && E.isPlacementExam() && typeof E.syncExamPoints === "function") {
          E.syncExamPoints();
        }
      });
      wrap.addEventListener("change", function () {
        E.syncListeningProgressUI(task.id);
        E.syncListeningGapsFooterUI(task.id);
        E.syncListeningMcFooterUI(task.id);
        if (typeof E.isPlacementExam === "function" && E.isPlacementExam() && typeof E.syncExamPoints === "function") {
          E.syncExamPoints();
        }
      });
      E.syncListeningPrepFooterUI(task.id);
      E.syncListeningPrepGapInstructionUI(task.id);
      return E.wrapListeningRoot(task, wrap);
    }

    var work = document.createElement("div");
    work.className = "ege-listening-answers";

    var listeningInputs = [];

    gaps.forEach(function (gap) {
      var row = document.createElement("div");
      row.className = "ege-listening-row";
      var inputIndex = listeningInputs.length;

      var inputId = topicId + "_" + task.id + "_gap_" + gap.num;

      var label = document.createElement("label");
      label.className = "ege-listening-row__label ege-exam-num";
      label.htmlFor = inputId;
      label.textContent = gap.num + ".";

      var input = document.createElement("input");
      input.type = "text";
      input.className = "ege-input ege-listening-input";
      input.id = inputId;
      input.setAttribute("aria-label", "Gap " + gap.num);
      input.autocomplete = "off";
      input.spellcheck = false;
      listeningInputs.push(input);

      input.addEventListener("input", function () {
        var value = input.value.trim();
        E.resetListeningGapsFeedback(task.id);
        if (value) {
          E.setListeningMarkText(task.id, gap.num, value);
        } else {
          E.clearListeningMark(task.id, gap.num);
        }
        input.classList.toggle("is-filled", !!value);
        E.hideScoreFeedback(task.id);
        E.syncResetButton(task.id);
        E.syncListeningGapsFooterUI(task.id);
        if (typeof E.isPlacementExam === "function" && E.isPlacementExam() && typeof E.syncExamPoints === "function") {
          E.syncExamPoints();
        }
      });

      input.addEventListener("keydown", function (event) {
        var delta = 0;
        if (event.key === "Enter" || event.key === "ArrowDown") delta = 1;
        else if (event.key === "ArrowUp") delta = -1;
        else return;

        var nextInput = listeningInputs[inputIndex + delta];
        if (!nextInput) return;
        event.preventDefault();
        nextInput.focus();
        if (typeof nextInput.select === "function") nextInput.select();
      });

      row.appendChild(label);
      row.appendChild(input);
      work.appendChild(row);
    });

    var gapsStep = document.createElement("div");
    gapsStep.className = "ege-listening-step ege-listening-step--gaps";
    gapsStep.hidden = true;
    gapsStep.appendChild(
      E.buildLongreadSplit(readContent, work, {
        workLabelKind: "answers",
        workClass: "ege-panel--work ege-panel--listening-work",
      })
    );
    wrap.appendChild(gapsStep);

    if (task.questions && task.questions.length) {
      var mcStep = document.createElement("div");
      mcStep.className = "ege-listening-step ege-listening-step--mc";
      mcStep.hidden = true;
      mcStep.appendChild(
        E.buildWorkPanel("questions", E.buildListeningMcStack(task, topicId), "ege-panel--listening-mc")
      );
      wrap.appendChild(mcStep);
    }

    wrap.appendChild(E.buildListeningFooter(task));

    wrap.addEventListener("input", function () {
      E.syncListeningProgressUI(task.id);
      E.syncListeningGapsFooterUI(task.id);
      E.syncListeningMcFooterUI(task.id);
      if (typeof E.isPlacementExam === "function" && E.isPlacementExam() && typeof E.syncExamPoints === "function") {
        E.syncExamPoints();
      }
    });
    wrap.addEventListener("change", function () {
      E.syncListeningProgressUI(task.id);
      E.syncListeningGapsFooterUI(task.id);
      E.syncListeningMcFooterUI(task.id);
      if (typeof E.isPlacementExam === "function" && E.isPlacementExam() && typeof E.syncExamPoints === "function") {
        E.syncExamPoints();
      }
    });

    E.syncListeningPrepFooterUI(task.id);
    E.syncListeningPrepGapInstructionUI(task.id);

    return E.wrapListeningRoot(task, wrap);
  }
