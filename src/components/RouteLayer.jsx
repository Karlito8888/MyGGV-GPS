import { useEffect, useRef } from 'react';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { LineString } from 'ol/geom';
import Feature from 'ol/Feature';
import { Style, Stroke } from 'ol/style';

const RouteLayer = ({ map, start, end, onArrival }) => {
  const routeLayerRef = useRef(null);
  const arrivalCheckRef = useRef(null);

  // Styles pour la route
  const routeStyle = new Style({
    stroke: new Stroke({
      color: '#3b82f6',
      width: 6
    })
  });

  useEffect(() => {
    if (!map || !start || !end) return;

    // Créer le layer vectoriel pour la route
    const routeLayer = new VectorLayer({
      source: new VectorSource(),
      style: routeStyle,
      zIndex: 100
    });
    routeLayerRef.current = routeLayer;
    map.addLayer(routeLayer);

    // Calculer et tracer la route
    calculateRoute();

    // Vérification d'arrivée
    arrivalCheckRef.current = setInterval(checkArrival, 1000);

    return () => {
      map.removeLayer(routeLayer);
      clearInterval(arrivalCheckRef.current);
    };
  }, [map, start, end]);

  const calculateRoute = () => {
    // Simulation de calcul d'itinéraire
    const route = new LineString([
      [start.longitude, start.latitude],
      [end.coordinates.longitude, end.coordinates.latitude]
    ]);

    const routeFeature = new Feature({
      geometry: route,
      name: 'route'
    });

    routeLayerRef.current.getSource().addFeature(routeFeature);
  };

  const checkArrival = () => {
    const distance = Math.sqrt(
      Math.pow(start.longitude - end.coordinates.longitude, 2) +
      Math.pow(start.latitude - end.coordinates.latitude, 2)
    );

    if (distance < 0.0005) { // Seuil d'arrivée (~50m)
      clearInterval(arrivalCheckRef.current);
      onArrival();
    }
  };

  return null;
};

export default RouteLayer;
