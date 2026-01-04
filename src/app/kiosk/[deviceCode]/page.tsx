'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Types
type OptionGroupItem = {
  id: string
  product_id: string
  price_override: number | null
  is_default: boolean
  triggers_option_group_id: string | null
  product: { id: string; name: string; price: number; image_url: string | null }
}

type OptionGroup = {
  id: string
  name: string
  selection_type: 'single' | 'multi'
  min_selections: number
  max_selections: number | null
  option_group_items: OptionGroupItem[]
}

type ProductOptionGroup = { option_group_id: string; display_order: number; option_group: OptionGroup }
type CategoryOptionGroup = { option_group_id: string; display_order: number; option_group: OptionGroup }

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

type Category = { id: string; name: string; image_url: string | null; category_option_groups: CategoryOptionGroup[] }
type SelectedOption = { option_group_id: string; option_group_name: string; item_id: string; item_name: string; price: number }
type CartItem = { id: string; product_id: string; name: string; price: number; quantity: number; options: SelectedOption[]; options_total: number }
type OrderType = 'eat_in' | 'takeaway'
type DeviceInfo = { id: string; code: string; name: string; type: string; vivaTerminalId: string | null; establishmentId: string }

const categoryIcons: Record<string, string> = {
  'frite': '🍟', 'frites': '🍟', 'smashburger': '🍔', 'smashburgers': '🍔', 'burger': '🍔', 'hamburger': '🍔',
  'mitraillette': '🌯', 'pain': '🥖', 'pains': '🥖', 'snack': '🍗', 'snacks': '🍗', 'pitta': '🥙',
  'sauce': '🥫', 'sauces': '🥫', 'bière': '🍺', 'bières': '🍺', 'boisson': '🥤', 'boissons': '🥤',
}

function getCategoryIcon(name: string): string {
  const n = name.toLowerCase()
  for (const [k, v] of Object.entries(categoryIcons)) if (n.includes(k)) return v
  return '🍽️'
}

