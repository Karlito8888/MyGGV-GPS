import { useEffect, useRef, useState, useMemo } from "react";
import { Map } from "ol";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import { Vector as VectorLayer } from "ol/layer";
import { Vector as VectorSource } from "ol/source";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import { Style, Icon, Stroke } from "ol/style";
import { LineString } from "ol/geom";
import "ol/ol.css";

// Icônes
import { MdCenterFocusStrong } from "react-icons/md";
import { supabase } from "./lib/supabase";

// Position initiale
const INITIAL_POSITION = [120.95134859887523, 14.347872973134175];

// Style des marqueurs
const createFeatureStyle = (iconUrl, scale, text = "") => {
  return new Style({
    image: new Icon({
      src: iconUrl,
      scale,
      anchor: [0.5, 1],
    }),
  });
};

// Récupération des locations depuis Supabase
const fetchLocations = async (supabaseInstance, locationsSourceInstance) => {
  const { data, error } = await supabaseInstance.from("locations").select("*");

  if (error) {
    console.error("Error retrieving locations:", error);
    return null;
  }

  if (locationsSourceInstance) {
    locationsSourceInstance.clear();
    const features = data.map((location) => {
      const coordinates = location.coordinates.coordinates;
      const feature = new Feature({
        geometry: new Point(fromLonLat(coordinates)),
        block: location.block,
        lot: location.lot,
        type: "location",
        id: location.id,
        marker_url: location.marker_url || "/markers/default.png",
      });
      feature.setStyle(createFeatureStyle(feature.get("marker_url"), 0.5));
      return feature;
    });
    locationsSourceInstance.addFeatures(features);
  }
  return data;
};

// Recentrage de la carte
const recenterMap = (map, position) => {
  if (map) {
    map.getView().animate({
      center: fromLonLat(position),
      duration: 500,
      zoom: 16,
    });
  }
};

// Initialisation de la carte
const initializeMap = (mapTargetId, initialPosition, locationsSource) => {
  const map = new Map({
    target: mapTargetId,
    layers: [
      new TileLayer({ source: new OSM() }),
      new VectorLayer({ source: locationsSource }),
    ],
    view: new View({
      center: fromLonLat(initialPosition),
      zoom: 16,
    }),
  });
  return map;
};

// Hook de géolocalisation
const useGeolocation = ({ timeout }) => {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const defaultOptions = {
    enableHighAccuracy: false,
    maximumAge: 0,
    timeout: timeout || 30000,
  };

  const updatePosition = (location) => {
    setPosition({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      timestamp: location.timestamp,
    });
  };

  useEffect(() => {
    if (!navigator.permission) return;

    let geoWatchId;

    const handleSuccess = (pos) => {
      updatePosition(pos);
      setLoading(false);
    };

    const handleError = (err) => {
      setError({
        code: err.code,
        message: err.message,
      });
      setLoading(false);
      console.error("Erreur de géolocalisation", err);
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        handleError,
        defaultOptions
      );

      geoWatchId = navigator.geolocation.watchPosition(
        handleSuccess,
        handleError,
        defaultOptions
      );
    } else {
      setError({
        message: "Géolocalisation non supportée",
      });
    }

    return () => {
      navigator.geolocation?.clearWatch(geoWatchId);
    };
  }, []);

  return {
    position,
    error,
    loading,
  };
};

