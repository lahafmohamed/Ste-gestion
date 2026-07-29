import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TruckDTO, TruckUpdateInput } from "@ste/shared";
import { trucksApi } from "../lib/api";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { FormError } from "./ui/Feedback";

// Champs du bordereau SODEFOR « circulation des bois » — saisie progressive.
// Chaque donnée arrive à son moment ; tout est optionnel et éditable après coup.

type Kind = "text" | "int" | "decimal" | "date";
type Field = { key: keyof TruckUpdateInput; label: string; ph?: string; kind: Kind };

const FIELDS: Field[] = [
  { key: "registration", label: "Immatriculation", ph: "3201 GS 01", kind: "text" },
  { key: "deliveryNote", label: "B/L (bordereau)", ph: "176530", kind: "text" },
  { key: "bonNo", label: "N° BON", ph: "225640693814", kind: "text" },
  { key: "bookletNo", label: "N° carnet", ph: "6455", kind: "text" },
  { key: "transporter", label: "Transporteur", ph: "JAMAL", kind: "text" },
  { key: "driver", label: "Chauffeur", ph: "KONATE MADOU", kind: "text" },
  { key: "trailer", label: "Remorque", ph: "7794 F3 01", kind: "text" },
  { key: "parcel", label: "Parcelle", ph: "146-99/04", kind: "text" },
  { key: "origin", label: "Origine / forêt", ph: "SANGOUE", kind: "text" },
  { key: "destination", label: "Destination", ph: "TOUMODI", kind: "text" },
  { key: "followupAgent", label: "Agent de suivi", ph: "Sgt Koffi Joel", kind: "text" },
  { key: "smsCode", label: "Code SMS", ph: "47734027", kind: "text" },
  { key: "loadedAt", label: "Chargé le", kind: "date" },
  { key: "arrivedAt", label: "Arrivé au parc le", kind: "date" },
  { key: "declaredFieldM3", label: "Brousse déclaré (m³)", ph: "33.171", kind: "decimal" },
  { key: "declaredLogCount", label: "Billes déclarées", ph: "58", kind: "int" },
];

function raw(t: TruckDTO, key: string): string | number | null {
  return (t as unknown as Record<string, string | number | null>)[key] ?? null;
}

function toInput(t: TruckDTO, f: Field): string {
  const v = raw(t, f.key as string);
  if (v === null) return "";
  if (f.kind === "date") return String(v).slice(0, 10);
  return String(v);
}

function display(t: TruckDTO, f: Field): string {
  const v = raw(t, f.key as string);
  if (v === null || v === "") return "—";
  if (f.kind === "date") return new Date(String(v)).toLocaleDateString("fr-FR");
  if (f.kind === "decimal" || f.kind === "int") return Number(v) === 0 ? "—" : String(v);
  return String(v);
}

export default function TruckBordereau({ truck }: { truck: TruckDTO }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const filled = FIELDS.filter((f) => {
    const val = raw(truck, f.key as string);
    if (val === null || val === "") return false;
    if (f.kind === "decimal" || f.kind === "int") return Number(val) !== 0;
    return true;
  }).length;

  const save = useMutation({
    mutationFn: (payload: TruckUpdateInput) => trucksApi.update(truck.id, payload),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ["trucks"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  function openEdit() {
    const init: Record<string, string> = {};
    for (const f of FIELDS) init[f.key as string] = toInput(truck, f);
    setV(init);
    setEditing(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const key = f.key as string;
      const val = v[key]?.trim() ?? "";
      if (key === "registration" || key === "arrivedAt") {
        if (val) payload[key] = val; // requis : jamais vidé (arrivée = toujours datée)
      } else if (val === "") {
        payload[key] = null; // vidé → détaché
      } else {
        payload[key] = val;
      }
    }
    save.mutate(payload as TruckUpdateInput);
  }

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Bordereau SODEFOR
          </h2>
          <Badge tone={filled === FIELDS.length ? "emerald" : filled <= 2 ? "slate" : "amber"}>
            {filled}/{FIELDS.length}
          </Badge>
        </div>
        <button
          onClick={() => (editing ? setEditing(false) : openEdit())}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          {editing ? "Annuler" : "Modifier"}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {editing ? (
          <form onSubmit={submit}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {FIELDS.map((f) => (
                <label key={f.key as string} className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">{f.label}</span>
                  <input
                    required={f.key === "registration"}
                    type={f.kind === "date" ? "date" : "text"}
                    inputMode={f.kind === "int" || f.kind === "decimal" ? "decimal" : undefined}
                    value={v[f.key as string]}
                    onChange={(e) => setV((p) => ({ ...p, [f.key as string]: e.target.value }))}
                    placeholder={f.ph}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              {error && <FormError>{error}</FormError>}
              <Button
                type="submit"
                variant="primary"
                disabled={save.isPending}
                className="ml-auto"
              >
                {save.isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <div key={f.key as string}>
                <dt className="text-xs text-slate-500">{f.label}</dt>
                <dd className="text-sm text-slate-900">{display(truck, f)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
