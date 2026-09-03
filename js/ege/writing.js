import { E } from "./runtime.js";

E.countWritingWords = function countWritingWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
};

E.writingDraftKey = function writingDraftKey(taskId, choiceId) {
  var suffix = choiceId ? ":" + choiceId : "";
  return (
    "ege-prep:writing-draft:" +
    taskId +
    suffix +
    ":" +
    String(E.state.examTimerKey || E.state.variantKey || "practice")
  );
};

E.loadWritingDraft = function loadWritingDraft(taskId, choiceId) {
  try {
    if (choiceId && E.state.writing38Drafts && E.state.writing38Drafts[choiceId] != null) {
      return E.state.writing38Drafts[choiceId];
    }
    return sessionStorage.getItem(E.writingDraftKey(taskId, choiceId)) || "";
  } catch (err) {
    return "";
  }
};

E.saveWritingDraft = function saveWritingDraft(taskId, text, choiceId) {
  try {
    if (choiceId) {
      if (!E.state.writing38Drafts) E.state.writing38Drafts = {};
      E.state.writing38Drafts[choiceId] = String(text || "");
    }
    sessionStorage.setItem(E.writingDraftKey(taskId, choiceId), String(text || ""));
  } catch (err) {
    /* ignore */
  }
};

E.getWriting38Choice = function getWriting38Choice(task) {
  if (!task || !task.choices || !task.choices.length) return "";
  return E.state.writing38Choice || "";
};

E.hasWriting38Choice = function hasWriting38Choice(task) {
  return !!E.getWriting38Choice(task);
};

E.ensureWriting38ChoiceFromDrafts = function ensureWriting38ChoiceFromDrafts(task) {
  if (!task || !task.choices || E.getWriting38Choice(task)) return;
  task.choices.forEach(function (choice) {
    if (E.getWriting38Choice(task)) return;
    if (E.normalize(E.loadWritingDraft(task.id, choice.id))) {
      E.state.writing38Choice = choice.id;
    }
  });
};

E.writing38ChoiceLabel = function writing38ChoiceLabel(choice) {
  if (!choice) return "";
  var title = String(choice.title || "").replace(/\s+in Zetland$/i, "");
  return choice.id + " · " + title;
};

E.parseWriting38Prompt = function parseWriting38Prompt(promptHtml) {
  var root = document.createElement("div");
  root.innerHTML = promptHtml || "";
  var paragraphs = Array.prototype.slice.call(root.querySelectorAll("p"));
  var question = "";
  var contextParts = [];
  var conclusion = "";

  paragraphs.forEach(function (p, index) {
    var text = (p.textContent || "").trim();
    if (!text) return;
    if (p.querySelector("strong")) {
      question = p.innerHTML;
    } else if (index === paragraphs.length - 1 && !question) {
      conclusion = text;
    } else if (!question) {
      contextParts.push(text);
    } else {
      conclusion = text;
    }
  });

  var survey = [];
  var maxPercent = 0;
  root.querySelectorAll("table tr").forEach(function (row) {
    var cells = row.querySelectorAll("td");
    if (cells.length < 2) return;
    var label = (cells[0].textContent || "").trim();
    var percentText = (cells[1].textContent || "").trim();
    var percent = parseInt(percentText, 10);
    if (!isFinite(percent)) percent = 0;
    if (percent > maxPercent) maxPercent = percent;
    survey.push({ label: label, percent: percent, percentText: percentText });
  });

  return {
    context: contextParts.join(" "),
    question: question,
    conclusion: conclusion,
    survey: survey,
    maxPercent: maxPercent || 100,
  };
};

E.getWriting38ChoiceData = function getWriting38ChoiceData(task, choiceId) {
  if (!task || !task.choices) return null;
  var wanted = choiceId || E.getWriting38Choice(task);
  return task.choices.find(function (choice) {
    return choice.id === wanted;
  });
};

E.syncWriting38ChoiceUI = function syncWriting38ChoiceUI(taskId) {
  E.syncWriting38Workspace(taskId);
};

E.confirmWriting38VariantChange = function confirmWriting38VariantChange(taskId) {
  var task = E.findTask(taskId);
  if (!task) return;
  var choiceId = E.getWriting38Choice(task);
  var textarea = document.getElementById("writing-draft-" + taskId);
  var hasDraft = !!(textarea && E.normalize(textarea.value));
  if (hasDraft) {
    var ok = window.confirm(
      "Сменить вариант? Текущий черновик останется сохранён для этого варианта."
    );
    if (!ok) return;
    if (choiceId) E.saveWritingDraft(taskId, textarea.value, choiceId);
  }
  E.state.writing38Choice = "";
  E.syncWriting38Workspace(taskId);
  if (typeof E.scheduleAutosave === "function") E.scheduleAutosave();
};

E.writingRubricKey = function writingRubricKey(taskId) {
  return (
    "ege-prep:writing-rubric:" +
    taskId +
    ":" +
    String(E.state.examTimerKey || E.state.variantKey || "practice")
  );
};

