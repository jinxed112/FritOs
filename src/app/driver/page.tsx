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
  scheduled_slot_start: string
  scheduled_slot_end: string
  delivery_address: string
  delivery_lat: number | null
  delivery_lng: number | null
  order_items: {
    id: string
    product_name: string
    quantity: number
    options_selected: string | null
  }[]
  round_stop?: {
    stop_order: number
    status: string
  }
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
    order: DeliveryOrder
  }[]
}

type Driver = {
  id: string
  name: string
  phone: string
  status: string
}

export default function DriverPage() {
  const [pin, setPin] = useState('')
  const [driver, setDriver] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Données
  const [availableOrders, setAvailableOrders] = useState<DeliveryOrder[]>([])
  const [myRound, setMyRound] = useState<DeliveryRound | null>(null)
  const [currentStop, setCurrentStop] = useState<number>(0)
  
  // UI
  const [view, setView] = useState<'available' | 'round' | 'navigation'>('available')
  
  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

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
          order:orders (
            id, order_number, status, total_amount,
            customer_name, customer_phone,
            scheduled_slot_start, scheduled_slot_end,
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

    // Charger les commandes disponibles (non assignées)
    const { data: ordersData } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, total_amount,
        customer_name, customer_phone,
        scheduled_slot_start, scheduled_slot_end,
        order_items (id, product_name, quantity, options_selected),
        reserved_slots!inner (
          delivery_address, delivery_lat, delivery_lng
        )
      `)
      .eq('establishment_id', establishmentId)
      .eq('order_type', 'delivery')
      .in('status', ['ready'])
      .is('delivery_round_id', null)
      .order('scheduled_slot_start')

    const orders: DeliveryOrder[] = (ordersData || []).map((o: any) => ({
      ...o,
      delivery_address: o.reserved_slots?.[0]?.delivery_address,
      delivery_lat: o.reserved_slots?.[0]?.delivery_lat,
      delivery_lng: o.reserved_slots?.[0]?.delivery_lng,
    }))

    setAvailableOrders(orders)
  }

  async function takeOrder(orderId: string) {
    if (!driver) return

    // Créer une tournée avec cette commande
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
        customer_slot_start: order.scheduled_slot_start,
        customer_slot_end: order.scheduled_slot_end,
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
        customer_slot_start: order.scheduled_slot_start,
        customer_slot_end: order.scheduled_slot_end,
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
        .update({ status: 'completed', completed_at: new Date().toISOString() })
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

  function openNavigation(address: string, lat?: number | null, lng?: number | null) {
    let url: string
    
    if (lat && lng) {
      // Coordonnées précises
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    } else {
      // Adresse texte
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

  // Écran de login
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

  // Application principale
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-orange-500 text-white p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛵</span>
            <div>
              <h1 className="font-bold">{driver.name}</h1>
              <p className="text-orange-100 text-sm">
                {myRound ? `Tournée en cours (${myRound.total_stops} stops)` : 'Disponible'}
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
            {availableOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center">
                <span className="text-5xl block mb-4">📭</span>
                <p className="text-gray-500">Aucune livraison disponible</p>
              </div>
            ) : (
              availableOrders.map(order => (
                <div key={order.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-xl font-bold">#{order.order_number}</span>
                      <p className="text-gray-500 text-sm">
                        {order.scheduled_slot_start && formatTime(order.scheduled_slot_start)} - {order.scheduled_slot_end && formatTime(order.scheduled_slot_end)}
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
                        disabled={loading}
                        className="flex-1 bg-blue-500 text-white font-medium py-3 rounded-xl"
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
              ))
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
                          {stop.customer_slot_start && formatTime(stop.customer_slot_start)}
                        </span>
                      </div>

                      <p className="text-gray-600 mt-1">{stop.address}</p>

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
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('fr-BE', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
