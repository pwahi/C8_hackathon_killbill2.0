"""Bill structure (invoice -> optional sections -> rows) and its exact verifier (H1, PRD section 16).

A model may later *propose* a structure; nothing here trusts it. Every relation uses stable IDs
and one parent pointer, so a row can only be counted on one path. Sections are optional: a flat
bill is just an invoice with rows directly under it, and nesting exists only if the bill needs it.
Code owns every sum. Missing or contradictory structure never produces ``ok``.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

ID_PATTERN = r"^[A-Za-z0-9_-]{1,100}$"
SUMMED_ROLES = {"charge", "discount", "adjustment"}
MAX_SECTION_DEPTH = 3


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, alias_generator=to_camel, populate_by_name=True)


class InvoiceNode(_Model):
    id: str = Field(pattern=ID_PATTERN)
    label: str | None = Field(default=None, max_length=60)
    total_line_id: str | None = Field(default=None, pattern=ID_PATTERN)


class SectionNode(_Model):
    id: str = Field(pattern=ID_PATTERN)
    # An invoice ID (top-level section) or another section's ID (nested section).
    parent_id: str = Field(pattern=ID_PATTERN)
    label: str = Field(min_length=1, max_length=60)
    period: str | None = Field(default=None, max_length=60)  # only if printed; never inferred
    subtotal_line_id: str | None = Field(default=None, pattern=ID_PATTERN)


class RowPlacement(_Model):
    line_id: str = Field(pattern=ID_PATTERN)
    parent_id: str = Field(pattern=ID_PATTERN)  # an invoice or a section


class SummaryLink(_Model):
    """A printed line that only repeats the amount of a section or an invoice (for example an overview page
    listing a section, or the bill total printed again). It is a reference: never counted, never a check."""

    line_id: str = Field(pattern=ID_PATTERN)
    section_id: str = Field(pattern=ID_PATTERN)


class BillStructure(_Model):
    invoices: tuple[InvoiceNode, ...] = Field(min_length=1, max_length=10)
    sections: tuple[SectionNode, ...] = Field(default=(), max_length=50)
    rows: tuple[RowPlacement, ...] = Field(default=(), max_length=200)
    summaries: tuple[SummaryLink, ...] = Field(default=(), max_length=50)


Severity = Literal["invalid", "mismatch", "note"]
Status = Literal["ok", "mismatch", "incomplete", "invalid"]


@dataclass(frozen=True)
class Problem:
    kind: str
    severity: Severity
    message: str
    ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class NodeCheck:
    id: str
    kind: Literal["invoice", "section"]
    computed_minor: int
    printed_minor: int | None
    line_ids: tuple[str, ...]  # every row counted under this node

    @property
    def matches(self) -> bool | None:
        return None if self.printed_minor is None else self.computed_minor == self.printed_minor


@dataclass(frozen=True)
class StructureCheck:
    status: Status
    problems: tuple[Problem, ...]
    nodes: Mapping[str, NodeCheck]
    counted_line_ids: tuple[str, ...]
    reference_line_ids: tuple[str, ...]


def verify_structure(structure: BillStructure, lines: Mapping[str, tuple[str, int]]) -> StructureCheck:
    """Check a proposed structure against confirmed lines: ``{line_id: (role, amount_minor)}``.

    Amounts are never changed. Structural faults give ``invalid`` and no sums; sums that disagree
    with a printed figure give ``mismatch``; a missing printed figure gives ``incomplete``.
    """

    problems: list[Problem] = []
    seen: set[tuple[str, tuple[str, ...]]] = set()

    def add(kind: str, severity: Severity, message: str, ids: tuple[str, ...] = ()) -> None:
        key = (kind, tuple(sorted(ids)))
        if key not in seen:
            seen.add(key)
            problems.append(Problem(kind, severity, message, tuple(ids)))

    def invalid(kind: str, message: str, ids: tuple[str, ...] = ()) -> None:
        add(kind, "invalid", message, ids)

    node_ids = [node.id for node in (*structure.invoices, *structure.sections)]
    for duplicate in sorted(key for key, count in Counter(node_ids).items() if count > 1):
        invalid("duplicate_id", "Two parts of the bill structure share the same ID.", (duplicate,))
    for clash in sorted(set(node_ids) & set(lines)):
        invalid("id_clash", "A structure ID is also used by a bill line.", (clash,))
    if problems:
        return _result(problems, {}, (), ())

    invoices = {node.id: node for node in structure.invoices}
    sections = {node.id: node for node in structure.sections}

    root_of: dict[str, str] = {}
    for section in sections.values():
        chain: list[str] = []
        current = section
        while True:
            if current.id in chain:
                invalid("cycle", "Sections point at each other in a loop.", tuple(chain))
                break
            chain.append(current.id)
            if len(chain) > MAX_SECTION_DEPTH:
                invalid("too_deep", f"Sections are nested more than {MAX_SECTION_DEPTH} levels.", tuple(chain))
                break
            if current.parent_id in invoices:
                root_of[section.id] = current.parent_id
                break
            if current.parent_id in sections:
                current = sections[current.parent_id]
                continue
            invalid("unknown_parent", "A section points at a parent that does not exist.", (current.id,))
            break

    def parent_ok(parent_id: str) -> bool:
        return parent_id in invoices or parent_id in root_of

    placed = Counter(row.line_id for row in structure.rows)
    for line_id, count in sorted(placed.items()):
        if count > 1:
            invalid("placed_twice", "A line is placed in the structure more than once, so it would be counted twice.", (line_id,))
    for row in structure.rows:
        if row.line_id not in lines:
            invalid("unknown_line", "The structure uses a line that was not confirmed.", (row.line_id,))
        elif lines[row.line_id][0] not in SUMMED_ROLES:
            invalid("not_a_detail_row", "Only charges, discounts and adjustments can be rows; "
                    "subtotals and totals are printed figures.", (row.line_id,))
        if not parent_ok(row.parent_id):
            invalid("unknown_parent", "A row points at a parent that does not exist.", (row.line_id,))

    referenced = Counter(link.line_id for link in structure.summaries)
    for link in structure.summaries:
        if referenced[link.line_id] > 1:
            invalid("summary_twice", "A summary line is linked to more than one section.", (link.line_id,))
        if link.line_id not in lines:
            invalid("unknown_line", "The structure uses a line that was not confirmed.", (link.line_id,))
        elif lines[link.line_id][0] not in {"charge", "subtotal", "total"}:
            invalid("summary_not_charge", "A summary reference must be a printed charge, subtotal or total.", (link.line_id,))
        if link.line_id in placed:
            invalid("summary_also_row", "A summary is also placed as a row, so it would be counted as a charge.", (link.line_id,))
        if link.section_id not in root_of and link.section_id not in invoices:
            invalid("unknown_section", "A summary points at a section that does not exist.", (link.line_id,))

    printed_use: Counter[str] = Counter()
    for owner, line_id, role in (
        *((invoice.id, invoice.total_line_id, "total") for invoice in invoices.values()),
        *((section.id, section.subtotal_line_id, "subtotal") for section in sections.values()),
    ):
        if line_id is None:
            continue
        printed_use[line_id] += 1
        if line_id not in lines:
            invalid("unknown_line", "The structure uses a line that was not confirmed.", (line_id,))
        elif lines[line_id][0] != role:
            invalid("wrong_printed_role", f"{owner} expects a printed {role}, but the line has another type.", (line_id,))
    for line_id, count in sorted(printed_use.items()):
        if count > 1 or line_id in referenced:
            invalid("printed_used_twice", "One printed figure is used to check more than one part.", (line_id,))
    for line_id, (role, _) in lines.items():
        if role in {"subtotal", "total"} and line_id not in printed_use and line_id not in referenced:
            invalid("unlinked_printed_figure", "A printed subtotal or total is not attached to any part of the structure.", (line_id,))
        if role in SUMMED_ROLES and line_id not in placed and line_id not in referenced:
            invalid("unplaced_line", "A confirmed charge, discount or adjustment is not placed anywhere, "
                    "so it would be silently left out.", (line_id,))

    rows_under: dict[str, list[str]] = {}
    for row in structure.rows:
        rows_under.setdefault(row.parent_id, []).append(row.line_id)
    children: dict[str, list[str]] = {}
    for section in sections.values():
        children.setdefault(section.parent_id, []).append(section.id)
    for invoice in invoices.values():
        if not rows_under.get(invoice.id) and not children.get(invoice.id):
            invalid("empty_invoice", "An invoice has no rows or sections.", (invoice.id,))
    for link in structure.summaries:
        if link.section_id in (*root_of, *invoices) and not rows_under.get(link.section_id) and not children.get(link.section_id):
            invalid("summary_without_detail", "A summary points at a section with no detail rows.", (link.line_id,))
    if any(problem.severity == "invalid" for problem in problems):
        return _result(problems, {}, (), ())

    nodes: dict[str, NodeCheck] = {}

    def compute(node_id: str) -> NodeCheck:
        counted = list(rows_under.get(node_id, ()))
        total = sum(lines[line_id][1] for line_id in counted)
        for child_id in children.get(node_id, ()):
            child = compute(child_id)
            counted.extend(child.line_ids)
            total += child.computed_minor
        if node_id in invoices:
            printed_line, kind = invoices[node_id].total_line_id, "invoice"
        else:
            printed_line, kind = sections[node_id].subtotal_line_id, "section"
        check = NodeCheck(node_id, kind, total, None if printed_line is None else lines[printed_line][1], tuple(counted))
        nodes[node_id] = check
        return check

    for invoice in invoices.values():
        check = compute(invoice.id)
        if check.matches is False:
            add("total_mismatch", "mismatch", "The rows under this invoice do not add up to its printed total.", (invoice.id,))
        elif check.printed_minor is None:
            top = children.get(invoice.id, ())
            if rows_under.get(invoice.id) or not top or any(sections[s].subtotal_line_id is None for s in top):
                add("no_printed_total", "note", "This invoice has no printed total to check against.", (invoice.id,))
    for section in sections.values():
        if nodes[section.id].matches is False:
            add("subtotal_mismatch", "mismatch", "The rows in this section do not add up to its printed subtotal.", (section.id,))
    for link in structure.summaries:
        target = nodes[link.section_id]
        expected = target.printed_minor if target.printed_minor is not None else target.computed_minor
        if lines[link.line_id][1] != expected:
            add("summary_mismatch", "mismatch", "A summary line shows a different amount than the part it repeats.",
                (link.line_id, link.section_id))
    counted = tuple(row.line_id for row in structure.rows)
    return _result(problems, nodes, counted, tuple(link.line_id for link in structure.summaries))


def _result(problems, nodes, counted, references) -> StructureCheck:
    severities = {problem.severity for problem in problems}
    if "invalid" in severities:
        status: Status = "invalid"
    elif "mismatch" in severities:
        status = "mismatch"
    elif any(problem.kind == "no_printed_total" for problem in problems):
        status = "incomplete"
    else:
        status = "ok"
    return StructureCheck(status, tuple(problems), nodes, counted, references)