E.loadWritingRubric = function loadWritingRubric(taskId) {
  try {
    var raw = sessionStorage.getItem(E.writingRubricKey(taskId));
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
};

E.saveWritingRubric = function saveWritingRubric(taskId, scores) {
  try {
    sessionStorage.setItem(E.writingRubricKey(taskId), JSON.stringify(scores || {}));
  } catch (err) {
    /* ignore */
  }
};

E.syncWritingWordCount = function syncWritingWordCount(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.type !== "writing") return;
  var textarea = document.getElementById("writing-draft-" + taskId);
  if (!textarea) return;
  var count = E.countWritingWords(textarea.value);
  var warnUnder = task.wordMin && count > 0 && count < task.wordMin;
  var warnOver = task.wordMax && count > task.wordMax;

  document.querySelectorAll('[data-writing-count="' + taskId + '"]').forEach(function (el) {
    var ru = el.dataset.writingCountLang === "ru";
    var unit = ru ? "слов" : "words";
    var rangeText =
      task.wordMin && task.wordMax
        ? count + " / " + task.wordMin + "–" + task.wordMax + " " + unit
        : count + " " + unit;
    el.textContent = rangeText;
    el.classList.toggle("is-under", warnUnder);
    el.classList.toggle("is-over", warnOver);
  });
};

E.markWritingDraftSaved = function markWritingDraftSaved(taskId) {
  document.querySelectorAll('[data-writing-saved="' + taskId + '"]').forEach(function (el) {
    el.textContent = "Сохранено автоматически";
    el.hidden = false;
  });
};

E.calcWritingRubricTotal = function calcWritingRubricTotal(task, scores) {
  if (!task || !task.rubric || !task.rubric.length) return null;
  var total = 0;
  var k1Zero = false;
  task.rubric.forEach(function (criterion) {
    var val = scores[criterion.id];
    if (val == null || val === "") return;
    var n = Number(val);
    if (!isFinite(n)) return;
    if (criterion.zeroAll && n === 0) k1Zero = true;
    total += n;
  });
  if (k1Zero) return 0;
  return E.limitScore(total, task.maxScore || total);
};

E.isWritingSelfAssessmentVisible = function isWritingSelfAssessmentVisible(taskId) {
  var section = document.getElementById("writing-rubric-self-" + taskId);
  return !!(section && !section.hidden);
};

E.syncWritingRubricUI = function syncWritingRubricUI(taskId) {
  var task = E.findTask(taskId);
  if (!task || !task.rubric || !task.rubric.length) return;
  if (!E.isWritingSelfAssessmentVisible(taskId)) return;

  var scores = {};
  var complete = true;
  var k1Zero = false;

  task.rubric.forEach(function (criterion) {
    var name = "writing-rubric-" + taskId + "-" + criterion.id;
    var checked = document.querySelector('input[name="' + name + '"]:checked');
    if (!checked) {
      complete = false;
      return;
    }
    var val = Number(checked.value);
    scores[criterion.id] = val;
    if (criterion.zeroAll && val === 0) k1Zero = true;
  });

  var totalEl = document.getElementById("writing-rubric-total-" + taskId);
  var warnEl = document.getElementById("writing-rubric-warn-" + taskId);
  if (!totalEl) return;

  if (!complete) {
    totalEl.textContent = "— / " + (task.maxScore || 0);
    if (warnEl) warnEl.hidden = true;
    return;
  }

  var total = k1Zero ? 0 : E.calcWritingRubricTotal(task, scores);
  totalEl.textContent = total + " / " + (task.maxScore || 0);
  if (warnEl) warnEl.hidden = !k1Zero;

  E.saveWritingRubric(taskId, scores);
  if (task.examNum) {
    E.saveWritingScore(task.examNum, E.state.examTimerKey || E.state.variantKey, total);
  }
  E.state.scores[taskId] = total;
  E.saveTaskScore(taskId, total, task.maxScore || total);
  E.setNavStatus(taskId, total, task.maxScore || total);
  if (typeof E.syncResetButton === "function") E.syncResetButton(taskId);
};

E.writingCriteriaMobileQuery = function writingCriteriaMobileQuery() {
  return window.matchMedia && window.matchMedia("(max-width: 767px)");
};

E.isWritingCriteriaMobile = function isWritingCriteriaMobile() {
  var query = E.writingCriteriaMobileQuery();
  return !!(query && query.matches);
};

E.getWritingCriteriaDrawer = function getWritingCriteriaDrawer(taskId) {
  return document.getElementById("writing-criteria-" + taskId);
};

E.getWritingCriteriaTrigger = function getWritingCriteriaTrigger(taskId) {
  return document.getElementById("writing-criteria-trigger-" + taskId);
};

E.getWritingCriteriaFocusables = function getWritingCriteriaFocusables(root) {
  if (!root) return [];
  return Array.prototype.slice
    .call(
      root.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )
    .filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
};

