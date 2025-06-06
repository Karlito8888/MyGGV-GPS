import React, { useEffect, useRef, useMemo, useState } from "react";
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

// Style des marqueurs
const createFeatureStyle = (iconUrl, scale) => {
  return new Style({
    image: new Icon({
      src: iconUrl,
      scale,
      anchor: [0.5, 1],
    }),
  });
};

// Récupération des locations depuis Supabase
const fetchLocations = async (supabaseInstance, locationSource) => {
  const { data, error } = await supabaseInstance.from("locations").select("*");

  if (error) {
    console.error("Erreur de récupération des locations:", error);
    return null;
  }

  if (locationSource) {
    locationSource.clear();
    const features = data.map((location) => {
      const coordinates = location.coordinates.coordinates;
      const feature = new Feature({
        geometry: new Point(fromLonLat(coordinates)),
        block: location.block,
        lot: location.lot,
        type: "location",
        id: location.id,
        marker_url: location.marker_url || "/default-marker.png",
      });
      feature.setStyle(createFeatureStyle(feature.get("marker_url"), 0.5));
      return feature;
    });
    locationSource.addFeatures(features);
  }
  return data;
};

const INITIAL_POSITION = [120.95134859887523, 14.347872973134175];

// Fonction pour recentrer la carte
const recenterMap = (map, position) => {
  if (map) {
    map.getView().animate({
      center: fromLonLat(position),
      duration: 500,
      zoom: 16.5,
    });
  }
};

function App() {
  const mapInstanceRef = useRef();
  const vectorSource = useMemo(() => new VectorSource(), []);
  const poiSource = useMemo(() => new VectorSource(), []);
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [destination, setDestination] = useState({
    coords: null,
    data: null,
  });
  const [userPosition, setUserPosition] = useState(null);
  const destinationSource = useMemo(() => new VectorSource(), []);

  useGeographic();

  useEffect(() => {
    // Test de connexion Supabase
    supabase
      .from("locations")
      .select("*", { count: "exact", head: true })
      .then(({ count, error }) => {
        console.log(
          "[Supabase] Test de connexion - Nombre de locations:",
          count
        );
        if (error) console.error("[Supabase] Erreur de connexion:", error);
      });

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

    fetchLocations(supabase, poiSource);

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

    // Ajout de la couche de destination
    map.addLayer(
      new VectorLayer({
        source: destinationSource,
        style: new Style({
          image: new Icon({
            src: "/default-marker.png",
            scale: 1,
            anchor: [0.5, 1],
          }),
        }),
      })
    );

    // Activation de la géolocalisation
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserPosition([pos.coords.longitude, pos.coords.latitude]);
        },
        (err) => console.error("Geoloc error:", err),
        { enableHighAccuracy: true }
      );
      return () => {
        map.setTarget(undefined);
        navigator.geolocation.clearWatch(watchId);
      };
    }

    return () => map.setTarget(undefined);
  }, [vectorSource, poiSource]);

  // Gestion du clic pour recentrer
  const handleRecenterClick = () => {
    if (mapInstanceRef.current) {
      recenterMap(mapInstanceRef.current, INITIAL_POSITION);
    }
  };

  const WelcomeModal = ({ isOpen, onRequestClose, onDestinationSet }) => {
    const [block, setBlock] = useState("");
    const [lot, setLot] = useState("");

    const handleSubmit = (e) => {
      e.preventDefault();
      onDestinationSet(block, lot);
    };

    if (!isOpen) return null;

    return (
      <div className="welcome-modal-overlay">
        <div className="welcome-modal">
          <div className="modal-header">
            <h2>Bienvenue</h2>
            <p>Veuillez entrer les coordonnées de votre destination</p>
          </div>

          <form onSubmit={handleSubmit} className="modal-form">
            <div className="form-group">
              <label>Numéro de bloc</label>
              <input
                type="text"
                value={block}
                onChange={(e) => setBlock(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Numéro de lot</label>
              <input
                type="text"
                value={lot}
                onChange={(e) => setLot(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="submit-btn">
              Valider
            </button>
          </form>
        </div>
      </div>
    );
  };

  const handleDestinationSet = async (block, lot) => {
    console.log("[Destination] Recherche bloc:", block, "lot:", lot);

    try {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("block", block)
        .eq("lot", lot)
        .single();

      console.log("[Destination] Réponse Supabase:", { error, data });

      if (error || !data) throw error || new Error("Location introuvable");

      setDestination({
        coords: data.coordinates.coordinates,
        data,
      });
      setShowWelcomeModal(false);
      recenterMap(mapInstanceRef.current, data.coordinates.coordinates);
    } catch (err) {
      console.error("[Destination] Erreur:", err);
      alert(`Bloc ${block}, Lot ${lot} introuvable`);
    }
  };

  // Effet pour mettre à jour le marqueur de destination
  useEffect(() => {
    if (!destination?.coords || !destinationSource || !mapInstanceRef.current)
      return;

    destinationSource.clear();
    const feature = new Feature({
      geometry: new Point(fromLonLat(destination.coords)),
      type: "destination",
    });
    destinationSource.addFeature(feature);
  }, [destination, destinationSource]);

  return (
    <div style={{ position: "relative", height: "100vh" }}>
      <header className="header">Header Content</header>
      <div id="map" className="map" />
      <button onClick={handleRecenterClick} className="recenter-button">
        <MdCenterFocusStrong />
      </button>
      <footer className="footer">Footer Content</footer>

      <WelcomeModal
        isOpen={showWelcomeModal}
        onRequestClose={() => setShowWelcomeModal(false)}
        onDestinationSet={handleDestinationSet}
      />
    </div>
  );
}

export default App;
