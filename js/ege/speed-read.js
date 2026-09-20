import { E } from "./runtime.js";

/* "speed-read" is a self-scoring skills drill (like "spider-web" and
   "pronounce"): the task shows one paragraph at a time on a short reading
   timer, then fires rapid-fire recall questions about it, each on its own
   short timer. No "Check" button -- typing Enter (or running out of time)
   submits and scores the question immediately. */

var games = Object.create(null);
var doms = Object.create(null);

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function toMatchKey(value) {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function acceptedAnswers(question) {
  var list = [question.answer];
  if (Array.isArray(question.accept)) list = list.concat(question.accept);
  return list.filter(Boolean).map(toMatchKey);
}

function isAnswerCorrect(question, guess) {
  var key = toMatchKey(guess);
  if (!key) return false;
  return acceptedAnswers(question).indexOf(key) !== -1;
}

function totalQuestions(task) {
  return (task.paragraphs || []).reduce(function (sum, p) {
    return sum + (p.questions || []).length;
  }, 0);
}

function clearTimer(g) {
  if (g.timerId != null) {
    clearInterval(g.timerId);
    g.timerId = null;
  }
  if (g.advanceId != null) {
    clearTimeout(g.advanceId);
    g.advanceId = null;
  }
}

function freshState(task) {
  return {
    task: task,
    paragraphIndex: 0,
    questionIndex: 0,
    correctCount: 0,
    wrongItems: [],
    phase: "idle",
    timerId: null,
    advanceId: null,
    revealed: false,
  };
}

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildTimerBar(seconds) {
  var wrap = el("div", "sr-timer");
  var track = el("div", "sr-timer__track");
  var fill = el("div", "sr-timer__fill");
  track.appendChild(fill);
  var label = el("span", "sr-timer__label", seconds + "s");
  wrap.appendChild(track);
  wrap.appendChild(label);
  return { wrap: wrap, fill: fill, label: label };
}

function runCountdown(taskId, totalSeconds, onTick, onDone) {
  var g = games[taskId];
  var totalMs = totalSeconds * 1000;
  var startedAt = Date.now();
  onTick(totalMs, totalMs);
  g.timerId = setInterval(function () {
    var elapsed = Date.now() - startedAt;
    var remaining = Math.max(0, totalMs - elapsed);
    onTick(remaining, totalMs);
    if (remaining <= 0) {
      clearInterval(g.timerId);
      g.timerId = null;
      onDone();
    }
  }, 100);
}

function renderPhase(taskId) {
  var g = games[taskId];
  var refs = doms[taskId];
  refs.body.innerHTML = "";
  if (g.phase === "idle") refs.body.appendChild(buildIdleView(taskId));
  else if (g.phase === "reading") refs.body.appendChild(buildReadingView(taskId));
  else if (g.phase === "question") refs.body.appendChild(buildQuestionView(taskId));
  else if (g.phase === "done") refs.body.appendChild(buildDoneView(taskId));
}

function buildIdleView(taskId) {
  var g = games[taskId];
  var task = g.task;
  var wrap = el("div", "sr-idle");
  wrap.appendChild(el("p", "sr-idle__meta", (task.paragraphs || []).length + " short paragraphs, " + totalQuestions(task) + " rapid questions."));
  var btn = el("button", "sr-btn sr-btn--start", "Start reading");
  btn.type = "button";
  btn.addEventListener("click", function () {
    g.phase = "reading";
    g.paragraphIndex = 0;
    renderPhase(taskId);
    beginReading(taskId);
  });
  wrap.appendChild(btn);
  return wrap;
}

function buildReadingView(taskId) {
  var g = games[taskId];
  var task = g.task;
  var paragraph = task.paragraphs[g.paragraphIndex];
  var wrap = el("div", "sr-reading");
  wrap.appendChild(
    el("p", "sr-reading__eyebrow", "Paragraph " + (g.paragraphIndex + 1) + " of " + task.paragraphs.length + " -- read fast")
  );
  wrap.appendChild(el("p", "sr-reading__text", paragraph.text));
  var timer = buildTimerBar(paragraph.readSeconds || task.readSeconds || 30);
  timer.wrap.classList.add("sr-timer--read");
  wrap.appendChild(timer.wrap);
  doms[taskId].timer = timer;
  return wrap;
}

function beginReading(taskId) {
  var g = games[taskId];
  var task = g.task;
  var paragraph = task.paragraphs[g.paragraphIndex];
  var seconds = paragraph.readSeconds || task.readSeconds || 30;
  runCountdown(
    taskId,
    seconds,
    function (remainingMs, totalMs) {
      updateTimerUI(taskId, remainingMs, totalMs);
    },
    function () {
      g.phase = "question";
      g.questionIndex = 0;
      renderPhase(taskId);
      beginQuestion(taskId);
    }
  );
}

function updateTimerUI(taskId, remainingMs, totalMs) {
  var timer = doms[taskId].timer;
  if (!timer) return;
  var pct = totalMs > 0 ? (remainingMs / totalMs) * 100 : 0;
  timer.fill.style.width = pct + "%";
  timer.label.textContent = Math.ceil(remainingMs / 1000) + "s";
  timer.wrap.classList.toggle("sr-timer--low", remainingMs <= 3000);
}

function currentQuestion(taskId) {
  var g = games[taskId];
  return g.task.paragraphs[g.paragraphIndex].questions[g.questionIndex];
}

// A multi-word answer ("eleven at night") needs more typing time than a
// single word ("London"), so it gets a longer default timer unless the
// question or task explicitly overrides it.
function answerSecondsFor(task, question) {
  if (question.answerSeconds) return question.answerSeconds;
  if (task.answerSeconds) return task.answerSeconds;
  var wordCount = String(question.answer || "").trim().split(/\s+/).filter(Boolean).length;
  return wordCount > 1 ? 15 : 10;
}

function buildQuestionView(taskId) {
  var g = games[taskId];
  var task = g.task;
  var paragraph = task.paragraphs[g.paragraphIndex];
  var question = currentQuestion(taskId);

  var wrap = el("div", "sr-question");
  wrap.appendChild(
    el(
      "p",
      "sr-question__eyebrow",
      "Question " + (g.questionIndex + 1) + " of " + paragraph.questions.length
    )
  );
  wrap.appendChild(el("p", "sr-question__prompt", question.q));

  var input = document.createElement("input");
  input.type = "text";
  input.className = "sr-question__input";
  input.autocomplete = "off";
  input.autocorrect = "off";
  input.autocapitalize = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Your answer");
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitAnswer(taskId, input.value);
    }
  });
  wrap.appendChild(input);

  var feedback = el("p", "sr-question__feedback");
  wrap.appendChild(feedback);
  doms[taskId].feedback = feedback;
  doms[taskId].input = input;

  var timer = buildTimerBar(answerSecondsFor(task, question));
  timer.wrap.classList.add("sr-timer--answer");
  wrap.appendChild(timer.wrap);
  doms[taskId].timer = timer;

  setTimeout(function () {
    input.focus();
  }, 0);

  return wrap;
}