export default function KioskDevicePage() {
  const params = useParams()
  const deviceCode = (params.deviceCode as string)?.toUpperCase()
  
  const [authStatus, setAuthStatus] = useState<'checking' | 'needPin' | 'authenticated' | 'error'>('checking')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [allOptionGroups, setAllOptionGroups] = useState<OptionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [currentPropositions, setCurrentPropositions] = useState<OptionGroup[]>([])
  const [currentPropositionIndex, setCurrentPropositionIndex] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderType, setOrderType] = useState<OrderType | null>(null)
  const [showCart, setShowCart] = useState(false)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(10)
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle')
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null)
  const [allergenModalProduct, setAllergenModalProduct] = useState<Product | null>(null)

  const supabase = createClient()

  useEffect(() => { checkAuth() }, [deviceCode])

  async function checkAuth() {
    if (!deviceCode) { setAuthStatus('error'); return }
    try {
      const res = await fetch(`/api/device-auth?deviceCode=${deviceCode}`)
      const data = await res.json()
      if (data.authenticated && data.device) { setDevice(data.device); setAuthStatus('authenticated'); loadData(data.device.establishmentId) }
      else setAuthStatus('needPin')
    } catch { setAuthStatus('needPin') }
  }

  async function submitPin() {
    if (pinInput.length < 4) { setPinError('PIN: minimum 4 chiffres'); return }
    setPinError('')
    try {
      const res = await fetch('/api/device-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceCode, pin: pinInput }) })
      const data = await res.json()
      if (data.success && data.device) { setDevice(data.device); setAuthStatus('authenticated'); loadData(data.device.establishmentId) }
      else setPinError(data.error || 'PIN incorrect')
    } catch { setPinError('Erreur de connexion') }
  }

  useEffect(() => {
    if (orderNumber) {
      setCountdown(10)
      const timer = setInterval(() => setCountdown(p => { if (p <= 1) { clearInterval(timer); setOrderNumber(null); setOrderType(null); setIsSubmitting(false); return 10 } return p - 1 }), 1000)
      return () => clearInterval(timer)
    }
  }, [orderNumber])

  async function loadData(estId: string) {
    const { data: cats } = await supabase.from('categories').select(`id, name, image_url, category_option_groups (option_group_id, display_order, option_group:option_groups (id, name, selection_type, min_selections, max_selections, option_group_items!option_group_items_option_group_id_fkey (id, product_id, price_override, is_default, triggers_option_group_id, product:products (id, name, price, image_url))))`).eq('establishment_id', estId).eq('is_active', true).eq('visible_on_kiosk', true).order('display_order')
    const { data: prods } = await supabase.from('products').select(`id, name, description, price, image_url, category_id, is_available, product_option_groups (option_group_id, display_order, option_group:option_groups (id, name, selection_type, min_selections, max_selections, option_group_items!option_group_items_option_group_id_fkey (id, product_id, price_override, is_default, triggers_option_group_id, product:products (id, name, price, image_url)))), product_ingredients (ingredient:ingredients (ingredient_allergens (is_trace, allergen:allergens (code, name_fr, emoji))))`).eq('establishment_id', estId).eq('is_active', true).eq('is_available', true).order('display_order')
    const { data: opts } = await supabase.from('option_groups').select(`id, name, selection_type, min_selections, max_selections, option_group_items!option_group_items_option_group_id_fkey (id, product_id, price_override, is_default, triggers_option_group_id, product:products (id, name, price, image_url))`).eq('establishment_id', estId).eq('is_active', true)
    setCategories((cats || []) as any); setProducts((prods || []) as any); setAllOptionGroups((opts || []) as any)
    if (cats?.length) setSelectedCategory(cats[0].id)
    setLoading(false)
  }

  function openProductModal(product: Product) {
    let props: OptionGroup[] = []
    if (product.product_option_groups?.length) props = product.product_option_groups.sort((a, b) => a.display_order - b.display_order).map(p => p.option_group).filter(o => o?.option_group_items?.length)
    else { const cat = categories.find(c => c.id === product.category_id); if (cat?.category_option_groups) props = cat.category_option_groups.sort((a, b) => a.display_order - b.display_order).map(c => c.option_group).filter(o => o?.option_group_items?.length) }
    setSelectedProduct(product); setCurrentPropositions(props); setCurrentPropositionIndex(0)
    const defs: SelectedOption[] = []; props.forEach(og => og.option_group_items.forEach(i => { if (i.is_default) defs.push({ option_group_id: og.id, option_group_name: og.name, item_id: i.id, item_name: i.product.name, price: i.price_override ?? i.product.price }) }))
    setSelectedOptions(defs)
  }

  function closeProductModal() { setSelectedProduct(null); setCurrentPropositions([]); setCurrentPropositionIndex(0); setSelectedOptions([]) }

  function selectOption(og: OptionGroup, item: OptionGroupItem) {
    const price = item.price_override ?? item.product.price
    const opt: SelectedOption = { option_group_id: og.id, option_group_name: og.name, item_id: item.id, item_name: item.product.name, price }
    if (og.selection_type === 'single') setSelectedOptions([...selectedOptions.filter(o => o.option_group_id !== og.id), opt])
    else { const ex = selectedOptions.find(o => o.item_id === item.id); if (ex) setSelectedOptions(selectedOptions.filter(o => o.item_id !== item.id)); else { const cnt = selectedOptions.filter(o => o.option_group_id === og.id).length; if (!og.max_selections || cnt < og.max_selections) setSelectedOptions([...selectedOptions, opt]) } }
  }

  const isOptionSelected = (id: string) => selectedOptions.some(o => o.item_id === id)
  const canProceed = () => { if (!currentPropositions.length) return true; const g = currentPropositions[currentPropositionIndex]; return !g || selectedOptions.filter(o => o.option_group_id === g.id).length >= g.min_selections }

  function nextProposition() {
    const g = currentPropositions[currentPropositionIndex]
    if (g) {
      const sel = selectedOptions.filter(o => o.option_group_id === g.id)
      const trigIds = sel.map(s => g.option_group_items.find(i => i.id === s.item_id)?.triggers_option_group_id).filter(Boolean) as string[]
      if (trigIds.length) {
        const trig = trigIds.map(id => allOptionGroups.find(o => o.id === id)).filter((o): o is OptionGroup => !!o && o.option_group_items.length > 0)
        const existing = new Set(currentPropositions.map(p => p.id))
        const newG = trig.filter(o => !existing.has(o.id))
        if (newG.length) { setCurrentPropositions([...currentPropositions.slice(0, currentPropositionIndex + 1), ...newG, ...currentPropositions.slice(currentPropositionIndex + 1)]); setCurrentPropositionIndex(currentPropositionIndex + 1); return }
      }
    }
    if (currentPropositionIndex < currentPropositions.length - 1) setCurrentPropositionIndex(currentPropositionIndex + 1); else addToCart()
  }

  const prevProposition = () => { if (currentPropositionIndex > 0) setCurrentPropositionIndex(currentPropositionIndex - 1) }

  function addToCart() {
    if (!selectedProduct) return
    setCart([...cart, { id: `${selectedProduct.id}-${Date.now()}`, product_id: selectedProduct.id, name: selectedProduct.name, price: selectedProduct.price, quantity: 1, options: [...selectedOptions], options_total: selectedOptions.reduce((s, o) => s + o.price, 0) }])
    closeProductModal()
  }

  const removeFromCart = (id: string) => setCart(cart.filter(i => i.id !== id))
  const updateQuantity = (id: string, d: number) => setCart(cart.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + d) } : i))
  const getCartItemCount = () => cart.reduce((s, i) => s + i.quantity, 0)
  const getCartSubtotal = () => cart.reduce((s, i) => s + (i.price + i.options_total) * i.quantity, 0)
  const getCartTotal = () => orderType === 'eat_in' ? getCartSubtotal() * 1.06 : getCartSubtotal()
  const getVatRate = () => orderType === 'eat_in' ? 12 : 6

  async function initiateVivaPayment(orderId: string, amount: number) {
    if (!device?.vivaTerminalId) { alert('Terminal non configuré'); setPaymentStatus('failed'); return }
    try {
      const res = await fetch('/api/viva/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, orderId, terminalId: device.vivaTerminalId }) })
      const data = await res.json()
      if (data.success) { setPaymentSessionId(data.sessionId); setPaymentStatus('pending'); pollPaymentStatus(data.sessionId, orderId) } else throw new Error()
    } catch { setPaymentStatus('failed') }
  }

  async function pollPaymentStatus(sessionId: string, orderId: string) {
    let attempts = 0
    const poll = async () => {
      try {
        const res = await fetch(`/api/viva/payment?sessionId=${sessionId}`)
        const data = await res.json()
        if (data.status === 'success') { setPaymentStatus('success'); await finalizeOrder(orderId); return }
        if (data.status === 'failed') { setPaymentStatus('failed'); return }
        if (++attempts < 60) setTimeout(poll, 2000); else setPaymentStatus('failed')
      } catch { if (++attempts < 60) setTimeout(poll, 2000) }
    }
    poll()
  }

  async function finalizeOrder(orderId: string) {
    await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', orderId)
    const { data } = await supabase.from('orders').select('order_number').eq('id', orderId).single()
    setOrderNumber(data?.order_number || orderId); setCart([]); setPaymentStatus('idle'); setPaymentSessionId(null)
  }

  async function submitOrder() {
    if (!orderType || !cart.length || !device) return
    setIsSubmitting(true)
    try {
      const vat = getVatRate(), total = getCartTotal(), tax = total * vat / (100 + vat), sub = total - tax
      const { data: order, error } = await supabase.from('orders').insert({ establishment_id: device.establishmentId, order_type: orderType, status: 'pending', subtotal: sub, tax_amount: tax, total_amount: total, source: 'kiosk', payment_method: 'card', payment_status: 'pending', device_id: device.id }).select().single()
      if (error) throw error
      const items = cart.map(i => ({ order_id: order.id, product_id: i.product_id, product_name: i.name, quantity: i.quantity, unit_price: i.price, vat_rate: vat, options_selected: i.options.length ? JSON.stringify(i.options) : null, options_total: i.options_total, line_total: (i.price + i.options_total) * i.quantity }))
      await supabase.from('order_items').insert(items)
      await initiateVivaPayment(order.id, total)
    } catch { alert('Erreur'); setIsSubmitting(false) }
  }

  function getProductAllergens(product: Product) {
    const map = new Map<string, { emoji: string; name: string; is_trace: boolean }>()
    product.product_ingredients?.forEach((pi: any) => pi.ingredient?.ingredient_allergens?.forEach((ia: any) => {
      const ex = map.get(ia.allergen.code)
      if (!ex || (ex.is_trace && !ia.is_trace)) map.set(ia.allergen.code, { emoji: ia.allergen.emoji, name: ia.allergen.name_fr, is_trace: ia.is_trace })
    }))
    return Array.from(map.values())
  }

  // ========== RENDER ==========

  if (authStatus === 'checking') return (
    <div className="min-h-screen bg-[#FFF9E6] flex items-center justify-center">
      <div className="text-center">
        <div className="w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-6"><img src="/Logo_Mdjambo.svg" alt="MDjambo" className="w-full h-full" /></div>
        <div className="flex gap-2 justify-center">
          <div className="w-3 h-3 bg-[#E63329] rounded-full animate-bounce"></div>
          <div className="w-3 h-3 bg-[#E63329] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-3 h-3 bg-[#E63329] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  )

  if (authStatus === 'error') return (
    <div className="min-h-screen bg-[#E63329] flex items-center justify-center p-4">
      <div className="text-center text-white">
        <span className="text-6xl sm:text-8xl block mb-6">❌</span>
        <h1 className="text-2xl sm:text-4xl font-bold mb-4">Erreur</h1>
        <p className="text-lg">Code device invalide</p>
      </div>
    </div>
  )

  if (authStatus === 'needPin') return (
    <div className="min-h-screen bg-[#FFF9E6] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border-4 border-[#F7B52C]">
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto mb-4"><img src="/Logo_Mdjambo.svg" alt="" className="w-full h-full" /></div>
          <h1 className="text-xl font-bold text-[#3D2314]">Authentification</h1>
          <p className="text-[#3D2314]/60 text-sm">Borne {deviceCode}</p>
        </div>
        {pinError && <div className="bg-red-50 border-2 border-[#E63329] text-[#E63329] px-4 py-2 rounded-xl mb-4 text-center text-sm">{pinError}</div>}
        <input type="password" inputMode="numeric" maxLength={8} value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && submitPin()} className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.3em] rounded-xl border-2 border-[#F7B52C] focus:border-[#E63329] outline-none bg-[#FFF9E6] mb-4" placeholder="••••••" autoFocus />
        <button onClick={submitPin} disabled={pinInput.length < 4} className="w-full bg-[#E63329] text-white font-bold py-3 rounded-xl disabled:opacity-50">✓ Valider</button>
      </div>
    </div>
  )

  if (paymentStatus === 'pending') return (
    <div className="min-h-screen bg-[#1E88E5] flex items-center justify-center p-4">
      <div className="text-center text-white">
        <span className="text-6xl sm:text-8xl block animate-bounce mb-6">💳</span>
        <h1 className="text-2xl sm:text-4xl font-bold mb-4">Paiement en cours...</h1>
        <div className="bg-white/20 rounded-2xl p-6 inline-block mb-6">
          <p className="text-lg mb-1">Montant</p>
          <p className="text-4xl sm:text-5xl font-bold">{getCartTotal().toFixed(2)} €</p>
        </div>
        <button onClick={() => { setPaymentStatus('idle'); setIsSubmitting(false) }} className="bg-white/20 px-6 py-2 rounded-xl">Annuler</button>
      </div>
    </div>
  )

  if (paymentStatus === 'failed') return (
    <div className="min-h-screen bg-[#E63329] flex items-center justify-center p-4">
      <div className="text-center text-white">
        <span className="text-6xl sm:text-8xl block mb-6">❌</span>
        <h1 className="text-2xl sm:text-4xl font-bold mb-4">Paiement refusé</h1>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={() => { setPaymentStatus('idle'); setIsSubmitting(false) }} className="bg-white text-[#E63329] font-bold px-6 py-3 rounded-xl">Réessayer</button>
          <button onClick={() => { setPaymentStatus('idle'); setCart([]); setOrderType(null); setIsSubmitting(false) }} className="bg-white/20 px-6 py-3 rounded-xl">Annuler</button>
        </div>
      </div>
    </div>
  )

  if (!orderType && !orderNumber) return (
    <div className="min-h-screen bg-[#FFF9E6] flex items-center justify-center p-4">
      <div className="text-center w-full max-w-2xl">
        <div className="w-28 h-28 sm:w-40 sm:h-40 mx-auto mb-4"><img src="/Logo_Mdjambo.svg" alt="" className="w-full h-full" /></div>
        <h1 className="text-3xl sm:text-5xl font-black text-[#3D2314] mb-1">MDjambo</h1>
        <p className="text-lg sm:text-2xl text-[#3D2314]/70 mb-8">Touchez pour commander</p>
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          <button onClick={() => setOrderType('eat_in')} className="bg-white rounded-2xl p-6 sm:p-8 shadow-xl hover:scale-[1.02] transition-transform">
            <span className="text-5xl sm:text-7xl block mb-2">🍽️</span>
            <span className="text-xl sm:text-2xl font-bold text-[#3D2314] block">Sur place</span>
            <span className="text-[#E63329] text-sm">TVA 12%</span>
          </button>
          <button onClick={() => setOrderType('takeaway')} className="bg-white rounded-2xl p-6 sm:p-8 shadow-xl hover:scale-[1.02] transition-transform">
            <span className="text-5xl sm:text-7xl block mb-2">🥡</span>
            <span className="text-xl sm:text-2xl font-bold text-[#3D2314] block">À emporter</span>
            <span className="text-[#4CAF50] text-sm">TVA 6%</span>
          </button>
        </div>
      </div>
    </div>
  )

  if (orderNumber) return (
    <div className="min-h-screen bg-[#4CAF50] flex items-center justify-center p-4">
      <div className="text-center text-white">
        <span className="text-6xl sm:text-8xl block mb-6">✅</span>
        <h1 className="text-2xl sm:text-4xl font-bold mb-2">Merci !</h1>
        <div className="bg-white text-[#3D2314] rounded-2xl p-6 inline-block my-6 shadow-xl">
          <p className="text-base mb-1">Commande N°</p>
          <p className="text-5xl sm:text-6xl font-black text-[#E63329]">{orderNumber}</p>
        </div>
        <div className="mb-6">
          <div className="w-48 mx-auto bg-white/30 rounded-full h-2 mb-2"><div className="bg-white h-2 rounded-full transition-all" style={{ width: `${countdown * 10}%` }} /></div>
          <p className="text-sm opacity-80">Retour dans {countdown}s</p>
        </div>
        <button onClick={() => { setOrderNumber(null); setOrderType(null) }} className="bg-white text-[#4CAF50] font-bold px-8 py-3 rounded-xl">Nouvelle commande</button>
      </div>
    </div>
  )

  // ========== MAIN INTERFACE ==========
  const filteredProducts = products.filter(p => p.category_id === selectedCategory)
  const currentGroup = currentPropositions[currentPropositionIndex]

  return (
    <div className="min-h-screen bg-[#FFF9E6] flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-md px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4">
          <button onClick={() => { setOrderType(null); setCart([]) }} className="text-[#3D2314]/50 hover:text-[#3D2314]">←</button>
          <div className="w-8 h-8 sm:w-10 sm:h-10"><img src="/Logo_Mdjambo.svg" alt="" className="w-full h-full" /></div>
          <span className="text-lg sm:text-xl font-black text-[#E63329]">MDjambo</span>
        </div>
        <div className="flex gap-1 bg-[#FFF9E6] rounded-full p-1">
          <button onClick={() => setOrderType('eat_in')} className={`flex items-center gap-1 px-2 sm:px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${orderType === 'eat_in' ? 'bg-[#E63329] text-white' : 'text-[#3D2314]/60'}`}>
            <span>🍽️</span><span className="hidden sm:inline">Sur place</span>
          </button>
          <button onClick={() => setOrderType('takeaway')} className={`flex items-center gap-1 px-2 sm:px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${orderType === 'takeaway' ? 'bg-[#E63329] text-white' : 'text-[#3D2314]/60'}`}>
            <span>🥡</span><span className="hidden sm:inline">À emporter</span>
          </button>
        </div>
      </header>

      {/* Categories */}
      <nav className="bg-white border-b-2 border-[#F7B52C]/30 px-2 sm:px-4 py-2">
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide">
          {categories.map(c => (
            <button key={c.id} onClick={() => setSelectedCategory(c.id)} className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-full font-bold whitespace-nowrap text-sm sm:text-base transition-all ${selectedCategory === c.id ? 'bg-[#E63329] text-white shadow-lg' : 'bg-[#FFF9E6] text-[#3D2314]'}`}>
              <span>{getCategoryIcon(c.name)}</span><span>{c.name}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Products */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64"><div className="w-12 h-12 mx-auto"><img src="/Logo_Mdjambo.svg" alt="" className="w-full h-full animate-pulse" /></div></div>
        ) : (
          <div className="product-grid">
            {filteredProducts.map(p => {
              const allergens = getProductAllergens(p)
              return (
                <button key={p.id} onClick={() => openProductModal(p)} className="bg-white rounded-xl sm:rounded-2xl shadow-md overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all text-left">
                  <div className="aspect-square bg-[#FFF9E6] flex items-center justify-center overflow-hidden">
                    {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-4xl sm:text-5xl">🍔</span>}
                  </div>
                  <div className="p-2 sm:p-3">
                    <h3 className="font-bold text-[#3D2314] text-sm sm:text-base line-clamp-1">{p.name}</h3>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-lg sm:text-xl font-black text-[#E63329]">{p.price.toFixed(2)} €</span>
                      {allergens.length > 0 && (
                        <div onClick={e => { e.stopPropagation(); setAllergenModalProduct(p) }} className="flex gap-0.5">
                          {allergens.slice(0, 2).map(a => <span key={a.name} className={`text-xs ${a.is_trace ? 'opacity-50' : ''}`}>{a.emoji}</span>)}
                          {allergens.length > 2 && <span className="text-xs text-[#3D2314]/50">+{allergens.length - 2}</span>}
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

      {/* Cart bar */}
      {cart.length > 0 && (
        <div onClick={() => setShowCart(true)} className="bg-[#E63329] text-white px-3 sm:px-4 py-3 flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2">
            <div className="bg-white/20 rounded-full px-2.5 py-1 flex items-center gap-1.5"><span>🛒</span><span className="font-bold">{getCartItemCount()}</span></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xl sm:text-2xl font-black">{getCartTotal().toFixed(2)} €</span>
            <div className="bg-white text-[#E63329] font-bold px-3 sm:px-4 py-2 rounded-lg text-sm">Commander →</div>
          </div>
        </div>
      )}

      {/* Cart panel */}
      {showCart && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowCart(false)}>
          <div className="bg-white w-full max-h-[85vh] rounded-t-2xl overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="bg-[#FFF9E6] px-4 py-4 flex items-center justify-between border-b">
              <h2 className="text-xl font-bold text-[#3D2314]">🛒 Votre commande</h2>
              <button onClick={() => setShowCart(false)} className="w-8 h-8 rounded-full bg-[#3D2314]/10 flex items-center justify-center">✕</button>
            </div>
            <div className="overflow-y-auto max-h-[40vh] p-4">
              {cart.map(item => (
                <div key={item.id} className="flex items-start gap-3 py-3 border-b border-[#F7B52C]/20 last:border-0">
                  <div className="flex-1">
                    <h3 className="font-bold text-[#3D2314]">{item.name}</h3>
                    {item.options.length > 0 && <div className="text-xs text-[#3D2314]/60 mt-1">{item.options.map(o => <span key={o.item_id} className="block">+ {o.item_name}</span>)}</div>}
                    <p className="text-[#E63329] font-bold mt-1">{((item.price + item.options_total) * item.quantity).toFixed(2)} €</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-[#FFF9E6] rounded-full">
                      <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 flex items-center justify-center text-[#E63329] font-bold">−</button>
                      <span className="w-6 text-center font-bold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 flex items-center justify-center text-[#E63329] font-bold">+</button>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} className="text-[#E63329]">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t p-4 bg-[#FFF9E6]">
              <div className="flex justify-between mb-2"><span className="text-[#3D2314]/70">Sous-total</span><span className="font-semibold">{getCartSubtotal().toFixed(2)} €</span></div>
              {orderType === 'eat_in' && <div className="flex justify-between mb-2"><span className="text-[#3D2314]/70">TVA 12%</span><span>+{(getCartSubtotal() * 0.06).toFixed(2)} €</span></div>}
              <div className="flex justify-between mb-4"><span className="text-lg font-bold">TOTAL</span><span className="text-2xl font-black text-[#E63329]">{getCartTotal().toFixed(2)} €</span></div>
              <button onClick={() => { setShowCart(false); submitOrder() }} disabled={isSubmitting} className="w-full bg-[#E63329] text-white font-bold py-4 rounded-xl disabled:opacity-50">💳 PAYER {getCartTotal().toFixed(2)} €</button>
              <button onClick={() => { if (confirm('Annuler ?')) { setCart([]); setShowCart(false) } }} className="w-full mt-2 text-[#3D2314]/50 py-2 text-sm">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Product modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2" onClick={closeProductModal}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="relative">
              <div className="aspect-video bg-[#FFF9E6] flex items-center justify-center">{selectedProduct.image_url ? <img src={selectedProduct.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-6xl">🍔</span>}</div>
              <button onClick={closeProductModal} className="absolute top-3 right-3 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow">✕</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[40vh]">
              {currentPropositions.length === 0 ? (
                <div>
                  <h2 className="text-xl font-bold text-[#3D2314] mb-1">{selectedProduct.name}</h2>
                  {selectedProduct.description && <p className="text-[#3D2314]/60 text-sm mb-3">{selectedProduct.description}</p>}
                  <p className="text-2xl font-black text-[#E63329] mb-4">{selectedProduct.price.toFixed(2)} €</p>
                  <button onClick={addToCart} className="w-full bg-[#E63329] text-white font-bold py-3 rounded-xl">Ajouter au panier</button>
                </div>
              ) : currentGroup && (
                <div>
                  <div className="flex gap-1 mb-3">{currentPropositions.map((_, i) => <div key={i} className={`h-1 flex-1 rounded-full ${i <= currentPropositionIndex ? 'bg-[#E63329]' : 'bg-[#F7B52C]/30'}`} />)}</div>
                  <h3 className="text-lg font-bold text-[#3D2314] mb-1">{currentGroup.name}</h3>
                  <p className="text-[#3D2314]/60 text-sm mb-3">{currentGroup.selection_type === 'single' ? 'Choisissez une option' : 'Choisissez vos options'}{currentGroup.min_selections > 0 && <span className="text-[#E63329] ml-1">(obligatoire)</span>}</p>
                  <div className="space-y-2">
                    {currentGroup.option_group_items.map(item => {
                      const price = item.price_override ?? item.product.price
                      const sel = isOptionSelected(item.id)
                      return (
                        <button key={item.id} onClick={() => selectOption(currentGroup, item)} className={`w-full p-3 rounded-xl border-2 flex items-center gap-3 transition-all ${sel ? 'border-[#E63329] bg-red-50' : 'border-[#F7B52C]/30'}`}>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${sel ? 'border-[#E63329] bg-[#E63329]' : 'border-[#3D2314]/30'}`}>{sel && <span className="text-white text-xs">✓</span>}</div>
                          <div className="w-10 h-10 bg-[#FFF9E6] rounded-lg flex items-center justify-center overflow-hidden">{item.product.image_url ? <img src={item.product.image_url} alt="" className="w-full h-full object-cover" /> : '🍽️'}</div>
                          <span className="flex-1 text-left font-semibold text-[#3D2314] text-sm">{item.product.name}</span>
                          <span className={`font-bold ${price === 0 ? 'text-[#4CAF50]' : 'text-[#E63329]'}`}>{price === 0 ? 'Inclus' : `+${price.toFixed(2)} €`}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            {currentPropositions.length > 0 && (
              <div className="p-4 border-t bg-[#FFF9E6] flex items-center justify-between">
                <button onClick={currentPropositionIndex === 0 ? closeProductModal : prevProposition} className="px-4 py-2 rounded-xl border-2 border-[#3D2314]/20 font-semibold text-sm">{currentPropositionIndex === 0 ? 'Annuler' : '← Retour'}</button>
                <div className="text-center"><p className="text-xs text-[#3D2314]/50">Total</p><p className="text-xl font-black text-[#E63329]">{(selectedProduct.price + selectedOptions.reduce((s, o) => s + o.price, 0)).toFixed(2)} €</p></div>
                <button onClick={nextProposition} disabled={!canProceed()} className="px-4 py-2 rounded-xl bg-[#E63329] text-white font-semibold disabled:opacity-50 text-sm">{currentPropositionIndex === currentPropositions.length - 1 ? 'Ajouter →' : 'Suivant →'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Allergen modal */}
      {allergenModalProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2" onClick={() => setAllergenModalProduct(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-[#F7B52C] text-white flex items-center justify-between">
              <h2 className="font-bold text-lg">{allergenModalProduct.name}</h2>
              <button onClick={() => setAllergenModalProduct(null)} className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">✕</button>
            </div>
            <div className="p-4">
              {(() => {
                const a = getProductAllergens(allergenModalProduct), c = a.filter(x => !x.is_trace), t = a.filter(x => x.is_trace)
                if (!a.length) return <p className="text-center py-4 text-[#4CAF50] font-bold">✅ Aucun allergène</p>
                return (
                  <div className="space-y-4">
                    {c.length > 0 && <div><h3 className="font-bold text-[#E63329] mb-2">Contient</h3><div className="grid grid-cols-2 gap-2">{c.map(x => <div key={x.name} className="bg-red-50 rounded-xl p-3 flex items-center gap-2"><span className="text-2xl">{x.emoji}</span><span className="font-bold text-[#E63329] text-sm">{x.name}</span></div>)}</div></div>}
                    {t.length > 0 && <div><h3 className="font-bold text-[#F7B52C] mb-2">Traces possibles</h3><div className="grid grid-cols-2 gap-2">{t.map(x => <div key={x.name} className="bg-yellow-50 rounded-xl p-3 flex items-center gap-2"><span className="text-2xl">{x.emoji}</span><span className="font-bold text-[#F7B52C] text-sm">{x.name}</span></div>)}</div></div>}
                  </div>
                )
              })()}
            </div>
            <div className="p-4 border-t"><button onClick={() => setAllergenModalProduct(null)} className="w-full bg-[#E63329] text-white font-bold py-3 rounded-xl">Fermer</button></div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
        @media (min-width: 640px) { .product-grid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; } }
        @media (min-width: 1024px) { .product-grid { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); } }
      `}</style>
    </div>
  )
}