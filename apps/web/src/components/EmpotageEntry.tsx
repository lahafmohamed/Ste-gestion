import { useState } from "react";
import { classifySize, sawnVolumeM3 } from "@ste/shared";
import { fmtNum, normalizeDecimal } from "../lib/format";
import Badge, { SIZE_GROUP_TONE } from "./ui/Badge";
import Button from "./ui/Button";
import { inputQuietCls } from "./ui/Input";
import { useOnline } from "../lib/online";
import { IconX, IconPlus } from "./icons";

type RowState = { lengthFt: string; widthIn: string; thicknessIn: string; count: string };
const emptyRow = (): RowState => ({ lengthFt: "", widthIn: "", thicknessIn: "", count: "" });

// Mini-libellés des cartes téléphone (< sm) — l'en-tête de colonnes disparaît.
const COL_LABELS = {
  lengthFt: "L (ft)",
  widthIn: "l (in)",
  thicknessIn: "ép (in)",
  count: "Nbr",
} as const;

function rowInfo(r: RowState) {
  const L = Number(r.lengthFt);
  const w = Number(r.widthIn);
  const t = Number(r.thicknessIn);
  const n = Number(r.count);
  if (!r.lengthFt || !r.widthIn || !r.thicknessIn || !r.count) return null;
  if (!(L > 0) || !(w > 0) || !(t > 0) || !Number.isInteger(n) || n < 1) return null;
  return { volume: sawnVolumeM3(L, w, t, n), size: classifySize(w, t), count: n };
}

type Item = { lengthFt: string; widthIn: string; thicknessIn: string; count: number };

export default function EmpotageEntry({
  onSave,
  saving,
}: {
  onSave: (items: Item[]) => void;
  saving: boolean;
}) {
  const online = useOnline();
  const [rows, setRows] = useState<RowState[]>([emptyRow()]);
  const infos = rows.map(rowInfo);
  const valid = infos.filter((x) => x !== null);
  const total = valid.reduce((s, x) => s + x!.volume, 0);
  const pieces = valid.reduce((s, x) => s + x!.count, 0);

  function setRow(i: number, patch: Partial<RowState>) {
    setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function save() {
    const items = rows
      .filter((_, i) => infos[i] !== null)
      .map((r) => ({
        lengthFt: r.lengthFt.trim(),
        widthIn: r.widthIn.trim(),
        thicknessIn: r.thicknessIn.trim(),
        count: Number(r.count),
      }));
    if (items.length > 0) onSave(items);
  }

  return (
    <div>
      {/* min-w 620 : défilement horizontal jusqu'à md, en-tête collant au-delà. */}
      <div className="overflow-x-auto md:overflow-visible">
      <div className="sm:min-w-[620px]">
      <div className="hidden items-center gap-1 text-xs text-brand-500 sm:grid sm:grid-cols-[2rem_1fr_1fr_1fr_1fr_4.5rem_5rem_2.75rem] md:sticky md:top-header md:z-10 md:rounded-lg md:bg-white md:py-1">
        <span>#</span>
        <span>L (ft)</span>
        <span>l (in)</span>
        <span>ép (in)</span>
        <span>Nbr</span>
        <span>Taille</span>
        <span className="text-right">m³</span>
        <span />
      </div>

      {/* Téléphone (< sm) : carte 2 rangées — # + L/l/ép, puis Nbr/Taille/m³/×.
          Même ordre DOM, l'Entrée-chaînage sur Nbr ne change pas. */}
      {rows.map((r, i) => {
        const info = infos[i];
        return (
          <div
            key={i}
            className="mt-1 grid grid-cols-[2rem_1fr_1fr_1fr_2.75rem] items-center gap-1 border-b border-brand-100 pb-2 sm:grid-cols-[2rem_1fr_1fr_1fr_1fr_4.5rem_5rem_2.75rem] sm:border-b-0 sm:pb-0"
          >
            <span className="text-xs text-brand-500">{i + 1}</span>
            {(["lengthFt", "widthIn", "thicknessIn", "count"] as const).map((k) => (
              <div
                key={k}
                className={`min-w-0${k === "count" ? " col-start-2 sm:col-auto" : ""}`}
              >
                <span aria-hidden="true" className="mb-0.5 block text-xs text-brand-500 sm:hidden">
                  {COL_LABELS[k]}
                </span>
                <input
                  inputMode="decimal"
                  value={r[k]}
                  aria-label={`${COL_LABELS[k]} ligne ${i + 1}`}
                  // Clavier FR : « 6,5 » doit partir en « 6.5 », sinon l'API rejette la ligne.
                  onChange={(e) => setRow(i, { [k]: normalizeDecimal(e.target.value) })}
                  onKeyDown={
                    k === "count"
                      ? (e) => {
                          if (e.key === "Enter" && i === rows.length - 1) {
                            e.preventDefault();
                            setRows((p) => [...p, emptyRow()]);
                          }
                        }
                      : undefined
                  }
                  className={inputQuietCls}
                />
              </div>
            ))}
            {info ? (
              <Badge tone={SIZE_GROUP_TONE[info.size.group]} className="justify-self-center">
                {info.size.code}
              </Badge>
            ) : (
              <span className="text-center text-xs text-brand-300">—</span>
            )}
            <span className="text-right text-base tabular-nums text-brand-700">
              <span className="mr-1 text-xs text-brand-500 sm:hidden">m³</span>
              {info ? info.volume.toFixed(3) : "—"}
            </span>
            <button
              type="button"
              onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
              className="flex min-h-touch w-full items-center justify-center rounded-lg text-brand-500 transition-colors hover:bg-red-50 hover:text-red-600 active:bg-red-100"
              aria-label="Supprimer la ligne"
            >
              <IconX width={18} height={18} />
            </button>
          </div>
        );
      })}
      </div>
      </div>

      {/* Récap sticky : + Ligne, total et validation restent sous le pouce
          même quand la saisie fait défiler la page. */}
      <div className="sticky bottom-0 z-10 mt-3 rounded-xl bg-white/95 p-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] shadow-[0_0_0_1px_oklch(0_0_0/0.06),0_-8px_24px_-12px_oklch(0_0_0/0.25)] backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="xs" onClick={() => setRows((p) => [...p, emptyRow()])}>
            <IconPlus width={16} height={16} className="-ml-0.5" />
            Ligne
          </Button>
          <div className="text-sm">
            <span className="text-brand-500">{fmtNum(pieces)} pièces · </span>
            <span className="font-semibold text-brand-900">{fmtNum(total.toFixed(6))} m³</span>
          </div>
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={save}
          disabled={saving || valid.length === 0}
          className="mt-2 w-full"
        >
          {saving
            ? online
              ? "Enregistrement…"
              : "En attente du réseau…"
            : `Ajouter ${valid.length} ligne${valid.length > 1 ? "s" : ""}`}
        </Button>
        {saving && !online && (
          <p className="mt-2 text-center text-sm text-amber-800">
            Réseau coupé — l'envoi partira au retour. Garder cette page ouverte.
          </p>
        )}
      </div>
    </div>
  );
}
