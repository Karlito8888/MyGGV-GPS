import React, { useEffect, useRef } from "react";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { useGeographic, fromLonLat } from "ol/proj";
import { supabase } from "./lib/supabase";
import { MdCenterFocusStrong } from "react-icons/md";

const INITIAL_POSITION = [120.95134859887523, 14.347872973134175];

// Fonction pour recentrer la carte
const recenterMap = (map, position) => {
  if (map) {
    map.getView().animate({
      center: fromLonLat(position),
      duration: 500,
      zoom: 16,
    });
  }
};

function App() {
  const mapInstanceRef = useRef(); // Unique référence pour la carte

  useGeographic();

  useEffect(() => {
    // Créer la carte
    const map = new Map({
      target: 'map',
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
      ],
      view: new View({
        center: INITIAL_POSITION,
        zoom: 17,
      }),
    });

    // Stocker l'instance de la carte dans la référence
    mapInstanceRef.current = map;

    // Nettoyer la carte lors du démontage du composant
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined);
      }
    };
  }, []);

  // Gestion du clic pour recentrer
  const handleRecenterClick = () => {
    if (mapInstanceRef.current) {
      recenterMap(mapInstanceRef.current, INITIAL_POSITION);
    }
  };

  return (
    <div style={{ position: "relative", height: "100vh" }}>
      <header className="header">Header Content</header>
      <div id="map" className="map" />
      <button onClick={handleRecenterClick} className="recenter-button">
        <MdCenterFocusStrong />
      </button>
      <footer className="footer">Footer Content</footer>
    </div>
  );
}

export default App;
