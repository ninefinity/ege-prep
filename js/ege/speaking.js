import { E } from "./runtime.js";

E.formatSpeakingTimer = function formatSpeakingTimer(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    return mins + ":" + (secs < 10 ? "0" : "") + secs;
  }

E.stopSpeakingTimerHandle = function stopSpeakingTimerHandle(key) {
    if (E.speakingTimerHandles[key]) {
      window.clearInterval(E.speakingTimerHandles[key]);
      delete E.speakingTimerHandles[key];
    }
  }

E.stopSpeakingTimers = function stopSpeakingTimers(taskId) {
    Object.keys(E.speakingTimerHandles).forEach(function (key) {
      if (!taskId || key.indexOf(taskId + ":") === 0) E.stopSpeakingTimerHandle(key);
    });
  }

E.getSpeakingTaskEl = function getSpeakingTaskEl(taskId) {
    return document.getElementById("task-" + taskId);
  }

  E.clearSpeakingQuestionHighlights = function clearSpeakingQuestionHighlights(taskId) {
    var taskEl = E.getSpeakingTaskEl(taskId);
    if (!taskEl) return;
    taskEl.querySelectorAll(".ege-speaking-points li.is-active, .ege-speaking-points li.is-revealed").forEach(function (li) {
      li.classList.remove("is-active", "is-revealed");
    });
  }

  E.setSpeakingQuestionHighlight = function setSpeakingQuestionHighlight(taskId, index) {
    var taskEl = E.getSpeakingTaskEl(taskId);
    if (!taskEl) return;
    var items = taskEl.querySelectorAll(".ege-speaking-points li");
    items.forEach(function (li, i) {
      li.classList.toggle("is-active", i === index);
      // Each question is asked in turn and stays visible afterwards, like
      // a transcript of the interview so far -- only ones not reached yet
      // stay hidden -- so once revealed a question never goes back to
      // hidden just because a later one is now current.
      if (i === index) li.classList.add("is-revealed");
    });
  }

  E.resetSpeakingTimers = function resetSpeakingTimers(taskId) {
    Object.keys(E.speakingTimerControllers).forEach(function (key) {
      if (!taskId || key.indexOf(taskId + ":") === 0) {
        E.speakingTimerControllers[key].reset();
      }
    });
    if (taskId && E.speakingAskCycles[taskId]) {
      E.speakingAskCycles[taskId].hardReset();
    } else if (!taskId) {
      Object.keys(E.speakingAskCycles).forEach(function (id) {
        E.speakingAskCycles[id].hardReset();
      });
    } else {
      E.clearSpeakingQuestionHighlights(taskId);
    }
    E.syncSpeakingCompleteButton(taskId);
    E.syncResetButton(taskId);
  }

  E.syncSpeakingTimerMotion = function syncSpeakingTimerMotion(wrap, remaining, duration) {
    if (!wrap || !duration) return;
    var elapsed = Math.max(0, Math.min(duration, duration - remaining));
    var progress = elapsed / duration;
    var sweep = wrap.querySelector(".ege-speaking-timer__sweep");
    var ring = wrap.querySelector(".ege-speaking-timer__progress");
    if (sweep) sweep.style.transform = "rotate(" + progress * 360 + "deg)";
    if (ring) ring.style.strokeDashoffset = String(100 - progress * 100);
  }

  E.isSpeakingMarkedComplete = function isSpeakingMarkedComplete(taskId) {
    var task = E.findTask(taskId);
    if (!task || !E.isSpeakingPractice(task)) return false;
    var max = E.taskMaxScore(task);
    return max > 0 && (E.state.scores[taskId] || 0) >= max;
  }

E.syncSpeakingCompleteButton = function syncSpeakingCompleteButton(taskId) {
    var btn = document.getElementById("complete-" + taskId);
    if (!btn) return;

    var task = E.findTask(taskId);
    if (task && task.type === "writing") {
      btn.hidden = true;
      return;
    }

    var marked = E.isSpeakingMarkedComplete(taskId);

    if (marked) {
      btn.hidden = true;
      return;
    }

    var touched = !!(E.state.speakingTimerTouched && E.state.speakingTimerTouched[taskId]);
    var examOral =
      typeof E.isFullWrittenExam === "function" &&
      E.isFullWrittenExam() &&
      typeof E.getExamPhase === "function" &&
      typeof E.isOralTask === "function" &&
      task &&
      E.isOralTask(task) &&
      (E.getExamPhase() === E.EXAM_PHASES.ORAL_READY ||
        E.getExamPhase() === E.EXAM_PHASES.ORAL_ACTIVE);
    btn.hidden = false;
    btn.disabled = !examOral && !touched;
    btn.textContent = "Done";
    btn.title = examOral || touched ? "" : "Start a preparation or answer timer first";
  }

