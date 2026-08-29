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

E.getListeningStepKind = function getListeningStepKind(task, step) {
    if (!task) return null;
    if (E.taskHasSplitPrep(task)) {
      if (step === 1) return "prep-gap";
      if (step === 2) return "prep-match";
      if (step === 3) return "listening";
      if (step === 4) return "mc";
      return null;
    }
    if (task.prep) {
      if (step === 1) return "prep";
      if (step === 2) return "listening";
      if (step === 3) return "mc";
      return null;
    }
    if (step === 1) return "listening";
    if (step === 2) return "mc";
    return null;
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
      return E.isListeningGapsPassed(taskId);
    }

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

    var step = E.getListeningStep(taskId);
    var kind = E.getListeningStepKind(task, step);
    E.hideScoreFeedback(taskId);
    var prepStep = taskEl.querySelector(".ege-listening-step--prep");
    var gapsStep = taskEl.querySelector(".ege-listening-step--gaps");
    var mcStep = taskEl.querySelector(".ege-listening-step--mc");
    if (prepStep) {
      prepStep.hidden = kind !== "prep-gap" && kind !== "prep-match" && kind !== "prep";
    }
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

E.buildListeningAudio = function buildListeningAudio(task, topicId) {
    var bar = document.createElement("div");
    bar.className = "ege-listening-audio";

    var audio = document.createElement("audio");
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

    var marks = document.createElement("div");
    marks.className = "ege-listening-seek__marks";

    var thumb = document.createElement("div");
    thumb.className = "ege-listening-seek__thumb";
    thumb.setAttribute("aria-hidden", "true");

    track.appendChild(marks);
    track.appendChild(thumb);
    seek.appendChild(track);

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

    function updateSeekUI() {
      var dur = duration();
      var t = audio.currentTime || 0;
      var pct = dur ? Math.min(100, Math.max(0, (t / dur) * 100)) : 0;
      thumb.style.left = pct + "%";
      seek.style.setProperty("--ege-seek-progress", pct + "%");
      seek.setAttribute("aria-valuemax", String(Math.round(dur)));
      seek.setAttribute("aria-valuenow", String(Math.round(t)));
      seek.setAttribute("aria-valuetext", formatTime(t) + " / " + formatTime(dur));
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
      var starts = E.getListeningPlaythroughStarts(task);
      if (!dur || !starts.length) return;
      starts.forEach(function (mark) {
        if (mark.at > dur) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ege-listening-seek__mark";
        btn.style.left = (mark.at / dur) * 100 + "%";
        btn.setAttribute("aria-label", "Jump to playthrough " + mark.label);
        btn.title = "Playthrough " + mark.label + " · " + formatTime(mark.at);
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
        var playPromise = audio.play();
        if (playPromise && playPromise.catch) {
          playPromise.catch(function () {
            E.showToast("Could not play audio.");
          });
        }
      } else {
        audio.pause();
      }
    });

    audio.addEventListener("play", function () {
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
      renderPlaythroughMarks();
    });
    audio.addEventListener("durationchange", function () {
      updateSeekUI();
      renderPlaythroughMarks();
    });

    var speeds = [0.85, 1, 1.25, 1.5, 2];
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

    controls.appendChild(playBtn);
    controls.appendChild(speedGroup);
    controls.appendChild(audio);

    bar.appendChild(seek);
    bar.appendChild(controls);
    updateSeekUI();
    return bar;
  }

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
      var label = question.q.replace(/^\d+\./, String(3 + index) + ".");

      var prompt = document.createElement("p");
      prompt.className = "ege-mc__prompt";
      prompt.textContent = label;
      block.appendChild(prompt);

      block.appendChild(
        E.buildMcChoiceGroup(topicId + "_" + task.id + "_q_" + index, question.opts, label)
      );
      work.appendChild(block);
    });

    return work;
  }

E.buildListeningProgress = function buildListeningProgress(task) {
    var taskId = task.id;
    var hasMc = E.listeningMcMax(task) > 0;
    var nav = document.createElement("nav");
    nav.className = "ege-listening-progress";
    nav.id = "listening-progress-" + taskId;
    nav.setAttribute("aria-label", "Listening stages");

    var track = document.createElement("div");
    track.className = "ege-listening-progress__track";

    var stages = [];
    if (E.taskHasSplitPrep(task)) {
      stages.push({ num: 1, label: "Gap fill" });
      stages.push({ num: 2, label: "Matching" });
      stages.push({ num: 3, label: "Listening" });
      if (hasMc) stages.push({ num: 4, label: "Questions" });
    } else {
      if (task.prep) stages.push({ num: 1, label: "Pre-listening" });
      stages.push({ num: task.prep ? 2 : 1, label: "Listening" });
      if (hasMc) stages.push({ num: task.prep ? 3 : 2, label: "Questions" });
    }

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
    num.className = "ege-prep-gapfill__num";
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
    if (showBtn) showBtn.hidden = !visible;
  }

