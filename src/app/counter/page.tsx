'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AddressInput from '@/components/AddressInput'
import Link from 'next/link'

// ==================== TYPES ====================

type OptionGroupItem = {
  id: string
  product_id: string
  price_override: number | null
  is_default: boolean
  triggers_option_group_id: string | null
  product: {
    id: string
    name: string
    price: number
    image_url: string | null
  }
}

type OptionGroup = {
  id: string
  name: string
  selection_type: 'single' | 'multi'
  min_selections: number
  max_selections: number | null
  option_group_items: OptionGroupItem[]
}

type ProductOptionGroup = {
  option_group_id: string
  display_order: number
  option_group: OptionGroup
}

type CategoryOptionGroup = {
  option_group_id: string
  display_order: number
  option_group: OptionGroup
}

type Product = {
  id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  category_id: string
  is_available: boolean
  vat_eat_in: number
  vat_takeaway: number
  product_option_groups: ProductOptionGroup[]
  product_ingredients?: any[]
}

type Category = {
  id: string
  name: string
  image_url: string | null
  category_option_groups: CategoryOptionGroup[]
}

type SelectedOption = {
  option_group_id: string
  option_group_name: string
  item_id: string
  item_name: string
  price: number
}

type CartItem = {
  id: string
  product_id: string
  name: string
  price: number
  quantity: number
  options: SelectedOption[]
  options_total: number
  vat_eat_in: number
  vat_takeaway: number
}

type OrderType = 'eat_in' | 'takeaway' | 'delivery'
type PaymentMethod = 'card' | 'cash' | 'offered'

type LateOrder = {
  id: string
  order_number: string
  order_type: string
  status: string
  scheduled_time: string | null
  created_at: string
  customer_name: string | null
  customer_phone: string | null
  delivery_notes: string | null
  total: number
  minutes_late: number
}

type DeviceInfo = {
  id: string
  code: string
  name: string
  type: string
  vivaTerminalId: string | null
  establishmentId: string
}

// ==================== COMPONENT ====================

