"""Exact monetary parsing and formatting. Floats are deliberately rejected."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


class MoneyError(ValueError):
    """Raised when a money value is ambiguous or unsafe."""


def parse_major_to_minor(
    raw: str | int | Decimal,
    *,
    decimal_separator: str = ".",
    scale: int = 2,
) -> int:
    """Parse a major-unit amount into minor units using explicit half-up rounding.

    ``decimal_separator`` must be supplied for comma-decimal input. Grouping
    separators are removed only according to that declared locale convention.
    Binary floating-point input is rejected at the boundary.
    """

    if isinstance(raw, bool) or isinstance(raw, float):
        raise MoneyError("money input must be text, int, or Decimal; floats are unsafe")
    if decimal_separator not in {".", ","}:
        raise MoneyError("decimal_separator must be '.' or ','")
    if scale < 0:
        raise MoneyError("scale must be non-negative")

    text = str(raw).strip().replace(" ", "")
    negative_parentheses = text.startswith("(") and text.endswith(")")
    if negative_parentheses:
        text = text[1:-1]

    if decimal_separator == ".":
        text = text.replace(",", "")
    else:
        text = text.replace(".", "").replace(",", ".")

    try:
        value = Decimal(text)
    except InvalidOperation as exc:
        raise MoneyError(f"invalid money value: {raw!r}") from exc
    if not value.is_finite():
        raise MoneyError("money value must be finite")
    if negative_parentheses:
        value = -value

    quantum = Decimal(1).scaleb(-scale)
    rounded = value.quantize(quantum, rounding=ROUND_HALF_UP)
    return int(rounded.scaleb(scale))


def format_minor(amount_minor: int, currency: str, *, scale: int = 2) -> str:
    """Format integer minor units without converting through a float."""

    if scale < 0:
        raise MoneyError("scale must be non-negative")
    sign = "-" if amount_minor < 0 else ""
    absolute = abs(amount_minor)
    if scale == 0:
        number = str(absolute)
    else:
        divisor = 10**scale
        number = f"{absolute // divisor}.{absolute % divisor:0{scale}d}"
    return f"{sign}{currency} {number}"
