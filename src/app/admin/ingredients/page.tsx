'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// ==================== TYPES ====================

type Supplier = {
  id: string
  name: string
}

type Allergen = {
  id: string
  code: string
  name_fr: string
  emoji: string
}

type IngredientAllergen = {
  allergen_id: string
  is_trace: boolean
  allergen: Allergen
}

type Ingredient = {
  id: string
  name: string
  description: string | null
  category: string | null
  sku: string | null
  image_url: string | null
  unit: string
  purchase_unit: string | null
  purchase_quantity: number | null
  purchase_price: number | null
  vat_rate: number | null
  stock_min: number | null
  stock_current: number | null
  stock_unit: string | null
  supplier_id: string | null
  is_available: boolean
  is_active: boolean
  created_at: string
  supplier?: Supplier
  ingredient_allergens?: IngredientAllergen[]
  linked_products_count?: number
}

type Category = {
  id: string
  name: string
  product_count: number
}

type Product = {
  id: string
  name: string
  is_available: boolean
  category_id: string
  category_name: string
}

const CATEGORIES = [
  'Viandes & Snacks',
  'Pains & Buns',
  'Fromages',
  'Sauces',
  'Légumes & Crudités',
  'Viandes Fraîches',
  'Autres'
]

const UNITS = ['kg', 'g', 'L', 'ml', 'pce', 'pack', 'boîte', 'sachet']

// ==================== COMPONENT ====================

