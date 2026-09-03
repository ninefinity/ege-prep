"""Import EGE 2027 demo tasks from 2027/written_demo.json and 2027/oral_demo.json."""

from __future__ import annotations

import re
from pathlib import Path

from .io import load_json, save_json
from .paths import DATA, ROOT, SECTIONS, TOPIC_FILES

DEMO_DIR = ROOT / "2027"
DEMO_DATA = DEMO_DIR / "data"
WRITTEN = DEMO_DIR / "written_demo.json"
ORAL = DEMO_DIR / "oral_demo.json"
VARIANT_PATH = DATA / "variants" / "2027-demo.json"
AUDIO_SRC_PCH = DEMO_DIR / "АЯ ПЧ.mp3"
AUDIO_DST_PCH = ROOT / "audio" / "Demo2027-PCh.mp3"
AUDIO_DST_DEMO = DEMO_DIR / "audio" / "Demo2027-PCh.mp3"
VARIANT_TIMES = {
    "2027-demo": 190,
    "2027-demo-reading": 30,
    "2027-demo-language": 40,
    "2027-demo-speaking": 17,
}

GRAMMAR_INSTRUCTIONS = (
    "Прочитайте приведённые ниже тексты. Преобразуйте, если необходимо, слова, "
    "напечатанные заглавными буквами в конце строк, обозначенных номерами 19–24, "
    "так, чтобы они грамматически соответствовали содержанию текстов."
)
WORD_FORM_INSTRUCTIONS = (
    "Прочитайте приведённый ниже текст. Образуйте от слов, напечатанных заглавными "
    "буквами в конце строк, обозначенных номерами 25–29, однокоренные слова так, "
    "чтобы они грамматически и лексически соответствовали содержанию текста."
)
VOCAB_INSTRUCTIONS = (
    "Прочитайте текст с пропусками, обозначенными номерами 30–36. "
    "Запишите в поле ответа цифру 1, 2, 3 или 4, соответствующую выбранному Вами варианту ответа."
)
MATCHING_INSTRUCTIONS = (
    "Установите соответствие между текстами A–G и заголовками 1–8. "
    "Занесите свои ответы в таблицу. Используйте каждую цифру только один раз. "
    "В задании один заголовок лишний."
)
GAP_INSTRUCTIONS = (
    "Прочитайте текст и заполните пропуски A–F частями предложений, "
    "обозначенными цифрами 1–7. Одна из частей в списке 1–7 лишняя."
)
READING_INSTRUCTIONS = (
    "Прочитайте текст и выполните задания 12–18. "
    "В каждом задании запишите в поле ответа цифру 1, 2, 3 или 4."
)
LISTENING_INSTRUCTIONS = (
    "Вы услышите интервью. В заданиях 3–9 запишите в поле ответа цифру 1, 2 или 3, "
    "соответствующую выбранному Вами варианту ответа. Вы услышите запись дважды."
)

LISTENING_EXAM1_INSTRUCTIONS = (
    "Вы услышите 6 высказываний. Установите соответствие между высказываниями "
    "каждого говорящего A–F и утверждениями, данными в списке 1–7. "
    "Используйте каждое утверждение, обозначенное соответствующей цифрой, "
    "только один раз. В задании есть одно лишнее утверждение. "
    "Вы услышите запись дважды."
)
LISTENING_EXAM2_INSTRUCTIONS = (
    "Вы услышите диалог. Определите, какие из приведённых утверждений A–G "
    "соответствуют содержанию текста (1 – True), какие не соответствуют "
    "(2 – False) и о чём в тексте не сказано (3 – Not stated). "
    "Вы услышите запись дважды."
)