E.trapWritingCriteriaFocus = function trapWritingCriteriaFocus(event, drawer) {
  if (!drawer || event.key !== "Tab") return;
  var focusables = E.getWritingCriteriaFocusables(drawer.querySelector(".ege-writing-criteria__panel"));
  if (!focusables.length) return;
  var first = focusables[0];
  var last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

E.closeWritingCriteriaDrawer = function closeWritingCriteriaDrawer(taskId, opts) {
  opts = opts || {};
  var drawer = E.getWritingCriteriaDrawer(taskId);
  var trigger = E.getWritingCriteriaTrigger(taskId);
  if (!drawer) return;

  drawer.classList.remove("is-open");
  drawer.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
  if (trigger) trigger.setAttribute("aria-expanded", "false");

  document.documentElement.classList.remove("ege-writing-criteria-open");
  if (drawer._criteriaKeydown) {
    document.removeEventListener("keydown", drawer._criteriaKeydown);
    drawer._criteriaKeydown = null;
  }

  if (opts.returnFocus !== false && trigger) trigger.focus();
};

E.openWritingCriteriaDrawer = function openWritingCriteriaDrawer(taskId) {
  var drawer = E.getWritingCriteriaDrawer(taskId);
  var trigger = E.getWritingCriteriaTrigger(taskId);
  if (!drawer) return;

  drawer.hidden = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  if (trigger) trigger.setAttribute("aria-expanded", "true");

  if (E.isWritingCriteriaMobile()) {
    document.documentElement.classList.add("ege-writing-criteria-open");
  }

  var closeBtn = drawer.querySelector(".ege-writing-criteria__close");
  if (closeBtn) closeBtn.focus();

  if (!drawer._criteriaKeydown) {
    drawer._criteriaKeydown = function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        E.closeWritingCriteriaDrawer(taskId);
        return;
      }
      if (E.isWritingCriteriaMobile()) E.trapWritingCriteriaFocus(event, drawer);
    };
    document.addEventListener("keydown", drawer._criteriaKeydown);
  }
};

E.showWritingSelfAssessment = function showWritingSelfAssessment(taskId) {
  var task = E.findTask(taskId);
  var section = document.getElementById("writing-rubric-self-" + taskId);
  var trigger = document.querySelector(
    '#writing-criteria-' + taskId + " .ege-writing-criteria__self-trigger"
  );
  if (!section || !task) return;

  section.hidden = false;
  if (trigger) trigger.hidden = true;
  E.syncWritingRubricUI(taskId);

  var firstRadio = section.querySelector('input[type="radio"]');
  if (firstRadio) firstRadio.focus();
};

E.writingCriteriaIcon = function writingCriteriaIcon() {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ege-writing-criteria-trigger__icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
};

E.buildWritingCriteriaButton = function buildWritingCriteriaButton(task) {
  var trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ege-btn ege-btn--outline ege-writing-criteria-trigger";
  trigger.id = "writing-criteria-trigger-" + task.id;
  trigger.setAttribute("aria-controls", "writing-criteria-" + task.id);
  trigger.setAttribute("aria-expanded", "false");
  trigger.appendChild(E.writingCriteriaIcon());
  var label = document.createElement("span");
  label.textContent = "Критерии · " + (task.maxScore || 0) + " баллов";
  trigger.appendChild(label);
  trigger.addEventListener("click", function () {
    var drawer = E.getWritingCriteriaDrawer(task.id);
    if (drawer && drawer.classList.contains("is-open")) E.closeWritingCriteriaDrawer(task.id);
    else E.openWritingCriteriaDrawer(task.id);
  });
  return trigger;
};

E.buildWritingCriteriaTrigger = function buildWritingCriteriaTrigger(task) {
  var toolbar = document.createElement("div");
  toolbar.className = "ege-writing-toolbar";
  toolbar.appendChild(E.buildWritingCriteriaButton(task));
  return toolbar;
};

E.buildWriting37Read = function buildWriting37Read(task) {
  var read = document.createElement("div");
  read.className = "ege-writing-read";

  if (task.promptHtml) {
    var prompt = document.createElement("div");
    prompt.className = "ege-writing-prompt ege-passage";
    prompt.innerHTML = task.promptHtml;
    read.appendChild(prompt);
  }

  if (task.plan && task.plan.length) {
    var planHeading = document.createElement("h3");
    planHeading.className = "ege-writing38-brief__subheading";
    planHeading.textContent = "Что нужно включить";
    read.appendChild(planHeading);

    var plan = document.createElement("ol");
    plan.className = "ege-writing-plan";
    task.plan.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      plan.appendChild(li);
    });
    read.appendChild(plan);
  }

  if (task.wordToleranceNote) {
    var tol = document.createElement("p");
    tol.className = "ege-writing-tolerance";
    tol.textContent = task.wordToleranceNote;
    read.appendChild(tol);
  }

  return read;
};

