import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SIZE_GROUP_LABELS, type SawnInventoryRowDTO, type SizeGroup } from "@ste/shared";
import { stockApi } from "../lib/api";
import { fmtNum } from "../lib/format";
import EmpotageEntry from "./EmpotageEntry";
import Badge, { SIZE_GROUP_TONE } from "./ui/Badge";
import Button from "./ui/Button";
import Chip from "./ui/Chip";
import { EmptyState, QueryError, Notice } from "./ui/Feedback";
import { SearchInput } from "./ui/Input";
import { SkeletonList } from "./ui/Skeleton";
import { IconArrowLeft } from "./icons";

type Item = { lengthFt: string; widthIn: string; thicknessIn: string; count: number };

const GROUPS: SizeGroup[] = ["MAIN", "SIDE", "ONE_INCH", "OTHER"];

// Pas d'incrément : on empote par paquets, pas pièce par pièce.
const STEPS = [1, 5, 10];

function dimsLabel(r: SawnInventoryRowDTO) {
  return `${fmtNum(r.lengthFt)}×${fmtNum(r.widthIn)}×${fmtNum(r.thicknessIn)}`;
}

/**
 * Panier d'empotage : le stock d'avivés disponible, dimension par dimension.
 * On prend les tailles voulues dans la liste au lieu de retaper L/l/ép — la
 * saisie manuelle reste accessible pour le bois hors stock.
 */
