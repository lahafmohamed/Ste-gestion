import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ContractDTO, ContractOverviewDTO } from "@ste/shared";
import { contractsApi } from "../lib/api";
import { fmtFcfa, fmtInt, fmtM3, fmtPct } from "../lib/format";
import { SHOW_MONEY } from "../lib/features";
import { PageHeader } from "../components/Layout";
import { QuotaBar } from "../components/QuotaGauge";
import Badge from "../components/ui/Badge";
import { Kpi, KpiStrip, SectionHeading, cardInteractiveCls } from "../components/ui/Card";
import { EmptyState, QueryError } from "../components/ui/Feedback";
import { buttonCls } from "../components/ui/Button";
import { SkeletonLine } from "../components/ui/Skeleton";
import { IconArrowRight, IconPlus } from "../components/icons";

/** Paire libellé / valeur des cartes contrat — la valeur porte, le libellé guide. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-brand-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-brand-900">{value}</div>
    </div>
  );
}

function ContractCard({ c, o }: { c: ContractDTO; o?: ContractOverviewDTO }) {
  const meta = [c.year, c.forest, c.managementCenter].filter(Boolean).join(" · ");
  return (
    <Link to={`/contracts/${c.id}`} className={`${cardInteractiveCls} block p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold tracking-tight text-brand-900">
            {c.code}
          </div>
          {/* Deux lignes au plus, texte complet au survol : tronqué net sur une
              ligne, le centre de gestion n'était lisible nulle part. */}
          <div className="mt-0.5 line-clamp-2 text-sm text-brand-600" title={meta || undefined}>
            {meta || "—"}
          </div>
        </div>
        <Badge tone={c.status === "OPEN" ? "parc" : "brand"}>
          {c.status === "OPEN" ? "Ouvert" : "Clôturé"}
        </Badge>
      </div>

      {o ? (
        <>
          <div className="mt-4">
            <div className="mb-1.5 text-xs text-brand-500">
              Quota brousse ·{" "}
              <span className="font-medium text-brand-700">
                {fmtInt(o.trucksEntered)}
                {/* Total projeté depuis la moyenne des arrivées ; à défaut le prévu saisi. */}
                {o.estTrucksTotal != null
                  ? ` / ≈ ${fmtInt(o.estTrucksTotal)}`
                  : c.trucksPlanned > 0
                    ? ` / ${fmtInt(c.trucksPlanned)}`
                    : ""}{" "}
                camions
              </span>
            </div>
            <QuotaBar brousseM3={o.brousseM3} quotaM3={c.quotaM3} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-brand-100 pt-4">
            <Stat label="Sciés" value={`${fmtInt(o.trucksSawn)} camion${o.trucksSawn > 1 ? "s" : ""}`} />
            <Stat
              label="Débité · rendement"
              value={`${fmtM3(o.debitedM3)} · ${fmtPct(Number(o.outputPct))}`}
            />
            <Stat label="Stock produits" value={fmtM3(o.stockProductsM3)} />
            {SHOW_MONEY ? (
              <Stat label="Solde" value={fmtFcfa(o.balance)} />
            ) : (
              // Le statut est déjà sur la pastille : ici, ce qui attend la scie.
              <Stat
                label="Sur parc"
                value={`${fmtInt(o.trucksEntered - o.trucksSawn)} camion${
                  o.trucksEntered - o.trucksSawn > 1 ? "s" : ""
                }`}
              />
            )}
            {SHOW_MONEY && <Stat label="Chiffre d'affaires" value={fmtFcfa(o.salesRevenueCfa)} />}
          </div>
        </>
      ) : (
        <div className="mt-4 space-y-2.5" aria-hidden>
          <SkeletonLine className="w-2/3" />
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-1/2" />
        </div>
      )}
    </Link>
  );
}

function SkeletonKpi() {
  return (
    <div className="bg-white px-4 py-3.5" aria-hidden>
      <SkeletonLine className="w-1/2" />
      <SkeletonLine className="mt-3 h-6 w-2/3" />
    </div>
  );
}

function SkeletonContractCard() {
  return (
    <div className="rounded-xl bg-white p-5 shadow-card" aria-hidden>
      <SkeletonLine className="w-1/3" />
      <SkeletonLine className="mt-2 w-1/2" />
      <SkeletonLine className="mt-5 w-full" />
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-brand-100 pt-4">
        <SkeletonLine className="w-3/4" />
        <SkeletonLine className="w-2/3" />
        <SkeletonLine className="w-1/2" />
        <SkeletonLine className="w-3/4" />
      </div>
    </div>
  );
}

