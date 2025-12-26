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
  ingredient_allergens?: IngredientAllergen[]
}

type ProductIngredient = {
  id: string
  ingredient_id: string
  is_essential: boolean
  ingredient: Ingredient
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
  product_ingredients?: ProductIngredient[]
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([])
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'info' | 'propositions' | 'ingredients'>('info')
  
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
    image_url: '' as string | null,
  })
  
  // Image upload
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  
  // Propositions assignées au produit
  const [assignedPropositions, setAssignedPropositions] = useState<{id: string, option_group_id: string, display_order: number}[]>([])
  
  // Ingrédients assignés au produit
  const [assignedIngredients, setAssignedIngredients] = useState<{ingredient_id: string, is_essential: boolean}[]>([])
  const [ingredientSearch, setIngredientSearch] = useState('')
  
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    
    // Charger les produits avec leurs propositions et ingrédients
    const { data: productsData } = await supabase
      .from('products')
      .select(`
        *,
        product_option_groups (
          id,
          option_group_id,
          display_order,
          option_group:option_groups (id, name, selection_type)
        ),
        product_ingredients (
          id,
          ingredient_id,
          is_essential,
          ingredient:ingredients (
            id, name, category, is_available,
            ingredient_allergens (
              allergen_id,
              is_trace,
              allergen:allergens (id, code, name_fr, emoji)
            )
          )
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
    
    // Charger tous les ingrédients actifs
    const { data: ingredientsData } = await supabase
      .from('ingredients')
      .select(`
        id, name, category, is_available,
        ingredient_allergens (
          allergen_id,
          is_trace,
          allergen:allergens (id, code, name_fr, emoji)
        )
      `)
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .order('category')
      .order('name')
    
    setProducts(productsData || [])
    setCategories(categoriesData || [])
    setOptionGroups(optionGroupsData || [])
    setAllIngredients(ingredientsData || [])
    setLoading(false)
  }

  function openModal(product?: Product) {
    setActiveTab('info')
    setImageFile(null)
    setImagePreview(null)
    setIngredientSearch('')
    
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
        image_url: product.image_url,
      })
      setImagePreview(product.image_url)
      
      // Charger les propositions assignées
      const assigned = (product.product_option_groups || [])
        .sort((a, b) => a.display_order - b.display_order)
        .map(pog => ({
          id: pog.id,
          option_group_id: pog.option_group_id,
          display_order: pog.display_order,
        }))
      setAssignedPropositions(assigned)
      
      // Charger les ingrédients assignés
      const assignedIngs = (product.product_ingredients || []).map(pi => ({
        ingredient_id: pi.ingredient_id,
        is_essential: pi.is_essential,
      }))
      setAssignedIngredients(assignedIngs)
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
        image_url: null,
      })
      setAssignedPropositions([])
      setAssignedIngredients([])
    }
    
    setFormError('')
    setShowModal(true)
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  async function uploadImage(productId: string): Promise<string | null> {
    if (!imageFile) return form.image_url || null
    
    setUploadingImage(true)
    
    try {
      const fileExt = imageFile.name.split('.').pop()
      const fileName = `${productId}.${fileExt}`
      const filePath = `${establishmentId}/${fileName}`
      
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, imageFile, { upsert: true })
      
      if (uploadError) throw uploadError
      
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath)
      
      return publicUrl
    } catch (error: any) {
      console.error('Upload error:', error)
      return form.image_url || null
    } finally {
      setUploadingImage(false)
    }
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
      let imageUrl = form.image_url
      
      if (editingProduct) {
        if (imageFile) {
          imageUrl = await uploadImage(editingProduct.id)
        }
        
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
            image_url: imageUrl,
          })
          .eq('id', editingProduct.id)
        
        if (error) throw error
      } else {
        const slug = form.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
        
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
        
        if (imageFile && productId) {
          imageUrl = await uploadImage(productId)
          if (imageUrl) {
            await supabase
              .from('products')
              .update({ image_url: imageUrl })
              .eq('id', productId)
          }
        }
      }
      
      // Sauvegarder les propositions assignées
      if (productId) {
        await supabase
          .from('product_option_groups')
          .delete()
          .eq('product_id', productId)
        
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
        
        // Sauvegarder les ingrédients assignés
        await supabase
          .from('product_ingredients')
          .delete()
          .eq('product_id', productId)
        
        if (assignedIngredients.length > 0) {
          const { error: piError } = await supabase
            .from('product_ingredients')
            .insert(
              assignedIngredients.map(i => ({
                product_id: productId,
                ingredient_id: i.ingredient_id,
                is_essential: i.is_essential,
              }))
            )
          
          if (piError) throw piError
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

  // ==================== PROPOSITIONS ====================

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

  // ==================== INGRÉDIENTS ====================

  function addIngredient(ingredientId: string) {
    if (assignedIngredients.some(i => i.ingredient_id === ingredientId)) return
    
    setAssignedIngredients([
      ...assignedIngredients,
      { ingredient_id: ingredientId, is_essential: true }
    ])
  }

  function removeIngredient(ingredientId: string) {
    setAssignedIngredients(assignedIngredients.filter(i => i.ingredient_id !== ingredientId))
  }

  function toggleEssential(ingredientId: string) {
    setAssignedIngredients(assignedIngredients.map(i => 
      i.ingredient_id === ingredientId 
        ? { ...i, is_essential: !i.is_essential }
        : i
    ))
  }

  // Calculer les allergènes du produit (union des allergènes de tous les ingrédients)
  function getProductAllergens(): { allergen: Allergen, is_trace: boolean }[] {
    const allergenMap = new Map<string, { allergen: Allergen, is_trace: boolean }>()
    
    assignedIngredients.forEach(ai => {
      const ingredient = allIngredients.find(i => i.id === ai.ingredient_id)
      if (ingredient?.ingredient_allergens) {
        ingredient.ingredient_allergens.forEach(ia => {
          const existing = allergenMap.get(ia.allergen.code)
          // Si l'allergène existe déjà et qu'il est "contient", on garde "contient"
          // Sinon on met à jour avec la nouvelle valeur
          if (!existing || (existing.is_trace && !ia.is_trace)) {
            allergenMap.set(ia.allergen.code, {
              allergen: ia.allergen,
              is_trace: ia.is_trace
            })
          }
        })
      }
    })
    
    return Array.from(allergenMap.values()).sort((a, b) => 
      a.allergen.name_fr.localeCompare(b.allergen.name_fr)
    )
  }

  // ==================== DELETE ====================

  async function deleteProduct(product: Product) {
    if (!confirm(`Supprimer "${product.name}" ?`)) return
    
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', product.id)
    
    if (!error) loadData()
  }

  // ==================== FILTERS ====================

  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory ? p.category_id === selectedCategory : true
    const matchesSearch = searchQuery 
      ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
      : true
    return matchesCategory && matchesSearch
  })

  const availablePropositions = optionGroups.filter(
    og => !assignedPropositions.some(ap => ap.option_group_id === og.id)
  )

  const availableIngredients = allIngredients.filter(ing => {
    const notAssigned = !assignedIngredients.some(ai => ai.ingredient_id === ing.id)
    const matchesSearch = ingredientSearch 
      ? ing.name.toLowerCase().includes(ingredientSearch.toLowerCase())
      : true
    return notAssigned && matchesSearch
  })

  // Grouper les ingrédients disponibles par catégorie
  const groupedAvailableIngredients = availableIngredients.reduce((acc, ing) => {
    const cat = ing.category || 'Autres'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(ing)
    return acc
  }, {} as Record<string, Ingredient[]>)

  const productAllergens = getProductAllergens()

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
          className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 transition-colors"
        >
          ➕ Nouveau produit
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Recherche */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Rechercher un produit..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Filtre catégorie */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                !selectedCategory
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Tout
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Liste des produits */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4 animate-pulse">🍔</span>
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">🍔</span>
          <p className="text-gray-500">Aucun produit trouvé</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Produit</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Catégorie</th>
                <th className="text-right px-6 py-4 font-semibold text-gray-600">Prix</th>
                <th className="text-center px-6 py-4 font-semibold text-gray-600">Allergènes</th>
                <th className="text-center px-6 py-4 font-semibold text-gray-600">Status</th>
                <th className="text-right px-6 py-4 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map(product => {
                const category = categories.find(c => c.id === product.category_id)
                
                // Calculer les allergènes du produit
                const allergens = new Map<string, { emoji: string, name: string, is_trace: boolean }>()
                product.product_ingredients?.forEach(pi => {
                  pi.ingredient?.ingredient_allergens?.forEach(ia => {
                    const existing = allergens.get(ia.allergen.code)
                    if (!existing || (existing.is_trace && !ia.is_trace)) {
                      allergens.set(ia.allergen.code, {
                        emoji: ia.allergen.emoji,
                        name: ia.allergen.name_fr,
                        is_trace: ia.is_trace
                      })
                    }
                  })
                })
                
                return (
                  <tr key={product.id} className={`hover:bg-gray-50 ${!product.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-2xl">🍔</span>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{product.name}</p>
                          {product.product_ingredients && product.product_ingredients.length > 0 && (
                            <p className="text-xs text-gray-400">
                              {product.product_ingredients.length} ingrédient(s)
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">
                        {category?.name || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-semibold">
                      {product.price.toFixed(2)}€
                    </td>
                    <td className="px-6 py-4 text-center">
                      {allergens.size > 0 ? (
                        <div className="flex gap-1 justify-center flex-wrap">
                          {Array.from(allergens.values()).map(a => (
                            <span 
                              key={a.name} 
                              title={a.is_trace ? `Traces: ${a.name}` : a.name}
                              className={a.is_trace ? 'opacity-40' : ''}
                            >
                              {a.emoji}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        product.is_available
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {product.is_available ? 'Dispo' : 'Indispo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openModal(product)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => deleteProduct(product)}
                        className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        🗑️
                      </button>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {editingProduct ? '✏️ Modifier' : '➕ Nouveau'} produit
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >
                ✕
              </button>
            </div>
            
            {/* Tabs */}
            <div className="px-6 pt-4 border-b border-gray-100">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('info')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'info'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  📝 Infos
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
                <button
                  onClick={() => setActiveTab('ingredients')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'ingredients'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  🥬 Ingrédients ({assignedIngredients.length})
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
              
              {/* ==================== ONGLET INFO ==================== */}
              {activeTab === 'info' && (
                <form id="product-form" onSubmit={saveProduct} className="space-y-4">
                  {/* Image upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Photo du produit</label>
                    <div className="flex items-start gap-4">
                      <div className="w-32 h-32 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300">
                        {imagePreview ? (
                          <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-4xl">🍔</span>
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageSelect}
                          className="hidden"
                          id="image-upload"
                        />
                        <label
                          htmlFor="image-upload"
                          className="inline-block px-4 py-2 bg-gray-100 text-gray-700 rounded-xl cursor-pointer hover:bg-gray-200 transition-colors"
                        >
                          📷 {imagePreview ? 'Changer l\'image' : 'Ajouter une image'}
                        </label>
                        {imagePreview && (
                          <button
                            type="button"
                            onClick={() => {
                              setImageFile(null)
                              setImagePreview(null)
                              setForm({ ...form, image_url: null })
                            }}
                            className="ml-2 px-3 py-2 text-red-500 hover:bg-red-50 rounded-xl"
                          >
                            🗑️ Supprimer
                          </button>
                        )}
                        <p className="text-xs text-gray-400 mt-2">JPG, PNG ou WebP. Max 5MB.</p>
                      </div>
                    </div>
                  </div>

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
              )}
              
              {/* ==================== ONGLET PROPOSITIONS ==================== */}
              {activeTab === 'propositions' && (
                <div className="space-y-4">
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
              
              {/* ==================== ONGLET INGRÉDIENTS ==================== */}
              {activeTab === 'ingredients' && (
                <div className="space-y-6">
                  {/* Allergènes calculés */}
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <h3 className="font-medium text-orange-800 mb-2">🏷️ Allergènes du produit</h3>
                    {productAllergens.length === 0 ? (
                      <p className="text-orange-600 text-sm">Aucun allergène (ajoutez des ingrédients)</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {productAllergens.filter(a => !a.is_trace).map(a => (
                          <span key={a.allergen.code} className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
                            {a.allergen.emoji} {a.allergen.name_fr}
                          </span>
                        ))}
                        {productAllergens.filter(a => a.is_trace).map(a => (
                          <span key={a.allergen.code} className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-medium">
                            {a.allergen.emoji} {a.allergen.name_fr} <span className="italic">(traces)</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Ingrédients assignés */}
                  <div>
                    <h3 className="font-medium text-gray-700 mb-3">
                      Ingrédients assignés ({assignedIngredients.length})
                    </h3>
                    
                    {assignedIngredients.length === 0 ? (
                      <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400">
                        <p>Aucun ingrédient assigné</p>
                        <p className="text-sm mt-1">Ajoutez des ingrédients pour calculer les allergènes</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {assignedIngredients.map(ai => {
                          const ingredient = allIngredients.find(i => i.id === ai.ingredient_id)
                          if (!ingredient) return null
                          
                          return (
                            <div
                              key={ai.ingredient_id}
                              className={`rounded-xl p-3 flex items-center gap-3 ${
                                ingredient.is_available 
                                  ? 'bg-green-50 border border-green-200' 
                                  : 'bg-red-50 border border-red-200'
                              }`}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{ingredient.name}</span>
                                  {!ingredient.is_available && (
                                    <span className="bg-red-200 text-red-700 text-xs px-2 py-0.5 rounded">Rupture!</span>
                                  )}
                                </div>
                                <div className="flex gap-1 mt-1">
                                  {ingredient.ingredient_allergens?.map(ia => (
                                    <span 
                                      key={ia.allergen.code} 
                                      title={ia.is_trace ? `Traces: ${ia.allergen.name_fr}` : ia.allergen.name_fr}
                                      className={ia.is_trace ? 'opacity-40' : ''}
                                    >
                                      {ia.allergen.emoji}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleEssential(ai.ingredient_id)}
                                  className={`px-3 py-1 rounded-lg text-xs font-medium ${
                                    ai.is_essential
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-gray-100 text-gray-500'
                                  }`}
                                  title={ai.is_essential ? 'Essentiel: si en rupture, le produit sera indisponible' : 'Optionnel: n\'affecte pas la disponibilité'}
                                >
                                  {ai.is_essential ? '⚠️ Essentiel' : '➖ Optionnel'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeIngredient(ai.ingredient_id)}
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
                  
                  {/* Ajouter un ingrédient */}
                  <div>
                    <h3 className="font-medium text-gray-700 mb-3">Ajouter un ingrédient</h3>
                    
                    <input
                      type="text"
                      placeholder="🔍 Rechercher un ingrédient..."
                      value={ingredientSearch}
                      onChange={e => setIngredientSearch(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 mb-3"
                    />
                    
                    <div className="max-h-60 overflow-y-auto space-y-4">
                      {Object.entries(groupedAvailableIngredients).map(([category, ings]) => (
                        <div key={category}>
                          <p className="text-xs font-bold text-gray-400 uppercase mb-2">{category}</p>
                          <div className="space-y-1">
                            {ings.map(ing => (
                              <button
                                key={ing.id}
                                type="button"
                                onClick={() => addIngredient(ing.id)}
                                className={`w-full rounded-xl p-2 flex items-center gap-3 text-left transition-colors ${
                                  ing.is_available 
                                    ? 'bg-white border border-gray-200 hover:border-orange-300 hover:bg-orange-50' 
                                    : 'bg-gray-100 border border-gray-200 opacity-60'
                                }`}
                              >
                                <span className="text-lg">➕</span>
                                <div className="flex-1">
                                  <span className="font-medium text-sm">{ing.name}</span>
                                  {!ing.is_available && (
                                    <span className="ml-2 text-xs text-red-500">(Rupture)</span>
                                  )}
                                </div>
                                <div className="flex gap-0.5">
                                  {ing.ingredient_allergens?.slice(0, 4).map(ia => (
                                    <span key={ia.allergen.code} className={`text-sm ${ia.is_trace ? 'opacity-40' : ''}`}>
                                      {ia.allergen.emoji}
                                    </span>
                                  ))}
                                  {(ing.ingredient_allergens?.length || 0) > 4 && (
                                    <span className="text-xs text-gray-400">+{(ing.ingredient_allergens?.length || 0) - 4}</span>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      
                      {Object.keys(groupedAvailableIngredients).length === 0 && (
                        <div className="text-center py-6 text-gray-400">
                          <p>Aucun ingrédient disponible</p>
                          <p className="text-sm">{ingredientSearch ? 'Essayez une autre recherche' : 'Tous les ingrédients sont déjà assignés'}</p>
                        </div>
                      )}
                    </div>
                  </div>
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
                onClick={activeTab !== 'info' ? saveProduct : undefined}
                disabled={saving || uploadingImage}
                className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-50"
              >
                {uploadingImage ? '📷 Upload...' : saving ? 'Sauvegarde...' : '💾 Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}