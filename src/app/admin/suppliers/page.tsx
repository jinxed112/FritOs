'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Ingredient = {
  id: string
  name: string
  stock_current: number | null
  stock_min: number | null
  unit: string
}

type Supplier = {
  id: string
  name: string
  legal_name: string | null
  vat_number: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  phone: string | null
  email: string | null
  contact_name: string | null
  website: string | null
  min_order_amount: number | null
  delivery_days: number[] | null
  lead_time_days: number | null
  payment_terms: number | null
  notes: string | null
  is_active: boolean
  created_at: string
}

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [supplierIngredients, setSupplierIngredients] = useState<Ingredient[]>([])
  
  const [form, setForm] = useState({
    name: '', legal_name: '', vat_number: '', address: '', city: '',
    postal_code: '', phone: '', email: '', contact_name: '', website: '',
    min_order_amount: 0, delivery_days: [] as number[], lead_time_days: 0,
    payment_terms: 0, notes: '', is_active: true,
  })
  
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    
    const [{ data: suppliersData }, { data: ingredientsData }] = await Promise.all([
      supabase.from('suppliers').select('*').eq('establishment_id', establishmentId).order('name'),
      supabase.from('ingredients').select('id, name, stock_current, stock_min, unit, supplier_id')
        .eq('establishment_id', establishmentId),
    ])
    
    setSuppliers(suppliersData || [])
    setIngredients(ingredientsData || [])
    setLoading(false)
  }

  function openModal(supplier?: Supplier) {
    if (supplier) {
      setEditingSupplier(supplier)
      setForm({
        name: supplier.name, legal_name: supplier.legal_name || '',
        vat_number: supplier.vat_number || '', address: supplier.address || '',
        city: supplier.city || '', postal_code: supplier.postal_code || '',
        phone: supplier.phone || '', email: supplier.email || '',
        contact_name: supplier.contact_name || '', website: supplier.website || '',
        min_order_amount: supplier.min_order_amount || 0,
        delivery_days: supplier.delivery_days || [],
        lead_time_days: supplier.lead_time_days || 0,
        payment_terms: supplier.payment_terms || 0,
        notes: supplier.notes || '', is_active: supplier.is_active,
      })
    } else {
      setEditingSupplier(null)
      setForm({
        name: '', legal_name: '', vat_number: '', address: '', city: '',
        postal_code: '', phone: '', email: '', contact_name: '', website: '',
        min_order_amount: 0, delivery_days: [], lead_time_days: 0,
        payment_terms: 0, notes: '', is_active: true,
      })
    }
    setFormError('')
    setShowModal(true)
  }

  function openDetailModal(supplier: Supplier) {
    setSelectedSupplier(supplier)
    const suppIngredients = ingredients.filter((i: any) => i.supplier_id === supplier.id)
    setSupplierIngredients(suppIngredients)
    setShowDetailModal(true)
  }

  async function saveSupplier(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setFormError('Nom obligatoire'); return }
    setSaving(true)
    
    try {
      const data = {
        name: form.name, legal_name: form.legal_name || null,
        vat_number: form.vat_number || null, address: form.address || null,
        city: form.city || null, postal_code: form.postal_code || null,
        phone: form.phone || null, email: form.email || null,
        contact_name: form.contact_name || null, website: form.website || null,
        min_order_amount: form.min_order_amount || null,
        delivery_days: form.delivery_days.length > 0 ? form.delivery_days : null,
        lead_time_days: form.lead_time_days || null,
        payment_terms: form.payment_terms || null,
        notes: form.notes || null, is_active: form.is_active,
      }
      
      if (editingSupplier) {
        await supabase.from('suppliers').update(data).eq('id', editingSupplier.id)
      } else {
        await supabase.from('suppliers').insert({ ...data, establishment_id: establishmentId })
      }
      
      setShowModal(false)
      loadData()
    } catch (err: any) { setFormError(err.message) }
    finally { setSaving(false) }
  }

  async function toggleActive(supplier: Supplier) {
    await supabase.from('suppliers').update({ is_active: !supplier.is_active }).eq('id', supplier.id)
    loadData()
  }

  async function deleteSupplier(supplier: Supplier) {
    const hasIngredients = ingredients.some((i: any) => i.supplier_id === supplier.id)
    if (hasIngredients) {
      alert('Ce fournisseur a des ingrédients associés. Supprimez d\'abord les liens.')
      return
    }
    if (!confirm(`Supprimer "${supplier.name}" ?`)) return
    await supabase.from('suppliers').delete().eq('id', supplier.id)
    loadData()
  }

  function toggleDeliveryDay(day: number) {
    setForm(prev => ({
      ...prev,
      delivery_days: prev.delivery_days.includes(day)
        ? prev.delivery_days.filter(d => d !== day)
        : [...prev.delivery_days, day].sort()
    }))
  }

  // Filtrage
  const filteredSuppliers = suppliers.filter(s => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return s.name.toLowerCase().includes(q) ||
           s.contact_name?.toLowerCase().includes(q) ||
           s.email?.toLowerCase().includes(q) ||
           s.phone?.includes(q)
  })

  // Count ingredients per supplier
  function getIngredientCount(supplierId: string): number {
    return ingredients.filter((i: any) => i.supplier_id === supplierId).length
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fournisseurs</h1>
          <p className="text-gray-500">{suppliers.length} fournisseur(s)</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/suppliers/products"
            className="bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-600 flex items-center gap-2">
            📦 Catalogue produits
          </Link>
          <button onClick={() => openModal()}
            className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600">
            ➕ Nouveau fournisseur
          </button>
        </div>
      </div>

      {/* Recherche */}
      <div className="mb-6">
        <input type="text" placeholder="🔍 Rechercher par nom, contact, email, téléphone..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          className="w-full max-w-md px-4 py-2 rounded-xl border border-gray-200" />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">🚚</span>
          <p className="text-gray-500">Aucun fournisseur</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map(supplier => {
            const ingCount = getIngredientCount(supplier.id)
            return (
              <div key={supplier.id} onClick={() => openDetailModal(supplier)}
                className={`bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow cursor-pointer ${!supplier.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center text-2xl">
                    🏭
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 truncate">{supplier.name}</h3>
                    {supplier.contact_name && (
                      <p className="text-sm text-gray-500">👤 {supplier.contact_name}</p>
                    )}
                    {supplier.phone && (
                      <p className="text-sm text-gray-500">📞 {supplier.phone}</p>
                    )}
                    {supplier.email && (
                      <p className="text-sm text-gray-500 truncate">📧 {supplier.email}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-500">{ingCount} ingrédient{ingCount > 1 ? 's' : ''}</span>
                  </div>
                  {supplier.delivery_days && supplier.delivery_days.length > 0 && (
                    <div className="flex gap-1">
                      {supplier.delivery_days.map(d => (
                        <span key={d} className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">
                          {DAYS[d]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                {(supplier.city || supplier.min_order_amount) && (
                  <div className="mt-2 text-xs text-gray-400">
                    {supplier.city && <span>📍 {supplier.city}</span>}
                    {supplier.min_order_amount && supplier.min_order_amount > 0 && (
                      <span className="ml-3">Min: {supplier.min_order_amount}€</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal création/édition */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b"><h2 className="text-2xl font-bold">{editingSupplier ? 'Modifier' : 'Nouveau'} fournisseur</h2></div>
            <form onSubmit={saveSupplier} className="p-6 space-y-4">
              {formError && <div className="bg-red-50 text-red-700 p-3 rounded-xl">{formError}</div>}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nom commercial *</label>
                  <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Raison sociale</label>
                  <input type="text" value={form.legal_name} onChange={e => setForm({...form, legal_name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">N° TVA</label>
                  <input type="text" value={form.vat_number} onChange={e => setForm({...form, vat_number: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" placeholder="BE0123456789" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Contact</label>
                  <input type="text" value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Téléphone</label>
                  <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Adresse</label>
                <input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Code postal</label>
                  <input type="text" value={form.postal_code} onChange={e => setForm({...form, postal_code: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Ville</label>
                  <input type="text" value={form.city} onChange={e => setForm({...form, city: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Jours de livraison</label>
                <div className="flex gap-2">
                  {DAYS.map((day, idx) => (
                    <button key={idx} type="button" onClick={() => toggleDeliveryDay(idx)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium ${
                        form.delivery_days.includes(idx) ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Min commande (€)</label>
                  <input type="number" step="0.01" value={form.min_order_amount}
                    onChange={e => setForm({...form, min_order_amount: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Délai (jours)</label>
                  <input type="number" value={form.lead_time_days}
                    onChange={e => setForm({...form, lead_time_days: parseInt(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Paiement (jours)</label>
                  <input type="number" value={form.payment_terms}
                    onChange={e => setForm({...form, payment_terms: parseInt(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200" rows={2} />
              </div>

              <label className="flex items-center gap-3">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className="w-5 h-5 rounded" />
                <span>✅ Actif</span>
              </label>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold">Annuler</button>
                <button type="submit" disabled={saving} className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50">
                  {saving ? '...' : '💾 Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal détail */}
      {showDetailModal && selectedSupplier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center text-2xl">🏭</div>
                <div>
                  <h2 className="text-xl font-bold">{selectedSupplier.name}</h2>
                  {selectedSupplier.legal_name && (
                    <p className="text-sm text-gray-500">{selectedSupplier.legal_name}</p>
                  )}
                </div>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">✕</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Contact */}
              <div className="space-y-2">
                {selectedSupplier.contact_name && (
                  <p className="flex items-center gap-2"><span className="text-gray-400">👤</span> {selectedSupplier.contact_name}</p>
                )}
                {selectedSupplier.phone && (
                  <p className="flex items-center gap-2">
                    <span className="text-gray-400">📞</span>
                    <a href={`tel:${selectedSupplier.phone}`} className="text-blue-600 hover:underline">{selectedSupplier.phone}</a>
                  </p>
                )}
                {selectedSupplier.email && (
                  <p className="flex items-center gap-2">
                    <span className="text-gray-400">📧</span>
                    <a href={`mailto:${selectedSupplier.email}`} className="text-blue-600 hover:underline">{selectedSupplier.email}</a>
                  </p>
                )}
                {(selectedSupplier.address || selectedSupplier.city) && (
                  <p className="flex items-center gap-2">
                    <span className="text-gray-400">📍</span>
                    {[selectedSupplier.address, selectedSupplier.postal_code, selectedSupplier.city].filter(Boolean).join(', ')}
                  </p>
                )}
                {selectedSupplier.vat_number && (
                  <p className="flex items-center gap-2"><span className="text-gray-400">🏢</span> TVA: {selectedSupplier.vat_number}</p>
                )}
              </div>

              {/* Infos livraison */}
              <div className="bg-blue-50 rounded-xl p-4">
                <h3 className="font-medium mb-2">📦 Infos livraison</h3>
                <div className="space-y-1 text-sm">
                  {selectedSupplier.delivery_days && selectedSupplier.delivery_days.length > 0 && (
                    <p>Jours: {selectedSupplier.delivery_days.map(d => DAYS[d]).join(', ')}</p>
                  )}
                  {selectedSupplier.lead_time_days && selectedSupplier.lead_time_days > 0 && (
                    <p>Délai: {selectedSupplier.lead_time_days} jour(s)</p>
                  )}
                  {selectedSupplier.min_order_amount && selectedSupplier.min_order_amount > 0 && (
                    <p>Commande min: {selectedSupplier.min_order_amount}€</p>
                  )}
                  {selectedSupplier.payment_terms && selectedSupplier.payment_terms > 0 && (
                    <p>Paiement: {selectedSupplier.payment_terms} jours</p>
                  )}
                </div>
              </div>

              {/* Lien vers catalogue */}
              <Link href={`/admin/suppliers/products?supplier=${selectedSupplier.id}`}
                className="block w-full text-center px-4 py-3 bg-blue-100 text-blue-700 rounded-xl font-medium hover:bg-blue-200">
                📦 Voir le catalogue produits ({supplierIngredients.length} ingrédients liés)
              </Link>

              {/* Ingrédients */}
              {supplierIngredients.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">🥬 Ingrédients ({supplierIngredients.length})</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {supplierIngredients.map(ing => {
                      const isLow = ing.stock_min && ing.stock_current !== null && ing.stock_current <= ing.stock_min
                      return (
                        <div key={ing.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                          <span>{ing.name}</span>
                          <span className={`text-sm ${isLow ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            {ing.stock_current ?? 0} {ing.unit}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedSupplier.notes && (
                <div className="bg-yellow-50 rounded-xl p-4">
                  <p className="text-sm text-yellow-600 mb-1">📝 Notes</p>
                  <p>{selectedSupplier.notes}</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowDetailModal(false)} className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold">Fermer</button>
              <button onClick={() => { setShowDetailModal(false); openModal(selectedSupplier) }}
                className="flex-1 px-6 py-3 rounded-xl bg-blue-500 text-white font-semibold hover:bg-blue-600">✏️ Modifier</button>
              <button onClick={() => { toggleActive(selectedSupplier); setShowDetailModal(false) }}
                className={`px-6 py-3 rounded-xl font-semibold ${selectedSupplier.is_active ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-600'}`}>
                {selectedSupplier.is_active ? '🚫' : '✅'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
