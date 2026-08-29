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
            "speaking": _validate_speaking,
            "speaking-questions": _validate_speaking_questions,
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
