"""Bounded local document reading. This module never uploads a file."""

from __future__ import annotations

from pathlib import Path

import pdfplumber

from .extraction import Bounds, DocumentRead, SourceToken


class DocumentError(ValueError):
    pass


def read_text_pdf(
    path: str | Path,
    *,
    max_bytes: int = 4_000_000,
    max_pages: int = 10,
) -> DocumentRead:
    source = Path(path)
    if source.suffix.lower() != ".pdf":
        raise DocumentError("only PDF is accepted by the text-PDF reader")
    size = source.stat().st_size
    if size > max_bytes:
        raise DocumentError(f"PDF is too large: {size} bytes; limit is {max_bytes}")
    with source.open("rb") as handle:
        if handle.read(5) != b"%PDF-":
            raise DocumentError("file extension is PDF but the file signature is not")

    tokens: list[SourceToken] = []
    warnings: list[str] = []
    try:
        with pdfplumber.open(source) as pdf:
            if len(pdf.pages) > max_pages:
                raise DocumentError(f"PDF has {len(pdf.pages)} pages; limit is {max_pages}")
            for page_number, page in enumerate(pdf.pages, start=1):
                words = page.extract_words() or []
                if not words:
                    warnings.append(f"page {page_number} has no extractable text; image extraction required")
                for index, word in enumerate(words, start=1):
                    text = str(word.get("text", "")).strip()
                    if not text:
                        continue
                    tokens.append(
                        SourceToken(
                            id=f"p{page_number}-w{index}",
                            page=page_number,
                            text=text,
                            bounds=Bounds(
                                x0=float(word["x0"]) / float(page.width),
                                top=float(word["top"]) / float(page.height),
                                x1=float(word["x1"]) / float(page.width),
                                bottom=float(word["bottom"]) / float(page.height),
                            ),
                        )
                    )
            return DocumentRead(page_count=len(pdf.pages), tokens=tuple(tokens), warnings=tuple(warnings))
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentError(f"PDF could not be read: {exc}") from exc
