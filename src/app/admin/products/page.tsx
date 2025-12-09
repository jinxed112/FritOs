'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search } from 'lucide-react'

type Category = {
  id: string
  name: string
}

type OptionGroup = {
  id: string
  name: string
  selection_type: string
}

type ProductOptionGroup = {
  id: string
  option_group_id: string
  display_order: number
  option_group: OptionGroup
}

type Product = {
  id: string
  name: string
  description: string | null
  price: number
  category_id: string
  display_order: number
  vat_eat_in: number
  vat_takeaway: number
  is_available: boolean
  is_active: boolean
  image_url: string | null
  product_option_groups?: ProductOptionGroup[]
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')  // 🔍 NOUVEAU
  const [activeTab, setActiveTab] = useState<'info' | 'propositions'>('info')
  
  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: 0,
    category_id: '',
    display_order: 0,
    vat_eat_in: 12,
    vat_takeaway: 6,
    is_available: true,
    is_active: true,
  })
  
  // Propositions assignées au produit
  const [assignedPropositions, setAssignedPropositions] = useState<{id: string, option_group_id: string, display_order: number}[]>([])
  
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    
    // Charger les produits avec leurs propositions
    const { data: productsData } = await supabase
      .from('products')
      .select(`
        *,
        product_option_groups (
          id,
          option_group_id,
          display_order,
          option_group:option_groups (id, name, selection_type)
        )
      `)
      .eq('establishment_id', establishmentId)
      .order('display_order')
    
    // Charger les catégories
    const { data: categoriesData } = await supabase
      .from('categories')
      .select('id, name')
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .order('display_order')
    
    // Charger les groupes d'options
    const { data: optionGroupsData } = await supabase
      .from('option_groups')
      .select('id, name, selection_type')
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .order('display_order')
    
    setProducts(productsData || [])
    setCategories(categoriesData || [])
    setOptionGroups(optionGroupsData || [])
    setLoading(false)
  }

  function openModal(product?: Product) {
    setActiveTab('info')
    
    if (product) {
      setEditingProduct(product)
      setForm({
        name: product.name,
        description: product.description || '',
        price: product.price,
        category_id: product.category_id,
        display_order: product.display_order,
        vat_eat_in: product.vat_eat_in || 12,
        vat_takeaway: product.vat_takeaway || 6,
        is_available: product.is_available,
        is_active: product.is_active,
      })
      // Charger les propositions assignées
      const assigned = (product.product_option_groups || [])
        .sort((a, b) => a.display_order - b.display_order)
        .map(pog => ({
          id: pog.id,
          option_group_id: pog.option_group_id,
          display_order: pog.display_order,
        }))
      setAssignedPropositions(assigned)
    } else {
      setEditingProduct(null)
      setForm({
        name: '',
        description: '',
        price: 0,
        category_id: categories[0]?.id || '',
        display_order: 0,
        vat_eat_in: 12,
        vat_takeaway: 6,
        is_available: true,
        is_active: true,
      })
      setAssignedPropositions([])
    }
    
    setFormError('')
    setShowModal(true)
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    
    if (!form.name.trim()) {
      setFormError('Le nom est obligatoire')
      return
    }
    
    if (!form.category_id) {
      setFormError('La catégorie est obligatoire')
      return
    }
    
    setSaving(true)
    
    try {
      let productId = editingProduct?.id
      
      if (editingProduct) {
        // Update
        const { error } = await supabase
          .from('products')
          .update({
            name: form.name,
            description: form.description || null,
            price: form.price,
            category_id: form.category_id,
            display_order: form.display_order,
            vat_eat_in: form.vat_eat_in,
            vat_takeaway: form.vat_takeaway,
            is_available: form.is_available,
            is_active: form.is_active,
          })
          .eq('id', editingProduct.id)
        
        if (error) throw error
      } else {
        // Générer le slug
        const slug = form.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
        
        // Insert
        const { data, error } = await supabase
          .from('products')
          .insert({
            establishment_id: establishmentId,
            name: form.name,
            slug: slug + '-' + Date.now(),
            description: form.description || null,
            price: form.price,
            category_id: form.category_id,
            display_order: form.display_order,
            vat_eat_in: form.vat_eat_in,
            vat_takeaway: form.vat_takeaway,
            is_available: form.is_available,
            is_active: form.is_active,
          })
          .select()
          .single()
        
        if (error) throw error
        productId = data.id
      }
      
      // Sauvegarder les propositions assignées
      if (productId) {
        // Supprimer les anciennes
        await supabase
          .from('product_option_groups')
          .delete()
          .eq('product_id', productId)
        
        // Insérer les nouvelles
        if (assignedPropositions.length > 0) {
          const { error: pogError } = await supabase
            .from('product_option_groups')
            .insert(
              assignedPropositions.map((p, index) => ({
                product_id: productId,
                option_group_id: p.option_group_id,
                display_order: index + 1,
              }))
            )
          
          if (pogError) throw pogError
        }
      }
      
      setShowModal(false)
      loadData()
    } catch (error: any) {
      console.error('Erreur:', error)
      setFormError(error.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  function addProposition(optionGroupId: string) {
    if (assignedPropositions.some(p => p.option_group_id === optionGroupId)) return
    
    setAssignedPropositions([
      ...assignedPropositions,
      {
        id: `new-${Date.now()}`,
        option_group_id: optionGroupId,
        display_order: assignedPropositions.length + 1,
      }
    ])
  }

  function removeProposition(optionGroupId: string) {
    setAssignedPropositions(assignedPropositions.filter(p => p.option_group_id !== optionGroupId))
  }

  function moveProposition(index: number, direction: 'up' | 'down') {
    const newList = [...assignedPropositions]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    
    if (targetIndex < 0 || targetIndex >= newList.length) return
    
    [newList[index], newList[targetIndex]] = [newList[targetIndex], newList[index]]
    setAssignedPropositions(newList)
  }

  async function deleteProduct(product: Product) {
    if (!confirm(`Supprimer "${product.name}" ?`)) return
    
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', product.id)
    
    if (!error) loadData()
  }

  // 🔍 FILTRAGE MIS À JOUR - Catégorie + Recherche
  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory ? p.category_id === selectedCategory : true
    const matchesSearch = searchQuery 
      ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
      : true
    return matchesCategory && matchesSearch
  })

  // Propositions non encore assignées
  const availablePropositions = optionGroups.filter(
    og => !assignedPropositions.some(ap => ap.option_group_id === og.id)
  )

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Produits</h1>
          <p className="text-gray-500">{products.length} produits au total</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2"
        >
          ➕ Nouveau produit
        </button>
      </div>

      {/* 🔍 FILTRES - Recherche + Catégorie */}
      <div className="flex items-center gap-4 mb-6">
        {/* Champ de recherche */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Rechercher un produit..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>
        
        {/* Filtre catégorie */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Toutes les catégories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        
        <span className="text-gray-500">{filteredProducts.length} produits</span>
      </div>

      {/* Liste des produits */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">🍔</span>
          <p className="text-gray-500">
            {searchQuery ? `Aucun produit trouvé pour "${searchQuery}"` : 'Aucun produit'}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-4 text-orange-500 hover:underline"
            >
              Effacer la recherche
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map(product => {
            const category = categories.find(c => c.id === product.category_id)
            const propositionCount = product.product_option_groups?.length || 0
            
            return (
              <div
                key={product.id}
                className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${
                  !product.is_active ? 'opacity-50' : ''
                }`}
              >
                {/* Image */}
                <div className="aspect-video bg-gray-100 flex items-center justify-center text-5xl">
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                  ) : '🍔'}
                </div>
                
                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-gray-900">{product.name}</h3>
                      <p className="text-sm text-gray-500">{category?.name}</p>
                    </div>
                    <span className="text-xl font-bold text-orange-500">{product.price.toFixed(2)}€</span>
                  </div>
                  
                  {/* Badges */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {!product.is_available && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">Indisponible</span>
                    )}
                    {propositionCount > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">
                        {propositionCount} proposition{propositionCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => openModal(product)}
                      className="flex-1 bg-gray-100 text-gray-700 font-medium py-2 rounded-lg hover:bg-gray-200"
                    >
                      ✏️ Modifier
                    </button>
                    <button
                      onClick={() => deleteProduct(product)}
                      className="px-3 py-2 bg-gray-100 text-gray-500 rounded-lg hover:bg-red-100 hover:text-red-500"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
              </h2>
              
              {/* Tabs */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setActiveTab('info')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'info'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  📝 Informations
                </button>
                <button
                  onClick={() => setActiveTab('propositions')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'propositions'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  📋 Propositions ({assignedPropositions.length})
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
                  {formError}
                </div>
              )}
              
              {activeTab === 'info' ? (
                <form id="product-form" onSubmit={saveProduct} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Catégorie *</label>
                    <select
                      value={form.category_id}
                      onChange={e => setForm({ ...form, category_id: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    >
                      <option value="">Sélectionner...</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      rows={2}
                      placeholder="Description optionnelle..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Prix € *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.price}
                        onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Ordre</label>
                      <input
                        type="number"
                        value={form.display_order}
                        onChange={e => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">TVA sur place %</label>
                      <input
                        type="number"
                        value={form.vat_eat_in}
                        onChange={e => setForm({ ...form, vat_eat_in: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">TVA emporter %</label>
                      <input
                        type="number"
                        value={form.vat_takeaway}
                        onChange={e => setForm({ ...form, vat_takeaway: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>

                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_available}
                        onChange={e => setForm({ ...form, is_available: e.target.checked })}
                        className="w-5 h-5 rounded"
                      />
                      <span>Disponible</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={e => setForm({ ...form, is_active: e.target.checked })}
                        className="w-5 h-5 rounded"
                      />
                      <span>Actif</span>
                    </label>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* Propositions assignées */}
                  <div>
                    <h3 className="font-medium text-gray-700 mb-3">
                      Propositions assignées ({assignedPropositions.length})
                    </h3>
                    
                    {assignedPropositions.length === 0 ? (
                      <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400">
                        <p>Aucune proposition assignée</p>
                        <p className="text-sm mt-1">Le client ne verra pas d'options pour ce produit</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {assignedPropositions.map((ap, index) => {
                          const group = optionGroups.find(og => og.id === ap.option_group_id)
                          if (!group) return null
                          
                          return (
                            <div
                              key={ap.option_group_id}
                              className="bg-gray-50 rounded-xl p-3 flex items-center gap-3"
                            >
                              <span className="text-gray-400 font-mono text-sm w-6">{index + 1}</span>
                              
                              <div className="flex-1">
                                <span className="font-medium">{group.name}</span>
                                <span className="ml-2 text-xs text-gray-400">
                                  {group.selection_type === 'single' ? '🔘 Choix unique' : '☑️ Choix multiple'}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveProposition(index, 'up')}
                                  disabled={index === 0}
                                  className="w-8 h-8 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-30"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveProposition(index, 'down')}
                                  disabled={index === assignedPropositions.length - 1}
                                  className="w-8 h-8 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-30"
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeProposition(ap.option_group_id)}
                                  className="w-8 h-8 rounded-lg bg-red-100 text-red-500 hover:bg-red-200"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  
                  {/* Ajouter une proposition */}
                  {availablePropositions.length > 0 && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-3">Ajouter une proposition</h3>
                      <div className="space-y-2">
                        {availablePropositions.map(og => (
                          <button
                            key={og.id}
                            type="button"
                            onClick={() => addProposition(og.id)}
                            className="w-full bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3 hover:border-orange-300 hover:bg-orange-50 transition-colors text-left"
                          >
                            <span className="text-2xl">➕</span>
                            <div className="flex-1">
                              <span className="font-medium">{og.name}</span>
                              <span className="ml-2 text-xs text-gray-400">
                                {og.selection_type === 'single' ? '🔘 Choix unique' : '☑️ Choix multiple'}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {optionGroups.length === 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-yellow-800">
                      <p className="font-medium">Aucune proposition disponible</p>
                      <p className="text-sm mt-1">Créez d'abord des propositions dans le menu "Propositions"</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                form="product-form"
                onClick={activeTab === 'propositions' ? saveProduct : undefined}
                disabled={saving}
                className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? 'Sauvegarde...' : '💾 Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
