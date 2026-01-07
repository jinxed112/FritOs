'use client'

import { useState, useEffect } from 'react'
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
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  created_at: string
  order_items: OrderItem[]
  is_offered?: boolean
  customer_name?: string | null
  customer_phone?: string | null
  scheduled_time?: string | null
  delivery_notes?: string | null
  metadata?: { source?: string; slot_date?: string; slot_time?: string; delivery_duration?: number } | null
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
  { key: 'pending', label: 'À préparer', color: 'orange', nextStatus: 'preparing' },
  { key: 'preparing', label: 'En cours', color: 'blue', nextStatus: 'ready' },
  { key: 'ready', label: 'Prêt', color: 'green', nextStatus: 'completed' },
  { key: 'completed', label: 'Clôturé', color: 'gray', nextStatus: null },
] as const

const DEFAULT_COLUMNS = ['pending', 'preparing', 'ready', 'completed']
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
  const lower = optionName.toLowerCase()
  return SAUCE_KEYWORDS.some(kw => lower.includes(kw))
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

function isClickAndCollect(order: Order): boolean {
  return order.metadata?.source === 'click_and_collect' || order.order_type === 'pickup' || order.order_type === 'delivery'
}

function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return '--:--'
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '--:--'
  }
}

function getPreviousStatus(currentStatus: string): string | null {
  const order = ['pending', 'preparing', 'ready', 'completed']
  const idx = order.indexOf(currentStatus)
  return idx > 0 ? order[idx - 1] : null
}

