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
import { toRadians } from "ol/math";
import { supabase } from "./lib/supabase";
import { MdCenterFocusStrong, MdNavigation, MdStop } from "react-icons/md";
import { publicPois } from "./data/public-pois";
import { blocks } from "./data/blocks";
import * as turf from "@turf/turf";
import GyroNorm from "gyronorm";

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

// Configuration centralisée
const CONFIG = {
  INITIAL_POSITION: [120.95134859887523, 14.347872973134175],
  GEOLOCATION: {
    HIGH_ACCURACY: { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    LOW_ACCURACY: {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    },
    PRECISION_THRESHOLD: 15,
  },
  STYLES: {
    gps: { radius: 8, color: "#34A853", stroke: "#FFFFFF", width: 2 },
    network: { radius: 6, color: "#4285F4", stroke: "#FFFFFF", width: 2 },
  },
  ROUTING: {
    OSRM_URL: "https://router.project-osrm.org/route/v1/walking",
    ORS_URL: "https://api.openrouteservice.org/v2/directions/foot-walking",
    WALKING_SPEED: 1.4, // m/s
  },
};

// Factory pour créer les styles (DRY)
const createPositionStyle = (config) =>
  new Style({
    image: new Circle({
      radius: config.radius,
      fill: new Fill({ color: config.color }),
      stroke: new Stroke({ color: config.stroke, width: config.width }),
    }),
  });

// Styles générés automatiquement (DRY)
const USER_POSITION_STYLES = Object.fromEntries(
  Object.entries(CONFIG.STYLES).map(([key, config]) => [
    key,
    createPositionStyle(config),
  ])
);

// Services de routing (DRY et KISS)
const routingService = {
  // Utilitaire pour les requêtes HTTP (DRY)
  async fetchRoute(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  },

  // Service OSRM
  async tryOSRM(start, end) {
    const url = `${CONFIG.ROUTING.OSRM_URL}/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson&steps=true`;
    const data = await this.fetchRoute(url);

    if (!data.routes?.[0]) throw new Error("Aucun itinéraire OSRM");

    const route = data.routes[0];
    return {
      coordinates: route.geometry.coordinates,
      distance: route.distance,
      duration: route.duration,
      steps: route.legs[0]?.steps || [],
      provider: "osrm",
    };
  },

  // Service OpenRouteService
  async tryORS(start, end) {
    const apiKey = import.meta.env.VITE_OPENROUTE_API_KEY;
    if (!apiKey || apiKey.includes("your_api_key_here")) {
      throw new Error("Clé API OpenRouteService manquante");
    }

    const data = await this.fetchRoute(CONFIG.ROUTING.ORS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        coordinates: [start, end],
        format: "geojson",
        options: { avoid_features: ["highways"] },
      }),
    });

    if (!data.features?.[0]) throw new Error("Aucun itinéraire ORS");

    const route = data.features[0];
    const props = route.properties;
    return {
      coordinates: route.geometry.coordinates,
      distance: props.segments[0].distance,
      duration: props.segments[0].duration,
      steps: props.segments[0].steps || [],
      provider: "openroute",
    };
  },

  // Fallback simple
  createFallback(start, end) {
    const from = turf.point([start[0], start[1]]);
    const to = turf.point([end[0], end[1]]);
    const distance = turf.distance(from, to, { units: "meters" });
    return {
      coordinates: [start, end],
      distance,
      duration: Math.round(distance / CONFIG.ROUTING.WALKING_SPEED),
      steps: [],
      fallback: true,
    };
  },
};

