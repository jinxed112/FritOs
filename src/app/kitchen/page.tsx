'use client'

import { useState, useEffect, DragEvent } from 'react'
import { useRouter } from 'next/navigation'
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
  order_type: 'eat_in' | 'takeaway' | 'delivery' | 'table'
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  created_at: string
  order_items: OrderItem[]
  is_offered?: boolean
}

type DeviceInfo = {
  id: string
  name: string
  device_code: string
  establishment_id: string
  config: {
    columns?: string[]
  }
}

type ColumnConfig = {
  pending: boolean
  preparing: boolean
  ready: boolean
  completed: boolean
}

type ParsedOption = {
  item_name: string
  price: number
}

const ORDER_TYPE_EMOJI = {
  eat_in: '🍽️',
  takeaway: '🥡',
  delivery: '🚗',
  table: '📍',
}

const COLUMNS = [
  { key: 'pending', label: 'À préparer', color: 'orange', nextStatus: 'preparing', nextLabel: '▶️' },
  { key: 'preparing', label: 'En cours', color: 'blue', nextStatus: 'ready', nextLabel: '✅' },
  { key: 'ready', label: 'Prêt', color: 'green', nextStatus: 'completed', nextLabel: '🏁' },
  { key: 'completed', label: 'Clôturé', color: 'gray', nextStatus: null, nextLabel: null },
] as const

