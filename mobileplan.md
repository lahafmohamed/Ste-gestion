# Mobile Responsive Plan — Ste-Gestion (@ste/web)

Goal: every page usable on phones (360–480px), tablets (768–1024px), and desktop, without breaking the existing tablet live-entry workflow (TallyEntry / EmpotageEntry in the yard).

## Current state (audit summary)

Already good — do not touch:
- `index.html` has the correct viewport meta tag.
- `Layout.tsx` is already mobile-first: sidebar hidden on mobile (`md:flex`), bottom tab bar on mobile (`md:hidden`), responsive header.
- Content wrapper pattern `max-w-3xl px-4` is safe on 360px.
- Most forms already stack correctly (`grid-cols-2 sm:grid-cols-3/4`): TrucksSection, SalesSection, TruckBordereau, AccountsSection, ContractSections, UsersPage, ComptaPage, ContractDetailPage, DashboardPage, ContractsPage.
- CuttingSection and TruckStatsSection tables are already wrapped in `overflow-x-auto`.

Broken on phones:

| Severity | File | Problem |
|---|---|---|
| Critical | `apps/web/src/components/EmpotageEntry.tsx` | 8-column fixed grid `grid-cols-[2rem_1fr_1fr_1fr_1fr_4.5rem_5rem_2rem]`, no responsive variant |
| Critical | `apps/web/src/components/SawnEntry.tsx` | Same 8-column fixed grid |
| Critical | `apps/web/src/components/TallyEntry.tsx` | 6-column fixed grid `grid-cols-[1.6rem_1fr_1fr_1fr_4.5rem_1.75rem]` |
| Critical | `apps/web/src/components/PackingList.tsx` | 7-column entry grid + 7-column display table with no `overflow-x-auto` |
| Critical | `apps/web/src/pages/ProductionRunPage.tsx` | 7-column table, no `overflow-x-auto` wrapper |
| Critical | `apps/web/src/pages/TruckDetailPage.tsx` | 6-column measurement table, no `overflow-x-auto` wrapper |
| High | `apps/web/src/components/ContainersSection.tsx` | 6-column table inside collapsible card, no horizontal scroll |
| High | `apps/web/src/pages/StockPage.tsx` | Stats grid stuck at `grid-cols-2` on every screen size |
| Medium | `apps/web/src/components/QuotaGauge.tsx` | Fixed `gap-x-5` can overflow below 480px |
| Medium | `EmpotageEntry.tsx`, `PackingList.tsx` | Inputs use `text-sm` → iOS Safari auto-zooms on focus (needs ≥16px, i.e. `text-base`) |

---

## Conventions (apply everywhere)

1. **Breakpoints**: default Tailwind (`sm` 640, `md` 768, `lg` 1024). Phone = below `sm`, tablet = `sm`–`lg`.
2. **Tables**: always `<div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0"><table className="min-w-[560px] ...">`. The negative margin lets the scroll area bleed to the screen edge on phones.
3. **Inputs**: `text-base` minimum (prevents iOS focus zoom) and `py-2.5` minimum (≈44px touch target). Numeric fields get `inputMode="decimal"` / `"numeric"` so phones open the number pad.
4. **Entry grids**: keep the one-row grid on `sm:` and up (tablet workflow unchanged); on phones use the strategy in Phase 2.
5. **Never introduce horizontal page scroll**: only inner containers scroll sideways.

---

## Phase 1 — Quick wins: table overflow wrappers (~1h, zero regression risk)

Wrap the unprotected tables per convention #2:

- [ ] `ProductionRunPage.tsx` — 7-col production table (`#, L (ft), l (in), ép (in), Nbr, Taille, m³`)
- [ ] `TruckDetailPage.tsx` — 6-col measurement table (`#, N° log, L (m), Ø/Circ, m³, CFT`)
- [ ] `PackingList.tsx` — display table
- [ ] `ContainersSection.tsx` — table inside the expandable card

Ship this first: it makes every page *usable* on a phone even before the entry forms are redesigned.

## Phase 2 — Live-entry components on phones (~1 day, the core of the work)

Files: `TallyEntry.tsx`, `EmpotageEntry.tsx`, `SawnEntry.tsx`, `PackingList.tsx` (entry part).

Constraint: these are used for rapid live entry on tablets (keyboard chaining, auto-focus). Do not slow that flow down.

