"""W0-lite for W5: generated bills with one known cause; does the AI + Python check put the right cause first?

Each case is a small confirmed review (as the browser sends it) plus the context notes the reader would return.
The injected cause is known, so the answer can be scored without a person. Cases differ in sector, language and
cause on purpose; none of them is one of the owner's test bills. Every case calls the explanation model once
(Groq gpt-oss-120b, cached in private/groq-cache, so a rerun costs nothing).

Usage: python scripts/eval_synthetic_causes.py --send [--json OUT]
Scored: top1 = the first cause shown cites exactly the injected lines (or, for a cause with no line, the injected
note); any = some shown cause does; unsupported = causes Python hid. Only EUR and INR are used because the review
contract accepts only those today (W1 is not built yet).
"""
from pathlib import Path
import argparse
import json
import sys
import time

APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT / "backend"))
from billshield_core.gap_llm import explain_gap  # noqa: E402
from billshield_core.groq_http import read_api_key  # noqa: E402
from billshield_core.review import analyze_confirmed_review  # noqa: E402


def line(id, description, amount, role="charge", group=None):
    return {"id": id, "role": role, "group": group, "description": description, "rawAmount": amount,
            "extractedRawAmount": None, "extractor": "manual", "questioned": False, "currency": "EUR",
            "source": {"page": 1, "precision": "page"}}


def note(quote, about, line_ids=()):
    return {"quote": quote, "about": about, "page": 1, "verified": True, "lineIds": list(line_ids)}


# (name, sector/language, lines, expected, notes, answer) — answer: the injected line ids, or ("note", index).
CASES = [
    ("roaming", "telecom/nl", [
        line("plan", "Mobile plan 20 GB", "25.00"), line("roam", "Roaming outside the EU", "18.40"),
        line("vat", "VAT", "9.11"), line("total", "Total to pay", "52.51", "total")], "34.11",
     [note("Gebruik buiten de EU wordt apart berekend: 12-18 aug Turkije", "Usage outside the EU is charged separately.", ["roam"])],
     ["roam"]),
    ("one-off fee", "internet/de", [
        line("plan", "Internet fast plan", "39.95"), line("setup", "One-time connection fee", "69.95"),
        line("router", "Router rental", "4.99"), line("total", "Total", "114.89", "total")], "44.94",
     [note("Einmaliges Bereitstellungsentgelt für den neuen Anschluss", "One-time fee for the new connection.", ["setup"])],
     ["setup"]),
    ("discount ended", "energy/fr", [
        line("power", "Electricity subscription", "48.00"), line("use", "Electricity used", "61.20"),
        line("total", "Total", "109.20", "total")], "99.20",
     [note("Votre remise de bienvenue de 10,00 € a pris fin le 31 août", "The welcome discount ended on 31 August.")],
     ("note", 0)),
    ("pro-rated period", "streaming/en", [
        line("aug", "Premium plan (12-31 August)", "9.68"), line("sep", "Premium plan (September)", "14.99"),
        line("total", "Total", "24.67", "total")], "14.99",
     [note("Your first bill includes the part-month from your start date", "The first bill also covers the part-month after joining.", ["aug"])],
     ["aug"]),
    ("late fee", "water/es", [
        line("water", "Water supply", "31.40"), line("sewer", "Sewerage", "18.10"),
        line("late", "Late payment charge", "7.50"), line("total", "Total", "57.00", "total")], "49.50",
     [note("Recargo por pago fuera de plazo de la factura anterior", "A surcharge for paying the previous bill late.", ["late"])],
     ["late"]),
    ("insurance indexation", "insurance/nl", [
        line("premium", "Home insurance premium", "21.80"), line("tax", "Insurance tax", "4.58"),
        line("total", "Total", "26.38", "total")], "24.20",
     [note("Uw premie is per 1 januari geïndexeerd", "Your premium was indexed on 1 January.", ["premium", "tax"])],
     ["premium", "tax"]),
    ("extra service", "telecom/en", [
        line("plan", "Unlimited plan", "30.00"), line("music", "Music add-on", "4.99"),
        line("insur", "Device insurance", "7.00"), line("total", "Total", "41.99", "total")], "34.99",
     [note("Device insurance started this month", "Device insurance began this month.", ["insur"])],
     ["insur"]),
    ("no note, one fee", "retail/en", [
        line("item", "Office chair", "189.00"), line("ship", "Shipping", "14.90"),
        line("total", "Order total", "203.90", "total")], "189.00", [], ["ship"]),
    ("two fees together", "travel/en", [
        line("fare", "Base fare", "120.00"), line("bag", "Checked bag", "35.00"), line("seat", "Seat selection", "12.00"),
        line("total", "Total", "167.00", "total")], "120.00",
     [note("Optional extras added at booking", "Extras chosen during booking.", ["bag", "seat"])], ["bag", "seat"]),
    ("distractor note", "energy/de", [
        line("base", "Base fee", "12.50"), line("gas", "Gas used", "88.30"), line("levy", "CO2 levy", "9.70"),
        line("total", "Total", "110.50", "total")], "100.80",
     [note("Die CO2-Abgabe ist gesetzlich vorgeschrieben", "The CO2 levy is set by law.", ["levy"]),
      note("Zahlbar innerhalb von 14 Tagen", "Payable within 14 days.")], ["levy"]),
    # Harder: the note is not linked to any line; the AI must connect it.
    ("unlinked note", "telecom/it", [
        line("plan", "Mobile plan", "9.99"), line("extra", "Traffic outside the bundle", "6.10"),
        line("total", "Total", "16.09", "total")], "9.99",
     [note("Traffico extra soglia addebitato a consumo", "Usage beyond the bundle is charged per use.")], ["extra"]),
    # Harder: nothing on the bill accounts for the difference; nothing may be graded as explaining it all.
    ("nothing explains it", "telecom/en", [
        line("plan", "Family plan", "44.00"), line("tv", "TV package", "12.00"),
        line("total", "Total", "56.00", "total")], "52.50", [], ("none",)),
    # Harder: two new fees, only one equals the difference.
    ("one of two fees", "energy/en", [
        line("std", "Standing charge", "15.00"), line("use", "Energy used", "70.00"),
        line("meter", "Meter exchange fee", "25.00"), line("admin", "Paper bill fee", "2.50"),
        line("total", "Total", "112.50", "total")], "110.00",
     [note("A fee applies for paper bills", "Paper bills cost extra.", ["admin"])], ["admin"]),
]


