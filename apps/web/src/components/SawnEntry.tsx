import { useState } from "react";
import {
  billParent,
  classifySize,
  sawnLongShortM3,
  sawnThicknessBands,
  sawnVolumeM3,
  SIZE_GROUP_LABELS,
  truckSawnProgress,
  type LogDTO,
  type ProductionRunCreateInput,
  type ProductionRunDTO,
  type SizeGroup,
  type TruckDTO,
} from "@ste/shared";
import { fmtNum, fmtPct, normalizeDecimal, todayISO } from "../lib/format";
import Badge, { SIZE_GROUP_TONE } from "./ui/Badge";
import Button from "./ui/Button";
import Chip from "./ui/Chip";
import Input, { Field, inputQuietCls } from "./ui/Input";

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

// Une ligne = une pièce sciée mesurée au parc. Pas de quantité : le scieur
// mesure planche par planche, le comptage se fait en relisant les lignes.
type RowState = { lengthFt: string; widthIn: string; thicknessIn: string };

const emptyRow = (): RowState => ({ lengthFt: "", widthIn: "", thicknessIn: "" });

// Mini-libellés des cartes téléphone (< sm) — l'en-tête de colonnes disparaît.
const COL_LABELS = {
  lengthFt: "L (ft)",
  widthIn: "l (in)",
  thicknessIn: "ép (in)",
} as const;

function rowInfo(r: RowState) {
  const L = Number(r.lengthFt);
  const w = Number(r.widthIn);
  const t = Number(r.thicknessIn);
  if (!r.lengthFt || !r.widthIn || !r.thicknessIn) return null;
  if (!(L > 0) || !(w > 0) || !(t > 0)) return null;
  return { volume: sawnVolumeM3(L, w, t, 1), size: classifySize(w, t) };
}

type Props = {
  onSave: (data: Omit<ProductionRunCreateInput, "contractId">) => void;
  saving: boolean;
  trucks?: TruckDTO[]; // camions du contrat (pour lier les camions sciés)
  runs?: ProductionRunDTO[]; // sessions existantes → billons déjà sciés
};