Strategy — responsive grid, same DOM:
- Keep the current fixed one-row grid from `sm:` up: `sm:grid-cols-[2rem_1fr_1fr_1fr_1fr_4.5rem_5rem_2rem]`.
- Below `sm:`, reflow each entry row into a 2-row compact card:
  - `grid-cols-[2rem_1fr_1fr_1fr] gap-1` — row 1: index + the 3 dimension fields; row 2: count/size/volume + delete button (`col-span` as needed).
  - Labels: on phones show a tiny label above each input (`<label className="sm:hidden text-xs">`) since column headers disappear when rows wrap.
- Keep auto-focus / Enter-chaining logic untouched — it is DOM-order based, and DOM order does not change.

Alternative if the 2-row card feels cramped in testing: wrap the whole entry grid in `overflow-x-auto` with `min-w-[640px]` (one-line fix, keeps single-row layout, costs sideways scrolling during entry). Decide after testing Strategy A on a real phone.

Per-file tasks:
- [ ] `TallyEntry.tsx` — responsive reflow (6 cols → 2-row card below `sm`)
- [ ] `EmpotageEntry.tsx` — responsive reflow (8 cols) + `text-sm` → `text-base`, `py-1.5` → `py-2.5`
- [ ] `SawnEntry.tsx` — responsive reflow (8 cols, same layout as EmpotageEntry — extract a shared row component if the markup is near-identical)
- [ ] `PackingList.tsx` entry grid — responsive reflow (7 cols) + `text-sm` → `text-base`
- [ ] All four: add `inputMode="decimal"`/`"numeric"` to numeric inputs

## Phase 3 — High-priority page fixes (~2h)

- [ ] `StockPage.tsx` — stats grid: `grid-cols-2 sm:grid-cols-4`
- [ ] `QuotaGauge.tsx` — `gap-x-5` → `gap-x-3 sm:gap-x-5`, add `flex-wrap` if not present
- [ ] Sweep all pages for buttons/links smaller than 44px touch target on mobile (quick grep for `py-1`/`p-1` on interactive elements)

## Phase 4 — Global polish (~half day)

- [ ] **Sticky table headers** on long measurement tables (`thead` → `sticky top-0 bg-...`) — ProductionRunPage, TruckDetailPage benefit most during long entry sessions.
- [ ] **Safe-area insets** for the mobile bottom tab bar in `Layout.tsx`: `pb-[env(safe-area-inset-bottom)]` (phones with gesture bars), and matching bottom padding on page content so the tab bar never covers the last row / submit button.
- [ ] **Modals/dialogs** (if any found during implementation): `max-w-lg w-full mx-4 max-h-[85dvh] overflow-y-auto`.
- [ ] **`100dvh` instead of `100vh`** anywhere full-height is used (mobile browser URL-bar problem).
- [ ] **RapportPage `<pre>`** — already scrolls; consider `text-xs sm:text-sm` so more report fits per line on phones.
- [ ] **Print styles** for TruckBordereau / PackingList unaffected — verify `@media print` unchanged after edits.

## Phase 5 — Verification (~2h)

Test matrix — per page, at 360px (small phone), 390px (iPhone), 768px (tablet portrait), 1024px+ (desktop):

| Check | How |
|---|---|
| No horizontal page scroll | DevTools responsive mode, scroll every page |
| Tables scroll inside their container | drag sideways on table |
| Entry flow: add 10 rows fast | real tablet + real phone via `vite --host` (host:true already set, port 3001) |
| iOS: no zoom on input focus | real iPhone or Safari simulator |
| Bottom nav doesn't cover content/submit | every page scrolled to bottom |
| Numeric keyboard opens on measurement fields | real device |

- [ ] Run `pnpm typecheck` after each phase.
- [ ] Final pass: `pnpm --filter @ste/web build` to confirm production build.

## Order & estimate

| Phase | Effort | Value |
|---|---|---|
| 1 — Table wrappers | ~1h | Unblocks phone use everywhere |
| 2 — Entry components | ~1 day | Core feature parity on phones |
| 3 — Page fixes | ~2h | Polish on Stock/Quota |
| 4 — Global polish | ~half day | Native-feel details |
| 5 — Verification | ~2h | Confidence |

Total: roughly 2–2.5 days of focused work. Phases 1 and 3 are safe to do immediately; Phase 2 needs a real-device check before locking in the reflow strategy.