VARIANT_ENTRIES = [
    ("listening", "demo2027-listening-1"),
    ("listening", "demo2027-listening-2"),
    ("listening", "demo2027-listening-3-9"),
    ("matching-headings", "demo2027-lions"),
    ("gap-fill", "demo2027-amur-river"),
    ("reading-comprehension", "demo2027-ai-education"),
    ("grammar-transformations", "demo2027-yaroslavl-sweaters"),
    ("word-formation", "demo2027-hermitage"),
    ("vocabulary-cloze", "demo2027-sunday"),
    ("writing", "demo2027-victory-day-email"),
    ("writing", "demo2027-zetland-essay"),
    ("speaking-aloud", "demo2027-land-pollution"),
    ("speaking-questions", "demo2027-cooking-class"),
    ("speaking-interview", "demo2027-online-shopping"),
    ("speaking", "demo2027-solo-or-company"),
]

DEMO_SECTION_OVERRIDES = {
    "listening": {"examFrom": 1, "examTo": 9, "title": "Listening", "taskCount": 3},
    "writing": {
        "id": "writing",
        "group": "Writing",
        "examFrom": 37,
        "examTo": 38,
        "title": "Writing",
        "taskCount": 2,
        "available": True,
    },
    "speaking-aloud": {
        "id": "speaking-aloud",
        "group": "Speaking",
        "examFrom": 39,
        "examTo": 39,
        "title": "Reading Aloud",
        "taskCount": 1,
        "available": True,
    },
}

VARIANT_BLOCKS = [
    (
        "2027-demo-reading",
        "ЕГЭ 2027 Demo — Reading",
        [
            ("matching-headings", "demo2027-lions"),
            ("gap-fill", "demo2027-amur-river"),
            ("reading-comprehension", "demo2027-ai-education"),
        ],
    ),
    (
        "2027-demo-language",
        "ЕГЭ 2027 Demo — Grammar & Vocabulary",
        [
            ("grammar-transformations", "demo2027-yaroslavl-sweaters"),
            ("word-formation", "demo2027-hermitage"),
            ("vocabulary-cloze", "demo2027-sunday"),
        ],
    ),
    (
        "2027-demo-speaking",
        "ЕГЭ 2027 Demo — Speaking",
        [
            ("speaking-aloud", "demo2027-land-pollution"),
            ("speaking-questions", "demo2027-cooking-class"),
            ("speaking-interview", "demo2027-online-shopping"),
            ("speaking", "demo2027-solo-or-company"),
        ],
    ),
]


def _section_tasks(written: dict, section_id: str) -> list[dict]:
    for section in written.get("sections") or []:
        if section.get("id") == section_id:
            return section.get("tasks") or []
    return []


def _speaker_role(name: str) -> str:
    if name.lower() in ("presenter", "host", "interviewer"):
        return "host"
    return "guest"


def _transcript_lines(lines: list[dict]) -> str:
    return "\n".join(
        f"@{_speaker_role(line.get('speaker', ''))}|{line.get('text', '').strip()}"
        for line in lines
        if line.get("text")
    )


def _gap_html(text: str, gap_letters: list[str]) -> str:
    html = text
    for letter in gap_letters:
        html = re.sub(
            rf"\b{re.escape(letter)}\s+_{{3,}}",
            f'<span data-gap="{letter}"></span>',
            html,
            count=1,
        )
    html = html.replace("\n\n", "<br><br>").replace("\n", " ")
    return html


def _wordform_items(text: str, items: list[dict]) -> list[dict]:
    out: list[dict] = []
    for src in items:
        tid = src["id"]
        marker = f"__{tid}__"
        idx = text.find(marker)
        if idx == -1:
            raise ValueError(f"gap {tid} not found in wordform text")
        line_start = text.rfind("\n", 0, idx) + 1
        line_end = text.find("\n", idx)
        if line_end == -1:
            line_end = len(text)
        line = text[line_start:line_end]
        local_idx = idx - line_start
        pre = line[:local_idx].strip()
        post = line[local_idx + len(marker) :].strip()
        out.append(
            {
                "pre": pre,
                "word": src["prompt_word"],
                "post": post,
                "answer": src.get("correct_answer", ""),
                "alt": src.get("alt_correct_answer"),
            }
        )
    return out


def _vocab_passage(text: str) -> str:
    return re.sub(r"(\d+)___", r"[\1]", text)


