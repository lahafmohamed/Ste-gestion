import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import type { TruckDTO } from "@ste/shared";
import { measurementTotalM3, truckBillCount } from "@ste/shared";
import { trucksApi } from "../lib/api";
import { fmtM3, fmtNum, normalizeDecimal, todayISO } from "../lib/format";
import { declaredOf, diaOf, girthOf, invalidateTrucks, parcStage, truckMatches } from "../lib/trucks";
import TruckCard from "../components/TruckCard";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { SectionHeading } from "../components/ui/Card";
import { EmptyState, FormError, QueryError } from "../components/ui/Feedback";
import Input, { Field, SearchInput, inputCls } from "../components/ui/Input";
import { SkeletonList } from "../components/ui/Skeleton";
import { TableWrap, Td, Th } from "../components/ui/Table";

/**
 * HARNAIS DE VARIANTES — Réception. Temporaire : à supprimer après promotion.
 *
 * Axe : structure — qui mène la page et comment le formulaire s'organise.
 *  - fiche     : liste de cartes mène, formulaire à la demande (actuel, rendu
 *                par ReceptionSection — pas ici).
 *  - guichet   : formulaire mène, toujours ouvert, colonne unique gros champs,
 *                « camion suivant » par défaut (file au portail).
 *  - bordereau : décalque du papier SODEFOR (libellés en ligne, ordre du
 *                bordereau), liste = registre en table dense.
 */

export const RECEPTION_VARIANTS = ["fiche", "guichet", "bordereau"] as const;
export type ReceptionVariantKey = (typeof RECEPTION_VARIANTS)[number];

type SectionProps = {
  contractId: string;
  closed?: boolean;
  onEtaler?: (truckId: string | null) => void;
};

const EMPTY_FORM = {
  registration: "",
  deliveryNote: "",
  parcel: "",
  origin: "",
  declaredFieldM3: "",
  declaredLogCount: "",
  arrivedAt: todayISO(),
};

