"""Inspect local text extraction from an already-masked PDF without uploading it."""

from __future__ import annotations

import argparse
from pathlib import Path

from billshield_core.documents import read_text_pdf


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path, help="Path to an already-masked PDF")
    parser.add_argument(
        "--i-confirm-masked",
        action="store_true",
        help="Required confirmation that the PDF contains no prohibited personal data",
    )
    args = parser.parse_args()
    if not args.i_confirm_masked:
        parser.error("refusing to read the document until --i-confirm-masked is supplied")

    result = read_text_pdf(args.pdf)
    print(f"pages: {result.page_count}")
    print(f"positioned words: {len(result.tokens)}")
    for warning in result.warnings:
        print(f"warning: {warning}")
    print("first positioned words:")
    for token in result.tokens[:20]:
        print(f"  {token.id} page={token.page} text={token.text!r} bounds={token.bounds.model_dump()}")


if __name__ == "__main__":
    main()