export default function CounterPage() {
  const router = useRouter()
  
  // Auth state
  const [authStatus, setAuthStatus] = useState<'checking' | 'unauthorized' | 'authenticated'>('checking')
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  
  // Data state
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [allOptionGroups, setAllOptionGroups] = useState<OptionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  
  // Product modal state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [currentPropositions, setCurrentPropositions] = useState<OptionGroup[]>([])
  const [currentPropositionIndex, setCurrentPropositionIndex] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([])
  
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderType, setOrderType] = useState<OrderType>('eat_in')
  
  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [offeredReason, setOfferedReason] = useState('')
  const [cashReceived, setCashReceived] = useState(0)
  
  // Confirmation
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Late orders state
  const [lateOrders, setLateOrders] = useState<LateOrder[]>([])
  const [showLateOrdersModal, setShowLateOrdersModal] = useState(false)
  
  // Allergen modal state
  const [allergenModalProduct, setAllergenModalProduct] = useState<Product | null>(null)

  // Delivery phone order state
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [deliveryCustomerName, setDeliveryCustomerName] = useState('')
  const [deliveryCustomerPhone, setDeliveryCustomerPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null)
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [deliveryInfo, setDeliveryInfo] = useState<any>(null)
  const [deliveryValidated, setDeliveryValidated] = useState(false)
  const [deliveryTimeSlots, setDeliveryTimeSlots] = useState<{ date: string; dayLabel: string; slots: { time: string; label: string; available: boolean }[] }[]>([])
  const [deliverySelectedDate, setDeliverySelectedDate] = useState<string | null>(null)
  const [deliverySelectedTime, setDeliverySelectedTime] = useState<string | null>(null)
  const [loadingDeliverySlots, setLoadingDeliverySlots] = useState(false)

  const supabase = createClient()

  // ==================== EFFECTS ====================

  useEffect(() => {
    checkAuth()
  }, [])

  // ==================== AUTH ====================
  
  async function checkAuth() {
    try {
      // 1. Vérifier session Supabase
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setAuthStatus('unauthorized')
        return
      }

      // 2. Vérifier le cookie device via API
      const response = await fetch('/api/device-auth')
      const data = await response.json()
      
      if (!data.device) {
        setAuthStatus('unauthorized')
        return
      }

      // 3. Vérifier que c'est bien un counter
      if (data.device.type !== 'counter') {
        setAuthStatus('unauthorized')
        return
      }

      setDevice(data.device)
      setAuthStatus('authenticated')
      
      // Load data with device's establishment
      loadData(data.device.establishmentId)
      loadLateOrders(data.device.establishmentId)
      
      const interval = setInterval(() => loadLateOrders(data.device.establishmentId), 60000)
      return () => clearInterval(interval)
    } catch (error) {
      console.error('Auth check error:', error)
      setAuthStatus('unauthorized')
    }
  }

  // ==================== DATA LOADING ====================

  async function loadData(establishmentId: string) {
    console.log('=== LOADING COUNTER DATA ===')
    
    const { data: categoriesData, error: catError } = await supabase
      .from('categories')
      .select(`
        id, name, image_url,
        category_option_groups (
          option_group_id,
          display_order,
          option_group:option_groups (
            id, name, selection_type, min_selections, max_selections,
            option_group_items!option_group_items_option_group_id_fkey (
              id, product_id, price_override, is_default, triggers_option_group_id,
              product:products (id, name, price, image_url)
            )
          )
        )
      `)
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .order('display_order')

    console.log('Categories error:', catError)
    console.log('Categories loaded:', categoriesData?.length)

    const { data: productsData, error: prodError } = await supabase
      .from('products')
      .select(`
        id, name, description, price, image_url, category_id, is_available, vat_eat_in, vat_takeaway,
        product_option_groups (
          option_group_id,
          display_order,
          option_group:option_groups (
            id, name, selection_type, min_selections, max_selections,
            option_group_items!option_group_items_option_group_id_fkey (
              id, product_id, price_override, is_default, triggers_option_group_id,
              product:products (id, name, price, image_url)
            )
          )
        ),
        product_ingredients (
          ingredient:ingredients (
            ingredient_allergens (
              is_trace,
              allergen:allergens (code, name_fr, emoji)
            )
          )
        )
      `)
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .eq('is_available', true)
      .order('display_order')

    console.log('Products error:', prodError)
    console.log('Products loaded:', productsData?.length)

    const { data: allOptionGroupsData } = await supabase
      .from('option_groups')
      .select(`
        id, name, selection_type, min_selections, max_selections,
        option_group_items!option_group_items_option_group_id_fkey (
          id, product_id, price_override, is_default, triggers_option_group_id,
          product:products (id, name, price, image_url)
        )
      `)
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)

    setCategories((categoriesData || []) as any)
    setProducts((productsData || []) as any)
    setAllOptionGroups((allOptionGroupsData || []) as any)
    
    if (categoriesData && categoriesData.length > 0) {
      setSelectedCategory(categoriesData[0].id)
    }
    
    setLoading(false)
  }

  async function loadLateOrders(establishmentId: string) {
    const now = new Date()
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)
    
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, order_type, status, 
        scheduled_time, created_at,
        customer_name, customer_phone, delivery_notes, total
      `)
      .eq('establishment_id', establishmentId)
      .in('order_type', ['delivery', 'takeaway'])
      .in('status', ['pending', 'preparing', 'ready'])
      .or(`scheduled_time.lt.${thirtyMinutesAgo.toISOString()},and(scheduled_time.is.null,created_at.lt.${thirtyMinutesAgo.toISOString()})`)
      .order('scheduled_time', { ascending: true })

    if (!error && data) {
      const ordersWithLateness = data.map(order => {
        const referenceTime = order.scheduled_time || order.created_at
        const minutesLate = Math.floor((now.getTime() - new Date(referenceTime).getTime()) / 60000)
        return { ...order, minutes_late: minutesLate }
      })
      setLateOrders(ordersWithLateness as LateOrder[])
    }
  }

  // ==================== DELIVERY PHONE ORDER ====================

  function startDeliveryOrder() {
    setOrderType('delivery')
    setShowDeliveryModal(true)
    setDeliveryCustomerName('')
    setDeliveryCustomerPhone('')
    setDeliveryAddress('')
    setDeliveryLat(null)
    setDeliveryLng(null)
    setDeliveryFee(0)
    setDeliveryInfo(null)
    setDeliveryValidated(false)
    setDeliveryTimeSlots([])
    setDeliverySelectedDate(null)
    setDeliverySelectedTime(null)
    loadDeliveryTimeSlots()
  }

  function cancelDeliveryOrder() {
    setShowDeliveryModal(false)
    setOrderType('takeaway')
    setDeliveryCustomerName('')
    setDeliveryCustomerPhone('')
    setDeliveryAddress('')
    setDeliveryValidated(false)
    setDeliveryFee(0)
    setDeliverySelectedDate(null)
    setDeliverySelectedTime(null)
  }

  async function loadDeliveryTimeSlots() {
    if (!device) return
    setLoadingDeliverySlots(true)
    try {
      const response = await fetch(
        `/api/timeslots?establishmentId=${device.establishmentId}&orderType=delivery&days=3&_t=${Date.now()}`,
        { cache: 'no-store' }
      )
      const data = await response.json()
      if (data.slots) {
        setDeliveryTimeSlots(data.slots)
        const firstAvailable = data.slots.find(
          (day: any) => day.slots.some((s: any) => s.available)
        )
        if (firstAvailable) {
          setDeliverySelectedDate(firstAvailable.date)
        }
      }
    } catch (e) {
      console.error('Erreur chargement créneaux delivery:', e)
    } finally {
      setLoadingDeliverySlots(false)
    }
  }

  function confirmDeliveryInfo() {
    if (!deliveryCustomerName || !deliveryCustomerPhone || !deliveryValidated || !deliverySelectedDate || !deliverySelectedTime) {
      alert('Veuillez remplir tous les champs')
      return
    }
    setShowDeliveryModal(false)
  }

  // ==================== PRODUCT MODAL ====================

  function openProductModal(product: Product) {
    let propositions: OptionGroup[] = []
    
    if (product.product_option_groups && product.product_option_groups.length > 0) {
      propositions = product.product_option_groups
        .sort((a, b) => a.display_order - b.display_order)
        .map(pog => pog.option_group)
        .filter(og => og && og.option_group_items && og.option_group_items.length > 0)
    } else {
      const category = categories.find(c => c.id === product.category_id)
      if (category && category.category_option_groups) {
        propositions = category.category_option_groups
          .sort((a, b) => a.display_order - b.display_order)
          .map(cog => cog.option_group)
          .filter(og => og && og.option_group_items && og.option_group_items.length > 0)
      }
    }
    
    setSelectedProduct(product)
    setCurrentPropositions(propositions)
    setCurrentPropositionIndex(0)
    
    const defaultOptions: SelectedOption[] = []
    propositions.forEach(og => {
      og.option_group_items.forEach(item => {
        if (item.is_default) {
          const price = item.price_override !== null ? item.price_override : item.product.price
          defaultOptions.push({
            option_group_id: og.id,
            option_group_name: og.name,
            item_id: item.id,
            item_name: item.product.name,
            price,
          })
        }
      })
    })
    setSelectedOptions(defaultOptions)
  }

  function closeProductModal() {
    setSelectedProduct(null)
    setCurrentPropositions([])
    setCurrentPropositionIndex(0)
    setSelectedOptions([])
  }

  function selectOption(optionGroup: OptionGroup, item: OptionGroupItem) {
    const price = item.price_override !== null ? item.price_override : item.product.price
    
    const newOption: SelectedOption = {
      option_group_id: optionGroup.id,
      option_group_name: optionGroup.name,
      item_id: item.id,
      item_name: item.product.name,
      price,
    }
    
    if (optionGroup.selection_type === 'single') {
      setSelectedOptions([
        ...selectedOptions.filter(o => o.option_group_id !== optionGroup.id),
        newOption,
      ])
    } else {
      const exists = selectedOptions.find(o => o.item_id === item.id)
      if (exists) {
        setSelectedOptions(selectedOptions.filter(o => o.item_id !== item.id))
      } else {
        const currentCount = selectedOptions.filter(o => o.option_group_id === optionGroup.id).length
        if (optionGroup.max_selections && currentCount >= optionGroup.max_selections) {
          return
        }
        setSelectedOptions([...selectedOptions, newOption])
      }
    }
  }

  function isOptionSelected(itemId: string): boolean {
    return selectedOptions.some(o => o.item_id === itemId)
  }

  function canProceed(): boolean {
    const currentGroup = currentPropositions[currentPropositionIndex]
    if (!currentGroup) return true
    
    const selectedInGroup = selectedOptions.filter(o => o.option_group_id === currentGroup.id).length
    return selectedInGroup >= currentGroup.min_selections
  }

  function nextProposition() {
    if (!canProceed()) return
    
    if (currentPropositionIndex < currentPropositions.length - 1) {
      setCurrentPropositionIndex(currentPropositionIndex + 1)
    } else {
      addToCart()
    }
  }

  function prevProposition() {
    if (currentPropositionIndex > 0) {
      setCurrentPropositionIndex(currentPropositionIndex - 1)
    }
  }

  // ==================== CART ====================

  function addToCart() {
    if (!selectedProduct) return
    
    const optionsTotal = selectedOptions.reduce((sum, o) => sum + o.price, 0)
    
    const newItem: CartItem = {
      id: Date.now().toString(),
      product_id: selectedProduct.id,
      name: selectedProduct.name,
      price: selectedProduct.price,
      quantity: 1,
      options: selectedOptions,
      options_total: optionsTotal,
      vat_eat_in: selectedProduct.vat_eat_in || 12,
      vat_takeaway: selectedProduct.vat_takeaway || 6,
    }
    
    setCart([...cart, newItem])
    closeProductModal()
  }

  function removeFromCart(itemId: string) {
    setCart(cart.filter(item => item.id !== itemId))
  }

  function updateQuantity(itemId: string, delta: number) {
    setCart(cart.map(item => {
      if (item.id === itemId) {
        const newQty = Math.max(1, item.quantity + delta)
        return { ...item, quantity: newQty }
      }
      return item
    }))
  }

  function getCartSubtotal(): number {
    return cart.reduce((sum, item) => sum + (item.price + item.options_total) * item.quantity, 0)
  }

  function getCartTotal(): number {
    // Prix TTC identique pour le client (sur place ou emporter)
    // La différence de TVA (12% vs 6%) est absorbée par le commerçant
    return getCartSubtotal() + (orderType === 'delivery' ? deliveryFee : 0)
  }

  function getTotalWithVat(): number {
    return getCartTotal()
  }

  function getVatRate(): number {
    return orderType === 'eat_in' ? 12 : 6
  }

  function getDeliverySelectedDaySlots() {
    return deliveryTimeSlots.find(d => d.date === deliverySelectedDate)?.slots || []
  }

  function getChange(): number {
    return Math.max(0, cashReceived - getTotalWithVat())
  }

  // ==================== ORDER SUBMISSION ====================

  async function submitOrder() {
    if (!orderType || cart.length === 0) return
    
    // Validation delivery
    if (orderType === 'delivery') {
      if (!deliveryCustomerName || !deliveryCustomerPhone || !deliveryValidated || !deliverySelectedDate || !deliverySelectedTime) {
        alert('Informations de livraison incomplètes')
        return
      }
    }
    
    setIsSubmitting(true)
    
    try {
      const totalTTC = getCartTotal()
      // Calcul TVA par produit (chaque produit a son propre taux)
      const vatType = orderType === 'eat_in' ? 'vat_eat_in' : 'vat_takeaway'
      let totalTax = 0
      cart.forEach(item => {
        const rate = orderType === 'eat_in' ? item.vat_eat_in : item.vat_takeaway
        const itemTTC = (item.price + item.options_total) * item.quantity
        totalTax += itemTTC * rate / (100 + rate)
      })
      const taxAmount = Math.round(totalTax * 100) / 100
      const subtotalHT = totalTTC - taxAmount
      
      const isOffered = paymentMethod === 'offered'

      // Convertir le créneau delivery en UTC si nécessaire
      let scheduledSlotUTC = null
      if (orderType === 'delivery' && deliverySelectedDate && deliverySelectedTime) {
        const utcGuess = new Date(`${deliverySelectedDate}T${deliverySelectedTime}:00Z`)
        const utcFormatted = utcGuess.toLocaleString('en-US', { timeZone: 'UTC' })
        const brusselsFormatted = utcGuess.toLocaleString('en-US', { timeZone: 'Europe/Brussels' })
        const offsetMs = new Date(brusselsFormatted).getTime() - new Date(utcFormatted).getTime()
        scheduledSlotUTC = new Date(utcGuess.getTime() - offsetMs).toISOString()
      }
      
      // Créer la commande
      const orderData: any = {
        establishment_id: device!.establishmentId,
        order_type: orderType,
        status: 'pending',
        subtotal: subtotalHT,
        tax_amount: taxAmount,
        total: totalTTC,
        total_amount: totalTTC,
        source: 'counter',
        payment_method: orderType === 'delivery' ? 'cash' : (paymentMethod === 'offered' ? 'cash' : paymentMethod),
        payment_status: orderType === 'delivery' ? 'pending' : 'paid',
        is_offered: isOffered,
        device_id: device!.id,
        metadata: orderType === 'delivery' 
          ? JSON.stringify({
              delivery_address: deliveryAddress,
              delivery_lat: deliveryLat,
              delivery_lng: deliveryLng,
              travel_minutes: deliveryInfo?.duration || null,
              phone_order: true,
            })
          : (isOffered && offeredReason ? JSON.stringify({ offered_reason: offeredReason }) : null),
      }

      // Champs spécifiques delivery
      if (orderType === 'delivery') {
        orderData.customer_name = deliveryCustomerName
        orderData.customer_phone = deliveryCustomerPhone
        orderData.delivery_notes = deliveryAddress
        orderData.delivery_fee = deliveryFee
        orderData.scheduled_slot_start = scheduledSlotUTC
        orderData.eat_in = false
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert(orderData)
        .select()
        .single()
      
      if (orderError) {
        console.error('Order error:', orderError)
        throw orderError
      }
      
      // Créer les items
      const orderItems = cart.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        vat_rate: orderType === 'eat_in' ? item.vat_eat_in : item.vat_takeaway,
        options_selected: item.options.length > 0 ? JSON.stringify(item.options) : null,
        options_total: item.options_total,
        line_total: (item.price + item.options_total) * item.quantity,
      }))
      
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems)
      
      if (itemsError) {
        console.error('Items error:', itemsError)
        throw itemsError
      }
      
      // Succès !
      setOrderNumber(order.order_number)
      setCart([])
      setShowPaymentModal(false)
      setPaymentMethod('cash')
      setCashReceived(0)
      setOfferedReason('')
      
      // Reset delivery
      if (orderType === 'delivery') {
        setDeliveryCustomerName('')
        setDeliveryCustomerPhone('')
        setDeliveryAddress('')
        setDeliveryValidated(false)
        setDeliveryFee(0)
        setDeliverySelectedDate(null)
        setDeliverySelectedTime(null)
        setOrderType('takeaway')
      }
      
    } catch (error) {
      console.error('Erreur:', error)
      alert('Erreur lors de la commande')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ==================== LATE ORDERS ACTIONS ====================

  async function markOrderCompleted(orderId: string) {
    await supabase
      .from('orders')
      .update({ status: 'completed' })
      .eq('id', orderId)
    
    if (device) loadLateOrders(device.establishmentId)
  }

  async function cancelOrder(orderId: string) {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette commande ?')) return
    
    await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId)
    
    if (device) loadLateOrders(device.establishmentId)
  }

  async function postponeOrder(orderId: string, minutes: number = 30) {
    const { data: order } = await supabase
      .from('orders')
      .select('scheduled_time, created_at')
      .eq('id', orderId)
      .single()
    
    if (order) {
      const baseTime = order.scheduled_time ? new Date(order.scheduled_time) : new Date(order.created_at)
      const newTime = new Date(baseTime.getTime() + minutes * 60 * 1000)
      
      await supabase
        .from('orders')
        .update({ scheduled_time: newTime.toISOString() })
        .eq('id', orderId)
      
      if (device) loadLateOrders(device.establishmentId)
    }
  }

  // ==================== HELPERS ====================

  const filteredProducts = products.filter(p => p.category_id === selectedCategory)

  // Helper pour extraire les allergènes d'un produit
  function getProductAllergens(product: Product) {
    const allergenMap = new Map<string, { emoji: string; name: string; is_trace: boolean }>()
    
    product.product_ingredients?.forEach((pi: any) => {
      pi.ingredient?.ingredient_allergens?.forEach((ia: any) => {
        const existing = allergenMap.get(ia.allergen.code)
        if (!existing || (existing.is_trace && !ia.is_trace)) {
          allergenMap.set(ia.allergen.code, {
            emoji: ia.allergen.emoji,
            name: ia.allergen.name_fr,
            is_trace: ia.is_trace
          })
        }
      })
    })
    
    return Array.from(allergenMap.values())
  }
  const currentGroup = currentPropositions[currentPropositionIndex]

  function formatTime(dateStr: string | null): string {
    if (!dateStr) return '--:--'
    return new Date(dateStr).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
  }

  function getOrderTypeEmoji(type: string): string {
    const emojis: Record<string, string> = {
      delivery: '🚗',
      takeaway: '🥡',
      eat_in: '🍽️',
    }
    return emojis[type] || '📦'
  }

  function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'En attente',
      preparing: 'En préparation',
      ready: 'Prêt',
    }
    return labels[status] || status
  }

  // ==================== RENDER ====================

  // Checking auth
  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl block mb-4 animate-pulse">📋</span>
          <p className="text-gray-500 text-xl">Vérification...</p>
        </div>
      </div>
    )
  }

  // Need to login via /device
  if (authStatus === 'unauthorized') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <span className="text-6xl block mb-6">🔒</span>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Accès non autorisé</h1>
          <p className="text-gray-500 mb-8">
            Veuillez vous connecter et sélectionner une caisse depuis la page de configuration.
          </p>
          <button
            onClick={() => router.push('/device')}
            className="bg-orange-500 text-white font-bold px-8 py-4 rounded-xl hover:bg-orange-600 transition-colors"
          >
            Aller à la configuration
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl block mb-4 animate-pulse">🍟</span>
          <p className="text-gray-500 text-xl">Chargement...</p>
        </div>
      </div>
    )
  }

  // Écran de confirmation
  if (orderNumber) {
    return (
      <div className="min-h-screen bg-green-500 flex items-center justify-center p-6">
        <div className="text-center text-white">
          <span className="text-[100px] block mb-6">✅</span>
          <h1 className="text-4xl font-bold mb-6">Commande validée !</h1>
          <div className="bg-white/20 rounded-3xl p-8 inline-block mb-8">
            <p className="text-2xl mb-2">Numéro de commande</p>
            <p className="text-7xl font-bold">#{orderNumber}</p>
          </div>
          <button
            onClick={() => {
              setOrderNumber(null)
              setOrderType('takeaway')
            }}
            className="bg-white text-green-600 font-bold px-12 py-5 rounded-2xl text-2xl active:scale-95 transition-transform"
          >
            Nouvelle commande
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-100 flex overflow-hidden">
      {/* Zone principale */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header - Optimisé tablette 10" */}
        <header className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold flex items-center gap-2">
              📋 Caisse
            </h1>
            <span className="text-sm text-gray-400">{device?.name}</span>
            <button
              onClick={() => router.push('/device')}
              className="bg-slate-700 px-3 py-2 rounded-lg text-sm hover:bg-slate-600"
            >
              🔄
            </button>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Type de commande - Boutons tablette */}
            <div className="flex gap-3">
              <button
                onClick={() => setOrderType('eat_in')}
                className={`px-6 py-3 rounded-xl font-semibold text-lg transition-all active:scale-95 ${
                  orderType === 'eat_in' 
                    ? 'bg-orange-500 text-white shadow-lg' 
                    : 'bg-slate-700 text-gray-300'
                }`}
              >
                🍽️ Sur place
              </button>
              <button
                onClick={() => setOrderType('takeaway')}
                className={`px-6 py-3 rounded-xl font-semibold text-lg transition-all active:scale-95 ${
                  orderType === 'takeaway' 
                    ? 'bg-orange-500 text-white shadow-lg' 
                    : 'bg-slate-700 text-gray-300'
                }`}
              >
                🥡 Emporter
              </button>
              <button
                onClick={startDeliveryOrder}
                className={`px-6 py-3 rounded-xl font-semibold text-lg transition-all active:scale-95 ${
                  orderType === 'delivery' 
                    ? 'bg-blue-500 text-white shadow-lg' 
                    : 'bg-slate-700 text-gray-300'
                }`}
              >
                📞 Livraison
              </button>
            </div>
            
            {/* Badge commandes en retard */}
            <button
              onClick={() => setShowLateOrdersModal(true)}
              className={`relative px-6 py-3 rounded-xl font-semibold text-lg transition-all active:scale-95 ${
                lateOrders.length > 0 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'bg-slate-700 text-gray-400'
              }`}
            >
              ⚠️ Retards
              {lateOrders.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">
                  {lateOrders.length}
                </span>
              )}
            </button>
            
            {/* Bouton Backoffice */}
            <Link
              href="/counter/backoffice"
              className="px-6 py-3 rounded-xl font-semibold text-lg transition-all active:scale-95 bg-slate-700 text-gray-300 hover:bg-slate-600"
            >
              ⚙️ Backoffice
            </Link>
          </div>
        </header>

        {/* Categories - Optimisé tablette */}
        <div className="bg-white border-b px-4 py-4 flex-shrink-0">
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-6 py-3 rounded-xl font-semibold whitespace-nowrap transition-all active:scale-95 text-lg ${
                  selectedCategory === cat.id
                    ? 'bg-orange-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products grid - Optimisé tablette 10" FHD */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredProducts.length === 0 ? (
            <div className="text-center text-gray-400 py-16">
              <span className="text-6xl block mb-4">📦</span>
              <p className="text-xl">Aucun produit dans cette catégorie</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {filteredProducts.map(product => {
                const allergens = getProductAllergens(product)
                
                return (
                <div
                  key={product.id}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden text-left relative hover:shadow-md transition-shadow"
                >
                  <button
                    onClick={() => openProductModal(product)}
                    className="w-full active:scale-[0.98] transition-transform"
                  >
                    <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-6xl">🍔</span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-gray-900 text-base leading-tight line-clamp-2 min-h-[3rem]">
                        {product.name}
                      </h3>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-2xl font-bold text-orange-500">{product.price.toFixed(2)} €</p>
                      </div>
                    </div>
                  </button>
                  {/* Bouton allergènes cliquable */}
                  {allergens.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setAllergenModalProduct(product)
                      }}
                      className="absolute bottom-4 right-4 flex gap-1 bg-gray-100 hover:bg-orange-100 rounded-lg px-3 py-2 transition-colors"
                    >
                      {allergens.slice(0, 4).map(a => (
                        <span 
                          key={a.name}
                          className={`text-base ${a.is_trace ? 'opacity-50' : ''}`}
                        >
                          {a.emoji}
                        </span>
                      ))}
                      {allergens.length > 4 && (
                        <span className="text-sm text-gray-400">+{allergens.length - 4}</span>
                      )}
                    </button>
                  )}
                </div>
              )})}
            </div>
          )}
        </div>
      </div>

      {/* Cart sidebar - Optimisé tablette */}
      <div className="w-96 bg-white shadow-xl flex flex-col flex-shrink-0 border-l">
        <div className="p-5 bg-slate-800 text-white flex-shrink-0">
          <h2 className="text-xl font-bold">
            {orderType === 'delivery' ? '📞 Livraison' : '🛒 Commande'}
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <span className="text-6xl block mb-4">🛒</span>
              <p className="text-lg">Panier vide</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map(item => (
                <div key={item.id} className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base">{item.name}</h3>
                      {item.options.length > 0 && (
                        <div className="text-sm text-gray-500 mt-1">
                          {item.options.slice(0, 2).map(o => (
                            <div key={o.item_id} className="truncate">+ {o.item_name}</div>
                          ))}
                          {item.options.length > 2 && (
                            <div className="text-gray-400">+{item.options.length - 2} autres</div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-gray-400 active:text-red-500 p-2 -mr-2 text-xl"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-11 h-11 rounded-full bg-gray-200 font-bold text-xl active:bg-gray-300"
                      >
                        -
                      </button>
                      <span className="font-bold w-10 text-center text-xl">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-11 h-11 rounded-full bg-gray-200 font-bold text-xl active:bg-gray-300"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-bold text-orange-500 text-xl">
                      {((item.price + item.options_total) * item.quantity).toFixed(2)} €
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Cart footer */}
        <div className="border-t p-5 bg-gray-50 flex-shrink-0">
          {/* Delivery info banner */}
          {orderType === 'delivery' && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center justify-between mb-1">
                <span className="text-blue-700 font-bold text-sm">📞 Commande téléphone</span>
                <button
                  onClick={startDeliveryOrder}
                  className="text-blue-500 text-xs underline"
                >
                  Modifier
                </button>
              </div>
              {deliveryCustomerName && (
                <p className="text-sm text-blue-800">{deliveryCustomerName} • {deliveryCustomerPhone}</p>
              )}
              {deliveryAddress && (
                <p className="text-xs text-blue-600 truncate">{deliveryAddress}</p>
              )}
              {deliverySelectedTime && (
                <p className="text-xs text-blue-600">🕐 {deliveryTimeSlots.find(d => d.date === deliverySelectedDate)?.dayLabel} à {deliverySelectedTime}</p>
              )}
              <button
                onClick={cancelDeliveryOrder}
                className="mt-2 text-xs text-red-500 underline"
              >
                Annuler la livraison
              </button>
            </div>
          )}

          <div className="flex justify-between mb-2 text-base">
            <span className="text-gray-600">Sous-total</span>
            <span className="font-semibold">{getCartSubtotal().toFixed(2)} €</span>
          </div>
          {orderType === 'delivery' && deliveryFee > 0 && (
            <div className="flex justify-between mb-2 text-base">
              <span className="text-gray-600">Livraison</span>
              <span className="font-semibold">{deliveryFee.toFixed(2)} €</span>
            </div>
          )}
          <div className="flex justify-between mb-5 text-xl">
            <span className="font-bold">Total</span>
            <span className="font-bold text-orange-500 text-2xl">{getCartTotal().toFixed(2)} €</span>
          </div>
          
          {orderType === 'delivery' ? (
            <button
              onClick={submitOrder}
              disabled={cart.length === 0 || !deliveryValidated || !deliverySelectedTime || isSubmitting}
              className="w-full bg-blue-500 text-white font-bold py-5 rounded-xl disabled:opacity-50 active:scale-[0.98] transition-transform text-xl"
            >
              {isSubmitting ? 'Envoi...' : '📞 Valider livraison (cash)'}
            </button>
          ) : (
            <button
              onClick={() => setShowPaymentModal(true)}
              disabled={cart.length === 0}
              className="w-full bg-green-500 text-white font-bold py-5 rounded-xl disabled:opacity-50 active:scale-[0.98] transition-transform text-xl"
            >
              💶 Encaisser
            </button>
          )}
        </div>
      </div>

      {/* Modal Produit - Optimisé tablette */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex items-center gap-5 flex-shrink-0">
              <div className="w-24 h-24 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                {selectedProduct.image_url ? (
                  <img src={selectedProduct.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-5xl">🍔</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold">{selectedProduct.name}</h2>
                <p className="text-3xl font-bold text-orange-500">{selectedProduct.price.toFixed(2)} €</p>
              </div>
              <button 
                onClick={closeProductModal} 
                className="text-gray-400 active:text-gray-600 text-4xl p-2"
              >
                ✕
              </button>
            </div>
            
            {currentPropositions.length > 1 && (
              <div className="px-4 py-2 flex justify-center gap-2 flex-shrink-0 bg-gray-50">
                {currentPropositions.map((_, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full transition-colors ${
                      i === currentPropositionIndex ? 'bg-orange-500' : 
                      i < currentPropositionIndex ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            )}
            
            <div className="flex-1 overflow-y-auto p-4">
              {currentPropositions.length === 0 ? (
                <div className="text-center py-8">
                  <button
                    onClick={addToCart}
                    className="bg-orange-500 text-white font-bold px-10 py-4 rounded-xl text-lg active:scale-95 transition-transform"
                  >
                    Ajouter au panier
                  </button>
                </div>
              ) : currentGroup ? (
                <div>
                  <h3 className="text-lg font-bold mb-1">{currentGroup.name}</h3>
                  <p className="text-gray-500 text-sm mb-4">
                    {currentGroup.selection_type === 'single' ? 'Choisissez une option' : 'Choisissez vos options'}
                    {currentGroup.min_selections > 0 && <span className="text-red-500 ml-1">(obligatoire)</span>}
                  </p>
                  
                  <div className="space-y-2">
                    {currentGroup.option_group_items.map(item => {
                      const price = item.price_override !== null ? item.price_override : item.product.price
                      const isSelected = isOptionSelected(item.id)
                      
                      return (
                        <button
                          key={item.id}
                          onClick={() => selectOption(currentGroup, item)}
                          className={`w-full p-4 rounded-xl border-2 flex items-center gap-3 transition-all active:scale-[0.98] ${
                            isSelected
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-gray-200'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                          }`}>
                            {isSelected && <span className="text-white text-sm">✓</span>}
                          </div>
                          
                          <span className="flex-1 text-left font-medium">{item.product.name}</span>
                          
                          <span className={`font-bold flex-shrink-0 ${price === 0 ? 'text-green-600' : 'text-orange-500'}`}>
                            {price === 0 ? 'Inclus' : `+${price.toFixed(2)} €`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            
            {currentPropositions.length > 0 && (
              <div className="p-5 border-t flex items-center justify-between flex-shrink-0 bg-gray-50">
                <button
                  onClick={currentPropositionIndex === 0 ? closeProductModal : prevProposition}
                  className="px-6 py-4 rounded-xl border border-gray-300 font-semibold text-lg active:bg-gray-100"
                >
                  {currentPropositionIndex === 0 ? 'Annuler' : '← Retour'}
                </button>
                
                <p className="text-2xl font-bold text-orange-500">
                  {(selectedProduct.price + selectedOptions.reduce((sum, o) => sum + o.price, 0)).toFixed(2)} €
                </p>
                
                <button
                  onClick={nextProposition}
                  disabled={!canProceed()}
                  className="px-6 py-4 rounded-xl bg-orange-500 text-white font-semibold text-lg disabled:opacity-50 active:scale-95 transition-transform"
                >
                  {currentPropositionIndex === currentPropositions.length - 1 ? 'Ajouter' : 'Suivant →'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Paiement - Optimisé tablette */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 bg-slate-800 text-white flex-shrink-0">
              <h2 className="text-2xl font-bold">💶 Encaissement</h2>
              <p className="text-5xl font-bold text-orange-400 mt-3">{getTotalWithVat().toFixed(2)} €</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {/* Payment method */}
              <p className="font-semibold text-gray-700 mb-4 text-lg">Mode de paiement</p>
              <div className="grid grid-cols-3 gap-4 mb-8">
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-5 rounded-xl border-2 text-center transition-all active:scale-95 ${
                    paymentMethod === 'cash'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200'
                  }`}
                >
                  <span className="text-5xl block mb-2">💵</span>
                  <span className="font-semibold text-lg">Espèces</span>
                </button>
                <button
                  onClick={() => setPaymentMethod('card')}
                  className={`p-5 rounded-xl border-2 text-center transition-all active:scale-95 ${
                    paymentMethod === 'card'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <span className="text-5xl block mb-2">💳</span>
                  <span className="font-semibold text-lg">Carte</span>
                </button>
                <button
                  onClick={() => setPaymentMethod('offered')}
                  className={`p-5 rounded-xl border-2 text-center transition-all active:scale-95 ${
                    paymentMethod === 'offered'
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200'
                  }`}
                >
                  <span className="text-5xl block mb-2">🎁</span>
                  <span className="font-semibold text-lg">Offert</span>
                </button>
              </div>
              
              {/* Cash received */}
              {paymentMethod === 'cash' && (
                <div className="mb-8">
                  <label className="font-semibold text-gray-700 block mb-3 text-lg">Montant reçu</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={cashReceived || ''}
                    onChange={(e) => setCashReceived(parseFloat(e.target.value) || 0)}
                    className="w-full px-5 py-5 rounded-xl border border-gray-200 text-4xl font-bold text-center"
                    placeholder="0.00"
                  />
                  
                  {/* Quick amounts */}
                  <div className="grid grid-cols-4 gap-3 mt-4">
                    {[5, 10, 20, 50].map(amount => (
                      <button
                        key={amount}
                        onClick={() => setCashReceived(amount)}
                        className="py-4 rounded-xl bg-gray-100 font-semibold text-xl active:bg-gray-200"
                      >
                        {amount}€
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setCashReceived(Math.ceil(getTotalWithVat()))}
                    className="w-full mt-2 py-3 rounded-xl bg-green-100 text-green-700 font-semibold active:bg-green-200"
                  >
                    Montant exact
                  </button>
                  
                  {cashReceived >= getTotalWithVat() && (
                    <div className="mt-4 p-4 bg-green-50 rounded-xl text-center">
                      <p className="text-gray-600">Monnaie à rendre</p>
                      <p className="text-4xl font-bold text-green-600">{getChange().toFixed(2)} €</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Offered reason */}
              {paymentMethod === 'offered' && (
                <div className="mb-8">
                  <label className="font-semibold text-gray-700 block mb-3 text-lg">Raison (optionnel)</label>
                  <input
                    type="text"
                    value={offeredReason}
                    onChange={(e) => setOfferedReason(e.target.value)}
                    className="w-full px-5 py-5 rounded-xl border border-gray-200 text-xl"
                    placeholder="Ex: Amis, erreur cuisine..."
                  />
                  <p className="text-base text-purple-600 mt-3">
                    ⚠️ Commande non comptabilisée dans le CA
                  </p>
                </div>
              )}
            </div>
            
            {/* Buttons */}
            <div className="p-6 border-t flex gap-4 flex-shrink-0 bg-gray-50">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 px-6 py-5 rounded-xl border border-gray-300 font-semibold text-xl active:bg-gray-100"
              >
                Annuler
              </button>
              <button
                onClick={submitOrder}
                disabled={isSubmitting || (paymentMethod === 'cash' && cashReceived < getTotalWithVat())}
                className="flex-1 px-6 py-5 rounded-xl bg-green-500 text-white font-semibold text-xl disabled:opacity-50 active:scale-95 transition-transform"
              >
                {isSubmitting ? 'Envoi...' : '✓ Valider'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Livraison Téléphone */}
      {showDeliveryModal && device && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 bg-blue-500 text-white flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-2xl font-bold">📞 Commande téléphone</h2>
                <p className="text-blue-100 text-lg">Livraison — paiement cash</p>
              </div>
              <button
                onClick={cancelDeliveryOrder}
                className="text-white/70 active:text-white text-4xl p-2"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Nom + téléphone */}
              <div>
                <label className="font-semibold text-gray-700 block mb-2">Nom du client *</label>
                <input
                  type="text"
                  value={deliveryCustomerName}
                  onChange={e => setDeliveryCustomerName(e.target.value)}
                  className="w-full px-4 py-4 rounded-xl border border-gray-200 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nom Prénom"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="font-semibold text-gray-700 block mb-2">Téléphone *</label>
                <input
                  type="tel"
                  value={deliveryCustomerPhone}
                  onChange={e => setDeliveryCustomerPhone(e.target.value)}
                  className="w-full px-4 py-4 rounded-xl border border-gray-200 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+32 470 00 00 00"
                />
              </div>
              
              {/* Adresse de livraison */}
              <div>
                <label className="font-semibold text-gray-700 block mb-2">Adresse de livraison *</label>
                <AddressInput
                  establishmentId={device.establishmentId}
                  value={deliveryAddress}
                  onChange={(value) => {
                    setDeliveryAddress(value)
                    if (deliveryValidated) {
                      setDeliveryValidated(false)
                      setDeliveryInfo(null)
                    }
                  }}
                  onAddressValidated={(data) => {
                    setDeliveryAddress(data.address)
                    setDeliveryLat(data.lat)
                    setDeliveryLng(data.lng)
                    setDeliveryValidated(true)
                    setDeliveryInfo({
                      deliverable: true,
                      distance: data.travelMinutes,
                      duration: data.travelMinutes,
                    })
                    setDeliveryFee(data.deliveryFee)
                  }}
                  onClear={() => {
                    setDeliveryValidated(false)
                    setDeliveryInfo(null)
                    setDeliveryLat(null)
                    setDeliveryLng(null)
                    setDeliveryFee(0)
                  }}
                />
                {deliveryValidated && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <p className="text-green-700 text-sm font-medium">
                      ✅ Adresse validée — Frais: {deliveryFee.toFixed(2)}€
                      {deliveryInfo?.duration && ` — ~${deliveryInfo.duration} min`}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Créneaux horaires */}
              <div>
                <label className="font-semibold text-gray-700 block mb-2">Créneau de livraison *</label>
                {loadingDeliverySlots ? (
                  <p className="text-gray-400 text-center py-4">Chargement des créneaux...</p>
                ) : deliveryTimeSlots.length === 0 ? (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-red-600 font-medium">Aucun créneau de livraison disponible</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Sélection du jour */}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {deliveryTimeSlots.map(day => {
                        const hasAvailable = day.slots.some(s => s.available)
                        return (
                          <button
                            key={day.date}
                            onClick={() => {
                              setDeliverySelectedDate(day.date)
                              setDeliverySelectedTime(null)
                            }}
                            disabled={!hasAvailable}
                            className={`px-4 py-2 rounded-xl whitespace-nowrap font-medium transition-colors ${
                              deliverySelectedDate === day.date
                                ? 'bg-blue-500 text-white'
                                : hasAvailable
                                ? 'bg-gray-100 text-gray-700'
                                : 'bg-gray-100 text-gray-400'
                            }`}
                          >
                            {day.dayLabel}
                          </button>
                        )
                      })}
                    </div>
                    
                    {/* Créneaux du jour */}
                    <div className="grid grid-cols-4 gap-2">
                      {getDeliverySelectedDaySlots().map(slot => (
                        <button
                          key={slot.time}
                          onClick={() => slot.available && setDeliverySelectedTime(slot.time)}
                          disabled={!slot.available}
                          className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                            deliverySelectedTime === slot.time
                              ? 'bg-blue-500 text-white'
                              : slot.available
                              ? 'bg-gray-100 text-gray-700 active:bg-gray-200'
                              : 'bg-gray-50 text-gray-300'
                          }`}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                    
                    {deliverySelectedTime && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                        <p className="text-blue-700 font-medium text-sm">
                          🕐 Livraison le {deliveryTimeSlots.find(d => d.date === deliverySelectedDate)?.dayLabel} à {deliverySelectedTime}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Footer */}
            <div className="p-6 border-t flex gap-4 flex-shrink-0 bg-gray-50">
              <button
                onClick={cancelDeliveryOrder}
                className="flex-1 px-6 py-5 rounded-xl border border-gray-300 font-semibold text-xl active:bg-gray-100"
              >
                Annuler
              </button>
              <button
                onClick={confirmDeliveryInfo}
                disabled={!deliveryCustomerName || !deliveryCustomerPhone || !deliveryValidated || !deliverySelectedTime}
                className="flex-1 px-6 py-5 rounded-xl bg-blue-500 text-white font-semibold text-xl disabled:opacity-50 active:scale-95 transition-transform"
              >
                ✓ Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Commandes en retard - Optimisé tablette */}
      {showLateOrdersModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 bg-red-500 text-white flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-2xl font-bold">⚠️ Commandes en retard</h2>
                <p className="text-red-100 text-lg">{lateOrders.length} commande(s) depuis +30 min</p>
              </div>
              <button
                onClick={() => setShowLateOrdersModal(false)}
                className="text-white/70 active:text-white text-4xl p-2"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5">
              {lateOrders.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <span className="text-6xl block mb-4">✅</span>
                  <p className="text-lg">Aucune commande en retard !</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lateOrders.map(order => (
                    <div key={order.id} className="bg-gray-50 rounded-xl p-4 border-l-4 border-red-500">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xl font-bold">#{order.order_number}</span>
                            <span className="text-xl">{getOrderTypeEmoji(order.order_type)}</span>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              order.status === 'ready' ? 'bg-green-100 text-green-700' :
                              order.status === 'preparing' ? 'bg-blue-100 text-blue-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {getStatusLabel(order.status)}
                            </span>
                          </div>
                          <p className="text-gray-600">
                            {order.customer_name || 'Client'} • {order.total?.toFixed(2)} €
                          </p>
                          {order.delivery_notes && (
                            <p className="text-gray-500 text-sm truncate max-w-[200px]">{order.delivery_notes}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-red-500 font-bold text-xl">
                            +{order.minutes_late} min
                          </p>
                          <p className="text-gray-400 text-sm">
                            Prévu: {formatTime(order.scheduled_time || order.created_at)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => markOrderCompleted(order.id)}
                          className="flex-1 bg-green-500 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform"
                        >
                          ✅ Terminée
                        </button>
                        <button
                          onClick={() => postponeOrder(order.id, 30)}
                          className="flex-1 bg-blue-500 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform"
                        >
                          📅 +30 min
                        </button>
                        <button
                          onClick={() => cancelOrder(order.id)}
                          className="flex-1 bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl active:bg-red-100 active:text-red-600"
                        >
                          ❌ Annuler
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t bg-gray-50 flex-shrink-0">
              <button
                onClick={() => device && loadLateOrders(device.establishmentId)}
                className="w-full bg-gray-200 text-gray-700 font-semibold py-4 rounded-xl active:bg-gray-300"
              >
                🔄 Rafraîchir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Allergènes */}
      {allergenModalProduct && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setAllergenModalProduct(null)}
        >
          <div 
            className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    {allergenModalProduct.image_url ? (
                      <img src={allergenModalProduct.image_url} alt="" className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      <span className="text-2xl">🍔</span>
                    )}
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">{allergenModalProduct.name}</h2>
                    <p className="text-orange-100 text-sm">Informations allergènes</p>
                  </div>
                </div>
                <button
                  onClick={() => setAllergenModalProduct(null)}
                  className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl"
                >
                  ✕
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {(() => {
                const allergens = getProductAllergens(allergenModalProduct)
                const contains = allergens.filter(a => !a.is_trace)
                const traces = allergens.filter(a => a.is_trace)
                
                if (allergens.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <span className="text-4xl block mb-2">✅</span>
                      <p className="text-green-600 font-medium">Aucun allergène déclaré</p>
                    </div>
                  )
                }
                
                return (
                  <div className="space-y-4">
                    {/* Contient */}
                    {contains.length > 0 && (
                      <div>
                        <h3 className="font-bold text-red-700 mb-2 flex items-center gap-2">
                          <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                          Contient
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                          {contains.map(a => (
                            <div key={a.name} className="flex items-center gap-2 bg-red-50 rounded-xl p-3">
                              <span className="text-2xl">{a.emoji}</span>
                              <span className="font-medium text-red-800 text-sm">{a.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Traces */}
                    {traces.length > 0 && (
                      <div>
                        <h3 className="font-bold text-yellow-700 mb-2 flex items-center gap-2">
                          <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                          Peut contenir des traces de
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                          {traces.map(a => (
                            <div key={a.name} className="flex items-center gap-2 bg-yellow-50 rounded-xl p-3">
                              <span className="text-2xl">{a.emoji}</span>
                              <span className="font-medium text-yellow-800 text-sm">{a.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Note légale */}
                    <div className="bg-gray-100 rounded-xl p-3 mt-4">
                      <p className="text-xs text-gray-500">
                        ⚠️ Ces informations sont fournies à titre indicatif. En cas d'allergie sévère, veuillez consulter notre personnel.
                      </p>
                    </div>
                  </div>
                )
              })()}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t">
              <button
                onClick={() => setAllergenModalProduct(null)}
                className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl active:bg-orange-600"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS pour masquer scrollbar */}
      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  )
}