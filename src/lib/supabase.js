// src / lib / supabase.js;

import { createClient } from "@supabase/supabase-js";

// Récupération des variables d'environnement
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Vérification de la présence des variables d'environnement requises
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase URL or Anon Key");
}

// Création et export du client Supabase standard
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true, // Rafraîchit automatiquement le token d'authentification
    persistSession: true, // Persiste la session entre les rechargements de page
    storage: localStorage, // Utilise localStorage pour persister la session
  },
});
