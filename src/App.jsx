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
import { Fill, Stroke, Style, Icon, Text, Circle } from "ol/style";
import { supabase } from "./lib/supabase";
import { MdCenterFocusStrong } from "react-icons/md";
import { publicPois } from "./data/public-pois";
import { blocks } from "./data/blocks";

// Style des marqueurs
const createFeatureStyle = (iconUrl, scale, color) => {
  return new Style({
    image: new Icon({
      src: iconUrl,
      scale,
      anchor: [0.5, 1],
      color: color || undefined,
    }),
  });
};

// Styles pour la position utilisateur
const USER_POSITION_STYLES = {
  gps: new Style({
    image: new Circle({
      radius: 8,
      fill: new Fill({ color: "#4285F4" }), // Bleu Google
      stroke: new Stroke({
        color: "white",
        width: 2
      }),
    }),
  }),
  google: new Style({
    image: new Icon({
      src: '/icons/google-marker.svg',
      scale: 0.8,
      anchor: [0.5, 1]
    }),
  }),
  // Nouveau style pour la précision Google
  googleAccuracy: new Style({
    image: new Circle({
      radius: 1,
      fill: new Fill({
        color: "rgba(66, 133, 244, 0.1)"
      }),
      stroke: new Stroke({
        color: "rgba(66, 133, 244, 0.3)",
        width: 1
      })
    })
  }),
  accuracy: new Style({
    image: new Circle({
      radius: 1,
      fill: new Fill({
        color: "rgba(66, 133, 244, 0.2)"
      }),
      stroke: new Stroke({
        color: "rgba(66, 133, 244, 0.5)",
        width: 1
      })
    })
  }),
};

const INITIAL_POSITION = [120.95134859887523, 14.347872973134175];

// Fonction pour recentrer la carte
const recenterMap = (map, position, zoom = 16.5) => {
  if (map && position) {
    map.getView().animate({
      center: position,
      zoom,
      duration: 500,
    });
  }
};

// Composant Modal
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
          <h2>
            Welcome to
            <br />
            Garden Grove Village
          </h2>
          <p>Please enter your destination details</p>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="floating-label">
              <span>Block number</span>
              <input
                type="text"
                placeholder="Select the block number"
                className="input input-md"
                value={block}
                onChange={(e) => setBlock(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="form-group">
            <label className="floating-label">
              <span>Lot number</span>
              <input
                type="text"
                placeholder="Select the lot number"
                className="input input-md"
                value={lot}
                onChange={(e) => setLot(e.target.value)}
                required
              />
            </label>
          </div>

          <button type="submit" className="submit-btn">
            <span className="thumb-up">👍🏻</span> Let's go !{" "}
            <span className="go-bike">🛵</span>
          </button>
        </form>
      </div>
    </div>
  );
};