function beginQuestion(taskId) {
  var g = games[taskId];
  var task = g.task;
  var question = currentQuestion(taskId);
  var seconds = answerSecondsFor(task, question);
  runCountdown(
    taskId,
    seconds,
    function (remainingMs, totalMs) {
      updateTimerUI(taskId, remainingMs, totalMs);
    },
    function () {
      submitAnswer(taskId, doms[taskId].input ? doms[taskId].input.value : "");
    }
  );
}

function submitAnswer(taskId, guess) {
  var g = games[taskId];
  if (g.phase !== "question") return;
  clearTimer(g);

  var question = currentQuestion(taskId);
  var refs = doms[taskId];
  var correct = isAnswerCorrect(question, guess);

  if (refs.input) refs.input.disabled = true;

  if (correct) {
    g.correctCount += 1;
    refs.feedback.className = "sr-question__feedback sr-question__feedback--correct";
    refs.feedback.textContent = "Correct!";
  } else {
    g.wrongItems.push({ q: question.q, answer: question.answer });
    refs.feedback.className = "sr-question__feedback sr-question__feedback--wrong";
    refs.feedback.textContent = String(guess || "").trim()
      ? "Not quite -- the answer was \"" + question.answer + "\"."
      : "Time's up -- the answer was \"" + question.answer + "\".";
  }

  if (refs.timer) refs.timer.wrap.classList.add("sr-timer--done");

  g.advanceId = setTimeout(function () {
    advance(taskId);
  }, 1400);
}

