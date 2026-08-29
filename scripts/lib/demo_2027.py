"""Import EGE 2027 demo tasks from 2027/written_demo.json and 2027/oral_demo.json."""

from __future__ import annotations

import re
from pathlib import Path

from .io import load_json, save_json
from .paths import DATA, ROOT, TOPIC_FILES

DEMO_DIR = ROOT / "2027"
WRITTEN = DEMO_DIR / "written_demo.json"
ORAL = DEMO_DIR / "oral_demo.json"
VARIANT_PATH = DATA / "variants" / "2027-demo.json"
AUDIO_SRC_PCH = DEMO_DIR / "АЯ ПЧ.mp3"
AUDIO_DST_PCH = ROOT / "audio" / "Demo2027-PCh.mp3"

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

VARIANT_ENTRIES = [
    ("listening", "demo2027-mike-watson"),
    ("matching-headings", "demo2027-lions"),
    ("gap-fill", "demo2027-amur-river"),
    ("reading-comprehension", "demo2027-ai-education"),
    ("grammar-transformations", "demo2027-yaroslavl-sweaters"),
    ("word-formation", "demo2027-hermitage"),
    ("vocabulary-cloze", "demo2027-sunday"),
    ("speaking-questions", "demo2027-cooking-class"),
    ("speaking-interview", "demo2027-online-shopping"),
    ("speaking", "demo2027-solo-or-company"),
]

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


def convert_listening(written: dict) -> dict:
    tasks = _section_tasks(written, "listening")
    mc_tasks = [t for t in tasks if t.get("type") == "multiple_choice"]
    transcript = mc_tasks[-1].get("shared_audio_transcript_for_tasks_3_9") or []
    questions = []
    for task in mc_tasks:
        questions.append(
            {
                "q": task.get("question", ""),
                "opts": [opt["text"] for opt in task.get("options") or []],
                "correct": int(task.get("correct_answer", 1)) - 1,
            }
        )
    return {
        "id": "demo2027-mike-watson",
        "nav": "Mike Watson",
        "title": "Five Minutes with a Star — Mike Watson",
        "type": "listening",
        "audio": "audio/Demo2027-PCh.mp3",
        "instructions": LISTENING_INSTRUCTIONS,
        "transcript": _transcript_lines(transcript),
        "questions": questions,
    }


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


def import_demo_2027(*, dry_run: bool = False) -> list[str]:
    written = load_json(WRITTEN)
    oral = load_json(ORAL)
    converted = [
        ("listening", convert_listening(written)),
        ("matching-headings", convert_matching(written)),
        ("gap-fill", convert_gap_fill(written)),
        ("reading-comprehension", convert_reading(written)),
        ("grammar-transformations", convert_grammar(written)),
        ("word-formation", convert_word_formation(written)),
        ("vocabulary-cloze", convert_vocab(written)),
        ("speaking-questions", convert_speaking_questions(oral)),
        ("speaking-interview", convert_speaking_interview(oral)),
        ("speaking", convert_speaking(oral)),
    ]
    log: list[str] = []
    if not dry_run:
        if AUDIO_SRC_PCH.is_file():
            AUDIO_DST_PCH.write_bytes(AUDIO_SRC_PCH.read_bytes())
            log.append(f"Copied audio → {AUDIO_DST_PCH.name}")
        for topic_id, task in converted:
            upsert_task(topic_id, task)
            log.append(f"Upserted {task['id']} → {topic_id}")
        variants_dir = VARIANT_PATH.parent
        variants_dir.mkdir(parents=True, exist_ok=True)
        all_variants = [("2027-demo", "ЕГЭ 2027 Demo", VARIANT_ENTRIES)] + [
            (block_id, title, entries) for block_id, title, entries in VARIANT_BLOCKS
        ]
        for variant_id, title, entries in all_variants:
            path = variants_dir / f"{variant_id}.json"
            save_json(
                path,
                {
                    "id": variant_id,
                    "title": title,
                    "entries": [{"section": s, "task": t} for s, t in entries],
                },
            )
            log.append(f"Wrote {path.relative_to(ROOT)}")
    else:
        for topic_id, task in converted:
            log.append(f"(dry run) {task['id']} → {topic_id}")
    return log
