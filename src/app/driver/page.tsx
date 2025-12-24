'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type DeliveryOrder = {
  id: string
  order_number: string
  status: string
  total_amount: number
  customer_name: string | null
  customer_phone: string | null
  scheduled_time: string
  delivery_address: string
  delivery_lat: number | null
  delivery_lng: number | null
  order_items: {
    id: string
    product_name: string
    quantity: number
    options_selected: string | null
  }[]
}

type SuggestedRoundOrder = {
  order_id: string
  order_number: string
  sequence_order: number
  estimated_delivery: string
  customer_name: string | null
  delivery_address: string | null
  scheduled_time: string | null
}

type SuggestedRound = {
  id: string
  status: string
  prep_at: string
  depart_at: string
  total_distance_minutes: number
  expires_at: string
  orders: SuggestedRoundOrder[]
}

type DeliveryRound = {
  id: string
  status: string
  planned_departure: string | null
  total_stops: number
  stops: {
    id: string
    stop_order: number
    order_id: string
    address: string
    status: string
    estimated_arrival: string | null
    latitude?: number | null
    longitude?: number | null
    customer_slot_start?: string | null
    customer_slot_end?: string | null
    order: DeliveryOrder
  }[]
}

type Driver = {
  id: string
  name: string
  phone: string
  status: string
}

// Constantes de configuration
const TOLERANCE_MINUTES = 15
const MAX_DELIVERIES_PER_ROUND = 3

