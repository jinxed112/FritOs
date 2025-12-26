'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

// ==================== TYPES ====================

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
  category: string | null
  is_available: boolean
  is_active: boolean
  ingredient_allergens: IngredientAllergen[]
  linked_products_count?: number
}

type Product = {
  id: string
  name: string
  is_available: boolean
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

// ==================== COMPONENT ====================

export default function BackofficePage() {
  // State
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [allergens, setAllergens] = useState<Allergen[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('')
  
  // Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImpactModal, setShowImpactModal] = useState(false)
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null)
  const [impactedProducts, setImpactedProducts] = useState<Product[]>([])
  
  // Form state
  const [form, setForm] = useState({
    name: '',
    category: 'Autres',
    allergens: [] as { allergen_id: string, is_trace: boolean }[]
  })
  const [saving, setSaving] = useState(false)
  
  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    
    // Charger les ingrédients avec leurs allergènes
    const { data: ingredientsData } = await supabase
      .from('ingredients')
      .select(`
        id, name, category, is_available, is_active,
        ingredient_allergens (
          allergen_id,
          is_trace,
          allergen:allergens (id, code, name_fr, emoji)
        )
      `)
      .eq('establishment_id', establishmentId)
      .order('category')
      .order('name')
    
    // Charger les allergènes disponibles
    const { data: allergensData } = await supabase
      .from('allergens')
      .select('id, code, name_fr, emoji')
      .order('name_fr')
    
    // Compter les produits liés
    const { data: links } = await supabase
      .from('product_ingredients')
      .select('ingredient_id')
    
    const linkCounts: Record<string, number> = {}
    links?.forEach(l => {
      linkCounts[l.ingredient_id] = (linkCounts[l.ingredient_id] || 0) + 1
    })
    
    if (ingredientsData) {
      setIngredients(ingredientsData.map((ing: any) => ({
        ...ing,
        ingredient_allergens: ing.ingredient_allergens || [],
        linked_products_count: linkCounts[ing.id] || 0
      })))
    }
    
    setAllergens(allergensData || [])
    setLoading(false)
  }

  async function toggleAvailability(ingredient: Ingredient) {
    const newStatus = !ingredient.is_available
    
    const { error } = await supabase
      .from('ingredients')
      .update({ is_available: newStatus })
      .eq('id', ingredient.id)
    
    if (!error) {
      setIngredients(prev => prev.map(ing => 
        ing.id === ingredient.id ? { ...ing, is_available: newStatus } : ing
      ))
      
      // Si on met en indispo et qu'il y a des produits liés, montrer l'impact
      if (!newStatus && ingredient.linked_products_count && ingredient.linked_products_count > 0) {
        loadImpactedProducts(ingredient)
      }
    }
  }

  async function toggleActive(ingredient: Ingredient) {
    const newStatus = !ingredient.is_active
    
    const { error } = await supabase
      .from('ingredients')
      .update({ is_active: newStatus })
      .eq('id', ingredient.id)
    
    if (!error) {
      setIngredients(prev => prev.map(ing => 
        ing.id === ingredient.id ? { ...ing, is_active: newStatus } : ing
      ))
    }
  }

  async function loadImpactedProducts(ingredient: Ingredient) {
    const { data } = await supabase
      .from('product_ingredients')
      .select(`
        product:products (id, name, is_available, category:categories(name))
      `)
      .eq('ingredient_id', ingredient.id)
      .eq('is_essential', true)
    
    if (data) {
      setImpactedProducts(data.map((pi: any) => ({
        id: pi.product.id,
        name: pi.product.name,
        is_available: pi.product.is_available,
        category_name: pi.product.category?.name || 'Sans catégorie'
      })))
      setSelectedIngredient(ingredient)
      setShowImpactModal(true)
    }
  }

  function openAddModal() {
    setForm({ name: '', category: 'Autres', allergens: [] })
    setSelectedIngredient(null)
    setShowAddModal(true)
  }

  function openEditModal(ingredient: Ingredient) {
    setForm({
      name: ingredient.name,
      category: ingredient.category || 'Autres',
      allergens: ingredient.ingredient_allergens.map(ia => ({
        allergen_id: ia.allergen_id,
        is_trace: ia.is_trace
      }))
    })
    setSelectedIngredient(ingredient)
    setShowAddModal(true)
  }

  function toggleAllergen(allergenId: string) {
    const existing = form.allergens.find(a => a.allergen_id === allergenId)
    
    if (!existing) {
      // Ajouter comme "contient"
      setForm({ ...form, allergens: [...form.allergens, { allergen_id: allergenId, is_trace: false }] })
    } else if (!existing.is_trace) {
      // Passer de "contient" à "traces"
      setForm({
        ...form,
        allergens: form.allergens.map(a => 
          a.allergen_id === allergenId ? { ...a, is_trace: true } : a
        )
      })
    } else {
      // Supprimer
      setForm({
        ...form,
        allergens: form.allergens.filter(a => a.allergen_id !== allergenId)
      })
    }
  }

  function getAllergenState(allergenId: string): 'none' | 'contains' | 'trace' {
    const existing = form.allergens.find(a => a.allergen_id === allergenId)
    if (!existing) return 'none'
    return existing.is_trace ? 'trace' : 'contains'
  }

  async function saveIngredient(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    
    setSaving(true)
    
    try {
      let ingredientId = selectedIngredient?.id
      
      if (selectedIngredient) {
        // Update
        await supabase
          .from('ingredients')
          .update({ name: form.name, category: form.category })
          .eq('id', selectedIngredient.id)
      } else {
        // Insert
        const { data } = await supabase
          .from('ingredients')
          .insert({
            establishment_id: establishmentId,
            name: form.name,
            category: form.category,
            is_available: true,
            is_active: true
          })
          .select('id')
          .single()
        
        ingredientId = data?.id
      }
      
      if (ingredientId) {
        // Supprimer les anciens allergènes
        await supabase
          .from('ingredient_allergens')
          .delete()
          .eq('ingredient_id', ingredientId)
        
        // Insérer les nouveaux
        if (form.allergens.length > 0) {
          await supabase
            .from('ingredient_allergens')
            .insert(form.allergens.map(a => ({
              ingredient_id: ingredientId,
              allergen_id: a.allergen_id,
              is_trace: a.is_trace
            })))
        }
      }
      
      setShowAddModal(false)
      loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // ==================== FILTERS ====================

  const filteredIngredients = ingredients.filter(ing => {
    // Filtre actif/inactif
    if (!showInactive && !ing.is_active) return false
    
    // Filtre recherche
    if (searchQuery && !ing.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    
    // Filtre catégorie
    if (filterCategory && ing.category !== filterCategory) return false
    
    return true
  })

  const groupedIngredients = filteredIngredients.reduce((acc, ing) => {
    const cat = ing.category || 'Autres'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(ing)
    return acc
  }, {} as Record<string, Ingredient[]>)

  const stats = {
    total: ingredients.filter(i => i.is_active).length,
    available: ingredients.filter(i => i.is_active && i.is_available).length,
    unavailable: ingredients.filter(i => i.is_active && !i.is_available).length,
    inactive: ingredients.filter(i => !i.is_active).length
  }

  // ==================== HELPERS ====================

  function renderAllergens(ingredientAllergens: IngredientAllergen[]) {
    if (!ingredientAllergens || ingredientAllergens.length === 0) {
      return <span className="text-gray-400 text-xs">Aucun allergène</span>
    }
    
    const contains = ingredientAllergens.filter(ia => !ia.is_trace)
    const traces = ingredientAllergens.filter(ia => ia.is_trace)
    
    return (
      <div className="flex flex-wrap gap-1">
        {contains.map(ia => (
          <span 
            key={ia.allergen_id} 
            className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-xs"
            title={ia.allergen.name_fr}
          >
            {ia.allergen.emoji}
          </span>
        ))}
        {traces.map(ia => (
          <span 
            key={ia.allergen_id} 
            className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded text-xs opacity-70"
            title={`Traces: ${ia.allergen.name_fr}`}
          >
            {ia.allergen.emoji}
          </span>
        ))}
      </div>
    )
  }

  // ==================== RENDER ====================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl block mb-4 animate-pulse">🥬</span>
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
          <h1 className="text-xl font-bold">🥬 Gestion Ingrédients</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <Link
            href="/admin/ingredients"
            className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-xl font-medium transition-colors text-sm"
          >
            ⚙️ Admin complet
          </Link>
          <button
            onClick={openAddModal}
            className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-xl font-medium transition-colors"
          >
            + Ajouter
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="p-4">
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-gray-700">{stats.total}</p>
            <p className="text-gray-500 text-sm">Total actifs</p>
          </div>
          <div className="bg-white rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-green-600">{stats.available}</p>
            <p className="text-gray-500 text-sm">Disponibles</p>
          </div>
          <div className="bg-white rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-red-500">{stats.unavailable}</p>
            <p className="text-gray-500 text-sm">En rupture</p>
          </div>
          <div className="bg-white rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-gray-400">{stats.inactive}</p>
            <p className="text-gray-500 text-sm">Inactifs</p>
          </div>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="🔍 Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
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

        {/* Liste des ingrédients */}
        <div className="space-y-6">
          {Object.entries(groupedIngredients).map(([category, ings]) => (
            <div key={category} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b">
                <h2 className="font-bold text-gray-700">{category} ({ings.length})</h2>
              </div>
              
              <div className="divide-y">
                {ings.map(ing => (
                  <div
                    key={ing.id}
                    className={`p-4 flex items-center gap-4 ${
                      !ing.is_active ? 'bg-gray-50 opacity-60' : ''
                    } ${!ing.is_available && ing.is_active ? 'bg-red-50' : ''}`}
                  >
                    {/* Nom et allergènes */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`font-medium ${!ing.is_available ? 'text-red-600' : ''}`}>
                          {ing.name}
                        </p>
                        {!ing.is_active && (
                          <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded">
                            Inactif
                          </span>
                        )}
                        {ing.linked_products_count && ing.linked_products_count > 0 && (
                          <button
                            onClick={() => loadImpactedProducts(ing)}
                            className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded hover:bg-blue-200"
                          >
                            {ing.linked_products_count} produit(s)
                          </button>
                        )}
                      </div>
                      <div className="mt-1">
                        {renderAllergens(ing.ingredient_allergens)}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {/* Toggle Dispo */}
                      <button
                        onClick={() => toggleAvailability(ing)}
                        className={`px-4 py-2 rounded-xl font-semibold transition-all active:scale-95 ${
                          ing.is_available
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {ing.is_available ? '✓ Dispo' : '✕ Rupture'}
                      </button>
                      
                      {/* Toggle Actif */}
                      <button
                        onClick={() => toggleActive(ing)}
                        className={`px-3 py-2 rounded-xl transition-all active:scale-95 ${
                          ing.is_active
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                        }`}
                        title={ing.is_active ? 'Masquer' : 'Réactiver'}
                      >
                        {ing.is_active ? '👁️' : '👁️‍🗨️'}
                      </button>
                      
                      {/* Edit */}
                      <button
                        onClick={() => openEditModal(ing)}
                        className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all active:scale-95"
                      >
                        ✏️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {filteredIngredients.length === 0 && (
            <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
              <span className="text-5xl block mb-3">🔍</span>
              <p>Aucun ingrédient trouvé</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Ajouter/Modifier */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {selectedIngredient ? '✏️ Modifier' : '➕ Ajouter'} un ingrédient
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={saveIngredient} className="p-4 space-y-4">
              {/* Nom */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom de l'ingrédient *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ex: Fricadelle Snaky"
                  required
                />
              </div>
              
              {/* Catégorie */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Catégorie
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              {/* Allergènes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Allergènes
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Cliquez une fois = Contient • Deux fois = Traces • Trois fois = Aucun
                </p>
                <div className="flex flex-wrap gap-2">
                  {allergens.map(allergen => {
                    const state = getAllergenState(allergen.id)
                    return (
                      <button
                        key={allergen.id}
                        type="button"
                        onClick={() => toggleAllergen(allergen.id)}
                        className={`px-3 py-2 rounded-xl text-sm flex items-center gap-1.5 transition-all ${
                          state === 'contains'
                            ? 'bg-red-100 text-red-700 ring-2 ring-red-300'
                            : state === 'trace'
                            ? 'bg-yellow-100 text-yellow-700 ring-2 ring-yellow-300'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        <span>{allergen.emoji}</span>
                        <span>{allergen.name_fr}</span>
                        {state === 'trace' && <span className="text-xs italic">(traces)</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name.trim()}
                  className="flex-1 px-4 py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50"
                >
                  {saving ? '...' : '💾 Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Impact produits */}
      {showImpactModal && selectedIngredient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">
                🔗 Produits liés à "{selectedIngredient.name}"
              </h2>
              <button
                onClick={() => setShowImpactModal(false)}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4">
              {!selectedIngredient.is_available && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                  <p className="text-red-700 text-sm font-medium">
                    ⚠️ Cet ingrédient est en rupture. Les produits ci-dessous sont automatiquement indisponibles.
                  </p>
                </div>
              )}
              
              {impactedProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <span className="text-4xl block mb-2">📦</span>
                  <p>Aucun produit lié</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {impactedProducts.map(product => (
                    <div
                      key={product.id}
                      className={`p-3 rounded-xl border ${
                        product.is_available
                          ? 'border-green-200 bg-green-50'
                          : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-xs text-gray-400">{product.category_name}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          product.is_available
                            ? 'bg-green-200 text-green-700'
                            : 'bg-red-200 text-red-700'
                        }`}>
                          {product.is_available ? 'Dispo' : 'Indispo'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="mt-4 pt-4 border-t">
                <Link
                  href="/admin/ingredients"
                  className="block w-full text-center px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200"
                >
                  ⚙️ Gérer les liaisons dans l'admin
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}