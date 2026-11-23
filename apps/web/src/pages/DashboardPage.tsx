import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  suiviColumnIndex,
  suiviColumnLabel,
  type ContractDTO,
  type ContractOverviewDTO,
  type ParcOverviewDTO,
  type ParcQueueTruckDTO,
} from "@ste/shared";
import { contractsApi, dashboardApi, stockApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtDec3, fmtFcfa, fmtInt, fmtM3, fmtPct } from "../lib/format";
import { SHOW_MONEY } from "../lib/features";
import { truckLabel } from "../lib/trucks";
import { rememberSelectedContract } from "../hooks/useSelectedContract";
import { PageHeader } from "../components/Layout";
import { QuotaTrack } from "../components/QuotaGauge";
import Badge from "../components/ui/Badge";
import { SectionHeading, cardCls } from "../components/ui/Card";
import { EmptyState, Notice, QueryError } from "../components/ui/Feedback";
import { buttonCls } from "../components/ui/Button";
import { SkeletonLine } from "../components/ui/Skeleton";
import { IconArrowRight, IconChevronRight, IconPlus } from "../components/icons";

// Tableau de bord — trois questions, dans l'ordre où le bureau les pose le
// matin : où en est le parc (camions reçus qui attendent une étape), où en
// sont les quotas brousse, que vaut le stock d'avivés. Chaque bloc ouvre la
// page qui permet d'agir dessus.

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500";

/** « 3 camions », « 1 camion ». */
const plural = (n: number, word: string) => `${fmtInt(n)} ${word}${n > 1 ? "s" : ""}`;

/** Jours calendaires écoulés depuis l'arrivée (0 = aujourd'hui). */
function daysSince(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(Math.round((b - a) / 86_400_000), 0);
}

function sinceLabel(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `${fmtInt(days)} j`;
}

/** « arrivé hier », « arrivé il y a 4 j ». */
function arrivedLabel(days: number): string {
  return days <= 1 ? `arrivé ${sinceLabel(days)}` : `arrivé il y a ${sinceLabel(days)}`;
}

/** Lien discret à droite d'un titre de section. */
function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`group -mr-2 inline-flex min-h-touch items-center gap-1 rounded-lg px-2 text-sm font-medium text-accent-700 transition-colors hover:bg-accent-50 hover:text-accent-800 ${FOCUS}`}
    >
      {children}
      <IconArrowRight
        width={16}
        height={16}
        className="transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}

// ── Parc : camions par étape ───────────────────────────────────────────

// Une teinte par étape, reprise par la barre de répartition et la pastille
// de chaque cellule : ambre = rien n'est mesuré (ce qui presse), sève = la
// chaîne du parc, teck = la scierie.
const STAGE_DOT = {
  spread: "bg-amber-500",
  buck: "bg-parc-500",
  saw: "bg-accent-500",
} as const;

