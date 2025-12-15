'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type OrderItem = {
  id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  vat_rate: number
  options_selected: any
  options_total: number
  line_total: number
  notes: string | null
  is_free: boolean
  free_reason: string | null
}

type Order = {
  id: string
  order_number: string
  order_type: string
  eat_in: boolean
  status: string
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  customer_id: string | null
  subtotal: number
  discount_amount: number
  vat_amount: number
  total: number
  tax_amount: number | null
  total_amount: number | null
  payment_method: string | null
  payment_status: string | null
  source: string | null
  notes: string | null
  is_offered: boolean
  offered_reason: string | null
  created_at: string
  order_items: OrderItem[]
}

type FilterStatus = 'all' | 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
type FilterPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'all'

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('today')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadOrders()
    
    // Realtime subscription
    const channel = supabase
      .channel('orders-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'orders', filter: `establishment_id=eq.${establishmentId}` },
        () => loadOrders()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [filterPeriod])

  async function loadOrders() {
    setLoading(true)
    
    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('establishment_id', establishmentId)
      .order('created_at', { ascending: false })

    // Filtre période
    if (filterPeriod !== 'all') {
      const now = new Date()
      let startDate: Date
      
      switch (filterPeriod) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0))
          break
        case 'yesterday':
          startDate = new Date(now.setDate(now.getDate() - 1))
          startDate.setHours(0, 0, 0, 0)
          break
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7))
          break
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1))
          break
        default:
          startDate = new Date(0)
      }
      
      query = query.gte('created_at', startDate.toISOString())
      
      if (filterPeriod === 'yesterday') {
        const endDate = new Date(startDate)
        endDate.setHours(23, 59, 59, 999)
        query = query.lte('created_at', endDate.toISOString())
      }
    }

    const { data, error } = await query.limit(200)

    if (error) {
      console.error('Erreur chargement:', error)
    } else {
      setOrders(data || [])
    }
    
    setLoading(false)
  }

  async function updateStatus(orderId: string, newStatus: string) {
    const updates: any = { status: newStatus }
    
    if (newStatus === 'ready') {
      updates.prepared_at = new Date().toISOString()
    } else if (newStatus === 'completed') {
      updates.completed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)

    if (error) {
      alert('Erreur: ' + error.message)
    }
  }

  // Filtrage
  const filteredOrders = orders.filter(order => {
    // Filtre status
    if (filterStatus !== 'all' && order.status !== filterStatus) return false
    
    // Filtre recherche
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchNumber = order.order_number?.toLowerCase().includes(q)
      const matchName = order.customer_name?.toLowerCase().includes(q)
      const matchPhone = order.customer_phone?.includes(q)
      if (!matchNumber && !matchName && !matchPhone) return false
    }
    
    return true
  })

  // Stats
  const stats = {
    pending: orders.filter(o => o.status === 'pending').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready: orders.filter(o => o.status === 'ready').length,
    completed: orders.filter(o => o.status === 'completed').length,
    revenue: orders
      .filter(o => o.status === 'completed' && o.payment_status === 'paid')
      .reduce((sum, o) => sum + (o.total_amount || o.total || 0), 0),
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      pending: 'bg-orange-100 text-orange-700',
      preparing: 'bg-blue-100 text-blue-700',
      ready: 'bg-green-100 text-green-700',
      completed: 'bg-gray-100 text-gray-700',
      cancelled: 'bg-red-100 text-red-700',
    }
    const labels: Record<string, string> = {
      pending: '⏳ En attente',
      preparing: '🍳 En préparation',
      ready: '✅ Prêt',
      completed: '🏁 Terminé',
      cancelled: '❌ Annulé',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
        {labels[status] || status}
      </span>
    )
  }

  function getPaymentBadge(status: string | null) {
    if (!status) return null
    const styles: Record<string, string> = {
      paid: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      failed: 'bg-red-100 text-red-700',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
        {status === 'paid' ? '💳 Payé' : status === 'pending' ? '⏳ En attente' : status}
      </span>
    )
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Commandes</h1>
          <p className="text-gray-500">{filteredOrders.length} commande(s)</p>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-orange-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-orange-600">{stats.pending}</p>
          <p className="text-sm text-orange-600">En attente</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{stats.preparing}</p>
          <p className="text-sm text-blue-600">En préparation</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{stats.ready}</p>
          <p className="text-sm text-green-600">Prêtes</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-gray-600">{stats.completed}</p>
          <p className="text-sm text-gray-600">Terminées</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-purple-600">{stats.revenue.toFixed(2)}€</p>
          <p className="text-sm text-purple-600">CA période</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        {/* Période */}
        <select
          value={filterPeriod}
          onChange={(e) => setFilterPeriod(e.target.value as FilterPeriod)}
          className="px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="today">Aujourd'hui</option>
          <option value="yesterday">Hier</option>
          <option value="week">7 derniers jours</option>
          <option value="month">30 derniers jours</option>
          <option value="all">Tout</option>
        </select>

        {/* Status */}
        <div className="flex gap-2">
          {(['all', 'pending', 'preparing', 'ready', 'completed', 'cancelled'] as FilterStatus[]).map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                filterStatus === status
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status === 'all' ? 'Tous' : 
               status === 'pending' ? '⏳' :
               status === 'preparing' ? '🍳' :
               status === 'ready' ? '✅' :
               status === 'completed' ? '🏁' : '❌'}
            </button>
          ))}
        </div>

        {/* Recherche */}
        <input
          type="text"
          placeholder="🔍 N° commande, nom, téléphone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 max-w-xs px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">📋</span>
          <p className="text-gray-500">Aucune commande</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">N°</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Date</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Type</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Source</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Client</th>
                <th className="text-center px-6 py-4 font-semibold text-gray-600">Status</th>
                <th className="text-center px-6 py-4 font-semibold text-gray-600">Paiement</th>
                <th className="text-right px-6 py-4 font-semibold text-gray-600">Total</th>
                <th className="text-right px-6 py-4 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.map(order => (
                <tr 
                  key={order.id} 
                  className={`hover:bg-gray-50 cursor-pointer ${order.is_offered ? 'bg-purple-50' : ''}`}
                  onClick={() => setSelectedOrder(order)}
                >
                  <td className="px-6 py-4">
                    <span className="font-bold text-lg">{order.order_number}</span>
                    {order.is_offered && <span className="ml-2">🎁</span>}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{formatDate(order.created_at)}</td>
                  <td className="px-6 py-4">
                    <span className="text-xl" title={order.eat_in ? 'Sur place' : 'À emporter'}>
                      {order.eat_in ? '🍽️' : '🥡'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-500">
                      {order.source === 'kiosk' ? '🖥️ Borne' : 
                       order.source === 'counter' ? '📋 Comptoir' : 
                       order.source || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {order.customer_name || order.customer_phone || '-'}
                  </td>
                  <td className="px-6 py-4 text-center">{getStatusBadge(order.status)}</td>
                  <td className="px-6 py-4 text-center">{getPaymentBadge(order.payment_status)}</td>
                  <td className="px-6 py-4 text-right font-bold">
                    {(order.total_amount || order.total || 0).toFixed(2)}€
                  </td>
                  <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      {order.status === 'pending' && (
                        <button
                          onClick={() => updateStatus(order.id, 'preparing')}
                          className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                        >
                          🍳
                        </button>
                      )}
                      {order.status === 'preparing' && (
                        <button
                          onClick={() => updateStatus(order.id, 'ready')}
                          className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200"
                        >
                          ✅
                        </button>
                      )}
                      {order.status === 'ready' && (
                        <button
                          onClick={() => updateStatus(order.id, 'completed')}
                          className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
                        >
                          🏁
                        </button>
                      )}
                      {['pending', 'preparing'].includes(order.status) && (
                        <button
                          onClick={() => {
                            if (confirm('Annuler cette commande ?')) {
                              updateStatus(order.id, 'cancelled')
                            }
                          }}
                          className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                        >
                          ❌
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal détail */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h2 className="text-2xl font-bold">
                  Commande {selectedOrder.order_number}
                  {selectedOrder.is_offered && <span className="ml-2 text-purple-500">🎁 Offert</span>}
                </h2>
                <p className="text-gray-500">{formatDate(selectedOrder.created_at)}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500 mb-1">Type</p>
                  <p className="font-medium text-lg">
                    {selectedOrder.eat_in ? '🍽️ Sur place' : '🥡 À emporter'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500 mb-1">Source</p>
                  <p className="font-medium text-lg">
                    {selectedOrder.source === 'kiosk' ? '🖥️ Borne' : 
                     selectedOrder.source === 'counter' ? '📋 Comptoir' : 
                     selectedOrder.source || '-'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500 mb-1">Status</p>
                  {getStatusBadge(selectedOrder.status)}
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500 mb-1">Paiement</p>
                  {getPaymentBadge(selectedOrder.payment_status)}
                  {selectedOrder.payment_method && (
                    <span className="ml-2 text-sm text-gray-500">
                      ({selectedOrder.payment_method === 'card' ? 'Carte' : 
                        selectedOrder.payment_method === 'cash' ? 'Espèces' : 
                        selectedOrder.payment_method})
                    </span>
                  )}
                </div>
              </div>

              {/* Client */}
              {(selectedOrder.customer_name || selectedOrder.customer_phone || selectedOrder.customer_email) && (
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-600 mb-2">👤 Client</p>
                  {selectedOrder.customer_name && <p className="font-medium">{selectedOrder.customer_name}</p>}
                  {selectedOrder.customer_phone && <p className="text-gray-600">{selectedOrder.customer_phone}</p>}
                  {selectedOrder.customer_email && <p className="text-gray-600">{selectedOrder.customer_email}</p>}
                </div>
              )}

              {/* Offert reason */}
              {selectedOrder.is_offered && selectedOrder.offered_reason && (
                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-sm text-purple-600 mb-1">🎁 Raison offert</p>
                  <p className="font-medium">{selectedOrder.offered_reason}</p>
                </div>
              )}

              {/* Items */}
              <div>
                <h3 className="font-bold text-gray-900 mb-3">Articles</h3>
                <div className="space-y-2">
                  {selectedOrder.order_items.map(item => {
                    const options = item.options_selected || []
                    return (
                      <div key={item.id} className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">
                              {item.quantity}x {item.product_name}
                              {item.is_free && <span className="ml-2 text-green-600">🎁 Offert</span>}
                            </p>
                            {Array.isArray(options) && options.length > 0 && (
                              <div className="text-sm text-gray-500 mt-1">
                                {options.map((opt: any, idx: number) => (
                                  <div key={idx}>+ {opt.item_name}</div>
                                ))}
                              </div>
                            )}
                            {item.notes && (
                              <p className="text-sm text-yellow-600 mt-1">📝 {item.notes}</p>
                            )}
                          </div>
                          <p className="font-bold">{(item.line_total || 0).toFixed(2)}€</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Totaux */}
              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Sous-total</span>
                  <span>{(selectedOrder.subtotal || 0).toFixed(2)}€</span>
                </div>
                {selectedOrder.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Remise</span>
                    <span>-{selectedOrder.discount_amount.toFixed(2)}€</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>TVA</span>
                  <span>{(selectedOrder.vat_amount || selectedOrder.tax_amount || 0).toFixed(2)}€</span>
                </div>
                <div className="flex justify-between text-xl font-bold border-t border-gray-200 pt-2">
                  <span>Total</span>
                  <span className="text-orange-500">
                    {(selectedOrder.total_amount || selectedOrder.total || 0).toFixed(2)}€
                  </span>
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div className="bg-yellow-50 rounded-xl p-4">
                  <p className="text-sm text-yellow-600 mb-1">📝 Notes</p>
                  <p>{selectedOrder.notes}</p>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setSelectedOrder(null)}
                className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
              >
                Fermer
              </button>
              {selectedOrder.status === 'pending' && (
                <button
                  onClick={() => {
                    updateStatus(selectedOrder.id, 'preparing')
                    setSelectedOrder(null)
                  }}
                  className="flex-1 px-6 py-3 rounded-xl bg-blue-500 text-white font-semibold hover:bg-blue-600"
                >
                  🍳 Préparer
                </button>
              )}
              {selectedOrder.status === 'preparing' && (
                <button
                  onClick={() => {
                    updateStatus(selectedOrder.id, 'ready')
                    setSelectedOrder(null)
                  }}
                  className="flex-1 px-6 py-3 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600"
                >
                  ✅ Prêt
                </button>
              )}
              {selectedOrder.status === 'ready' && (
                <button
                  onClick={() => {
                    updateStatus(selectedOrder.id, 'completed')
                    setSelectedOrder(null)
                  }}
                  className="flex-1 px-6 py-3 rounded-xl bg-gray-500 text-white font-semibold hover:bg-gray-600"
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
