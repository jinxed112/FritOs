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

type Product = {
  id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  category_id: string
  is_available: boolean
  available_online: boolean
}

type CartItem = {
  id: string
  productId: string
  name: string
  price: number
  quantity: number
  options: { item_id: string; item_name: string; price: number }[]
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Navigation
  const [step, setStep] = useState<Step>('menu')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Cart
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup')

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

    // Charger les produits disponibles en ligne
    const { data: prods } = await supabase
      .from('products')
      .select('id, name, description, price, image_url, category_id, is_available, available_online')
      .eq('establishment_id', est.id)
      .eq('is_active', true)
      .eq('is_available', true)
      .order('display_order')

    // Filtrer les produits disponibles en ligne (ou tous si available_online n'est pas défini)
    const onlineProducts = (prods || []).filter(
      p => p.available_online !== false
    )
    setProducts(onlineProducts)

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

  // Cart functions
  function addToCart(product: Product) {
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
        // Sélectionner le premier jour avec des créneaux disponibles
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

  // Delivery
  async function checkDeliveryAddress() {
    if (!establishment || !deliveryAddress.trim()) return

    setCheckingDelivery(true)

    try {
      const response = await fetch('/api/delivery/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          establishmentId: establishment.id,
          address: deliveryAddress,
        }),
      })

      const data = await response.json()
      setDeliveryInfo(data)

      if (data.deliverable) {
        // Vérifier si livraison gratuite
        const cartTotal = getCartTotal()
        if (data.freeDeliveryThreshold && cartTotal >= data.freeDeliveryThreshold) {
          setDeliveryFee(0)
        } else {
          setDeliveryFee(data.deliveryFee)
        }
      }
    } catch (e) {
      console.error('Erreur vérification livraison:', e)
    } finally {
      setCheckingDelivery(false)
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
          deliveryAddressId: null, // TODO: gérer les adresses sauvegardées
          deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
          deliveryLat: orderType === 'delivery' ? deliveryLat : null,
          deliveryLng: orderType === 'delivery' ? deliveryLng : null,
          deliveryFee: orderType === 'delivery' ? deliveryFee : 0,
          notes: null,
          loyaltyPointsUsed: 0, // TODO: implémenter
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
  const selectedDaySlots = timeSlots.find(d => d.date === selectedDate)?.slots || []

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
                        onClick={() => addToCart(product)}
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
                    // Reset validation si l'adresse change
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
                    // Vérifier si livraison gratuite
                    const cartTotal = getCartTotal()
                    // TODO: récupérer freeDeliveryThreshold depuis config
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
                  <span>
                    {item.quantity}x {item.name}
                  </span>
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
