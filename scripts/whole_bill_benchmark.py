"""Explicit opt-in: read every page of one masked bill and link the pages, as the app does. Prints Python's verdict.

Usage: python scripts/whole_bill_benchmark.py PAGE1.jpg PAGE2.jpg --send-whole-pages --decimal , --currency EUR
Answers are cached in the ignored private/groq-cache folder, so re-running never repeats a paid request.
"""
from pathlib import Path
import argparse
import sys

APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT / "backend"))
from billshield_core.groq_http import OPENROUTER_KEY_NAMES, read_api_key  # noqa: E402
from billshield_core.groq_vision import read_page  # noqa: E402
from billshield_core.whole_bill import link_pages  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pages", type=Path, nargs="+")
    parser.add_argument("--send-whole-pages", action="store_true")
    parser.add_argument("--decimal", choices=[".", ","], default=".")
    parser.add_argument("--currency", choices=["EUR", "INR"], default="EUR")
    args = parser.parse_args()
    if not args.send_whole_pages:
        parser.error("Add --send-whole-pages to send these pages to OpenRouter")
    key = read_api_key(APP_ROOT, OPENROUTER_KEY_NAMES)
    cache = APP_ROOT / "private" / "groq-cache"
    pages = []
    for number, path in enumerate(args.pages, start=1):
        mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}[path.suffix.lower()]
        output = read_page(path.read_bytes(), mime, key, cache, None, "openrouter")
        pages.append((number, output))
        print(f"\nPAGE {number} ({output.page_kind}, {output.invoice_label!r}) — UNCONFIRMED")
        for line in output.lines:
            print(f"  {line.id:6} {str(line.role):10} {line.raw_amount!s:>12}  {line.description}")
        if output.structure:
            for section in output.structure.sections:
                print(f"  section {section.id}: {section.label!r} period={section.period!r} "
                      f"parent={section.parent_id} subtotal={section.subtotal_line_id}")
    plan = link_pages(pages, decimal_separator=args.decimal, currency=args.currency, api_key=key, cache_dir=cache)
    print(f"\nPYTHON CHECK: {plan['status']} (linked by {plan['linkedBy']})")
    for problem in plan["problems"]:
        print(f"  - {problem}")
    for line_id, entry in plan["lines"].items():
        flags = "✓" if entry["verified"] else " "
        extra = f" SUMMARY OF {entry['summaryOf']!r}" if entry.get("summaryOf") else ""
        print(f"  {flags} {line_id:10} group={entry['group']!r:28} {entry['path']}{extra}")
        if entry.get("hint"):
            print(f"      hint: {entry['hint']}")
        if entry.get("note"):
            print(f"      AI note: {entry['note']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
