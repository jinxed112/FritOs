'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Customer = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  loyalty_points: number
  total_spent: number
  total_orders: number
  accepts_marketing: boolean
  marketing_channel: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

type LoyaltyTransaction = {
  id: string
  customer_id: string
  order_id: string | null
  transaction_type: string
  points: number
  balance_after: number
  description: string | null
  created_at: string
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [loyaltyHistory, setLoyaltyHistory] = useState<LoyaltyTransaction[]>([])
  
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    loyalty_points: 0,
    accepts_marketing: false,
    notes: '',
    is_active: true,
  })
  
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers() {
    setLoading(true)
    
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('establishment_id', establishmentId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erreur:', error)
    } else {
      setCustomers(data || [])
    }
    
    setLoading(false)
  }

  async function loadLoyaltyHistory(customerId: string) {
    const { data } = await supabase
      .from('loyalty_transactions')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20)

    setLoyaltyHistory(data || [])
  }

  function openModal(customer?: Customer) {
    if (customer) {
      setEditingCustomer(customer)
      setForm({
        first_name: customer.first_name || '',
        last_name: customer.last_name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        loyalty_points: customer.loyalty_points || 0,
        accepts_marketing: customer.accepts_marketing || false,
        notes: customer.notes || '',
        is_active: customer.is_active,
      })
    } else {
      setEditingCustomer(null)
      setForm({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        loyalty_points: 0,
        accepts_marketing: false,
        notes: '',
        is_active: true,
      })
    }
    setFormError('')
    setShowModal(true)
  }

  async function openDetailModal(customer: Customer) {
    setSelectedCustomer(customer)
    await loadLoyaltyHistory(customer.id)
    setShowDetailModal(true)
  }

  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    
    if (!form.first_name.trim() && !form.last_name.trim() && !form.email && !form.phone) {
      setFormError('Au moins un nom, email ou téléphone est requis')
      return
    }
    
    setSaving(true)
    
    try {
      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update({
            first_name: form.first_name || null,
            last_name: form.last_name || null,
            email: form.email || null,
            phone: form.phone || null,
            loyalty_points: form.loyalty_points,
            accepts_marketing: form.accepts_marketing,
            notes: form.notes || null,
            is_active: form.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingCustomer.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('customers')
          .insert({
            establishment_id: establishmentId,
            first_name: form.first_name || null,
            last_name: form.last_name || null,
            email: form.email || null,
            phone: form.phone || null,
            loyalty_points: form.loyalty_points,
            accepts_marketing: form.accepts_marketing,
            notes: form.notes || null,
            is_active: form.is_active,
          })
        
        if (error) throw error
      }
      
      setShowModal(false)
      loadCustomers()
    } catch (error: any) {
      console.error('Erreur:', error)
      setFormError(error.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function adjustLoyaltyPoints(customerId: string, points: number, reason: string) {
    const customer = customers.find(c => c.id === customerId)
    if (!customer) return

    const newBalance = customer.loyalty_points + points

    // Update customer
    const { error: updateError } = await supabase
      .from('customers')
      .update({ 
        loyalty_points: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId)

    if (updateError) {
      alert('Erreur: ' + updateError.message)
      return
    }

    // Add transaction
    const { error: txError } = await supabase
      .from('loyalty_transactions')
      .insert({
        customer_id: customerId,
        transaction_type: points > 0 ? 'credit' : 'debit',
        points: points,
        balance_after: newBalance,
        description: reason,
      })

    if (txError) {
      console.error('Erreur transaction:', txError)
    }

    // Reload
    loadCustomers()
    if (selectedCustomer?.id === customerId) {
      loadLoyaltyHistory(customerId)
      setSelectedCustomer({ ...customer, loyalty_points: newBalance })
    }
  }

  async function deleteCustomer(customer: Customer) {
    if (!confirm(`Supprimer ${customer.first_name} ${customer.last_name} ?`)) return
    
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', customer.id)
    
    if (!error) loadCustomers()
  }

  // Filtrage
  const filteredCustomers = customers.filter(customer => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      customer.first_name?.toLowerCase().includes(q) ||
      customer.last_name?.toLowerCase().includes(q) ||
      customer.email?.toLowerCase().includes(q) ||
      customer.phone?.includes(q)
    )
  })

  // Stats
  const stats = {
    total: customers.length,
    active: customers.filter(c => c.is_active).length,
    totalRevenue: customers.reduce((sum, c) => sum + (c.total_spent || 0), 0),
    avgBasket: customers.length > 0 
      ? customers.reduce((sum, c) => sum + (c.total_spent || 0), 0) / 
        Math.max(1, customers.reduce((sum, c) => sum + (c.total_orders || 0), 0))
      : 0,
  }

  function getCustomerName(customer: Customer) {
    const parts = [customer.first_name, customer.last_name].filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : 'Sans nom'
  }

  function getTierBadge(totalSpent: number) {
    if (totalSpent >= 500) return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">🥇 Gold</span>
    if (totalSpent >= 200) return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">🥈 Silver</span>
    if (totalSpent >= 50) return <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">🥉 Bronze</span>
    return null
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500">{customers.length} client(s) enregistré(s)</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2"
        >
          ➕ Nouveau client
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
          <p className="text-sm text-blue-600">Total clients</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{stats.active}</p>
          <p className="text-sm text-green-600">Actifs</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-purple-600">{stats.totalRevenue.toFixed(0)}€</p>
          <p className="text-sm text-purple-600">CA total</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-orange-600">{stats.avgBasket.toFixed(2)}€</p>
          <p className="text-sm text-orange-600">Panier moyen</p>
        </div>
      </div>

      {/* Recherche */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="🔍 Rechercher par nom, email, téléphone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-md px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div>
      ) : filteredCustomers.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">👥</span>
          <p className="text-gray-500">Aucun client trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map(customer => (
            <div
              key={customer.id}
              className={`bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow cursor-pointer ${
                !customer.is_active ? 'opacity-50' : ''
              }`}
              onClick={() => openDetailModal(customer)}
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center text-2xl font-bold text-orange-600">
                  {(customer.first_name?.[0] || customer.last_name?.[0] || '?').toUpperCase()}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-gray-900 truncate">{getCustomerName(customer)}</h3>
                    {getTierBadge(customer.total_spent || 0)}
                  </div>
                  
                  {customer.email && (
                    <p className="text-sm text-gray-500 truncate">📧 {customer.email}</p>
                  )}
                  {customer.phone && (
                    <p className="text-sm text-gray-500">📞 {customer.phone}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-gray-900">{customer.total_orders || 0}</p>
                  <p className="text-xs text-gray-500">Commandes</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-orange-500">⭐ {customer.loyalty_points || 0}</p>
                  <p className="text-xs text-gray-500">Points</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-green-600">{(customer.total_spent || 0).toFixed(0)}€</p>
                  <p className="text-xs text-gray-500">Dépensé</p>
                </div>
              </div>
              
              {customer.accepts_marketing && (
                <div className="mt-3 text-xs text-green-600">
                  ✅ Accepte le marketing
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal création/édition */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold">
                {editingCustomer ? 'Modifier le client' : 'Nouveau client'}
              </h2>
            </div>
            
            <form onSubmit={saveCustomer} className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Prénom</label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={e => setForm({ ...form, first_name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={e => setForm({ ...form, last_name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Points fidélité</label>
                <input
                  type="number"
                  value={form.loyalty_points}
                  onChange={e => setForm({ ...form, loyalty_points: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  rows={2}
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.accepts_marketing}
                    onChange={e => setForm({ ...form, accepts_marketing: e.target.checked })}
                    className="w-5 h-5 rounded"
                  />
                  <span>📧 Accepte les communications marketing</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                    className="w-5 h-5 rounded"
                  />
                  <span>✅ Client actif</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-50"
                >
                  {saving ? 'Sauvegarde...' : '💾 Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal détail */}
      {showDetailModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center text-2xl font-bold text-orange-600">
                  {(selectedCustomer.first_name?.[0] || selectedCustomer.last_name?.[0] || '?').toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{getCustomerName(selectedCustomer)}</h2>
                  {getTierBadge(selectedCustomer.total_spent || 0)}
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">{selectedCustomer.total_orders || 0}</p>
                  <p className="text-xs text-gray-500">Commandes</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-orange-600">⭐ {selectedCustomer.loyalty_points || 0}</p>
                  <p className="text-xs text-gray-500">Points</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{(selectedCustomer.total_spent || 0).toFixed(2)}€</p>
                  <p className="text-xs text-gray-500">Dépensé</p>
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-2">
                {selectedCustomer.email && (
                  <p className="flex items-center gap-2">
                    <span className="text-gray-400">📧</span>
                    <a href={`mailto:${selectedCustomer.email}`} className="text-blue-600 hover:underline">
                      {selectedCustomer.email}
                    </a>
                  </p>
                )}
                {selectedCustomer.phone && (
                  <p className="flex items-center gap-2">
                    <span className="text-gray-400">📞</span>
                    <a href={`tel:${selectedCustomer.phone}`} className="text-blue-600 hover:underline">
                      {selectedCustomer.phone}
                    </a>
                  </p>
                )}
              </div>

              {/* Ajuster points */}
              <div className="bg-orange-50 rounded-xl p-4">
                <p className="font-medium mb-3">⭐ Ajuster les points fidélité</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => adjustLoyaltyPoints(selectedCustomer.id, -10, 'Ajustement manuel')}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                  >
                    -10
                  </button>
                  <button
                    onClick={() => adjustLoyaltyPoints(selectedCustomer.id, 10, 'Bonus fidélité')}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                  >
                    +10
                  </button>
                  <button
                    onClick={() => adjustLoyaltyPoints(selectedCustomer.id, 50, 'Bonus exceptionnel')}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                  >
                    +50
                  </button>
                  <button
                    onClick={() => adjustLoyaltyPoints(selectedCustomer.id, 100, 'Offre spéciale')}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                  >
                    +100
                  </button>
                </div>
              </div>

              {/* Historique fidélité */}
              {loyaltyHistory.length > 0 && (
                <div>
                  <h3 className="font-bold mb-3">📜 Historique fidélité</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {loyaltyHistory.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                        <div>
                          <span className={tx.points > 0 ? 'text-green-600' : 'text-red-600'}>
                            {tx.points > 0 ? '+' : ''}{tx.points} pts
                          </span>
                          <span className="text-gray-400 ml-2">{tx.description || tx.transaction_type}</span>
                        </div>
                        <span className="text-gray-400 text-xs">
                          {new Date(tx.created_at).toLocaleDateString('fr-BE')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedCustomer.notes && (
                <div className="bg-yellow-50 rounded-xl p-4">
                  <p className="text-sm text-yellow-600 mb-1">📝 Notes</p>
                  <p>{selectedCustomer.notes}</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
              >
                Fermer
              </button>
              <button
                onClick={() => {
                  setShowDetailModal(false)
                  openModal(selectedCustomer)
                }}
                className="flex-1 px-6 py-3 rounded-xl bg-blue-500 text-white font-semibold hover:bg-blue-600"
              >
                ✏️ Modifier
              </button>
              <button
                onClick={() => {
                  deleteCustomer(selectedCustomer)
                  setShowDetailModal(false)
                }}
                className="px-6 py-3 rounded-xl bg-red-100 text-red-600 font-semibold hover:bg-red-200"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
