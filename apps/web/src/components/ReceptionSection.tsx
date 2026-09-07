import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TruckDTO } from "@ste/shared";
import { contractsApi, trucksApi, vehiclesApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtInt, normalizeDecimal, todayISO } from "../lib/format";
import { invalidateTrucks, parcStage, truckMatches } from "../lib/trucks";
import TruckCard from "./TruckCard";
import VehiclePicker, { VEHICLE_NEW } from "./VehiclePicker";
import Button from "./ui/Button";
import { Kpi, SectionHeading } from "./ui/Card";
import DateField from "./ui/DateField";
import { EmptyState, FormError, QueryError } from "./ui/Feedback";
import Input, { Field, SearchInput } from "./ui/Input";
import SelectField from "./ui/SelectField";
import { SkeletonList } from "./ui/Skeleton";

/** Formulaire vierge — recréé à chaque camion enregistré (« camion suivant »). */
const emptyForm = () => ({
  // Camion du parc : id, `VEHICLE_NEW` en saisie libre, "" tant que rien n'est
  // choisi. L'immat suit le choix — c'est elle qui part sur le bordereau.
  vehicleId: "",
  registration: "",
  deliveryNote: "",
  declaredFieldM3: "",
  declaredLogCount: "",
  arrivedAt: todayISO(),
});

/**
 * Étape 1 · Réception au portail : uniquement l'en-tête recopié du bordereau
 * SODEFOR. La mesure du bois (étalage puis billonnage) est un autre poste, sur
 * la tablette au parc — voir EtalageSection.
 *
 * `contractId = null` : vue portail, tous contrats confondus. Le contrat reste
 * obligatoire pour enregistrer un camion — il se choisit dans le formulaire.
 */