/** Logique commune aux variantes : requête camions + mutation création. */
function useReceptionForm(contractId: string, onEtaler?: (truckId: string | null) => void) {
  const qc = useQueryClient();
  const [v, setV] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState<string | null>(null);
  const chainRef = useRef(false);
  const [justReceived, setJustReceived] = useState<TruckDTO | null>(null);
  const regRef = useRef<HTMLInputElement>(null);

  const trucks = useQuery({
    queryKey: ["trucks", contractId],
    queryFn: () => trucksApi.listByContract(contractId),
  });

  const create = useMutation({
    mutationFn: (data: Parameters<typeof trucksApi.create>[0]) => trucksApi.create(data),
    onSuccess: (t) => {
      setV({ ...EMPTY_FORM, arrivedAt: todayISO() });
      setError(null);
      invalidateTrucks(qc, contractId);
      if (chainRef.current) {
        setJustReceived(t);
      } else {
        setJustReceived(null);
        onEtaler?.(t.id);
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  useEffect(() => {
    if (justReceived) regRef.current?.focus();
  }, [justReceived]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      contractId,
      registration: v.registration.trim(),
      deliveryNote: v.deliveryNote.trim() || undefined,
      parcel: v.parcel.trim() || undefined,
      origin: v.origin.trim() || undefined,
      declaredFieldM3: v.declaredFieldM3.trim() || undefined,
      declaredLogCount: v.declaredLogCount.trim() ? Number(v.declaredLogCount) : undefined,
      // Midi local : la date seule ne doit pas glisser d'un jour en UTC.
      arrivedAt: v.arrivedAt ? new Date(`${v.arrivedAt}T12:00:00`) : undefined,
    });
  }

  const blDup =
    v.deliveryNote.trim() !== ""
      ? trucks.data?.find((t) => t.deliveryNote === v.deliveryNote.trim())
      : undefined;

  return { v, setV, error, chainRef, justReceived, setJustReceived, regRef, trucks, create, submit, blDup };
}

/** Bandeau « bordereau précédent enregistré » partagé. */
function JustReceivedBanner({
  truck,
  onEtaler,
  onDismiss,
}: {
  truck: TruckDTO;
  onEtaler?: (truckId: string | null) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-parc-50 px-3 py-2 text-sm text-parc-800">
      <span>
        {truck.registration} réceptionné ✓
        {truck.deliveryNote ? ` · B/L ${truck.deliveryNote}` : ""}
      </span>
      {onEtaler && (
        <button
          type="button"
          onClick={() => {
            onDismiss();
            onEtaler(truck.id);
          }}
          className="-my-1.5 min-h-touch rounded-lg px-2 font-medium underline hover:text-parc-900 active:bg-parc-100"
        >
          Étaler ses billes
        </button>
      )}
    </div>
  );
}

function BlDupWarning({ dup }: { dup: TruckDTO }) {
  return (
    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      ⚠ B/L {dup.deliveryNote} déjà saisi sur ce contrat (camion {dup.registration}, arrivé le{" "}
      {new Date(dup.arrivedAt).toLocaleDateString("fr-FR")}). Vérifier le bordereau avant de
      continuer.
    </p>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Variante GUICHET — le formulaire mène. Toujours ouvert, colonne unique,
 * champs dans l'ordre de lecture du bordereau, « Enregistrer et camion
 * suivant » est l'action principale (les camions arrivent en file).
 * ──────────────────────────────────────────────────────────────────────────── */
export function GuichetVariant({ contractId, closed = false, onEtaler }: SectionProps) {
  const f = useReceptionForm(contractId, onEtaler);
  const isNum = (k: string) => k === "declaredFieldM3" || k === "declaredLogCount";
  const count = f.trucks.data?.length ?? 0;
  const aEtaler = (f.trucks.data ?? []).filter((t) => parcStage(t) === "A_ETALER").length;

  return (
    <section className="mt-5">
      {!closed && (
        <form
          onSubmit={f.submit}
          className="mx-auto mb-5 max-w-md rounded-xl border border-brand-200 bg-white p-4"
        >
          <div className="mb-3 text-sm font-medium text-brand-900">Camion au portail</div>

          {f.justReceived && (
            <JustReceivedBanner
              truck={f.justReceived}
              onEtaler={onEtaler}
              onDismiss={() => f.setJustReceived(null)}
            />
          )}

          <div className="space-y-3">
            {(
              [
                ["registration", "Immatriculation", "3201 GS 01", true],
                ["deliveryNote", "B/L", "176530", false],
                ["parcel", "Parcelle origine", "146-99/04", false],
                ["origin", "Origine", "SANGOUE", false],
                ["declaredFieldM3", "Vol brousse (m³)", "33.171", false],
                ["declaredLogCount", "Nombre de billes", "58", false],
                ["arrivedAt", "Arrivé le", "", false],
              ] as const
            ).map(([key, label, ph, required]) => (
              <Field key={key} label={label}>
                <Input
                  ref={key === "registration" ? f.regRef : undefined}
                  required={required}
                  type={key === "arrivedAt" ? "date" : "text"}
                  max={key === "arrivedAt" ? todayISO() : undefined}
                  inputMode={isNum(key) ? "decimal" : undefined}
                  value={f.v[key]}
                  onChange={(e) =>
                    f.setV((p) => ({
                      ...p,
                      [key]: isNum(key) ? normalizeDecimal(e.target.value) : e.target.value,
                    }))
                  }
                  placeholder={ph}
                />
              </Field>
            ))}
          </div>

          {f.blDup && <BlDupWarning dup={f.blDup} />}

          <div className="mt-4 border-t border-brand-100 pt-3">
            {f.error && (
              <div className="mb-2">
                <FormError>{f.error}</FormError>
              </div>
            )}
            {/* Principal premier dans le DOM : Entrée = camion suivant. */}
            <div className="flex flex-col gap-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                onClick={() => (f.chainRef.current = true)}
                disabled={f.create.isPending}
              >
                {f.create.isPending ? "Enregistrement…" : "Enregistrer et camion suivant"}
              </Button>
              <Button
                type="submit"
                size="lg"
                onClick={() => (f.chainRef.current = false)}
                disabled={f.create.isPending}
              >
                {onEtaler ? "Réceptionner → étaler les billes" : "Réceptionner"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {onEtaler && aEtaler > 0 && !closed && (
        <button
          type="button"
          onClick={() => onEtaler(null)}
          className="mb-3 flex w-full items-center justify-between gap-2 rounded-xl border border-parc-200 bg-parc-50/60 px-3 py-2.5 text-left text-sm text-parc-800 hover:bg-parc-50"
        >
          <span>
            <span className="font-medium tabular-nums">{aEtaler}</span> camion
            {aEtaler > 1 ? "s" : ""} en attente d'étalage
          </span>
          <span className="shrink-0 font-medium underline">Aller à l'étalage →</span>
        </button>
      )}

      <SectionHeading>Camions reçus ({count})</SectionHeading>
      <div className="space-y-2">
        {f.trucks.isLoading && <SkeletonList count={3} lines={1} />}
        {f.trucks.isError && (
          <QueryError error={f.trucks.error} onRetry={() => f.trucks.refetch()}>
            Impossible de charger les camions
          </QueryError>
        )}
        {count === 0 && !f.trucks.isLoading && <EmptyState>Aucun camion.</EmptyState>}
        {(f.trucks.data ?? []).map((t) => (
          <TruckCard key={t.id} truck={t} />
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Variante BORDEREAU — décalque du papier. Libellés en ligne à gauche comme
 * sur le bordereau SODEFOR, valeurs soulignées façon formulaire imprimé ;
 * liste = registre en table dense, une ligne par camion.
 * ──────────────────────────────────────────────────────────────────────────── */
function SlipRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-32 shrink-0 text-right text-brand-500">{label}</span>
      {children}
    </label>
  );
}

export function BordereauVariant({ contractId, closed = false, onEtaler }: SectionProps) {
  const f = useReceptionForm(contractId, onEtaler);
  const [q, setQ] = useState("");
  const isNum = (k: string) => k === "declaredFieldM3" || k === "declaredLogCount";
  const needle = q.trim().toLowerCase();
  const shown = (f.trucks.data ?? []).filter((t) => truckMatches(t, needle));
  const count = f.trucks.data?.length ?? 0;
  const aEtaler = (f.trucks.data ?? []).filter((t) => parcStage(t) === "A_ETALER").length;
  // Champ façon papier : bordure basse seule, fond transparent.
  const slipInput =
    inputCls.replace("rounded-lg border border-brand-300 bg-white", "rounded-none border-0 border-b border-brand-300 bg-transparent") +
    " focus:border-b-brand-900";

  return (
    <section className="mt-5">
      {!closed && (
        <form onSubmit={f.submit} className="mb-5 rounded-xl border border-brand-200 bg-white">
          <div className="rounded-t-xl border-b border-brand-200 bg-brand-50 px-4 py-2 text-xs font-medium uppercase tracking-wider text-brand-600">
            Bordereau SODEFOR · Réception
          </div>
          <div className="p-4">
            {f.justReceived && (
              <JustReceivedBanner
                truck={f.justReceived}
                onEtaler={onEtaler}
                onDismiss={() => f.setJustReceived(null)}
              />
            )}

            <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              {(
                [
                  ["registration", "Immatriculation", "3201 GS 01", true],
                  ["deliveryNote", "B/L n°", "176530", false],
                  ["parcel", "Parcelle", "146-99/04", false],
                  ["origin", "Origine", "SANGOUE", false],
                  ["declaredFieldM3", "Vol brousse m³", "33.171", false],
                  ["declaredLogCount", "Billes", "58", false],
                  ["arrivedAt", "Arrivé le", "", false],
                ] as const
              ).map(([key, label, ph, required]) => (
                <SlipRow key={key} label={label}>
                  <Input
                    ref={key === "registration" ? f.regRef : undefined}
                    required={required}
                    type={key === "arrivedAt" ? "date" : "text"}
                    max={key === "arrivedAt" ? todayISO() : undefined}
                    inputMode={isNum(key) ? "decimal" : undefined}
                    value={f.v[key]}
                    onChange={(e) =>
                      f.setV((p) => ({
                        ...p,
                        [key]: isNum(key) ? normalizeDecimal(e.target.value) : e.target.value,
                      }))
                    }
                    placeholder={ph}
                    className={slipInput}
                  />
                </SlipRow>
              ))}
            </div>

            {f.blDup && <BlDupWarning dup={f.blDup} />}

            <div className="mt-4 border-t border-brand-100 pt-3">
              {f.error && (
                <div className="mb-2">
                  <FormError>{f.error}</FormError>
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  onClick={() => (f.chainRef.current = false)}
                  disabled={f.create.isPending}
                  className="order-2"
                >
                  {f.create.isPending
                    ? "Enregistrement…"
                    : onEtaler
                      ? "Réceptionner → étaler les billes"
                      : "Réceptionner"}
                </Button>
                <Button
                  type="submit"
                  onClick={() => (f.chainRef.current = true)}
                  disabled={f.create.isPending}
                  className="order-1"
                >
                  Enregistrer et camion suivant
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}

      <SectionHeading
        right={
          onEtaler && aEtaler > 0 && !closed ? (
            <button
              type="button"
              onClick={() => onEtaler(null)}
              className="min-h-touch rounded-lg px-2 text-sm font-medium text-parc-800 underline hover:text-parc-900"
            >
              {aEtaler} à étaler →
            </button>
          ) : undefined
        }
      >
        Registre ({count})
      </SectionHeading>

      {count > 3 && (
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Immatriculation, B/L, parcelle…"
          aria-label="Chercher un camion"
          className="mb-2"
        />
      )}

      {f.trucks.isLoading && <SkeletonList count={3} lines={1} />}
      {f.trucks.isError && (
        <QueryError error={f.trucks.error} onRetry={() => f.trucks.refetch()}>
          Impossible de charger les camions
        </QueryError>
      )}
      {count === 0 && !f.trucks.isLoading && <EmptyState>Aucun camion.</EmptyState>}
      {count > 0 && shown.length === 0 && <EmptyState>Aucun camion ne correspond.</EmptyState>}
      {shown.length > 0 && (
        <TableWrap className="rounded-xl border border-brand-200 bg-white p-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-brand-500">
                <Th>Immat</Th>
                <Th>B/L</Th>
                <Th>Parcelle</Th>
                <Th right>Annoncé</Th>
                <Th right>Étalé</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const dia = diaOf(t);
                const girth = girthOf(t);
                const d = declaredOf(t);
                const measured = dia ?? girth;
                const total = measured ? measurementTotalM3(measured) : null;
                const billCount = truckBillCount(t);
                return (
                  <tr key={t.id} className="border-t border-brand-100 hover:bg-brand-50">
                    <Td>
                      <Link
                        to={`/trucks/${t.id}`}
                        className="font-medium text-brand-900 underline-offset-2 hover:underline"
                      >
                        {t.registration}
                      </Link>
                    </Td>
                    <Td>{t.deliveryNote ?? "—"}</Td>
                    <Td>{t.parcel ?? "—"}</Td>
                    <Td num>
                      {d.count ?? "—"} b ·{" "}
                      {d.m3 != null ? `${fmtNum(d.m3.toFixed(3))} m³` : "—"}
                    </Td>
                    <Td num>
                      {measured ? `${billCount} b · ${fmtM3(total!)}` : "—"}
                    </Td>
                    <Td>
                      {!dia && !girth && <Badge tone="amber">À étaler</Badge>}
                      {dia && !girth && <Badge tone="info">À billonner</Badge>}
                      {girth && <Badge tone="parc">billonné ✓</Badge>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sélecteur de variantes — volontairement hors design system (chrome sombre,
 * police système). ← → parcourt, 1-3 saute, l'URL fait foi.
 * ──────────────────────────────────────────────────────────────────────────── */
const PICKER_LABELS: Record<ReceptionVariantKey, string> = {
  fiche: "Fiche",
  guichet: "Guichet",
  bordereau: "Bordereau",
};

export function VariantPicker() {
  const [params, setParams] = useSearchParams();
  const active = (params.get("variant") ?? "fiche") as ReceptionVariantKey;
  const activeIdx = Math.max(0, RECEPTION_VARIANTS.indexOf(active));

  function select(key: ReceptionVariantKey) {
    const next = new URLSearchParams(params);
    if (key === "fiche") next.delete("variant");
    else next.set("variant", key);
    setParams(next, { replace: true });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      // Ne pas voler le clavier au formulaire sous jugement.
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      if (e.key === "ArrowRight") select(RECEPTION_VARIANTS[(activeIdx + 1) % RECEPTION_VARIANTS.length]);
      else if (e.key === "ArrowLeft")
        select(RECEPTION_VARIANTS[(activeIdx - 1 + RECEPTION_VARIANTS.length) % RECEPTION_VARIANTS.length]);
      else if (/^[1-3]$/.test(e.key)) select(RECEPTION_VARIANTS[Number(e.key) - 1]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <style>{`
        .variant-picker { position: fixed; bottom: 24px; left: 50%; translate: -50% 0;
          z-index: 2147483647; display: flex; gap: 2px; padding: 4px; border-radius: 999px;
          background: rgb(20 20 20 / 0.9);
          box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1), 0 8px 24px rgb(0 0 0 / 0.25);
          font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; user-select: none; }
        .variant-picker button { padding: 7px 14px; border: 0; border-radius: 999px;
          background: none; color: rgb(255 255 255 / 0.6); cursor: pointer; }
        .variant-picker button:hover { color: rgb(255 255 255 / 0.85); }
        .variant-picker button[aria-current="true"] { background: rgb(255 255 255 / 0.14); color: rgb(255 255 255); }
        .variant-picker button:focus-visible { outline: 2px solid rgb(255 255 255 / 0.7); outline-offset: 2px; }
      `}</style>
      <nav className="variant-picker" aria-label="Variants">
        {RECEPTION_VARIANTS.map((k) => (
          <button
            key={k}
            type="button"
            data-variant={k}
            aria-current={k === active ? "true" : undefined}
            onClick={() => select(k)}
          >
            {PICKER_LABELS[k]}
          </button>
        ))}
      </nav>
    </>
  );
}
