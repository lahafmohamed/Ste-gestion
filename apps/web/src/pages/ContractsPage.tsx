import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ContractDTO, ContractOverviewDTO } from "@ste/shared";
import { contractsApi } from "../lib/api";
import { fmtInt } from "../lib/format";
import { PageHeader } from "../components/Layout";
import { ContractQuickCreate } from "../components/ContractSections";
import { QuotaBar } from "../components/QuotaGauge";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Chip from "../components/ui/Chip";
import { EmptyState, QueryError } from "../components/ui/Feedback";
import { SearchInput } from "../components/ui/Input";
import { SkeletonList } from "../components/ui/Skeleton";

function ContractCard({ c, o }: { c: ContractDTO; o?: ContractOverviewDTO }) {
  return (
    <Link
      to={`/contracts/${c.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400 active:border-slate-500 active:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
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
        <Badge tone={c.status === "OPEN" ? "emerald" : "slate"}>
          {c.status === "OPEN" ? "Ouvert" : "Clôturé"}
        </Badge>
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

  return (
    <>
      <PageHeader
        title="Contrats"
        subtitle={`${openCount} ouvert(s)${closedCount > 0 ? ` · ${closedCount} clôturé(s)` : ""} — l'état opérationnel est calculé à partir des opérations.`}
        right={
          <Button variant="primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Fermer" : "+ Nouveau contrat"}
          </Button>
        }
      />

      <div className="mx-auto max-w-page px-4 py-6">
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
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Chercher un n° de contrat, une forêt, un centre…"
              aria-label="Chercher un contrat"
            />
            {(years.length > 1 || closedCount > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {years.length > 1 && (
                  <>
                    <Chip selected={year === "ALL"} onClick={() => setYear("ALL")}>
                      Toutes années
                    </Chip>
                    {years.map((y) => (
                      <Chip key={y} selected={year === y} onClick={() => setYear(y)}>
                        {y}
                      </Chip>
                    ))}
                  </>
                )}
                {closedCount > 0 && openCount > 0 && (
                  <Chip selected={withClosed} onClick={() => setShowClosed((s) => !s)}>
                    {withClosed ? "Masquer les clôturés" : `Clôturés (${closedCount})`}
                  </Chip>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {contracts.isLoading && <SkeletonList count={3} lines={1} />}
          {contracts.isError && (
            <QueryError error={contracts.error} onRetry={() => contracts.refetch()}>
              Impossible de charger les contrats
            </QueryError>
          )}

          {!contracts.isLoading && !contracts.isError && all.length === 0 && (
            <EmptyState
              action={
                <Button variant="primary" onClick={() => setShowForm(true)}>
                  + Créer le premier contrat
                </Button>
              }
            >
              Aucun contrat pour l'instant.
            </EmptyState>
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
