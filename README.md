# ЕГЭ Prep

Static ЕГЭ English practice by task type. Open `index.html` in a browser, or serve locally:

```bash
python3 -m http.server 8080
```

Then visit http://localhost:8080

## Structure

- `index.html` — section catalog
- `topic.html` — interactive task runner (loads `data/*.json` via `engine.js`)
- `data/` — task content JSON
- `audio/` — listening MP3 files
- `*-standalone.html` — self-contained exports for single sections

## Regenerate listening standalone

```bash
python3 build-listening-standalone.py
```
# ege-prep
