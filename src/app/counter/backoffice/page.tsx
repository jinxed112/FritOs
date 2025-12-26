'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

// ==================== TYPES ====================

type Ingredient = {
  id: string
  name: string
  category: string | null
  is_available: boolean
  stock_current: number | null
  stock_min: number | null
  unit: string | null
  affected_products_count?: number
}

type Product = {
  id: string
  name: string
  is_available: boolean
  category_name?: string
}

type ProductIngredient = {
  product_id: string
  product: {
    id: string
    name: string
    is_available: boolean
    category: { name: string } | null
  }
}

type Order = {
  id: string
  order_number: string
  order_type: string
  status: string
  total: number
  payment_method: string | null
  payment_status: string | null
  source: string | null
  customer_name: string | null
  customer_phone: string | null
  is_offered: boolean
  created_at: string
  order_items: {
    id: string
    product_name: string
    quantity: number
    line_total: number
    options_selected: any
  }[]
}

type DeliveryRound = {
  id: string
  status: string
  total_stops: number
  driver: { id: string; name: string; status: string } | null
  stops: {
    id: string
    stop_order: number
    status: string
    order: {
      order_number: string
      customer_name: string | null
      delivery_notes: string | null
    }
  }[]
}

type Driver = {
  id: string
  name: string
  status: string
  current_lat: number | null
  current_lng: number | null
  last_location_at: string | null
}

// ==================== COMPONENT ====================