E.syncListeningPrepFooterUI = function syncListeningPrepFooterUI(taskId) {
    var task = E.findTask(taskId);
    if (!task || task.type !== "listening" || !task.prep) return;

    var kind = E.getListeningStepKind(task, E.getListeningStep(taskId));
    var checkBtn = document.getElementById("check-" + taskId);
    var progressEl = document.getElementById("prep-fill-" + taskId);
    var gapItems = task.prep.gapFill && task.prep.gapFill.items;

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
          E.syncListeningProgressUI(taskId);
        }
        if (checkBtn) checkBtn.hidden = true;
        E.syncResetButton(taskId, { forceHidden: true });
        E.setListeningRevealVisible(taskId, false);
        E.showPrepNextButton(taskId);
        return;
      }
      if (checkBtn) checkBtn.hidden = true;
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
          E.syncListeningProgressUI(taskId);
        }
        if (checkBtn) checkBtn.hidden = true;
        E.syncResetButton(taskId, { forceHidden: true });
        E.setListeningRevealVisible(taskId, false);
        E.showPrepNextButton(taskId);
        return;
      }
      if (checkBtn) checkBtn.hidden = true;
      E.hidePrepNextButton(taskId);
      E.syncResetButton(taskId);
      E.setListeningRevealVisible(taskId, true);
      return;
    }

    if (kind === "prep-gap" && E.isPrepMatchingUnlocked(taskId)) {
      if (progressEl) progressEl.hidden = true;
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId, { forceHidden: true });
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

    if (progressEl) {
      progressEl.textContent = filled + " / " + total;
      progressEl.hidden = gapReady;
    }

    if (checkBtn) checkBtn.hidden = !gapReady;
  }

