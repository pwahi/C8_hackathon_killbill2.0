"""Explicit opt-in: replay a bill's reader lines (private JSON, no images) through linking and the whole-bill map.

Usage: python scripts/eval_bill_map.py private/masked/<name>/reader-lines.json --send
The JSON holds {"currency", "decimal", "pages": {"1": [[id, role, label, amount], ...], ...}}. Text only is sent to
OpenRouter; answers are cached in private/groq-cache. Prints how many lines the person would still have to look at.
"""
from pathlib import Path
import argparse
import json
import sys

APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT / "backend"))
from billshield_core.groq_http import OPENROUTER_KEY_NAMES, read_api_key  # noqa: E402
from billshield_core.groq_vision import parse_response  # noqa: E402
from billshield_core.whole_bill import link_pages, map_pages  # noqa: E402


def pages_from(data):
    pages = []
    for number, rows in sorted(data["pages"].items(), key=lambda item: int(item[0])):
        lines = [{"id": i, "role": role, "description": label, "raw_amount": amount, "page": 1, "confidence": 0.9}
                 for i, role, label, amount in rows]
        reply = {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps({"lines": lines})}}]}
        pages.append((int(number), parse_response(reply)))
    return pages


def report(name, plan):
    if plan is None:
        print(f"{name}: no result (did not add up)")
        return
    entries = plan["lines"]
    counted = [i for i, e in entries.items() if e.get("role", "x") != ""]
    folded = [i for i, e in entries.items() if e.get("role") == "" and e.get("verified")]
    unsure = [i for i, e in entries.items() if e.get("role") == "" and not e.get("verified")]
    auto = [i for i in counted if entries[i].get("autoVerified")]
    print(f"{name}: status={plan['status']} counted={len(counted)} auto={len(auto)} folded={len(folded)} "
          f"folded-but-check-failed={len(unsure)}")
    return counted, folded, unsure


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lines", type=Path)
    parser.add_argument("--send", action="store_true")
    args = parser.parse_args()
    if not args.send:
        parser.error("Add --send to send the lines (text only) to OpenRouter")
    data = json.loads(args.lines.read_text(encoding="utf-8"))
    pages = pages_from(data)
    key, cache = read_api_key(APP_ROOT, OPENROUTER_KEY_NAMES), APP_ROOT / "private" / "groq-cache"
    print(f"{sum(len(o.lines) for _, o in pages)} lines on {len(pages)} pages")
    report("link pass (today)", link_pages(pages, decimal_separator=data["decimal"], currency=data["currency"],
                                           api_key=key, cache_dir=cache))
    plan = map_pages(pages, decimal_separator=data["decimal"], currency=data["currency"], api_key=key, cache_dir=cache)
    found = report("map pass (new)", plan)
    if plan:
        print("SUMMARY (AI):", plan.get("summary"))
        counted, folded, unsure = found
        for line_id in counted:
            print(f"  COUNTED {line_id:12} {plan['lines'][line_id].get('role'):9} auto={plan['lines'][line_id].get('autoVerified')}")
        for line_id in folded + unsure:
            print(f"  {'folded ' if line_id in folded else 'CHECK  '} {line_id:12} {plan['lines'][line_id]['referenceText']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
