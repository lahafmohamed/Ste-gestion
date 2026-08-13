import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EntryKind } from "@ste/shared";
import { accountsApi } from "../lib/api";
import { fmtFcfa } from "../lib/format";
import Button from "./ui/Button";
import { SectionHeading } from "./ui/Card";
import ConfirmDialog from "./ui/ConfirmDialog";
import { EmptyState, FormError, QueryError } from "./ui/Feedback";
import Input, { Field, Select } from "./ui/Input";

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
    <form
      onSubmit={submit}
      className="mb-3 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3"
    >
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
        <Select value={kind} onChange={(e) => setKind(e.target.value as EntryKind)}>
          <option value="DUE">Devoir (dû)</option>
          <option value="PAID">Payé</option>
        </Select>
      </Field>

      <Field label="Montant (FCFA)">
        <Input
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
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
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <div className="col-span-2 flex items-end justify-between sm:col-span-1">
        {error && <FormError>{error}</FormError>}
        <Button type="submit" variant="primary" disabled={saving} className="ml-auto">
          Ajouter
        </Button>
      </div>
    </form>
  );
}

export default function AccountsSection({ contractId }: { contractId: string }) {
  const qc = useQueryClient();
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
          <Button size="xs" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Fermer" : "+ Écriture"}
          </Button>
        }
      >
        Comptes tiers ({accounts.data?.length ?? 0})
      </SectionHeading>

      {showForm && <EntryForm contractId={contractId} onDone={() => setShowForm(false)} />}

      {suggestions.data && suggestions.data.filter((s) => Number(s.delta) > 0).length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            Dûs suggérés (dérivés des opérations)
          </div>
          <div className="space-y-1.5">
            {suggestions.data
              .filter((s) => Number(s.delta) > 0)
              .map((s) => (
                <div key={s.partyId + s.role} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-700">
                    <span className="font-medium">{s.partyName}</span> — {s.label}
                  </span>
                  <button
                    onClick={() => applySuggestion.mutate(s)}
                    disabled={applySuggestion.isPending}
                    className="min-h-9 shrink-0 rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50"
                  >
                    + {fmtFcfa(s.delta)}
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {accounts.isLoading && <p className="text-sm text-slate-500">Chargement…</p>}
        {accounts.isError && (
          <QueryError error={accounts.error} onRetry={() => accounts.refetch()}>
            Impossible de charger les comptes
          </QueryError>
        )}
        {accounts.data?.length === 0 && !showForm && (
          <EmptyState>Aucune écriture.</EmptyState>
        )}
        {accounts.data?.map((a) => {
          const balance = Number(a.balance);
          const isOpen = open === a.party.id;
          return (
            <div key={a.party.id} className="rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => setOpen(isOpen ? null : a.party.id)}
                className="flex min-h-touch w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50 active:bg-slate-100"
              >
                <span className="font-medium text-slate-900">{a.party.name}</span>
                <span className="text-right text-sm">
                  <span className="text-slate-500">
                    Dû {fmtFcfa(a.due)} · Payé {fmtFcfa(a.paid)} ·{" "}
                  </span>
                  <span
                    className={`font-semibold ${
                      balance > 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    Solde {fmtFcfa(a.balance)}
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 p-3">
                  <table className="w-full text-sm">
                    <tbody>
                      {a.entries.map((e) => (
                        <tr key={e.id} className="border-b border-slate-50">
                          <td className="py-1 text-xs text-slate-400">
                            {new Date(e.entryDate).toLocaleDateString("fr-FR")}
                          </td>
                          <td className="py-1">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${
                                e.kind === "DUE"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {e.kind === "DUE" ? "Dû" : "Payé"}
                            </span>
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {fmtFcfa(e.amount)}
                          </td>
                          <td className="py-1 pl-3 text-xs text-slate-500">
                            {e.description ?? ""}
                          </td>
                          <td className="py-1 text-right">
                            <button
                              onClick={() =>
                                setDelEntry({ id: e.id, kind: e.kind, amount: e.amount })
                              }
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg text-slate-300 hover:bg-red-50 hover:text-red-500 active:bg-red-100"
                              aria-label="Supprimer l'écriture"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
