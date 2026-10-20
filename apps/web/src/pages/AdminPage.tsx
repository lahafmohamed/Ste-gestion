import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import PermissionsMatrix from "../components/admin/PermissionsMatrix";
import UsersSection from "./UsersPage";
import Tabs from "../components/ui/Tabs";

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
        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Sections de l'administration" />

        <div className="mt-5">
          {tab === "utilisateurs" && <UsersSection />}
          {tab === "permissions" && <PermissionsMatrix />}
        </div>
      </div>
    </>
  );
}
