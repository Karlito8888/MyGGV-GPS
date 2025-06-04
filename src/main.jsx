// Imports de React et des bibliothèques tierces
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

// Imports des fichiers locaux
import { router } from "./router";
import { supabase } from "./lib/supabase";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";

// Imports des styles
import "./index.css";

// Fonction pour initialiser la session utilisateur
const initSession = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
};

// Fonction principale pour rendre l'application
const renderApp = async () => {
  const session = await initSession();
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    console.error("Élément 'root' introuvable dans le DOM !");
    return;
  }

  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
};

// Lancer l'application
renderApp();

// Enregistrer le service worker
serviceWorkerRegistration.register();