_RUBRIC_TITLES = {
    "K1_content": "K1 — Содержание",
    "K2_organization": "K2 — Организация",
    "K3_language": "K3 — Языковое оформление",
    "K3_lexis": "K3 — Лексика",
    "K4_grammar": "K4 — Грамматика",
    "K5_spelling_punctuation": "K5 — Орфография и пунктуация",
}


def _normalize_rubric(scoring_criteria: dict | None) -> list[dict]:
    rubric: list[dict] = []
    for key, crit in (scoring_criteria or {}).items():
        levels = crit.get("levels") or {}
        criterion_id = key.split("_")[0] if key.startswith("K") else key
        title = _RUBRIC_TITLES.get(key, criterion_id)
        level_list = [
            {"score": int(score), "text": text}
            for score, text in sorted(levels.items(), key=lambda x: int(x[0]), reverse=True)
        ]
        rubric.append(
            {
                "id": criterion_id,
                "title": title,
                "maxScore": crit.get("max_score")
                or (max(int(s) for s in levels) if levels else 0),
                "levels": level_list,
                "zeroAll": key.startswith("K1"),
            }
        )
    return rubric


def convert_listening_tasks(written: dict) -> list[dict]:
    tasks = _section_tasks(written, "listening")
    task1 = next(t for t in tasks if t.get("id") == 1)
    task2 = next(t for t in tasks if t.get("id") == 2)
    mc_tasks = [t for t in tasks if t.get("type") == "multiple_choice"]
    transcript = mc_tasks[-1].get("shared_audio_transcript_for_tasks_3_9") or []
    audio = "audio/Demo2027-PCh.mp3"
    questions = []
    for task in mc_tasks:
        questions.append(
            {
                "q": task.get("question", ""),
                "opts": [opt["text"] for opt in task.get("options") or []],
                "correct": int(task.get("correct_answer", 1)) - 1,
            }
        )
    mc_instructions = (
        "Вы услышите интервью. В заданиях 3–9 запишите в поле ответа цифру 1, 2 или 3, "
        "соответствующую выбранному Вами варианту ответа. Вы услышите запись дважды."
    )
    return [
        {
            "id": "demo2027-listening-1",
            "nav": "Listening for main idea",
            "title": "Listening for main idea",
            "type": "listening",
            "audio": audio,
            "examFrom": 1,
            "examTo": 1,
            "examSinglePage": True,
            "instructions": task1.get("instructions_ru") or LISTENING_EXAM1_INSTRUCTIONS,
            "examMatch": {
                "instructions": task1.get("instructions_ru") or LISTENING_EXAM1_INSTRUCTIONS,
                "statements": [item["text"] for item in task1.get("statements") or []],
                "speakers": task1.get("speakers") or [],
                "answers": {k: str(v) for k, v in (task1.get("correct_answer") or {}).items()},
            },
        },
        {
            "id": "demo2027-listening-2",
            "nav": "Listening for specific information",
            "title": "Listening for specific information",
            "type": "listening",
            "audio": audio,
            "examFrom": 2,
            "examTo": 2,
            "examSinglePage": True,
            "instructions": task2.get("instructions_ru") or LISTENING_EXAM2_INSTRUCTIONS,
            "examTfn": {
                "instructions": task2.get("instructions_ru") or LISTENING_EXAM2_INSTRUCTIONS,
                "statements": [
                    {"letter": item["letter"], "text": item["text"]}
                    for item in task2.get("statements") or []
                ],
                "answers": {k: str(v) for k, v in (task2.get("correct_answer") or {}).items()},
                "labels": ["True", "False", "Not stated"],
            },
        },
        {
            "id": "demo2027-listening-3-9",
            "nav": "Full listening comprehension",
            "title": "Full listening comprehension",
            "type": "listening",
            "audio": audio,
            "examFrom": 3,
            "examTo": 9,
            "examSinglePage": True,
            "examMc": True,
            "instructions": mc_instructions,
            "transcript": _transcript_lines(transcript),
            "questions": questions,
            "mcInstructions": mc_instructions,
        },
    ]


