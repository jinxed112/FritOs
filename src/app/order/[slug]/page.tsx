'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AddressInput from '@/components/AddressInput'

// Types
type Category = {
  id: string
  name: string
  image_url: string | null
}

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

type Product = {
  id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  category_id: string
  is_available: boolean
  available_online: boolean
  product_option_groups?: { option_group_id: string; display_order: number }[]
  product_ingredients?: any[]
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

export default function OrderPage() {
  const params = useParams()
  const slug = params.slug as string

  const [establishment, setEstablishment] = useState<Establishment | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [allOptionGroups, setAllOptionGroups] = useState<OptionGroup[]>([])
  const [categoryOptionGroups, setCategoryOptionGroups] = useState<Record<string, string[]>>({})
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

  // Time slots
  const [timeSlots, setTimeSlots] = useState<DaySlots[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)

  // Delivery
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null)
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [deliveryInfo, setDeliveryInfo] = useState<any>(null)
  const [checkingDelivery, setCheckingDelivery] = useState(false)
  const [deliveryValidated, setDeliveryValidated] = useState(false)

  // Order
  const [orderResult, setOrderResult] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)

  const supabase = createClient()

  // Charger l'établissement et les données
  useEffect(() => {
    loadEstablishment()
  }, [slug])

  // Charger la session existante
  useEffect(() => {
    const token = localStorage.getItem('customer_session')
    if (token) {
      checkSession(token)
    }
  }, [])

  async function loadEstablishment() {
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

    // Charger les catégories
    const { data: cats } = await supabase
      .from('categories')
      .select('id, name, image_url')
      .eq('establishment_id', est.id)
      .eq('is_active', true)
      .eq('visible_on_kiosk', true)
      .order('display_order')

    setCategories(cats || [])
    if (cats && cats.length > 0) {
      setSelectedCategory(cats[0].id)
    }

    // Charger les produits disponibles en ligne avec allergènes
    const { data: prods } = await supabase
      .from('products')
      .select(`
        id, name, description, price, image_url, category_id, is_available, available_online,
        product_ingredients (
          ingredient:ingredients (
            ingredient_allergens (
              is_trace,
              allergen:allergens (code, name_fr, emoji)
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
    setProducts(onlineProducts)

    // Charger les option groups
    const { data: optGroups } = await supabase
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
      .order('display_order')

    // Transformer les données pour correspondre au type OptionGroup
    const transformedOptionGroups: OptionGroup[] = (optGroups || []).map((og: any) => ({
      id: og.id,
      name: og.name,
      selection_type: og.selection_type,
      min_selections: og.min_selections,
      max_selections: og.max_selections,
      option_group_items: (og.option_group_items || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        price_override: item.price_override,
        is_default: item.is_default,
        triggers_option_group_id: item.triggers_option_group_id,
        product: item.product, // Supabase retourne déjà un objet ici grâce à la relation
      })),
    }))

    setAllOptionGroups(transformedOptionGroups)

    // Charger les liens product_option_groups
    const { data: prodOptGroups } = await supabase
      .from('product_option_groups')
      .select('product_id, option_group_id, display_order')
      .order('display_order')

    // Associer aux produits
    const prodWithOptions = onlineProducts.map(p => {
      const pogs = (prodOptGroups || [])
        .filter(pog => pog.product_id === p.id)
        .sort((a, b) => a.display_order - b.display_order)
      return { ...p, product_option_groups: pogs }
    })
    setProducts(prodWithOptions)

    // Charger les liens category_option_groups
    const { data: catOptGroups } = await supabase
      .from('category_option_groups')
      .select('category_id, option_group_id, display_order')
      .order('display_order')

    // Créer un mapping category_id -> option_group_ids
    const catOgMap: Record<string, string[]> = {}
    ;(catOptGroups || []).forEach(cog => {
      if (!catOgMap[cog.category_id]) catOgMap[cog.category_id] = []
      catOgMap[cog.category_id].push(cog.option_group_id)
    })
    setCategoryOptionGroups(catOgMap)

    setLoading(false)
  }

  async function checkSession(token: string) {
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

  // ==================== PROPOSITIONS ====================
  function openProductModal(product: Product) {
    // Déterminer les propositions à afficher
    let propositionIds: string[] = []

    // Option A: Produit a ses propres propositions
    if (product.product_option_groups && product.product_option_groups.length > 0) {
      propositionIds = product.product_option_groups.map(pog => pog.option_group_id)
    }
    // Option B: Sinon, utiliser celles de la catégorie
    else if (categoryOptionGroups[product.category_id]) {
      propositionIds = categoryOptionGroups[product.category_id]
    }

    // Récupérer les option groups correspondants
    const propositions = propositionIds
      .map(id => allOptionGroups.find(og => og.id === id))
      .filter((og): og is OptionGroup => og !== undefined && og.option_group_items.length > 0)

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
    // Vérifier si l'item sélectionné a un trigger
    const currentGroup = currentPropositions[currentPropositionIndex]
    if (currentGroup) {
      const selectedInCurrentGroup = selectedOptions.filter(o => o.option_group_id === currentGroup.id)

      // Chercher les triggers
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

  // Cart functions (version simple sans propositions)
  function addToCartSimple(product: Product) {
    // Si le produit a des propositions, ouvrir le modal
    const hasPropositions =
      (product.product_option_groups && product.product_option_groups.length > 0) ||
      (categoryOptionGroups[product.category_id] && categoryOptionGroups[product.category_id].length > 0)

    if (hasPropositions) {
      openProductModal(product)
      return
    }

    // Sinon, ajouter directement
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
      (sum, item) => sum + (item.price + (item.optionsTotal || 0)) * item.quantity,
      0
    )
  }

  function getCartCount(): number {
    return cart.reduce((sum, item) => sum + item.quantity, 0)
  }

  // Time slots
  async function loadTimeSlots() {
    if (!establishment) return

    setLoadingSlots(true)

    try {
      const response = await fetch(
        `/api/timeslots?establishmentId=${establishment.id}&orderType=${orderType}&days=7`
      )
      const data = await response.json()

      if (data.slots) {
        setTimeSlots(data.slots)
        const firstAvailable = data.slots.find(
          (day: DaySlots) => day.slots.some(s => s.available)
        )
        if (firstAvailable) {
          setSelectedDate(firstAvailable.date)
        }
      }
    } catch (e) {
      console.error('Erreur chargement créneaux:', e)
    } finally {
      setLoadingSlots(false)
    }
  }

  // Submit order
  async function submitOrder() {
    if (!establishment || !selectedDate || !selectedTime) return
    if (!customer && !guestMode) return

    setSubmitting(true)

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          establishmentId: establishment.id,
          orderType,
          items: cart.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            options: item.options,
            notes: null,
          })),
          customerId: customer?.id || null,
          customerName: customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : guestName,
          customerPhone: customer?.phone || guestPhone,
          customerEmail: customer?.email || guestEmail,
          slotDate: selectedDate,
          slotTime: selectedTime,
          deliveryAddressId: null,
          deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
          deliveryLat: orderType === 'delivery' ? deliveryLat : null,
          deliveryLng: orderType === 'delivery' ? deliveryLng : null,
          deliveryFee: orderType === 'delivery' ? deliveryFee : 0,
          notes: null,
          loyaltyPointsUsed: 0,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setOrderResult(data)
        setStep('confirmation')
        setCart([])
      } else {
        alert(data.error || 'Erreur lors de la commande')
      }
    } catch (e) {
      console.error('Erreur commande:', e)
      alert('Erreur lors de la commande')
    } finally {
      setSubmitting(false)
    }
  }

  // Navigation entre étapes
  function goToStep(newStep: Step) {
    if (newStep === 'timeslot') {
      loadTimeSlots()
    }
    setStep(newStep)
  }

  // Rendu
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl block mb-4 animate-bounce">🍟</span>
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    )
  }

  if (error || !establishment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-lg">
          <span className="text-6xl block mb-4">😕</span>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops !</h1>
          <p className="text-gray-500">{error || 'Une erreur est survenue'}</p>
        </div>
      </div>
    )
  }

  const filteredProducts = products.filter(p => p.category_id === selectedCategory)

  // Helper pour extraire les allergènes d'un produit
  function getProductAllergens(product: Product) {
    const allergenMap = new Map<string, { emoji: string; name: string; is_trace: boolean }>()
    
    product.product_ingredients?.forEach(pi => {
      pi.ingredient?.ingredient_allergens?.forEach(ia => {
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
  const selectedDaySlots = timeSlots.find(d => d.date === selectedDate)?.slots || []
  const currentGroup = currentPropositions[currentPropositionIndex]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🍟</span>
            <div>
              <h1 className="font-bold text-gray-900">{establishment.name}</h1>
              <p className="text-sm text-gray-500">Click & Collect</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {customer ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {customer.first_name || customer.email}
                </span>
                {customer.loyalty_points > 0 && (
                  <span className="bg-orange-100 text-orange-600 text-xs px-2 py-1 rounded-full">
                    ⭐ {customer.loyalty_points} pts
                  </span>
                )}
                <button
                  onClick={logout}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  Déconnexion
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-orange-500 font-medium text-sm hover:underline"
              >
                Se connecter
              </button>
            )}

            {/* Cart button */}
            {cart.length > 0 && step === 'menu' && (
              <button
                onClick={() => goToStep('cart')}
                className="bg-orange-500 text-white px-4 py-2 rounded-xl flex items-center gap-2"
              >
                <span>🛒</span>
                <span>{getCartCount()}</span>
                <span className="font-bold">{getCartTotal().toFixed(2)}€</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Progress bar */}
      {step !== 'menu' && step !== 'confirmation' && (
        <div className="bg-white border-b">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              {['cart', 'details', 'timeslot', 'payment'].map((s, i) => (
                <div
                  key={s}
                  className={`flex items-center gap-2 ${
                    step === s ? 'text-orange-500 font-medium' : 'text-gray-400'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      step === s
                        ? 'bg-orange-500 text-white'
                        : ['cart', 'details', 'timeslot', 'payment'].indexOf(step) > i
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200'
                    }`}
                  >
                    {['cart', 'details', 'timeslot', 'payment'].indexOf(step) > i ? '✓' : i + 1}
                  </span>
                  <span className="hidden sm:inline">
                    {s === 'cart' && 'Panier'}
                    {s === 'details' && 'Coordonnées'}
                    {s === 'timeslot' && 'Créneau'}
                    {s === 'payment' && 'Paiement'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
              {filteredProducts.map(product => {
                const allergens = getProductAllergens(product)
                
                return (
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
                    {/* Allergènes */}
                    {allergens.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {allergens.map(a => (
                          <span 
                            key={a.name}
                            title={a.is_trace ? `Traces: ${a.name}` : a.name}
                            className={`text-sm ${a.is_trace ? 'opacity-50' : ''}`}
                          >
                            {a.emoji}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xl font-bold text-orange-500">
                        {product.price.toFixed(2)}€
                      </span>
                      <button
                        onClick={() => addToCartSimple(product)}
                        className="bg-orange-500 text-white px-4 py-2 rounded-xl font-medium hover:bg-orange-600 transition-colors"
                      >
                        + Ajouter
                      </button>
                    </div>
                  </div>
                </div>
              )})}
            </div>
          </div>
        )}

        {/* ÉTAPE: PANIER */}
        {step === 'cart' && (
          <div>
            <button
              onClick={() => goToStep('menu')}
              className="text-gray-500 mb-4 flex items-center gap-2"
            >
              ← Retour au menu
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Votre panier</h2>

            {cart.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center">
                <span className="text-5xl block mb-4">🛒</span>
                <p className="text-gray-500">Votre panier est vide</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map(item => (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl p-4 flex items-center gap-4"
                  >
                    <div className="flex-1">
                      <h3 className="font-bold">{item.name}</h3>
                      {item.options.length > 0 && (
                        <div className="text-sm text-gray-500 mt-1">
                          {item.options.map(o => (
                            <div key={o.item_id}>+ {o.item_name} {o.price > 0 && `(+${o.price.toFixed(2)}€)`}</div>
                          ))}
                        </div>
                      )}
                      <p className="text-orange-500 font-medium">
                        {((item.price + (item.optionsTotal || 0)) * item.quantity).toFixed(2)}€
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-8 h-8 rounded-full bg-gray-100 font-bold"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-bold">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-8 h-8 rounded-full bg-gray-100 font-bold"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="ml-2 text-gray-400 hover:text-red-500"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}

                {/* Total */}
                <div className="bg-white rounded-2xl p-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Sous-total</span>
                    <span className="font-bold">{getCartTotal().toFixed(2)}€</span>
                  </div>
                  {orderType === 'delivery' && deliveryFee > 0 && (
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-600">Livraison</span>
                      <span className="font-bold">{(deliveryFee || 0).toFixed(2)}€</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="font-bold">Total</span>
                    <span className="text-xl font-bold text-orange-500">
                      {(getCartTotal() + (orderType === 'delivery' ? deliveryFee : 0)).toFixed(2)}€
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => goToStep('details')}
                  className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 transition-colors"
                >
                  Continuer →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ÉTAPE: COORDONNÉES */}
        {step === 'details' && (
          <div>
            <button
              onClick={() => goToStep('cart')}
              className="text-gray-500 mb-4 flex items-center gap-2"
            >
              ← Retour au panier
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Vos coordonnées</h2>

            {customer ? (
              <div className="bg-white rounded-2xl p-6 mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-xl">
                    👤
                  </div>
                  <div>
                    <p className="font-bold">
                      {customer.first_name || ''} {customer.last_name || ''}
                    </p>
                    <p className="text-gray-500 text-sm">{customer.email}</p>
                    {customer.phone && (
                      <p className="text-gray-500 text-sm">{customer.phone}</p>
                    )}
                  </div>
                </div>
                {customer.loyalty_points > 0 && (
                  <div className="bg-orange-50 rounded-xl p-4">
                    <p className="text-orange-600 font-medium">
                      ⭐ Vous avez {customer.loyalty_points} points de fidélité
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                <div className="bg-white rounded-2xl p-6">
                  <div className="flex gap-4 mb-4">
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="flex-1 bg-orange-500 text-white font-bold py-3 rounded-xl"
                    >
                      Se connecter
                    </button>
                    <button
                      onClick={() => setGuestMode(true)}
                      className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl"
                    >
                      Continuer en invité
                    </button>
                  </div>

                  {guestMode && (
                    <div className="space-y-4 pt-4 border-t">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nom *
                        </label>
                        <input
                          type="text"
                          value={guestName}
                          onChange={e => setGuestName(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="Votre nom"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email *
                        </label>
                        <input
                          type="email"
                          value={guestEmail}
                          onChange={e => setGuestEmail(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="votre@email.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Téléphone *
                        </label>
                        <input
                          type="tel"
                          value={guestPhone}
                          onChange={e => setGuestPhone(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="+32 470 00 00 00"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Adresse de livraison */}
            {orderType === 'delivery' && establishment && (
              <div className="bg-white rounded-2xl p-6 mb-6">
                <h3 className="font-bold mb-4">🚗 Adresse de livraison</h3>
                <AddressInput
                  establishmentId={establishment.id}
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
                      deliverable: data.deliveryCheck.isDeliverable,
                      distance: data.deliveryCheck.distance,
                      duration: data.deliveryCheck.duration,
                    })
                    setDeliveryFee(data.deliveryCheck.fee)
                  }}
                  onClear={() => {
                    setDeliveryValidated(false)
                    setDeliveryInfo(null)
                    setDeliveryLat(null)
                    setDeliveryLng(null)
                    setDeliveryFee(0)
                  }}
                />
              </div>
            )}

            <button
              onClick={() => goToStep('timeslot')}
              disabled={
                (!customer && !guestMode) ||
                (guestMode && (!guestName || !guestEmail || !guestPhone)) ||
                (orderType === 'delivery' && !deliveryValidated)
              }
              className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              Choisir le créneau →
            </button>
          </div>
        )}

        {/* ÉTAPE: CRÉNEAU */}
        {step === 'timeslot' && (
          <div>
            <button
              onClick={() => goToStep('details')}
              className="text-gray-500 mb-4 flex items-center gap-2"
            >
              ← Retour
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {orderType === 'pickup' ? 'Heure de retrait' : 'Heure de livraison'}
            </h2>

            {loadingSlots ? (
              <div className="bg-white rounded-2xl p-8 text-center">
                <p className="text-gray-500">Chargement des créneaux...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Sélection du jour */}
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  {timeSlots.map(day => {
                    const hasAvailable = day.slots.some(s => s.available)
                    return (
                      <button
                        key={day.date}
                        onClick={() => {
                          setSelectedDate(day.date)
                          setSelectedTime(null)
                        }}
                        disabled={!hasAvailable}
                        className={`px-4 py-3 rounded-xl whitespace-nowrap font-medium transition-colors ${
                          selectedDate === day.date
                            ? 'bg-orange-500 text-white'
                            : hasAvailable
                            ? 'bg-white text-gray-700 hover:bg-gray-100'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {day.dayLabel}
                      </button>
                    )
                  })}
                </div>

                {/* Créneaux du jour sélectionné */}
                <div className="bg-white rounded-2xl p-4">
                  {selectedDaySlots.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">
                      Aucun créneau disponible ce jour
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {selectedDaySlots.map(slot => (
                        <button
                          key={slot.time}
                          onClick={() => slot.available && setSelectedTime(slot.time)}
                          disabled={!slot.available}
                          className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                            selectedTime === slot.time
                              ? 'bg-orange-500 text-white'
                              : slot.available
                              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              : 'bg-gray-50 text-gray-300'
                          }`}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedDate && selectedTime && (
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                    <p className="text-green-700 font-medium">
                      ✅ {orderType === 'pickup' ? 'Retrait' : 'Livraison'} le{' '}
                      {timeSlots.find(d => d.date === selectedDate)?.dayLabel} à {selectedTime}
                    </p>
                  </div>
                )}

                <button
                  onClick={() => goToStep('payment')}
                  disabled={!selectedDate || !selectedTime}
                  className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  Passer au paiement →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ÉTAPE: PAIEMENT */}
        {step === 'payment' && (
          <div>
            <button
              onClick={() => goToStep('timeslot')}
              className="text-gray-500 mb-4 flex items-center gap-2"
            >
              ← Retour
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Récapitulatif</h2>

            {/* Résumé commande */}
            <div className="bg-white rounded-2xl p-6 mb-6">
              <h3 className="font-bold mb-4">🛒 Votre commande</h3>
              {cart.map(item => (
                <div key={item.id} className="flex justify-between py-2 border-b last:border-0">
                  <div>
                    <span>{item.quantity}x {item.name}</span>
                    {item.options.length > 0 && (
                      <div className="text-xs text-gray-500">
                        {item.options.map(o => o.item_name).join(', ')}
                      </div>
                    )}
                  </div>
                  <span className="font-medium">
                    {((item.price + (item.optionsTotal || 0)) * item.quantity).toFixed(2)}€
                  </span>
                </div>
              ))}

              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Sous-total</span>
                  <span>{getCartTotal().toFixed(2)}€</span>
                </div>
                {orderType === 'delivery' && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Livraison</span>
                    <span>{(deliveryFee || 0).toFixed(2)}€</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="text-orange-500">
                    {(getCartTotal() + (orderType === 'delivery' ? deliveryFee : 0)).toFixed(2)}€
                  </span>
                </div>
              </div>
            </div>

            {/* Infos retrait/livraison */}
            <div className="bg-white rounded-2xl p-6 mb-6">
              <h3 className="font-bold mb-4">
                {orderType === 'pickup' ? '🥡 Retrait' : '🚗 Livraison'}
              </h3>
              <p className="text-gray-700">
                {timeSlots.find(d => d.date === selectedDate)?.dayLabel} à {selectedTime}
              </p>
              {orderType === 'pickup' && establishment.address && (
                <p className="text-gray-500 text-sm mt-2">📍 {establishment.address}</p>
              )}
              {orderType === 'delivery' && deliveryAddress && (
                <p className="text-gray-500 text-sm mt-2">📍 {deliveryAddress}</p>
              )}
            </div>

            {/* Bouton payer */}
            <button
              onClick={submitOrder}
              disabled={submitting}
              className="w-full bg-green-500 text-white font-bold py-4 rounded-2xl hover:bg-green-600 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Traitement...' : '💳 Payer et commander'}
            </button>

            <p className="text-center text-gray-400 text-sm mt-4">
              🔒 Paiement sécurisé par Viva Wallet
            </p>
          </div>
        )}

        {/* ÉTAPE: CONFIRMATION */}
        {step === 'confirmation' && orderResult && (
          <div className="text-center py-8">
            <div className="bg-white rounded-2xl p-8 max-w-md mx-auto">
              <span className="text-6xl block mb-4">✅</span>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Commande confirmée !</h2>
              <p className="text-gray-500 mb-6">Merci pour votre commande</p>

              <div className="bg-orange-50 rounded-2xl p-6 mb-6">
                <p className="text-gray-600 mb-2">Numéro de commande</p>
                <p className="text-4xl font-bold text-orange-500">{orderResult.orderNumber}</p>
              </div>

              {orderResult.pickupCode && (
                <div className="bg-gray-100 rounded-2xl p-6 mb-6">
                  <p className="text-gray-600 mb-2">Code de retrait</p>
                  <p className="text-3xl font-bold font-mono tracking-widest">
                    {orderResult.pickupCode}
                  </p>
                </div>
              )}

              <p className="text-gray-500 mb-6">
                Vous recevrez un email de confirmation avec tous les détails.
              </p>

              <button
                onClick={() => {
                  setStep('menu')
                  setOrderResult(null)
                }}
                className="bg-orange-500 text-white font-bold px-8 py-3 rounded-xl"
              >
                Nouvelle commande
              </button>
            </div>
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
                  {currentPropositionIndex === currentPropositions.length - 1 ? 'Ajouter' : 'Suivant →'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Auth */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Connexion</h2>
                <button
                  onClick={() => {
                    setShowAuthModal(false)
                    setAuthStep('email')
                    setAuthError('')
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
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
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
                    placeholder="votre@email.com"
                    autoFocus
                  />
                  <button
                    onClick={sendOtp}
                    disabled={authLoading || !authEmail}
                    className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl disabled:opacity-50"
                  >
                    {authLoading ? 'Envoi...' : 'Recevoir le code'}
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-gray-500 mb-4">
                    Code envoyé à <strong>{authEmail}</strong>
                  </p>
                  <input
                    type="text"
                    value={authOtp}
                    onChange={e => setAuthOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4 text-center text-2xl font-mono tracking-widest"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                  />
                  <button
                    onClick={verifyOtp}
                    disabled={authLoading || authOtp.length !== 6}
                    className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl disabled:opacity-50 mb-3"
                  >
                    {authLoading ? 'Vérification...' : 'Valider'}
                  </button>
                  <button
                    onClick={() => {
                      setAuthStep('email')
                      setAuthOtp('')
                    }}
                    className="w-full text-gray-500 text-sm"
                  >
                    ← Changer d'email
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
