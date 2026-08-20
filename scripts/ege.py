#!/usr/bin/env python3
"""EGE Prep content toolkit."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow `python3 scripts/ege.py` without installing as a package.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.importers import (
    append_task,
    convert_gap_fill,
    convert_matching,
    find_gap_source,
    find_matching_source,
    list_gap_fill_sources,
    list_matching_sources,
    make_slug,
)
from lib.io import load_json, save_json
from lib.paths import DRAFTS, SECTIONS, TOPIC_FILES
from lib.scaffold import scaffold
from lib.validate import validate_all


def cmd_validate(args: argparse.Namespace) -> int:
    report = validate_all(include_drafts=args.drafts)
    for issue in report.issues:
        prefix = "ERROR" if issue.level == "error" else "WARN "
        print(f"{prefix}  {issue.path}: {issue.message}")
    if report.ok:
        print("OK — no errors")
        return 0
    print(f"\n{sum(1 for i in report.issues if i.level == 'error')} error(s)")
    return 1


def cmd_sync_sections(args: argparse.Namespace) -> int:
    sections = load_json(SECTIONS)
    for section in sections.get("sections") or []:
        if section.get("available") is False:
            continue
        topic_id = section.get("id")
        path = TOPIC_FILES.get(topic_id)
        if not path or not path.is_file():
            continue
        count = len(load_json(path).get("tasks") or [])
        old = section.get("taskCount")
        section["taskCount"] = count
        if old != count:
            print(f"{topic_id}: taskCount {old} → {count}")

    if not args.dry_run:
        save_json(SECTIONS, sections)
        print(f"Updated {SECTIONS}")
    else:
        print("(dry run — sections.json not written)")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    if args.source:
        if args.source == "gap-fill":
            for task in list_gap_fill_sources():
                answers = "✓" if task.get("answer") else "○"
                print(f"{answers} {task['id']:8}  {task.get('title', '')}")
        elif args.source == "matching":
            for task in list_matching_sources():
                answers = "✓" if task.get("answer") else "○"
                print(f"{answers} {task['id']:8}  ({len(task.get('texts') or {})} texts)")
        return 0

    for topic_id, path in sorted(TOPIC_FILES.items()):
        if not path.is_file():
            print(f"{topic_id}: (missing)")
            continue
        topic = load_json(path)
        tasks = topic.get("tasks") or []
        print(f"\n{topic_id} ({len(tasks)} tasks)")
        for task in tasks:
            print(f"  {task.get('type', '?'):10}  {task.get('id', '?')}")
    return 0


def cmd_import(args: argparse.Namespace) -> int:
    topic_id = args.topic
    if topic_id not in TOPIC_FILES:
        print(f"unknown topic {topic_id!r}", file=sys.stderr)
        return 1

    if args.kind == "gap-fill":
        source = find_gap_source(args.source_id)
        if not source:
            print(f"source task {args.source_id!r} not found in ege_reading_gap_tasks.json", file=sys.stderr)
            return 1
        slug = args.slug or make_slug(source.get("title", args.source_id), prefix="gaps-")
        task = convert_gap_fill(source, slug, title=args.title)
    else:
        source = find_matching_source(args.source_id)
        if not source:
            print(f"source task {args.source_id!r} not found in fipi archive", file=sys.stderr)
            return 1
        slug = args.slug or make_slug(args.source_id, prefix="headings-")
        task = convert_matching(source, slug, title=args.title or args.source_id)

    if args.stdout or args.dry_run:
        print(json.dumps(task, ensure_ascii=False, indent=2))
        if args.dry_run:
            print(f"\n(dry run — not appended to {topic_id})")
        return 0

    append_task(topic_id, task)
    print(f"Added {task['id']!r} to {topic_id} ({len(load_json(TOPIC_FILES[topic_id])['tasks'])} tasks)")
    if not task.get("answers"):
        print("Note: no answers in source — fill in answers before publishing.")
    return 0


def cmd_scaffold(args: argparse.Namespace) -> int:
    task = scaffold(args.type, args.slug, title=args.title)
    out = DRAFTS / f"{args.slug}.json"
    if args.stdout:
        print(json.dumps(task, ensure_ascii=False, indent=2))
        return 0
    save_json(out, task)
    print(f"Wrote draft {out}")
    print("Edit the file, then import manually or copy into the topic JSON.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="EGE Prep content toolkit")
    sub = parser.add_subparsers(dest="command", required=True)

    p_validate = sub.add_parser("validate", help="check data/*.json for errors")
    p_validate.add_argument("--drafts", action="store_true", help="also validate data/drafts/")
    p_validate.set_defaults(func=cmd_validate)

    p_sync = sub.add_parser("sync-sections", help="update taskCount in sections.json from data files")
    p_sync.add_argument("--dry-run", action="store_true")
    p_sync.set_defaults(func=cmd_sync_sections)

    p_list = sub.add_parser("list", help="list runtime tasks or source archive")
    p_list.add_argument("--source", choices=["gap-fill", "matching"], help="list source archive instead")
    p_list.set_defaults(func=cmd_list)

    p_import = sub.add_parser("import", help="import a task from source/ into data/")
    p_import.add_argument("kind", choices=["gap-fill", "matching"])
    p_import.add_argument("source_id", help="e.g. AAF849 or RM001")
    p_import.add_argument("--topic", required=True, choices=list(TOPIC_FILES), help="target topic file")
    p_import.add_argument("--slug", help="runtime task id (default: auto from title)")
    p_import.add_argument("--title", help="display title override")
    p_import.add_argument("--dry-run", action="store_true", help="preview JSON without saving")
    p_import.add_argument("--stdout", action="store_true", help="print JSON only")
    p_import.set_defaults(func=cmd_import)

    p_scaffold = sub.add_parser("scaffold", help="create a blank task draft")
    p_scaffold.add_argument("type", choices=["gapfill", "matching", "mc", "vocab", "wordform", "listening"])
    p_scaffold.add_argument("slug", help="task id, e.g. gaps-new-topic")
    p_scaffold.add_argument("--title")
    p_scaffold.add_argument("--stdout", action="store_true")
    p_scaffold.set_defaults(func=cmd_scaffold)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
