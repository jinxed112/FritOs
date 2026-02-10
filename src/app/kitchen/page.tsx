'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

type Order = {
  id: string
  order_number: string
  order_type: string
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'scheduled'
  created_at: string
  order_items: OrderItem[]
  is_offered?: boolean
  customer_name?: string | null
  customer_phone?: string | null
  scheduled_time?: string | null
  scheduled_slot_start?: string | null
  source?: string | null
  delivery_notes?: string | null
  metadata?: { source?: string; slot_date?: string; slot_time?: string; delivery_duration?: number; delivery_address?: string; delivery_lat?: number; delivery_lng?: number; travel_minutes?: number } | null
}

type ParsedOption = { item_name: string; price: number }

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

type DeviceInfo = {
  id: string
  code: string
  name: string
  type: string
  establishmentId: string
  config?: { columns?: string[]; displayMode?: 'compact' | 'detailed' }
}

type ColumnConfig = { pending: boolean; preparing: boolean; ready: boolean; completed: boolean }

// ==================== CONSTANTS ====================
const ORDER_TYPE_EMOJI: Record<string, string> = {
  eat_in: '🍽️', takeaway: '🥡', delivery: '🚗', pickup: '🛍️', table: '📍', kiosk: '🖥️', counter: '💳'
}

const COLUMNS = [
  { key: 'pending', label: 'À préparer', color: 'orange', nextStatus: 'preparing', prevStatus: null },
  { key: 'preparing', label: 'En cours', color: 'blue', nextStatus: 'ready', prevStatus: 'pending' },
  { key: 'ready', label: 'Prêt', color: 'green', nextStatus: 'completed', prevStatus: 'preparing' },
  { key: 'completed', label: 'Clôturé', color: 'gray', nextStatus: null, prevStatus: 'ready' },
] as const

const DEFAULT_COLLAPSED_CATEGORIES = ['boissons', 'bières', 'biere', 'softs', 'drinks']
const DEFAULT_PREP_TIME = 10

const CATEGORY_CONFIG: Record<string, { icon: string; bgClass: string; textClass: string }> = {
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

const OPTION_ICONS: { keywords: string[]; icon: string; color: string }[] = [
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

const COLOR_CLASSES = {
  orange: { text: 'text-orange-400', bg: 'bg-orange-500', bgLight: 'bg-orange-400/20', border: 'border-orange-500' },
  blue: { text: 'text-blue-400', bg: 'bg-blue-500', bgLight: 'bg-blue-400/20', border: 'border-blue-500' },
  green: { text: 'text-green-400', bg: 'bg-green-500', bgLight: 'bg-green-400/20', border: 'border-green-500' },
  gray: { text: 'text-gray-400', bg: 'bg-gray-500', bgLight: 'bg-gray-400/20', border: 'border-gray-500' },
}

// ==================== HELPER FUNCTIONS ====================
function isSauce(optionName: string): boolean {
  if (!optionName) return false
  return SAUCE_KEYWORDS.some(kw => optionName.toLowerCase().includes(kw))
}

function isExclusion(optionName: string): boolean {
  if (!optionName) return false
  const lower = optionName.toLowerCase()
  return lower.startsWith('sans ') || lower.includes('pas de ')
}

function getOptionIcon(optionName: string): { icon: string; color: string } | null {
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
  return DEFAULT_COLLAPSED_CATEGORIES.some(cat => categoryName.toLowerCase().includes(cat))
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
      return { categoryName, categoryIcon: config.icon, textClass: config.textClass, bgClass: config.bgClass, items: itemsArray, totalCount: itemsArray.reduce((sum, item) => sum + item.totalQuantity, 0) }
    })
    .sort((a, b) => {
      const aIdx = categoryOrder.findIndex(c => a.categoryName.toLowerCase().includes(c))
      const bIdx = categoryOrder.findIndex(c => b.categoryName.toLowerCase().includes(c))
      if (aIdx === -1 && bIdx === -1) return 0
      if (aIdx === -1) return 1
      if (bIdx === -1) return -1
      return aIdx - bIdx
    })
}

function getOrderTypeEmoji(orderType: string | undefined | null): string {
  return orderType ? ORDER_TYPE_EMOJI[orderType] || '📋' : '📋'
}

function isClickAndCollect(order: Order): boolean {
  return order.source === 'online' || order.order_type === 'pickup' || order.order_type === 'delivery'
}

function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return '--:--'
  try {
    return new Date(isoString).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
  } catch { return '--:--' }
}

