import { useState } from "react";
import {
  billParent,
  classifySize,
  sawnLongShortM3,
  sawnThicknessBands,
  sawnVolumeM3,
  SIZE_GROUP_LABELS,
  type LogDTO,
  type ProductionRunCreateInput,
  type SizeGroup,
  type TruckDTO,
} from "@ste/shared";
import { fmtNum, fmtPct } from "../lib/format";

// Cubage des billons (girth) d'un camion — dénominateur du rendement.
function truckGirthM3(t: TruckDTO): number {
  return t.measurements
    .filter((m) => m.context === "YARD_GIRTH")
    .reduce((s, m) => s + m.logs.reduce((x, l) => x + Number(l.volumeM3), 0), 0);
}

// Billons d'un camion — c'est le billon qui part au sciage, pas la bille.
function truckBillons(t: TruckDTO) {
  return t.measurements
    .filter((m) => m.context === "YARD_GIRTH")
    .flatMap((m) => m.logs);
}

// Billons regroupés par bille mère (266A/266B/266C sous « 266 ») — même lecture
// qu'au billonnage, indispensable dès qu'un camion en compte 275.
function billonsByBill(logs: LogDTO[]) {
  const groups = new Map<string, LogDTO[]>();
  for (const l of logs) {
    const key = billParent(l.externalId) ?? "?";
    const g = groups.get(key);
    if (g) g.push(l);
    else groups.set(key, [l]);
  }
  return [...groups.entries()].map(([bill, billons]) => ({ bill, billons }));
}

type RowState = { lengthFt: string; widthIn: string; thicknessIn: string; count: string };

const emptyRow = (): RowState => ({ lengthFt: "", widthIn: "", thicknessIn: "", count: "" });

function rowInfo(r: RowState) {
  const L = Number(r.lengthFt);
  const w = Number(r.widthIn);
  const t = Number(r.thicknessIn);
  const n = Number(r.count);
  if (!r.lengthFt || !r.widthIn || !r.thicknessIn || !r.count) return null;
  if (!(L > 0) || !(w > 0) || !(t > 0) || !Number.isInteger(n) || n < 1) return null;
  return { volume: sawnVolumeM3(L, w, t, n), size: classifySize(w, t), count: n };
}

const GROUP_BADGE: Record<SizeGroup, string> = {
  MAIN: "bg-sky-50 text-sky-700",
  SIDE: "bg-amber-50 text-amber-700",
  ONE_INCH: "bg-violet-50 text-violet-700",
  OTHER: "bg-slate-100 text-slate-500",
};

type Props = {
  onSave: (data: Omit<ProductionRunCreateInput, "contractId">) => void;
  saving: boolean;
  trucks?: TruckDTO[]; // camions du contrat (pour lier les camions sciés)
};

