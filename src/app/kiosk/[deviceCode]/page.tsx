'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Types
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
}

type OrderType = 'eat_in' | 'takeaway'

type DeviceInfo = {
  id: string
  code: string
  name: string
  type: string
  vivaTerminalId: string | null
  establishmentId: string
}

// Icônes par catégorie
const categoryIcons: Record<string, string> = {
  'frite': '🍟', 'frites': '🍟', 'smashburger': '🍔', 'smashburgers': '🍔',
  'burger': '🍔', 'hamburger': '🍔', 'mitraillette': '🌯', 'pain': '🥖',
  'pains': '🥖', 'snack': '🍗', 'snacks': '🍗', 'pitta': '🥙',
  'sauce': '🥫', 'sauces': '🥫', 'bière': '🍺', 'bières': '🍺',
  'boisson': '🥤', 'boissons': '🥤',
}

function getCategoryIcon(categoryName: string): string {
  const nameLower = categoryName.toLowerCase()
  for (const [key, icon] of Object.entries(categoryIcons)) {
    if (nameLower.includes(key)) return icon
  }
  return '🍽️'
}

export default function KioskDevicePage() {
  const params = useParams()
  const router = useRouter()
  const deviceCode = (params.deviceCode as string)?.toUpperCase()
  
  // Auth state
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthorized'>('checking')
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  
  // Data state
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [allOptionGroups, setAllOptionGroups] = useState<OptionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  
  // Modal produit avec propositions
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [currentPropositions, setCurrentPropositions] = useState<OptionGroup[]>([])
  const [currentPropositionIndex, setCurrentPropositionIndex] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([])
  
  // Cart
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderType, setOrderType] = useState<OrderType | null>(null)
  const [showCart, setShowCart] = useState(false)
  
  // Confirmation
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(10)
  
  // Viva Payment
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle')
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null)
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  
  // Allergen modal
  const [allergenModalProduct, setAllergenModalProduct] = useState<Product | null>(null)

  const supabase = createClient()

  // Vérifier l'authentification au chargement
  useEffect(() => {
    checkAuth()
  }, [deviceCode])

  async function checkAuth() {
    try {
      // 1. Vérifier session Supabase
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setAuthStatus('unauthorized')
        return
      }

      // 2. Vérifier le cookie device
      const response = await fetch('/api/device-auth')
      const data = await response.json()
      
      if (!data.device) {
        setAuthStatus('unauthorized')
        return
      }

      // 3. Vérifier que le device code correspond
      if (data.device.code !== deviceCode) {
        setAuthStatus('unauthorized')
        return
      }

      setDevice(data.device)
      setAuthStatus('authenticated')
      loadData(data.device.establishmentId)
    } catch (error) {
      console.error('Auth check error:', error)
      setAuthStatus('unauthorized')
    }
  }

  // Timer de retour à l'accueil après confirmation
  useEffect(() => {
    if (orderNumber) {
      setCountdown(30)
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer)
            setOrderNumber(null)
            setOrderType(null)
            setPendingOrderId(null)
            setIsSubmitting(false)
            return 30
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [orderNumber])

  async function loadData(establishmentId: string) {
    const { data: categoriesData } = await supabase
      .from('categories')
      .select(`
        id, name, image_url,
        category_option_groups (
          option_group_id, display_order,
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
      .eq('visible_on_kiosk', true)
      .order('display_order')

    const { data: productsData } = await supabase
      .from('products')
      .select(`
        id, name, description, price, image_url, category_id, is_available,
        product_option_groups (
          option_group_id, display_order,
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
      const exists = selectedOptions.find(o => o.item_id === item.id)
      if (exists) {
        if (optionGroup.min_selections === 0) {
          setSelectedOptions(selectedOptions.filter(o => o.option_group_id !== optionGroup.id))
        }
      } else {
        setSelectedOptions([
          ...selectedOptions.filter(o => o.option_group_id !== optionGroup.id),
          newOption,
        ])
      }
    } else {
      const exists = selectedOptions.find(o => o.item_id === item.id)
      if (exists) {
        const currentCount = selectedOptions.filter(o => o.option_group_id === optionGroup.id).length
        if (currentCount > optionGroup.min_selections) {
          setSelectedOptions(selectedOptions.filter(o => o.item_id !== item.id))
        }
      } else {
        const currentCount = selectedOptions.filter(o => o.option_group_id === optionGroup.id).length
        if (optionGroup.max_selections && currentCount >= optionGroup.max_selections) return
        setSelectedOptions([...selectedOptions, newOption])
      }
    }
  }

  function isOptionSelected(itemId: string): boolean {
    return selectedOptions.some(o => o.item_id === itemId)
  }

  function canProceed(): boolean {
    if (currentPropositions.length === 0) return true
    const currentGroup = currentPropositions[currentPropositionIndex]
    if (!currentGroup) return true
    const selectedCount = selectedOptions.filter(o => o.option_group_id === currentGroup.id).length
    return selectedCount >= currentGroup.min_selections
  }

  function nextProposition() {
    const currentGroup = currentPropositions[currentPropositionIndex]
    if (currentGroup) {
      const selectedInCurrentGroup = selectedOptions.filter(o => o.option_group_id === currentGroup.id)
      const triggeredGroupIds: string[] = []
      selectedInCurrentGroup.forEach(selected => {
        const item = currentGroup.option_group_items.find(i => i.id === selected.item_id)
        if (item?.triggers_option_group_id) {
          triggeredGroupIds.push(item.triggers_option_group_id)
        }
      })
      
      if (triggeredGroupIds.length > 0) {
        const triggeredGroups = triggeredGroupIds
          .map(id => allOptionGroups.find(g => g.id === id))
          .filter((g): g is OptionGroup => g !== undefined && g.option_group_items.length > 0)
        
        if (triggeredGroups.length > 0) {
          const existingIds = new Set(currentPropositions.map(p => p.id))
          const newGroups = triggeredGroups.filter(g => !existingIds.has(g.id))
          if (newGroups.length > 0) {
            const newPropositions = [
              ...currentPropositions.slice(0, currentPropositionIndex + 1),
              ...newGroups,
              ...currentPropositions.slice(currentPropositionIndex + 1),
            ]
            setCurrentPropositions(newPropositions)
            setCurrentPropositionIndex(currentPropositionIndex + 1)
            return
          }
        }
      }
    }
    
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

  function addToCart() {
    if (!selectedProduct) return
    const optionsTotal = selectedOptions.reduce((sum, o) => sum + o.price, 0)
    const cartItem: CartItem = {
      id: `${selectedProduct.id}-${Date.now()}`,
      product_id: selectedProduct.id,
      name: selectedProduct.name,
      price: selectedProduct.price,
      quantity: 1,
      options: [...selectedOptions],
      options_total: optionsTotal,
    }
    setCart([...cart, cartItem])
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

  function getCartItemCount(): number {
    return cart.reduce((sum, item) => sum + item.quantity, 0)
  }

  function getCartSubtotal(): number {
    return cart.reduce((sum, item) => sum + (item.price + item.options_total) * item.quantity, 0)
  }

  function getCartTotal(): number {
    const subtotal = getCartSubtotal()
    return orderType === 'eat_in' ? subtotal * 1.06 : subtotal
  }

  function getVatRate(): number {
    return orderType === 'eat_in' ? 12 : 6
  }

  async function initiateVivaPayment(orderId: string, amount: number) {
    try {
      if (!device?.vivaTerminalId) {
        alert('Terminal de paiement non configuré pour cette borne')
        setPaymentStatus('failed')
        return
      }
      
      const response = await fetch('/api/viva/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount,
          orderId: orderId,
          terminalId: device.vivaTerminalId,
        }),
      })
      
      const data = await response.json()
      if (data.success) {
        setPaymentSessionId(data.sessionId)
        setPaymentStatus('pending')
        pollPaymentStatus(data.sessionId, orderId)
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      console.error('Viva payment error:', error)
      setPaymentStatus('failed')
    }
  }

  async function pollPaymentStatus(sessionId: string, orderId: string) {
    const maxAttempts = 60
    let attempts = 0
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/viva/payment?sessionId=${sessionId}`)
        const data = await response.json()
        
        if (data.status === 'success') {
          setPaymentStatus('success')
          await finalizeOrder(orderId)
          return
        } else if (data.status === 'failed') {
          setPaymentStatus('failed')
          return
        }
        
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000)
        } else {
          setPaymentStatus('failed')
        }
      } catch (error) {
        attempts++
        if (attempts < maxAttempts) setTimeout(poll, 2000)
      }
    }
    poll()
  }

  async function finalizeOrder(orderId: string) {
    await supabase
      .from('orders')
      .update({ status: 'pending', payment_status: 'paid' })
      .eq('id', orderId)
    
    const { data } = await supabase
      .from('orders')
      .select('order_number')
      .eq('id', orderId)
      .single()
    
    setPaymentStatus('success')
    setTimeout(() => {
      setOrderNumber(data?.order_number || orderId)
      setCart([])
      setPaymentStatus('idle')
      setPaymentSessionId(null)
    }, 3000)
  }

  async function submitOrder() {
    if (!orderType || cart.length === 0 || !device) return
    setIsSubmitting(true)
    
    try {
      const vatRate = getVatRate()
      const totalTTC = getCartTotal()
      const taxAmount = totalTTC * vatRate / (100 + vatRate)
      const subtotalHT = totalTTC - taxAmount
      
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          establishment_id: device.establishmentId,
          order_type: orderType,
          status: 'awaiting_payment',
          subtotal: subtotalHT,
          tax_amount: taxAmount,
          total_amount: totalTTC,
          source: 'kiosk',
          payment_method: 'card',
          payment_status: 'pending',
          device_id: device.id,
        })
        .select()
        .single()
      
      if (orderError) throw orderError
      setPendingOrderId(order.id)
      
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
      
      const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
      if (itemsError) throw itemsError
      
      await initiateVivaPayment(order.id, totalTTC)
    } catch (error) {
      console.error('Erreur:', error)
      alert('Erreur lors de la commande')
      setIsSubmitting(false)
    }
  }

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

  // ==================== RENDER ====================

  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-[#FFF9E6] flex items-center justify-center">
        <div className="text-center">
          <div className="w-32 h-32 mx-auto mb-6">
            <img src="/Logo_Mdjambo.svg" alt="MDjambo" className="w-full h-full" />
          </div>
          <div className="flex gap-2 justify-center">
            <div className="w-3 h-3 bg-[#E63329] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-3 h-3 bg-[#E63329] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-3 h-3 bg-[#E63329] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    )
  }

  if (authStatus === 'unauthorized') {
    return (
      <div className="min-h-screen bg-[#FFF9E6] flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <span className="text-6xl block mb-6">🔒</span>
          <h1 className="text-2xl font-bold text-[#3D2314] mb-4">Accès non autorisé</h1>
          <p className="text-[#3D2314]/60 mb-8">
            Veuillez vous connecter et sélectionner ce device depuis la page de configuration.
          </p>
          <button
            onClick={() => router.push('/device')}
            className="bg-[#E63329] text-white font-bold px-8 py-4 rounded-xl hover:bg-[#c42a22] transition-colors"
          >
            Aller à la configuration
          </button>
        </div>
      </div>
    )
  }

  // Payment screens
  if (paymentStatus === 'pending') {
    return (
      <div className="min-h-screen bg-[#1E88E5] flex items-center justify-center p-8">
        <div className="text-center text-white">
          <span className="text-8xl block animate-bounce mb-8">💳</span>
          <h1 className="text-4xl font-bold mb-4">Paiement en cours...</h1>
          <p className="text-2xl mb-8">Présentez votre carte sur le terminal</p>
          <div className="bg-white/20 rounded-3xl p-8 inline-block mb-8">
            <p className="text-xl mb-2">Montant à payer</p>
            <p className="text-6xl font-bold">{getCartTotal().toFixed(2)} €</p>
          </div>
          <button
            onClick={async () => {
              if (pendingOrderId) {
                await supabase.from('orders').update({ status: 'cancelled' }).eq('id', pendingOrderId)
                setPendingOrderId(null)
              }
              setPaymentStatus('idle')
              setIsSubmitting(false)
            }}
            className="mt-8 bg-white/20 text-white font-bold px-8 py-3 rounded-xl hover:bg-white/30"
          >
            Annuler
          </button>
        </div>
      </div>
    )
  }

  if (paymentStatus === 'success') {
    return (
      <div className="min-h-screen bg-[#4CAF50] flex items-center justify-center p-8">
        <div className="text-center text-white">
          <span className="text-8xl block animate-bounce mb-8">✅</span>
          <h1 className="text-4xl font-bold mb-4">Paiement validé !</h1>
          <p className="text-2xl">Votre commande est envoyée en cuisine</p>
        </div>
      </div>
    )
  }

  if (paymentStatus === 'failed') {
    return (
      <div className="min-h-screen bg-[#E63329] flex items-center justify-center p-8">
        <div className="text-center text-white">
          <span className="text-8xl block mb-8">❌</span>
          <h1 className="text-4xl font-bold mb-4">Paiement refusé</h1>
          <p className="text-xl mb-8">Veuillez réessayer ou utiliser une autre carte</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={async () => {
                if (pendingOrderId) {
                  setPaymentStatus('idle')
                  setIsSubmitting(true)
                  await initiateVivaPayment(pendingOrderId, getCartTotal())
                }
              }}
              className="bg-white text-[#E63329] font-bold px-8 py-4 rounded-2xl"
            >
              Réessayer
            </button>
            <button
              onClick={async () => {
                if (pendingOrderId) {
                  await supabase.from('orders').update({ status: 'cancelled' }).eq('id', pendingOrderId)
                  setPendingOrderId(null)
                }
                setPaymentStatus('idle')
                setCart([])
                setOrderType(null)
                setIsSubmitting(false)
              }}
              className="bg-white/20 text-white font-bold px-8 py-4 rounded-2xl"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Order type selection
  if (!orderType && !orderNumber) {
    return (
      <div className="min-h-screen bg-[#FFF9E6] flex items-center justify-center p-8">
        <div className="text-center max-w-3xl w-full">
          <div className="w-48 h-48 mx-auto mb-6">
            <img src="/Logo_Mdjambo.svg" alt="MDjambo" className="w-full h-full" />
          </div>
          <h1 className="text-5xl font-black text-[#3D2314] mb-2">MDjambo</h1>
          <p className="text-2xl text-[#3D2314]/70 mb-12">Touchez pour commander</p>
          
          <div className="grid grid-cols-2 gap-8">
            <button
              onClick={() => setOrderType('eat_in')}
              className="bg-white rounded-3xl p-10 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all border-4 border-transparent hover:border-[#F7B52C] group"
            >
              <span className="text-8xl block mb-4 group-hover:scale-110 transition-transform">🍽️</span>
              <span className="text-3xl font-bold text-[#3D2314] block mb-2">Sur place</span>
              <span className="text-[#E63329] font-semibold text-lg">TVA 12%</span>
            </button>
            
            <button
              onClick={() => setOrderType('takeaway')}
              className="bg-white rounded-3xl p-10 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all border-4 border-transparent hover:border-[#F7B52C] group"
            >
              <span className="text-8xl block mb-4 group-hover:scale-110 transition-transform">🥡</span>
              <span className="text-3xl font-bold text-[#3D2314] block mb-2">À emporter</span>
              <span className="text-[#4CAF50] font-semibold text-lg">TVA 6%</span>
            </button>
          </div>
          
          <p className="text-[#3D2314]/30 text-sm mt-12">{device?.name}</p>
        </div>
      </div>
    )
  }

  // Order confirmation
  if (orderNumber) {
    const ticketUrl = typeof window !== 'undefined' ? `${window.location.origin}/ticket/${pendingOrderId}` : `/ticket/${pendingOrderId}`
    
    return (
      <div className="min-h-screen bg-[#4CAF50] flex items-center justify-center p-8">
        <div className="text-center text-white max-w-lg">
          <span className="text-7xl block mb-6">✅</span>
          <h1 className="text-3xl font-bold mb-2">Merci !</h1>
          <p className="text-xl mb-6">Votre commande est enregistrée</p>
          
          <div className="bg-white text-[#3D2314] rounded-3xl p-6 mb-6 shadow-2xl">
            <p className="text-lg mb-1">Numéro de commande</p>
            <p className="text-7xl font-black text-[#E63329]">{orderNumber}</p>
          </div>
          
          {pendingOrderId && (
            <div className="bg-white rounded-2xl p-6 mb-6 shadow-xl">
              <p className="text-[#3D2314] text-base font-semibold mb-3">📱 Scannez pour votre ticket</p>
              <div className="flex justify-center mb-3">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(ticketUrl)}`}
                  alt="QR Code ticket"
                  className="w-40 h-40"
                />
              </div>
            </div>
          )}
          
          <div className="mb-6">
            <div className="w-64 mx-auto bg-white/30 rounded-full h-2 mb-2">
              <div className="bg-white h-2 rounded-full transition-all duration-1000" style={{ width: `${(countdown / 30) * 100}%` }} />
            </div>
            <p className="text-sm opacity-80">Retour à l'accueil dans {countdown}s</p>
          </div>
          
          <button
            onClick={() => { setOrderNumber(null); setOrderType(null); setPendingOrderId(null); setIsSubmitting(false) }}
            className="bg-white text-[#4CAF50] font-bold text-lg px-10 py-3 rounded-xl"
          >
            Nouvelle commande
          </button>
        </div>
      </div>
    )
  }

  // Main interface
  const filteredProducts = products.filter(p => p.category_id === selectedCategory)
  const currentGroup = currentPropositions[currentPropositionIndex]

  return (
    <div className="min-h-screen bg-[#FFF9E6] flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => { setOrderType(null); setCart([]) }} className="text-[#3D2314]/50 hover:text-[#3D2314]">
            ← Retour
          </button>
          <div className="w-12 h-12">
            <img src="/Logo_Mdjambo.svg" alt="MDjambo" className="w-full h-full" />
          </div>
          <span className="text-2xl font-black text-[#E63329]">MDjambo</span>
        </div>
        
        <div className="flex items-center gap-2 bg-[#FFF9E6] rounded-full p-1">
          <button
            onClick={() => setOrderType('eat_in')}
            className={`flex items-center gap-2 px-5 py-2 rounded-full font-semibold transition-all ${
              orderType === 'eat_in' ? 'bg-[#E63329] text-white shadow-md' : 'text-[#3D2314]/60'
            }`}
          >
            🍽️ Sur place
          </button>
          <button
            onClick={() => setOrderType('takeaway')}
            className={`flex items-center gap-2 px-5 py-2 rounded-full font-semibold transition-all ${
              orderType === 'takeaway' ? 'bg-[#E63329] text-white shadow-md' : 'text-[#3D2314]/60'
            }`}
          >
            🥡 À emporter
          </button>
        </div>
      </header>

      {/* Categories */}
      <nav className="bg-white border-b-2 border-[#F7B52C]/30">
        <div className="flex gap-2 overflow-x-auto py-3 px-6">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-full font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'bg-[#E63329] text-white shadow-lg scale-105'
                  : 'bg-[#FFF9E6] text-[#3D2314] hover:bg-[#F7B52C]/20'
              }`}
            >
              <span className="text-xl">{getCategoryIcon(cat.name)}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Products */}
      <main className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-[#3D2314]/50">Chargement...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => openProductModal(product)}
                className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all text-left"
              >
                <div className="aspect-square bg-[#FFF9E6] flex items-center justify-center">
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-6xl">🍔</span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-[#3D2314] text-lg mb-1 line-clamp-1">{product.name}</h3>
                  <p className="text-2xl font-black text-[#E63329]">{product.price.toFixed(2)} €</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Cart bar */}
      {cart.length > 0 && (
        <div 
          className="bg-[#E63329] text-white px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-[#c42a22]"
          onClick={() => setShowCart(true)}
        >
          <div className="flex items-center gap-4">
            <div className="bg-white/20 rounded-full px-4 py-2 flex items-center gap-2">
              <span className="text-2xl">🛒</span>
              <span className="font-bold text-xl">{getCartItemCount()}</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-3xl font-black">{getCartTotal().toFixed(2)} €</span>
            <div className="bg-white text-[#E63329] font-bold px-6 py-3 rounded-xl">
              COMMANDER →
            </div>
          </div>
        </div>
      )}

      {/* Cart panel */}
      {showCart && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowCart(false)}>
          <div className="bg-white w-full max-h-[85vh] rounded-t-3xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#FFF9E6] px-6 py-5 flex items-center justify-between border-b-2 border-[#F7B52C]/30">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🛒</span>
                <h2 className="text-2xl font-bold text-[#3D2314]">Votre commande</h2>
              </div>
              <button onClick={() => setShowCart(false)} className="w-10 h-10 rounded-full bg-[#3D2314]/10 flex items-center justify-center">✕</button>
            </div>
            
            <div className="overflow-y-auto max-h-[45vh] p-6">
              {cart.map(item => (
                <div key={item.id} className="flex items-start gap-4 py-4 border-b border-[#F7B52C]/20 last:border-0">
                  <div className="flex-1">
                    <h3 className="font-bold text-[#3D2314] text-lg">{item.name}</h3>
                    {item.options.length > 0 && (
                      <div className="text-sm text-[#3D2314]/60 mt-1">
                        {item.options.map(o => <span key={o.item_id} className="block">+ {o.item_name}</span>)}
                      </div>
                    )}
                    <p className="text-[#E63329] font-bold text-lg mt-2">
                      {((item.price + item.options_total) * item.quantity).toFixed(2)} €
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-[#FFF9E6] rounded-full">
                      <button onClick={() => updateQuantity(item.id, -1)} className="w-10 h-10 flex items-center justify-center text-[#E63329] font-bold text-xl">−</button>
                      <span className="w-8 text-center font-bold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="w-10 h-10 flex items-center justify-center text-[#E63329] font-bold text-xl">+</button>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} className="w-10 h-10 flex items-center justify-center text-[#E63329]">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="border-t-2 border-[#F7B52C]/30 p-6 bg-[#FFF9E6]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[#3D2314]/70">Sous-total</span>
                <span className="font-semibold">{getCartSubtotal().toFixed(2)} €</span>
              </div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-xl font-bold text-[#3D2314]">TOTAL</span>
                <span className="text-3xl font-black text-[#E63329]">{getCartTotal().toFixed(2)} €</span>
              </div>
              <button
                onClick={() => { setShowCart(false); submitOrder() }}
                disabled={isSubmitting}
                className="w-full bg-[#E63329] text-white font-bold py-5 rounded-2xl text-xl disabled:opacity-50"
              >
                💳 PAYER {getCartTotal().toFixed(2)} €
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeProductModal}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="relative">
              <div className="aspect-video bg-[#FFF9E6] flex items-center justify-center">
                {selectedProduct.image_url ? (
                  <img src={selectedProduct.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-8xl">🍔</span>
                )}
              </div>
              <button onClick={closeProductModal} className="absolute top-4 right-4 w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[40vh]">
              {currentPropositions.length === 0 ? (
                <div>
                  <h2 className="text-2xl font-bold text-[#3D2314] mb-2">{selectedProduct.name}</h2>
                  <p className="text-3xl font-black text-[#E63329] mb-6">{selectedProduct.price.toFixed(2)} €</p>
                  <button onClick={addToCart} className="w-full bg-[#E63329] text-white font-bold px-8 py-4 rounded-xl text-lg">
                    Ajouter au panier
                  </button>
                </div>
              ) : currentGroup ? (
                <div>
                  <div className="flex gap-1 mb-4">
                    {currentPropositions.map((_, idx) => (
                      <div key={idx} className={`h-1 flex-1 rounded-full ${idx <= currentPropositionIndex ? 'bg-[#E63329]' : 'bg-[#F7B52C]/30'}`} />
                    ))}
                  </div>
                  <h3 className="text-xl font-bold text-[#3D2314] mb-1">{currentGroup.name}</h3>
                  <p className="text-[#3D2314]/60 mb-4">
                    {currentGroup.selection_type === 'single' ? 'Choisissez une option' : 'Choisissez vos options'}
                    {currentGroup.min_selections > 0 && <span className="text-[#E63329] ml-2 font-semibold">(obligatoire)</span>}
                  </p>
                  <div className="space-y-3">
                    {currentGroup.option_group_items.map(item => {
                      const price = item.price_override !== null ? item.price_override : item.product.price
                      const isSelected = isOptionSelected(item.id)
                      return (
                        <button
                          key={item.id}
                          onClick={() => selectOption(currentGroup, item)}
                          className={`w-full p-4 rounded-xl border-3 flex items-center gap-4 transition-all ${isSelected ? 'border-[#E63329] bg-red-50' : 'border-[#F7B52C]/30 hover:border-[#F7B52C]'}`}
                        >
                          <div className={`w-7 h-7 rounded-full border-3 flex items-center justify-center ${isSelected ? 'border-[#E63329] bg-[#E63329]' : 'border-[#3D2314]/30'}`}>
                            {isSelected && <span className="text-white text-sm">✓</span>}
                          </div>
                          <div className="w-14 h-14 bg-[#FFF9E6] rounded-xl flex items-center justify-center text-3xl overflow-hidden">
                            {item.product.image_url ? <img src={item.product.image_url} alt="" className="w-full h-full object-cover" /> : '🍽️'}
                          </div>
                          <div className="flex-1 text-left">
                            <span className="font-bold text-[#3D2314]">{item.product.name}</span>
                          </div>
                          <span className={`font-bold text-lg ${price === 0 ? 'text-[#4CAF50]' : 'text-[#E63329]'}`}>
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
              <div className="p-6 border-t-2 border-[#F7B52C]/30 bg-[#FFF9E6] flex items-center justify-between">
                <button onClick={currentPropositionIndex === 0 ? closeProductModal : prevProposition} className="px-6 py-3 rounded-xl border-2 border-[#3D2314]/20 font-semibold">
                  {currentPropositionIndex === 0 ? 'Annuler' : '← Retour'}
                </button>
                <div className="text-center">
                  <p className="text-sm text-[#3D2314]/50">Prix total</p>
                  <p className="text-2xl font-black text-[#E63329]">
                    {(selectedProduct.price + selectedOptions.reduce((sum, o) => sum + o.price, 0)).toFixed(2)} €
                  </p>
                </div>
                <button onClick={nextProposition} disabled={!canProceed()} className="px-6 py-3 rounded-xl bg-[#E63329] text-white font-semibold disabled:opacity-50">
                  {currentPropositionIndex === currentPropositions.length - 1 ? 'Ajouter →' : 'Suivant →'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}