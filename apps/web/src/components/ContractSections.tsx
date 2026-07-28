import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContractDTO, ContractUpdateInput } from "@ste/shared";
import { accountsApi, contractsApi } from "../lib/api";
import { fmtInt, fmtNum, normalizeDecimal } from "../lib/format";

// ── Saisie progressive : la fiche contrat est découpée en cartes
// indépendantes ; chaque carte s'édite et s'enregistre séparément (PATCH
// partiel). On crée un contrat avec code + quota, le reste vient avec le temps.

type Kind = "text" | "int" | "decimal" | "date" | "status" | "party";
type Field = {
  key: string;
  label: string;
  kind: Kind;
  ph?: string;
  nullable?: boolean; // vidé → null (sinon vidé → inchangé)
  /** Toujours renseigné (posé à la création) → hors du compteur de complétion. */
  core?: boolean;
};

type Section = { id: string; title: string; hint?: string; fields: Field[] };

const SECTIONS: Section[] = [
  {
    id: "terms",
    title: "Termes",
    fields: [
      { key: "code", label: "N° de contrat", kind: "text", ph: "A3-2026-014", core: true },
      { key: "year", label: "Année", kind: "int", ph: "2026" },
      { key: "status", label: "Statut", kind: "status", core: true },
      { key: "quotaM3", label: "Quota (m³)", kind: "decimal", ph: "1000", core: true },
      { key: "trucksPlanned", label: "Camions prévus", kind: "int", ph: "47" },
      { key: "note", label: "Note", kind: "text", nullable: true },
    ],
  },
  {
    id: "admin",
    title: "Administratif",
    hint: "Bordereau SODEFOR — à compléter quand les documents arrivent.",
    fields: [
      { key: "signedAt", label: "Signé le", kind: "date", nullable: true },
      { key: "durationMonths", label: "Durée (mois)", kind: "int", ph: "11", nullable: true },
      { key: "exploitationStartAt", label: "Mise en exploitation", kind: "date", nullable: true },
      { key: "forest", label: "Forêt classée", kind: "text", ph: "SANGOUÉ", nullable: true },
      { key: "managementCenter", label: "Centre de gestion", kind: "text", ph: "GAGNOA", nullable: true },
    ],
  },
  {
    id: "prices",
    title: "Paramètres de prix",
    // Unités reprises des formules qui les consomment (truckCostCfa,
    // saleLineAmountCfa) : « SODEFOR 55000 » seul ne dit pas par quoi multiplier.
    hint: "En FCFA sauf mention contraire.",
    fields: [
      { key: "sodeforPrice", label: "SODEFOR (par m³ brousse)", kind: "decimal", ph: "55000" },
      { key: "ibrahimPrice", label: "Ibrahim (par m³ étalé Ø)", kind: "decimal", ph: "24000" },
      { key: "transportPrice", label: "Transport (par camion)", kind: "decimal", ph: "475000" },
      { key: "cubagePrice", label: "Cubage (par camion)", kind: "decimal", ph: "100000" },
      { key: "companyPrice", label: "Company", kind: "decimal", ph: "90000" },
      { key: "exportPrice", label: "Export", kind: "decimal", ph: "65000" },
      { key: "sellingPriceUsd", label: "Vente (USD par m³)", kind: "decimal", ph: "570" },
      { key: "usdCfaRate", label: "Taux USD → FCFA", kind: "decimal", ph: "575" },
      { key: "oneInchPrice", label: '1"', kind: "decimal", ph: "140000" },
    ],
  },
  {
    id: "fees",
    title: "Frais SODEFOR (FCFA)",
    fields: [
      { key: "feeSodeforR", label: "SODEFOR & R", kind: "decimal", ph: "42500000" },
      { key: "feeSodeforPlus", label: "SODEFOR +", kind: "decimal", ph: "7500000" },
      { key: "feeReforestation", label: "Reboisement", kind: "decimal", ph: "2500000" },
    ],
  },
  {
    id: "budgets",
    title: "Budgets (FCFA)",
    fields: [
      { key: "woodBudget", label: "Wood budget", kind: "decimal", ph: "33812722" },
      { key: "companyBudget", label: "Company budget", kind: "decimal", ph: "12717450" },
      { key: "exportBudget", label: "Export budget", kind: "decimal", ph: "9184825" },
      { key: "expectedProfit", label: "Profit attendu (saisi)", kind: "decimal", nullable: true },
    ],
  },
  {
    id: "parties",
    title: "Tiers assignés",
    hint: "Activent les suggestions de dûs en comptabilité.",
    fields: [
      { key: "transportPartyId", label: "Transport", kind: "party", nullable: true },
      { key: "cubagePartyId", label: "Cubage (Ibrahim)", kind: "party", nullable: true },
      { key: "sodeforPartyId", label: "SODEFOR", kind: "party", nullable: true },
    ],
  },
];

function raw(c: ContractDTO, key: string): string | number | null {
  return (c as unknown as Record<string, string | number | null>)[key] ?? null;
}

/** Un champ est « renseigné » si non vide / non zéro (les décimaux ont défaut 0). */
function isFilled(c: ContractDTO, f: Field): boolean {
  const v = raw(c, f.key);
  if (v === null || v === "") return false;
  if (f.kind === "decimal" || f.kind === "int") return Number(v) !== 0;
  return true;
}

function toInput(c: ContractDTO, f: Field): string {
  const v = raw(c, f.key);
  if (v === null) return "";
  if (f.kind === "date") return String(v).slice(0, 10);
  return String(v);
}