E.buildWritingEditorToolbar = function buildWritingEditorToolbar(task, opts) {
  opts = opts || {};
  var toolbar = document.createElement("div");
  toolbar.className = "ege-writing-toolbar";

  var start = document.createElement("div");
  start.className = "ege-writing-toolbar__start";

  if (task.rubric && task.rubric.length) {
    start.appendChild(E.buildWritingCriteriaButton(task));
  }

  if (opts.showVariantChange) {
    var variant = document.createElement("span");
    variant.className = "ege-writing-toolbar__variant";
    variant.id = "writing38-variant-" + task.id;
    variant.textContent = opts.variantLabel || "";
    start.appendChild(variant);

    var changeBtn = document.createElement("button");
    changeBtn.type = "button";
    changeBtn.className = "ege-btn ege-btn--ghost ege-writing-toolbar__change-variant";
    changeBtn.textContent = "Сменить";
    changeBtn.setAttribute("aria-label", "Сменить вариант");
    changeBtn.addEventListener("click", function () {
      E.confirmWriting38VariantChange(task.id);
    });
    start.appendChild(changeBtn);
  }

  toolbar.appendChild(start);

  var resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "ege-btn ege-btn--ghost";
  resetBtn.id = "reset-" + task.id;
  resetBtn.textContent = "Reset";
  resetBtn.hidden = true;
  E.bindResetButton(resetBtn, task.id);
  toolbar.appendChild(resetBtn);

  return toolbar;
};

E.buildWritingTextarea = function buildWritingTextarea(task, opts) {
  opts = opts || {};
  var textarea = document.createElement("textarea");
  textarea.className = "ege-writing-textarea";
  textarea.id = "writing-draft-" + task.id;
  textarea.setAttribute("aria-label", task.title || "Writing draft");
  textarea.placeholder = "Write your answer here…";
  textarea.spellcheck = true;

  var choiceId = opts.choiceId || "";
  textarea.value = E.loadWritingDraft(task.id, choiceId || undefined);

  textarea.addEventListener("input", function () {
    var cid =
      task.examNum === 38 && task.choices && task.choices.length
        ? E.getWriting38Choice(task)
        : "";
    E.saveWritingDraft(task.id, textarea.value, cid || undefined);
    E.syncWritingWordCount(task.id);
    E.markWritingDraftSaved(task.id);
    E.syncResetButton(task.id);
    if (typeof E.syncWriting38OverflowMenu === "function") E.syncWriting38OverflowMenu(task.id);
    if (typeof E.scheduleAutosave === "function") E.scheduleAutosave();
  });

  return textarea;
};

E.buildWritingStickyFooter = function buildWritingStickyFooter(task) {
  var footer = document.createElement("div");
  footer.className = "ege-writing-footer";

  var count = document.createElement("span");
  count.className = "ege-writing-footer__count";
  count.dataset.writingCount = task.id;
  count.dataset.writingCountMode = "range";
  footer.appendChild(count);

  return footer;
};

E.buildWritingShell = function buildWritingShell(task, readContent, editorOpts) {
  editorOpts = editorOpts || {};

  var readScroll = document.createElement("div");
  readScroll.className = "ege-read-scroll";
  readScroll.appendChild(readContent);
  var readPanel = E.buildPanel("", readScroll, "ege-panel--read");

  var workCol = document.createElement("div");
  workCol.className = "ege-work-col ege-writing-work-col";

  var workPanel = document.createElement("div");
  workPanel.className = "ege-panel ege-panel--work";
  workPanel.appendChild(E.buildWritingEditorToolbar(task, editorOpts));
  workPanel.appendChild(E.buildWritingTextarea(task, editorOpts));
  workPanel.appendChild(E.buildWritingStickyFooter(task));
  workCol.appendChild(workPanel);

  var split = E.buildSplit(readPanel, workCol, "ege-split--panels");
  split.classList.add("ege-writing-shell");
  return split;
};