const DEFAULT_COLUMNS = ['pending', 'preparing', 'ready', 'completed']

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [offeredOrders, setOfferedOrders] = useState<Order[]>([]) // Offerts en mémoire seulement
  const [currentTime, setCurrentTime] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [columnConfig, setColumnConfig] = useState<ColumnConfig>({
    pending: true,
    preparing: true,
    ready: true,
    completed: true,
  })
  const [draggedOrder, setDraggedOrder] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [establishmentId, setEstablishmentId] = useState<string>('a0000000-0000-0000-0000-000000000001')
  
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      // Mode démo sans auth
      setAuthChecking(false)
      loadOrders(establishmentId)
      loadTempOrders(establishmentId)
      setupRealtime(establishmentId)
      return
    }

    // Vérifier le rôle
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, establishment_id')
      .eq('id', session.user.id)
      .single()

    if (profile?.role?.startsWith('device_kds')) {
      // Récupérer les infos du device
      const { data: deviceData } = await supabase
        .from('devices')
        .select('id, name, device_code, establishment_id, config')
        .eq('auth_user_id', session.user.id)
        .single()

      if (deviceData) {
        const config = typeof deviceData.config === 'string' 
          ? JSON.parse(deviceData.config || '{}')
          : deviceData.config || {}
        
        const columns = config.columns || DEFAULT_COLUMNS
        
        setDevice({
          ...deviceData,
          config,
        })
        
        setColumnConfig({
          pending: columns.includes('pending'),
          preparing: columns.includes('preparing'),
          ready: columns.includes('ready'),
          completed: columns.includes('completed'),
        })
        
        setEstablishmentId(deviceData.establishment_id)

        // Mettre à jour last_seen_at
        await supabase
          .from('devices')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', deviceData.id)
      }
    }

    setAuthChecking(false)
    loadOrders(establishmentId)
    loadTempOrders(establishmentId)
    setupRealtime(establishmentId)
    
    // Horloge
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }

  async function loadTempOrders(estId: string) {
    const { data, error } = await supabase
      .from('temp_orders')
      .select('*')
      .eq('establishment_id', estId)
      .neq('status', 'completed')
      .order('created_at', { ascending: true })

    if (!error && data) {
      // Transformer en format Order
      const transformed: Order[] = data.map(t => ({
        id: t.id,
        order_number: t.order_number,
        order_type: t.order_type,
        status: t.status,
        created_at: t.created_at,
        is_offered: true,
        order_items: t.order_items || [],
      }))
      setOfferedOrders(transformed)
    }
  }

  function setupRealtime(estId: string) {
    // Écouter les nouvelles commandes ET les mises à jour (DB)
    const dbChannel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `establishment_id=eq.${estId}`,
        },
        (payload) => {
          console.log('Nouvelle commande:', payload)
          loadOrders(estId)
          playNotificationSound()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `establishment_id=eq.${estId}`,
        },
        (payload) => {
          console.log('Commande mise à jour:', payload)
          loadOrders(estId)
        }
      )
      .subscribe((status) => {
        console.log('Realtime DB status:', status)
      })

    // Écouter les commandes OFFERTES via temp_orders
    const tempChannel = supabase
      .channel('temp-orders-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'temp_orders',
          filter: `establishment_id=eq.${estId}`,
        },
        (payload) => {
          console.log('Commande offerte reçue:', payload)
          loadTempOrders(estId)
          playNotificationSound()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'temp_orders',
          filter: `establishment_id=eq.${estId}`,
        },
        (payload) => {
          console.log('Commande offerte mise à jour:', payload)
          loadTempOrders(estId)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'temp_orders',
        },
        (payload) => {
          console.log('Commande offerte supprimée:', payload)
          loadTempOrders(estId)
        }
      )
      .subscribe((status) => {
        console.log('Realtime temp_orders status:', status)
      })

    return () => {
      supabase.removeChannel(dbChannel)
      supabase.removeChannel(tempChannel)
    }
  }

  function playNotificationSound() {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp+ZjHdtcX2Nqb27sZR3Y2h2lrjP0sKfdVlhc5W70NTDn3VXXmyOpL28sJuGcWpvf5CfoJmQgXZwb3iGlJyblI2CdnBweoqYoZ+Xj4NzcHN9jZmgnJOLfnNxdYKQmZyYkIh9c3F1gI6Ym5eRiH50cnWAjZeamJGJf3VzdIGNlpiXkYl+dHN0gYyVl5aQiH50c3SBjJSWlZCHfnRzdIGLk5WUj4d+dHN0gYuTlJOPh350c3SBi5KUk4+HfnRzdIGLkpSTj4d+dHN0gYuSk5OOhn10c3SBi5GTko6GfXRzdIGKkZKSjoZ9dHN0gYqRkpKOhn10c3SBipGRkY2GfXRzdIGKkJGRjYZ9dHN0gYqQkZGNhn10c3SBio+QkI2FfXRzdIGKj5CQjYV9dHN0gYmPj4+MhX10c3R/')
      audio.volume = 0.5
      audio.play().catch(() => {})
    } catch (e) {}
  }

  async function loadOrders(estId: string) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        order_type,
        status,
        created_at,
        order_items (
          id,
          product_name,
          quantity,
          options_selected,
          notes
        )
      `)
      .eq('establishment_id', estId)
      .gte('created_at', today.toISOString())
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Erreur chargement:', error)
    } else {
      setOrders(data || [])
    }
    
    setLoading(false)
  }

  async function updateStatus(orderId: string, newStatus: string) {
    // Vérifier si c'est un offert (dans temp_orders)
    const isOffered = offeredOrders.some(o => o.id === orderId)
    
    if (isOffered) {
      // Offert : mettre à jour ou supprimer de temp_orders
      if (newStatus === 'completed') {
        // Supprimer de temp_orders
        const { error } = await supabase
          .from('temp_orders')
          .delete()
          .eq('id', orderId)
        
        if (error) console.error('Erreur delete temp:', error)
      } else {
        // Mettre à jour le status
        const { error } = await supabase
          .from('temp_orders')
          .update({ status: newStatus })
          .eq('id', orderId)
        
        if (error) console.error('Erreur update temp:', error)
      }
    } else {
      // Normal : mettre à jour dans orders
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId)

      if (error) {
        console.error('Erreur update:', error)
        alert('Erreur lors de la mise à jour')
      }
    }
  }

  // Combiner les commandes DB + offerts pour l'affichage
  const allOrders = [...orders, ...offeredOrders].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  async function saveConfig(newConfig: ColumnConfig) {
    if (!device) return
    
    const columns = Object.entries(newConfig)
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key)
    
    if (columns.length === 0) return
    
    const updatedConfig = {
      ...device.config,
      columns,
    }
    
    const { error } = await supabase
      .from('devices')
      .update({ config: updatedConfig })
      .eq('id', device.id)

    if (error) {
      console.error('Erreur sauvegarde config:', error)
      alert('Erreur lors de la sauvegarde')
    } else {
      setColumnConfig(newConfig)
      setDevice({
        ...device,
        config: updatedConfig,
      })
    }
  }

  function parseOptions(optionsJson: string | null): ParsedOption[] {
    if (!optionsJson) return []
    try {
      return JSON.parse(optionsJson)
    } catch {
      return []
    }
  }

  function getTimeSince(dateString: string): string {
    const created = new Date(dateString)
    const diff = Math.floor((currentTime.getTime() - created.getTime()) / 1000 / 60)
    if (diff < 1) return '< 1 min'
    if (diff < 60) return `${diff} min`
    return `${Math.floor(diff / 60)}h${(diff % 60).toString().padStart(2, '0')}`
  }

  function getTimeColor(dateString: string): string {
    const created = new Date(dateString)
    const diff = Math.floor((currentTime.getTime() - created.getTime()) / 1000 / 60)
    if (diff < 5) return 'text-green-400'
    if (diff < 10) return 'text-yellow-400'
    if (diff < 15) return 'text-orange-400'
    return 'text-red-400'
  }

  // Drag and Drop handlers
  function handleDragStart(e: DragEvent, orderId: string) {
    setDraggedOrder(orderId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggedOrder(null)
    setDragOverColumn(null)
  }

  function handleDragOver(e: DragEvent, columnKey: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(columnKey)
  }

  function handleDragLeave() {
    setDragOverColumn(null)
  }

  function handleDrop(e: DragEvent, newStatus: string) {
    e.preventDefault()
    if (draggedOrder) {
      updateStatus(draggedOrder, newStatus)
    }
    setDraggedOrder(null)
    setDragOverColumn(null)
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <span className="text-8xl block mb-4">👨‍🍳</span>
          <p className="text-2xl">Chargement...</p>
        </div>
      </div>
    )
  }

  const visibleColumns = COLUMNS.filter(col => columnConfig[col.key as keyof ColumnConfig])
  const gridCols = visibleColumns.length === 1 ? 'grid-cols-1' :
                   visibleColumns.length === 2 ? 'grid-cols-2' :
                   visibleColumns.length === 3 ? 'grid-cols-3' : 'grid-cols-4'

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">👨‍🍳 Cuisine - MDjambo</h1>
          <p className="text-gray-400">
            {device ? `${device.name} (${device.device_code})` : 'Mode démo'}
            <span className="ml-2 text-green-400">● En ligne</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowConfig(true)}
            className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors"
          >
            ⚙️
          </button>
          <div className="text-right">
            <p className="text-4xl font-mono">
              {currentTime.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-gray-400">
              {currentTime.toLocaleDateString('fr-BE', { weekday: 'long', day: '2-digit', month: '2-digit' })}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-96">
          <p className="text-2xl text-gray-400">Chargement des commandes...</p>
        </div>
      ) : (
        <div className={`grid ${gridCols} gap-4 h-[calc(100vh-140px)]`}>
          {visibleColumns.map(column => {
            const columnOrders = column.key === 'completed'
              ? allOrders.filter(o => o.status === column.key).slice(-10)
              : allOrders.filter(o => o.status === column.key)
            
            const colorClasses = {
              orange: { text: 'text-orange-400', bg: 'bg-orange-400', bgLight: 'bg-orange-400/20', border: 'border-orange-400', btn: 'bg-orange-500 hover:bg-orange-600' },
              blue: { text: 'text-blue-400', bg: 'bg-blue-400', bgLight: 'bg-blue-400/20', border: 'border-blue-400', btn: 'bg-blue-500 hover:bg-blue-600' },
              green: { text: 'text-green-400', bg: 'bg-green-400', bgLight: 'bg-green-400/20', border: 'border-green-400', btn: 'bg-green-500 hover:bg-green-600' },
              gray: { text: 'text-gray-400', bg: 'bg-gray-400', bgLight: 'bg-gray-400/20', border: 'border-gray-500', btn: 'bg-gray-500 hover:bg-gray-400' },
            }[column.color]

            return (
              <div
                key={column.key}
                className={`bg-slate-800 rounded-xl p-4 overflow-y-auto transition-all ${
                  dragOverColumn === column.key ? 'ring-2 ring-white/50 bg-slate-700' : ''
                }`}
                onDragOver={(e) => handleDragOver(e, column.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.key)}
              >
                <h2 className={`text-lg font-bold ${colorClasses.text} mb-4 flex items-center gap-2 sticky top-0 bg-slate-800 py-2 z-10`}>
                  <span className={`w-3 h-3 ${colorClasses.bg} rounded-full ${column.key === 'pending' ? 'animate-pulse' : ''}`}></span>
                  {column.label}
                  <span className={`ml-auto ${colorClasses.bgLight} px-2 py-0.5 rounded text-sm`}>
                    {columnOrders.length}
                  </span>
                </h2>
                
                <div className="space-y-3">
                  {columnOrders.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Aucune commande</p>
                  ) : (
                    columnOrders.map(order => (
                      <div
                        key={order.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, order.id)}
                        onDragEnd={handleDragEnd}
                        className={`bg-slate-700 rounded-xl p-4 border-l-4 ${colorClasses.border} cursor-grab active:cursor-grabbing ${
                          draggedOrder === order.id ? 'opacity-50' : ''
                        } ${column.key === 'completed' ? 'opacity-60' : ''}`}
                      >
                        {/* Header avec bouton */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`${column.key === 'completed' ? 'text-xl' : 'text-2xl'} font-bold`}>
                              {order.order_number}
                            </span>
                            <span className="text-xl">
                              {ORDER_TYPE_EMOJI[order.order_type]}
                            </span>
                            {order.is_offered && (
                              <span className="text-lg" title="Offert - pas en DB">🎁</span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className={`font-mono text-sm ${getTimeColor(order.created_at)}`}>
                              {getTimeSince(order.created_at)}
                            </span>
                            
                            {/* Petit bouton d'action */}
                            {column.nextStatus && (
                              <button
                                onClick={() => updateStatus(order.id, column.nextStatus!)}
                                className={`${colorClasses.btn} text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors`}
                              >
                                {column.nextLabel}
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Items avec options */}
                        {column.key !== 'completed' && (
                          <div className="space-y-2">
                            {order.order_items.map(item => {
                              const options = parseOptions(item.options_selected)
                              
                              return (
                                <div key={item.id} className="border-t border-slate-600 pt-2 first:border-0 first:pt-0">
                                  <div className="flex items-start gap-2">
                                    <span className={`${colorClasses.btn.split(' ')[0]} text-white w-6 h-6 rounded flex items-center justify-center text-sm font-bold flex-shrink-0`}>
                                      {item.quantity}
                                    </span>
                                    <div className="flex-1">
                                      <p className="font-medium">{item.product_name}</p>
                                      
                                      {/* Options */}
                                      {options.length > 0 && (
                                        <div className="text-sm text-gray-400 mt-1">
                                          {options.map((opt, idx) => (
                                            <div key={idx} className="flex items-center gap-1">
                                              <span className="text-gray-500">+</span>
                                              <span>{opt.item_name}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      
                                      {/* Notes */}
                                      {item.notes && (
                                        <p className="text-yellow-400 text-sm mt-1">📝 {item.notes}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        
                        {/* Items count for completed */}
                        {column.key === 'completed' && (
                          <p className="text-gray-400 text-sm">
                            {order.order_items.reduce((sum, item) => sum + item.quantity, 0)} article(s)
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex justify-between items-center text-gray-500 text-sm">
        <span>💡 Glissez-déposez ou utilisez les boutons</span>
        <span>{allOrders.length} commande{allOrders.length > 1 ? 's' : ''} aujourd'hui</span>
        <span>FritOS KDS v1.0</span>
      </div>

      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-2">⚙️ Configuration</h2>
            <p className="text-gray-400 mb-6">{device ? `${device.name} (${device.device_code})` : 'Mode démo'}</p>
            
            <p className="text-gray-300 mb-4">Colonnes affichées :</p>
            
            <div className="space-y-3 mb-6">
              {COLUMNS.map(col => {
                const colorClasses = {
                  orange: 'bg-orange-400',
                  blue: 'bg-blue-400',
                  green: 'bg-green-400',
                  gray: 'bg-gray-400',
                }[col.color]
                
                return (
                  <label
                    key={col.key}
                    className="flex items-center gap-3 p-3 bg-slate-700 rounded-xl cursor-pointer hover:bg-slate-600 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={columnConfig[col.key as keyof ColumnConfig]}
                      onChange={(e) => {
                        const newConfig = {
                          ...columnConfig,
                          [col.key]: e.target.checked,
                        }
                        if (Object.values(newConfig).some(v => v)) {
                          setColumnConfig(newConfig)
                        }
                      }}
                      className="w-5 h-5 rounded"
                    />
                    <span className={`w-3 h-3 ${colorClasses} rounded-full`}></span>
                    <span className="font-medium">{col.label}</span>
                  </label>
                )
              })}
            </div>

            <div className="bg-slate-700 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-400 mb-2">💡 Presets :</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setColumnConfig({ pending: true, preparing: true, ready: false, completed: false })}
                  className="text-left px-3 py-2 rounded bg-slate-600 hover:bg-slate-500 text-sm"
                >
                  🍳 Cuisine
                </button>
                <button
                  onClick={() => setColumnConfig({ pending: false, preparing: true, ready: true, completed: false })}
                  className="text-left px-3 py-2 rounded bg-slate-600 hover:bg-slate-500 text-sm"
                >
                  📦 Emballage
                </button>
                <button
                  onClick={() => setColumnConfig({ pending: false, preparing: false, ready: true, completed: false })}
                  className="text-left px-3 py-2 rounded bg-slate-600 hover:bg-slate-500 text-sm"
                >
                  📢 Écran client
                </button>
                <button
                  onClick={() => setColumnConfig({ pending: true, preparing: true, ready: true, completed: true })}
                  className="text-left px-3 py-2 rounded bg-slate-600 hover:bg-slate-500 text-sm"
                >
                  📺 Complet
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfig(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 rounded-xl transition-colors"
              >
                Fermer
              </button>
              {device && (
                <button
                  onClick={() => {
                    saveConfig(columnConfig)
                    setShowConfig(false)
                  }}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  💾 Sauvegarder
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
