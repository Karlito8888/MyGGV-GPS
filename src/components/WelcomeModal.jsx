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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Sélectionnez votre destination</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Bloc:</label>
            <input
              type="text"
              value={block}
              onChange={(e) => setBlock(e.target.value)}
              className="mt-1 p-2 border border-gray-300 rounded w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Lot:</label>
            <input
              type="text"
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              className="mt-1 p-2 border border-gray-300 rounded w-full"
              required
            />
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onRequestClose}
              className="px-4 py-2 bg-gray-300 rounded"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded"
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
