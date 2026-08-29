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
    taskEl.querySelectorAll(".ege-speaking-points li.is-active").forEach(function (li) {
      li.classList.remove("is-active");
    });
  }

  E.setSpeakingQuestionHighlight = function setSpeakingQuestionHighlight(taskId, index) {
    var taskEl = E.getSpeakingTaskEl(taskId);
    if (!taskEl) return;
    var items = taskEl.querySelectorAll(".ege-speaking-points li");
    items.forEach(function (li, i) {
      li.classList.toggle("is-active", i === index);
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

    var marked = E.isSpeakingMarkedComplete(taskId);

    if (marked) {
      btn.hidden = true;
      return;
    }

    btn.hidden = false;
    btn.disabled = false;
    btn.textContent = "Mark as complete";
    btn.removeAttribute("title");
  }

E.markSpeakingComplete = function markSpeakingComplete(taskId) {
    var task = E.findTask(taskId);
    if (!task || !E.isSpeakingPractice(task)) return;
    if (E.isSpeakingMarkedComplete(taskId)) return;

    var max = E.taskMaxScore(task);
    E.state.scores[taskId] = max;
    E.saveTaskScore(taskId, max, max);
    E.setNavStatus(taskId, max, max);
    E.syncSpeakingCompleteButton(taskId);
    E.syncResetButton(taskId);
  }

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
      var label = E.formatSpeakingTimer(duration) + " timer";
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
      running = true;
      wrap.classList.remove("is-done");
      clearFinishShake();
      wrap.classList.add("is-running");
      render();
      E.stopSpeakingTimerHandle(key);
      E.speakingTimerHandles[key] = window.setInterval(tick, 1000);
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
        if (running) {
          pause();
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

E.isSpeakingPractice = function isSpeakingPractice(task) {
    return (
      task &&
      (task.type === "speaking" ||
        task.type === "speaking-questions" ||
        task.type === "speaking-interview")
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

  E.createSpeakingTimerWrap = function createSpeakingTimerWrap(seconds) {
    var wrap = document.createElement("div");
    wrap.className = "ege-speaking-timer";
    wrap.dataset.duration = String(seconds);

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
    wrap.appendChild(clock);
    E.syncSpeakingTimerMotion(wrap, seconds, seconds);
    return wrap;
  }

E.chainSpeakingTimers = function chainSpeakingTimers(wraps, secondsList, taskId) {
    var first = secondsList[0];
    var second = secondsList[1];
    var timerSecond = E.bindSpeakingTimer(wraps[second], taskId);
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
    var askCycle = !!(options && options.askCycle && secondsList.length === 2);

    secondsList.forEach(function (seconds, index) {
      var wrap = E.createSpeakingTimerWrap(seconds);
      wraps[seconds] = wrap;

      if (askCycle && index === 1) {
        var askSlot = document.createElement("div");
        askSlot.className = "ege-speaking-ask-slot";
        askSlot.appendChild(wrap);

        var nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "ege-speaking-ask-next";
        nextBtn.textContent = ">>";
        nextBtn.setAttribute("aria-label", "Next question");
        nextBtn.title = "Next question";
        nextBtn.hidden = true;
        nextBtn.disabled = true;
        askSlot.appendChild(nextBtn);
        wrap._askNextBtn = nextBtn;

        row.appendChild(askSlot);
        return;
      }

      row.appendChild(wrap);
    });

    if (askCycle) {
      E.bindSpeakingQuestionsTimers(
        taskId,
        wraps[secondsList[0]],
        wraps[secondsList[1]],
        wraps[secondsList[1]]._askNextBtn
      );
      delete wraps[secondsList[1]]._askNextBtn;
    } else if (secondsList.length === 2) {
      E.chainSpeakingTimers(wraps, secondsList, taskId);
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

E.buildSpeakingShell = function buildSpeakingShell(task, modifierClass, mainCol, durations) {
    var wrap = E.buildTaskArticle(task);
    wrap.classList.add(modifierClass);

    var body = document.createElement("div");
    body.className = "ege-speaking-body";
    body.appendChild(E.buildPanel("", mainCol, "ege-panel--work"));

    if (durations !== false) {
      var timersCol = document.createElement("aside");
      timersCol.className = "ege-speaking-timers-col";
      timersCol.appendChild(E.buildSpeakingTimers(task.id, durations));
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
      img.alt = "";
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

    var mainCol = document.createElement("div");
    mainCol.className = "ege-speaking-main";
    mainCol.appendChild(briefCol);
    mainCol.appendChild(E.buildSpeakingImagesCol(task.images));

    var prepSeconds = task.prepSeconds || 150;
    var speakSeconds = task.speakSeconds || 180;
    var wrap = E.buildSpeakingShell(task, "ege-task--speaking", mainCol, [
      prepSeconds,
      speakSeconds,
    ]);
    wrap.appendChild(E.buildSpeakingFooter(task.id));
    E.syncSpeakingCompleteButton(task.id);
    return wrap;
  }

E.buildSpeakingFooter = function buildSpeakingFooter(taskId) {
    var footer = document.createElement("div");
    footer.className = "ege-task__footer ege-speaking-footer";

    var actions = document.createElement("div");
    actions.className = "ege-task__actions";

    var completeBtn = document.createElement("button");
    completeBtn.type = "button";
    completeBtn.className = "ege-btn ege-btn--ghost ege-btn--small";
    completeBtn.id = "complete-" + taskId;
    completeBtn.textContent = "Mark as complete";
    completeBtn.addEventListener("click", function () {
      E.markSpeakingComplete(taskId);
    });
    actions.appendChild(completeBtn);

    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ege-btn ege-btn--ghost ege-btn--small";
    resetBtn.id = "reset-" + taskId;
    resetBtn.textContent = "Reset";
    resetBtn.hidden = true;
    E.bindResetButton(resetBtn, taskId);
    actions.appendChild(resetBtn);

    footer.appendChild(actions);
    footer.dataset.max = "1";
    E.syncResetButton(taskId);
    return footer;
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
    wrap.appendChild(E.buildSpeakingFooter(task.id));
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
    timersCol.appendChild(
      E.buildSpeakingTimers(task.id, [1, askSeconds], { askCycle: true })
    );
    media.appendChild(timersCol);
    mainCol.appendChild(media);

    var askNote = document.createElement("p");
    askNote.className = "ege-speaking-ask-note";
    askNote.textContent = "You have " + askSeconds + " seconds to answer each question.";
    mainCol.appendChild(askNote);

    var wrap = E.buildSpeakingShell(task, "ege-task--speaking-interview", mainCol, false);
    wrap.appendChild(E.buildSpeakingFooter(task.id));
    E.syncSpeakingCompleteButton(task.id);
    return wrap;
  }
