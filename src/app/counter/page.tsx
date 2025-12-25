'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

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
  product_option_groups: ProductOptionGroup[]
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
}

type OrderType = 'eat_in' | 'takeaway'
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

// ==================== COMPONENT ====================

export default function CounterPage() {
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

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  // ==================== EFFECTS ====================

  useEffect(() => {
    loadData()
    loadLateOrders()
    
    // Rafraîchir les commandes en retard toutes les minutes
    const interval = setInterval(loadLateOrders, 60000)
    return () => clearInterval(interval)
  }, [])

  // ==================== DATA LOADING ====================

  async function loadData() {
    console.log('=== LOADING COUNTER DATA ===')
    
    // Charger catégories avec la bonne syntaxe (comme le kiosk)
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
    // Note: pas de filtre visible_on_kiosk pour la caisse - on affiche tout

    console.log('Categories error:', catError)
    console.log('Categories loaded:', categoriesData?.length)

    // Charger produits
    const { data: productsData, error: prodError } = await supabase
      .from('products')
      .select(`
        id, name, description, price, image_url, category_id, is_available,
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
        )
      `)
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .eq('is_available', true)
      .order('display_order')

    console.log('Products error:', prodError)
    console.log('Products loaded:', productsData?.length)

    // Charger tous les option_groups pour les triggers
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

  async function loadLateOrders() {
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
    
    // Pré-sélectionner les options par défaut
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
    const subtotal = getCartSubtotal()
    // Sur place : +6% pour TVA plus élevée (12% vs 6%)
    if (orderType === 'eat_in') {
      return subtotal * 1.06
    }
    return subtotal
  }

  function getTotalWithVat(): number {
    return getCartTotal()
  }

  function getVatRate(): number {
    return orderType === 'eat_in' ? 12 : 6
  }

  function getChange(): number {
    return Math.max(0, cashReceived - getTotalWithVat())
  }

  // ==================== ORDER SUBMISSION ====================

  async function submitOrder() {
    if (!orderType || cart.length === 0) return
    
    setIsSubmitting(true)
    
    try {
      const vatRate = getVatRate()
      const totalTTC = getCartTotal()
      const taxAmount = totalTTC * vatRate / (100 + vatRate)
      const subtotalHT = totalTTC - taxAmount
      
      const isOffered = paymentMethod === 'offered'
      
      // Créer la commande
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          establishment_id: establishmentId,
          order_type: orderType,
          status: 'pending',
          subtotal: subtotalHT,
          tax_amount: taxAmount,
          total: totalTTC,
          source: 'counter',
          payment_method: paymentMethod,
          payment_status: 'paid',
          is_offered: isOffered,
          metadata: isOffered && offeredReason ? { offered_reason: offeredReason } : null,
        })
        .select()
        .single()
      
      if (orderError) throw orderError
      
      // Créer les items
      const orderItems = cart.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        vat_rate: vatRate,
        options_selected: item.options.length > 0 ? JSON.stringify(item.options) : null,
        options_total: item.options_total,
        line_total: (item.price + item.options_total) * item.quantity,
      }))
      
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems)
      
      if (itemsError) throw itemsError
      
      // Succès !
      setOrderNumber(order.order_number)
      setCart([])
      setShowPaymentModal(false)
      setPaymentMethod('cash')
      setCashReceived(0)
      setOfferedReason('')
      
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
    
    loadLateOrders()
  }

  async function cancelOrder(orderId: string) {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette commande ?')) return
    
    await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId)
    
    loadLateOrders()
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
      
      loadLateOrders()
    }
  }

  // ==================== HELPERS ====================

  const filteredProducts = products.filter(p => p.category_id === selectedCategory)
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl block mb-4 animate-pulse">🍟</span>
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    )
  }

  // Écran de confirmation
  if (orderNumber) {
    return (
      <div className="min-h-screen bg-green-500 flex items-center justify-center p-8">
        <div className="text-center text-white">
          <span className="text-8xl block mb-6">✅</span>
          <h1 className="text-4xl font-bold mb-4">Commande validée !</h1>
          <div className="bg-white/20 rounded-3xl p-8 inline-block mb-8">
            <p className="text-xl mb-2">Numéro de commande</p>
            <p className="text-6xl font-bold">#{orderNumber}</p>
          </div>
          <button
            onClick={() => setOrderNumber(null)}
            className="bg-white text-green-600 font-bold px-8 py-4 rounded-xl text-xl"
          >
            Nouvelle commande
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Zone principale */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            📋 Prise de commande
          </h1>
          
          <div className="flex items-center gap-4">
            {/* Bouton type de commande */}
            <div className="flex gap-2">
              <button
                onClick={() => setOrderType('eat_in')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  orderType === 'eat_in' ? 'bg-orange-500 text-white' : 'text-gray-300 hover:text-white'
                }`}
              >
                🍽️ Sur place
              </button>
              <button
                onClick={() => setOrderType('takeaway')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  orderType === 'takeaway' ? 'bg-orange-500 text-white' : 'text-gray-300 hover:text-white'
                }`}
              >
                🥡 Emporter
              </button>
            </div>
            
            {/* Badge commandes en retard */}
            <button
              onClick={() => setShowLateOrdersModal(true)}
              className={`relative px-4 py-2 rounded-lg font-medium transition-colors ${
                lateOrders.length > 0 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'bg-gray-600 text-gray-300'
              }`}
            >
              ⚠️ Retards
              {lateOrders.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                  {lateOrders.length}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Categories */}
        <div className="bg-white border-b p-4">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-6 py-3 rounded-full font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredProducts.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <span className="text-4xl block mb-2">📦</span>
              <p>Aucun produit dans cette catégorie</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => openProductModal(product)}
                  className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow text-left"
                >
                  <div className="aspect-square bg-gray-100 flex items-center justify-center text-4xl">
                    {product.image_url ? (
                      <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                    ) : '🍔'}
                  </div>
                  <div className="p-3">
                    <h3 className="font-bold text-gray-900 text-sm mb-1 line-clamp-2">{product.name}</h3>
                    <p className="text-lg font-bold text-orange-500">{product.price.toFixed(2)} €</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart sidebar */}
      <div className="w-80 bg-white shadow-xl flex flex-col">
        <div className="p-4 border-b bg-slate-800 text-white">
          <h2 className="text-lg font-bold">🛒 Commande</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <span className="text-4xl block mb-2">🛒</span>
              <p className="text-sm">Panier vide</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map(item => (
                <div key={item.id} className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-bold text-sm">{item.name}</h3>
                      {item.options.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {item.options.map(o => (
                            <div key={o.item_id}>+ {o.item_name}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-gray-400 hover:text-red-500 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-8 h-8 rounded-full bg-gray-200 font-bold"
                      >
                        -
                      </button>
                      <span className="font-bold w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-8 h-8 rounded-full bg-gray-200 font-bold"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-bold text-orange-500">
                      {((item.price + item.options_total) * item.quantity).toFixed(2)} €
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Cart footer */}
        <div className="border-t p-4 bg-gray-50">
          <div className="flex justify-between mb-2">
            <span className="text-gray-600">Sous-total</span>
            <span className="font-bold">{getCartSubtotal().toFixed(2)} €</span>
          </div>
          {orderType === 'eat_in' && (
            <div className="flex justify-between mb-2 text-sm text-gray-500">
              <span>Ajustement sur place (+6%)</span>
              <span>+{(getCartSubtotal() * 0.06).toFixed(2)} €</span>
            </div>
          )}
          <div className="flex justify-between mb-4 text-lg">
            <span className="font-bold">Total TTC ({getVatRate()}%)</span>
            <span className="font-bold text-orange-500">{getCartTotal().toFixed(2)} €</span>
          </div>
          
          <button
            onClick={() => setShowPaymentModal(true)}
            disabled={cart.length === 0}
            className="w-full bg-green-500 text-white font-bold py-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            💶 Encaisser
          </button>
        </div>
      </div>

      {/* Modal Produit */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex items-center gap-4">
              <div className="w-20 h-20 bg-gray-100 rounded-xl flex items-center justify-center text-4xl">
                {selectedProduct.image_url ? (
                  <img src={selectedProduct.image_url} alt="" className="w-full h-full object-cover rounded-xl" />
                ) : '🍔'}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold">{selectedProduct.name}</h2>
                <p className="text-2xl font-bold text-orange-500">{selectedProduct.price.toFixed(2)} €</p>
              </div>
              <button onClick={closeProductModal} className="text-gray-400 hover:text-gray-600 text-2xl">
                ✕
              </button>
            </div>
            
            {/* Progress dots */}
            {currentPropositions.length > 1 && (
              <div className="px-4 py-2 flex justify-center gap-2">
                {currentPropositions.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === currentPropositionIndex ? 'bg-orange-500' : 
                      i < currentPropositionIndex ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            )}
            
            <div className="flex-1 overflow-y-auto p-4">
              {currentPropositions.length === 0 ? (
                <div className="text-center py-6">
                  <button
                    onClick={addToCart}
                    className="bg-orange-500 text-white font-bold px-8 py-3 rounded-xl"
                  >
                    Ajouter au panier
                  </button>
                </div>
              ) : currentGroup ? (
                <div>
                  <h3 className="text-lg font-bold mb-2">{currentGroup.name}</h3>
                  <p className="text-gray-500 text-sm mb-3">
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
                          className={`w-full p-3 rounded-xl border-2 flex items-center gap-3 transition-all ${
                            isSelected
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                          }`}>
                            {isSelected && <span className="text-white text-xs">✓</span>}
                          </div>
                          
                          <span className="flex-1 text-left font-medium">{item.product.name}</span>
                          
                          <span className={`font-bold ${price === 0 ? 'text-green-600' : 'text-orange-500'}`}>
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
              <div className="p-4 border-t flex items-center justify-between">
                <button
                  onClick={currentPropositionIndex === 0 ? closeProductModal : prevProposition}
                  className="px-4 py-2 rounded-xl border border-gray-200 font-medium"
                >
                  {currentPropositionIndex === 0 ? 'Annuler' : '← Retour'}
                </button>
                
                <p className="text-lg font-bold text-orange-500">
                  {(selectedProduct.price + selectedOptions.reduce((sum, o) => sum + o.price, 0)).toFixed(2)} €
                </p>
                
                <button
                  onClick={nextProposition}
                  disabled={!canProceed()}
                  className="px-4 py-2 rounded-xl bg-orange-500 text-white font-medium disabled:opacity-50"
                >
                  {currentPropositionIndex === currentPropositions.length - 1 ? 'Ajouter' : 'Suivant →'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Paiement */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden">
            <div className="p-6 bg-slate-800 text-white">
              <h2 className="text-2xl font-bold">💶 Encaissement</h2>
              <p className="text-3xl font-bold text-orange-400 mt-2">{getTotalWithVat().toFixed(2)} €</p>
            </div>
            
            <div className="p-6">
              {/* Payment method */}
              <p className="font-medium text-gray-700 mb-3">Mode de paiement</p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    paymentMethod === 'cash'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-3xl block mb-1">💵</span>
                  <span className="font-medium">Espèces</span>
                </button>
                <button
                  onClick={() => setPaymentMethod('card')}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    paymentMethod === 'card'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-3xl block mb-1">💳</span>
                  <span className="font-medium">Carte</span>
                </button>
                <button
                  onClick={() => setPaymentMethod('offered')}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    paymentMethod === 'offered'
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-3xl block mb-1">🎁</span>
                  <span className="font-medium">Offert</span>
                </button>
              </div>
              
              {/* Cash received */}
              {paymentMethod === 'cash' && (
                <div className="mb-6">
                  <label className="font-medium text-gray-700 block mb-2">Montant reçu</label>
                  <input
                    type="number"
                    step="0.01"
                    value={cashReceived || ''}
                    onChange={(e) => setCashReceived(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-2xl font-bold text-center"
                    placeholder="0.00"
                  />
                  
                  {/* Quick amounts */}
                  <div className="flex gap-2 mt-3">
                    {[10, 20, 50].map(amount => (
                      <button
                        key={amount}
                        onClick={() => setCashReceived(amount)}
                        className="flex-1 py-2 rounded-lg bg-gray-100 font-medium hover:bg-gray-200"
                      >
                        {amount}€
                      </button>
                    ))}
                    <button
                      onClick={() => setCashReceived(Math.ceil(getTotalWithVat()))}
                      className="flex-1 py-2 rounded-lg bg-green-100 text-green-700 font-medium hover:bg-green-200"
                    >
                      Exact
                    </button>
                  </div>
                  
                  {cashReceived > 0 && (
                    <div className="mt-4 p-4 bg-green-50 rounded-xl text-center">
                      <p className="text-gray-600">Monnaie à rendre</p>
                      <p className="text-3xl font-bold text-green-600">{getChange().toFixed(2)} €</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Offered reason */}
              {paymentMethod === 'offered' && (
                <div className="mb-6">
                  <label className="font-medium text-gray-700 block mb-2">Raison (optionnel)</label>
                  <input
                    type="text"
                    value={offeredReason}
                    onChange={(e) => setOfferedReason(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200"
                    placeholder="Ex: Amis, erreur cuisine..."
                  />
                  <p className="text-sm text-purple-600 mt-2">
                    ⚠️ Cette commande ne sera pas comptabilisée dans le chiffre d'affaires
                  </p>
                </div>
              )}
              
              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
                >
                  Annuler
                </button>
                <button
                  onClick={submitOrder}
                  disabled={isSubmitting || (paymentMethod === 'cash' && cashReceived < getTotalWithVat())}
                  className="flex-1 px-6 py-3 rounded-xl bg-green-500 text-white font-semibold disabled:opacity-50"
                >
                  {isSubmitting ? 'Envoi...' : '✓ Valider'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Commandes en retard */}
      {showLateOrdersModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 bg-red-500 text-white flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">⚠️ Commandes en retard</h2>
                <p className="text-red-100">{lateOrders.length} commande(s) en attente depuis plus de 30 min</p>
              </div>
              <button
                onClick={() => setShowLateOrdersModal(false)}
                className="text-white/70 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {lateOrders.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <span className="text-5xl block mb-4">✅</span>
                  <p>Aucune commande en retard !</p>
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
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              order.status === 'ready' ? 'bg-green-100 text-green-700' :
                              order.status === 'preparing' ? 'bg-blue-100 text-blue-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {getStatusLabel(order.status)}
                            </span>
                          </div>
                          <p className="text-gray-600 text-sm">
                            {order.customer_name || 'Client'} • {order.total?.toFixed(2)} €
                          </p>
                          {order.delivery_notes && (
                            <p className="text-gray-500 text-sm">{order.delivery_notes}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-red-500 font-bold text-lg">
                            +{order.minutes_late} min
                          </p>
                          <p className="text-gray-400 text-xs">
                            Prévu: {formatTime(order.scheduled_time || order.created_at)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => markOrderCompleted(order.id)}
                          className="flex-1 bg-green-500 text-white font-medium py-2 rounded-lg hover:bg-green-600"
                        >
                          ✅ Terminée
                        </button>
                        <button
                          onClick={() => postponeOrder(order.id, 30)}
                          className="flex-1 bg-blue-500 text-white font-medium py-2 rounded-lg hover:bg-blue-600"
                        >
                          📅 +30 min
                        </button>
                        <button
                          onClick={() => cancelOrder(order.id)}
                          className="flex-1 bg-gray-200 text-gray-700 font-medium py-2 rounded-lg hover:bg-red-100 hover:text-red-600"
                        >
                          ❌ Annuler
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => {
                  loadLateOrders()
                }}
                className="w-full bg-gray-200 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-300"
              >
                🔄 Rafraîchir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}