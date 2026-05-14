#!/usr/bin/env python3
"""
shape-check engine: parse tagged shapes from a PR body, load shape YAMLs,
run each required item against the diff, emit a missing-items report.

Usage:
  check-engine.py \
    --body PR_BODY_FILE \
    --diff DIFF_FILE \
    --shapes-dir DIR \
    [--label-list LABELS_FILE]

Outputs JSON on stdout:
  {
    "decision": "skip-label" | "no-tags" | "checked",
    "tags": [...parsed tags...],
    "missing": [{"shape": "...", "param": "...", "id": "...", "description": "..."}, ...],
    "comment": "<markdown to post as a PR comment>",
    "fail": <bool>
  }

Exit code mirrors fail (0 on pass/skip, 1 on missing items).
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import re
import sys
from pathlib import Path

import yaml


TAG_LINE_RE = re.compile(r"^\s*Shape Tags?\s*:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE)
TAG_TOKEN_RE = re.compile(r"^([a-z][a-z0-9-]*)(?:\[([^\]]+)\])?$")


def parse_tags(body: str) -> list[tuple[str, str | None]] | None:
    """Return list of (shape, param) or None if no Shape Tags: line present."""
    m = TAG_LINE_RE.search(body or "")
    if not m:
        return None
    raw = m.group(1).strip()
    if not raw:
        return []
    out = []
    for tok in [t.strip() for t in raw.split(",") if t.strip()]:
        tm = TAG_TOKEN_RE.match(tok)
        if not tm:
            continue
        out.append((tm.group(1), tm.group(2)))
    return out


def load_shape(shapes_dir: Path, name: str) -> dict | None:
    p = shapes_dir / f"{name}.yml"
    if not p.exists():
        return None
    return yaml.safe_load(p.read_text())


def split_diff(diff_text: str) -> tuple[list[str], list[str]]:
    """Return (added_lines, touched_files) from a unified diff."""
    added: list[str] = []
    files: list[str] = []
    for line in diff_text.splitlines():
        if line.startswith("+++ "):
            path = line[4:].strip()
            if path.startswith("b/"):
                path = path[2:]
            if path and path != "/dev/null":
                files.append(path)
        elif line.startswith("diff --git "):
            parts = line.split()
            if len(parts) >= 4 and parts[3].startswith("b/"):
                files.append(parts[3][2:])
        elif line.startswith("+") and not line.startswith("+++"):
            added.append(line[1:])
    # de-dupe files while preserving order
    seen = set()
    files_dedup = []
    for f in files:
        if f not in seen:
            seen.add(f)
            files_dedup.append(f)
    return added, files_dedup


def substitute(pattern: str, param: str | None) -> str:
    return pattern.replace("{name}", param if param else "")


def check_required(item: dict, param: str | None, added: list[str], files: list[str]) -> bool:
    pat = substitute(item["pattern"], param)
    if item["check"] == "regex":
        try:
            rx = re.compile(pat)
        except re.error:
            return False
        return any(rx.search(line) for line in added)
    if item["check"] == "file-exists":
        return any(fnmatch.fnmatch(f, pat) for f in files)
    return False


def run(body: str, diff: str, shapes_dir: Path, labels: list[str]) -> dict:
    if "skip-shapes" in [l.strip().lower() for l in labels]:
        return {
            "decision": "skip-label",
            "tags": [],
            "missing": [],
            "comment": "shape-check: `skip-shapes` label present — skipping.",
            "fail": False,
        }
    tags = parse_tags(body)
    if tags is None:
        return {
            "decision": "no-tags",
            "tags": [],
            "missing": [],
            "comment": "shape-check: no `Shape Tags:` line in PR body — treating as legacy/infra and skipping. Add a `Shape Tags:` line or the `skip-shapes` label to silence this comment.",
            "fail": False,
        }
    added, files = split_diff(diff)
    missing: list[dict] = []
    unknown_shapes: list[str] = []
    for shape_name, param in tags:
        shape = load_shape(shapes_dir, shape_name)
        if shape is None:
            unknown_shapes.append(shape_name)
            continue
        for item in shape["required"]:
            if not check_required(item, param, added, files):
                desc = item["description"].replace("{name}", param or "")
                missing.append({
                    "shape": shape_name,
                    "param": param,
                    "id": item["id"],
                    "description": desc,
                })
    lines = ["### shape-check"]
    pretty_tags = ", ".join(f"`{s}[{p}]`" if p else f"`{s}`" for s, p in tags)
    lines.append(f"Tags: {pretty_tags}")
    if unknown_shapes:
        lines.append(f"\n**Unknown shapes (no YAML found):** {', '.join('`' + s + '`' for s in unknown_shapes)}")
    if missing:
        lines.append("\n**Missing required items:**")
        for m in missing:
            tag = f"{m['shape']}[{m['param']}]" if m["param"] else m["shape"]
            lines.append(f"- `{tag}` / `{m['id']}` — {m['description']}")
    else:
        lines.append("\nAll required items found.")
    return {
        "decision": "checked",
        "tags": [{"shape": s, "param": p} for s, p in tags],
        "missing": missing,
        "unknown": unknown_shapes,
        "comment": "\n".join(lines),
        "fail": bool(missing) or bool(unknown_shapes),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--body", required=True)
    ap.add_argument("--diff", required=True)
    ap.add_argument("--shapes-dir", required=True)
    ap.add_argument("--label-list", default=None, help="file with one label per line")
    args = ap.parse_args()

    body = Path(args.body).read_text() if args.body != "-" else sys.stdin.read()
    diff = Path(args.diff).read_text() if args.diff != "-" else ""
    shapes_dir = Path(args.shapes_dir)
    labels = []
    if args.label_list:
        try:
            labels = [l.strip() for l in Path(args.label_list).read_text().splitlines() if l.strip()]
        except FileNotFoundError:
            labels = []
    result = run(body, diff, shapes_dir, labels)
    print(json.dumps(result, indent=2))
    return 1 if result["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())