E.buildWritingCriteriaAccordion = function buildWritingCriteriaAccordion(task) {
  var wrap = document.createElement("div");
  wrap.className = "ege-writing-criteria__accordions";

  task.rubric.forEach(function (criterion, index) {
    var details = document.createElement("details");
    details.className = "ege-writing-criteria__item";
    if (index === 0) details.open = true;

    var summary = document.createElement("summary");
    summary.className = "ege-writing-criteria__summary";
    summary.textContent = criterion.title + " · 0–" + criterion.maxScore;
    details.appendChild(summary);

    var list = document.createElement("ul");
    list.className = "ege-writing-criteria__levels";
    (criterion.levels || []).forEach(function (level) {
      var item = document.createElement("li");
      item.className = "ege-writing-criteria__level";
      item.innerHTML =
        "<strong>" +
        level.score +
        "</strong> — " +
        String(level.text || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      list.appendChild(item);
    });
    details.appendChild(list);
    wrap.appendChild(details);
  });

  return wrap;
};

E.buildWritingSelfAssessment = function buildWritingSelfAssessment(task) {
  var section = document.createElement("section");
  section.className = "ege-writing-rubric ege-writing-rubric--self";
  section.id = "writing-rubric-self-" + task.id;
  section.hidden = true;
  section.setAttribute("aria-labelledby", "writing-rubric-self-heading-" + task.id);

  var heading = document.createElement("h3");
  heading.className = "ege-writing-rubric__heading";
  heading.id = "writing-rubric-self-heading-" + task.id;
  heading.textContent = "Самооценка — необязательно";
  section.appendChild(heading);

  if (task.rubricNote) {
    var note = document.createElement("p");
    note.className = "ege-writing-rubric__note";
    note.textContent = task.rubricNote;
    section.appendChild(note);
  }

  var saved = E.loadWritingRubric(task.id);
  var hasSaved = task.rubric.every(function (criterion) {
    return saved[criterion.id] != null && saved[criterion.id] !== "";
  });

  task.rubric.forEach(function (criterion) {
    var block = document.createElement("fieldset");
    block.className = "ege-writing-rubric__criterion";

    var legend = document.createElement("legend");
    legend.className = "ege-writing-rubric__legend";
    legend.textContent = criterion.title + " (0–" + criterion.maxScore + ")";
    block.appendChild(legend);

    var scores = document.createElement("div");
    scores.className = "ege-writing-rubric__scores";

    (criterion.levels || []).forEach(function (level) {
      var row = document.createElement("label");
      row.className = "ege-writing-rubric__score-opt";
      row.title = level.text || "";

      var input = document.createElement("input");
      input.type = "radio";
      input.name = "writing-rubric-" + task.id + "-" + criterion.id;
      input.value = String(level.score);
      if (String(saved[criterion.id]) === String(level.score)) input.checked = true;
      input.addEventListener("change", function () {
        E.syncWritingRubricUI(task.id);
      });
      row.appendChild(input);

      var badge = document.createElement("span");
      badge.className = "ege-writing-rubric__score";
      badge.textContent = String(level.score);
      row.appendChild(badge);

      scores.appendChild(row);
    });

    block.appendChild(scores);

    var hints = document.createElement("ul");
    hints.className = "ege-writing-rubric__hints";
    (criterion.levels || []).forEach(function (level) {
      var li = document.createElement("li");
      li.textContent = level.score + " — " + level.text;
      hints.appendChild(li);
    });
    block.appendChild(hints);

    section.appendChild(block);
  });

  var footer = document.createElement("div");
  footer.className = "ege-writing-rubric__footer";

  var total = document.createElement("p");
  total.className = "ege-writing-rubric__total";
  total.innerHTML =
    'Итого: <strong id="writing-rubric-total-' +
    task.id +
    '">— / ' +
    (task.maxScore || 0) +
    "</strong>";
  footer.appendChild(total);

  var warn = document.createElement("p");
  warn.className = "ege-writing-rubric__warn";
  warn.id = "writing-rubric-warn-" + task.id;
  warn.hidden = true;
  warn.textContent = "При 0 баллов по K1 всё задание оценивается в 0 баллов.";
  footer.appendChild(warn);

  section.appendChild(footer);

  if (hasSaved) section.hidden = false;

  return section;
};

E.buildWritingCriteriaDrawer = function buildWritingCriteriaDrawer(task) {
  var root = document.createElement("div");
  root.className = "ege-writing-criteria";
  root.id = "writing-criteria-" + task.id;
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", E.isWritingCriteriaMobile() ? "true" : "false");
  root.setAttribute("aria-labelledby", "writing-criteria-heading-" + task.id);
  root.setAttribute("aria-hidden", "true");

  var backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "ege-writing-criteria__backdrop";
  backdrop.setAttribute("aria-label", "Закрыть критерии");
  backdrop.addEventListener("click", function () {
    E.closeWritingCriteriaDrawer(task.id);
  });
  root.appendChild(backdrop);

  var panel = document.createElement("aside");
  panel.className = "ege-writing-criteria__panel";
  panel.id = "writing-criteria-panel-" + task.id;

  var header = document.createElement("header");
  header.className = "ege-writing-criteria__header";

  var titleWrap = document.createElement("div");
  titleWrap.className = "ege-writing-criteria__titles";

  var title = document.createElement("h2");
  title.className = "ege-writing-criteria__title";
  title.id = "writing-criteria-heading-" + task.id;
  title.textContent = "Критерии оценивания";
  titleWrap.appendChild(title);

  var max = document.createElement("p");
  max.className = "ege-writing-criteria__max";
  max.textContent = "Максимум: " + (task.maxScore || 0) + " баллов";
  titleWrap.appendChild(max);

  header.appendChild(titleWrap);

  var closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ege-btn ege-btn--ghost ege-writing-criteria__close";
  closeBtn.setAttribute("aria-label", "Закрыть");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", function () {
    E.closeWritingCriteriaDrawer(task.id);
  });
  header.appendChild(closeBtn);
  panel.appendChild(header);

  panel.appendChild(E.buildWritingCriteriaAccordion(task));

  var selfWrap = document.createElement("div");
  selfWrap.className = "ege-writing-criteria__self-wrap";

  var selfTrigger = document.createElement("button");
  selfTrigger.type = "button";
  selfTrigger.className = "ege-btn ege-btn--ghost ege-writing-criteria__self-trigger";
  selfTrigger.textContent = "Перейти к самооценке";
  selfTrigger.addEventListener("click", function () {
    E.showWritingSelfAssessment(task.id);
  });
  selfWrap.appendChild(selfTrigger);

  var selfSection = E.buildWritingSelfAssessment(task);
  selfWrap.appendChild(selfSection);
  if (!selfSection.hidden) selfTrigger.hidden = true;

  panel.appendChild(selfWrap);
  root.appendChild(panel);

  if (E.writingCriteriaMobileQuery()) {
    E.writingCriteriaMobileQuery().addEventListener("change", function () {
      root.setAttribute("aria-modal", E.isWritingCriteriaMobile() ? "true" : "false");
    });
  }

  return root;
};

