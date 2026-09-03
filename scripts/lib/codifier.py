"""Import and enrich FIPI codifier JSON for the codifier page."""

from __future__ import annotations

from copy import deepcopy

from .io import load_json, save_json
from .paths import DATA, ROOT

CODIFIER_SRC = ROOT / "2027" / "codifier.json"
CODIFIER_DST = DATA / "codifier.json"
CODIFIER_PDF = "2027/АЯ-11 ЕГЭ 2027 КОДИФ.pdf"

EXAM_OUTLINE = [
    {"task": 1, "part": "written", "title_ru": "Аудирование: установление соответствия", "sectionId": "listening", "siteHref": "topic.html?t=listening"},
    {"task": 2, "part": "written", "title_ru": "Аудирование: True / False / Not stated", "sectionId": "listening", "siteHref": "topic.html?t=listening"},
    {"task": 3, "part": "written", "title_ru": "Аудирование: выбор ответа (3)", "sectionId": "listening", "siteHref": "topic.html?t=listening"},
    {"task": 4, "part": "written", "title_ru": "Аудирование: выбор ответа (4)", "sectionId": "listening", "siteHref": "topic.html?t=listening"},
    {"task": 5, "part": "written", "title_ru": "Аудирование: выбор ответа (5)", "sectionId": "listening", "siteHref": "topic.html?t=listening"},
    {"task": 6, "part": "written", "title_ru": "Аудирование: выбор ответа (6)", "sectionId": "listening", "siteHref": "topic.html?t=listening"},
    {"task": 7, "part": "written", "title_ru": "Аудирование: выбор ответа (7)", "sectionId": "listening", "siteHref": "topic.html?t=listening"},
    {"task": 8, "part": "written", "title_ru": "Аудирование: выбор ответа (8)", "sectionId": "listening", "siteHref": "topic.html?t=listening"},
    {"task": 9, "part": "written", "title_ru": "Аудирование: выбор ответа (9)", "sectionId": "listening", "siteHref": "topic.html?t=listening"},
    {"task": 10, "part": "written", "title_ru": "Чтение: соответствие заголовков", "sectionId": "matching-headings", "siteHref": "topic.html?t=matching-headings"},
    {"task": 11, "part": "written", "title_ru": "Чтение: вставка частей предложений", "sectionId": "gap-fill", "siteHref": "topic.html?t=gap-fill"},
    {"task": 12, "part": "written", "title_ru": "Чтение: понимание текста (12)", "sectionId": "reading-comprehension", "siteHref": "topic.html?t=reading-comprehension"},
    {"task": 13, "part": "written", "title_ru": "Чтение: понимание текста (13)", "sectionId": "reading-comprehension", "siteHref": "topic.html?t=reading-comprehension"},
    {"task": 14, "part": "written", "title_ru": "Чтение: понимание текста (14)", "sectionId": "reading-comprehension", "siteHref": "topic.html?t=reading-comprehension"},
    {"task": 15, "part": "written", "title_ru": "Чтение: понимание текста (15)", "sectionId": "reading-comprehension", "siteHref": "topic.html?t=reading-comprehension"},
    {"task": 16, "part": "written", "title_ru": "Чтение: понимание текста (16)", "sectionId": "reading-comprehension", "siteHref": "topic.html?t=reading-comprehension"},
    {"task": 17, "part": "written", "title_ru": "Чтение: понимание текста (17)", "sectionId": "reading-comprehension", "siteHref": "topic.html?t=reading-comprehension"},
    {"task": 18, "part": "written", "title_ru": "Чтение: понимание текста (18)", "sectionId": "reading-comprehension", "siteHref": "topic.html?t=reading-comprehension"},
    {"task": 19, "part": "written", "title_ru": "Грамматика и лексика: грамматические формы (19)", "sectionId": "grammar-transformations", "siteHref": "topic.html?t=grammar-transformations"},
    {"task": 20, "part": "written", "title_ru": "Грамматика и лексика: грамматические формы (20)", "sectionId": "grammar-transformations", "siteHref": "topic.html?t=grammar-transformations"},
    {"task": 21, "part": "written", "title_ru": "Грамматика и лексика: грамматические формы (21)", "sectionId": "grammar-transformations", "siteHref": "topic.html?t=grammar-transformations"},
    {"task": 22, "part": "written", "title_ru": "Грамматика и лексика: грамматические формы (22)", "sectionId": "grammar-transformations", "siteHref": "topic.html?t=grammar-transformations"},
    {"task": 23, "part": "written", "title_ru": "Грамматика и лексика: грамматические формы (23)", "sectionId": "grammar-transformations", "siteHref": "topic.html?t=grammar-transformations"},
    {"task": 24, "part": "written", "title_ru": "Грамматика и лексика: грамматические формы (24)", "sectionId": "grammar-transformations", "siteHref": "topic.html?t=grammar-transformations"},
    {"task": 25, "part": "written", "title_ru": "Грамматика и лексика: словообразование (25)", "sectionId": "word-formation", "siteHref": "topic.html?t=word-formation"},
    {"task": 26, "part": "written", "title_ru": "Грамматика и лексика: словообразование (26)", "sectionId": "word-formation", "siteHref": "topic.html?t=word-formation"},
    {"task": 27, "part": "written", "title_ru": "Грамматика и лексика: словообразование (27)", "sectionId": "word-formation", "siteHref": "topic.html?t=word-formation"},
    {"task": 28, "part": "written", "title_ru": "Грамматика и лексика: словообразование (28)", "sectionId": "word-formation", "siteHref": "topic.html?t=word-formation"},
    {"task": 29, "part": "written", "title_ru": "Грамматика и лексика: словообразование (29)", "sectionId": "word-formation", "siteHref": "topic.html?t=word-formation"},
    {"task": 30, "part": "written", "title_ru": "Грамматика и лексика: лексика в контексте (30)", "sectionId": "vocabulary-cloze", "siteHref": "topic.html?t=vocabulary-cloze"},
    {"task": 31, "part": "written", "title_ru": "Грамматика и лексика: лексика в контексте (31)", "sectionId": "vocabulary-cloze", "siteHref": "topic.html?t=vocabulary-cloze"},
    {"task": 32, "part": "written", "title_ru": "Грамматика и лексика: лексика в контексте (32)", "sectionId": "vocabulary-cloze", "siteHref": "topic.html?t=vocabulary-cloze"},
    {"task": 33, "part": "written", "title_ru": "Грамматика и лексика: лексика в контексте (33)", "sectionId": "vocabulary-cloze", "siteHref": "topic.html?t=vocabulary-cloze"},
    {"task": 34, "part": "written", "title_ru": "Грамматика и лексика: лексика в контексте (34)", "sectionId": "vocabulary-cloze", "siteHref": "topic.html?t=vocabulary-cloze"},
    {"task": 35, "part": "written", "title_ru": "Грамматика и лексика: лексика в контексте (35)", "sectionId": "vocabulary-cloze", "siteHref": "topic.html?t=vocabulary-cloze"},
    {"task": 36, "part": "written", "title_ru": "Грамматика и лексика: лексика в контексте (36)", "sectionId": "vocabulary-cloze", "siteHref": "topic.html?t=vocabulary-cloze"},
    {"task": 37, "part": "written", "title_ru": "Письмо: личное электронное письмо", "sectionId": "writing", "siteHref": "topic.html?t=writing"},
    {"task": 38, "part": "written", "title_ru": "Письмо: письменное высказывание с опорой на данные", "sectionId": "writing", "siteHref": "topic.html?t=writing"},
    {"task": 39, "part": "oral", "title_ru": "Устная речь: чтение вслух", "sectionId": "speaking-aloud", "siteHref": "topic.html?t=speaking-aloud"},
    {"task": 40, "part": "oral", "title_ru": "Устная речь: вопросы по объявлению", "sectionId": "speaking-questions", "siteHref": "topic.html?t=speaking-questions"},
    {"task": 41, "part": "oral", "title_ru": "Устная речь: монологическое высказывание (интервью)", "sectionId": "speaking-interview", "siteHref": "topic.html?t=speaking-interview"},
    {"task": 42, "part": "oral", "title_ru": "Устная речь: сравнение фотографий / монолог", "sectionId": "speaking", "siteHref": "topic.html?t=speaking"},
]

