import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { ContractDTO, ContractSummaryDTO } from "@ste/shared";
import { contractsApi, downloadFile } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtFcfa, fmtM3, fmtPct } from "../lib/format";
import { FEATURES, SHOW_MONEY } from "../lib/features";
import { ContractSections } from "../components/ContractSections";
import { QuotaGauge } from "../components/QuotaGauge";
import ReceptionSection from "../components/ReceptionSection";
import EtalageSection from "../components/EtalageSection";
import TruckStatsSection from "../components/TruckStatsSection";
import ProductionSection from "../components/ProductionSection";
import CuttingSection from "../components/CuttingSection";
import SalesSection from "../components/SalesSection";
import ContainersSection from "../components/ContainersSection";
import AccountsSection from "../components/AccountsSection";
import { IconLock } from "../components/icons";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card, { BackLink, Kpi, SectionHeading } from "../components/ui/Card";
import { Notice, QueryError } from "../components/ui/Feedback";
import { SkeletonLine, SkeletonList } from "../components/ui/Skeleton";
import Tabs from "../components/ui/Tabs";

// Chaîne de mesure du bois : chaque étape a son unité (billes puis billons) et
// son cubage. Même vocabulaire que la réception (étalage → billonnage → débitage).
function FlowStep({
  step,
  label,
  value,
  sub,
  muted = false,
}: {
  step: number;
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <li
      className={`min-w-[8.5rem] flex-1 rounded-lg p-3 ${
        muted
          ? "border border-dashed border-brand-200 bg-brand-50/60"
          : "bg-brand-50 ring-1 ring-inset ring-brand-100"
      }`}
    >
      <div className="flex items-center gap-1.5 text-sm text-brand-600">
        {/* Pastille d'étape : l'ordre se lit d'un coup d'œil, même en défilant. */}
        <span
          aria-hidden
          className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
            muted ? "bg-brand-100 text-brand-500" : "bg-accent-100 text-accent-700"
          }`}
        >
          {step}
        </span>
        {label}
      </div>
      <div
        className={`mt-1.5 text-lg font-semibold tracking-tight tabular-nums ${
          muted ? "text-brand-500" : "text-brand-900"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-brand-500">{sub ?? "—"}</div>
    </li>
  );
}

function PipelineBar({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
}) {
  return (
    <div>
      {/* Téléphone : la valeur passe sous le libellé au lieu de couper les
          deux textes en colonnes étroites. */}
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-sm">
        <span className="text-brand-600">{label}</span>
        <span className="font-medium text-brand-900">{value}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-brand-100">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
      </div>
    </div>
  );
}

// La fiche contrat couvre toute la chaîne (parc → débitage → ventes → compta →
// termes). Tout empiler sur une page obligeait à traverser huit sections pour
// corriger un prix. Onglets, avec l'onglet courant dans l'URL (partageable, et
// conservé au rechargement).
// `perms` : l'onglet s'affiche si l'utilisateur a au moins une de ces
// permissions « Voir » (le parc réunit réception et étalage).
const ALL_TABS = [
  { key: "suivi", label: "Suivi" },
  { key: "parc", label: "Parc", perms: ["reception.view", "etalage.view"] },
  { key: "debitage", label: "Débitage", perms: ["debitage.view"] },
  { key: "ventes", label: "Ventes", enabled: FEATURES.sales, perms: ["ventes.view"] },
  // Empotage : les conteneurs partaient avec l'onglet Ventes, alors que le poste
  // tourne toujours quand le commercial est en veille.
  { key: "empotage", label: "Empotage", perms: ["empotage.view"] },
  { key: "compta", label: "Comptabilité", enabled: FEATURES.accounting, perms: ["compta.view"] },
  { key: "termes", label: "Termes" },
] as const;

type TabKey = (typeof ALL_TABS)[number]["key"];

const ENABLED_TABS = ALL_TABS.filter((t) => !("enabled" in t) || t.enabled);

