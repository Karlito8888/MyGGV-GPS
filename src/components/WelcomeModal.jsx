import { useState } from 'react'
import PropTypes from 'prop-types'

function WelcomeModal({ isOpen, onRequestClose, onDestinationSet }) {
  const [block, setBlock] = useState('')
  const [lot, setLot] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    onDestinationSet(block, lot)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h2 className="text-xl font-bold mb-4">Bienvenue</h2>
        <p className="mb-4">Veuillez entrer les coordonnées de votre destination</p>
        
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
  )
}

WelcomeModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onRequestClose: PropTypes.func.isRequired,
  onDestinationSet: PropTypes.func.isRequired,
}

export default WelcomeModal