export default function EmpotagePicker({
  onSave,
  saving,
}: {
  onSave: (items: Item[]) => void;
  saving: boolean;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<SizeGroup | null>(null);
  const [manual, setManual] = useState(false);
  // Le stock épuisé encombre la liste ; on le garde accessible pour vérifier.
  const [showEmpty, setShowEmpty] = useState(false);

  // Panier d'empotage : le stock général, tous contrats confondus.
  const inv = useQuery({
    queryKey: ["stock", "inventory"],
    queryFn: () => stockApi.sawnInventory(),
  });

  const rows = useMemo(() => {
    const all = inv.data ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (!showEmpty && r.availableCount <= 0 && !cart[r.key]) return false;
      if (group && r.sizeGroup !== group) return false;
      if (!q) return true;
      return `${dimsLabel(r)} ${r.sizeCode}`.toLowerCase().includes(q);
    });
  }, [inv.data, search, group, showEmpty, cart]);

  const byKey = useMemo(
    () => new Map((inv.data ?? []).map((r) => [r.key, r])),
    [inv.data]
  );

  const picked = Object.entries(cart).filter(([, n]) => n > 0);
  const pieces = picked.reduce((s, [, n]) => s + n, 0);
  const totalM3 = picked.reduce(
    (s, [k, n]) => s + Number(byKey.get(k)?.unitM3 ?? 0) * n,
    0
  );
  // Empoter plus que le stock met la taille en négatif : on prévient, sans bloquer
  // (le stock terrain peut être en avance sur la saisie).
  const over = picked.filter(([k, n]) => n > (byKey.get(k)?.availableCount ?? 0));

  function bump(r: SawnInventoryRowDTO, delta: number) {
    setCart((p) => {
      const next = Math.max((p[r.key] ?? 0) + delta, 0);
      return { ...p, [r.key]: next };
    });
  }

  function setQty(key: string, raw: string) {
    const n = Math.max(Math.floor(Number(raw.replace(/\D/g, "")) || 0), 0);
    setCart((p) => ({ ...p, [key]: n }));
  }

  function save() {
    const items: Item[] = picked.map(([k, n]) => {
      const r = byKey.get(k)!;
      return {
        lengthFt: r.lengthFt,
        widthIn: r.widthIn,
        thicknessIn: r.thicknessIn,
        count: n,
      };
    });
    if (items.length > 0) onSave(items);
  }

  if (manual) {
    return (
      <div>
        <div className="mb-2 flex justify-end">
          <Button size="xs" onClick={() => setManual(false)}>
            <IconArrowLeft width={16} height={16} className="-ml-0.5" />
            Choisir dans le stock
          </Button>
        </div>
        <EmpotageEntry saving={saving} onSave={onSave} />
      </div>
    );
  }

  if (inv.isLoading) return <SkeletonList count={3} />;
  if (inv.isError) {
    return (
      <QueryError error={inv.error} onRetry={() => inv.refetch()}>
        Impossible de charger le stock d'avivés
      </QueryError>
    );
  }

  return (
    <div className="rounded-xl bg-white shadow-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="min-w-[10rem] flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Chercher une taille (6×3, 5X3…)"
          />
        </div>
        <Button size="xs" onClick={() => setManual(true)}>
          Saisie manuelle
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Chip selected={group === null} onClick={() => setGroup(null)}>
          Toutes
        </Chip>
        {GROUPS.map((g) => (
          <Chip key={g} selected={group === g} onClick={() => setGroup(g)}>
            {SIZE_GROUP_LABELS[g]}
          </Chip>
        ))}
        <Chip selected={showEmpty} onClick={() => setShowEmpty((s) => !s)}>
          Stock épuisé
        </Chip>
      </div>

      {rows.length === 0 ? (
        <EmptyState>
          {(inv.data ?? []).length === 0
            ? "Aucun avivé débité sur ce contrat."
            : "Aucune taille ne correspond."}
        </EmptyState>
      ) : (
        <div className="divide-y divide-brand-100">
          {rows.map((r) => {
            const qty = cart[r.key] ?? 0;
            const rest = r.availableCount - qty;
            return (
              <div
                key={r.key}
                className="flex flex-wrap items-center gap-2 py-2 sm:flex-nowrap"
              >
                <div className="min-w-[8rem] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium tabular-nums text-brand-900">
                      {dimsLabel(r)}
                    </span>
                    <Badge tone={SIZE_GROUP_TONE[r.sizeGroup]}>{r.sizeCode}</Badge>
                  </div>
                  <div className="text-sm text-brand-500">
                    <span className={rest < 0 ? "text-red-600" : undefined}>
                      {fmtNum(rest)} dispo
                    </span>
                    {" · "}
                    {fmtNum(r.unitM3)} m³/pièce
                    {r.packedCount > 0 && ` · ${fmtNum(r.packedCount)} déjà empotés`}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {STEPS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => bump(r, s)}
                      className="min-h-touch rounded-lg border border-brand-200 px-2.5 text-sm text-brand-600 hover:border-brand-900 active:bg-brand-100"
                    >
                      +{s}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setQty(r.key, String(Math.max(r.availableCount, 0)))}
                    disabled={r.availableCount <= 0}
                    className="min-h-touch rounded-lg border border-brand-200 px-2.5 text-sm text-brand-600 hover:border-brand-900 active:bg-brand-100 disabled:opacity-40"
                  >
                    Tout
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => bump(r, -1)}
                    disabled={qty === 0}
                    aria-label="Retirer une pièce"
                    className="min-h-touch w-11 rounded-lg border border-brand-200 text-lg text-brand-600 hover:border-brand-900 active:bg-brand-100 disabled:opacity-40"
                  >
                    −
                  </button>
                  <input
                    inputMode="numeric"
                    value={qty || ""}
                    placeholder="0"
                    onChange={(e) => setQty(r.key, e.target.value)}
                    aria-label={`Nombre de pièces ${dimsLabel(r)}`}
                    className="min-h-touch w-16 rounded-lg bg-white shadow-card text-center text-base tabular-nums text-brand-900 outline-none transition-[border-color,box-shadow] focus:border-accent-500 focus:ring-[3px] focus:ring-accent-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => bump(r, 1)}
                    aria-label="Ajouter une pièce"
                    className="min-h-touch w-11 rounded-lg border border-brand-200 text-lg text-brand-600 hover:border-brand-900 active:bg-brand-100"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Récap sticky : total + bouton visibles pendant qu'on remplit le panier
          (la liste des tailles est longue, valider ne doit pas coûter un scroll). */}
      <div className="sticky bottom-0 z-10 -mx-3 -mb-3 mt-3 rounded-b-xl border-t border-brand-200 bg-white px-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-3">
        {over.length > 0 && (
          <Notice tone="warn" className="mb-2">
            {over.length} taille(s) demandée(s) au-delà du stock — le stock passera en
            négatif.
          </Notice>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            <span className="text-brand-500">
              {picked.length} taille(s) · {fmtNum(pieces)} pièces ·{" "}
            </span>
            <span className="font-semibold text-brand-900">
              {fmtNum(totalM3.toFixed(6))} m³
            </span>
          </div>
          {picked.length > 0 && (
            <Button size="xs" onClick={() => setCart({})}>
              Vider le panier
            </Button>
          )}
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={save}
          disabled={saving || picked.length === 0}
          className="mt-3 w-full"
        >
          {saving ? "Enregistrement…" : `Empoter ${fmtNum(pieces)} pièce(s)`}
        </Button>
      </div>
    </div>
  );
}
