'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

// ==================== TYPES ====================

type Supplier = {
  id: string
  name: string
}

type Ingredient = {
  id: string
  name: string
  category: string | null
  unit: string
  stock_current: number | null
}

type SupplierProduct = {
  id: string
  supplier_id: string
  ingredient_id: string | null
  supplier_sku: string | null
  supplier_product_name: string
  package_quantity: number
  package_unit: string
  packaging_info: string | null
  unit_price: number
  vat_rate: number
  is_preferred: boolean
  is_available: boolean
  min_order_quantity: number
  last_price_update: string | null
  notes: string | null
  image_url: string | null
  supplier?: Supplier
  ingredient?: Ingredient
}

const PACKAGE_UNITS = ['pce', 'kg', 'g', 'L', 'ml', 'pack', 'boîte', 'carton']

// ==================== COMPONENT ====================

export default function SupplierProductsPage() {
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSupplier, setFilterSupplier] = useState<string>('')
  const [filterLinked, setFilterLinked] = useState<'all' | 'linked' | 'unlinked'>('all')
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<SupplierProduct | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<SupplierProduct | null>(null)
  
  // Form state
  const [form, setForm] = useState({
    supplier_id: '',
    supplier_sku: '',
    supplier_product_name: '',
    package_quantity: 1,
    package_unit: 'pce',
    packaging_info: '',
    unit_price: 0,
    vat_rate: 6,
    is_preferred: false,
    is_available: true,
    min_order_quantity: 1,
    notes: '',
    image_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  
  // Link modal state
  const [linkIngredientId, setLinkIngredientId] = useState<string>('')
  const [linkIsPreferred, setLinkIsPreferred] = useState(true)
  const [linkSearchQuery, setLinkSearchQuery] = useState('')

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    
    const [
      { data: productsData },
      { data: suppliersData },
      { data: ingredientsData }
    ] = await Promise.all([
      supabase.from('supplier_products')
        .select(`
          *,
          supplier:suppliers(id, name),
          ingredient:ingredients(id, name, category, unit, stock_current)
        `)
        .order('supplier_product_name'),
      supabase.from('suppliers')
        .select('id, name')
        .eq('establishment_id', establishmentId)
        .eq('is_active', true)
        .order('name'),
      supabase.from('ingredients')
        .select('id, name, category, unit, stock_current')
        .eq('establishment_id', establishmentId)
        .eq('is_active', true)
        .order('category')
        .order('name')
    ])
    
    setSupplierProducts(productsData || [])
    setSuppliers(suppliersData || [])
    setIngredients(ingredientsData || [])
    setLoading(false)
  }

  function openModal(product?: SupplierProduct) {
    if (product) {
      setEditingProduct(product)
      setForm({
        supplier_id: product.supplier_id,
        supplier_sku: product.supplier_sku || '',
        supplier_product_name: product.supplier_product_name,
        package_quantity: product.package_quantity,
        package_unit: product.package_unit,
        packaging_info: product.packaging_info || '',
        unit_price: product.unit_price,
        vat_rate: product.vat_rate,
        is_preferred: product.is_preferred,
        is_available: product.is_available,
        min_order_quantity: product.min_order_quantity,
        notes: product.notes || '',
        image_url: product.image_url || '',
      })
    } else {
      setEditingProduct(null)
      setForm({
        supplier_id: filterSupplier || '',
        supplier_sku: '',
        supplier_product_name: '',
        package_quantity: 1,
        package_unit: 'pce',
        packaging_info: '',
        unit_price: 0,
        vat_rate: 6,
        is_preferred: false,
        is_available: true,
        min_order_quantity: 1,
        notes: '',
        image_url: '',
      })
    }
    setFormError('')
    setShowModal(true)
  }

  function openLinkModal(product: SupplierProduct) {
    setSelectedProduct(product)
    setLinkIngredientId(product.ingredient_id || '')
    setLinkIsPreferred(product.is_preferred)
    setLinkSearchQuery('')
    setShowLinkModal(true)
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!form.supplier_product_name.trim()) { setFormError('Nom obligatoire'); return }
    if (!form.supplier_id) { setFormError('Fournisseur obligatoire'); return }
    
    setSaving(true)
    try {
      const data = {
        supplier_id: form.supplier_id,
        supplier_sku: form.supplier_sku || null,
        supplier_product_name: form.supplier_product_name,
        package_quantity: form.package_quantity,
        package_unit: form.package_unit,
        packaging_info: form.packaging_info || null,
        unit_price: form.unit_price,
        vat_rate: form.vat_rate,
        is_preferred: form.is_preferred,
        is_available: form.is_available,
        min_order_quantity: form.min_order_quantity,
        notes: form.notes || null,
        image_url: form.image_url || null,
      }
      
      if (editingProduct) {
        await supabase.from('supplier_products').update(data).eq('id', editingProduct.id)
      } else {
        await supabase.from('supplier_products').insert(data)
      }
      
      setShowModal(false)
      loadData()
    } catch (err: any) { setFormError(err.message) }
    finally { setSaving(false) }
  }

  async function saveLink() {
    if (!selectedProduct) return
    
    setSaving(true)
    try {
      // Si on définit comme préféré, d'abord retirer le statut préféré des autres produits pour cet ingrédient
      if (linkIsPreferred && linkIngredientId) {
        await supabase.from('supplier_products')
          .update({ is_preferred: false })
          .eq('ingredient_id', linkIngredientId)
          .neq('id', selectedProduct.id)
      }
      
      await supabase.from('supplier_products')
        .update({ 
          ingredient_id: linkIngredientId || null,
          is_preferred: linkIngredientId ? linkIsPreferred : false
        })
        .eq('id', selectedProduct.id)
      
      setShowLinkModal(false)
      loadData()
    } catch (err: any) { alert(err.message) }
    finally { setSaving(false) }
  }

  async function unlinkProduct(product: SupplierProduct) {
    if (!confirm(`Délier "${product.supplier_product_name}" de son ingrédient ?`)) return
    
    await supabase.from('supplier_products')
      .update({ ingredient_id: null, is_preferred: false })
      .eq('id', product.id)
    
    loadData()
  }

  async function toggleAvailable(product: SupplierProduct) {
    await supabase.from('supplier_products')
      .update({ is_available: !product.is_available })
      .eq('id', product.id)
    loadData()
  }

  async function deleteProduct(product: SupplierProduct) {
    if (!confirm(`Supprimer "${product.supplier_product_name}" ?`)) return
    await supabase.from('supplier_products').delete().eq('id', product.id)
    loadData()
  }

  // Filtrage
  const filteredProducts = supplierProducts.filter(p => {
    // Recherche
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const match = p.supplier_product_name.toLowerCase().includes(q) ||
                    p.supplier_sku?.toLowerCase().includes(q) ||
                    p.ingredient?.name.toLowerCase().includes(q)
      if (!match) return false
    }
    
    // Filtre fournisseur
    if (filterSupplier && p.supplier_id !== filterSupplier) return false
    
    // Filtre liaison
    if (filterLinked === 'linked' && !p.ingredient_id) return false
    if (filterLinked === 'unlinked' && p.ingredient_id) return false
    
    return true
  })

  // Stats
  const stats = {
    total: supplierProducts.length,
    linked: supplierProducts.filter(p => p.ingredient_id).length,
    unlinked: supplierProducts.filter(p => !p.ingredient_id).length,
    preferred: supplierProducts.filter(p => p.is_preferred).length,
  }

  // Grouper les ingrédients par catégorie pour le modal de liaison
  const ingredientsByCategory = ingredients.reduce((acc, ing) => {
    const cat = ing.category || 'Autres'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(ing)
    return acc
  }, {} as Record<string, Ingredient[]>)

  // Filtrer les ingrédients dans le modal de liaison
  const filteredIngredients = linkSearchQuery
    ? ingredients.filter(i => i.name.toLowerCase().includes(linkSearchQuery.toLowerCase()))
    : ingredients

  // Prix unitaire calculé
  function getUnitCost(product: SupplierProduct): string {
    if (product.package_quantity <= 0) return '-'
    const cost = product.unit_price / product.package_quantity
    return cost.toFixed(3) + '€'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/suppliers" className="text-gray-400 hover:text-gray-600">
              ← Fournisseurs
            </Link>
            <h1 className="text-2xl font-bold">📦 Catalogue Fournisseurs</h1>
          </div>
          <button onClick={() => openModal()} className="px-6 py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600">
            + Nouveau produit
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border">
            <p className="text-gray-500 text-sm">Total produits</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-green-200">
            <p className="text-green-600 text-sm">✓ Liés</p>
            <p className="text-2xl font-bold text-green-600">{stats.linked}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-red-200">
            <p className="text-red-600 text-sm">✗ Non liés</p>
            <p className="text-2xl font-bold text-red-600">{stats.unlinked}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-blue-200">
            <p className="text-blue-600 text-sm">⭐ Préférés</p>
            <p className="text-2xl font-bold text-blue-600">{stats.preferred}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 pb-4">
        <div className="bg-white rounded-xl p-4 flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="🔍 Rechercher..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200"
            />
          </div>
          
          <select
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            className="px-4 py-2 rounded-xl border border-gray-200"
          >
            <option value="">Tous les fournisseurs</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          
          <div className="flex gap-2">
            <button
              onClick={() => setFilterLinked('all')}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${
                filterLinked === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100'
              }`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilterLinked('linked')}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${
                filterLinked === 'linked' ? 'bg-green-500 text-white' : 'bg-gray-100'
              }`}
            >
              ✓ Liés
            </button>
            <button
              onClick={() => setFilterLinked('unlinked')}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${
                filterLinked === 'unlinked' ? 'bg-red-500 text-white' : 'bg-gray-100'
              }`}
            >
              ✗ Non liés
            </button>
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="px-6 pb-6">
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Produit fournisseur</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Fournisseur</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Conditionnement</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Prix HT</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Coût unit.</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">→ Ingrédient FritOS</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredProducts.map(product => (
                <tr key={product.id} className={`hover:bg-gray-50 ${!product.is_available ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">📦</div>
                      )}
                      <div>
                        <p className="font-medium">{product.supplier_product_name}</p>
                        {product.supplier_sku && (
                          <p className="text-xs text-gray-400">SKU: {product.supplier_sku}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {product.supplier?.name || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="font-medium">{product.package_quantity}</span>
                    <span className="text-gray-500"> {product.package_unit}</span>
                    {product.packaging_info && (
                      <p className="text-xs text-gray-400">{product.packaging_info}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-medium">{product.unit_price.toFixed(2)}€</span>
                    <p className="text-xs text-gray-400">{product.vat_rate}% TVA</p>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">
                    {getUnitCost(product)}
                  </td>
                  <td className="px-4 py-3">
                    {product.ingredient ? (
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-lg text-sm ${
                          product.is_preferred 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {product.is_preferred && '⭐ '}
                          {product.ingredient.name}
                        </span>
                        <button
                          onClick={() => unlinkProduct(product)}
                          className="text-red-400 hover:text-red-600 text-sm"
                          title="Délier"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openLinkModal(product)}
                        className="px-3 py-1 bg-orange-100 text-orange-600 rounded-lg text-sm hover:bg-orange-200"
                      >
                        🔗 Lier
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openLinkModal(product)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                        title="Lier/Modifier liaison"
                      >
                        🔗
                      </button>
                      <button
                        onClick={() => openModal(product)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                        title="Modifier"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => toggleAvailable(product)}
                        className={`p-2 hover:bg-gray-100 rounded-lg ${product.is_available ? 'text-green-500' : 'text-red-500'}`}
                        title={product.is_available ? 'Désactiver' : 'Activer'}
                      >
                        {product.is_available ? '✓' : '✗'}
                      </button>
                      <button
                        onClick={() => deleteProduct(product)}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-400"
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <span className="text-4xl block mb-2">📦</span>
                    Aucun produit fournisseur trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== MODAL EDITION ==================== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {editingProduct ? '✏️ Modifier le produit' : '➕ Nouveau produit fournisseur'}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">✕</button>
            </div>

            <form onSubmit={saveProduct} className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">{formError}</div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Fournisseur *</label>
                <select
                  value={form.supplier_id}
                  onChange={e => setForm({...form, supplier_id: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200"
                  required
                >
                  <option value="">Sélectionner...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nom du produit *</label>
                  <input
                    type="text"
                    value={form.supplier_product_name}
                    onChange={e => setForm({...form, supplier_product_name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">SKU / Référence</label>
                  <input
                    type="text"
                    value={form.supplier_sku}
                    onChange={e => setForm({...form, supplier_sku: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Qté par paquet</label>
                  <input
                    type="number"
                    step="0.001"
                    value={form.package_quantity}
                    onChange={e => setForm({...form, package_quantity: parseFloat(e.target.value) || 1})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Unité</label>
                  <select
                    value={form.package_unit}
                    onChange={e => setForm({...form, package_unit: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200"
                  >
                    {PACKAGE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Info conditionnement</label>
                  <input
                    type="text"
                    value={form.packaging_info}
                    onChange={e => setForm({...form, packaging_info: e.target.value})}
                    placeholder="ex: 44x80gr"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Prix HT (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.unit_price}
                    onChange={e => setForm({...form, unit_price: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">TVA (%)</label>
                  <select
                    value={form.vat_rate}
                    onChange={e => setForm({...form, vat_rate: parseFloat(e.target.value)})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200"
                  >
                    <option value={6}>6%</option>
                    <option value={12}>12%</option>
                    <option value={21}>21%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Qté min commande</label>
                  <input
                    type="number"
                    value={form.min_order_quantity}
                    onChange={e => setForm({...form, min_order_quantity: parseInt(e.target.value) || 1})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200"
                  />
                </div>
              </div>

              {form.package_quantity > 0 && form.unit_price > 0 && (
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-600">
                    💡 Coût unitaire: <strong>{(form.unit_price / form.package_quantity).toFixed(4)}€</strong> / {form.package_unit}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">URL Image</label>
                <input
                  type="url"
                  value={form.image_url}
                  onChange={e => setForm({...form, image_url: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({...form, notes: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200"
                  rows={2}
                />
              </div>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.is_available}
                  onChange={e => setForm({...form, is_available: e.target.checked})}
                  className="w-5 h-5 rounded"
                />
                <span>✅ Disponible</span>
              </label>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold">
                  Annuler
                </button>
                <button type="submit" disabled={saving} className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50">
                  {saving ? '...' : '💾 Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL LIAISON ==================== */}
      {showLinkModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">🔗 Lier à un ingrédient</h2>
              <p className="text-gray-500 mt-1">{selectedProduct.supplier_product_name}</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Recherche */}
              <input
                type="text"
                placeholder="🔍 Rechercher un ingrédient..."
                value={linkSearchQuery}
                onChange={e => setLinkSearchQuery(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200"
              />

              {/* Liste des ingrédients */}
              <div className="max-h-64 overflow-y-auto border rounded-xl">
                {/* Option "Aucun" */}
                <button
                  type="button"
                  onClick={() => setLinkIngredientId('')}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 ${
                    !linkIngredientId ? 'bg-gray-100' : ''
                  }`}
                >
                  <span className="w-5 h-5 border-2 rounded-full flex items-center justify-center">
                    {!linkIngredientId && <span className="w-3 h-3 bg-orange-500 rounded-full"></span>}
                  </span>
                  <span className="text-gray-500 italic">Aucun (délier)</span>
                </button>

                {/* Ingrédients filtrés */}
                {(linkSearchQuery ? filteredIngredients : Object.entries(ingredientsByCategory).flatMap(([cat, ings]) => [
                  { type: 'category' as const, name: cat },
                  ...ings.map(i => ({ type: 'ingredient' as const, ...i }))
                ])).map((item, idx) => {
                  if ('type' in item && item.type === 'category') {
                    return (
                      <div key={`cat-${idx}`} className="px-4 py-2 bg-gray-50 font-medium text-sm text-gray-500 border-t">
                        {item.name}
                      </div>
                    )
                  }
                  const ing = item as Ingredient
                  return (
                    <button
                      key={ing.id}
                      type="button"
                      onClick={() => setLinkIngredientId(ing.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 border-t ${
                        linkIngredientId === ing.id ? 'bg-orange-50' : ''
                      }`}
                    >
                      <span className="w-5 h-5 border-2 rounded-full flex items-center justify-center">
                        {linkIngredientId === ing.id && <span className="w-3 h-3 bg-orange-500 rounded-full"></span>}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium">{ing.name}</p>
                        {ing.category && <p className="text-xs text-gray-400">{ing.category}</p>}
                      </div>
                      <span className="text-sm text-gray-400">{ing.stock_current ?? 0} {ing.unit}</span>
                    </button>
                  )
                })}
              </div>

              {/* Option préféré */}
              {linkIngredientId && (
                <label className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
                  <input
                    type="checkbox"
                    checked={linkIsPreferred}
                    onChange={e => setLinkIsPreferred(e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                  <div>
                    <span className="font-medium">⭐ Fournisseur préféré</span>
                    <p className="text-sm text-gray-500">Utilisé par défaut pour les commandes</p>
                  </div>
                </label>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
                >
                  Annuler
                </button>
                <button
                  onClick={saveLink}
                  disabled={saving}
                  className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50"
                >
                  {saving ? '...' : '✓ Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