export default function IngredientsPage() {
  const [activeTab, setActiveTab] = useState<'ingredients' | 'liaisons'>('ingredients')
  
  // Ingredients state
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [allergens, setAllergens] = useState<Allergen[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [showInactive, setShowInactive] = useState(false)
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [showStockModal, setShowStockModal] = useState(false)
  const [showLinkedProductsModal, setShowLinkedProductsModal] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null)
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null)
  const [linkedProducts, setLinkedProducts] = useState<Product[]>([])
  const [stockAdjustment, setStockAdjustment] = useState(0)
  
  // Form state
  const [form, setForm] = useState({
    name: '', description: '', category: '', sku: '', unit: 'kg',
    allergens: [] as { allergen_id: string, is_trace: boolean }[],
    purchase_unit: '', purchase_quantity: 1, purchase_price: 0, vat_rate: 21,
    stock_min: 0, stock_current: 0, stock_unit: '', supplier_id: '',
    is_available: true, is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Liaisons state
  const [productCategories, setProductCategories] = useState<Category[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [selectedIngredientForLink, setSelectedIngredientForLink] = useState<string>('')
  const [selectedCategoryForLink, setSelectedCategoryForLink] = useState<string>('')
  const [selectedProductsForLink, setSelectedProductsForLink] = useState<Set<string>>(new Set())
  const [linkMode, setLinkMode] = useState<'category' | 'products'>('category')

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    
    const [
      { data: ingredientsData },
      { data: suppliersData },
      { data: allergensData },
      { data: linksData }
    ] = await Promise.all([
      supabase.from('ingredients')
        .select(`
          *,
          supplier:suppliers(id, name),
          ingredient_allergens(allergen_id, is_trace, allergen:allergens(id, code, name_fr, emoji))
        `)
        .eq('establishment_id', establishmentId)
        .order('category')
        .order('name'),
      supabase.from('suppliers')
        .select('id, name')
        .eq('establishment_id', establishmentId)
        .eq('is_active', true)
        .order('name'),
      supabase.from('allergens')
        .select('id, code, name_fr, emoji')
        .order('name_fr'),
      supabase.from('product_ingredients')
        .select('ingredient_id')
    ])
    
    // Compter les liens par ingrédient
    const linkCounts: Record<string, number> = {}
    linksData?.forEach(l => {
      linkCounts[l.ingredient_id] = (linkCounts[l.ingredient_id] || 0) + 1
    })
    
    setIngredients((ingredientsData || []).map(ing => ({
      ...ing,
      linked_products_count: linkCounts[ing.id] || 0
    })))
    setSuppliers(suppliersData || [])
    setAllergens(allergensData || [])
    setLoading(false)
    
    // Charger aussi les catégories et produits pour l'onglet liaisons
    loadProductsData()
  }

  async function loadProductsData() {
    const [{ data: categoriesData }, { data: productsData }] = await Promise.all([
      supabase.from('categories')
        .select('id, name')
        .eq('establishment_id', establishmentId)
        .eq('is_active', true)
        .order('display_order'),
      supabase.from('products')
        .select('id, name, is_available, category_id, category:categories(name)')
        .eq('establishment_id', establishmentId)
        .eq('is_active', true)
        .order('name')
    ])
    
    // Compter produits par catégorie
    const counts: Record<string, number> = {}
    productsData?.forEach(p => {
      if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1
    })
    
    setProductCategories((categoriesData || []).map(c => ({
      ...c,
      product_count: counts[c.id] || 0
    })))
    
    setAllProducts((productsData || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      is_available: p.is_available,
      category_id: p.category_id,
      category_name: p.category?.name || 'Sans catégorie'
    })))
  }

  // ==================== CRUD FUNCTIONS ====================

  function openModal(ingredient?: Ingredient) {
    if (ingredient) {
      setEditingIngredient(ingredient)
      setForm({
        name: ingredient.name,
        description: ingredient.description || '',
        category: ingredient.category || '',
        sku: ingredient.sku || '',
        unit: ingredient.unit || 'kg',
        allergens: (ingredient.ingredient_allergens || []).map(ia => ({
          allergen_id: ia.allergen_id,
          is_trace: ia.is_trace
        })),
        purchase_unit: ingredient.purchase_unit || '',
        purchase_quantity: ingredient.purchase_quantity || 1,
        purchase_price: ingredient.purchase_price || 0,
        vat_rate: ingredient.vat_rate || 21,
        stock_min: ingredient.stock_min || 0,
        stock_current: ingredient.stock_current || 0,
        stock_unit: ingredient.stock_unit || '',
        supplier_id: ingredient.supplier_id || '',
        is_available: ingredient.is_available ?? true,
        is_active: ingredient.is_active,
      })
    } else {
      setEditingIngredient(null)
      setForm({
        name: '', description: '', category: '', sku: '', unit: 'kg',
        allergens: [], purchase_unit: '', purchase_quantity: 1,
        purchase_price: 0, vat_rate: 21, stock_min: 0, stock_current: 0,
        stock_unit: '', supplier_id: '', is_available: true, is_active: true,
      })
    }
    setFormError('')
    setShowModal(true)
  }

  async function saveIngredient(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setFormError('Nom obligatoire'); return }
    setSaving(true)
    
    try {
      const data = {
        name: form.name,
        description: form.description || null,
        category: form.category || null,
        sku: form.sku || null,
        unit: form.unit,
        purchase_unit: form.purchase_unit || null,
        purchase_quantity: form.purchase_quantity || null,
        purchase_price: form.purchase_price || null,
        vat_rate: form.vat_rate || null,
        stock_min: form.stock_min || null,
        stock_current: form.stock_current || null,
        stock_unit: form.stock_unit || null,
        supplier_id: form.supplier_id || null,
        is_available: form.is_available,
        is_active: form.is_active,
      }
      
      let ingredientId = editingIngredient?.id
      
      if (editingIngredient) {
        await supabase.from('ingredients').update(data).eq('id', editingIngredient.id)
      } else {
        const { data: newIng } = await supabase.from('ingredients')
          .insert({ ...data, establishment_id: establishmentId })
          .select('id')
          .single()
        ingredientId = newIng?.id
      }
      
      // Gérer les allergènes
      if (ingredientId) {
        await supabase.from('ingredient_allergens').delete().eq('ingredient_id', ingredientId)
        
        if (form.allergens.length > 0) {
          await supabase.from('ingredient_allergens').insert(
            form.allergens.map(a => ({
              ingredient_id: ingredientId,
              allergen_id: a.allergen_id,
              is_trace: a.is_trace
            }))
          )
        }
      }
      
      setShowModal(false)
      loadData()
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleAvailability(ingredient: Ingredient) {
    const newStatus = !ingredient.is_available
    await supabase.from('ingredients').update({ is_available: newStatus }).eq('id', ingredient.id)
    setIngredients(prev => prev.map(ing => 
      ing.id === ingredient.id ? { ...ing, is_available: newStatus } : ing
    ))
  }

  async function toggleActive(ingredient: Ingredient) {
    const newStatus = !ingredient.is_active
    await supabase.from('ingredients').update({ is_active: newStatus }).eq('id', ingredient.id)
    setIngredients(prev => prev.map(ing => 
      ing.id === ingredient.id ? { ...ing, is_active: newStatus } : ing
    ))
  }

  async function deleteIngredient(ingredient: Ingredient) {
    if (!confirm(`Supprimer "${ingredient.name}" ?`)) return
    await supabase.from('ingredients').delete().eq('id', ingredient.id)
    loadData()
  }

  function openStockModal(ingredient: Ingredient) {
    setSelectedIngredient(ingredient)
    setStockAdjustment(0)
    setShowStockModal(true)
  }

  async function adjustStock() {
    if (!selectedIngredient || stockAdjustment === 0) return
    
    const newStock = (selectedIngredient.stock_current || 0) + stockAdjustment
    
    await supabase.from('ingredients')
      .update({ stock_current: newStock })
      .eq('id', selectedIngredient.id)
    
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

  async function loadLinkedProducts(ingredient: Ingredient) {
    const { data } = await supabase
      .from('product_ingredients')
      .select(`product:products(id, name, is_available, category:categories(name))`)
      .eq('ingredient_id', ingredient.id)
    
    setLinkedProducts((data || []).map((pi: any) => ({
      id: pi.product.id,
      name: pi.product.name,
      is_available: pi.product.is_available,
      category_id: '',
      category_name: pi.product.category?.name || 'Sans catégorie'
    })))
    setSelectedIngredient(ingredient)
    setShowLinkedProductsModal(true)
  }

  async function unlinkProduct(productId: string) {
    if (!selectedIngredient) return
    await supabase.from('product_ingredients')
      .delete()
      .eq('product_id', productId)
      .eq('ingredient_id', selectedIngredient.id)
    
    setLinkedProducts(prev => prev.filter(p => p.id !== productId))
    loadData()
  }

  // ==================== ALLERGEN TOGGLE ====================

  function toggleAllergen(allergenId: string) {
    const existing = form.allergens.find(a => a.allergen_id === allergenId)
    
    if (!existing) {
      setForm({ ...form, allergens: [...form.allergens, { allergen_id: allergenId, is_trace: false }] })
    } else if (!existing.is_trace) {
      setForm({
        ...form,
        allergens: form.allergens.map(a => 
          a.allergen_id === allergenId ? { ...a, is_trace: true } : a
        )
      })
    } else {
      setForm({ ...form, allergens: form.allergens.filter(a => a.allergen_id !== allergenId) })
    }
  }

  function getAllergenState(allergenId: string): 'none' | 'contains' | 'trace' {
    const existing = form.allergens.find(a => a.allergen_id === allergenId)
    if (!existing) return 'none'
    return existing.is_trace ? 'trace' : 'contains'
  }

  // ==================== LIAISONS FUNCTIONS ====================

  async function linkToCategory() {
    if (!selectedIngredientForLink || !selectedCategoryForLink) {
      alert('Sélectionnez un ingrédient et une catégorie')
      return
    }
    
    const productsInCategory = allProducts.filter(p => p.category_id === selectedCategoryForLink)
    
    if (productsInCategory.length === 0) {
      alert('Aucun produit dans cette catégorie')
      return
    }
    
    const links = productsInCategory.map(p => ({
      product_id: p.id,
      ingredient_id: selectedIngredientForLink,
      is_essential: true
    }))
    
    const { error } = await supabase
      .from('product_ingredients')
      .upsert(links, { onConflict: 'product_id,ingredient_id' })
    
    if (error) {
      alert('Erreur: ' + error.message)
    } else {
      alert(`✅ ${productsInCategory.length} produit(s) lié(s)`)
      loadData()
      setSelectedCategoryForLink('')
    }
  }

  async function linkToProducts() {
    if (!selectedIngredientForLink || selectedProductsForLink.size === 0) {
      alert('Sélectionnez un ingrédient et au moins un produit')
      return
    }
    
    const links = Array.from(selectedProductsForLink).map(productId => ({
      product_id: productId,
      ingredient_id: selectedIngredientForLink,
      is_essential: true
    }))
    
    const { error } = await supabase
      .from('product_ingredients')
      .upsert(links, { onConflict: 'product_id,ingredient_id' })
    
    if (error) {
      alert('Erreur: ' + error.message)
    } else {
      alert(`✅ ${selectedProductsForLink.size} produit(s) lié(s)`)
      loadData()
      setSelectedProductsForLink(new Set())
    }
  }

  // ==================== FILTERS & HELPERS ====================

  const filteredIngredients = ingredients.filter(ing => {
    if (!showInactive && !ing.is_active) return false
    if (searchQuery && !ing.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterCategory && ing.category !== filterCategory) return false
    return true
  })

  const lowStockItems = ingredients.filter(i => 
    i.is_active && i.stock_min && i.stock_current !== null && i.stock_current <= i.stock_min
  )
  
  const totalValue = ingredients.reduce((sum, i) => 
    sum + ((i.stock_current || 0) * (i.purchase_price || 0) / (i.purchase_quantity || 1)), 0
  )

  const stats = {
    total: ingredients.filter(i => i.is_active).length,
    available: ingredients.filter(i => i.is_active && i.is_available).length,
    unavailable: ingredients.filter(i => i.is_active && !i.is_available).length,
    inactive: ingredients.filter(i => !i.is_active).length
  }

  const filteredProductsForLink = selectedCategoryForLink 
    ? allProducts.filter(p => p.category_id === selectedCategoryForLink)
    : allProducts

  function renderAllergens(ingredientAllergens?: IngredientAllergen[]) {
    if (!ingredientAllergens || ingredientAllergens.length === 0) {
      return <span className="text-gray-300">-</span>
    }
    
    return (
      <div className="flex gap-1 flex-wrap">
        {ingredientAllergens.filter(ia => !ia.is_trace).map(ia => (
          <span key={ia.allergen_id} title={ia.allergen.name_fr} className="text-lg">
            {ia.allergen.emoji}
          </span>
        ))}
        {ingredientAllergens.filter(ia => ia.is_trace).map(ia => (
          <span key={ia.allergen_id} title={`Traces: ${ia.allergen.name_fr}`} className="text-lg opacity-40">
            {ia.allergen.emoji}
          </span>
        ))}
      </div>
    )
  }

  // ==================== RENDER ====================

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🥬 Ingrédients</h1>
          <p className="text-gray-500">{stats.total} ingrédient(s) actif(s)</p>
        </div>
        <button onClick={() => openModal()}
          className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600">
          ➕ Nouvel ingrédient
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('ingredients')}
          className={`px-6 py-3 rounded-xl font-semibold transition-colors ${
            activeTab === 'ingredients' 
              ? 'bg-orange-500 text-white' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          📋 Liste des ingrédients
        </button>
        <button
          onClick={() => setActiveTab('liaisons')}
          className={`px-6 py-3 rounded-xl font-semibold transition-colors ${
            activeTab === 'liaisons' 
              ? 'bg-orange-500 text-white' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          🔗 Liaisons produits
        </button>
      </div>

      {/* ==================== ONGLET INGRÉDIENTS ==================== */}
      {activeTab === 'ingredients' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
              <p className="text-sm text-blue-600">Total actifs</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{stats.available}</p>
              <p className="text-sm text-green-600">Disponibles</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-red-600">{stats.unavailable}</p>
              <p className="text-sm text-red-600">En rupture</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-purple-600">{totalValue.toFixed(0)}€</p>
              <p className="text-sm text-purple-600">Valeur stock</p>
            </div>
            <div className={`rounded-xl p-4 text-center ${lowStockItems.length > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
              <p className={`text-3xl font-bold ${lowStockItems.length > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                {lowStockItems.length}
              </p>
              <p className={`text-sm ${lowStockItems.length > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                Stock bas
              </p>
            </div>
          </div>

          {/* Alerte stock bas */}
          {lowStockItems.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
              <p className="font-bold text-orange-700 mb-2">⚠️ Stock bas ({lowStockItems.length})</p>
              <div className="flex flex-wrap gap-2">
                {lowStockItems.slice(0, 10).map(item => (
                  <span key={item.id} className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm">
                    {item.name}: {item.stock_current} {item.unit}
                  </span>
                ))}
                {lowStockItems.length > 10 && (
                  <span className="text-orange-600 text-sm">+{lowStockItems.length - 10} autres</span>
                )}
              </div>
            </div>
          )}

          {/* Filtres */}
          <div className="flex gap-4 mb-6 flex-wrap items-center">
            <input
              type="text" placeholder="🔍 Rechercher..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="flex-1 max-w-xs px-4 py-2 rounded-xl border border-gray-200"
            />
            <select 
              value={filterCategory} 
              onChange={e => setFilterCategory(e.target.value)}
              className="px-4 py-2 rounded-xl border border-gray-200"
            >
              <option value="">Toutes catégories</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 cursor-pointer bg-gray-100 px-4 py-2 rounded-xl">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">Voir inactifs ({stats.inactive})</span>
            </label>
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
                    <th className="text-center px-6 py-4 font-semibold text-gray-600">Produits</th>
                    <th className="text-center px-6 py-4 font-semibold text-gray-600">Dispo</th>
                    <th className="text-right px-6 py-4 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredIngredients.map(ing => {
                    const isLowStock = ing.stock_min && ing.stock_current !== null && ing.stock_current <= ing.stock_min
                    
                    return (
                      <tr key={ing.id} className={`hover:bg-gray-50 ${!ing.is_active ? 'bg-gray-50 opacity-60' : ''} ${!ing.is_available && ing.is_active ? 'bg-red-50' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{ing.name}</span>
                            {!ing.is_active && (
                              <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded">Inactif</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-400">
                            {ing.category || 'Sans catégorie'}
                            {ing.supplier && <span> • 🚚 {ing.supplier.name}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {renderAllergens(ing.ingredient_allergens)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button onClick={() => openStockModal(ing)}
                            className={`px-3 py-1 rounded-full font-medium ${
                              isLowStock ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}>
                            {ing.stock_current ?? 0} {ing.unit}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {ing.linked_products_count && ing.linked_products_count > 0 ? (
                            <button 
                              onClick={() => loadLinkedProducts(ing)}
                              className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm hover:bg-blue-200"
                            >
                              {ing.linked_products_count}
                            </button>
                          ) : (
                            <span className="text-gray-300">0</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => toggleAvailability(ing)}
                            className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                              ing.is_available
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                          >
                            {ing.is_available ? '✓ Dispo' : '✕ Rupture'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => toggleActive(ing)} 
                            className="p-2 hover:bg-gray-100 rounded-lg"
                            title={ing.is_active ? 'Masquer' : 'Réactiver'}
                          >
                            {ing.is_active ? '👁️' : '👁️‍🗨️'}
                          </button>
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
        </>
      )}

      {/* ==================== ONGLET LIAISONS ==================== */}
      {activeTab === 'liaisons' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Panel gauche: Créer liaisons */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl font-bold mb-6">🔗 Lier un ingrédient aux produits</h2>
            
            {/* Sélection ingrédient */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                1. Sélectionner l'ingrédient
              </label>
              <select
                value={selectedIngredientForLink}
                onChange={(e) => setSelectedIngredientForLink(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200"
              >
                <option value="">-- Choisir un ingrédient --</option>
                {ingredients.filter(i => i.is_active).map(ing => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name} ({ing.category || 'Sans catégorie'}) - {ing.linked_products_count || 0} lié(s)
                  </option>
                ))}
              </select>
            </div>
            
            {/* Mode de liaison */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                2. Mode de liaison
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setLinkMode('category')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    linkMode === 'category' ? 'border-orange-500 bg-orange-50' : 'border-gray-200'
                  }`}
                >
                  <span className="text-2xl block mb-2">📁</span>
                  <span className="font-medium">Par catégorie</span>
                  <p className="text-xs text-gray-500 mt-1">Tous les produits d'une catégorie</p>
                </button>
                <button
                  onClick={() => setLinkMode('products')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    linkMode === 'products' ? 'border-orange-500 bg-orange-50' : 'border-gray-200'
                  }`}
                >
                  <span className="text-2xl block mb-2">🍔</span>
                  <span className="font-medium">Par produits</span>
                  <p className="text-xs text-gray-500 mt-1">Sélectionner individuellement</p>
                </button>
              </div>
            </div>
            
            {/* Mode catégorie */}
            {linkMode === 'category' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  3. Sélectionner la catégorie de produits
                </label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {productCategories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategoryForLink(cat.id)}
                      className={`w-full p-3 rounded-xl border-2 text-left flex items-center justify-between transition-all ${
                        selectedCategoryForLink === cat.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200'
                      }`}
                    >
                      <span className="font-medium">{cat.name}</span>
                      <span className="bg-gray-100 px-2 py-1 rounded text-sm">{cat.product_count}</span>
                    </button>
                  ))}
                </div>
                
                {selectedCategoryForLink && selectedIngredientForLink && (
                  <button
                    onClick={linkToCategory}
                    className="w-full mt-4 bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600"
                  >
                    ✅ Lier à {productCategories.find(c => c.id === selectedCategoryForLink)?.product_count || 0} produit(s)
                  </button>
                )}
              </div>
            )}
            
            {/* Mode produits */}
            {linkMode === 'products' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  3. Sélectionner les produits ({selectedProductsForLink.size})
                </label>
                
                <select
                  value=""
                  onChange={(e) => setSelectedCategoryForLink(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 mb-3"
                >
                  <option value="">Filtrer par catégorie...</option>
                  {productCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {filteredProductsForLink.map(product => (
                    <label
                      key={product.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedProductsForLink.has(product.id) ? 'border-orange-500 bg-orange-50' : 'border-gray-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProductsForLink.has(product.id)}
                        onChange={(e) => {
                          const newSet = new Set(selectedProductsForLink)
                          e.target.checked ? newSet.add(product.id) : newSet.delete(product.id)
                          setSelectedProductsForLink(newSet)
                        }}
                        className="w-5 h-5 rounded"
                      />
                      <div className="flex-1">
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-gray-400">{product.category_name}</p>
                      </div>
                    </label>
                  ))}
                </div>
                
                {selectedProductsForLink.size > 0 && selectedIngredientForLink && (
                  <button
                    onClick={linkToProducts}
                    className="w-full mt-4 bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600"
                  >
                    ✅ Lier {selectedProductsForLink.size} produit(s)
                  </button>
                )}
              </div>
            )}
          </div>
          
          {/* Panel droite: Résumé liaisons */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl font-bold mb-6">📊 Résumé des liaisons</h2>
            
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {ingredients.filter(i => i.is_active && (i.linked_products_count || 0) > 0).map(ing => (
                <div 
                  key={ing.id}
                  className="p-4 rounded-xl border border-gray-200 hover:border-orange-300 cursor-pointer"
                  onClick={() => loadLinkedProducts(ing)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{ing.name}</p>
                      <p className="text-xs text-gray-400">{ing.category}</p>
                    </div>
                    <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
                      {ing.linked_products_count} produit(s)
                    </span>
                  </div>
                </div>
              ))}
              
              {ingredients.filter(i => i.is_active && (i.linked_products_count || 0) > 0).length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <span className="text-5xl block mb-3">🔗</span>
                  <p>Aucune liaison créée</p>
                  <p className="text-sm">Utilisez le panel de gauche pour lier</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL CRÉATION/ÉDITION ==================== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-2xl font-bold">{editingIngredient ? '✏️ Modifier' : '➕ Nouvel'} ingrédient</h2>
              <button onClick={() => setShowModal(false)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">✕</button>
            </div>
            <form onSubmit={saveIngredient} className="p-6 space-y-4">
              {formError && <div className="bg-red-50 text-red-700 p-3 rounded-xl">{formError}</div>}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nom *</label>
                  <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Catégorie</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200">
                    <option value="">Sans catégorie</option>
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
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
                <div>
                  <label className="block text-sm font-medium mb-2">SKU</label>
                  <input type="text" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})}
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
                  <label className="block text-sm font-medium mb-2">Fournisseur</label>
                  <select value={form.supplier_id} onChange={e => setForm({...form, supplier_id: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200">
                    <option value="">Aucun</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Allergènes</label>
                <p className="text-xs text-gray-500 mb-3">1 clic = Contient (rouge) • 2 clics = Traces (jaune) • 3 clics = Aucun</p>
                <div className="flex flex-wrap gap-2">
                  {allergens.map(a => {
                    const state = getAllergenState(a.id)
                    return (
                      <button key={a.id} type="button" onClick={() => toggleAllergen(a.id)}
                        className={`px-3 py-2 rounded-xl text-sm flex items-center gap-1 transition-all ${
                          state === 'contains' ? 'bg-red-100 text-red-700 ring-2 ring-red-300' :
                          state === 'trace' ? 'bg-yellow-100 text-yellow-700 ring-2 ring-yellow-300' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                        {a.emoji} {a.name_fr}
                        {state === 'trace' && <span className="text-xs italic">(traces)</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={form.is_available} onChange={e => setForm({...form, is_available: e.target.checked})} className="w-5 h-5 rounded" />
                  <span>✅ Disponible</span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className="w-5 h-5 rounded" />
                  <span>👁️ Actif (visible)</span>
                </label>
              </div>

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

      {/* ==================== MODAL STOCK ==================== */}
      {showStockModal && selectedIngredient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">📦 Ajuster le stock</h2></div>
            <div className="p-6 space-y-4">
              <div className="text-center">
                <p className="text-gray-500">{selectedIngredient.name}</p>
                <p className="text-3xl font-bold mt-2">{selectedIngredient.stock_current ?? 0} {selectedIngredient.unit}</p>
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
                  className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50">✓ Valider</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL PRODUITS LIÉS ==================== */}
      {showLinkedProductsModal && selectedIngredient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">🔗 Produits liés à "{selectedIngredient.name}"</h2>
              <button onClick={() => setShowLinkedProductsModal(false)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">✕</button>
            </div>
            
            <div className="p-4">
              {!selectedIngredient.is_available && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                  <p className="text-red-700 text-sm font-medium">
                    ⚠️ Ingrédient en rupture - Les produits liés sont automatiquement indisponibles
                  </p>
                </div>
              )}
              
              {linkedProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <span className="text-4xl block mb-2">📦</span>
                  <p>Aucun produit lié</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {linkedProducts.map(product => (
                    <div key={product.id} className={`p-3 rounded-xl border flex items-center justify-between ${
                      product.is_available ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                    }`}>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-gray-400">{product.category_name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          product.is_available ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700'
                        }`}>
                          {product.is_available ? 'Dispo' : 'Indispo'}
                        </span>
                        <button
                          onClick={() => unlinkProduct(product.id)}
                          className="text-red-500 hover:bg-red-100 p-1 rounded"
                          title="Délier"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
