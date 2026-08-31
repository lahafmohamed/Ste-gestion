import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import DevAnnotator from "./components/DevAnnotator";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    {/* Hors de <App /> : la barre d'annotation doit couvrir toutes les pages,
        y compris l'écran de connexion (rendu avant le routeur). Vide en prod. */}
    <DevAnnotator />
  </React.StrictMode>
);
