'use client'

import { useState, useEffect, useRef } from 'react'

type AddressSuggestion = {
  display_name: string
  lat: number
  lng: number
  formatted: string
  address: {
    street: string
    house_number: string
    postcode: string
    city: string
  }
}

type DeliveryCheck = {
  isDeliverable: boolean
  distance: number
  duration: number
  fee: number
  zoneName?: string
}

type AddressInputProps = {
  establishmentId: string
  value: string
  onChange: (value: string) => void
  onAddressValidated: (data: {
    address: string
    lat: number
    lng: number
    deliveryCheck: DeliveryCheck
  }) => void
  onClear: () => void
}

export default function AddressInput({
  establishmentId,
  value,
  onChange,
  onAddressValidated,
  onClear,
}: AddressInputProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState<AddressSuggestion | null>(null)
  const [deliveryCheck, setDeliveryCheck] = useState<DeliveryCheck | null>(null)
  const [checkingDelivery, setCheckingDelivery] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  // Fermer les suggestions quand on clique ailleurs
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Recherche avec debounce
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Ne pas chercher si on a déjà sélectionné une adresse
    if (selectedAddress) return

    if (value.length < 3) {
      setSuggestions([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/address/autocomplete?q=${encodeURIComponent(value)}`)
        const data = await response.json()
        setSuggestions(data.suggestions || [])
        setShowSuggestions(true)
      } catch (error) {
        console.error('Autocomplete error:', error)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [value, selectedAddress])

  async function selectAddress(suggestion: AddressSuggestion) {
    setSelectedAddress(suggestion)
    onChange(suggestion.formatted)
    setShowSuggestions(false)
    setSuggestions([])

    // Vérifier la livraison
    setCheckingDelivery(true)
    try {
      const response = await fetch('/api/delivery/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          establishmentId,
          latitude: suggestion.lat,
          longitude: suggestion.lng,
        }),
      })
      
      const data = await response.json()
      
      const check: DeliveryCheck = {
        isDeliverable: data.isDeliverable,
        distance: data.distance,
        duration: data.duration,
        fee: data.deliveryFee,
        zoneName: data.zoneName,
      }
      
      setDeliveryCheck(check)
      
      if (check.isDeliverable) {
        onAddressValidated({
          address: suggestion.formatted,
          lat: suggestion.lat,
          lng: suggestion.lng,
          deliveryCheck: check,
        })
      }
    } catch (error) {
      console.error('Delivery check error:', error)
      setDeliveryCheck({
        isDeliverable: false,
        distance: 0,
        duration: 0,
        fee: 0,
      })
    } finally {
      setCheckingDelivery(false)
    }
  }

  function clearAddress() {
    setSelectedAddress(null)
    setDeliveryCheck(null)
    onChange('')
    onClear()
    inputRef.current?.focus()
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value
    onChange(newValue)
    
    // Si l'utilisateur modifie après avoir sélectionné, reset
    if (selectedAddress && newValue !== selectedAddress.formatted) {
      setSelectedAddress(null)
      setDeliveryCheck(null)
      onClear()
    }
  }

  return (
    <div className="space-y-3">
      {/* Input avec suggestions */}
      <div className="relative">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleInputChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Rue et numéro, code postal, ville..."
            className={`w-full px-4 py-3 pr-20 rounded-xl border transition-colors ${
              selectedAddress && deliveryCheck?.isDeliverable
                ? 'border-green-500 bg-green-50'
                : selectedAddress && !deliveryCheck?.isDeliverable
                ? 'border-red-500 bg-red-50'
                : 'border-gray-200 focus:border-orange-500'
            } focus:outline-none focus:ring-2 focus:ring-orange-500/20`}
          />
          
          {/* Indicateurs à droite */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {loading && (
              <span className="text-gray-400 animate-spin">⏳</span>
            )}
            {checkingDelivery && (
              <span className="text-blue-500 animate-pulse">🔍</span>
            )}
            {selectedAddress && deliveryCheck && (
              <>
                {deliveryCheck.isDeliverable ? (
                  <span className="text-green-500">✅</span>
                ) : (
                  <span className="text-red-500">❌</span>
                )}
                <button
                  onClick={clearAddress}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  ✕
                </button>
              </>
            )}
          </div>
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 max-h-60 overflow-y-auto"
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => selectAddress(suggestion)}
                className="w-full px-4 py-3 text-left hover:bg-orange-50 border-b border-gray-100 last:border-0 transition-colors"
              >
                <p className="font-medium text-gray-900">{suggestion.formatted}</p>
                <p className="text-sm text-gray-500 truncate">{suggestion.display_name}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Résultat vérification livraison */}
      {deliveryCheck && (
        <div
          className={`p-4 rounded-xl ${
            deliveryCheck.isDeliverable
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          {deliveryCheck.isDeliverable ? (
            <>
              <p className="font-medium text-green-700 flex items-center gap-2">
                ✅ Adresse livrable !
              </p>
              <p className="text-sm text-green-600 mt-1">
                {deliveryCheck.distance.toFixed(1)} km • {deliveryCheck.duration} min
                {deliveryCheck.zoneName && ` • ${deliveryCheck.zoneName}`}
              </p>
              <p className="text-lg font-bold text-orange-600 mt-2">
                Frais de livraison : {deliveryCheck.fee.toFixed(2)}€
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-red-700 flex items-center gap-2">
                ❌ Adresse hors zone de livraison
              </p>
              <p className="text-sm text-red-600 mt-1">
                Cette adresse est trop éloignée de notre établissement.
                Vous pouvez choisir le retrait en Click & Collect.
              </p>
            </>
          )}
        </div>
      )}

      {/* Aide */}
      {!selectedAddress && !loading && value.length > 0 && value.length < 3 && (
        <p className="text-sm text-gray-500">
          Tapez au moins 3 caractères pour rechercher...
        </p>
      )}
    </div>
  )
}