E.buildWriting38BriefRail = function buildWriting38BriefRail(task, choice) {
  var rail = document.createElement("aside");
  rail.className = "ege-writing38-brief ege-passage";
  rail.id = "writing38-brief-" + task.id;
  rail.setAttribute("aria-label", "Brief / source data");

  var parsed = E.parseWriting38Prompt(choice.promptHtml || "");

  if (parsed.context) {
    var taskBlock = document.createElement("section");
    taskBlock.className = "ege-writing38-brief__section";
    var taskHead = document.createElement("h3");
    taskHead.className = "ege-writing38-brief__heading";
    taskHead.textContent = "Задание";
    taskBlock.appendChild(taskHead);
    var context = document.createElement("p");
    context.className = "ege-writing38-brief__context";
    context.textContent = parsed.context;
    taskBlock.appendChild(context);
    rail.appendChild(taskBlock);
  }

  if (parsed.question) {
    var qBlock = document.createElement("section");
    qBlock.className = "ege-writing38-brief__section ege-writing38-brief__section--question";
    var qHead = document.createElement("h3");
    qHead.className = "ege-writing38-brief__heading";
    qHead.textContent = "Вопрос";
    qBlock.appendChild(qHead);
    var question = document.createElement("div");
    question.className = "ege-writing38-brief__question";
    question.innerHTML = parsed.question;
    qBlock.appendChild(question);
    rail.appendChild(qBlock);
  }

  if (parsed.survey.length) {
    var surveyBlock = document.createElement("section");
    surveyBlock.className = "ege-writing38-brief__section";
    var surveyHead = document.createElement("h3");
    surveyHead.className = "ege-writing38-brief__heading";
    surveyHead.textContent = "Результаты опроса";
    surveyBlock.appendChild(surveyHead);

    var surveyCard = document.createElement("div");
    surveyCard.className = "ege-writing38-survey";
    parsed.survey.forEach(function (row) {
      var item = document.createElement("div");
      item.className = "ege-writing38-survey__row";

      var label = document.createElement("span");
      label.className = "ege-writing38-survey__label";
      label.textContent = row.label;

      var pct = document.createElement("span");
      pct.className = "ege-writing38-survey__pct";
      pct.textContent = row.percentText;

      var bar = document.createElement("span");
      bar.className = "ege-writing38-survey__bar";
      bar.setAttribute("aria-hidden", "true");
      var fill = document.createElement("span");
      fill.className = "ege-writing38-survey__bar-fill";
      var width = Math.max(0, Math.min(100, (row.percent / (parsed.maxPercent || 100)) * 100));
      fill.style.width = width + "%";
      bar.appendChild(fill);

      item.appendChild(label);
      item.appendChild(pct);
      item.appendChild(bar);
      surveyCard.appendChild(item);
    });
    surveyBlock.appendChild(surveyCard);
    rail.appendChild(surveyBlock);
  }

  if (task.plan && task.plan.length) {
    var planDetails = document.createElement("details");
    planDetails.className = "ege-writing38-checklist";
    planDetails.open = true;

    var planSummary = document.createElement("summary");
    planSummary.className = "ege-writing38-checklist__summary";
    planSummary.textContent = "Что включить в ответ";
    planDetails.appendChild(planSummary);

    var plan = document.createElement("ol");
    plan.className = "ege-writing38-checklist__list";
    plan.setAttribute("aria-label", "Plan");
    task.plan.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      plan.appendChild(li);
    });
    planDetails.appendChild(plan);
    rail.appendChild(planDetails);
  }

  if (task.wordToleranceNote) {
    var tol = document.createElement("p");
    tol.className = "ege-writing-tolerance";
    tol.textContent = task.wordToleranceNote;
    rail.appendChild(tol);
  }

  return rail;
};

