import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ContractDTO, ContractOverviewDTO } from "@ste/shared";
import { contractsApi } from "../lib/api";
import { fmtInt } from "../lib/format";
import { PageHeader } from "../components/Layout";
import { ContractQuickCreate } from "../components/ContractSections";
import { QuotaBar } from "../components/QuotaGauge";

function ContractCard({ c, o }: { c: ContractDTO; o?: ContractOverviewDTO }) {
  return (
    <Link
      to={`/contracts/${c.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-slate-900">{c.code}</div>
          <div className="text-xs text-slate-500">
            {c.year ? `${c.year} · ` : ""}
            {/* Projection dérivée des arrivées ; à défaut le prévu contractuel saisi. */}
            {o?.estTrucksTotal != null
              ? `≈ ${fmtInt(o.estTrucksTotal)} camions estimés (${o.trucksEntered} entrés)`
              : `${fmtInt(c.trucksPlanned)} camions prévus`}
            {c.forest ? ` · ${c.forest}` : ""}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            c.status === "OPEN" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {c.status === "OPEN" ? "Ouvert" : "Clôturé"}
        </span>
      </div>
      <div className="mt-3">
        {o ? (
          <QuotaBar brousseM3={o.brousseM3} quotaM3={c.quotaM3} />
        ) : (
          <div className="h-1.5 w-full animate-pulse rounded-full bg-slate-100" />
        )}
      </div>
    </Link>
  );
}

/** Recherche insensible à la casse et aux accents (SANGOUÉ ≡ sangoue). */
function fold(s: string): string {
  // NFD sépare la lettre de son accent ; on retire ensuite les diacritiques.
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function matches(c: ContractDTO, needle: string): boolean {
  if (!needle) return true;
  const hay = fold(
    [c.code, c.year ?? "", c.forest ?? "", c.managementCenter ?? "", c.note ?? ""].join(" ")
  );
  // Chaque mot doit être présent → « sangoue 2026 » filtre les deux à la fois.
  return fold(needle)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export default function ContractsPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [q, setQ] = useState("");
  const [year, setYear] = useState<number | "ALL">("ALL");
  // Les contrats clôturés s'empilent année après année : masqués par défaut,
  // la page ne montre que le travail en cours.
  const [showClosed, setShowClosed] = useState(false);

  // Bouton « + Contrat » du header → /contracts?nouveau=1
  useEffect(() => {
    if (params.get("nouveau")) {
      setShowForm(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const contracts = useQuery({ queryKey: ["contracts"], queryFn: contractsApi.list });
  // Une requête pour toutes les cartes (voir /contracts/overview côté API).
  // Clé sous « contracts » : les invalidations existantes la rafraîchissent aussi.
  const overview = useQuery({
    queryKey: ["contracts", "overview"],
    queryFn: contractsApi.overview,
  });

  const all = contracts.data ?? [];
  const ovById = useMemo(
    () => new Map((overview.data ?? []).map((o) => [o.contractId, o])),
    [overview.data]
  );

  const years = useMemo(
    () =>
      [...new Set(all.map((c) => c.year).filter((y): y is number => y != null))].sort(
        (a, b) => b - a
      ),
    [all]
  );

  const closedCount = all.filter((c) => c.status === "CLOSED").length;
  const openCount = all.length - closedCount;
  // Plus aucun contrat ouvert (fin de campagne) : montrer les clôturés d'office,
  // sinon la page paraît vide alors que les contrats sont là.
  const withClosed = showClosed || openCount === 0;

  // Contrats ouverts d'abord (travail en parallèle sur plusieurs contrats),
  // puis année décroissante, puis ordre API (créés récents d'abord).
  const shown = all
    .filter((c) => (withClosed ? true : c.status === "OPEN"))
    .filter((c) => (year === "ALL" ? true : c.year === year))
    .filter((c) => matches(c, q))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "OPEN" ? -1 : 1;
      return (b.year ?? 0) - (a.year ?? 0);
    });

  const filtering = q.trim() !== "" || year !== "ALL";

  const chipCls = (on: boolean) =>
    `rounded-full px-2.5 py-1 text-xs ${
      on ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-400"
    }`;

  return (
    <>
      <PageHeader
        title="Contrats"
        subtitle={`${openCount} ouvert(s)${closedCount > 0 ? ` · ${closedCount} clôturé(s)` : ""} — l'état opérationnel est calculé à partir des opérations.`}
        right={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            {showForm ? "Fermer" : "+ Nouveau contrat"}
          </button>
        }
      />

      <div className="mx-auto max-w-3xl px-4 py-6">
        {showForm && (
          <div className="mb-6">
            <ContractQuickCreate
              onCreated={(c) => nav(`/contracts/${c.id}`)}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Recherche + filtres — dès la 2ᵉ année, la liste devient longue. */}
        {all.length > 3 && (
          <div className="mb-4 space-y-2">
            <div className="relative">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Chercher un n° de contrat, une forêt, un centre…"
                aria-label="Chercher un contrat"
                className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-9 text-base outline-none focus:border-slate-900"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label="Effacer la recherche"
                  className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-900"
                >
                  ×
                </button>
              )}
            </div>
            {(years.length > 1 || closedCount > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {years.length > 1 && (
                  <>
                    <button type="button" onClick={() => setYear("ALL")} className={chipCls(year === "ALL")}>
                      Toutes années
                    </button>
                    {years.map((y) => (
                      <button key={y} type="button" onClick={() => setYear(y)} className={chipCls(year === y)}>
                        {y}
                      </button>
                    ))}
                  </>
                )}
                {closedCount > 0 && openCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowClosed((s) => !s)}
                    className={chipCls(withClosed)}
                  >
                    {withClosed ? "Masquer les clôturés" : `Clôturés (${closedCount})`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {contracts.isLoading && <p className="text-sm text-slate-500">Chargement…</p>}
          {contracts.isError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">
                Impossible de charger les contrats
                {contracts.error instanceof Error ? ` : ${contracts.error.message}` : "."}
              </p>
              <button
                type="button"
                onClick={() => contracts.refetch()}
                className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Réessayer
              </button>
            </div>
          )}

          {!contracts.isLoading && all.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
              <p className="text-sm text-slate-500">Aucun contrat pour l'instant.</p>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                + Créer le premier contrat
              </button>
            </div>
          )}

          {all.length > 0 && shown.length === 0 && (
            <p className="text-sm text-slate-500">
              Aucun contrat ne correspond
              {filtering ? " à la recherche" : ""}.{" "}
              {!withClosed && closedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClosed(true)}
                  className="underline hover:text-slate-900"
                >
                  Inclure les {closedCount} clôturé(s)
                </button>
              )}
            </p>
          )}

          {shown.map((c) => (
            <ContractCard key={c.id} c={c} o={ovById.get(c.id)} />
          ))}
        </div>
      </div>
    </>
  );
}
