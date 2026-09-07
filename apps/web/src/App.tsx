import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import type { Permission } from "@ste/shared";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import ImportPage from "./pages/ImportPage";
import { authApi } from "./lib/api";
import { isSessionValid, setSession, setSessionUser, useCan } from "./lib/auth";
import { FEATURES } from "./lib/features";
import DashboardPage from "./pages/DashboardPage";
import ContractsPage from "./pages/ContractsPage";
import ContractDetailPage from "./pages/ContractDetailPage";
import ReceptionPage from "./pages/ReceptionPage";
import CamionsPage from "./pages/CamionsPage";
import EtalagePage from "./pages/EtalagePage";
import DebitagePage from "./pages/DebitagePage";
import StockPage from "./pages/StockPage";
import VentesPage from "./pages/VentesPage";
import EmpotagePage from "./pages/EmpotagePage";
import ComptaPage from "./pages/ComptaPage";
import RapportPage from "./pages/RapportPage";
import TruckDetailPage from "./pages/TruckDetailPage";
import ProductionRunPage from "./pages/ProductionRunPage";

// Réglages pensés pour le terrain : tablette au parc, réseau lent et coupé.
// - staleTime 30 s : revenir sur une page déjà vue ne refait pas la requête et
//   ne reflashe pas les squelettes ; le retour sur l'onglet ne déclenche un
//   rafraîchissement que si la donnée a plus de 30 s.
// - retry 2 (backoff) : une coupure brève se rattrape seule.
// - mutations : AUCUN retry. Un POST de relevé rejoué en aveugle crée des
//   doublons de billons ; l'échec remonte au pointeur, le brouillon est gardé.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // offlineFirst : hors réseau, react-query lance quand même la requête —
      // le service worker y répond depuis son cache (NetworkFirst). Avec le
      // mode par défaut, la requête serait mise en pause sans jamais partir et
      // l'app rouverte au parc n'afficherait que des squelettes.
      networkMode: "offlineFirst",
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    // Mutations en mode « online » (défaut, explicite ici) : hors réseau elles
    // sont mises en attente et repartent seules au retour de la connexion.
    mutations: { networkMode: "online", retry: 0 },
  },
});

// Garde de route : sans la permission « Voir » du module, retour au tableau
// de bord (l'entrée de navigation est déjà masquée ; ceci couvre l'URL tapée
// ou le favori). L'API refuse de toute façon les écritures. `any` : une seule
// des permissions suffit (page Import, à cheval sur trois modules).
function Guard({
  perm,
  any,
  children,
}: {
  perm?: Permission;
  any?: Permission[];
  children: ReactNode;
}) {
  const can = useCan();
  const ok = (perm ? can(perm) : true) && (any ? any.some((p) => can(p)) : true);
  return ok ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const [authed, setAuthed] = useState(() => isSessionValid());

  // Au chargement : relire le compte (rôle, permissions) — le localStorage
  // peut dater d'avant un changement fait par l'admin, ou d'avant les
  // permissions elles-mêmes. Un 401 (compte désactivé) renvoie au login via req().
  useEffect(() => {
    if (!authed) return;
    authApi.me().then(setSessionUser).catch(() => {});
  }, [authed]);

  // Dev uniquement : connexion automatique avec l'admin du seed pour éviter le
  // formulaire à chaque rechargement. La branche est éliminée du build de prod
  // (import.meta.env.DEV → false), les identifiants ne partent jamais en ligne.
  useEffect(() => {
    if (!import.meta.env.DEV || authed) return;
    const email = import.meta.env.VITE_DEV_LOGIN_EMAIL ?? "admin@local";
    const password = import.meta.env.VITE_DEV_LOGIN_PASSWORD ?? "admin123";
    authApi
      .login({ email, password })
      .then((res) => {
        setSession(res.token, res.user);
        setAuthed(true);
      })
      .catch(() => {
        // Identifiants dev invalides : le formulaire de connexion reste affiché.
      });
  }, [authed]);

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/contracts" element={<Guard perm="contracts.view"><ContractsPage /></Guard>} />
            <Route path="/contracts/:id" element={<Guard perm="contracts.view"><ContractDetailPage /></Guard>} />
            <Route path="/reception" element={<Guard perm="reception.view"><ReceptionPage /></Guard>} />
            <Route path="/camions" element={<Guard perm="camions.view"><CamionsPage /></Guard>} />
            <Route path="/etalage" element={<Guard perm="etalage.view"><EtalagePage /></Guard>} />
            <Route path="/debitage" element={<Guard perm="debitage.view"><DebitagePage /></Guard>} />
            <Route path="/stock" element={<Guard perm="stock.view"><StockPage /></Guard>} />
            {FEATURES.sales && (
              <Route path="/ventes" element={<Guard perm="ventes.view"><VentesPage /></Guard>} />
            )}
            <Route path="/empotage" element={<Guard perm="empotage.view"><EmpotagePage /></Guard>} />
            {FEATURES.accounting && (
              <Route path="/compta" element={<Guard perm="compta.view"><ComptaPage /></Guard>} />
            )}
            {FEATURES.report && (
              <Route path="/rapport" element={<Guard perm="rapport.view"><RapportPage /></Guard>} />
            )}
            <Route
              path="/import"
              element={
                <Guard any={["etalage.create", "debitage.create", "empotage.create"]}>
                  <ImportPage />
                </Guard>
              }
            />
            <Route path="/admin" element={<Guard perm="users.manage"><AdminPage /></Guard>} />
            <Route path="/utilisateurs" element={<Navigate to="/admin" replace />} />
            {/* Fiche camion : lisible dès qu'un poste du parc est ouvert. */}
            <Route path="/trucks/:id" element={<TruckDetailPage />} />
            <Route path="/production-runs/:id" element={<Guard perm="debitage.view"><ProductionRunPage /></Guard>} />
            {/* Sans quoi un favori vers un module en veille (/ventes, /compta,
                /rapport) affiche le chrome de l'app autour d'un vide. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
