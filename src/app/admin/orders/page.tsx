'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentEstablishment } from '@/lib/establishment/client'
import AdminInvoiceModal from '@/components/AdminInvoiceModal'

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

  // Invoice selection state
  const [selectedForInvoice, setSelectedForInvoice] = useState<Set<string>>(new Set())
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)

  function toggleSelectForInvoice(orderId: string, e: React.MouseEvent | React.ChangeEvent) {
    e.stopPropagation()
    setSelectedForInvoice(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  const supabase = createClient()
  const { establishment } = useCurrentEstablishment()

  useEffect(() => {
    if (!establishment) return

    loadOrders()

    // Realtime subscription scoped to the active establishment.
    const channel = supabase
      .channel(`orders-changes-${establishment.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `establishment_id=eq.${establishment.id}` },
        () => loadOrders()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [filterPeriod, establishment?.id])

  async function loadOrders() {
    if (!establishment) return
    setLoading(true)

    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('establishment_id', establishment.id)
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
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 lg:mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Commandes</h1>
          <p className="text-gray-500 text-sm">{filteredOrders.length} commande(s)</p>
        </div>
        {selectedForInvoice.size > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedForInvoice(new Set())}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Désélectionner
            </button>
            <button
              onClick={() => setInvoiceModalOpen(true)}
              className="bg-[#E63329] text-white font-bold px-5 py-3 rounded-xl hover:bg-[#c12722] shadow-lg"
            >
              📄 Facturer {selectedForInvoice.size} commande{selectedForInvoice.size > 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>

      {/* Invoice modal (admin) */}
      {establishment && invoiceModalOpen && (
        <AdminInvoiceModal
          establishmentId={establishment.id}
          orders={filteredOrders
            .filter(o => selectedForInvoice.has(o.id))
            .map(o => ({
              id: o.id,
              order_number: o.order_number,
              order_type: o.order_type,
              total: o.total,
            }))}
          isOpen={invoiceModalOpen}
          onClose={() => {
            setInvoiceModalOpen(false)
            setSelectedForInvoice(new Set())
          }}
        />
      )}

      {/* Stats rapides */}
      <div className="flex gap-3 lg:gap-4 mb-4 lg:mb-6 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0">
        <div className="bg-orange-50 rounded-xl p-3 lg:p-4 text-center min-w-[90px] flex-1">
          <p className="text-2xl lg:text-3xl font-bold text-orange-600">{stats.pending}</p>
          <p className="text-xs lg:text-sm text-orange-600">En attente</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 lg:p-4 text-center min-w-[90px] flex-1">
          <p className="text-2xl lg:text-3xl font-bold text-blue-600">{stats.preparing}</p>
          <p className="text-xs lg:text-sm text-blue-600">En prép.</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3 lg:p-4 text-center min-w-[90px] flex-1">
          <p className="text-2xl lg:text-3xl font-bold text-green-600">{stats.ready}</p>
          <p className="text-xs lg:text-sm text-green-600">Prêtes</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 lg:p-4 text-center min-w-[90px] flex-1">
          <p className="text-2xl lg:text-3xl font-bold text-gray-600">{stats.completed}</p>
          <p className="text-xs lg:text-sm text-gray-600">Terminées</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-3 lg:p-4 text-center min-w-[100px] flex-1">
          <p className="text-xl lg:text-3xl font-bold text-purple-600">{stats.revenue.toFixed(2)}€</p>
          <p className="text-xs lg:text-sm text-purple-600">CA période</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="space-y-3 lg:space-y-0 lg:flex lg:items-center lg:gap-4 mb-4 lg:mb-6">
        {/* Période */}
        <select
          value={filterPeriod}
          onChange={(e) => setFilterPeriod(e.target.value as FilterPeriod)}
          className="w-full lg:w-auto px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="today">Aujourd'hui</option>
          <option value="yesterday">Hier</option>
          <option value="week">7 derniers jours</option>
          <option value="month">30 derniers jours</option>
          <option value="all">Tout</option>
        </select>

        {/* Status */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0">
          {(['all', 'pending', 'preparing', 'ready', 'completed', 'cancelled'] as FilterStatus[]).map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 lg:px-4 py-2 rounded-xl font-medium transition-colors text-sm whitespace-nowrap ${
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
          placeholder="🔍 N° commande, nom, tél..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full lg:flex-1 lg:max-w-xs px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
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
          {/* Desktop table */}
          <table className="w-full hidden lg:table">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-4 w-10"></th>
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
                  className={`hover:bg-gray-50 cursor-pointer ${order.is_offered ? 'bg-purple-50' : ''} ${selectedForInvoice.has(order.id) ? 'bg-yellow-50' : ''}`}
                  onClick={() => setSelectedOrder(order)}
                >
                  <td className="px-3 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedForInvoice.has(order.id)}
                      onChange={(e) => toggleSelectForInvoice(order.id, e)}
                      className="w-5 h-5 accent-[#E63329] cursor-pointer"
                      title="Sélectionner pour facturation"
                    />
                  </td>
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

          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-gray-100">
            {filteredOrders.map(order => (
              <div
                key={order.id}
                className={`p-4 active:bg-gray-50 ${order.is_offered ? 'bg-purple-50' : ''}`}
                onClick={() => setSelectedOrder(order)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg">{order.order_number}</span>
                    <span className="text-lg">{order.eat_in ? '🍽️' : '🥡'}</span>
                    {order.is_offered && <span>🎁</span>}
                  </div>
                  <span className="font-bold text-lg">{(order.total_amount || order.total || 0).toFixed(2)}€</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(order.status)}
                    {getPaymentBadge(order.payment_status)}
                    <span className="text-xs text-gray-400">{formatDate(order.created_at)}</span>
                  </div>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    {order.status === 'pending' && (
                      <button
                        onClick={() => updateStatus(order.id, 'preparing')}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm"
                      >
                        🍳
                      </button>
                    )}
                    {order.status === 'preparing' && (
                      <button
                        onClick={() => updateStatus(order.id, 'ready')}
                        className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm"
                      >
                        ✅
                      </button>
                    )}
                    {order.status === 'ready' && (
                      <button
                        onClick={() => updateStatus(order.id, 'completed')}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"
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
                        className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm"
                      >
                        ❌
                      </button>
                    )}
                  </div>
                </div>
                {(order.customer_name || order.customer_phone) && (
                  <p className="text-xs text-gray-500 mt-1">
                    👤 {order.customer_name || order.customer_phone}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal ticket */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-50 lg:p-4">
          <div className="bg-white rounded-t-2xl lg:rounded-2xl w-full lg:max-w-md h-[95vh] lg:h-auto lg:max-h-[90vh] flex flex-col">
            {/* Header sticky */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 text-sm"
                >
                  ✕
                </button>
                <div>
                  <p className="font-bold text-lg">#{selectedOrder.order_number}</p>
                  <p className="text-xs text-gray-500">{formatDate(selectedOrder.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedOrder.status)}
              </div>
            </div>

            {/* Ticket content */}
            <div className="flex-1 overflow-y-auto">
              {/* Info bar */}
              <div className="px-4 py-3 bg-gray-50 flex items-center justify-between text-sm border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <span>{selectedOrder.eat_in ? '🍽️ Sur place' : '🥡 Emporter'}</span>
                  <span className="text-gray-400">•</span>
                  <span>
                    {selectedOrder.source === 'kiosk' ? '🖥️ Borne' : 
                     selectedOrder.source === 'counter' ? '📋 Comptoir' : 
                     selectedOrder.source === 'online' ? '🌐 En ligne' :
                     selectedOrder.source || '-'}
                  </span>
                </div>
                <div>
                  {getPaymentBadge(selectedOrder.payment_status)}
                </div>
              </div>

              {/* Client */}
              {(selectedOrder.customer_name || selectedOrder.customer_phone) && (
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 text-sm">
                  <span className="text-gray-400">👤</span>
                  <span className="font-medium">{selectedOrder.customer_name || ''}</span>
                  {selectedOrder.customer_phone && (
                    <span className="text-gray-500">{selectedOrder.customer_phone}</span>
                  )}
                </div>
              )}

              {/* Offert */}
              {selectedOrder.is_offered && (
                <div className="px-4 py-2 bg-purple-50 text-purple-700 text-sm font-medium">
                  🎁 Commande offerte {selectedOrder.offered_reason ? `— ${selectedOrder.offered_reason}` : ''}
                </div>
              )}

              {/* ═══ ARTICLES (TICKET STYLE) ═══ */}
              <div className="px-4 py-3">
                <div className="space-y-1">
                  {selectedOrder.order_items.map(item => {
                    // Parse options_selected (handle double-encoded JSONB)
                    let options: any[] = []
                    try {
                      let raw = item.options_selected
                      if (typeof raw === 'string') {
                        raw = JSON.parse(raw)
                        if (typeof raw === 'string') raw = JSON.parse(raw)
                      }
                      if (Array.isArray(raw)) options = raw
                    } catch {}

                    const unitPrice = item.unit_price || 0
                    const optionsTotal = item.options_total || 0

                    return (
                      <div key={item.id} className="py-2 border-b border-dashed border-gray-200 last:border-0">
                        {/* Product line */}
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <span className="font-bold">{item.quantity}x </span>
                            <span className="font-medium">{item.product_name}</span>
                            {item.is_free && <span className="ml-1 text-green-600 text-xs">🎁</span>}
                          </div>
                          <span className="font-medium ml-2 tabular-nums">
                            {(unitPrice * item.quantity).toFixed(2)}€
                          </span>
                        </div>

                        {/* Options/supplements */}
                        {options.length > 0 && (
                          <div className="mt-1 ml-4 space-y-0.5">
                            {options.map((opt: any, idx: number) => {
                              const optPrice = parseFloat(opt.price || opt.item_price || 0)
                              const optQty = opt.quantity || 1
                              return (
                                <div key={idx} className="flex justify-between text-sm text-gray-600">
                                  <span>
                                    ＋ {opt.item_name || opt.name || opt.option_name || '?'}
                                    {optQty > 1 && <span className="text-gray-400"> x{optQty}</span>}
                                  </span>
                                  {optPrice > 0 && (
                                    <span className="text-gray-500 tabular-nums ml-2">
                                      {(optPrice * optQty * item.quantity).toFixed(2)}€
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Notes */}
                        {item.notes && (
                          <p className="mt-1 ml-4 text-xs text-yellow-600 italic">📝 {item.notes}</p>
                        )}

                        {/* Line total if options */}
                        {options.length > 0 && (
                          <div className="flex justify-between mt-1 text-sm font-semibold text-gray-800">
                            <span className="ml-4 text-gray-400">Sous-total article</span>
                            <span className="tabular-nums">{(item.line_total || 0).toFixed(2)}€</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ═══ TOTAUX ═══ */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Sous-total</span>
                    <span className="tabular-nums">{(selectedOrder.subtotal || 0).toFixed(2)}€</span>
                  </div>
                  {selectedOrder.discount_amount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Remise</span>
                      <span className="tabular-nums">-{selectedOrder.discount_amount.toFixed(2)}€</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>TVA</span>
                    <span className="tabular-nums">{(selectedOrder.vat_amount || selectedOrder.tax_amount || 0).toFixed(2)}€</span>
                  </div>
                </div>
                <div className="flex justify-between text-xl font-bold mt-2 pt-2 border-t border-gray-300">
                  <span>Total</span>
                  <span className="text-orange-500 tabular-nums">
                    {(selectedOrder.total_amount || selectedOrder.total || 0).toFixed(2)}€
                  </span>
                </div>
                {selectedOrder.payment_method && (
                  <p className="text-xs text-gray-400 mt-1 text-right">
                    Payé par {selectedOrder.payment_method === 'card' ? 'carte bancaire' : 
                      selectedOrder.payment_method === 'cash' ? 'espèces' : 
                      selectedOrder.payment_method}
                  </p>
                )}
              </div>

              {/* Notes commande */}
              {selectedOrder.notes && (
                <div className="px-4 py-3 bg-yellow-50 border-t border-yellow-100">
                  <p className="text-sm text-yellow-700">📝 {selectedOrder.notes}</p>
                </div>
              )}
            </div>

            {/* Footer actions sticky */}
            <div className="p-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => setSelectedOrder(null)}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-semibold text-sm"
              >
                Fermer
              </button>
              {selectedOrder.status === 'pending' && (
                <button
                  onClick={() => {
                    updateStatus(selectedOrder.id, 'preparing')
                    setSelectedOrder(null)
                  }}
                  className="flex-1 px-4 py-3 rounded-xl bg-blue-500 text-white font-semibold hover:bg-blue-600 text-sm"
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
                  className="flex-1 px-4 py-3 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 text-sm"
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
                  className="flex-1 px-4 py-3 rounded-xl bg-gray-500 text-white font-semibold hover:bg-gray-600 text-sm"
                >
                  🏁 Terminer
                </button>
              )}
              {selectedOrder.status !== 'cancelled' && (
                <button
                  onClick={() => {
                    const isLate = ['ready', 'completed'].includes(selectedOrder.status)
                    const msg = isLate
                      ? `Annuler la commande ${selectedOrder.order_number} ?\n\nCette commande est déjà ${selectedOrder.status === 'ready' ? 'prête' : 'terminée'} — elle sera retirée du CA. À utiliser pour un doublon ou un client no-show. Confirmer ?`
                      : 'Annuler cette commande ?'
                    if (confirm(msg)) {
                      updateStatus(selectedOrder.id, 'cancelled')
                      setSelectedOrder(null)
                    }
                  }}
                  className="px-4 py-3 rounded-xl bg-red-100 text-red-700 font-semibold hover:bg-red-200 text-sm"
                >
                  ❌ Annuler
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}