export default function DriverPage() {
  const [pin, setPin] = useState('')
  const [driver, setDriver] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Données
  const [availableOrders, setAvailableOrders] = useState<DeliveryOrder[]>([])
  const [suggestedRounds, setSuggestedRounds] = useState<SuggestedRound[]>([])
  const [myRound, setMyRound] = useState<DeliveryRound | null>(null)
  const [currentStop, setCurrentStop] = useState<number>(0)
  const [currentTime, setCurrentTime] = useState(new Date())
  
  // UI
  const [view, setView] = useState<'available' | 'round'>('available')
  const [showSuggestions, setShowSuggestions] = useState(true)
  
  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  // Timer pour l'heure actuelle
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  // Vérifier si déjà connecté
  useEffect(() => {
    const savedDriverId = localStorage.getItem('driver_id')
    if (savedDriverId) {
      loadDriver(savedDriverId)
    }
  }, [])

  // Charger les données quand connecté
  useEffect(() => {
    if (driver) {
      loadData()
      const interval = setInterval(loadData, 30000)
      return () => clearInterval(interval)
    }
  }, [driver])

  async function loginWithPin() {
    if (pin.length !== 6) {
      setError('Code PIN à 6 chiffres requis')
      return
    }

    setLoading(true)
    setError('')

    const { data, error: dbError } = await supabase
      .from('drivers')
      .select('id, name, phone, status')
      .eq('establishment_id', establishmentId)
      .eq('pin_code', pin)
      .eq('is_active', true)
      .single()

    if (dbError || !data) {
      setError('Code PIN invalide')
      setLoading(false)
      return
    }

    setDriver(data)
    localStorage.setItem('driver_id', data.id)
    
    await supabase
      .from('drivers')
      .update({ status: 'available' })
      .eq('id', data.id)

    setLoading(false)
  }

  async function loadDriver(driverId: string) {
    const { data } = await supabase
      .from('drivers')
      .select('id, name, phone, status')
      .eq('id', driverId)
      .single()

    if (data) {
      setDriver(data)
    } else {
      localStorage.removeItem('driver_id')
    }
  }

  async function loadData() {
    if (!driver) return

    // Charger ma tournée en cours
    const { data: roundData } = await supabase
      .from('delivery_rounds')
      .select(`
        id, status, planned_departure, total_stops,
        delivery_round_stops (
          id, stop_order, order_id, address, status, estimated_arrival,
          latitude, longitude, customer_slot_start, customer_slot_end,
          order:orders (
            id, order_number, status, total,
            customer_name, customer_phone, scheduled_time,
            order_items (id, product_name, quantity, options_selected)
          )
        )
      `)
      .eq('driver_id', driver.id)
      .in('status', ['ready', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (roundData) {
      const stops = (roundData.delivery_round_stops || [])
        .sort((a: any, b: any) => a.stop_order - b.stop_order)
        .map((stop: any) => ({
          ...stop,
          order: stop.order
        }))
      
      setMyRound({
        ...roundData,
        stops
      })
      setView('round')
      
      const nextStop = stops.findIndex((s: any) => s.status !== 'delivered')
      setCurrentStop(nextStop >= 0 ? nextStop : stops.length - 1)
    } else {
      setMyRound(null)
      setView('available')
    }

    // Charger les suggestions depuis la DB (pending ET accepted)
    const { data: suggestionsData } = await supabase
      .from('v_suggested_rounds_details')
      .select('*')
      .eq('establishment_id', establishmentId)
      .in('status', ['pending', 'accepted'])
      .order('prep_at', { ascending: true })

    const suggestions: SuggestedRound[] = (suggestionsData || []).map((r: any) => ({
      ...r,
      orders: r.orders || []
    }))
    setSuggestedRounds(suggestions)

    // Récupérer les IDs des commandes déjà dans une suggestion
    const orderIdsInSuggestions = new Set<string>()
    suggestions.forEach(s => {
      s.orders.forEach(o => orderIdsInSuggestions.add(o.order_id))
    })

    // Charger les commandes disponibles (non assignées, futures uniquement)
    const now = new Date()
    const maxTime = new Date(now.getTime() + 4 * 60 * 60 * 1000)
    
    const { data: ordersData } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, total,
        customer_name, customer_phone,
        scheduled_time, delivery_notes, metadata,
        order_items (id, product_name, quantity, options_selected)
      `)
      .eq('establishment_id', establishmentId)
      .eq('order_type', 'delivery')
      .in('status', ['ready', 'preparing', 'pending'])
      .is('delivery_round_id', null)
      .is('suggested_round_id', null)
      .gte('scheduled_time', now.toISOString())
      .lte('scheduled_time', maxTime.toISOString())
      .order('scheduled_time')

    // Filtrer les commandes qui sont dans une suggestion pending
    const orders: DeliveryOrder[] = (ordersData || [])
      .filter((o: any) => !orderIdsInSuggestions.has(o.id))
      .map((o: any) => {
        const meta = typeof o.metadata === 'string' ? JSON.parse(o.metadata) : (o.metadata || {})
        return {
          ...o,
          total_amount: o.total || 0,
          delivery_address: o.delivery_notes || 'Adresse non spécifiée',
          delivery_lat: meta.delivery_lat || null,
          delivery_lng: meta.delivery_lng || null,
        }
      })

    setAvailableOrders(orders)
  }

  async function logout() {
    if (driver) {
      await supabase
        .from('drivers')
        .update({ status: 'offline' })
        .eq('id', driver.id)
    }
    setDriver(null)
    localStorage.removeItem('driver_id')
    setPin('')
  }

  async function takeOrder(orderId: string) {
    if (!driver) return
    setLoading(true)

    try {
      // Créer une nouvelle tournée avec cette commande
      const { data: round, error: roundError } = await supabase
        .from('delivery_rounds')
        .insert({
          establishment_id: establishmentId,
          driver_id: driver.id,
          status: 'ready',
          total_stops: 1,
        })
        .select()
        .single()

      if (roundError) throw roundError

      // Récupérer les infos de la commande
      const order = availableOrders.find(o => o.id === orderId)
      if (!order) throw new Error('Commande non trouvée')

      // Créer le stop
      await supabase
        .from('delivery_round_stops')
        .insert({
          delivery_round_id: round.id,
          order_id: orderId,
          stop_order: 1,
          address: order.delivery_address,
          latitude: order.delivery_lat,
          longitude: order.delivery_lng,
          status: 'pending',
          customer_slot_start: order.scheduled_time,
        })

      // Lier la commande à la tournée
      await supabase
        .from('orders')
        .update({ delivery_round_id: round.id })
        .eq('id', orderId)

      loadData()
    } catch (e) {
      console.error('Erreur prise de commande:', e)
      setError('Erreur lors de la prise de commande')
    } finally {
      setLoading(false)
    }
  }

  async function takeSuggestedRound(suggestion: SuggestedRound) {
    if (!driver) return
    setLoading(true)

    try {
      // Accepter la suggestion via la fonction RPC
      const { data, error } = await supabase.rpc('accept_suggested_round', {
        p_suggested_round_id: suggestion.id
      })

      if (error) {
        console.error('Erreur acceptation suggestion:', error)
        setError('Erreur lors de l\'acceptation de la tournée')
        return
      }

      if (!data?.success) {
        setError(data?.error || 'Erreur inconnue')
        return
      }

      // Créer une nouvelle tournée avec toutes les commandes
      const { data: round, error: roundError } = await supabase
        .from('delivery_rounds')
        .insert({
          establishment_id: establishmentId,
          driver_id: driver.id,
          status: 'ready',
          total_stops: suggestion.orders.length,
          planned_departure: suggestion.depart_at,
        })
        .select()
        .single()

      if (roundError) throw roundError

      // Créer les stops pour chaque commande
      for (const order of suggestion.orders) {
        await supabase
          .from('delivery_round_stops')
          .insert({
            delivery_round_id: round.id,
            order_id: order.order_id,
            stop_order: order.sequence_order,
            address: order.delivery_address || '',
            status: 'pending',
            customer_slot_start: order.scheduled_time,
            estimated_arrival: order.estimated_delivery,
          })

        // Lier la commande à la tournée
        await supabase
          .from('orders')
          .update({ delivery_round_id: round.id })
          .eq('id', order.order_id)
      }

      loadData()
    } catch (e) {
      console.error('Erreur prise de tournée:', e)
      setError('Erreur lors de la prise de tournée')
    } finally {
      setLoading(false)
    }
  }

  async function addToRound(orderId: string) {
    if (!driver || !myRound) return
    if (myRound.total_stops >= MAX_DELIVERIES_PER_ROUND) {
      setError(`Maximum ${MAX_DELIVERIES_PER_ROUND} livraisons par tournée`)
      return
    }

    setLoading(true)

    try {
      const order = availableOrders.find(o => o.id === orderId)
      if (!order) throw new Error('Commande non trouvée')

      const newStopOrder = myRound.total_stops + 1

      await supabase
        .from('delivery_round_stops')
        .insert({
          delivery_round_id: myRound.id,
          order_id: orderId,
          stop_order: newStopOrder,
          address: order.delivery_address,
          latitude: order.delivery_lat,
          longitude: order.delivery_lng,
          status: 'pending',
          customer_slot_start: order.scheduled_time,
        })

      await supabase
        .from('delivery_rounds')
        .update({ total_stops: newStopOrder })
        .eq('id', myRound.id)

      await supabase
        .from('orders')
        .update({ delivery_round_id: myRound.id })
        .eq('id', orderId)

      loadData()
    } catch (e) {
      console.error('Erreur ajout commande:', e)
      setError('Erreur lors de l\'ajout à la tournée')
    } finally {
      setLoading(false)
    }
  }

  async function startDelivery() {
    if (!myRound) return
    setLoading(true)

    await supabase
      .from('delivery_rounds')
      .update({ 
        status: 'in_progress',
        actual_departure: new Date().toISOString()
      })
      .eq('id', myRound.id)

    loadData()
    setLoading(false)
  }

  async function markDelivered(stopId: string) {
    setLoading(true)

    await supabase
      .from('delivery_round_stops')
      .update({ 
        status: 'delivered',
        actual_arrival: new Date().toISOString()
      })
      .eq('id', stopId)

    // Vérifier si c'était le dernier stop
    if (myRound && currentStop === myRound.stops.length - 1) {
      await supabase
        .from('delivery_rounds')
        .update({ status: 'completed' })
        .eq('id', myRound.id)
    }

    loadData()
    setLoading(false)
  }

  async function releaseOrder(stopId: string, orderId: string) {
    if (!myRound) return
    setLoading(true)

    try {
      // Supprimer le stop
      await supabase
        .from('delivery_round_stops')
        .delete()
        .eq('id', stopId)

      // Délier la commande
      await supabase
        .from('orders')
        .update({ delivery_round_id: null, suggested_round_id: null })
        .eq('id', orderId)

      // Mettre à jour le nombre de stops
      const newTotal = myRound.total_stops - 1
      
      if (newTotal === 0) {
        // Supprimer la tournée vide
        await supabase
          .from('delivery_rounds')
          .delete()
          .eq('id', myRound.id)
      } else {
        await supabase
          .from('delivery_rounds')
          .update({ total_stops: newTotal })
          .eq('id', myRound.id)
      }

      loadData()
    } catch (e) {
      console.error('Erreur relâchement:', e)
    } finally {
      setLoading(false)
    }
  }

  // Relâcher toute la tournée (remet la suggestion en pending)
  async function releaseEntireRound() {
    if (!myRound) return
    setLoading(true)

    try {
      // Récupérer tous les order_ids de la tournée
      const orderIds = myRound.stops.map(s => s.order_id)

      // Trouver la suggestion associée (si elle existe)
      const { data: orders } = await supabase
        .from('orders')
        .select('suggested_round_id')
        .in('id', orderIds)
        .not('suggested_round_id', 'is', null)
        .limit(1)

      const suggestedRoundId = orders?.[0]?.suggested_round_id

      // Supprimer tous les stops
      await supabase
        .from('delivery_round_stops')
        .delete()
        .eq('delivery_round_id', myRound.id)

      // Délier toutes les commandes
      await supabase
        .from('orders')
        .update({ delivery_round_id: null })
        .in('id', orderIds)

      // Supprimer la tournée livreur
      await supabase
        .from('delivery_rounds')
        .delete()
        .eq('id', myRound.id)

      // Remettre la suggestion en pending (si elle existe et n'est pas expirée)
      if (suggestedRoundId) {
        const now = new Date().toISOString()
        await supabase
          .from('suggested_rounds')
          .update({ 
            status: 'pending',
            accepted_at: null,
            driver_id: null
          })
          .eq('id', suggestedRoundId)
          .gt('expires_at', now) // Seulement si pas expirée
      }

      loadData()
    } catch (e) {
      console.error('Erreur relâchement tournée:', e)
      setError('Erreur lors du relâchement de la tournée')
    } finally {
      setLoading(false)
    }
  }

  function openNavigation(address: string, lat?: number | null, lng?: number | null) {
    if (lat && lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank')
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, '_blank')
    }
  }

  // Formatage
  function formatTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleTimeString('fr-BE', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    } catch {
      return '--:--'
    }
  }

  function formatDateTime(isoString: string): string {
    try {
      const date = new Date(isoString)
      const today = new Date()
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const isToday = date.toDateString() === today.toDateString()
      const isTomorrow = date.toDateString() === tomorrow.toDateString()

      const time = date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })

      if (isToday) return `Aujourd'hui ${time}`
      if (isTomorrow) return `Demain ${time}`
      return date.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' }) + ` ${time}`
    } catch {
      return '--'
    }
  }

  function getTimeUntil(isoString: string): string {
    try {
      const target = new Date(isoString).getTime()
      const now = currentTime.getTime()
      const diffMinutes = Math.round((target - now) / (60 * 1000))

      if (diffMinutes < 0) return 'Passé'
      if (diffMinutes < 60) return `Dans ${diffMinutes} min`
      const hours = Math.floor(diffMinutes / 60)
      const mins = diffMinutes % 60
      return `Dans ${hours}h${mins.toString().padStart(2, '0')}`
    } catch {
      return '--'
    }
  }

  // Login screen
  if (!driver) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-500 to-orange-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
          <div className="text-center mb-8">
            <span className="text-6xl block mb-4">🛵</span>
            <h1 className="text-2xl font-bold text-gray-900">Espace Livreur</h1>
            <p className="text-gray-500">MDjambo</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-center">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Code PIN
            </label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full text-center text-3xl font-mono tracking-[0.5em] px-4 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-500"
              placeholder="••••••"
              autoFocus
            />
          </div>

          <button
            onClick={loginWithPin}
            disabled={loading || pin.length !== 6}
            className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl disabled:opacity-50"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Header */}
      <header className="bg-orange-500 text-white p-4 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛵</span>
            <div>
              <h1 className="font-bold">{driver.name}</h1>
              <span className="text-xs bg-green-400 px-2 py-0.5 rounded-full">
                ● Disponible
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="bg-white/20 px-4 py-2 rounded-lg text-sm"
          >
            Déconnexion
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setView('available')}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              view === 'available'
                ? 'bg-white text-orange-500'
                : 'bg-white/20 text-white'
            }`}
          >
            📋 Disponibles ({availableOrders.length + suggestedRounds.reduce((sum, s) => sum + s.orders.length, 0)})
          </button>
          <button
            onClick={() => setView('round')}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              view === 'round'
                ? 'bg-white text-orange-500'
                : 'bg-white/20 text-white'
            }`}
          >
            🚗 Ma tournée
          </button>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {view === 'available' && (
          <div className="space-y-4">
            {/* Suggestions de tournées depuis la DB */}
            {suggestedRounds.length > 0 && showSuggestions && (
              <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-4 text-white relative">
                <button 
                  onClick={() => setShowSuggestions(false)}
                  className="absolute top-2 right-2 text-white/70 hover:text-white"
                >
                  ✕
                </button>
                
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                  🚀 Tournées suggérées
                </h3>
                
                {suggestedRounds.map((suggestion, idx) => {
                  // Vérifier si toutes les commandes sont prêtes
                  const allOrdersReady = suggestion.orders.every(o => o.status === 'ready')
                  const isAccepted = suggestion.status === 'accepted'
                  const canTake = isAccepted && allOrdersReady
                  
                  // Déterminer le message du bouton
                  let buttonText = '✅ Prendre cette tournée'
                  let buttonClass = 'bg-white text-green-600 hover:bg-green-50'
                  
                  if (!isAccepted) {
                    buttonText = '⏳ En attente de validation KDS'
                    buttonClass = 'bg-white/50 text-green-800 cursor-not-allowed'
                  } else if (!allOrdersReady) {
                    buttonText = '👨‍🍳 En préparation...'
                    buttonClass = 'bg-white/50 text-green-800 cursor-not-allowed'
                  }
                  
                  return (
                    <div key={suggestion.id} className={`rounded-xl p-3 mb-3 ${isAccepted ? 'bg-white/20' : 'bg-white/10'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{suggestion.orders.length} livraisons groupées</span>
                          {!isAccepted && (
                            <span className="text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded">
                              En attente
                            </span>
                          )}
                          {isAccepted && !allOrdersReady && (
                            <span className="text-xs bg-orange-400 text-orange-900 px-2 py-0.5 rounded">
                              En prépa
                            </span>
                          )}
                          {canTake && (
                            <span className="text-xs bg-green-300 text-green-900 px-2 py-0.5 rounded">
                              Prêt !
                            </span>
                          )}
                        </div>
                        <span className="text-sm bg-white/30 px-2 py-0.5 rounded">
                          ~{suggestion.total_distance_minutes} min trajet
                        </span>
                      </div>
                      
                      <div className="space-y-1 mb-3">
                        {suggestion.orders.map((o, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span>
                                #{o.order_number} - {(o.delivery_address || '').substring(0, 25)}...
                              </span>
                              {o.status === 'ready' && <span className="text-green-200">✓</span>}
                              {o.status === 'preparing' && <span className="text-yellow-200">🍳</span>}
                              {o.status === 'pending' && <span className="text-white/50">⏳</span>}
                            </div>
                            <span className="text-white/80">
                              ~{formatTime(o.estimated_delivery)}
                            </span>
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex items-center justify-between text-sm mb-3 text-white/80">
                        <span>⏰ Préparer: {formatTime(suggestion.prep_at)}</span>
                        <span>🚗 Départ: {formatTime(suggestion.depart_at)}</span>
                      </div>
                      
                      <button
                        onClick={() => canTake && takeSuggestedRound(suggestion)}
                        disabled={!canTake || loading}
                        className={`w-full font-bold py-3 rounded-xl disabled:opacity-50 ${buttonClass}`}
                      >
                        {buttonText}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Liste des commandes individuelles (hors suggestions) */}
            {availableOrders.length === 0 && suggestedRounds.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center">
                <span className="text-5xl block mb-4">📭</span>
                <p className="text-gray-500">Aucune livraison disponible</p>
                <p className="text-gray-400 text-sm mt-2">Les prochaines livraisons apparaîtront ici</p>
              </div>
            ) : availableOrders.length > 0 && (
              <>
                <h3 className="font-medium text-gray-600 mb-2">
                  Livraisons individuelles
                </h3>
                {availableOrders.map(order => (
                  <div key={order.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-xl font-bold">#{order.order_number}</span>
                        <p className="text-gray-500 text-sm">
                          {formatDateTime(order.scheduled_time)}
                        </p>
                        <p className={`text-xs mt-1 ${
                          getTimeUntil(order.scheduled_time) === 'Passé' 
                            ? 'text-red-500 font-medium' 
                            : 'text-gray-400'
                        }`}>
                          {getTimeUntil(order.scheduled_time)}
                        </p>
                      </div>
                      <span className="text-lg font-bold text-orange-500">
                        {order.total_amount?.toFixed(2)}€
                      </span>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-3 mb-3">
                      <p className="font-medium">{order.customer_name || 'Client'}</p>
                      <p className="text-sm text-gray-600">{order.delivery_address}</p>
                      {order.customer_phone && (
                        <a href={`tel:${order.customer_phone}`} className="text-blue-500 text-sm">
                          📞 {order.customer_phone}
                        </a>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {myRound ? (
                        <button
                          onClick={() => addToRound(order.id)}
                          disabled={loading || myRound.total_stops >= MAX_DELIVERIES_PER_ROUND}
                          className="flex-1 bg-blue-500 text-white font-medium py-3 rounded-xl disabled:opacity-50"
                        >
                          ➕ Ajouter à ma tournée
                        </button>
                      ) : (
                        <button
                          onClick={() => takeOrder(order.id)}
                          disabled={loading}
                          className="flex-1 bg-orange-500 text-white font-medium py-3 rounded-xl"
                        >
                          🚗 Prendre cette livraison
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {view === 'round' && myRound && (
          <div className="space-y-4">
            {/* Statut tournée */}
            <div className="bg-white rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg">Ma tournée</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  myRound.status === 'in_progress' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {myRound.status === 'in_progress' ? '🚗 En cours' : '⏳ Prête'}
                </span>
              </div>

              {myRound.status === 'ready' && (
                <div className="space-y-2">
                  <button
                    onClick={startDelivery}
                    className="w-full bg-green-500 text-white font-bold py-4 rounded-xl text-lg"
                  >
                    🚀 Démarrer la tournée
                  </button>
                  
                  {/* Bouton relâcher toute la tournée - seulement si tournée groupée (2+ stops) */}
                  {myRound.total_stops >= 2 && (
                    <button
                      onClick={releaseEntireRound}
                      disabled={loading}
                      className="w-full bg-gray-100 text-gray-600 font-medium py-3 rounded-xl hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      ↩️ Relâcher la tournée ({myRound.total_stops} livraisons)
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Liste des stops */}
            {myRound.stops.map((stop, index) => {
              const isCurrentStop = index === currentStop && myRound.status === 'in_progress'
              const isCompleted = stop.status === 'delivered'
              const order = stop.order as any
              // Une tournée est "groupée" si elle a 2+ stops
              const isGroupedRound = myRound.total_stops >= 2

              return (
                <div
                  key={stop.id}
                  className={`bg-white rounded-2xl p-4 border-2 transition-all ${
                    isCurrentStop ? 'border-green-500 shadow-lg' : 
                    isCompleted ? 'border-gray-200 opacity-60' : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      isCompleted ? 'bg-green-500 text-white' :
                      isCurrentStop ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {isCompleted ? '✓' : stop.stop_order}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">#{order?.order_number}</span>
                        <span className="text-sm text-gray-500">
                          {stop.customer_slot_start && formatDateTime(stop.customer_slot_start)}
                        </span>
                      </div>

                      <p className="text-gray-600 mt-1">{stop.address}</p>
                      
                      {stop.estimated_arrival && (
                        <p className="text-xs text-green-600 mt-1">
                          Livraison estimée: {formatTime(stop.estimated_arrival)}
                        </p>
                      )}

                      {order?.customer_phone && (
                        <a 
                          href={`tel:${order.customer_phone}`}
                          className="inline-block mt-2 text-blue-500"
                        >
                          📞 Appeler
                        </a>
                      )}

                      {isCurrentStop && !isCompleted && (
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => openNavigation(stop.address, stop.latitude, stop.longitude)}
                            className="flex-1 bg-blue-500 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2"
                          >
                            🗺️ GPS
                          </button>
                          <button
                            onClick={() => markDelivered(stop.id)}
                            className="flex-1 bg-green-500 text-white font-medium py-3 rounded-xl"
                          >
                            ✅ Livré
                          </button>
                        </div>
                      )}

                      {/* Bouton relâcher individuel - SEULEMENT si commande seule (pas groupée) */}
                      {!isCompleted && !isGroupedRound && (
                        <button
                          onClick={() => releaseOrder(stop.id, stop.order_id)}
                          disabled={loading}
                          className="w-full mt-2 bg-gray-100 text-gray-600 font-medium py-2 rounded-xl text-sm hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          ↩️ Relâcher cette commande
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {view === 'round' && !myRound && (
          <div className="bg-white rounded-2xl p-8 text-center">
            <span className="text-5xl block mb-4">🚗</span>
            <p className="text-gray-500">Pas de tournée en cours</p>
            <p className="text-gray-400 text-sm mt-2">
              Prenez des commandes depuis l'onglet "Disponibles"
            </p>
          </div>
        )}
      </div>
      
      {/* Footer info */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-2 text-center text-xs text-gray-400">
        ⏰ {currentTime.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })} • 
        Tolérance client: ±{TOLERANCE_MINUTES} min • 
        Max {MAX_DELIVERIES_PER_ROUND} livraisons/tournée
      </div>
    </div>
  )
}
