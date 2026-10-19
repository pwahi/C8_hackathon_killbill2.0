function centerY(bounds) {
  return (bounds.top + bounds.bottom) / 2;
}

export function nearbyText(candidate, tokens, options = {}) {
  const verticalTolerance = options.verticalTolerance ?? 0.018;
  const horizontalPadding = options.horizontalPadding ?? 0.42;
  const candidateCenter = centerY(candidate.bounds);
  return tokens
    .filter((token) => token.page === candidate.page)
    .filter((token) => Math.abs(centerY(token.bounds) - candidateCenter) <= verticalTolerance)
    .filter((token) => token.bounds.x1 >= candidate.bounds.x0 - horizontalPadding)
    .filter((token) => token.bounds.x0 <= candidate.bounds.x1 + horizontalPadding)
    .sort((left, right) => left.bounds.x0 - right.bounds.x0)
    .map((token) => token.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
