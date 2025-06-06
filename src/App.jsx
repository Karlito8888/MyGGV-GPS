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

// Styles pour la position utilisateur (plus visibles)
const USER_POSITION_STYLES = {
  gps: new Style({
    image: new Circle({
      radius: 12, // Plus gros
      fill: new Fill({ color: "#34A853" }),
      stroke: new Stroke({
        color: "white",
        width: 3, // Bordure plus épaisse
      }),
    }),
  }),
  fallback: new Style({
    image: new Circle({
      radius: 10,
      fill: new Fill({ color: "#EA4335" }),
      stroke: new Stroke({
        color: "white",
        width: 3,
      }),
    }),
  }),
  debug: new Style({
    image: new Circle({
      radius: 12,
      fill: new Fill({ color: "#4285F4" }),
      stroke: new Stroke({
        color: "white",
        width: 3,
      }),
    }),
  }),
  test: new Style({
    image: new Circle({
      radius: 15, // Très visible pour les tests
      fill: new Fill({ color: "#FF9800" }), // Orange
      stroke: new Stroke({
        color: "#000000", // Bordure noire
        width: 4,
      }),
    }),
  }),
  forced: new Style({
    image: new Circle({
      radius: 15,
      fill: new Fill({ color: "#9C27B0" }), // Violet
      stroke: new Stroke({
        color: "#FFFFFF",
        width: 4,
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

  // État pour les logs de debug visibles
  const [debugLogs, setDebugLogs] = useState([]);

  useGeographic();

  // Fonction pour ajouter des logs visibles (définie en premier)
  const addDebugLog = useCallback((message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `${timestamp}: ${message}${
      data ? ` | ${JSON.stringify(data)}` : ""
    }`;
    console.log(logEntry);
    setDebugLogs((prev) => [...prev.slice(-4), logEntry]); // Garde seulement les 5 derniers logs
  }, []);

  /**
   * Adapte la position native au format de l'app
   * Ajoute des métadonnées utiles et filtre les données
   */
  const adaptPosition = useCallback(
    (position, source) => ({
      coords: {
        longitude: position.coords.longitude,
        latitude: position.coords.latitude,
      },
      accuracy: position.coords.accuracy, // Accuracy au niveau racine
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
      if (!position) {
        addDebugLog("⚠️ updateUserPosition: position null");
        return;
      }

      addDebugLog("🗺️ Mise à jour position carte", {
        coords: position.coords,
        accuracy: position.accuracy,
        source: position.source,
      });

      setUserPosition(position.coords);
      setPositionAccuracy(position.accuracy);
      setPositionSource(position.source);

      // Vérification des sources
      if (!userPositionSource) {
        addDebugLog("❌ userPositionSource manquant");
        return;
      }

      // Mise à jour du marqueur de position
      userPositionSource.clear();
      addDebugLog("🧹 Source cleared");

      const pointFeature = new Feature({
        geometry: new Point(position.coords),
        accuracy: position.accuracy,
        source: position.source,
      });

      // Vérification du style
      const style = USER_POSITION_STYLES[position.source];
      if (!style) {
        addDebugLog("❌ Style manquant pour", { source: position.source });
        return;
      }

      // Application du style selon la source
      pointFeature.setStyle(style);
      addDebugLog("🎨 Style appliqué", { source: position.source });

      // Ajout du cercle de précision
      addDebugLog("🔍 Vérif accuracy", {
        accuracy: position.accuracy,
        type: typeof position.accuracy,
      });

      if (position.accuracy && position.accuracy > 0) {
        const accuracyFeature = new Feature({
          geometry: new Point(position.coords),
        });
        // Clone et met à jour le style pour la précision
        const clonedStyle = accuracyStyle.clone();
        clonedStyle.getImage().setRadius(position.accuracy);
        accuracyFeature.setStyle(clonedStyle);
        userPositionSource.addFeature(accuracyFeature);
        addDebugLog("🎯 Cercle précision ajouté", {
          radius: position.accuracy,
        });
      } else {
        addDebugLog("⚠️ Pas de cercle précision", {
          accuracy: position.accuracy,
        });
      }

      userPositionSource.addFeature(pointFeature);
      addDebugLog("📍 Marqueur ajouté à la carte");

      // Vérification finale
      const featureCount = userPositionSource.getFeatures().length;
      addDebugLog("✅ Features sur carte", { count: featureCount });

      // Auto-recentrage sur la première position
      if (mapInstanceRef.current) {
        addDebugLog("🎯 Recentrage auto sur position");
        recenterMap(mapInstanceRef.current, position.coords);
      }
    },
    [userPositionSource, accuracyStyle, addDebugLog]
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

  // Simple : utilise debug si la variable est définie à "true"
  const debugMode = import.meta.env.VITE_DEBUG_GEOLOC === "true";

  // Configuration de la géolocalisation continue
  const setupGeolocation = () => {
    addDebugLog("🔍 Config géoloc", {
      VITE_DEBUG_GEOLOC: import.meta.env.VITE_DEBUG_GEOLOC,
      debugMode,
      hasGeolocation: !!navigator.geolocation,
    });

    if (debugMode) {
      addDebugLog("🖥️ Mode debug activé");
      updateUserPosition({
        coords: INITIAL_POSITION,
        accuracy: 5,
        source: "debug",
      });
      return () => {};
    }

    addDebugLog("📱 Mode géoloc réelle activé");

    let lastWatchId;

    const startWatching = (highAccuracy) => {
      if (lastWatchId) {
        addDebugLog("🔄 Arrêt watch précédent");
        navigator.geolocation.clearWatch(lastWatchId);
      }

      addDebugLog("📍 Démarrage watch", { highAccuracy });

      lastWatchId = navigator.geolocation.watchPosition(
        (position) => {
          addDebugLog("✅ Position reçue", {
            lat: position.coords.latitude.toFixed(6),
            lng: position.coords.longitude.toFixed(6),
            accuracy: Math.round(position.coords.accuracy),
          });

          const adapted = adaptPosition(
            position,
            highAccuracy ? "gps" : "network"
          );
          updateUserPosition(adapted);

          // Passage en low power si précision suffisante
          if (highAccuracy && position.coords.accuracy < 15) {
            addDebugLog("🎯 Passage mode économie");
            isHighAccuracyActiveRef.current = false;
            startWatching(false);
          }
        },
        (error) => {
          const errorTypes = {
            1: "PERMISSION_DENIED",
            2: "POSITION_UNAVAILABLE",
            3: "TIMEOUT",
          };

          addDebugLog("❌ Erreur géoloc", {
            code: error.code,
            type: errorTypes[error.code],
            message: error.message,
          });

          if (highAccuracy) {
            addDebugLog("🔄 Tentative basse précision");
            startWatching(false);
          } else {
            addDebugLog("💥 Échec total géolocalisation");
          }
        },
        {
          enableHighAccuracy: highAccuracy,
          maximumAge: highAccuracy ? 0 : 60000,
          timeout: highAccuracy ? 15000 : 10000, // Timeout plus long
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
    if (!userPosition || !destination?.coords) {
      console.error("❌ Impossible de démarrer la navigation:", {
        userPosition,
        destination,
      });
      return;
    }

    console.log("🚀 Démarrage de la navigation:", {
      userPosition,
      destination: destination.coords,
    });

    try {
      const routeData = await calculateRoute(userPosition, destination.coords);
      console.log("✅ Route calculée:", routeData);

      setRoute(routeData);
      setIsNavigating(true);

      // Afficher la route sur la carte
      routeSource.clear();
      console.log(
        "🗺️ Création de la géométrie de route avec",
        routeData.coordinates.length,
        "points"
      );

      const routeFeature = new Feature({
        geometry: new LineString(routeData.coordinates),
      });
      routeFeature.setStyle(ROUTE_STYLE);
      routeSource.addFeature(routeFeature);

      console.log("✅ Route ajoutée à la carte");

      // Ajuster la vue pour montrer la route complète
      const extent = routeFeature.getGeometry().getExtent();
      mapInstanceRef.current
        .getView()
        .fit(extent, { padding: [50, 50, 50, 50] });

      console.log("✅ Vue ajustée pour montrer la route");
    } catch (error) {
      console.error("❌ Erreur lors du calcul de l'itinéraire:", error);
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
    addDebugLog("🗺️ Initialisation carte...");

    try {
      // Vérification du conteneur
      if (!mapRef.current) {
        addDebugLog("❌ Conteneur carte manquant");
        return;
      }

      addDebugLog("✅ Conteneur carte OK");

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

      addDebugLog("✅ Carte créée");
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

      addDebugLog("✅ Carte initialisée avec succès");
    } catch (error) {
      addDebugLog("❌ Erreur initialisation carte", { error: error.message });
      console.error("Erreur carte:", error);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined);
      }
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [addDebugLog]);

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
            {debugMode && (
              <span style={{ color: "red", fontWeight: "bold" }}>
                {" "}
                | DEBUG MODE
              </span>
            )}
          </div>
        )}
      </header>

      <div
        ref={mapRef}
        className="map"
        style={{
          width: "100%",
          height: "100%",
          background: "#f0f0f0", // Couleur de fond pour voir si le conteneur existe
        }}
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

      {/* Boutons de debug géolocalisation */}
      {!userPosition && (
        <div
          style={{
            position: "absolute",
            top: "80px",
            right: "25px",
            zIndex: 1000,
          }}
        >
          <button
            onClick={() => {
              addDebugLog("🔄 Test géoloc forcé");
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  addDebugLog("✅ Test réussi");
                  const adapted = adaptPosition(position, "test");
                  updateUserPosition(adapted);
                },
                (error) => {
                  addDebugLog("❌ Test échoué", {
                    code: error.code,
                    msg: error.message,
                  });
                },
                { enableHighAccuracy: true, timeout: 10000 }
              );
            }}
            style={{
              display: "block",
              marginBottom: "10px",
              padding: "10px",
              background: "#ff6b6b",
              color: "white",
              border: "none",
              borderRadius: "5px",
            }}
          >
            Test GPS
          </button>

          <button
            onClick={() => {
              addDebugLog("🔄 Demande permission");
              if (navigator.permissions) {
                navigator.permissions
                  .query({ name: "geolocation" })
                  .then((result) => {
                    addDebugLog("📋 Permission status", {
                      state: result.state,
                    });
                  });
              } else {
                addDebugLog("❌ Permissions API non disponible");
              }

              // Force VRAIMENT une demande avec callback complet
              addDebugLog("🚀 Force demande géoloc...");
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  addDebugLog("🎉 Permission accordée!", {
                    lat: position.coords.latitude.toFixed(6),
                    lng: position.coords.longitude.toFixed(6),
                  });
                  const adapted = adaptPosition(position, "forced");
                  updateUserPosition(adapted);
                },
                (error) => {
                  addDebugLog("❌ Permission refusée", {
                    code: error.code,
                    message: error.message,
                  });
                },
                {
                  enableHighAccuracy: false,
                  timeout: 30000,
                  maximumAge: 0,
                }
              );
            }}
            style={{
              display: "block",
              padding: "10px",
              background: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "5px",
            }}
          >
            Force Permission
          </button>
        </div>
      )}

      {/* Bouton de debug pour position existante */}
      {userPosition && (
        <button
          onClick={() => {
            addDebugLog("🔍 Debug position actuelle", {
              userPosition,
              accuracy: positionAccuracy,
              source: positionSource,
            });

            // Vérifier les features sur la carte
            const features = userPositionSource.getFeatures();
            addDebugLog("🗺️ Features actuelles", { count: features.length });

            // Force recentrage
            if (mapInstanceRef.current) {
              addDebugLog("🎯 Force recentrage");
              recenterMap(mapInstanceRef.current, userPosition);
            }
          }}
          style={{
            position: "absolute",
            top: "80px",
            left: "25px",
            padding: "10px",
            background: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "5px",
            zIndex: 1000,
          }}
        >
          Debug Position
        </button>
      )}

      {/* Affichage des logs de debug */}
      {debugLogs.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "100px",
            left: "10px",
            right: "10px",
            background: "rgba(0,0,0,0.8)",
            color: "white",
            padding: "10px",
            borderRadius: "5px",
            fontSize: "12px",
            fontFamily: "monospace",
            zIndex: 1000,
            maxHeight: "200px",
            overflow: "auto",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
            Debug Logs:
          </div>
          {debugLogs.map((log, index) => (
            <div
              key={index}
              style={{ marginBottom: "2px", wordBreak: "break-all" }}
            >
              {log}
            </div>
          ))}
          <button
            onClick={() => setDebugLogs([])}
            style={{
              marginTop: "5px",
              padding: "5px 10px",
              background: "#666",
              color: "white",
              border: "none",
              borderRadius: "3px",
              fontSize: "10px",
            }}
          >
            Clear Logs
          </button>
        </div>
      )}

      {/* Interface de navigation */}
      {destination?.coords && userPosition && !showWelcomeModal && (
        <div className="navigation-controls">
          {!isNavigating ? (
            <button
              onClick={startNavigation}
              className="navigation-button start-navigation"
            >
              <MdNavigation />
              <span>Start</span>
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
