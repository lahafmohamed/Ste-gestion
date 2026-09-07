import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import PermissionsMatrix from "../components/admin/PermissionsMatrix";
import UsersSection from "./UsersPage";

// Administration : comptes et permissions, deux onglets sur une page (l'onglet
// courant dans l'URL, comme la fiche contrat). Réservé à `users.manage`.
const TABS = [
  { key: "utilisateurs", label: "Utilisateurs" },
  { key: "permissions", label: "Permissions par rôle" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("onglet");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "utilisateurs";
  function setTab(k: TabKey) {
    setParams(k === "utilisateurs" ? {} : { onglet: k }, { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Administration"
        subtitle="Comptes, rôles et permissions (réservé admin)."
      />
      <div className="mx-auto max-w-page-wide px-4 pb-6 pt-3 short:pt-2">
        <div className="-mx-4 overflow-x-auto border-b border-brand-200 px-4 scrollbar-none">
          <div className="flex min-w-max gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={`-mb-px min-h-touch whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 ${
                  tab === t.key
                    ? "border-accent-500 text-accent-800"
                    : "border-transparent text-brand-500 hover:text-brand-900 active:bg-brand-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          {tab === "utilisateurs" && <UsersSection />}
          {tab === "permissions" && <PermissionsMatrix />}
        </div>
      </div>
    </>
  );
}
