'use client'

import { useState, useEffect, DragEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

// ==================== TYPES ====================
type OrderItem = {
  id: string
  product_name: string
  quantity: number
  options_selected: string | null
  notes: string | null
  category_name?: string
}

type OrderMetadata = {
  source?: string
  slot_date?: string
  slot_time?: string
  delivery_lat?: number
  delivery_lng?: number
  delivery_duration?: number // Temps de trajet en minutes (si pré-calculé)
}

type Order = {
  id: string
  order_number: string
  order_type: string
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  created_at: string
  order_items: OrderItem[]
  is_offered?: boolean
  // Infos client Click & Collect
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  scheduled_time?: string | null
  delivery_notes?: string | null
  delivery_fee?: number
  metadata?: OrderMetadata | null
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
}

type MergedItem = {
  key: string
  product_name: string
  totalQuantity: number
  options: ParsedOption[]
  notes: string[]
}

type GroupedItems = {
  categoryName: string
  categoryIcon: string
  textClass: string
  bgClass: string
  items: MergedItem[]
  totalCount: number
}

// ==================== CONSTANTS ====================
const ORDER_TYPE_EMOJI: Record<string, string> = {
  eat_in: '🍽️',
  takeaway: '🥡',
  delivery: '🚗',
  pickup: '🛍️',
  table: '📍',
  kiosk: '🖥️',
  counter: '💳',
}

const COLUMNS = [
  { key: 'pending', label: 'À préparer', color: 'orange', nextStatus: 'preparing', nextLabel: '▶️' },
  { key: 'preparing', label: 'En cours', color: 'blue', nextStatus: 'ready', nextLabel: '✅' },
  { key: 'ready', label: 'Prêt', color: 'green', nextStatus: 'completed', nextLabel: '🏁' },
  { key: 'completed', label: 'Clôturé', color: 'gray', nextStatus: null, nextLabel: null },
] as const

const DEFAULT_COLUMNS = ['pending', 'preparing', 'ready', 'completed']
const DEFAULT_COLLAPSED_CATEGORIES = ['boissons', 'bières', 'biere', 'softs', 'drinks']
const DEFAULT_PREP_TIME = 10 // Temps de préparation par défaut en minutes
const DEFAULT_DELIVERY_TIME = 15 // Temps de livraison par défaut en minutes

const CATEGORY_CONFIG: Record<string, { icon: string, bgClass: string, textClass: string }> = {
  'frites': { icon: '🍟', bgClass: 'bg-orange-500/20', textClass: 'text-orange-400' },
  'frite': { icon: '🍟', bgClass: 'bg-orange-500/20', textClass: 'text-orange-400' },
  'snacks': { icon: '🍗', bgClass: 'bg-amber-500/20', textClass: 'text-amber-400' },
  'viandes': { icon: '🥩', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
  'fricadelles': { icon: '🍖', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
  'burgers': { icon: '🍔', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
  'smashburgers': { icon: '🍔', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
  'mitraillette': { icon: '🥖', bgClass: 'bg-yellow-500/20', textClass: 'text-yellow-400' },
  'sauces': { icon: '🥫', bgClass: 'bg-yellow-500/20', textClass: 'text-yellow-400' },
  'salades': { icon: '🥗', bgClass: 'bg-green-500/20', textClass: 'text-green-400' },
  'crudités': { icon: '🥬', bgClass: 'bg-green-500/20', textClass: 'text-green-400' },
  'boissons': { icon: '🥤', bgClass: 'bg-blue-500/20', textClass: 'text-blue-400' },
  'bières': { icon: '🍺', bgClass: 'bg-amber-500/20', textClass: 'text-amber-400' },
  'biere': { icon: '🍺', bgClass: 'bg-amber-500/20', textClass: 'text-amber-400' },
  'desserts': { icon: '🍨', bgClass: 'bg-pink-500/20', textClass: 'text-pink-400' },
  'menus': { icon: '📦', bgClass: 'bg-purple-500/20', textClass: 'text-purple-400' },
  'default': { icon: '📋', bgClass: 'bg-slate-500/20', textClass: 'text-slate-400' },
}

const OPTION_ICONS: { keywords: string[], icon: string, color: string }[] = [
  { keywords: ['cheddar'], icon: '🧀', color: 'text-yellow-400' },
  { keywords: ['feta'], icon: '🔳', color: 'text-white' },
  { keywords: ['provolone'], icon: '🟡', color: 'text-yellow-300' },
  { keywords: ['mozzarella'], icon: '⚪', color: 'text-white' },
  { keywords: ['raclette', 'fromage', 'cheese'], icon: '🧀', color: 'text-yellow-400' },
  { keywords: ['bacon', 'lard'], icon: '🥓', color: 'text-red-400' },
  { keywords: ['viande', 'steak', 'boeuf'], icon: '🥩', color: 'text-red-400' },
  { keywords: ['poulet', 'chicken'], icon: '🍗', color: 'text-amber-400' },
  { keywords: ['cowboy'], icon: '🤠', color: 'text-amber-400' },
  { keywords: ['carotte'], icon: '🥕', color: 'text-orange-400' },
  { keywords: ['oignon', 'oignons'], icon: '🧅', color: 'text-purple-300' },
  { keywords: ['salade', 'laitue'], icon: '🥬', color: 'text-green-400' },
  { keywords: ['tomate', 'tomates'], icon: '🍅', color: 'text-red-400' },
  { keywords: ['cornichon', 'pickles'], icon: '🥒', color: 'text-green-500' },
  { keywords: ['oeuf', 'œuf', 'egg'], icon: '🍳', color: 'text-yellow-300' },
  { keywords: ['frite supp', 'frites supp'], icon: '🍟', color: 'text-yellow-400' },
  { keywords: ['piquant', 'épicé', 'hot'], icon: '🌶️', color: 'text-orange-400' },
  { keywords: ['végé', 'vegan', 'végétarien'], icon: '🌱', color: 'text-green-400' },
  { keywords: ['pain', 'bun', 'wrap', 'pita'], icon: '🍞', color: 'text-amber-400' },
]

const SAUCE_KEYWORDS = ['mayo', 'mayonnaise', 'andalouse', 'américaine', 'american', 'ketchup', 'sauce', 'samurai', 'samourai', 'brasil', 'tartare', 'cocktail', 'curry', 'bbq', 'barbecue', 'moutarde', 'mustard', 'poivre', 'pepper']

// ==================== HELPER FUNCTIONS ====================
function isSauce(optionName: string): boolean {
  if (!optionName) return false
  const lower = optionName.toLowerCase()
  return SAUCE_KEYWORDS.some(kw => lower.includes(kw))
}

function isExclusion(optionName: string): boolean {
  if (!optionName) return false
  const lower = optionName.toLowerCase()
  return lower.startsWith('sans ') || lower.includes('pas de ')
}

function getOptionIcon(optionName: string): { icon: string, color: string } | null {
  if (!optionName) return null
  const lower = optionName.toLowerCase()
  if (isSauce(lower)) return null
  for (const m of OPTION_ICONS) {
    if (m.keywords.some(kw => lower.includes(kw))) return { icon: m.icon, color: m.color }
  }
  return null
}

function getCategoryConfig(categoryName: string | undefined | null) {
  if (!categoryName) return CATEGORY_CONFIG['default']
  const lower = categoryName.toLowerCase()
  for (const [key, config] of Object.entries(CATEGORY_CONFIG)) {
    if (key !== 'default' && lower.includes(key)) return config
  }
  return CATEGORY_CONFIG['default']
}

function isDefaultCollapsed(categoryName: string | undefined | null): boolean {
  if (!categoryName) return false
  const lower = categoryName.toLowerCase()
  return DEFAULT_COLLAPSED_CATEGORIES.some(cat => lower.includes(cat))
}

function parseOptions(optionsJson: string | null): ParsedOption[] {
  if (!optionsJson) return []
  try { 
    const parsed = JSON.parse(optionsJson)
    return Array.isArray(parsed) ? parsed.filter(o => o && o.item_name) : []
  } catch { 
    return [] 
  }
}

function getItemKey(productName: string, options: ParsedOption[]): string {
  const safeName = productName || 'unknown'
  const optionsStr = options
    .filter(o => o && o.item_name)
    .map(o => o.item_name)
    .sort()
    .join('|')
  return `${safeName}::${optionsStr}`
}

function groupAndMergeItems(items: OrderItem[]): GroupedItems[] {
  if (!items || !Array.isArray(items)) return []
  
  const categoryGroups: Record<string, Record<string, MergedItem>> = {}
  
  for (const item of items) {
    if (!item) continue
    const catName = item.category_name || 'Autres'
    const options = parseOptions(item.options_selected)
    const key = getItemKey(item.product_name, options)
    
    if (!categoryGroups[catName]) categoryGroups[catName] = {}
    if (!categoryGroups[catName][key]) {
      categoryGroups[catName][key] = { 
        key, 
        product_name: item.product_name || 'Produit inconnu', 
        totalQuantity: 0, 
        options, 
        notes: [] 
      }
    }
    
    categoryGroups[catName][key].totalQuantity += (item.quantity || 1)
    if (item.notes) categoryGroups[catName][key].notes.push(item.notes)
  }
  
  const categoryOrder = ['frites', 'frite', 'snacks', 'viandes', 'burgers', 'mitraillette', 'sauces', 'salades', 'boissons', 'bières', 'desserts']
  
  return Object.entries(categoryGroups)
    .map(([categoryName, mergedItems]) => {
      const config = getCategoryConfig(categoryName)
      const itemsArray = Object.values(mergedItems)
      return {
        categoryName,
        categoryIcon: config.icon,
        textClass: config.textClass,
        bgClass: config.bgClass,
        items: itemsArray,
        totalCount: itemsArray.reduce((sum, item) => sum + item.totalQuantity, 0),
      }
    })
    .sort((a, b) => {
      const aLower = (a.categoryName || '').toLowerCase()
      const bLower = (b.categoryName || '').toLowerCase()
      const aIdx = categoryOrder.findIndex(c => aLower.includes(c))
      const bIdx = categoryOrder.findIndex(c => bLower.includes(c))
      if (aIdx === -1 && bIdx === -1) return 0
      if (aIdx === -1) return 1
      if (bIdx === -1) return -1
      return aIdx - bIdx
    })
}

function getOrderTypeEmoji(orderType: string | undefined | null): string {
  if (!orderType) return '📋'
  return ORDER_TYPE_EMOJI[orderType] || '📋'
}

// Vérifie si c'est une commande Click & Collect
function isClickAndCollect(order: Order): boolean {
  return order.metadata?.source === 'click_and_collect' || 
         order.order_type === 'pickup' || 
         order.order_type === 'delivery'
}

// Formate l'heure (de ISO à HH:MM)
function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return '--:--'
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '--:--'
  }
}

// ==================== MAIN COMPONENT ====================
export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [offeredOrders, setOfferedOrders] = useState<Order[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [columnConfig, setColumnConfig] = useState<ColumnConfig>({ pending: true, preparing: true, ready: true, completed: true })
  const [displayMode, setDisplayMode] = useState<'compact' | 'detailed'>('detailed')
  const [draggedOrder, setDraggedOrder] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [establishmentId, setEstablishmentId] = useState<string>('a0000000-0000-0000-0000-000000000001')
  const [collapsedSections, setCollapsedSections] = useState<Record<string, Set<string>>>({})
  const [checkedItems, setCheckedItems] = useState<Record<string, Set<string>>>({})
  const [expandedOrderInfo, setExpandedOrderInfo] = useState<Record<string, boolean>>({})
  const [avgPrepTime, setAvgPrepTime] = useState<number>(DEFAULT_PREP_TIME)
  
  const supabase = createClient()

  useEffect(() => { 
    checkAuth() 
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Charger le temps de préparation moyen
  async function loadAvgPrepTime(estId: string) {
    try {
      // Récupérer les commandes complétées des dernières 24h
      const yesterday = new Date()
      yesterday.setHours(yesterday.getHours() - 24)
      
      const { data } = await supabase
        .from('orders')
        .select('created_at, updated_at')
        .eq('establishment_id', estId)
        .eq('status', 'completed')
        .gte('created_at', yesterday.toISOString())
        .not('updated_at', 'is', null)
      
      if (data && data.length > 0) {
        // Calculer la moyenne
        const times = data.map(o => {
          const created = new Date(o.created_at).getTime()
          const updated = new Date(o.updated_at).getTime()
          return (updated - created) / (60 * 1000) // En minutes
        }).filter(t => t > 0 && t < 120) // Filtrer les valeurs aberrantes
        
        if (times.length > 0) {
          const avg = times.reduce((a, b) => a + b, 0) / times.length
          setAvgPrepTime(Math.round(avg))
        }
      }
    } catch (error) {
      console.error('Error loading avg prep time:', error)
    }
  }

  async function checkAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        setAuthChecking(false)
        loadOrders(establishmentId)
        loadTempOrders(establishmentId)
        loadAvgPrepTime(establishmentId)
        setupRealtime(establishmentId)
        return
      }

      const { data: profile } = await supabase.from('profiles').select('role, establishment_id').eq('id', session.user.id).single()

      if (profile?.role?.startsWith('device_kds')) {
        const { data: deviceData } = await supabase.from('devices').select('id, name, device_code, establishment_id, config').eq('auth_user_id', session.user.id).single()
        if (deviceData) {
          const config = typeof deviceData.config === 'string' ? JSON.parse(deviceData.config || '{}') : deviceData.config || {}
          const columns = config.columns || DEFAULT_COLUMNS
          setDevice({ ...deviceData, config })
          setColumnConfig({ pending: columns.includes('pending'), preparing: columns.includes('preparing'), ready: columns.includes('ready'), completed: columns.includes('completed') })
          setDisplayMode(config.displayMode || 'detailed')
          setEstablishmentId(deviceData.establishment_id)
          await supabase.from('devices').update({ last_seen_at: new Date().toISOString() }).eq('id', deviceData.id)
        }
      }

      setAuthChecking(false)
      const estId = device?.establishment_id || establishmentId
      loadOrders(estId)
      loadTempOrders(estId)
      loadAvgPrepTime(estId)
      setupRealtime(estId)
    } catch (error) {
      console.error('Auth check error:', error)
      setAuthChecking(false)
      loadOrders(establishmentId)
      loadTempOrders(establishmentId)
      loadAvgPrepTime(establishmentId)
      setupRealtime(establishmentId)
    }
  }

  async function loadTempOrders(estId: string) {
    try {
      const { data } = await supabase.from('temp_orders').select('*').eq('establishment_id', estId).neq('status', 'completed').order('created_at', { ascending: true })
      if (data) {
        setOfferedOrders(data.map(t => ({ 
          id: t.id, 
          order_number: t.order_number || 'X', 
          order_type: t.order_type || 'takeaway', 
          status: t.status || 'pending', 
          created_at: t.created_at, 
          is_offered: true, 
          order_items: Array.isArray(t.order_items) ? t.order_items : [] 
        })))
      }
    } catch (error) {
      console.error('Load temp orders error:', error)
    }
  }

  function setupRealtime(estId: string) {
    const dbChannel = supabase.channel('orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `establishment_id=eq.${estId}` }, () => { loadOrders(estId); playNotificationSound() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `establishment_id=eq.${estId}` }, () => loadOrders(estId))
      .subscribe()

    const tempChannel = supabase.channel('temp-orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temp_orders', filter: `establishment_id=eq.${estId}` }, () => { loadTempOrders(estId); playNotificationSound() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'temp_orders', filter: `establishment_id=eq.${estId}` }, () => loadTempOrders(estId))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'temp_orders' }, () => loadTempOrders(estId))
      .subscribe()

    return () => { supabase.removeChannel(dbChannel); supabase.removeChannel(tempChannel) }
  }

  function playNotificationSound() {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp+ZjHdtcX2Nqb27sZR3Y2h2lrjP0sKfdVlhc5W70NTDn3VXXmyOpL28sJuGcWpvf5CfoJmQgXZwb3iGlJyblI2CdnBweoqYoZ+Xj4NzcHN9jZmgnJOLfnNxdYKQmZyYkIh9c3F1gI6Ym5eRiH50cnWAjZeamJGJf3VzdIGNlpiXkYl+dHN0gYyVl5aQiH50c3SBjJSWlZCHfnRzdIGLk5WUj4d+dHN0gYuTlJOPh350c3SBi5KUk4+HfnRzdIGLkpSTj4d+dHN0gYuSk5OOhn10c3SBi5GTko6GfXRzdIGKkZKSjoZ9dHN0gYqRkpKOhn10c3SBipGRkY2GfXRzdIGKkJGRjYZ9dHN0gYqQkZGNhn10c3SBio+QkI2FfXRzdIGKj5CQjYV9dHN0gYmPj4+MhX10c3R/')
      audio.volume = 0.5
      audio.play().catch(() => {})
    } catch {}
  }

  async function loadOrders(estId: string) {
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_number, order_type, status, created_at,
          customer_name, customer_phone, customer_email,
          scheduled_time, delivery_notes, delivery_fee, metadata,
          order_items ( id, product_name, quantity, options_selected, notes, product:products ( category:categories ( name ) ) )
        `)
        .eq('establishment_id', estId)
        .gte('created_at', today.toISOString())
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true })
      
      if (!error && data) {
        setOrders(data.map(order => ({ 
          ...order, 
          order_type: order.order_type || 'takeaway',
          metadata: typeof order.metadata === 'string' ? JSON.parse(order.metadata) : order.metadata,
          order_items: Array.isArray(order.order_items) 
            ? order.order_items.map((item: any) => ({ 
                ...item, 
                category_name: item.product?.category?.name || 'Autres' 
              })) 
            : []
        })))
      }
    } catch (error) {
      console.error('Load orders error:', error)
    }
    setLoading(false)
  }

  async function updateStatus(orderId: string, newStatus: string) {
    try {
      const isOffered = offeredOrders.some(o => o.id === orderId)
      if (isOffered) {
        if (newStatus === 'completed') await supabase.from('temp_orders').delete().eq('id', orderId)
        else await supabase.from('temp_orders').update({ status: newStatus }).eq('id', orderId)
      } else {
        await supabase.from('orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', orderId)
      }
      
      if (newStatus === 'completed' || newStatus === 'ready') {
        setCheckedItems(prev => {
          const newState = { ...prev }
          delete newState[orderId]
          return newState
        })
      }
    } catch (error) {
      console.error('Update status error:', error)
    }
  }

  function toggleItemChecked(orderId: string, itemKey: string) {
    setCheckedItems(prev => {
      const orderChecked = prev[orderId] || new Set<string>()
      const newSet = new Set(orderChecked)
      if (newSet.has(itemKey)) newSet.delete(itemKey)
      else newSet.add(itemKey)
      return { ...prev, [orderId]: newSet }
    })
  }

  function isItemChecked(orderId: string, itemKey: string): boolean {
    return checkedItems[orderId]?.has(itemKey) || false
  }

  function toggleOrderInfo(orderId: string) {
    setExpandedOrderInfo(prev => ({ ...prev, [orderId]: !prev[orderId] }))
  }

  // Fonction pour calculer l'heure à laquelle on doit LANCER la préparation
  function getLaunchTime(order: Order): number {
    // Commande sur place (borne, comptoir, table) → created_at (immédiat)
    if (!order.scheduled_time || order.metadata?.source !== 'click_and_collect') {
      return new Date(order.created_at).getTime()
    }
    
    // Commande C&C avec heure programmée
    const scheduledTime = new Date(order.scheduled_time).getTime()
    const prepTime = avgPrepTime * 60 * 1000 // Temps de prépa en ms
    
    // Livraison = soustraire aussi le temps de trajet
    if (order.order_type === 'delivery') {
      const deliveryTime = (order.metadata?.delivery_duration || DEFAULT_DELIVERY_TIME) * 60 * 1000
      return scheduledTime - prepTime - deliveryTime
    }
    
    // Retrait = juste le temps de prépa
    return scheduledTime - prepTime
  }

  // Fonction pour formater l'heure de lancement pour affichage
  function formatLaunchTime(order: Order): { time: string, isNow: boolean, isPast: boolean, isUpcoming: boolean } {
    const launchTime = getLaunchTime(order)
    const now = currentTime.getTime()
    const diffMinutes = (launchTime - now) / (60 * 1000)
    
    // Sur place = toujours "maintenant"
    if (!order.scheduled_time || order.metadata?.source !== 'click_and_collect') {
      return { time: 'MAINTENANT', isNow: true, isPast: false, isUpcoming: false }
    }
    
    const launchDate = new Date(launchTime)
    const timeStr = launchDate.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
    
    return {
      time: timeStr,
      isNow: diffMinutes <= 0 && diffMinutes > -10, // Dans les 10 dernières minutes
      isPast: diffMinutes <= -10, // En retard de plus de 10 min
      isUpcoming: diffMinutes > 0 && diffMinutes <= 15 // Dans les 15 prochaines minutes
    }
  }

  const allOrders = [...orders, ...offeredOrders].sort((a, b) => getLaunchTime(a) - getLaunchTime(b))

  async function saveConfig(newConfig: ColumnConfig, newDisplayMode: 'compact' | 'detailed') {
    if (!device) return
    const columns = Object.entries(newConfig).filter(([_, v]) => v).map(([k]) => k)
    if (columns.length === 0) return
    const updatedConfig = { ...device.config, columns, displayMode: newDisplayMode }
    const { error } = await supabase.from('devices').update({ config: updatedConfig }).eq('id', device.id)
    if (!error) { setColumnConfig(newConfig); setDisplayMode(newDisplayMode); setDevice({ ...device, config: updatedConfig }) }
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

  function toggleSection(orderId: string, categoryName: string) {
    setCollapsedSections(prev => {
      const orderSections = prev[orderId] || new Set<string>()
      const newSet = new Set(orderSections)
      if (newSet.has(categoryName)) newSet.delete(categoryName)
      else newSet.add(categoryName)
      return { ...prev, [orderId]: newSet }
    })
  }

  function isSectionCollapsed(orderId: string, categoryName: string): boolean {
    if (collapsedSections[orderId]) return collapsedSections[orderId].has(categoryName)
    return isDefaultCollapsed(categoryName)
  }

  function handleDragStart(e: DragEvent, orderId: string) { setDraggedOrder(orderId); e.dataTransfer.effectAllowed = 'move' }
  function handleDragEnd() { setDraggedOrder(null); setDragOverColumn(null) }
  function handleDragOver(e: DragEvent, columnKey: string) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverColumn(columnKey) }
  function handleDragLeave() { setDragOverColumn(null) }
  function handleDrop(e: DragEvent, newStatus: string) { e.preventDefault(); if (draggedOrder) updateStatus(draggedOrder, newStatus); setDraggedOrder(null); setDragOverColumn(null) }

  function renderMergedItem(item: MergedItem, orderId: string) {
    const isHigh = item.totalQuantity >= 2
    const isVeryHigh = item.totalQuantity >= 4
    const isChecked = isItemChecked(orderId, item.key)
    
    let containerClass = 'cursor-pointer transition-all '
    let qtyBgClass = 'bg-slate-500'
    
    if (isChecked) {
      containerClass += 'bg-green-500/30 border-l-4 border-green-500 opacity-60'
      qtyBgClass = 'bg-green-600'
    } else if (isVeryHigh) {
      containerClass += 'bg-red-500/30 border-l-4 border-red-500 animate-pulse'
      qtyBgClass = 'bg-red-500'
    } else if (isHigh) {
      containerClass += 'bg-yellow-500/20 border-l-4 border-yellow-500'
      qtyBgClass = 'bg-yellow-500'
    }
    
    return (
      <div key={item.key} className={`rounded-lg p-2 ${containerClass}`} onClick={() => toggleItemChecked(orderId, item.key)}>
        <div className="flex items-start gap-2">
          <div className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isChecked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-400 hover:border-green-400'}`}>
            {isChecked && <span className="text-sm">✓</span>}
          </div>
          
          <span className={`${qtyBgClass} text-white min-w-[32px] h-8 rounded flex items-center justify-center text-base font-bold flex-shrink-0`}>
            {item.totalQuantity}
          </span>
          <div className="flex-1 min-w-0">
            <p className={`font-medium ${isHigh ? 'text-lg font-bold' : ''} ${isChecked ? 'line-through text-gray-400' : ''}`}>
              {item.product_name}
              {isVeryHigh && !isChecked && <span className="ml-2">⚠️</span>}
            </p>
            {displayMode === 'detailed' && item.options.length > 0 && (
              <div className={`flex flex-wrap gap-1 mt-1 ${isChecked ? 'opacity-50' : ''}`}>
                {item.options.map((opt, idx) => {
                  const iconData = getOptionIcon(opt.item_name)
                  const excluded = isExclusion(opt.item_name)
                  return (
                    <span key={idx} className={`inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded-full ${excluded ? 'bg-gray-600 text-gray-300 line-through' : 'bg-slate-600 text-gray-200'}`}>
                      {excluded && <span>🚫</span>}
                      {iconData && <span className={iconData.color}>{iconData.icon}</span>}
                      <span>{opt.item_name}</span>
                    </span>
                  )
                })}
              </div>
            )}
            {displayMode === 'compact' && item.options.length > 0 && (
              <div className={`flex flex-wrap gap-1 mt-1 ${isChecked ? 'opacity-50' : ''}`}>
                {item.options.map((opt, idx) => {
                  const iconData = getOptionIcon(opt.item_name)
                  const excluded = isExclusion(opt.item_name)
                  if (iconData) return <span key={idx} className={`text-lg ${excluded ? 'opacity-50' : ''}`} title={opt.item_name}>{excluded && '🚫'}{iconData.icon}</span>
                  return <span key={idx} className={`text-xs px-1.5 py-0.5 rounded ${excluded ? 'bg-gray-600 line-through' : 'bg-slate-600'}`} title={opt.item_name}>{excluded && '🚫'}{opt.item_name}</span>
                })}
              </div>
            )}
            {item.notes.length > 0 && !isChecked && item.notes.map((note, idx) => <p key={idx} className="text-yellow-400 text-sm mt-1">📝 {note}</p>)}
          </div>
        </div>
      </div>
    )
  }

  // Render les infos client pour Click & Collect
  function renderOrderInfo(order: Order) {
    if (!isClickAndCollect(order)) return null
    
    const isExpanded = expandedOrderInfo[order.id]
    const launchInfo = formatLaunchTime(order)
    
    return (
      <div className="border-t border-slate-600">
        {/* Bouton pour toggle + indicateur temps de préparation */}
        <button 
          onClick={(e) => { e.stopPropagation(); toggleOrderInfo(order.id) }}
          className="w-full p-2 flex items-center justify-between hover:bg-slate-600/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-1 rounded ${
              launchInfo.isPast ? 'bg-red-500 text-white animate-pulse' :
              launchInfo.isNow ? 'bg-red-500 text-white' :
              launchInfo.isUpcoming ? 'bg-orange-500 text-white' :
              'bg-cyan-500/30 text-cyan-300'
            }`}>
              🚀 Lancer à {launchInfo.time}
            </span>
            {order.order_type === 'delivery' && <span className="text-xs text-gray-400">🚗 Livraison</span>}
            {order.order_type === 'takeaway' && <span className="text-xs text-gray-400">🛍️ Retrait</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              📅 Pour {formatTime(order.scheduled_time)}
            </span>
            <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
          </div>
        </button>
        
        {/* Détails client (expanded) */}
        {isExpanded && (
          <div className="p-3 bg-slate-800/50 space-y-2 text-sm">
            {order.customer_name && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">👤</span>
                <span className="text-white">{order.customer_name}</span>
              </div>
            )}
            {order.customer_phone && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">📞</span>
                <a href={`tel:${order.customer_phone}`} className="text-cyan-400 hover:underline">
                  {order.customer_phone}
                </a>
              </div>
            )}
            {order.customer_email && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">✉️</span>
                <span className="text-gray-300 text-xs truncate">{order.customer_email}</span>
              </div>
            )}
            {order.scheduled_time && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">🎯</span>
                <span className="text-white">
                  {order.order_type === 'delivery' ? 'Livrer' : 'Prêt'} pour {formatTime(order.scheduled_time)}
                </span>
              </div>
            )}
            {order.order_type === 'delivery' && order.delivery_notes && (
              <div className="flex items-start gap-2">
                <span className="text-gray-400">📍</span>
                <span className="text-white">{order.delivery_notes}</span>
              </div>
            )}
            {order.delivery_fee && order.delivery_fee > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">💰</span>
                <span className="text-green-400">Frais livraison: {order.delivery_fee.toFixed(2)}€</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-600 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>⏱️ Prépa: ~{avgPrepTime} min</span>
                {order.order_type === 'delivery' && (
                  <span>🚗 Trajet: ~{order.metadata?.delivery_duration || DEFAULT_DELIVERY_TIME} min</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderOrder(order: Order, column: typeof COLUMNS[number]) {
    const colorClasses = {
      orange: { text: 'text-orange-400', bg: 'bg-orange-400', bgLight: 'bg-orange-400/20', border: 'border-orange-400', btn: 'bg-orange-500 hover:bg-orange-600' },
      blue: { text: 'text-blue-400', bg: 'bg-blue-400', bgLight: 'bg-blue-400/20', border: 'border-blue-400', btn: 'bg-blue-500 hover:bg-blue-600' },
      green: { text: 'text-green-400', bg: 'bg-green-400', bgLight: 'bg-green-400/20', border: 'border-green-400', btn: 'bg-green-500 hover:bg-green-600' },
      gray: { text: 'text-gray-400', bg: 'bg-gray-400', bgLight: 'bg-gray-400/20', border: 'border-gray-500', btn: 'bg-gray-500 hover:bg-gray-400' },
    }[column.color]

    const groupedItems = groupAndMergeItems(order.order_items)
    const totalItems = groupedItems.reduce((sum, g) => sum + g.items.length, 0)
    const checkedCount = groupedItems.reduce((sum, g) => sum + g.items.filter(item => isItemChecked(order.id, item.key)).length, 0)
    const allChecked = totalItems > 0 && checkedCount === totalItems
    const isCC = isClickAndCollect(order)
    const launchInfo = formatLaunchTime(order)
    
    // Déterminer le style d'urgence
    const showUrgentStyle = launchInfo.isNow || launchInfo.isPast
    const showUpcomingStyle = launchInfo.isUpcoming
    
    return (
      <div key={order.id} draggable onDragStart={(e) => handleDragStart(e, order.id)} onDragEnd={handleDragEnd}
        className={`bg-slate-700 rounded-xl overflow-hidden border-l-4 ${colorClasses.border} cursor-grab active:cursor-grabbing ${draggedOrder === order.id ? 'opacity-50' : ''} ${column.key === 'completed' ? 'opacity-60' : ''} ${allChecked ? 'ring-2 ring-green-500' : ''} ${showUrgentStyle && column.key === 'pending' ? 'ring-2 ring-red-500' : ''} ${showUpcomingStyle && column.key === 'pending' ? 'ring-2 ring-orange-500' : ''}`}>
        
        <div className={`p-3 flex items-center justify-between ${launchInfo.isPast ? 'bg-red-500/40' : launchInfo.isNow ? 'bg-red-500/30' : launchInfo.isUpcoming ? 'bg-orange-500/20' : 'bg-slate-600/50'}`}>
          <div className="flex items-center gap-2">
            <span className={`${column.key === 'completed' ? 'text-xl' : 'text-2xl'} font-bold`}>{order.order_number || '?'}</span>
            <span className="text-xl">{getOrderTypeEmoji(order.order_type)}</span>
            {order.is_offered && <span className="text-lg" title="Offert">🎁</span>}
            {/* Badge de timing */}
            {column.key !== 'completed' && (
              <span className={`text-xs px-2 py-1 rounded font-bold ${
                launchInfo.isPast ? 'bg-red-500 text-white animate-pulse' :
                launchInfo.isNow ? 'bg-red-500 text-white' :
                launchInfo.isUpcoming ? 'bg-orange-500 text-white' :
                isCC ? 'bg-cyan-500/30 text-cyan-300' : 'bg-slate-500 text-gray-300'
              }`}>
                {launchInfo.isNow ? '🔥 MAINTENANT' : 
                 launchInfo.isPast ? `⚠️ RETARD` :
                 launchInfo.isUpcoming ? `⏰ ${launchInfo.time}` :
                 isCC ? `⏰ ${launchInfo.time}` : '🍽️'}
              </span>
            )}
            {isCC && <span className="text-xs text-gray-400">{order.order_type === 'delivery' ? '🚗' : '🛍️'}</span>}
            {column.key !== 'completed' && totalItems > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${allChecked ? 'bg-green-500 text-white' : 'bg-slate-500 text-gray-300'}`}>
                {checkedCount}/{totalItems}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-sm ${getTimeColor(order.created_at)}`}>{getTimeSince(order.created_at)}</span>
            {column.nextStatus && (
              <button onClick={() => updateStatus(order.id, column.nextStatus!)} className={`${colorClasses.btn} text-white w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-lg`}>
                {column.nextLabel}
              </button>
            )}
          </div>
        </div>
        
        {/* Infos Click & Collect */}
        {column.key !== 'completed' && renderOrderInfo(order)}
        
        {column.key !== 'completed' && (
          <div className="p-3 space-y-2">
            {groupedItems.map((group, idx) => {
              const isCollapsed = isSectionCollapsed(order.id, group.categoryName)
              const isSelfService = isDefaultCollapsed(group.categoryName)
              const catCheckedCount = group.items.filter(item => isItemChecked(order.id, item.key)).length
              const catAllChecked = group.items.length > 0 && catCheckedCount === group.items.length
              
              return (
                <div key={idx}>
                  <button onClick={() => toggleSection(order.id, group.categoryName)}
                    className={`w-full flex items-center gap-2 mb-1 pb-1 border-b border-slate-600 hover:bg-slate-600/50 rounded transition-colors ${isCollapsed ? 'opacity-70' : ''} ${catAllChecked ? 'opacity-50' : ''}`}>
                    <span className="text-lg">{group.categoryIcon}</span>
                    <span className={`text-sm font-semibold uppercase tracking-wide ${group.textClass} ${catAllChecked ? 'line-through' : ''}`}>{group.categoryName}</span>
                    <span className={`ml-auto px-2 py-0.5 rounded text-xs font-bold ${catAllChecked ? 'bg-green-500/30 text-green-400' : `${group.bgClass} ${group.textClass}`}`}>
                      {catAllChecked ? '✓' : group.totalCount}
                    </span>
                    {isSelfService && <span className="text-xs text-gray-400" title="Self-service">🙋</span>}
                    <span className="text-gray-400">{isCollapsed ? '▶' : '▼'}</span>
                  </button>
                  {!isCollapsed && <div className="space-y-1 ml-2">{group.items.map(item => renderMergedItem(item, order.id))}</div>}
                </div>
              )
            })}
          </div>
        )}
        
        {column.key === 'completed' && (
          <div className="p-3">
            <p className="text-gray-400 text-sm">{order.order_items.reduce((sum, item) => sum + (item.quantity || 0), 0)} article(s)</p>
          </div>
        )}
      </div>
    )
  }

  if (authChecking) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-white text-center">
        <span className="text-8xl block mb-4">👨‍🍳</span>
        <p className="text-2xl">Chargement...</p>
      </div>
    </div>
  )

  const visibleColumns = COLUMNS.filter(col => columnConfig[col.key as keyof ColumnConfig])
  const gridCols = visibleColumns.length === 1 ? 'grid-cols-1' : visibleColumns.length === 2 ? 'grid-cols-2' : visibleColumns.length === 3 ? 'grid-cols-3' : 'grid-cols-4'

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">👨‍🍳 Cuisine - MDjambo</h1>
          <p className="text-gray-400">
            {device ? `${device.name} (${device.device_code})` : 'Mode démo'}
            <span className="ml-2 text-green-400">● En ligne</span>
            <span className="ml-3 px-2 py-0.5 bg-slate-700 rounded text-sm">{displayMode === 'compact' ? '📋 Compact' : '📖 Détaillé'}</span>
            <span className="ml-3 px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded text-sm">⏱️ Prépa moy: {avgPrepTime}min</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setDisplayMode(displayMode === 'compact' ? 'detailed' : 'compact')} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors" title="Changer le mode d'affichage">
            {displayMode === 'compact' ? '📖' : '📋'}
          </button>
          <button onClick={() => setShowConfig(true)} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors">⚙️</button>
          <div className="text-right">
            <p className="text-4xl font-mono">{currentTime.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="text-gray-400">{currentTime.toLocaleDateString('fr-BE', { weekday: 'long', day: '2-digit', month: '2-digit' })}</p>
          </div>
        </div>
      </div>

      <div className="mb-4 p-3 bg-slate-800 rounded-xl flex flex-wrap gap-4 text-sm">
        <span className="text-gray-400">Priorité :</span>
        <span className="bg-red-500 text-white px-2 py-0.5 rounded font-bold">🔥 MAINTENANT</span>
        <span className="bg-red-500/50 text-white px-2 py-0.5 rounded">⚠️ RETARD</span>
        <span className="bg-orange-500 text-white px-2 py-0.5 rounded">⏰ Bientôt</span>
        <span className="bg-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded">⏰ Programmé</span>
        <span className="text-gray-400">|</span>
        <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded">✓ = dans le sac</span>
        <span className="bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">2+ qté</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-96"><p className="text-2xl text-gray-400">Chargement des commandes...</p></div>
      ) : (
        <div className={`grid ${gridCols} gap-4`} style={{ height: 'calc(100vh - 180px)' }}>
          {visibleColumns.map(column => {
            const columnOrders = column.key === 'completed' ? allOrders.filter(o => o.status === column.key).slice(-10) : allOrders.filter(o => o.status === column.key)
            const colorClasses = { orange: { text: 'text-orange-400', bg: 'bg-orange-400', bgLight: 'bg-orange-400/20' }, blue: { text: 'text-blue-400', bg: 'bg-blue-400', bgLight: 'bg-blue-400/20' }, green: { text: 'text-green-400', bg: 'bg-green-400', bgLight: 'bg-green-400/20' }, gray: { text: 'text-gray-400', bg: 'bg-gray-400', bgLight: 'bg-gray-400/20' } }[column.color]

            return (
              <div key={column.key} className={`bg-slate-800 rounded-xl p-4 overflow-y-auto transition-all ${dragOverColumn === column.key ? 'ring-2 ring-white/50 bg-slate-700' : ''}`}
                onDragOver={(e) => handleDragOver(e, column.key)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, column.key)}>
                <h2 className={`text-lg font-bold ${colorClasses.text} mb-4 flex items-center gap-2 sticky top-0 bg-slate-800 py-2 z-10`}>
                  <span className={`w-3 h-3 ${colorClasses.bg} rounded-full ${column.key === 'pending' ? 'animate-pulse' : ''}`}></span>
                  {column.label}
                  <span className={`ml-auto ${colorClasses.bgLight} px-2 py-0.5 rounded text-sm`}>{columnOrders.length}</span>
                </h2>
                <div className="space-y-3">
                  {columnOrders.length === 0 ? <p className="text-gray-500 text-center py-8">Aucune commande</p> : columnOrders.map(order => renderOrder(order, column))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-4 flex justify-between items-center text-gray-500 text-sm">
        <span>💡 Cliquez sur un item pour le cocher • Cliquez sur ⏰ pour voir les infos client</span>
        <span>{allOrders.length} commande{allOrders.length > 1 ? 's' : ''} aujourd'hui</span>
        <span>FritOS KDS v3.0 Smart</span>
      </div>

      {showConfig && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-2">⚙️ Configuration</h2>
            <p className="text-gray-400 mb-6">{device ? `${device.name} (${device.device_code})` : 'Mode démo'}</p>
            
            <p className="text-gray-300 mb-3">Mode d'affichage :</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button onClick={() => setDisplayMode('detailed')} className={`p-4 rounded-xl border-2 transition-all ${displayMode === 'detailed' ? 'border-orange-500 bg-orange-500/20' : 'border-slate-600 hover:border-slate-500'}`}>
                <span className="text-2xl block mb-1">📖</span><span className="font-medium">Détaillé</span><p className="text-xs text-gray-400 mt-1">Options en texte complet</p>
              </button>
              <button onClick={() => setDisplayMode('compact')} className={`p-4 rounded-xl border-2 transition-all ${displayMode === 'compact' ? 'border-orange-500 bg-orange-500/20' : 'border-slate-600 hover:border-slate-500'}`}>
                <span className="text-2xl block mb-1">📋</span><span className="font-medium">Compact</span><p className="text-xs text-gray-400 mt-1">Options en icônes</p>
              </button>
            </div>
            
            <p className="text-gray-300 mb-4">Colonnes affichées :</p>
            <div className="space-y-3 mb-6">
              {COLUMNS.map(col => {
                const colorClasses = { orange: 'bg-orange-400', blue: 'bg-blue-400', green: 'bg-green-400', gray: 'bg-gray-400' }[col.color]
                return (
                  <label key={col.key} className="flex items-center gap-3 p-3 bg-slate-700 rounded-xl cursor-pointer hover:bg-slate-600 transition-colors">
                    <input type="checkbox" checked={columnConfig[col.key as keyof ColumnConfig]} onChange={(e) => { const newConfig = { ...columnConfig, [col.key]: e.target.checked }; if (Object.values(newConfig).some(v => v)) setColumnConfig(newConfig) }} className="w-5 h-5 rounded" />
                    <span className={`w-3 h-3 ${colorClasses} rounded-full`}></span>
                    <span className="font-medium">{col.label}</span>
                  </label>
                )
              })}
            </div>

            <div className="bg-slate-700 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-400 mb-2">💡 Presets :</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setColumnConfig({ pending: true, preparing: true, ready: false, completed: false })} className="text-left px-3 py-2 rounded bg-slate-600 hover:bg-slate-500 text-sm">🍳 Cuisine</button>
                <button onClick={() => setColumnConfig({ pending: false, preparing: true, ready: true, completed: false })} className="text-left px-3 py-2 rounded bg-slate-600 hover:bg-slate-500 text-sm">📦 Emballage</button>
                <button onClick={() => setColumnConfig({ pending: false, preparing: false, ready: true, completed: false })} className="text-left px-3 py-2 rounded bg-slate-600 hover:bg-slate-500 text-sm">📢 Écran client</button>
                <button onClick={() => setColumnConfig({ pending: true, preparing: true, ready: true, completed: true })} className="text-left px-3 py-2 rounded bg-slate-600 hover:bg-slate-500 text-sm">📺 Complet</button>
              </div>
            </div>

            <div className="bg-cyan-500/20 rounded-xl p-4 mb-6">
              <p className="text-sm text-cyan-300 mb-2">⏰ Calcul intelligent :</p>
              <p className="text-xs text-cyan-200">
                L'heure "Préparer à" est calculée automatiquement :<br/>
                <strong>Heure demandée - Temps trajet (livraison) - Temps prépa moyen ({avgPrepTime}min)</strong>
              </p>
            </div>

            <div className="bg-slate-700 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-400 mb-3">📋 Légende des icônes :</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span>🧀 Cheddar/Fromage</span><span>🔳 Feta</span>
                <span>🟡 Provolone</span><span>⚪ Mozzarella</span>
                <span>🥓 Bacon</span><span>🥩 Viande/Steak</span>
                <span>🥕 Carotte</span><span>🧅 Oignon</span>
                <span>🥬 Salade</span><span>🍅 Tomate</span>
                <span>🥒 Cornichon</span><span>🍳 Œuf</span>
                <span>🌶️ Piquant</span><span>🚫 Sans...</span>
              </div>
              <p className="text-xs text-gray-500 mt-3">Les sauces s'affichent en texte (pas d'icône)</p>
            </div>
            
            <div className="bg-green-500/20 rounded-xl p-4 mb-6">
              <p className="text-sm text-green-300 mb-2">✓ Fonction cochage :</p>
              <p className="text-xs text-green-200">Cliquez sur un item pour le marquer comme "dans le sac". Un compteur X/Y s'affiche sur chaque commande.</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowConfig(false)} className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 rounded-xl transition-colors">Fermer</button>
              {device && <button onClick={() => { saveConfig(columnConfig, displayMode); setShowConfig(false) }} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors">💾 Sauvegarder</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}