// Composant WelcomeModal
function WelcomeModal({ isOpen, onRequestClose, onDestinationSet }) {
  const [block, setBlock] = useState("");
  const [lot, setLot] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onDestinationSet(block, lot);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-96 bg-opacity-90 shadow-xl">
        <h2 className="text-xl font-bold mb-4">Bienvenue</h2>
        <p className="mb-4">
          Veuillez entrer les coordonnées de votre destination
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-2">Numéro de bloc</label>
            <input
              type="text"
              value={block}
              onChange={(e) => setBlock(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block mb-2">Numéro de lot</label>
            <input
              type="text"
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Valider
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Composant RouteLayer
const RouteLayer = ({ map, start, end, onArrival }) => {
  const routeLayerRef = useRef(null);
  const arrivalCheckRef = useRef(null);

  const routeStyle = new Style({
    stroke: new Stroke({
      color: "#3b82f6",
      width: 6,
    }),
  });

  useEffect(() => {
    if (!map || !start || !end) return;

    const routeLayer = new VectorLayer({
      source: new VectorSource(),
      style: routeStyle,
      zIndex: 100,
    });
    routeLayerRef.current = routeLayer;
    map.addLayer(routeLayer);

    const route = new LineString([
      [start.longitude, start.latitude],
      [end.longitude, end.latitude],
    ]);

    const routeFeature = new Feature({
      geometry: route,
    });
    routeLayer.getSource().addFeature(routeFeature);

    arrivalCheckRef.current = setInterval(() => {
      const distance = Math.sqrt(
        Math.pow(start.longitude - end.longitude, 2) +
          Math.pow(start.latitude - end.latitude, 2)
      );
      if (distance < 0.0005) {
        clearInterval(arrivalCheckRef.current);
        onArrival();
      }
    }, 1000);

    return () => {
      map.removeLayer(routeLayer);
      clearInterval(arrivalCheckRef.current);
    };
  }, [map, start, end]);

  return null;
};

// Composant ArrivalModal
const ArrivalModal = ({ isOpen, destination, onNewDestination, onExit }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
        <div className="text-center mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-16 w-16 mx-auto text-green-500 mb-4 animate-bounce"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>

          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Vous êtes arrivé !
          </h2>

          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <p className="text-lg font-medium text-blue-800">
              <span className="font-bold">Bloc</span>: {destination.block}
            </p>
            <p className="text-lg font-medium text-blue-800">
              <span className="font-bold">Lot</span>: {destination.lot}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={onNewDestination}
            className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-medium transition-colors"
          >
            <div className="flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
              Nouvelle destination
            </div>
          </button>

          <button
            onClick={onExit}
            className="bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-xl font-medium transition-colors"
          >
            <div className="flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z"
                  clipRule="evenodd"
                />
              </svg>
              Quitter l'application
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default function MapCore() {
  const mapRef = useRef(null);
  const locationsSource = useMemo(() => new VectorSource(), []);
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [destination, setDestination] = useState(null);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const { position: userPosition } = useGeolocation({ timeout: 5000 });

  // Recentrage
  const handleRecenterClick = () => {
    recenterMap(mapRef.current, INITIAL_POSITION);
  };

  // Gestion de la destination
  const handleDestinationSet = (block, lot) => {
    setShowWelcomeModal(false);
    // Ici vous devriez trouver les coordonnées correspondantes au bloc/lot
    // Pour l'exemple, on utilise une position fictive
    setDestination({
      block,
      lot,
      coordinates: [120.95134859887523, 14.347872973134175], // À remplacer par les vraies coordonnées
    });
  };

  // Gestion de l'arrivée
  const handleArrival = () => {
    setShowArrivalModal(true);
  };

  // Initialisation
  useEffect(() => {
    if (!mapRef.current) {
      const map = initializeMap("map", INITIAL_POSITION, locationsSource);
      mapRef.current = map;
    }

    // Chargement des données
    const loadData = async () => {
      await fetchLocations(supabase, locationsSource);
    };
    loadData();

    return () => {
      if (mapRef.current) {
        mapRef.current.setTarget(undefined);
      }
    };
  }, [locationsSource]);

  return (
    <div className="map-container relative">
      <div id="map" className="map absolute inset-0" />
      <button onClick={handleRecenterClick} className="recenter-button">
        <MdCenterFocusStrong />
      </button>

      <WelcomeModal
        isOpen={showWelcomeModal}
        onRequestClose={() => setShowWelcomeModal(false)}
        onDestinationSet={handleDestinationSet}
      />

      {destination && userPosition && (
        <RouteLayer
          map={mapRef.current}
          start={{
            longitude: userPosition.longitude,
            latitude: userPosition.latitude,
          }}
          end={{
            longitude: destination.coordinates[0],
            latitude: destination.coordinates[1],
          }}
          onArrival={handleArrival}
        />
      )}

      <ArrivalModal
        isOpen={showArrivalModal}
        destination={destination}
        onNewDestination={() => {
          setShowArrivalModal(false);
          setShowWelcomeModal(true);
        }}
        onExit={() => {
          // Logique pour quitter l'application
          console.log("Quitter l'application");
        }}
      />
    </div>
  );
}