E.buildWriting38WorkspaceHeader = function buildWriting38WorkspaceHeader(task, choice) {
  var header = document.createElement("header");
  header.className = "ege-writing38-header";

  var titles = document.createElement("div");
  titles.className = "ege-writing38-header__titles";

  var kicker = document.createElement("p");
  kicker.className = "ege-writing38-header__kicker";
  kicker.textContent = "Opinion essay";
  titles.appendChild(kicker);

  var variant = document.createElement("h2");
  variant.className = "ege-writing38-header__variant";
  variant.id = "writing38-variant-" + task.id;
  variant.textContent = E.writing38ChoiceLabel(choice).replace(/\s+in Zetland$/i, "");
  titles.appendChild(variant);

  header.appendChild(titles);

  var actions = document.createElement("div");
  actions.className = "ege-writing38-header__actions";

  if (task.rubric && task.rubric.length) {
    actions.appendChild(E.buildWritingCriteriaButton(task));
  }

  var changeBtn = document.createElement("button");
  changeBtn.type = "button";
  changeBtn.className = "ege-btn ege-btn--ghost ege-writing38-header__change";
  changeBtn.textContent = "Сменить вариант";
  changeBtn.setAttribute("aria-label", "Сменить вариант");
  changeBtn.addEventListener("click", function () {
    E.confirmWriting38VariantChange(task.id);
  });
  actions.appendChild(changeBtn);

  var more = document.createElement("details");
  more.className = "ege-writing38-more";
  var moreSummary = document.createElement("summary");
  moreSummary.className = "ege-writing38-more__summary";
  moreSummary.setAttribute("aria-label", "Другие действия");
  moreSummary.textContent = "···";
  more.appendChild(moreSummary);

  var moreMenu = document.createElement("div");
  moreMenu.className = "ege-writing38-more__menu";
  var resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "ege-btn ege-btn--ghost";
  resetBtn.id = "reset-" + task.id;
  resetBtn.textContent = "Reset";
  resetBtn.hidden = true;
  E.bindResetButton(resetBtn, task.id);
  moreMenu.appendChild(resetBtn);
  more.appendChild(moreMenu);
  actions.appendChild(more);

  header.appendChild(actions);
  return header;
};

E.buildWriting38EditorPanel = function buildWriting38EditorPanel(task, choiceId) {
  var panel = document.createElement("section");
  panel.className = "ege-writing38-editor";
  panel.setAttribute("aria-label", "Your essay");

  var head = document.createElement("div");
  head.className = "ege-writing38-editor__head";

  var title = document.createElement("h3");
  title.className = "ege-writing38-editor__title";
  title.textContent = "Ваше эссе";
  head.appendChild(title);

  var meta = document.createElement("div");
  meta.className = "ege-writing38-editor__meta";

  var count = document.createElement("span");
  count.className = "ege-writing38-editor__count";
  count.dataset.writingCount = task.id;
  count.dataset.writingCountLang = "ru";
  meta.appendChild(count);

  var saved = document.createElement("span");
  saved.className = "ege-writing38-editor__saved";
  saved.dataset.writingSaved = task.id;
  saved.hidden = true;
  meta.appendChild(saved);

  head.appendChild(meta);
  panel.appendChild(head);

  var textarea = E.buildWritingTextarea(task, { choiceId: choiceId });
  textarea.classList.add("ege-writing38-editor__textarea");
  textarea.placeholder = "Write your essay here…";
  panel.appendChild(textarea);

  return panel;
};

E.buildWriting38ActionBar = function buildWriting38ActionBar(task) {
  var bar = document.createElement("div");
  bar.className = "ege-writing38-actionbar";

  var left = document.createElement("div");
  left.className = "ege-writing38-actionbar__left";

  var count = document.createElement("span");
  count.className = "ege-writing38-actionbar__count";
  count.dataset.writingCount = task.id;
  count.dataset.writingCountLang = "ru";
  left.appendChild(count);

  var saved = document.createElement("span");
  saved.className = "ege-writing38-actionbar__saved";
  saved.dataset.writingSaved = task.id;
  saved.hidden = true;
  left.appendChild(saved);

  bar.appendChild(left);

  return bar;
};

E.buildWriting38Workspace = function buildWriting38Workspace(task, choice) {
  var root = document.createElement("div");
  root.className = "ege-writing38-split";
  root.id = "writing38-split-" + task.id;

  root.appendChild(E.buildWriting38WorkspaceHeader(task, choice));

  var grid = document.createElement("div");
  grid.className = "ege-writing38-grid";
  grid.appendChild(E.buildWriting38BriefRail(task, choice));
  grid.appendChild(E.buildWriting38EditorPanel(task, choice.id));
  root.appendChild(grid);

  root.appendChild(E.buildWriting38ActionBar(task));
  return root;
};

E.syncWriting38OverflowMenu = function syncWriting38OverflowMenu(taskId) {
  var resetBtn = document.getElementById("reset-" + taskId);
  var more = document.querySelector("#writing38-split-" + taskId + " .ege-writing38-more");
  if (!more) return;
  more.hidden = !resetBtn || resetBtn.hidden;
};