// ==================== MAIN COMPONENT ====================
export default function KitchenPage() {
  const router = useRouter()
  
  // Auth state
  const [authStatus, setAuthStatus] = useState<'checking' | 'unauthorized' | 'authenticated'>('checking')
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  
  // Data state
  const [orders, setOrders] = useState<Order[]>([])
  const [offeredOrders, setOfferedOrders] = useState<Order[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [showConfig, setShowConfig] = useState(false)
  // Default: 3 colonnes (sans completed)
  const [columnConfig, setColumnConfig] = useState<ColumnConfig>({ pending: true, preparing: true, ready: true, completed: false })
  const [displayMode, setDisplayMode] = useState<'compact' | 'detailed'>('detailed')
  const [collapsedSections, setCollapsedSections] = useState<Record<string, Set<string>>>({})
  const [checkedItems, setCheckedItems] = useState<Record<string, Set<string>>>({})
  const [avgPrepTime, setAvgPrepTime] = useState<number>(DEFAULT_PREP_TIME)

  const supabase = createClient()

  // ==================== EFFECTS ====================
  useEffect(() => {
    checkAuth()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // ==================== AUTH ====================
  async function checkAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setAuthStatus('unauthorized')
        return
      }
      const response = await fetch('/api/device-auth')
      const data = await response.json()
      if (!data.device || data.device.type !== 'kds') {
        setAuthStatus('unauthorized')
        return
      }
      setDevice(data.device)
      setAuthStatus('authenticated')
      loadAllData(data.device.establishmentId)
    } catch (error) {
      console.error('Auth check error:', error)
      setAuthStatus('unauthorized')
    }
  }

  function loadAllData(estId: string) {
    loadOrders(estId)
    loadTempOrders(estId)
    loadAvgPrepTime(estId)
    setupRealtime(estId)
  }

  async function loadAvgPrepTime(estId: string) {
    const { data } = await supabase
      .from('orders')
      .select('created_at, completed_at')
      .eq('establishment_id', estId)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .in('source', ['kiosk', 'counter'])
      .order('completed_at', { ascending: false })
      .limit(10)

    if (data && data.length > 0) {
      const prepTimes = data.map(o => {
        const created = new Date(o.created_at).getTime()
        const completed = new Date(o.completed_at).getTime()
        return (completed - created) / 60000
      }).filter(t => t > 0 && t < 120) // filtrer les aberrations

      if (prepTimes.length > 0) {
        const avg = Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length)
        setAvgPrepTime(Math.max(DEFAULT_PREP_TIME, avg))
      }
    }
  }

  async function loadTempOrders(estId: string) {
    const { data } = await supabase
      .from('temp_orders')
      .select('*')
      .eq('establishment_id', estId)
      .neq('status', 'completed')
      .order('created_at', { ascending: true })
    if (data) {
      setOfferedOrders(data.map(t => ({
        id: t.id, order_number: t.order_number || 'X', order_type: t.order_type || 'takeaway',
        status: t.status || 'pending', created_at: t.created_at, is_offered: true,
        order_items: Array.isArray(t.order_items) ? t.order_items : []
      })))
    }
  }

  function setupRealtime(estId: string) {
    const channel = supabase.channel('kds-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `establishment_id=eq.${estId}` }, () => loadOrders(estId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'temp_orders', filter: `establishment_id=eq.${estId}` }, () => loadTempOrders(estId))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }

  async function loadOrders(estId: string) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Charger : toutes les commandes non-terminées + commandes du jour
    const { data } = await supabase
      .from('orders')
      .select(`id, order_number, order_type, status, created_at, customer_name, customer_phone, scheduled_time, scheduled_slot_start, source, delivery_notes, metadata, order_items ( id, product_name, quantity, options_selected, notes, product:products ( category:categories ( name ) ) )`)
      .eq('establishment_id', estId)
      .neq('status', 'cancelled')
      .neq('status', 'awaiting_payment')
      .or(`status.neq.completed,created_at.gte.${today.toISOString()}`)
      .order('created_at', { ascending: true })
    if (data) {
      setOrders(data.map(order => ({
        ...order,
        order_type: order.order_type || 'takeaway',
        metadata: typeof order.metadata === 'string' ? JSON.parse(order.metadata) : order.metadata,
        order_items: Array.isArray(order.order_items) ? order.order_items.map((item: any) => ({ ...item, category_name: item.product?.category?.name || 'Autres' })) : []
      })))
    }
    setLoading(false)
  }

  async function updateStatus(orderId: string, newStatus: string) {
    const isOffered = offeredOrders.some(o => o.id === orderId)
    
    // Optimistic update - UI instantanée
    if (isOffered) {
      setOfferedOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as Order['status'] } : o))
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as Order['status'] } : o))
    }
    
    if (newStatus === 'completed' || newStatus === 'ready') {
      setCheckedItems(prev => { const newState = { ...prev }; delete newState[orderId]; return newState })
    }
    
    // Sync serveur en background
    try {
      const now = new Date().toISOString()
      const response = await fetch('/api/kitchen/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          orderId, 
          newStatus, 
          isOffered,
          ...(newStatus === 'completed' && { completed_at: now }),
          ...(newStatus === 'preparing' && { preparation_started_at: now }),
        })
      })
      if (!response.ok) console.error('Update status error')
    } catch (error) {
      console.error('Update status error:', error)
    }
  }

  async function saveConfig(config: ColumnConfig, mode: 'compact' | 'detailed') {
    if (!device) return
    const columns = Object.entries(config).filter(([_, v]) => v).map(([k]) => k)
    if (columns.length === 0) return
    await supabase.from('devices').update({ config: { columns, displayMode: mode } }).eq('id', device.id)
  }

  // ==================== HELPERS ====================
  const allOrders = [...orders, ...offeredOrders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

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

  function getTimeSinceLaunch(order: Order): { display: string } {
    const created = new Date(order.created_at).getTime()
    const now = currentTime.getTime()
    const diffMinutes = Math.floor((now - created) / (60 * 1000))
    if (diffMinutes < 1) return { display: '< 1m' }
    if (diffMinutes < 60) return { display: `${diffMinutes}m` }
    return { display: `${Math.floor(diffMinutes / 60)}h${(diffMinutes % 60).toString().padStart(2, '0')}` }
  }

  function getTimeColor(order: Order): string {
    const diffMinutes = Math.floor((currentTime.getTime() - new Date(order.created_at).getTime()) / (60 * 1000))
    if (diffMinutes < 5) return 'text-green-400'
    if (diffMinutes < 10) return 'text-yellow-400'
    if (diffMinutes < 15) return 'text-orange-400'
    return 'text-red-400'
  }

  function formatLaunchTime(order: Order): { time: string; launchTime: string | null; isNow: boolean; isPast: boolean; isUpcoming: boolean; travelMin: number } {
    const slotTime = order.scheduled_slot_start || order.scheduled_time
    if (!slotTime || !isClickAndCollect(order)) {
      return { time: 'MAINTENANT', launchTime: null, isNow: true, isPast: false, isUpcoming: false, travelMin: 0 }
    }
    const scheduled = new Date(slotTime).getTime()
    const now = currentTime.getTime()
    const timeStr = formatTime(slotTime)

    // Pour les livraisons : soustraire temps de trajet + temps de prépa
    const travelMin = order.metadata?.travel_minutes || 0
    const isDelivery = order.order_type === 'delivery'
    const offset = isDelivery ? (travelMin + avgPrepTime) : avgPrepTime
    const launchTimestamp = scheduled - offset * 60 * 1000
    const diffFromLaunch = (launchTimestamp - now) / (60 * 1000)

    const launchDate = new Date(launchTimestamp)
    const launchStr = launchDate.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })

    return {
      time: timeStr,
      launchTime: launchStr,
      isNow: diffFromLaunch <= 0 && diffFromLaunch > -10,
      isPast: diffFromLaunch <= -10,
      isUpcoming: diffFromLaunch > 0 && diffFromLaunch <= 15,
      travelMin,
    }
  }

  // ==================== RENDER ITEM ====================
  function renderItem(item: MergedItem, orderId: string) {
    const isHigh = item.totalQuantity >= 2
    const isVeryHigh = item.totalQuantity >= 4
    const isChecked = isItemChecked(orderId, item.key)
    let qtyClass = 'bg-slate-500'
    if (isChecked) qtyClass = 'bg-green-600'
    else if (isVeryHigh) qtyClass = 'bg-red-500'
    else if (isHigh) qtyClass = 'bg-yellow-500'

    return (
      <div
        key={item.key}
        onClick={(e) => { e.stopPropagation(); toggleItemChecked(orderId, item.key) }}
        className={`flex items-start gap-2 p-1.5 rounded cursor-pointer transition-all ${isChecked ? 'bg-green-500/20 opacity-60' : isVeryHigh ? 'bg-red-500/20' : ''}`}
      >
        <div className={`${qtyClass} text-white min-w-[24px] h-6 rounded flex items-center justify-center text-sm font-bold flex-shrink-0`}>
          {item.totalQuantity}
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-sm ${isChecked ? 'line-through text-gray-500' : ''} ${isHigh ? 'font-bold' : ''}`}>
            {item.product_name}
            {isVeryHigh && !isChecked && ' ⚠️'}
          </span>
          {item.options.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-0.5 ${isChecked ? 'opacity-50' : ''}`}>
              {item.options.map((opt, idx) => {
                const iconData = getOptionIcon(opt.item_name)
                const excluded = isExclusion(opt.item_name)
                if (displayMode === 'compact' && iconData) {
                  return <span key={idx} className={`text-base ${excluded ? 'opacity-50' : ''}`} title={opt.item_name}>{excluded && '🚫'}{iconData.icon}</span>
                }
                return (
                  <span key={idx} className={`text-xs px-1.5 py-0.5 rounded ${excluded ? 'bg-gray-600 line-through' : 'bg-slate-600'}`}>
                    {excluded && '🚫'}{iconData && <span className={iconData.color}>{iconData.icon}</span>} {opt.item_name}
                  </span>
                )
              })}
            </div>
          )}
          {item.notes.filter(n => n).map((note, idx) => (
            <p key={idx} className="text-yellow-400 text-xs mt-0.5">📝 {note}</p>
          ))}
        </div>
      </div>
    )
  }

  // ==================== RENDER ORDER ====================
  function renderOrder(order: Order, column: typeof COLUMNS[number]) {
    const colors = COLOR_CLASSES[column.color as keyof typeof COLOR_CLASSES] || COLOR_CLASSES.gray
    const groupedItems = groupAndMergeItems(order.order_items || [])
    const totalItems = groupedItems.reduce((sum, g) => sum + g.items.length, 0)
    const checkedCount = groupedItems.reduce((sum, g) => sum + g.items.filter(item => isItemChecked(order.id, item.key)).length, 0)
    const allChecked = totalItems > 0 && checkedCount === totalItems
    const isCC = isClickAndCollect(order)
    const launchInfo = formatLaunchTime(order)
    const timeSince = getTimeSinceLaunch(order)

    return (
      <div key={order.id} className={`bg-slate-700 rounded-lg overflow-hidden border-l-4 ${colors.border} ${allChecked ? 'ring-2 ring-green-500' : ''} ${launchInfo.isPast && column.key === 'pending' ? 'ring-2 ring-red-500 animate-pulse' : ''} shadow-md`}>
        {/* Header */}
        <div className={`px-3 py-2 flex items-center justify-between ${launchInfo.isPast ? 'bg-red-500/30' : launchInfo.isNow ? 'bg-red-500/20' : 'bg-slate-600'}`}>
          <div className="flex items-center gap-1.5">
            {/* Bouton retour discret */}
            {column.prevStatus && (
              <button
                onClick={() => updateStatus(order.id, column.prevStatus!)}
                className="text-gray-400 hover:text-white active:scale-95 text-sm px-2 py-1 transition-all"
              >
                ◀
              </button>
            )}
            <span className="font-bold text-lg">{order.order_number}</span>
            <span className="text-base">{getOrderTypeEmoji(order.order_type)}</span>
            {order.is_offered && <span title="Offert" className="text-base">🎁</span>}
            {column.key !== 'completed' && (
              <>
                <span className={`text-xs px-2 py-1 rounded font-bold ${launchInfo.isPast ? 'bg-red-500 text-white' : launchInfo.isNow ? 'bg-red-500 text-white' : launchInfo.isUpcoming ? 'bg-orange-500 text-white' : isCC ? 'bg-cyan-500/30 text-cyan-300' : 'bg-slate-500 text-gray-300'}`}>
                  {launchInfo.isNow ? '🔥 GO!' : launchInfo.isPast ? '⚠️ RETARD' : isCC ? `⏰ ${launchInfo.time}` : '🍽️'}
                </span>
                {isCC && launchInfo.launchTime && column.key === 'pending' && (
                  <span className={`text-xs px-2 py-1 rounded font-bold ${launchInfo.isPast ? 'bg-red-500/80 text-white' : launchInfo.isNow ? 'bg-red-500/80 text-white' : launchInfo.isUpcoming ? 'bg-orange-500/80 text-white' : 'bg-blue-500/30 text-blue-300'}`}>
                    🔧 {launchInfo.launchTime}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-bold ${getTimeColor(order)}`}>{timeSince.display}</span>
            {column.nextStatus && (
              <button
                onClick={() => updateStatus(order.id, column.nextStatus!)}
                className={`${colors.bg} hover:brightness-110 active:scale-95 text-white text-sm px-3 py-1.5 rounded font-bold transition-all`}
              >
                ▶
              </button>
            )}
          </div>
        </div>

        {/* Client info for delivery/pickup */}
        {(order.order_type === 'delivery' || order.order_type === 'pickup') && order.customer_name && column.key !== 'completed' && (
          <div className="px-2 py-1 bg-slate-600/50 text-xs text-gray-300">
            <div>
              {order.order_type === 'delivery' ? '📍' : '🛍️'} {order.customer_name}
              {order.order_type === 'delivery' && order.delivery_notes && ` - ${order.delivery_notes}`}
              {order.customer_phone && ` • ${order.customer_phone}`}
            </div>
            {order.order_type === 'delivery' && launchInfo.travelMin > 0 && column.key === 'pending' && (
              <div className="mt-0.5 text-blue-300">
                🚗 {launchInfo.travelMin}min trajet • ⏱️ ~{avgPrepTime}min prépa • 🔧 Lancer à {launchInfo.launchTime}
              </div>
            )}
          </div>
        )}

        {/* Items grouped by category */}
        {column.key !== 'completed' && (
          <div className="p-2 space-y-1.5">
            {groupedItems.map((group, idx) => {
              const isCollapsed = isSectionCollapsed(order.id, group.categoryName)
              const catCheckedCount = group.items.filter(item => isItemChecked(order.id, item.key)).length
              const catAllChecked = group.items.length > 0 && catCheckedCount === group.items.length
              return (
                <div key={idx}>
                  <div
                    onClick={(e) => { e.stopPropagation(); toggleSection(order.id, group.categoryName) }}
                    className={`flex items-center gap-1.5 cursor-pointer py-0.5 ${isCollapsed ? 'opacity-70' : ''}`}
                  >
                    <span className="text-sm">{group.categoryIcon}</span>
                    <span className={`text-xs font-semibold uppercase ${group.textClass} ${catAllChecked ? 'line-through opacity-50' : ''}`}>
                      {group.categoryName}
                    </span>
                    <span className={`text-xs px-1.5 rounded font-bold ${catAllChecked ? 'bg-green-500/30 text-green-400' : group.bgClass}`}>
                      {catAllChecked ? '✓' : group.totalCount}
                    </span>
                    <span className="text-gray-500 text-xs ml-auto">{isCollapsed ? '▶' : '▼'}</span>
                  </div>
                  {!isCollapsed && (
                    <div className="space-y-0.5 ml-1">
                      {group.items.map(item => renderItem(item, order.id))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Compact for completed */}
        {column.key === 'completed' && (
          <div className="px-2 py-1.5 text-xs text-gray-400">
            {(order.order_items || []).reduce((sum, item) => sum + (item.quantity || 0), 0)} article(s)
          </div>
        )}
      </div>
    )
  }

  // ==================== MAIN RENDER ====================
  if (authStatus === 'checking') {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <span className="text-6xl block mb-2">👨‍🍳</span>
          <p className="text-lg">Vérification...</p>
        </div>
      </div>
    )
  }

  if (authStatus === 'unauthorized') {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <span className="text-6xl block mb-6">🔒</span>
          <h1 className="text-2xl font-bold text-white mb-4">Accès non autorisé</h1>
          <p className="text-gray-400 mb-8">Veuillez vous connecter et sélectionner un écran cuisine depuis la page de configuration.</p>
          <button onClick={() => router.push('/device')} className="bg-orange-500 text-white font-bold px-8 py-4 rounded-xl hover:bg-orange-600 transition-colors">
            Aller à la configuration
          </button>
        </div>
      </div>
    )
  }

  const visibleColumns = COLUMNS.filter(col => columnConfig[col.key as keyof ColumnConfig])
  const gridCols = visibleColumns.length <= 2 ? `grid-cols-${visibleColumns.length}` : visibleColumns.length === 3 ? 'grid-cols-3' : 'grid-cols-4'

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold">🍳 KDS</span>
          <span className="text-xs text-gray-400">{device?.name || 'Cuisine'}</span>
          <button onClick={() => setDisplayMode(displayMode === 'compact' ? 'detailed' : 'compact')} className="bg-slate-700 px-3 py-1 rounded text-sm">
            {displayMode === 'compact' ? '📖' : '📋'}
          </button>
          <button onClick={() => setShowConfig(true)} className="bg-slate-700 px-3 py-1 rounded text-sm">⚙️</button>
          <button onClick={() => router.push('/device')} className="bg-slate-700 px-3 py-1 rounded text-sm">🔄</button>
        </div>
        <div className="text-2xl font-mono font-bold">{currentTime.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>

      {/* Columns */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-gray-400">Chargement...</p></div>
      ) : (
        <div className={`flex-1 min-h-0 grid ${gridCols} gap-1 p-1 overflow-hidden`}>
          {visibleColumns.map(column => {
            const colors = COLOR_CLASSES[column.color as keyof typeof COLOR_CLASSES] || COLOR_CLASSES.gray
            const columnOrders = column.key === 'completed'
              ? allOrders.filter(o => o.status === column.key).slice(-10)
              : allOrders.filter(o => o.status === column.key)

            return (
              <div key={column.key} className="flex flex-col min-h-0 bg-slate-800 rounded overflow-hidden">
                <div className={`${colors.bg} text-white px-3 py-1.5 flex items-center justify-between flex-shrink-0`}>
                  <span className="font-bold text-sm">{column.label}</span>
                  <span className="bg-white/20 px-2 rounded text-sm font-bold">{columnOrders.length}</span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-4 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {columnOrders.length === 0 ? (
                    <p className="text-gray-500 text-center py-4 text-sm">Aucune commande</p>
                  ) : (
                    columnOrders.map(order => renderOrder(order, column))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Scheduled orders banner */}
      {(() => {
        const scheduledOrders = allOrders.filter(o => o.status === 'scheduled').sort((a, b) => {
          const aTime = new Date(a.scheduled_slot_start || a.created_at).getTime()
          const bTime = new Date(b.scheduled_slot_start || b.created_at).getTime()
          return aTime - bTime
        })
        if (scheduledOrders.length === 0) return null
        return (
          <div className="flex-shrink-0 bg-slate-800/80 border-t border-slate-600 px-3 py-1.5">
            <div className="flex items-center gap-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              <span className="text-xs font-bold text-gray-500 uppercase flex-shrink-0">⏳ {scheduledOrders.length} programmée{scheduledOrders.length > 1 ? 's' : ''}</span>
              {scheduledOrders.map(order => (
                <span key={order.id} className="flex-shrink-0 text-xs text-gray-400 bg-slate-700/50 px-2 py-1 rounded">
                  {order.order_number} {getOrderTypeEmoji(order.order_type)} ⏰ {formatTime(order.scheduled_slot_start || order.scheduled_time)}
                  {order.order_type === 'delivery' && order.customer_name ? ` • ${order.customer_name}` : ''}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Config modal */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">⚙️ Configuration</h2>
            <p className="text-gray-300 text-sm mb-2">Mode d'affichage :</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => setDisplayMode('detailed')} className={`p-3 rounded-lg border ${displayMode === 'detailed' ? 'border-orange-500 bg-orange-500/20' : 'border-slate-600'}`}>
                <span className="text-xl block">📖</span><span className="text-xs">Détaillé</span>
              </button>
              <button onClick={() => setDisplayMode('compact')} className={`p-3 rounded-lg border ${displayMode === 'compact' ? 'border-orange-500 bg-orange-500/20' : 'border-slate-600'}`}>
                <span className="text-xl block">📋</span><span className="text-xs">Compact</span>
              </button>
            </div>
            <p className="text-gray-300 text-sm mb-2">Colonnes :</p>
            <div className="space-y-2 mb-4">
              {COLUMNS.map(col => (
                <label key={col.key} className="flex items-center gap-2 p-2 bg-slate-700 rounded cursor-pointer">
                  <input type="checkbox" checked={columnConfig[col.key as keyof ColumnConfig]}
                    onChange={(e) => setColumnConfig(prev => ({ ...prev, [col.key]: e.target.checked }))}
                    className="w-4 h-4" />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfig(false)} className="flex-1 bg-gray-600 py-2 rounded-lg">Fermer</button>
              {device && <button onClick={() => { saveConfig(columnConfig, displayMode); setShowConfig(false) }} className="flex-1 bg-orange-500 py-2 rounded-lg">💾 Sauver</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}