def purge_listening_tasks(task_ids: list[str]) -> None:
    for path in (TOPIC_FILES["listening"], DEMO_DATA / "listening.json"):
        if not path.is_file():
            continue
        topic = load_json(path)
        tasks = topic.get("tasks") or []
        drop = set(task_ids)
        filtered = [task for task in tasks if task.get("id") not in drop]
        if len(filtered) != len(tasks):
            topic["tasks"] = filtered
            save_json(path, topic)


def convert_matching(written: dict) -> dict:
    task = next(t for t in _section_tasks(written, "reading") if t.get("id") == 10)
    headings = [h["text"] for h in sorted(task["headlines"], key=lambda h: h["number"])]
    texts = [{"letter": t["letter"], "text": t["text"]} for t in task["texts"]]
    answers = {letter: str(num) for letter, num in task["correct_answer"].items()}
    return {
        "id": "demo2027-lions",
        "nav": "African Lions",
        "title": "African Lions",
        "instructions": MATCHING_INSTRUCTIONS,
        "type": "matching",
        "headings": headings,
        "texts": texts,
        "answers": answers,
    }


def convert_gap_fill(written: dict) -> dict:
    task = next(t for t in _section_tasks(written, "reading") if t.get("id") == 11)
    options = [opt["text"] for opt in sorted(task["options"], key=lambda o: o["number"])]
    gaps = list(task["correct_answer"].keys())
    answers = {k: str(v) for k, v in task["correct_answer"].items()}
    return {
        "id": "demo2027-amur-river",
        "nav": "Amur River",
        "title": task.get("text_title") or "Amur River region",
        "instructions": GAP_INSTRUCTIONS,
        "type": "gapfill",
        "options": options,
        "html": _gap_html(task["text_with_gaps"], gaps),
        "gaps": gaps,
        "answers": answers,
    }


def convert_reading(written: dict) -> dict:
    reading_tasks = _section_tasks(written, "reading")
    block_tasks = sorted(
        [
            t
            for t in reading_tasks
            if isinstance(t.get("id"), int) and 12 <= t["id"] <= 18
        ],
        key=lambda t: t["id"],
    )
    shared_task = next(t for t in reading_tasks if t.get("id") == 12)
    shared = shared_task.get("shared_text") or ""
    passage = shared.replace("\n", "<br><br>")
    questions = []
    for task in block_tasks:
        num = task.get("id")
        questions.append(
            {
                "q": f"{num}. {task.get('question', '')}",
                "opts": [opt["text"] for opt in task.get("options") or []],
                "correct": int(task.get("correct_answer", 1)) - 1,
            }
        )
    return {
        "id": "demo2027-ai-education",
        "nav": "AI in Education",
        "title": shared_task.get("shared_text_title") or "AI and student experience",
        "instructions": READING_INSTRUCTIONS,
        "type": "mc",
        "passage": passage,
        "questions": questions,
    }


def convert_grammar(written: dict) -> dict:
    task = next(t for t in _section_tasks(written, "grammar_vocabulary") if t.get("id") == "19-24")
    variant = task["variant_b"]
    items = _wordform_items(variant["text_with_gaps"], variant["items"])
    return {
        "id": "demo2027-yaroslavl-sweaters",
        "nav": "Yaroslavl / Sweaters",
        "title": "Yaroslavl / From the history of sweaters",
        "instructions": GRAMMAR_INSTRUCTIONS,
        "type": "wordform",
        "grammarTitle": "Yaroslavl / From the history of sweaters",
        "passageTitles": ["Yaroslavl", "From the history of sweaters"],
        "items": items,
    }


def convert_word_formation(written: dict) -> dict:
    task = next(t for t in _section_tasks(written, "grammar_vocabulary") if t.get("id") == "25-29")
    items = _wordform_items(task["text_with_gaps"], task["items"])
    return {
        "id": "demo2027-hermitage",
        "nav": "State Hermitage",
        "title": task.get("text_title") or "The State Hermitage Museum",
        "instructions": WORD_FORM_INSTRUCTIONS,
        "type": "wordform",
        "items": items,
    }


