"""Validate runtime task JSON against engine.js expectations."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .io import load_json
from .paths import DATA, ROOT, SECTIONS, TOPIC_FILES

GAP_RE = re.compile(r'data-gap="([A-F])"')
VOCAB_GAP_RE = re.compile(r"\[\d+\]")


@dataclass
class Issue:
    level: str  # error | warn
    path: str
    message: str


@dataclass
class Report:
    issues: list[Issue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not any(i.level == "error" for i in self.issues)

    def error(self, path: str, message: str) -> None:
        self.issues.append(Issue("error", path, message))

    def warn(self, path: str, message: str) -> None:
        self.issues.append(Issue("warn", path, message))


def _task_path(topic_id: str, task: dict, index: int) -> str:
    task_id = task.get("id") or f"#{index}"
    return f"{topic_id}/{task_id}"


def _validate_gapfill(report: Report, base: str, task: dict) -> None:
    options = task.get("options") or []
    gaps = task.get("gaps") or []
    answers = task.get("answers") or {}
    html = task.get("html") or ""

    if len(options) != 7:
        report.error(base, f"gapfill expects 7 options, got {len(options)}")

    if len(gaps) != 6:
        report.warn(base, f"gapfill usually has 6 gaps (A–F), got {len(gaps)}")

    html_gaps = GAP_RE.findall(html)
    if sorted(html_gaps) != sorted(gaps):
        report.error(
            base,
            f"html data-gap labels {sorted(html_gaps)} != gaps {sorted(gaps)}",
        )

    for gap in gaps:
        if gap not in answers:
            report.error(base, f"missing answer for gap {gap}")
            continue
        ans = str(answers[gap])
        if ans not in {str(i) for i in range(1, 8)}:
            report.error(base, f"gap {gap} answer {ans!r} must be 1–7")

    used = {str(v) for v in answers.values()}
    if len(used) != len(gaps):
        report.warn(base, "duplicate option numbers used in answers")

    unused = {str(i) for i in range(1, 8)} - used
    if len(unused) != 1:
        report.warn(base, f"expected exactly 1 unused option, unused={sorted(unused)}")


def _validate_matching(report: Report, base: str, task: dict) -> None:
    headings = task.get("headings") or []
    texts = task.get("texts") or []
    answers = task.get("answers") or {}

    if len(headings) != 8:
        report.error(base, f"matching expects 8 headings, got {len(headings)}")

    letters = [t.get("letter") for t in texts]
    if len(texts) != 7:
        report.error(base, f"matching expects 7 texts (A–G), got {len(texts)}")
    if sorted(letters) != sorted("ABCDEFG"):
        report.error(base, f"text letters must be A–G, got {letters}")

    for letter in "ABCDEFG":
        if letter not in answers:
            report.warn(base, f"missing answer for text {letter}")
        elif str(answers[letter]) not in {str(i) for i in range(1, 9)}:
            report.error(base, f"text {letter} answer must be 1–8")

    used = {str(v) for v in answers.values()}
    if answers and len(used) != 7:
        report.warn(base, "duplicate heading numbers in matching answers")


def _is_vocab_cloze(task: dict) -> bool:
    if task.get("type") != "mc":
        return False
    passage = task.get("passage") or ""
    questions = task.get("questions") or []
    if not passage or not questions or not VOCAB_GAP_RE.search(passage):
        return False
    return all(re.fullmatch(r"\d+\.", (q.get("q") or "").strip()) for q in questions)


def _validate_mc(report: Report, base: str, task: dict) -> None:
    questions = task.get("questions") or []
    if not questions:
        report.error(base, "mc task has no questions")
        return

    vocab = _is_vocab_cloze(task)
    if vocab:
        nums = [int((q.get("q") or "0.").strip().rstrip(".")) for q in questions]
        if nums != sorted(nums):
            report.warn(base, "vocab cloze question numbers not in order")

    for i, q in enumerate(questions):
        opts = q.get("opts") or []
        if len(opts) != 4:
            report.error(base, f"question {i}: mc expects 4 options, got {len(opts)}")
        correct = q.get("correct")
        if correct is None:
            report.error(base, f"question {i}: missing correct index")
        elif not isinstance(correct, int) or correct not in range(len(opts)):
            report.error(base, f"question {i}: correct={correct!r} must be 0-based index")

    if not vocab and not task.get("passage"):
        report.warn(base, "reading mc has no passage")


def _validate_wordform(report: Report, base: str, task: dict) -> None:
    items = task.get("items") or []
    if not items:
        report.error(base, "wordform task has no items")
        return
    for i, item in enumerate(items):
        if not item.get("word"):
            report.error(base, f"item {i}: missing word stem")
        if not item.get("answer"):
            report.error(base, f"item {i}: missing answer")


def _validate_listening(report: Report, base: str, task: dict) -> None:
    audio = task.get("audio")
    if not audio:
        report.error(base, "listening task missing audio path")
        return
    audio_path = ROOT / audio
    if not audio_path.is_file():
        report.error(base, f"audio file not found: {audio}")

    transcript = task.get("transcriptFile")
    if transcript:
        t_path = ROOT / transcript
        if not t_path.is_file():
            report.warn(base, f"transcript file not found: {transcript}")

    exam_match = task.get("examMatch") or {}
    if exam_match:
        speakers = exam_match.get("speakers") or []
        statements = exam_match.get("statements") or []
        answers = exam_match.get("answers") or {}
        if not speakers:
            report.error(base, "examMatch missing speakers")
        if not statements:
            report.error(base, "examMatch missing statements")
        for speaker in speakers:
            if str(speaker) not in answers:
                report.error(base, f"examMatch missing answer for speaker {speaker}")

    exam_tfn = task.get("examTfn") or {}
    if exam_tfn:
        statements = exam_tfn.get("statements") or []
        if not statements:
            report.error(base, "examTfn missing statements")
        for item in statements:
            letter = item.get("letter")
            if letter and letter not in (exam_tfn.get("answers") or {}):
                report.warn(base, f"examTfn missing answer for {letter}")


def _validate_writing(report: Report, base: str, task: dict) -> None:
    # Task 38 offers two topics to choose between, so its prompt lives on each
    # entry in "choices" rather than on the task (see E.buildWriting38Choices).
    choices = task.get("choices") or []
    if choices:
        for i, choice in enumerate(choices):
            if not choice.get("id"):
                report.error(base, f"choice {i}: missing id")
            if not choice.get("title"):
                report.warn(base, f"choice {i}: missing title")
            if not choice.get("promptHtml") and not choice.get("prompt"):
                report.error(base, f"choice {i}: missing prompt")
    elif not task.get("promptHtml") and not task.get("prompt"):
        report.error(base, "writing task missing prompt")
    if task.get("examNum") not in (37, 38):
        report.warn(base, f"writing examNum is {task.get('examNum')!r}, expected 37 or 38")
    rubric = task.get("rubric") or []
    if rubric:
        for i, criterion in enumerate(rubric):
            if not criterion.get("id"):
                report.error(base, f"rubric {i}: missing id")
            if not criterion.get("levels"):
                report.error(base, f"rubric {i}: missing levels")


def _validate_chart(report: Report, base: str, task: dict) -> None:
    chart = task.get("chart")
    if not chart:
        return
    if chart.get("kind") not in ("bar", "pie"):
        report.error(base, f"chart kind {chart.get('kind')!r} must be 'bar' or 'pie'")
    rows = chart.get("data") or []
    if len(rows) < 2:
        report.error(base, "chart needs at least 2 data rows")
    for i, row in enumerate(rows):
        if not row.get("label"):
            report.error(base, f"chart row {i}: missing label")
        if not isinstance(row.get("value"), (int, float)):
            report.error(base, f"chart row {i}: value must be a number")
    total = sum(r.get("value") or 0 for r in rows if isinstance(r.get("value"), (int, float)))
    # These are shares of one survey; a pie that does not add up misleads.
    if chart.get("kind") == "pie" and rows and abs(total - 100) > 1:
        report.warn(base, f"pie chart shares total {total}, not 100")


def _validate_choice(report: Report, base: str, task: dict) -> None:
    questions = task.get("questions") or []
    if not questions:
        report.error(base, "choice task has no questions")
        return

    seen: set[str] = set()
    for i, question in enumerate(questions):
        qid = question.get("id")
        if not qid:
            report.error(base, f"question {i}: missing id")
        elif qid in seen:
            report.error(base, f"question {i}: duplicate id {qid!r}")
        else:
            seen.add(qid)
        if not question.get("stem"):
            report.error(base, f"question {i}: missing stem")

        options = question.get("options") or []
        if len(options) < 2:
            report.error(base, f"question {i}: needs at least 2 options")
        correct = [o for o in options if o.get("correct")]
        # The source trainer shipped an item with no correct option at all,
        # which is unanswerable -- never let that through again.
        if len(correct) != 1:
            report.error(
                base, f"question {i}: expected exactly 1 correct option, got {len(correct)}"
            )
        for j, option in enumerate(options):
            if not option.get("text"):
                report.error(base, f"question {i} option {j}: missing text")
            if not option.get("feedback"):
                report.warn(base, f"question {i} option {j}: missing feedback")

    _validate_chart(report, base, task)


def _validate_pairing(report: Report, base: str, task: dict) -> None:
    left = task.get("left") or []
    right = task.get("right") or []
    # Columns are problems/solutions by default but photographs/descriptions
    # in the speaking drill, so report against whatever the task calls them.
    lname = (task.get("leftTitle") or "problem").rstrip("s").lower()
    rname = (task.get("rightTitle") or "solution").rstrip("s").lower()
    if len(left) < 2:
        report.error(base, f"pairing task needs at least 2 {lname}s")
    if len(right) < len(left):
        report.error(base, "fewer options than items to match")

    right_ids = {item.get("id") for item in right}
    used: set[str] = set()
    for i, item in enumerate(left):
        if not item.get("id"):
            report.error(base, f"{lname} {i}: missing id")
        image = item.get("image") or {}
        # An item is either prose or a picture; a picture needs alt text.
        if not item.get("text") and not image.get("src"):
            report.error(base, f"{lname} {i}: needs text or an image")
        if image.get("src"):
            if not (ROOT / image["src"]).is_file():
                report.error(base, f"{lname} {i}: image not found: {image['src']}")
            if not image.get("alt"):
                report.warn(base, f"{lname} {i}: image missing alt text")
        match = item.get("match")
        if match not in right_ids:
            report.error(base, f"{lname} {i}: match {match!r} is not a {rname} id")
        elif match in used:
            # Two problems sharing a solution cannot both be satisfied 1:1.
            report.error(base, f"{lname} {i}: {rname} {match!r} already claimed")
        else:
            used.add(match)
        if not item.get("feedback"):
            report.warn(base, f"{lname} {i}: missing feedback")

    for i, item in enumerate(right):
        if not item.get("id") or not item.get("text"):
            report.error(base, f"{rname} {i}: missing id or text")
        if item.get("distractor") and item.get("id") in used:
            report.error(base, f"{rname} {i}: marked distractor but a {lname} matches it")
        if not item.get("distractor") and item.get("id") not in used:
            report.warn(base, f"{rname} {i}: unused but not marked as a distractor")

    if len(right) == len(left):
        # A straight 1:1 set is fine; only say so when a spare was expected.
        pass


def _validate_ordering(report: Report, base: str, task: dict) -> None:
    groups = task.get("groups") or []
    pool = task.get("pool") or []
    if not groups:
        report.error(base, "ordering task has no question groups")
        return

    slot_ids: list[str] = []
    for group in groups:
        if not group.get("title"):
            report.warn(base, f"group {group.get('id')!r}: missing title")
        for slot in group.get("slots") or []:
            if not slot.get("id"):
                report.error(base, f"group {group.get('id')!r}: slot missing id")
            else:
                slot_ids.append(slot["id"])

    if len(set(slot_ids)) != len(slot_ids):
        report.error(base, "duplicate slot ids")
    if len(pool) != len(slot_ids):
        report.error(base, f"{len(pool)} sentences for {len(slot_ids)} slots")

    filled: set[str] = set()
    for i, item in enumerate(pool):
        if not item.get("id") or not item.get("text"):
            report.error(base, f"sentence {i}: missing id or text")
        slot = item.get("slot")
        if slot not in slot_ids:
            report.error(base, f"sentence {i}: slot {slot!r} does not exist")
        elif slot in filled:
            report.error(base, f"sentence {i}: slot {slot!r} already taken")
        else:
            filled.add(slot)
        if not item.get("feedback"):
            report.warn(base, f"sentence {i}: missing feedback")

    for slot_id in slot_ids:
        if slot_id not in filled:
            report.error(base, f"slot {slot_id!r} has no sentence")


def _validate_pronounce(report: Report, base: str, task: dict) -> None:
    words = task.get("words") or []
    if not words:
        report.error(base, "pronounce task has no words")
        return

    seen: set[str] = set()
    seen_text: set[str] = set()
    for i, word in enumerate(words):
        word_id = word.get("id")
        if not word_id:
            report.error(base, f"word {i}: missing id")
        elif word_id in seen:
            report.error(base, f"word {i}: duplicate id {word_id!r}")
        else:
            seen.add(word_id)
        text = word.get("text")
        if not text:
            report.error(base, f"word {i}: missing text")
        else:
            folded = text.strip().lower()
            if folded in seen_text:
                report.warn(base, f"word {i} ({text!r}): duplicate word in this deck")
            seen_text.add(folded)
        if not word.get("ipa"):
            report.warn(base, f"word {i} ({text!r}): missing ipa")
        if not word.get("note"):
            report.warn(base, f"word {i} ({text!r}): missing note")


def _validate_judge(report: Report, base: str, task: dict) -> None:
    items = task.get("items") or []
    if not items:
        report.error(base, "judge task has no items")
        return

    seen: set[str] = set()
    for i, item in enumerate(items):
        item_id = item.get("id")
        if not item_id:
            report.error(base, f"item {i}: missing id")
        elif item_id in seen:
            report.error(base, f"item {i}: duplicate id {item_id!r}")
        else:
            seen.add(item_id)
        if not item.get("text"):
            report.error(base, f"item {i}: missing text")
        if not isinstance(item.get("correct"), bool):
            report.error(base, f"item {i}: 'correct' must be true/false")
        if not item.get("feedback"):
            report.warn(base, f"item {i}: missing feedback")

    # A drill with every item on one side teaches nothing to discriminate.
    verdicts = {bool(item.get("correct")) for item in items}
    if len(verdicts) < 2:
        report.warn(base, "every item has the same verdict")

    labels = task.get("labels") or {}
    for key in ("yes", "no"):
        if not labels.get(key):
            report.warn(base, f"labels.{key} missing, falling back to the default")

    if not task.get("contextHtml") and not task.get("chart"):
        report.warn(base, "judge task has no context to judge against")

    _validate_chart(report, base, task)


def _validate_speaking_aloud(report: Report, base: str, task: dict) -> None:
    if not task.get("text"):
        report.error(base, "speaking-aloud task missing text")
    if not task.get("prepSeconds"):
        report.warn(base, "speaking-aloud task missing prepSeconds")
    if not task.get("speakSeconds"):
        report.warn(base, "speaking-aloud task missing speakSeconds")


def _validate_speaking(report: Report, base: str, task: dict) -> None:
    images = task.get("images") or []
    if len(images) != 2:
        report.warn(base, f"speaking task usually has 2 images, got {len(images)}")
    for i, image in enumerate(images):
        if not image.get("src"):
            report.error(base, f"image {i}: missing src")
        if not image.get("alt"):
            report.warn(base, f"image {i}: missing alt text")
    if not task.get("prompt"):
        report.error(base, "speaking task missing prompt")
    if not task.get("plan"):
        report.warn(base, "speaking task missing plan")


def _validate_speaking_questions(report: Report, base: str, task: dict) -> None:
    if not task.get("prompt"):
        report.error(base, "speaking-questions task missing prompt")
    if not task.get("adTitle"):
        report.warn(base, "speaking-questions task missing adTitle")
    image = task.get("image") or {}
    if not image.get("src"):
        report.warn(base, "speaking-questions task missing image src")
    questions = task.get("questions") or []
    if len(questions) != 4:
        report.warn(base, f"speaking-questions task usually has 4 points, got {len(questions)}")
    for i, item in enumerate(questions):
        if not str(item).strip():
            report.error(base, f"question {i}: empty")


def _validate_speaking_interview(report: Report, base: str, task: dict) -> None:
    if not task.get("prompt"):
        report.error(base, "speaking-interview task missing prompt")
    questions = task.get("questions") or []
    if len(questions) != 5:
        report.warn(base, f"speaking-interview task usually has 5 questions, got {len(questions)}")
    for i, item in enumerate(questions):
        if not str(item).strip():
            report.error(base, f"question {i}: empty")


def validate_topic(report: Report, topic_id: str, topic: dict) -> int:
    if topic.get("id") != topic_id:
        report.error(topic_id, f"topic id {topic.get('id')!r} != filename {topic_id}")

    tasks = topic.get("tasks") or []
    seen_ids: set[str] = set()

    for index, task in enumerate(tasks):
        base = _task_path(topic_id, task, index)
        task_id = task.get("id")
        if not task_id:
            report.error(base, "task missing id")
            continue
        if task_id in seen_ids:
            report.error(base, f"duplicate task id {task_id!r}")
        seen_ids.add(task_id)

        task_type = task.get("type")
        validators = {
            "gapfill": _validate_gapfill,
            "matching": _validate_matching,
            "mc": _validate_mc,
            "wordform": _validate_wordform,
            "listening": _validate_listening,
            "writing": _validate_writing,
            "judge": _validate_judge,
            "choice": _validate_choice,
            "pairing": _validate_pairing,
            "ordering": _validate_ordering,
            "pronounce": _validate_pronounce,
            "speaking": _validate_speaking,
            "speaking-aloud": _validate_speaking_aloud,
            "speaking-questions": _validate_speaking_questions,
            "speaking-interview": _validate_speaking_interview,
        }
        fn = validators.get(task_type)
        if not fn:
            report.error(base, f"unknown task type {task_type!r}")
            continue
        fn(report, base, task)

    return len(tasks)


def validate_sections(report: Report, sections: dict, counts: dict[str, int]) -> None:
    catalog = {s["id"]: s for s in sections.get("sections") or [] if s.get("id")}

    for topic_id, count in counts.items():
        section = catalog.get(topic_id)
        if not section:
            report.warn("sections.json", f"no catalog entry for topic {topic_id}")
            continue
        declared = section.get("taskCount")
        if declared != count:
            report.warn(
                "sections.json",
                f"{topic_id}: taskCount is {declared}, data has {count} tasks",
            )

    for section_id, section in catalog.items():
        if section.get("available") is False:
            continue
        if section_id not in counts:
            report.error("sections.json", f"catalog entry {section_id} has no data file")


def validate_all(include_drafts: bool = False) -> Report:
    report = Report()
    counts: dict[str, int] = {}

    for topic_id, path in sorted(TOPIC_FILES.items()):
        if not path.is_file():
            report.error(str(path.relative_to(ROOT)), "topic file missing")
            continue
        topic = load_json(path)
        counts[topic_id] = validate_topic(report, topic_id, topic)

    if SECTIONS.is_file():
        validate_sections(report, load_json(SECTIONS), counts)

    if include_drafts and (DATA / "drafts").is_dir():
        for draft in sorted((DATA / "drafts").glob("*.json")):
            topic = load_json(draft)
            validate_topic(report, f"drafts/{draft.stem}", topic)

    return report
