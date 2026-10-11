'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { estDansSaPlage } from '@/lib/product-availability'
import { groupesARetirer, groupesDeclenches } from '@/lib/options-declenchees'
import { estCategorieProposee } from '@/lib/suggestion-boisson'
import { contexteDepuisProduits, taxeDesLignes, ventilerLignes } from '@/lib/menu-ventilation'
import AddressInput from '@/components/AddressInput'
import InvoiceModal from '@/components/InvoiceModal'
import Link from 'next/link'
import {
  AlarmClock, Banknote, CalendarClock, Check, CreditCard, Delete, FileText, Gift, Info,
  MapPin, Minus, Phone, Plus, RefreshCw, Search, Settings, Trash2, X,
} from 'lucide-react'

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
  availability_schedule?: unknown
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
  // Cet ecran reste allume tout le service : sans ce tick, un produit
  // a horaires resterait affiche jusqu'au prochain rechargement de page.
  const [minuteCourante, setMinuteCourante] = useState(() => new Date())
  const [allOptionGroups, setAllOptionGroups] = useState<OptionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  
  // Product modal state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [currentPropositions, setCurrentPropositions] = useState<OptionGroup[]>([])
  // Étapes normales du produit ouvert : jamais retirées par un déclenchement
  const [groupesDeBase, setGroupesDeBase] = useState<string[]>([])
  const [currentPropositionIndex, setCurrentPropositionIndex] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([])
  
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderType, setOrderType] = useState<OrderType>('takeaway')
  const [isBux, setIsBux] = useState(false)

  // Invoice modal
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  
  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [offeredReason, setOfferedReason] = useState('')
  const [cashReceived, setCashReceived] = useState(0)
  // Saisie au pavé numérique de l'encaissement (texte, pour garder la virgule en cours de frappe)
  const [cashInput, setCashInput] = useState('')
  const [recherche, setRecherche] = useState('')
  const [heure, setHeure] = useState('')

  // Confirmation
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Paiement carte envoyé au terminal Viva (uniquement si la caisse a un terminal attribué)
  const [terminalWaiting, setTerminalWaiting] = useState<number | null>(null)
  
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

  // Rafraichit la minute pour que les produits a horaires apparaissent et
  // disparaissent tout seuls, sans intervention au comptoir.
  useEffect(() => {
    const majHeure = () => setHeure(new Date().toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' }))
    majHeure()
    const t = setInterval(() => { setMinuteCourante(new Date()); majHeure() }, 30_000)
    return () => clearInterval(t)
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
        id, name, description, price, image_url, category_id, is_available, availability_schedule, vat_eat_in, vat_takeaway,
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
    setIsBux(false)
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
        `/api/timeslots?establishmentId=${device.establishmentId}&orderType=delivery&days=3&source=counter&_t=${Date.now()}`,
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
    setGroupesDeBase(propositions.map(og => og.id))
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

    // Options déclenchées (ex. « Frites +1,50 € » → choix de la sauce), comme la borne :
    // les groupes déclenchés par le choix courant sont insérés juste après, ceux qui ne le
    // sont plus (changement d'avis) sont retirés avec leurs choix.
    const g = currentPropositions[currentPropositionIndex]
    let props = currentPropositions
    let opts = selectedOptions
    if (g) {
      const declenches = groupesDeclenches(g, opts)
      const aRetirer = groupesARetirer(g, opts, groupesDeBase)
      if (aRetirer.length) {
        props = props.filter((p, i) => i <= currentPropositionIndex || !aRetirer.includes(p.id))
        opts = opts.filter(o => !aRetirer.includes(o.option_group_id))
      }
      const nouveaux = declenches
        .filter(id => !props.some(p => p.id === id))
        .map(id => allOptionGroups.find(x => x.id === id))
        .filter((x): x is OptionGroup => !!x && x.option_group_items.length > 0)
      if (nouveaux.length) {
        props = [...props.slice(0, currentPropositionIndex + 1), ...nouveaux, ...props.slice(currentPropositionIndex + 1)]
      }
      setCurrentPropositions(props)
      setSelectedOptions(opts)
    }

    if (currentPropositionIndex < props.length - 1) {
      setCurrentPropositionIndex(currentPropositionIndex + 1)
    } else {
      addToCart(opts)
    }
  }

  function prevProposition() {
    if (currentPropositionIndex > 0) {
      setCurrentPropositionIndex(currentPropositionIndex - 1)
    }
  }

  // ==================== CART ====================

  function addToCart(options: SelectedOption[] = selectedOptions) {
    if (!selectedProduct) return
    
    const optionsTotal = options.reduce((sum, o) => sum + o.price, 0)
    
    const newItem: CartItem = {
      id: Date.now().toString(),
      product_id: selectedProduct.id,
      name: selectedProduct.name,
      price: selectedProduct.price,
      quantity: 1,
      options,
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
    //
    // Depuis le 26/08/2026 la course de livraison n'est plus dans le total : le
    // livreur est indépendant et se fait payer sa course en espèces, en main propre.
    // Elle ne doit donc entrer ni dans l'encaissement, ni dans le Z, ni dans la TVA.
    return getCartSubtotal()
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
      // TVA par ligne (chaque produit a son propre taux). Un plat passé en menu
      // sort en deux lignes pour que la boisson garde son taux sur place :
      // cf. lib/menu-ventilation
      const lignes = ventilerLignes(
        cart.map(item => ({
          product_id: item.product_id,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          vat_rate: orderType === 'eat_in' ? item.vat_eat_in : item.vat_takeaway,
          options_selected: item.options.length > 0 ? JSON.stringify(item.options) : null,
          options_total: item.options_total,
          line_total: (item.price + item.options_total) * item.quantity,
        })),
        contexteDepuisProduits(
          products,
          orderType === 'eat_in',
          p => estCategorieProposee(categories.find(c => c.id === p.category_id)?.name),
        ),
      )
      const taxAmount = taxeDesLignes(lignes)
      const subtotalHT = totalTTC - taxAmount
      
      const isOffered = paymentMethod === 'offered'
      // Carte + caisse reliée à un terminal : le montant part au terminal, la commande
      // n'arrive en cuisine qu'une fois le paiement accepté (même mécanique que la borne).
      const viaTerminal = paymentMethod === 'card' && orderType !== 'delivery' && !!device?.vivaTerminalId

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
        order_type: orderType === 'delivery' ? 'delivery' : 'takeaway',
        eat_in: false,
        status: viaTerminal ? 'awaiting_payment' : 'pending',
        subtotal: subtotalHT,
        tax_amount: taxAmount,
        total: totalTTC,
        total_amount: totalTTC,
        source: 'counter',
        payment_method: orderType === 'delivery' ? 'cash' : (paymentMethod === 'offered' ? 'cash' : paymentMethod),
        payment_status: orderType === 'delivery' || viaTerminal ? 'pending' : 'paid',
        is_offered: isOffered,
        device_id: device!.id,
        notes: isBux ? 'BUX' : null,
        metadata: orderType === 'delivery' 
          ? JSON.stringify({
              delivery_address: deliveryAddress,
              delivery_lat: deliveryLat,
              delivery_lng: deliveryLng,
              travel_minutes: deliveryInfo?.duration || null,
              phone_order: true,
              // Course réglée en espèces au livreur, hors caisse. Ce n'est pas du CA.
              driver_fee: deliveryFee || null,
            })
          : (isOffered && offeredReason ? JSON.stringify({ offered_reason: offeredReason }) : null),
      }

      // Champs spécifiques delivery
      if (orderType === 'delivery') {
        orderData.customer_name = deliveryCustomerName
        orderData.customer_phone = deliveryCustomerPhone
        orderData.delivery_notes = deliveryAddress
        // 0 volontairement : la friterie ne facture plus la course (metadata.driver_fee)
        orderData.delivery_fee = 0
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
      const orderItems = lignes.map(ligne => ({ ...ligne, order_id: order.id }))
      
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems)
      
      if (itemsError) {
        console.error('Items error:', itemsError)
        throw itemsError
      }
      
      if (viaTerminal) {
        const paye = await payerAuTerminal(order.id, totalTTC)
        if (!paye) {
          await supabase.from('orders')
            .update({ status: 'cancelled', payment_status: 'failed' })
            .eq('id', order.id)
            .eq('status', 'awaiting_payment')
          alert('Paiement refusé, annulé ou sans réponse du terminal. La commande n\'a pas été envoyée en cuisine.')
          return
        }
        await supabase.from('orders')
          .update({ status: 'pending', payment_status: 'paid' })
          .eq('id', order.id)
      }

      // Succès !
      setOrderNumber(order.order_number)
      setCart([])
      setShowPaymentModal(false)
      setPaymentMethod('cash')
      setCashReceived(0)
      setCashInput('')
      setOfferedReason('')
      setIsBux(false)
      
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

  // Envoie le montant au terminal Viva de la caisse puis attend sa réponse (90 s max).
  async function payerAuTerminal(orderId: string, montant: number): Promise<boolean> {
    setTerminalWaiting(montant)
    try {
      const r = await fetch('/api/viva/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: montant, orderId, terminalId: device!.vivaTerminalId }),
      })
      const d = await r.json()
      if (!d.success || !d.sessionId) return false
      for (let i = 0; i < 45; i++) {
        await new Promise(res => setTimeout(res, 2000))
        try {
          const s = await fetch(`/api/viva/payment?sessionId=${d.sessionId}&orderId=${orderId}`)
          const st = await s.json()
          if (st.status === 'success') return true
          if (st.status === 'failed' || st.status === 'cancelled' || st.status === 'aborted') return false
        } catch { /* on réessaie */ }
      }
      return false
    } catch (e) {
      console.error('Paiement terminal :', e)
      return false
    } finally {
      setTerminalWaiting(null)
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

  // Une categorie dont tous les produits sont hors plage ne doit pas rester
  // affichee : sans ca, « Menu » apparaitrait vide tous les soirs et le
  // week-end. On garde les categories qui n'ont aucun produit du tout, elles
  // relevent d'un probleme de catalogue et pas d'un horaire.
  const categoriesVisibles = categories.filter(cat => {
    const duGroupe = products.filter(p => p.category_id === cat.id)
    if (duGroupe.length === 0) return true
    return duGroupe.some(p => estDansSaPlage(p.availability_schedule, minuteCourante))
  })

  // Si la categorie ouverte disparait en cours de service (14h00 pile, l'ecran
  // est reste allume), on retombe sur la premiere visible au lieu d'afficher
  // une liste vide sous un onglet qui n'existe plus.
  const categorieActive = categoriesVisibles.some(c => c.id === selectedCategory)
    ? selectedCategory
    : categoriesVisibles[0]?.id ?? null

  const filteredProducts = products.filter(
    p => p.category_id === categorieActive && estDansSaPlage(p.availability_schedule, minuteCourante)
  )

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

  // Recherche : sur tout le catalogue visible, pas seulement la catégorie ouverte
  const rechercheNormalisee = recherche.trim().toLowerCase()
  const produitsAffiches = rechercheNormalisee
    ? products.filter(p =>
        estDansSaPlage(p.availability_schedule, minuteCourante) &&
        p.name.toLowerCase().includes(rechercheNormalisee))
    : filteredProducts

  function nombreDansCategorie(categoryId: string): number {
    return products.filter(p => p.category_id === categoryId && estDansSaPlage(p.availability_schedule, minuteCourante)).length
  }

  function formatTime(dateStr: string | null): string {
    if (!dateStr) return '--:--'
    return new Date(dateStr).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
  }

  function getOrderTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      delivery: 'Livraison',
      takeaway: 'À emporter',
      eat_in: 'Sur place',
    }
    return labels[type] || type
  }

  function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'En attente',
      preparing: 'En préparation',
      ready: 'Prêt',
    }
    return labels[status] || status
  }

  // Prix à la belge : « 6,40 € »
  function eur(n: number): string {
    return `${n.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  }

  // Dans la catégorie « Mitraillette », la tuile dit « Boulette » et pas « Mitraillette Boulette ».
  // En recherche on garde le nom complet, la catégorie n'est plus là pour donner le contexte.
  function nomCourt(product: Product): string {
    if (rechercheNormalisee) return product.name
    const cat = categories.find(c => c.id === product.category_id)
    const racine = cat?.name.trim().split(/\s+/)[0]?.replace(/s$/i, '').toLowerCase()
    if (!racine) return product.name
    if (product.name.toLowerCase().startsWith(racine + ' ')) {
      const reste = product.name.slice(racine.length + 1).trim()
      if (reste) return reste.charAt(0).toUpperCase() + reste.slice(1)
    }
    return product.name
  }

  function nombreArticles(): number {
    return cart.reduce((s, i) => s + i.quantity, 0)
  }

  function libelleTypeCommande(): string {
    if (orderType === 'delivery') return 'Livraison'
    if (isBux) return 'BUX'
    return 'À emporter'
  }

  // Billets proposés à l'encaissement : les montants ronds juste au-dessus du total
  function montantsProposes(): number[] {
    const total = getTotalWithVat()
    const proposes = new Set<number>()
    for (const pas of [5, 10, 20, 50, 100]) {
      const m = Math.ceil((total + 0.001) / pas) * pas
      if (m > total) proposes.add(m)
    }
    return Array.from(proposes).sort((a, b) => a - b).slice(0, 4)
  }

  function saisirEspeces(valeur: string) {
    setCashInput(valeur)
    setCashReceived(parseFloat(valeur.replace(',', '.')) || 0)
  }

  function toucheEspeces(touche: string) {
    if (touche === 'effacer') return saisirEspeces(cashInput.slice(0, -1))
    if (touche === ',' && (cashInput.includes(',') || cashInput === '')) return
    const [, decimales] = cashInput.split(',')
    if (decimales !== undefined && decimales.length >= 2) return
    if (cashInput.replace(',', '').length >= 6) return
    saisirEspeces(cashInput + touche)
  }

  function ouvrirEncaissement() {
    setPaymentMethod('cash')
    saisirEspeces('')
    setShowPaymentModal(true)
  }

  function viderPanier() {
    if (cart.length === 0) return
    if (!confirm('Vider la commande en cours ?')) return
    setCart([])
  }

  // ==================== RENDER ====================

  // Checking auth
  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-[#f3f4f8] flex items-center justify-center">
        <p className="text-slate-500 text-xl font-semibold animate-pulse">Vérification…</p>
      </div>
    )
  }

  // Need to login via /device
  if (authStatus === 'unauthorized') {
    return (
      <div className="min-h-screen bg-[#f3f4f8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-[#e3e6ee] p-10 text-center max-w-md">
          <h1 className="text-2xl font-extrabold text-slate-900 mb-3">Caisse non configurée</h1>
          <p className="text-slate-600 mb-8">
            Connectez-vous et choisissez une caisse depuis la page de configuration.
          </p>
          <button
            onClick={() => router.push('/device')}
            className="bg-[#3b5bff] text-white font-bold px-8 h-14 rounded-xl active:bg-[#2a44d4]"
          >
            Aller à la configuration
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f3f4f8] flex items-center justify-center">
        <p className="text-slate-500 text-xl font-semibold animate-pulse">Chargement de la carte…</p>
      </div>
    )
  }

  // Écran de confirmation
  if (orderNumber) {
    return (
      <div className="min-h-screen bg-[#f3f4f8] flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl border border-[#e3e6ee] shadow-sm px-16 py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-5">
            <Check className="w-9 h-9" strokeWidth={3} />
          </div>
          <p className="text-lg font-semibold text-slate-600">Commande envoyée en cuisine</p>
          <p className="text-8xl font-extrabold tracking-tight text-slate-900 my-4">{orderNumber}</p>
          <button
            onClick={() => {
              setOrderNumber(null)
              setOrderType('takeaway')
              setIsBux(false)
            }}
            className="mt-4 bg-[#3b5bff] text-white font-extrabold h-16 px-14 rounded-2xl text-xl active:bg-[#2a44d4]"
          >
            Nouvelle commande
          </button>
        </div>
      </div>
    )
  }

  const boutonType = (actif: boolean) =>
    `h-11 px-5 rounded-[9px] text-[15px] whitespace-nowrap transition-colors ${
      actif ? 'bg-white text-slate-900 font-bold shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'text-slate-600 font-semibold active:bg-white/60'
    }`

  return (
    <div className="h-screen bg-[#f3f4f8] text-slate-900 flex flex-col overflow-hidden">
      {/* En-tête */}
      <header className="h-16 flex-shrink-0 bg-white border-b border-[#e3e6ee] flex items-center gap-3 px-3 lg:px-4">
        <div className="flex items-center gap-2.5 min-w-0 lg:w-[236px]">
          <button
            onClick={() => router.push('/device')}
            aria-label="Changer de caisse"
            className="w-11 h-11 rounded-[10px] border border-[#e3e6ee] text-slate-600 flex items-center justify-center flex-shrink-0 active:bg-slate-100"
          >
            <RefreshCw className="w-[18px] h-[18px]" />
          </button>
          <div className="min-w-0 hidden sm:block">
            <div className="font-bold text-[15px] truncate">{device?.name}</div>
            <div className="text-xs text-slate-500 truncate">{device?.code}</div>
          </div>
        </div>

        <div className="flex-1 flex justify-center min-w-0">
          <div role="group" aria-label="Type de commande" className="flex bg-[#eef0f5] rounded-xl p-1 gap-1">
            <button onClick={() => { setOrderType('takeaway'); setIsBux(true) }} className={boutonType(isBux)}>
              BUX
            </button>
            <button onClick={() => { setOrderType('takeaway'); setIsBux(false) }} className={boutonType(orderType === 'takeaway' && !isBux)}>
              À emporter
            </button>
            <button onClick={startDeliveryOrder} className={boutonType(orderType === 'delivery')}>
              Livraison
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowLateOrdersModal(true)}
            className={`h-11 px-3.5 rounded-[10px] flex items-center gap-2 text-sm font-bold border ${
              lateOrders.length > 0
                ? 'border-orange-200 bg-orange-50 text-orange-800'
                : 'border-[#e3e6ee] bg-white text-slate-500'
            }`}
          >
            <AlarmClock className="w-[18px] h-[18px]" />
            <span className="hidden md:inline">{lateOrders.length > 0 ? `${lateOrders.length} en retard` : 'Retards'}</span>
            <span className="md:hidden">{lateOrders.length}</span>
          </button>
          <button
            onClick={() => setInvoiceModalOpen(true)}
            aria-label="Générer une facture"
            className="w-11 h-11 rounded-[10px] border border-[#e3e6ee] text-slate-600 flex items-center justify-center active:bg-slate-100"
          >
            <FileText className="w-5 h-5" />
          </button>
          <Link
            href="/counter/backoffice"
            aria-label="Gestion de la caisse"
            className="w-11 h-11 rounded-[10px] border border-[#e3e6ee] text-slate-600 flex items-center justify-center active:bg-slate-100"
          >
            <Settings className="w-5 h-5" />
          </Link>
          <div className="hidden lg:block text-xl font-bold pl-2 w-[64px] text-right">{heure}</div>
        </div>
      </header>

      {/* Invoice modal */}
      {device && (
        <InvoiceModal
          establishmentId={device.establishmentId}
          isOpen={invoiceModalOpen}
          onClose={() => setInvoiceModalOpen(false)}
        />
      )}

      <div className="flex-1 flex min-h-0">
        {/* Catégories : colonne sur la caisse, bandeau sur petit écran */}
        <nav aria-label="Catégories" className="hidden lg:flex w-[184px] flex-shrink-0 bg-white border-r border-[#e3e6ee] p-2 flex-col gap-1 overflow-y-auto scrollbar-hide">
          {categoriesVisibles.map(cat => {
            const actif = !rechercheNormalisee && categorieActive === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setRecherche('') }}
                className={`min-h-[48px] rounded-[10px] px-3 flex items-center justify-between gap-2 text-left text-[15px] transition-colors ${
                  actif ? 'bg-[#3b5bff] text-white font-bold' : 'text-slate-800 font-semibold active:bg-slate-100'
                }`}
              >
                <span className="leading-tight">{cat.name.trim()}</span>
                <span className={`text-xs font-semibold ${actif ? 'text-white/80' : 'text-slate-500'}`}>{nombreDansCategorie(cat.id)}</span>
              </button>
            )
          })}
        </nav>

        <main className="flex-1 min-w-0 flex flex-col">
          <div className="lg:hidden bg-white border-b border-[#e3e6ee] px-3 py-2 flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0">
            {categoriesVisibles.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setRecherche('') }}
                className={`h-11 px-4 rounded-[10px] whitespace-nowrap text-sm ${
                  !rechercheNormalisee && categorieActive === cat.id ? 'bg-[#3b5bff] text-white font-bold' : 'bg-[#eef0f5] text-slate-700 font-semibold'
                }`}
              >
                {cat.name.trim()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 px-4 lg:px-[18px] pt-4 pb-3 flex-shrink-0">
            <h1 className="text-2xl font-extrabold tracking-tight truncate">
              {rechercheNormalisee ? 'Recherche' : categoriesVisibles.find(c => c.id === categorieActive)?.name.trim()}
            </h1>
            <span className="text-sm text-slate-600 whitespace-nowrap">
              {produitsAffiches.length} produit{produitsAffiches.length > 1 ? 's' : ''}
            </span>
            <label className="ml-auto h-11 w-full max-w-[300px] bg-white border border-[#e3e6ee] rounded-[10px] flex items-center gap-2 px-3 text-slate-500 focus-within:border-[#3b5bff]">
              <Search className="w-[18px] h-[18px] flex-shrink-0" />
              <input
                value={recherche}
                onChange={e => setRecherche(e.target.value)}
                placeholder="Chercher un produit"
                aria-label="Chercher un produit"
                className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-slate-900 placeholder:text-slate-400"
              />
              {recherche && (
                <button onClick={() => setRecherche('')} aria-label="Effacer la recherche" className="w-8 h-8 -mr-1 flex items-center justify-center text-slate-500">
                  <X className="w-4 h-4" />
                </button>
              )}
            </label>
          </div>

          <div className="flex-1 overflow-y-auto px-4 lg:px-[18px] pb-24 lg:pb-4">
            {produitsAffiches.length === 0 ? (
              <p className="text-center text-slate-500 py-12 text-base">
                {rechercheNormalisee ? 'Aucun produit ne correspond' : 'Aucun produit dans cette catégorie'}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {produitsAffiches.map(product => {
                  const allergens = getProductAllergens(product)
                  return (
                    <div key={product.id} className="relative">
                      <button
                        onClick={() => openProductModal(product)}
                        className="w-full h-[92px] bg-white border border-[#e3e6ee] rounded-xl px-3.5 py-3 flex flex-col justify-between items-start text-left active:bg-[#eef1ff] active:border-[#3b5bff] transition-colors"
                      >
                        <span className="text-[15px] font-bold leading-tight line-clamp-2 pr-6">{nomCourt(product)}</span>
                        <span className="text-[15px] font-semibold text-[#3b5bff]">{eur(product.price)}</span>
                      </button>
                      {allergens.length > 0 && (
                        <button
                          onClick={() => setAllergenModalProduct(product)}
                          aria-label={`Allergènes de ${product.name}`}
                          className="absolute bottom-1 right-1 w-11 h-11 flex items-center justify-center text-slate-400 active:text-[#3b5bff]"
                        >
                          <Info className="w-[18px] h-[18px]" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </main>

        {/* Bouton panier sur petit écran */}
        {!cartOpen && (
          <button
            onClick={() => setCartOpen(true)}
            className="lg:hidden fixed bottom-3 left-3 right-3 z-30 bg-slate-900 text-white h-14 px-5 rounded-2xl shadow-2xl flex items-center justify-between font-bold"
          >
            <span>{cart.length > 0 ? `${nombreArticles()} article${nombreArticles() > 1 ? 's' : ''}` : 'Panier vide'}</span>
            <span className="text-lg">{eur(getCartTotal())}</span>
          </button>
        )}

        {cartOpen && (
          <div onClick={() => setCartOpen(false)} className="lg:hidden fixed inset-0 bg-black/40 z-40" />
        )}

        {/* Panier : colonne sur la caisse, tiroir sur petit écran */}
        <aside
          aria-label="Commande en cours"
          className={`${
            cartOpen ? 'fixed inset-x-0 bottom-0 top-14 z-50 flex rounded-t-3xl' : 'hidden'
          } lg:relative lg:inset-auto lg:flex lg:z-auto lg:rounded-none lg:w-[392px] bg-white border-l border-[#e3e6ee] flex-col flex-shrink-0 overflow-hidden`}
        >
          <div className="px-[18px] pt-4 pb-3 border-b border-[#eef0f5] flex items-baseline justify-between gap-2 flex-shrink-0">
            <h2 className="text-lg font-extrabold">Commande</h2>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-600">
                {libelleTypeCommande()} · {nombreArticles()} article{nombreArticles() > 1 ? 's' : ''}
              </span>
              <button onClick={() => setCartOpen(false)} aria-label="Fermer le panier" className="lg:hidden w-10 h-10 flex items-center justify-center text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2.5 py-1">
            {cart.length === 0 ? (
              <p className="text-center text-slate-400 py-16 text-base">Touchez un produit pour commencer</p>
            ) : (
              cart.map(item => (
                <div key={item.id} className="flex items-center gap-2.5 px-2 py-2.5 border-b border-[#f1f2f6]">
                  <div className="flex items-center border border-[#e3e6ee] rounded-[10px] h-11 flex-shrink-0">
                    {item.quantity > 1 ? (
                      <button onClick={() => updateQuantity(item.id, -1)} aria-label="Retirer un" className="w-10 h-full flex items-center justify-center text-slate-700 active:bg-slate-100 rounded-l-[10px]">
                        <Minus className="w-4 h-4" />
                      </button>
                    ) : (
                      <button onClick={() => removeFromCart(item.id)} aria-label="Supprimer la ligne" className="w-10 h-full flex items-center justify-center text-red-600 active:bg-red-50 rounded-l-[10px]">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <span className="w-6 text-center font-bold text-[15px]">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} aria-label="Ajouter un" className="w-10 h-full flex items-center justify-center text-slate-700 active:bg-slate-100 rounded-r-[10px]">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold leading-tight">{item.name}</div>
                    {item.options.length > 0 && (
                      <div className="text-[13px] text-slate-600 leading-snug mt-0.5">
                        {item.options.map(o => o.item_name).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="text-[15px] font-bold whitespace-nowrap">{eur((item.price + item.options_total) * item.quantity)}</div>
                </div>
              ))
            )}
          </div>

          <div className="px-[18px] pt-3.5 pb-[18px] border-t border-[#eef0f5] bg-[#fafbfd] flex flex-col gap-3 flex-shrink-0">
            {orderType === 'delivery' && (
              <div className="rounded-xl border border-[#d9def0] bg-white p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold flex items-center gap-1.5"><Phone className="w-4 h-4" /> Commande téléphone</span>
                  <button onClick={startDeliveryOrder} className="h-9 px-2 text-[#3b5bff] font-semibold">Modifier</button>
                </div>
                {deliveryCustomerName && <p className="text-slate-700">{deliveryCustomerName} · {deliveryCustomerPhone}</p>}
                {deliveryAddress && <p className="text-slate-600 truncate">{deliveryAddress}</p>}
                {deliverySelectedTime && (
                  <p className="text-slate-600">{deliveryTimeSlots.find(d => d.date === deliverySelectedDate)?.dayLabel} à {deliverySelectedTime}</p>
                )}
                {deliveryFee > 0 && (
                  // La course n'entre pas dans l'encaissement : le client la règle en
                  // espèces au livreur. Affichée pour qu'on puisse l'annoncer au téléphone.
                  <p className="mt-2 text-amber-900 bg-amber-50 rounded-lg px-2 py-1.5">
                    Course livreur <b>{eur(deliveryFee)}</b>, en espèces au livreur, hors caisse
                  </p>
                )}
                <button onClick={cancelDeliveryOrder} className="mt-1 h-9 text-red-700 font-semibold">
                  Annuler la livraison
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={viderPanier}
                disabled={cart.length === 0}
                className="h-11 px-4 rounded-[10px] border border-[#e3e6ee] bg-white text-sm font-semibold text-red-700 disabled:opacity-40"
              >
                Vider
              </button>
              <div className="text-right">
                <div className="text-[13px] font-semibold text-slate-600">Total TVAC</div>
                <div className="text-[40px] leading-none font-extrabold tracking-tight">{eur(getCartTotal())}</div>
              </div>
            </div>

            {orderType === 'delivery' ? (
              <button
                onClick={submitOrder}
                disabled={cart.length === 0 || !deliveryValidated || !deliverySelectedTime || isSubmitting}
                className="h-[68px] rounded-[14px] bg-[#3b5bff] text-white text-xl font-extrabold disabled:bg-slate-300 active:bg-[#2a44d4]"
              >
                {isSubmitting ? 'Envoi…' : 'Valider la livraison (espèces)'}
              </button>
            ) : (
              <button
                onClick={ouvrirEncaissement}
                disabled={cart.length === 0}
                className="h-[68px] rounded-[14px] bg-[#3b5bff] text-white text-xl font-extrabold disabled:bg-slate-300 active:bg-[#2a44d4]"
              >
                Encaisser
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* Composer un produit */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 lg:p-6">
          <div role="dialog" aria-label={selectedProduct.name} className="bg-white rounded-[20px] w-full max-w-[880px] max-h-[94vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-[#eef0f5] flex items-center gap-4 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-extrabold tracking-tight truncate">{selectedProduct.name}</h2>
                <p className="text-sm text-slate-600">
                  {currentPropositions.length > 1
                    ? `Étape ${currentPropositionIndex + 1} sur ${currentPropositions.length}`
                    : `${eur(selectedProduct.price)}`}
                </p>
              </div>
              {getProductAllergens(selectedProduct).length > 0 && (
                <button
                  onClick={() => setAllergenModalProduct(selectedProduct)}
                  className="h-11 px-3.5 rounded-[10px] border border-[#e3e6ee] text-sm font-semibold text-slate-700 flex items-center gap-2"
                >
                  <Info className="w-[18px] h-[18px]" /> Allergènes
                </button>
              )}
              <button onClick={closeProductModal} aria-label="Fermer" className="w-11 h-11 rounded-[10px] border border-[#e3e6ee] flex items-center justify-center text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {currentPropositions.length > 1 && (
              <div className="px-6 pt-3 flex gap-1.5 flex-shrink-0" aria-hidden="true">
                {currentPropositions.map((g, i) => (
                  <div key={`${g.id}-${i}`} className={`h-1.5 flex-1 rounded-full ${i <= currentPropositionIndex ? 'bg-[#3b5bff]' : 'bg-[#e3e6ee]'}`} />
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {currentPropositions.length === 0 ? (
                <p className="text-slate-600 text-base">Pas de choix pour ce produit.</p>
              ) : currentGroup ? (
                <div>
                  <div className="flex items-baseline gap-3 mb-3">
                    <h3 className="text-lg font-extrabold">{currentGroup.name.trim()}</h3>
                    <span className="text-sm text-slate-600">
                      {currentGroup.selection_type === 'single' ? '1 au choix' : 'plusieurs possibles'}
                    </span>
                    {currentGroup.min_selections > 0 && (
                      <span className="text-xs font-bold text-orange-800 bg-orange-50 border border-orange-200 rounded-md px-2 py-0.5">obligatoire</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {currentGroup.option_group_items.map(item => {
                      const price = item.price_override !== null ? item.price_override : item.product.price
                      const isSelected = isOptionSelected(item.id)
                      return (
                        <button
                          key={item.id}
                          onClick={() => selectOption(currentGroup, item)}
                          aria-pressed={isSelected}
                          className={`min-h-[56px] rounded-xl px-3 py-2 text-left flex flex-col justify-center transition-colors ${
                            isSelected
                              ? 'border-2 border-[#3b5bff] bg-[#eef1ff] text-[#1e3a8a]'
                              : 'border border-[#e3e6ee] bg-white text-slate-800 active:bg-slate-50'
                          }`}
                        >
                          <span className="text-[15px] font-bold leading-tight">{item.product.name}</span>
                          <span className={`text-[13px] font-semibold ${isSelected ? 'text-[#2a44d4]' : 'text-slate-500'}`}>
                            {price === 0 ? 'Inclus' : `+${eur(price)}`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="px-6 py-4 border-t border-[#eef0f5] bg-[#fafbfd] flex items-center gap-4 flex-shrink-0">
              <button
                onClick={currentPropositionIndex === 0 ? closeProductModal : prevProposition}
                className="h-14 px-6 rounded-xl border border-[#e3e6ee] bg-white font-semibold text-base text-slate-700"
              >
                {currentPropositionIndex === 0 ? 'Annuler' : 'Retour'}
              </button>
              <div className="flex-1 text-right">
                <div className="text-[13px] font-semibold text-slate-600">Prix</div>
                <div className="text-2xl font-extrabold">{eur(selectedProduct.price + selectedOptions.reduce((sum, o) => sum + o.price, 0))}</div>
              </div>
              {currentPropositions.length === 0 ? (
                <button onClick={() => addToCart()} className="h-14 px-8 rounded-xl bg-[#3b5bff] text-white font-extrabold text-lg active:bg-[#2a44d4]">
                  Ajouter
                </button>
              ) : (
                <button
                  onClick={nextProposition}
                  disabled={!canProceed()}
                  className="h-14 px-8 rounded-xl bg-[#3b5bff] text-white font-extrabold text-lg disabled:bg-slate-300 active:bg-[#2a44d4]"
                >
                  {currentPropositionIndex === currentPropositions.length - 1 ? 'Ajouter' : 'Suivant'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Encaissement */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 lg:p-6">
          <div role="dialog" aria-label="Encaissement" className="bg-white rounded-[20px] w-full max-w-[1180px] max-h-[94vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-[#eef0f5] flex items-center gap-4 flex-wrap flex-shrink-0">
              <h2 className="text-[22px] font-extrabold">Encaisser</h2>
              <div role="group" aria-label="Moyen de paiement" className="flex bg-[#eef0f5] rounded-xl p-1 gap-1">
                <button onClick={() => setPaymentMethod('cash')} disabled={terminalWaiting !== null} className={`${boutonType(paymentMethod === 'cash')} flex items-center gap-2`}>
                  <Banknote className="w-[18px] h-[18px]" /> Espèces
                </button>
                <button onClick={() => setPaymentMethod('card')} disabled={terminalWaiting !== null} className={`${boutonType(paymentMethod === 'card')} flex items-center gap-2`}>
                  <CreditCard className="w-[18px] h-[18px]" /> Carte
                </button>
                <button onClick={() => setPaymentMethod('offered')} disabled={terminalWaiting !== null} className={`${boutonType(paymentMethod === 'offered')} flex items-center gap-2`}>
                  <Gift className="w-[18px] h-[18px]" /> Offert
                </button>
              </div>
              <button
                disabled={terminalWaiting !== null}
                onClick={() => setShowPaymentModal(false)}
                aria-label="Fermer"
                className="ml-auto w-11 h-11 rounded-[10px] border border-[#e3e6ee] flex items-center justify-center text-slate-600 disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto">
              <div className="flex-1 px-6 py-5 flex flex-col gap-4">
                {terminalWaiting !== null && (
                  <div className="p-5 rounded-2xl bg-[#eef1ff] border border-[#c9d3ff]">
                    <p className="text-2xl font-extrabold text-[#1e3a8a]">{eur(terminalWaiting)} envoyés au terminal</p>
                    <p className="text-[#2a44d4] mt-1">Le client paie sur le terminal. La commande part en cuisine dès que c&apos;est accepté.</p>
                  </div>
                )}

                {paymentMethod === 'cash' && (
                  <>
                    <p className="text-sm font-bold text-slate-600">Le client donne</p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                      <button
                        onClick={() => saisirEspeces(getTotalWithVat().toFixed(2).replace('.', ','))}
                        className={`h-[72px] rounded-xl text-base font-extrabold ${
                          cashReceived === getTotalWithVat() ? 'border-2 border-[#3b5bff] bg-[#eef1ff] text-[#1e3a8a]' : 'border border-[#e3e6ee] bg-white'
                        }`}
                      >
                        Compte juste
                      </button>
                      {montantsProposes().map(m => (
                        <button
                          key={m}
                          onClick={() => saisirEspeces(String(m))}
                          className={`h-[72px] rounded-xl text-[22px] font-extrabold ${
                            cashReceived === m ? 'border-2 border-[#3b5bff] bg-[#eef1ff] text-[#1e3a8a]' : 'border border-[#e3e6ee] bg-white'
                          }`}
                        >
                          {m} €
                        </button>
                      ))}
                    </div>
                    <p className="text-sm font-bold text-slate-600 mt-1">Autre montant</p>
                    <div className="grid grid-cols-3 gap-2 w-full max-w-[360px]">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'effacer'].map(t => (
                        <button
                          key={t}
                          onClick={() => toucheEspeces(t)}
                          aria-label={t === 'effacer' ? 'Effacer' : undefined}
                          className="h-14 rounded-xl border border-[#e3e6ee] bg-[#fafbfd] text-2xl font-bold flex items-center justify-center active:bg-slate-100"
                        >
                          {t === 'effacer' ? <Delete className="w-6 h-6" /> : t}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {paymentMethod === 'card' && terminalWaiting === null && (
                  <p className="text-lg text-slate-700">
                    {orderType !== 'delivery' && device?.vivaTerminalId
                      ? 'Le montant sera envoyé au terminal de la caisse.'
                      : 'Paiement par carte sur le terminal, puis valider.'}
                  </p>
                )}

                {paymentMethod === 'offered' && (
                  <div>
                    <label htmlFor="raison-offert" className="text-sm font-bold text-slate-600 block mb-2">Raison (facultatif)</label>
                    <input
                      id="raison-offert"
                      type="text"
                      value={offeredReason}
                      onChange={(e) => setOfferedReason(e.target.value)}
                      className="w-full h-14 px-4 rounded-xl border border-[#e3e6ee] text-lg outline-none focus:border-[#3b5bff]"
                      placeholder="Ex. amis, erreur cuisine…"
                    />
                    <p className="text-sm font-semibold text-orange-800 mt-3">Commande non comptée dans le chiffre d&apos;affaires</p>
                  </div>
                )}
              </div>

              <aside className="lg:w-[400px] flex-shrink-0 bg-[#f7f8fb] lg:border-l border-t lg:border-t-0 border-[#eef0f5] p-6 flex flex-col gap-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-base font-semibold text-slate-600">À payer</span>
                  <span className="text-3xl font-extrabold">{eur(getTotalWithVat())}</span>
                </div>
                {paymentMethod === 'cash' && (
                  <>
                    <div className="flex justify-between items-baseline">
                      <span className="text-base font-semibold text-slate-600">Reçu</span>
                      <span className="text-3xl font-extrabold">{cashInput ? `${cashInput} €` : '—'}</span>
                    </div>
                    {cashReceived >= getTotalWithVat() && cashReceived > 0 ? (
                      <div className="bg-emerald-50 rounded-2xl px-5 py-4">
                        <div className="text-[15px] font-bold text-emerald-800">À rendre</div>
                        <div className="text-[56px] leading-tight font-extrabold tracking-tight text-emerald-950">{eur(getChange())}</div>
                      </div>
                    ) : cashReceived > 0 ? (
                      <div className="bg-orange-50 rounded-2xl px-5 py-4 text-orange-900 font-semibold">
                        Il manque {eur(getTotalWithVat() - cashReceived)}
                      </div>
                    ) : null}
                  </>
                )}
                <div className="mt-auto pt-2">
                  <button
                    onClick={submitOrder}
                    disabled={isSubmitting || terminalWaiting !== null || (paymentMethod === 'cash' && cashReceived < getTotalWithVat())}
                    className="w-full h-[72px] rounded-[14px] bg-[#3b5bff] text-white text-xl font-extrabold disabled:bg-slate-300 active:bg-[#2a44d4]"
                  >
                    {terminalWaiting !== null
                      ? 'Paiement en cours au terminal…'
                      : isSubmitting
                        ? 'Envoi…'
                        : paymentMethod === 'card' && orderType !== 'delivery' && device?.vivaTerminalId
                          ? 'Envoyer au terminal'
                          : 'Valider et envoyer en cuisine'}
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}

      {/* Commande téléphone (livraison) */}
      {showDeliveryModal && device && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 lg:p-6">
          <div role="dialog" aria-label="Commande téléphone" className="bg-white rounded-[20px] w-full max-w-xl overflow-hidden max-h-[94vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-[#eef0f5] flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-[22px] font-extrabold flex items-center gap-2"><Phone className="w-5 h-5" /> Commande téléphone</h2>
                <p className="text-sm text-slate-600">Livraison, paiement en espèces</p>
              </div>
              <button onClick={cancelDeliveryOrder} aria-label="Fermer" className="w-11 h-11 rounded-[10px] border border-[#e3e6ee] flex items-center justify-center text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <label htmlFor="livraison-nom" className="font-bold text-sm text-slate-700 block mb-2">Nom du client *</label>
                <input
                  id="livraison-nom"
                  type="text"
                  value={deliveryCustomerName}
                  onChange={e => setDeliveryCustomerName(e.target.value)}
                  className="w-full h-14 px-4 rounded-xl border border-[#e3e6ee] text-lg outline-none focus:border-[#3b5bff]"
                  placeholder="Nom Prénom"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="livraison-tel" className="font-bold text-sm text-slate-700 block mb-2">Téléphone *</label>
                <input
                  id="livraison-tel"
                  type="tel"
                  value={deliveryCustomerPhone}
                  onChange={e => setDeliveryCustomerPhone(e.target.value)}
                  className="w-full h-14 px-4 rounded-xl border border-[#e3e6ee] text-lg outline-none focus:border-[#3b5bff]"
                  placeholder="+32 470 00 00 00"
                />
              </div>

              <div>
                <label className="font-bold text-sm text-slate-700 block mb-2">Adresse de livraison *</label>
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
                  onAddressValidated={(data: any) => {
                    setDeliveryAddress(data.address)
                    setDeliveryLat(data.lat)
                    setDeliveryLng(data.lng)
                    setDeliveryValidated(true)
                    // Support both AddressInput formats
                    const travelMin = data.travelMinutes ?? data.deliveryCheck?.duration ?? null
                    const fee = data.deliveryFee ?? data.deliveryCheck?.fee ?? 0
                    setDeliveryInfo({
                      deliverable: true,
                      distance: travelMin,
                      duration: travelMin,
                    })
                    setDeliveryFee(fee)
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
                  <p className="mt-2 px-3 py-2.5 bg-emerald-50 rounded-xl text-emerald-800 text-sm font-semibold flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Adresse validée · course {eur(deliveryFee)}
                    {deliveryInfo?.duration && ` · ~${deliveryInfo.duration} min`}
                  </p>
                )}
              </div>

              <div>
                <label className="font-bold text-sm text-slate-700 block mb-2">Créneau de livraison *</label>
                {loadingDeliverySlots ? (
                  <p className="text-slate-500 text-center py-4">Chargement des créneaux…</p>
                ) : deliveryTimeSlots.length === 0 ? (
                  <p className="p-4 bg-red-50 rounded-xl text-red-700 font-semibold">Aucun créneau de livraison disponible</p>
                ) : (
                  <div className="space-y-3">
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
                            className={`h-11 px-4 rounded-[10px] whitespace-nowrap font-semibold ${
                              deliverySelectedDate === day.date
                                ? 'bg-[#3b5bff] text-white'
                                : hasAvailable
                                ? 'bg-[#eef0f5] text-slate-700'
                                : 'bg-[#eef0f5] text-slate-400'
                            }`}
                          >
                            {day.dayLabel}
                          </button>
                        )
                      })}
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {getDeliverySelectedDaySlots().map(slot => (
                        <button
                          key={slot.time}
                          onClick={() => slot.available && setDeliverySelectedTime(slot.time)}
                          disabled={!slot.available}
                          className={`h-12 rounded-[10px] text-sm font-semibold ${
                            deliverySelectedTime === slot.time
                              ? 'bg-[#3b5bff] text-white'
                              : slot.available
                              ? 'bg-[#eef0f5] text-slate-700 active:bg-slate-200'
                              : 'bg-slate-50 text-slate-300'
                          }`}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>

                    {deliverySelectedTime && (
                      <p className="px-3 py-2.5 bg-[#eef1ff] rounded-xl text-[#1e3a8a] text-sm font-semibold flex items-center gap-2">
                        <CalendarClock className="w-4 h-4" />
                        Livraison {deliveryTimeSlots.find(d => d.date === deliverySelectedDate)?.dayLabel} à {deliverySelectedTime}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#eef0f5] bg-[#fafbfd] flex gap-3 flex-shrink-0">
              <button
                onClick={cancelDeliveryOrder}
                className="flex-1 h-14 rounded-xl border border-[#e3e6ee] bg-white font-semibold text-lg text-slate-700"
              >
                Annuler
              </button>
              <button
                onClick={confirmDeliveryInfo}
                disabled={!deliveryCustomerName || !deliveryCustomerPhone || !deliveryValidated || !deliverySelectedTime}
                className="flex-1 h-14 rounded-xl bg-[#3b5bff] text-white font-extrabold text-lg disabled:bg-slate-300 active:bg-[#2a44d4]"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commandes en retard */}
      {showLateOrdersModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 lg:p-6">
          <div role="dialog" aria-label="Commandes en retard" className="bg-white rounded-[20px] w-full max-w-2xl overflow-hidden max-h-[94vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-[#eef0f5] flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-[22px] font-extrabold">Commandes en retard</h2>
                <p className="text-sm text-slate-600">{lateOrders.length} commande{lateOrders.length > 1 ? 's' : ''} depuis plus de 30 min</p>
              </div>
              <button onClick={() => setShowLateOrdersModal(false)} aria-label="Fermer" className="w-11 h-11 rounded-[10px] border border-[#e3e6ee] flex items-center justify-center text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {lateOrders.length === 0 ? (
                <p className="text-center py-12 text-slate-500 text-lg">Aucune commande en retard</p>
              ) : (
                <div className="space-y-3">
                  {lateOrders.map(order => (
                    <div key={order.id} className="rounded-xl border border-[#e3e6ee] p-4">
                      <div className="flex items-start justify-between mb-3 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xl font-extrabold">#{order.order_number}</span>
                            <span className="text-sm font-semibold text-slate-600">{getOrderTypeLabel(order.order_type)}</span>
                            <span className={`text-xs px-2 py-1 rounded-md font-bold ${
                              order.status === 'ready' ? 'bg-emerald-50 text-emerald-800' :
                              order.status === 'preparing' ? 'bg-[#eef1ff] text-[#1e3a8a]' :
                              'bg-amber-50 text-amber-800'
                            }`}>
                              {getStatusLabel(order.status)}
                            </span>
                          </div>
                          <p className="text-slate-700">
                            {order.customer_name || 'Client'} · {eur(order.total || 0)}
                          </p>
                          {order.delivery_notes && (
                            <p className="text-slate-500 text-sm truncate max-w-[320px]">{order.delivery_notes}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-orange-700 font-extrabold text-xl">+{order.minutes_late} min</p>
                          <p className="text-slate-500 text-sm">Prévu {formatTime(order.scheduled_time || order.created_at)}</p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => markOrderCompleted(order.id)}
                          className="flex-1 h-12 rounded-[10px] bg-[#3b5bff] text-white font-bold active:bg-[#2a44d4]"
                        >
                          Terminée
                        </button>
                        <button
                          onClick={() => postponeOrder(order.id, 30)}
                          className="flex-1 h-12 rounded-[10px] border border-[#e3e6ee] font-bold text-slate-700"
                        >
                          +30 min
                        </button>
                        <button
                          onClick={() => cancelOrder(order.id)}
                          className="flex-1 h-12 rounded-[10px] border border-[#e3e6ee] font-bold text-red-700"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#eef0f5] bg-[#fafbfd] flex-shrink-0">
              <button
                onClick={() => device && loadLateOrders(device.establishmentId)}
                className="w-full h-12 rounded-xl border border-[#e3e6ee] bg-white text-slate-700 font-semibold flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Rafraîchir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Allergènes */}
      {allergenModalProduct && (
        <div
          className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[60] p-4"
          onClick={() => setAllergenModalProduct(null)}
        >
          <div
            role="dialog"
            aria-label={`Allergènes de ${allergenModalProduct.name}`}
            className="bg-white rounded-[20px] w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#eef0f5] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-extrabold text-lg truncate">{allergenModalProduct.name}</h2>
                <p className="text-sm text-slate-600">Allergènes</p>
              </div>
              <button
                onClick={() => setAllergenModalProduct(null)}
                aria-label="Fermer"
                className="w-11 h-11 rounded-[10px] border border-[#e3e6ee] flex items-center justify-center text-slate-600 flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              {(() => {
                const allergens = getProductAllergens(allergenModalProduct)
                const contains = allergens.filter(a => !a.is_trace)
                const traces = allergens.filter(a => a.is_trace)

                if (allergens.length === 0) {
                  return <p className="text-center py-8 text-slate-600 font-semibold">Aucun allergène déclaré</p>
                }

                return (
                  <div className="space-y-4">
                    {contains.length > 0 && (
                      <div>
                        <h3 className="font-extrabold text-red-800 mb-2">Contient</h3>
                        <div className="grid grid-cols-2 gap-2">
                          {contains.map(a => (
                            <div key={a.name} className="flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2.5">
                              <span className="text-xl" aria-hidden="true">{a.emoji}</span>
                              <span className="font-semibold text-red-900 text-sm">{a.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {traces.length > 0 && (
                      <div>
                        <h3 className="font-extrabold text-amber-800 mb-2">Peut contenir des traces de</h3>
                        <div className="grid grid-cols-2 gap-2">
                          {traces.map(a => (
                            <div key={a.name} className="flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2.5">
                              <span className="text-xl" aria-hidden="true">{a.emoji}</span>
                              <span className="font-semibold text-amber-900 text-sm">{a.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
                      Informations fournies à titre indicatif. En cas d&apos;allergie sévère, demandez au personnel.
                    </p>
                  </div>
                )
              })()}
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
