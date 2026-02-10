'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type OptionGroup = {
  id: string
  name: string
  selection_type: string
}

type CategoryOptionGroup = {
  id: string
  option_group_id: string
  display_order: number
  option_group: OptionGroup
}

type Category = {
  id: string
  name: string
  description: string | null
  display_order: number
  is_active: boolean
  visible_on_kiosk: boolean
  visible_online: boolean
  image_url: string | null
  _count?: number
  category_option_groups?: CategoryOptionGroup[]
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'propositions'>('info')
  const [movingId, setMovingId] = useState<string | null>(null)
  
  const [form, setForm] = useState({
    name: '',
    description: '',
    display_order: 0,
    is_active: true,
    visible_on_kiosk: true,
    visible_online: true,
  })
  
  // Propositions assignées
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
    
    // Charger les catégories avec leurs propositions
    const { data: categoriesData } = await supabase
      .from('categories')
      .select(`
        *,
        category_option_groups (
          id,
          option_group_id,
          display_order,
          option_group:option_groups (id, name, selection_type)
        )
      `)
      .eq('establishment_id', establishmentId)
      .order('display_order')
    
    // Compter les produits par catégorie
    const { data: products } = await supabase
      .from('products')
      .select('category_id')
      .eq('establishment_id', establishmentId)
    
    const counts: Record<string, number> = {}
    ;(products as { category_id: string }[] | null)?.forEach(p => {
      counts[p.category_id] = (counts[p.category_id] || 0) + 1
    })
    
    const categoriesWithCount = (categoriesData || []).map((cat: any) => ({
      ...cat,
      _count: counts[cat.id] || 0,
      category_option_groups: (cat.category_option_groups || []).sort((a: any, b: any) => a.display_order - b.display_order)
    }))
    
    setCategories(categoriesWithCount)
    
    // Charger les groupes d'options
    const { data: optionGroupsData } = await supabase
      .from('option_groups')
      .select('id, name, selection_type')
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .order('display_order')
    
    setOptionGroups(optionGroupsData || [])
    setLoading(false)
  }

  // Déplacer une catégorie vers le haut ou le bas
  async function moveCategory(categoryId: string, direction: 'up' | 'down') {
    const currentIndex = categories.findIndex(c => c.id === categoryId)
    if (currentIndex === -1) return
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= categories.length) return
    
    setMovingId(categoryId)
    
    const currentCategory = categories[currentIndex]
    const targetCategory = categories[targetIndex]
    
    // Échanger les display_order
    const currentOrder = currentCategory.display_order
    const targetOrder = targetCategory.display_order
    
    try {
      // Mettre à jour les deux catégories
      await supabase
        .from('categories')
        .update({ display_order: targetOrder } as any)
        .eq('id', currentCategory.id)
      
      await supabase
        .from('categories')
        .update({ display_order: currentOrder } as any)
        .eq('id', targetCategory.id)
      
      // Recharger les données
      await loadData()
    } catch (error) {
      console.error('Erreur lors du déplacement:', error)
    } finally {
      setMovingId(null)
    }
  }

  function openModal(category?: Category) {
    setActiveTab('info')
    
    if (category) {
      setEditingCategory(category)
      setForm({
        name: category.name,
        description: category.description || '',
        display_order: category.display_order,
        is_active: category.is_active,
        visible_on_kiosk: category.visible_on_kiosk ?? true,
        visible_online: category.visible_online ?? true,
      })
      // Charger les propositions assignées
      const assigned = (category.category_option_groups || [])
        .sort((a, b) => a.display_order - b.display_order)
        .map(cog => ({
          id: cog.id,
          option_group_id: cog.option_group_id,
          display_order: cog.display_order,
        }))
      setAssignedPropositions(assigned)
    } else {
      setEditingCategory(null)
      setForm({
        name: '',
        description: '',
        display_order: categories.length,
        is_active: true,
        visible_on_kiosk: true,
        visible_online: true,
      })
      setAssignedPropositions([])
    }
    setFormError('')
    setShowModal(true)
  }

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    
    if (!form.name.trim()) {
      setFormError('Le nom est obligatoire')
      return
    }
    
    setSaving(true)
    
    try {
      let categoryId = editingCategory?.id
      
      // Générer le slug
      const slug = form.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      
      if (editingCategory) {
        const { error } = await supabase
          .from('categories')
          .update({
            name: form.name,
            description: form.description || null,
            display_order: form.display_order,
            is_active: form.is_active,
            visible_on_kiosk: form.visible_on_kiosk,
            visible_online: form.visible_online,
          } as any)
          .eq('id', editingCategory.id)
        
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('categories')
          .insert({
            establishment_id: establishmentId,
            name: form.name,
            slug: slug + '-' + Date.now(),
            description: form.description || null,
            display_order: form.display_order,
            is_active: form.is_active,
            visible_on_kiosk: form.visible_on_kiosk,
            visible_online: form.visible_online,
          } as any)
          .select()
          .single()
        
        if (error) throw error
        categoryId = (data as any).id
      }
      
      // Sauvegarder les propositions assignées
      if (categoryId) {
        // Supprimer les anciennes
        await supabase
          .from('category_option_groups')
          .delete()
          .eq('category_id', categoryId)
        
        // Insérer les nouvelles
        if (assignedPropositions.length > 0) {
          const { error: cogError } = await supabase
            .from('category_option_groups')
            .insert(
              assignedPropositions.map((p, index) => ({
                category_id: categoryId,
                option_group_id: p.option_group_id,
                display_order: index + 1,
              })) as any
            )
          
          if (cogError) throw cogError
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

  async function toggleVisibleOnKiosk(category: Category) {
    const { error } = await supabase
      .from('categories')
      .update({ visible_on_kiosk: !category.visible_on_kiosk } as any)
      .eq('id', category.id)
    
    if (!error) loadData()
  }

  async function toggleVisibleOnline(category: Category) {
    const { error } = await supabase
      .from('categories')
      .update({ visible_online: !category.visible_online } as any)
      .eq('id', category.id)
    
    if (!error) loadData()
  }

  async function deleteCategory(category: Category) {
    if (category._count && category._count > 0) {
      alert(`Impossible de supprimer "${category.name}" car elle contient ${category._count} produit(s)`)
      return
    }
    
    if (!confirm(`Supprimer la catégorie "${category.name}" ?`)) return
    
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', category.id)
    
    if (!error) loadData()
  }

  // Propositions non encore assignées
  const availablePropositions = optionGroups.filter(
    og => !assignedPropositions.some(ap => ap.option_group_id === og.id)
  )

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Catégories</h1>
          <p className="text-gray-500">{categories.length} catégories</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2"
        >
          ➕ Nouvelle catégorie
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div>
      ) : categories.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">📁</span>
          <p className="text-gray-500">Aucune catégorie</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Ordre</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Nom</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Produits</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Propositions</th>
                <th className="text-center px-6 py-4 font-semibold text-gray-600">Borne</th>
                <th className="text-center px-6 py-4 font-semibold text-gray-600">En ligne</th>
                <th className="text-center px-6 py-4 font-semibold text-gray-600">Statut</th>
                <th className="text-right px-6 py-4 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((category, index) => {
                const propositionCount = category.category_option_groups?.length || 0
                const isFirst = index === 0
                const isLast = index === categories.length - 1
                const isMoving = movingId === category.id
                
                return (
                  <tr key={category.id} className={`${!category.is_active ? 'opacity-50' : ''} ${isMoving ? 'bg-orange-50' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {/* Flèches de réorganisation */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => moveCategory(category.id, 'up')}
                            disabled={isFirst || isMoving}
                            className={`w-6 h-6 flex items-center justify-center rounded text-sm transition-colors ${
                              isFirst || isMoving
                                ? 'text-gray-200 cursor-not-allowed'
                                : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'
                            }`}
                            title="Monter"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveCategory(category.id, 'down')}
                            disabled={isLast || isMoving}
                            className={`w-6 h-6 flex items-center justify-center rounded text-sm transition-colors ${
                              isLast || isMoving
                                ? 'text-gray-200 cursor-not-allowed'
                                : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'
                            }`}
                            title="Descendre"
                          >
                            ▼
                          </button>
                        </div>
                        <span className={`bg-gray-100 px-3 py-1 rounded-lg font-mono text-sm ${isMoving ? 'animate-pulse' : ''}`}>
                          {category.display_order}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">{category.name}</span>
                      {category.description && (
                        <p className="text-sm text-gray-500">{category.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-600">{category._count || 0}</span>
                    </td>
                    <td className="px-6 py-4">
                      {propositionCount > 0 ? (
                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-sm">
                          {propositionCount} proposition{propositionCount > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">Aucune</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleVisibleOnKiosk(category)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          category.visible_on_kiosk
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {category.visible_on_kiosk ? '👁️' : '🚫'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleVisibleOnline(category)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          category.visible_online
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {category.visible_online ? '🌐' : '🚫'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        category.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {category.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openModal(category)}
                          className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteCategory(category)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
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
                <form id="category-form" onSubmit={saveCategory} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Ex: Burgers, Frites, Sauces..."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <input
                      type="text"
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Description optionnelle..."
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                      <input
                        type="checkbox"
                        checked={form.visible_on_kiosk}
                        onChange={e => setForm({ ...form, visible_on_kiosk: e.target.checked })}
                        className="w-5 h-5 rounded text-orange-500"
                      />
                      <div>
                        <span className="font-medium">👁️ Visible sur la borne</span>
                        <p className="text-xs text-gray-500">Afficher cette catégorie sur la borne de commande</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                      <input
                        type="checkbox"
                        checked={form.visible_online}
                        onChange={e => setForm({ ...form, visible_online: e.target.checked })}
                        className="w-5 h-5 rounded text-blue-500"
                      />
                      <div>
                        <span className="font-medium">🌐 Visible en ligne</span>
                        <p className="text-xs text-gray-500">Afficher cette catégorie sur le portail de commande en ligne</p>
                      </div>
                    </label>
                    
                    <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={e => setForm({ ...form, is_active: e.target.checked })}
                        className="w-5 h-5 rounded text-orange-500"
                      />
                      <div>
                        <span className="font-medium">✅ Catégorie active</span>
                        <p className="text-xs text-gray-500">Les catégories inactives ne sont pas visibles</p>
                      </div>
                    </label>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* Info */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-800">
                    <p className="text-sm">
                      💡 Les propositions ajoutées ici seront disponibles pour <strong>tous les produits</strong> de cette catégorie.
                    </p>
                  </div>
                  
                  {/* Propositions assignées */}
                  <div>
                    <h3 className="font-medium text-gray-700 mb-3">
                      Propositions assignées ({assignedPropositions.length})
                    </h3>
                    
                    {assignedPropositions.length === 0 ? (
                      <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400">
                        <p>Aucune proposition assignée</p>
                        <p className="text-sm mt-1">Les produits de cette catégorie n'auront pas d'options par défaut</p>
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
                form="category-form"
                onClick={activeTab === 'propositions' ? saveCategory : undefined}
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