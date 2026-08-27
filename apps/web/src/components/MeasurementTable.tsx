import { useEffect, useRef, useState } from "react";
import type { LogDTO, LogUpdateInput, MeasurementDTO } from "@ste/shared";
import { billParent, measurementTotalM3, type MeasurementCreateInput } from "@ste/shared";
import { fmtNum, normalizeDecimal } from "../lib/format";
import TallyEntry from "./TallyEntry";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { inputQuietCls } from "./ui/Input";
import { TableWrap } from "./ui/Table";

// Regroupe les billons d'un relevé girth par bille mère (traçabilité bille→billon).
function groupByBill(m: MeasurementDTO) {
  const groups = new Map<string, { billons: number; m3: number }>();
  for (const l of m.logs) {
    const key = billParent(l.externalId) ?? "?";
    const g = groups.get(key) ?? { billons: 0, m3: 0 };
    g.billons += 1;
    g.m3 += Number(l.volumeM3);
    groups.set(key, g);
  }
  return [...groups.entries()].map(([bill, g]) => ({ bill, ...g }));
}

export default function MeasurementTable({
  m,
  onDelete,
  onAppend,
  appending = false,
  billNos,
  appendDraftKey,
  appendError,
  onUpdateLog,
  onDeleteLog,
  logPending = false,
}: {
  m: MeasurementDTO;
  onDelete: () => void;
  onAppend?: (data: MeasurementCreateInput) => void;
  appending?: boolean;
  /** Girth : n° des billes étalées → sélecteur de billon (266 → 266A, 266B…). */
  billNos?: string[];
  /** Brouillon localStorage du mode « continuer l'étalage ». */
  appendDraftKey?: string;
  /** Échec du dernier ajout — la saisie reste ouverte pour réessayer. */
  appendError?: string | null;
  /** Correction d'une ligne (erreur de saisie) — volume recalculé côté serveur. */
  onUpdateLog: (logId: string, data: LogUpdateInput) => void;
  onDeleteLog: (log: LogDTO) => void;
  logPending?: boolean;
}) {
  const isDia = m.context === "YARD_DIAMETER";
  const [byBill, setByBill] = useState(false);
  const [adding, setAdding] = useState(false);

  // Ligne en cours de correction : n° + mesures éditées sur place, volume
  // recalculé côté serveur à l'enregistrement.
  const [edit, setEdit] = useState<{ id: string; externalId: string; a: string; b: string } | null>(
    null
  );
  function startEdit(l: LogDTO) {
    setEdit({
      id: l.id,
      externalId: l.externalId ?? "",
      a: String((isDia ? l.lengthFt : l.lengthM) ?? ""),
      b: String((isDia ? l.diameterIn : l.circumferenceCm) ?? ""),
    });
  }
  const editValid = !!edit && Number(edit.a) > 0 && Number(edit.b) > 0;
  function saveEdit() {
    if (!edit || !editValid) return;
    const id = edit.externalId.trim();
    onUpdateLog(edit.id, {
      externalId: id || null,
      ...(isDia ? { lengthFt: edit.a, diameterIn: edit.b } : { lengthM: edit.a, circumferenceCm: edit.b }),
    });
    setEdit(null);
  }

  // Le panneau d'ajout se referme quand le relevé revient agrandi (succès), pas
  // au clic : sinon un échec ferait disparaître la saisie sans rien dire.
  const logCount = m.logs.length;
  const prevLogCount = useRef(logCount);
  useEffect(() => {
    if (logCount > prevLogCount.current) setAdding(false);
    prevLogCount.current = logCount;
  }, [logCount]);
  // Traçabilité : proposer la vue par bille si des billons sont suffixés (283A/283B).
  const hasBillons =
    m.context === "YARD_GIRTH" &&
    m.logs.some((l) => l.externalId && /[A-Za-z]$/.test(l.externalId));
  const bills = hasBillons ? groupByBill(m) : [];

  const total = measurementTotalM3(m);
  const vols = m.logs.map((l) => Number(l.volumeM3));

  return (
    <div>
      {/* Téléphone (< sm) : le tableau 520px force un scroll horizontal — les
          lignes se replient en cartes 2 rangées (même motif que TallyEntry) :
          rangée 1 = n° + mesures, rangée 2 = m³ + actions. */}
      <div className="sm:hidden">
        {m.logs.map((l) =>
          edit?.id === l.id ? (
            <div key={l.id} className="mt-1 rounded-lg bg-brand-50 p-2">
              <div className="grid grid-cols-[1.6rem_1.2fr_1fr_1fr] items-end gap-1">
                <span className="pb-3 text-xs text-brand-400">{l.position}</span>
                <label className="min-w-0">
                  <span className="mb-0.5 block text-xs text-brand-500">N° log</span>
                  <input
                    value={edit.externalId}
                    onChange={(e) => setEdit({ ...edit, externalId: e.target.value })}
                    className={inputQuietCls}
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-0.5 block text-xs text-brand-500">L (m)</span>
                  <input
                    inputMode="decimal"
                    value={edit.a}
                    onChange={(e) => setEdit({ ...edit, a: normalizeDecimal(e.target.value) })}
                    className={inputQuietCls}
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-0.5 block text-xs text-brand-500">
                    {isDia ? "Ø (cm)" : "Circ (cm)"}
                  </span>
                  <input
                    inputMode="decimal"
                    value={edit.b}
                    onChange={(e) => setEdit({ ...edit, b: normalizeDecimal(e.target.value) })}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    className={inputQuietCls}
                  />
                </label>
              </div>
              <div className="mt-2 flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setEdit(null)}
                  className="min-h-touch rounded-lg px-3 text-sm text-brand-400 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200"
                >
                  Annuler
                </button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!editValid || logPending}
                  onClick={saveEdit}
                >
                  OK
                </Button>
              </div>
            </div>
          ) : (
            <div key={l.id} className="border-b border-brand-100 py-1.5">
              <div className="flex items-baseline gap-2">
                <span className="w-6 shrink-0 text-xs text-brand-400">{l.position}</span>
                <span className="min-w-0 flex-1 truncate">{l.externalId ?? "—"}</span>
                <span className="tabular-nums text-brand-600">
                  {fmtNum(isDia ? (l.lengthFt ?? 0) : (l.lengthM ?? 0))}
                  {" × "}
                  {fmtNum(isDia ? (l.diameterIn ?? 0) : (l.circumferenceCm ?? 0))}
                </span>
              </div>
              <div className="flex items-center justify-between pl-8">
                <span className="tabular-nums text-brand-700">
                  <span className="mr-1 text-xs text-brand-400">m³</span>
                  {fmtNum(l.volumeM3)}
                </span>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => startEdit(l)}
                    aria-label={`Corriger la ligne ${l.position}`}
                    className="flex min-h-touch w-11 items-center justify-center rounded-lg text-brand-300 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteLog(l)}
                    aria-label={`Supprimer la ligne ${l.position}`}
                    className="flex min-h-touch w-11 items-center justify-center rounded-lg text-lg text-brand-300 hover:bg-red-50 hover:text-red-500 active:bg-red-100"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          )
        )}
        <div className="mt-2 flex items-center justify-between font-semibold">
          <span>
            Total ({m.logs.length} {m.context === "YARD_GIRTH" ? "billons" : "billes"}
            {hasBillons && ` · ${bills.length} billes`})
          </span>
          <span className="tabular-nums">{fmtNum(total.toFixed(6))}</span>
        </div>
        {m.logs.length > 1 && (
          <div className="mt-1 text-xs text-brand-500">
            Moy {fmtNum((total / vols.length).toFixed(4))} · Max{" "}
            {fmtNum(Math.max(...vols).toFixed(4))} · Min {fmtNum(Math.min(...vols).toFixed(4))}
          </div>
        )}
      </div>

      <TableWrap className="-mx-4 hidden px-4 sm:block">
      <table className="w-full min-w-[520px] text-base">
        <thead>
          <tr className="text-left text-xs text-brand-500">
            <th className="py-1 font-normal">#</th>
            <th className="py-1 font-normal">N° log</th>
            <th className="py-1 font-normal">L (m)</th>
            <th className="py-1 font-normal">{isDia ? "Ø (cm)" : "Circ (cm)"}</th>
            <th className="py-1 text-right font-normal">m³</th>
            {isDia && <th className="py-1 text-right font-normal">CFT</th>}
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {m.logs.map((l) =>
            edit?.id === l.id ? (
              // Correction : n° + mesures éditables, volume recalculé côté serveur.
              <tr key={l.id} className="border-t border-brand-100 bg-brand-50">
                <td className="py-1.5 text-brand-400">{l.position}</td>
                <td className="py-1.5 pr-1">
                  <input
                    value={edit.externalId}
                    onChange={(e) => setEdit({ ...edit, externalId: e.target.value })}
                    aria-label={`N° log ligne ${l.position}`}
                    className={inputQuietCls}
                  />
                </td>
                <td className="py-1.5 pr-1">
                  <input
                    inputMode="decimal"
                    value={edit.a}
                    onChange={(e) => setEdit({ ...edit, a: normalizeDecimal(e.target.value) })}
                    aria-label={`Longueur ligne ${l.position}`}
                    className={inputQuietCls}
                  />
                </td>
                <td className="py-1.5 pr-1">
                  <input
                    inputMode="decimal"
                    value={edit.b}
                    onChange={(e) => setEdit({ ...edit, b: normalizeDecimal(e.target.value) })}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    aria-label={isDia ? `Ø ligne ${l.position}` : `Circonférence ligne ${l.position}`}
                    className={inputQuietCls}
                  />
                </td>
                <td colSpan={isDia ? 3 : 2} className="py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!editValid || logPending}
                      onClick={saveEdit}
                    >
                      OK
                    </Button>
                    <button
                      type="button"
                      onClick={() => setEdit(null)}
                      aria-label="Annuler la correction"
                      className="min-h-touch rounded-lg px-2 text-sm text-brand-400 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200"
                    >
                      Annuler
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={l.id} className="border-t border-brand-100">
                <td className="py-1 text-brand-400">{l.position}</td>
                <td className="py-1">{l.externalId ?? "—"}</td>
                <td className="py-1 tabular-nums">
                  {fmtNum(isDia ? (l.lengthFt ?? 0) : (l.lengthM ?? 0))}
                </td>
                <td className="py-1 tabular-nums">
                  {fmtNum(isDia ? (l.diameterIn ?? 0) : (l.circumferenceCm ?? 0))}
                </td>
                <td className="py-1 text-right tabular-nums">{fmtNum(l.volumeM3)}</td>
                {isDia && (
                  <td className="py-1 text-right tabular-nums">{fmtNum(l.cft ?? 0)}</td>
                )}
                <td className="py-1">
                  {/* Erreur d'entrée au parc : corriger ou supprimer la ligne. */}
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => startEdit(l)}
                      aria-label={`Corriger la ligne ${l.position}`}
                      className="flex min-h-touch w-11 items-center justify-center rounded-lg text-brand-300 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteLog(l)}
                      aria-label={`Supprimer la ligne ${l.position}`}
                      className="flex min-h-touch w-11 items-center justify-center rounded-lg text-lg text-brand-300 hover:bg-red-50 hover:text-red-500 active:bg-red-100"
                    >
                      ×
                    </button>
                  </div>
                </td>
              </tr>
            )
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-brand-200 font-semibold">
            <td colSpan={4} className="py-1.5">
              Total ({m.logs.length} {m.context === "YARD_GIRTH" ? "billons" : "billes"}
              {hasBillons && ` · ${bills.length} billes`})
            </td>
            <td className="py-1.5 text-right tabular-nums">
              {fmtNum(measurementTotalM3(m).toFixed(6))}
            </td>
            {isDia && <td />}
            <td />
          </tr>
          {m.logs.length > 1 &&
            (() => {
              const vols = m.logs.map((l) => Number(l.volumeM3));
              const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
              return (
                <tr className="text-xs text-brand-500">
                  <td colSpan={4} className="py-1">
                    Moy {fmtNum(avg.toFixed(4))} · Max {fmtNum(Math.max(...vols).toFixed(4))} ·
                    Min {fmtNum(Math.min(...vols).toFixed(4))}
                  </td>
                  <td />
                  {isDia && <td />}
                  <td />
                </tr>
              );
            })()}
        </tfoot>
      </table>
      </TableWrap>

      {byBill && (
        <div className="mt-3 rounded-lg bg-brand-50 p-3">
          <div className="mb-1 text-xs font-medium text-brand-500">
            Par bille mère ({bills.length} billes → {m.logs.length} billons)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {bills.map((b) => (
              <Badge key={b.bill} title={`${fmtNum(b.m3.toFixed(4))} m³`}>
                {b.bill} · {b.billons}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {onAppend && !adding && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            + Continuer l'étalage
          </Button>
        )}
        <button
          onClick={onDelete}
          className="min-h-touch rounded-lg px-2 text-sm text-brand-400 hover:bg-red-50 hover:text-red-600 active:bg-red-100"
        >
          Supprimer cet étalage
        </button>
        {hasBillons && (
          <button
            onClick={() => setByBill((s) => !s)}
            className="min-h-touch rounded-lg px-2 text-sm text-brand-500 hover:bg-brand-100 hover:text-brand-900 active:bg-brand-200"
          >
            {byBill ? "Masquer la vue par bille" : "Vue par bille"}
          </button>
        )}
      </div>

      {adding && onAppend && (
        <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <div className="mb-2 text-xs font-medium text-brand-500">
            Ajouter des {m.context === "YARD_GIRTH" ? "billons" : "billes"} (à partir du n°{" "}
            {m.logs.length + 1})
          </div>
          <TallyEntry
            context={m.context}
            saving={appending}
            bills={billNos}
            existingIds={m.logs.map((l) => l.externalId ?? "")}
            draftKey={appendDraftKey}
            error={appendError}
            onSave={(data) => onAppend(data)}
          />
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="mt-2 min-h-touch rounded-lg px-2 text-sm text-brand-400 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
