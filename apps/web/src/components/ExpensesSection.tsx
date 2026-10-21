import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComputedExpenseDTO, ContractExpenseDTO } from "@ste/shared";
import { expensesApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtFcfa, fmtInt, fmtM3, normalizeDecimal, todayISO } from "../lib/format";
import Button from "./ui/Button";
import Card, { Kpi, KpiStrip, SectionHeading } from "./ui/Card";
import ConfirmDialog from "./ui/ConfirmDialog";
import DateField from "./ui/DateField";
import { EmptyState, FormError, QueryError } from "./ui/Feedback";
import Input, { Field } from "./ui/Input";
import { SkeletonList } from "./ui/Skeleton";
import { TableWrap, Td, Th } from "./ui/Table";

// ── Dépenses du contrat ─────────────────────────────────────────────────
// Deux blocs : les lignes calculées (un paramètre de prix × la quantité
// réalisée, mises à jour à chaque camion / session) et les dépenses ajoutées
// à la main — ce que les prix ne prévoient pas (réparation, carburant, frais
// imprévus). Le total additionne les deux.

/** Quantité lisible : m³ à trois décimales, camions en entier. */
function fmtQty(l: ComputedExpenseDTO): string {
  if (l.quantity === null) return "forfait";
  if (l.unit === "camions") return `${fmtInt(l.quantity)} camions`;
  return fmtM3(l.quantity);
}

function ExpenseForm({
  contractId,
  onDone,
}: {
  contractId: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: expensesApi.add,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", contractId] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    add.mutate({
      contractId,
      label: label.trim(),
      amount: amount.trim(),
      note: note.trim() || undefined,
      expenseDate: date ? new Date(`${date}T12:00:00`) : undefined,
    });
  }

  return (
    <form onSubmit={submit} className="mb-3 grid grid-cols-2 gap-3 rounded-xl bg-white p-4 shadow-card sm:grid-cols-4">
      <Field label="Libellé" className="col-span-2">
        <Input
          required
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Réparation tracteur, carburant…"
          maxLength={120}
        />
      </Field>
      <Field label="Montant (FCFA)">
        <Input
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(normalizeDecimal(e.target.value))}
          placeholder="250000"
        />
      </Field>
      <Field label="Date">
        <DateField value={date} onChange={setDate} max={todayISO()} />
      </Field>
      <Field label="Note" className="col-span-2 sm:col-span-3">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Facultatif — à qui, pourquoi"
          maxLength={300}
        />
      </Field>
      <div className="col-span-2 flex flex-wrap items-end justify-between gap-2 sm:col-span-1">
        {error && <FormError>{error}</FormError>}
        <Button type="submit" variant="primary" disabled={add.isPending} className="ml-auto">
          {add.isPending ? "Ajout…" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}