/** Cellule de la bande parc : un chiffre, et la page de l'étape au clic. */
function StageCell({
  to,
  dot,
  label,
  value,
  hint,
  alert = false,
  className = "",
}: {
  /** Absent : le compte n'a pas accès à la page, la cellule reste un chiffre. */
  to?: string;
  dot: keyof typeof STAGE_DOT;
  label: string;
  value: number;
  hint: ReactNode;
  /** Chiffre en ambre : des camions attendent leur première mesure. */
  alert?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm text-brand-600">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${STAGE_DOT[dot]}`} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {to && (
          <IconArrowRight
            width={16}
            height={16}
            className="shrink-0 text-brand-500 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        )}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold leading-tight tracking-tight ${
          alert ? "text-amber-700" : "text-brand-900"
        }`}
      >
        {fmtInt(value)}
      </div>
      <div className="mt-0.5 text-xs text-brand-500">{hint}</div>
    </>
  );
  const cls = `bg-white px-4 py-3.5 ${className}`;
  return to ? (
    <Link
      to={to}
      className={`group ${cls} transition-colors duration-150 hover:bg-brand-50 active:bg-brand-100 ${FOCUS} focus-visible:-outline-offset-2`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ParcStrip({ parc }: { parc: ParcOverviewDTO }) {
  const can = useCan();
  const total = parc.trucksOnParc;
  const oldest = parc.queue.find((t) => t.stage === "A_ETALER");
  const segments = [
    { key: "spread", n: parc.toSpread },
    { key: "buck", n: parc.toBuck },
    { key: "saw", n: parc.toSaw },
  ] as const;

  const hero = (
    <>
      <div className="flex items-center gap-2 text-sm text-brand-600">
        <span className="min-w-0 flex-1 truncate">Camions sur parc</span>
        {can("reception.view") && (
          <IconArrowRight
            width={16}
            height={16}
            className="shrink-0 text-brand-500 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        )}
      </div>
      <div className="mt-1 text-4xl font-semibold leading-none tracking-tight text-brand-900">
        {fmtInt(total)}
      </div>
      {/* Répartition par étape : les trois cellules voisines servent de légende. */}
      <div
        role="img"
        aria-label={`${parc.toSpread} à étaler, ${parc.toBuck} à billonner, ${parc.toSaw} à scier`}
        className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-brand-100"
      >
        {total > 0 &&
          segments.map(
            (s) =>
              s.n > 0 && (
                <span key={s.key} className={STAGE_DOT[s.key]} style={{ flexGrow: s.n, flexBasis: 0 }} />
              )
          )}
      </div>
      <div className="mt-2 text-xs text-brand-500">
        {total > 0 ? "reçus, une étape reste à faire" : "aucun camion en attente"}
      </div>
    </>
  );
  const heroCls = "col-span-2 bg-white px-4 py-3.5 md:col-span-1";

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-brand-100 shadow-card md:grid-cols-[1.35fr_1fr_1fr_1fr]">
      {can("reception.view") ? (
        <Link
          to="/reception"
          className={`group ${heroCls} transition-colors duration-150 hover:bg-brand-50 active:bg-brand-100 ${FOCUS} focus-visible:-outline-offset-2`}
        >
          {hero}
        </Link>
      ) : (
        <div className={heroCls}>{hero}</div>
      )}
      <StageCell
        to={can("etalage.view") ? "/etalage" : undefined}
        dot="spread"
        label="Non étalés"
        value={parc.toSpread}
        alert={parc.toSpread > 0}
        hint={
          oldest
            ? `le plus ancien : ${arrivedLabel(daysSince(oldest.arrivedAt))}`
            : "tout est étalé"
        }
      />
      <StageCell
        to={can("etalage.view") ? "/etalage" : undefined}
        dot="buck"
        label="À billonner"
        value={parc.toBuck}
        hint="étalés, à tronçonner"
      />
      <StageCell
        to={can("debitage.view") ? "/debitage" : undefined}
        dot="saw"
        label="À scier"
        value={parc.toSaw}
        hint={
          parc.toSaw > 0
            ? `${fmtM3(parc.parcM3)} · ${plural(parc.parcBillons, "billon")}`
            : "aucun billon au parc"
        }
        className="col-span-2 md:col-span-1"
      />
    </div>
  );
}

function SkeletonStrip() {
  return (
    <div
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-brand-100 shadow-card md:grid-cols-[1.35fr_1fr_1fr_1fr]"
      aria-hidden
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`bg-white px-4 py-3.5 ${i === 0 || i === 3 ? "col-span-2 md:col-span-1" : ""}`}
        >
          <SkeletonLine className="w-1/2" />
          <SkeletonLine className="mt-3 h-6 w-1/3" />
          <SkeletonLine className="mt-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

// ── File du parc ───────────────────────────────────────────────────────

const QUEUE_MAX = 6;

function QueueRow({ t }: { t: ParcQueueTruckDTO }) {
  const can = useCan();
  const label = truckLabel(t);
  // Colonne étroite : le contrat et le nombre de billes annoncé, pas l'immat
  // (le libellé identifie déjà le voyage, la fiche camion a le reste).
  const meta = [t.contractCode, t.declaredLogCount ? plural(t.declaredLogCount, "bille") : null]
    .filter(Boolean)
    .join(" · ");
  const days = daysSince(t.arrivedAt);
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-brand-900">{label}</span>
          <Badge tone={t.stage === "A_ETALER" ? "amber" : "parc"} className="shrink-0">
            {t.stage === "A_ETALER" ? "À étaler" : "À billonner"}
          </Badge>
        </div>
        <div className="mt-0.5 truncate text-sm text-brand-500">{meta}</div>
      </div>
      <span className="shrink-0 text-sm tabular-nums text-brand-600">{sinceLabel(days)}</span>
    </>
  );
  const cls = "flex min-h-touch items-center gap-3 px-4 py-3";
  // Sans accès à l'étalage, la fiche camion reste lisible par tous les postes.
  const to = can("etalage.view") ? `/etalage?truck=${t.truckId}` : `/trucks/${t.truckId}`;
  return (
    <Link
      to={to}
      // L'étalage travaille par contrat : il doit s'ouvrir sur celui du camion.
      onClick={() => can("etalage.view") && rememberSelectedContract(t.contractId)}
      className={`group ${cls} transition-colors duration-150 hover:bg-brand-50 active:bg-brand-100 ${FOCUS} focus-visible:-outline-offset-2`}
    >
      {body}
      <IconChevronRight
        width={16}
        height={16}
        strokeWidth={2}
        className="shrink-0 text-brand-500 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}

function QueueCard({ queue }: { queue: ParcQueueTruckDTO[] }) {
  // Ce qui n'est pas encore mesuré d'abord, puis le billonnage ; dans chaque
  // groupe le plus ancien en tête (ordre de l'API).
  const sorted = useMemo(
    () => [...queue].sort((a, b) => (a.stage === b.stage ? 0 : a.stage === "A_ETALER" ? -1 : 1)),
    [queue]
  );
  if (sorted.length === 0) {
    return <EmptyState>Aucun camion n'attend le parc : tout est étalé et billonné.</EmptyState>;
  }
  const rest = sorted.length - QUEUE_MAX;
  return (
    <div className={`${cardCls} overflow-hidden`}>
      <ul className="divide-y divide-brand-100">
        {sorted.slice(0, QUEUE_MAX).map((t) => (
          <li key={t.truckId}>
            <QueueRow t={t} />
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <p className="border-t border-brand-100 px-4 py-3 text-sm text-brand-600">
          {rest > 1 ? `et ${fmtInt(rest)} autres camions` : "et 1 autre camion"} dans la file de
          l'étalage
        </p>
      )}
    </div>
  );
}

// ── Quota brousse ──────────────────────────────────────────────────────

type QuotaLine = {
  c: ContractDTO;
  o: ContractOverviewDTO;
  quota: number;
  brousse: number;
  pct: number;
  remaining: number;
  over: number;
  /** Projection : camions encore nécessaires à la moyenne des arrivées. */
  estRemaining: number | null;
};

function quotaLine(c: ContractDTO, o: ContractOverviewDTO): QuotaLine {
  const quota = Number(c.quotaM3);
  const brousse = Number(o.brousseM3);
  return {
    c,
    o,
    quota,
    brousse,
    pct: quota > 0 ? (brousse / quota) * 100 : 0,
    remaining: Math.max(quota - brousse, 0),
    over: quota > 0 ? Math.max(brousse - quota, 0) : 0,
    estRemaining: o.estTrucksTotal != null ? Math.max(o.estTrucksTotal - o.trucksEntered, 0) : null,
  };
}

/** Ce qu'il reste du quota, et ce que ça représente en camions. */
function remainingLabel(l: Pick<QuotaLine, "quota" | "remaining" | "over" | "estRemaining">) {
  if (l.quota <= 0) return <span>quota non renseigné</span>;
  if (l.over > 0) {
    return <span className="font-medium text-red-700">dépassé de {fmtM3(l.over)}</span>;
  }
  if (l.remaining === 0) return <span className="font-medium text-parc-800">quota atteint</span>;
  return (
    <span>
      reste {fmtM3(l.remaining)}
      {l.estRemaining != null && l.estRemaining > 0 && ` · ≈ ${plural(l.estRemaining, "camion")}`}
    </span>
  );
}

function ContractQuotaRow({ l }: { l: QuotaLine }) {
  const can = useCan();
  const showMoney = SHOW_MONEY && can("finances.view");
  const { c, o } = l;
  const place = [c.forest, c.managementCenter].filter(Boolean).join(" · ");
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 truncate">
          <span className="font-semibold text-brand-900">{c.code}</span>
          {place && <span className="ml-2 text-sm text-brand-500">{place}</span>}
        </div>
        {l.quota > 0 && (
          <span
            className={`shrink-0 text-sm font-medium tabular-nums ${
              l.pct >= 100 ? "text-red-700" : "text-brand-700"
            }`}
          >
            {fmtPct(l.pct, 0)}
          </span>
        )}
      </div>
      <div className="mt-2">
        <QuotaTrack pct={l.pct} label={`Quota brousse ${c.code}`} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-sm tabular-nums text-brand-600">
        <span>
          {fmtM3(l.brousse)}
          {l.quota > 0 && ` / ${fmtM3(l.quota)}`}
        </span>
        {remainingLabel(l)}
      </div>
      <div className="mt-1 text-xs tabular-nums text-brand-500">
        {plural(o.trucksEntered, "camion")} reçu{o.trucksEntered > 1 ? "s" : ""} ·{" "}
        {fmtInt(o.trucksSawn)} scié{o.trucksSawn > 1 ? "s" : ""}
        {Number(o.debitedM3) > 0 && ` · rendement ${fmtPct(Number(o.outputPct))}`}
        {showMoney && ` · solde ${fmtFcfa(o.balance)}`}
      </div>
    </>
  );
  const cls = "block px-5 py-4";
  return can("contracts.view") ? (
    <Link
      to={`/contracts/${c.id}`}
      className={`${cls} transition-colors duration-150 hover:bg-brand-50 active:bg-brand-100 ${FOCUS} focus-visible:-outline-offset-2`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function QuotaCard({ lines, closedCount }: { lines: QuotaLine[]; closedCount: number }) {
  // Cumul sur les contrats dont le quota est renseigné : un quota à zéro
  // fausserait le pourcentage sans rien dire du bois reçu.
  const withQuota = lines.filter((l) => l.quota > 0);
  const quota = withQuota.reduce((s, l) => s + l.quota, 0);
  const brousse = withQuota.reduce((s, l) => s + l.brousse, 0);
  const all = {
    quota,
    remaining: Math.max(quota - brousse, 0),
    over: quota > 0 ? Math.max(brousse - quota, 0) : 0,
    estRemaining: withQuota.some((l) => l.estRemaining != null)
      ? withQuota.reduce((s, l) => s + (l.over > 0 ? 0 : (l.estRemaining ?? 0)), 0)
      : null,
  };
  const pct = quota > 0 ? (brousse / quota) * 100 : 0;
  const trucks = lines.reduce((s, l) => s + l.o.trucksEntered, 0);

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="text-sm text-brand-600">
              {lines.length > 1 ? `Les ${lines.length} contrats ouverts` : "Contrat ouvert"}
            </div>
            <div className="mt-1 text-3xl font-semibold leading-tight tracking-tight tabular-nums text-brand-900">
              {fmtM3(brousse)}
              {quota > 0 && (
                <span className="text-base font-normal text-brand-500"> / {fmtM3(quota)}</span>
              )}
            </div>
          </div>
          {quota > 0 && (
            <div className="tabular-nums sm:text-right">
              <div
                className={`text-2xl font-semibold leading-tight tracking-tight ${
                  pct >= 100 ? "text-red-700" : "text-brand-900"
                }`}
              >
                {fmtPct(pct, 1)}
              </div>
              <div className="text-xs text-brand-500">du quota brousse</div>
            </div>
          )}
        </div>
        <div className="mt-3">
          <QuotaTrack pct={pct} label="Quota brousse, tous contrats ouverts" thick />
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-sm tabular-nums text-brand-600">
          <span>
            {plural(trucks, "camion")} reçu{trucks > 1 ? "s" : ""}
          </span>
          {remainingLabel(all)}
        </div>
      </div>
      <ul className="divide-y divide-brand-100 border-t border-brand-100">
        {lines.map((l) => (
          <li key={l.c.id}>
            <ContractQuotaRow l={l} />
          </li>
        ))}
      </ul>
      {closedCount > 0 && (
        <p className="border-t border-brand-100 px-5 py-3 text-xs text-brand-500">
          {closedCount > 1
            ? `${closedCount} contrats clôturés ne sont pas comptés.`
            : "1 contrat clôturé n'est pas compté."}
        </p>
      )}
    </div>
  );
}

function SkeletonQuota() {
  return (
    <div className={`${cardCls} p-5`} aria-hidden>
      <SkeletonLine className="w-1/4" />
      <SkeletonLine className="mt-3 h-7 w-1/2" />
      <SkeletonLine className="mt-4 w-full" />
      <div className="mt-6 space-y-5 border-t border-brand-100 pt-5">
        <SkeletonLine className="w-2/3" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-1/2" />
      </div>
    </div>
  );
}

// ── Stock avivés par taille ────────────────────────────────────────────

type SizeRow = { key: string; label: string; m3: number; pieces: number };

function StockSection() {
  const inventory = useQuery({
    queryKey: ["stock", "inventory"],
    queryFn: () => stockApi.sawnInventory(),
  });

  // Une ligne par produit du classeur SUIVI (8" +, 6X3 B, 1 inch…), dans son
  // ordre — la même lecture que l'onglet Stock.
  const { sizes, stockM3, pieces, reserved, reservedM3, negatives } = useMemo(() => {
    const m = new Map<string, SizeRow>();
    let stockM3 = 0;
    let pieces = 0;
    let reserved = 0;
    let reservedM3 = 0;
    let negatives = 0;
    for (const r of inventory.data ?? []) {
      stockM3 += Number(r.stockM3);
      pieces += r.stockCount;
      reserved += r.reservedCount;
      reservedM3 += Number(r.unitM3) * r.reservedCount;
      if (r.stockCount < 0) negatives += 1;
      let s = m.get(r.suiviKey);
      if (!s) {
        s = { key: r.suiviKey, label: suiviColumnLabel(r.suiviKey), m3: 0, pieces: 0 };
        m.set(r.suiviKey, s);
      }
      s.m3 += Number(r.stockM3);
      s.pieces += r.stockCount;
    }
    const sizes = [...m.values()]
      .filter((s) => s.pieces !== 0 || Math.abs(s.m3) > 0.0005)
      .sort((a, b) => suiviColumnIndex(a.key) - suiviColumnIndex(b.key));
    return { sizes, stockM3, pieces, reserved, reservedM3, negatives };
  }, [inventory.data]);

  const max = Math.max(...sizes.map((s) => s.m3), 0);
  // Part de chaque taille dans le bois réellement en stock : une taille en
  // négatif ne doit pas gonfler la part des autres.
  const positiveM3 = sizes.reduce((s, r) => s + Math.max(r.m3, 0), 0);

  return (
    <section className="mt-10">
      <SectionHeading>Stock d'avivés</SectionHeading>
      {inventory.isError ? (
        <QueryError error={inventory.error} onRetry={() => inventory.refetch()}>
          Impossible de charger le stock
        </QueryError>
      ) : !inventory.data ? (
        <div className={`${cardCls} p-5`} aria-hidden>
          <SkeletonLine className="w-1/4" />
          <SkeletonLine className="mt-3 h-7 w-1/3" />
          <SkeletonLine className="mt-6 w-full" />
          <SkeletonLine className="mt-3 w-5/6" />
          <SkeletonLine className="mt-3 w-2/3" />
        </div>
      ) : sizes.length === 0 ? (
        <EmptyState>
          Aucun avivé en stock. Le débitage, le resciage et l'inventaire alimentent ce tableau.
        </EmptyState>
      ) : (
        <>
          {negatives > 0 && (
            <Notice tone="danger" className="mb-3">
              Stock négatif sur {negatives} dimension{negatives > 1 ? "s" : ""} : il sort plus de
              pièces qu'il n'en est entré. Le détail est dans la page Stock.
            </Notice>
          )}
          <div className={`${cardCls} grid overflow-hidden lg:grid-cols-[17rem_minmax(0,1fr)]`}>
            {/* Le total ouvre la page ; le tableau reste un tableau (un lien
                qui l'engloberait le lirait d'une traite au lecteur d'écran). */}
            <Link
              to="/stock"
              className={`group border-b border-brand-100 p-5 transition-colors duration-150 hover:bg-brand-50 active:bg-brand-100 lg:border-b-0 lg:border-r ${FOCUS} focus-visible:-outline-offset-2`}
            >
              <div className="flex items-center gap-2 text-sm text-brand-600">
                <span className="min-w-0 flex-1 truncate">En stock, toutes tailles</span>
                <IconArrowRight
                  width={16}
                  height={16}
                  className="shrink-0 text-brand-500 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </div>
              <div className="mt-1 text-3xl font-semibold leading-tight tracking-tight tabular-nums text-brand-900">
                {fmtM3(stockM3)}
              </div>
              <dl className="mt-4 space-y-2 text-sm tabular-nums">
                <div className="flex justify-between gap-3">
                  <dt className="text-brand-600">Pièces</dt>
                  <dd className="font-medium text-brand-900">{fmtInt(pieces)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-brand-600">Réservé, conteneurs prévus</dt>
                  <dd className="font-medium text-brand-900">
                    {reserved > 0 ? fmtM3(reservedM3) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-brand-100 pt-2">
                  <dt className="text-brand-600">Libre à empoter</dt>
                  <dd className="font-medium text-brand-900">{fmtM3(stockM3 - reservedM3)}</dd>
                </div>
              </dl>
            </Link>
            <div className="p-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-brand-500">
                    <th className="pb-2 pr-3 font-normal">Taille</th>
                    <th className="pb-2 font-normal" aria-hidden />
                    <th className="pb-2 pl-3 text-right font-normal">m³</th>
                    <th className="hidden pb-2 pl-4 text-right font-normal sm:table-cell">Pièces</th>
                    <th className="hidden pb-2 pl-4 text-right font-normal sm:table-cell">Part</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {sizes.map((s) => (
                    <tr key={s.key}>
                      <th
                        scope="row"
                        className="whitespace-nowrap py-1.5 pr-3 text-left font-medium text-brand-900"
                      >
                        {s.label}
                      </th>
                      {/* La barre double le chiffre : décorative pour le lecteur d'écran. */}
                      <td className="w-full py-1.5" aria-hidden>
                        <div className="h-2 overflow-hidden rounded-full bg-brand-100">
                          <div
                            className="h-full rounded-full bg-accent-500"
                            style={{ width: `${max > 0 ? Math.max((s.m3 / max) * 100, 0) : 0}%` }}
                          />
                        </div>
                      </td>
                      <td
                        className={`whitespace-nowrap py-1.5 pl-3 text-right font-medium ${
                          s.m3 < -0.0005 ? "text-red-700" : "text-brand-900"
                        }`}
                      >
                        {fmtDec3(s.m3)}
                      </td>
                      <td className="hidden whitespace-nowrap py-1.5 pl-4 text-right text-brand-600 sm:table-cell">
                        {fmtInt(s.pieces).replace("-", "−")}
                      </td>
                      <td className="hidden whitespace-nowrap py-1.5 pl-4 text-right text-brand-600 sm:table-cell">
                        {s.m3 > 0.0005 ? fmtPct((s.m3 / positiveM3) * 100, 0) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

const today = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default function DashboardPage() {
  const can = useCan();
  const contracts = useQuery({ queryKey: ["contracts"], queryFn: contractsApi.list });
  // Une requête pour tous les contrats (voir /contracts/overview côté API).
  // Clé sous « contracts » : les invalidations existantes la rafraîchissent aussi.
  const overview = useQuery({
    queryKey: ["contracts", "overview"],
    queryFn: contractsApi.overview,
  });
  // Clé sous « trucks » : un camion reçu ou un relevé enregistré la rafraîchit
  // (invalidateTrucks).
  const parc = useQuery({ queryKey: ["trucks", "parc-overview"], queryFn: dashboardApi.parc });

  const { lines, closedCount } = useMemo(() => {
    const ovById = new Map((overview.data ?? []).map((o) => [o.contractId, o]));
    const all = contracts.data ?? [];
    const lines: QuotaLine[] = [];
    for (const c of all) {
      if (c.status !== "OPEN") continue;
      const o = ovById.get(c.id);
      if (o) lines.push(quotaLine(c, o));
    }
    // Le plus avancé en tête : c'est celui qui demande une décision (dernier
    // camion, dépassement).
    lines.sort((a, b) => b.pct - a.pct);
    return { lines, closedCount: all.filter((c) => c.status !== "OPEN").length };
  }, [contracts.data, overview.data]);

  const quotaError = contracts.isError ? contracts : overview.isError ? overview : null;
  const quotaReady = !!contracts.data && !!overview.data;
  const dateLabel = today.format(new Date());

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
      />
      <div className="mx-auto max-w-page-wide px-4 py-6 short:py-3">
        {/* 1. Le parc : combien de camions, à quelle étape. */}
        {parc.isError ? (
          <QueryError error={parc.error} onRetry={() => parc.refetch()}>
            Impossible de charger l'état du parc
          </QueryError>
        ) : parc.data ? (
          <ParcStrip parc={parc.data} />
        ) : (
          <SkeletonStrip />
        )}

        {/* 2. Quotas à gauche (le plus large), file du parc à droite. */}
        <div className="mt-10 grid gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="min-w-0">
            <SectionHeading
              right={can("contracts.view") && <MoreLink to="/contracts">Tous les contrats</MoreLink>}
            >
              Quota brousse
            </SectionHeading>
            {quotaError ? (
              <QueryError error={quotaError.error} onRetry={() => quotaError.refetch()}>
                Impossible de charger les quotas des contrats
              </QueryError>
            ) : !quotaReady ? (
              <SkeletonQuota />
            ) : contracts.data!.length === 0 ? (
              <EmptyState
                action={
                  can("contracts.create") ? (
                    <Link to="/contracts?nouveau=1" className={buttonCls("primary", "md")}>
                      <IconPlus width={16} height={16} className="-ml-0.5" />
                      Créer un contrat
                    </Link>
                  ) : undefined
                }
              >
                Aucun contrat pour l'instant.
              </EmptyState>
            ) : lines.length === 0 ? (
              <EmptyState>
                Aucun contrat ouvert. Les contrats clôturés restent consultables dans la page
                Contrats.
              </EmptyState>
            ) : (
              <QuotaCard lines={lines} closedCount={closedCount} />
            )}
          </section>

          <section className="min-w-0">
            <SectionHeading
              right={can("etalage.view") && <MoreLink to="/etalage">Étalage</MoreLink>}
            >
              En attente au parc{parc.data ? ` · ${parc.data.queue.length}` : ""}
            </SectionHeading>
            {parc.isError ? (
              <EmptyState>File indisponible tant que l'état du parc ne se charge pas.</EmptyState>
            ) : parc.data ? (
              <QueueCard queue={parc.data.queue} />
            ) : (
              <div className={`${cardCls} space-y-4 p-4`} aria-hidden>
                <SkeletonLine className="w-2/3" />
                <SkeletonLine className="w-1/2" />
                <SkeletonLine className="w-3/4" />
              </div>
            )}
          </section>
        </div>

        {/* 3. Le stock d'avivés, réparti par taille. */}
        {can("stock.view") && <StockSection />}
      </div>
    </>
  );
}
