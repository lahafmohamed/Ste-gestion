import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EntryKind } from "@ste/shared";
import { accountsApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtFcfa, normalizeDecimal } from "../lib/format";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { SectionHeading, cardCls } from "./ui/Card";
import ConfirmDialog from "./ui/ConfirmDialog";
import DateField from "./ui/DateField";
import { EmptyState, FormError, QueryError } from "./ui/Feedback";
import Input, { Field } from "./ui/Input";
import SelectField from "./ui/SelectField";
import { SkeletonList } from "./ui/Skeleton";
import { TableWrap } from "./ui/Table";
import { IconChevronDown, IconPlus, IconX } from "./icons";

function EntryForm({ contractId, onDone }: { contractId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const parties = useQuery({ queryKey: ["parties"], queryFn: accountsApi.parties });
  const [name, setName] = useState("");
  const [kind, setKind] = useState<EntryKind>("DUE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const trimmed = name.trim();
      let party = parties.data?.find(
        (p) => p.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (!party) {
        party = await accountsApi.createParty({ name: trimmed });
        qc.invalidateQueries({ queryKey: ["parties"] });
      }
      await accountsApi.addEntry({
        contractId,
        partyId: party.id,
        kind,
        amount: amount.trim(),
        description: description.trim() || undefined,
        entryDate: date ? new Date(date) : undefined,
      });
      qc.invalidateQueries({ queryKey: ["accounts", contractId] });
      qc.invalidateQueries({ queryKey: ["suggestions", contractId] });
      qc.invalidateQueries({ queryKey: ["summary", contractId] });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className={`mb-3 grid grid-cols-2 gap-3 ${cardCls} p-4 sm:grid-cols-3`}>
      <Field label="Tiers">
        <Input
          required
          list="parties-list"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ibrahim"
        />
        <datalist id="parties-list">
          {parties.data?.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      </Field>

      <Field label="Type">
        <SelectField
          value={kind}
          onChange={(v) => setKind(v as EntryKind)}
          aria-label="Type d'écriture"
          options={[
            { value: "DUE", label: "Devoir (dû)" },
            { value: "PAID", label: "Payé" },
          ]}
        />
      </Field>

      <Field label="Montant (FCFA)">
        <Input
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(normalizeDecimal(e.target.value))}
          placeholder="7317672"
        />
      </Field>

      <Field label="Description">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Sous cubage, 20m cash…"
        />
      </Field>

      <Field label="Date">
        <DateField value={date} onChange={setDate} />
      </Field>

      <div className="col-span-2 flex items-end justify-end sm:col-span-1">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Ajout…" : "Ajouter"}
        </Button>
      </div>
      {/* Erreur sur toute la largeur : coincée à côté du bouton, elle écrasait
          la colonne sur téléphone. */}
      {error && (
        <div className="col-span-2 sm:col-span-3">
          <FormError>{error}</FormError>
        </div>
      )}
    </form>
  );
}

export default function AccountsSection({ contractId }: { contractId: string }) {
  const qc = useQueryClient();
  const can = useCan();
  const [showForm, setShowForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // Confirmation lisible sur tablette (remplace window.confirm).
  const [delEntry, setDelEntry] = useState<{ id: string; kind: string; amount: string } | null>(
    null
  );

  const accounts = useQuery({
    queryKey: ["accounts", contractId],
    queryFn: () => accountsApi.byContract(contractId),
  });

  const suggestions = useQuery({
    queryKey: ["suggestions", contractId],
    queryFn: () => accountsApi.suggestions(contractId),
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["accounts", contractId] });
    qc.invalidateQueries({ queryKey: ["suggestions", contractId] });
    qc.invalidateQueries({ queryKey: ["summary", contractId] });
  }

  const removeEntry = useMutation({
    mutationFn: accountsApi.removeEntry,
    onSuccess: invalidateAll,
  });

  const pendingSuggestions = (suggestions.data ?? []).filter((s) => Number(s.delta) > 0);

  const applySuggestion = useMutation({
    mutationFn: (s: { partyId: string; delta: string; label: string }) =>
      accountsApi.addEntry({
        contractId,
        partyId: s.partyId,
        kind: "DUE",
        amount: s.delta,
        description: s.label,
      }),
    onSuccess: invalidateAll,
  });

  return (
    <section className="mt-5">
      <SectionHeading
        right={
          can("compta.create") && (
            <Button size="xs" onClick={() => setShowForm((s) => !s)} aria-expanded={showForm}>
              {showForm ? (
                "Fermer"
              ) : (
                <>
                  <IconPlus width={16} height={16} className="-ml-0.5" />
                  Écriture
                </>
              )}
            </Button>
          )
        }
      >
        Comptes tiers{accounts.data ? ` (${accounts.data.length})` : ""}
      </SectionHeading>

      {showForm && <EntryForm contractId={contractId} onDone={() => setShowForm(false)} />}

      {/* Dûs suggérés : à regarder, pas une erreur — anneau ambre, pas de
          bordure pleine. Chaque ligne s'ajoute d'un tap (bouton primitif). */}
      {can("compta.create") && pendingSuggestions.length > 0 && (
        <div className="mb-3 rounded-xl bg-amber-50 p-3 ring-1 ring-inset ring-amber-200/80">
          <div className="mb-2 text-sm font-semibold text-amber-900">
            Dûs suggérés, dérivés des opérations
          </div>
          <div className="divide-y divide-amber-200/60">
            {pendingSuggestions.map((s) => (
              <div
                key={s.partyId + s.role}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5 text-sm"
              >
                <span className="min-w-0 text-brand-700">
                  <span className="font-medium text-brand-900">{s.partyName}</span> · {s.label}
                </span>
                <Button
                  size="sm"
                  onClick={() => applySuggestion.mutate(s)}
                  disabled={applySuggestion.isPending}
                  aria-label={`Ajouter le dû de ${fmtFcfa(s.delta)} pour ${s.partyName}`}
                  className="shrink-0 tabular-nums"
                >
                  <IconPlus width={16} height={16} className="-ml-0.5" />
                  {fmtFcfa(s.delta)}
                </Button>
              </div>
            ))}
          </div>
          {applySuggestion.isError && (
            <div className="mt-2">
              <FormError>Ajout échoué : {(applySuggestion.error as Error).message}</FormError>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {accounts.isLoading && <SkeletonList count={2} lines={1} />}
        {removeEntry.isError && (
          <FormError>Suppression échouée : {(removeEntry.error as Error).message}</FormError>
        )}
        {accounts.isError && (
          <QueryError error={accounts.error} onRetry={() => accounts.refetch()}>
            Impossible de charger les comptes
          </QueryError>
        )}
        {accounts.data?.length === 0 && !showForm && (
          <EmptyState
            action={
              can("compta.create") ? (
                <Button onClick={() => setShowForm(true)}>Ajouter une écriture</Button>
              ) : undefined
            }
          >
            Aucune écriture sur ce contrat.
          </EmptyState>
        )}
        {accounts.data?.map((a) => {
          const balance = Number(a.balance);
          const isOpen = open === a.party.id;
          return (
            <div key={a.party.id} className={cardCls}>
              {/* Téléphone : les montants passent sous le nom au lieu d'écraser
                  les deux colonnes ; le chevron dit que la ligne se déplie. */}
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : a.party.id)}
                aria-expanded={isOpen}
                className="flex min-h-touch w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-3 text-left transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:bg-brand-100"
              >
                <span className="min-w-0 font-medium text-brand-900">{a.party.name}</span>
                <span className="ml-auto flex items-center gap-2 text-right text-sm tabular-nums">
                  <span>
                    <span className="text-brand-500">
                      Dû {fmtFcfa(a.due)} · Payé {fmtFcfa(a.paid)} ·{" "}
                    </span>
                    <span
                      className={`font-semibold ${balance > 0 ? "text-red-700" : "text-parc-700"}`}
                    >
                      Solde {fmtFcfa(a.balance)}
                    </span>
                  </span>
                  <IconChevronDown
                    width={18}
                    height={18}
                    className={`shrink-0 text-brand-500 transition-transform duration-150 ease-out motion-reduce:transition-none ${
                      isOpen ? "" : "-rotate-90"
                    }`}
                  />
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-brand-100 p-3">
                  <TableWrap>
                    <table className="w-full min-w-[520px] text-base">
                      <tbody>
                        {a.entries.map((e) => (
                          <tr key={e.id} className="border-b border-brand-50 last:border-b-0">
                            <td className="whitespace-nowrap py-1 pr-3 text-sm tabular-nums text-brand-500">
                              {new Date(e.entryDate).toLocaleDateString("fr-FR")}
                            </td>
                            <td className="py-1 pr-3">
                              <Badge tone={e.kind === "DUE" ? "amber" : "parc"}>
                                {e.kind === "DUE" ? "Dû" : "Payé"}
                              </Badge>
                            </td>
                            <td className="py-1 text-right tabular-nums">{fmtFcfa(e.amount)}</td>
                            <td className="py-1 pl-3 text-sm text-brand-600">
                              {e.description ?? ""}
                            </td>
                            <td className="py-1 text-right">
                              {can("compta.delete") && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDelEntry({ id: e.id, kind: e.kind, amount: e.amount })
                                  }
                                  className="inline-flex min-h-touch w-11 items-center justify-center rounded-lg text-brand-500 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:bg-red-100"
                                  aria-label={`Supprimer l'écriture ${e.kind === "DUE" ? "dû" : "payé"} de ${fmtFcfa(e.amount)}`}
                                >
                                  <IconX width={18} height={18} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={delEntry !== null}
        title="Supprimer cette écriture ?"
        confirmLabel="Supprimer l'écriture"
        onConfirm={() => {
          if (delEntry) removeEntry.mutate(delEntry.id);
          setDelEntry(null);
        }}
        onCancel={() => setDelEntry(null)}
      >
        {delEntry
          ? `${delEntry.kind === "DUE" ? "Dû" : "Payé"} de ${fmtFcfa(delEntry.amount)}. Action irréversible.`
          : null}
      </ConfirmDialog>
    </section>
  );
}