E.markSpeakingComplete = function markSpeakingComplete(taskId) {
    var task = E.findTask(taskId);
    if (!task || !E.isSpeakingPractice(task)) return;
    if (E.isSpeakingMarkedComplete(taskId)) return;

    if (!E.state.speakingTimerTouched) E.state.speakingTimerTouched = {};
    E.state.speakingTimerTouched[taskId] = true;

    var max = E.taskMaxScore(task);
    E.state.scores[taskId] = max;
    E.saveTaskScore(taskId, max, max);
    E.setNavStatus(taskId, max, max);
    E.syncSpeakingCompleteButton(taskId);
    E.syncResetButton(taskId);
  }

  // Records the mic while the "Answer" timer runs, so a student can play
  // back what they actually said -- there's no server, so this all stays
  // client-side (blob URLs), one take per task (askCycle tasks like
  // Direct Questions keep only the latest question's take, since each
  // restart of the answer timer is a fresh recording).
  E.speakingRecordings = E.speakingRecordings || {};
  E.speakingActiveRecorders = E.speakingActiveRecorders || {};

  // MediaRecorder only ever gives back webm/opus (no browser encodes mp3
  // natively), so turning a take into a real .mp3 means decoding it back
  // to raw PCM via the Web Audio API and re-encoding with lamejs (vendored
  // in js/vendor/lame.min.js -- pure JS, no server round-trip needed).
  E.encodeAudioBlobToMp3 = function encodeAudioBlobToMp3(blob) {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    var ctx = new AudioCtx();
    return blob
      .arrayBuffer()
      .then(function (buf) {
        return ctx.decodeAudioData(buf);
      })
      .then(function (audioBuffer) {
        var sampleRate = audioBuffer.sampleRate;
        var samples = audioBuffer.getChannelData(0);
        var int16 = new Int16Array(samples.length);
        for (var i = 0; i < samples.length; i++) {
          var s = Math.max(-1, Math.min(1, samples[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        var encoder = new window.lamejs.Mp3Encoder(1, sampleRate, 128);
        var blockSize = 1152;
        var chunks = [];
        for (var offset = 0; offset < int16.length; offset += blockSize) {
          var chunk = encoder.encodeBuffer(int16.subarray(offset, offset + blockSize));
          if (chunk.length > 0) chunks.push(chunk);
        }
        var tail = encoder.flush();
        if (tail.length > 0) chunks.push(tail);
        return new Blob(chunks, { type: "audio/mpeg" });
      })
      .finally(function () {
        ctx.close();
      });
  };

  E.downloadBlob = function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  E.getRecordedOralTasks = function getRecordedOralTasks() {
    if (!E.state.topic || !E.state.topic.tasks) return [];
    return E.state.topic.tasks.filter(function (task) {
      return (
        E.isOralTask(task) &&
        E.speakingRecordings[task.id] &&
        E.speakingRecordings[task.id].blob
      );
    });
  };

  E.exportSpeakingRecording = function exportSpeakingRecording(taskId, onSettled) {
    var rec = E.speakingRecordings[taskId];
    var task = E.findTask(taskId);
    if (!rec || !task) {
      if (onSettled) onSettled(false);
      return;
    }
    var examNum = E.taskExamFrom(task) || task.id;
    E.encodeAudioBlobToMp3(rec.blob)
      .then(function (mp3Blob) {
        E.downloadBlob(mp3Blob, examNum + ".mp3");
        if (onSettled) onSettled(true);
      })
      .catch(function () {
        if (onSettled) onSettled(false);
      });
  };

  E.ensureMicStream = function ensureMicStream() {
    if (E.speakingMicStream) return Promise.resolve(E.speakingMicStream);
    if (E.speakingMicStreamPromise) return E.speakingMicStreamPromise;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.resolve(null);
    }
    E.speakingMicStreamPromise = navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        E.speakingMicStream = stream;
        return stream;
      })
      .catch(function (err) {
        console.warn("[ege] mic access failed:", err && err.name, err && err.message);
        return null;
      })
      .then(function (result) {
        E.speakingMicStreamPromise = null;
        return result;
      });
    return E.speakingMicStreamPromise;
  };

  E.syncSpeakingRecordingUI = function syncSpeakingRecordingUI(taskId, wrap, state) {
    if (!wrap) return;
    wrap.classList.toggle("is-recording", state === "recording");
    var badge = wrap.querySelector(".ege-speaking-timer__rec");
    if (!badge && (state === "recording" || state === "denied")) {
      badge = document.createElement("span");
      badge.className = "ege-speaking-timer__rec";
      wrap.appendChild(badge);
    }
    if (badge) {
      if (state === "recording") {
        badge.textContent = "● REC";
        badge.hidden = false;
      } else if (state === "denied") {
        badge.textContent = "Mic blocked";
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    }
    E.syncSpeakingRecordingPlayback(taskId);
  };

  E.syncSpeakingRecordingPlayback = function syncSpeakingRecordingPlayback(taskId) {
    var taskEl = E.getSpeakingTaskEl(taskId);
    if (!taskEl) return;
    var slot = taskEl.querySelector(".ege-speaking-recording");
    var rec = E.speakingRecordings[taskId];
    if (!slot) {
      if (!rec) return;
      var timersCol = taskEl.querySelector(".ege-speaking-timers-col");
      if (!timersCol) return;
      slot = document.createElement("div");
      slot.className = "ege-speaking-recording";
      timersCol.appendChild(slot);
    }
    if (!rec) {
      slot.hidden = true;
      slot.textContent = "";
      return;
    }
    slot.hidden = false;
    slot.textContent = "";
    var label = document.createElement("p");
    label.className = "ege-speaking-recording__label";
    label.textContent = "Ваша запись";
    var audio = document.createElement("audio");
    audio.className = "ege-speaking-recording__player";
    audio.controls = true;
    audio.src = rec.url;
    slot.appendChild(label);
    slot.appendChild(audio);
  };

  E.startSpeakingRecording = function startSpeakingRecording(taskId, wrap) {
    if (typeof MediaRecorder === "undefined") {
      console.warn("[ege] MediaRecorder unsupported in this browser");
      E.syncSpeakingRecordingUI(taskId, wrap, "denied");
      return;
    }
    E.ensureMicStream().then(function (stream) {
      // The timer (and thus the exam) doesn't wait on mic permission --
      // if the student's already moved past this Answer window by the
      // time the prompt resolves, don't start recording into it.
      if (!wrap.classList.contains("is-running")) {
        console.warn("[ege] mic prompt resolved after Answer phase ended, taskId=" + taskId);
        return;
      }
      if (!stream) {
        E.syncSpeakingRecordingUI(taskId, wrap, "denied");
        return;
      }
      var recorder;
      try {
        recorder = new MediaRecorder(stream);
      } catch (err) {
        console.warn("[ege] MediaRecorder construction failed:", err && err.message);
        E.syncSpeakingRecordingUI(taskId, wrap, "denied");
        return;
      }
      var chunks = [];
      recorder.addEventListener("dataavailable", function (event) {
        if (event.data && event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener("stop", function () {
        if (!chunks.length) {
          console.warn("[ege] recording stopped with no audio data, taskId=" + taskId);
          return;
        }
        var blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        var prev = E.speakingRecordings[taskId];
        if (prev) URL.revokeObjectURL(prev.url);
        E.speakingRecordings[taskId] = { blob: blob, url: URL.createObjectURL(blob) };
        E.syncSpeakingRecordingPlayback(taskId);
      });
      E.speakingActiveRecorders[taskId] = recorder;
      recorder.start();
      E.syncSpeakingRecordingUI(taskId, wrap, "recording");
    });
  };

  E.stopSpeakingRecording = function stopSpeakingRecording(taskId, wrap) {
    var recorder = E.speakingActiveRecorders[taskId];
    if (recorder && recorder.state !== "inactive") recorder.stop();
    delete E.speakingActiveRecorders[taskId];
    E.syncSpeakingRecordingUI(taskId, wrap, "stopped");
  };

  E.bindSpeakingTimer = function bindSpeakingTimer(wrap, taskId, onComplete, hooks) {
    var duration = parseInt(wrap.dataset.duration, 10);
    var display = wrap.querySelector(".ege-speaking-timer__display");
    var clock = wrap.querySelector(".ege-speaking-timer__clock");
    var key = taskId + ":" + duration;
    var remaining = duration;
    var running = false;

    function clearFinishShake() {
      wrap.classList.remove("is-finish-shake");
    }

    function playFinishShake() {
      clearFinishShake();
      void wrap.offsetWidth;
      wrap.classList.add("is-finish-shake");
    }

    function syncLabel() {
      if (!clock) return;
      var phase = wrap.dataset.phase || "Timer";
      var label = E.formatSpeakingTimer(duration) + " " + phase.toLowerCase();
      var prefix = running
        ? "Pause "
        : remaining === 0
          ? "Reset "
          : remaining < duration
            ? "Resume "
            : "Start ";
      clock.setAttribute("aria-label", prefix + label);
    }

    function render() {
      display.textContent = E.formatSpeakingTimer(remaining);
      wrap.classList.toggle("is-done", remaining === 0);
      wrap.classList.toggle("is-urgent", running && remaining > 0 && remaining <= 10);
      if (remaining !== 0) clearFinishShake();
      E.syncSpeakingTimerMotion(wrap, remaining, duration);
      syncLabel();
      E.syncSpeakingCompleteButton(taskId);
      E.syncResetButton(taskId);
    }

    function pause() {
      E.stopSpeakingTimerHandle(key);
      running = false;
      wrap.classList.remove("is-running", "is-urgent");
      syncLabel();
      E.syncSpeakingCompleteButton(taskId);
      E.syncResetButton(taskId);
      if (wrap.dataset.phase === "Answer") E.stopSpeakingRecording(taskId, wrap);
    }

    function tick() {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = 0;
        render();
        pause();
        playFinishShake();
        if (typeof onComplete === "function") onComplete();
        return;
      }
      render();
    }

    function start() {
      if (running || remaining <= 0) return;
      if (hooks && typeof hooks.beforeStart === "function" && hooks.beforeStart() === false) {
        return;
      }
      if (!E.state.speakingTimerTouched) E.state.speakingTimerTouched = {};
      E.state.speakingTimerTouched[taskId] = true;
      running = true;
      wrap.classList.remove("is-done");
      clearFinishShake();
      wrap.classList.add("is-running");
      render();
      E.stopSpeakingTimerHandle(key);
      E.speakingTimerHandles[key] = window.setInterval(tick, 1000);
      if (wrap.dataset.phase === "Answer") E.startSpeakingRecording(taskId, wrap);
    }

    function reset() {
      pause();
      remaining = duration;
      wrap.classList.remove("is-done");
      clearFinishShake();
      E.syncSpeakingTimerMotion(wrap, duration, duration);
      void wrap.offsetWidth;
      render();
    }

    if (clock) {
      clock.addEventListener("animationend", function (event) {
        if (event.animationName === "ege-speaking-timer-finish-shake") clearFinishShake();
      });
      clock.addEventListener("click", function () {
        // Pausing your own prep/answer timer would let you buy extra
        // thinking time mid mock exam -- fine in practice, not here.
        var canPause =
          !(typeof E.isFullWrittenExam === "function" && E.isFullWrittenExam());
        if (running) {
          if (canPause) pause();
          return;
        }
        if (remaining === 0) {
          reset();
          return;
        }
        start();
      });
    }

    render();

    var api = {
      start: start,
      stop: pause,
      pause: pause,
      reset: reset,
    };
    E.speakingTimerControllers[key] = api;
    return api;
  }

  // For a two-phase task where prep and answer share one duration (e.g.
  // Reading Aloud, 1:30 + 1:30), showing two identical clocks is just
  // visual clutter -- one clock runs both phases back to back, relabeling
  // itself as it goes, the same way a real oral exam has one shared timer
  // rather than a separate physical clock per phase.
  E.bindSpeakingSequentialTimer = function bindSpeakingSequentialTimer(wrap, taskId, phases, onAllDone) {
    var display = wrap.querySelector(".ege-speaking-timer__display");
    var clock = wrap.querySelector(".ege-speaking-timer__clock");
    var phaseEl = wrap.querySelector(".ege-speaking-timer__phase");
    var key = taskId + ":sequential";
    var phaseIndex = 0;
    var remaining = phases[0].seconds;
    var running = false;
    var started = false;

    function currentPhase() {
      return phases[phaseIndex];
    }

    function clearFinishShake() {
      wrap.classList.remove("is-finish-shake");
    }

    function playFinishShake() {
      clearFinishShake();
      void wrap.offsetWidth;
      wrap.classList.add("is-finish-shake");
    }

    function syncLabel() {
      if (!clock) return;
      var phase = currentPhase();
      var label = E.formatSpeakingTimer(phase.seconds) + " " + phase.label.toLowerCase();
      var prefix = running
        ? "Pause "
        : !started
          ? "Start "
          : remaining === 0
            ? "Reset "
            : "Resume ";
      clock.setAttribute("aria-label", prefix + label);
    }

    function render() {
      var phase = currentPhase();
      display.textContent = E.formatSpeakingTimer(remaining);
      if (phaseEl) phaseEl.textContent = phase.label;
      wrap.dataset.phase = phase.label;
      var overallDone = phaseIndex === phases.length - 1 && remaining === 0;
      wrap.classList.toggle("is-done", overallDone);
      wrap.classList.toggle("is-urgent", running && remaining > 0 && remaining <= 10);
      if (remaining !== 0) clearFinishShake();
      E.syncSpeakingTimerMotion(wrap, remaining, phase.seconds);
      syncLabel();
      E.syncSpeakingCompleteButton(taskId);
      E.syncResetButton(taskId);
    }

    function pause() {
      E.stopSpeakingTimerHandle(key);
      running = false;
      wrap.classList.remove("is-running", "is-urgent");
      syncLabel();
      E.syncSpeakingCompleteButton(taskId);
      E.syncResetButton(taskId);
      if (currentPhase().label === "Answer") E.stopSpeakingRecording(taskId, wrap);
    }

    function tick() {
      remaining -= 1;
      if (remaining > 0) {
        render();
        return;
      }
      remaining = 0;
      if (phaseIndex < phases.length - 1) {
        // Advance to the next phase automatically -- same interval keeps
        // running, only the label/duration/recording state change.
        if (currentPhase().label === "Answer") E.stopSpeakingRecording(taskId, wrap);
        phaseIndex += 1;
        remaining = currentPhase().seconds;
        render();
        if (currentPhase().label === "Answer") E.startSpeakingRecording(taskId, wrap);
        return;
      }
      render();
      pause();
      playFinishShake();
      if (typeof onAllDone === "function") onAllDone();
    }

    function start() {
      if (running) return;
      if (started && phaseIndex === phases.length - 1 && remaining <= 0) return;
      var firstStart = !started;
      started = true;
      if (firstStart && typeof start.onStart === "function") start.onStart();
      if (!E.state.speakingTimerTouched) E.state.speakingTimerTouched = {};
      E.state.speakingTimerTouched[taskId] = true;
      running = true;
      wrap.classList.remove("is-done");
      clearFinishShake();
      wrap.classList.add("is-running");
      render();
      E.stopSpeakingTimerHandle(key);
      E.speakingTimerHandles[key] = window.setInterval(tick, 1000);
      if (currentPhase().label === "Answer") E.startSpeakingRecording(taskId, wrap);
    }

    function reset() {
      pause();
      phaseIndex = 0;
      remaining = phases[0].seconds;
      started = false;
      wrap.classList.remove("is-done");
      clearFinishShake();
      E.syncSpeakingTimerMotion(wrap, phases[0].seconds, phases[0].seconds);
      void wrap.offsetWidth;
      render();
      if (typeof reset.onReset === "function") reset.onReset();
    }

    if (clock) {
      clock.addEventListener("animationend", function (event) {
        if (event.animationName === "ege-speaking-timer-finish-shake") clearFinishShake();
      });
      clock.addEventListener("click", function () {
        var canPause =
          !(typeof E.isFullWrittenExam === "function" && E.isFullWrittenExam());
        if (running) {
          if (canPause) pause();
          return;
        }
        if (phaseIndex === phases.length - 1 && remaining === 0) {
          reset();
          return;
        }
        start();
      });
    }

    render();

    var api = {
      start: start,
      stop: pause,
      pause: pause,
      reset: reset,
    };
    E.speakingTimerControllers[key] = api;
    return api;
  };

E.isSpeakingPractice = function isSpeakingPractice(task) {
    return (
      task &&
      (task.type === "speaking" ||
        task.type === "speaking-questions" ||
        task.type === "speaking-interview" ||
        task.type === "speaking-aloud" ||
        task.type === "writing")
    );
  }

  E.buildSpeakingTimerFace = function buildSpeakingTimerFace() {
    var uid = "t" + Math.random().toString(36).slice(2, 9);
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ege-speaking-timer__face");
    svg.setAttribute("viewBox", "0 0 512 512");
    svg.setAttribute("aria-hidden", "true");
    svg.focusable = false;
    svg.innerHTML =
      '<defs><filter id="ege-timer-shadow-' +
      uid +
      '" x="-20%" y="-20%" width="140%" height="140%">' +
      '<feDropShadow dx="0" dy="9" stdDeviation="3" flood-color="#081B5C" flood-opacity="0.25"/>' +
      "</filter></defs>" +
      '<g stroke-linecap="round" stroke-linejoin="round" filter="url(#ege-timer-shadow-' +
      uid +
      ')">' +
      '<path d="M206 88V72h100v16" fill="none" stroke="#081B5C" stroke-width="20"/>' +
      '<rect x="177" y="43" width="158" height="40" rx="20" fill="#FF174F" stroke="#081B5C" stroke-width="14"/>' +
      '<path d="M163 117l-41-41" fill="none" stroke="#081B5C" stroke-width="19"/>' +
      '<path d="M87 50l50 50-29 29-50-50z" fill="#FF174F" stroke="#081B5C" stroke-width="14"/>' +
      '<path d="M349 117l41-41" fill="none" stroke="#081B5C" stroke-width="19"/>' +
      '<path d="M425 50l-50 50 29 29 50-50z" fill="#FF174F" stroke="#081B5C" stroke-width="14"/>' +
      '<circle cx="256" cy="278" r="185" fill="#FFFDF7" stroke="#081B5C" stroke-width="20"/>' +
      '<circle class="ege-speaking-timer__progress" cx="256" cy="278" r="168" fill="none" stroke="#FF174F" stroke-width="13" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-90 256 278)" opacity="0.95"/>' +
      '<path d="M256 129v20M256 427v-20M107 278h20M405 278h-20" fill="none" stroke="#081B5C" stroke-width="16"/>' +
      '<path d="M151 173l14 14M361 173l-14 14M151 383l14-14M361 383l-14-14" fill="none" stroke="#081B5C" stroke-width="13"/>' +
      '<path class="ege-speaking-timer__hand ege-speaking-timer__hand--hour" d="M256 278V179" fill="none" stroke="#081B5C" stroke-width="23"/>' +
      '<g class="ege-speaking-timer__sweep"><path d="M256 278V179" fill="none" stroke="#FF174F" stroke-width="23"/></g>' +
      '<circle cx="256" cy="278" r="22" fill="#FF174F" stroke="#081B5C" stroke-width="12"/>' +
      '<path d="M171 447l-15 31M341 447l15 31" fill="none" stroke="#081B5C" stroke-width="19"/>' +
      "</g>";
    return svg;
  }

  E.createSpeakingTimerWrap = function createSpeakingTimerWrap(seconds, phaseLabel) {
    var wrap = document.createElement("div");
    wrap.className = "ege-speaking-timer";
    wrap.dataset.duration = String(seconds);
    if (phaseLabel) wrap.dataset.phase = phaseLabel;

    var phase = document.createElement("p");
    phase.className = "ege-speaking-timer__phase";
    phase.textContent = phaseLabel || "";

    var clock = document.createElement("button");
    clock.type = "button";
    clock.className = "ege-speaking-timer__clock";

    var face = E.buildSpeakingTimerFace();

    var display = document.createElement("span");
    display.className = "ege-speaking-timer__display";
    display.textContent = E.formatSpeakingTimer(seconds);
    display.setAttribute("aria-live", "polite");

    clock.appendChild(face);
    clock.appendChild(display);
    wrap.appendChild(phase);
    wrap.appendChild(clock);
    E.syncSpeakingTimerMotion(wrap, seconds, seconds);
    return wrap;
  }

E.chainSpeakingTimers = function chainSpeakingTimers(wraps, secondsList, taskId, onAllDone) {
    var first = secondsList[0];
    var second = secondsList[1];
    var timerSecond = E.bindSpeakingTimer(wraps[second], taskId, onAllDone);
    E.bindSpeakingTimer(wraps[first], taskId, function () {
      timerSecond.start();
    }, {
      beforeStart: function () {
        timerSecond.reset();
      },
    });
  }

E.bindSpeakingQuestionsTimers = function bindSpeakingQuestionsTimers(taskId, prepWrap, askWrap, nextBtn) {
    var askIndex = -1;
    var startingRound = false;
    var askCycleDone = false;

    function questionCount() {
      var taskEl = E.getSpeakingTaskEl(taskId);
      if (!taskEl) return 0;
      return taskEl.querySelectorAll(".ege-speaking-points li").length;
    }

    function syncNextButton() {
      if (!nextBtn) return;
      var total = questionCount();
      var inCycle = askIndex >= 0 && askIndex < total;
      nextBtn.hidden = !inCycle;
      nextBtn.disabled = !inCycle;
      if (!inCycle) {
        nextBtn.textContent = ">>";
        nextBtn.setAttribute("aria-label", "Next question");
        nextBtn.title = "Next question";
        return;
      }
      var isLast = askIndex >= total - 1;
      nextBtn.textContent = isLast ? "Finish" : ">>";
      nextBtn.setAttribute("aria-label", isLast ? "Finish" : "Next question");
      nextBtn.title = isLast ? "Finish" : "Next question";
    }

    function clearAskProgress() {
      askCycleDone = false;
      askIndex = -1;
      E.clearSpeakingQuestionHighlights(taskId);
      syncNextButton();
      E.syncSpeakingCompleteButton(taskId);
    }

    function startAskRound(index) {
      var total = questionCount();
      if (index < 0 || index >= total) {
        clearAskProgress();
        return;
      }
      askCycleDone = false;
      askIndex = index;
      E.setSpeakingQuestionHighlight(taskId, askIndex);
      startingRound = true;
      askTimer.reset();
      askTimer.start();
      startingRound = false;
      syncNextButton();
      E.syncSpeakingCompleteButton(taskId);
    }

    function finishAskCycle() {
      askTimer.reset();
      askIndex = -1;
      askCycleDone = true;
      E.clearSpeakingQuestionHighlights(taskId);
      syncNextButton();
      // No separate manual "Done" button for these tasks -- asking the
      // last question (or its timer running out) is the natural end of
      // the task, so it scores itself the moment the cycle finishes.
      if (typeof E.markSpeakingComplete === "function") E.markSpeakingComplete(taskId);
      E.syncSpeakingCompleteButton(taskId);
      E.syncResetButton(taskId);
    }

    function advanceAskRound() {
      if (askIndex < 0) return;
      var total = questionCount();
      if (askIndex >= total - 1) {
        finishAskCycle();
        return;
      }
      startAskRound(askIndex + 1);
    }

    var askTimer = E.bindSpeakingTimer(askWrap, taskId, function () {
      var next = askIndex + 1;
      if (next < questionCount()) startAskRound(next);
      else finishAskCycle();
    }, {
      beforeStart: function () {
        if (startingRound) return true;
        if (askIndex >= 0) return true;
        startAskRound(0);
        return false;
      },
    });

    if (prepWrap) {
      E.bindSpeakingTimer(prepWrap, taskId, function () {
        startAskRound(0);
      }, {
        beforeStart: function () {
          askCycleDone = false;
          askIndex = -1;
          E.clearSpeakingQuestionHighlights(taskId);
          askTimer.reset();
          syncNextButton();
          E.syncSpeakingCompleteButton(taskId);
        },
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        advanceAskRound();
      });
    }

    syncNextButton();
    E.syncSpeakingCompleteButton(taskId);

    E.speakingAskCycles[taskId] = {
      isDone: function () {
        return askCycleDone;
      },
      hardReset: function () {
        clearAskProgress();
      },
    };
  }

E.buildSpeakingTimers = function buildSpeakingTimers(taskId, durations, options) {
    var row = document.createElement("div");
    row.className = "ege-speaking-timers";
    var wraps = {};
    var secondsList = durations && durations.length ? durations : [150, 180];
    var askCycle = !!(
      options &&
      options.askCycle &&
      (secondsList.length === 1 || secondsList.length === 2)
    );
    var sequential = !!(options && options.sequential && secondsList.length === 2);

    if (sequential) {
      var phases = [
        { seconds: secondsList[0], label: "Preparation" },
        { seconds: secondsList[1], label: "Answer" },
      ];
      var seqWrap = E.createSpeakingTimerWrap(phases[0].seconds, phases[0].label);
      row.appendChild(seqWrap);
      var seqApi = E.bindSpeakingSequentialTimer(seqWrap, taskId, phases, options.onAllDone);
      if (typeof options.onReset === "function") seqApi.reset.onReset = options.onReset;
      if (typeof options.onStart === "function") seqApi.start.onStart = options.onStart;
      return row;
    }

    if (askCycle) {
      // No prep phase at all when there's only one duration -- the exam
      // reveals each question the moment its answer window starts, one
      // after another, so there's nothing to "prepare" beforehand.
      var askSeconds = secondsList[secondsList.length === 2 ? 1 : 0];
      var prepWrap = null;
      if (secondsList.length === 2) {
        prepWrap = E.createSpeakingTimerWrap(secondsList[0], "Preparation");
        row.appendChild(prepWrap);
      }
      var askWrap = E.createSpeakingTimerWrap(askSeconds, "Answer");
      var askSlot = document.createElement("div");
      askSlot.className = "ege-speaking-ask-slot";
      askSlot.appendChild(askWrap);

      var nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "ege-speaking-ask-next";
      nextBtn.textContent = ">>";
      nextBtn.setAttribute("aria-label", "Next question");
      nextBtn.title = "Next question";
      nextBtn.hidden = true;
      nextBtn.disabled = true;
      askSlot.appendChild(nextBtn);
      row.appendChild(askSlot);

      E.bindSpeakingQuestionsTimers(taskId, prepWrap, askWrap, nextBtn);
      return row;
    }

    secondsList.forEach(function (seconds, index) {
      var phaseLabel = index === 0 ? "Preparation" : index === 1 ? "Answer" : "";
      var wrap = E.createSpeakingTimerWrap(seconds, phaseLabel);
      wraps[seconds] = wrap;
      row.appendChild(wrap);
    });

    if (secondsList.length === 2) {
      E.chainSpeakingTimers(wraps, secondsList, taskId, options && options.onAllDone);
    } else {
      secondsList.forEach(function (seconds) {
        E.bindSpeakingTimer(wraps[seconds], taskId);
      });
    }

    return row;
  }

E.appendSpeakingPromptParagraph = function appendSpeakingPromptParagraph(parent, text, theme) {
    var p = document.createElement("p");
    var themeToken = theme ? '"' + theme + '"' : "";
    var start = themeToken ? text.indexOf(themeToken) : -1;

    if (start === -1) {
      p.textContent = text;
      parent.appendChild(p);
      return;
    }

    if (start > 0) {
      p.appendChild(document.createTextNode(text.slice(0, start)));
    }

    var mark = document.createElement("strong");
    mark.className = "ege-speaking-theme";
    mark.textContent = themeToken;
    p.appendChild(mark);
    p.appendChild(document.createTextNode(text.slice(start + themeToken.length)));
    parent.appendChild(p);
  }

E.appendSpeakingPromptContent = function appendSpeakingPromptContent(parent, text, theme) {
    if (/^\s*—/m.test(text)) {
      text.split(/\n/).forEach(function (line) {
        var trimmed = line.trim();
        if (!trimmed) return;
        var p = document.createElement("p");
        p.className = "ege-speaking-plan-line";
        p.textContent = trimmed;
        parent.appendChild(p);
      });
      return;
    }

    E.appendSpeakingPromptParagraph(parent, text, theme);
  }

E.buildSpeakingPromptBlock = function buildSpeakingPromptBlock(prompt, theme) {
    var promptBlock = document.createElement("div");
    promptBlock.className = "ege-speaking-prompt";
    prompt.split(/\n\n+/).forEach(function (para) {
      var text = para.trim();
      if (!text) return;
      E.appendSpeakingPromptContent(promptBlock, text, theme);
    });
    return promptBlock;
  }

E.buildSpeakingShell = function buildSpeakingShell(task, modifierClass, mainCol, durations, timerOptions) {
    var wrap = E.buildTaskArticle(task);
    wrap.classList.add(modifierClass);

    var body = document.createElement("div");
    body.className = "ege-speaking-body";
    body.appendChild(E.buildPanel("", mainCol, "ege-panel--work"));

    if (durations !== false) {
      var timersCol = document.createElement("aside");
      timersCol.className = "ege-speaking-timers-col";
      timersCol.appendChild(E.buildSpeakingTimers(task.id, durations, timerOptions));
      body.appendChild(timersCol);
    } else {
      body.classList.add("ege-speaking-body--solo");
    }

    var stack = document.createElement("div");
    stack.className = "ege-speaking-stack";
    stack.appendChild(body);
    wrap.appendChild(stack);
    return wrap;
  }

E.buildSpeakingImagesCol = function buildSpeakingImagesCol(images) {
    var imagesCol = document.createElement("div");
    imagesCol.className = "ege-speaking-images";

    (images || []).forEach(function (image) {
      var figure = document.createElement("figure");
      figure.className = "ege-speaking-figure";

      var img = document.createElement("img");
      img.className = "ege-speaking-figure__img";
      img.src = "speaking/" + image.src;
      img.alt = image.alt || "";
      img.loading = "lazy";
      figure.appendChild(img);

      if (image.attribution) {
        var credit = document.createElement("p");
        credit.className = "ege-speaking-figure__credit";
        credit.innerHTML = image.attribution;
        figure.appendChild(credit);
      }

      imagesCol.appendChild(figure);
    });

    return imagesCol;
  }

E.renderSpeaking = function renderSpeaking(task) {
    var briefCol = document.createElement("div");
    briefCol.className = "ege-speaking-brief";
    if (task.prompt) {
      briefCol.appendChild(E.buildSpeakingPromptBlock(task.prompt, task.title));
    }
    if (task.plan && task.plan.length) {
      var planHeading = document.createElement("h3");
      planHeading.className = "ege-speaking-plan__heading";
      planHeading.textContent = "Plan";
      briefCol.appendChild(planHeading);
      var plan = document.createElement("ol");
      plan.className = "ege-speaking-plan";
      task.plan.forEach(function (item) {
        var li = document.createElement("li");
        li.textContent = item.replace(/^\s*—\s*/, "");
        plan.appendChild(li);
      });
      briefCol.appendChild(plan);
    }

    var mainCol = document.createElement("div");
    mainCol.className = "ege-speaking-main";
    mainCol.appendChild(briefCol);
    mainCol.appendChild(E.buildSpeakingImagesCol(task.images));

    var prepSeconds = task.prepSeconds || 150;
    var speakSeconds = task.speakSeconds || 180;
    var wrap = E.buildSpeakingShell(
      task,
      "ege-task--speaking",
      mainCol,
      [prepSeconds, speakSeconds],
      {
        onAllDone: function () {
          E.markSpeakingComplete(task.id);
        },
      }
    );
    wrap.appendChild(E.buildSpeakingFooter(task.id, { autoComplete: true }));
    E.syncSpeakingCompleteButton(task.id);
    return wrap;
  }

E.buildSpeakingFooter = function buildSpeakingFooter(taskId, options) {
    options = options || {};
    return E.buildTaskFooter(taskId, 1, {
      doneButton: true,
      omitDoneButton: !!options.autoComplete,
    });
  }

E.createSpeakingAdPlaceholder = function createSpeakingAdPlaceholder() {
    var placeholder = document.createElement("div");
    placeholder.className = "ege-speaking-ad-figure__img ege-speaking-ad-figure__img--empty";
    return placeholder;
  }

E.buildSpeakingAdFigure = function buildSpeakingAdFigure(task) {
    var figure = document.createElement("figure");
    figure.className = "ege-speaking-ad-figure";

    var scale = task.image && Number(task.image.scale);
    if (scale > 0 && scale !== 1) {
      figure.style.setProperty("--ege-ad-scale", String(scale));
    }

    var src = task.image && task.image.src;
    if (src) {
      var img = document.createElement("img");
      img.className = "ege-speaking-ad-figure__img";
      img.src = "speaking/ads/" + src;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", function () {
        img.replaceWith(E.createSpeakingAdPlaceholder());
      });
      figure.appendChild(img);

      if (task.image.attribution) {
        var credit = document.createElement("p");
        credit.className = "ege-speaking-figure__credit";
        credit.innerHTML = task.image.attribution;
        figure.appendChild(credit);
      }
    } else {
      figure.appendChild(E.createSpeakingAdPlaceholder());
    }

    return figure;
  }

E.buildSpeakingQuestionsList = function buildSpeakingQuestionsList(questions) {
    var list = document.createElement("ol");
    list.className = "ege-speaking-points";
    questions.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    return list;
  }

E.renderSpeakingQuestions = function renderSpeakingQuestions(task) {
    var mainCol = document.createElement("div");
    mainCol.className = "ege-speaking-main ege-speaking-main--questions";

    var header = document.createElement("div");
    header.className = "ege-speaking-questions-header";

    var study = document.createElement("p");
    study.className = "ege-speaking-ad-lead";
    study.textContent = "Study the advertisement.";
    header.appendChild(study);

    if (task.adTitle) {
      var title = document.createElement("p");
      title.className = "ege-speaking-ad-title";
      title.textContent = task.adTitle;
      header.appendChild(title);
    }

    mainCol.appendChild(header);

    var media = document.createElement("div");
    media.className = "ege-speaking-questions-media";
    media.appendChild(E.buildSpeakingAdFigure(task));

    var timersCol = document.createElement("aside");
    timersCol.className = "ege-speaking-timers-col ege-speaking-timers-col--media";
    timersCol.appendChild(E.buildSpeakingTimers(task.id, [90, 20], { askCycle: true }));
    media.appendChild(timersCol);
    mainCol.appendChild(media);

    if (task.prompt) {
      var promptBlock = document.createElement("div");
      promptBlock.className = "ege-speaking-prompt";
      var p = document.createElement("p");
      p.textContent = task.prompt;
      promptBlock.appendChild(p);
      mainCol.appendChild(promptBlock);
    }

    if (task.questions && task.questions.length) {
      mainCol.appendChild(E.buildSpeakingQuestionsList(task.questions));
    }

    var askNote = document.createElement("p");
    askNote.className = "ege-speaking-ask-note";
    askNote.textContent = "You have 20 seconds to ask each question.";
    mainCol.appendChild(askNote);

    var wrap = E.buildSpeakingShell(task, "ege-task--speaking-questions", mainCol, false);
    wrap.appendChild(E.buildSpeakingFooter(task.id, { autoComplete: true }));
    E.syncSpeakingCompleteButton(task.id);
    return wrap;
  }

E.renderSpeakingInterview = function renderSpeakingInterview(task) {
    var mainCol = document.createElement("div");
    mainCol.className = "ege-speaking-main ege-speaking-main--interview";

    if (task.channel) {
      var channel = document.createElement("p");
      channel.className = "ege-speaking-ad-title";
      channel.textContent = task.channel;
      mainCol.appendChild(channel);
    }

    if (task.prompt) {
      var promptBlock = document.createElement("div");
      promptBlock.className = "ege-speaking-prompt";
      var p = document.createElement("p");
      p.textContent = task.prompt;
      promptBlock.appendChild(p);
      mainCol.appendChild(promptBlock);
    }

    if (task.questions && task.questions.length) {
      mainCol.appendChild(E.buildSpeakingQuestionsList(task.questions));
    }

    var askSeconds = task.answerSeconds || 40;
    var media = document.createElement("div");
    media.className = "ege-speaking-questions-media ege-speaking-questions-media--solo";
    var timersCol = document.createElement("aside");
    timersCol.className = "ege-speaking-timers-col ege-speaking-timers-col--media";
    // No preparation phase -- the interviewer just asks each question in
    // turn, so the first click on the Answer clock reveals question 1 and
    // starts its 40s window; when that runs out, the next question is
    // revealed automatically (see the CSS scoping .ege-speaking-points to
    // only show the currently active question for this task type).
    timersCol.appendChild(
      E.buildSpeakingTimers(task.id, [askSeconds], { askCycle: true })
    );
    media.appendChild(timersCol);
    mainCol.appendChild(media);

    var askNote = document.createElement("p");
    askNote.className = "ege-speaking-ask-note";
    askNote.textContent = "You have " + askSeconds + " seconds to answer each question.";
    mainCol.appendChild(askNote);

    var wrap = E.buildSpeakingShell(task, "ege-task--speaking-interview", mainCol, false);
    wrap.appendChild(E.buildSpeakingFooter(task.id, { autoComplete: true }));
    E.syncSpeakingCompleteButton(task.id);
    return wrap;
  }

E.renderSpeakingAloud = function renderSpeakingAloud(task) {
    var mainCol = document.createElement("div");
    mainCol.className = "ege-speaking-main ege-speaking-main--aloud";

    if (task.textTitle) {
      var title = document.createElement("p");
      title.className = "ege-speaking-ad-title";
      title.textContent = task.textTitle;
      mainCol.appendChild(title);
    }

    if (task.text) {
      var passage = document.createElement("div");
      // Blurred until the student actually starts the prep timer -- no
      // reading ahead before "time" officially begins, same as the real
      // exam not showing the passage before the proctor starts the clock.
      passage.className = "ege-speaking-aloud-text ege-passage is-speaking-hidden";
      task.text.split(/\n\n+/).forEach(function (para) {
        var trimmed = para.trim();
        if (!trimmed) return;
        var p = document.createElement("p");
        p.textContent = trimmed;
        passage.appendChild(p);
      });
      mainCol.appendChild(passage);
    }

    var prepSeconds = task.prepSeconds || 90;
    var speakSeconds = task.speakSeconds || 90;
    var wrap = E.buildSpeakingShell(
      task,
      "ege-task--speaking-aloud",
      mainCol,
      [prepSeconds, speakSeconds],
      {
        sequential: true,
        onStart: function () {
          if (passage) passage.classList.remove("is-speaking-hidden");
        },
        // Once the Answer phase runs out, the student is done reading --
        // blur the passage so it can't just be re-read afterwards, same as
        // the text disappearing at the end of the real oral exam.
        onAllDone: function () {
          if (passage) passage.classList.add("is-speaking-done");
          E.markSpeakingComplete(task.id);
        },
        onReset: function () {
          if (passage) {
            passage.classList.remove("is-speaking-done");
            passage.classList.add("is-speaking-hidden");
          }
        },
      }
    );
    wrap.appendChild(E.buildSpeakingFooter(task.id, { autoComplete: true }));
    E.syncSpeakingCompleteButton(task.id);
    return wrap;
  }
