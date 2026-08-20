"""Blank task templates for manual authoring."""

from __future__ import annotations

from .importers import GAP_FILL_INSTRUCTIONS, MATCHING_INSTRUCTIONS


def scaffold(task_type: str, slug: str, *, title: str | None = None) -> dict:
    title = title or slug.replace("-", " ").title()
    builders = {
        "gapfill": _gapfill,
        "matching": _matching,
        "mc": _reading_mc,
        "vocab": _vocab_cloze,
        "wordform": _wordform,
        "listening": _listening,
    }
    fn = builders.get(task_type)
    if not fn:
        raise ValueError(f"unknown type {task_type!r}; choose: {', '.join(builders)}")
    return fn(slug, title)


def _gapfill(slug: str, title: str) -> dict:
    return {
        "id": slug,
        "nav": title,
        "title": title,
        "instructions": GAP_FILL_INSTRUCTIONS,
        "type": "gapfill",
        "options": ["option 1", "option 2", "option 3", "option 4", "option 5", "option 6", "option 7"],
        "html": 'Replace gaps like <span data-gap="A"></span> in your text.',
        "gaps": ["A", "B", "C", "D", "E", "F"],
        "answers": {"A": "1", "B": "2", "C": "3", "D": "4", "E": "5", "F": "6"},
    }


def _matching(slug: str, title: str) -> dict:
    return {
        "id": slug,
        "nav": title,
        "title": title,
        "instructions": MATCHING_INSTRUCTIONS,
        "type": "matching",
        "headings": [f"Heading {i}" for i in range(1, 9)],
        "texts": [
            {"letter": letter, "text": f"Text {letter} goes here."}
            for letter in "ABCDEFG"
        ],
        "answers": {letter: str(i) for i, letter in enumerate("ABCDEFG", start=1)},
    }


def _reading_mc(slug: str, title: str) -> dict:
    return {
        "id": slug,
        "nav": title,
        "title": title,
        "instructions": (
            "Прочитайте текст и выполните задания 12–18. В каждом задании запишите "
            "в поле ответа цифру 1, 2, 3 или 4, соответствующую выбранному Вами варианту ответа."
        ),
        "type": "mc",
        "passage": "Passage text goes here.",
        "questions": [
            {
                "q": "12. Example question?",
                "opts": ["A", "B", "C", "D"],
                "correct": 0,
            }
        ],
    }


def _vocab_cloze(slug: str, title: str) -> dict:
    return {
        "id": slug,
        "nav": title,
        "title": title,
        "instructions": (
            "Прочитайте текст с пропусками, обозначенными номерами 30–36. "
            "Запишите в поле ответа цифру 1, 2, 3 или 4."
        ),
        "type": "mc",
        "passage": "Text with a gap [30] here.",
        "questions": [
            {"q": "30.", "opts": ["at", "over", "of", "for"], "correct": 0}
        ],
    }


def _wordform(slug: str, title: str) -> dict:
    return {
        "id": slug,
        "nav": title,
        "title": title,
        "instructions": (
            "Преобразуйте слова, напечатанные заглавными буквами, "
            "так, чтобы они грамматически соответствовали содержанию текста."
        ),
        "type": "wordform",
        "items": [
            {
                "pre": "Example sentence",
                "word": "DO",
                "post": " every day.",
                "answer": "does",
            }
        ],
    }


def _listening(slug: str, title: str) -> dict:
    return {
        "id": slug,
        "nav": title,
        "title": title,
        "type": "listening",
        "audio": f"audio/{slug.replace('-', '')}.mp3",
        "prep": {
            "gapFill": {
                "instruction": "Complete the expressions.",
                "wordBank": ["word1", "word2"],
                "extraWord": "word2",
                "items": [{"id": 1, "sentence": "example ________", "answer": "word1"}],
            }
        },
        "turns": [],
    }