export default function SawnEntry({ onSave, saving, trucks }: Props) {
  const [rows, setRows] = useState<RowState[]>([emptyRow()]);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [truckIds, setTruckIds] = useState<string[]>([]);
  const [logIds, setLogIds] = useState<string[]>([]); // billons sciés (girth)

  function toggleTruck(id: string) {
    setTruckIds((p) => {
      const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
      // Camion décoché → retirer ses billons de la sélection.
      if (!next.includes(id)) {
        const t = trucks?.find((x) => x.id === id);
        if (t) {
          const ids = new Set(truckBillons(t).map((l) => l.id));
          setLogIds((sel) => sel.filter((x) => !ids.has(x)));
        }
      }
      return next;
    });
  }

  function toggleLog(id: string) {
    setLogIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const infos = rows.map(rowInfo);
  const valid = infos.filter((x) => x !== null);
  const total = valid.reduce((s, x) => s + x!.volume, 0);
  const pieces = valid.reduce((s, x) => s + x!.count, 0);
  const groups: Record<SizeGroup, number> = { MAIN: 0, SIDE: 0, ONE_INCH: 0, OTHER: 0 };
  for (const x of valid) groups[x!.size.group] += x!.volume;

  // Splits + rendement live (dénominateur = girth des camions sélectionnés).
  const splitLines = rows
    .map((r, i) => (infos[i] ? { lengthFt: r.lengthFt, thicknessIn: r.thicknessIn, volumeM3: infos[i]!.volume } : null))
    .filter((x): x is { lengthFt: string; thicknessIn: string; volumeM3: number } => x !== null);
  const { longM3, shortM3 } = sawnLongShortM3(splitLines);
  const bands = sawnThicknessBands(splitLines);
  // Dénominateur du rendement : billons sélectionnés si précisés, sinon tous
  // les billons des camions cochés.
  const selectedTrucks = (trucks ?? []).filter((t) => truckIds.includes(t.id));
  const selectedBillonsM3 = selectedTrucks.reduce(
    (s, t) =>
      s +
      truckBillons(t)
        .filter((l) => logIds.includes(l.id))
        .reduce((x, l) => x + Number(l.volumeM3), 0),
    0
  );
  const girthSel =
    logIds.length > 0
      ? selectedBillonsM3
      : selectedTrucks.reduce((s, t) => s + truckGirthM3(t), 0);
  const rendement = girthSel > 0 ? (total / girthSel) * 100 : null;

  function setRow(i: number, patch: Partial<RowState>) {
    setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function save() {
    const lines = rows
      .filter((_, i) => infos[i] !== null)
      .map((r) => ({
        lengthFt: r.lengthFt.trim(),
        widthIn: r.widthIn.trim(),
        thicknessIn: r.thicknessIn.trim(),
        count: Number(r.count),
      }));
    if (lines.length === 0) return;
    onSave({
      lines,
      producedAt: date ? new Date(date) : undefined,
      note: note.trim() || undefined,
      truckIds: truckIds.length > 0 ? truckIds : undefined,
      logIds: logIds.length > 0 ? logIds : undefined,
    });
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Note</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="DEBITE TECK…"
            className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
          />
        </label>
      </div>

      {trucks && trucks.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs text-slate-500">
            Camions sciés (optionnel — définit « sur parc non sciés »)
          </div>
          <div className="flex flex-wrap gap-2">
            {trucks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTruck(t.id)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  truckIds.includes(t.id)
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 text-slate-600"
                }`}
              >
                {t.registration}
                {t.sawn ? " ✓" : ""}
              </button>
            ))}
          </div>

          {/* Billons sciés du/des camion(s) coché(s) — vide = camion entier.
              Groupés par bille mère : c'est le billon qui passe à la scie. */}
          {selectedTrucks.map((t) => {
            const billons = truckBillons(t);
            if (billons.length === 0) return null;
            const selCount = billons.filter((l) => logIds.includes(l.id)).length;
            const allSelected = selCount === billons.length;
            const groups = billonsByBill(billons);
            return (
              <div key={t.id} className="mt-2 rounded-lg bg-slate-50 p-2">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Billons sciés de {t.registration} — {selCount === 0
                      ? "aucun coché = camion entier"
                      : `${selCount}/${billons.length}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setLogIds((p) => {
                        const ids = billons.map((l) => l.id);
                        return allSelected
                          ? p.filter((x) => !ids.includes(x))
                          : [...new Set([...p, ...ids])];
                      })
                    }
                    className="text-slate-500 underline hover:text-slate-900"
                  >
                    {allSelected ? "Tout décocher" : "Tout cocher"}
                  </button>
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {groups.map((g) => {
                    const ids = g.billons.map((l) => l.id);
                    const selOfBill = ids.filter((id) => logIds.includes(id)).length;
                    const allOfBill = selOfBill === ids.length;
                    return (
                      <div key={g.bill} className="flex flex-wrap items-center gap-1">
                        {/* Cliquer la bille coche/décoche tous ses billons. */}
                        <button
                          type="button"
                          onClick={() =>
                            setLogIds((p) =>
                              allOfBill
                                ? p.filter((x) => !ids.includes(x))
                                : [...new Set([...p, ...ids])]
                            )
                          }
                          className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-left text-[11px] font-medium tabular-nums ${
                            selOfBill > 0 ? "text-emerald-700" : "text-slate-500"
                          }`}
                        >
                          {g.bill}
                          <span className="ml-0.5 text-slate-400">·{ids.length}</span>
                        </button>
                        {g.billons.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => toggleLog(l.id)}
                            title={`${l.externalId ?? `#${l.position}`} — ${Number(l.volumeM3).toFixed(4)} m³`}
                            className={`rounded-full px-2 py-0.5 text-[11px] ${
                              logIds.includes(l.id)
                                ? "bg-emerald-600 text-white"
                                : "bg-white text-slate-600 ring-1 ring-slate-200"
                            }`}
                          >
                            {/* Suffixe seul (A, B, C…) : la bille est déjà en tête de ligne. */}
                            {l.externalId?.slice(g.bill.length) || l.externalId || `#${l.position}`}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto">
      <div className="min-w-[620px]">
      <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_4.5rem_5rem_2rem] items-center gap-1 text-xs text-slate-500">
        <span>#</span>
        <span>L (ft)</span>
        <span>l (in)</span>
        <span>ép (in)</span>
        <span>Nbr</span>
        <span>Taille</span>
        <span className="text-right">m³</span>
        <span />
      </div>

      {rows.map((r, i) => {
        const info = infos[i];
        return (
          <div
            key={i}
            className="mt-1 grid grid-cols-[2rem_1fr_1fr_1fr_1fr_4.5rem_5rem_2rem] items-center gap-1"
          >
            <span className="text-xs text-slate-400">{i + 1}</span>
            {(["lengthFt", "widthIn", "thicknessIn", "count"] as const).map((k) => (
              <input
                key={k}
                inputMode="decimal"
                value={r[k]}
                onChange={(e) => setRow(i, { [k]: e.target.value })}
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
                className="w-full min-w-0 rounded border border-slate-200 px-2 py-2.5 text-base outline-none focus:border-slate-900"
              />
            ))}
            <span
              className={`rounded-full px-1.5 py-0.5 text-center text-xs ${
                info ? GROUP_BADGE[info.size.group] : "text-slate-300"
              }`}
            >
              {info ? info.size.code : "—"}
            </span>
            <span className="text-right text-sm tabular-nums text-slate-700">
              {info ? info.volume.toFixed(3) : "—"}
            </span>
            <button
              type="button"
              onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
              className="text-slate-300 hover:text-red-500"
              aria-label="Supprimer la ligne"
            >
              ×
            </button>
          </div>
        );
      })}
      </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setRows((p) => [...p, emptyRow()])}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-slate-900"
        >
          + Ligne
        </button>
        <div className="text-sm">
          <span className="text-slate-500">
            {fmtNum(pieces)} pièces ·{" "}
          </span>
          <span className="font-semibold text-slate-900">{fmtNum(total.toFixed(6))} m³</span>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(groups) as SizeGroup[])
              .filter((g) => groups[g] > 0)
              .map((g) => (
                <span key={g} className={`rounded-full px-2 py-0.5 text-xs ${GROUP_BADGE[g]}`}>
                  {SIZE_GROUP_LABELS[g]} {fmtNum(groups[g].toFixed(3))} m³
                </span>
              ))}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">
              Long ≥6,5ft {fmtNum(longM3.toFixed(3))} ({fmtPct((longM3 / total) * 100, 0)}) · court{" "}
              {fmtNum(shortM3.toFixed(3))}
            </span>
            {bands
              .filter((b) => b.m3 > 0)
              .map((b) => (
                <span key={b.key} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                  {b.label} {fmtNum(b.m3.toFixed(3))}
                </span>
              ))}
          </div>
          {rendement !== null && (
            <div className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">
              Rendement live : <strong>{fmtPct(rendement)}</strong>{" "}
              <span className="text-xs text-emerald-600">
                ({fmtNum(total.toFixed(3))} débité ÷ {fmtNum(girthSel.toFixed(3))} m³ de billons{" "}
                {logIds.length > 0
                  ? `(${logIds.length} billon${logIds.length > 1 ? "s" : ""} sélectionné${logIds.length > 1 ? "s" : ""})`
                  : "(camions entiers)"})
              </span>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving || valid.length === 0}
        className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {saving ? "Enregistrement…" : `Valider la session (${valid.length} lignes)`}
      </button>
    </div>
  );
}
