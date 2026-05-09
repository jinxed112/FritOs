'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentEstablishment } from '@/lib/establishment/client'

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
  estimated_travel_minutes: number
}

type Cluster = {
  orders: DeliveryOrder[]
  centroid: { lat: number, lng: number }
  totalTravelTime: number
  suggestedDeparture: string
  suggestedKitchenLaunch: string
  currentPrepTime: number
}

type Driver = {
  id: string
  name: string
  status: string
}

type DeliveryRound = {
  id: string
  driver_id: string | null
  status: string
  total_stops: number
  planned_departure: string | null
  driver?: Driver
  stops?: {
    id: string
    stop_order: number
    address: string
    status: string
    order: {
      order_number: string
      customer_name: string
    }
  }[]
}

export default function DeliveriesPage() {
  const [pendingOrders, setPendingOrders] = useState<DeliveryOrder[]>([])
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [rounds, setRounds] = useState<DeliveryRound[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [selectedDriver, setSelectedDriver] = useState<string>('')

  const supabase = createClient()
  const { establishment } = useCurrentEstablishment()
  const establishmentId = establishment?.id

  useEffect(() => {
    if (!establishmentId) return
    loadData()

    // Refresh toutes les 30 secondes
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [establishmentId])

  async function loadData() {
    if (!establishmentId) return
    setLoading(true)

    // Charger les suggestions de clustering
    try {
      const clusterResponse = await fetch(`/api/delivery/cluster?establishmentId=${establishmentId}`)
      const clusterData = await clusterResponse.json()
      
      if (clusterData.success) {
        setClusters(clusterData.clusters || [])
        
        // Extraire toutes les commandes des clusters
        const allOrders: DeliveryOrder[] = []
        clusterData.clusters?.forEach((c: Cluster) => {
          c.orders.forEach(o => {
            if (!allOrders.find(x => x.id === o.id)) {
              allOrders.push(o)
            }
          })
        })
        setPendingOrders(allOrders)
      }
    } catch (error) {
      console.error('Error loading clusters:', error)
    }

    // Charger les tournées en cours
    const { data: roundsData } = await supabase
      .from('delivery_rounds')
      .select(`
        id, driver_id, status, total_stops, planned_departure,
        driver:drivers (id, name, status),
        delivery_round_stops (
          id, stop_order, address, status,
          order:orders (order_number, customer_name)
        )
      `)
      .eq('establishment_id', establishmentId)
      .in('status', ['pending', 'ready', 'in_progress'])
      .order('created_at', { ascending: false })

    setRounds((roundsData || []).map((r: any) => ({
      ...r,
      driver: r.driver,
      stops: (r.delivery_round_stops || []).sort((a: any, b: any) => a.stop_order - b.stop_order)
    })))

    // Charger les livreurs disponibles
    const { data: driversData } = await supabase
      .from('drivers')
      .select('id, name, status')
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .in('status', ['available', 'offline'])
      .order('name')

    setDrivers(driversData || [])

    setLoading(false)
  }

  function toggleOrderSelection(orderId: string) {
    const newSelected = new Set(selectedOrders)
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId)
    } else {
      newSelected.add(orderId)
    }
    setSelectedOrders(newSelected)
  }

  function selectCluster(cluster: Cluster) {
    const newSelected = new Set<string>()
    cluster.orders.forEach(o => newSelected.add(o.id))
    setSelectedOrders(newSelected)
  }

  async function createRound() {
    if (selectedOrders.size === 0) {
      alert('Sélectionnez au moins une commande')
      return
    }
    if (!establishmentId) {
      alert('Aucun établissement sélectionné')
      return
    }

    try {
      const response = await fetch('/api/delivery/cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          establishmentId,
          driverId: selectedDriver || null,
          orderIds: Array.from(selectedOrders),
        }),
      })

      const data = await response.json()
      
      if (data.success) {
        alert(`Tournée créée avec ${data.round.totalStops} stop(s)`)
        setSelectedOrders(new Set())
        setSelectedDriver('')
        loadData()
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      alert('Erreur: ' + error.message)
    }
  }

  async function assignDriver(roundId: string, driverId: string) {
    const { error } = await supabase
      .from('delivery_rounds')
      .update({ 
        driver_id: driverId,
        status: 'ready',
      })
      .eq('id', roundId)

    if (!error) loadData()
  }

  async function cancelRound(roundId: string) {
    if (!confirm('Annuler cette tournée ?')) return

    // Délier les commandes
    await supabase
      .from('orders')
      .update({ delivery_round_id: null })
      .eq('delivery_round_id', roundId)

    // Supprimer les stops
    await supabase
      .from('delivery_round_stops')
      .delete()
      .eq('round_id', roundId)

    // Supprimer la tournée
    await supabase
      .from('delivery_rounds')
      .delete()
      .eq('id', roundId)

    loadData()
  }

  function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('fr-BE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function formatSlot(start: string, end: string): string {
    return `${formatTime(start)} - ${formatTime(end)}`
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Livraisons</h1>
          <p className="text-gray-500">
            {pendingOrders.length} commande(s) en attente • {rounds.length} tournée(s) en cours
          </p>
        </div>
        <button
          onClick={loadData}
          className="bg-gray-100 text-gray-700 font-semibold px-4 py-2 rounded-xl hover:bg-gray-200"
        >
          🔄 Actualiser
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Colonne gauche: Commandes à dispatcher */}
        <div className="space-y-6">
          {/* Suggestions de regroupement */}
          {clusters.length > 0 && (
            <div className="bg-blue-50 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-blue-800 mb-4">🧠 Suggestions de regroupement</h2>
              <div className="space-y-3">
                {clusters.map((cluster, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => selectCluster(cluster)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold">
                        {cluster.orders.length} commande{cluster.orders.length > 1 ? 's' : ''}
                      </span>
                      <span className="text-sm text-blue-600">
                        ~{cluster.totalTravelTime} min total
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {cluster.orders.map(o => `#${o.order_number}`).join(', ')}
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      Départ suggéré: {formatTime(cluster.suggestedDeparture)} • 
                      Cuisine: {formatTime(cluster.suggestedKitchenLaunch)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Commandes en attente */}
          <div className="bg-white rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">📦 Commandes à livrer</h2>
              <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-sm">
                {selectedOrders.size} sélectionnée(s)
              </span>
            </div>

            {loading ? (
              <p className="text-gray-400 text-center py-8">Chargement...</p>
            ) : pendingOrders.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Aucune commande en attente</p>
            ) : (
              <div className="space-y-3">
                {pendingOrders.map(order => (
                  <div
                    key={order.id}
                    onClick={() => toggleOrderSelection(order.id)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedOrders.has(order.id)
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 ${
                        selectedOrders.has(order.id)
                          ? 'border-orange-500 bg-orange-500'
                          : 'border-gray-300'
                      }`}>
                        {selectedOrders.has(order.id) && (
                          <span className="text-white text-sm">✓</span>
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold">#{order.order_number}</span>
                          <span className="text-sm text-gray-500">
                            ~{order.estimated_travel_minutes} min
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{order.delivery_address}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Créneau: {formatSlot(order.scheduled_slot_start, order.scheduled_slot_end)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            {selectedOrders.size > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-sm text-gray-600">Assigner à :</span>
                  <select
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-gray-200"
                  >
                    <option value="">Sans livreur (dispatch manuel)</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.status === 'available' ? '🟢' : '⚪'}
                      </option>
                    ))}
                  </select>
                </div>
                
                <button
                  onClick={createRound}
                  className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600"
                >
                  🚗 Créer la tournée ({selectedOrders.size} stop{selectedOrders.size > 1 ? 's' : ''})
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Colonne droite: Tournées en cours */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">🛵 Tournées en cours</h2>

            {rounds.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Aucune tournée en cours</p>
            ) : (
              <div className="space-y-4">
                {rounds.map(round => (
                  <div
                    key={round.id}
                    className={`border-2 rounded-xl p-4 ${
                      round.status === 'in_progress' ? 'border-green-300 bg-green-50' :
                      round.status === 'ready' ? 'border-blue-300 bg-blue-50' :
                      'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-sm font-medium ${
                          round.status === 'in_progress' ? 'bg-green-200 text-green-700' :
                          round.status === 'ready' ? 'bg-blue-200 text-blue-700' :
                          'bg-gray-200 text-gray-700'
                        }`}>
                          {round.status === 'in_progress' ? '🚗 En cours' :
                           round.status === 'ready' ? '✅ Prête' : '⏳ En attente'}
                        </span>
                        <span className="text-gray-500 text-sm">
                          {round.total_stops} stop{round.total_stops > 1 ? 's' : ''}
                        </span>
                      </div>
                      
                      <button
                        onClick={() => cancelRound(round.id)}
                        className="text-gray-400 hover:text-red-500 text-sm"
                      >
                        ❌ Annuler
                      </button>
                    </div>

                    {/* Livreur */}
                    {round.driver ? (
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">🛵</span>
                        <span className="font-medium">{round.driver.name}</span>
                      </div>
                    ) : (
                      <div className="mb-3">
                        <select
                          onChange={(e) => e.target.value && assignDriver(round.id, e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                          defaultValue=""
                        >
                          <option value="">Assigner un livreur...</option>
                          {drivers.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.name} {d.status === 'available' ? '🟢' : '⚪'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Stops */}
                    <div className="space-y-2">
                      {round.stops?.map((stop: any) => (
                        <div
                          key={stop.id}
                          className={`flex items-center gap-3 p-2 rounded-lg ${
                            stop.status === 'delivered' ? 'bg-green-100' :
                            stop.status === 'in_transit' ? 'bg-yellow-100' :
                            'bg-gray-50'
                          }`}
                        >
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            stop.status === 'delivered' ? 'bg-green-500 text-white' :
                            stop.status === 'in_transit' ? 'bg-yellow-500 text-white' :
                            'bg-gray-300 text-gray-600'
                          }`}>
                            {stop.status === 'delivered' ? '✓' : stop.stop_order}
                          </span>
                          <div className="flex-1 text-sm">
                            <span className="font-medium">#{stop.order?.order_number}</span>
                            <span className="text-gray-500 ml-2">{stop.order?.customer_name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats livreurs */}
          <div className="bg-white rounded-2xl p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">👥 Livreurs disponibles</h2>
            
            {drivers.length === 0 ? (
              <p className="text-gray-400 text-center py-4">Aucun livreur disponible</p>
            ) : (
              <div className="space-y-2">
                {drivers.map(driver => (
                  <div key={driver.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🛵</span>
                      <span className="font-medium">{driver.name}</span>
                    </div>
                    <span className={`px-2 py-1 rounded text-sm ${
                      driver.status === 'available' 
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {driver.status === 'available' ? '🟢 Disponible' : '⚪ Hors ligne'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
