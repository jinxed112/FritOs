'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type OrderItem = {
  id: string
  product_name: string
  quantity: number
  options_selected: string | null
  notes: string | null
  category_name?: string
}

type Order = {
  id: string
  order_number: string
  order_type: string
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  created_at: string
  order_items: OrderItem[]
  customer_name?: string | null
  scheduled_time?: string | null
}

const COLUMNS = [
  { key: 'pending', label: 'À faire', color: 'bg-orange-500', next: 'preparing' },
  { key: 'preparing', label: 'En cours', color: 'bg-blue-500', next: 'ready' },
  { key: 'ready', label: 'Prêt', color: 'bg-green-500', next: 'completed' },
] as const

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadOrders()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    
    // Realtime subscription
    const channel = supabase
      .channel('kitchen-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadOrders()
      })
      .subscribe()

    return () => { 
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [])

  async function loadOrders() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const { data } = await supabase
      .from('orders')
      .select(`
        id, order_number, order_type, status, created_at,
        customer_name, scheduled_time,
        order_items ( id, product_name, quantity, options_selected, notes )
      `)
      .gte('created_at', today.toISOString())
      .in('status', ['pending', 'preparing', 'ready'])
      .order('created_at', { ascending: true })

    if (data) {
      setOrders(data.map(o => ({ ...o, order_items: o.order_items || [] })))
    }
    setLoading(false)
  }

  async function moveOrder(orderId: string, newStatus: string) {
    // Update optimiste
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as any } : o))
    
    // Update DB
    await supabase
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId)
  }

  function parseOptions(optionsJson: string | null): string[] {
    if (!optionsJson) return []
    try {
      const parsed = JSON.parse(optionsJson)
      if (Array.isArray(parsed)) {
        return parsed.map((o: any) => o.item_name || o.name || o).filter(Boolean)
      }
      return []
    } catch { return [] }
  }

  function getTypeIcon(type: string): string {
    return { eat_in: '🍽️', takeaway: '🥡', delivery: '🚗', pickup: '🛍️' }[type] || '📦'
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white text-xl">Chargement...</div>
  }

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      {/* Header ultra compact */}
      <div className="flex items-center justify-between px-3 py-1 bg-gray-800 border-b border-gray-700">
        <span className="text-sm text-gray-400">🍳 KDS</span>
        <span className="text-2xl font-mono font-bold">{currentTime.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      {/* Colonnes */}
      <div className="flex-1 grid grid-cols-3 gap-1 p-1 overflow-hidden">
        {COLUMNS.map(col => {
          const colOrders = orders.filter(o => o.status === col.key)
          
          return (
            <div key={col.key} className="flex flex-col bg-gray-800 rounded overflow-hidden">
              {/* Header colonne */}
              <div className={`${col.color} px-2 py-1 flex items-center justify-between`}>
                <span className="font-bold text-sm">{col.label}</span>
                <span className="bg-white/20 px-2 rounded text-sm">{colOrders.length}</span>
              </div>
              
              {/* Liste orders */}
              <div className="flex-1 overflow-y-auto p-1 space-y-1">
                {colOrders.length === 0 ? (
                  <p className="text-gray-500 text-center text-xs py-4">Vide</p>
                ) : (
                  colOrders.map(order => (
                    <div key={order.id} className="bg-gray-700 rounded overflow-hidden">
                      {/* Header ticket */}
                      <div className="flex items-center justify-between px-2 py-1 bg-gray-600">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-lg">{order.order_number}</span>
                          <span className="text-sm">{getTypeIcon(order.order_type)}</span>
                          {order.customer_name && <span className="text-xs text-gray-300 truncate max-w-[80px]">{order.customer_name}</span>}
                        </div>
                        {col.next && (
                          <button
                            onPointerDown={() => moveOrder(order.id, col.next)}
                            className={`${col.color} hover:brightness-110 active:scale-90 text-white w-10 h-8 rounded flex items-center justify-center text-lg font-bold transition-transform`}
                          >
                            →
                          </button>
                        )}
                      </div>
                      
                      {/* Items */}
                      <div className="px-2 py-1 space-y-0.5 text-sm">
                        {order.order_items.map((item, idx) => {
                          const options = parseOptions(item.options_selected)
                          return (
                            <div key={idx} className="flex items-start gap-1">
                              <span className={`font-bold min-w-[18px] text-center rounded ${item.quantity > 1 ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>
                                {item.quantity}
                              </span>
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{item.product_name}</span>
                                {options.length > 0 && (
                                  <span className="text-gray-400 text-xs ml-1">
                                    ({options.join(', ')})
                                  </span>
                                )}
                                {item.notes && (
                                  <p className="text-yellow-400 text-xs">📝 {item.notes}</p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      
                      {/* Timer discret */}
                      <div className="px-2 py-0.5 text-xs text-gray-500 border-t border-gray-600">
                        {Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)} min
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}