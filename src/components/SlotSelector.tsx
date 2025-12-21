'use client'

import { useState, useEffect } from 'react'

interface AvailableSlot {
  start: string
  end: string
  label: string
  spotsLeft: number
  isFirstAvailable: boolean
}

interface SlotMeta {
  currentPrepTime: number
  slotDuration: number
  travelMinutes: number
  totalWaitMinutes: number
}

interface SlotSelectorProps {
  establishmentId: string
  type: 'pickup' | 'delivery'
  travelMinutes?: number  // Pour livraison
  onSelect: (slot: AvailableSlot | null) => void
  selectedSlot?: AvailableSlot | null
}

export default function SlotSelector({
  establishmentId,
  type,
  travelMinutes = 0,
  onSelect,
  selectedSlot,
}: SlotSelectorProps) {
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [meta, setMeta] = useState<SlotMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    loadSlots()
  }, [establishmentId, type, travelMinutes])

  async function loadSlots() {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        establishmentId,
        type,
        travelMinutes: travelMinutes.toString(),
      })

      const response = await fetch(`/api/slots/available?${params}`)
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setSlots(data.slots || [])
      setMeta(data.meta)
    } catch (err: any) {
      console.error('Error loading slots:', err)
      setError(err.message || 'Erreur lors du chargement des créneaux')
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(slot: AvailableSlot) {
    if (selectedSlot?.start === slot.start) {
      onSelect(null) // Désélectionner
    } else {
      onSelect(slot)
    }
  }

  // Séparer le premier créneau et les autres
  const firstSlot = slots.find(s => s.isFirstAvailable)
  const otherSlots = slots.filter(s => !s.isFirstAvailable)
  const visibleOtherSlots = showAll ? otherSlots : otherSlots.slice(0, 4)

  if (loading) {
    return (
      <div className="bg-gray-50 rounded-2xl p-8 text-center">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full mb-4"></div>
        <p className="text-gray-500">Chargement des créneaux...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-2xl p-6 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={loadSlots}
          className="text-red-600 underline"
        >
          Réessayer
        </button>
      </div>
    )
  }

  if (slots.length === 0) {
    return (
      <div className="bg-yellow-50 rounded-2xl p-6 text-center">
        <span className="text-4xl block mb-4">⏰</span>
        <p className="text-yellow-700">Aucun créneau disponible pour le moment</p>
        <p className="text-yellow-600 text-sm mt-2">
          Veuillez réessayer plus tard ou nous contacter
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Info temps de préparation */}
      {meta && (
        <div className="bg-blue-50 rounded-xl p-4 flex items-center gap-3">
          <span className="text-2xl">⏱️</span>
          <div>
            <p className="font-medium text-blue-700">
              Temps de préparation estimé : ~{meta.currentPrepTime} min
            </p>
            {type === 'delivery' && meta.travelMinutes > 0 && (
              <p className="text-sm text-blue-600">
                + {meta.travelMinutes} min de livraison
              </p>
            )}
          </div>
        </div>
      )}

      {/* Premier créneau disponible (mis en avant) */}
      {firstSlot && (
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">⚡ Au plus tôt</p>
          <button
            onClick={() => handleSelect(firstSlot)}
            className={`w-full p-4 rounded-xl border-2 flex items-center justify-between transition-all ${
              selectedSlot?.start === firstSlot.start
                ? 'border-orange-500 bg-orange-50'
                : 'border-green-300 bg-green-50 hover:border-green-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                selectedSlot?.start === firstSlot.start
                  ? 'border-orange-500 bg-orange-500'
                  : 'border-green-500'
              }`}>
                {selectedSlot?.start === firstSlot.start && (
                  <span className="text-white text-sm">✓</span>
                )}
              </div>
              <div className="text-left">
                <span className="font-bold text-lg">{firstSlot.label}</span>
                <p className="text-sm text-gray-500">
                  Dans ~{meta?.totalWaitMinutes || '?'} min
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-sm">
                {firstSlot.spotsLeft} place{firstSlot.spotsLeft > 1 ? 's' : ''}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Autres créneaux */}
      {otherSlots.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">📅 Plus tard</p>
          <div className="space-y-2">
            {visibleOtherSlots.map(slot => (
              <button
                key={slot.start}
                onClick={() => handleSelect(slot)}
                className={`w-full p-4 rounded-xl border-2 flex items-center justify-between transition-all ${
                  selectedSlot?.start === slot.start
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    selectedSlot?.start === slot.start
                      ? 'border-orange-500 bg-orange-500'
                      : 'border-gray-300'
                  }`}>
                    {selectedSlot?.start === slot.start && (
                      <span className="text-white text-sm">✓</span>
                    )}
                  </div>
                  <span className="font-medium">{slot.label}</span>
                </div>
                <span className={`px-2 py-1 rounded text-sm ${
                  slot.spotsLeft <= 2 
                    ? 'bg-orange-100 text-orange-700' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {slot.spotsLeft} place{slot.spotsLeft > 1 ? 's' : ''}
                </span>
              </button>
            ))}

            {/* Bouton voir plus */}
            {otherSlots.length > 4 && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full p-3 text-center text-orange-500 font-medium hover:bg-orange-50 rounded-xl"
              >
                Voir {otherSlots.length - 4} créneau{otherSlots.length - 4 > 1 ? 'x' : ''} de plus ↓
              </button>
            )}

            {showAll && otherSlots.length > 4 && (
              <button
                onClick={() => setShowAll(false)}
                className="w-full p-3 text-center text-gray-500 font-medium hover:bg-gray-50 rounded-xl"
              >
                Réduire ↑
              </button>
            )}
          </div>
        </div>
      )}

      {/* Récapitulatif sélection */}
      {selectedSlot && (
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
          <p className="text-sm text-orange-600 mb-1">Créneau sélectionné</p>
          <p className="font-bold text-orange-700 text-lg">{selectedSlot.label}</p>
          <p className="text-sm text-orange-600 mt-1">
            {type === 'pickup' 
              ? 'Présentez-vous à ce créneau pour récupérer votre commande'
              : 'Votre commande sera livrée dans ce créneau'
            }
          </p>
        </div>
      )}
    </div>
  )
}
