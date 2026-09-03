# EGE Prep

Static EGE English practice by task type. Open `index.html` in a browser, or serve locally:

```bash
python3 -m http.server 8080
```

Then visit http://localhost:8080

The 2027 demo is its own mini-site. From the repo root, open http://localhost:8080/2027/ — or serve just that folder:

```bash
cd 2027 && python3 -m http.server 8080
```

Then visit http://localhost:8080

## Structure

```
index.html, topic.html, sections.json   # practice-bank entry points
2027/                                   # 2027 demo (own index.html + player + data)
css/                                    # shell + catalog styles
js/                                     # engine + highlight tools
assets/                                 # logos, icons, images
shared/                                 # site footer (css + js)
data/                                   # runtime task JSON
data/drafts/                            # work-in-progress tasks (optional)
audio/                                  # listening MP3 files
transcriptions/                         # listening transcript sources
source/                                 # raw FIPI extraction archives (not loaded at runtime)
scripts/                                # content toolkit (see below)
```

## Content workflow

When new exam demos drop, use the scripts in `scripts/`:

```bash
# Check all task JSON for broken answers, missing audio, stale taskCount
python3 scripts/ege.py validate

# Sync sections.json taskCount after adding/removing tasks
python3 scripts/ege.py sync-sections

# See what's live vs what's in the source archive
python3 scripts/ege.py list
python3 scripts/ege.py list --source gap-fill
python3 scripts/ege.py list --source matching

# Import one gap-fill task from source/ into data/gap-fill.json
python3 scripts/ege.py import gap-fill AAF849 --topic gap-fill --dry-run
python3 scripts/ege.py import gap-fill AAF849 --topic gap-fill

# Import a matching-headings task from the FIPI archive
python3 scripts/ege.py import matching RM001 --topic matching-headings --dry-run

# Start a blank task draft for manual editing
python3 scripts/ege.py scaffold gapfill gaps-new-demo --title "My New Text"
```

Source archives in `source/`:
- `ege_reading_gap_tasks.json` — gap-fill demos (57 tasks, with answers)
- `fipi_all_tasks_extracted.json` — FIPI open bank (matching headings; answers often missing)

Imported matching tasks may need answers filled in manually before publishing.