// ==================== MAIN COMPONENT ====================
export default function KitchenPage() {
  // Auth state
  const [authStatus, setAuthStatus] = useState<'checking' | 'needPin' | 'authenticated'>('checking')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [deviceCode, setDeviceCode] = useState('')
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  
  // Data state
  const [orders, setOrders] = useState<Order[]>([])
  const [offeredOrders, setOfferedOrders] = useState<Order[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [showConfig, setShowConfig] = useState(false)
  const [columnConfig, setColumnConfig] = useState<ColumnConfig>({ pending: true, preparing: true, ready: true, completed: true })
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
      // Check if we have a device code in cookie/localStorage
      const savedDeviceCode = localStorage.getItem('kds_device_code')
      if (savedDeviceCode) {
        setDeviceCode(savedDeviceCode)
        const response = await fetch(`/api/device-auth?deviceCode=${savedDeviceCode}`)
        const data = await response.json()
        
        if (data.authenticated && data.device) {
          setDevice(data.device)
          setAuthStatus('authenticated')
          loadAllData(data.device.establishmentId)
          return
        }
      }
      setAuthStatus('needPin')
    } catch (error) {
      console.error('Auth check error:', error)
      setAuthStatus('needPin')
    }
  }

  async function submitPin() {
    if (!deviceCode.trim()) {
      setPinError('Entrez le code du device (ex: KDSJU01)')
      return
    }
    if (pinInput.length < 4) {
      setPinError('Le PIN doit contenir au moins 4 chiffres')
      return
    }
    
    setPinError('')
    
    try {
      const response = await fetch('/api/device-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceCode: deviceCode.toUpperCase(), pin: pinInput })
      })
      
      const data = await response.json()
      
      if (data.success && data.device) {
        // Save device code for next time
        localStorage.setItem('kds_device_code', deviceCode.toUpperCase())
        setDevice(data.device)
        setAuthStatus('authenticated')
        loadAllData(data.device.establishmentId)
      } else {
        setPinError(data.error || 'Code device ou PIN incorrect')
      }
    } catch (error) {
      setPinError('Erreur de connexion')
    }
  }

  function loadAllData(estId: string) {
    loadOrders(estId)
    loadTempOrders(estId)
    setupRealtime(estId)
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `establishment_id=eq.${estId}` }, () => { loadOrders(estId); playNotificationSound() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `establishment_id=eq.${estId}` }, () => loadOrders(estId))
      .subscribe()

    const tempChannel = supabase.channel('temp-orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temp_orders', filter: `establishment_id=eq.${estId}` }, () => { loadTempOrders(estId); playNotificationSound() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'temp_orders', filter: `establishment_id=eq.${estId}` }, () => loadTempOrders(estId))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'temp_orders' }, () => loadTempOrders(estId))
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
      audio.play().catch(() => { })
    } catch { }
  }

  async function loadOrders(estId: string) {
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_number, order_type, status, created_at,
          customer_name, customer_phone, scheduled_time, delivery_notes, metadata,
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

  // ==================== ACTIONS ====================
  async function updateStatus(orderId: string, newStatus: string) {
    const isOffered = offeredOrders.some(o => o.id === orderId)
    
    try {
      const response = await fetch('/api/kitchen/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, newStatus, isOffered })
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('Update status error:', data.error)
        return
      }

      // Clear checked items when completed or ready
      if (newStatus === 'completed' || newStatus === 'ready') {
        setCheckedItems(prev => { const newState = { ...prev }; delete newState[orderId]; return newState })
      }
    } catch (error: any) {
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

  async function saveConfig(newConfig: ColumnConfig, newDisplayMode: 'compact' | 'detailed') {
    if (!device) return
    const columns = Object.entries(newConfig).filter(([_, v]) => v).map(([k]) => k)
    if (columns.length === 0) return
    const updatedConfig = { ...device.config, columns, displayMode: newDisplayMode }
    const { error } = await supabase.from('devices').update({ config: updatedConfig }).eq('id', device.id)
    if (!error) { setColumnConfig(newConfig); setDisplayMode(newDisplayMode); setDevice({ ...device, config: updatedConfig }) }
  }

  // ==================== TIME HELPERS ====================
  function getLaunchTime(order: Order): number {
    if (!order.scheduled_time || order.metadata?.source !== 'click_and_collect') {
      return new Date(order.created_at).getTime()
    }
    const scheduledTime = new Date(order.scheduled_time).getTime()
    const prepTime = avgPrepTime * 60 * 1000
    if (order.order_type === 'delivery') {
      const deliveryTime = (order.metadata?.delivery_duration || 15) * 60 * 1000
      return scheduledTime - prepTime - deliveryTime
    }
    return scheduledTime - prepTime
  }

  function formatLaunchTime(order: Order): { time: string; isNow: boolean; isPast: boolean; isUpcoming: boolean } {
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

  function getTimeSinceLaunch(order: Order): { display: string; isWaiting: boolean } {
    const launchTime = getLaunchTime(order)
    const now = currentTime.getTime()
    const diffMs = now - launchTime
    const diffMinutes = Math.floor(diffMs / (60 * 1000))

    if (diffMinutes < 0) {
      const minutesUntil = Math.abs(diffMinutes)
      if (minutesUntil < 60) return { display: `dans ${minutesUntil}min`, isWaiting: true }
      const hours = Math.floor(minutesUntil / 60)
      const mins = minutesUntil % 60
      return { display: `dans ${hours}h${mins.toString().padStart(2, '0')}`, isWaiting: true }
    }

    if (diffMinutes < 1) return { display: '<1min', isWaiting: false }
    if (diffMinutes < 60) return { display: `${diffMinutes}min`, isWaiting: false }
    return { display: `${Math.floor(diffMinutes / 60)}h${(diffMinutes % 60).toString().padStart(2, '0')}`, isWaiting: false }
  }

  function getTimeColor(order: Order): string {
    const launchTime = getLaunchTime(order)
    const now = currentTime.getTime()
    const diffMinutes = Math.floor((now - launchTime) / (60 * 1000))

    if (diffMinutes < 0) return 'text-gray-400'
    if (diffMinutes < 5) return 'text-green-400'
    if (diffMinutes < 10) return 'text-yellow-400'
    if (diffMinutes < 15) return 'text-orange-400'
    return 'text-red-400'
  }

  // ==================== RENDER HELPERS ====================
  const allOrders = [...orders, ...offeredOrders].sort((a, b) => getLaunchTime(a) - getLaunchTime(b))

  function renderItem(item: MergedItem, orderId: string) {
    const isHigh = item.totalQuantity >= 2
    const isVeryHigh = item.totalQuantity >= 4
    const isChecked = isItemChecked(orderId, item.key)

    return (
      <div
        key={item.key}
        className={`p-1.5 rounded cursor-pointer ${isChecked ? 'bg-green-500/20 opacity-50' : isVeryHigh ? 'bg-red-500/20' : isHigh ? 'bg-yellow-500/10' : ''}`}
        onClick={() => toggleItemChecked(orderId, item.key)}
      >
        <div className="flex items-start gap-1.5">
          <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 text-xs ${isChecked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-500'}`}>
            {isChecked && '✓'}
          </div>
          <span className={`min-w-[20px] h-5 rounded flex items-center justify-center text-xs font-bold ${isVeryHigh ? 'bg-red-500 text-white' : isHigh ? 'bg-yellow-500 text-black' : 'bg-slate-600 text-white'}`}>
            {item.totalQuantity}
          </span>
          <div className="flex-1 min-w-0">
            <span className={`text-xs ${isChecked ? 'line-through text-gray-500' : ''} ${isHigh ? 'font-bold' : ''}`}>
              {item.product_name}
              {isVeryHigh && !isChecked && ' ⚠️'}
            </span>
            {item.options.length > 0 && (
              <div className={`flex flex-wrap gap-0.5 mt-0.5 ${isChecked ? 'opacity-50' : ''}`}>
                {item.options.map((opt, idx) => {
                  const iconData = getOptionIcon(opt.item_name)
                  const excluded = isExclusion(opt.item_name)
                  if (displayMode === 'compact' && iconData) {
                    return <span key={idx} className={`text-sm ${excluded ? 'opacity-50' : ''}`} title={opt.item_name}>{excluded && '🚫'}{iconData.icon}</span>
                  }
                  return (
                    <span key={idx} className={`text-[10px] px-1 rounded ${excluded ? 'bg-gray-600 line-through' : 'bg-slate-600'}`}>
                      {excluded && '🚫'}{iconData && <span className={iconData.color}>{iconData.icon}</span>} {opt.item_name}
                    </span>
                  )
                })}
              </div>
            )}
            {item.notes.filter(n => n).map((note, idx) => (
              <p key={idx} className="text-yellow-400 text-[10px] mt-0.5">📝 {note}</p>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function renderOrder(order: Order, column: typeof COLUMNS[number]) {
    const colors = COLOR_CLASSES[column.color as keyof typeof COLOR_CLASSES] || COLOR_CLASSES.gray
    const groupedItems = groupAndMergeItems(order.order_items || [])
    const totalItems = groupedItems.reduce((sum, g) => sum + g.items.length, 0)
    const checkedCount = groupedItems.reduce((sum, g) => sum + g.items.filter(item => isItemChecked(order.id, item.key)).length, 0)
    const allChecked = totalItems > 0 && checkedCount === totalItems
    const isCC = isClickAndCollect(order)
    const launchInfo = formatLaunchTime(order)
    const timeSince = getTimeSinceLaunch(order)
    const prevStatus = getPreviousStatus(column.key)

    return (
      <div key={order.id} className={`bg-slate-700 rounded overflow-hidden border-l-2 ${colors.border} ${allChecked ? 'ring-1 ring-green-500' : ''} ${launchInfo.isPast && column.key === 'pending' ? 'ring-1 ring-red-500 animate-pulse' : ''}`}>

        {/* Header */}
        <div className={`px-2 py-1 flex items-center justify-between ${launchInfo.isPast ? 'bg-red-500/30' : launchInfo.isNow ? 'bg-red-500/20' : 'bg-slate-600'}`}>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm">{order.order_number}</span>
            <span>{getOrderTypeEmoji(order.order_type)}</span>
            {order.is_offered && <span title="Offert">🎁</span>}
            {column.key !== 'completed' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${launchInfo.isPast ? 'bg-red-500 text-white' : launchInfo.isNow ? 'bg-red-500 text-white' : launchInfo.isUpcoming ? 'bg-orange-500 text-white' : isCC ? 'bg-cyan-500/30 text-cyan-300' : 'bg-slate-500 text-gray-300'}`}>
                {launchInfo.isNow ? '🔥 MAINTENANT' : launchInfo.isPast ? '⚠️ RETARD' : launchInfo.isUpcoming ? `⏰ ${launchInfo.time}` : isCC ? `⏰ ${launchInfo.time}` : '🍽️'}
              </span>
            )}
          </div>
          <span className={`text-[10px] font-mono ${getTimeColor(order)}`}>{timeSince.display}</span>
        </div>

        {/* Client info for delivery */}
        {order.order_type === 'delivery' && order.customer_name && column.key !== 'completed' && (
          <div className="px-2 py-0.5 bg-slate-600/50 text-[10px] text-gray-300">
            📍 {order.customer_name} {order.delivery_notes && `- ${order.delivery_notes}`}
          </div>
        )}

        {/* Items grouped by category */}
        {column.key !== 'completed' && (
          <div className="p-1.5 space-y-1">
            {groupedItems.map((group, idx) => {
              const isCollapsed = isSectionCollapsed(order.id, group.categoryName)
              const catCheckedCount = group.items.filter(item => isItemChecked(order.id, item.key)).length
              const catAllChecked = group.items.length > 0 && catCheckedCount === group.items.length

              return (
                <div key={idx}>
                  <div
                    className={`flex items-center gap-1 cursor-pointer border-b border-slate-600 pb-0.5 mb-0.5 ${catAllChecked ? 'opacity-40' : ''}`}
                    onClick={() => toggleSection(order.id, group.categoryName)}
                  >
                    <span>{group.categoryIcon}</span>
                    <span className={`text-[10px] font-bold uppercase ${group.textClass} ${catAllChecked ? 'line-through' : ''}`}>{group.categoryName}</span>
                    <span className={`ml-auto text-[10px] px-1 rounded ${catAllChecked ? 'bg-green-500/30 text-green-400' : group.bgClass + ' ' + group.textClass}`}>
                      {catAllChecked ? '✓' : group.totalCount}
                    </span>
                    <span className="text-gray-500 text-[10px]">{isCollapsed ? '▶' : '▼'}</span>
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

        {/* Progress for completed */}
        {column.key === 'completed' && (
          <div className="px-2 py-1 text-[10px] text-gray-400">
            {(order.order_items || []).reduce((sum, item) => sum + (item.quantity || 0), 0)} article(s)
          </div>
        )}

        {/* Action buttons */}
        <div className="flex border-t border-slate-600">
          {prevStatus ? (
            <div 
              onClick={() => updateStatus(order.id, prevStatus)}
              className="flex-1 bg-slate-600 active:bg-slate-500 text-white py-3 text-lg font-bold cursor-pointer flex items-center justify-center select-none"
              style={{ WebkitTapHighlightColor: 'rgba(255,255,255,0.3)', touchAction: 'manipulation' }}
            >←</div>
          ) : (
            <div className="flex-1 bg-slate-800 py-3" />
          )}
          {column.nextStatus ? (
            <div 
              onClick={() => updateStatus(order.id, column.nextStatus!)}
              className={`flex-1 ${colors.bg} active:brightness-110 text-white py-3 text-lg font-bold cursor-pointer flex items-center justify-center select-none`}
              style={{ WebkitTapHighlightColor: 'rgba(255,255,255,0.3)', touchAction: 'manipulation' }}
            >→</div>
          ) : (
            <div className="flex-1 bg-slate-800 py-3" />
          )}
        </div>
      </div>
    )
  }

  // ==================== MAIN RENDER ====================
  
  // Checking auth
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

  // Need PIN screen
  if (authStatus === 'needPin') {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
          <div className="text-center mb-6">
            <span className="text-5xl block mb-2">👨‍🍳</span>
            <h1 className="text-xl font-bold text-gray-900">Écran Cuisine (KDS)</h1>
            <p className="text-gray-500 text-sm">Entrez le code device et le PIN</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code Device</label>
              <input
                type="text"
                value={deviceCode}
                onChange={(e) => setDeviceCode(e.target.value.toUpperCase())}
                placeholder="Ex: KDSJU01"
                className="w-full text-center text-xl font-mono tracking-widest border-2 border-gray-200 rounded-xl p-3 focus:border-orange-500 focus:outline-none uppercase"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && submitPin()}
                placeholder="••••"
                className="w-full text-center text-2xl font-mono tracking-widest border-2 border-gray-200 rounded-xl p-3 focus:border-orange-500 focus:outline-none"
                maxLength={6}
              />
            </div>
            
            {pinError && (
              <p className="text-red-500 text-center text-sm">{pinError}</p>
            )}
            
            <button
              onClick={submitPin}
              className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition-colors"
            >
              Connexion
            </button>
          </div>
          
          <div className="mt-6 p-3 bg-gray-50 rounded-xl">
            <p className="text-gray-500 text-xs text-center">
              💡 Le code device et PIN sont disponibles dans Admin → Devices
            </p>
          </div>
        </div>
      </div>
    )
  }

  const visibleColumns = COLUMNS.filter(col => columnConfig[col.key as keyof ColumnConfig])
  const gridCols = visibleColumns.length <= 2 ? `grid-cols-${visibleColumns.length}` : visibleColumns.length === 3 ? 'grid-cols-3' : 'grid-cols-4'

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-slate-800 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">🍳 KDS</span>
          <span className="text-[10px] text-gray-400">{device?.name || deviceCode}</span>
          <button onClick={() => setDisplayMode(displayMode === 'compact' ? 'detailed' : 'compact')} className="bg-slate-700 px-2 py-0.5 rounded text-xs">
            {displayMode === 'compact' ? '📖' : '📋'}
          </button>
          <button onClick={() => setShowConfig(true)} className="bg-slate-700 px-2 py-0.5 rounded text-xs">⚙️</button>
        </div>
        <div className="text-xl font-mono font-bold">{currentTime.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>

      {/* Columns */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-gray-400">Chargement...</p></div>
      ) : (
        <div className={`flex-1 grid ${gridCols} gap-1 p-1 overflow-hidden`}>
          {visibleColumns.map(column => {
            const colors = COLOR_CLASSES[column.color as keyof typeof COLOR_CLASSES] || COLOR_CLASSES.gray
            const columnOrders = column.key === 'completed'
              ? allOrders.filter(o => o.status === column.key).slice(-10)
              : allOrders.filter(o => o.status === column.key)

            return (
              <div key={column.key} className="flex flex-col bg-slate-800 rounded overflow-hidden">
                <div className={`${colors.bg} text-white px-2 py-1 flex items-center justify-between flex-shrink-0`}>
                  <span className="font-bold text-xs">{column.label}</span>
                  <span className="bg-white/20 px-1.5 rounded text-xs">{columnOrders.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-1 space-y-1">
                  {columnOrders.length === 0 ? (
                    <p className="text-gray-500 text-center py-4 text-xs">Aucune commande</p>
                  ) : (
                    columnOrders.map(order => renderOrder(order, column))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

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