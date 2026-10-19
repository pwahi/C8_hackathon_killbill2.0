"""Derive a BillStructure from today's flat confirmed review (role + group), so the old flow can be checked
against the new verifier. This adds nothing the person did not confirm; it only re-expresses it."""

from __future__ import annotations

from .review import SUMMED_ROLES, ConfirmedReview, build_case, summary_links
from .structure import BillStructure, InvoiceNode, RowPlacement, SectionNode, SummaryLink


def derive_structure(review: ConfirmedReview) -> tuple[BillStructure, dict[str, tuple[str, int]]]:
    _, amounts = build_case(review)
    links = summary_links(review, amounts)
    lines = {line.id: (line.role, amounts[line.id]) for line in review.lines}
    key = lambda text: " ".join((text or "").casefold().split())

    totals = [line for line in review.lines if line.role == "total"]
    invoice = InvoiceNode(id="inv-1", total_line_id=totals[0].id if totals else None)
    members = {key(line.group) for line in review.lines
               if line.role in SUMMED_ROLES and line.id not in links and key(line.group)}
    section_ids: dict[str, str] = {}
    sections: list[SectionNode] = []
    for line in review.lines:
        group = key(line.group)
        if group in members and group not in section_ids:
            section_ids[group] = f"sec-{len(section_ids) + 1}"
            subtotal = next((s for s in review.lines if s.role == "subtotal" and key(s.group) == group), None)
            sections.append(SectionNode(id=section_ids[group], parent_id=invoice.id, label=" ".join(line.group.split()),
                                        subtotal_line_id=None if subtotal is None else subtotal.id))
    rows = tuple(
        RowPlacement(line_id=line.id, parent_id=section_ids.get(key(line.group), invoice.id))
        for line in review.lines if line.role in SUMMED_ROLES and line.id not in links
    )
    by_subtotal = {section.subtotal_line_id: section.id for section in sections if section.subtotal_line_id}
    summaries = tuple(SummaryLink(line_id=summary, section_id=by_subtotal[subtotal])
                      for summary, subtotal in links.items() if subtotal in by_subtotal)
    return BillStructure(invoices=(invoice,), sections=tuple(sections), rows=rows, summaries=summaries), lines
