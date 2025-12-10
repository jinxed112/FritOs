'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Product = {
  id: string
  name: string
  price: number
  category_id: string
  image_url: string | null
}

type Category = {
  id: string
  name: string
}

type OptionGroupItem = {
  id: string
  product_id: string
  price_override: number | null
  is_default: boolean
  max_quantity: number
  display_order: number
  is_active: boolean
  triggers_option_group_id: string | null
  product: Product
}

type OptionGroup = {
  id: string
  name: string
  description: string | null
  selection_type: 'single' | 'multi'
  min_selections: number
  max_selections: number | null
  display_order: number
  is_active: boolean
  option_group_items: OptionGroupItem[]
}

const SELECTION_TYPES = [
  { value: 'single', label: 'Choix unique', icon: '🔘', desc: 'Une seule option' },
  { value: 'multi', label: 'Choix multiple', icon: '☑️', desc: 'Plusieurs options' },
]

export default function PropositionsPage() {
  const [groups, setGroups] = useState<OptionGroup[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  
  // Modals
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [showAddProductModal, setShowAddProductModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<OptionGroup | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  
  // Forms
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    selection_type: 'single' as 'single' | 'multi',
    min_selections: 0,
    max_selections: null as number | null,
    default_price_mode: 'product' as 'product' | 'free' | 'custom',
    default_price: 0,
  })
  
  // Add product modal
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number | null>>({})
  
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    
    // Charger les groupes avec leurs items
    const { data: groupsData, error } = await supabase
      .from('option_groups')
      .select(`
        *,
        option_group_items!option_group_items_option_group_id_fkey (
          *,
          product:products (id, name, price, category_id, image_url)
        )
      `)
      .eq('establishment_id', establishmentId)
      .order('display_order')
    
    if (error) {
      console.error('Error loading option_groups:', error)
    }
    
    // Charger tous les produits
    const { data: productsData } = await supabase
      .from('products')
      .select('id, name, price, category_id, image_url')
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .order('name')
    
    // Charger les catégories
    const { data: categoriesData } = await supabase
      .from('categories')
      .select('id, name')
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .order('name')
    
    if (groupsData) {
      const sortedGroups = groupsData.map(g => ({
        ...g,
        option_group_items: (g.option_group_items || [])
          .sort((a: any, b: any) => a.display_order - b.display_order)
      }))
      setGroups(sortedGroups)
    }
    
    setProducts(productsData || [])
    setCategories(categoriesData || [])
    setLoading(false)
  }

  function toggleExpand(groupId: string) {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId)
    } else {
      newExpanded.add(groupId)
    }
    setExpandedGroups(newExpanded)
  }

  function openGroupModal(group?: OptionGroup) {
    if (group) {
      setEditingGroup(group)
      setGroupForm({
        name: group.name,
        description: group.description || '',
        selection_type: group.selection_type,
        min_selections: group.min_selections,
        max_selections: group.max_selections,
        default_price_mode: 'product',
        default_price: 0,
      })
    } else {
      setEditingGroup(null)
      setGroupForm({
        name: '',
        description: '',
        selection_type: 'single',
        min_selections: 0,
        max_selections: null,
        default_price_mode: 'product',
        default_price: 0,
      })
    }
    setFormError('')
    setShowGroupModal(true)
  }

  function openAddProductModal(groupId: string) {
    setSelectedGroupId(groupId)
    setSelectedCategory(null)
    setSearchTerm('')
    setSelectedProducts(new Set())
    setPriceOverrides({})
    setShowAddProductModal(true)
  }

  async function saveGroup(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    
    if (!groupForm.name.trim()) {
      setFormError('Le nom est obligatoire')
      return
    }
    
    setSaving(true)
    
    try {
      if (editingGroup) {
        const { error } = await supabase
          .from('option_groups')
          .update({
            name: groupForm.name,
            description: groupForm.description || null,
            selection_type: groupForm.selection_type,
            min_selections: groupForm.min_selections,
            max_selections: groupForm.max_selections,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingGroup.id)
        
        if (error) throw error
      } else {
        const maxOrder = Math.max(0, ...groups.map(g => g.display_order))
        
        const { error } = await supabase
          .from('option_groups')
          .insert({
            establishment_id: establishmentId,
            name: groupForm.name,
            description: groupForm.description || null,
            selection_type: groupForm.selection_type,
            min_selections: groupForm.min_selections,
            max_selections: groupForm.max_selections,
            display_order: maxOrder + 1,
          })
        
        if (error) throw error
      }
      
      setShowGroupModal(false)
      loadData()
    } catch (error: any) {
      console.error('Erreur:', error)
      setFormError(error.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function addProductsToGroup() {
    if (!selectedGroupId || selectedProducts.size === 0) return
    
    setSaving(true)
    
    try {
      const group = groups.find(g => g.id === selectedGroupId)
      const existingProductIds = group?.option_group_items.map(i => i.product_id) || []
      const maxOrder = group ? Math.max(0, ...group.option_group_items.map(i => i.display_order)) : 0
      
      const newItems = Array.from(selectedProducts)
        .filter(pid => !existingProductIds.includes(pid))
        .map((productId, index) => ({
          option_group_id: selectedGroupId,
          product_id: productId,
          price_override: priceOverrides[productId] ?? null,
          display_order: maxOrder + index + 1,
        }))
      
      if (newItems.length > 0) {
        const { error } = await supabase
          .from('option_group_items')
          .insert(newItems)
        
        if (error) throw error
      }
      
      setShowAddProductModal(false)
      loadData()
    } catch (error: any) {
      console.error('Erreur:', error)
      alert('Erreur: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateItemPrice(itemId: string, priceOverride: number | null) {
    const { error } = await supabase
      .from('option_group_items')
      .update({ price_override: priceOverride })
      .eq('id', itemId)
    
    if (error) {
      alert('Erreur: ' + error.message)
    } else {
      loadData()
    }
  }

  async function toggleItemDefault(itemId: string, isDefault: boolean) {
    const { error } = await supabase
      .from('option_group_items')
      .update({ is_default: isDefault })
      .eq('id', itemId)
    
    if (error) {
      alert('Erreur: ' + error.message)
    } else {
      loadData()
    }
  }

  async function removeItem(itemId: string) {
    const { error } = await supabase
      .from('option_group_items')
      .delete()
      .eq('id', itemId)
    
    if (error) {
      alert('Erreur: ' + error.message)
    } else {
      loadData()
    }
  }

  async function updateItemTrigger(itemId: string, triggersOptionGroupId: string | null) {
    const { error } = await supabase
      .from('option_group_items')
      .update({ triggers_option_group_id: triggersOptionGroupId })
      .eq('id', itemId)
    
    if (error) {
      alert('Erreur: ' + error.message)
    } else {
      loadData()
    }
  }

  async function toggleGroupActive(group: OptionGroup) {
    const { error } = await supabase
      .from('option_groups')
      .update({ is_active: !group.is_active })
      .eq('id', group.id)
    
    if (!error) loadData()
  }

  async function deleteGroup(group: OptionGroup) {
    if (!confirm(`Supprimer "${group.name}" et tous ses items ?`)) return
    
    const { error } = await supabase
      .from('option_groups')
      .delete()
      .eq('id', group.id)
    
    if (!error) loadData()
  }

  async function applyPriceToAll(groupId: string, mode: 'free' | 'product' | 'custom', customPrice?: number) {
    const group = groups.find(g => g.id === groupId)
    if (!group || group.option_group_items.length === 0) return
    
    const confirmed = confirm(
      mode === 'free' 
        ? `Mettre tous les ${group.option_group_items.length} items en GRATUIT ?`
        : mode === 'product'
        ? `Remettre tous les ${group.option_group_items.length} items au prix produit ?`
        : `Mettre tous les ${group.option_group_items.length} items à ${customPrice?.toFixed(2)}€ ?`
    )
    
    if (!confirmed) return
    
    setSaving(true)
    
    try {
      const priceOverride = mode === 'free' ? 0 : mode === 'product' ? null : customPrice
      
      const { error } = await supabase
        .from('option_group_items')
        .update({ price_override: priceOverride })
        .eq('option_group_id', groupId)
      
      if (error) throw error
      
      loadData()
    } catch (error: any) {
      console.error('Erreur:', error)
      alert('Erreur: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  // Filtrer les produits pour le modal d'ajout
  const filteredProducts = products.filter(p => {
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory
    const matchesSearch = !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // Produits déjà dans le groupe sélectionné
  const existingProductIds = selectedGroupId 
    ? new Set(groups.find(g => g.id === selectedGroupId)?.option_group_items.map(i => i.product_id) || [])
    : new Set()

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Propositions</h1>
          <p className="text-gray-500">Gérez les options et suppléments pour vos produits</p>
        </div>
        <button
          onClick={() => openGroupModal()}
          className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2"
        >
          ➕ Nouvelle proposition
        </button>
      </div>

      {/* Liste des groupes */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
            Chargement...
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <span className="text-5xl block mb-4">📋</span>
            <p className="text-gray-500 mb-4">Aucune proposition créée</p>
            <button onClick={() => openGroupModal()} className="text-orange-500 font-medium hover:underline">
              Créer votre première proposition
            </button>
          </div>
        ) : (
          groups.map(group => {
            const isExpanded = expandedGroups.has(group.id)
            const typeInfo = SELECTION_TYPES.find(t => t.value === group.selection_type)
            
            return (
              <div
                key={group.id}
                className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${!group.is_active ? 'opacity-60' : ''}`}
              >
                {/* Header */}
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleExpand(group.id)}
                >
                  <span className="text-2xl">{isExpanded ? '📂' : '📁'}</span>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-gray-900">{group.name}</h3>
                      <span className="text-sm bg-gray-100 px-2 py-0.5 rounded">
                        {typeInfo?.icon} {typeInfo?.label}
                      </span>
                      {group.min_selections > 0 && (
                        <span className="text-sm bg-red-100 text-red-700 px-2 py-0.5 rounded">
                          Obligatoire
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm mt-1">
                      {group.option_group_items.length} produit{group.option_group_items.length > 1 ? 's' : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => toggleGroupActive(group)}
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        group.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {group.is_active ? 'Actif' : 'Inactif'}
                    </button>
                    <button onClick={() => openGroupModal(group)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg">
                      ✏️
                    </button>
                    <button onClick={() => deleteGroup(group)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Items */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-600">Produits dans cette proposition</span>
                      <button
                        onClick={() => openAddProductModal(group.id)}
                        className="text-sm bg-orange-100 text-orange-600 px-3 py-1 rounded-lg hover:bg-orange-200"
                      >
                        ➕ Ajouter produits
                      </button>
                    </div>
                    
                    {/* Boutons Appliquer à tous */}
                    {group.option_group_items.length > 0 && (
                      <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-xl">
                        <span className="text-sm text-blue-700 font-medium">Appliquer à tous :</span>
                        <button
                          onClick={() => applyPriceToAll(group.id, 'free')}
                          disabled={saving}
                          className="text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 disabled:opacity-50"
                        >
                          🆓 Gratuit
                        </button>
                        <button
                          onClick={() => applyPriceToAll(group.id, 'product')}
                          disabled={saving}
                          className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                        >
                          💰 Prix produit
                        </button>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.10"
                            min="0"
                            placeholder="1.00"
                            id={`custom-price-${group.id}`}
                            className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-right"
                          />
                          <button
                            onClick={() => {
                              const input = document.getElementById(`custom-price-${group.id}`) as HTMLInputElement
                              const price = parseFloat(input?.value || '0')
                              if (price > 0) {
                                applyPriceToAll(group.id, 'custom', price)
                              } else {
                                alert('Entrez un prix valide')
                              }
                            }}
                            disabled={saving}
                            className="text-sm bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg hover:bg-orange-200 disabled:opacity-50"
                          >
                            Prix fixe €
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {group.option_group_items.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-4">
                        Aucun produit - cliquez sur "Ajouter produits"
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {group.option_group_items.map(item => {
                          const displayPrice = item.price_override !== null ? item.price_override : item.product.price
                          const isIncluded = item.price_override === 0
                          const triggeredGroup = item.triggers_option_group_id 
                            ? groups.find(g => g.id === item.triggers_option_group_id)
                            : null
                          
                          return (
                            <div key={item.id} className="bg-white rounded-xl p-3">
                              <div className="flex items-center gap-3">
                                {/* Image */}
                                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-xl flex-shrink-0">
                                  {item.product.image_url ? (
                                    <img src={item.product.image_url} alt="" className="w-full h-full object-cover rounded-lg" />
                                  ) : '🍽️'}
                                </div>
                                
                                {/* Nom */}
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium">{item.product.name}</span>
                                  {item.is_default && (
                                    <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">
                                      Par défaut
                                    </span>
                                  )}
                                </div>
                                
                                {/* Prix */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <select
                                    value={item.price_override === null ? 'product' : item.price_override === 0 ? 'free' : 'custom'}
                                    onChange={(e) => {
                                      const val = e.target.value
                                      if (val === 'product') updateItemPrice(item.id, null)
                                      else if (val === 'free') updateItemPrice(item.id, 0)
                                      else updateItemPrice(item.id, item.product.price)
                                    }}
                                    className="text-sm border border-gray-200 rounded-lg px-2 py-1"
                                  >
                                    <option value="product">Prix produit ({item.product.price.toFixed(2)}€)</option>
                                    <option value="free">Inclus (gratuit)</option>
                                    <option value="custom">Prix custom</option>
                                  </select>
                                  
                                  {item.price_override !== null && item.price_override !== 0 && (
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={item.price_override}
                                      onChange={(e) => updateItemPrice(item.id, parseFloat(e.target.value) || 0)}
                                      className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1 text-right"
                                    />
                                  )}
                                  
                                  <span className={`font-bold min-w-[70px] text-right ${isIncluded ? 'text-green-600' : 'text-orange-500'}`}>
                                    {isIncluded ? 'Inclus' : `+${displayPrice.toFixed(2)}€`}
                                  </span>
                                </div>
                                
                                {/* Actions */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={() => toggleItemDefault(item.id, !item.is_default)}
                                    className={`w-8 h-8 rounded-lg text-sm ${
                                      item.is_default ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                                    }`}
                                    title="Par défaut"
                                  >
                                    ⭐
                                  </button>
                                  <button
                                    onClick={() => removeItem(item.id)}
                                    className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-500"
                                    title="Retirer"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                              
                              {/* Ligne 2: Déclenche proposition */}
                              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
                                <span className="text-sm text-gray-500">🔗 Déclenche :</span>
                                <select
                                  value={item.triggers_option_group_id || ''}
                                  onChange={(e) => updateItemTrigger(item.id, e.target.value || null)}
                                  className={`text-sm border rounded-lg px-2 py-1 flex-1 ${
                                    item.triggers_option_group_id 
                                      ? 'border-purple-300 bg-purple-50 text-purple-700' 
                                      : 'border-gray-200'
                                  }`}
                                >
                                  <option value="">Aucune proposition</option>
                                  {groups
                                    .filter(g => g.id !== group.id) // Ne pas pouvoir se déclencher soi-même
                                    .map(g => (
                                      <option key={g.id} value={g.id}>
                                        {g.name} ({g.selection_type === 'single' ? 'choix unique' : 'choix multiple'})
                                      </option>
                                    ))
                                  }
                                </select>
                                {triggeredGroup && (
                                  <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded">
                                    → {triggeredGroup.name}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Modal Groupe */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingGroup ? 'Modifier la proposition' : 'Nouvelle proposition'}
            </h2>
            
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
                {formError}
              </div>
            )}
            
            <form onSubmit={saveGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
                <input
                  type="text"
                  value={groupForm.name}
                  onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ex: Sauces, Suppléments, Crudités..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type de sélection</label>
                <div className="grid grid-cols-2 gap-3">
                  {SELECTION_TYPES.map(type => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setGroupForm({ ...groupForm, selection_type: type.value as any })}
                      className={`p-4 rounded-xl border-2 text-center transition-all ${
                        groupForm.selection_type === type.value
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-2xl block mb-1">{type.icon}</span>
                      <span className="font-medium block">{type.label}</span>
                      <span className="text-xs text-gray-500">{type.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Minimum</label>
                  <input
                    type="number"
                    min="0"
                    value={groupForm.min_selections}
                    onChange={e => setGroupForm({ ...groupForm, min_selections: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">0 = optionnel, 1+ = obligatoire</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Maximum</label>
                  <input
                    type="number"
                    min="0"
                    value={groupForm.max_selections || ''}
                    onChange={e => setGroupForm({ ...groupForm, max_selections: parseInt(e.target.value) || null })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Illimité"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowGroupModal(false)} className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold text-gray-700 hover:bg-gray-50">
                  Annuler
                </button>
                <button type="submit" disabled={saving} className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-50">
                  {saving ? 'Sauvegarde...' : '💾 Sauvegarder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ajouter Produits */}
      {showAddProductModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Ajouter des produits</h2>
            
            {/* Filtres */}
            <div className="flex gap-3 mb-4">
              <select
                value={selectedCategory || ''}
                onChange={(e) => setSelectedCategory(e.target.value || null)}
                className="px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Toutes catégories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="🔍 Rechercher..."
                className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            
            {/* Liste des produits */}
            <div className="flex-1 overflow-y-auto border border-gray-100 rounded-xl mb-4">
              {filteredProducts.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Aucun produit trouvé</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredProducts.map(product => {
                    const isAlreadyAdded = existingProductIds.has(product.id)
                    const isSelected = selectedProducts.has(product.id)
                    
                    return (
                      <div
                        key={product.id}
                        className={`p-3 flex items-center gap-3 ${
                          isAlreadyAdded ? 'opacity-40 bg-gray-50' : 'hover:bg-gray-50 cursor-pointer'
                        }`}
                        onClick={() => {
                          if (isAlreadyAdded) return
                          const newSelected = new Set(selectedProducts)
                          if (isSelected) {
                            newSelected.delete(product.id)
                          } else {
                            newSelected.add(product.id)
                          }
                          setSelectedProducts(newSelected)
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isAlreadyAdded}
                          onChange={() => {}}
                          className="w-5 h-5 rounded"
                        />
                        
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                          {product.image_url ? (
                            <img src={product.image_url} alt="" className="w-full h-full object-cover rounded-lg" />
                          ) : '🍽️'}
                        </div>
                        
                        <div className="flex-1">
                          <span className="font-medium">{product.name}</span>
                          {isAlreadyAdded && <span className="ml-2 text-xs text-gray-400">(déjà ajouté)</span>}
                        </div>
                        
                        <span className="text-gray-500">{product.price.toFixed(2)}€</span>
                        
                        {isSelected && !isAlreadyAdded && (
                          <select
                            value={priceOverrides[product.id] === undefined ? 'product' : priceOverrides[product.id] === 0 ? 'free' : 'custom'}
                            onChange={(e) => {
                              e.stopPropagation()
                              const val = e.target.value
                              const newOverrides = { ...priceOverrides }
                              if (val === 'product') delete newOverrides[product.id]
                              else if (val === 'free') newOverrides[product.id] = 0
                              else newOverrides[product.id] = product.price
                              setPriceOverrides(newOverrides)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1"
                          >
                            <option value="product">Prix produit</option>
                            <option value="free">Inclus (gratuit)</option>
                            <option value="custom">Prix custom</option>
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {selectedProducts.size} produit{selectedProducts.size > 1 ? 's' : ''} sélectionné{selectedProducts.size > 1 ? 's' : ''}
              </span>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddProductModal(false)}
                  className="px-6 py-3 rounded-xl border border-gray-200 font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={addProductsToGroup}
                  disabled={selectedProducts.size === 0 || saving}
                  className="px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-50"
                >
                  {saving ? 'Ajout...' : `➕ Ajouter (${selectedProducts.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}