E.buildWriting38ChoicePicker = function buildWriting38ChoicePicker(task) {
  var shell = document.createElement("div");
  shell.className = "ege-writing38-picker";
  shell.id = "writing38-picker-" + task.id;

  var heading = document.createElement("h2");
  heading.className = "ege-writing38-picker__title";
  heading.textContent = "Выберите один вариант";
  shell.appendChild(heading);

  var cards = document.createElement("div");
  cards.className = "ege-writing38-picker__cards";
  cards.setAttribute("role", "radiogroup");
  cards.setAttribute("aria-label", "Варианты задания 38");

  task.choices.forEach(function (choice) {
    var card = document.createElement("label");
    card.className = "ege-writing38-picker__card";

    var input = document.createElement("input");
    input.type = "radio";
    input.name = "writing38-choice-" + task.id;
    input.value = choice.id;
    input.addEventListener("change", function () {
      E.state.writing38Choice = choice.id;
      E.syncWriting38Workspace(task.id);
      if (typeof E.scheduleAutosave === "function") E.scheduleAutosave();
    });

    var body = document.createElement("span");
    body.className = "ege-writing38-picker__card-body";
    var idEl = document.createElement("span");
    idEl.className = "ege-writing38-picker__card-id";
    idEl.textContent = choice.id;
    var titleEl = document.createElement("span");
    titleEl.className = "ege-writing38-picker__card-title";
    titleEl.textContent = E.writing38ChoiceLabel(choice).replace(/^[^·]+·\s*/, "");
    body.appendChild(idEl);
    body.appendChild(titleEl);

    card.appendChild(input);
    card.appendChild(body);
    cards.appendChild(card);
  });

  shell.appendChild(cards);
  return shell;
};

E.syncWriting38Workspace = function syncWriting38Workspace(taskId) {
  var task = E.findTask(taskId);
  if (!task || task.examNum !== 38) return;
  var hasChoice = E.hasWriting38Choice(task);
  var picker = document.getElementById("writing38-picker-" + taskId);
  var workspace = document.getElementById("writing38-workspace-" + taskId);
  if (picker) picker.hidden = hasChoice;
  if (workspace) workspace.hidden = !hasChoice;

  // "Choose one of two" only matters before a choice is made. Once
  // picked, that instruction line is dead space -- replace it with the
  // задание text itself (same slot, top of the task box) instead of just
  // hiding it, so the box leads with the actual question.
  var panel = document.getElementById("panel-" + taskId);
  var instructions = panel && panel.querySelector(".ege-instructions");
  if (instructions && instructions.dataset.origHtml === undefined) {
    instructions.dataset.origHtml = instructions.innerHTML;
  }

  var oldSplit = document.getElementById("writing38-split-" + taskId);
  if (oldSplit) oldSplit.remove();

  if (!hasChoice) {
    if (instructions && instructions.dataset.origHtml !== undefined) {
      instructions.innerHTML = instructions.dataset.origHtml;
    }
    if (typeof E.syncMobileReadWorkTabs === "function") E.syncMobileReadWorkTabs(taskId);
    return;
  }

  var choiceId = E.getWriting38Choice(task);
  var choice = E.getWriting38ChoiceData(task, choiceId);
  if (!workspace || !choice) return;

  if (instructions) {
    var parsedPrompt = E.parseWriting38Prompt(choice.promptHtml || "");
    instructions.textContent = parsedPrompt.context || instructions.dataset.origHtml;
  }

  workspace.appendChild(E.buildWriting38Workspace(task, choice));

  E.syncWritingWordCount(taskId);
  if (typeof E.syncResetButton === "function") E.syncResetButton(taskId);
  E.syncWriting38OverflowMenu(taskId);
  if (typeof E.syncMobileReadWorkTabs === "function") E.syncMobileReadWorkTabs(taskId);
};

E.renderWriting38 = function renderWriting38(task, wrap) {
  wrap.classList.add("ege-task--writing", "ege-task--writing-essay");
  E.ensureWriting38ChoiceFromDrafts(task);

  var shell = document.createElement("div");
  shell.className = "ege-writing38";
  shell.appendChild(E.buildWriting38ChoicePicker(task));

  var workspace = document.createElement("div");
  workspace.className = "ege-writing38-workspace";
  workspace.id = "writing38-workspace-" + task.id;
  workspace.hidden = !E.hasWriting38Choice(task);
  shell.appendChild(workspace);

  wrap.appendChild(shell);
  if (task.rubric && task.rubric.length) wrap.appendChild(E.buildWritingCriteriaDrawer(task));

  E.syncWriting38Workspace(task.id);
  if (E.isWritingSelfAssessmentVisible(task.id)) E.syncWritingRubricUI(task.id);
};

E.renderWriting = function renderWriting(task) {
  var wrap = E.buildTaskArticle(task);
  wrap.classList.add("ege-task--writing", "ege-task--writing-shell");

  if (task.examNum === 38 && task.choices && task.choices.length) {
    E.renderWriting38(task, wrap);
    return wrap;
  }

  var split = E.buildWritingShell(task, E.buildWriting37Read(task), {});
  wrap.appendChild(split);

  if (task.rubric && task.rubric.length) {
    wrap.appendChild(E.buildWritingCriteriaDrawer(task));
  }

  E.syncWritingWordCount(task.id);
  E.syncResetButton(task.id);
  if (typeof E.syncMobileReadWorkTabs === "function") E.syncMobileReadWorkTabs(task.id);
  if (E.isWritingSelfAssessmentVisible(task.id)) E.syncWritingRubricUI(task.id);
  return wrap;
};
