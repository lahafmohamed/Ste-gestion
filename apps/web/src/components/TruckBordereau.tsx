import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TruckDTO, TruckUpdateInput } from "@ste/shared";
import { trucksApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtNum, normalizeDecimal } from "../lib/format";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Card, { SectionHeading } from "./ui/Card";
import DateField from "./ui/DateField";
import { FormError } from "./ui/Feedback";
import Input, { Field } from "./ui/Input";

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

/** Valeur affichée, `null` si le champ est vide (rendu « — » atténué). */
function display(t: TruckDTO, f: Field): string | null {
  const v = raw(t, f.key as string);
  if (v === null || v === "") return null;
  if (f.kind === "date") return new Date(String(v)).toLocaleDateString("fr-FR");
  // Virgule décimale française (« 33,171 »), comme partout ailleurs dans l'app.
  if (f.kind === "decimal" || f.kind === "int") return Number(v) === 0 ? null : fmtNum(v);
  return String(v);
}

export default function TruckBordereau({ truck }: { truck: TruckDTO }) {
  const qc = useQueryClient();
  const can = useCan();
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
    // L'échec d'une saisie précédente abandonnée ne doit pas réapparaître.
    setError(null);
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
      <SectionHeading
        right={
          can("reception.edit") && (
            <Button
              size="xs"
              className="-my-2"
              aria-expanded={editing}
              onClick={() => (editing ? setEditing(false) : openEdit())}
            >
              {editing ? "Annuler" : "Modifier"}
            </Button>
          )
        }
      >
        <span className="inline-flex items-center gap-2">
          Bordereau SODEFOR
          {/* Saisie progressive : combien de cases du ticket sont remplies. */}
          <Badge
            tone={filled === FIELDS.length ? "parc" : filled <= 2 ? "brand" : "amber"}
            className="tabular-nums"
          >
            {filled}/{FIELDS.length} renseignés
          </Badge>
        </span>
      </SectionHeading>

      <Card>
        {editing ? (
          <form onSubmit={submit}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {FIELDS.map((f) => (
                <Field key={f.key as string} label={f.label}>
                  {f.kind === "date" ? (
                    <DateField
                      value={v[f.key as string]}
                      onChange={(iso) => setV((p) => ({ ...p, [f.key as string]: iso }))}
                    />
                  ) : (
                    <Input
                      required={f.key === "registration"}
                      inputMode={
                        f.kind === "decimal" ? "decimal" : f.kind === "int" ? "numeric" : undefined
                      }
                      value={v[f.key as string]}
                      // Virgule du clavier FR → point : « 33,171 » partait tel quel
                      // et l'API refusait l'enregistrement du bordereau.
                      onChange={(e) =>
                        setV((p) => ({
                          ...p,
                          [f.key as string]:
                            f.kind === "decimal" ? normalizeDecimal(e.target.value) : e.target.value,
                        }))
                      }
                      placeholder={f.ph}
                    />
                  )}
                </Field>
              ))}
            </div>
            {error && (
              <div className="mt-3">
                <FormError>{error}</FormError>
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2 border-t border-brand-100 pt-3">
              <Button onClick={() => setEditing(false)}>Annuler</Button>
              <Button type="submit" variant="primary" disabled={save.isPending}>
                {save.isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </form>
        ) : (
          // Valeurs en text-base (lues debout sur tablette) ; une case vide reste
          // à sa place mais s'efface, pour que l'œil trouve ce qui manque.
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {FIELDS.map((f) => {
              const val = display(truck, f);
              return (
                <div key={f.key as string} className="min-w-0">
                  <dt className="text-xs text-brand-500">{f.label}</dt>
                  <dd
                    className={`break-words text-base ${
                      val === null ? "text-brand-500" : "tabular-nums text-brand-900"
                    }`}
                  >
                    {val ?? "—"}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </Card>
    </section>
  );
}