def convert_vocab(written: dict) -> dict:
    task = next(t for t in _section_tasks(written, "grammar_vocabulary") if t.get("id") == "30-36")
    passage = _vocab_passage(task["text_with_gaps"])
    questions = []
    for item in task["items"]:
        questions.append(
            {
                "q": f"{item['id']}.",
                "opts": [opt["text"] for opt in item["options"]],
                "correct": int(item["correct_answer"]) - 1,
            }
        )
    return {
        "id": "demo2027-sunday",
        "nav": "Sunday",
        "title": task.get("text_title") or "Sunday",
        "instructions": VOCAB_INSTRUCTIONS,
        "type": "mc",
        "passage": passage,
        "questions": questions,
    }


def convert_writing_email(written: dict) -> dict:
    section = next(s for s in written["sections"] if s.get("id") == "writing")
    task = next(t for t in section["tasks"] if t.get("id") == 37)
    email = task.get("prompt_email") or {}
    body = (email.get("body") or "").replace("\n", "<br>")
    prompt_html = (
        "<p><strong>From:</strong> "
        + email.get("from", "")
        + "<br><strong>To:</strong> "
        + email.get("to", "")
        + "<br><strong>Subject:</strong> "
        + email.get("subject", "")
        + "</p><p>"
        + body
        + "</p><p>"
        + task.get("task_instructions", "")
        + "</p>"
    )
    return {
        "id": "demo2027-victory-day-email",
        "nav": "Personal email",
        "title": "Personal email",
        "type": "writing",
        "examNum": 37,
        "instructions": task.get("instructions_ru", ""),
        "promptHtml": prompt_html,
        "wordMin": 90,
        "wordMax": 154,
        "maxScore": 6,
        "rubric": _normalize_rubric(task.get("scoring_criteria")),
        "rubricNote": task.get("notes", ""),
    }


def convert_writing_essay(written: dict) -> dict:
    section = next(s for s in written["sections"] if s.get("id") == "writing")
    task = next(t for t in section["tasks"] if t.get("id") == 38)
    variant = (task.get("variants") or [{}])[0]
    rows = "".join(
        "<tr><td>"
        + row.get("option", "")
        + "</td><td>"
        + str(row.get("percent", ""))
        + "%</td></tr>"
        for row in variant.get("data_table") or []
    )
    prompt_html = (
        "<p>"
        + variant.get("prompt", "")
        + "</p>"
        + "<p><strong>"
        + variant.get("survey_question", "")
        + "</strong></p>"
        + "<table class='ege-writing-table'><tbody>"
        + rows
        + "</tbody></table>"
        + "<p>"
        + task.get("instructions_ru", "")
        + "</p>"
    )
    return {
        "id": "demo2027-zetland-essay",
        "nav": "Opinion essay",
        "title": variant.get("topic") or "Opinion essay",
        "type": "writing",
        "examNum": 38,
        "instructions": task.get("instructions_ru", ""),
        "promptHtml": prompt_html,
        "plan": task.get("plan") or [],
        "wordMin": 180,
        "wordMax": 275,
        "maxScore": 14,
        "rubric": _normalize_rubric(task.get("scoring_criteria")),
        "rubricNote": task.get("notes", ""),
    }


def convert_speaking_aloud(oral: dict) -> dict:
    task = next(t for t in oral["tasks"] if t.get("type") == "reading_aloud")
    return {
        "id": "demo2027-land-pollution",
        "nav": "Reading aloud",
        "title": task.get("text_title") or "Reading aloud",
        "type": "speaking-aloud",
        "instructions": task.get("instructions_ru", ""),
        "textTitle": task.get("text_title", ""),
        "text": task.get("text", ""),
        "prepSeconds": task.get("preparation_time_seconds", 90),
        "speakSeconds": task.get("max_response_time_seconds", 90),
    }


