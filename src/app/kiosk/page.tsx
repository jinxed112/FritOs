'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

export default function KioskPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [allOptionGroups, setAllOptionGroups] = useState<OptionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  
  // Device info
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [vivaTerminalId, setVivaTerminalId] = useState<string | null>(null)
  const [deviceChecked, setDeviceChecked] = useState(false)
  
  // Modal produit avec propositions
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [currentPropositions, setCurrentPropositions] = useState<OptionGroup[]>([])
  const [currentPropositionIndex, setCurrentPropositionIndex] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([])
  const [basePropositions, setBasePropositions] = useState<OptionGroup[]>([]) // Propositions de base (sans triggers)
  
  // Cart
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderType, setOrderType] = useState<OrderType | null>(null)
  
  // Confirmation
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(10)
  
  // Viva Payment
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle')
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null)

  const supabase = createClient()
  const router = useRouter()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    checkDevice()
  }, [])

  async function checkDevice() {
    // Vérifier si device configuré
    const savedDeviceId = localStorage.getItem('kiosk_device_id')
    
    if (!savedDeviceId) {
      // Rediriger vers setup
      router.push('/kiosk/setup')
      return
    }
    
    // Charger les infos du device
    const { data: device } = await supabase
      .from('devices')
      .select('id, viva_terminal_id')
      .eq('id', savedDeviceId)
      .single()
    
    if (device) {
      setDeviceId(device.id)
      setVivaTerminalId(device.viva_terminal_id)
    }
    
    setDeviceChecked(true)
    loadData()
  }

  // Timer de retour à l'accueil après confirmation
  useEffect(() => {
    if (orderNumber) {
      setCountdown(10)
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer)
            // Reset pour nouvelle commande
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

  async function loadData() {
    console.log('=== LOADING DATA ===')
    console.log('Establishment ID:', establishmentId)
    
    // Charger catégories visibles sur borne avec leurs propositions
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
      .eq('visible_on_kiosk', true)
      .order('display_order')

    console.log('Categories error:', catError)
    console.log('Categories data:', categoriesData?.length)

    // Charger produits avec leurs propositions
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
    console.log('Products data:', productsData?.length)

    // Charger TOUS les option_groups pour les triggers
    const { data: allOptionGroupsData, error: ogError } = await supabase
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

    console.log('Option groups error:', ogError)
    console.log('Option groups data:', allOptionGroupsData?.length)

    // DEBUG: Voir ce qui est chargé
    console.log('=== DEBUG KIOSK DATA ===')
    console.log('Products loaded:', productsData?.length)
    console.log('All option groups loaded:', allOptionGroupsData?.length)
    productsData?.forEach(p => {
      console.log(`Product: ${p.name}`)
      console.log(`  - product_option_groups:`, p.product_option_groups)
      p.product_option_groups?.forEach((pog: any) => {
        console.log(`    - Option Group: ${pog.option_group?.name}`)
        console.log(`      - Items:`, pog.option_group?.option_group_items?.length || 0)
      })
    })
    console.log('=== END DEBUG ===')

    setCategories((categoriesData || []) as any)
    setProducts((productsData || []) as any)
    setAllOptionGroups((allOptionGroupsData || []) as any)
    
    if (categoriesData && categoriesData.length > 0) {
      setSelectedCategory(categoriesData[0].id)
    }
    
    setLoading(false)
  }

  function openProductModal(product: Product) {
    // Option C : Produit override si défini, sinon catégorie
    let propositions: OptionGroup[] = []
    
    if (product.product_option_groups && product.product_option_groups.length > 0) {
      // Utiliser les propositions du produit
      propositions = product.product_option_groups
        .sort((a, b) => a.display_order - b.display_order)
        .map(pog => pog.option_group)
        .filter(og => og && og.option_group_items && og.option_group_items.length > 0)
    } else {
      // Utiliser les propositions de la catégorie
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
    setBasePropositions([])
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
      // Remplacer la sélection pour ce groupe
      setSelectedOptions([
        ...selectedOptions.filter(o => o.option_group_id !== optionGroup.id),
        newOption,
      ])
    } else {
      // Multi: toggle
      const exists = selectedOptions.find(o => o.item_id === item.id)
      if (exists) {
        setSelectedOptions(selectedOptions.filter(o => o.item_id !== item.id))
      } else {
        // Vérifier max_selections
        const currentCount = selectedOptions.filter(o => o.option_group_id === optionGroup.id).length
        if (optionGroup.max_selections && currentCount >= optionGroup.max_selections) {
          return // Max atteint
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
    // Vérifier si l'item sélectionné dans la proposition actuelle a un trigger
    const currentGroup = currentPropositions[currentPropositionIndex]
    if (currentGroup) {
      const selectedInCurrentGroup = selectedOptions.filter(o => o.option_group_id === currentGroup.id)
      
      // Chercher les triggers pour les items sélectionnés
      const triggeredGroupIds: string[] = []
      selectedInCurrentGroup.forEach(selected => {
        const item = currentGroup.option_group_items.find(i => i.id === selected.item_id)
        if (item?.triggers_option_group_id) {
          triggeredGroupIds.push(item.triggers_option_group_id)
        }
      })
      
      // Si on a des triggers, insérer les propositions déclenchées juste après la position actuelle
      if (triggeredGroupIds.length > 0) {
        const triggeredGroups = triggeredGroupIds
          .map(id => allOptionGroups.find(g => g.id === id))
          .filter((g): g is OptionGroup => g !== undefined && g.option_group_items.length > 0)
        
        if (triggeredGroups.length > 0) {
          // Vérifier que ces groupes ne sont pas déjà dans la liste
          const existingIds = new Set(currentPropositions.map(p => p.id))
          const newGroups = triggeredGroups.filter(g => !existingIds.has(g.id))
          
          if (newGroups.length > 0) {
            // Insérer après la position actuelle
            const newPropositions = [
              ...currentPropositions.slice(0, currentPropositionIndex + 1),
              ...newGroups,
              ...currentPropositions.slice(currentPropositionIndex + 1),
            ]
            setCurrentPropositions(newPropositions)
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
      // Si on revient en arrière, enlever les propositions triggered qui suivent
      // (optionnel - pour simplifier on peut laisser)
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

  function getCartTotal(): number {
    return cart.reduce((sum, item) => sum + (item.price + item.options_total) * item.quantity, 0)
  }

  function getVatRate(): number {
    return orderType === 'eat_in' ? 12 : 6
  }

  async function initiateVivaPayment(orderId: string, amount: number) {
    try {
      if (!vivaTerminalId) {
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
          terminalId: vivaTerminalId,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setPaymentSessionId(data.sessionId)
        setPaymentStatus('pending')
        // Start polling for result
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
    const maxAttempts = 60 // 2 minutes (every 2 seconds)
    let attempts = 0
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/viva/payment?sessionId=${sessionId}`)
        const data = await response.json()
        
        if (data.status === 'success') {
          setPaymentStatus('success')
          // Finaliser la commande
          await finalizeOrder(orderId)
          return
        } else if (data.status === 'failed') {
          setPaymentStatus('failed')
          return
        }
        
        // Continue polling
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
    // Mettre à jour le statut de paiement
    await supabase
      .from('orders')
      .update({ payment_status: 'paid' })
      .eq('id', orderId)
    
    // Récupérer le numéro de commande
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
    if (!orderType || cart.length === 0) return
    
    setIsSubmitting(true)
    
    try {
      const vatRate = getVatRate()
      const total = getCartTotal()
      const totalWithVat = total * (1 + vatRate / 100)
      
      // Créer la commande en statut "pending payment"
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          establishment_id: establishmentId,
          order_type: orderType,
          status: 'pending',
          subtotal: total,
          tax_amount: total * vatRate / 100,
          total_amount: totalWithVat,
          source: 'kiosk',
          payment_method: 'card',
          payment_status: 'pending',
          device_id: deviceId,
        })
        .select()
        .single()
      
      if (orderError) throw orderError
      
      // Créer les items
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
      
      // Lancer le paiement Viva
      await initiateVivaPayment(order.id, totalWithVat)
      
    } catch (error) {
      console.error('Erreur:', error)
      alert('Erreur lors de la commande')
      setIsSubmitting(false)
    }
  }

  // Écran de chargement device
  if (!deviceChecked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <span className="text-8xl block mb-4 animate-pulse">🖥️</span>
          <p className="text-xl">Initialisation...</p>
        </div>
      </div>
    )
  }

  // Écran de paiement en cours
  if (paymentStatus === 'pending') {
    return (
      <div className="min-h-screen bg-blue-600 flex items-center justify-center p-8">
        <div className="text-center text-white">
          <div className="mb-8">
            <span className="text-8xl block animate-bounce">💳</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">Paiement en cours...</h1>
          <p className="text-2xl mb-8">Présentez votre carte sur le terminal</p>
          
          <div className="bg-white/20 rounded-3xl p-8 inline-block mb-8">
            <p className="text-xl mb-2">Montant à payer</p>
            <p className="text-6xl font-bold">{(getCartTotal() * (1 + getVatRate() / 100)).toFixed(2)} €</p>
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
            className="mt-8 bg-white/20 text-white font-bold px-8 py-3 rounded-xl"
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
      <div className="min-h-screen bg-red-500 flex items-center justify-center p-8">
        <div className="text-center text-white">
          <span className="text-8xl block mb-8">❌</span>
          <h1 className="text-4xl font-bold mb-4">Paiement refusé</h1>
          <p className="text-xl mb-8">Veuillez réessayer ou utiliser une autre carte</p>
          
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => {
                setPaymentStatus('idle')
                setIsSubmitting(false)
              }}
              className="bg-white text-red-600 font-bold text-xl px-8 py-4 rounded-2xl"
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
              className="bg-white/20 text-white font-bold text-xl px-8 py-4 rounded-2xl"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Écran de sélection du type de commande
  if (!orderType && !orderNumber) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center p-8">
        <div className="text-center">
          <span className="text-8xl block mb-8">🍔</span>
          <h1 className="text-5xl font-bold text-white mb-4">MDjambo</h1>
          <p className="text-2xl text-orange-100 mb-12">Touchez pour commander</p>
          
          <div className="grid grid-cols-2 gap-8 max-w-2xl">
            <button
              onClick={() => setOrderType('eat_in')}
              className="bg-white rounded-3xl p-8 shadow-2xl hover:scale-105 transition-transform"
            >
              <span className="text-7xl block mb-4">🍽️</span>
              <span className="text-2xl font-bold text-gray-800 block">Sur place</span>
              <span className="text-gray-500">TVA 12%</span>
            </button>
            
            <button
              onClick={() => setOrderType('takeaway')}
              className="bg-white rounded-3xl p-8 shadow-2xl hover:scale-105 transition-transform"
            >
              <span className="text-7xl block mb-4">🥡</span>
              <span className="text-2xl font-bold text-gray-800 block">À emporter</span>
              <span className="text-gray-500">TVA 6%</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Écran de confirmation
  if (orderNumber) {
    return (
      <div className="min-h-screen bg-green-500 flex items-center justify-center p-8">
        <div className="text-center text-white">
          <span className="text-8xl block mb-8">✅</span>
          <h1 className="text-4xl font-bold mb-4">Merci !</h1>
          <p className="text-2xl mb-8">Votre commande est enregistrée</p>
          
          <div className="bg-white text-gray-900 rounded-3xl p-8 inline-block mb-8">
            <p className="text-xl mb-2">Numéro de commande</p>
            <p className="text-7xl font-bold text-orange-500">{orderNumber}</p>
          </div>
          
          <p className="text-xl mb-8">Veuillez patienter, nous vous appellerons</p>
          
          {/* Countdown */}
          <div className="mb-8">
            <div className="w-64 mx-auto bg-white/30 rounded-full h-3 mb-3">
              <div 
                className="bg-white h-3 rounded-full transition-all duration-1000"
                style={{ width: `${(countdown / 10) * 100}%` }}
              />
            </div>
            <p className="text-lg opacity-80">
              Retour à l'accueil dans {countdown}s
            </p>
          </div>
          
          <button
            onClick={() => {
              setOrderNumber(null)
              setOrderType(null)
              setIsSubmitting(false)
            }}
            className="bg-white text-green-600 font-bold text-xl px-12 py-4 rounded-2xl"
          >
            Nouvelle commande
          </button>
        </div>
      </div>
    )
  }

  const filteredProducts = products.filter(p => p.category_id === selectedCategory)
  const currentGroup = currentPropositions[currentPropositionIndex]

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setOrderType(null)
                setCart([])
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              ← Retour
            </button>
            <h1 className="text-2xl font-bold text-orange-500">MDjambo</h1>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <span className="text-2xl">{orderType === 'eat_in' ? '🍽️' : '🥡'}</span>
            <span>{orderType === 'eat_in' ? 'Sur place' : 'À emporter'}</span>
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

        {/* Products */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center text-gray-400 py-12">Chargement...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => openProductModal(product)}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow text-left"
                >
                  <div className="aspect-square bg-gray-100 flex items-center justify-center text-6xl">
                    {product.image_url ? (
                      <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                    ) : '🍔'}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-gray-900 mb-1">{product.name}</h3>
                    {product.description && (
                      <p className="text-sm text-gray-500 mb-2 line-clamp-2">{product.description}</p>
                    )}
                    <p className="text-xl font-bold text-orange-500">{product.price.toFixed(2)} €</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart sidebar */}
      <div className="w-96 bg-white shadow-xl flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Votre commande</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <span className="text-5xl block mb-4">🛒</span>
              <p>Votre panier est vide</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map(item => (
                <div key={item.id} className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-bold">{item.name}</h3>
                      {item.options.length > 0 && (
                        <div className="text-sm text-gray-500 mt-1">
                          {item.options.map(o => (
                            <div key={o.item_id}>
                              + {o.item_name} {o.price > 0 && `(${o.price.toFixed(2)}€)`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-gray-400 hover:text-red-500"
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
                      <span className="font-bold w-8 text-center">{item.quantity}</span>
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
        {cart.length > 0 && (
          <div className="p-6 border-t">
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Sous-total</span>
              <span className="font-bold">{getCartTotal().toFixed(2)} €</span>
            </div>
            <div className="flex justify-between mb-4">
              <span className="text-gray-600">TVA ({getVatRate()}%)</span>
              <span>{(getCartTotal() * getVatRate() / 100).toFixed(2)} €</span>
            </div>
            <div className="flex justify-between mb-6 text-xl">
              <span className="font-bold">Total</span>
              <span className="font-bold text-orange-500">
                {(getCartTotal() * (1 + getVatRate() / 100)).toFixed(2)} €
              </span>
            </div>
            
            <button
              onClick={submitOrder}
              disabled={isSubmitting}
              className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl text-xl hover:bg-orange-600 disabled:opacity-50"
            >
              {isSubmitting ? 'Envoi...' : '✓ Commander'}
            </button>
          </div>
        )}
      </div>

      {/* Modal Propositions */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header produit */}
            <div className="p-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{selectedProduct.name}</h2>
                  <p className="text-orange-100">{selectedProduct.price.toFixed(2)} €</p>
                </div>
                <button
                  onClick={closeProductModal}
                  className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl"
                >
                  ✕
                </button>
              </div>
              
              {/* Progress */}
              {currentPropositions.length > 0 && (
                <div className="flex gap-2 mt-4">
                  {currentPropositions.map((_, idx) => (
                    <div
                      key={idx}
                      className={`flex-1 h-1 rounded-full ${
                        idx <= currentPropositionIndex ? 'bg-white' : 'bg-white/30'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {currentPropositions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">Pas d'options pour ce produit</p>
                  <button
                    onClick={addToCart}
                    className="bg-orange-500 text-white font-bold px-8 py-3 rounded-xl"
                  >
                    Ajouter au panier
                  </button>
                </div>
              ) : currentGroup ? (
                <div>
                  <h3 className="text-xl font-bold mb-2">{currentGroup.name}</h3>
                  <p className="text-gray-500 mb-4">
                    {currentGroup.selection_type === 'single' ? 'Choisissez une option' : 'Choisissez vos options'}
                    {currentGroup.min_selections > 0 && (
                      <span className="text-red-500 ml-1">(obligatoire)</span>
                    )}
                    {currentGroup.max_selections && currentGroup.selection_type === 'multi' && (
                      <span className="text-gray-400 ml-1">(max {currentGroup.max_selections})</span>
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
                          className={`w-full p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${
                            isSelected
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {/* Radio/Checkbox */}
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                          }`}>
                            {isSelected && <span className="text-white text-sm">✓</span>}
                          </div>
                          
                          {/* Image */}
                          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
                            {item.product.image_url ? (
                              <img src={item.product.image_url} alt="" className="w-full h-full object-cover rounded-lg" />
                            ) : '🍽️'}
                          </div>
                          
                          {/* Info */}
                          <div className="flex-1 text-left">
                            <span className="font-bold">{item.product.name}</span>
                          </div>
                          
                          {/* Prix */}
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
            
            {/* Footer */}
            {currentPropositions.length > 0 && (
              <div className="p-6 border-t flex items-center justify-between">
                <button
                  onClick={currentPropositionIndex === 0 ? closeProductModal : prevProposition}
                  className="px-6 py-3 rounded-xl border border-gray-200 font-semibold"
                >
                  {currentPropositionIndex === 0 ? 'Annuler' : '← Retour'}
                </button>
                
                <div className="text-center">
                  <p className="text-sm text-gray-500">Prix total</p>
                  <p className="text-xl font-bold text-orange-500">
                    {(selectedProduct.price + selectedOptions.reduce((sum, o) => sum + o.price, 0)).toFixed(2)} €
                  </p>
                </div>
                
                <button
                  onClick={nextProposition}
                  disabled={!canProceed()}
                  className="px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50"
                >
                  {currentPropositionIndex === currentPropositions.length - 1 ? 'Ajouter →' : 'Suivant →'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}