export default function BackofficePage() {
  const [activeTab, setActiveTab] = useState<'ingredients' | 'orders' | 'deliveries'>('ingredients')
  
  // Ingredients state
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [ingredientSearch, setIngredientSearch] = useState('')
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null)
  const [affectedProducts, setAffectedProducts] = useState<Product[]>([])
  
  // Orders state
  const [orders, setOrders] = useState<Order[]>([])
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'preparing' | 'ready' | 'completed'>('all')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  
  // Deliveries state
  const [deliveryRounds, setDeliveryRounds] = useState<DeliveryRound[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  
  const [loading, setLoading] = useState(true)
  
  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadData()
    
    // Realtime pour les commandes
    const ordersChannel = supabase
      .channel('backoffice-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders())
      .subscribe()
    
    // Refresh drivers toutes les 30s
    const driverInterval = setInterval(loadDrivers, 30000)
    
    return () => {
      supabase.removeChannel(ordersChannel)
      clearInterval(driverInterval)
    }
  }, [])

  async function loadData() {
    setLoading(true)
    await Promise.all([
      loadIngredients(),
      loadOrders(),
      loadDeliveries(),
      loadDrivers()
    ])
    setLoading(false)
  }

  async function loadIngredients() {
    // Charger ingrédients avec comptage des produits affectés
    const { data } = await supabase
      .from('ingredients')
      .select(`
        id, name, category, is_available, stock_current, stock_min, unit,
        product_ingredients (product_id)
      `)
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .order('category')
      .order('name')
    
    if (data) {
      setIngredients(data.map((ing: any) => ({
        ...ing,
        affected_products_count: ing.product_ingredients?.length || 0
      })))
    }
  }

  async function loadAffectedProducts(ingredientId: string) {
    const { data } = await supabase
      .from('product_ingredients')
      .select(`
        product_id,
        product:products (id, name, is_available, category:categories (name))
      `)
      .eq('ingredient_id', ingredientId)
      .eq('is_essential', true)
    
    if (data) {
      setAffectedProducts(data.map((pi: any) => ({
        id: pi.product.id,
        name: pi.product.name,
        is_available: pi.product.is_available,
        category_name: pi.product.category?.name
      })))
    }
  }

  async function toggleIngredientAvailability(ingredient: Ingredient) {
    const newStatus = !ingredient.is_available
    
    const { error } = await supabase
      .from('ingredients')
      .update({ is_available: newStatus })
      .eq('id', ingredient.id)
    
    if (!error) {
      setIngredients(prev => prev.map(ing => 
        ing.id === ingredient.id ? { ...ing, is_available: newStatus } : ing
      ))
      
      // Si on vient de changer l'ingrédient sélectionné, recharger les produits affectés
      if (selectedIngredient?.id === ingredient.id) {
        setTimeout(() => loadAffectedProducts(ingredient.id), 500)
      }
    }
  }

  async function loadOrders() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const { data } = await supabase
      .from('orders')
      .select(`
        id, order_number, order_type, status, total, 
        payment_method, payment_status, source,
        customer_name, customer_phone, is_offered, created_at,
        order_items (id, product_name, quantity, line_total, options_selected)
      `)
      .eq('establishment_id', establishmentId)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(100)
    
    setOrders(data || [])
  }

  async function updateOrderStatus(orderId: string, newStatus: string) {
    await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
    
    setSelectedOrder(null)
  }

  async function loadDeliveries() {
    const { data } = await supabase
      .from('delivery_rounds')
      .select(`
        id, status, total_stops,
        driver:drivers (id, name, status),
        stops:delivery_round_stops (
          id, stop_order, status,
          order:orders (order_number, customer_name, delivery_notes)
        )
      `)
      .eq('establishment_id', establishmentId)
      .in('status', ['pending', 'ready', 'in_progress'])
      .order('created_at', { ascending: false })
    
    if (data) {
      setDeliveryRounds(data.map((r: any) => ({
        ...r,
        stops: (r.stops || []).sort((a: any, b: any) => a.stop_order - b.stop_order)
      })))
    }
  }

  async function loadDrivers() {
    const { data } = await supabase
      .from('drivers')
      .select('id, name, status, current_lat, current_lng, last_location_at')
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
    
    setDrivers(data || [])
  }

  // ==================== FILTERS ====================
  
  const filteredIngredients = ingredients.filter(ing => {
    if (!ingredientSearch) return true
    return ing.name.toLowerCase().includes(ingredientSearch.toLowerCase())
  })
  
  const groupedIngredients = filteredIngredients.reduce((acc, ing) => {
    const cat = ing.category || 'Autres'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(ing)
    return acc
  }, {} as Record<string, Ingredient[]>)

  const filteredOrders = orders.filter(order => {
    if (orderFilter === 'all') return true
    return order.status === orderFilter
  })

  const orderStats = {
    pending: orders.filter(o => o.status === 'pending').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready: orders.filter(o => o.status === 'ready').length,
    completed: orders.filter(o => o.status === 'completed').length,
    revenue: orders
      .filter(o => o.status === 'completed' && o.payment_status === 'paid' && !o.is_offered)
      .reduce((sum, o) => sum + (o.total || 0), 0)
  }

  // ==================== HELPERS ====================

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
  }

  function getStatusBadge(status: string) {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-orange-100', text: 'text-orange-700', label: '⏳ En attente' },
      preparing: { bg: 'bg-blue-100', text: 'text-blue-700', label: '🍳 En prépa' },
      ready: { bg: 'bg-green-100', text: 'text-green-700', label: '✅ Prêt' },
      completed: { bg: 'bg-gray-100', text: 'text-gray-700', label: '🏁 Terminé' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: '❌ Annulé' },
    }
    const c = config[status] || config.pending
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>{c.label}</span>
  }

  function getSourceEmoji(source: string | null): string {
    const emojis: Record<string, string> = {
      kiosk: '🖥️',
      counter: '💳',
      click_and_collect: '📱',
      delivery: '🚗'
    }
    return emojis[source || ''] || '📋'
  }

  function getOrderTypeEmoji(type: string): string {
    const emojis: Record<string, string> = {
      eat_in: '🍽️',
      takeaway: '🥡',
      delivery: '🚗'
    }
    return emojis[type] || '📋'
  }

  // ==================== RENDER ====================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl block mb-4 animate-pulse">⚙️</span>
          <p className="text-gray-500 text-xl">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/counter" 
            className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-xl font-medium transition-colors"
          >
            ← Caisse
          </Link>
          <h1 className="text-xl font-bold">⚙️ Backoffice</h1>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('ingredients')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === 'ingredients' ? 'bg-orange-500 text-white' : 'bg-slate-700 text-gray-300'
            }`}
          >
            🥬 Ingrédients
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === 'orders' ? 'bg-orange-500 text-white' : 'bg-slate-700 text-gray-300'
            }`}
          >
            🧾 Commandes
            {orderStats.pending > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {orderStats.pending}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('deliveries')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === 'deliveries' ? 'bg-orange-500 text-white' : 'bg-slate-700 text-gray-300'
            }`}
          >
            🚗 Livraisons
            {deliveryRounds.length > 0 && (
              <span className="ml-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                {deliveryRounds.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="p-4">
        {/* ==================== INGREDIENTS TAB ==================== */}
        {activeTab === 'ingredients' && (
          <div className="flex gap-4 h-[calc(100vh-120px)]">
            {/* Liste ingrédients */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b">
                <input
                  type="text"
                  placeholder="🔍 Rechercher un ingrédient..."
                  value={ingredientSearch}
                  onChange={(e) => setIngredientSearch(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                {Object.entries(groupedIngredients).map(([category, ings]) => (
                  <div key={category} className="mb-6">
                    <h3 className="text-sm font-bold text-gray-500 uppercase mb-3">{category}</h3>
                    <div className="space-y-2">
                      {ings.map(ing => (
                        <div
                          key={ing.id}
                          className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all cursor-pointer ${
                            selectedIngredient?.id === ing.id
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-gray-100 hover:border-gray-200'
                          } ${!ing.is_available ? 'opacity-60' : ''}`}
                          onClick={() => {
                            setSelectedIngredient(ing)
                            loadAffectedProducts(ing.id)
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`text-2xl ${ing.is_available ? '' : 'grayscale'}`}>
                              🥬
                            </span>
                            <div>
                              <p className={`font-medium ${!ing.is_available ? 'line-through text-gray-400' : ''}`}>
                                {ing.name}
                              </p>
                              {ing.affected_products_count ? (
                                <p className="text-xs text-gray-400">
                                  {ing.affected_products_count} produit(s) lié(s)
                                </p>
                              ) : null}
                            </div>
                          </div>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleIngredientAvailability(ing)
                            }}
                            className={`px-4 py-2 rounded-xl font-semibold transition-all active:scale-95 ${
                              ing.is_available
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                          >
                            {ing.is_available ? '✓ Dispo' : '✕ Indispo'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                
                {filteredIngredients.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <span className="text-5xl block mb-3">🔍</span>
                    <p>Aucun ingrédient trouvé</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Panel produits affectés */}
            <div className="w-80 bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b bg-slate-50">
                <h2 className="font-bold text-gray-900">
                  {selectedIngredient ? `🍔 Produits avec "${selectedIngredient.name}"` : '🍔 Produits affectés'}
                </h2>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                {!selectedIngredient ? (
                  <div className="text-center py-12 text-gray-400">
                    <span className="text-5xl block mb-3">👈</span>
                    <p>Sélectionnez un ingrédient</p>
                  </div>
                ) : affectedProducts.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <span className="text-5xl block mb-3">📦</span>
                    <p>Aucun produit lié</p>
                    <p className="text-sm mt-2">Liez des produits à cet ingrédient dans l'admin</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {affectedProducts.map(prod => (
                      <div
                        key={prod.id}
                        className={`p-3 rounded-xl border ${
                          prod.is_available
                            ? 'border-green-200 bg-green-50'
                            : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className={`font-medium ${!prod.is_available ? 'line-through text-gray-400' : ''}`}>
                              {prod.name}
                            </p>
                            {prod.category_name && (
                              <p className="text-xs text-gray-400">{prod.category_name}</p>
                            )}
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            prod.is_available
                              ? 'bg-green-200 text-green-700'
                              : 'bg-red-200 text-red-700'
                          }`}>
                            {prod.is_available ? 'Dispo' : 'Indispo'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {selectedIngredient && !selectedIngredient.is_available && affectedProducts.length > 0 && (
                <div className="p-4 border-t bg-red-50">
                  <p className="text-red-700 text-sm text-center font-medium">
                    ⚠️ {affectedProducts.filter(p => !p.is_available).length} produit(s) indisponible(s)
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== ORDERS TAB ==================== */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-5 gap-3">
              <div className="bg-white rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-orange-500">{orderStats.pending}</p>
                <p className="text-gray-500 text-sm">En attente</p>
              </div>
              <div className="bg-white rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-blue-500">{orderStats.preparing}</p>
                <p className="text-gray-500 text-sm">En prépa</p>
              </div>
              <div className="bg-white rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-green-500">{orderStats.ready}</p>
                <p className="text-gray-500 text-sm">Prêt</p>
              </div>
              <div className="bg-white rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-gray-500">{orderStats.completed}</p>
                <p className="text-gray-500 text-sm">Terminé</p>
              </div>
              <div className="bg-white rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{orderStats.revenue.toFixed(2)}€</p>
                <p className="text-gray-500 text-sm">CA du jour</p>
              </div>
            </div>
            
            {/* Filtres */}
            <div className="flex gap-2">
              {(['all', 'pending', 'preparing', 'ready', 'completed'] as const).map(filter => (
                <button
                  key={filter}
                  onClick={() => setOrderFilter(filter)}
                  className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                    orderFilter === filter
                      ? 'bg-orange-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {filter === 'all' ? 'Toutes' :
                   filter === 'pending' ? '⏳ Attente' :
                   filter === 'preparing' ? '🍳 Prépa' :
                   filter === 'ready' ? '✅ Prêt' : '🏁 Terminé'}
                </button>
              ))}
            </div>
            
            {/* Liste commandes */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-4 font-semibold text-gray-600">Commande</th>
                      <th className="text-left p-4 font-semibold text-gray-600">Type</th>
                      <th className="text-left p-4 font-semibold text-gray-600">Client</th>
                      <th className="text-left p-4 font-semibold text-gray-600">Total</th>
                      <th className="text-left p-4 font-semibold text-gray-600">Status</th>
                      <th className="text-left p-4 font-semibold text-gray-600">Heure</th>
                      <th className="text-right p-4 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map(order => (
                      <tr 
                        key={order.id} 
                        className="border-b hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <td className="p-4">
                          <span className="font-bold">#{order.order_number}</span>
                          {order.is_offered && <span className="ml-2 text-purple-500">🎁</span>}
                        </td>
                        <td className="p-4">
                          <span className="text-xl mr-2">{getOrderTypeEmoji(order.order_type)}</span>
                          <span className="text-gray-500">{getSourceEmoji(order.source)}</span>
                        </td>
                        <td className="p-4">
                          <p className="font-medium">{order.customer_name || '-'}</p>
                          {order.customer_phone && (
                            <p className="text-sm text-gray-400">{order.customer_phone}</p>
                          )}
                        </td>
                        <td className="p-4 font-bold">{order.total?.toFixed(2)}€</td>
                        <td className="p-4">{getStatusBadge(order.status)}</td>
                        <td className="p-4 text-gray-500">{formatTime(order.created_at)}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedOrder(order)
                            }}
                            className="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg text-sm"
                          >
                            👁️ Voir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {filteredOrders.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <span className="text-5xl block mb-3">🧾</span>
                  <p>Aucune commande</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== DELIVERIES TAB ==================== */}
        {activeTab === 'deliveries' && (
          <div className="grid grid-cols-2 gap-4 h-[calc(100vh-120px)]">
            {/* Tournées en cours */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b bg-slate-50">
                <h2 className="font-bold text-gray-900">🚗 Tournées en cours</h2>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                {deliveryRounds.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <span className="text-5xl block mb-3">🚗</span>
                    <p>Aucune tournée en cours</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {deliveryRounds.map(round => (
                      <div
                        key={round.id}
                        className={`border-2 rounded-xl p-4 ${
                          round.status === 'in_progress' ? 'border-green-300 bg-green-50' :
                          round.status === 'ready' ? 'border-blue-300 bg-blue-50' :
                          'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            round.status === 'in_progress' ? 'bg-green-200 text-green-700' :
                            round.status === 'ready' ? 'bg-blue-200 text-blue-700' :
                            'bg-gray-200 text-gray-700'
                          }`}>
                            {round.status === 'in_progress' ? '🚗 En cours' :
                             round.status === 'ready' ? '✅ Prête' : '⏳ En attente'}
                          </span>
                          <span className="text-gray-500">{round.total_stops} stop(s)</span>
                        </div>
                        
                        {round.driver && (
                          <div className="flex items-center gap-2 mb-3 p-2 bg-white rounded-lg">
                            <span className="text-xl">🛵</span>
                            <span className="font-medium">{round.driver.name}</span>
                            <span className={`ml-auto text-sm ${
                              round.driver.status === 'delivering' ? 'text-green-600' : 'text-gray-400'
                            }`}>
                              {round.driver.status === 'delivering' ? '🟢 En livraison' : '⚪ En attente'}
                            </span>
                          </div>
                        )}
                        
                        <div className="space-y-2">
                          {round.stops.map(stop => (
                            <div
                              key={stop.id}
                              className={`flex items-center gap-3 p-2 rounded-lg ${
                                stop.status === 'delivered' ? 'bg-green-100' :
                                stop.status === 'in_transit' ? 'bg-yellow-100' :
                                'bg-gray-50'
                              }`}
                            >
                              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                                stop.status === 'delivered' ? 'bg-green-500 text-white' :
                                stop.status === 'in_transit' ? 'bg-yellow-500 text-white' :
                                'bg-gray-300 text-gray-600'
                              }`}>
                                {stop.status === 'delivered' ? '✓' : stop.stop_order}
                              </span>
                              <div className="flex-1">
                                <span className="font-medium">#{stop.order?.order_number}</span>
                                <span className="text-gray-500 ml-2">{stop.order?.customer_name}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Livreurs + Carte */}
            <div className="flex flex-col gap-4">
              {/* Liste livreurs */}
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h2 className="font-bold text-gray-900 mb-4">🛵 Livreurs</h2>
                
                {drivers.length === 0 ? (
                  <p className="text-gray-400 text-center py-4">Aucun livreur</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {drivers.map(driver => (
                      <div
                        key={driver.id}
                        className={`flex items-center justify-between p-3 rounded-xl ${
                          driver.status === 'delivering' ? 'bg-green-50 border border-green-200' :
                          driver.status === 'available' ? 'bg-blue-50 border border-blue-200' :
                          'bg-gray-50 border border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🛵</span>
                          <span className="font-medium">{driver.name}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          driver.status === 'delivering' ? 'bg-green-200 text-green-700' :
                          driver.status === 'available' ? 'bg-blue-200 text-blue-700' :
                          'bg-gray-200 text-gray-500'
                        }`}>
                          {driver.status === 'delivering' ? '🚗 Livraison' :
                           driver.status === 'available' ? '✅ Dispo' : '⚪ Hors ligne'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Carte placeholder */}
              <div className="flex-1 bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-slate-50">
                  <h2 className="font-bold text-gray-900">🗺️ Carte GPS</h2>
                </div>
                <div className="h-full flex items-center justify-center bg-gray-100 p-8">
                  <div className="text-center text-gray-400">
                    <span className="text-6xl block mb-4">🗺️</span>
                    <p className="font-medium">Carte GPS à venir</p>
                    <p className="text-sm mt-2">Position des livreurs en temps réel</p>
                    {drivers.filter(d => d.current_lat && d.current_lng).length > 0 && (
                      <p className="text-xs mt-4 text-green-600">
                        {drivers.filter(d => d.current_lat && d.current_lng).length} livreur(s) avec GPS actif
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== ORDER DETAIL MODAL ==================== */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h2 className="text-xl font-bold">
                  Commande #{selectedOrder.order_number}
                  {selectedOrder.is_offered && <span className="ml-2 text-purple-500">🎁</span>}
                </h2>
                <p className="text-gray-500 text-sm">{formatTime(selectedOrder.created_at)}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">Type</p>
                  <p className="font-medium">{getOrderTypeEmoji(selectedOrder.order_type)} {selectedOrder.order_type}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">Status</p>
                  {getStatusBadge(selectedOrder.status)}
                </div>
              </div>
              
              {/* Client */}
              {(selectedOrder.customer_name || selectedOrder.customer_phone) && (
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-600 mb-1">👤 Client</p>
                  <p className="font-medium">{selectedOrder.customer_name || '-'}</p>
                  {selectedOrder.customer_phone && (
                    <p className="text-sm text-gray-600">{selectedOrder.customer_phone}</p>
                  )}
                </div>
              )}
              
              {/* Items */}
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">Articles</p>
                <div className="space-y-2">
                  {selectedOrder.order_items.map(item => (
                    <div key={item.id} className="bg-gray-50 rounded-xl p-3 flex justify-between">
                      <div>
                        <p className="font-medium">{item.quantity}x {item.product_name}</p>
                        {item.options_selected && Array.isArray(item.options_selected) && item.options_selected.length > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            {item.options_selected.map((opt: any, idx: number) => (
                              <span key={idx}>+ {opt.item_name}{idx < item.options_selected.length - 1 ? ', ' : ''}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="font-bold">{item.line_total?.toFixed(2)}€</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Total */}
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="font-bold text-lg">Total</span>
                <span className="font-bold text-2xl text-orange-500">{selectedOrder.total?.toFixed(2)}€</span>
              </div>
            </div>
            
            {/* Actions */}
            <div className="p-4 border-t flex gap-3">
              <button
                onClick={() => setSelectedOrder(null)}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-semibold"
              >
                Fermer
              </button>
              {selectedOrder.status === 'pending' && (
                <button
                  onClick={() => updateOrderStatus(selectedOrder.id, 'preparing')}
                  className="flex-1 px-4 py-3 rounded-xl bg-blue-500 text-white font-semibold"
                >
                  🍳 Préparer
                </button>
              )}
              {selectedOrder.status === 'preparing' && (
                <button
                  onClick={() => updateOrderStatus(selectedOrder.id, 'ready')}
                  className="flex-1 px-4 py-3 rounded-xl bg-green-500 text-white font-semibold"
                >
                  ✅ Prêt
                </button>
              )}
              {selectedOrder.status === 'ready' && (
                <button
                  onClick={() => updateOrderStatus(selectedOrder.id, 'completed')}
                  className="flex-1 px-4 py-3 rounded-xl bg-gray-500 text-white font-semibold"
                >
                  🏁 Terminer
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
