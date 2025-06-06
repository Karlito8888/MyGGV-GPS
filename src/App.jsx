import React, {
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
} from "react";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import { Vector as VectorLayer } from "ol/layer";
import { Vector as VectorSource } from "ol/source";
import OSM from "ol/source/OSM";
import { useGeographic } from "ol/proj";
import { Feature } from "ol";
import { Point, Polygon, LineString } from "ol/geom";
import { Fill, Stroke, Style, Icon, Text, Circle } from "ol/style";
import { supabase } from "./lib/supabase";
import { MdCenterFocusStrong, MdNavigation, MdStop } from "react-icons/md";
import { publicPois } from "./data/public-pois";
import { blocks } from "./data/blocks";
import * as turf from "@turf/turf";

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
      fill: new Fill({ color: "#34A853" }),
      stroke: new Stroke({
        color: "white",
        width: 2,
      }),
    }),
  }),
  fallback: new Style({
    image: new Circle({
      radius: 6,
      fill: new Fill({ color: "#EA4335" }),
      stroke: new Stroke({
        color: "white",
        width: 2,
      }),
    }),
  }),
  debug: new Style({
    image: new Circle({
      radius: 10,
      fill: new Fill({ color: "#4285F4" }),
      stroke: new Stroke({
        color: "white",
        width: 3,
      }),
    }),
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

// Fonction pour calculer la distance entre deux points
const calculateDistance = (point1, point2) => {
  const from = turf.point([point1[0], point1[1]]);
  const to = turf.point([point2[0], point2[1]]);
  return turf.distance(from, to, { units: "meters" });
};

// Fonction pour calculer l'itinéraire avec OpenRouteService
const calculateRoute = async (start, end) => {
  // Commençons directement avec OSRM qui est plus fiable et gratuit
  try {
    console.log("🗺️ Calcul d'itinéraire de", start, "vers", end);

    // OSRM (gratuit, pas de clé API nécessaire)
    const osrmUrl = `https://router.project-osrm.org/route/v1/walking/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson&steps=true`;

    console.log("📡 Appel OSRM:", osrmUrl);

    const osrmResponse = await fetch(osrmUrl);

    if (!osrmResponse.ok) {
      throw new Error(`Erreur OSRM: ${osrmResponse.status}`);
    }

    const osrmData = await osrmResponse.json();
    console.log("📊 Réponse OSRM:", osrmData);

    if (!osrmData.routes || osrmData.routes.length === 0) {
      throw new Error("Aucun itinéraire OSRM trouvé");
    }

    const route = osrmData.routes[0];

    return {
      coordinates: route.geometry.coordinates,
      distance: route.distance, // en mètres
      duration: route.duration, // en secondes
      steps: route.legs[0]?.steps || [],
      provider: "osrm",
    };
  } catch (osrmError) {
    console.warn("Erreur avec OSRM, essai avec OpenRouteService:", osrmError);

    // Fallback vers OpenRouteService seulement si OSRM échoue
    try {
      const ORS_API_KEY = import.meta.env.VITE_OPENROUTE_API_KEY;

      if (!ORS_API_KEY || ORS_API_KEY.includes("your_api_key_here")) {
        throw new Error("Clé API OpenRouteService non configurée");
      }

      const url = `https://api.openrouteservice.org/v2/directions/foot-walking`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ORS_API_KEY}`,
        },
        body: JSON.stringify({
          coordinates: [start, end],
          format: "geojson",
          options: {
            avoid_features: ["highways"],
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erreur API OpenRouteService: ${response.status} - ${errorText}`
        );
      }

      const data = await response.json();

      if (!data.features || data.features.length === 0) {
        throw new Error("Aucun itinéraire trouvé");
      }

      const route = data.features[0];
      const coordinates = route.geometry.coordinates;
      const properties = route.properties;

      return {
        coordinates: coordinates,
        distance: properties.segments[0].distance,
        duration: properties.segments[0].duration,
        steps: properties.segments[0].steps || [],
        provider: "openroute",
      };
    } catch (orsError) {
      console.warn(
        "Erreur avec OpenRouteService aussi, fallback vers ligne droite:",
        orsError
      );

      // Dernier fallback vers calcul simple
      return {
        coordinates: [start, end],
        distance: calculateDistance(start, end),
        duration: Math.round(calculateDistance(start, end) / 1.4), // ~1.4 m/s vitesse de marche
        steps: [],
        fallback: true,
      };
    }
  }
};