def convert_speaking_questions(oral: dict) -> dict:
    task = next(t for t in oral["tasks"] if t.get("type") == "questions_about_advertisement")
    topics = task["advertisement"]["required_question_topics"]
    return {
        "id": "demo2027-cooking-class",
        "nav": "Cooking Masterclass",
        "title": "Cooking Masterclass",
        "type": "speaking-questions",
        "adTitle": task["advertisement"]["headline"],
        "image": {"src": "demo2027-cooking-ad.jpg"},
        "prompt": task["instructions_ru"],
        "questions": topics,
    }


def convert_speaking_interview(oral: dict) -> dict:
    task = next(t for t in oral["tasks"] if t.get("type") == "interview")
    return {
        "id": "demo2027-online-shopping",
        "nav": "Online Shopping",
        "title": task.get("topic") or "Attitudes to online shopping",
        "type": "speaking-interview",
        "channel": task.get("channel_name", ""),
        "prompt": task["instructions_ru"],
        "questions": [q["text"] for q in task.get("questions") or []],
        "answerSeconds": task.get("time_per_answer_seconds", 40),
    }


def convert_speaking(oral: dict) -> dict:
    task = next(t for t in oral["tasks"] if t.get("type") == "photo_description_comparison")
    plan = [f"— {line.rstrip('.')};" for line in task.get("plan") or []]
    photos = task.get("photos") or []
    return {
        "id": "demo2027-solo-or-company",
        "nav": "Solo or in Company",
        "title": task.get("project_title") or "Solo or in company",
        "type": "speaking",
        "prompt": task["instructions_ru"],
        "plan": plan,
        "opinionQuestion": "which type of travelling you would prefer and why",
        "prepSeconds": task.get("preparation_time_seconds", 150),
        "speakSeconds": task.get("max_response_time_seconds", 180),
        "images": [
            {
                "id": 1,
                "src": "demo2027/group-tour.jpg",
                "alt": photos[0]["description"] if photos else "",
            },
            {
                "id": 2,
                "src": "demo2027/solo-travel.jpg",
                "alt": photos[1]["description"] if len(photos) > 1 else "",
            },
        ],
    }


def upsert_task(topic_id: str, task: dict) -> None:
    path = TOPIC_FILES[topic_id]
    topic = load_json(path)
    tasks = topic.setdefault("tasks", [])
    for i, existing in enumerate(tasks):
        if existing.get("id") == task["id"]:
            tasks[i] = task
            save_json(path, topic)
            return
    tasks.append(task)
    save_json(path, topic)


def write_demo_topic(topic_id: str, task: dict) -> None:
    dest = DEMO_DATA / f"{topic_id}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file():
        out = load_json(dest)
    else:
        src_path = TOPIC_FILES.get(topic_id)
        if src_path and src_path.is_file():
            src = load_json(src_path)
        else:
            src = {
                "id": topic_id,
                "title": topic_id.replace("-", " ").title(),
                "tasks": [],
            }
        out = {k: v for k, v in src.items() if k != "tasks"}
        out["tasks"] = []
    tasks = out.setdefault("tasks", [])
    for i, existing in enumerate(tasks):
        if existing.get("id") == task["id"]:
            tasks[i] = task
            save_json(dest, out)
            return
    tasks.append(task)
    save_json(dest, out)


def write_demo_sections() -> None:
    catalog = load_json(SECTIONS)
    wanted = {section_id for section_id, _task_id in VARIANT_ENTRIES}
    sections = []
    seen = set()
    for section in catalog.get("sections") or []:
        if section.get("id") not in wanted:
            continue
        entry = dict(section)
        override = DEMO_SECTION_OVERRIDES.get(entry["id"])
        if override:
            entry.update(override)
        override_count = (override or {}).get("taskCount")
        entry["taskCount"] = override_count if override_count else 1
        entry["available"] = True
        sections.append(entry)
        seen.add(entry["id"])
    for section_id, override in DEMO_SECTION_OVERRIDES.items():
        if section_id in wanted and section_id not in seen:
            sections.append(dict(override))
    sections.sort(key=lambda s: (s.get("examFrom") or 0, s.get("id") or ""))
    save_json(DEMO_DIR / "sections.json", {"title": "ЕГЭ 2027 Demo", "sections": sections})
    sync_root_demo_sections()


