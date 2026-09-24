'use client'

// Caisse smartphone (24/09/2026, soirées Brasserie du Borinage).
// C'est la caisse (/counter) en une colonne pour un écran de téléphone :
//   • même authentification (session + appareil de type « counter »), mêmes données ;
//   • mêmes commandes (source 'counter', à emporter, TVA par produit) → même écran cuisine ;
//   • options avec « propositions » en étapes, y compris les options déclenchées
//     (ex. Frites +1,50 € → choix de la sauce), comme la borne ;
//   • paiement espèces (rendu calculé), carte (envoyée au terminal Viva si l'appareil en a un),
//     offert (avec motif).
// Pas de livraison ni de factures : pour ça, la caisse tablette.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { estDansSaPlage } from '@/lib/product-availability'

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
type LinkedGroup = { option_group_id: string; display_order: number; option_group: OptionGroup }
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
  product_option_groups: LinkedGroup[]
}
type Category = { id: string; name: string; category_option_groups: LinkedGroup[] }
type SelectedOption = { option_group_id: string; option_group_name: string; item_id: string; item_name: string; price: number }
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
type DeviceInfo = { id: string; code: string; name: string; type: string; vivaTerminalId: string | null; establishmentId: string }
type PaymentMethod = 'cash' | 'card' | 'offered'

const eur = (n: number) => `${(n || 0).toFixed(2).replace('.', ',')} €`
const GROUP_SELECT = `
  id, name, selection_type, min_selections, max_selections,
  option_group_items!option_group_items_option_group_id_fkey (
    id, product_id, price_override, is_default, triggers_option_group_id,
    product:products (id, name, price, image_url)
  )`

