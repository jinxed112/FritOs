'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

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
  'frite': '🍟',
  'frites': '🍟',
  'smashburger': '🍔',
  'smashburgers': '🍔',
  'burger': '🍔',
  'hamburger': '🍔',
  'mitraillette': '🌯',
  'pain': '🥖',
  'pains': '🥖',
  'snack': '🍗',
  'snacks': '🍗',
  'pitta': '🥙',
  'sauce': '🥫',
  'sauces': '🥫',
  'bière': '🍺',
  'bières': '🍺',
  'boisson': '🥤',
  'boissons': '🥤',
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
  const deviceCode = (params.deviceCode as string)?.toUpperCase()
  
  // Auth state
  const [authStatus, setAuthStatus] = useState<'checking' | 'needPin' | 'authenticated' | 'error'>('checking')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
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
  
  // Allergen modal
  const [allergenModalProduct, setAllergenModalProduct] = useState<Product | null>(null)

  const supabase = createClient()

  // Vérifier l'authentification au chargement
  useEffect(() => {
    checkAuth()
  }, [deviceCode])

  async function checkAuth() {
    if (!deviceCode) {
      setAuthStatus('error')
      return
    }
    
    try {
      const response = await fetch(`/api/device-auth?deviceCode=${deviceCode}`)
      const data = await response.json()
      
      if (data.authenticated && data.device) {
        setDevice(data.device)
        setAuthStatus('authenticated')
        loadData(data.device.establishmentId)
      } else {
        setAuthStatus('needPin')
      }
    } catch (error) {
      console.error('Auth check error:', error)
      setAuthStatus('needPin')
    }
  }

  async function submitPin() {
    if (pinInput.length < 4) {
      setPinError('Le PIN doit contenir au moins 4 chiffres')
      return
    }
    
    setPinError('')
    
    try {
      const response = await fetch('/api/device-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceCode, pin: pinInput })
      })
      
      const data = await response.json()
      
      if (data.success && data.device) {
        setDevice(data.device)
        setAuthStatus('authenticated')
        loadData(data.device.establishmentId)
      } else {
        setPinError(data.error || 'PIN incorrect')
      }
    } catch (error) {
      setPinError('Erreur de connexion')
    }
  }

  // Timer de retour à l'accueil après confirmation
  useEffect(() => {
    if (orderNumber) {
      setCountdown(10)
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer)
            setOrderNumber(null)
            setOrderType(null)
            setIsSubmitting(false)
            return 10
          }
          return prev - 1
        })
      }, 1000)
      
      return () => clearInterval(timer)
    }
  }, [orderNumber])

  async function loadData(establishmentId: string) {
    // Charger catégories visibles sur borne
    const { data: categoriesData } = await supabase
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
      .eq('visible_on_kiosk', true)
      .order('display_order')

    // Charger produits avec leurs propositions et allergènes
    const { data: productsData } = await supabase
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
    if (orderType === 'eat_in') {
      return subtotal * 1.06
    }
    return subtotal
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
        console.error('Poll error:', error)
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000)
        }
      }
    }
    
    poll()
  }

  async function finalizeOrder(orderId: string) {
    await supabase
      .from('orders')
      .update({ payment_status: 'paid' })
      .eq('id', orderId)
    
    const { data } = await supabase
      .from('orders')
      .select('order_number')
      .eq('id', orderId)
      .single()
    
    setOrderNumber(data?.order_number || orderId)
    setCart([])
    setPaymentStatus('idle')
    setPaymentSessionId(null)
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
          status: 'pending',
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
      
      const orderItems = cart.flatMap(item => ({
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
      
      await initiateVivaPayment(order.id, totalTTC)
      
    } catch (error) {
      console.error('Erreur:', error)
      alert('Erreur lors de la commande')
      setIsSubmitting(false)
    }
  }

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

  // ==================== RENDER ====================

  // Écran de vérification
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

  // Écran d'erreur (pas de deviceCode)
  if (authStatus === 'error') {
    return (
      <div className="min-h-screen bg-[#E63329] flex items-center justify-center p-4 sm:p-8">
        <div className="text-center text-white">
          <span className="text-6xl sm:text-8xl block mb-6 sm:mb-8">❌</span>
          <h1 className="text-2xl sm:text-4xl font-bold mb-4">Erreur</h1>
          <p className="text-base sm:text-xl mb-6 sm:mb-8">Code device invalide ou manquant</p>
          <p className="text-sm sm:text-lg opacity-80">URL attendue : /kiosk/BORJU01</p>
        </div>
      </div>
    )
  }

  // Écran de saisie du PIN
  if (authStatus === 'needPin') {
    return (
      <div className="min-h-screen bg-[#FFF9E6] flex items-center justify-center p-4 sm:p-8">
        <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border-4 border-[#F7B52C]">
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-4">
              <img src="/Logo_Mdjambo.svg" alt="MDjambo" className="w-full h-full" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#3D2314]">Authentification</h1>
            <p className="text-[#3D2314]/60 text-sm sm:text-base">Borne {deviceCode}</p>
          </div>
          
          {pinError && (
            <div className="bg-red-50 border-2 border-[#E63329] text-[#E63329] px-4 py-2 sm:py-3 rounded-xl mb-4 text-center font-semibold text-sm sm:text-base">
              {pinError}
            </div>
          )}
          
          <div className="mb-6">
            <label className="block text-sm font-bold text-[#3D2314] mb-2">Code PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && submitPin()}
              className="w-full px-4 sm:px-6 py-3 sm:py-4 text-center text-2xl sm:text-3xl font-mono tracking-[0.3em] sm:tracking-[0.5em] rounded-xl border-3 border-[#F7B52C] focus:border-[#E63329] focus:outline-none bg-[#FFF9E6]"
              placeholder="••••••"
              autoFocus
            />
          </div>
          
          <button
            onClick={submitPin}
            disabled={pinInput.length < 4}
            className="w-full bg-[#E63329] text-white font-bold py-3 sm:py-4 rounded-xl text-base sm:text-lg hover:bg-[#c42a22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ✓ Valider
          </button>
          
          <p className="text-center text-xs text-[#3D2314]/50 mt-4 sm:mt-6">
            Le PIN est disponible dans Admin → Devices
          </p>
        </div>
      </div>
    )
  }

  // Écran de paiement en cours
  if (paymentStatus === 'pending') {
    return (
      <div className="min-h-screen bg-[#1E88E5] flex items-center justify-center p-4 sm:p-8">
        <div className="text-center text-white">
          <div className="mb-6 sm:mb-8">
            <span className="text-6xl sm:text-8xl block animate-bounce">💳</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold mb-4">Paiement en cours...</h1>
          <p className="text-lg sm:text-2xl mb-6 sm:mb-8">Présentez votre carte sur le terminal</p>
          
          <div className="bg-white/20 rounded-2xl sm:rounded-3xl p-6 sm:p-8 inline-block mb-6 sm:mb-8">
            <p className="text-base sm:text-xl mb-2">Montant à payer</p>
            <p className="text-4xl sm:text-6xl font-bold">{getCartTotal().toFixed(2)} €</p>
          </div>
          
          <div className="flex justify-center gap-2">
            <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
            <div className="w-3 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-3 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
          </div>
          
          <button
            onClick={() => {
              setPaymentStatus('idle')
              setIsSubmitting(false)
            }}
            className="mt-6 sm:mt-8 bg-white/20 text-white font-bold px-6 sm:px-8 py-2 sm:py-3 rounded-xl hover:bg-white/30 transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    )
  }

  // Écran de paiement échoué
  if (paymentStatus === 'failed') {
    return (
      <div className="min-h-screen bg-[#E63329] flex items-center justify-center p-4 sm:p-8">
        <div className="text-center text-white">
          <span className="text-6xl sm:text-8xl block mb-6 sm:mb-8">❌</span>
          <h1 className="text-2xl sm:text-4xl font-bold mb-4">Paiement refusé</h1>
          <p className="text-base sm:text-xl mb-6 sm:mb-8">Veuillez réessayer ou utiliser une autre carte</p>
          
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <button
              onClick={() => {
                setPaymentStatus('idle')
                setIsSubmitting(false)
              }}
              className="bg-white text-[#E63329] font-bold text-base sm:text-xl px-6 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl hover:bg-gray-100 transition-colors"
            >
              Réessayer
            </button>
            <button
              onClick={() => {
                setPaymentStatus('idle')
                setCart([])
                setOrderType(null)
                setIsSubmitting(false)
              }}
              className="bg-white/20 text-white font-bold text-base sm:text-xl px-6 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl hover:bg-white/30 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Écran de sélection du type de commande (ACCUEIL)
  if (!orderType && !orderNumber) {
    return (
      <div className="min-h-screen bg-[#FFF9E6] flex items-center justify-center p-4 sm:p-8">
        <div className="text-center max-w-3xl w-full">
          {/* Logo */}
          <div className="w-32 h-32 sm:w-48 sm:h-48 mx-auto mb-4 sm:mb-6">
            <img src="/Logo_Mdjambo.svg" alt="MDjambo" className="w-full h-full" />
          </div>
          
          <h1 className="text-3xl sm:text-5xl font-black text-[#3D2314] mb-2">MDjambo</h1>
          <p className="text-lg sm:text-2xl text-[#3D2314]/70 mb-8 sm:mb-12">Touchez pour commander</p>
          
          <div className="grid grid-cols-2 gap-4 sm:gap-8">
            <button
              onClick={() => setOrderType('eat_in')}
              className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-10 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all border-4 border-transparent hover:border-[#F7B52C] group"
            >
              <span className="text-5xl sm:text-8xl block mb-2 sm:mb-4 group-hover:scale-110 transition-transform">🍽️</span>
              <span className="text-xl sm:text-3xl font-bold text-[#3D2314] block mb-1 sm:mb-2">Sur place</span>
              <span className="text-[#E63329] font-semibold text-sm sm:text-lg">TVA 12%</span>
            </button>
            
            <button
              onClick={() => setOrderType('takeaway')}
              className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-10 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all border-4 border-transparent hover:border-[#F7B52C] group"
            >
              <span className="text-5xl sm:text-8xl block mb-2 sm:mb-4 group-hover:scale-110 transition-transform">🥡</span>
              <span className="text-xl sm:text-3xl font-bold text-[#3D2314] block mb-1 sm:mb-2">À emporter</span>
              <span className="text-[#4CAF50] font-semibold text-sm sm:text-lg">TVA 6%</span>
            </button>
          </div>
          
          {/* Nom du device discret */}
          <p className="text-[#3D2314]/30 text-xs sm:text-sm mt-8 sm:mt-12">{device?.name}</p>
        </div>
      </div>
    )
  }

  // Écran de confirmation
  if (orderNumber) {
    return (
      <div className="min-h-screen bg-[#4CAF50] flex items-center justify-center p-4 sm:p-8">
        <div className="text-center text-white">
          <span className="text-6xl sm:text-8xl block mb-6 sm:mb-8">✅</span>
          <h1 className="text-2xl sm:text-4xl font-bold mb-2 sm:mb-4">Merci !</h1>
          <p className="text-lg sm:text-2xl mb-6 sm:mb-8">Votre commande est enregistrée</p>
          
          <div className="bg-white text-[#3D2314] rounded-2xl sm:rounded-3xl p-6 sm:p-8 inline-block mb-6 sm:mb-8 shadow-2xl">
            <p className="text-base sm:text-xl mb-2">Numéro de commande</p>
            <p className="text-5xl sm:text-7xl font-black text-[#E63329]">{orderNumber}</p>
          </div>
          
          <p className="text-base sm:text-xl mb-6 sm:mb-8">Veuillez patienter, nous vous appellerons</p>
          
          <div className="mb-6 sm:mb-8">
            <div className="w-48 sm:w-64 mx-auto bg-white/30 rounded-full h-2 sm:h-3 mb-2 sm:mb-3">
              <div 
                className="bg-white h-2 sm:h-3 rounded-full transition-all duration-1000"
                style={{ width: `${(countdown / 10) * 100}%` }}
              />
            </div>
            <p className="text-sm sm:text-lg opacity-80">
              Retour à l'accueil dans {countdown}s
            </p>
          </div>
          
          <button
            onClick={() => {
              setOrderNumber(null)
              setOrderType(null)
              setIsSubmitting(false)
            }}
            className="bg-white text-[#4CAF50] font-bold text-base sm:text-xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl sm:rounded-2xl hover:bg-gray-100 transition-colors"
          >
            Nouvelle commande
          </button>
        </div>
      </div>
    )
  }

  // ==================== INTERFACE PRINCIPALE ====================
  const filteredProducts = products.filter(p => p.category_id === selectedCategory)
  const currentGroup = currentPropositions[currentPropositionIndex]

  return (
    <div className="min-h-screen bg-[#FFF9E6] flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-md px-3 sm:px-6 py-2 sm:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => {
              setOrderType(null)
              setCart([])
            }}
            className="text-[#3D2314]/50 hover:text-[#3D2314] font-semibold transition-colors text-sm sm:text-base"
          >
            ← <span className="hidden sm:inline">Retour</span>
          </button>
          <div className="w-8 h-8 sm:w-12 sm:h-12">
            <img src="/Logo_Mdjambo.svg" alt="MDjambo" className="w-full h-full" />
          </div>
          <span className="text-lg sm:text-2xl font-black text-[#E63329]">MDjambo</span>
        </div>
        
        {/* Toggle Sur place / À emporter */}
        <div className="flex items-center gap-1 sm:gap-2 bg-[#FFF9E6] rounded-full p-1">
          <button
            onClick={() => setOrderType('eat_in')}
            className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-5 py-1.5 sm:py-2 rounded-full font-semibold transition-all text-sm sm:text-base ${
              orderType === 'eat_in' 
                ? 'bg-[#E63329] text-white shadow-md' 
                : 'text-[#3D2314]/60 hover:text-[#3D2314]'
            }`}
          >
            <span className="text-base sm:text-xl">🍽️</span>
            <span className="hidden sm:inline">Sur place</span>
          </button>
          <button
            onClick={() => setOrderType('takeaway')}
            className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-5 py-1.5 sm:py-2 rounded-full font-semibold transition-all text-sm sm:text-base ${
              orderType === 'takeaway' 
                ? 'bg-[#E63329] text-white shadow-md' 
                : 'text-[#3D2314]/60 hover:text-[#3D2314]'
            }`}
          >
            <span className="text-base sm:text-xl">🥡</span>
            <span className="hidden sm:inline">À emporter</span>
          </button>
        </div>
      </header>

      {/* Categories Navigation */}
      <nav className="bg-white border-b-2 border-[#F7B52C]/30 px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2 sm:py-3 rounded-full font-bold whitespace-nowrap transition-all text-sm sm:text-base ${
                selectedCategory === cat.id
                  ? 'bg-[#E63329] text-white shadow-lg scale-105'
                  : 'bg-[#FFF9E6] text-[#3D2314] hover:bg-[#F7B52C]/20'
              }`}
            >
              <span className="text-lg sm:text-xl">{getCategoryIcon(cat.name)}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Products Grid */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4">
                <img src="/Logo_Mdjambo.svg" alt="" className="w-full h-full animate-pulse" />
              </div>
              <p className="text-[#3D2314]/50">Chargement...</p>
            </div>
          </div>
        ) : (
          <div className="product-grid">
            {filteredProducts.map(product => {
              const allergens = getProductAllergens(product)
              
              return (
                <button
                  key={product.id}
                  onClick={() => openProductModal(product)}
                  className="bg-white rounded-xl sm:rounded-2xl shadow-md overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all text-left group"
                >
                  {/* Image */}
                  <div className="aspect-square bg-[#FFF9E6] flex items-center justify-center overflow-hidden">
                    {product.image_url ? (
                      <img 
                        src={product.image_url} 
                        alt="" 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                      />
                    ) : (
                      <span className="text-4xl sm:text-6xl">🍔</span>
                    )}
                  </div>
                  
                  {/* Info */}
                  <div className="p-2 sm:p-4">
                    <h3 className="font-bold text-[#3D2314] text-sm sm:text-lg mb-0.5 sm:mb-1 line-clamp-1">{product.name}</h3>
                    <div className="flex items-center justify-between">
                      <p className="text-lg sm:text-2xl font-black text-[#E63329]">{product.price.toFixed(2)} €</p>
                      {allergens.length > 0 && (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation()
                            setAllergenModalProduct(product)
                          }}
                          className="flex gap-0.5 bg-[#FFF9E6] rounded-lg px-1.5 sm:px-2 py-0.5 sm:py-1"
                        >
                          {allergens.slice(0, 3).map(a => (
                            <span key={a.name} className={`text-xs sm:text-sm ${a.is_trace ? 'opacity-50' : ''}`}>
                              {a.emoji}
                            </span>
                          ))}
                          {allergens.length > 3 && (
                            <span className="text-xs text-[#3D2314]/50">+{allergens.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Barre panier fixe en bas */}
      {cart.length > 0 && (
        <div 
          className="bg-[#E63329] text-white px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between cursor-pointer hover:bg-[#c42a22] transition-colors"
          onClick={() => setShowCart(true)}
        >
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="bg-white/20 rounded-full px-2.5 sm:px-4 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2">
              <span className="text-lg sm:text-2xl">🛒</span>
              <span className="font-bold text-base sm:text-xl">{getCartItemCount()}</span>
            </div>
            <span className="font-semibold text-sm sm:text-lg hidden sm:inline">
              {getCartItemCount()} article{getCartItemCount() > 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-6">
            <span className="text-xl sm:text-3xl font-black">{getCartTotal().toFixed(2)} €</span>
            <div className="bg-white text-[#E63329] font-bold px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl flex items-center gap-1 sm:gap-2 hover:bg-gray-100 transition-colors text-sm sm:text-base">
              <span className="hidden sm:inline">COMMANDER</span>
              <span>→</span>
            </div>
          </div>
        </div>
      )}

      {/* Panel Panier (slide-up) */}
      {showCart && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setShowCart(false)}
        >
          <div 
            className="bg-white w-full max-h-[85vh] rounded-t-3xl overflow-hidden animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Header panier */}
            <div className="bg-[#FFF9E6] px-6 py-5 flex items-center justify-between border-b-2 border-[#F7B52C]/30">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🛒</span>
                <h2 className="text-2xl font-bold text-[#3D2314]">Votre commande</h2>
              </div>
              <button 
                onClick={() => setShowCart(false)}
                className="w-10 h-10 rounded-full bg-[#3D2314]/10 flex items-center justify-center text-[#3D2314] hover:bg-[#3D2314]/20 transition-colors"
              >
                ✕
              </button>
            </div>
            
            {/* Liste articles */}
            <div className="overflow-y-auto max-h-[45vh] p-6">
              {cart.map(item => (
                <div key={item.id} className="flex items-start gap-4 py-4 border-b border-[#F7B52C]/20 last:border-0">
                  <div className="flex-1">
                    <h3 className="font-bold text-[#3D2314] text-lg">{item.name}</h3>
                    {item.options.length > 0 && (
                      <div className="text-sm text-[#3D2314]/60 mt-1">
                        {item.options.map(o => (
                          <span key={o.item_id} className="block">
                            + {o.item_name} {o.price > 0 && `(${o.price.toFixed(2)}€)`}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[#E63329] font-bold text-lg mt-2">
                      {((item.price + item.options_total) * item.quantity).toFixed(2)} €
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-[#FFF9E6] rounded-full">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-10 h-10 flex items-center justify-center text-[#E63329] font-bold text-xl hover:bg-[#F7B52C]/30 rounded-full transition-colors"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-bold text-[#3D2314]">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-10 h-10 flex items-center justify-center text-[#E63329] font-bold text-xl hover:bg-[#F7B52C]/30 rounded-full transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="w-10 h-10 flex items-center justify-center text-[#E63329] hover:bg-red-50 rounded-full transition-colors"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Footer panier */}
            <div className="border-t-2 border-[#F7B52C]/30 p-6 bg-[#FFF9E6]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[#3D2314]/70">Sous-total</span>
                <span className="font-semibold text-[#3D2314]">{getCartSubtotal().toFixed(2)} €</span>
              </div>
              {orderType === 'eat_in' && (
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[#3D2314]/70">TVA (12%)</span>
                  <span className="font-semibold text-[#3D2314]">+{(getCartSubtotal() * 0.06).toFixed(2)} €</span>
                </div>
              )}
              <div className="flex items-center justify-between mb-6">
                <span className="text-xl font-bold text-[#3D2314]">TOTAL</span>
                <span className="text-3xl font-black text-[#E63329]">{getCartTotal().toFixed(2)} €</span>
              </div>
              
              <button
                onClick={() => {
                  setShowCart(false)
                  submitOrder()
                }}
                disabled={isSubmitting}
                className="w-full bg-[#E63329] text-white font-bold py-5 rounded-2xl text-xl hover:bg-[#c42a22] disabled:opacity-50 transition-colors flex items-center justify-center gap-3"
              >
                <span>💳</span>
                <span>PAYER {getCartTotal().toFixed(2)} €</span>
              </button>
              
              <button
                onClick={() => {
                  if (confirm('Annuler votre commande ?')) {
                    setCart([])
                    setShowCart(false)
                  }
                }}
                className="w-full mt-3 text-[#3D2314]/50 font-semibold py-3 hover:text-[#E63329] transition-colors"
              >
                Annuler la commande
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Produit avec propositions */}
      {selectedProduct && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeProductModal}
        >
          <div 
            className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header produit */}
            <div className="relative">
              <div className="aspect-video bg-[#FFF9E6] flex items-center justify-center">
                {selectedProduct.image_url ? (
                  <img src={selectedProduct.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-8xl">🍔</span>
                )}
              </div>
              <button
                onClick={closeProductModal}
                className="absolute top-4 right-4 w-12 h-12 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-[#3D2314] shadow-lg hover:bg-white transition-colors"
              >
                ✕
              </button>
            </div>
            
            {/* Contenu */}
            <div className="p-6 overflow-y-auto max-h-[40vh]">
              {/* Produit sans propositions */}
              {currentPropositions.length === 0 ? (
                <div>
                  <h2 className="text-2xl font-bold text-[#3D2314] mb-2">{selectedProduct.name}</h2>
                  {selectedProduct.description && (
                    <p className="text-[#3D2314]/60 mb-4">{selectedProduct.description}</p>
                  )}
                  <p className="text-3xl font-black text-[#E63329] mb-6">{selectedProduct.price.toFixed(2)} €</p>
                  <button
                    onClick={addToCart}
                    className="w-full bg-[#E63329] text-white font-bold px-8 py-4 rounded-xl hover:bg-[#c42a22] transition-colors text-lg"
                  >
                    Ajouter au panier
                  </button>
                </div>
              ) : currentGroup ? (
                <div>
                  {/* Progress bar */}
                  <div className="flex gap-1 mb-4">
                    {currentPropositions.map((_, idx) => (
                      <div 
                        key={idx} 
                        className={`h-1 flex-1 rounded-full ${
                          idx <= currentPropositionIndex ? 'bg-[#E63329]' : 'bg-[#F7B52C]/30'
                        }`}
                      />
                    ))}
                  </div>
                  
                  <h3 className="text-xl font-bold text-[#3D2314] mb-1">{currentGroup.name}</h3>
                  <p className="text-[#3D2314]/60 mb-4">
                    {currentGroup.selection_type === 'single' ? 'Choisissez une option' : 'Choisissez vos options'}
                    {currentGroup.min_selections > 0 && (
                      <span className="text-[#E63329] ml-2 font-semibold">(obligatoire)</span>
                    )}
                    {currentGroup.max_selections && currentGroup.selection_type === 'multi' && (
                      <span className="text-[#3D2314]/40 ml-2">(max {currentGroup.max_selections})</span>
                    )}
                  </p>
                  
                  <div className="space-y-3">
                    {currentGroup.option_group_items.map(item => {
                      const price = item.price_override !== null ? item.price_override : item.product.price
                      const isSelected = isOptionSelected(item.id)
                      
                      return (
                        <button
                          key={item.id}
                          onClick={() => selectOption(currentGroup, item)}
                          className={`w-full p-4 rounded-xl border-3 flex items-center gap-4 transition-all ${
                            isSelected
                              ? 'border-[#E63329] bg-red-50'
                              : 'border-[#F7B52C]/30 hover:border-[#F7B52C]'
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-full border-3 flex items-center justify-center ${
                            isSelected ? 'border-[#E63329] bg-[#E63329]' : 'border-[#3D2314]/30'
                          }`}>
                            {isSelected && <span className="text-white text-sm">✓</span>}
                          </div>
                          
                          <div className="w-14 h-14 bg-[#FFF9E6] rounded-xl flex items-center justify-center text-3xl overflow-hidden">
                            {item.product.image_url ? (
                              <img src={item.product.image_url} alt="" className="w-full h-full object-cover" />
                            ) : '🍽️'}
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
            
            {/* Footer */}
            {currentPropositions.length > 0 && (
              <div className="p-6 border-t-2 border-[#F7B52C]/30 bg-[#FFF9E6] flex items-center justify-between">
                <button
                  onClick={currentPropositionIndex === 0 ? closeProductModal : prevProposition}
                  className="px-6 py-3 rounded-xl border-2 border-[#3D2314]/20 font-semibold text-[#3D2314] hover:bg-white transition-colors"
                >
                  {currentPropositionIndex === 0 ? 'Annuler' : '← Retour'}
                </button>
                
                <div className="text-center">
                  <p className="text-sm text-[#3D2314]/50">Prix total</p>
                  <p className="text-2xl font-black text-[#E63329]">
                    {(selectedProduct.price + selectedOptions.reduce((sum, o) => sum + o.price, 0)).toFixed(2)} €
                  </p>
                </div>
                
                <button
                  onClick={nextProposition}
                  disabled={!canProceed()}
                  className="px-6 py-3 rounded-xl bg-[#E63329] text-white font-semibold disabled:opacity-50 hover:bg-[#c42a22] transition-colors"
                >
                  {(() => {
                    const isLastProposition = currentPropositionIndex === currentPropositions.length - 1
                    if (!isLastProposition) return 'Suivant →'
                    
                    const currentG = currentPropositions[currentPropositionIndex]
                    if (currentG) {
                      const selectedInGroup = selectedOptions.filter(o => o.option_group_id === currentG.id)
                      const hasTriggeredItem = selectedInGroup.some(selected => {
                        const item = currentG.option_group_items.find(i => i.id === selected.item_id)
                        return item?.triggers_option_group_id
                      })
                      if (hasTriggeredItem) return 'Suivant →'
                    }
                    
                    return 'Ajouter →'
                  })()}
                </button>
              </div>
            )}
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
            className="bg-white rounded-3xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 bg-[#F7B52C] text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center overflow-hidden">
                    {allergenModalProduct.image_url ? (
                      <img src={allergenModalProduct.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">🍔</span>
                    )}
                  </div>
                  <div>
                    <h2 className="font-bold text-2xl">{allergenModalProduct.name}</h2>
                    <p className="text-white/80">Informations allergènes</p>
                  </div>
                </div>
                <button
                  onClick={() => setAllergenModalProduct(null)}
                  className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl hover:bg-white/30 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {(() => {
                const allergens = getProductAllergens(allergenModalProduct)
                const contains = allergens.filter(a => !a.is_trace)
                const traces = allergens.filter(a => a.is_trace)
                
                if (allergens.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <span className="text-6xl block mb-4">✅</span>
                      <p className="text-[#4CAF50] font-bold text-xl">Aucun allergène déclaré</p>
                    </div>
                  )
                }
                
                return (
                  <div className="space-y-6">
                    {contains.length > 0 && (
                      <div>
                        <h3 className="font-bold text-[#E63329] text-lg mb-3 flex items-center gap-2">
                          <span className="w-4 h-4 bg-[#E63329] rounded-full"></span>
                          Contient
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                          {contains.map(a => (
                            <div key={a.name} className="flex items-center gap-3 bg-red-50 rounded-2xl p-4">
                              <span className="text-3xl">{a.emoji}</span>
                              <span className="font-bold text-[#E63329]">{a.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {traces.length > 0 && (
                      <div>
                        <h3 className="font-bold text-[#F7B52C] text-lg mb-3 flex items-center gap-2">
                          <span className="w-4 h-4 bg-[#F7B52C] rounded-full"></span>
                          Peut contenir des traces de
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                          {traces.map(a => (
                            <div key={a.name} className="flex items-center gap-3 bg-yellow-50 rounded-2xl p-4">
                              <span className="text-3xl">{a.emoji}</span>
                              <span className="font-bold text-[#F7B52C]">{a.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="bg-[#FFF9E6] rounded-2xl p-4 mt-4">
                      <p className="text-sm text-[#3D2314]/70">
                        ⚠️ Ces informations sont fournies à titre indicatif. En cas d'allergie sévère, veuillez consulter notre personnel.
                      </p>
                    </div>
                  </div>
                )
              })()}
            </div>
            
            <div className="p-6 border-t border-[#F7B52C]/30">
              <button
                onClick={() => setAllergenModalProduct(null)}
                className="w-full bg-[#E63329] text-white font-bold py-4 rounded-2xl text-xl hover:bg-[#c42a22] transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS pour l'animation slide-up */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .product-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 10px;
        }
        @media (min-width: 480px) {
          .product-grid {
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 14px;
          }
        }
        @media (min-width: 640px) {
          .product-grid {
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 18px;
          }
        }
        @media (min-width: 1024px) {
          .product-grid {
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
          }
        }
        @media (min-width: 1440px) {
          .product-grid {
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          }
        }
      `}</style>
    </div>
  )
}