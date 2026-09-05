import { E } from "./runtime.js";

var notesResizeByTask = {};

E.listeningNotesKey = function listeningNotesKey(taskId) {
  return "ege-prep:listening-notes:" + String(taskId || "");
};

E.loadListeningNotes = function loadListeningNotes(taskId) {
  try {
    var raw = sessionStorage.getItem(E.listeningNotesKey(taskId));
    return raw ? JSON.parse(raw) : [];
  } catch (_err) {
    return [];
  }
};

E.saveListeningNotes = function saveListeningNotes(taskId, notes) {
  try {
    sessionStorage.setItem(E.listeningNotesKey(taskId), JSON.stringify(notes || []));
  } catch (_err) {
    /* ignore */
  }
};

E.createListeningNoteId = function createListeningNoteId() {
  return "n" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
};

E.getListeningNotesSurface = function getListeningNotesSurface(taskId) {
  var taskEl = document.getElementById("task-" + taskId);
  if (!taskEl) return null;
  return (
    taskEl.querySelector(".ege-listening-step--exam-page:not([hidden])") ||
    taskEl.querySelector(".ege-work-scroll") ||
    taskEl
  );
};

E.syncListeningNotesLayerSize = function syncListeningNotesLayerSize(taskId) {
  var surface = E.getListeningNotesSurface(taskId);
  if (!surface) return;
  var layer = surface.querySelector(".ege-listening-notes-layer");
  if (!layer) return;
  layer.style.height = Math.max(surface.scrollHeight, surface.clientHeight) + "px";
  // The surface this size is tracking is also what existing notes were
  // clamped against -- a resize (window resize, mobile layout switch)
  // can leave notes placed near the old edge outside the new one.
  layer.querySelectorAll(".ege-listening-note").forEach(function (el) {
    var notes = E.loadListeningNotes(taskId);
    var note = notes.find(function (n) {
      return n.id === el.dataset.noteId;
    });
    if (note) E.clampListeningNoteToSurface(taskId, surface, el, note);
  });
};

E.bindListeningNotesResize = function bindListeningNotesResize(taskId, surface) {
  if (!surface || notesResizeByTask[taskId] || typeof ResizeObserver === "undefined") return;
  var observer = new ResizeObserver(function () {
    E.syncListeningNotesLayerSize(taskId);
  });
  observer.observe(surface);
  notesResizeByTask[taskId] = observer;
};

E.ensureListeningNotesLayer = function ensureListeningNotesLayer(taskId) {
  var surface = E.getListeningNotesSurface(taskId);
  if (!surface) return null;

  surface.classList.add("ege-listening-notes-surface");

  var layer = surface.querySelector(".ege-listening-notes-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "ege-listening-notes-layer";
    layer.dataset.taskId = taskId;
    layer.setAttribute("role", "region");
    layer.setAttribute("aria-label", "Notes");
    surface.appendChild(layer);
    E.renderListeningNotes(taskId, layer);
    E.bindListeningNotesResize(taskId, surface);
  }

  E.syncListeningNotesLayerSize(taskId);
  return layer;
};

// A note's stored x/y is only ever valid for the surface size it was
// placed at -- a click near the right/bottom edge, or the surface
// shrinking later (window resize, mobile layout), can leave it rendered
// partly or fully outside the surface. Its delete button is part of the
// note itself, so an out-of-bounds note isn't just visually clipped --
// there is no other way to reach it. Pull it back to the nearest in-
// bounds position (using its own rendered size, not a guessed constant)
// and persist the correction so it stays reachable next time too.
E.clampListeningNoteToSurface = function clampListeningNoteToSurface(taskId, surface, el, note) {
  if (!surface || !el) return;
  var surfaceRect = surface.getBoundingClientRect();
  var elRect = el.getBoundingClientRect();
  var maxX = Math.max(0, surfaceRect.width - elRect.width);
  var maxY = Math.max(0, surfaceRect.height - elRect.height);
  var x = Math.min(Math.max(0, note.x || 0), maxX);
  var y = Math.min(Math.max(0, note.y || 0), maxY);
  if (x === note.x && y === note.y) return;
  note.x = x;
  note.y = y;
  el.style.left = x + "px";
  el.style.top = y + "px";
  E.updateListeningNote(taskId, note.id, { x: x, y: y });
};

E.renderListeningNotes = function renderListeningNotes(taskId, layer) {
  if (!layer) return;
  layer.textContent = "";
  var surface = E.getListeningNotesSurface(taskId);
  E.loadListeningNotes(taskId).forEach(function (note) {
    var el = E.createListeningNoteEl(taskId, note);
    layer.appendChild(el);
    E.clampListeningNoteToSurface(taskId, surface, el, note);
  });
};

