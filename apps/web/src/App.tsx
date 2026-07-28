import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import UsersPage from "./pages/UsersPage";
import { isSessionValid } from "./lib/auth";
import DashboardPage from "./pages/DashboardPage";
import ContractsPage from "./pages/ContractsPage";
import ContractDetailPage from "./pages/ContractDetailPage";
import ReceptionPage from "./pages/ReceptionPage";
import DebitagePage from "./pages/DebitagePage";
import StockPage from "./pages/StockPage";
// Masqué pour la première version en ligne — réactiver quand prêt
// import VentesPage from "./pages/VentesPage";
// import EmpotagePage from "./pages/EmpotagePage";
// import ComptaPage from "./pages/ComptaPage";
// import RapportPage from "./pages/RapportPage";
import TruckDetailPage from "./pages/TruckDetailPage";
import ProductionRunPage from "./pages/ProductionRunPage";

const queryClient = new QueryClient();

export default function App() {
  const [authed, setAuthed] = useState(() => isSessionValid());

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/contracts/:id" element={<ContractDetailPage />} />
            <Route path="/reception" element={<ReceptionPage />} />
            <Route path="/debitage" element={<DebitagePage />} />
            <Route path="/stock" element={<StockPage />} />
            {/* Masqué pour la première version en ligne — réactiver quand prêt */}
            {/* <Route path="/ventes" element={<VentesPage />} /> */}
            {/* <Route path="/empotage" element={<EmpotagePage />} /> */}
            {/* <Route path="/compta" element={<ComptaPage />} /> */}
            {/* <Route path="/rapport" element={<RapportPage />} /> */}
            <Route path="/utilisateurs" element={<UsersPage />} />
            <Route path="/trucks/:id" element={<TruckDetailPage />} />
            <Route path="/production-runs/:id" element={<ProductionRunPage />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