export default function CaisseMobilePage() {
  const router = useRouter()
  const supabase = createClient()

  const [authStatus, setAuthStatus] = useState<'checking' | 'unauthorized' | 'authenticated'>('checking')
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [allOptionGroups, setAllOptionGroups] = useState<OptionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [minute, setMinute] = useState(() => new Date())

  // Options
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [propositions, setPropositions] = useState<OptionGroup[]>([])
  const [propIndex, setPropIndex] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([])

  // Panier / paiement
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState(0)
  const [offeredReason, setOfferedReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [terminalWaiting, setTerminalWaiting] = useState<number | null>(null)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
    const t = setInterval(() => setMinute(new Date()), 30_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function checkAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return setAuthStatus('unauthorized')
      const data = await (await fetch('/api/device-auth')).json()
      if (!data.device || data.device.type !== 'counter') return setAuthStatus('unauthorized')
      setDevice(data.device)
      setAuthStatus('authenticated')
      loadData(data.device.establishmentId)
    } catch {
      setAuthStatus('unauthorized')
    }
  }

  async function loadData(establishmentId: string) {
    const [{ data: cats }, { data: prods }, { data: groups }] = await Promise.all([
      supabase.from('categories')
        .select(`id, name, category_option_groups (option_group_id, display_order, option_group:option_groups (${GROUP_SELECT}))`)
        .eq('establishment_id', establishmentId).eq('is_active', true).order('display_order'),
      supabase.from('products')
        .select(`id, name, description, price, image_url, category_id, is_available, availability_schedule, vat_eat_in, vat_takeaway,
          product_option_groups (option_group_id, display_order, option_group:option_groups (${GROUP_SELECT}))`)
        .eq('establishment_id', establishmentId).eq('is_active', true).eq('is_available', true).order('display_order'),
      supabase.from('option_groups').select(GROUP_SELECT).eq('establishment_id', establishmentId).eq('is_active', true),
    ])
    setCategories((cats || []) as any)
    setProducts((prods || []) as any)
    setAllOptionGroups((groups || []) as any)
    if (cats && cats.length > 0) setSelectedCategory(cats[0].id)
    setLoading(false)
  }

  // ==================== OPTIONS ====================

  const prix = (item: OptionGroupItem) => (item.price_override !== null ? item.price_override : item.product.price)

  function openProduct(product: Product) {
    let props: OptionGroup[] = []
    const linked = product.product_option_groups?.length
      ? product.product_option_groups
      : categories.find(c => c.id === product.category_id)?.category_option_groups || []
    props = [...linked].sort((a, b) => a.display_order - b.display_order)
      .map(l => l.option_group).filter(og => og && og.option_group_items?.length > 0)
    const defaults: SelectedOption[] = []
    props.forEach(og => og.option_group_items.forEach(item => {
      if (item.is_default) defaults.push({ option_group_id: og.id, option_group_name: og.name, item_id: item.id, item_name: item.product.name, price: prix(item) })
    }))
    if (props.length === 0) {
      pushCart(product, [])
      return
    }
    setSelectedProduct(product)
    setPropositions(props)
    setPropIndex(0)
    setSelectedOptions(defaults)
  }

  function closeProduct() {
    setSelectedProduct(null)
    setPropositions([])
    setPropIndex(0)
    setSelectedOptions([])
  }

  function selectOption(og: OptionGroup, item: OptionGroupItem) {
    const opt = { option_group_id: og.id, option_group_name: og.name, item_id: item.id, item_name: item.product.name, price: prix(item) }
    if (og.selection_type === 'single') {
      setSelectedOptions([...selectedOptions.filter(o => o.option_group_id !== og.id), opt])
    } else if (selectedOptions.some(o => o.item_id === item.id)) {
      setSelectedOptions(selectedOptions.filter(o => o.item_id !== item.id))
    } else {
      const n = selectedOptions.filter(o => o.option_group_id === og.id).length
      if (og.max_selections && n >= og.max_selections) return
      setSelectedOptions([...selectedOptions, opt])
    }
  }

  function canProceed() {
    const g = propositions[propIndex]
    return !g || selectedOptions.filter(o => o.option_group_id === g.id).length >= g.min_selections
  }

  // Étape suivante. Les groupes déclenchés par le choix courant sont insérés juste après ;
  // ceux qui ne sont plus déclenchés (on a changé d'avis) sont retirés avec leurs choix.
  function nextStep() {
    if (!canProceed()) return
    const g = propositions[propIndex]
    let props = propositions
    let opts = selectedOptions
    if (g) {
      const declenches = g.option_group_items
        .filter(i => i.triggers_option_group_id && opts.some(o => o.item_id === i.id))
        .map(i => i.triggers_option_group_id as string)
      const possibles = g.option_group_items.map(i => i.triggers_option_group_id).filter(Boolean) as string[]
      const aRetirer = possibles.filter(id => !declenches.includes(id))
      if (aRetirer.length) {
        props = props.filter((p, i) => i <= propIndex || !aRetirer.includes(p.id))
        opts = opts.filter(o => !aRetirer.includes(o.option_group_id))
      }
      const nouveaux = declenches
        .filter(id => !props.some(p => p.id === id))
        .map(id => allOptionGroups.find(x => x.id === id))
        .filter((x): x is OptionGroup => !!x && x.option_group_items.length > 0)
      if (nouveaux.length) props = [...props.slice(0, propIndex + 1), ...nouveaux, ...props.slice(propIndex + 1)]
    }
    setPropositions(props)
    setSelectedOptions(opts)
    if (propIndex < props.length - 1) {
      setPropIndex(propIndex + 1)
    } else if (selectedProduct) {
      pushCart(selectedProduct, opts)
      closeProduct()
    }
  }

  // ==================== PANIER ====================

  function pushCart(product: Product, options: SelectedOption[]) {
    setCart(c => [...c, {
      id: `${product.id}-${Date.now()}`,
      product_id: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      options,
      options_total: options.reduce((s, o) => s + o.price, 0),
      vat_eat_in: product.vat_eat_in || 12,
      vat_takeaway: product.vat_takeaway || 6,
    }])
  }

  function changeQty(id: string, d: number) {
    setCart(c => c.map(it => (it.id === id ? { ...it, quantity: it.quantity + d } : it)).filter(it => it.quantity > 0))
  }

  const total = cart.reduce((s, it) => s + (it.price + it.options_total) * it.quantity, 0)
  const count = cart.reduce((s, it) => s + it.quantity, 0)
  const viaTerminal = paymentMethod === 'card' && !!device?.vivaTerminalId

  // ==================== ENCAISSEMENT (même écriture que la caisse) ====================

  async function payerAuTerminal(orderId: string, montant: number): Promise<boolean> {
    setTerminalWaiting(montant)
    try {
      const d = await (await fetch('/api/viva/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: montant, orderId, terminalId: device!.vivaTerminalId }),
      })).json()
      if (!d.success || !d.sessionId) return false
      for (let i = 0; i < 45; i++) {
        await new Promise(r => setTimeout(r, 2000))
        try {
          const st = await (await fetch(`/api/viva/payment?sessionId=${d.sessionId}&orderId=${orderId}`)).json()
          if (st.status === 'success') return true
          if (st.status === 'failed' || st.status === 'cancelled' || st.status === 'aborted') return false
        } catch { /* on réessaie */ }
      }
      return false
    } catch {
      return false
    } finally {
      setTerminalWaiting(null)
    }
  }

  async function submitOrder() {
    if (!device || cart.length === 0 || isSubmitting) return
    if (paymentMethod === 'cash' && cashReceived > 0 && cashReceived < total) return
    setIsSubmitting(true)
    try {
      let totalTax = 0
      cart.forEach(it => { totalTax += (it.price + it.options_total) * it.quantity * it.vat_takeaway / (100 + it.vat_takeaway) })
      const taxAmount = Math.round(totalTax * 100) / 100
      const isOffered = paymentMethod === 'offered'
      const { data: order, error } = await supabase.from('orders').insert({
        establishment_id: device.establishmentId,
        order_type: 'takeaway',
        eat_in: false,
        status: viaTerminal ? 'awaiting_payment' : 'pending',
        subtotal: total - taxAmount,
        tax_amount: taxAmount,
        total,
        total_amount: total,
        source: 'counter',
        payment_method: isOffered ? 'cash' : paymentMethod,
        payment_status: viaTerminal ? 'pending' : 'paid',
        is_offered: isOffered,
        device_id: device.id,
        notes: null,
        metadata: isOffered && offeredReason ? JSON.stringify({ offered_reason: offeredReason }) : null,
      }).select().single()
      if (error) throw error
      const { error: itemsError } = await supabase.from('order_items').insert(cart.map(it => ({
        order_id: order.id,
        product_id: it.product_id,
        product_name: it.name,
        quantity: it.quantity,
        unit_price: it.price,
        vat_rate: it.vat_takeaway,
        options_selected: it.options.length > 0 ? JSON.stringify(it.options) : null,
        options_total: it.options_total,
        line_total: (it.price + it.options_total) * it.quantity,
      })))
      if (itemsError) throw itemsError

      if (viaTerminal) {
        const paye = await payerAuTerminal(order.id, total)
        if (!paye) {
          await supabase.from('orders').update({ status: 'cancelled', payment_status: 'failed' })
            .eq('id', order.id).eq('status', 'awaiting_payment')
          alert('Paiement refusé, annulé ou sans réponse du terminal. Rien n\'est parti en cuisine.')
          return
        }
        await supabase.from('orders').update({ status: 'pending', payment_status: 'paid' }).eq('id', order.id)
      }

      setOrderNumber(String(order.order_number ?? ''))
      setCart([])
      setPayOpen(false)
      setCartOpen(false)
      setPaymentMethod('cash')
      setCashReceived(0)
      setOfferedReason('')
    } catch (e) {
      console.error('Erreur commande :', e)
      alert('Erreur lors de la commande')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ==================== ÉCRANS ====================

  if (authStatus === 'checking') return <Plein><p className="text-gray-500 text-lg">Vérification…</p></Plein>
  if (authStatus === 'unauthorized') {
    return (
      <Plein>
        <span className="text-5xl mb-4">🔒</span>
        <h1 className="text-xl font-bold mb-2">Accès non autorisé</h1>
        <p className="text-gray-500 mb-6 text-center">Connecte-toi et choisis une caisse sur la page de configuration.</p>
        <button onClick={() => router.push('/device')} className="bg-orange-500 text-white font-bold px-6 py-4 rounded-2xl w-full">
          Aller à la configuration
        </button>
      </Plein>
    )
  }
  if (loading) return <Plein><span className="text-5xl animate-pulse">🍟</span></Plein>
  if (orderNumber !== null) {
    return (
      <Plein>
        <span className="text-6xl mb-4">✅</span>
        <p className="text-gray-500 text-lg">Commande envoyée en cuisine</p>
        <p className="text-6xl font-black text-orange-500 my-4">#{orderNumber}</p>
        <button onClick={() => setOrderNumber(null)} className="bg-slate-900 text-white font-bold text-xl px-6 py-5 rounded-2xl w-full mt-4">
          Nouvelle commande
        </button>
      </Plein>
    )
  }

  const visibles = products.filter(p => p.category_id === selectedCategory && estDansSaPlage(p.availability_schedule, minute))
  const group = propositions[propIndex]

  return (
    <div className="min-h-[100dvh] bg-gray-100 flex flex-col">
      {/* En-tête + catégories */}
      <header className="sticky top-0 z-20 bg-slate-900 text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-bold text-lg truncate">{device?.name}</span>
          {device?.vivaTerminalId && <span className="text-xs bg-green-600 rounded-full px-2 py-1">💳 terminal relié</span>}
        </div>
        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-3 pb-3">
            {categories.map(c => (
              <button key={c.id} onClick={() => setSelectedCategory(c.id)}
                className={`shrink-0 px-4 py-2 rounded-full font-semibold ${selectedCategory === c.id ? 'bg-orange-500' : 'bg-slate-700'}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Produits */}
      <main className="flex-1 p-3 pb-28 grid grid-cols-1 gap-3">
        {visibles.map(p => (
          <button key={p.id} onClick={() => openProduct(p)}
            className="bg-white rounded-2xl p-3 flex items-center gap-3 text-left shadow-sm active:scale-[0.98] transition-transform">
            {p.image_url
              ? <img src={p.image_url} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
              : <div className="w-20 h-20 rounded-xl bg-orange-100 flex items-center justify-center text-3xl shrink-0">🍟</div>}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-lg leading-tight">{p.name}</p>
              {p.description && <p className="text-gray-500 text-sm line-clamp-2">{p.description}</p>}
            </div>
            <span className="font-black text-xl text-orange-500 shrink-0">{eur(p.price)}</span>
          </button>
        ))}
        {visibles.length === 0 && <p className="text-center text-gray-400 mt-10">Aucun produit dans cette catégorie</p>}
      </main>

      {/* Barre panier (zone du pouce) */}
      {count > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 p-3 bg-gradient-to-t from-gray-100">
          <button onClick={() => setCartOpen(true)}
            className="w-full bg-orange-500 text-white rounded-2xl px-5 py-4 flex items-center justify-between font-bold text-lg shadow-lg">
            <span>🛒 {count} article{count > 1 ? 's' : ''}</span>
            <span>{eur(total)} →</span>
          </button>
        </div>
      )}

      {/* Options, étape par étape */}
      {selectedProduct && group && (
        <Feuille onClose={closeProduct}>
          <p className="text-sm text-gray-500">{selectedProduct.name} · étape {propIndex + 1}/{propositions.length}</p>
          <h2 className="text-2xl font-bold mb-4">{group.name}</h2>
          <div className="grid gap-2 mb-4">
            {group.option_group_items.map(item => {
              const on = selectedOptions.some(o => o.item_id === item.id)
              return (
                <button key={item.id} onClick={() => selectOption(group, item)}
                  className={`flex items-center justify-between rounded-2xl border-2 px-4 py-4 text-lg font-semibold ${on ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white'}`}>
                  <span>{on ? '✅ ' : ''}{item.product.name}</span>
                  <span className="text-gray-600">{prix(item) > 0 ? `+${eur(prix(item))}` : ''}</span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            {propIndex > 0 && (
              <button onClick={() => setPropIndex(propIndex - 1)} className="px-5 py-4 rounded-2xl border border-gray-300 font-bold text-lg">←</button>
            )}
            <button onClick={nextStep} disabled={!canProceed()}
              className="flex-1 bg-green-600 text-white rounded-2xl py-4 font-bold text-lg disabled:opacity-40">
              {propIndex < propositions.length - 1 ? 'Suivant' : 'Ajouter au panier'}
            </button>
          </div>
        </Feuille>
      )}

      {/* Panier */}
      {cartOpen && !payOpen && (
        <Feuille onClose={() => setCartOpen(false)}>
          <h2 className="text-2xl font-bold mb-3">Panier</h2>
          <div className="grid gap-2 mb-4 max-h-[50vh] overflow-y-auto">
            {cart.map(it => (
              <div key={it.id} className="bg-gray-50 rounded-2xl p-3">
                <div className="flex justify-between font-bold">
                  <span>{it.name}</span>
                  <span>{eur((it.price + it.options_total) * it.quantity)}</span>
                </div>
                {it.options.length > 0 && <p className="text-sm text-gray-500">{it.options.map(o => o.item_name).join(' · ')}</p>}
                <div className="flex items-center gap-3 mt-2">
                  <button onClick={() => changeQty(it.id, -1)} className="w-11 h-11 rounded-xl bg-white border text-xl font-bold">−</button>
                  <span className="font-bold text-lg w-6 text-center">{it.quantity}</span>
                  <button onClick={() => changeQty(it.id, 1)} className="w-11 h-11 rounded-xl bg-white border text-xl font-bold">+</button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setPayOpen(true)} className="w-full bg-green-600 text-white rounded-2xl py-5 font-bold text-xl">
            Encaisser {eur(total)}
          </button>
        </Feuille>
      )}

      {/* Encaissement */}
      {payOpen && (
        <Feuille onClose={() => { if (terminalWaiting === null && !isSubmitting) setPayOpen(false) }}>
          <p className="text-gray-500">À payer</p>
          <p className="text-5xl font-black text-orange-500 mb-4">{eur(total)}</p>
          {terminalWaiting !== null ? (
            <div className="rounded-2xl bg-blue-50 border-2 border-blue-300 p-5 text-center">
              <p className="text-2xl font-bold text-blue-700">💳 {eur(terminalWaiting)} envoyés au terminal</p>
              <p className="text-blue-600 mt-2">Le client paie sur le terminal… la commande part en cuisine dès que c&apos;est accepté.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {([['cash', '💶', 'Espèces'], ['card', '💳', 'Carte'], ['offered', '🎁', 'Offert']] as const).map(([m, ic, lb]) => (
                  <button key={m} onClick={() => setPaymentMethod(m)}
                    className={`rounded-2xl border-2 py-4 font-bold ${paymentMethod === m ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
                    <span className="block text-2xl">{ic}</span>{lb}
                  </button>
                ))}
              </div>
              {paymentMethod === 'cash' && (
                <div className="mb-4">
                  <p className="font-semibold mb-2">Reçu du client</p>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {[5, 10, 20, 50].map(v => (
                      <button key={v} onClick={() => setCashReceived(cashReceived + v)} className="rounded-xl bg-gray-100 py-3 font-bold">+{v} €</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setCashReceived(total)} className="flex-1 rounded-xl bg-gray-100 py-3 font-bold">Compte juste</button>
                    <button onClick={() => setCashReceived(0)} className="rounded-xl bg-gray-100 px-4 py-3 font-bold">Effacer</button>
                  </div>
                  {cashReceived > 0 && (
                    <p className={`mt-3 text-xl font-bold ${cashReceived >= total ? 'text-green-700' : 'text-red-600'}`}>
                      Reçu {eur(cashReceived)} · {cashReceived >= total ? `à rendre ${eur(cashReceived - total)}` : `manque ${eur(total - cashReceived)}`}
                    </p>
                  )}
                </div>
              )}
              {paymentMethod === 'card' && (
                <p className="mb-4 text-gray-600">
                  {device?.vivaTerminalId ? 'Le montant sera envoyé au terminal.' : 'Aucun terminal relié à cette caisse : tape le montant sur le terminal.'}
                </p>
              )}
              {paymentMethod === 'offered' && (
                <input value={offeredReason} onChange={e => setOfferedReason(e.target.value)} placeholder="Motif (facultatif)"
                  className="w-full mb-4 rounded-xl border border-gray-300 px-4 py-3 text-lg" />
              )}
              <div className="flex gap-2">
                <button onClick={() => setPayOpen(false)} className="px-5 py-5 rounded-2xl border border-gray-300 font-bold">Retour</button>
                <button onClick={submitOrder}
                  disabled={isSubmitting || (paymentMethod === 'cash' && cashReceived > 0 && cashReceived < total)}
                  className="flex-1 bg-green-600 text-white rounded-2xl py-5 font-bold text-xl disabled:opacity-40">
                  {isSubmitting ? 'Envoi…' : viaTerminal ? '💳 Envoyer au terminal' : '✓ Valider'}
                </button>
              </div>
            </>
          )}
        </Feuille>
      )}
    </div>
  )
}

function Plein({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-gray-100 flex flex-col items-center justify-center p-6">{children}</div>
}

function Feuille({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-3xl p-5 pb-8 max-h-[92dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