E.createListeningNoteEl = function createListeningNoteEl(taskId, note) {
  var el = document.createElement("div");
  el.className = "ege-listening-note";
  el.dataset.noteId = note.id;
  el.style.left = (note.x || 8) + "px";
  el.style.top = (note.y || 8) + "px";

  var textarea = document.createElement("textarea");
  textarea.className = "ege-listening-note__input";
  textarea.rows = 3;
  textarea.value = note.text || "";
  textarea.setAttribute("aria-label", "Note");
  el.appendChild(textarea);

  var del = document.createElement("button");
  del.type = "button";
  del.className = "ege-listening-note__delete";
  del.setAttribute("aria-label", "Delete note");
  del.textContent = "×";
  el.appendChild(del);

  del.addEventListener("click", function (event) {
    event.stopPropagation();
    E.removeListeningNote(taskId, note.id);
    el.remove();
  });

  textarea.addEventListener("blur", function () {
    E.updateListeningNote(taskId, note.id, { text: textarea.value });
  });

  textarea.addEventListener("keydown", function (event) {
    event.stopPropagation();
  });

  return el;
};

E.updateListeningNote = function updateListeningNote(taskId, noteId, patch) {
  var notes = E.loadListeningNotes(taskId).map(function (note) {
    return note.id === noteId ? Object.assign({}, note, patch || {}) : note;
  });
  E.saveListeningNotes(taskId, notes);
};

E.removeListeningNote = function removeListeningNote(taskId, noteId) {
  var notes = E.loadListeningNotes(taskId).filter(function (note) {
    return note.id !== noteId;
  });
  E.saveListeningNotes(taskId, notes);
};

E.addListeningNote = function addListeningNote(taskId, layer, x, y) {
  var rect = layer.getBoundingClientRect();
  var note = {
    id: E.createListeningNoteId(),
    x: Math.max(0, x - rect.left - 8),
    y: Math.max(0, y - rect.top - 8),
    text: "",
  };
  var notes = E.loadListeningNotes(taskId);
  notes.push(note);
  E.saveListeningNotes(taskId, notes);
  var el = E.createListeningNoteEl(taskId, note);
  layer.appendChild(el);
  E.clampListeningNoteToSurface(taskId, E.getListeningNotesSurface(taskId), el, note);
  var textarea = layer.querySelector('.ege-listening-note[data-note-id="' + note.id + '"] textarea');
  if (textarea) textarea.focus();
  E.syncListeningNotesLayerSize(taskId);
};

E.bindListeningNotesSurface = function bindListeningNotesSurface(taskId, surface) {
  if (!surface || surface.dataset.notesSurfaceBound) return;
  surface.dataset.notesSurfaceBound = "1";

  surface.addEventListener(
    "click",
    function (event) {
      var btn = document.getElementById("listening-notes-" + taskId);
      if (!btn || !btn.classList.contains("is-active")) return;
      if (event.target.closest(".ege-listening-note")) return;
      if (event.target.closest(".ege-listening-notes-toggle")) return;

      var layer = E.ensureListeningNotesLayer(taskId);
      if (!layer) return;
      event.preventDefault();
      event.stopPropagation();
      E.addListeningNote(taskId, layer, event.clientX, event.clientY);
    },
    true
  );
};

E.clearListeningNotesPlacing = function clearListeningNotesPlacing() {
  document.body.classList.remove("is-listening-notes-placing");
  document.querySelectorAll(".ege-listening-notes-toggle.is-active").forEach(function (btn) {
    btn.classList.remove("is-active");
    btn.setAttribute("aria-pressed", "false");
  });
  document.querySelectorAll(".ege-listening-notes-surface.is-listening-notes-armed").forEach(function (el) {
    el.classList.remove("is-listening-notes-armed");
  });
};

E.syncListeningNotesToggle = function syncListeningNotesToggle(taskId) {
  var btn = document.getElementById("listening-notes-" + taskId);
  var active = !!(btn && btn.classList.contains("is-active"));
  document.body.classList.toggle("is-listening-notes-placing", active);

  var surface = E.getListeningNotesSurface(taskId);
  if (!surface) return;

  if (active || E.loadListeningNotes(taskId).length) {
    E.ensureListeningNotesLayer(taskId);
  }

  surface.classList.toggle("is-listening-notes-armed", active);
  E.bindListeningNotesSurface(taskId, surface);
  E.syncListeningNotesLayerSize(taskId);
};

E.buildListeningNotesToggle = function buildListeningNotesToggle(taskId) {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ege-listening-notes-toggle";
  btn.id = "listening-notes-" + taskId;
  btn.setAttribute("aria-label", "Notes");
  btn.setAttribute("aria-pressed", "false");
  btn.title = "Notes";

  var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", "ege-listening-notes-toggle__icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML =
    '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>';
  btn.appendChild(icon);

  var label = document.createElement("span");
  label.className = "ege-listening-notes-toggle__label";
  label.textContent = "Notes";
  btn.appendChild(label);

  btn.addEventListener("click", function (event) {
    event.stopPropagation();
    var on = !btn.classList.contains("is-active");
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    E.syncListeningNotesToggle(taskId);
  });
  return btn;
};