E.syncListeningGapsFooterUI = function syncListeningGapsFooterUI(taskId) {
    var task = E.findTask(taskId);
    if (!task || task.type !== "listening") return;
    if (E.getListeningStepKind(task, E.getListeningStep(taskId)) !== "listening") return;

    var checkBtn = document.getElementById("check-" + taskId);

    if (E.isListeningGapsPassed(taskId)) {
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId, { forceHidden: true });
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
    var startOverBtn = document.getElementById("start-over-" + taskId);
    var nextInterviewBtn = document.getElementById("next-interview-" + taskId);
    if (E.prepNextPulseTimers["interview-" + taskId]) {
      window.clearTimeout(E.prepNextPulseTimers["interview-" + taskId]);
      delete E.prepNextPulseTimers["interview-" + taskId];
    }
    if (startOverBtn) startOverBtn.hidden = true;
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
    var startOverBtn = document.getElementById("start-over-" + taskId);
    var nextInterviewBtn = document.getElementById("next-interview-" + taskId);

    E.hidePrepNextButton(taskId);

    if (E.isListeningMcPassed(taskId)) {
      if (checkBtn) checkBtn.hidden = true;
      E.syncResetButton(taskId, { forceHidden: true });
      if (showBtn) showBtn.hidden = true;
      if (startOverBtn) startOverBtn.hidden = false;
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
      return;
    }

    E.hideListeningFinishButtons(taskId);
    E.syncResetButton(taskId);
    if (checkBtn) checkBtn.hidden = !E.isListeningMcComplete(taskId);
    if (showBtn) showBtn.hidden = false;
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
      if (taskId) E.syncListeningPrepFooterUI(taskId);
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

    function activateDrop(drop) {
      if (pickedChip) {
        assignWord(drop, pickedChip.dataset.word);
        pickedChip.classList.remove("is-selected");
        pickedChip.setAttribute("aria-pressed", "false");
        pickedChip = null;
        return;
      }
      if (E.prepGapSlotValue(drop)) clearDrop(drop);
    }

    wrap.resetPrepGapFill = function () {
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
    num.className = "ege-prep-gapfill__num";
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
    instr.className = "ege-listening-prep-instr";
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

    var footer = document.createElement("div");
    footer.className = "ege-task__footer ege-listening-footer";

    var actions = document.createElement("div");
    actions.className = "ege-task__actions";

    var checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "ege-btn ege-btn--primary";
    checkBtn.id = "check-" + taskId;
    checkBtn.textContent = "Check answers";
    checkBtn.hidden = true;
    checkBtn.addEventListener("click", function () {
      E.checkTask(taskId);
    });

    if (task.prep && task.prep.gapFill && task.prep.gapFill.items && task.prep.gapFill.items.length) {
      var prepFill = document.createElement("p");
      prepFill.className = "ege-listening-prep-fill";
      prepFill.id = "prep-fill-" + taskId;
      prepFill.textContent = "0 / " + task.prep.gapFill.items.length;
      actions.appendChild(prepFill);
    }

    actions.appendChild(checkBtn);

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
      E.hideScoreFeedback(taskId);
      E.hidePrepNextButton(taskId);
      if (kind === "prep-gap" && E.isPrepMatchingUnlocked(taskId)) {
        E.setListeningStep(taskId, 2);
        return;
      }
      if (kind === "prep-match" && E.isPrepMatchPassed(taskId)) {
        E.setListeningStep(taskId, 3);
        return;
      }
      if (kind === "listening" && E.isListeningGapsPassed(taskId) && E.listeningMcMax(current) > 0) {
        var mcStep = E.taskHasSplitPrep(current) ? 4 : current.prep ? 3 : 2;
        E.setListeningStep(taskId, mcStep);
      }
    });
    actions.appendChild(nextBtn);

    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ege-btn ege-btn--ghost";
    resetBtn.id = "reset-" + taskId;
    resetBtn.textContent = "Reset";
    resetBtn.hidden = true;
    E.bindResetButton(resetBtn, taskId);
    actions.appendChild(resetBtn);

    var showBtn = document.createElement("button");
    showBtn.type = "button";
    showBtn.className = "ege-btn ege-btn--ghost";
    showBtn.id = "show-" + taskId;
    showBtn.textContent = "Show answers";
    showBtn.hidden = true;
    showBtn.addEventListener("click", function () {
      E.revealTask(taskId);
    });
    actions.appendChild(showBtn);

    var startOverBtn = document.createElement("button");
    startOverBtn.type = "button";
    startOverBtn.className = "ege-btn ege-btn--ghost";
    startOverBtn.id = "start-over-" + taskId;
    startOverBtn.textContent = "Start over";
    startOverBtn.hidden = true;
    startOverBtn.addEventListener("click", function () {
      E.resetTask(taskId);
    });
    actions.appendChild(startOverBtn);

    var nextInterviewBtn = document.createElement("button");
    nextInterviewBtn.type = "button";
    nextInterviewBtn.className = "ege-btn ege-btn--primary";
    nextInterviewBtn.id = "next-interview-" + taskId;
    nextInterviewBtn.textContent = "Next interview";
    nextInterviewBtn.hidden = true;
    nextInterviewBtn.title = "Next interview (Enter)";
    nextInterviewBtn.setAttribute("aria-keyshortcuts", "Enter");
    nextInterviewBtn.addEventListener("click", function () {
      E.showAdjacentTask(1);
    });
    actions.appendChild(nextInterviewBtn);

    footer.appendChild(actions);

    var score = document.createElement("p");
    score.className = "ege-task__score";
    score.id = "score-" + taskId;
    score.hidden = true;
    score.setAttribute("aria-live", "polite");
    footer.insertBefore(score, actions);
    footer.dataset.max = String(max);
    E.syncResetButton(taskId);
    return footer;
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
      host.hidden = true;
      return;
    }

    var task = E.findTask(taskId);
    if (!task || task.type !== "listening") {
      host.hidden = true;
      return;
    }

    var chrome = document.querySelector("#panel-" + taskId + " .ege-listening-chrome");
    if (!chrome) {
      host.hidden = true;
      return;
    }

    host.hidden = false;
    host.replaceChildren(chrome);
  }

