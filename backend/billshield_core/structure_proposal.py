"""Turn a model's structure proposal for one crop into a BillStructure and verify it (H2).

Everything the model says is untrusted. Candidate amounts stay as printed; Python parses them with the
person's decimal mark and checks every relation. A line the model forgot is reported, never placed for it.
Crop-level only: joining several crops or pages into one invoice is H3.
"""

from __future__ import annotations

from dataclasses import dataclass

from .extraction import ExtractionOutput
from .review import ReviewError, _check_label, parse_confirmed_amount
from .structure import (
    SUMMED_ROLES, BillStructure, InvoiceNode, Problem, RowPlacement, SectionNode, Status, StructureCheck,
    SummaryLink, verify_structure,
)

INVOICE_ID = "inv-1"
KNOWN_ROLES = SUMMED_ROLES | {"subtotal", "total"}


@dataclass(frozen=True)
class ProposalCheck:
    status: Status
    problems: tuple[Problem, ...]
    structure: BillStructure
    check: StructureCheck


def check_proposal(output: ExtractionOutput, *, decimal_separator: str, currency: str) -> ProposalCheck | None:
    """None when the model proposed no structure. Otherwise the structure plus its verification."""

    proposal = output.structure
    if proposal is None:
        return None

    lines: dict[str, tuple[str, int]] = {}
    extra: list[Problem] = []
    for line in output.lines:
        if line.role not in KNOWN_ROLES:
            continue
        try:
            if line.raw_amount is None:
                raise ReviewError("no amount")
            lines[line.id] = (line.role, parse_confirmed_amount(
                line.raw_amount, decimal_separator=decimal_separator, currency=currency))
        except ReviewError:
            extra.append(Problem("unreadable_amount", "invalid",
                                 "An amount could not be read with the chosen decimal mark; it was not guessed.", (line.id,)))

    totals = [line_id for line_id, (role, _) in lines.items() if role == "total"]
    top = lambda parent: INVOICE_ID if parent is None else parent
    structure = BillStructure(
        invoices=(InvoiceNode(id=INVOICE_ID, total_line_id=totals[0] if len(totals) == 1 else None),),
        sections=tuple(SectionNode(id=s.id, parent_id=top(s.parent_id), label=s.label, period=s.period,
                                   subtotal_line_id=s.subtotal_line_id) for s in proposal.sections),
        rows=tuple(RowPlacement(line_id=r.line_id, parent_id=top(r.section_id)) for r in proposal.rows),
        summaries=tuple(SummaryLink(line_id=m.line_id, section_id=m.section_id) for m in proposal.summaries),
    )
    check = verify_structure(structure, lines)
    problems = (*extra, *check.problems)
    # An unreadable amount means a line could not take part in any sum, so it can never be "ok".
    status: Status = "invalid" if extra else check.status
    return ProposalCheck(status, problems, structure, check)


def line_plan(output: ExtractionOutput, check: ProposalCheck, *, currency: str) -> dict:
    """What the browser needs per line: the checked section it belongs to, its printed path, whether Python
    verified that section against its printed subtotal, and a hint when it did not add up.

    Today's line list is flat (one group per line), so each row joins the nearest enclosing section that has a
    printed subtotal; the full path is only shown as text. Nothing is linked for an invalid structure.
    """
    from .money import format_minor

    if check.status == "invalid":
        return {"status": "invalid", "problems": [problem.message for problem in check.problems], "lines": {}}
    structure = check.structure
    sections = {section.id: section for section in structure.sections}

    def chain(section_id: str | None) -> list:
        found = []
        while section_id in sections:
            found.append(sections[section_id])
            section_id = sections[section_id].parent_id
        return found  # innermost first

    def path(section_id: str | None) -> str:
        return " › ".join(f"{s.label} ({s.period})" if s.period and s.period.casefold() not in s.label.casefold() else s.label for s in reversed(chain(section_id)))

    # Checked sections get a unique group name; identical headings in different places stay separate.
    owners = [section for section in structure.sections if section.subtotal_line_id]
    group_names, used = {}, set()
    for index, section in enumerate(owners, start=1):
        name, number = " ".join(section.label.split())[:50], 2
        try:
            _check_label(name, "section")  # the same rule /api/analyze applies to group names
        except ReviewError:
            name = f"Section {index}"
        while name.casefold() in used:
            name, number = f"{section.label[:45]} {number}", number + 1
        used.add(name.casefold())
        group_names[section.id] = name

    hints = {}
    for section in owners:
        node = check.check.nodes.get(section.id)
        if node is None or node.matches is not False:
            continue
        gap = node.computed_minor - node.printed_minor
        size = format_minor(abs(gap), currency)
        direction = (f"{size} too much: a discount of {size} may be missing, or a charge may be read twice"
                     if gap > 0 else f"{size} too little: a charge of {size} may be missing, or a discount may be read twice")
        hints[section.id] = (f"Section {section.label}: the lines read add up to {format_minor(node.computed_minor, currency)}, "
                             f"but its printed subtotal is {format_minor(node.printed_minor, currency)}. That is {direction}. "
                             "Compare this section with the bill, or read the area again.")

    plan = {}
    placements = [(row.line_id, row.parent_id) for row in structure.rows]
    placements += [(s.subtotal_line_id, s.id) for s in owners]
    for line_id, parent in placements:
        owner = next((s for s in chain(parent) if s.subtotal_line_id), None)
        verified = owner is not None and check.check.nodes[owner.id].matches is True
        plan[line_id] = {"group": group_names[owner.id] if owner else "", "path": path(parent),
                         "verified": verified, "hint": hints.get(owner.id) if owner else None}
    for section in owners:
        # A subtotal over sections that have their own subtotals: checked here in the hierarchy, shown not counted.
        if any(other.id != section.id and section.id in {s.id for s in chain(other.id)} for other in owners):
            node = check.check.nodes.get(section.id)
            ok = node is not None and node.matches is True
            plan[section.subtotal_line_id].update(role="", group="", hint=None, referenceText=(
                "Subtotal of the sections it contains — " + ("✓ adds up (checked by Python)" if ok
                                                             else "✗ does not add up: compare it with the bill")))
    for link in structure.summaries:
        plan[link.line_id] = {"group": "", "role": "", "path": path(link.section_id), "verified": False, "summaryOf": sections[link.section_id].label if link.section_id in sections else "the bill total",
                              "hint": None}
    return {"status": check.status, "problems": [problem.message for problem in check.problems
                                                   if problem.severity != "note"], "lines": plan}
