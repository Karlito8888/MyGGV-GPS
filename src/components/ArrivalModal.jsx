import React from 'react';

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
          
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Vous êtes arrivé !</h2>
          
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

export default ArrivalModal;
