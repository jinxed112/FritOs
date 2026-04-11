'use client'

import { useState, useEffect, useRef } from 'react'
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
  delivery_notes: string | null
  payment_method: string | null
  payment_status: string | null
  delivery_fee: number | null
  order_items: {
    id: string
    product_name: string
    quantity: number
    options_selected: string | null
  }[]
}

type DeliveryRoundStop = {
  id: string
  stop_order: number
  order_id: string
  address: string
  status: string
  estimated_arrival: string | null
  latitude: number | null
  longitude: number | null
  customer_slot_start: string | null
  delivered_lat: number | null
  delivered_lng: number | null
  delivered_distance_m: number | null
  order: DeliveryOrder
}

type DeliveryRound = {
  id: string
  status: string
  planned_departure: string | null
  total_stops: number
  actual_distance_km: number | null
  stops: DeliveryRoundStop[]
}

type Driver = {
  id: string
  name: string
  phone: string
  status: string
}

type GeoPosition = {
  lat: number
  lng: number
  accuracy: number
  speed: number | null
  heading: number | null
  timestamp: number
}

// ==================== CONFIG ====================

const ESTABLISHMENT_ID = 'a0000000-0000-0000-0000-000000000001'
const MAX_DELIVERIES = 3
const AUTO_CLOSE_DISTANCE_M = 80  // mètres pour proposer auto-clôture
const GPS_INTERVAL_MS = 10000      // envoyer position toutes les 10s
const DATA_REFRESH_MS = 15000      // refresh data toutes les 15s

// ==================== HELPERS ====================

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '--:--'
  return new Date(dateStr).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  const time = formatTime(dateStr)
  if (d.toDateString() === now.toDateString()) return `Aujourd'hui ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `Demain ${time}`
  return d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' }) + ` ${time}`
}

function timeUntil(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Math.floor((new Date(dateStr).getTime() - Date.now()) / 60000)
  if (diff < 0) return 'En retard'
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff / 60)}h${diff % 60 > 0 ? String(diff % 60).padStart(2, '0') : ''}`
}

function parseOptions(raw: string | null): string[] {
  if (!raw) return []
  try {
    let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    if (Array.isArray(parsed)) return parsed.map((o: any) => o.item_name || o.name || String(o)).filter(Boolean)
  } catch { }
  return []
}

// ==================== COMPONENT ====================

