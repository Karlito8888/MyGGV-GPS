import { useEffect, useState } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import { fromLonLat } from 'ol/proj'
import WelcomeModal from './components/WelcomeModal'
import ArrivalModal from './components/ArrivalModal'
import RouteLayer from './components/RouteLayer'
import { supabase } from './lib/supabase'
import useGeolocation from './hooks/useGeolocation'

function App() {
  const [map, setMap] = useState()
  const [destination, setDestination] = useState(null)
  const [showWelcomeModal, setShowWelcomeModal] = useState(true)
  const [showArrivalModal, setShowArrivalModal] = useState(false)
  const { position: userLocation } = useGeolocation({ timeout: 30000 })

  const [locations, setLocations] = useState([]);

  const fetchLocations = async () => {
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(location => ({
        id: location.id,
        block: location.block,
        lot: location.lot,
        coordinates: {
          longitude: location.coordinates.coordinates[0],
          latitude: location.coordinates.coordinates[1]
        }
      }));
    } catch (error) {
      console.error('Error fetching locations:', error);
      return [];
    }
  };

  const handleDestinationSet = async (block, lot) => {
    try {
      const locationsData = await fetchLocations();
      setLocations(locationsData);
      
      const location = locationsData.find(loc => 
        loc.block === block && loc.lot === lot
      );

      if (!location) {
        throw new Error('Destination non trouvée');
      }
      
      setDestination({
        block,
        lot,
        coordinates: { 
          longitude: location.coordinates.longitude,
          latitude: location.coordinates.latitude
        }
      });
      setShowWelcomeModal(false);
    } catch (err) {
      console.error('Erreur de chargement de la destination', err);
    }
  }

  useEffect(() => {
    const initMap = () => {
      if (!map) {
        const initialMap = new Map({
          target: 'map',
          layers: [
            new TileLayer({
              source: new OSM()
            })
          ],
          view: new View({
            center: fromLonLat([
              userLocation?.longitude || 0,
              userLocation?.latitude || 0
            ]),
            zoom: 15
          })
        });
        setMap(initialMap);
      }
    };
    
    initMap();

    if (userLocation && map) {
      map.getView().setCenter([userLocation.longitude, userLocation.latitude])
      map.getView().setZoom(15)
    }

    return () => {
      if (map) {
        map.setTarget(undefined)
      }
    }
  }, [userLocation, map])

  return (
    <div className="flex flex-col h-screen">
      <header className="h-15 bg-blue-600 text-white p-4">
        <h1 className="text-xl font-bold">Navigation Lotissement</h1>
      </header>
      
      <main className="flex-1 relative">
        <div id="map" className="w-full h-full">
          {map && destination && (
            <RouteLayer 
              map={map} 
              start={userLocation} 
              end={destination.coordinates} 
              onArrival={() => setShowArrivalModal(true)}
            />
          )}
        </div>
      </main>
      
      <footer className="h-15 bg-gray-800 text-white p-4">
        <div className="flex justify-between">
          <span>Position actuelle: {userLocation ? 'Connecté' : 'En attente...'}</span>
        </div>
      </footer>

      <WelcomeModal 
        isOpen={showWelcomeModal} 
        onRequestClose={() => setShowWelcomeModal(false)}
        onDestinationSet={handleDestinationSet}
      />

      {destination && (
        <ArrivalModal 
          isOpen={showArrivalModal}
          destination={destination}
          onNewDestination={() => {
            setShowWelcomeModal(true)
            setShowArrivalModal(false)
          }}
          onExit={() => {
            setShowArrivalModal(false)
          }}
        />
      )}
    </div>
  )
}

export default App
