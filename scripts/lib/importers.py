"""Convert source-archive tasks into runtime data/*.json format."""

from __future__ import annotations

import re

from .io import load_json, save_json
from .paths import FIPI_SOURCE, GAP_FILL_SOURCE, TOPIC_FILES

GAP_FILL_INSTRUCTIONS = (
    "Прочитайте текст и заполните пропуски A–F частями предложений, "
    "обозначенными цифрами 1–7. Одна из частей в списке 1–7 лишняя. "
    "Занесите цифры, обозначающие соответствующие части предложений, в таблицу."
)

MATCHING_INSTRUCTIONS = (
    "Установите соответствие между текстами A–G и заголовками 1–8. "
    "Занесите свои ответы в таблицу. Используйте каждую цифру только один раз. "
    "В задании один заголовок лишний."
)


def make_slug(text: str, prefix: str = "") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    slug = slug[:48] or "task"
    return f"{prefix}{slug}" if prefix else slug


def _parse_answer_pairs(answer: str) -> dict[str, str]:
    pairs: dict[str, str] = {}
    for token in answer.split():
        m = re.fullmatch(r"([A-G])(\d+)", token)
        if m:
            pairs[m.group(1)] = m.group(2)
    return pairs


def gap_source_to_html(text: str, gaps: list[str]) -> str:
    html = text
    for gap in gaps:
        html = re.sub(
            rf"\b{re.escape(gap)}\s+_{{3,}}",
            f'<span data-gap="{gap}"></span>',
            html,
            count=1,
        )
    html = html.replace("\n\n", "<br><br>").replace("\n", " ")
    return html


def convert_gap_fill(source_task: dict, slug: str, *, title: str | None = None) -> dict:
    title = title or source_task.get("title") or slug
    options = [opt["text"] for opt in sorted(source_task["options"], key=lambda o: o["num"])]
    gaps = source_task["gaps"]
    answers = _parse_answer_pairs(source_task.get("answer") or "")

    return {
        "id": slug,
        "nav": title,
        "title": title,
        "instructions": GAP_FILL_INSTRUCTIONS,
        "type": "gapfill",
        "options": options,
        "html": gap_source_to_html(source_task["text"], gaps),
        "gaps": gaps,
        "answers": answers,
    }


def convert_matching(source_task: dict, slug: str, *, title: str | None = None) -> dict:
    title = title or slug
    headings_map = source_task["headings"]
    headings = [headings_map[str(n)] for n in sorted(int(k) for k in headings_map)]
    texts = [
        {"letter": letter, "text": source_task["texts"][letter]}
        for letter in sorted(source_task["texts"])
    ]
    answers = _parse_answer_pairs(source_task.get("answer") or "")

    return {
        "id": slug,
        "nav": title,
        "title": title,
        "instructions": MATCHING_INSTRUCTIONS,
        "type": "matching",
        "headings": headings,
        "texts": texts,
        "answers": answers,
    }


def list_gap_fill_sources() -> list[dict]:
    data = load_json(GAP_FILL_SOURCE)
    return data.get("tasks") or []


def list_matching_sources() -> list[dict]:
    data = load_json(FIPI_SOURCE)
    return [
        t for t in (data.get("tasks") or [])
        if t.get("type") == "reading_matching_headings"
    ]


def find_gap_source(source_id: str) -> dict | None:
    for task in list_gap_fill_sources():
        if task.get("id") == source_id:
            return task
    return None


def find_matching_source(source_id: str) -> dict | None:
    for task in list_matching_sources():
        if task.get("id") == source_id:
            return task
    return None


def append_task(topic_id: str, task: dict, *, dry_run: bool = False) -> dict:
    path = TOPIC_FILES[topic_id]
    topic = load_json(path)
    tasks = topic.setdefault("tasks", [])
    existing = {t["id"] for t in tasks if t.get("id")}
    if task["id"] in existing:
        raise ValueError(f"task id {task['id']!r} already exists in {topic_id}")

    tasks.append(task)
    if not dry_run:
        save_json(path, topic)
    return topic