export default function ReceptionSection({
  contractId,
  closed: closedProp = false,
  onEtaler,
}: {
  contractId: string | null;
  /** Contrat clôturé → lecture seule (l'API refuse de toute façon). */
  closed?: boolean;
  /**
   * Passe la main à l'étalage sur un camion précis, au moment où il vient
   * d'être réceptionné. L'hôte décide du geste (naviguer vers /etalage, ou
   * ouvrir la section étalage plus bas sur la fiche contrat).
   */
  onEtaler?: (truckId: string) => void;
}) {
  const can = useCan();
  // Lecture seule si le contrat est clôturé ou si le compte n'a pas la saisie.
  const closed = closedProp || !can("reception.create");
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [q, setQ] = useState("");
  // Contrat du camion en cours de saisie — jamais deviné : vide tant que
  // l'opérateur n'a pas choisi (prérempli seulement si la page en filtre un).
  const [formContractId, setFormContractId] = useState(contractId ?? "");
  const [v, setV] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  // « Enregistrer et camion suivant » : le bouton cliqué décide de la suite.
  // Ref et non state — lu dans onSuccess, juste après le clic.
  const chainRef = useRef(false);
  const [justReceived, setJustReceived] = useState<TruckDTO | null>(null);
  const regRef = useRef<HTMLInputElement>(null);

  const contracts = useQuery({ queryKey: ["contracts"], queryFn: contractsApi.list });
  // Le parc du portail : les mêmes camions reviennent, l'immat se choisit.
  const vehicles = useQuery({ queryKey: ["vehicles"], queryFn: vehiclesApi.list });
  const trucks = useQuery({
    queryKey: ["trucks", contractId ?? "all"],
    queryFn: () => (contractId ? trucksApi.listByContract(contractId) : trucksApi.list()),
  });

  // Le filtre de la page change → le formulaire suit.
  useEffect(() => setFormContractId(contractId ?? ""), [contractId]);

  const contractOf = (id: string | null) =>
    id ? (contracts.data?.find((c) => c.id === id) ?? null) : null;
  const formContract = contractOf(formContractId || null);
  // Contrat clôturé : refusé par l'API (409) — le dire avant la saisie.
  const formClosed = formContract?.status === "CLOSED";

  const create = useMutation({
    mutationFn: (data: Parameters<typeof trucksApi.create>[0]) => trucksApi.create(data),
    onSuccess: (t) => {
      setV(emptyForm());
      setError(null);
      invalidateTrucks(qc, t.contractId);
      // Voyages et fiches du parc bougent ensemble (camion créé à la volée).
      qc.invalidateQueries({ queryKey: ["vehicles"] });
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
    if (!formContractId) {
      setError("Choisir le contrat du camion.");
      return;
    }
    if (!v.registration.trim()) {
      setError("Choisir le camion, ou saisir son immatriculation.");
      return;
    }
    create.mutate({
      contractId: formContractId,
      // Camion du parc quand il en vient un ; sinon le serveur le retrouve (ou
      // le crée) à partir de l'immatriculation saisie.
      vehicleId: v.vehicleId && v.vehicleId !== VEHICLE_NEW ? v.vehicleId : undefined,
      registration: v.registration.trim(),
      deliveryNote: v.deliveryNote.trim() || undefined,
      // parcel / origin : héritées du contrat côté serveur.
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
    v.deliveryNote.trim() !== "" && formContractId
      ? trucks.data?.find(
          (t) => t.contractId === formContractId && t.deliveryNote === v.deliveryNote.trim()
        )
      : undefined;

  // Trois angles sur la même liste : le cumul (ce qui est entré sur le périmètre
  // affiché), le flux du jour (ce que le portail a vu passer depuis ce matin) et
  // le reste à faire (les camions dont le bois n'est pas encore mesuré).
  const stats = (() => {
    const list = trucks.data ?? [];
    // toDateString : comparaison en date LOCALE. `arrivedAt` est stocké en UTC,
    // découper la chaîne ISO ferait basculer un camion de la veille ou du
    // lendemain selon le fuseau.
    const today = new Date().toDateString();
    return {
      total: list.length,
      today: list.filter((t) => new Date(t.arrivedAt).toDateString() === today).length,
      aEtaler: list.filter((t) => parcStage(t) === "A_ETALER").length,
    };
  })();

  const needle = q.trim().toLowerCase();
  const shownTrucks = (trucks.data ?? []).filter(
    (t) => truckMatches(t, needle) || contractOf(t.contractId)?.code.toLowerCase().includes(needle)
  );

  return (
    <section className="mt-5">
      {/* Chiffres du portail — « … » tant que la liste n'est pas là, jamais un
          zéro qui se lirait comme « aucun camion ». */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Camions reçus" value={trucks.data ? fmtInt(stats.total) : "…"} />
        <Kpi label="Arrivés aujourd'hui" value={trucks.data ? fmtInt(stats.today) : "…"} />
        <Kpi label="En attente d'étalage" value={trucks.data ? fmtInt(stats.aEtaler) : "…"} />
      </div>

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
        {contractId ? "" : " — tous contrats"}
      </SectionHeading>

      {/* ── Réception : uniquement l'en-tête recopié du bordereau ── */}
      {showForm && (
        <form onSubmit={submit} className="mb-3 rounded-xl bg-white shadow-card p-4">
          <div className="mb-3 text-sm font-medium text-brand-900">
            Étape 1 · Réception du camion
          </div>

          {/* Bordereau précédent enregistré : de quoi vérifier et enchaîner. */}
          {justReceived && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-parc-50 px-3 py-2 text-sm text-parc-800">
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
                  className="-my-1.5 min-h-touch rounded-lg px-2 font-medium underline hover:text-parc-900 active:bg-parc-100"
                >
                  Étaler ses billes
                </button>
              )}
            </div>
          )}

          {/* Un camion appartient à un contrat, et à un seul : le choix est
              explicite ici même quand la liste montre tous les contrats. */}
          <div className="mb-3">
            <Field label="Contrat du camion">
              <SelectField
                value={formContractId}
                onChange={setFormContractId}
                placeholder="— Choisir le contrat —"
                aria-label="Contrat du camion"
                options={(contracts.data ?? [])
                  .filter((c) => c.status === "OPEN" || c.id === formContractId)
                  .map((c) => ({
                    value: c.id,
                    label: c.code,
                    hint: c.status === "CLOSED" ? "clôturé" : undefined,
                  }))}
              />
            </Field>
            {/* La provenance est un terme du contrat, pas une saisie de portail :
                rappelée ici pour que l'opérateur voie ce que le camion hérite. */}
            <p className="mt-1.5 text-sm text-brand-500">
              Provenance :{" "}
              {!formContract ? (
                <span>—</span>
              ) : formContract.parcel || formContract.origin ? (
                <span className="font-medium text-brand-900">
                  {[
                    formContract.parcel && `parcelle ${formContract.parcel}`,
                    formContract.origin,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : (
                <span className="text-amber-700">
                  non renseignée — à saisir dans les termes du contrat (Administratif)
                </span>
              )}
            </p>
          </div>

          {/* Le camion d'abord : au portail ce sont toujours les mêmes, les
              retaper n'apporte que des variantes d'écriture et des doublons. */}
          <div className="mb-3">
            <VehiclePicker
              vehicles={vehicles.data ?? []}
              loading={vehicles.isLoading}
              vehicleId={v.vehicleId}
              registration={v.registration}
              onChange={(next) => setV((p) => ({ ...p, ...next }))}
              disabled={formClosed}
              inputRef={regRef}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["deliveryNote", "B/L", "176530", false],
                ["declaredFieldM3", "Vol brousse (m³)", "33.171", false],
                ["declaredLogCount", "Nombre de billes", "58", false],
              ] as const
            ).map(([key, label, ph, required]) => {
              // Champs chiffrés : la virgule du clavier FR doit devenir un point,
              // sinon « 33,171 » part tel quel et l'API refuse la ligne.
              const isNum = key === "declaredFieldM3" || key === "declaredLogCount";
              return (
                <Field key={key} label={label}>
                  <Input
                    required={required}
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
            <Field label="Arrivé le">
              <DateField
                value={v.arrivedAt}
                onChange={(iso) => setV((p) => ({ ...p, arrivedAt: iso }))}
                // Un camion n'arrive pas dans le futur — évite le 2026 → 2062.
                max={todayISO()}
              />
            </Field>
          </div>

          {/* B/L déjà vu sur ce contrat → probable faute de frappe (non bloquant). */}
          {blDup && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠ B/L {blDup.deliveryNote} déjà saisi sur ce contrat (camion {blDup.registration},
              arrivé le {new Date(blDup.arrivedAt).toLocaleDateString("fr-FR")}). Vérifier le
              bordereau avant de continuer.
            </p>
          )}

          <div className="mt-3 border-t border-brand-100 pt-3">
            {formClosed && (
              <p className="mb-2 rounded-lg bg-brand-100 px-3 py-2 text-sm text-brand-600">
                🔒 Contrat {formContract?.code} clôturé — le rouvrir avant d'y ajouter un camion.
              </p>
            )}
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
                disabled={create.isPending || formClosed}
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
                disabled={create.isPending || formClosed}
                className="order-1"
              >
                Enregistrer et camion suivant
              </Button>
            </div>
          </div>
        </form>
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
          <TruckCard
            key={t.id}
            truck={t}
            // Vue tous contrats : sans le code, deux camions de contrats
            // différents se ressemblent trait pour trait.
            contractCode={contractId ? undefined : contractOf(t.contractId)?.code}
          />
        ))}
      </div>
    </section>
  );
}
