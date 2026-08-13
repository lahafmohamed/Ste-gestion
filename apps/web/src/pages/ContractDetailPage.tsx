import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { ContractDTO, ContractSummaryDTO } from "@ste/shared";
import { contractsApi, downloadFile } from "../lib/api";
import { fmtFcfa, fmtM3, fmtPct } from "../lib/format";
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
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card, { BackLink, Kpi, SectionHeading } from "../components/ui/Card";

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
    <div
      className={`min-w-[8.5rem] flex-1 rounded-lg border p-3 ${
        muted ? "border-dashed border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-baseline gap-1.5 text-xs text-slate-500">
        <span className="tabular-nums text-slate-400">{step}</span>
        {label}
      </div>
      <div
        className={`mt-1 font-semibold tabular-nums ${muted ? "text-slate-400" : "text-slate-900"}`}
      >
        {value}
      </div>
      <div className="text-xs text-slate-400">{sub ?? "—"}</div>
    </div>
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
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-900">{value}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
      </div>
    </div>
  );
}

// La fiche contrat couvre toute la chaîne (parc → débitage → ventes → compta →
// termes). Tout empiler sur une page obligeait à traverser huit sections pour
// corriger un prix. Onglets, avec l'onglet courant dans l'URL (partageable, et
// conservé au rechargement).
const TABS = [
  { key: "suivi", label: "Suivi" },
  { key: "parc", label: "Parc" },
  { key: "debitage", label: "Débitage" },
  { key: "ventes", label: "Ventes" },
  { key: "compta", label: "Comptabilité" },
  { key: "termes", label: "Termes" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

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

  if (q.isLoading) return <p className="p-6 text-sm text-slate-500">Chargement…</p>;
  if (q.isError || !q.data)
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">Contrat introuvable.</p>
        <Link to="/contracts" className="text-sm text-slate-500 underline">
          ← Retour
        </Link>
      </div>
    );

  const c: ContractDTO = q.data;
  const s: ContractSummaryDTO | undefined = summaryQ.data;

  return (
    <div className="mx-auto max-w-page px-4 py-6">
      <BackLink to="/contracts">Contrats</BackLink>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{c.code}</h1>
          <div className="text-sm text-slate-500">
            {c.status === "OPEN" ? "Ouvert" : "Clôturé"}
            {c.year ? ` · ${c.year}` : ""}
            {c.forest ? ` · ${c.forest}` : ""}
            {c.managementCenter ? ` · ${c.managementCenter}` : ""}
            {c.signedAt
              ? ` · signé le ${new Date(c.signedAt).toLocaleDateString("fr-FR")}`
              : ""}
            {c.durationMonths ? ` · ${c.durationMonths} mois` : ""}
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            size="sm"
            onClick={() => downloadFile(`/contracts/${c.id}/export.xlsx`, `contrat-${c.code}.xlsx`)}
          >
            Exporter Excel
          </Button>
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
        </div>
      </div>

      {/* Suppression en cascade : camions, étalages, sciage, ventes, conteneurs
          et compta partent avec le contrat. Recopier le n° évite le clic réflexe
          sur une boîte de dialogue — c'est irréversible et il n'y a pas d'annulation. */}
      {delOpen && (
        <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-4">
          <div className="text-sm font-semibold text-red-800">
            Supprimer définitivement le contrat {c.code} ?
          </div>
          <p className="mt-1 text-sm text-red-700">
            {s
              ? `${s.trucksEntered} camion${s.trucksEntered > 1 ? "s" : ""}, leurs étalages et billonnages, le sciage, les ventes, les conteneurs et la comptabilité seront effacés.`
              : "Toutes les opérations du contrat seront effacées."}{" "}
            Action irréversible.
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
              className="min-h-touch rounded-lg border border-red-300 bg-white px-3 py-2 text-base outline-none focus:border-red-600 sm:max-w-xs"
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

      {c.note && <p className="mt-2 text-sm text-slate-600">{c.note}</p>}

      {/* Contrat clôturé : l'API refuse toute opération métier (409). */}
      {c.status === "CLOSED" && (
        <div className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          🔒 Contrat clôturé — lecture seule. Le repasser en « Ouvert » dans{" "}
          <button
            type="button"
            onClick={() => setTab("termes")}
            className="underline hover:text-slate-900"
          >
            Termes
          </button>{" "}
          pour corriger une saisie.
        </div>
      )}

      {/* overflow-x-auto force aussi overflow-y en auto (règle CSS) : le -mb-px des
          onglets déborde d'1px et Chrome affiche une barre de défilement verticale
          fantôme à droite. Barres masquées, le glissement tactile reste possible. */}
      <div className="-mx-4 mt-4 overflow-x-auto border-b border-slate-200 px-4 scrollbar-none">
        <div className="flex min-w-max gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`-mb-px min-h-touch whitespace-nowrap border-b-2 px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-900 ${
                tab === t.key
                  ? "border-slate-900 font-medium text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-900 active:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

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
          <section className="mt-5">
            <SectionHeading>Pipeline</SectionHeading>
            <Card className="space-y-3">
              {/* Chaîne de mesure — mêmes étapes et mêmes mots que la réception. */}
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
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
              </div>

              <PipelineBar
                label={`Débitage — ${s.trucksSawn} camion${s.trucksSawn > 1 ? "s" : ""} scié${s.trucksSawn > 1 ? "s" : ""} · ${s.trucksOnParcUncut} sur parc`}
                value={`${fmtM3(s.debitedM3)} (${fmtPct(Number(s.outputPct))} des billons)`}
                pct={Number(s.outputPct)}
                color="bg-sky-500"
              />
              {(Number(s.girthM3) > 0 || Number(s.debitedM3) > 0) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {/* Perte au parc : brousse (brut forêt) vs billes étalées — écorce,
                      nettoyage, sur-déclaration. Anomalie forte = à creuser. */}
                  {Number(s.brousseM3) > 0 && Number(s.diaM3) > 0 && (
                    <Badge
                      tone={1 - Number(s.diaM3) / Number(s.brousseM3) > 0.25 ? "amber" : "slate"}
                      title="Écart entre le cubage brousse déclaré et les billes mesurées à l'étalage"
                    >
                      Perte brousse → parc :{" "}
                      {fmtPct((1 - Number(s.diaM3) / Number(s.brousseM3)) * 100, 1)}
                    </Badge>
                  )}
                  {Number(s.girthM3) > 0 && (
                    <Badge tone="emerald">
                      Billons ≥85 cm : {fmtM3(s.girthGte85M3)} · &lt;85 : {fmtM3(s.girthLt85M3)}
                    </Badge>
                  )}
                  {Number(s.debitedM3) > 0 && (
                    <>
                      <Badge tone="sky">
                        Long 6,5ft+ : {fmtM3(s.longM3)} ({fmtPct(Number(s.longPct), 0)}) · court :{" "}
                        {fmtM3(s.shortM3)}
                      </Badge>
                      <Badge tone="violet">1" : {fmtPct(Number(s.oneInchPct))}</Badge>
                    </>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
                <Kpi label="Stock produits" value={fmtM3(s.stockProductsM3)} />
                <Kpi label="Stock parc (billons)" value={fmtM3(s.stockParcM3)} />
                <Kpi label="Vendu" value={fmtM3(s.soldM3)} />
                <Kpi label="CA ventes" value={fmtFcfa(s.salesRevenueCfa)} />
                <Kpi label="Full cost" value={fmtFcfa(s.fullCost)} />
                <Kpi label="Payé" value={fmtFcfa(s.totalPaid)} />
                <Kpi label="Solde" value={fmtFcfa(s.balance)} />
                <Kpi label="Profit estimé" value={fmtFcfa(s.profitEstimate)} />
              </div>
            </Card>
          </section>
        )}

        </>
      )}

      {tab === "parc" && (
        <>
          <ReceptionSection
            contractId={c.id}
            closed={c.status === "CLOSED"}
            onEtaler={(truckId) => {
              if (truckId) setEtalerId(truckId);
              else
                document
                  .getElementById("etalage")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
          <EtalageSection
            contractId={c.id}
            closed={c.status === "CLOSED"}
            openTruckId={etalerId}
            onOpened={() => setEtalerId(null)}
          />
          <TruckStatsSection contractId={c.id} />
        </>
      )}

      {tab === "debitage" && (
        <>
          <ProductionSection contractId={c.id} />
          <CuttingSection contractId={c.id} />
        </>
      )}

      {tab === "ventes" && (
        <>
          {s && <SalesSection contract={c} stock={s.stockBySize} />}
          <ContainersSection contractId={c.id} />
        </>
      )}

      {tab === "compta" && <AccountsSection contractId={c.id} />}

      {/* Termes — saisie progressive, chaque carte s'édite et s'enregistre seule */}
      {tab === "termes" && (
        <section className="mt-5">
          <SectionHeading>Termes du contrat</SectionHeading>
          <ContractSections
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
