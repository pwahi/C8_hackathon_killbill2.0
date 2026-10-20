"""W0-lite: how many lines would a person still have to look at? Replays cached page reads; no new AI requests.

Reads every cached reader answer in private/groq-cache that parses as a page or area read, runs Python's own
check on it (one page at a time, no linking request) and counts, per page:
  counted   lines with a role that is summed or checked (charge, discount, adjustment, subtotal, total)
  verified  counted lines inside a part that adds up to its printed figure (Python's tick)
  auto      counted lines Python accepts without asking (confirmation by exception, PRD_SCALABLE W4)
  ask       counted lines left for the person
Prints only counts, never bill text. Usage: python scripts/eval_confirmation_load.py [--json OUT]
"""
from pathlib import Path
import argparse
import json
import sys

APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT / "backend"))
from billshield_core.groq_vision import parse_response  # noqa: E402
from billshield_core.whole_bill import link_pages  # noqa: E402

COUNTED = {"charge", "discount", "adjustment", "subtotal", "total"}


def page_counts(output) -> dict | None:
    if not any(line.role in COUNTED for line in output.lines):
        return None
    plan = link_pages([(1, output)], decimal_separator=output.decimal_mark or ".", currency=output.currency or "EUR",
                      api_key=None)
    entries = plan["lines"]
    counted = [line for line in output.lines if line.role in COUNTED]
    ids = plan.get("ids", {})
    entry = lambda line: entries.get(ids.get(f"1:{line.id}", ""), {})
    # Lines Python turned into reference lines (repeats, information) are not asked about either way.
    counted = [line for line in counted if entry(line).get("role", line.role) != ""]
    verified = sum(1 for line in counted if entry(line).get("verified"))
    auto = sum(1 for line in counted if entry(line).get("autoVerified"))
    return {"status": plan["status"], "counted": len(counted), "verified": verified, "auto": auto,
            "ask": len(counted) - auto}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    rows = []
    for path in sorted((APP_ROOT / "private" / "groq-cache").glob("*.json")):
        try:
            output = parse_response(json.loads(path.read_text(encoding="utf-8")))
        except Exception:  # link, explanation and message answers are not page reads
            continue
        counts = page_counts(output)
        if counts:
            rows.append({"file": path.name[:10], **counts})
    total = {key: sum(row[key] for row in rows) for key in ("counted", "verified", "auto", "ask")}
    closed = sum(1 for row in rows if row["status"] == "ok")
    print(f"pages/areas: {len(rows)} (adding up: {closed})")
    for row in rows:
        print(f"  {row['file']}  {row['status']:10} counted={row['counted']:3} verified={row['verified']:3} "
              f"auto={row['auto']:3} ask={row['ask']:3}")
    print(f"TOTAL counted={total['counted']} verified={total['verified']} auto={total['auto']} ask={total['ask']}")
    if args.json:
        args.json.write_text(json.dumps({"rows": rows, "total": total}, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
