from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
SOURCE = ROOT / "source"
AUDIO = ROOT / "audio"
TRANSCRIPTIONS = ROOT / "transcriptions"
SECTIONS = ROOT / "sections.json"
DRAFTS = DATA / "drafts"

GAP_FILL_SOURCE = SOURCE / "ege_reading_gap_tasks.json"
FIPI_SOURCE = SOURCE / "fipi_all_tasks_extracted.json"

TOPIC_FILES = {
    "matching-headings": DATA / "matching-headings.json",
    "gap-fill": DATA / "gap-fill.json",
    "reading-comprehension": DATA / "reading-comprehension.json",
    "word-formation": DATA / "word-formation.json",
    "vocabulary-cloze": DATA / "vocabulary-cloze.json",
    "listening": DATA / "listening.json",
}