const today = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default function DashboardPage() {
  const contracts = useQuery({ queryKey: ["contracts"], queryFn: contractsApi.list });
  // Une requête pour toutes les cartes (voir /contracts/overview côté API) :
  // une carte par contrat qui demandait son propre résumé faisait un
  // aller-retour par contrat sur l'écran d'accueil.
  // Clé sous « contracts » : les invalidations existantes la rafraîchissent aussi.
  const overview = useQuery({
    queryKey: ["contracts", "overview"],
    queryFn: contractsApi.overview,
  });

  const ovById = useMemo(
    () => new Map((overview.data ?? []).map((o) => [o.contractId, o])),
    [overview.data]
  );

  // Contrats ouverts d'abord : c'est le travail en cours qui s'affiche en tête.
  const list = useMemo(
    () =>
      [...(contracts.data ?? [])].sort((a, b) =>
        a.status === b.status ? 0 : a.status === "OPEN" ? -1 : 1
      ),
    [contracts.data]
  );

  // Totaux toute activité confondue — ce que le tableau de bord doit dire en
  // une ligne avant le détail par contrat.
  const totals = useMemo(() => {
    const open = (contracts.data ?? []).filter((c) => c.status === "OPEN");
    const ids = new Set(open.map((c) => c.id));
    let trucks = 0;
    let brousse = 0;
    let debited = 0;
    let stock = 0;
    for (const o of overview.data ?? []) {
      if (!ids.has(o.contractId)) continue;
      trucks += o.trucksEntered;
      brousse += Number(o.brousseM3);
      debited += Number(o.debitedM3);
      stock += Number(o.stockProductsM3);
    }
    return { openCount: open.length, trucks, brousse, debited, stock };
  }, [contracts.data, overview.data]);

  const ready = !!contracts.data && !!overview.data;
  const dateLabel = today.format(new Date());

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
      />
      <div className="mx-auto max-w-page-wide px-4 py-6 short:py-3">
        {contracts.isError && (
          <QueryError error={contracts.error} onRetry={() => contracts.refetch()}>
            Impossible de charger les contrats
          </QueryError>
        )}

        {/* Synthèse des contrats ouverts : quatre chiffres sur une bande,
            puis le détail. */}
        {!contracts.isError && (
          <KpiStrip>
            {ready ? (
              <>
                <Kpi
                  bare
                  label="Camions reçus"
                  value={fmtInt(totals.trucks)}
                  hint={`${totals.openCount} contrat${totals.openCount > 1 ? "s" : ""} ouvert${totals.openCount > 1 ? "s" : ""}`}
                />
                <Kpi bare label="Cubage brousse" value={fmtM3(totals.brousse)} hint="décompté du quota" />
                <Kpi bare label="Débité" value={fmtM3(totals.debited)} hint="sortie scierie" tone="accent" />
                <Kpi bare label="Stock produits" value={fmtM3(totals.stock)} hint="disponible" tone="parc" />
              </>
            ) : (
              <>
                <SkeletonKpi />
                <SkeletonKpi />
                <SkeletonKpi />
                <SkeletonKpi />
              </>
            )}
          </KpiStrip>
        )}

        <SectionHeading
          className="mt-10"
          right={
            <Link
              to="/contracts"
              className="group -mr-2 inline-flex min-h-touch items-center gap-1 rounded-lg px-2 text-sm font-medium text-accent-700 transition-colors hover:bg-accent-50 hover:text-accent-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
            >
              Tous les contrats
              <IconArrowRight width={16} height={16} className="transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </Link>
          }
        >
          Contrats{contracts.data ? ` · ${contracts.data.length}` : ""}
        </SectionHeading>

        {contracts.data?.length === 0 && (
          <EmptyState
            action={
              <Link to="/contracts?nouveau=1" className={buttonCls("primary", "md")}>
                <IconPlus width={16} height={16} className="-ml-0.5" />
                Créer un contrat
              </Link>
            }
          >
            Aucun contrat pour l'instant.
          </EmptyState>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {contracts.isLoading && (
            <>
              <SkeletonContractCard />
              <SkeletonContractCard />
            </>
          )}
          {list.map((c) => (
            <ContractCard key={c.id} c={c} o={ovById.get(c.id)} />
          ))}
        </div>
      </div>
    </>
  );
}
