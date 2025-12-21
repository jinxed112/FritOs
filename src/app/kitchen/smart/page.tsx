'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type OrderItem = {
  id: string
  product_name: string
  quantity: number
  options_selected: string | null
  notes: string | null
}

type Order = {
  id: string
  order_number: string
  order_type: 'eat_in' | 'takeaway' | 'delivery' | 'pickup' | 'kiosk' | 'counter'
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  created_at: string
  scheduled_slot_start: string | null
  scheduled_slot_end: string | null
  kitchen_launch_at: string | null
  priority_score: number
  order_items: OrderItem[]
  is_scheduled: boolean
  minutes_until_launch: number | null
  should_launch_now: boolean
}

type ParsedOption = {
  item_name: string
  price: number
}

const ORDER_TYPE_EMOJI: Record<string, string> = {
  eat_in: '🍽️',
  takeaway: '🥡',
  delivery: '🚗',
  pickup: '📦',
  kiosk: '🖥️',
  counter: '📋',
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  eat_in: 'Sur place',
  takeaway: 'Emporter',
  delivery: 'Livraison',
  pickup: 'Click & Collect',
  kiosk: 'Borne',
  counter: 'Comptoir',
}

export default function KitchenSmartPage() {
  const [immediateOrders, setImmediateOrders] = useState<Order[]>([])
  const [scheduledOrders, setScheduledOrders] = useState<Order[]>([])
  const [preparingOrders, setPreparingOrders] = useState<Order[]>([])
  const [readyOrders, setReadyOrders] = useState<Order[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [currentPrepTime, setCurrentPrepTime] = useState(15)

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadOrders()
    setupRealtime()
    
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000)
    const refreshTimer = setInterval(loadOrders, 30000)
    const recalcTimer = setInterval(triggerRecalculate, 60000)
    
    return () => {
      clearInterval(clockTimer)
      clearInterval(refreshTimer)
      clearInterval(recalcTimer)
    }
  }, [])

  async function triggerRecalculate() {
    try {
      const response = await fetch('/api/kitchen/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establishmentId }),
      })
      const data = await response.json()
      
      if (data.ordersLaunched > 0) {
        playNotificationSound()
        loadOrders()
      }
      
      setCurrentPrepTime(data.currentPrepTime || 15)
    } catch (error) {
      console.error('Recalculate error:', error)
    }
  }

  function setupRealtime() {
    const channel = supabase
      .channel('kitchen-smart')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `establishment_id=eq.${establishmentId}` },
        (payload) => {
          loadOrders()
          if (payload.eventType === 'INSERT') playNotificationSound()
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }

  function playNotificationSound() {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp+ZjHdtcX2Nqb27sZR3Y2h2lrjP0sKfdVlhc5W70NTDn3VXXmyOpL28sJuGcWpvf5CfoJmQgXZwb3iGlJyblI2CdnBweoqYoZ+Xj4NzcHN9jZmgnJOLfnNxdYKQmZyYkIh9c3F1gI6Ym5eRiH50cnWAjZeamJGJf3VzdIGNlpiXkYl+dHN0gYyVl5aQiH50c3SBjJSWlZCHfnRzdIGLk5WUj4d+dHN0gYuTlJOPh350c3SBi5KUk4+HfnRzdIGLkpSTj4d+dHN0gYuSk5OOhn10c3SBi5GTko6GfXRzdIGKkZKSjoZ9dHN0gYqRkpKOhn10c3SBipGRkY2GfXRzdIGKkJGRjYZ9dHN0gYqQkZGNhn10c3SBio+QkI2FfXRzdIGKj5CQjYV9dHN0gYmPj4+MhX10c3R/')
      audio.volume = 0.5
      audio.play().catch(() => {})
    } catch (e) {}
  }

  async function loadOrders() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const now = new Date()

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, order_type, status, created_at,
        scheduled_slot_start, scheduled_slot_end, kitchen_launch_at, priority_score,
        order_items (id, product_name, quantity, options_selected, notes)
      `)
      .eq('establishment_id', establishmentId)
      .gte('created_at', today.toISOString())
      .not('status', 'in', '("cancelled","completed")')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Load error:', error)
      setLoading(false)
      return
    }

    const immediate: Order[] = []
    const scheduled: Order[] = []
    const preparing: Order[] = []
    const ready: Order[] = []

    ;(data || []).forEach((order: any) => {
      const isScheduled = !!order.scheduled_slot_start
      const kitchenLaunch = order.kitchen_launch_at ? new Date(order.kitchen_launch_at) : null
      const minutesUntilLaunch = kitchenLaunch 
        ? Math.round((kitchenLaunch.getTime() - now.getTime()) / 60000)
        : null
      const shouldLaunchNow = kitchenLaunch ? kitchenLaunch <= now : false

      const enrichedOrder: Order = {
        ...order,
        is_scheduled: isScheduled,
        minutes_until_launch: minutesUntilLaunch,
        should_launch_now: shouldLaunchNow,
      }

      switch (order.status) {
        case 'ready': ready.push(enrichedOrder); break
        case 'preparing': preparing.push(enrichedOrder); break
        case 'pending':
        case 'confirmed':
          if (isScheduled && !shouldLaunchNow) {
            scheduled.push(enrichedOrder)
          } else {
            immediate.push(enrichedOrder)
          }
          break
      }
    })

    immediate.sort((a, b) => {
      if (a.priority_score !== b.priority_score) return b.priority_score - a.priority_score
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

    scheduled.sort((a, b) => {
      const launchA = a.kitchen_launch_at ? new Date(a.kitchen_launch_at).getTime() : Infinity
      const launchB = b.kitchen_launch_at ? new Date(b.kitchen_launch_at).getTime() : Infinity
      return launchA - launchB
    })

    setImmediateOrders(immediate)
    setScheduledOrders(scheduled)
    setPreparingOrders(preparing)
    setReadyOrders(ready)
    setLoading(false)
  }

  async function updateStatus(orderId: string, newStatus: string) {
    const updateData: any = { status: newStatus }
    if (newStatus === 'completed') updateData.completed_at = new Date().toISOString()
    
    await supabase.from('orders').update(updateData).eq('id', orderId)
    loadOrders()
  }

  async function launchNow(orderId: string) {
    await supabase.from('orders').update({ priority_score: 1000, status: 'confirmed' }).eq('id', orderId)
    loadOrders()
  }

  function parseOptions(optionsJson: string | null): ParsedOption[] {
    if (!optionsJson) return []
    try { return JSON.parse(optionsJson) } catch { return [] }
  }

  function getTimeSince(dateString: string): string {
    const diff = Math.floor((currentTime.getTime() - new Date(dateString).getTime()) / 1000 / 60)
    if (diff < 1) return '< 1 min'
    if (diff < 60) return `${diff} min`
    return `${Math.floor(diff / 60)}h${(diff % 60).toString().padStart(2, '0')}`
  }

  function getTimeColor(dateString: string): string {
    const diff = Math.floor((currentTime.getTime() - new Date(dateString).getTime()) / 1000 / 60)
    if (diff < 5) return 'text-green-400'
    if (diff < 10) return 'text-yellow-400'
    if (diff < 15) return 'text-orange-400'
    return 'text-red-400'
  }

  function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
  }

  function OrderCard({ order, showTimer = true, onAction, actionLabel, actionColor = 'orange', compact = false }: {
    order: Order; showTimer?: boolean; onAction?: () => void; actionLabel?: string; actionColor?: string; compact?: boolean
  }) {
    const colorClasses: Record<string, string> = {
      orange: 'bg-orange-500 hover:bg-orange-600',
      blue: 'bg-blue-500 hover:bg-blue-600',
      green: 'bg-green-500 hover:bg-green-600',
      gray: 'bg-gray-500 hover:bg-gray-600',
    }

    return (
      <div className={`bg-slate-700 rounded-xl p-4 ${compact ? 'opacity-80' : ''}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`${compact ? 'text-xl' : 'text-2xl'} font-bold`}>{order.order_number}</span>
            <span className="text-xl" title={ORDER_TYPE_LABEL[order.order_type]}>
              {ORDER_TYPE_EMOJI[order.order_type] || '📋'}
            </span>
            {order.is_scheduled && <span className="text-sm bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded">📅</span>}
            {order.priority_score > 0 && <span className="text-sm bg-red-500/30 text-red-300 px-2 py-0.5 rounded">🔥</span>}
          </div>
          
          <div className="flex items-center gap-2">
            {showTimer && <span className={`font-mono text-sm ${getTimeColor(order.created_at)}`}>{getTimeSince(order.created_at)}</span>}
            {onAction && actionLabel && (
              <button onClick={onAction} className={`${colorClasses[actionColor]} text-white px-3 py-1 rounded-lg text-sm font-medium`}>
                {actionLabel}
              </button>
            )}
          </div>
        </div>

        {order.scheduled_slot_start && (
          <div className="text-sm text-purple-300 mb-2">
            🕐 {formatTime(order.scheduled_slot_start)} - {formatTime(order.scheduled_slot_end!)}
          </div>
        )}

        {!compact && (
          <div className="space-y-2">
            {order.order_items.map(item => {
              const options = parseOptions(item.options_selected)
              return (
                <div key={item.id} className="border-t border-slate-600 pt-2 first:border-0 first:pt-0">
                  <div className="flex items-start gap-2">
                    <span className="bg-orange-500 text-white w-6 h-6 rounded flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {item.quantity}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium">{item.product_name}</p>
                      {options.length > 0 && (
                        <div className="text-sm text-gray-400 mt-1">
                          {options.map((opt, idx) => <div key={idx}>+ {opt.item_name}</div>)}
                        </div>
                      )}
                      {item.notes && <p className="text-yellow-400 text-sm mt-1">📝 {item.notes}</p>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {compact && (
          <p className="text-gray-400 text-sm">
            {order.order_items.reduce((sum, item) => sum + item.quantity, 0)} article(s)
          </p>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <span className="text-8xl block mb-4 animate-pulse">👨‍🍳</span>
          <p className="text-2xl">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">👨‍🍳 Cuisine Smart - MDjambo</h1>
          <p className="text-gray-400">
            Temps prépa moyen: ~{currentPrepTime} min
            <span className="ml-2 text-green-400">● En ligne</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={triggerRecalculate} className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg text-sm">
            🔄 Recalculer
          </button>
          <div className="text-right">
            <p className="text-4xl font-mono">{currentTime.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="text-gray-400">{currentTime.toLocaleDateString('fr-BE', { weekday: 'long', day: '2-digit', month: '2-digit' })}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 h-[calc(100vh-140px)]">
        {/* Colonne 1: À préparer maintenant */}
        <div className="bg-slate-800 rounded-xl p-4 overflow-y-auto">
          <h2 className="text-lg font-bold text-orange-400 mb-4 flex items-center gap-2 sticky top-0 bg-slate-800 py-2 z-10">
            <span className="w-3 h-3 bg-orange-400 rounded-full animate-pulse"></span>
            À préparer
            <span className="ml-auto bg-orange-400/20 px-2 py-0.5 rounded text-sm">{immediateOrders.length}</span>
          </h2>
          <div className="space-y-3">
            {immediateOrders.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucune commande</p>
            ) : (
              immediateOrders.map(order => (
                <OrderCard key={order.id} order={order} onAction={() => updateStatus(order.id, 'preparing')} actionLabel="▶️" />
              ))
            )}
          </div>
        </div>

        {/* Colonne 2: En préparation */}
        <div className="bg-slate-800 rounded-xl p-4 overflow-y-auto">
          <h2 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2 sticky top-0 bg-slate-800 py-2 z-10">
            <span className="w-3 h-3 bg-blue-400 rounded-full"></span>
            En cours
            <span className="ml-auto bg-blue-400/20 px-2 py-0.5 rounded text-sm">{preparingOrders.length}</span>
          </h2>
          <div className="space-y-3">
            {preparingOrders.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucune commande</p>
            ) : (
              preparingOrders.map(order => (
                <OrderCard key={order.id} order={order} onAction={() => updateStatus(order.id, 'ready')} actionLabel="✅" actionColor="blue" />
              ))
            )}
          </div>
        </div>

        {/* Colonne 3: Prêt */}
        <div className="bg-slate-800 rounded-xl p-4 overflow-y-auto">
          <h2 className="text-lg font-bold text-green-400 mb-4 flex items-center gap-2 sticky top-0 bg-slate-800 py-2 z-10">
            <span className="w-3 h-3 bg-green-400 rounded-full"></span>
            Prêt
            <span className="ml-auto bg-green-400/20 px-2 py-0.5 rounded text-sm">{readyOrders.length}</span>
          </h2>
          <div className="space-y-3">
            {readyOrders.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucune commande</p>
            ) : (
              readyOrders.map(order => (
                <OrderCard key={order.id} order={order} onAction={() => updateStatus(order.id, 'completed')} actionLabel="🏁" actionColor="green" />
              ))
            )}
          </div>
        </div>

        {/* Colonne 4: Programmées */}
        <div className="bg-slate-800 rounded-xl p-4 overflow-y-auto">
          <h2 className="text-lg font-bold text-purple-400 mb-4 flex items-center gap-2 sticky top-0 bg-slate-800 py-2 z-10">
            <span className="w-3 h-3 bg-purple-400 rounded-full"></span>
            Programmées
            <span className="ml-auto bg-purple-400/20 px-2 py-0.5 rounded text-sm">{scheduledOrders.length}</span>
          </h2>
          <div className="space-y-3">
            {scheduledOrders.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucune commande programmée</p>
            ) : (
              scheduledOrders.map(order => (
                <div key={order.id} className="relative">
                  {order.minutes_until_launch !== null && (
                    <div className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs font-bold z-10 ${
                      order.minutes_until_launch <= 0 ? 'bg-red-500 text-white animate-pulse' :
                      order.minutes_until_launch <= 5 ? 'bg-yellow-500 text-black' : 'bg-purple-500 text-white'
                    }`}>
                      {order.minutes_until_launch <= 0 ? 'LANCER !' : `${order.minutes_until_launch} min`}
                    </div>
                  )}
                  <OrderCard
                    order={order}
                    showTimer={false}
                    onAction={() => launchNow(order.id)}
                    actionLabel={order.should_launch_now ? '🚀 Lancer' : '⏭️'}
                    actionColor={order.should_launch_now ? 'orange' : 'gray'}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex justify-between items-center text-gray-500 text-sm">
        <span>📅 Programmées: lancement automatique au bon moment</span>
        <span>{immediateOrders.length + preparingOrders.length + readyOrders.length + scheduledOrders.length} commande(s) aujourd'hui</span>
        <span>FritOS KDS Smart v2.0</span>
      </div>
    </div>
  )
}
