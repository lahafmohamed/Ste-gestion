# Capitalize the « Billonné ✓ » status badge in the Réception registry table

**Status: OBSOLETE (2026-08-27).** The « fiche » design was promoted; the `bordereau` variant and its registry table are removed with the variants harness (see `reception-promote-fiche-remove-variants.md`). The lowercase badge exists only in that harness — do not execute this plan. Delete this file once the harness removal has landed.

Written against: d39650a58318d673e81db01f7762edcf457c3365 (plus uncommitted working-tree changes — `apps/web/src/variants/` is new in the working tree; line numbers below reflect the working tree)

## Evidence chain

- Surface: Réception page, `bordereau` variant (`/reception?variant=bordereau`), « Registre » table — status column rendered per truck row (`apps/web/src/variants/ReceptionVariants.tsx:463-467`).
- Problem: the third status badge reads `billonné ✓` (lowercase), while its two siblings in the same `<Td>` read `À étaler` and `À billonner` (capitalized). Only one of the three renders per row, so users scanning the column see inconsistent capitalization across rows.
- Design evidence: direct contradiction in user-facing content within the same column and task. Same-status copy elsewhere is capitalized: « Billonné · sur parc » (`apps/web/src/pages/TruckDetailPage.tsx:571`) and the « Billonnés » tab (`apps/web/src/components/EtalageSection.tsx:29`). The sibling badges in `TruckCard.tsx:35-36` (« À étaler », « À billonner ») are also capitalized.
- Owner: the badge label literal at `apps/web/src/variants/ReceptionVariants.tsx:466` (the `Badge` primitive itself is correct; only the copy is wrong).
- Scope and affected surfaces: one line, one variant. The lowercase form appears nowhere else (`grep "illonné"` — all other user-facing occurrences capitalized).
- Uncertainty: none.

## Design decision

Change the label to `Billonné ✓`. Sentence-case status labels are the established convention for this status set across the registry column, TruckCard, TruckDetailPage, and EtalageSection; this aligns the one outlier.

## Reuse

- `Badge` primitive with `tone="parc"` — unchanged.
- Exemplar: `apps/web/src/pages/TruckDetailPage.tsx:571` (« Billonné · sur parc », tone parc).

No new primitive.

## Changes

1. `apps/web/src/variants/ReceptionVariants.tsx` (~line 466)
   - Change: replace `<Badge tone="parc">billonné ✓</Badge>` with `<Badge tone="parc">Billonné ✓</Badge>`.
   - Preserve: `tone="parc"`, the `✓`, the surrounding conditional rendering (`girth && …`) and the two sibling badges.
   - Verify: registry rows with a girth measurement show « Billonné ✓ ».

## Scope

- Inherit: Réception `bordereau` variant registry table only.
- Verify: none beyond the edited line — other surfaces already capitalized.
- Exclude: comments and internal identifiers containing « billonné » (`EtalageSection.tsx:323`, `ReceptionSection.tsx:279`, `TruckCard.tsx:11` — code comments, not user-facing); the `fiche`/`guichet` variants (no status table).

## Validation

- Product: open `/reception?variant=bordereau` on a contract with at least one fully billonné truck → status column shows « Billonné ✓ », matching the capitalization of « À étaler » / « À billonner » in other rows.
- Interface: registry table with mixed statuses across rows.
- System: `Badge` usage unchanged; no new tone or size.
- Repository: `grep -rn "billonné ✓" apps/web/src` → 0 hits; `grep -rn "Billonné ✓" apps/web/src` → 1 hit in `ReceptionVariants.tsx`.

## Stop conditions

- Stop if `src/variants/ReceptionVariants.tsx` no longer exists (harness promoted or removed) — if the registry table was promoted into a permanent component, re-locate the badge there and apply the same one-word change.

## Design documentation

- None — this restores an existing convention; nothing new to record.