E.syncListeningChromeAlign = function syncListeningChromeAlign() {
    if (!E.isListeningMode()) return;
    if (window.matchMedia("(max-width: 860px)").matches) return;

    var host = document.getElementById("egeListeningChrome");
    var back = document.querySelector(".ege-topic-sidebar__back");
    if (!host || host.hidden) return;

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

    var nav = document.getElementById("egeNav");
    var btn = document.getElementById("nav-" + taskId);
    if (!nav || !btn) return;

    nav.style.paddingTop = "";

    var wordBank = null;
    var taskForAlign = E.findTask(taskId);
    var alignKind = taskForAlign && E.getListeningStepKind(taskForAlign, E.getListeningStep(taskId));
    if (alignKind === "prep-gap") {
      var taskEl = document.getElementById("task-" + taskId);
      if (taskEl) wordBank = taskEl.querySelector(".ege-prep-wordbank");
    }

    if (!wordBank) {
      nav.scrollTop = 0;
      return;
    }

    nav.scrollTop = 0;

    var delta = btn.getBoundingClientRect().top - wordBank.getBoundingClientRect().top;
    if (Math.abs(delta) >= 1) {
      nav.scrollTop = Math.max(0, nav.scrollTop + delta);
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

    var nav = document.getElementById("egeNav");
    var btn = document.getElementById("nav-" + taskId);
    if (!nav || !btn) return;

    btn.scrollIntoView({ block: "nearest" });
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

E.syncTopicNavAlign = function syncTopicNavAlign(taskId) {
    if (!E.usesTopicLayout(E.state.topicId)) return;

    var navShell = document.getElementById("egeTopicNav");
    var nav = document.getElementById("egeNav");
    if (!navShell || !nav) return;

    if (window.matchMedia("(max-width: 860px)").matches) {
      navShell.style.maxHeight = "";
      nav.style.maxHeight = "";
      navShell.classList.remove("is-scrollable", "is-at-end");
      return;
    }

    var exercisePanel = E.getTopicExercisePanel(taskId || E.state.activeTaskId);
    if (!exercisePanel) {
      navShell.style.maxHeight = "";
      nav.style.maxHeight = "";
      navShell.classList.remove("is-scrollable", "is-at-end");
      return;
    }

    var height = Math.round(exercisePanel.getBoundingClientRect().height);
    if (height > 0) {
      navShell.style.maxHeight = height + "px";
      nav.style.maxHeight = "";
    }

    E.syncScrollFadeState(navShell, nav);
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
    if (window.matchMedia("(max-width: 860px)").matches) return;

    var taskEl = document.getElementById("task-" + taskId);
    if (!taskEl || !taskEl.classList.contains("ege-task--reading-mc")) return;

    taskEl.querySelectorAll(".ege-work-scroll").forEach(function (el) {
      E.syncScrollFadeState(el, el);
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

        if (target.id === "egeNav") {
          var navShell = document.getElementById("egeTopicNav");
          E.syncScrollFadeState(navShell, target);
          return;
        }

        if (target.classList.contains("ege-work-scroll")) {
          E.syncScrollFadeState(target, target);
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
    chrome.appendChild(E.buildListeningProgress(task));
    var prepGapInstr = E.buildListeningPrepGapInstruction(task);
    if (prepGapInstr) chrome.appendChild(prepGapInstr);
    root.appendChild(chrome);
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

    if (!gaps.length) {
      if (task.transcript) {
        var soloGapsStep = document.createElement("div");
        soloGapsStep.className = "ege-listening-step ege-listening-step--gaps";
        soloGapsStep.hidden = true;
        soloGapsStep.appendChild(E.buildPanel("Recording", readContent, "ege-panel--solo"));
        wrap.appendChild(soloGapsStep);
      }
      if (task.questions && task.questions.length) {
        var soloMcStep = document.createElement("div");
        soloMcStep.className = "ege-listening-step ege-listening-step--mc";
        soloMcStep.hidden = true;
        soloMcStep.appendChild(
          E.buildPanel("", E.buildListeningMcStack(task, topicId), "ege-panel--listening-mc")
        );
        wrap.appendChild(soloMcStep);
      }
      wrap.appendChild(E.buildListeningFooter(task));
      wrap.addEventListener("input", function () {
        E.syncListeningProgressUI(task.id);
        E.syncListeningMcFooterUI(task.id);
      });
      wrap.addEventListener("change", function () {
        E.syncListeningProgressUI(task.id);
        E.syncListeningMcFooterUI(task.id);
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
      label.className = "ege-listening-row__label";
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

    var workPanel = E.buildPanel("Answers", work, "ege-panel--work ege-panel--listening-work");
    var workCol = document.createElement("div");
    workCol.className = "ege-work-col";
    var scrollWrap = document.createElement("div");
    scrollWrap.className = "ege-work-scroll";
    scrollWrap.appendChild(workPanel);
    workCol.appendChild(scrollWrap);

    var gapsStep = document.createElement("div");
    gapsStep.className = "ege-listening-step ege-listening-step--gaps";
    gapsStep.hidden = true;
    gapsStep.appendChild(
      E.buildSplit(
        E.buildPanel("Recording", readContent, "ege-panel--read"),
        workCol,
        "ege-split--panels"
      )
    );
    wrap.appendChild(gapsStep);

    if (task.questions && task.questions.length) {
      var mcStep = document.createElement("div");
      mcStep.className = "ege-listening-step ege-listening-step--mc";
      mcStep.hidden = true;
      mcStep.appendChild(
        E.buildPanel("", E.buildListeningMcStack(task, topicId), "ege-panel--listening-mc")
      );
      wrap.appendChild(mcStep);
    }

    wrap.appendChild(E.buildListeningFooter(task));

    wrap.addEventListener("input", function () {
      E.syncListeningProgressUI(task.id);
      E.syncListeningMcFooterUI(task.id);
    });
    wrap.addEventListener("change", function () {
      E.syncListeningProgressUI(task.id);
      E.syncListeningMcFooterUI(task.id);
    });

    E.syncListeningPrepFooterUI(task.id);
    E.syncListeningPrepGapInstructionUI(task.id);

    return E.wrapListeningRoot(task, wrap);
  }
