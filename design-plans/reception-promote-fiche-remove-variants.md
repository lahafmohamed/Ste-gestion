# Promote the « fiche » Réception design and remove the variants harness

Written against: d39650a58318d673e81db01f7762edcf457c3365 (plus uncommitted working-tree changes — `apps/web/src/variants/` and the harness wiring in `ReceptionPage.tsx` exist only in the working tree; line numbers below reflect the working tree)

## Evidence chain

- Surface: Réception page (`apps/web/src/pages/ReceptionPage.tsx`).
- Problem: the page carries a temporary A/B/C variants harness — `?variant=` URL switch, `GuichetVariant`, `BordereauVariant`, and a fixed dark `VariantPicker` pill overlaying every variant. The user has judged the variants and selected « fiche » (the existing `ReceptionSection`); the harness is now dead weight and the picker is visible product chrome that was never part of the design system.
- Design evidence: the harness documents its own removal — `apps/web/src/variants/ReceptionVariants.tsx:19` « HARNAIS DE VARIANTES — Réception. Temporaire : à supprimer après promotion. » and `apps/web/src/pages/ReceptionPage.tsx:14-15` « À retirer avec src/variants/ après promotion. » Promotion decision: user selected fiche (2026-08-27).
- Owner: `apps/web/src/pages/ReceptionPage.tsx` (harness wiring) and `apps/web/src/variants/` (harness implementation).
- Scope and affected surfaces: Réception page only. `ReceptionSection` itself is untouched — fiche IS the current component. Grep confirms `src/variants/` is imported nowhere else (`ReceptionVariants` referenced only from `ReceptionPage.tsx`).
- Uncertainty: none.

## Design decision

Restore `ReceptionPage` to rendering `ReceptionSection` directly and delete `apps/web/src/variants/` entirely. Fiche is the incumbent design; promotion therefore means removal of the alternatives and the switching machinery, not a migration. No visual change to the retained surface.

## Reuse

- `ReceptionSection` (`apps/web/src/components/ReceptionSection.tsx`) — the promoted design, already complete.
- Exemplar: git history — `ReceptionPage.tsx` before the harness (commit d39650a) shows the target shape.

No new primitive.

## Changes

1. `apps/web/src/pages/ReceptionPage.tsx`
   - Change: remove the `useSearchParams` import/usage, the `ReceptionVariants` import, the `variant` resolution (lines 14-17), and the variant conditional + `<VariantPicker />` in the render (lines 33-43). The `StepLayout` child returns `<ReceptionSection contractId={c.id} closed={c.status === "CLOSED"} onEtaler={...} />` alone. Keep `useNavigate` and the `onEtaler` callback exactly as is.
   - Preserve: `StepLayout` title/subtitle/step props, the `onEtaler` navigation (`/etalage?truck=…` / `/etalage`), the comments explaining Étape 1 and the hand-off to Étalage.
   - Verify: `/reception` renders identically to today's default (no `?variant` param); no dark pill at the bottom of the viewport; `?variant=guichet` in the URL is simply ignored.

2. `apps/web/src/variants/` (whole directory: `ReceptionVariants.tsx`)
   - Change: delete the directory.
   - Preserve: nothing — confirm first that `useReceptionForm`, `JustReceivedBanner`, `BlDupWarning`, `GuichetVariant`, `BordereauVariant`, `VariantPicker`, `RECEPTION_VARIANTS`, `ReceptionVariantKey` are referenced only from `ReceptionPage.tsx` (grep before deleting).
   - Verify: `npx tsc --noEmit` (or the workspace typecheck) passes; no dangling imports.

## Scope

- Inherit: Réception page.
- Verify: `App.tsx` (working tree modified — check it carries no variants-related routing or imports before assuming it's unrelated).
- Exclude: `ReceptionSection`, `TruckCard`, all UI primitives — unchanged; the companion plan `reception-queue-banner-touch-floor.md` (still applies to `ReceptionSection`).

## Validation

- Product: receive a truck on `/reception` → form opens via « + Camion arrivé », submits, « Enregistrer et camion suivant » chains, « Réceptionner → étaler les billes » navigates to `/etalage?truck=…`.
- Interface: `/reception` with and without stale `?variant=` params; keyboard ←/→/1-3 no longer switches anything; no fixed pill at any viewport.
- System: no parallel variant machinery remains; `ReceptionSection` is the single Réception implementation.
- Repository: `grep -rn "ReceptionVariants\|VariantPicker\|RECEPTION_VARIANTS" apps/web/src` → 0 hits; `apps/web/src/variants/` does not exist; typecheck passes.

## Stop conditions

- Stop if grep shows `src/variants/` consumed outside `ReceptionPage.tsx` — surface the consumer instead of deleting.
- Stop if `ReceptionPage.tsx` no longer matches the shape described (harness already removed or restructured).

## Design documentation

- After acceptance and validation: none to write in-product; the harness comments already framed fiche as the incumbent. If a decision log exists later, record « Réception : variante fiche retenue (guichet/bordereau évaluées et écartées, 2026-08-27) ».