export default function ContractDetailPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState("");
  // Onglet Parc : les deux postes cohabitent sur la fiche contrat, donc la main
  // passe de la réception à l'étalage sans quitter la page (pas de /etalage, qui
  // basculerait sur le contrat sélectionné ailleurs).
  const [etalerId, setEtalerId] = useState<string | null>(null);

  const can = useCan();
  const TABS = ENABLED_TABS.filter(
    (t) => !("perms" in t) || t.perms.some((p) => can(p))
  );
  const canParcWrite = { reception: can("reception.create"), etalage: can("etalage.create") };

  const raw = params.get("onglet");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "suivi";
  function setTab(k: TabKey) {
    setParams(k === "suivi" ? {} : { onglet: k }, { replace: true });
  }

  const q = useQuery({ queryKey: ["contracts", id], queryFn: () => contractsApi.get(id) });
  const summaryQ = useQuery({
    queryKey: ["summary", id],
    queryFn: () => contractsApi.summary(id),
  });

  const del = useMutation({
    mutationFn: () => contractsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      nav("/contracts");
    },
  });

  // Squelette à la forme de la fiche (retour, titre, jauge, tableau) : la page
  // ne saute pas quand le contrat arrive.
  if (q.isLoading)
    return (
      <div className="mx-auto max-w-page-wide px-4 py-6 short:py-3" aria-busy="true">
        <SkeletonLine className="w-24" />
        <SkeletonLine className="mt-5 h-7 w-56 max-w-full" />
        <SkeletonLine className="mt-3 w-96 max-w-full" />
        <div className="mt-8">
          <SkeletonList count={2} lines={3} />
        </div>
      </div>
    );
  if (q.isError || !q.data)
    return (
      <div className="mx-auto max-w-page-wide px-4 py-6 short:py-3">
        <BackLink to="/contracts">Contrats</BackLink>
        <div className="mt-3">
          <QueryError error={q.error} onRetry={() => q.refetch()}>
            Impossible d'ouvrir ce contrat
          </QueryError>
        </div>
      </div>
    );

  const c: ContractDTO = q.data;
  const s: ContractSummaryDTO | undefined = summaryQ.data;
  const meta = [
    c.year,
    c.forest,
    c.managementCenter,
    c.signedAt && `signé le ${new Date(c.signedAt).toLocaleDateString("fr-FR")}`,
    c.durationMonths && `${c.durationMonths} mois`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-page-wide px-4 py-6 short:py-3">
      <BackLink to="/contracts">Contrats</BackLink>

      {/* Téléphone : les actions passent sous le titre plutôt que de couper le
          n° de contrat en deux (« CT- » / « 2026-014 »). */}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-title font-semibold tracking-tight text-brand-900">
            <span className="whitespace-nowrap">{c.code}</span>
            <Badge tone={c.status === "OPEN" ? "parc" : "brand"}>
              {c.status === "OPEN" ? "Ouvert" : "Clôturé"}
            </Badge>
          </h1>
          {meta && <div className="mt-1 text-sm text-brand-600">{meta}</div>}
        </div>
        <div className="flex gap-3">
          {can("contracts.export") && (
            <Button
              size="sm"
              onClick={() => downloadFile(`/contracts/${c.id}/export.xlsx`, `contrat-${c.code}.xlsx`)}
            >
              Exporter Excel
            </Button>
          )}
          {can("contracts.delete") && (
          <Button
            variant="ghost-danger"
            size="sm"
            onClick={() => {
              setDelText("");
              setDelOpen((s) => !s);
            }}
          >
            Supprimer
          </Button>
          )}
        </div>
      </div>

      {/* Suppression en cascade : camions, étalages, ventes et compta partent
          avec le contrat. Le débitage, les conteneurs et le resciage restent —
          ils appartiennent au stock général et perdent seulement le lien.
          Recopier le n° évite le clic réflexe sur une boîte de dialogue —
          c'est irréversible et il n'y a pas d'annulation. */}
      {delOpen && (
        <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-4">
          <div className="text-sm font-semibold text-red-800">
            Supprimer définitivement le contrat {c.code} ?
          </div>
          <p className="mt-1 text-sm text-red-700">
            {s
              ? `${s.trucksEntered} camion${s.trucksEntered > 1 ? "s" : ""}, leurs étalages et billonnages, les ventes et la comptabilité seront effacés.`
              : "Les camions, étalages, ventes et la comptabilité du contrat seront effacés."}{" "}
            Action irréversible. Le débitage, les conteneurs et le resciage restent au stock
            général : ils perdent seulement le lien avec ce contrat.
          </p>
          <label className="mt-3 flex flex-col gap-1 text-sm">
            <span className="text-red-800">
              Taper <strong className="font-semibold">{c.code}</strong> pour confirmer
            </span>
            <input
              value={delText}
              onChange={(e) => setDelText(e.target.value)}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={c.code}
              className="min-h-touch rounded-lg border border-red-300 bg-white px-3 py-2 text-base outline-none transition-[border-color,box-shadow] focus:border-red-600 focus:ring-[3px] focus:ring-red-600/20 sm:max-w-xs"
            />
          </label>
          {del.isError && (
            <p className="mt-2 text-sm text-red-700">
              Suppression échouée : {(del.error as Error).message}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="danger"
              onClick={() => del.mutate()}
              disabled={delText.trim() !== c.code || del.isPending}
            >
              {del.isPending ? "Suppression…" : "Supprimer définitivement"}
            </Button>
            <Button onClick={() => setDelOpen(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {c.note && <p className="mt-2 text-sm text-brand-600">{c.note}</p>}

      {/* Contrat clôturé : l'API refuse toute opération métier (409). */}
      {c.status === "CLOSED" && (
        <Notice icon={IconLock} className="mt-3">
          Contrat clôturé — lecture seule. Le repasser en « Ouvert » dans{" "}
          <button
            type="button"
            onClick={() => setTab("termes")}
            className="font-medium underline hover:text-brand-900"
          >
            Termes
          </button>{" "}
          pour corriger une saisie.
        </Notice>
      )}

      <Tabs className="mt-5" tabs={TABS} value={tab} onChange={setTab} label="Sections du contrat" />

      {tab === "suivi" && (
        <>
        {/* Jauge quota — cœur du suivi : alimentée par chaque réception camion */}
        {s && (
          <div className="mt-4">
            <QuotaGauge
              brousseM3={s.brousseM3}
              quotaM3={c.quotaM3}
              girthM3={s.girthM3}
              trucksEntered={s.trucksEntered}
              trucksPlanned={c.trucksPlanned}
              trucksSawn={s.trucksSawn}
              avgBrousseM3PerTruck={s.avgBrousseM3PerTruck}
              estTrucksRemaining={s.estTrucksRemaining}
              estTrucksTotal={s.estTrucksTotal}
            />
          </div>
        )}

        {/* Pipeline — tout dérivé des opérations */}
        {s && (
          <section className="mt-8">
            <SectionHeading>Pipeline</SectionHeading>
            <Card className="space-y-3">
              {/* Chaîne de mesure — mêmes étapes et mêmes mots que la réception.
                  Liste ordonnée : l'ordre est le sens du bois. */}
              <ol className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <FlowStep
                  step={1}
                  label="Brousse"
                  value={fmtM3(s.brousseM3)}
                  sub={`${s.trucksEntered} camion${s.trucksEntered > 1 ? "s" : ""} · quota`}
                  muted={Number(s.brousseM3) === 0}
                />
                <FlowStep
                  step={2}
                  label="Étalage billes"
                  value={fmtM3(s.diaM3)}
                  sub={s.billeCount > 0 ? `${s.billeCount} billes` : undefined}
                  muted={Number(s.diaM3) === 0}
                />
                <FlowStep
                  step={3}
                  label="Billonnage"
                  value={fmtM3(s.girthM3)}
                  sub={s.billonCount > 0 ? `${s.billonCount} billons` : undefined}
                  muted={Number(s.girthM3) === 0}
                />
                <FlowStep
                  step={4}
                  label="Débitage"
                  value={fmtM3(s.debitedM3)}
                  sub={
                    Number(s.debitedM3) > 0
                      ? `rendement ${fmtPct(Number(s.outputPct))}`
                      : undefined
                  }
                  muted={Number(s.debitedM3) === 0}
                />
              </ol>

              {/* Avancement du sciage (part des billons passés à la scie). Le
                  rendement, lui, se lit à l'étape 4 : débité ÷ billons sciés. */}
              {(() => {
                const girth = Number(s.girthM3);
                const sawnPct = girth > 0 ? (Number(s.sawnGirthM3) / girth) * 100 : 0;
                return (
                  <PipelineBar
                    label={`Sciage — ${s.trucksSawn} camion${s.trucksSawn > 1 ? "s" : ""} scié${s.trucksSawn > 1 ? "s" : ""} · ${s.trucksOnParcUncut} sur parc`}
                    value={`${fmtPct(sawnPct, 0)} des billons passés à la scie`}
                    pct={sawnPct}
                    color="bg-accent-500"
                  />
                );
              })()}
              {(Number(s.girthM3) > 0 || Number(s.debitedM3) > 0) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {/* Perte au parc : brousse (brut forêt) vs billes étalées — écorce,
                      nettoyage, sur-déclaration. Anomalie forte = à creuser. */}
                  {Number(s.brousseM3) > 0 && Number(s.diaM3) > 0 && (
                    <Badge
                      tone={1 - Number(s.diaM3) / Number(s.brousseM3) > 0.25 ? "amber" : "brand"}
                      title="Écart entre le cubage brousse déclaré et les billes mesurées à l'étalage"
                    >
                      Perte brousse → parc :{" "}
                      {fmtPct((1 - Number(s.diaM3) / Number(s.brousseM3)) * 100, 1)}
                    </Badge>
                  )}
                  {Number(s.girthM3) > 0 && (
                    <Badge tone="parc">
                      Billons ≥85 cm : {fmtM3(s.girthGte85M3)} · &lt;85 : {fmtM3(s.girthLt85M3)}
                    </Badge>
                  )}
                  {Number(s.debitedM3) > 0 && (
                    <>
                      <Badge tone="info">
                        Long 6,5ft+ : {fmtM3(s.longM3)} ({fmtPct(Number(s.longPct), 0)}) · court :{" "}
                        {fmtM3(s.shortM3)}
                      </Badge>
                      <Badge tone="accent">1" : {fmtPct(Number(s.oneInchPct))}</Badge>
                    </>
                  )}
                </div>
              )}
              {/* Quatre colonnes seulement quand l'argent s'affiche : sans lui,
                  deux tuiles sur une grille de quatre laissaient une demi-rangée vide. */}
              <div className={`grid grid-cols-2 gap-3 pt-1 ${SHOW_MONEY ? "sm:grid-cols-4" : ""}`}>
                <Kpi inset label="Stock produits" value={fmtM3(s.stockProductsM3)} />
                <Kpi inset label="Stock parc (billons)" value={fmtM3(s.stockParcM3)} />
                {/* Argent : dépend des ventes et de la compta, en veille tous les deux. */}
                {SHOW_MONEY && (
                  <>
                    <Kpi inset label="Vendu" value={fmtM3(s.soldM3)} />
                    <Kpi inset label="CA ventes" value={fmtFcfa(s.salesRevenueCfa)} />
                    <Kpi inset label="Full cost" value={fmtFcfa(s.fullCost)} />
                    <Kpi inset label="Payé" value={fmtFcfa(s.totalPaid)} />
                    <Kpi inset label="Solde" value={fmtFcfa(s.balance)} />
                    <Kpi inset label="Profit estimé" value={fmtFcfa(s.profitEstimate)} />
                  </>
                )}
              </div>
            </Card>
          </section>
        )}

        {/* Le tableau du classeur : une ligne par camion, du comptage parc au
            coût du m³ débité. C'est la vue que le bureau ouvre en premier. */}
        <TruckStatsSection contract={c} />
        </>
      )}

      {tab === "parc" && (
        <>
          <ReceptionSection
            contractId={c.id}
            closed={c.status === "CLOSED" || !canParcWrite.reception}
            onEtaler={(truckId) => setEtalerId(truckId)}
          />
          <EtalageSection
            contractId={c.id}
            closed={c.status === "CLOSED" || !canParcWrite.etalage}
            openTruckId={etalerId}
            onOpened={() => setEtalerId(null)}
          />
        </>
      )}

      {tab === "debitage" && (
        <>
          <ProductionSection contractId={c.id} />
          <CuttingSection contractId={c.id} />
        </>
      )}

      {tab === "ventes" && s && <SalesSection contract={c} stock={s.stockBySize} />}

      {/* L'empotage puise dans le stock général : les nouveaux conteneurs ne
          portent plus de contrat. Ne restent ici que les anciens. */}
      {tab === "empotage" && (
        <>
          <Notice className="mt-4">
            L'empotage se fait sur le stock général —{" "}
            <Link to="/empotage" className="font-medium underline hover:text-brand-900">
              page Empotage
            </Link>
            . Ici ne restent que les conteneurs rattachés à ce contrat.
          </Notice>
          <ContainersSection contractId={c.id} />
        </>
      )}

      {tab === "compta" && <AccountsSection contractId={c.id} />}

      {/* Termes — saisie progressive, chaque carte s'édite et s'enregistre seule */}
      {tab === "termes" && (
        <section className="mt-5">
          <SectionHeading>Termes du contrat</SectionHeading>
          <ContractSections
            readOnly={!can("contracts.edit")}
            contract={c}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["contracts", id] });
              qc.invalidateQueries({ queryKey: ["summary", id] });
            }}
          />
        </section>
      )}
    </div>
  );
}