DEMO_VARIANT_HREF = "2027/topic.html?variant=2027-demo"


def _enrich_sections(sections: list[dict]) -> list[dict]:
    out: list[dict] = []
    for section in sections:
        item = deepcopy(section)
        if item.get("id") == 3:
            item["display"] = "collapsed"
        out.append(item)
    return out


def build_codifier_payload(src: dict) -> dict:
    return {
        "meta": {
            "source": src.get("source", ""),
            "document": src.get("document", ""),
            "language": src.get("language", "ru"),
            "purpose": src.get("purpose", ""),
            "pdfHref": CODIFIER_PDF,
            "demoVariantHref": DEMO_VARIANT_HREF,
        },
        "sections": _enrich_sections(src.get("sections") or []),
        "examOutline": deepcopy(EXAM_OUTLINE),
    }


def import_codifier(*, dry_run: bool = False) -> list[str]:
    lines: list[str] = []
    if not CODIFIER_SRC.is_file():
        raise FileNotFoundError(f"Missing source codifier: {CODIFIER_SRC}")

    src = load_json(CODIFIER_SRC)
    payload = build_codifier_payload(src)

    if dry_run:
        lines.append(f"(dry run) would write {CODIFIER_DST}")
        lines.append(f"sections: {len(payload['sections'])}, examOutline: {len(payload['examOutline'])}")
        return lines

    DATA.mkdir(parents=True, exist_ok=True)
    save_json(CODIFIER_DST, payload)
    lines.append(f"Wrote {CODIFIER_DST}")
    lines.append(f"examOutline: {len(payload['examOutline'])} tasks")
    return lines
