'use client'

import { useState, useEffect, DragEvent, TouchEvent, useRef } from 'react'
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
  delivery_duration?: number
}

type Order = {
  id: string
  order_number: string
  order_type: string
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  created_at: string
  order_items: OrderItem[]
  is_offered?: boolean
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  scheduled_time?: string | null
  delivery_notes?: string | null
  delivery_fee?: number
  metadata?: OrderMetadata | null
  suggested_round_id?: string | null
}

type SuggestedRoundOrder = {
  order_id: string
  order_number: string
  sequence_order: number
  estimated_delivery: string
  customer_name: string | null
  delivery_address: string | null
  scheduled_time: string | null
  total: number
  status: string
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
const DEFAULT_PREP_TIME = 10
const DEFAULT_DELIVERY_TIME = 15

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
  const optionsStr = options.filter(o => o && o.item_name).map(o => o.item_name).sort().join('|')
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
      categoryGroups[catName][key] = { key, product_name: item.product_name || 'Produit inconnu', totalQuantity: 0, options, notes: [] }
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
        categoryName, categoryIcon: config.icon, textClass: config.textClass, bgClass: config.bgClass,
        items: itemsArray, totalCount: itemsArray.reduce((sum, item) => sum + item.totalQuantity, 0),
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

function isClickAndCollect(order: Order): boolean {
  return order.metadata?.source === 'click_and_collect' || order.order_type === 'pickup' || order.order_type === 'delivery'
}

function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return '--:--'
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
  } catch { return '--:--' }
}

