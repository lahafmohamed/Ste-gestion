import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EntryKind } from "@ste/shared";
import { accountsApi } from "../lib/api";
import { fmtFcfa } from "../lib/format";

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
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">Tiers</span>
        <input
          required
          list="parties-list"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ibrahim"
          className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
        />
        <datalist id="parties-list">
          {parties.data?.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">Type</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as EntryKind)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
        >
          <option value="DUE">Devoir (dû)</option>
          <option value="PAID">Payé</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">Montant (FCFA)</span>
        <input
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="7317672"
          className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">Description</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Sous cubage, 20m cash…"
          className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">Date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
        />
      </label>

      <div className="col-span-2 flex items-end justify-between sm:col-span-1">
        {error && <span className="text-sm text-red-600">{error}</span>}
        <button
          type="submit"
          disabled={saving}
          className="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
    </form>
  );
}

export default function AccountsSection({ contractId }: { contractId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

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
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Comptes tiers ({accounts.data?.length ?? 0})
        </h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:border-slate-900"
        >
          {showForm ? "Fermer" : "+ Écriture"}
        </button>
      </div>

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
                    className="shrink-0 rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    + {fmtFcfa(s.delta)}
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {accounts.data?.length === 0 && !showForm && (
          <p className="text-sm text-slate-500">Aucune écriture.</p>
        )}
        {accounts.data?.map((a) => {
          const balance = Number(a.balance);
          const isOpen = open === a.party.id;
          return (
            <div key={a.party.id} className="rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => setOpen(isOpen ? null : a.party.id)}
                className="flex w-full items-center justify-between p-3 text-left"
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
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Supprimer cette écriture (${e.kind === "DUE" ? "dû" : "payé"} ${fmtFcfa(e.amount)}) ? Action irréversible.`
                                  )
                                )
                                  removeEntry.mutate(e.id);
                              }}
                              className="text-slate-300 hover:text-red-500"
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
    </section>
  );
}
