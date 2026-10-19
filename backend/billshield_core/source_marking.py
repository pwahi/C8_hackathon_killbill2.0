"""Create a simple inspectable SVG overlay for normalized candidate bounds."""

from __future__ import annotations

from html import escape

from .extraction import CandidateLine


def highlight_svg(lines: tuple[CandidateLine, ...], *, page: int, width: int = 1000, height: int = 1400) -> str:
    rectangles: list[str] = []
    for line in lines:
        if line.page != page or line.bounds is None:
            continue
        bounds = line.bounds
        x = bounds.x0 * width
        y = bounds.top * height
        w = (bounds.x1 - bounds.x0) * width
        h = (bounds.bottom - bounds.top) * height
        rectangles.append(
            f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" '
            'fill="#ffcc0040" stroke="#d97706" stroke-width="3" />'
            f'<text x="{x:.2f}" y="{max(14, y - 4):.2f}" font-size="14">{escape(line.id)}</text>'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">' + "".join(rectangles) + "</svg>"
    )