// ==================== MAIN COMPONENT ====================
export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [offeredOrders, setOfferedOrders] = useState<Order[]>([])
  const [suggestedRounds, setSuggestedRounds] = useState<SuggestedRound[]>([])
  const [acceptedRounds, setAcceptedRounds] = useState<SuggestedRound[]>([])
  const [availableDrivers, setAvailableDrivers] = useState<number>(0)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [showDeliveryPanel, setShowDeliveryPanel] = useState(false)
  const [columnConfig, setColumnConfig] = useState<ColumnConfig>({ pending: true, preparing: true, ready: true, completed: true })
  const [displayMode, setDisplayMode] = useState<'compact' | 'detailed'>('detailed')
  const [draggedOrder, setDraggedOrder] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  
  // Touch drag states
  const [touchDragOrder, setTouchDragOrder] = useState<string | null>(null)
  const [touchStartPos, setTouchStartPos] = useState<{ x: number, y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragGhostRef = useRef<HTMLDivElement>(null)
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

  async function loadAvgPrepTime(estId: string) {
    try {
      const yesterday = new Date()
      yesterday.setHours(yesterday.getHours() - 24)
      
      const { data } = await supabase
        .from('orders')
        .select('preparation_started_at, updated_at')
        .eq('establishment_id', estId)
        .eq('status', 'completed')
        .gte('created_at', yesterday.toISOString())
        .not('preparation_started_at', 'is', null)
        .not('updated_at', 'is', null)
      
      if (data && data.length > 0) {
        const times = data.map(o => {
          const started = new Date(o.preparation_started_at).getTime()
          const completed = new Date(o.updated_at).getTime()
          return (completed - started) / (60 * 1000)
        }).filter(t => t > 0 && t < 60)
        
        if (times.length > 0) {
          const avg = times.reduce((a, b) => a + b, 0) / times.length
          setAvgPrepTime(Math.round(avg))
        }
      }
    } catch (error) {
      console.error('Error loading avg prep time:', error)
    }
  }

  async function loadAvailableDrivers(estId: string) {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('id')
        .eq('establishment_id', estId)
        .eq('status', 'available')
        .eq('is_active', true)
      
      if (!error && data) {
        setAvailableDrivers(data.length)
      }
    } catch (error) {
      console.error('Error loading drivers:', error)
    }
  }

  async function loadSuggestedRounds(estId: string) {
    try {
      // Charger les suggestions pending
      const { data: pendingData } = await supabase
        .from('v_suggested_rounds_details')
        .select('*')
        .eq('establishment_id', estId)
        .eq('status', 'pending')
        .order('prep_at', { ascending: true })
      
      if (pendingData) {
        setSuggestedRounds(pendingData.map((r: any) => ({
          ...r,
          orders: r.orders || []
        })))
      }

      // Charger les tournées acceptées (pour affichage groupé)
      const { data: acceptedData } = await supabase
        .from('v_suggested_rounds_details')
        .select('*')
        .eq('establishment_id', estId)
        .eq('status', 'accepted')
        .order('prep_at', { ascending: true })
      
      if (acceptedData) {
        setAcceptedRounds(acceptedData.map((r: any) => ({
          ...r,
          orders: r.orders || []
        })))
      }
    } catch (error) {
      console.error('Error loading suggested rounds:', error)
    }
  }

  async function acceptSuggestedRound(roundId: string) {
    try {
      const { data, error } = await supabase.rpc('accept_suggested_round', {
        p_suggested_round_id: roundId
      })
      
      if (error) {
        console.error('Error accepting round:', error)
        alert('Erreur lors de l\'acceptation de la tournée')
        return
      }
      
      if (data?.success) {
        // Recharger les données
        loadSuggestedRounds(establishmentId)
        loadOrders(establishmentId)
      } else {
        alert(data?.error || 'Erreur inconnue')
      }
    } catch (error) {
      console.error('Error accepting round:', error)
    }
  }

  async function rejectSuggestedRound(roundId: string) {
    try {
      const { data, error } = await supabase.rpc('reject_suggested_round', {
        p_suggested_round_id: roundId
      })
      
      if (error) {
        console.error('Error rejecting round:', error)
        return
      }
      
      if (data?.success) {
        loadSuggestedRounds(establishmentId)
      }
    } catch (error) {
      console.error('Error rejecting round:', error)
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
        loadSuggestedRounds(establishmentId)
        loadAvailableDrivers(establishmentId)
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
      loadSuggestedRounds(estId)
      loadAvailableDrivers(estId)
      setupRealtime(estId)
    } catch (error) {
      console.error('Auth check error:', error)
      setAuthChecking(false)
      loadOrders(establishmentId)
      loadTempOrders(establishmentId)
      loadAvgPrepTime(establishmentId)
      loadSuggestedRounds(establishmentId)
      loadAvailableDrivers(establishmentId)
      setupRealtime(establishmentId)
    }
  }

  async function loadTempOrders(estId: string) {
    try {
      const { data } = await supabase.from('temp_orders').select('*').eq('establishment_id', estId).neq('status', 'completed').order('created_at', { ascending: true })
      if (data) {
        setOfferedOrders(data.map(t => ({ 
          id: t.id, order_number: t.order_number || 'X', order_type: t.order_type || 'takeaway', 
          status: t.status || 'pending', created_at: t.created_at, is_offered: true, 
          order_items: Array.isArray(t.order_items) ? t.order_items : [] 
        })))
      }
    } catch (error) {
      console.error('Load temp orders error:', error)
    }
  }

  function setupRealtime(estId: string) {
    const dbChannel = supabase.channel('orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `establishment_id=eq.${estId}` }, () => { loadOrders(estId); loadSuggestedRounds(estId); playNotificationSound() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `establishment_id=eq.${estId}` }, () => { loadOrders(estId); loadSuggestedRounds(estId) })
      .subscribe()

    const tempChannel = supabase.channel('temp-orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temp_orders', filter: `establishment_id=eq.${estId}` }, () => { loadTempOrders(estId); playNotificationSound() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'temp_orders', filter: `establishment_id=eq.${estId}` }, () => loadTempOrders(estId))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'temp_orders' }, () => loadTempOrders(estId))
      .subscribe()

    const suggestedChannel = supabase.channel('suggested-rounds-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suggested_rounds', filter: `establishment_id=eq.${estId}` }, () => loadSuggestedRounds(estId))
      .subscribe()

    const driversChannel = supabase.channel('drivers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `establishment_id=eq.${estId}` }, () => loadAvailableDrivers(estId))
      .subscribe()

    return () => { 
      supabase.removeChannel(dbChannel)
      supabase.removeChannel(tempChannel)
      supabase.removeChannel(suggestedChannel)
      supabase.removeChannel(driversChannel)
    }
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
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
      
      // Charger les commandes:
      // 1. Créées aujourd'hui OU
      // 2. Programmées pour aujourd'hui (même si créées hier) OU
      // 3. Non terminées (pending, preparing, ready)
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_number, order_type, status, created_at,
          customer_name, customer_phone, customer_email,
          scheduled_time, delivery_notes, delivery_fee, metadata, suggested_round_id,
          order_items ( id, product_name, quantity, options_selected, notes, product:products ( category:categories ( name ) ) )
        `)
        .eq('establishment_id', estId)
        .neq('status', 'cancelled')
        .or(`created_at.gte.${today.toISOString()},and(scheduled_time.gte.${today.toISOString()},scheduled_time.lt.${tomorrow.toISOString()}),status.in.(pending,preparing,ready)`)
        .order('created_at', { ascending: true })
      
      if (!error && data) {
        setOrders(data.map(order => ({ 
          ...order, 
          order_type: order.order_type || 'takeaway',
          metadata: typeof order.metadata === 'string' ? JSON.parse(order.metadata) : order.metadata,
          order_items: Array.isArray(order.order_items) 
            ? order.order_items.map((item: any) => ({ ...item, category_name: item.product?.category?.name || 'Autres' })) 
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
        const updateData: any = { status: newStatus, updated_at: new Date().toISOString() }
        if (newStatus === 'preparing') {
          updateData.preparation_started_at = new Date().toISOString()
        }
        await supabase.from('orders').update(updateData).eq('id', orderId)
      }
      
      if (newStatus === 'completed' || newStatus === 'ready') {
        setCheckedItems(prev => { const newState = { ...prev }; delete newState[orderId]; return newState })
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

  function getLaunchTime(order: Order): number {
    if (!order.scheduled_time || order.metadata?.source !== 'click_and_collect') {
      return new Date(order.created_at).getTime()
    }
    const scheduledTime = new Date(order.scheduled_time).getTime()
    const prepTime = avgPrepTime * 60 * 1000
    if (order.order_type === 'delivery') {
      const deliveryTime = (order.metadata?.delivery_duration || DEFAULT_DELIVERY_TIME) * 60 * 1000
      return scheduledTime - prepTime - deliveryTime
    }
    return scheduledTime - prepTime
  }

  function formatLaunchTime(order: Order): { time: string, isNow: boolean, isPast: boolean, isUpcoming: boolean } {
    const launchTime = getLaunchTime(order)
    const now = currentTime.getTime()
    const diffMinutes = (launchTime - now) / (60 * 1000)
    
    if (!order.scheduled_time || order.metadata?.source !== 'click_and_collect') {
      return { time: 'MAINTENANT', isNow: true, isPast: false, isUpcoming: false }
    }
    
    const launchDate = new Date(launchTime)
    const timeStr = launchDate.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
    
    return {
      time: timeStr,
      isNow: diffMinutes <= 0 && diffMinutes > -10,
      isPast: diffMinutes <= -10,
      isUpcoming: diffMinutes > 0 && diffMinutes <= 15
    }
  }

  // Trouver la tournée acceptée pour une commande
  function getAcceptedRoundForOrder(orderId: string): SuggestedRound | null {
    for (const round of acceptedRounds) {
      if (round.orders.some(o => o.order_id === orderId)) {
        return round
      }
    }
    return null
  }

  // Vérifier si une commande fait partie d'une tournée acceptée
  function isInAcceptedRound(orderId: string): boolean {
    return getAcceptedRoundForOrder(orderId) !== null
  }

  const allOrders = [...orders, ...offeredOrders].sort((a, b) => getLaunchTime(a) - getLaunchTime(b))

  // Grouper les commandes par tournée acceptée
  function getOrdersGroupedByRound(columnOrders: Order[]): { round: SuggestedRound | null, orders: Order[] }[] {
    const result: { round: SuggestedRound | null, orders: Order[] }[] = []
    const processedOrderIds = new Set<string>()
    
    // D'abord, grouper les commandes par tournée
    for (const order of columnOrders) {
      if (processedOrderIds.has(order.id)) continue
      
      const round = getAcceptedRoundForOrder(order.id)
      if (round) {
        // Trouver toutes les commandes de cette tournée dans cette colonne
        const roundOrderIds = round.orders.map(o => o.order_id)
        const roundOrders = columnOrders.filter(o => roundOrderIds.includes(o.id))
        
        // Trier par sequence_order
        roundOrders.sort((a, b) => {
          const seqA = round.orders.find(o => o.order_id === a.id)?.sequence_order || 0
          const seqB = round.orders.find(o => o.order_id === b.id)?.sequence_order || 0
          return seqA - seqB
        })
        
        result.push({ round, orders: roundOrders })
        roundOrders.forEach(o => processedOrderIds.add(o.id))
      } else {
        result.push({ round: null, orders: [order] })
        processedOrderIds.add(order.id)
      }
    }
    
    return result
  }

  async function saveConfig(newConfig: ColumnConfig, newDisplayMode: 'compact' | 'detailed') {
    if (!device) return
    const columns = Object.entries(newConfig).filter(([_, v]) => v).map(([k]) => k)
    if (columns.length === 0) return
    const updatedConfig = { ...device.config, columns, displayMode: newDisplayMode }
    const { error } = await supabase.from('devices').update({ config: updatedConfig }).eq('id', device.id)
    if (!error) { setColumnConfig(newConfig); setDisplayMode(newDisplayMode); setDevice({ ...device, config: updatedConfig }) }
  }

  function getTimeSinceLaunch(order: Order): { display: string, isWaiting: boolean, minutesUntilLaunch: number } {
    const launchTime = getLaunchTime(order)
    const now = currentTime.getTime()
    const diffMs = now - launchTime
    const diffMinutes = Math.floor(diffMs / (60 * 1000))
    
    if (diffMinutes < 0) {
      const minutesUntil = Math.abs(diffMinutes)
      if (minutesUntil < 60) {
        return { display: `dans ${minutesUntil} min`, isWaiting: true, minutesUntilLaunch: minutesUntil }
      } else {
        const hours = Math.floor(minutesUntil / 60)
        const mins = minutesUntil % 60
        return { display: `dans ${hours}h${mins.toString().padStart(2, '0')}`, isWaiting: true, minutesUntilLaunch: minutesUntil }
      }
    }
    
    if (diffMinutes < 1) return { display: '< 1 min', isWaiting: false, minutesUntilLaunch: 0 }
    if (diffMinutes < 60) return { display: `${diffMinutes} min`, isWaiting: false, minutesUntilLaunch: 0 }
    return { display: `${Math.floor(diffMinutes / 60)}h${(diffMinutes % 60).toString().padStart(2, '0')}`, isWaiting: false, minutesUntilLaunch: 0 }
  }

  function getLaunchTimeColor(order: Order): string {
    const launchTime = getLaunchTime(order)
    const now = currentTime.getTime()
    const diffMinutes = Math.floor((now - launchTime) / (60 * 1000))
    
    if (diffMinutes < 0) return 'text-gray-400'
    if (diffMinutes < 5) return 'text-green-400'
    if (diffMinutes < 10) return 'text-yellow-400'
    if (diffMinutes < 15) return 'text-orange-400'
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

  // Refs pour stocker les valeurs actuelles (pour les event listeners natifs)
  const touchDragOrderRef = useRef<string | null>(null)
  const touchStartPosRef = useRef<{ x: number, y: number } | null>(null)
  const isDraggingRef = useRef(false)
  const dragOverColumnRef = useRef<string | null>(null)

  // Sync refs avec state
  useEffect(() => { touchDragOrderRef.current = touchDragOrder }, [touchDragOrder])
  useEffect(() => { touchStartPosRef.current = touchStartPos }, [touchStartPos])
  useEffect(() => { isDraggingRef.current = isDragging }, [isDragging])
  useEffect(() => { dragOverColumnRef.current = dragOverColumn }, [dragOverColumn])

  // Touch handlers pour tablettes (iPad/Android/Fully Kiosk)
  function handleTouchStart(e: TouchEvent<HTMLDivElement>, orderId: string) {
    const touch = e.touches[0]
    setTouchStartPos({ x: touch.clientX, y: touch.clientY })
    setTouchDragOrder(orderId)
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    touchDragOrderRef.current = orderId
  }

  // Global touch move handler avec passive: false pour Fully Kiosk
  useEffect(() => {
    function globalTouchMove(e: globalThis.TouchEvent) {
      if (!touchDragOrderRef.current || !touchStartPosRef.current) return
      
      const touch = e.touches[0]
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x)
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y)
      
      // Si mouvement > 15px, c'est un drag
      if (deltaX > 15 || deltaY > 15) {
        // IMPORTANT: preventDefault avec passive: false pour bloquer le scroll
        e.preventDefault()
        e.stopPropagation()
        
        if (!isDraggingRef.current) {
          setIsDragging(true)
          isDraggingRef.current = true
          if (navigator.vibrate) navigator.vibrate(50)
        }
        
        // Détecter la colonne survolée
        const columns = document.querySelectorAll('[data-column]')
        let foundColumn: string | null = null
        
        columns.forEach((col) => {
          const rect = col.getBoundingClientRect()
          if (
            touch.clientX >= rect.left &&
            touch.clientX <= rect.right &&
            touch.clientY >= rect.top &&
            touch.clientY <= rect.bottom
          ) {
            foundColumn = col.getAttribute('data-column')
          }
        })
        
        setDragOverColumn(foundColumn)
        dragOverColumnRef.current = foundColumn
        
        // Mettre à jour le ghost
        if (dragGhostRef.current) {
          dragGhostRef.current.style.display = 'block'
          dragGhostRef.current.style.left = `${touch.clientX - 80}px`
          dragGhostRef.current.style.top = `${touch.clientY - 40}px`
          
          const targetName = foundColumn === 'pending' ? '→ À préparer' 
            : foundColumn === 'preparing' ? '→ En cours' 
            : foundColumn === 'ready' ? '→ Prêt' 
            : foundColumn === 'completed' ? '→ Clôturé'
            : '📦 Glisser...'
          dragGhostRef.current.textContent = targetName
          
          if (foundColumn) {
            dragGhostRef.current.className = 'fixed pointer-events-none z-50 bg-green-500 text-white px-4 py-3 rounded-xl shadow-2xl font-bold text-lg border-2 border-white'
          } else {
            dragGhostRef.current.className = 'fixed pointer-events-none z-50 bg-orange-500 text-white px-4 py-3 rounded-xl shadow-2xl font-bold text-lg border-2 border-white'
          }
        }
      }
    }

    function globalTouchEnd() {
      console.log('TouchEnd - isDragging:', isDraggingRef.current, 'touchDragOrder:', touchDragOrderRef.current, 'dragOverColumn:', dragOverColumnRef.current)
      
      if (isDraggingRef.current && touchDragOrderRef.current && dragOverColumnRef.current) {
        console.log('Updating status to:', dragOverColumnRef.current)
        updateStatus(touchDragOrderRef.current, dragOverColumnRef.current)
        if (navigator.vibrate) navigator.vibrate([30, 30, 30])
      }
      
      // Reset
      if (dragGhostRef.current) {
        dragGhostRef.current.style.display = 'none'
      }
      setTouchDragOrder(null)
      setTouchStartPos(null)
      setIsDragging(false)
      setDragOverColumn(null)
      touchDragOrderRef.current = null
      touchStartPosRef.current = null
      isDraggingRef.current = false
      dragOverColumnRef.current = null
    }

    // CRUCIAL: passive: false permet à preventDefault() de fonctionner sur Fully Kiosk
    document.addEventListener('touchmove', globalTouchMove, { passive: false })
    document.addEventListener('touchend', globalTouchEnd, { passive: false })
    document.addEventListener('touchcancel', globalTouchEnd, { passive: false })

    return () => {
      document.removeEventListener('touchmove', globalTouchMove)
      document.removeEventListener('touchend', globalTouchEnd)
      document.removeEventListener('touchcancel', globalTouchEnd)
    }
  }, []) // Empty deps - handlers use refs

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

  function renderOrderInfo(order: Order, isInRound: boolean = false) {
    if (!isClickAndCollect(order)) return null
    
    const isExpanded = expandedOrderInfo[order.id]
    const launchInfo = formatLaunchTime(order)
    
    return (
      <div className="border-t border-slate-600">
        <button onClick={(e) => { e.stopPropagation(); toggleOrderInfo(order.id) }}
          className="w-full p-2 flex items-center justify-between hover:bg-slate-600/50 transition-colors">
          <div className="flex items-center gap-2">
            {/* N'afficher l'heure de lancement QUE si pas dans une tournée */}
            {!isInRound && (
              <span className={`text-xs font-bold px-2 py-1 rounded ${
                launchInfo.isPast ? 'bg-red-500 text-white animate-pulse' :
                launchInfo.isNow ? 'bg-red-500 text-white' :
                launchInfo.isUpcoming ? 'bg-orange-500 text-white' :
                'bg-cyan-500/30 text-cyan-300'
              }`}>
                🚀 Lancer à {launchInfo.time}
              </span>
            )}
            {order.order_type === 'delivery' && <span className="text-xs text-gray-400">🚗 Livraison</span>}
            {order.order_type === 'takeaway' && <span className="text-xs text-gray-400">🛍️ Retrait</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">🎯 Pour {formatTime(order.scheduled_time)}</span>
            <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
          </div>
        </button>
        
        {isExpanded && (
          <div className="p-3 bg-slate-800/50 space-y-2 text-sm">
            {order.customer_name && <div className="flex items-center gap-2"><span className="text-gray-400">👤</span><span className="text-white">{order.customer_name}</span></div>}
            {order.customer_phone && <div className="flex items-center gap-2"><span className="text-gray-400">📞</span><a href={`tel:${order.customer_phone}`} className="text-cyan-400 hover:underline">{order.customer_phone}</a></div>}
            {order.customer_email && <div className="flex items-center gap-2"><span className="text-gray-400">✉️</span><span className="text-gray-300 text-xs truncate">{order.customer_email}</span></div>}
            {order.scheduled_time && <div className="flex items-center gap-2"><span className="text-gray-400">🎯</span><span className="text-white">{order.order_type === 'delivery' ? 'Livrer' : 'Prêt'} pour {formatTime(order.scheduled_time)}</span></div>}
            {order.order_type === 'delivery' && order.delivery_notes && <div className="flex items-start gap-2"><span className="text-gray-400">📍</span><span className="text-white">{order.delivery_notes}</span></div>}
            {order.delivery_fee && order.delivery_fee > 0 && <div className="flex items-center gap-2"><span className="text-gray-400">💰</span><span className="text-green-400">Frais livraison: {order.delivery_fee.toFixed(2)}€</span></div>}
            <div className="pt-2 border-t border-slate-600 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>⏱️ Prépa: ~{avgPrepTime} min</span>
                {order.order_type === 'delivery' && <span>🚗 Trajet: ~{order.metadata?.delivery_duration || DEFAULT_DELIVERY_TIME} min</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Obtenir le statut précédent
  function getPreviousStatus(currentStatus: string): string | null {
    const order = ['pending', 'preparing', 'ready', 'completed']
    const idx = order.indexOf(currentStatus)
    return idx > 0 ? order[idx - 1] : null
  }

  function renderOrder(order: Order, column: typeof COLUMNS[number], isInRound: boolean = false, roundInfo?: { sequence: number, totalInRound: number }) {
    const colorClasses = {
      orange: { text: 'text-orange-400', bg: 'bg-orange-400', bgLight: 'bg-orange-400/20', border: 'border-orange-400', btn: 'bg-orange-500' },
      blue: { text: 'text-blue-400', bg: 'bg-blue-400', bgLight: 'bg-blue-400/20', border: 'border-blue-400', btn: 'bg-blue-500' },
      green: { text: 'text-green-400', bg: 'bg-green-400', bgLight: 'bg-green-400/20', border: 'border-green-400', btn: 'bg-green-500' },
      gray: { text: 'text-gray-400', bg: 'bg-gray-400', bgLight: 'bg-gray-400/20', border: 'border-gray-500', btn: 'bg-gray-500' },
    }[column.color]

    const groupedItems = groupAndMergeItems(order.order_items)
    const totalItems = groupedItems.reduce((sum, g) => sum + g.items.length, 0)
    const checkedCount = groupedItems.reduce((sum, g) => sum + g.items.filter(item => isItemChecked(order.id, item.key)).length, 0)
    const allChecked = totalItems > 0 && checkedCount === totalItems
    const isCC = isClickAndCollect(order)
    const launchInfo = formatLaunchTime(order)
    const timeSince = getTimeSinceLaunch(order)
    
    const prevStatus = getPreviousStatus(column.key)
    const nextStatus = column.nextStatus
    
    return (
      <div key={order.id} className={`bg-slate-700 rounded text-xs overflow-hidden border-l-2 ${isInRound ? 'border-purple-500' : colorClasses.border} ${allChecked ? 'ring-1 ring-green-500' : ''} ${launchInfo.isPast && column.key === 'pending' ? 'ring-1 ring-red-500' : ''}`}>
        
        {/* Header compact */}
        <div className={`px-1.5 py-1 flex items-center justify-between gap-1 ${launchInfo.isPast ? 'bg-red-500/40' : launchInfo.isNow ? 'bg-red-500/20' : isInRound ? 'bg-purple-500/20' : 'bg-slate-600'}`}>
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isInRound && roundInfo && (
              <span className="bg-purple-500 text-white text-[10px] px-1 rounded font-bold">{roundInfo.sequence}/{roundInfo.totalInRound}</span>
            )}
            <span className="font-bold text-sm">{order.order_number}</span>
            <span className="text-xs">{getOrderTypeEmoji(order.order_type)}</span>
            {order.is_offered && <span title="Offert">🎁</span>}
            {isCC && order.scheduled_time && (
              <span className="text-[10px] text-cyan-300">⏰{formatTime(order.scheduled_time)}</span>
            )}
          </div>
          <span className={`text-[10px] ${timeSince.isWaiting ? 'text-gray-400' : launchInfo.isPast ? 'text-red-400' : 'text-gray-400'}`}>
            {timeSince.display}
          </span>
        </div>
        
        {/* Items - affichage direct sans catégories en mode compact */}
        {column.key !== 'completed' && (
          <div className="px-1.5 py-1 space-y-0.5">
            {displayMode === 'compact' ? (
              // Mode compact: liste simple
              order.order_items.map((item, idx) => {
                const options = parseOptions(item.options_selected)
                const isChecked = isItemChecked(order.id, `${item.product_name}-${idx}`)
                return (
                  <div 
                    key={idx} 
                    onClick={() => toggleItemChecked(order.id, `${item.product_name}-${idx}`)}
                    className={`flex items-start gap-1 cursor-pointer ${isChecked ? 'opacity-40 line-through' : ''}`}
                  >
                    <span className={`font-bold min-w-[14px] text-center rounded ${item.quantity > 1 ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>
                      {item.quantity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span>{item.product_name}</span>
                      {options.length > 0 && <span className="text-gray-400 text-[10px]"> +{options.length}</span>}
                    </div>
                  </div>
                )
              })
            ) : (
              // Mode détaillé: avec catégories
              groupedItems.map((group, idx) => {
                const isCollapsed = isSectionCollapsed(order.id, group.categoryName)
                const catAllChecked = group.items.every(item => isItemChecked(order.id, item.key))
                
                return (
                  <div key={idx}>
                    <div 
                      onClick={() => toggleSection(order.id, group.categoryName)}
                      className={`flex items-center gap-1 cursor-pointer border-b border-slate-600 pb-0.5 mb-0.5 ${catAllChecked ? 'opacity-40' : ''}`}
                    >
                      <span className="text-xs">{group.categoryIcon}</span>
                      <span className={`text-[10px] font-bold uppercase ${group.textClass}`}>{group.categoryName}</span>
                      <span className={`ml-auto text-[10px] ${group.textClass}`}>{group.totalCount}</span>
                      <span className="text-gray-500 text-[10px]">{isCollapsed ? '▶' : '▼'}</span>
                    </div>
                    {!isCollapsed && group.items.map(item => {
                      const isChecked = isItemChecked(order.id, item.key)
                      return (
                        <div 
                          key={item.key}
                          onClick={() => toggleItemChecked(order.id, item.key)}
                          className={`flex items-start gap-1 pl-2 cursor-pointer ${isChecked ? 'opacity-40 line-through' : ''}`}
                        >
                          <span className={`font-bold min-w-[14px] text-center rounded ${item.totalQuantity > 1 ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>
                            {item.totalQuantity}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span>{item.product_name}</span>
                            {displayMode === 'detailed' && item.options.length > 0 && (
                              <div className="text-[10px] text-gray-400">
                                {item.options.map((o, i) => (
                                  <span key={i} className="mr-1">{getOptionIcon(o.item_name).icon || '•'}{o.item_name}</span>
                                ))}
                              </div>
                            )}
                            {item.notes.filter(n => n).map((note, i) => (
                              <p key={i} className="text-yellow-400 text-[10px]">📝{note}</p>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        )}
        
        {/* Info client si livraison */}
        {order.order_type === 'delivery' && order.customer_name && column.key !== 'completed' && (
          <div className="px-1.5 py-0.5 bg-slate-600/50 text-[10px] text-gray-300 truncate">
            📍 {order.customer_name} {order.delivery_notes && `- ${order.delivery_notes}`}
          </div>
        )}
        
        {/* BOUTONS ← → en bas du ticket - PAS dans une tournée */}
        {!isInRound && (
          <div className="flex border-t border-slate-600">
            {prevStatus ? (
              <input
                type="button"
                value="←"
                onClick={() => updateStatus(order.id, prevStatus)}
                className="flex-1 bg-slate-600 hover:bg-slate-500 active:bg-slate-400 text-white py-2 text-lg font-bold cursor-pointer border-none"
              />
            ) : (
              <div className="flex-1 bg-slate-800 py-2" />
            )}
            {nextStatus ? (
              <input
                type="button"
                value="→"
                onClick={() => updateStatus(order.id, nextStatus)}
                className={`flex-1 ${colorClasses.btn} hover:brightness-110 active:brightness-125 text-white py-2 text-lg font-bold cursor-pointer border-none`}
              />
            ) : (
              <div className="flex-1 bg-slate-800 py-2" />
            )}
          </div>
        )}
      </div>
    )
  }

  // Render un groupe de commandes (tournée ou commande seule)
  // Avancer toutes les commandes d'une tournée en même temps
  async function advanceRoundOrders(roundId: string, orders: Order[], nextStatus: string) {
    const orderIds = orders.map(o => o.id)
    
    const { error } = await supabase
      .from('orders')
      .update({ status: nextStatus })
      .in('id', orderIds)
    
    if (error) {
      console.error('Erreur avancement tournée:', error)
    } else {
      playNotificationSound()
    }
  }

  // Dégrouper une tournée
  async function ungroupRound(roundId: string, orders: Order[]) {
    const orderIds = orders.map(o => o.id)
    
    // Mettre suggested_round_id à null sur les commandes
    const { error: ordersError } = await supabase
      .from('orders')
      .update({ suggested_round_id: null })
      .in('id', orderIds)
    
    if (ordersError) {
      console.error('Erreur dégroupage commandes:', ordersError)
      return
    }

    // Mettre la suggestion en cancelled
    const { error: roundError } = await supabase
      .from('suggested_rounds')
      .update({ status: 'cancelled' })
      .eq('id', roundId)
    
    if (roundError) {
      console.error('Erreur annulation suggestion:', roundError)
    } else {
      playNotificationSound()
    }
  }

  function renderOrderGroup(group: { round: SuggestedRound | null, orders: Order[] }, column: typeof COLUMNS[number]) {
    if (group.round) {
      // Tournée groupée
      const allStatuses = group.orders.map(o => o.status)
      const allSameStatus = allStatuses.every(s => s === allStatuses[0])
      const currentStatus = allSameStatus ? allStatuses[0] : 'mixed'
      
      let nextStatus: string | null = null
      let nextLabel = ''
      let buttonColor = 'bg-purple-500'
      
      if (currentStatus === 'pending') {
        nextStatus = 'preparing'; nextLabel = '▶️'; buttonColor = 'bg-orange-500'
      } else if (currentStatus === 'preparing') {
        nextStatus = 'ready'; nextLabel = '✅'; buttonColor = 'bg-blue-500'
      } else if (currentStatus === 'ready') {
        nextStatus = 'completed'; nextLabel = '🏁'; buttonColor = 'bg-green-500'
      }

      return (
        <div key={group.round.id} className="bg-purple-500/10 border border-purple-500 rounded p-1 space-y-1">
          <div className="flex items-center justify-between px-1 py-0.5 bg-purple-500/20 rounded text-xs">
            <span className="text-purple-400 font-bold">🔗 {group.orders.length} liv.</span>
            <div className="flex items-center gap-2">
              <a href="#" onClick={(e) => { e.preventDefault(); ungroupRound(group.round!.id, group.orders) }} className="text-gray-400 text-[10px]">🔓</a>
              {nextStatus && (
                <a href="#" onClick={(e) => { e.preventDefault(); advanceRoundOrders(group.round!.id, group.orders, nextStatus) }} className={`${buttonColor} text-white px-2 py-0.5 rounded text-[10px] no-underline`}>
                  {nextLabel} Tout
                </a>
              )}
            </div>
          </div>
          <div className="space-y-1">
            {group.orders.map((order, idx) => renderOrder(order, column, true, { sequence: idx + 1, totalInRound: group.orders.length }))}
          </div>
        </div>
      )
    } else {
      return group.orders.map(order => renderOrder(order, column))
    }
  }

  // Render le panneau de suggestions de livraison
  function renderDeliveryPanel() {
    const pendingDeliveries = orders.filter(o => o.order_type === 'delivery' && ['pending', 'preparing', 'ready'].includes(o.status))
    
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">🚗 Gestion des livraisons</h2>
            <button onClick={() => setShowDeliveryPanel(false)} className="text-gray-400 hover:text-white text-2xl">✕</button>
          </div>
          
          {/* Statut livreurs */}
          <div className="bg-slate-700 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Livreurs disponibles</span>
              <span className={`text-2xl font-bold ${availableDrivers > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {availableDrivers} 🛵
              </span>
            </div>
            {availableDrivers === 0 && (
              <p className="text-yellow-400 text-sm mt-2">⚠️ Aucun livreur connecté - les suggestions sont désactivées</p>
            )}
          </div>
          
          {/* Suggestions de tournées */}
          {suggestedRounds.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-green-400">💡 Tournées suggérées</h3>
              <div className="space-y-3">
                {suggestedRounds.map(round => (
                  <div key={round.id} className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="font-bold text-green-400">{round.orders.length} livraisons groupées</span>
                        <span className="text-sm text-gray-400 ml-2">~{round.total_distance_minutes} min trajet</span>
                      </div>
                      <div className="text-sm text-gray-400">
                        Expire à {formatTime(round.expires_at)}
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-3">
                      {round.orders.map((o, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-slate-700/50 rounded-lg p-2">
                          <div className="flex items-center gap-2">
                            <span className="bg-green-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{o.sequence_order}</span>
                            <span className="font-medium">#{o.order_number}</span>
                            <span className="text-gray-400 text-sm truncate max-w-[200px]">{o.delivery_address}</span>
                          </div>
                          <span className="text-sm text-gray-400">~{formatTime(o.estimated_delivery)}</span>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm mb-3 text-gray-400">
                      <span>⏰ Préparer: {formatTime(round.prep_at)}</span>
                      <span>🚗 Départ: {formatTime(round.depart_at)}</span>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptSuggestedRound(round.id)}
                        className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 rounded-lg transition-colors"
                      >
                        ✅ Accepter
                      </button>
                      <button
                        onClick={() => rejectSuggestedRound(round.id)}
                        className="flex-1 bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 rounded-lg transition-colors"
                      >
                        ❌ Ignorer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Tournées acceptées */}
          {acceptedRounds.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-purple-400">🔗 Tournées en cours</h3>
              <div className="space-y-3">
                {acceptedRounds.map(round => (
                  <div key={round.id} className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-purple-400">{round.orders.length} livraisons</span>
                      <span className="text-sm bg-purple-500/30 text-purple-300 px-2 py-1 rounded">Acceptée</span>
                    </div>
                    <div className="space-y-1">
                      {round.orders.map((o, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="text-purple-400">{o.sequence_order}.</span>
                          <span>#{o.order_number}</span>
                          <span className="text-gray-400">- {o.customer_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Livraisons individuelles */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-300">📦 Livraisons en attente ({pendingDeliveries.length})</h3>
            {pendingDeliveries.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Aucune livraison en attente</p>
            ) : (
              <div className="space-y-2">
                {pendingDeliveries.map(order => (
                  <div key={order.id} className={`bg-slate-700 rounded-lg p-3 ${order.suggested_round_id ? 'border-l-4 border-purple-500' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold">#{order.order_number}</span>
                        <span className="text-gray-400 text-sm ml-2">{order.customer_name}</span>
                        {order.suggested_round_id && <span className="text-purple-400 text-xs ml-2">🔗 En tournée</span>}
                      </div>
                      <span className="text-sm text-gray-400">{formatTime(order.scheduled_time)}</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{order.delivery_notes}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <button
            onClick={() => setShowDeliveryPanel(false)}
            className="w-full mt-6 bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 rounded-xl transition-colors"
          >
            Fermer
          </button>
        </div>
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
  // Responsive: 
  // - Portrait mobile: 1 col
  // - Portrait tablette (md): 2 cols  
  // - Paysage tablette / Desktop (lg): toutes les colonnes
  const gridCols = visibleColumns.length === 1 
    ? 'grid-cols-1' 
    : visibleColumns.length === 2 
    ? 'grid-cols-2' 
    : visibleColumns.length === 3 
    ? 'grid-cols-3' 
    : 'grid-cols-2 md:grid-cols-4'
  
  const pendingDeliveriesCount = orders.filter(o => o.order_type === 'delivery' && ['pending', 'preparing', 'ready'].includes(o.status)).length

  return (
    <div className="h-screen bg-slate-900 text-white p-1 flex flex-col overflow-hidden">
      {/* Header compact */}
      <div className="flex items-center justify-between mb-1 px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">🍳 KDS</span>
          <button 
            onClick={() => setShowDeliveryPanel(true)} 
            className={`relative px-2 py-1 rounded text-xs flex items-center gap-1 ${
              suggestedRounds.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-slate-700'
            }`}
          >
            🚗 {pendingDeliveriesCount}
            {suggestedRounds.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center text-[10px]">
                {suggestedRounds.length}
              </span>
            )}
          </button>
          <button onClick={() => setDisplayMode(displayMode === 'compact' ? 'detailed' : 'compact')} className="bg-slate-700 px-2 py-1 rounded text-xs">
            {displayMode === 'compact' ? '📖' : '📋'}
          </button>
          <button onClick={() => setShowConfig(true)} className="bg-slate-700 px-2 py-1 rounded text-xs">⚙️</button>
        </div>
        <div className="text-xl font-mono font-bold">{currentTime.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1"><p className="text-lg text-gray-400">Chargement...</p></div>
      ) : (
        <div className={`grid ${gridCols} gap-1 flex-1 overflow-hidden`}>
          {visibleColumns.map(column => {
            const columnOrders = column.key === 'completed' ? allOrders.filter(o => o.status === column.key).slice(-10) : allOrders.filter(o => o.status === column.key)
            const groupedOrders = getOrdersGroupedByRound(columnOrders)
            const colorClasses = { orange: { text: 'text-orange-400', bg: 'bg-orange-400', bgLight: 'bg-orange-400/20' }, blue: { text: 'text-blue-400', bg: 'bg-blue-400', bgLight: 'bg-blue-400/20' }, green: { text: 'text-green-400', bg: 'bg-green-400', bgLight: 'bg-green-400/20' }, gray: { text: 'text-gray-400', bg: 'bg-gray-400', bgLight: 'bg-gray-400/20' } }[column.color]

            return (
              <div key={column.key} data-column={column.key} className={`bg-slate-800 rounded p-1 overflow-y-auto transition-all flex flex-col ${dragOverColumn === column.key ? 'ring-2 ring-white/50 bg-slate-700' : ''}`}
                onDragOver={(e) => handleDragOver(e, column.key)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, column.key)}>
                <div className={`${colorClasses.bg} text-white px-2 py-0.5 rounded flex items-center justify-between mb-1 flex-shrink-0`}>
                  <span className="font-bold text-xs">{column.label}</span>
                  <span className="bg-white/20 px-1.5 rounded text-xs">{columnOrders.length}</span>
                </div>
                <div className="space-y-1 flex-1 overflow-y-auto">
                  {groupedOrders.length === 0 ? <p className="text-gray-500 text-center py-4 text-xs">Vide</p> : groupedOrders.map((group, idx) => <div key={idx}>{renderOrderGroup(group, column)}</div>)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showDeliveryPanel && renderDeliveryPanel()}

      {showConfig && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-2">⚙️ Configuration</h2>
            <p className="text-gray-400 mb-6">{device ? `${device.name} (${device.device_code})` : 'Mode démo'}</p>
            
            <p className="text-gray-300 mb-3">Mode d'affichage :</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button onClick={() => setDisplayMode('detailed')} className={`p-4 rounded-xl border-2 transition-all ${displayMode === 'detailed' ? 'border-orange-500 bg-orange-500/20' : 'border-slate-600 hover:border-slate-500'}`}>
                <span className="text-2xl block mb-1">📖</span><span className="font-medium">Détaillé</span>
              </button>
              <button onClick={() => setDisplayMode('compact')} className={`p-4 rounded-xl border-2 transition-all ${displayMode === 'compact' ? 'border-orange-500 bg-orange-500/20' : 'border-slate-600 hover:border-slate-500'}`}>
                <span className="text-2xl block mb-1">📋</span><span className="font-medium">Compact</span>
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

            <div className="flex gap-3">
              <button onClick={() => setShowConfig(false)} className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 rounded-xl transition-colors">Fermer</button>
              {device && <button onClick={() => { saveConfig(columnConfig, displayMode); setShowConfig(false) }} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors">💾 Sauvegarder</button>}
            </div>
          </div>
        </div>
      )}

      {/* Ghost pour le drag tactile */}
      <div
        ref={dragGhostRef}
        className="fixed pointer-events-none z-50 bg-orange-500 text-white px-4 py-3 rounded-xl shadow-2xl font-bold text-lg border-2 border-white"
        style={{ display: 'none' }}
      >
        {dragOverColumn ? `→ ${dragOverColumn === 'pending' ? 'À préparer' : dragOverColumn === 'preparing' ? 'En cours' : dragOverColumn === 'ready' ? 'Prêt' : 'Clôturé'}` : '📦 Glisser...'}
      </div>
    </div>
  )
}