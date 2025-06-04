import React, { useEffect, useRef, useMemo } from "react";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import { Vector as VectorLayer } from "ol/layer";
import { Vector as VectorSource } from "ol/source";
import OSM from "ol/source/OSM";
import { useGeographic, fromLonLat } from "ol/proj";
import { Feature } from "ol";
import { Point, Polygon } from "ol/geom";
import { Fill, Stroke, Style, Icon, Text } from "ol/style";
import { supabase } from "./lib/supabase";
import { MdCenterFocusStrong } from "react-icons/md";
import { publicPois } from "./data/public-pois";
import { blocks } from "./data/blocks";

const INITIAL_POSITION = [120.95134859887523, 14.347872973134175];

// Fonction pour recentrer la carte
const recenterMap = (map, position) => {
  if (map) {
    map.getView().animate({
      center: position, // Utilisation directe des coordonnées avec useGeographic
      duration: 500,
      zoom: 16.5,
    });
  }
};

function App() {
  const mapInstanceRef = useRef();
  const vectorSource = useMemo(() => new VectorSource(), []);
  const poiSource = useMemo(() => new VectorSource(), []);

  useGeographic();

  useEffect(() => {
    const map = new Map({
      target: "map",
      layers: [
        new TileLayer({ source: new OSM() }),
        new VectorLayer({ source: vectorSource }),
        new VectorLayer({ source: poiSource }),
      ],
      view: new View({
        center: INITIAL_POSITION,
        zoom: 16.5,
        projection: "EPSG:4326", // Définition explicite de la projection géographique
      }),
    });

    // Ajout des blocs
    blocks.forEach((block) => {
      const polygon = new Feature({
        geometry: new Polygon([block.coords]),
        name: block.name,
      });
      polygon.setStyle(
        new Style({
          fill: new Fill({ color: block.color || "#E0DFDF" }),
          stroke: new Stroke({ color: "#999", width: 1 }),
          text: new Text({
            // Ajoutez cette partie
            text: block.name, // Utilise le nom du bloc
            font: "600 14px Superclarendon, 'Bookman Old Style', 'URW Bookman', 'URW Bookman L', 'Georgia Pro', Georgia, serif",
            fill: new Fill({ color: "#444" }),
            stroke: new Stroke({ color: "#fff", width: 2 }),
          }),
        })
      );

      vectorSource.addFeature(polygon);
    });

    // Ajout des POIs
    publicPois.forEach((poi) => {
      const point = new Feature({
        geometry: new Point(poi.coords),
        name: poi.name,
      });
      point.setStyle(
        new Style({
          image: new Icon({
            src: poi.icon,
            scale: 0.8,
            anchor: [0.5, 1],
          }),
        })
      );
      poiSource.addFeature(point);
    });

    mapInstanceRef.current = map;

    return () => map.setTarget(undefined);
  }, [vectorSource, poiSource]);

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
