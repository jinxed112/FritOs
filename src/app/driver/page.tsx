'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// ==================== TYPES ====================

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
  status: string
  delivery_round_id: string | null  // IMPORTANT: pour savoir si déjà prise
}

type SuggestedRound = {
  id: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  prep_at: string
  depart_at: string
  total_distance_minutes: number
  expires_at: string
  orders: SuggestedRoundOrder[]
}

type DeliveryRoundStop = {
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
}

type DeliveryRound = {
  id: string
  status: string
  planned_departure: string | null
  total_stops: number
  stops: DeliveryRoundStop[]
}

type Driver = {
  id: string
  name: string
  phone: string
  status: string
}

// ==================== CONFIGURATION ====================

const TOLERANCE_MINUTES = 15
const MAX_DELIVERIES_PER_ROUND = 3

// ==================== HELPERS ====================

/**
 * Détermine si une suggestion est disponible pour être prise
 * - Pas encore prise (aucune commande n'a de delivery_round_id)
 * - Non expirée
 */
function isSuggestionAvailable(suggestion: SuggestedRound): boolean {
  // Vérifier si au moins une commande n'a pas encore été prise
  const hasAvailableOrders = suggestion.orders.some(o => !o.delivery_round_id)
  
  // Vérifier si pas expirée
  const notExpired = new Date(suggestion.expires_at) > new Date()
  
  return hasAvailableOrders && notExpired
}

/**
 * Détermine l'état d'une suggestion pour l'affichage
 */
function getSuggestionState(suggestion: SuggestedRound): {
  canTake: boolean
  buttonText: string
  buttonClass: string
  badge: { text: string; class: string } | null
} {
  const allOrdersReady = suggestion.orders.every(o => o.status === 'ready')
  const someOrdersReady = suggestion.orders.some(o => o.status === 'ready')
  const isAccepted = suggestion.status === 'accepted'
  const isPending = suggestion.status === 'pending'
  
  // Cas 1: En attente de validation KDS
  if (isPending) {
    return {
      canTake: false,
      buttonText: '⏳ En attente de validation KDS',
      buttonClass: 'bg-white/50 text-gray-600 cursor-not-allowed',
      badge: { text: 'En attente', class: 'bg-yellow-400 text-yellow-900' }
    }
  }
  
  // Cas 2: Accepté mais pas toutes les commandes prêtes
  if (isAccepted && !allOrdersReady) {
    const readyCount = suggestion.orders.filter(o => o.status === 'ready').length
    return {
      canTake: false,
      buttonText: `👨‍🍳 En préparation (${readyCount}/${suggestion.orders.length} prêts)`,
      buttonClass: 'bg-white/50 text-orange-600 cursor-not-allowed',
      badge: { text: 'En prépa', class: 'bg-orange-400 text-orange-900' }
    }
  }
  
  // Cas 3: Prêt à prendre !
  if (isAccepted && allOrdersReady) {
    return {
      canTake: true,
      buttonText: '✅ Prendre cette tournée',
      buttonClass: 'bg-white text-green-600 hover:bg-green-50 font-bold',
      badge: { text: 'Prêt !', class: 'bg-green-400 text-green-900' }
    }
  }
  
  // Cas par défaut (ne devrait pas arriver)
  return {
    canTake: false,
    buttonText: 'Non disponible',
    buttonClass: 'bg-gray-300 text-gray-600 cursor-not-allowed',
    badge: null
  }
}

/**
 * Formatte une date en heure locale
 */
function formatTime(dateStr: string | null): string {
  if (!dateStr) return '--:--'
  const date = new Date(dateStr)
  return date.toLocaleTimeString('fr-BE', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'Europe/Brussels'
  })
}

/**
 * Formatte une date avec jour si pas aujourd'hui
 */
function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '--'
  const date = new Date(dateStr)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  const isToday = date.toDateString() === today.toDateString()
  const isTomorrow = date.toDateString() === tomorrow.toDateString()
  
  const time = date.toLocaleTimeString('fr-BE', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'Europe/Brussels'
  })
  
  if (isToday) return time
  if (isTomorrow) return `Demain ${time}`
  return date.toLocaleDateString('fr-BE', { 
    day: 'numeric', 
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Brussels'
  })
}

