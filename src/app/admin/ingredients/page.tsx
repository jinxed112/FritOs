'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Supplier = {
  id: string
  name: string
}

type Ingredient = {
  id: string
  name: string
  description: string | null
  category: string | null
  sku: string | null
  image_url: string | null
  unit: string
  allergens: string[] | null
  purchase_unit: string | null
  purchase_quantity: number | null
  purchase_price: number | null
  vat_rate: number | null
  stock_min: number | null
  stock_current: number | null
  stock_unit: string | null
  supplier_id: string | null
  is_active: boolean
  created_at: string
  supplier?: Supplier
}

const ALLERGENS = [
  { id: 'gluten', label: 'Gluten', icon: '🌾' },
  { id: 'crustaceans', label: 'Crustacés', icon: '🦐' },
  { id: 'eggs', label: 'Œufs', icon: '🥚' },
  { id: 'fish', label: 'Poisson', icon: '🐟' },
  { id: 'peanuts', label: 'Arachides', icon: '🥜' },
  { id: 'soy', label: 'Soja', icon: '🫘' },
  { id: 'milk', label: 'Lait', icon: '🥛' },
  { id: 'nuts', label: 'Fruits à coque', icon: '🌰' },
  { id: 'celery', label: 'Céleri', icon: '🥬' },
  { id: 'mustard', label: 'Moutarde', icon: '🟡' },
  { id: 'sesame', label: 'Sésame', icon: '⚪' },
  { id: 'sulfites', label: 'Sulfites', icon: '🍷' },
  { id: 'lupin', label: 'Lupin', icon: '🌸' },
  { id: 'mollusks', label: 'Mollusques', icon: '🦪' },
]

