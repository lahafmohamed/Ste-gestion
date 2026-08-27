# Bring the Réception queue-banner button up to the 44px touch floor

Written against: d39650a58318d673e81db01f7762edcf457c3365 (working tree)

> Reconciled 2026-08-27: the « fiche » design was promoted and the variants harness is slated for removal (see `reception-promote-fiche-remove-variants.md`). The GuichetVariant edit below applies only if that file still exists when this plan runs; otherwise skip change 2.

## Evidence chain

- Surface: Réception page (`apps/web/src/pages/ReceptionPage.tsx`), rendered when at least one truck is at stage `A_ETALER`, the contract is open, and `onEtaler` is provided. The banner appears in the default `fiche` variant (`apps/web/src/components/ReceptionSection.tsx:254-266`) and in the `guichet` variant (`apps/web/src/variants/ReceptionVariants.tsx:240-252`).
- Problem: the full-width queue-banner `<button>` (« N camion(s) en attente d'étalage — Aller à l'étalage → ») is styled `px-3 py-2.5 text-sm` with no `min-h-touch`. `text-sm` line-height (20px) + `py-2.5` (10px × 2) ≈ 40px rendered height, below the documented 44px touch floor.
- Design evidence: `apps/web/src/components/ui/Button.tsx:24-32` — « min-h : plancher tactile 44px partout (l'app se pilote au pouce sur le terrain) » ; `apps/web/src/components/ui/Input.tsx:10` — « min-h-touch : plancher tactile 44px » ; token defined in `apps/web/tailwind.config.js:55-60` (`minHeight.touch = 2.75rem`). Sibling touch targets on the same page already comply: the « Étaler ses billes » banner button (`ReceptionSection.tsx:160`, `ReceptionVariants.tsx:129`) and the « N à étaler → » heading link (`ReceptionVariants.tsx:395`) all carry `min-h-touch`.
- Owner: the two raw `<button>` elements themselves (deliberately not the `Button` primitive — the banner is a full-width tinted parc strip, not a button variant).
- Scope and affected surfaces: `apps/web/src/components/ReceptionSection.tsx` (consumed by ReceptionPage and, via `ContractSections`, the contract detail page if wired there) and `apps/web/src/variants/ReceptionVariants.tsx` (GuichetVariant only — BordereauVariant uses the compliant SectionHeading link instead).
- Uncertainty: none.

## Design decision

Add the existing `min-h-touch` utility to both queue-banner buttons. This enforces the repository-wide documented 44px touch floor on a primary navigation affordance used standing at the gate, without changing its visual identity (the flex centering absorbs the extra ~4px symmetrically).

## Reuse

- `min-h-touch` (Tailwind `minHeight.touch`, `apps/web/tailwind.config.js:55-60`)
- Exemplar: `apps/web/src/components/ReceptionSection.tsx:160` (the « Étaler ses billes » button in the same file already pairs `min-h-touch` with a tinted parc treatment)

No new primitive. Do not extract the banner into a shared component — the variants harness is documented as temporary (« à supprimer après promotion », `apps/web/src/variants/ReceptionVariants.tsx:19`); duplication there is deliberate and short-lived.

## Changes

1. `apps/web/src/components/ReceptionSection.tsx` (~line 258)
   - Change: on the queue-banner `<button>` whose className is `"mb-3 flex w-full items-center justify-between gap-2 rounded-xl border border-parc-200 bg-parc-50/60 px-3 py-2.5 text-left text-sm text-parc-800 hover:bg-parc-50"`, add `min-h-touch` to the class list (e.g. after `w-full`).
   - Preserve: every other class, the `flex items-center justify-between` layout, `py-2.5` padding, all content and the `onEtaler(null)` handler.
   - Verify: rendered button height ≥ 44px (2.75rem) in devtools.

2. `apps/web/src/variants/ReceptionVariants.tsx` (~line 244, inside `GuichetVariant`) — **conditional**
   - Only if `apps/web/src/variants/` still exists (harness not yet removed per `reception-promote-fiche-remove-variants.md`): add `min-h-touch` to the same className string on the queue-banner `<button>`.
   - Preserve: same as above.
   - Verify: same as above, with `?variant=guichet` in the URL. If the directory is gone, this change is void.

## Scope

- Inherit: Réception page (fiche + guichet variants); any other host that renders `ReceptionSection` with `onEtaler`.
- Verify: banner layout at 360px viewport width (text wraps to two lines — `min-h` must not fight the wrap; it will not, min-height only sets a floor).
- Exclude: BordereauVariant (uses the SectionHeading `min-h-touch` link, already compliant); VariantPicker (documented off-system exception); all other pages.

## Validation

- Product: on Réception with ≥1 truck « À étaler », tap the banner → navigates to `/etalage`; target comfortably tappable by thumb.
- Interface: check both variants (`/reception` and `/reception?variant=guichet`), one-line and wrapped-text states, viewports 360px / 768px / desktop.
- System: confirm `min-h-touch` is the token used (not a hardcoded `min-h-[44px]`), and no parallel banner pattern was introduced.
- Repository: `grep -rn "en attente d'étalage" apps/web/src` → 2 hits (or 1 if the variants harness was already removed); each hit's enclosing `<button>` className contains `min-h-touch`.

## Stop conditions

- Stop if either button's className no longer matches the string above (the variants harness may have been promoted or removed) — re-locate the banner before editing, or drop the variants-file edit if `src/variants/` is gone.

## Design documentation

- None — the 44px-floor rule is already recorded in `Button.tsx` / `Input.tsx` comments; this change only restores conformance.
