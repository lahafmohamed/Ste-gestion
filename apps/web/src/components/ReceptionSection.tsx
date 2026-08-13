import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TruckDTO } from "@ste/shared";
import { trucksApi } from "../lib/api";
import { normalizeDecimal, todayISO } from "../lib/format";
import { invalidateTrucks, parcStage, truckMatches } from "../lib/trucks";
import TruckCard from "./TruckCard";
import Button from "./ui/Button";
import { SectionHeading } from "./ui/Card";
import { EmptyState, FormError, QueryError } from "./ui/Feedback";
import Input, { Field, SearchInput } from "./ui/Input";
import { SkeletonList } from "./ui/Skeleton";

/**
 * Étape 1 · Réception au portail : uniquement l'en-tête recopié du bordereau
 * SODEFOR. La mesure du bois (étalage puis billonnage) est un autre poste, sur
 * la tablette au parc — voir EtalageSection.
 */
export default function ReceptionSection({
  contractId,
  closed = false,
  onEtaler,
}: {
  contractId: string;
  /** Contrat clôturé → lecture seule (l'API refuse de toute façon). */
  closed?: boolean;
  /**
   * Passe la main à l'étalage : un camion précis, ou `null` pour la file
   * complète. L'hôte décide (naviguer vers /etalage, ou ouvrir la section
   * étalage plus bas sur la fiche contrat).
   */
  onEtaler?: (truckId: string | null) => void;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [q, setQ] = useState("");
  const [v, setV] = useState({
    registration: "",
    deliveryNote: "",
    parcel: "",
    origin: "",
    declaredFieldM3: "",
    declaredLogCount: "",
    arrivedAt: todayISO(),
  });
  const [error, setError] = useState<string | null>(null);
  // « Enregistrer et camion suivant » : le bouton cliqué décide de la suite.
  // Ref et non state — lu dans onSuccess, juste après le clic.
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
      setV({
        registration: "",
        deliveryNote: "",
        parcel: "",
        origin: "",
        declaredFieldM3: "",
        declaredLogCount: "",
        arrivedAt: todayISO(),
      });
      setError(null);
      invalidateTrucks(qc, contractId);
      if (chainRef.current) {
        // Les camions arrivent en file au portail : enchaîner les bordereaux et
        // étaler plus tard, quand le bois est descendu.
        setJustReceived(t);
        setShowForm(true);
      } else {
        setJustReceived(null);
        setShowForm(false);
        onEtaler?.(t.id);
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  // Bordereau suivant : le curseur repart sur l'immatriculation, pas au doigt.
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

  // B/L déjà saisi sur ce contrat ? Warn non bloquant : un camion physique
  // revient plusieurs fois, mais chaque voyage a son propre bordereau — un
  // doublon est presque toujours une faute de frappe.
  const blDup =
    v.deliveryNote.trim() !== ""
      ? trucks.data?.find((t) => t.deliveryNote === v.deliveryNote.trim())
      : undefined;

  const needle = q.trim().toLowerCase();
  const shownTrucks = (trucks.data ?? []).filter((t) => truckMatches(t, needle));
  const aEtaler = (trucks.data ?? []).filter((t) => parcStage(t) === "A_ETALER").length;

  return (
    <section className="mt-5">
      <SectionHeading
        right={
          !closed && (
            <Button
              size="xs"
              onClick={() => {
                setJustReceived(null);
                setShowForm((s) => !s);
              }}
            >
              {showForm ? "Fermer" : "+ Camion arrivé"}
            </Button>
          )
        }
      >
        Camions reçus ({trucks.data?.length ?? 0})
      </SectionHeading>

      {/* ── Réception : uniquement l'en-tête recopié du bordereau ── */}
      {showForm && (
        <form onSubmit={submit} className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-medium text-slate-900">
            Étape 1 · Réception du camion
          </div>

          {/* Bordereau précédent enregistré : de quoi vérifier et enchaîner. */}
          {justReceived && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <span>
                {justReceived.registration} réceptionné ✓
                {justReceived.deliveryNote ? ` · B/L ${justReceived.deliveryNote}` : ""}
              </span>
              {onEtaler && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setJustReceived(null);
                    onEtaler(justReceived.id);
                  }}
                  className="-my-1.5 min-h-9 rounded-lg px-2 font-medium underline hover:text-emerald-900 active:bg-emerald-100"
                >
                  Étaler ses billes
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            ).map(([key, label, ph, required]) => {
              // Champs chiffrés : la virgule du clavier FR doit devenir un point,
              // sinon « 33,171 » part tel quel et l'API refuse la ligne.
              const isNum = key === "declaredFieldM3" || key === "declaredLogCount";
              return (
                <Field key={key} label={label}>
                  <Input
                    ref={key === "registration" ? regRef : undefined}
                    required={required}
                    type={key === "arrivedAt" ? "date" : "text"}
                    // Un camion n'arrive pas dans le futur — évite le 2026 → 2062.
                    max={key === "arrivedAt" ? todayISO() : undefined}
                    inputMode={isNum ? "decimal" : undefined}
                    value={v[key]}
                    onChange={(e) =>
                      setV((p) => ({
                        ...p,
                        [key]: isNum ? normalizeDecimal(e.target.value) : e.target.value,
                      }))
                    }
                    placeholder={ph}
                  />
                </Field>
              );
            })}
          </div>

          {/* B/L déjà vu sur ce contrat → probable faute de frappe (non bloquant). */}
          {blDup && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠ B/L {blDup.deliveryNote} déjà saisi sur ce contrat (camion {blDup.registration},
              arrivé le {new Date(blDup.arrivedAt).toLocaleDateString("fr-FR")}). Vérifier le
              bordereau avant de continuer.
            </p>
          )}

          <div className="mt-3 border-t border-slate-100 pt-3">
            {error && (
              <div className="mb-2">
                <FormError>{error}</FormError>
              </div>
            )}
            {/* Les deux boutons sont des submit : la validation native du champ
                Immatriculation joue dans les deux cas, et le clic pose chainRef
                avant que le submit ne parte. Le principal est premier dans le DOM
                (Entrée au clavier déclenche le premier submit) et replacé à
                droite via `order`. */}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="submit"
                variant="primary"
                onClick={() => (chainRef.current = false)}
                disabled={create.isPending}
                className="order-2"
              >
                {create.isPending
                  ? "Enregistrement…"
                  : onEtaler
                    ? "Réceptionner → étaler les billes"
                    : "Réceptionner"}
              </Button>
              <Button
                type="submit"
                onClick={() => (chainRef.current = true)}
                disabled={create.isPending}
                className="order-1"
              >
                Enregistrer et camion suivant
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Le bois mesuré est un autre poste : la file d'attente vit sur Étalage. */}
      {onEtaler && aEtaler > 0 && !closed && (
        <button
          type="button"
          onClick={() => onEtaler(null)}
          className="mb-3 flex w-full items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-left text-sm text-emerald-800 hover:bg-emerald-50"
        >
          <span>
            <span className="font-medium tabular-nums">{aEtaler}</span> camion
            {aEtaler > 1 ? "s" : ""} en attente d'étalage
          </span>
          <span className="shrink-0 font-medium underline">Aller à l'étalage →</span>
        </button>
      )}

      {/* ── Recherche — dès que la liste des bordereaux s'allonge ── */}
      {(trucks.data?.length ?? 0) > 3 && (
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Immatriculation, B/L, parcelle…"
          aria-label="Chercher un camion"
          className="mb-2"
        />
      )}

      {/* ── Cartes camions : annoncé vs étalé/billonné en un coup d'œil ── */}
      <div className="space-y-2">
        {trucks.isLoading && <SkeletonList count={3} lines={1} />}
        {trucks.isError && (
          <QueryError error={trucks.error} onRetry={() => trucks.refetch()}>
            Impossible de charger les camions
          </QueryError>
        )}
        {trucks.data?.length === 0 && !showForm && <EmptyState>Aucun camion.</EmptyState>}
        {(trucks.data?.length ?? 0) > 0 && shownTrucks.length === 0 && (
          <EmptyState>Aucun camion ne correspond.</EmptyState>
        )}
        {shownTrucks.map((t) => (
          <TruckCard key={t.id} truck={t} />
        ))}
      </div>
    </section>
  );
}
