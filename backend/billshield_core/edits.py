"""Measure how much a person changed the draft, and blank private details before a sent text is stored.

Word-count convention (PRD): normalize case and punctuation, split into words, count word-level
Levenshtein edits (insertion, deletion and substitution each count as one).
"""
from __future__ import annotations

import re

WORD = re.compile(r"[^\W_]+(?:[.,'][^\W_]+)*", re.UNICODE)
EMAIL = re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
IBAN = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", re.IGNORECASE)
# Seven or more digits, optionally separated by spaces or dashes (phone, account, card, booking numbers).
LONG_NUMBER = re.compile(r"(?<!\d)(?<!\d[.,])\+?\d(?:[ -]?\d){6,}(?!\d)(?![.,]\d)")


def words(text: str) -> list[str]:
    return [word.casefold() for word in WORD.findall(text)]


def words_changed(original: str, final: str) -> int:
    before, after = words(original), words(final)
    previous = list(range(len(after) + 1))
    for i, old in enumerate(before, start=1):
        current = [i]
        for j, new in enumerate(after, start=1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (old != new)))
        previous = current
    return previous[-1]


def blank_private_details(text: str) -> str:
    text = EMAIL.sub("[email removed]", text)
    text = IBAN.sub("[account removed]", text)
    return LONG_NUMBER.sub("[number removed]", text)