export default function SawnEntry({ onSave, saving, trucks, runs }: Props) {
  const [rows, setRows] = useState<RowState[]>([emptyRow()]);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [truckIds, setTruckIds] = useState<string[]>([]);
  const [logIds, setLogIds] = useState<string[]>([]); // billons sciés (girth)

  // Avancement existant par camion (sessions déjà enregistrées) : sert à
  // marquer les billons déjà sciés et l'état des camions dans les chips.
  const progressByTruck = new Map(
    (trucks ?? []).map((t) => [t.id, truckSawnProgress(t, runs ?? [])])
  );
  // Billon déjà passé à la scie = pas dans « remaining » de son camion.
  const alreadySawnIds = new Set(
    (trucks ?? []).flatMap((t) => {
      const p = progressByTruck.get(t.id)!;
      if (p.sawn === 0) return [];
      const rem = new Set(p.remaining.map((l) => l.id));
      return truckBillons(t)
        .map((l) => l.id)
        .filter((id) => !rem.has(id));
    })
  );

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
  const pieces = valid.length;
  const groups: Record<SizeGroup, number> = { MAIN: 0, SIDE: 0, ONE_INCH: 0, OTHER: 0 };
  for (const x of valid) groups[x!.size.group] += x!.volume;

  // Récap de fin de session : combien de pièces et combien de m³ sont rentrés
  // dans chaque taille (6x4, 4x3, 7"+…) — la relecture que fait le scieur.
  const bySizeMap = new Map<string, { code: string; group: SizeGroup; pieces: number; m3: number }>();
  for (const x of valid) {
    const e = bySizeMap.get(x!.size.code);
    if (e) {
      e.pieces += 1;
      e.m3 += x!.volume;
    } else {
      bySizeMap.set(x!.size.code, { code: x!.size.code, group: x!.size.group, pieces: 1, m3: x!.volume });
    }
  }
  const bySize = [...bySizeMap.values()].sort((a, b) => b.m3 - a.m3);

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
        count: 1, // 1 ligne = 1 pièce
      }));
    if (lines.length === 0) return;
    onSave({
      lines,
      // Midi local : la date seule ne doit pas glisser d'un jour en UTC.
      producedAt: date ? new Date(`${date}T12:00:00`) : undefined,
      note: note.trim() || undefined,
      truckIds: truckIds.length > 0 ? truckIds : undefined,
      logIds: logIds.length > 0 ? logIds : undefined,
    });
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input
            type="date"
            value={date}
            // Une session de sciage n'a pas lieu dans le futur — évite le 2026 → 2062.
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Note">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="DEBITE TECK…"
          />
        </Field>
      </div>

      {trucks && trucks.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs text-brand-500">
            Camions sciés (optionnel — définit « sur parc non sciés »)
          </div>
          <div className="flex flex-wrap gap-2">
            {trucks.map((t) => {
              const p = progressByTruck.get(t.id)!;
              const sel = truckIds.includes(t.id);
              return (
                <Chip
                  key={t.id}
                  selected={sel}
                  onClick={() => toggleTruck(t.id)}
                  title={
                    p.total > 0
                      ? `${p.sawn}/${p.total} billons sciés`
                      : "Pas d'étalage billons (girth)"
                  }
                >
                  {t.registration}
                  {p.complete ? (
                    <span className={`ml-1 ${sel ? "text-parc-300" : "text-parc-700"}`}>
                      ✓ fini
                    </span>
                  ) : p.sawn > 0 ? (
                    <span
                      className={`ml-1 tabular-nums ${sel ? "text-amber-300" : "text-amber-600"}`}
                    >
                      {p.sawn}/{p.total}
                    </span>
                  ) : null}
                </Chip>
              );
            })}
          </div>

          {/* Billons sciés du/des camion(s) coché(s) — vide = camion entier.
              Groupés par bille mère : c'est le billon qui passe à la scie. */}
          {selectedTrucks.map((t) => {
            const billons = truckBillons(t);
            if (billons.length === 0) return null;
            const selCount = billons.filter((l) => logIds.includes(l.id)).length;
            const allSelected = selCount === billons.length;
            const groups = billonsByBill(billons);
            const p = progressByTruck.get(t.id)!;
            return (
              <div key={t.id} className="mt-2 rounded-lg bg-brand-50 p-2">
                <div className="mb-1 flex items-center justify-between text-xs text-brand-500">
                  <span>
                    Billons sciés de {t.registration} — {selCount === 0
                      ? "aucun coché = camion entier"
                      : `${selCount}/${billons.length}`}
                    {p.sawn > 0 && (
                      <span className="ml-1.5 text-parc-700">
                        · {p.complete ? "tout déjà scié" : `${p.sawn} déjà scié${p.sawn > 1 ? "s" : ""} ✓`}
                      </span>
                    )}
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
                    className="-my-2 min-h-touch rounded-lg px-2 text-brand-500 underline hover:text-brand-900 active:bg-brand-200"
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
                          className={`min-h-touch w-14 shrink-0 rounded px-1.5 py-0.5 text-left text-sm font-medium tabular-nums active:bg-brand-200 ${
                            selOfBill > 0 ? "text-parc-700" : "text-brand-500"
                          }`}
                        >
                          {g.bill}
                          <span className="ml-0.5 text-brand-400">·{ids.length}</span>
                        </button>
                        {g.billons.map((l) => {
                          const done = alreadySawnIds.has(l.id);
                          const sel = logIds.includes(l.id);
                          return (
                            <Chip
                              key={l.id}
                              selected={sel}
                              onClick={() => toggleLog(l.id)}
                              // Déjà scié : chip verte + ✓ — recochable (resciage),
                              // mais impossible de le prendre pour du bois restant.
                              className={done && !sel ? "!bg-parc-50 !text-parc-700 !ring-parc-200" : ""}
                              title={`${l.externalId ?? `#${l.position}`} — ${Number(l.volumeM3).toFixed(4)} m³${done ? " — déjà scié" : ""}`}
                            >
                              {/* Suffixe seul (A, B, C…) : la bille est déjà en tête de ligne. */}
                              {l.externalId?.slice(g.bill.length) || l.externalId || `#${l.position}`}
                              {done ? " ✓" : ""}
                            </Chip>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto sm:overflow-visible">
      <div className="sm:min-w-[540px]">
      {/* En-tête inutile sous sm (mini-libellés) ; collant dès sm pour les
          longues sessions. */}
      <div className="hidden items-center gap-1 text-xs text-brand-500 sm:sticky sm:top-header sm:z-10 sm:grid sm:grid-cols-[2rem_1fr_1fr_1fr_4.5rem_5rem_2.75rem] sm:rounded-lg sm:bg-white sm:py-1">
        <span>#</span>
        <span>L (ft)</span>
        <span>l (in)</span>
        <span>ép (in)</span>
        <span>Taille</span>
        <span className="text-right">m³</span>
        <span />
      </div>

      {/* Téléphone (< sm) : carte 2 rangées — # + L/l/ép, puis Taille/m³/×.
          Même ordre DOM, l'Entrée-chaînage sur ép ne change pas. */}
      {rows.map((r, i) => {
        const info = infos[i];
        return (
          <div
            key={i}
            className="mt-1 grid grid-cols-[2rem_1fr_1fr_1fr_2.75rem] items-center gap-1 border-b border-brand-100 pb-2 sm:grid-cols-[2rem_1fr_1fr_1fr_4.5rem_5rem_2.75rem] sm:border-b-0 sm:pb-0"
          >
            <span className="text-xs text-brand-400">{i + 1}</span>
            {(["lengthFt", "widthIn", "thicknessIn"] as const).map((k) => (
              <div key={k} className="min-w-0">
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
                    k === "thicknessIn"
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
            <div className="col-start-2 justify-self-center sm:col-auto">
              {info ? (
                <Badge tone={SIZE_GROUP_TONE[info.size.group]}>{info.size.code}</Badge>
              ) : (
                <span className="text-center text-xs text-brand-300">—</span>
              )}
            </div>
            <span className="col-span-2 text-right text-base tabular-nums text-brand-700 sm:col-auto">
              <span className="mr-1 text-xs text-brand-400 sm:hidden">m³</span>
              {info ? info.volume.toFixed(3) : "—"}
            </span>
            <button
              type="button"
              onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
              className="flex min-h-touch w-full items-center justify-center rounded-lg text-lg text-brand-300 hover:bg-red-50 hover:text-red-500"
              aria-label="Supprimer la ligne"
            >
              ×
            </button>
          </div>
        );
      })}
      </div>
      </div>

      <button
        type="button"
        onClick={() => setRows((p) => [...p, emptyRow()])}
        className="mt-2 min-h-touch w-full rounded-lg border border-dashed border-brand-300 py-2.5 text-sm font-medium text-brand-600 hover:border-brand-900 hover:text-brand-900 active:bg-brand-100"
      >
        + Ligne
      </button>

      {total > 0 && (
        <div className="mt-2 space-y-2">
          {/* Relecture de fin de session : ce qui est rentré dans chaque taille. */}
          <div className="rounded-lg border border-brand-200">
            <div className="grid grid-cols-[1fr_4rem_6rem] gap-1 border-b border-brand-200 px-3 py-1.5 text-xs text-brand-500">
              <span>Taille</span>
              <span className="text-right">Pièces</span>
              <span className="text-right">m³</span>
            </div>
            {bySize.map((s) => (
              <div
                key={s.code}
                className="grid grid-cols-[1fr_4rem_6rem] items-center gap-1 px-3 py-1.5 text-sm"
              >
                <Badge tone={SIZE_GROUP_TONE[s.group]} className="justify-self-start">
                  {s.code}
                </Badge>
                <span className="text-right tabular-nums text-brand-700">{fmtNum(s.pieces)}</span>
                <span className="text-right tabular-nums text-brand-900">
                  {fmtNum(s.m3.toFixed(3))}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_4rem_6rem] gap-1 border-t border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-900">
              <span>Total</span>
              <span className="text-right tabular-nums">{fmtNum(pieces)}</span>
              <span className="text-right tabular-nums">{fmtNum(total.toFixed(3))}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(groups) as SizeGroup[])
              .filter((g) => groups[g] > 0)
              .map((g) => (
                <Badge key={g} tone={SIZE_GROUP_TONE[g]}>
                  {SIZE_GROUP_LABELS[g]} {fmtNum(groups[g].toFixed(3))} m³
                </Badge>
              ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="info">
              Long ≥6,5ft {fmtNum(longM3.toFixed(3))} ({fmtPct((longM3 / total) * 100, 0)}) · court{" "}
              {fmtNum(shortM3.toFixed(3))}
            </Badge>
            {bands
              .filter((b) => b.m3 > 0)
              .map((b) => (
                <Badge key={b.key}>
                  {b.label} {fmtNum(b.m3.toFixed(3))}
                </Badge>
              ))}
          </div>
          {rendement !== null && (
            <div className="rounded-lg bg-parc-50 px-3 py-1.5 text-sm text-parc-800">
              Rendement live : <strong>{fmtPct(rendement)}</strong>{" "}
              <span className="text-xs text-parc-700">
                ({fmtNum(total.toFixed(3))} débité ÷ {fmtNum(girthSel.toFixed(3))} m³ de billons{" "}
                {logIds.length > 0
                  ? `(${logIds.length} billon${logIds.length > 1 ? "s" : ""} sélectionné${logIds.length > 1 ? "s" : ""})`
                  : "(camions entiers)"})
              </span>
            </div>
          )}
        </div>
      )}

      {/* Récap + validation collés en bas : sur une longue session, le total
          courant et le bouton Valider restent visibles pendant la saisie
          (même motif que TallyEntry). */}
      <div className="sticky bottom-0 z-10 mt-3 rounded-lg border border-brand-200 bg-white p-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] shadow-[0_-6px_16px_-8px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm">
          <span className="text-brand-500">{fmtNum(pieces)} pièces</span>
          <span className="font-semibold text-brand-900">{fmtNum(total.toFixed(6))} m³</span>
        </div>
        <Button
          variant="primary"
          size="lg"
          className="mt-2 w-full"
          onClick={save}
          disabled={saving || valid.length === 0}
        >
          {saving ? "Enregistrement…" : `Valider la session (${valid.length} lignes)`}
        </Button>
      </div>
    </div>
  );
}
