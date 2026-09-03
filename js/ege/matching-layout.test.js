import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var root = join(dirname(fileURLToPath(import.meta.url)), "../..");
var css = readFileSync(join(root, "css/shell.css"), "utf8");

test("matching headings desktop grid uses wider read + narrower work columns", () => {
  assert.match(
    css,
    /\.ege-page--topic-layout \.ege-task--matching \.ege-split--panels[\s\S]*?grid-template-columns:[\s\S]*?var\(--ege-matching-read-fr\)[\s\S]*?var\(--ege-matching-work-min\),\s*var\(--ege-matching-work-max\)/,
    "expected matching split grid columns"
  );
  assert.match(css, /--ege-matching-read-fr:\s*1\.1fr;/, "expected +10% read fr");
  assert.match(css, /--ege-matching-work-min:\s*234px;/, "expected -10% work min");
  assert.match(css, /--ege-matching-work-max:\s*288px;/, "expected -10% work max");
});

test("matching headings left panel scrolls internally on desktop", () => {
  assert.match(
    css,
    /\.ege-page--topic-layout #egePanels > \.ege-task-panel\.is-active > \.ege-task--matching[\s\S]*?overflow:\s*hidden/,
    "expected matching task to stay viewport-bound"
  );
  assert.match(
    css,
    /\.ege-page--topic-layout \.ege-task--matching \.ege-read-scroll[\s\S]*?overflow-y:\s*auto/,
    "expected read scroll to scroll internally"
  );
  assert.match(
    css,
    /\.ege-page--topic-layout \.ege-task--matching \.ege-split--panels[\s\S]*?height:\s*100%/,
    "expected matching split to fill task height"
  );
});

test("matching headings work panel is sticky on desktop and static on mobile", () => {
  assert.match(
    css,
    /\.ege-page--topic-layout \.ege-task--matching \.ege-split__work[\s\S]*?position:\s*sticky[\s\S]*?top:\s*var\(--ege-sticky-top\)/,
    "expected sticky headings panel on desktop"
  );
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?\.ege-task--matching \.ege-split__work[\s\S]*?position:\s*static/,
    "expected static headings panel below 900px"
  );
});

test("matching headings fixture page exists for visual verification", () => {
  var html = readFileSync(join(root, "tests/matching-headings-layout.html"), "utf8");
  assert.match(html, /data-letter="G"/, "fixture must include paragraph G");
  assert.match(html, /data-slot="G"/, "fixture must include answer slot G");
  assert.match(html, /1440px desktop/, "fixture must document desktop width check");
  assert.match(html, /390px mobile/, "fixture must document mobile width check");
});
