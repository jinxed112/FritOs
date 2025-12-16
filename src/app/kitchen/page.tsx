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
  category_name?: string
  category_id?: string
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
    displayMode?: 'compact' | 'detailed'
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
  option_group_name?: string
}

type GroupedItems = {
  categoryName: string
  categoryColor: string
  categoryIcon: string
  items: OrderItem[]
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

// Configuration des catégories avec couleurs et icônes
const CATEGORY_CONFIG: Record<string, { color: string, icon: string, bgClass: string, textClass: string }> = {
  // Frites et accompagnements
  'frites': { color: 'orange', icon: '🍟', bgClass: 'bg-orange-500/20', textClass: 'text-orange-400' },
  'accompagnements': { color: 'orange', icon: '🍟', bgClass: 'bg-orange-500/20', textClass: 'text-orange-400' },
  
  // Snacks et viandes
  'snacks': { color: 'red', icon: '🍖', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
  'viandes': { color: 'red', icon: '🥩', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
  'fricadelles': { color: 'red', icon: '🍖', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
  'burgers': { color: 'red', icon: '🍔', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
  
  // Sauces
  'sauces': { color: 'yellow', icon: '🥫', bgClass: 'bg-yellow-500/20', textClass: 'text-yellow-400' },
  
  // Salades et crudités
  'salades': { color: 'green', icon: '🥗', bgClass: 'bg-green-500/20', textClass: 'text-green-400' },
  'crudités': { color: 'green', icon: '🥬', bgClass: 'bg-green-500/20', textClass: 'text-green-400' },
  
  // Boissons
  'boissons': { color: 'blue', icon: '🥤', bgClass: 'bg-blue-500/20', textClass: 'text-blue-400' },
  
  // Desserts
  'desserts': { color: 'pink', icon: '🍨', bgClass: 'bg-pink-500/20', textClass: 'text-pink-400' },
  
  // Menus
  'menus': { color: 'purple', icon: '📦', bgClass: 'bg-purple-500/20', textClass: 'text-purple-400' },
  
  // Default
  'default': { color: 'slate', icon: '📋', bgClass: 'bg-slate-500/20', textClass: 'text-slate-400' },
}

// Mapping des mots-clés d'options vers des icônes
const OPTION_ICONS: { keywords: string[], icon: string, color: string }[] = [
  // Fromages
  { keywords: ['cheddar', 'fromage', 'cheese', 'raclette', 'mozzarella'], icon: '🧀', color: 'text-yellow-400' },
  
  // Viandes supplémentaires
  { keywords: ['viande', 'steak', 'boeuf', 'poulet', 'bacon', 'lard'], icon: '🥩', color: 'text-red-400' },
  
  // Sauces
  { keywords: ['samurai', 'samourai', 'piquant', 'épicé', 'hot'], icon: '🌶️', color: 'text-orange-400' },
  { keywords: ['mayo', 'mayonnaise', 'andalouse', 'américaine'], icon: '🥫', color: 'text-yellow-300' },
  { keywords: ['ketchup', 'tomate'], icon: '🍅', color: 'text-red-400' },
  
  // Légumes
  { keywords: ['oignon', 'oignons'], icon: '🧅', color: 'text-purple-300' },
  { keywords: ['salade', 'laitue'], icon: '🥬', color: 'text-green-400' },
  { keywords: ['tomate', 'tomates'], icon: '🍅', color: 'text-red-400' },
  { keywords: ['cornichon', 'pickles'], icon: '🥒', color: 'text-green-500' },
  
  // Œuf
  { keywords: ['oeuf', 'œuf', 'egg'], icon: '🍳', color: 'text-yellow-300' },
  
  // Végétarien
  { keywords: ['végé', 'vegan', 'végétarien', 'plant'], icon: '🌱', color: 'text-green-400' },
  
  // Pain
  { keywords: ['pain', 'bun', 'wrap', 'pita'], icon: '🍞', color: 'text-amber-400' },
]

// Détecter si une option est une exclusion (SANS)
function isExclusion(optionName: string): boolean {
  const lower = optionName.toLowerCase()
  return lower.startsWith('sans ') || lower.includes('pas de ') || lower.includes('no ')
}

// Obtenir l'icône pour une option
function getOptionIcon(optionName: string): { icon: string, color: string } | null {
  const lower = optionName.toLowerCase()
  
  for (const mapping of OPTION_ICONS) {
    if (mapping.keywords.some(kw => lower.includes(kw))) {
      return { icon: mapping.icon, color: mapping.color }
    }
  }
  
  return null
}

// Obtenir la config de catégorie
function getCategoryConfig(categoryName: string): typeof CATEGORY_CONFIG['default'] {
  const lower = categoryName.toLowerCase()
  
  for (const [key, config] of Object.entries(CATEGORY_CONFIG)) {
    if (lower.includes(key)) {
      return config
    }
  }
  
  return CATEGORY_CONFIG['default']
}

// Grouper les items par catégorie
function groupItemsByCategory(items: OrderItem[]): GroupedItems[] {
  const groups: Record<string, OrderItem[]> = {}
  
  for (const item of items) {
    const catName = item.category_name || 'Autres'
    if (!groups[catName]) {
      groups[catName] = []
    }
    groups[catName].push(item)
  }
  
  // Ordre de priorité des catégories
  const categoryOrder = ['frites', 'snacks', 'viandes', 'burgers', 'sauces', 'salades', 'boissons', 'desserts']
  
  return Object.entries(groups)
    .map(([categoryName, items]) => {
      const config = getCategoryConfig(categoryName)
      return {
        categoryName,
        categoryColor: config.color,
        categoryIcon: config.icon,
        items,
      }
    })
    .sort((a, b) => {
      const aIndex = categoryOrder.findIndex(c => a.categoryName.toLowerCase().includes(c))
      const bIndex = categoryOrder.findIndex(c => b.categoryName.toLowerCase().includes(c))
      
      if (aIndex === -1 && bIndex === -1) return 0
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })
}

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [offeredOrders, setOfferedOrders] = useState<Order[]>([])
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
  const [displayMode, setDisplayMode] = useState<'compact' | 'detailed'>('detailed')
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
      setAuthChecking(false)
      loadOrders(establishmentId)
      loadTempOrders(establishmentId)
      setupRealtime(establishmentId)
      
      const timer = setInterval(() => setCurrentTime(new Date()), 1000)
      return () => clearInterval(timer)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, establishment_id')
      .eq('id', session.user.id)
      .single()

    if (profile?.role?.startsWith('device_kds')) {
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
        
        setDisplayMode(config.displayMode || 'detailed')
        setEstablishmentId(deviceData.establishment_id)

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
      .subscribe()

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
          loadTempOrders(estId)
        }
      )
      .subscribe()

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
    
    // Charger les commandes avec les infos de catégorie
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
          notes,
          product:products (
            category:categories (
              name
            )
          )
        )
      `)
      .eq('establishment_id', estId)
      .gte('created_at', today.toISOString())
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Erreur chargement:', error)
    } else {
      // Mapper les items avec leur catégorie
      const ordersWithCategories = (data || []).map(order => ({
        ...order,
        order_items: order.order_items.map((item: any) => ({
          ...item,
          category_name: item.product?.category?.name || 'Autres',
        }))
      }))
      setOrders(ordersWithCategories)
    }
    
    setLoading(false)
  }

  async function updateStatus(orderId: string, newStatus: string) {
    const isOffered = offeredOrders.some(o => o.id === orderId)
    
    if (isOffered) {
      if (newStatus === 'completed') {
        const { error } = await supabase
          .from('temp_orders')
          .delete()
          .eq('id', orderId)
        
        if (error) console.error('Erreur delete temp:', error)
      } else {
        const { error } = await supabase
          .from('temp_orders')
          .update({ status: newStatus })
          .eq('id', orderId)
        
        if (error) console.error('Erreur update temp:', error)
      }
    } else {
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

  const allOrders = [...orders, ...offeredOrders].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  async function saveConfig(newConfig: ColumnConfig, newDisplayMode: 'compact' | 'detailed') {
    if (!device) return
    
    const columns = Object.entries(newConfig)
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key)
    
    if (columns.length === 0) return
    
    const updatedConfig = {
      ...device.config,
      columns,
      displayMode: newDisplayMode,
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
      setDisplayMode(newDisplayMode)
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

  // Rendu d'un item avec ses options
  function renderOrderItem(item: OrderItem, columnColor: string) {
    const options = parseOptions(item.options_selected)
    const isHighQuantity = item.quantity >= 3
    const isVeryHighQuantity = item.quantity >= 5
    
    // Classes pour surbrillance quantité
    let quantityBgClass = ''
    let quantityTextClass = ''
    if (isVeryHighQuantity) {
      quantityBgClass = 'bg-red-500/30 border-l-4 border-red-500 animate-pulse'
      quantityTextClass = 'bg-red-500'
    } else if (isHighQuantity) {
      quantityBgClass = 'bg-yellow-500/20 border-l-4 border-yellow-500'
      quantityTextClass = 'bg-yellow-500'
    }
    
    return (
      <div 
        key={item.id} 
        className={`rounded-lg p-2 ${quantityBgClass} ${isHighQuantity ? 'my-1' : ''}`}
      >
        <div className="flex items-start gap-2">
          {/* Badge quantité */}
          <span className={`${quantityTextClass || `bg-${columnColor}-500`} text-white min-w-[28px] h-7 rounded flex items-center justify-center text-sm font-bold flex-shrink-0`}>
            {item.quantity > 1 && '×'}{item.quantity}
          </span>
          
          <div className="flex-1 min-w-0">
            {/* Nom du produit */}
            <p className={`font-medium ${isHighQuantity ? 'text-lg' : ''}`}>
              {item.product_name}
              {isVeryHighQuantity && <span className="ml-2">⚠️</span>}
            </p>
            
            {/* Options en mode détaillé */}
            {displayMode === 'detailed' && options.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {options.map((opt, idx) => {
                  const iconData = getOptionIcon(opt.item_name)
                  const excluded = isExclusion(opt.item_name)
                  
                  return (
                    <span 
                      key={idx}
                      className={`inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded-full ${
                        excluded 
                          ? 'bg-gray-600 text-gray-300 line-through' 
                          : 'bg-slate-600 text-gray-200'
                      }`}
                    >
                      {excluded && <span>🚫</span>}
                      {iconData && <span className={iconData.color}>{iconData.icon}</span>}
                      <span>{opt.item_name}</span>
                    </span>
                  )
                })}
              </div>
            )}
            
            {/* Options en mode compact - juste les icônes */}
            {displayMode === 'compact' && options.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {options.map((opt, idx) => {
                  const iconData = getOptionIcon(opt.item_name)
                  const excluded = isExclusion(opt.item_name)
                  
                  if (iconData) {
                    return (
                      <span 
                        key={idx}
                        className={`text-lg ${excluded ? 'opacity-50' : ''}`}
                        title={opt.item_name}
                      >
                        {excluded && '🚫'}
                        {iconData.icon}
                      </span>
                    )
                  }
                  
                  // Si pas d'icône, afficher en petit texte
                  return (
                    <span 
                      key={idx}
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        excluded ? 'bg-gray-600 line-through' : 'bg-slate-600'
                      }`}
                    >
                      {excluded && '🚫'}{opt.item_name}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Rendu d'une commande complète
  function renderOrder(order: Order, column: typeof COLUMNS[number]) {
    const colorClasses = {
      orange: { text: 'text-orange-400', bg: 'bg-orange-400', bgLight: 'bg-orange-400/20', border: 'border-orange-400', btn: 'bg-orange-500 hover:bg-orange-600' },
      blue: { text: 'text-blue-400', bg: 'bg-blue-400', bgLight: 'bg-blue-400/20', border: 'border-blue-400', btn: 'bg-blue-500 hover:bg-blue-600' },
      green: { text: 'text-green-400', bg: 'bg-green-400', bgLight: 'bg-green-400/20', border: 'border-green-400', btn: 'bg-green-500 hover:bg-green-600' },
      gray: { text: 'text-gray-400', bg: 'bg-gray-400', bgLight: 'bg-gray-400/20', border: 'border-gray-500', btn: 'bg-gray-500 hover:bg-gray-400' },
    }[column.color]

    const groupedItems = groupItemsByCategory(order.order_items)
    
    return (
      <div
        key={order.id}
        draggable
        onDragStart={(e) => handleDragStart(e, order.id)}
        onDragEnd={handleDragEnd}
        className={`bg-slate-700 rounded-xl overflow-hidden border-l-4 ${colorClasses.border} cursor-grab active:cursor-grabbing ${
          draggedOrder === order.id ? 'opacity-50' : ''
        } ${column.key === 'completed' ? 'opacity-60' : ''}`}
      >
        {/* Header commande */}
        <div className="p-3 bg-slate-600/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`${column.key === 'completed' ? 'text-xl' : 'text-2xl'} font-bold`}>
              {order.order_number}
            </span>
            <span className="text-xl">
              {ORDER_TYPE_EMOJI[order.order_type]}
            </span>
            {order.is_offered && (
              <span className="text-lg" title="Offert">🎁</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <span className={`font-mono text-sm ${getTimeColor(order.created_at)}`}>
              {getTimeSince(order.created_at)}
            </span>
            
            {column.nextStatus && (
              <button
                onClick={() => updateStatus(order.id, column.nextStatus!)}
                className={`${colorClasses.btn} text-white w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-lg`}
              >
                {column.nextLabel}
              </button>
            )}
          </div>
        </div>
        
        {/* Items groupés par catégorie */}
        {column.key !== 'completed' && (
          <div className="p-3 space-y-3">
            {groupedItems.map((group, groupIdx) => {
              const catConfig = getCategoryConfig(group.categoryName)
              
              return (
                <div key={groupIdx}>
                  {/* Header catégorie */}
                  <div className={`flex items-center gap-2 mb-2 pb-1 border-b border-slate-600`}>
                    <span className="text-lg">{catConfig.icon}</span>
                    <span className={`text-sm font-semibold uppercase tracking-wide ${catConfig.textClass}`}>
                      {group.categoryName}
                    </span>
                  </div>
                  
                  {/* Items de la catégorie */}
                  <div className="space-y-1">
                    {group.items.map(item => renderOrderItem(item, column.color))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        
        {/* Résumé pour completed */}
        {column.key === 'completed' && (
          <div className="p-3">
            <p className="text-gray-400 text-sm">
              {order.order_items.reduce((sum, item) => sum + item.quantity, 0)} article(s)
            </p>
          </div>
        )}
      </div>
    )
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
            <span className="ml-3 px-2 py-0.5 bg-slate-700 rounded text-sm">
              {displayMode === 'compact' ? '📋 Compact' : '📖 Détaillé'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Toggle mode rapide */}
          <button
            onClick={() => setDisplayMode(displayMode === 'compact' ? 'detailed' : 'compact')}
            className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors"
            title="Changer le mode d'affichage"
          >
            {displayMode === 'compact' ? '📖' : '📋'}
          </button>
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

      {/* Légende des icônes - affiché en mode compact */}
      {displayMode === 'compact' && (
        <div className="mb-4 p-3 bg-slate-800 rounded-xl flex flex-wrap gap-4 text-sm">
          <span className="text-gray-400">Légende :</span>
          <span>🧀 Fromage</span>
          <span>🥩 Viande</span>
          <span>🌶️ Piquant</span>
          <span>🥫 Sauce</span>
          <span>🍳 Œuf</span>
          <span>🧅 Oignon</span>
          <span>🚫 Sans</span>
          <span className="text-yellow-400">⚠️ Qté ≥3</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-96">
          <p className="text-2xl text-gray-400">Chargement des commandes...</p>
        </div>
      ) : (
        <div className={`grid ${gridCols} gap-4 h-[calc(100vh-${displayMode === 'compact' ? '200' : '140'}px)]`}>
          {visibleColumns.map(column => {
            const columnOrders = column.key === 'completed'
              ? allOrders.filter(o => o.status === column.key).slice(-10)
              : allOrders.filter(o => o.status === column.key)
            
            const colorClasses = {
              orange: { text: 'text-orange-400', bg: 'bg-orange-400', bgLight: 'bg-orange-400/20' },
              blue: { text: 'text-blue-400', bg: 'bg-blue-400', bgLight: 'bg-blue-400/20' },
              green: { text: 'text-green-400', bg: 'bg-green-400', bgLight: 'bg-green-400/20' },
              gray: { text: 'text-gray-400', bg: 'bg-gray-400', bgLight: 'bg-gray-400/20' },
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
                    columnOrders.map(order => renderOrder(order, column))
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
        <span>FritOS KDS v2.0</span>
      </div>

      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-2">⚙️ Configuration</h2>
            <p className="text-gray-400 mb-6">{device ? `${device.name} (${device.device_code})` : 'Mode démo'}</p>
            
            {/* Mode d'affichage */}
            <p className="text-gray-300 mb-3">Mode d'affichage :</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => setDisplayMode('detailed')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  displayMode === 'detailed' 
                    ? 'border-orange-500 bg-orange-500/20' 
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                <span className="text-2xl block mb-1">📖</span>
                <span className="font-medium">Détaillé</span>
                <p className="text-xs text-gray-400 mt-1">Options en texte complet</p>
              </button>
              <button
                onClick={() => setDisplayMode('compact')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  displayMode === 'compact' 
                    ? 'border-orange-500 bg-orange-500/20' 
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                <span className="text-2xl block mb-1">📋</span>
                <span className="font-medium">Compact</span>
                <p className="text-xs text-gray-400 mt-1">Options en icônes</p>
              </button>
            </div>
            
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

            {/* Légende des icônes */}
            <div className="bg-slate-700 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-400 mb-3">📋 Légende des icônes :</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span>🧀 Fromage</span>
                <span>🥩 Viande</span>
                <span>🌶️ Piquant</span>
                <span>🥫 Sauce</span>
                <span>🍳 Œuf</span>
                <span>🧅 Oignon</span>
                <span>🥬 Salade</span>
                <span>🍅 Tomate</span>
                <span>🥒 Cornichon</span>
                <span>🌱 Végé</span>
                <span>🍞 Pain</span>
                <span>🚫 Sans</span>
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
                    saveConfig(columnConfig, displayMode)
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
