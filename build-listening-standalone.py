#!/usr/bin/env python3
"""Generate ege-prep/listening-standalone.html from source assets."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent

css = (ROOT / "shell.css").read_text(encoding="utf-8")
css = re.sub(r'@import\s+url\([^)]+\);\s*', "", css, count=1)

highlight_js = (ROOT / "highlight.js").read_text(encoding="utf-8")
engine_js = (ROOT / "engine.js").read_text(encoding="utf-8")

engine_js = engine_js.replace(
    "  window.EgePrep = {\n    initTopicPage: initTopicPage,\n  };",
    "  window.EgePrep = {\n    initTopicPage: initTopicPage,\n    mountTopic: mountTopic,\n  };",
)

topic = json.loads((ROOT / "data" / "listening.json").read_text(encoding="utf-8"))
topic_json = json.dumps(topic, ensure_ascii=False, separators=(",", ":"))

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{topic["title"]} – ЕГЭ Prep</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet" />
  <style>
{css}
  </style>
</head>
<body class="yap-brand">
  <main class="ege-page" id="egePage">
    <div class="ege-topics">
      <div class="ege-mobile-switch" id="egeMobileSwitch">
        <hr class="ege-mobile-switch__line" />
        <div class="ege-mobile-switch__controls">
          <button type="button" class="ege-mobile-switch__btn" id="egePrevTask" aria-label="Previous interview">‹</button>
          <button type="button" class="ege-mobile-switch__current" id="egeMobileCurrent" aria-expanded="false" aria-controls="egeNav">Interviews</button>
          <button type="button" class="ege-mobile-switch__btn" id="egeNextTask" aria-label="Next interview">›</button>
        </div>
      </div>

      <aside class="ege-rail">
        <div class="ege-rail__head">
          <img class="ege-rail__mark" src="timetoege.png" alt="" width="64" aria-hidden="true" />
          <h1 class="ege-rail__title" id="egeRailTitle">{topic["title"]}</h1>
        </div>
        <nav class="ege-nav" id="egeNav" aria-label="Interviews"></nav>
      </aside>

      <hr class="ege-mobile-switch__line ege-mobile-switch__line--end" />
    </div>

    <div class="ege-workspace">
      <div id="egeListeningChrome" hidden></div>
      <p class="ege-instructions" id="egeInstructions" hidden></p>
      <div id="egePanels"></div>
    </div>
  </main>
  <script>
{highlight_js}
  </script>
  <script>
{engine_js}
  </script>
  <script>
(function () {{
  "use strict";
  var TOPIC = {topic_json};
  function boot() {{
    EgePrep.mountTopic(TOPIC, TOPIC.id);
  }}
  if (document.readyState === "loading") {{
    document.addEventListener("DOMContentLoaded", boot);
  }} else {{
    boot();
  }}
}})();
  </script>
</body>
</html>
"""

out = ROOT / "listening-standalone.html"
out.write_text(html, encoding="utf-8")
print(f"Wrote {out} ({out.stat().st_size:,} bytes)")