function display(c: ContractDTO, f: Field, partyName: (id: string) => string): string {
  const v = raw(c, f.key);
  if (v === null || v === "") return "—";
  switch (f.kind) {
    case "date":
      return new Date(String(v)).toLocaleDateString("fr-FR");
    case "decimal":
      return Number(v) === 0 ? "—" : fmtNum(v);
    case "int":
      return Number(v) === 0 ? "—" : fmtInt(v);
    case "status":
      return v === "OPEN" ? "Ouvert" : "Clôturé";
    case "party":
      return partyName(String(v));
    default:
      return String(v);
  }
}

function SectionCard({
  section,
  contract,
  onSaved,
}: {
  section: Section;
  contract: ContractDTO;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const parties = useQuery({ queryKey: ["parties"], queryFn: accountsApi.parties });

  const partyName = (id: string) => parties.data?.find((p) => p.id === id)?.name ?? "?";

  // Les champs posés à la création (n°, statut, quota) sont toujours remplis :
  // les compter gonflait le badge et « Termes 6/6 » ne voulait plus rien dire.
  const counted = section.fields.filter((f) => !f.core);
  const filled = counted.filter((f) => isFilled(contract, f)).length;
  const total = counted.length;

  const save = useMutation({
    mutationFn: (payload: ContractUpdateInput) => contractsApi.update(contract.id, payload),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ["contracts"] });
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  function openEdit() {
    const init: Record<string, string> = {};
    for (const f of section.fields) init[f.key] = toInput(contract, f);
    setV(init);
    setEditing(true);
  }

  /** Neuf prix retapés puis « Annuler » : demander avant de tout jeter. */
  function closeEdit() {
    const dirty = section.fields.some((f) => (v[f.key] ?? "") !== toInput(contract, f));
    if (dirty && !window.confirm("Abandonner les modifications non enregistrées ?")) return;
    setEditing(false);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {};
    for (const f of section.fields) {
      const val = v[f.key]?.trim() ?? "";
      if (val === "") {
        if (f.nullable) payload[f.key] = null; // vidé volontairement
        // sinon : champ non renseigné → inchangé
      } else {
        payload[f.key] = val;
      }
    }
    save.mutate(payload as ContractUpdateInput);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              filled === total
                ? "bg-emerald-50 text-emerald-700"
                : filled === 0
                  ? "bg-slate-100 text-slate-400"
                  : "bg-amber-50 text-amber-700"
            }`}
          >
            {filled}/{total}
          </span>
        </div>
        <button
          onClick={() => (editing ? closeEdit() : openEdit())}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          {editing ? "Annuler" : "Modifier"}
        </button>
      </div>
      {section.hint && !editing && (
        <p className="mt-1 text-xs text-slate-400">{section.hint}</p>
      )}

      {!editing ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {section.fields.map((f) => (
            <div key={f.key}>
              <dt className="text-xs text-slate-500">{f.label}</dt>
              <dd className="text-sm text-slate-900">{display(contract, f, partyName)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <form onSubmit={submit} className="mt-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {section.fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">{f.label}</span>
                {f.kind === "status" ? (
                  <select
                    value={v[f.key]}
                    onChange={(e) => setV((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
                  >
                    <option value="OPEN">Ouvert</option>
                    <option value="CLOSED">Clôturé</option>
                  </select>
                ) : f.kind === "party" ? (
                  <select
                    value={v[f.key]}
                    onChange={(e) => setV((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
                  >
                    <option value="">— aucun —</option>
                    {parties.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.kind === "date" ? "date" : "text"}
                    inputMode={f.kind === "int" || f.kind === "decimal" ? "decimal" : undefined}
                    value={v[f.key]}
                    onChange={(e) =>
                      setV((p) => ({
                        ...p,
                        // Clavier FR : « 24,5 » doit partir en « 24.5 », sinon
                        // l'API rejette et on ne voit qu'une erreur brute.
                        [f.key]:
                          f.kind === "int" || f.kind === "decimal"
                            ? normalizeDecimal(e.target.value)
                            : e.target.value,
                      }))
                    }
                    placeholder={f.ph}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
                  />
                )}
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            {error && <span className="text-sm text-red-600">{error}</span>}
            <button
              type="submit"
              disabled={save.isPending}
              className="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Cartes de la fiche contrat (saisie progressive, PATCH par section). */
export function ContractSections({
  contract,
  onSaved,
}: {
  contract: ContractDTO;
  onSaved: () => void;
}) {
  return (
    <div className="space-y-3">
      {SECTIONS.map((s) => (
        <SectionCard key={s.id} section={s} contract={contract} onSaved={onSaved} />
      ))}
    </div>
  );
}

/** Création minimale : n° + quota (+ année). Le reste s'ajoute après, sur la fiche. */
export function ContractQuickCreate({
  onCreated,
  onCancel,
}: {
  onCreated: (c: ContractDTO) => void;
  onCancel?: () => void;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [quota, setQuota] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      contractsApi.create({
        code: code.trim(),
        quotaM3: quota.trim(),
        ...(year.trim() ? { year: Number(year) } : {}),
      }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      onCreated(c);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        create.mutate();
      }}
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-slate-900">Nouveau contrat</h3>
      <p className="mt-1 text-xs text-slate-400">
        Seuls le numéro et le quota sont connus au départ — le reste se complète sur la
        fiche, au fil du contrat.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">N° de contrat</span>
          <input
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="A3-2026-014"
            className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Quota (m³)</span>
          <input
            required
            inputMode="decimal"
            value={quota}
            onChange={(e) => setQuota(normalizeDecimal(e.target.value))}
            placeholder="1000"
            className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Année</span>
          <input
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {error && <span className="text-sm text-red-600">{error}</span>}
        <div className="ml-auto flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"
            >
              Annuler
            </button>
          )}
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {create.isPending ? "Création…" : "Créer le contrat"}
          </button>
        </div>
      </div>
    </form>
  );
}