const UNITS = ['kg', 'g', 'l', 'ml', 'unité', 'pièce', 'pack', 'boîte', 'sachet']

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterAllergen, setFilterAllergen] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [showStockModal, setShowStockModal] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null)
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null)
  const [stockAdjustment, setStockAdjustment] = useState(0)
  
  const [form, setForm] = useState({
    name: '', description: '', category: '', sku: '', unit: 'kg',
    allergens: [] as string[], purchase_unit: '', purchase_quantity: 1,
    purchase_price: 0, vat_rate: 21, stock_min: 0, stock_current: 0,
    stock_unit: '', supplier_id: '', is_active: true,
  })
  
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    
    const [{ data: ingredientsData }, { data: suppliersData }] = await Promise.all([
      supabase.from('ingredients').select('*, supplier:suppliers(id, name)')
        .eq('establishment_id', establishmentId).order('name'),
      supabase.from('suppliers').select('id, name')
        .eq('establishment_id', establishmentId).eq('is_active', true).order('name'),
    ])
    
    setIngredients(ingredientsData || [])
    setSuppliers(suppliersData || [])
    setLoading(false)
  }

  function openModal(ingredient?: Ingredient) {
    if (ingredient) {
      setEditingIngredient(ingredient)
      setForm({
        name: ingredient.name, description: ingredient.description || '',
        category: ingredient.category || '', sku: ingredient.sku || '',
        unit: ingredient.unit || 'kg', allergens: ingredient.allergens || [],
        purchase_unit: ingredient.purchase_unit || '',
        purchase_quantity: ingredient.purchase_quantity || 1,
        purchase_price: ingredient.purchase_price || 0,
        vat_rate: ingredient.vat_rate || 21,
        stock_min: ingredient.stock_min || 0,
        stock_current: ingredient.stock_current || 0,
        stock_unit: ingredient.stock_unit || '',
        supplier_id: ingredient.supplier_id || '',
        is_active: ingredient.is_active,
      })
    } else {
      setEditingIngredient(null)
      setForm({
        name: '', description: '', category: '', sku: '', unit: 'kg',
        allergens: [], purchase_unit: '', purchase_quantity: 1,
        purchase_price: 0, vat_rate: 21, stock_min: 0, stock_current: 0,
        stock_unit: '', supplier_id: '', is_active: true,
      })
    }
    setFormError('')
    setShowModal(true)
  }

  function openStockModal(ingredient: Ingredient) {
    setSelectedIngredient(ingredient)
    setStockAdjustment(0)
    setShowStockModal(true)
  }

  async function saveIngredient(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setFormError('Nom obligatoire'); return }
    setSaving(true)
    
    try {
      const data = {
        name: form.name, description: form.description || null,
        category: form.category || null, sku: form.sku || null,
        unit: form.unit, allergens: form.allergens.length > 0 ? form.allergens : null,
        purchase_unit: form.purchase_unit || null,
        purchase_quantity: form.purchase_quantity || null,
        purchase_price: form.purchase_price || null,
        vat_rate: form.vat_rate || null,
        stock_min: form.stock_min || null,
        stock_current: form.stock_current || null,
        stock_unit: form.stock_unit || null,
        supplier_id: form.supplier_id || null,
        is_active: form.is_active,
      }
      
      if (editingIngredient) {
        await supabase.from('ingredients').update(data).eq('id', editingIngredient.id)
      } else {
        await supabase.from('ingredients').insert({ ...data, establishment_id: establishmentId })
      }
      
      setShowModal(false)
      loadData()
    } catch (err: any) { setFormError(err.message) }
    finally { setSaving(false) }
  }

  async function adjustStock() {
    if (!selectedIngredient || stockAdjustment === 0) return
    
    const newStock = (selectedIngredient.stock_current || 0) + stockAdjustment
    
    // Update stock
    await supabase.from('ingredients')
      .update({ stock_current: newStock })
      .eq('id', selectedIngredient.id)
    
    // Log movement
    await supabase.from('stock_movements').insert({
      ingredient_id: selectedIngredient.id,
      movement_type: stockAdjustment > 0 ? 'in' : 'out',
      quantity: Math.abs(stockAdjustment),
      unit: selectedIngredient.unit,
      reason: 'Ajustement manuel',
    })
    
    setShowStockModal(false)
    loadData()
  }

  async function deleteIngredient(ingredient: Ingredient) {
    if (!confirm(`Supprimer "${ingredient.name}" ?`)) return
    await supabase.from('ingredients').delete().eq('id', ingredient.id)
    loadData()
  }

  function toggleAllergen(allergenId: string) {
    setForm(prev => ({
      ...prev,
      allergens: prev.allergens.includes(allergenId)
        ? prev.allergens.filter(a => a !== allergenId)
        : [...prev.allergens, allergenId]
    }))
  }

  // Filtrage
  const filteredIngredients = ingredients.filter(ing => {
    if (searchQuery && !ing.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterAllergen && (!ing.allergens || !ing.allergens.includes(filterAllergen))) return false
    return true
  })

  // Stats
  const lowStockItems = ingredients.filter(i => 
    i.stock_min && i.stock_current !== null && i.stock_current <= i.stock_min
  )
  const totalValue = ingredients.reduce((sum, i) => 
    sum + ((i.stock_current || 0) * (i.purchase_price || 0) / (i.purchase_quantity || 1)), 0
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ingrédients</h1>
          <p className="text-gray-500">{ingredients.length} ingrédient(s)</p>
        </div>
        <button onClick={() => openModal()}
          className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600">
          ➕ Nouvel ingrédient
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{ingredients.length}</p>
          <p className="text-sm text-blue-600">Ingrédients</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-purple-600">{totalValue.toFixed(2)}€</p>
          <p className="text-sm text-purple-600">Valeur stock</p>
        </div>
        <div className={`rounded-xl p-4 text-center ${lowStockItems.length > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <p className={`text-3xl font-bold ${lowStockItems.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {lowStockItems.length}
          </p>
          <p className={`text-sm ${lowStockItems.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
            Stock bas
          </p>
        </div>
      </div>

      {/* Alerte stock bas */}
      {lowStockItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="font-bold text-red-700 mb-2">⚠️ Stock bas ({lowStockItems.length})</p>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map(item => (
              <span key={item.id} className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm">
                {item.name}: {item.stock_current} {item.unit}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <input
          type="text" placeholder="🔍 Rechercher..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          className="flex-1 max-w-xs px-4 py-2 rounded-xl border border-gray-200"
        />
        <select value={filterAllergen} onChange={e => setFilterAllergen(e.target.value)}
          className="px-4 py-2 rounded-xl border border-gray-200">
          <option value="">Tous allergènes</option>
          {ALLERGENS.map(a => (
            <option key={a.id} value={a.id}>{a.icon} {a.label}</option>
          ))}
        </select>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div>
      ) : filteredIngredients.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">🥬</span>
          <p className="text-gray-500">Aucun ingrédient</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Nom</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Allergènes</th>
                <th className="text-center px-6 py-4 font-semibold text-gray-600">Stock</th>
                <th className="text-right px-6 py-4 font-semibold text-gray-600">Prix achat</th>
                <th className="text-right px-6 py-4 font-semibold text-gray-600">Valeur</th>
                <th className="text-right px-6 py-4 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredIngredients.map(ing => {
                const isLowStock = ing.stock_min && ing.stock_current !== null && ing.stock_current <= ing.stock_min
                const unitCost = (ing.purchase_price || 0) / (ing.purchase_quantity || 1)
                const totalVal = (ing.stock_current || 0) * unitCost
                
                return (
                  <tr key={ing.id} className={`hover:bg-gray-50 ${!ing.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="font-medium">{ing.name}</div>
                      {ing.supplier && <div className="text-sm text-gray-400">🚚 {ing.supplier.name}</div>}
                      {ing.sku && <div className="text-xs text-gray-400">SKU: {ing.sku}</div>}
                    </td>
                    <td className="px-6 py-4">
                      {ing.allergens && ing.allergens.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {ing.allergens.map(a => {
                            const allergen = ALLERGENS.find(x => x.id === a)
                            return allergen ? (
                              <span key={a} title={allergen.label} className="text-lg">{allergen.icon}</span>
                            ) : null
                          })}
                        </div>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => openStockModal(ing)}
                        className={`px-3 py-1 rounded-full font-medium ${
                          isLowStock ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}>
                        {ing.stock_current ?? 0} {ing.unit}
                      </button>
                      {ing.stock_min && (
                        <div className="text-xs text-gray-400 mt-1">min: {ing.stock_min}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {ing.purchase_price ? (
                        <div>
                          <div>{ing.purchase_price.toFixed(2)}€</div>
                          <div className="text-xs text-gray-400">
                            /{ing.purchase_quantity || 1} {ing.purchase_unit || ing.unit}
                          </div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      {totalVal > 0 ? `${totalVal.toFixed(2)}€` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => openModal(ing)} className="p-2 hover:bg-gray-100 rounded-lg">✏️</button>
                      <button onClick={() => deleteIngredient(ing)} className="p-2 hover:bg-red-100 rounded-lg">🗑️</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal création/édition */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b"><h2 className="text-2xl font-bold">{editingIngredient ? 'Modifier' : 'Nouvel'} ingrédient</h2></div>
            <form onSubmit={saveIngredient} className="p-6 space-y-4">
              {formError && <div className="bg-red-50 text-red-700 p-3 rounded-xl">{formError}</div>}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nom *</label>
                  <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">SKU</label>
                  <input type="text" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Unité</label>
                  <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Stock actuel</label>
                  <input type="number" step="0.01" value={form.stock_current}
                    onChange={e => setForm({...form, stock_current: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Seuil alerte</label>
                  <input type="number" step="0.01" value={form.stock_min}
                    onChange={e => setForm({...form, stock_min: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Prix achat (€)</label>
                  <input type="number" step="0.01" value={form.purchase_price}
                    onChange={e => setForm({...form, purchase_price: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Qté achat</label>
                  <input type="number" step="0.01" value={form.purchase_quantity}
                    onChange={e => setForm({...form, purchase_quantity: parseFloat(e.target.value) || 1})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Unité achat</label>
                  <input type="text" value={form.purchase_unit} placeholder="ex: carton"
                    onChange={e => setForm({...form, purchase_unit: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Fournisseur</label>
                <select value={form.supplier_id} onChange={e => setForm({...form, supplier_id: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200">
                  <option value="">Aucun</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Allergènes</label>
                <div className="flex flex-wrap gap-2">
                  {ALLERGENS.map(a => (
                    <button key={a.id} type="button" onClick={() => toggleAllergen(a.id)}
                      className={`px-3 py-2 rounded-xl text-sm flex items-center gap-1 ${
                        form.allergens.includes(a.id) ? 'bg-red-100 text-red-700 border-2 border-red-300' : 'bg-gray-100 text-gray-600'
                      }`}>
                      {a.icon} {a.label}
                    </button>
                  ))}
                </div>
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

      {/* Modal ajustement stock */}
      {showStockModal && selectedIngredient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">📦 Ajuster le stock</h2></div>
            <div className="p-6 space-y-4">
              <div className="text-center">
                <p className="text-gray-500">{selectedIngredient.name}</p>
                <p className="text-3xl font-bold mt-2">
                  {selectedIngredient.stock_current ?? 0} {selectedIngredient.unit}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Ajustement (+/-)</label>
                <input type="number" step="0.01" value={stockAdjustment}
                  onChange={e => setStockAdjustment(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-center text-xl" />
              </div>
              
              <div className="flex gap-2 justify-center">
                {[-10, -1, 1, 10].map(n => (
                  <button key={n} onClick={() => setStockAdjustment(prev => prev + n)}
                    className={`px-4 py-2 rounded-lg font-medium ${n > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {n > 0 ? '+' : ''}{n}
                  </button>
                ))}
              </div>
              
              {stockAdjustment !== 0 && (
                <div className="text-center p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-500">Nouveau stock: </span>
                  <span className="font-bold">{((selectedIngredient.stock_current || 0) + stockAdjustment).toFixed(2)} {selectedIngredient.unit}</span>
                </div>
              )}
              
              <div className="flex gap-3">
                <button onClick={() => setShowStockModal(false)} className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold">Annuler</button>
                <button onClick={adjustStock} disabled={stockAdjustment === 0}
                  className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50">
                  ✓ Valider
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