function App() {
  const mapRef = useRef();
  const mapInstanceRef = useRef();
  const vectorSource = useMemo(() => new VectorSource(), []);
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [destination, setDestination] = useState({ coords: null, data: null });
  const [userPosition, setUserPosition] = useState(null);
  const [positionAccuracy, setPositionAccuracy] = useState(null);
  const [positionSource, setPositionSource] = useState(null);
  const destinationSource = useMemo(() => new VectorSource(), []);
  const userPositionSource = useMemo(() => new VectorSource(), []);
  const poiSource = useMemo(() => new VectorSource(), []);
  const orientationRef = useRef(null);
  const watchIdRef = useRef(null);

  useGeographic();


  // Nouvelle version simplifiée de getBestPosition
  const getBestPosition = async () => {
    // Délai maximum pour obtenir une position (en ms)
    const GPS_TIMEOUT = 10000; 
    
    try {
      // Essai GPS haute précise
      const position = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        
        navigator.geolocation.getCurrentPosition(
          position => resolve(position),
          () => resolve(null),
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: GPS_TIMEOUT
          }
        );
      });

      if (position) {
        return {
          coords: {
            longitude: position.coords.longitude,
            latitude: position.coords.latitude,
            accuracy: position.coords.accuracy
          },
          source: 'gps',
          timestamp: position.timestamp
        };
      }

      // Fallback ultime
      console.warn("Using fallback position");
      return { 
        coords: {
          longitude: INITIAL_POSITION[0],
          latitude: INITIAL_POSITION[1],
          accuracy: 1000
        },
        source: 'fallback',
        timestamp: Date.now()
      };

    } catch (error) {
      console.error("Geolocation error:", error);
      return null;
    }
  };

  /**
   * Adapte la position native au format de l'app
   * Ajoute des métadonnées utiles et filtre les données
   */
  const adaptPosition = (position, source) => ({
    coords: {
      longitude: position.coords.longitude,
      latitude: position.coords.latitude,
      accuracy: position.coords.accuracy
    },
    source,
    timestamp: position.timestamp || Date.now()
  });

  /**
   * Obtient la position la plus précise possible en utilisant les APIs natives
   * Utilise une stratégie à 3 niveaux :
   * 1. GPS haute précision (si disponible)
   * 2. Position réseau récente (cache)
   * 3. Position par défaut (fallback)
   */
  const getPrecisePosition = async () => {
    // Délai maximum pour obtenir une position (en ms)
    const GPS_TIMEOUT = 10000; 
    const NETWORK_TIMEOUT = 5000;
    
    try {
      // 1. Essai GPS haute précise
      const gpsPosition = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        
        navigator.geolocation.getCurrentPosition(
          position => resolve(adaptPosition(position, 'gps')),
          () => resolve(null),
          {
            enableHighAccuracy: true,  // ◼️ Activation du GPS hardware
            maximumAge: 0,            // ◼️ Pas de cache
            timeout: GPS_TIMEOUT
          }
        );
      });

      if (gpsPosition) return gpsPosition;

      // 2. Position réseau (moins précise mais rapide)
      const networkPosition = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          position => resolve(adaptPosition(position, 'network')),
          () => resolve(null),
          {
            enableHighAccuracy: false,
            maximumAge: 300000,        // ◼️ Accepte une position <5min
            timeout: NETWORK_TIMEOUT
          }
        );
      });

      if (networkPosition) return networkPosition;

      // 3. Fallback ultime (position par défaut)
      console.warn("Using fallback position");
      return {
        coords: {
          longitude: INITIAL_POSITION[0],
          latitude: INITIAL_POSITION[1],
          accuracy: 1000
        },
        source: 'fallback',
        timestamp: Date.now()
      };

    } catch (error) {
      console.error("Geolocation error:", error);
      return null;
    }
  };


  // Mise à jour de la position sur la carte
  const updateUserPosition = (position) => {
    if (!position) return;

    setUserPosition(position.coords);
    setPositionAccuracy(position.accuracy);
    setPositionSource(position.source);

    // Mise à jour du marqueur de position
    userPositionSource.clear();
    const pointFeature = new Feature({
      geometry: new Point(position.coords),
      accuracy: position.accuracy,
      source: position.source,
    });

    // Application du style selon la source
    pointFeature.setStyle(USER_POSITION_STYLES[position.source]);

    // Ajout du cercle de précision
    if (position.accuracy) {
      const accuracyFeature = new Feature({
        geometry: new Point(position.coords),
      });
      accuracyFeature.setStyle(
        new Style({
          image: new Circle({
            radius: position.accuracy,
            fill: new Fill({
              color: "rgba(66, 133, 244, 0.2)"
            }),
            stroke: new Stroke({
              color: "rgba(66, 133, 244, 0.5)",
              width: 1
            })
          })
        })
      );
      userPositionSource.addFeature(accuracyFeature);
    }

    userPositionSource.addFeature(pointFeature);
  };

  // Surveillance de l'orientation
  const setupDeviceOrientation = () => {
    if (
      window.DeviceOrientationEvent &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      DeviceOrientationEvent.requestPermission()
        .then((permissionState) => {
          if (permissionState === "granted") {
            window.addEventListener("deviceorientation", handleOrientation);
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener("deviceorientation", handleOrientation);
    }
  };

  const handleOrientation = (event) => {
    orientationRef.current = event.alpha; // 0-360 degrees
  };

  // Configuration de la géolocalisation continue
  const setupGeolocation = () => {
    if (import.meta.env.VITE_DEBUG_GEOLOC) {
      updateUserPosition({ 
        coords: INITIAL_POSITION,
        accuracy: 5,
        source: "debug"
      });
      return () => {};
    }

    let lastWatchId;
    let isHighAccuracyActive = false;

    const startWatching = (highAccuracy) => {
      if (lastWatchId) navigator.geolocation.clearWatch(lastWatchId);

      lastWatchId = navigator.geolocation.watchPosition(
        position => {
          const adapted = adaptPosition(position, highAccuracy ? 'gps' : 'network');
          updateUserPosition(adapted);
          
          // Passage en low power si précision suffisante
          if (highAccuracy && position.coords.accuracy < 15) {
            isHighAccuracyActive = false;
            startWatching(false);
          }
        },
        error => {
          console.error("Watch error:", error);
          if (highAccuracy) startWatching(false);
        },
        {
          enableHighAccuracy: highAccuracy,
          maximumAge: highAccuracy ? 0 : 60000,
          timeout: highAccuracy ? 10000 : 5000
        }
      );

      isHighAccuracyActive = highAccuracy;
    };

    // Démarre en haute précision
    startWatching(true);

    return () => {
      if (lastWatchId) navigator.geolocation.clearWatch(lastWatchId);
    };
  };

  // Gestion de la destination
  const handleDestinationSet = async (block, lot) => {
    try {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("block", block)
        .eq("lot", lot)
        .single();

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

  useEffect(() => {
    // Initialisation de la carte
    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
          className: "osm-layer",
        }),
        new VectorLayer({ source: vectorSource }),
        new VectorLayer({ source: poiSource }),
        new VectorLayer({
          source: userPositionSource,
          zIndex: 100,
        }),
        new VectorLayer({
          source: destinationSource,
          zIndex: 99,
        }),
      ],
      view: new View({
        center: INITIAL_POSITION,
        zoom: 16.5,
      }),
    });

    mapInstanceRef.current = map;

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
            text: block.name,
            font: "600 14px Superclarendon, 'Bookman Old Style', serif",
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

    // Configuration de la géolocalisation
    setupDeviceOrientation();
    setupGeolocation();

    return () => {
      map.setTarget(undefined);
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, []);

  // Mise à jour du marqueur de destination
  useEffect(() => {
    if (!destination?.coords || !destinationSource) return;

    destinationSource.clear();
    const feature = new Feature({
      geometry: new Point(destination.coords),
      type: "destination",
    });
    feature.setStyle(createFeatureStyle("/default-marker.png", 0.7));
    destinationSource.addFeature(feature);
  }, [destination, destinationSource]);

  return (
    <div style={{ position: "relative", height: "100vh" }}>
      <header className="header">
        {positionSource && (
          <div className="position-info">
            Source: <span data-source={positionSource}>{positionSource}</span> | 
            Précision: {positionAccuracy?.toFixed(1)}m
          </div>
        )}
      </header>

      <div
        ref={mapRef}
        className="map"
        style={{ width: "100%", height: "100%" }}
      />

      <button
        onClick={() =>
          userPosition && recenterMap(mapInstanceRef.current, userPosition)
        }
        className="recenter-button"
      >
        <MdCenterFocusStrong />
      </button>

      <WelcomeModal
        isOpen={showWelcomeModal}
        onRequestClose={() => setShowWelcomeModal(false)}
        onDestinationSet={handleDestinationSet}
      />
      <footer className="footer">
        © {new Date().getFullYear()} Garden Grove Village
      </footer>
    </div>
  );
}

export default App;
