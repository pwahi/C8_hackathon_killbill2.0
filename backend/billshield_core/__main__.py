from __future__ import annotations

from pathlib import Path

from .engine import analyze_case
from .fixtures import load_fixture


def main() -> None:
    app_root = Path(__file__).resolve().parents[2]
    for path in sorted((app_root / "tests" / "fixtures").glob("BS-*.json")):
        case = load_fixture(path)
        result = analyze_case(case)
        print(f"{result.case_id}: {result.verdict}")
        print(f"  total: {result.total_formula}")
        print(f"  arithmetic: {result.arithmetic_status}; comparison: {result.comparison_status}")
        print(f"  support: {', '.join(result.draft.supporting_line_ids)}")
        print(f"  draft: {result.draft.text}\n")


if __name__ == "__main__":
    main()