// Fonction principale simplifiée (KISS)
const calculateRoute = async (start, end) => {
  const services = [
    () => routingService.tryOSRM(start, end),
    () => routingService.tryORS(start, end),
    () => routingService.createFallback(start, end),
  ];

  for (const service of services) {
    try {
      return await service();
    } catch (error) {
      console.warn("Service de routing échoué:", error.message);
    }
  }

  throw new Error("Tous les services de routing ont échoué");
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
  const routeSource = useMemo(() => new VectorSource(), []);
  const orientationRef = useRef(null);
  const watchIdRef = useRef(null);
  const isHighAccuracyActiveRef = useRef(false);

  // Nouveaux états pour la navigation
  const [isNavigating, setIsNavigating] = useState(false);
  const [route, setRoute] = useState(null);
  const [distanceToDestination, setDistanceToDestination] = useState(null);
  const [hasArrived, setHasArrived] = useState(false);

  // États pour l'orientation et rotation de la carte
  const [deviceOrientation, setDeviceOrientation] = useState(null);
  const [orientationPermission, setOrientationPermission] = useState(null);
  const [isCompassMode, setIsCompassMode] = useState(false);
  const gyroNormRef = useRef(null);

  useGeographic();

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
      if (!position || !position.coords) {
        console.warn("❌ Position invalide:", position);
        return;
      }

      console.log("📍 Mise à jour position utilisateur:", position);

      setUserPosition(position.coords);
      setPositionAccuracy(position.accuracy);
      setPositionSource(position.source);

      // Vérification des sources
      if (!userPositionSource) {
        console.warn("❌ userPositionSource non disponible");
        return;
      }

      // Mise à jour du marqueur de position
      userPositionSource.clear();

      const pointFeature = new Feature({
        geometry: new Point(position.coords),
        accuracy: position.accuracy,
        source: position.source,
      });

      // Vérification du style
      const style =
        USER_POSITION_STYLES[position.source] || USER_POSITION_STYLES.gps;
      if (!style) {
        console.warn("❌ Style non trouvé pour:", position.source);
        return;
      }

      // Application du style selon la source
      pointFeature.setStyle(style);

      // Ajout du cercle de précision
      if (position.accuracy && position.accuracy > 0) {
        const accuracyFeature = new Feature({
          geometry: new Point(position.coords),
        });
        // Clone et met à jour le style pour la précision
        const clonedStyle = accuracyStyle.clone();
        clonedStyle.getImage().setRadius(Math.min(position.accuracy, 100)); // Limite la taille
        accuracyFeature.setStyle(clonedStyle);
        userPositionSource.addFeature(accuracyFeature);
      }

      userPositionSource.addFeature(pointFeature);

      // Auto-recentrage sur la première position
      if (mapInstanceRef.current && !userPosition) {
        console.log("🎯 Premier recentrage sur position utilisateur");
        mapInstanceRef.current.getView().animate({
          center: position.coords,
          zoom: 16.5,
          duration: 500,
        });
      }
    },
    [userPositionSource, accuracyStyle, userPosition]
  );

  // Surveillance de l'orientation avec rotation de carte (mode GPS)
  const setupDeviceOrientation = () => {
    console.log("🧭 Initialisation du mode GPS avec rotation de carte...");

    // Initialisation de GyroNorm pour une meilleure gestion de l'orientation
    const gn = new GyroNorm();
    gyroNormRef.current = gn;

    gn.init()
      .then(() => {
        console.log("✅ GyroNorm initialisé avec succès");
        setOrientationPermission("granted");
        startCompassMode();
      })
      .catch((error) => {
        console.error("❌ Erreur initialisation GyroNorm:", error);
        setOrientationPermission("denied");

        // Fallback vers l'API standard
        console.log("🔄 Tentative avec DeviceOrientationEvent standard...");
        fallbackToStandardOrientation();
      });
  };

  const startCompassMode = () => {
    console.log("🧭 Démarrage du mode boussole GPS...");
    setIsCompassMode(true);

    if (gyroNormRef.current) {
      gyroNormRef.current.start((event) => {
        const alpha = event.do.alpha; // Direction de la boussole
        const beta = event.do.beta; // Inclinaison avant/arrière
        const gamma = event.do.gamma; // Inclinaison gauche/droite

        // Mise à jour de l'orientation
        orientationRef.current = alpha;
        setDeviceOrientation({
          alpha,
          beta,
          gamma,
          timestamp: Date.now(),
        });

        // Rotation de la carte selon l'orientation du smartphone
        if (mapInstanceRef.current && isCompassMode) {
          const view = mapInstanceRef.current.getView();
          const rotation = toRadians(-alpha); // Négatif pour rotation inverse
          view.setRotation(rotation);
        }

        // Log périodique pour debug
        if (Date.now() % 3000 < 100) {
          console.log("🧭 GPS Mode - Orientation:", {
            direction: Math.round(alpha),
            rotation: Math.round(-alpha),
          });
        }
      });
    }
  };

  const fallbackToStandardOrientation = () => {
    if (!window.DeviceOrientationEvent) {
      console.error("❌ Orientation non supportée sur ce smartphone");
      setOrientationPermission("not-supported");
      return;
    }

    // Vérification permissions iOS
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission()
        .then((permissionState) => {
          if (permissionState === "granted") {
            setOrientationPermission("granted");
            startStandardOrientationListening();
          } else {
            setOrientationPermission("denied");
          }
        })
        .catch(() => setOrientationPermission("denied"));
    } else {
      setOrientationPermission("granted");
      startStandardOrientationListening();
    }
  };

  const startStandardOrientationListening = () => {
    console.log("📱 Mode orientation standard (sans GyroNorm)...");

    const handleStandardOrientation = (event) => {
      if (event.alpha !== null) {
        const alpha = event.alpha;
        orientationRef.current = alpha;
        setDeviceOrientation({
          alpha,
          beta: event.beta,
          gamma: event.gamma,
          timestamp: Date.now(),
        });

        // Rotation de la carte en mode standard
        if (mapInstanceRef.current && isCompassMode) {
          const view = mapInstanceRef.current.getView();
          const rotation = toRadians(-alpha);
          view.setRotation(rotation);
        }
      }
    };

    window.addEventListener(
      "deviceorientation",
      handleStandardOrientation,
      true
    );
  };

  // Fonction pour activer/désactiver le mode boussole
  const toggleCompassMode = useCallback(() => {
    setIsCompassMode(!isCompassMode);

    if (!isCompassMode) {
      console.log("🧭 Activation du mode GPS avec rotation");
      if (orientationPermission !== "granted") {
        setupDeviceOrientation();
      }
    } else {
      console.log("🗺️ Désactivation du mode GPS - carte fixe");
      if (mapInstanceRef.current) {
        mapInstanceRef.current.getView().setRotation(0); // Remet la carte droite
      }
    }
  }, [isCompassMode, orientationPermission]);

  // Configuration de la géolocalisation pour smartphones
  const setupGeolocation = () => {
    console.log("📱 Initialisation de la géolocalisation mobile...");

    if (!navigator.geolocation) {
      console.error("❌ Géolocalisation non supportée sur ce smartphone");
      alert(
        "Votre smartphone ne supporte pas la géolocalisation. Veuillez utiliser un appareil compatible."
      );
      return;
    }

    let lastWatchId;

    const startWatching = (highAccuracy) => {
      if (lastWatchId) {
        navigator.geolocation.clearWatch(lastWatchId);
      }

      const options = highAccuracy
        ? CONFIG.GEOLOCATION.HIGH_ACCURACY
        : CONFIG.GEOLOCATION.LOW_ACCURACY;

      console.log(
        `📱 Démarrage géolocalisation mobile (${
          highAccuracy ? "GPS haute précision" : "réseau basse précision"
        })`,
        options
      );

      lastWatchId = navigator.geolocation.watchPosition(
        (position) => {
          console.log("📍 Position mobile reçue:", position.coords);
          const adapted = {
            coords: [position.coords.longitude, position.coords.latitude],
            accuracy: position.coords.accuracy,
            source: highAccuracy ? "gps" : "network",
            timestamp: position.timestamp || Date.now(),
          };
          updateUserPosition(adapted);

          // Passage en mode économie si précision GPS suffisante
          if (
            highAccuracy &&
            position.coords.accuracy < CONFIG.GEOLOCATION.PRECISION_THRESHOLD
          ) {
            console.log("✅ GPS précis, passage en mode économie mobile");
            isHighAccuracyActiveRef.current = false;
            startWatching(false);
          }
        },
        (error) => {
          console.error(
            "❌ Erreur géolocalisation mobile:",
            error.message,
            error.code
          );
          if (highAccuracy) {
            console.log("🔄 GPS échoué, tentative réseau mobile...");
            startWatching(false);
          } else {
            // Utiliser la position par défaut si tout échoue sur mobile
            console.log(
              "🏠 Utilisation position par défaut (Garden Grove Village)"
            );
            updateUserPosition({
              coords: CONFIG.INITIAL_POSITION,
              accuracy: 1000,
              source: "default",
              timestamp: Date.now(),
            });
          }
        },
        options
      );

      isHighAccuracyActiveRef.current = highAccuracy;
    };

    // Démarre en haute précision GPS sur mobile
    startWatching(true);

    return () => {
      if (lastWatchId) navigator.geolocation.clearWatch(lastWatchId);
    };
  };

  // Fonction pour démarrer la navigation
  const startNavigation = useCallback(async () => {
    console.log("🧭 Tentative de démarrage navigation:", {
      userPosition,
      destination: destination?.coords,
    });

    if (!userPosition) {
      console.warn("❌ Position smartphone manquante");
      alert(
        "📱 Position non disponible. Veuillez attendre que votre smartphone vous localise."
      );
      return;
    }

    if (!destination?.coords) {
      console.warn("❌ Destination manquante");
      alert(
        "📍 Destination non définie. Veuillez sélectionner un bloc et lot."
      );
      return;
    }

    try {
      console.log("📱 Calcul de l'itinéraire mobile...");
      const routeData = await calculateRoute(userPosition, destination.coords);
      setRoute(routeData);
      setIsNavigating(true);

      // Afficher la route sur la carte mobile
      routeSource.clear();
      const routeFeature = new Feature({
        geometry: new LineString(routeData.coordinates),
      });
      routeFeature.setStyle(ROUTE_STYLE);
      routeSource.addFeature(routeFeature);

      // Ajuster la vue mobile pour montrer la route complète
      const extent = routeFeature.getGeometry().getExtent();
      mapInstanceRef.current
        .getView()
        .fit(extent, { padding: [50, 50, 50, 50] });

      console.log("✅ Navigation mobile démarrée avec succès");
    } catch (error) {
      console.error("❌ Erreur calcul itinéraire mobile:", error);
      alert(
        "📱 Impossible de calculer l'itinéraire sur votre smartphone: " +
          error.message
      );
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
      if (mapInstanceRef.current) {
        mapInstanceRef.current.getView().animate({
          center: data.coordinates.coordinates,
          zoom: 16.5,
          duration: 500,
        });
      }
    } catch (err) {
      console.error("[Destination] Erreur:", err);
      alert(`Bloc ${block}, Lot ${lot} introuvable`);
    }
  }, []);

  // Initialisation immédiate de la carte (en arrière-plan)
  useEffect(() => {
    // Attendre que le DOM soit prêt
    const initializeMap = () => {
      try {
        if (!mapRef.current || mapInstanceRef.current) return;

        // Création de la carte immédiatement
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
            center: CONFIG.INITIAL_POSITION,
            zoom: 16.5,
          }),
        });

        mapInstanceRef.current = map;

        // Ajout immédiat des blocs
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

        // Ajout immédiat des POIs
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

        // Démarrage immédiat de la géolocalisation
        setupDeviceOrientation();
        setupGeolocation();

        console.log("📱 Carte mobile initialisée en arrière-plan");
      } catch (error) {
        console.error("❌ Erreur initialisation carte:", error);
      }
    };

    // Initialisation immédiate ou après un court délai
    if (mapRef.current) {
      initializeMap();
    } else {
      // Fallback si le ref n'est pas encore prêt
      const timer = setTimeout(initializeMap, 100);
      return () => clearTimeout(timer);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined);
        mapInstanceRef.current = null;
      }
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      // Nettoyage de GyroNorm et des événements d'orientation
      if (gyroNormRef.current) {
        gyroNormRef.current.stop();
        console.log("🧹 Arrêt de GyroNorm");
      }
      window.removeEventListener("deviceorientation", () => {}, true);
      console.log("🧹 Nettoyage des événements d'orientation");
    };
  }, []);

  // Calcul de la direction vers la destination
  const getDirectionToDestination = useCallback(() => {
    if (!userPosition || !destination?.coords || !deviceOrientation) {
      return null;
    }

    // Calcul de l'angle entre la position actuelle et la destination
    const bearing = turf.bearing(
      turf.point(userPosition),
      turf.point(destination.coords)
    );

    // Conversion de l'angle bearing (-180 à 180) en degrés (0 à 360)
    const targetDirection = bearing < 0 ? bearing + 360 : bearing;

    // Direction actuelle du device (0-360°)
    const currentDirection = deviceOrientation.alpha;

    // Différence entre la direction cible et la direction actuelle
    let directionDiff = targetDirection - currentDirection;

    // Normalisation de la différence (-180 à 180)
    if (directionDiff > 180) directionDiff -= 360;
    if (directionDiff < -180) directionDiff += 360;

    return {
      targetDirection: Math.round(targetDirection),
      currentDirection: Math.round(currentDirection),
      difference: Math.round(directionDiff),
      isOnTarget: Math.abs(directionDiff) < 15, // Tolérance de 15°
    };
  }, [userPosition, destination, deviceOrientation]);

  // Style de destination optimisé
  const destinationStyle = useMemo(
    () => createFeatureStyle("/default-marker.png", 0.7),
    []
  );

  // Surveillance de la distance et détection d'arrivée
  useEffect(() => {
    if (!isNavigating || !userPosition || !destination?.coords) return;

    const from = turf.point([userPosition[0], userPosition[1]]);
    const to = turf.point([destination.coords[0], destination.coords[1]]);
    const distance = turf.distance(from, to, { units: "meters" });
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
      {/* Carte en arrière-plan - se charge immédiatement */}
      <div ref={mapRef} className="map" style={{ zIndex: 1 }} />

      {/* Header par-dessus la carte */}
      <header className="header" style={{ zIndex: 10 }}>
        {positionSource && (
          <div className="position-info">
            📱{" "}
            {positionSource === "gps"
              ? "GPS"
              : positionSource === "network"
              ? "Réseau"
              : "Défaut"}
            : {positionAccuracy?.toFixed(1)}m
            {deviceOrientation && (
              <span> | 🧭 {Math.round(deviceOrientation.alpha)}°</span>
            )}
          </div>
        )}

        {/* Bouton pour demander permission orientation sur iPhone */}
        {orientationPermission === "denied" ||
        orientationPermission === null ? (
          <button
            onClick={setupDeviceOrientation}
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              background: "rgba(255,165,0,0.9)",
              color: "white",
              border: "none",
              padding: "8px 12px",
              borderRadius: "5px",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            📱 Activer boussole
          </button>
        ) : (
          orientationPermission === "granted" &&
          deviceOrientation && (
            <div
              style={{
                position: "absolute",
                top: "10px",
                right: "10px",
                background: "rgba(0,255,0,0.8)",
                padding: "5px 10px",
                borderRadius: "5px",
                fontSize: "12px",
                color: "white",
              }}
            >
              🧭 Boussole: {Math.round(deviceOrientation.alpha)}°
            </div>
          )
        )}

        {/* Debug: Confirmation que la carte se charge */}
        {mapInstanceRef.current && showWelcomeModal && (
          <div
            style={{
              position: "absolute",
              top: "40px",
              right: "10px",
              background: "rgba(0,255,0,0.8)",
              padding: "5px 10px",
              borderRadius: "5px",
              fontSize: "12px",
              color: "white",
            }}
          >
            📱 Carte mobile chargée
          </div>
        )}
      </header>

      {/* Bouton de recentrage */}
      <button
        onClick={useCallback(
          () =>
            userPosition &&
            mapInstanceRef.current?.getView().animate({
              center: userPosition,
              zoom: 16.5,
              duration: 500,
            }),
          [userPosition]
        )}
        className="recenter-button"
        style={{ zIndex: 10 }}
      >
        <MdCenterFocusStrong />
      </button>

      {/* Bouton mode boussole GPS */}
      <button
        onClick={toggleCompassMode}
        style={{
          position: "absolute",
          bottom: "85px",
          left: "90px",
          background: isCompassMode
            ? "rgba(0,255,0,0.9)"
            : "rgba(255,165,0,0.9)",
          color: "white",
          border: "none",
          borderRadius: "50%",
          width: "56px",
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "24px",
          cursor: "pointer",
          zIndex: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
        title={isCompassMode ? "Désactiver mode GPS" : "Activer mode GPS"}
      >
        🧭
      </button>

      {/* Interface de navigation */}
      {destination?.coords && userPosition && !showWelcomeModal && (
        <div className="navigation-controls" style={{ zIndex: 10 }}>
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
                  {(() => {
                    const direction = getDirectionToDestination();
                    return direction ? (
                      <div
                        style={{
                          marginTop: "4px",
                          padding: "4px 8px",
                          background: direction.isOnTarget
                            ? "rgba(0,255,0,0.2)"
                            : "rgba(255,165,0,0.2)",
                          borderRadius: "4px",
                          fontSize: "11px",
                        }}
                      >
                        🧭 {direction.isOnTarget ? "✅" : "↻"}{" "}
                        {Math.abs(direction.difference)}°
                        {!direction.isOnTarget && (
                          <span> {direction.difference > 0 ? "→" : "←"}</span>
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal par-dessus tout - z-index élevé */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onDestinationSet={handleDestinationSet}
      />

      {/* Footer */}
      <footer className="footer" style={{ zIndex: 10 }}>
        © {new Date().getFullYear()} Garden Grove Village
      </footer>
    </div>
  );
}

export default App;
