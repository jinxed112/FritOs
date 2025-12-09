'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Types
type OptionGroupItem = {
  id: string
  product_id: string
  price_override: number | null
  is_default: boolean
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

export default function CounterPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  
  // Modal produit avec propositions
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [currentPropositions, setCurrentPropositions] = useState<OptionGroup[]>([])
  const [currentPropositionIndex, setCurrentPropositionIndex] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([])
  
  // Cart
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderType, setOrderType] = useState<OrderType>('eat_in')
  
  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [offeredReason, setOfferedReason] = useState('')
  const [cashReceived, setCashReceived] = useState(0)
  
  // Confirmation
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: categoriesData } = await supabase
      .from('categories')
      .select(`
        id, name, image_url,
        category_option_groups (
          option_group_id,
          display_order,
          option_group:option_groups (
            id, name, selection_type, min_selections, max_selections,
            option_group_items (
              id, product_id, price_override, is_default,
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
          option_group_id,
          display_order,
          option_group:option_groups (
            id, name, selection_type, min_selections, max_selections,
            option_group_items (
              id, product_id, price_override, is_default,
              product:products (id, name, price, image_url)
            )
          )
        )
      `)
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .eq('is_available', true)
      .order('display_order')

    setCategories((categoriesData || []) as any)
    setProducts((productsData || []) as any)
    
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

  function getCartTotal(): number {
    return cart.reduce((sum, item) => sum + (item.price + item.options_total) * item.quantity, 0)
  }

  function getVatRate(): number {
    return orderType === 'eat_in' ? 12 : 6
  }

  function getTotalWithVat(): number {
    return getCartTotal() * (1 + getVatRate() / 100)
  }

  function getChange(): number {
    return Math.max(0, cashReceived - getTotalWithVat())
  }

  function openPaymentModal() {
    setPaymentMethod('cash')
    setOfferedReason('')
    setCashReceived(0)
    setShowPaymentModal(true)
  }

  async function submitOrder() {
    if (cart.length === 0) return
    
    setIsSubmitting(true)
    
    try {
      const vatRate = getVatRate()
      const total = getCartTotal()
      const isOffered = paymentMethod === 'offered'
      
      if (isOffered) {
        // OFFERT : Stocker dans temp_orders (table séparée, pas dans orders)
        const tempOrderNumber = 'X' + String(Date.now()).slice(-2)
        
        const { error } = await supabase
          .from('temp_orders')
          .insert({
            establishment_id: establishmentId,
            order_number: tempOrderNumber,
            order_type: orderType,
            status: 'pending',
            order_items: cart.map(item => ({
              id: `item-${Date.now()}-${Math.random()}`,
              product_name: item.name,
              quantity: item.quantity,
              options_selected: item.options.length > 0 ? JSON.stringify(item.options) : null,
            }))
          })
        
        if (error) throw error
        
        setOrderNumber(tempOrderNumber + ' 🎁')
        setCart([])
        setShowPaymentModal(false)
      } else {
        // NORMAL : Stockage en DB
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            establishment_id: establishmentId,
            order_type: orderType,
            status: 'pending',
            subtotal: total,
            tax_amount: total * vatRate / 100,
            total_amount: total * (1 + vatRate / 100),
            source: 'counter',
            payment_method: paymentMethod,
            payment_status: 'paid',
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
        
        setOrderNumber(order.order_number)
        setCart([])
        setShowPaymentModal(false)
      }
    } catch (error) {
      console.error('Erreur:', error)
      alert('Erreur lors de la commande')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Confirmation screen
  if (orderNumber) {
    return (
      <div className="min-h-screen bg-green-500 flex items-center justify-center p-8">
        <div className="text-center text-white">
          <span className="text-8xl block mb-8">✅</span>
          <h1 className="text-4xl font-bold mb-4">Commande envoyée !</h1>
          
          <div className="bg-white text-gray-900 rounded-3xl p-8 inline-block mb-8">
            <p className="text-xl mb-2">Numéro</p>
            <p className="text-7xl font-bold text-orange-500">{orderNumber}</p>
          </div>
          
          <button
            onClick={() => setOrderNumber(null)}
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
        <header className="bg-slate-800 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-orange-500">📋 Prise de commande</h1>
          </div>
          
          {/* Order type toggle */}
          <div className="flex items-center gap-2 bg-slate-700 rounded-xl p-1">
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
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-gray-400 py-12">Chargement...</div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-7 h-7 rounded-full bg-gray-200 font-bold text-sm"
                      >
                        -
                      </button>
                      <span className="font-bold w-6 text-center text-sm">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-7 h-7 rounded-full bg-gray-200 font-bold text-sm"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-bold text-orange-500 text-sm">
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
          <div className="p-4 border-t bg-gray-50">
            <div className="flex justify-between mb-1 text-sm">
              <span className="text-gray-600">Sous-total</span>
              <span className="font-bold">{getCartTotal().toFixed(2)} €</span>
            </div>
            <div className="flex justify-between mb-3 text-sm">
              <span className="text-gray-600">TVA ({getVatRate()}%)</span>
              <span>{(getCartTotal() * getVatRate() / 100).toFixed(2)} €</span>
            </div>
            <div className="flex justify-between mb-4 text-lg">
              <span className="font-bold">Total</span>
              <span className="font-bold text-orange-500">{getTotalWithVat().toFixed(2)} €</span>
            </div>
            
            <button
              onClick={openPaymentModal}
              className="w-full bg-green-500 text-white font-bold py-3 rounded-xl text-lg hover:bg-green-600"
            >
              💶 Encaisser
            </button>
          </div>
        )}
      </div>

      {/* Modal Propositions */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">{selectedProduct.name}</h2>
                  <p className="text-orange-100">{selectedProduct.price.toFixed(2)} €</p>
                </div>
                <button
                  onClick={closeProductModal}
                  className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
              
              {currentPropositions.length > 0 && (
                <div className="flex gap-2 mt-3">
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
    </div>
  )
}
