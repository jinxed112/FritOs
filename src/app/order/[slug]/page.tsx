'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AddressInput from '@/components/AddressInput'

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

type Category = {
  id: string
  name: string
  image_url: string | null
  category_option_groups: CategoryOptionGroup[]
}

type Product = {
  id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  category_id: string
  is_available: boolean
  available_online: boolean
  product_option_groups: ProductOptionGroup[]
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
  productId: string
  name: string
  price: number
  quantity: number
  options: SelectedOption[]
  optionsTotal: number
}

type TimeSlot = {
  time: string
  label: string
  available: boolean
  remainingSlots: number
}

type DaySlots = {
  date: string
  dayLabel: string
  slots: TimeSlot[]
}

type Customer = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  loyalty_points: number
}

type Establishment = {
  id: string
  name: string
  slug: string
  address: string | null
  phone: string | null
  pickup_enabled: boolean
  delivery_enabled: boolean
  online_payment_only: boolean
}

type Step = 'menu' | 'cart' | 'details' | 'timeslot' | 'payment' | 'confirmation'

// ==================== COMPONENT ====================
export default function OrderPage() {
  const params = useParams()
  const slug = params.slug as string

  const [establishment, setEstablishment] = useState<Establishment | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [allOptionGroups, setAllOptionGroups] = useState<OptionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Navigation
  const [step, setStep] = useState<Step>('menu')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Cart
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup')

  // NOUVEAU: Modal produit avec propositions
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [currentPropositions, setCurrentPropositions] = useState<OptionGroup[]>([])
  const [currentPropositionIndex, setCurrentPropositionIndex] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([])

  // Customer
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [guestMode, setGuestMode] = useState(false)
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestName, setGuestName] = useState('')

  // Auth
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authOtp, setAuthOtp] = useState('')
  const [authStep, setAuthStep] = useState<'email' | 'otp'>('email')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  // Delivery
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('')
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [deliveryError, setDeliveryError] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')

  // Time slots
  const [availableSlots, setAvailableSlots] = useState<DaySlots[]>([])
  const [selectedDay, setSelectedDay] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [loadingSlots, setLoadingSlots] = useState(false)

  // Confirmation
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [pickupCode, setPickupCode] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const supabase = createClient()

  // ==================== LOAD DATA ====================
  useEffect(() => {
    if (slug) {
      loadData()
      checkSession()
    }
  }, [slug])

  async function loadData() {
    setLoading(true)
    setError(null)

    // Charger l'établissement par slug
    const { data: est, error: estError } = await supabase
      .from('establishments')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()

    if (estError || !est) {
      setError('Établissement non trouvé')
      setLoading(false)
      return
    }

    if (!est.pickup_enabled && !est.delivery_enabled) {
      setError('Les commandes en ligne ne sont pas disponibles pour cet établissement')
      setLoading(false)
      return
    }

    setEstablishment(est)
    setOrderType(est.pickup_enabled ? 'pickup' : 'delivery')

    // Charger les catégories AVEC leurs propositions
    const { data: cats } = await supabase
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
      .eq('establishment_id', est.id)
      .eq('is_active', true)
      .eq('visible_on_kiosk', true)
      .order('display_order')

    setCategories((cats || []) as any)
    if (cats && cats.length > 0) {
      setSelectedCategory(cats[0].id)
    }

    // Charger les produits AVEC leurs propositions
    const { data: prods } = await supabase
      .from('products')
      .select(`
        id, name, description, price, image_url, category_id, is_available, available_online,
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
      .eq('establishment_id', est.id)
      .eq('is_active', true)
      .eq('is_available', true)
      .order('display_order')

    // Filtrer les produits disponibles en ligne
    const onlineProducts = (prods || []).filter(p => p.available_online !== false)
    setProducts(onlineProducts as any)

    // Charger TOUS les option_groups pour les triggers
    const { data: allOgs } = await supabase
      .from('option_groups')
      .select(`
        id, name, selection_type, min_selections, max_selections,
        option_group_items!option_group_items_option_group_id_fkey (
          id, product_id, price_override, is_default, triggers_option_group_id,
          product:products (id, name, price, image_url)
        )
      `)
      .eq('establishment_id', est.id)
      .eq('is_active', true)

    setAllOptionGroups((allOgs || []) as any)

    setLoading(false)
  }

  async function checkSession() {
    const token = localStorage.getItem('customer_session')
    if (!token) return

    try {
      const response = await fetch(`/api/auth/otp?token=${token}`)
      const data = await response.json()

      if (data.authenticated && data.customer) {
        setCustomer(data.customer)
        setSessionToken(token)
      } else {
        localStorage.removeItem('customer_session')
      }
    } catch (e) {
      console.error('Erreur vérification session:', e)
    }
  }

  // ==================== AUTH ====================
  async function sendOtp() {
    if (!authEmail || !establishment) return

    setAuthLoading(true)
    setAuthError('')

    try {
      const response = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail,
          establishmentId: establishment.id,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setAuthStep('otp')
      } else {
        setAuthError(data.error || 'Erreur lors de l\'envoi')
      }
    } catch (e) {
      setAuthError('Erreur réseau')
    } finally {
      setAuthLoading(false)
    }
  }

  async function verifyOtp() {
    if (!authOtp || !establishment) return

    setAuthLoading(true)
    setAuthError('')

    try {
      const response = await fetch('/api/auth/otp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail,
          otpCode: authOtp,
          establishmentId: establishment.id,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setCustomer(data.customer)
        setSessionToken(data.sessionToken)
        localStorage.setItem('customer_session', data.sessionToken)
        setShowAuthModal(false)
        setAuthStep('email')
        setAuthEmail('')
        setAuthOtp('')
      } else {
        setAuthError(data.error || 'Code invalide')
      }
    } catch (e) {
      setAuthError('Erreur réseau')
    } finally {
      setAuthLoading(false)
    }
  }

  function logout() {
    setCustomer(null)
    setSessionToken(null)
    localStorage.removeItem('customer_session')
  }

  // ==================== PRODUCT MODAL & PROPOSITIONS ====================
  function openProductModal(product: Product) {
    // Récupérer les propositions (produit override catégorie si défini)
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

      // Si on a des triggers, insérer les propositions déclenchées
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
      addToCartWithOptions()
    }
  }

  function prevProposition() {
    if (currentPropositionIndex > 0) {
      setCurrentPropositionIndex(currentPropositionIndex - 1)
    }
  }

  function addToCartWithOptions() {
    if (!selectedProduct) return

    const optionsTotal = selectedOptions.reduce((sum, o) => sum + o.price, 0)

    const cartItem: CartItem = {
      id: `${selectedProduct.id}-${Date.now()}`,
      productId: selectedProduct.id,
      name: selectedProduct.name,
      price: selectedProduct.price,
      quantity: 1,
      options: [...selectedOptions],
      optionsTotal,
    }

    setCart([...cart, cartItem])
    closeProductModal()
  }

  // Ajout direct (produits sans propositions)
  function addToCartDirect(product: Product) {
    // Vérifier s'il y a des propositions
    let hasPropositions = false

    if (product.product_option_groups && product.product_option_groups.length > 0) {
      hasPropositions = product.product_option_groups.some(
        pog => pog.option_group && pog.option_group.option_group_items?.length > 0
      )
    } else {
      const category = categories.find(c => c.id === product.category_id)
      if (category && category.category_option_groups) {
        hasPropositions = category.category_option_groups.some(
          cog => cog.option_group && cog.option_group.option_group_items?.length > 0
        )
      }
    }

    if (hasPropositions) {
      // Ouvrir le modal des propositions
      openProductModal(product)
    } else {
      // Ajout direct au panier
      const existing = cart.find(
        item => item.productId === product.id && item.options.length === 0
      )

      if (existing) {
        setCart(
          cart.map(item =>
            item.id === existing.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        )
      } else {
        setCart([
          ...cart,
          {
            id: `${product.id}-${Date.now()}`,
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity: 1,
            options: [],
            optionsTotal: 0,
          },
        ])
      }
    }
  }

  // ==================== CART FUNCTIONS ====================
  function updateQuantity(itemId: string, delta: number) {
    setCart(
      cart
        .map(item => {
          if (item.id === itemId) {
            const newQty = item.quantity + delta
            return newQty > 0 ? { ...item, quantity: newQty } : item
          }
          return item
        })
        .filter(item => item.quantity > 0)
    )
  }

  function removeFromCart(itemId: string) {
    setCart(cart.filter(item => item.id !== itemId))
  }

  function getCartTotal(): number {
    return cart.reduce(
      (sum, item) => sum + (item.price + item.optionsTotal) * item.quantity,
      0
    )
  }

  function getCartCount(): number {
    return cart.reduce((sum, item) => sum + item.quantity, 0)
  }

  // ==================== TIME SLOTS ====================
  async function loadTimeSlots() {
    if (!establishment) return

    setLoadingSlots(true)

    try {
      const response = await fetch(`/api/timeslots?establishmentId=${establishment.id}&type=${orderType}`)
      const data = await response.json()

      if (data.success) {
        setAvailableSlots(data.slots)
        if (data.slots.length > 0) {
          setSelectedDay(data.slots[0].date)
        }
      }
    } catch (e) {
      console.error('Erreur chargement créneaux:', e)
    } finally {
      setLoadingSlots(false)
    }
  }

  // ==================== NAVIGATION ====================
  function goToStep(newStep: Step) {
    if (newStep === 'timeslot') {
      loadTimeSlots()
    }
    setStep(newStep)
  }

  // ==================== SUBMIT ORDER ====================
  async function submitOrder() {
    if (!establishment) return

    setIsSubmitting(true)

    try {
      const orderData = {
        establishmentId: establishment.id,
        orderType,
        items: cart.map(item => ({
          productId: item.productId,
          productName: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          options: item.options,
          optionsTotal: item.optionsTotal,
          lineTotal: (item.price + item.optionsTotal) * item.quantity,
        })),
        subtotal: getCartTotal(),
        deliveryFee: orderType === 'delivery' ? deliveryFee : 0,
        total: getCartTotal() + (orderType === 'delivery' ? deliveryFee : 0),
        scheduledDate: selectedDay,
        scheduledTime: selectedTime,
        customerId: customer?.id || null,
        customerEmail: customer?.email || guestEmail,
        customerName: customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : guestName,
        customerPhone: customer?.phone || guestPhone,
        deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
        deliveryNotes: deliveryNotes || null,
        sessionToken,
      }

      const response = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      })

      const data = await response.json()

      if (data.success) {
        setOrderNumber(data.orderNumber)
        setPickupCode(data.pickupCode)
        setCart([])
        goToStep('confirmation')
      } else {
        alert(data.error || 'Erreur lors de la commande')
      }
    } catch (e) {
      console.error('Erreur:', e)
      alert('Erreur réseau')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ==================== RENDER ====================
  const filteredProducts = products.filter(p => p.category_id === selectedCategory)
  const currentGroup = currentPropositions[currentPropositionIndex]

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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md">
          <span className="text-6xl block mb-4">😕</span>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops !</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (!establishment) return null

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-orange-500">{establishment.name}</h1>
            <p className="text-sm text-gray-500">{establishment.address}</p>
          </div>

          <div className="flex items-center gap-4">
            {customer ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{customer.email}</span>
                <button onClick={logout} className="text-gray-400 hover:text-gray-600">
                  🚪
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-orange-500 font-medium"
              >
                Se connecter
              </button>
            )}

            {step === 'menu' && cart.length > 0 && (
              <button
                onClick={() => goToStep('cart')}
                className="bg-orange-500 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2"
              >
                🛒 <span className="bg-white text-orange-500 w-6 h-6 rounded-full text-sm font-bold flex items-center justify-center">{getCartCount()}</span>
                <span>{getCartTotal().toFixed(2)}€</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {step !== 'menu' && step !== 'confirmation' && (
          <div className="max-w-4xl mx-auto px-4 pb-4">
            <div className="flex items-center gap-2">
              {['cart', 'details', 'timeslot', 'payment'].map((s, idx) => (
                <div key={s} className="flex items-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step === s ? 'bg-orange-500 text-white' :
                    ['cart', 'details', 'timeslot', 'payment'].indexOf(step) > idx ? 'bg-green-500 text-white' :
                    'bg-gray-200 text-gray-500'
                  }`}>
                    {idx + 1}
                  </div>
                  {idx < 3 && <div className={`flex-1 h-1 mx-2 ${['cart', 'details', 'timeslot', 'payment'].indexOf(step) > idx ? 'bg-green-500' : 'bg-gray-200'}`} />}
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* ÉTAPE: MENU */}
        {step === 'menu' && (
          <div>
            {/* Order type selector */}
            {establishment.pickup_enabled && establishment.delivery_enabled && (
              <div className="bg-white rounded-2xl p-4 mb-6 flex gap-4">
                <button
                  onClick={() => setOrderType('pickup')}
                  className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                    orderType === 'pickup'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  🥡 À emporter
                </button>
                <button
                  onClick={() => setOrderType('delivery')}
                  className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                    orderType === 'delivery'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  🚗 Livraison
                </button>
              </div>
            )}

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-4 mb-4 no-scrollbar">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-full whitespace-nowrap font-medium transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-orange-500 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Products */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredProducts.map(product => (
                <div
                  key={product.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm"
                >
                  <div className="aspect-video bg-gray-100 flex items-center justify-center text-5xl">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      '🍔'
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-gray-900">{product.name}</h3>
                    {product.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                        {product.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xl font-bold text-orange-500">
                        {product.price.toFixed(2)}€
                      </span>
                      <button
                        onClick={() => addToCartDirect(product)}
                        className="bg-orange-500 text-white px-4 py-2 rounded-xl font-medium hover:bg-orange-600 transition-colors"
                      >
                        + Ajouter
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ÉTAPE: PANIER */}
        {step === 'cart' && (
          <div className="bg-white rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-6">🛒 Votre panier</h2>
            
            {cart.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-6xl block mb-4">🛒</span>
                <p className="text-gray-500">Votre panier est vide</p>
                <button
                  onClick={() => goToStep('menu')}
                  className="mt-4 text-orange-500 font-medium"
                >
                  ← Retour au menu
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-start gap-4 pb-4 border-b border-gray-100">
                      <div className="flex-1">
                        <h3 className="font-bold">{item.name}</h3>
                        {item.options.length > 0 && (
                          <div className="text-sm text-gray-500 mt-1">
                            {item.options.map(o => (
                              <div key={o.item_id}>+ {o.item_name} {o.price > 0 && `(+${o.price.toFixed(2)}€)`}</div>
                            ))}
                          </div>
                        )}
                        <p className="text-orange-500 font-bold mt-1">
                          {((item.price + item.optionsTotal) * item.quantity).toFixed(2)}€
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (item.quantity > 1) {
                              setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity - 1 } : c))
                            } else {
                              removeFromCart(item.id)
                            }
                          }}
                          className="w-8 h-8 rounded-full bg-gray-100 font-bold"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-bold">{item.quantity}</span>
                        <button
                          onClick={() => setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))}
                          className="w-8 h-8 rounded-full bg-gray-100 font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="border-t pt-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Sous-total</span>
                    <span className="font-bold">{getCartTotal().toFixed(2)}€</span>
                  </div>
                  {orderType === 'delivery' && (
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-600">Livraison</span>
                      <span className="font-bold">{deliveryFee.toFixed(2)}€</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg">
                    <span className="font-bold">Total</span>
                    <span className="font-bold text-orange-500">
                      {(getCartTotal() + (orderType === 'delivery' ? deliveryFee : 0)).toFixed(2)}€
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-4 mt-6">
                  <button
                    onClick={() => goToStep('menu')}
                    className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
                  >
                    ← Menu
                  </button>
                  <button
                    onClick={() => goToStep('details')}
                    className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold"
                  >
                    Continuer →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ÉTAPE: DÉTAILS */}
        {step === 'details' && (
          <div className="bg-white rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-6">📝 Vos coordonnées</h2>
            
            <div className="space-y-4">
              {!customer && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
                    <input
                      type="text"
                      value={guestName}
                      onChange={e => setGuestName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Votre nom"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={e => setGuestEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="votre@email.com"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone *</label>
                    <input
                      type="tel"
                      value={guestPhone}
                      onChange={e => setGuestPhone(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="0470 00 00 00"
                      required
                    />
                  </div>
                </>
              )}
              
              {customer && (
                <div className="bg-green-50 rounded-xl p-4 mb-4">
                  <p className="font-medium text-green-800">✓ Connecté en tant que {customer.email}</p>
                  {customer.first_name && <p className="text-green-700">{customer.first_name} {customer.last_name}</p>}
                </div>
              )}
              
              {orderType === 'delivery' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Adresse de livraison *</label>
                  <AddressInput
                    value={deliveryAddress}
                    onChange={setDeliveryAddress}
                    placeholder="Entrez votre adresse"
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes (optionnel)</label>
                <textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  rows={2}
                  placeholder="Instructions spéciales, code d'entrée..."
                />
              </div>
            </div>
            
            <div className="flex gap-4 mt-6">
              <button
                onClick={() => goToStep('cart')}
                className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
              >
                ← Panier
              </button>
              <button
                onClick={() => goToStep('timeslot')}
                disabled={!customer && (!guestName || !guestEmail || !guestPhone)}
                className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50"
              >
                Continuer →
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE: CRÉNEAU */}
        {step === 'timeslot' && (
          <div className="bg-white rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-6">📅 Choisissez un créneau</h2>
            
            {loadingSlots ? (
              <div className="text-center py-8">
                <span className="text-4xl block mb-4 animate-spin">⏳</span>
                <p className="text-gray-500">Chargement des créneaux...</p>
              </div>
            ) : (
              <>
                {/* Sélection du jour */}
                <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
                  {availableSlots.map(day => (
                    <button
                      key={day.date}
                      onClick={() => setSelectedDay(day.date)}
                      className={`px-4 py-3 rounded-xl whitespace-nowrap font-medium transition-colors ${
                        selectedDay === day.date
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {day.dayLabel}
                    </button>
                  ))}
                </div>
                
                {/* Créneaux horaires */}
                {selectedDay && (
                  <div className="grid grid-cols-3 gap-3">
                    {availableSlots
                      .find(d => d.date === selectedDay)
                      ?.slots.map(slot => (
                        <button
                          key={slot.time}
                          onClick={() => slot.available && setSelectedTime(slot.time)}
                          disabled={!slot.available}
                          className={`p-3 rounded-xl text-center transition-colors ${
                            selectedTime === slot.time
                              ? 'bg-orange-500 text-white'
                              : slot.available
                              ? 'bg-gray-100 hover:bg-gray-200'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <span className="font-medium">{slot.label}</span>
                          {slot.available && slot.remainingSlots <= 3 && (
                            <span className="block text-xs text-orange-500">
                              {slot.remainingSlots} place{slot.remainingSlots > 1 ? 's' : ''}
                            </span>
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
            
            <div className="flex gap-4 mt-6">
              <button
                onClick={() => goToStep('details')}
                className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
              >
                ← Détails
              </button>
              <button
                onClick={() => goToStep('payment')}
                disabled={!selectedDay || !selectedTime}
                className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50"
              >
                Continuer →
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE: PAIEMENT */}
        {step === 'payment' && (
          <div className="bg-white rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-6">💳 Récapitulatif & Paiement</h2>
            
            {/* Résumé */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <h3 className="font-bold mb-3">Votre commande</h3>
              {cart.map(item => (
                <div key={item.id} className="flex justify-between text-sm py-1">
                  <span>{item.quantity}x {item.name}</span>
                  <span>{((item.price + item.optionsTotal) * item.quantity).toFixed(2)}€</span>
                </div>
              ))}
              <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                <span>Total</span>
                <span className="text-orange-500">
                  {(getCartTotal() + (orderType === 'delivery' ? deliveryFee : 0)).toFixed(2)}€
                </span>
              </div>
            </div>
            
            {/* Infos */}
            <div className="bg-orange-50 rounded-xl p-4 mb-6">
              <p className="font-medium text-orange-800">
                {orderType === 'pickup' ? '🥡 Retrait' : '🚗 Livraison'} prévu le :
              </p>
              <p className="text-lg font-bold text-orange-600">
                {selectedDay && new Date(selectedDay).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })} à {selectedTime}
              </p>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => goToStep('timeslot')}
                className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
              >
                ← Créneau
              </button>
              <button
                onClick={submitOrder}
                disabled={isSubmitting}
                className="flex-1 px-6 py-3 rounded-xl bg-green-500 text-white font-semibold disabled:opacity-50"
              >
                {isSubmitting ? 'Envoi...' : '✓ Payer et commander'}
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE: CONFIRMATION */}
        {step === 'confirmation' && (
          <div className="bg-white rounded-2xl p-8 text-center">
            <span className="text-6xl block mb-4">✅</span>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Commande confirmée !</h2>
            <p className="text-gray-500 mb-6">Merci pour votre commande</p>
            
            <div className="bg-orange-50 rounded-2xl p-6 mb-6">
              <p className="text-gray-600 mb-2">Numéro de commande</p>
              <p className="text-4xl font-bold text-orange-500">{orderNumber}</p>
            </div>
            
            {pickupCode && (
              <div className="bg-gray-100 rounded-2xl p-6 mb-6">
                <p className="text-gray-600 mb-2">Code de retrait</p>
                <p className="text-3xl font-bold font-mono tracking-widest">{pickupCode}</p>
              </div>
            )}
            
            <p className="text-gray-500 text-sm mb-6">
              Un email de confirmation vous a été envoyé.
            </p>
            
            <button
              onClick={() => {
                setStep('menu')
                setCart([])
                setSelectedDay(null)
                setSelectedTime(null)
              }}
              className="bg-orange-500 text-white font-bold px-8 py-3 rounded-xl"
            >
              Nouvelle commande
            </button>
          </div>
        )}
      </main>

      {/* ==================== MODAL PROPOSITIONS ==================== */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header produit */}
            <div className="p-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">{selectedProduct.name}</h2>
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
                    onClick={addToCartWithOptions}
                    className="bg-orange-500 text-white font-bold px-8 py-3 rounded-xl"
                  >
                    Ajouter au panier
                  </button>
                </div>
              ) : currentGroup ? (
                <div>
                  <h3 className="text-lg font-bold mb-2">{currentGroup.name}</h3>
                  <p className="text-gray-500 text-sm mb-4">
                    {currentGroup.selection_type === 'single' ? 'Choisissez une option' : 'Choisissez vos options'}
                    {currentGroup.min_selections > 0 && (
                      <span className="text-red-500 ml-1">(obligatoire)</span>
                    )}
                    {currentGroup.max_selections && currentGroup.selection_type === 'multi' && (
                      <span className="text-gray-400 ml-1">(max {currentGroup.max_selections})</span>
                    )}
                  </p>

                  <div className="space-y-2">
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
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-xl">
                            {item.product.image_url ? (
                              <img src={item.product.image_url} alt="" className="w-full h-full object-cover rounded-lg" />
                            ) : '🍽️'}
                          </div>

                          {/* Info */}
                          <div className="flex-1 text-left">
                            <span className="font-medium">{item.product.name}</span>
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

      {/* ==================== MODAL AUTH ==================== */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {authStep === 'email' ? 'Connexion' : 'Vérification'}
            </h2>

            {authError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
                {authError}
              </div>
            )}

            {authStep === 'email' ? (
              <div>
                <p className="text-gray-500 mb-4">
                  Entrez votre email pour recevoir un code de connexion
                </p>
                <input
                  type="email"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowAuthModal(false)}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-medium"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={sendOtp}
                    disabled={!authEmail || authLoading}
                    className="flex-1 px-4 py-3 rounded-xl bg-orange-500 text-white font-medium disabled:opacity-50"
                  >
                    {authLoading ? 'Envoi...' : 'Recevoir le code'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-gray-500 mb-4">
                  Entrez le code reçu par email à {authEmail}
                </p>
                <input
                  type="text"
                  value={authOtp}
                  onChange={e => setAuthOtp(e.target.value.toUpperCase())}
                  placeholder="CODE"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4 text-center text-2xl tracking-widest font-mono"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setAuthStep('email')}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-medium"
                  >
                    Retour
                  </button>
                  <button
                    onClick={verifyOtp}
                    disabled={authOtp.length < 4 || authLoading}
                    className="flex-1 px-4 py-3 rounded-xl bg-orange-500 text-white font-medium disabled:opacity-50"
                  >
                    {authLoading ? 'Vérification...' : 'Vérifier'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