function advance(taskId) {
  var g = games[taskId];
  var task = g.task;
  var paragraph = task.paragraphs[g.paragraphIndex];

  g.questionIndex += 1;
  if (g.questionIndex < paragraph.questions.length) {
    renderPhase(taskId);
    beginQuestion(taskId);
    return;
  }

  g.paragraphIndex += 1;
  if (g.paragraphIndex < task.paragraphs.length) {
    g.phase = "reading";
    g.questionIndex = 0;
    renderPhase(taskId);
    beginReading(taskId);
    return;
  }

  finish(taskId);
}

function finish(taskId) {
  var g = games[taskId];
  var task = g.task;
  var max = totalQuestions(task);
  var correct = g.revealed ? 0 : g.correctCount;

  g.phase = "done";
  E.state.scores[task.id] = correct;
  if (typeof E.saveTaskScore === "function") E.saveTaskScore(task.id, correct, max);
  if (typeof E.setNavStatus === "function") E.setNavStatus(task.id, correct, max);
  if (typeof E.showScoreFeedback === "function") E.showScoreFeedback(task.id, correct, max);

  renderPhase(taskId);
}

function buildDoneView(taskId) {
  var g = games[taskId];
  var task = g.task;
  var max = totalQuestions(task);
  var wrap = el("div", "sr-done");
  wrap.appendChild(el("h3", "sr-done__title", g.revealed ? "Answers revealed" : "Round complete!"));
  wrap.appendChild(
    el("p", "sr-done__score", g.correctCount + " / " + max + " caught" + (g.revealed ? "" : ""))
  );

  var missed = g.revealed
    ? task.paragraphs.reduce(function (acc, p) {
        return acc.concat(p.questions.map(function (q) { return { q: q.q, answer: q.answer }; }));
      }, [])
    : g.wrongItems;

  if (missed.length) {
    var list = document.createElement("ul");
    list.className = "sr-done__list";
    missed.forEach(function (item) {
      var li = document.createElement("li");
      var q = el("span", "sr-done__list-q", item.q + " ");
      var a = el("b", "sr-done__list-a", item.answer);
      li.appendChild(q);
      li.appendChild(a);
      list.appendChild(li);
    });
    wrap.appendChild(list);
  }

  var retry = el("button", "sr-btn sr-btn--retry", "Try again");
  retry.type = "button";
  retry.addEventListener("click", function () {
    E.resetSpeedRead(taskId);
  });
  wrap.appendChild(retry);

  return wrap;
}

var STYLE_ID = "ege-speed-read-styles";