export default function ExpensesSection({
  contractId,
  onGoToTerms,
}: {
  contractId: string;
  /** Ouvre l'onglet Termes (prix non renseignés). */
  onGoToTerms?: () => void;
}) {
  const qc = useQueryClient();
  const can = useCan();
  const [showForm, setShowForm] = useState(false);
  const [del, setDel] = useState<ContractExpenseDTO | null>(null);

  const q = useQuery({
    queryKey: ["expenses", contractId],
    queryFn: () => expensesApi.byContract(contractId),
  });

  const remove = useMutation({
    mutationFn: expensesApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses", contractId] }),
  });

  if (q.isLoading)
    return (
      <div className="mt-4" aria-busy="true">
        <SkeletonList count={2} lines={4} />
      </div>
    );
  if (q.isError || !q.data)
    return (
      <div className="mt-4">
        <QueryError error={q.error} onRetry={() => q.refetch()}>
          Impossible de charger les dépenses
        </QueryError>
      </div>
    );

  const d = q.data;
  const unpriced = d.computed.filter((l) => !l.priced).length;

  return (
    <div className="mt-4">
      <KpiStrip cols={3}>
        <Kpi bare label="Dépenses calculées" value={fmtFcfa(d.computedTotal)} hint="Prix × quantités réalisées" />
        <Kpi bare label="Dépenses ajoutées" value={fmtFcfa(d.extraTotal)} hint={`${d.extra.length} ligne${d.extra.length > 1 ? "s" : ""}`} />
        <Kpi bare label="Total dépenses" value={fmtFcfa(d.total)} tone="accent" />
      </KpiStrip>

      {/* ── Lignes calculées ── */}
      <section className="mt-8">
        <SectionHeading
          right={
            unpriced > 0 && onGoToTerms ? (
              <Button size="xs" onClick={onGoToTerms}>
                Renseigner les prix
              </Button>
            ) : undefined
          }
        >
          Dépenses calculées
        </SectionHeading>
        <Card pad="sm">
          <TableWrap>
            <table className="w-full min-w-[560px] text-base">
              <thead className="text-left text-sm text-brand-500">
                <tr>
                  <Th>Poste</Th>
                  <Th right>Quantité</Th>
                  <Th right>Prix unitaire</Th>
                  <Th right className="pr-0">
                    Montant
                  </Th>
                </tr>
              </thead>
              <tbody>
                {d.computed.map((l) => (
                  <tr
                    key={l.key}
                    className={`border-t border-brand-100${l.priced ? "" : " text-brand-400"}`}
                  >
                    <Td>
                      <span className={l.priced ? "font-medium text-brand-900" : ""}>{l.label}</span>
                      {l.unit && <span className="ml-2 text-xs text-brand-500">par {l.unit}</span>}
                    </Td>
                    <Td num>{fmtQty(l)}</Td>
                    <Td num>{l.priced ? fmtFcfa(l.unitPrice) : "non renseigné"}</Td>
                    <Td num className="pr-0 font-medium">
                      {l.priced ? fmtFcfa(l.amount) : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-brand-200 font-semibold text-brand-900">
                  <Td colSpan={3}>Total calculé</Td>
                  <Td num className="pr-0">
                    {fmtFcfa(d.computedTotal)}
                  </Td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        </Card>
        <p className="mt-2 text-xs text-brand-500">
          Quantités reprises des opérations du contrat (camions entrés, brousse, étalage Ø,
          débité). Un prix à zéro dans les termes laisse sa ligne vide.
        </p>
      </section>

      {/* ── Dépenses ajoutées ── */}
      <section className="mt-8">
        <SectionHeading
          right={
            can("finances.edit") && (
              <Button size="xs" onClick={() => setShowForm((s) => !s)}>
                {showForm ? "Fermer" : "+ Dépense"}
              </Button>
            )
          }
        >
          Dépenses ajoutées ({d.extra.length})
        </SectionHeading>

        {showForm && <ExpenseForm contractId={contractId} onDone={() => setShowForm(false)} />}

        {d.extra.length === 0 && !showForm && (
          <EmptyState
            action={
              can("finances.edit") ? (
                <Button onClick={() => setShowForm(true)}>Ajouter une dépense</Button>
              ) : undefined
            }
          >
            Aucune dépense ajoutée. Tout ce que les prix ne prévoient pas se note ici.
          </EmptyState>
        )}

        {d.extra.length > 0 && (
          <Card pad="sm">
            <TableWrap>
              <table className="w-full min-w-[520px] text-base">
                <thead className="text-left text-sm text-brand-500">
                  <tr>
                    <Th>Date</Th>
                    <Th>Libellé</Th>
                    <Th right className={can("finances.edit") ? "" : "pr-0"}>
                      Montant
                    </Th>
                    {can("finances.edit") && <Th className="pr-0" />}
                  </tr>
                </thead>
                <tbody>
                  {d.extra.map((e) => (
                    <tr key={e.id} className="border-t border-brand-100">
                      <Td className="whitespace-nowrap text-sm text-brand-500">
                        {new Date(e.expenseDate).toLocaleDateString("fr-FR")}
                      </Td>
                      <Td>
                        <span className="font-medium text-brand-900">{e.label}</span>
                        {e.note && <div className="text-xs text-brand-500">{e.note}</div>}
                      </Td>
                      <Td num className={can("finances.edit") ? "font-medium" : "pr-0 font-medium"}>
                        {fmtFcfa(e.amount)}
                      </Td>
                      {can("finances.edit") && (
                        <Td className="pr-0 text-right">
                          <button
                            type="button"
                            onClick={() => setDel(e)}
                            className="inline-flex min-h-touch w-11 items-center justify-center rounded-lg text-lg text-brand-300 hover:bg-red-50 hover:text-red-500 active:bg-red-100"
                            aria-label={`Supprimer la dépense ${e.label}`}
                          >
                            ×
                          </button>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-brand-200 font-semibold text-brand-900">
                    <Td colSpan={2}>Total ajouté</Td>
                    <Td num className={can("finances.edit") ? "" : "pr-0"}>
                      {fmtFcfa(d.extraTotal)}
                    </Td>
                    {can("finances.edit") && <Td className="pr-0" />}
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          </Card>
        )}
      </section>

      <ConfirmDialog
        open={del !== null}
        title="Supprimer cette dépense ?"
        confirmLabel="Supprimer la dépense"
        onConfirm={() => {
          if (del) remove.mutate(del.id);
          setDel(null);
        }}
        onCancel={() => setDel(null)}
      >
        {del ? `${del.label} — ${fmtFcfa(del.amount)}. Action irréversible.` : null}
      </ConfirmDialog>
    </div>
  );
}
