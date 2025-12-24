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

type SuggestedRound = {
  orders: DeliveryOrder[]
  totalDistance: number // en minutes
  prepareAt: Date
  departAt: Date
  deliveries: {
    order: DeliveryOrder
    estimatedDelivery: Date
    withinWindow: boolean
  }[]
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
const TOLERANCE_MINUTES = 15 // ±15 min tolérance client
const MAX_DISTANCE_MINUTES = 5 // Max 5 min entre deux adresses
const MAX_ROUND_DURATION = 35 // Max 35 min en isotherme
const MAX_DELIVERIES_PER_ROUND = 3 // Max 3 livraisons par tournée
const AVG_PREP_TIME = 10 // Temps de préparation moyen en minutes

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
    const timer = setInterval(() => setCurrentTime(new Date()), 60000) // Update every minute
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
      // Refresh toutes les 30 secondes
      const interval = setInterval(loadData, 30000)
      return () => clearInterval(interval)
    }
  }, [driver])

  // Calculer les suggestions quand les commandes changent
  useEffect(() => {
    if (availableOrders.length > 0) {
      const suggestions = calculateSuggestedRounds(availableOrders)
      setSuggestedRounds(suggestions)
    } else {
      setSuggestedRounds([])
    }
  }, [availableOrders])

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
    
    // Mettre le statut en service
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
      
      // Trouver le prochain stop non livré
      const nextStop = stops.findIndex((s: any) => s.status !== 'delivered')
      setCurrentStop(nextStop >= 0 ? nextStop : stops.length - 1)
    } else {
      setMyRound(null)
      setView('available')
    }

    // Charger les commandes disponibles (non assignées, futures uniquement)
    const now = new Date()
    // On prend les commandes jusqu'à 4h dans le futur
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
      .gte('scheduled_time', now.toISOString())
      .lte('scheduled_time', maxTime.toISOString())
      .order('scheduled_time')

    const orders: DeliveryOrder[] = (ordersData || []).map((o: any) => {
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

  // ==================== ALGORITHME DE SUGGESTION ====================
  
  function calculateSuggestedRounds(orders: DeliveryOrder[]): SuggestedRound[] {
    if (orders.length < 2) return []
    
    const suggestions: SuggestedRound[] = []
    const usedOrderIds = new Set<string>()
    
    // Trier par heure de livraison
    const sortedOrders = [...orders].sort((a, b) => 
      new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
    )
    
    for (let i = 0; i < sortedOrders.length; i++) {
      const baseOrder = sortedOrders[i]
      if (usedOrderIds.has(baseOrder.id)) continue
      
      // Chercher des commandes compatibles
      const compatibleOrders = [baseOrder]
      
      for (let j = i + 1; j < sortedOrders.length && compatibleOrders.length < MAX_DELIVERIES_PER_ROUND; j++) {
        const candidateOrder = sortedOrders[j]
        if (usedOrderIds.has(candidateOrder.id)) continue
        
        // Vérifier la compatibilité
        if (isCompatibleForRound(compatibleOrders, candidateOrder)) {
          compatibleOrders.push(candidateOrder)
        }
      }
      
      // Si on a au moins 2 commandes compatibles, créer une suggestion
      if (compatibleOrders.length >= 2) {
        const suggestion = buildSuggestedRound(compatibleOrders)
        if (suggestion) {
          suggestions.push(suggestion)
          compatibleOrders.forEach(o => usedOrderIds.add(o.id))
        }
      }
    }
    
    return suggestions
  }
  
  function isCompatibleForRound(existingOrders: DeliveryOrder[], newOrder: DeliveryOrder): boolean {
    // 1. Vérifier la distance (si on a les coordonnées)
    for (const existing of existingOrders) {
      if (existing.delivery_lat && existing.delivery_lng && newOrder.delivery_lat && newOrder.delivery_lng) {
        const distance = estimateDistanceMinutes(
          existing.delivery_lat, existing.delivery_lng,
          newOrder.delivery_lat, newOrder.delivery_lng
        )
        if (distance > MAX_DISTANCE_MINUTES) return false
      }
    }
    
    // 2. Vérifier que les fenêtres de temps sont compatibles
    const allOrders = [...existingOrders, newOrder]
    const windows = allOrders.map(o => ({
      order: o,
      min: new Date(new Date(o.scheduled_time).getTime() - TOLERANCE_MINUTES * 60 * 1000),
      max: new Date(new Date(o.scheduled_time).getTime() + TOLERANCE_MINUTES * 60 * 1000),
    }))
    
    // Trouver l'intersection des fenêtres
    let intersectionStart = new Date(0)
    let intersectionEnd = new Date(8640000000000000) // Max date
    
    for (const w of windows) {
      if (w.min > intersectionStart) intersectionStart = w.min
      if (w.max < intersectionEnd) intersectionEnd = w.max
    }
    
    // Il faut au moins 10 minutes d'intersection pour avoir le temps de livrer
    const intersectionMinutes = (intersectionEnd.getTime() - intersectionStart.getTime()) / (60 * 1000)
    if (intersectionMinutes < 10) return false
    
    // 3. Vérifier que la durée totale de la tournée reste acceptable
    const totalDeliveryTime = (allOrders.length - 1) * MAX_DISTANCE_MINUTES // Temps entre les livraisons
    if (totalDeliveryTime > MAX_ROUND_DURATION) return false
    
    return true
  }
  
  function buildSuggestedRound(orders: DeliveryOrder[]): SuggestedRound | null {
    // Trier les commandes par heure demandée pour optimiser l'ordre
    const sortedOrders = [...orders].sort((a, b) => 
      new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
    )
    
    // Calculer les fenêtres
    const windows = sortedOrders.map(o => ({
      order: o,
      requested: new Date(o.scheduled_time),
      min: new Date(new Date(o.scheduled_time).getTime() - TOLERANCE_MINUTES * 60 * 1000),
      max: new Date(new Date(o.scheduled_time).getTime() + TOLERANCE_MINUTES * 60 * 1000),
    }))
    
    // Trouver le point optimal de livraison
    // On vise le milieu de l'intersection des fenêtres
    let intersectionStart = windows[0].min
    let intersectionEnd = windows[0].max
    
    for (const w of windows) {
      if (w.min > intersectionStart) intersectionStart = w.min
      if (w.max < intersectionEnd) intersectionEnd = w.max
    }
    
    // Calculer les heures de livraison estimées
    const deliveries: SuggestedRound['deliveries'] = []
    let currentDeliveryTime = intersectionStart
    
    for (let i = 0; i < sortedOrders.length; i++) {
      const order = sortedOrders[i]
      const window = windows[i]
      
      // Ajuster pour que le premier soit livré un peu en retard, le dernier un peu en avance
      let estimatedDelivery: Date
      if (i === 0) {
        // Premier: vers la fin de sa fenêtre (léger retard OK)
        estimatedDelivery = new Date(Math.min(
          window.max.getTime(),
          intersectionStart.getTime() + 5 * 60 * 1000
        ))
      } else if (i === sortedOrders.length - 1) {
        // Dernier: vers le début de sa fenêtre (légère avance OK)
        estimatedDelivery = new Date(currentDeliveryTime.getTime() + MAX_DISTANCE_MINUTES * 60 * 1000)
      } else {
        // Milieu: entre les deux
        estimatedDelivery = new Date(currentDeliveryTime.getTime() + MAX_DISTANCE_MINUTES * 60 * 1000)
      }
      
      deliveries.push({
        order,
        estimatedDelivery,
        withinWindow: estimatedDelivery >= window.min && estimatedDelivery <= window.max
      })
      
      currentDeliveryTime = estimatedDelivery
    }
    
    // Vérifier que toutes les livraisons sont dans leur fenêtre
    if (!deliveries.every(d => d.withinWindow)) {
      return null
    }
    
    // Calculer l'heure de départ et de préparation
    const firstDeliveryTime = deliveries[0].estimatedDelivery
    const departAt = new Date(firstDeliveryTime.getTime() - MAX_DISTANCE_MINUTES * 60 * 1000) // Temps pour aller au premier
    const prepareAt = new Date(departAt.getTime() - AVG_PREP_TIME * 60 * 1000)
    
    // Calculer la distance totale (approximative)
    const totalDistance = (sortedOrders.length - 1) * MAX_DISTANCE_MINUTES
    
    return {
      orders: sortedOrders,
      totalDistance,
      prepareAt,
      departAt,
      deliveries
    }
  }
  
  function estimateDistanceMinutes(lat1: number, lng1: number, lat2: number, lng2: number): number {
    // Formule Haversine simplifiée pour estimer la distance
    const R = 6371 // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    const distanceKm = R * c
    
    // Estimer le temps: ~30 km/h en moyenne en zone urbaine/périurbaine
    const timeMinutes = (distanceKm / 30) * 60
    return Math.round(timeMinutes)
  }

  // ==================== ACTIONS ====================

  async function takeOrder(orderId: string) {
    if (!driver) return

    const order = availableOrders.find(o => o.id === orderId)
    if (!order) return

    setLoading(true)

    // Créer la tournée
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

    if (roundError) {
      console.error('Error creating round:', roundError)
      setLoading(false)
      return
    }

    // Ajouter le stop
    await supabase
      .from('delivery_round_stops')
      .insert({
        round_id: round.id,
        order_id: orderId,
        stop_order: 1,
        address: order.delivery_address,
        latitude: order.delivery_lat,
        longitude: order.delivery_lng,
        customer_slot_start: order.scheduled_time,
        customer_slot_end: order.scheduled_time,
        status: 'pending',
      })

    // Lier la commande à la tournée
    await supabase
      .from('orders')
      .update({ delivery_round_id: round.id })
      .eq('id', orderId)

    // Mettre le livreur en livraison
    await supabase
      .from('drivers')
      .update({ status: 'delivering' })
      .eq('id', driver.id)

    await loadData()
    setLoading(false)
  }

  async function takeSuggestedRound(suggestion: SuggestedRound) {
    if (!driver) return

    setLoading(true)

    // Créer la tournée
    const { data: round, error: roundError } = await supabase
      .from('delivery_rounds')
      .insert({
        establishment_id: establishmentId,
        driver_id: driver.id,
        status: 'ready',
        total_stops: suggestion.orders.length,
        planned_departure: suggestion.departAt.toISOString(),
      })
      .select()
      .single()

    if (roundError) {
      console.error('Error creating round:', roundError)
      setLoading(false)
      return
    }

    // Ajouter tous les stops
    for (let i = 0; i < suggestion.deliveries.length; i++) {
      const delivery = suggestion.deliveries[i]
      const order = delivery.order

      await supabase
        .from('delivery_round_stops')
        .insert({
          round_id: round.id,
          order_id: order.id,
          stop_order: i + 1,
          address: order.delivery_address,
          latitude: order.delivery_lat,
          longitude: order.delivery_lng,
          customer_slot_start: order.scheduled_time,
          customer_slot_end: order.scheduled_time,
          estimated_arrival: delivery.estimatedDelivery.toISOString(),
          status: 'pending',
        })

      // Lier la commande à la tournée
      await supabase
        .from('orders')
        .update({ delivery_round_id: round.id })
        .eq('id', order.id)
    }

    // Mettre le livreur en livraison
    await supabase
      .from('drivers')
      .update({ status: 'delivering' })
      .eq('id', driver.id)

    await loadData()
    setLoading(false)
  }

  async function addToRound(orderId: string) {
    if (!driver || !myRound) return

    const order = availableOrders.find(o => o.id === orderId)
    if (!order) return

    setLoading(true)

    const newStopOrder = myRound.total_stops + 1

    // Ajouter le stop
    await supabase
      .from('delivery_round_stops')
      .insert({
        round_id: myRound.id,
        order_id: orderId,
        stop_order: newStopOrder,
        address: order.delivery_address,
        latitude: order.delivery_lat,
        longitude: order.delivery_lng,
        customer_slot_start: order.scheduled_time,
        customer_slot_end: order.scheduled_time,
        status: 'pending',
      })

    // Mettre à jour le nombre de stops
    await supabase
      .from('delivery_rounds')
      .update({ total_stops: newStopOrder })
      .eq('id', myRound.id)

    // Lier la commande
    await supabase
      .from('orders')
      .update({ delivery_round_id: myRound.id })
      .eq('id', orderId)

    await loadData()
    setLoading(false)
  }

  async function startDelivery() {
    if (!myRound) return

    await supabase
      .from('delivery_rounds')
      .update({
        status: 'in_progress',
        actual_departure: new Date().toISOString(),
      })
      .eq('id', myRound.id)

    // Premier stop en transit
    if (myRound.stops[0]) {
      await supabase
        .from('delivery_round_stops')
        .update({ status: 'in_transit' })
        .eq('id', myRound.stops[0].id)
    }

    await loadData()
  }

  async function markDelivered(stopId: string) {
    await supabase
      .from('delivery_round_stops')
      .update({
        status: 'delivered',
        actual_arrival: new Date().toISOString(),
      })
      .eq('id', stopId)

    // Mettre à jour la commande
    const stop = myRound?.stops.find(s => s.id === stopId)
    if (stop) {
      await supabase
        .from('orders')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', stop.order_id)
    }

    // Passer au stop suivant
    const nextStopIndex = currentStop + 1
    if (myRound && nextStopIndex < myRound.stops.length) {
      await supabase
        .from('delivery_round_stops')
        .update({ status: 'in_transit' })
        .eq('id', myRound.stops[nextStopIndex].id)
      
      setCurrentStop(nextStopIndex)
    } else {
      // Tournée terminée
      await supabase
        .from('delivery_rounds')
        .update({
          status: 'completed',
          actual_return: new Date().toISOString(),
        })
        .eq('id', myRound!.id)

      // Livreur disponible
      await supabase
        .from('drivers')
        .update({ status: 'available' })
        .eq('id', driver!.id)
    }

    await loadData()
  }

  async function releaseOrder(stopId: string, orderId: string) {
    if (!confirm('Relâcher cette commande ? Elle redeviendra disponible.')) return

    setLoading(true)

    try {
      // Supprimer le stop
      await supabase
        .from('delivery_round_stops')
        .delete()
        .eq('id', stopId)

      // Retirer la commande de la tournée
      await supabase
        .from('orders')
        .update({ delivery_round_id: null, status: 'ready' })
        .eq('id', orderId)

      if (myRound) {
        const newTotalStops = myRound.total_stops - 1

        if (newTotalStops === 0) {
          // Supprimer la tournée vide
          await supabase
            .from('delivery_rounds')
            .delete()
            .eq('id', myRound.id)

          await supabase
            .from('drivers')
            .update({ status: 'available' })
            .eq('id', driver!.id)
        } else {
          await supabase
            .from('delivery_rounds')
            .update({ total_stops: newTotalStops })
            .eq('id', myRound.id)

          // Réordonner les stops
          const remainingStops = myRound.stops.filter(s => s.id !== stopId)
          for (let i = 0; i < remainingStops.length; i++) {
            await supabase
              .from('delivery_round_stops')
              .update({ stop_order: i + 1 })
              .eq('id', remainingStops[i].id)
          }
        }
      }

      await loadData()
    } catch (error) {
      console.error('Erreur release:', error)
      alert('Erreur lors du relâchement')
    } finally {
      setLoading(false)
    }
  }

  function openNavigation(address: string, lat?: number | null, lng?: number | null) {
    let url: string
    if (lat && lng) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    } else {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
    }
    window.open(url, '_blank')
  }

  function logout() {
    if (driver) {
      supabase
        .from('drivers')
        .update({ status: 'offline' })
        .eq('id', driver.id)
    }
    localStorage.removeItem('driver_id')
    setDriver(null)
    setPin('')
  }

  // ==================== FORMATAGE ====================

  function formatDateTime(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const timeStr = date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
    
    // Aujourd'hui
    if (date.toDateString() === now.toDateString()) {
      return `Aujourd'hui ${timeStr}`
    }
    
    // Demain
    if (date.toDateString() === tomorrow.toDateString()) {
      return `Demain ${timeStr}`
    }
    
    // Autre jour
    return date.toLocaleDateString('fr-BE', { 
      day: '2-digit', 
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('fr-BE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getTimeUntil(dateString: string): string {
    const target = new Date(dateString)
    const now = new Date()
    const diffMs = target.getTime() - now.getTime()
    const diffMinutes = Math.round(diffMs / (60 * 1000))
    
    if (diffMinutes < 0) return 'Passé'
    if (diffMinutes < 60) return `Dans ${diffMinutes} min`
    const hours = Math.floor(diffMinutes / 60)
    const mins = diffMinutes % 60
    return `Dans ${hours}h${mins > 0 ? mins.toString().padStart(2, '0') : ''}`
  }

  // ==================== ÉCRAN DE LOGIN ====================

  if (!driver) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
          <div className="text-center mb-8">
            <span className="text-6xl block mb-4">🛵</span>
            <h1 className="text-2xl font-bold text-gray-900">FritOS Driver</h1>
            <p className="text-gray-500">Entrez votre code PIN</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl mb-4 text-center">
              {error}
            </div>
          )}

          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="w-full text-center text-4xl font-mono tracking-widest px-4 py-6 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none mb-6"
            placeholder="• • • • • •"
          />

          <button
            onClick={loginWithPin}
            disabled={loading || pin.length !== 6}
            className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl text-lg hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </div>
      </div>
    )
  }

  // ==================== APPLICATION PRINCIPALE ====================

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-orange-500 text-white p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛵</span>
            <div>
              <h1 className="font-bold">{driver.name}</h1>
              <p className="text-orange-100 text-sm flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                {myRound ? `Tournée (${myRound.total_stops} stops)` : 'Disponible'}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="bg-white/20 px-3 py-1 rounded-lg text-sm"
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b flex">
        <button
          onClick={() => setView('available')}
          className={`flex-1 py-3 font-medium transition-colors ${
            view === 'available' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'
          }`}
        >
          📋 Disponibles ({availableOrders.length})
        </button>
        <button
          onClick={() => setView('round')}
          disabled={!myRound}
          className={`flex-1 py-3 font-medium transition-colors ${
            view === 'round' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'
          } disabled:opacity-50`}
        >
          🚗 Ma tournée
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {view === 'available' && (
          <div className="space-y-4">
            
            {/* Suggestions de tournées */}
            {suggestedRounds.length > 0 && showSuggestions && (
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-4 text-white">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-lg">🚀 Tournées suggérées</h2>
                  <button 
                    onClick={() => setShowSuggestions(false)}
                    className="text-white/70 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                
                {suggestedRounds.map((suggestion, idx) => (
                  <div key={idx} className="bg-white/20 rounded-xl p-3 mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">
                        {suggestion.orders.length} livraisons groupées
                      </span>
                      <span className="text-sm bg-white/30 px-2 py-0.5 rounded">
                        ~{suggestion.totalDistance + MAX_DISTANCE_MINUTES} min trajet
                      </span>
                    </div>
                    
                    <div className="space-y-1 mb-3">
                      {suggestion.deliveries.map((d, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span>
                            #{d.order.order_number} - {d.order.delivery_address.substring(0, 25)}...
                          </span>
                          <span className="text-white/80">
                            ~{formatTime(d.estimatedDelivery.toISOString())}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm mb-3 text-white/80">
                      <span>⏰ Préparer: {formatTime(suggestion.prepareAt.toISOString())}</span>
                      <span>🚗 Départ: {formatTime(suggestion.departAt.toISOString())}</span>
                    </div>
                    
                    <button
                      onClick={() => takeSuggestedRound(suggestion)}
                      disabled={loading}
                      className="w-full bg-white text-green-600 font-bold py-3 rounded-xl hover:bg-green-50 disabled:opacity-50"
                    >
                      ✅ Prendre cette tournée
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Liste des commandes individuelles */}
            {availableOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center">
                <span className="text-5xl block mb-4">📭</span>
                <p className="text-gray-500">Aucune livraison disponible</p>
                <p className="text-gray-400 text-sm mt-2">Les prochaines livraisons apparaîtront ici</p>
              </div>
            ) : (
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
                <button
                  onClick={startDelivery}
                  className="w-full bg-green-500 text-white font-bold py-4 rounded-xl text-lg"
                >
                  🚀 Démarrer la tournée
                </button>
              )}
            </div>

            {/* Liste des stops */}
            {myRound.stops.map((stop, index) => {
              const isCurrentStop = index === currentStop && myRound.status === 'in_progress'
              const isCompleted = stop.status === 'delivered'
              const order = stop.order as any

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

                      {!isCompleted && (
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