def sync_root_demo_sections() -> None:
    catalog = load_json(SECTIONS)
    root_sections = {s["id"]: dict(s) for s in catalog.get("sections") or []}
    for section_id, override in DEMO_SECTION_OVERRIDES.items():
        entry = dict(root_sections.get(section_id, {}))
        entry.update(override)
        entry.setdefault("available", True)
        root_sections[section_id] = entry
    merged = list(root_sections.values())
    merged.sort(key=lambda s: (s.get("examFrom") or 0, s.get("id") or ""))
    catalog["sections"] = merged
    save_json(SECTIONS, catalog)


def write_variant(path: Path, variant_id: str, title: str, entries: list[tuple[str, str]]) -> None:
    payload = {
        "id": variant_id,
        "title": title,
        "entries": [{"section": section, "task": task} for section, task in entries],
    }
    minutes = VARIANT_TIMES.get(variant_id)
    if minutes:
        payload["timeMinutes"] = minutes
    path.parent.mkdir(parents=True, exist_ok=True)
    save_json(path, payload)


def import_demo_2027(*, dry_run: bool = False) -> list[str]:
    written = load_json(WRITTEN)
    oral = load_json(ORAL)
    converted = [
        *[
            ("listening", task)
            for task in convert_listening_tasks(written)
        ],
        ("matching-headings", convert_matching(written)),
        ("gap-fill", convert_gap_fill(written)),
        ("reading-comprehension", convert_reading(written)),
        ("grammar-transformations", convert_grammar(written)),
        ("word-formation", convert_word_formation(written)),
        ("vocabulary-cloze", convert_vocab(written)),
        ("writing", convert_writing_email(written)),
        ("writing", convert_writing_essay(written)),
        ("speaking-aloud", convert_speaking_aloud(oral)),
        ("speaking-questions", convert_speaking_questions(oral)),
        ("speaking-interview", convert_speaking_interview(oral)),
        ("speaking", convert_speaking(oral)),
    ]
    log: list[str] = []
    if not dry_run:
        if AUDIO_SRC_PCH.is_file():
            AUDIO_DST_PCH.write_bytes(AUDIO_SRC_PCH.read_bytes())
            log.append(f"Copied audio → {AUDIO_DST_PCH.name}")
            AUDIO_DST_DEMO.parent.mkdir(parents=True, exist_ok=True)
            if AUDIO_DST_DEMO.is_symlink() or AUDIO_DST_DEMO.exists():
                AUDIO_DST_DEMO.unlink()
            AUDIO_DST_DEMO.symlink_to(Path("..") / AUDIO_SRC_PCH.name)
            log.append(f"Linked {AUDIO_DST_DEMO.relative_to(ROOT)}")
        for topic_id, task in converted:
            upsert_task(topic_id, task)
            write_demo_topic(topic_id, task)
            log.append(f"Upserted {task['id']} → {topic_id} and 2027/data")
        purge_listening_tasks(["demo2027-mike-watson"])
        write_demo_sections()
        log.append("Wrote 2027/sections.json")
        all_variants = [("2027-demo", "ЕГЭ 2027 Demo", VARIANT_ENTRIES)] + [
            (block_id, title, entries) for block_id, title, entries in VARIANT_BLOCKS
        ]
        for variant_id, title, entries in all_variants:
            for dest in (
                VARIANT_PATH.parent / f"{variant_id}.json",
                DEMO_DATA / "variants" / f"{variant_id}.json",
            ):
                write_variant(dest, variant_id, title, entries)
                log.append(f"Wrote {dest.relative_to(ROOT)}")
    else:
        for topic_id, task in converted:
            log.append(f"(dry run) {task['id']} → {topic_id}")
    return log
