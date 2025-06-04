import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  publicDir: "public",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      manifest: {
        name: "MyGGV-GPS",
        short_name: "MyGGV-GPS",
        id: "/",
        description:
          "A lightweight and real-time GPS navigation PWA built with React, TypeScript, Vite, and Tailwind CSS. Designed to help visitors navigate easily within a private residential area, from their current location to a specific destination (block and lot) retrieved from Supabase. Features include OpenLayers map integration, route tracking, welcome and arrival modals, and live updates using Supabase Realtime.",
        start_url: "/",
        display: "standalone", // Ceci est important pour le mode plein écran
        background_color: "#ffffff",
        theme_color: "#50aa61",
        orientation: "portrait-primary",
        lang: "en",
        icons: [
          {
            src: "/icons/icon-72x72.png",
            sizes: "72x72",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-96x96.png",
            sizes: "96x96",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-144x144.png",
            sizes: "144x144",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        prefer_related_applications: false,
      },
      manifestFilename: "manifest.webmanifest",
      includeManifestIcons: true,
      registerType: "prompt",
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        // cacheId: 'myggv-v1.0.2', // Utilisez votre numéro de version ici
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.example\.com\/.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24,
              },
            },
          },
          {
            urlPattern: /\.(?:js|css|html|json|png|jpg|jpeg|svg|woff2)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
        ],
      },
      injectRegister: "auto",
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
      },
      includeAssets: ["**/*"],
      strategies: "generateSW",
      minify: true,
      mode: "production",
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