/**
 * Calcule le temps restant jusqu'à une date
 */
function getTimeUntil(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  
  if (diffMins < 0) return 'Passé'
  if (diffMins < 60) return `Dans ${diffMins} min`
  const hours = Math.floor(diffMins / 60)
  const mins = diffMins % 60
  return `Dans ${hours}h${mins > 0 ? mins : ''}`
}

// ==================== COMPONENT ====================

export default function DriverPage() {
  // Auth state
  const [pin, setPin] = useState('')
  const [driver, setDriver] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Data state
  const [availableOrders, setAvailableOrders] = useState<DeliveryOrder[]>([])
  const [suggestedRounds, setSuggestedRounds] = useState<SuggestedRound[]>([])
  const [myRound, setMyRound] = useState<DeliveryRound | null>(null)
  const [currentStop, setCurrentStop] = useState<number>(0)
  const [currentTime, setCurrentTime] = useState(new Date())
  
  // UI state
  const [view, setView] = useState<'available' | 'round'>('available')
  const [showSuggestions, setShowSuggestions] = useState(true)
  
  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  // ==================== EFFECTS ====================

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
      const interval = setInterval(loadData, 30000) // Refresh toutes les 30s
      return () => clearInterval(interval)
    }
  }, [driver])

  // ==================== AUTH FUNCTIONS ====================

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

  // ==================== DATA LOADING ====================

  async function loadData() {
    if (!driver) return

    // 1. Charger ma tournée en cours
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
      
      setMyRound({ ...roundData, stops })
      setView('round')
      
      const nextStop = stops.findIndex((s: any) => s.status !== 'delivered')
      setCurrentStop(nextStop >= 0 ? nextStop : stops.length - 1)
    } else {
      setMyRound(null)
      setView('available')
    }

    // 2. Charger les suggestions (pending ET accepted)
    // La vue doit inclure delivery_round_id pour le filtrage
    const { data: suggestionsData } = await supabase
      .from('v_suggested_rounds_details')
      .select('*')
      .eq('establishment_id', establishmentId)
      .in('status', ['pending', 'accepted'])
      .order('prep_at', { ascending: true })

    // Filtrer pour ne garder que les suggestions disponibles
    // (au moins une commande sans delivery_round_id)
    const allSuggestions: SuggestedRound[] = (suggestionsData || []).map((r: any) => ({
      ...r,
      orders: r.orders || []
    }))
    
    const availableSuggestions = allSuggestions.filter(isSuggestionAvailable)
    setSuggestedRounds(availableSuggestions)

    // 3. Récupérer les IDs des commandes dans les suggestions actives
    const orderIdsInSuggestions = new Set<string>()
    availableSuggestions.forEach(s => {
      s.orders.forEach(o => orderIdsInSuggestions.add(o.order_id))
    })

    // 4. Charger les commandes individuelles disponibles
    const now = new Date()
    const maxTime = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24h
    
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

    // Exclure les commandes déjà dans une suggestion
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

  // ==================== ORDER ACTIONS ====================

  /**
   * Prendre une commande individuelle (créer une tournée avec 1 stop)
   */
  async function takeOrder(orderId: string) {
    if (!driver) return
    setLoading(true)

    try {
      const order = availableOrders.find(o => o.id === orderId)
      if (!order) throw new Error('Commande non trouvée')

      // Créer une nouvelle tournée
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

      // Créer le stop
      await supabase
        .from('delivery_round_stops')
        .insert({
          round_id: round.id,
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

  /**
   * Prendre une tournée suggérée
   */
  async function takeSuggestedRound(suggestion: SuggestedRound) {
    if (!driver) return
    setLoading(true)

    try {
      // Si pending, accepter d'abord via RPC
      if (suggestion.status === 'pending') {
        const { data, error } = await supabase.rpc('accept_suggested_round', {
          p_suggested_round_id: suggestion.id
        })

        if (error) {
          console.error('Erreur acceptation suggestion:', error)
          setError('Erreur lors de l\'acceptation de la tournée')
          setLoading(false)
          return
        }

        if (!data?.success) {
          setError(data?.error || 'Erreur inconnue')
          setLoading(false)
          return
        }
      }

      // Créer une nouvelle tournée livreur
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
            round_id: round.id,
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

  /**
   * Ajouter une commande à ma tournée en cours
   */
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
          round_id: myRound.id,
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

  // ==================== ROUND ACTIONS ====================

  /**
   * Démarrer la livraison
   */
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

  /**
   * Marquer un stop comme livré
   */
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

  /**
   * Relâcher une commande individuelle (hors d'une tournée groupée)
   */
  async function releaseOrder(stopId: string, orderId: string) {
    if (!myRound) return
    setLoading(true)

    try {
      // Supprimer le stop
      await supabase
        .from('delivery_round_stops')
        .delete()
        .eq('id', stopId)

      // Délier la commande (remet aussi suggested_round_id à null pour commande individuelle)
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

  /**
   * Relâcher toute la tournée
   * - La suggestion reste 'accepted' → un autre livreur peut la prendre
   * - Les commandes perdent juste leur delivery_round_id
   */
  async function releaseEntireRound() {
    if (!myRound) return
    setLoading(true)

    try {
      const orderIds = myRound.stops.map(s => s.order_id)

      // 1. Supprimer tous les stops
      await supabase
        .from('delivery_round_stops')
        .delete()
        .eq('round_id', myRound.id)

      // 2. Délier toutes les commandes (mais garder suggested_round_id intact!)
      await supabase
        .from('orders')
        .update({ delivery_round_id: null })
        .in('id', orderIds)

      // 3. Supprimer la tournée livreur
      await supabase
        .from('delivery_rounds')
        .delete()
        .eq('id', myRound.id)

      // NOTE: On ne touche PAS à suggested_rounds
      // La suggestion reste 'accepted' et réapparaîtra dans les disponibles
      // car les commandes n'ont plus de delivery_round_id

      loadData()
    } catch (e) {
      console.error('Erreur relâchement tournée:', e)
      setError('Erreur lors du relâchement de la tournée')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Ouvrir la navigation GPS
   */
  function openNavigation(address: string, lat?: number | null, lng?: number | null) {
    if (lat && lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank')
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, '_blank')
    }
  }

  // ==================== RENDER: LOGIN ====================

  if (!driver) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-500 to-orange-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-xl">
          <div className="text-center mb-8">
            <span className="text-6xl">🚗</span>
            <h1 className="text-2xl font-bold mt-4">Espace Livreur</h1>
            <p className="text-gray-500 mt-2">Entrez votre code PIN</p>
          </div>

          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="w-full text-center text-3xl tracking-[0.5em] font-mono py-4 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none"
            placeholder="••••••"
          />

          {error && (
            <p className="text-red-500 text-center mt-4">{error}</p>
          )}

          <button
            onClick={loginWithPin}
            disabled={loading || pin.length !== 6}
            className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl mt-6 disabled:opacity-50"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </div>
      </div>
    )
  }

  // ==================== RENDER: MAIN ====================

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Header */}
      <div className="bg-orange-500 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🚗</span>
            <div>
              <p className="font-bold text-lg">{driver.name}</p>
              <span className="text-xs bg-green-400 text-green-900 px-2 py-0.5 rounded-full">
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
      </div>

      {/* Tabs */}
      <div className="flex p-2 gap-2 bg-orange-500">
        <button
          onClick={() => setView('available')}
          className={`flex-1 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
            view === 'available'
              ? 'bg-white text-orange-600'
              : 'bg-orange-400 text-white'
          }`}
        >
          📋 Disponibles ({suggestedRounds.length + availableOrders.length})
        </button>
        <button
          onClick={() => setView('round')}
          className={`flex-1 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
            view === 'round'
              ? 'bg-white text-orange-600'
              : 'bg-orange-400 text-white'
          }`}
        >
          🚗 Ma tournée
        </button>
      </div>

      {/* Error toast */}
      {error && (
        <div className="mx-4 mt-4 bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-xl flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 font-bold">✕</button>
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-4">
        {view === 'available' && (
          <div className="space-y-4">
            
            {/* Tournées suggérées */}
            {suggestedRounds.length > 0 && showSuggestions && (
              <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-4 text-white relative">
                <button
                  onClick={() => setShowSuggestions(false)}
                  className="absolute top-2 right-2 text-white/70 hover:text-white w-8 h-8 flex items-center justify-center"
                >
                  ✕
                </button>
                
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                  🚀 Tournées suggérées
                </h3>
                
                {suggestedRounds.map((suggestion) => {
                  const state = getSuggestionState(suggestion)
                  
                  return (
                    <div 
                      key={suggestion.id} 
                      className={`rounded-xl p-3 mb-3 ${
                        state.canTake ? 'bg-white/20' : 'bg-white/10'
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">
                            {suggestion.orders.length} livraisons groupées
                          </span>
                          {state.badge && (
                            <span className={`text-xs px-2 py-0.5 rounded ${state.badge.class}`}>
                              {state.badge.text}
                            </span>
                          )}
                        </div>
                        <span className="text-sm bg-white/30 px-2 py-0.5 rounded">
                          ~{suggestion.total_distance_minutes} min trajet
                        </span>
                      </div>
                      
                      {/* Orders list */}
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
                      
                      {/* Timing info */}
                      <div className="flex items-center justify-between text-sm mb-3 text-white/80">
                        <span>⏰ Préparer: {formatTime(suggestion.prep_at)}</span>
                        <span>🚗 Départ: {formatTime(suggestion.depart_at)}</span>
                      </div>
                      
                      {/* Action button */}
                      <button
                        onClick={() => state.canTake && takeSuggestedRound(suggestion)}
                        disabled={!state.canTake || loading}
                        className={`w-full py-3 rounded-xl disabled:opacity-50 ${state.buttonClass}`}
                      >
                        {state.buttonText}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Collapsed suggestions indicator */}
            {suggestedRounds.length > 0 && !showSuggestions && (
              <button
                onClick={() => setShowSuggestions(true)}
                className="w-full bg-green-100 text-green-700 p-3 rounded-xl flex items-center justify-center gap-2"
              >
                🚀 {suggestedRounds.length} tournée(s) suggérée(s) disponible(s)
              </button>
            )}

            {/* Empty state */}
            {availableOrders.length === 0 && suggestedRounds.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center">
                <span className="text-5xl block mb-4">📭</span>
                <p className="text-gray-500">Aucune livraison disponible</p>
                <p className="text-gray-400 text-sm mt-2">
                  Les prochaines livraisons apparaîtront ici
                </p>
              </div>
            ) : availableOrders.length > 0 && (
              <>
                {/* Individual orders */}
                <h3 className="font-medium text-gray-600 mb-2">
                  Livraisons individuelles
                </h3>
                {availableOrders.map(order => (
                  <div 
                    key={order.id} 
                    className={`bg-white rounded-2xl p-4 shadow-sm ${
                      order.status !== 'ready' ? 'opacity-70' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold">#{order.order_number}</span>
                          {order.status === 'ready' && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              ✓ Prêt
                            </span>
                          )}
                          {order.status === 'preparing' && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                              🍳 En prépa
                            </span>
                          )}
                          {order.status === 'pending' && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              ⏳ En attente
                            </span>
                          )}
                        </div>
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
                          disabled={loading || myRound.total_stops >= MAX_DELIVERIES_PER_ROUND || order.status !== 'ready'}
                          className="flex-1 bg-blue-500 text-white font-medium py-3 rounded-xl disabled:opacity-50"
                        >
                          {order.status !== 'ready' ? '👨‍🍳 En préparation...' : '➕ Ajouter à ma tournée'}
                        </button>
                      ) : (
                        <button
                          onClick={() => takeOrder(order.id)}
                          disabled={loading || order.status !== 'ready'}
                          className={`flex-1 font-medium py-3 rounded-xl disabled:opacity-50 ${
                            order.status === 'ready' 
                              ? 'bg-orange-500 text-white' 
                              : 'bg-gray-300 text-gray-600'
                          }`}
                        >
                          {order.status === 'ready' 
                            ? '🚗 Prendre cette livraison' 
                            : order.status === 'preparing' 
                              ? '👨‍🍳 En préparation...' 
                              : '⏳ En attente...'}
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
            {/* Round status */}
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
                  
                  {/* Release button for grouped rounds */}
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

            {/* Stops list */}
            {myRound.stops.map((stop, index) => {
              const isCurrentStop = index === currentStop && myRound.status === 'in_progress'
              const isCompleted = stop.status === 'delivered'
              const order = stop.order as any
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

                      {/* Release individual order - only if single order round */}
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
