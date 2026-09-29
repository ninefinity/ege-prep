# -*- coding: utf-8 -*-
"""Regenerate data/word-formation-crossword.json, the word pool behind the
"crossword" skill drill for task 25-29 (word formation).

OVERWRITES the data file: word-formation.json (the real exam bank) is the
source of truth, and this script only re-derives the (answer, clue) pool
from it. Do not hand-edit the JSON -- re-run this after word-formation.json
changes.

    python3 scripts/build_word_formation_crossword.py

Each item in word-formation.json is a base word (e.g. ACTUAL) and a
sentence with it blanked out, asking for the derived word that fits
(e.g. "Actually"). That is already a crossword clue -- the sentence with
the base word shown in brackets -- so no new content is authored here.

The grid itself is NOT built here: js/ege/crossword-gen.js deals a fresh
random 8 words from this pool and lays them out client-side every time the
drill is opened, so no two visits see the same puzzle. This script's only
job is the pool, kept free of words a crossword's fixed, shared letters
can't fairly score (see the `alt` check below).

It also writes data/crossword-hint-tasks.json: the exam tasks a player
answers to earn a letter reveal -- task 30-36 gaps ("choose letter") and
task 10 paragraphs ("random letter"), derived from vocabulary-cloze.json and
matching-headings.json.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.paths import DATA, TOPIC_FILES

WORD_RE = re.compile(r"^[A-Za-z]+$")
HINT_TASKS_FILE = DATA / "crossword-hint-tasks.json"

INSTRUCTIONS = (
    "Click or hover a square to see its clue, then fill in the grid with "
    "the word that completes the sentence."
)


def load_pairs():
    doc = json.loads((DATA / "word-formation.json").read_text(encoding="utf-8"))
    pairs = []
    seen = set()
    for task in doc["tasks"]:
        for item in task.get("items", []):
            answer = str(item.get("answer", "")).strip()
            if not WORD_RE.match(answer) or len(answer) < 3:
                continue
            # A crossword's shared letters can only hold one spelling/form --
            # unlike the free-text wordform task, it can't also accept an
            # alternate answer, so a word with a genuine alt (e.g.
            # personality/personalities, medalist/medallist) has to sit out
            # rather than silently mark an equally correct answer wrong.
            if item.get("alt"):
                continue
            key = answer.lower()
            if key in seen:
                continue
            seen.add(key)
            base = str(item.get("word", "")).strip()
            pre = str(item.get("pre", "")).strip()
            post = str(item.get("post", "")).strip()
            clue = (pre + " ___ " + post).strip()
            clue = re.sub(r"\s+", " ", clue)
            pairs.append({
                "answer": answer.upper(),
                "clue": clue,
                # The original word's own first letter, drawn in the square
                # where the base word begins inside the answer -- past any
                # prefix (base "able" -> UNABLE hints "A" on the third square).
                "hint": base[:1].upper(),
                "hintAt": base_offset(answer.upper(), base.upper()),
            })
    return pairs


MAX_PREFIX = 6


def base_offset(answer, base):
    """Index in `answer` where `base` starts, skipping a prefix.

    Picks the start with the longest shared run of letters with the base, so
    UNUSUAL/usual lands on the second U (index 2), not the first, and stem
    changes (INABILITY/able) still land on the base's first letter.
    """
    best_i, best_len = 0, 0
    for i in range(min(MAX_PREFIX, len(answer) - 1) + 1):
        n = 0
        while i + n < len(answer) and n < len(base) and answer[i + n] == base[n]:
            n += 1
        if n > best_len:
            best_i, best_len = i, n
    return best_i


GAP_RE = re.compile(r"\[(\d+)\]")
GAP_MARK = "\u0000"
# Sentence boundary: terminal punctuation (optionally closed by a quote)
# followed by whitespace. Abbreviations can over-split, which only trims a
# clue's context by a sentence -- never breaks the gap itself.
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|(?<=[.!?][\"”’])\s+")


def load_cloze_items():
    """Task 30-36 gaps for the "choose letter" hint: the gap's sentence plus
    one sentence either side, other gaps in the passage filled in with their
    answers so the context reads naturally."""
    doc = json.loads((DATA / "vocabulary-cloze.json").read_text(encoding="utf-8"))
    items = []
    for task in doc["tasks"]:
        passage = task.get("passage", "")
        questions = {}
        for q in task.get("questions", []):
            m = re.match(r"\s*(\d+)", str(q.get("q", "")))
            opts = q.get("opts") or []
            if m and len(opts) >= 3 and 0 <= q.get("correct", -1) < len(opts):
                questions[int(m.group(1))] = q
        for n, q in questions.items():
            def fill(m, n=n):
                k = int(m.group(1))
                if k == n:
                    return GAP_MARK
                other = questions.get(k)
                return other["opts"][other["correct"]] if other else m.group(0)

            text = GAP_RE.sub(fill, passage)
            sentences = [s for s in SENTENCE_SPLIT.split(text) if s.strip()]
            at = next((i for i, s in enumerate(sentences) if GAP_MARK in s), None)
            if at is None:
                continue
            context = " ".join(sentences[max(0, at - 1):at + 2]).replace(GAP_MARK, "___")
            if GAP_RE.search(context):
                continue
            items.append({"text": context, "options": q["opts"], "answer": q["correct"]})
    return items


# Irregular verbs for the "Show mistakes" hint: base form -> accepted past
# participle(s). Only verbs whose participle differs from the base, so the
# answer is never just retyping the prompt. Where British spelling allows two
# forms (learnt/learned, got/gotten), both are accepted.
IRREGULAR_PARTICIPLES = {
    "be": ["been"], "begin": ["begun"], "break": ["broken"],
    "bring": ["brought"], "build": ["built"], "buy": ["bought"], "catch": ["caught"],
    "choose": ["chosen"], "do": ["done"], "draw": ["drawn"],
    "drink": ["drunk"], "drive": ["driven"], "eat": ["eaten"], "fall": ["fallen"],
    "feel": ["felt"], "find": ["found"], "fly": ["flown"], "forget": ["forgotten"],
    "forgive": ["forgiven"], "get": ["got", "gotten"], "give": ["given"], "go": ["gone"],
    "grow": ["grown"], "have": ["had"], "hear": ["heard"], "hide": ["hidden"],
    "hold": ["held"], "keep": ["kept"], "know": ["known"], "lead": ["led"],
    "learn": ["learnt", "learned"], "leave": ["left"], "lose": ["lost"], "make": ["made"],
    "mean": ["meant"], "meet": ["met"], "pay": ["paid"], "ride": ["ridden"],
    "ring": ["rung"], "rise": ["risen"], "say": ["said"],
    "see": ["seen"], "sell": ["sold"], "send": ["sent"], "show": ["shown", "showed"],
    "sing": ["sung"], "sit": ["sat"], "sleep": ["slept"], "speak": ["spoken"],
    "spend": ["spent"], "stand": ["stood"], "steal": ["stolen"], "swim": ["swum"],
    "take": ["taken"], "teach": ["taught"], "tell": ["told"], "think": ["thought"],
    "throw": ["thrown"], "understand": ["understood"], "wear": ["worn"], "win": ["won"],
    "write": ["written"],
}


def load_irregular_verbs():
    return [{"verb": v, "answers": a} for v, a in IRREGULAR_PARTICIPLES.items()]


def load_heading_sets():
    """Task 10 paragraphs for the "random letter" hint, grouped by source task
    so wrong options are always headings written for that same text."""
    doc = json.loads((DATA / "matching-headings.json").read_text(encoding="utf-8"))
    sets = []
    for task in doc["tasks"]:
        headings = task.get("headings") or []
        answers = task.get("answers") or {}
        paragraphs = []
        for t in task.get("texts", []):
            num = str(answers.get(t.get("letter"), ""))
            if not num.isdigit():
                continue
            idx = int(num) - 1
            text = str(t.get("text", "")).strip()
            if 0 <= idx < len(headings) and text:
                paragraphs.append({"text": text, "answer": idx})
        if len(headings) >= 3 and paragraphs:
            sets.append({"headings": headings, "paragraphs": paragraphs})
    return sets


def main():
    pairs = load_pairs()
    if len(pairs) < 8:
        raise SystemExit(f"REJECTED: only {len(pairs)} usable words, need at least 8")
    cloze = load_cloze_items()
    heading_sets = load_heading_sets()
    if not cloze or not heading_sets:
        raise SystemExit("REJECTED: hint tasks came out empty")

    doc = {
        "id": "word-formation-crossword",
        "title": "Word Formation Crossword",
        "subtitle": "Задания 25–29. Кроссворд по словообразованию.",
        "tasks": [
            {
                "id": "word-formation-crossword",
                "nav": "Crossword",
                "title": "Crossword",
                "type": "crossword",
                "examFrom": 25,
                "examTo": 29,
                "drill": "Crossword",
                "instructions": INSTRUCTIONS,
                "wordsPerPuzzle": 8,
                "pool": pairs,
            }
        ],
    }
    path = TOPIC_FILES["word-formation-crossword"]
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"wrote a pool of {len(pairs)} words (8 dealt fresh per puzzle, client-side)")

    # Separate file, fetched only when a player first opens a hint -- it's
    # ~10x the size of the word pool and most sessions may never need it.
    with open(HINT_TASKS_FILE, "w", encoding="utf-8") as fh:
        json.dump(
            {"choose": cloze, "random": heading_sets, "verbs": load_irregular_verbs()},
            fh,
            ensure_ascii=False,
        )
        fh.write("\n")
    paragraphs = sum(len(s["paragraphs"]) for s in heading_sets)
    print(
        f"wrote {len(cloze)} task 30-36 gaps, {paragraphs} task 10 paragraphs "
        f"and {len(IRREGULAR_PARTICIPLES)} irregular verbs for hints"
    )


if __name__ == "__main__":
    main()