def run(case, key, cache):
    name, kind, lines, expected, notes, answer = case
    review = {"schemaVersion": 2, "currency": "EUR", "decimalSeparator": ".", "expectedAmount": expected,
              "messageType": "automatic", "earlierPeriodGroup": None, "printedFiguresRechecked": False, "lines": lines}
    result = analyze_confirmed_review(review)
    explanation = explain_gap(result, key, cache, notes)
    causes = explanation["likelyCauses"]
    if answer == ("none",):  # right when no shown cause claims to explain the whole difference
        ok = not any(c["grade"] == "full" for c in causes)
        return {"case": name, "kind": kind, "difference": result["amounts"]["difference"], "top1": ok, "any": ok,
                "shown": [(c["lineIds"], c["noteIds"], c["grade"]) for c in causes], "story": explanation["story"] is not None}
    hit = (lambda cause: set(cause["lineIds"]) == set(answer)) if isinstance(answer, list) else (
        lambda cause: answer[1] in cause["noteIds"])
    # Hidden causes are not returned; count them from the difference between raw and shown is not possible here,
    # so the grade list of what is shown is reported instead.
    return {"case": name, "kind": kind, "difference": result["amounts"]["difference"],
            "top1": bool(causes) and hit(causes[0]), "any": any(hit(c) for c in causes),
            "shown": [(c["lineIds"], c["noteIds"], c["grade"]) for c in causes], "story": explanation["story"] is not None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--send", action="store_true", help="send the generated cases to Groq (no bill data)")
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    if not args.send:
        parser.error("Add --send to call the explanation model for the generated cases")
    key, cache = read_api_key(APP_ROOT), APP_ROOT / "private" / "groq-cache"
    rows = []
    for case in CASES:
        time.sleep(4)  # Groq allows a few requests per minute on this key
        try:
            rows.append(run(case, key, cache))
        except Exception as error:  # a failed case is reported, not hidden
            rows.append({"case": case[0], "kind": case[1], "error": f"{type(error).__name__}: {error}"[:160],
                         "top1": False, "any": False})
    for row in rows:
        if "error" in row:
            print(f"  ERROR {row['case']:22} {row['kind']:14} {row['error']}")
        else:
            print(f"  {'Y' if row['top1'] else '-'} {'Y' if row['any'] else '-'} {row['case']:22} {row['kind']:14} "
                  f"diff {row['difference']:>10}  shown {row['shown']}  story={row['story']}")
    top1, anyhit = sum(r["top1"] for r in rows), sum(r["any"] for r in rows)
    print(f"TOP-1 {top1}/{len(rows)}   ANY {anyhit}/{len(rows)}   errors {sum('error' in r for r in rows)}")
    if args.json:
        args.json.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