function ensureStylesInjected() {
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent =
    ".ege-task--speed-read{--sr-ink:#0b072e;--sr-muted:#6a69a5;--sr-accent:#01089e;--sr-good:#27ae60;--sr-bad:#c0392b;--sr-line:#c4c5d8;}" +
    ".ege-task--speed-read .sr-body{max-width:640px;margin:0 auto;}" +
    ".ege-task--speed-read .sr-idle{text-align:center;padding:24px 16px;}" +
    ".ege-task--speed-read .sr-idle__meta{margin:0 0 16px;color:var(--sr-muted);font-weight:600;}" +
    ".ege-task--speed-read .sr-btn{border:none;border-radius:14px;padding:12px 22px;font:inherit;font-weight:800;cursor:pointer;background:var(--sr-accent);color:#fff;transition:transform 0.12s ease,box-shadow 0.12s ease;}" +
    ".ege-task--speed-read .sr-btn:hover{transform:translateY(-1px);box-shadow:0 6px 14px rgba(1,8,158,0.25);}" +
    ".ege-task--speed-read .sr-btn:active{transform:translateY(0);}" +
    ".ege-task--speed-read .sr-reading{padding:8px 4px;}" +
    ".ege-task--speed-read .sr-reading__eyebrow,.ege-task--speed-read .sr-question__eyebrow{margin:0 0 10px;font-size:0.82rem;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:var(--sr-muted);}" +
    ".ege-task--speed-read .sr-reading__text{margin:0 0 18px;padding:18px 20px;border-radius:16px;background:rgba(1,8,158,0.06);color:var(--sr-ink);font-size:1.08rem;line-height:1.55;font-weight:600;}" +
    ".ege-task--speed-read .sr-question__prompt{margin:0 0 14px;font-size:1.3rem;font-weight:800;color:var(--sr-ink);}" +
    ".ege-task--speed-read .sr-question__input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:2px solid var(--sr-line);font:inherit;font-size:1.05rem;font-weight:700;color:var(--sr-ink);outline:none;margin-bottom:10px;}" +
    ".ege-task--speed-read .sr-question__input:focus{border-color:var(--sr-accent);box-shadow:0 0 0 4px rgba(1,8,158,0.12);}" +
    ".ege-task--speed-read .sr-question__input:disabled{opacity:0.7;}" +
    ".ege-task--speed-read .sr-question__feedback{min-height:1.4em;margin:0 0 12px;font-weight:700;}" +
    ".ege-task--speed-read .sr-question__feedback--correct{color:var(--sr-good);}" +
    ".ege-task--speed-read .sr-question__feedback--wrong{color:var(--sr-bad);}" +
    ".ege-task--speed-read .sr-timer{display:flex;align-items:center;gap:10px;}" +
    ".ege-task--speed-read .sr-timer__track{flex:1;height:8px;border-radius:999px;background:rgba(1,8,158,0.12);overflow:hidden;}" +
    ".ege-task--speed-read .sr-timer__fill{height:100%;background:var(--sr-accent);width:100%;transition:width 0.1s linear,background 0.2s ease;}" +
    ".ege-task--speed-read .sr-timer--low .sr-timer__fill{background:var(--sr-bad);}" +
    ".ege-task--speed-read .sr-timer--done .sr-timer__fill{transition:none;}" +
    ".ege-task--speed-read .sr-timer__label{min-width:2.4em;text-align:right;font-weight:800;font-variant-numeric:tabular-nums;color:var(--sr-muted);}" +
    ".ege-task--speed-read .sr-done{text-align:center;padding:12px 4px;}" +
    ".ege-task--speed-read .sr-done__title{margin:0 0 6px;color:var(--sr-ink);}" +
    ".ege-task--speed-read .sr-done__score{margin:0 0 16px;font-weight:800;color:var(--sr-accent);font-size:1.1rem;}" +
    ".ege-task--speed-read .sr-done__list{list-style:none;margin:0 0 20px;padding:0;text-align:left;display:flex;flex-direction:column;gap:8px;}" +
    ".ege-task--speed-read .sr-done__list li{padding:10px 14px;border-radius:12px;background:rgba(1,8,158,0.06);color:var(--sr-ink);}" +
    ".ege-task--speed-read .sr-done__list-a{color:var(--sr-accent);}";
  document.head.appendChild(style);
}

E.renderSpeedRead = function renderSpeedRead(task, topicId) {
  ensureStylesInjected();

  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--speed-read");

  var body = el("div", "sr-body");
  doms[task.id] = { wrap: wrap, body: body, timer: null, input: null, feedback: null };
  games[task.id] = freshState(task);

  wrap.appendChild(body);

  var score = document.createElement("p");
  score.className = "ege-task__score";
  score.id = "score-" + task.id;
  score.hidden = true;
  score.setAttribute("aria-live", "polite");
  wrap.appendChild(score);

  renderPhase(task.id);

  return wrap;
};

E.resetSpeedRead = function resetSpeedRead(taskId) {
  var g = games[taskId];
  var task = g ? g.task : E.findTask(taskId);
  if (!task) return;
  if (g) clearTimer(g);
  var article = document.getElementById("task-" + taskId);
  if (!article || !article.parentNode) return;
  delete games[taskId];
  delete doms[taskId];
  var fresh = E.renderSpeedRead(task, E.state.topicId);
  article.parentNode.replaceChild(fresh, article);
  if (typeof E.hideScoreFeedback === "function") E.hideScoreFeedback(taskId);
};

E.revealSpeedRead = function revealSpeedRead(taskId) {
  var g = games[taskId];
  if (!g || g.phase === "done") return;
  clearTimer(g);
  g.revealed = true;
  finish(taskId);
};