// Style pour la route
const ROUTE_STYLE = new Style({
  stroke: new Stroke({
    color: "#3b82f6",
    width: 6,
    lineCap: "round",
    lineJoin: "round",
  }),
});

// Composant Modal optimisé
const WelcomeModal = React.memo(({ isOpen, onDestinationSet }) => {
  const [block, setBlock] = useState("");
  const [lot, setLot] = useState("");

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      onDestinationSet(block, lot);
    },
    [block, lot, onDestinationSet]
  );

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
            <span className="go-bike">🛵💨</span>
          </button>
        </form>
      </div>
    </div>
  );
});

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
  const routeSource = useMemo(() => new VectorSource(), []); // Nouvelle source pour la route
  const orientationRef = useRef(null);
  const watchIdRef = useRef(null);
  const isHighAccuracyActiveRef = useRef(false);

  // Nouveaux états pour la navigation
  const [isNavigating, setIsNavigating] = useState(false);
  const [route, setRoute] = useState(null);
  const [distanceToDestination, setDistanceToDestination] = useState(null);
  const [hasArrived, setHasArrived] = useState(false);

  useGeographic();

  /**
   * Adapte la position native au format de l'app
   * Ajoute des métadonnées utiles et filtre les données
   */
  const adaptPosition = useCallback(
    (position, source) => ({
      coords: {
        longitude: position.coords.longitude,
        latitude: position.coords.latitude,
        accuracy: position.coords.accuracy,
      },
      source,
      timestamp: position.timestamp || Date.now(),
    }),
    []
  );

  // Style pour le cercle de précision (optimisé)
  const accuracyStyle = useMemo(
    () =>
      new Style({
        image: new Circle({
          radius: 1, // sera mis à jour dynamiquement
          fill: new Fill({
            color: "rgba(66, 133, 244, 0.2)",
          }),
          stroke: new Stroke({
            color: "rgba(66, 133, 244, 0.5)",
            width: 1,
          }),
        }),
      }),
    []
  );

  // Mise à jour de la position sur la carte
  const updateUserPosition = useCallback(
    (position) => {
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
        // Clone et met à jour le style pour la précision
        const clonedStyle = accuracyStyle.clone();
        clonedStyle.getImage().setRadius(position.accuracy);
        accuracyFeature.setStyle(clonedStyle);
        userPositionSource.addFeature(accuracyFeature);
      }

      userPositionSource.addFeature(pointFeature);
    },
    [userPositionSource, accuracyStyle]
  );

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

  const handleOrientation = useCallback((event) => {
    orientationRef.current = event.alpha; // 0-360 degrees
  }, []);

  // Configuration de la géolocalisation continue
  const setupGeolocation = () => {
    if (import.meta.env.VITE_DEBUG_GEOLOC) {
      updateUserPosition({
        coords: INITIAL_POSITION,
        accuracy: 5,
        source: "debug",
      });
      return () => {};
    }

    let lastWatchId;

    const startWatching = (highAccuracy) => {
      if (lastWatchId) navigator.geolocation.clearWatch(lastWatchId);

      lastWatchId = navigator.geolocation.watchPosition(
        (position) => {
          const adapted = adaptPosition(
            position,
            highAccuracy ? "gps" : "network"
          );
          updateUserPosition(adapted);

          // Passage en low power si précision suffisante
          if (highAccuracy && position.coords.accuracy < 15) {
            isHighAccuracyActiveRef.current = false;
            startWatching(false);
          }
        },
        (error) => {
          console.error("Watch error:", error);
          if (highAccuracy) startWatching(false);
        },
        {
          enableHighAccuracy: highAccuracy,
          maximumAge: highAccuracy ? 0 : 60000,
          timeout: highAccuracy ? 10000 : 5000,
        }
      );

      isHighAccuracyActiveRef.current = highAccuracy;
    };

    // Démarre en haute précision
    startWatching(true);

    return () => {
      if (lastWatchId) navigator.geolocation.clearWatch(lastWatchId);
    };
  };

  // Fonction pour démarrer la navigation
  const startNavigation = useCallback(async () => {
    if (!userPosition || !destination?.coords) return;

    try {
      const routeData = await calculateRoute(userPosition, destination.coords);
      setRoute(routeData);
      setIsNavigating(true);

      // Afficher la route sur la carte
      routeSource.clear();
      const routeFeature = new Feature({
        geometry: new LineString(routeData.coordinates),
      });
      routeFeature.setStyle(ROUTE_STYLE);
      routeSource.addFeature(routeFeature);

      // Ajuster la vue pour montrer la route complète
      const extent = routeFeature.getGeometry().getExtent();
      mapInstanceRef.current
        .getView()
        .fit(extent, { padding: [50, 50, 50, 50] });
    } catch (error) {
      console.error("Erreur lors du calcul de l'itinéraire:", error);
      alert("Impossible de calculer l'itinéraire");
    }
  }, [userPosition, destination, routeSource]);

  // Fonction pour arrêter la navigation
  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setRoute(null);
    setDistanceToDestination(null);
    setHasArrived(false);
    routeSource.clear();
  }, [routeSource]);

  // Gestion de la destination
  const handleDestinationSet = useCallback(async (block, lot) => {
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
  }, []);

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
        new VectorLayer({
          source: routeSource,
          zIndex: 98,
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

  // Style de destination optimisé
  const destinationStyle = useMemo(
    () => createFeatureStyle("/default-marker.png", 0.7),
    []
  );

  // Surveillance de la distance et détection d'arrivée
  useEffect(() => {
    if (!isNavigating || !userPosition || !destination?.coords) return;

    const distance = calculateDistance(userPosition, destination.coords);
    setDistanceToDestination(distance);

    // Détection d'arrivée (moins de 10 mètres)
    if (distance < 10 && !hasArrived) {
      setHasArrived(true);
      setIsNavigating(false);
      alert(
        `🎉 You have arrived at ${destination.data?.block} - ${destination.data?.lot}!`
      );
    }
  }, [userPosition, destination, isNavigating, hasArrived]);

  // Mise à jour du marqueur de destination
  useEffect(() => {
    if (!destination?.coords || !destinationSource) return;

    destinationSource.clear();
    const feature = new Feature({
      geometry: new Point(destination.coords),
      type: "destination",
    });
    feature.setStyle(destinationStyle);
    destinationSource.addFeature(feature);
  }, [destination, destinationSource, destinationStyle]);

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
        onClick={useCallback(
          () =>
            userPosition && recenterMap(mapInstanceRef.current, userPosition),
          [userPosition]
        )}
        className="recenter-button"
      >
        <MdCenterFocusStrong />
      </button>

      {/* Interface de navigation */}
      {destination?.coords && userPosition && !showWelcomeModal && (
        <div className="navigation-controls">
          {!isNavigating ? (
            <button
              onClick={startNavigation}
              className="navigation-button start-navigation"
            >
              <MdNavigation />
              <span>Start navigation</span>
            </button>
          ) : (
            <div className="navigation-info">
              <button
                onClick={stopNavigation}
                className="navigation-button stop-navigation"
              >
                <MdStop />
                <span>Stop</span>
              </button>
              {distanceToDestination && (
                <div className="distance-info">
                  <span>Distance: {Math.round(distanceToDestination)}m</span>
                  {route && (
                    <>
                      <span>
                        Duration: {Math.round(route.duration / 60)}min
                      </span>
                      {route.provider && (
                        <span className="route-provider">
                          via{" "}
                          {route.provider === "osrm"
                            ? "OSRM"
                            : route.fallback
                            ? "Direct"
                            : "ORS"}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <WelcomeModal
        isOpen={showWelcomeModal}
        onDestinationSet={handleDestinationSet}
      />
      <footer className="footer">
        © {new Date().getFullYear()} Garden Grove Village
      </footer>
    </div>
  );
}

export default App;