export default function DriverPage() {
  // Auth
  const [pin, setPin] = useState('')
  const [driver, setDriver] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Data
  const [availableOrders, setAvailableOrders] = useState<DeliveryOrder[]>([])
  const [myRound, setMyRound] = useState<DeliveryRound | null>(null)
  const [currentStopIdx, setCurrentStopIdx] = useState(0)

  // GPS
  const [position, setPosition] = useState<GeoPosition | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'off' | 'acquiring' | 'active' | 'error'>('off')
  const [sessionKm, setSessionKm] = useState(0)
  const [autoCloseCandidate, setAutoCloseCandidate] = useState<string | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastLoggedPosRef = useRef<{ lat: number; lng: number; time: number } | null>(null)

  // UI
  const [view, setView] = useState<'orders' | 'round' | 'stats'>('orders')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())

  const supabase = createClient()

  // ==================== CLOCK ====================
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  // ==================== AUTO-LOGIN ====================
  useEffect(() => {
    const id = localStorage.getItem('driver_id')
    if (id) loadDriver(id)
  }, [])

  // ==================== DATA REFRESH ====================
  useEffect(() => {
    if (!driver) return
    loadData()
    const iv = setInterval(loadData, DATA_REFRESH_MS)

    // Realtime subscription pour les nouvelles commandes
    const channel = supabase
      .channel('driver-orders')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `establishment_id=eq.${ESTABLISHMENT_ID}`,
      }, () => { loadData() })
      .subscribe()

    return () => { clearInterval(iv); supabase.removeChannel(channel) }
  }, [driver])

  // ==================== GPS TRACKING ====================
  useEffect(() => {
    if (!driver || driver.status === 'offline') return
    startGPS()
    return () => stopGPS()
  }, [driver])

  // Auto-close check: quand position change ET tournée en cours
  useEffect(() => {
    if (!position || !myRound || myRound.status !== 'in_progress') {
      setAutoCloseCandidate(null)
      return
    }

    const currentStop = myRound.stops[currentStopIdx]
    if (!currentStop || currentStop.status === 'delivered') return
    if (!currentStop.latitude || !currentStop.longitude) return

    const dist = haversineM(position.lat, position.lng, Number(currentStop.latitude), Number(currentStop.longitude))

    if (dist < AUTO_CLOSE_DISTANCE_M) {
      setAutoCloseCandidate(currentStop.id)
    } else {
      setAutoCloseCandidate(null)
    }
  }, [position, myRound, currentStopIdx])

  function startGPS() {
    if (!navigator.geolocation) {
      setGpsStatus('error')
      return
    }
    setGpsStatus('acquiring')

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const geo: GeoPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
        }
        setPosition(geo)
        setGpsStatus('active')
        logPosition(geo)
      },
      (err) => {
        console.error('GPS error:', err)
        setGpsStatus('error')
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )
  }

  function stopGPS() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setGpsStatus('off')
  }

  async function logPosition(geo: GeoPosition) {
    if (!driver) return
    const last = lastLoggedPosRef.current

    // Ne logger que si assez de temps écoulé ou distance parcourue
    if (last) {
      const timeDiff = geo.timestamp - last.time
      const dist = haversineM(last.lat, last.lng, geo.lat, geo.lng)
      if (timeDiff < GPS_INTERVAL_MS && dist < 20) return // skip si < 10s ET < 20m

      // Ajouter au compteur km session
      if (dist > 5 && dist < 5000) { // filtrer les sauts GPS aberrants
        setSessionKm(prev => prev + dist / 1000)
      }
    }

    lastLoggedPosRef.current = { lat: geo.lat, lng: geo.lng, time: geo.timestamp }

    // Update position du livreur en DB
    await supabase.from('drivers').update({
      last_lat: geo.lat,
      last_lng: geo.lng,
      last_seen_at: new Date().toISOString(),
    }).eq('id', driver.id)

    // Logger le point GPS (si tournée en cours, inclure round_id)
    await supabase.from('driver_location_logs').insert({
      driver_id: driver.id,
      round_id: myRound?.status === 'in_progress' ? myRound.id : null,
      latitude: geo.lat,
      longitude: geo.lng,
      accuracy: geo.accuracy,
      speed: geo.speed,
      heading: geo.heading,
    })
  }

  // ==================== AUTH ====================

  async function loginWithPin() {
    if (pin.length !== 6) { setError('Code PIN à 6 chiffres'); return }
    setLoading(true); setError('')

    const { data, error: e } = await supabase.from('drivers')
      .select('id, name, phone, status')
      .eq('establishment_id', ESTABLISHMENT_ID)
      .eq('pin_code', pin).eq('is_active', true).single()

    if (e || !data) { setError('Code PIN invalide'); setLoading(false); return }

    setDriver(data)
    localStorage.setItem('driver_id', data.id)
    await supabase.from('drivers').update({
      status: 'available',
      session_started_at: new Date().toISOString(),
      session_km_today: 0,
    }).eq('id', data.id)
    setSessionKm(0)
    setLoading(false)
  }

  async function loadDriver(id: string) {
    const { data } = await supabase.from('drivers')
      .select('id, name, phone, status').eq('id', id).single()
    if (data) {
      setDriver(data)
      // Restaurer km de la session
      const { data: driverData } = await supabase.from('drivers')
        .select('session_km_today').eq('id', id).single()
      if (driverData?.session_km_today) setSessionKm(Number(driverData.session_km_today))
    }
    else localStorage.removeItem('driver_id')
  }

  async function logout() {
    if (driver) {
      stopGPS()
      await supabase.from('drivers').update({
        status: 'offline',
        session_km_today: sessionKm,
      }).eq('id', driver.id)
    }
    setDriver(null)
    localStorage.removeItem('driver_id')
    setPin('')
    setMyRound(null)
    setAvailableOrders([])
  }

  // ==================== DATA LOADING ====================

  async function loadData() {
    if (!driver) return

    // 1. Ma tournée en cours
    const { data: roundData } = await supabase
      .from('delivery_rounds')
      .select(`
        id, status, planned_departure, total_stops, actual_distance_km,
        delivery_round_stops (
          id, stop_order, order_id, address, status, estimated_arrival,
          latitude, longitude, customer_slot_start, delivered_lat, delivered_lng,
          order:orders (
            id, order_number, status, total, total_amount,
            customer_name, customer_phone, scheduled_time, 
            delivery_notes, metadata,
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
        .map((s: any) => ({ ...s, order: s.order }))
      setMyRound({ ...roundData, stops })
      setView('round')
      const next = stops.findIndex((s: any) => s.status !== 'delivered')
      setCurrentStopIdx(next >= 0 ? next : stops.length - 1)
    } else {
      setMyRound(null)
      if (view === 'round') setView('orders')
    }

    // 2. Commandes livrables
    const { data: ordersData } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, total, total_amount,
        customer_name, customer_phone,
        scheduled_time, scheduled_slot_start,
        delivery_notes, delivery_fee, payment_method, payment_status, metadata,
        order_items (id, product_name, quantity, options_selected)
      `)
      .eq('establishment_id', ESTABLISHMENT_ID)
      .eq('order_type', 'delivery')
      .in('status', ['ready', 'preparing', 'pending'])
      .is('delivery_round_id', null)
      .order('scheduled_slot_start', { ascending: true, nullsFirst: false })

    const nowMs = Date.now()
    const maxMs = nowMs + 24 * 3600000

    const orders: DeliveryOrder[] = (ordersData || [])
      .filter((o: any) => {
        const slot = o.scheduled_slot_start || o.scheduled_time
        if (!slot) return true
        const slotMs = new Date(slot).getTime()
        return slotMs >= nowMs - 3600000 && slotMs <= maxMs
      })
      .map((o: any) => {
        const meta = typeof o.metadata === 'string' ? JSON.parse(o.metadata) : (o.metadata || {})
        return {
          ...o,
          total_amount: o.total_amount || o.total || 0,
          scheduled_time: o.scheduled_slot_start || o.scheduled_time || o.created_at,
          delivery_address: meta.delivery_address || o.delivery_notes || 'Adresse non spécifiée',
          delivery_lat: meta.delivery_lat || null,
          delivery_lng: meta.delivery_lng || null,
        }
      })

    setAvailableOrders(orders)
  }

  // ==================== ACTIONS ====================

  async function takeOrder(orderId: string) {
    if (!driver) return
    setLoading(true)
    try {
      const order = availableOrders.find(o => o.id === orderId)
      if (!order) throw new Error('Commande non trouvée')

      const { data: round, error: e } = await supabase.from('delivery_rounds').insert({
        establishment_id: ESTABLISHMENT_ID,
        driver_id: driver.id,
        status: 'ready',
        total_stops: 1,
      }).select().single()
      if (e) throw e

      await supabase.from('delivery_round_stops').insert({
        round_id: round.id,
        order_id: orderId,
        stop_order: 1,
        address: order.delivery_address,
        latitude: order.delivery_lat,
        longitude: order.delivery_lng,
        status: 'pending',
        customer_slot_start: order.scheduled_time,
      })

      await supabase.from('orders').update({ delivery_round_id: round.id }).eq('id', orderId)
      await supabase.from('drivers').update({ status: 'delivering' }).eq('id', driver.id)
      await loadData()
    } catch (e) {
      console.error(e); setError('Erreur prise de commande')
    }
    setLoading(false)
  }

  async function addToRound(orderId: string) {
    if (!driver || !myRound || myRound.total_stops >= MAX_DELIVERIES) return
    setLoading(true)
    try {
      const order = availableOrders.find(o => o.id === orderId)
      if (!order) throw new Error('Not found')
      const newStop = myRound.total_stops + 1
      await supabase.from('delivery_round_stops').insert({
        round_id: myRound.id, order_id: orderId, stop_order: newStop,
        address: order.delivery_address, latitude: order.delivery_lat,
        longitude: order.delivery_lng, status: 'pending',
        customer_slot_start: order.scheduled_time,
      })
      await supabase.from('delivery_rounds').update({ total_stops: newStop }).eq('id', myRound.id)
      await supabase.from('orders').update({ delivery_round_id: myRound.id }).eq('id', orderId)
      await loadData()
    } catch (e) { console.error(e); setError('Erreur ajout') }
    setLoading(false)
  }

  async function startDelivery() {
    if (!myRound) return
    setLoading(true)
    await supabase.from('delivery_rounds').update({
      status: 'in_progress',
      actual_departure: new Date().toISOString(),
    }).eq('id', myRound.id)
    await supabase.from('drivers').update({ status: 'delivering' }).eq('id', driver!.id)
    await loadData()
    setLoading(false)
  }

  async function markDelivered(stopId: string) {
    if (!myRound) return
    setLoading(true)

    const updateData: any = {
      status: 'delivered',
      actual_arrival: new Date().toISOString(),
    }
    // Ajouter preuve GPS si disponible
    if (position) {
      updateData.delivered_lat = position.lat
      updateData.delivered_lng = position.lng
      // Calculer distance au point client
      const stop = myRound.stops.find(s => s.id === stopId)
      if (stop?.latitude && stop?.longitude) {
        updateData.delivered_distance_m = Math.round(
          haversineM(position.lat, position.lng, Number(stop.latitude), Number(stop.longitude))
        )
      }
    }

    await supabase.from('delivery_round_stops').update(updateData).eq('id', stopId)

    // Vérifier si dernier stop
    const stop = myRound.stops.find(s => s.id === stopId)
    const otherPending = myRound.stops.filter(s => s.id !== stopId && s.status !== 'delivered')

    if (otherPending.length === 0) {
      // Tournée terminée
      await supabase.from('delivery_rounds').update({
        status: 'completed',
        actual_return: new Date().toISOString(),
        actual_distance_km: sessionKm > 0 ? sessionKm : null,
      }).eq('id', myRound.id)
      await supabase.from('drivers').update({
        status: 'available',
        session_km_today: sessionKm,
      }).eq('id', driver!.id)

      // Compléter les commandes livrées
      for (const s of myRound.stops) {
        await supabase.from('orders').update({
          status: 'completed',
          completed_at: new Date().toISOString()
        }).eq('id', s.order_id)
      }
    } else {
      // Compléter cette commande
      if (stop) {
        await supabase.from('orders').update({
          status: 'completed',
          completed_at: new Date().toISOString()
        }).eq('id', stop.order_id)
      }
    }

    setAutoCloseCandidate(null)
    await loadData()
    setLoading(false)
  }

  async function releaseOrder(stopId: string, orderId: string) {
    if (!myRound) return
    setLoading(true)
    try {
      await supabase.from('delivery_round_stops').delete().eq('id', stopId)
      await supabase.from('orders').update({ delivery_round_id: null, suggested_round_id: null }).eq('id', orderId)
      const newTotal = myRound.total_stops - 1
      if (newTotal === 0) {
        await supabase.from('delivery_rounds').delete().eq('id', myRound.id)
        await supabase.from('drivers').update({ status: 'available' }).eq('id', driver!.id)
      } else {
        await supabase.from('delivery_rounds').update({ total_stops: newTotal }).eq('id', myRound.id)
      }
      await loadData()
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  function openNavigation(address: string, lat?: number | null, lng?: number | null) {
    // Essayer d'abord l'intent natif qui ouvre Waze/Google Maps/Apple Maps
    const dest = lat && lng ? `${lat},${lng}` : encodeURIComponent(address)

    // Détection iOS vs Android
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

    if (isIOS) {
      // Apple Maps en natif, ou Google Maps si installé
      window.location.href = `maps://maps.apple.com/?daddr=${dest}&dirflg=d`
    } else {
      // Android: intent Google Maps natif
      if (lat && lng) {
        window.location.href = `google.navigation:q=${lat},${lng}&mode=d`
      } else {
        window.location.href = `google.navigation:q=${encodeURIComponent(address)}&mode=d`
      }
    }

    // Fallback: si l'intent ne marche pas après 500ms, ouvrir dans le navigateur
    setTimeout(() => {
      const url = lat && lng
        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`
      window.open(url, '_blank')
    }, 500)
  }

  function callCustomer(phone: string) {
    window.location.href = `tel:${phone}`
  }

  function smsCustomer(phone: string, orderNumber: string) {
    const msg = encodeURIComponent(`Bonjour, c'est votre livreur MDjambo. Je suis en route avec votre commande #${orderNumber}. À tout de suite !`)
    window.location.href = `sms:${phone}?body=${msg}`
  }

  // ==================== RENDER: LOGIN ====================

  if (!driver) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-500 to-orange-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🛵</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">MDjambo Livreur</h1>
            <p className="text-gray-500 mt-1">Entrez votre code PIN</p>
          </div>

          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && loginWithPin()}
            className="w-full text-center text-3xl tracking-[0.5em] font-mono py-4 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none"
            placeholder="••••••"
            autoFocus
          />

          {error && <p className="text-red-500 text-center mt-4 text-sm">{error}</p>}

          <button
            onClick={loginWithPin}
            disabled={loading || pin.length !== 6}
            className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl mt-6 disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </div>
      </div>
    )
  }

  // ==================== RENDER: MAIN ====================

  const currentStop = myRound?.stops[currentStopIdx]
  const stopsDelivered = myRound?.stops.filter(s => s.status === 'delivered').length || 0
  const isDelivering = myRound?.status === 'in_progress'

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ===== HEADER ===== */}
      <div className="bg-gray-900 text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="text-2xl">🛵</span>
              {/* GPS indicator */}
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${gpsStatus === 'active' ? 'bg-green-400' :
                  gpsStatus === 'acquiring' ? 'bg-yellow-400 animate-pulse' :
                    gpsStatus === 'error' ? 'bg-red-400' : 'bg-gray-500'
                }`} />
            </div>
            <div>
              <p className="font-semibold">{driver.name}</p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{sessionKm.toFixed(1)} km</span>
                <span>•</span>
                <span>{now.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>
          <button onClick={logout} className="text-gray-400 hover:text-white px-3 py-2 text-sm">
            Fin de service
          </button>
        </div>
      </div>

      {/* ===== TABS ===== */}
      <div className="flex bg-gray-900 px-2 pb-2 gap-1">
        {[
          { key: 'orders' as const, label: 'Livraisons', count: availableOrders.length },
          { key: 'round' as const, label: 'Ma tournée', count: myRound ? myRound.total_stops : 0 },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${view === tab.key
                ? 'bg-orange-500 text-white'
                : 'bg-gray-800 text-gray-400'
              }`}
          >
            {tab.label} {tab.count > 0 && `(${tab.count})`}
          </button>
        ))}
      </div>

      {/* ===== ERROR ===== */}
      {error && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex justify-between items-center text-sm">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-bold ml-2">✕</button>
        </div>
      )}

      {/* ===== AUTO-CLOSE BANNER ===== */}
      {autoCloseCandidate && currentStop && (
        <div className="mx-4 mt-3 bg-green-500 text-white px-4 py-4 rounded-xl animate-pulse">
          <p className="font-bold text-center mb-2">Vous êtes arrivé chez {currentStop.order?.customer_name || 'le client'} !</p>
          <button
            onClick={() => markDelivered(autoCloseCandidate)}
            disabled={loading}
            className="w-full bg-white text-green-600 font-bold py-3 rounded-xl active:scale-[0.98] transition-transform"
          >
            Confirmer la livraison
          </button>
        </div>
      )}

      {/* ===== CONTENT ===== */}
      <div className="p-4 space-y-3">

        {/* ── ORDERS VIEW ── */}
        {view === 'orders' && (
          <>
            {availableOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center">
                <span className="text-5xl block mb-3">📭</span>
                <p className="text-gray-500 font-medium">Aucune livraison en attente</p>
                <p className="text-gray-400 text-sm mt-1">Les nouvelles commandes apparaîtront automatiquement</p>
              </div>
            ) : (
              availableOrders.map(order => {
                const isExpanded = expandedOrder === order.id
                const isReady = order.status === 'ready'
                const timeLeft = timeUntil(order.scheduled_time)
                const isLate = timeLeft === 'En retard'

                return (
                  <div key={order.id} className={`bg-white rounded-2xl overflow-hidden shadow-sm border-l-4 ${isReady ? 'border-green-500' : order.status === 'preparing' ? 'border-orange-400' : 'border-gray-300'
                    }`}>
                    {/* Order header - clickable */}
                    <button
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      className="w-full p-4 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-gray-900">#{order.order_number}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isReady ? 'bg-green-100 text-green-700' :
                              order.status === 'preparing' ? 'bg-orange-100 text-orange-700' :
                                'bg-gray-100 text-gray-600'
                            }`}>
                            {isReady ? 'Prêt' : order.status === 'preparing' ? 'En prépa' : 'En attente'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-orange-500">{order.total_amount.toFixed(2)}€</span>
                          {order.payment_status !== 'paid' ? (
                            <p className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold mt-1">À encaisser</p>
                          ) : (
                            <p className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium mt-1">Payé en ligne</p>
                          )}
                          <p className={`text-xs mt-0.5 ${isLate ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>
                            {timeLeft}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                        <span>📍</span>
                        <span className="truncate">{order.delivery_address}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                        <span>👤</span>
                        <span>{order.customer_name || 'Client'}</span>
                        <span>•</span>
                        <span>{formatDateTime(order.scheduled_time)}</span>
                      </div>
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {/* Order items */}
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="font-medium text-sm text-gray-700 mb-2">Contenu de la commande :</p>
                          {order.order_items.map(item => (
                            <div key={item.id} className="py-1">
                              <div className="flex justify-between text-sm">
                                <span>{item.quantity}x {item.product_name}</span>
                              </div>
                              {parseOptions(item.options_selected).map((opt, i) => (
                                <p key={i} className="text-xs text-gray-500 ml-4">+ {opt}</p>
                              ))}
                            </div>
                          ))}
                        </div>

                        {/* Notes */}
                        {order.delivery_notes && (
                          <div className="bg-yellow-50 rounded-xl p-3 text-sm">
                            <span className="font-medium">Note :</span> {order.delivery_notes}
                          </div>
                        )}

                        {/* Quick actions */}
                        <div className="flex gap-2">
                          {order.customer_phone && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); callCustomer(order.customer_phone!) }}
                                className="flex-1 bg-blue-500 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                              >
                                📞 Appeler
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); smsCustomer(order.customer_phone!, order.order_number) }}
                                className="bg-blue-100 text-blue-700 px-4 py-3 rounded-xl font-medium active:scale-[0.97] transition-transform"
                              >
                                💬
                              </button>
                            </>
                          )}
                        </div>

                        {/* Take order button */}
                        <button
                          onClick={() => myRound ? addToRound(order.id) : takeOrder(order.id)}
                          disabled={loading || !isReady || (myRound !== null && myRound.total_stops >= MAX_DELIVERIES)}
                          className={`w-full py-4 rounded-xl font-bold text-lg active:scale-[0.98] transition-transform disabled:opacity-50 ${isReady ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'
                            }`}
                        >
                          {!isReady ? 'En préparation...' :
                            myRound ? `Ajouter à ma tournée (${myRound.total_stops}/${MAX_DELIVERIES})` :
                              'Prendre cette livraison'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </>
        )}

        {/* ── ROUND VIEW ── */}
        {view === 'round' && myRound && (
          <>
            {/* Round header */}
            <div className="bg-white rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-lg text-gray-900">Ma tournée</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${isDelivering ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                  {isDelivering ? `${stopsDelivered}/${myRound.total_stops} livrées` : 'Prête au départ'}
                </span>
              </div>

              {/* Stats bar */}
              {isDelivering && (
                <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                  <span>📍 {sessionKm.toFixed(1)} km</span>
                  {position?.speed && position.speed > 0 && (
                    <span>🏎️ {Math.round(position.speed * 3.6)} km/h</span>
                  )}
                  {position?.accuracy && (
                    <span>📡 ±{Math.round(position.accuracy)}m</span>
                  )}
                </div>
              )}

              {/* Start / Release buttons */}
              {myRound.status === 'ready' && (
                <div className="mt-3 space-y-2">
                  <button
                    onClick={startDelivery}
                    disabled={loading}
                    className="w-full bg-green-500 text-white font-bold py-4 rounded-xl text-lg active:scale-[0.98] transition-transform"
                  >
                    🚀 Démarrer la tournée
                  </button>
                  <button
                    onClick={async () => {
                      if (!myRound) return
                      setLoading(true)
                      const orderIds = myRound.stops.map(s => s.order_id)
                      await supabase.from('delivery_round_stops').delete().eq('round_id', myRound.id)
                      await supabase.from('orders').update({ delivery_round_id: null }).in('id', orderIds)
                      await supabase.from('delivery_rounds').delete().eq('id', myRound.id)
                      await supabase.from('drivers').update({ status: 'available' }).eq('id', driver.id)
                      await loadData()
                      setLoading(false)
                    }}
                    disabled={loading}
                    className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl text-sm"
                  >
                    Relâcher la tournée
                  </button>
                </div>
              )}
            </div>

            {/* Stops */}
            {myRound.stops.map((stop, idx) => {
              const isCurrent = idx === currentStopIdx && isDelivering
              const isDone = stop.status === 'delivered'
              const order = stop.order as any
              const distToStop = position && stop.latitude && stop.longitude
                ? haversineM(position.lat, position.lng, Number(stop.latitude), Number(stop.longitude))
                : null

              return (
                <div
                  key={stop.id}
                  className={`bg-white rounded-2xl overflow-hidden transition-all ${isCurrent ? 'ring-2 ring-orange-500 shadow-lg' :
                      isDone ? 'opacity-50' : ''
                    }`}
                >
                  {/* Stop header */}
                  <div className={`px-4 py-3 flex items-center gap-3 ${isCurrent ? 'bg-orange-50' : isDone ? 'bg-green-50' : 'bg-gray-50'
                    }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isDone ? 'bg-green-500 text-white' :
                        isCurrent ? 'bg-orange-500 text-white' : 'bg-gray-300 text-gray-600'
                      }`}>
                      {isDone ? '✓' : stop.stop_order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">#{order?.order_number}</span>
                        <span className="text-sm text-gray-500">{order?.customer_name || 'Client'}</span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">{stop.address}</p>
                    </div>
                    <div className="text-right text-sm">
                      <span className="font-semibold text-orange-500">
                        {(order?.total_amount || order?.total || 0).toFixed(2)}€
                      </span>
                      {order?.payment_status !== 'paid' ? (
                        <p className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold mt-0.5">À encaisser</p>
                      ) : (
                        <p className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium mt-0.5">Payé en ligne</p>
                      )}
                      {distToStop !== null && isCurrent && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {distToStop > 1000 ? `${(distToStop / 1000).toFixed(1)} km` : `${Math.round(distToStop)} m`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions pour le stop courant */}
                  {isCurrent && !isDone && (
                    <div className="p-4 space-y-2">
                      {/* Order details */}
                      <div className="bg-gray-50 rounded-xl p-3 text-sm">
                        {order?.order_items?.map((item: any) => (
                          <div key={item.id} className="py-0.5">
                            <span>{item.quantity}x {item.product_name}</span>
                            {parseOptions(item.options_selected).map((opt: string, i: number) => (
                              <span key={i} className="text-gray-500"> + {opt}</span>
                            ))}
                          </div>
                        ))}
                      </div>

                      {/* Scheduled time */}
                      <div className={`text-center text-sm py-2 rounded-lg ${timeUntil(order?.scheduled_time) === 'En retard'
                          ? 'bg-red-50 text-red-600 font-medium'
                          : 'bg-blue-50 text-blue-600'
                        }`}>
                        Livraison prévue : {formatDateTime(order?.scheduled_time)} ({timeUntil(order?.scheduled_time)})
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => openNavigation(stop.address, stop.latitude, stop.longitude)}
                          className="bg-blue-500 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                        >
                          🗺️ Naviguer
                        </button>
                        {order?.customer_phone ? (
                          <button
                            onClick={() => callCustomer(order.customer_phone)}
                            className="bg-gray-100 text-gray-700 py-3 rounded-xl font-medium flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                          >
                            📞 Appeler
                          </button>
                        ) : (
                          <div />
                        )}
                      </div>

                      {order?.customer_phone && (
                        <button
                          onClick={() => smsCustomer(order.customer_phone, order.order_number)}
                          className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
                        >
                          💬 SMS "Je suis en route"
                        </button>
                      )}

                      {/* Mark delivered */}
                      <button
                        onClick={() => markDelivered(stop.id)}
                        disabled={loading}
                        className="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-lg active:scale-[0.98] transition-transform mt-2"
                      >
                        ✅ Marquer comme livré
                      </button>

                      {/* Release */}
                      {myRound.total_stops === 1 && (
                        <button
                          onClick={() => releaseOrder(stop.id, stop.order_id)}
                          disabled={loading}
                          className="w-full text-gray-500 py-2 text-sm"
                        >
                          Relâcher cette commande
                        </button>
                      )}
                    </div>
                  )}

                  {/* Done badge */}
                  {isDone && stop.delivered_distance_m !== undefined && (
                    <div className="px-4 py-2 text-xs text-gray-500">
                      Livré à {stop.delivered_distance_m}m du point
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {view === 'round' && !myRound && (
          <div className="bg-white rounded-2xl p-10 text-center">
            <span className="text-5xl block mb-3">🛵</span>
            <p className="text-gray-500 font-medium">Pas de tournée en cours</p>
            <p className="text-gray-400 text-sm mt-1">Prenez des commandes depuis l'onglet Livraisons</p>
          </div>
        )}
      </div>

      {/* ===== FLOATING GPS STATUS (if error) ===== */}
      {gpsStatus === 'error' && (
        <div className="fixed bottom-20 left-4 right-4 bg-red-500 text-white px-4 py-3 rounded-xl text-sm text-center shadow-lg">
          ⚠️ GPS indisponible — activez la localisation dans les paramètres
        </div>
      )}
    </div>
  )
}