'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Establishment = {
  id: string
  name: string
  slug: string
  address: string | null
  postal_code: string | null
  city: string | null
  phone: string | null
  email: string | null
  vat_number: string | null
  latitude: number | null
  longitude: number | null
  is_active: boolean
  logo_url: string | null
  opening_hours: any
  settings: any
}

type DeliveryConfig = {
  id: string
  establishment_id: string
  is_enabled: boolean
  min_order_amount: number
  max_delivery_minutes: number
  additional_time_minutes: number
}

export default function EstablishmentsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingEstablishment, setEditingEstablishment] = useState<Establishment | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  
  const [form, setForm] = useState({
    name: '',
    slug: '',
    address: '',
    postal_code: '',
    city: '',
    phone: '',
    email: '',
    vat_number: '',
    latitude: '',
    longitude: '',
    is_active: true,
  })

  const supabase = createClient()

  useEffect(() => {
    loadEstablishments()
  }, [])

  async function loadEstablishments() {
    setLoading(true)
    
    const { data, error } = await supabase
      .from('establishments')
      .select('*')
      .order('name')
    
    if (error) {
      console.error('Error loading establishments:', error)
    } else {
      setEstablishments(data || [])
    }
    
    setLoading(false)
  }

  function openModal(establishment?: Establishment) {
    if (establishment) {
      setEditingEstablishment(establishment)
      setForm({
        name: establishment.name || '',
        slug: establishment.slug || '',
        address: establishment.address || '',
        postal_code: establishment.postal_code || '',
        city: establishment.city || '',
        phone: establishment.phone || '',
        email: establishment.email || '',
        vat_number: establishment.vat_number || '',
        latitude: establishment.latitude?.toString() || '',
        longitude: establishment.longitude?.toString() || '',
        is_active: establishment.is_active,
      })
    } else {
      setEditingEstablishment(null)
      setForm({
        name: '',
        slug: '',
        address: '',
        postal_code: '',
        city: '',
        phone: '',
        email: '',
        vat_number: '',
        latitude: '',
        longitude: '',
        is_active: true,
      })
    }
    setFormError('')
    setShowModal(true)
  }

  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  async function geocodeAddress() {
    if (!form.address || !form.postal_code || !form.city) {
      setFormError('Remplissez l\'adresse complète pour géolocaliser')
      return
    }

    setGeocoding(true)
    setFormError('')

    try {
      const fullAddress = `${form.address}, ${form.postal_code} ${form.city}, Belgique`
      
      // Utiliser l'API route serveur (évite CORS)
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: fullAddress }),
      })

      const data = await response.json()

      if (data.success) {
        setForm({
          ...form,
          latitude: data.latitude.toFixed(6),
          longitude: data.longitude.toFixed(6),
        })
        console.log('Adresse trouvée:', data.address)
      } else {
        setFormError(data.error || 'Adresse non trouvée. Vérifiez et réessayez.')
      }
    } catch (error) {
      console.error('Geocoding error:', error)
      setFormError('Erreur lors de la géolocalisation')
    } finally {
      setGeocoding(false)
    }
  }

  async function saveEstablishment(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    
    if (!form.name.trim()) {
      setFormError('Le nom est obligatoire')
      return
    }
    
    setSaving(true)
    
    try {
      const slug = form.slug || generateSlug(form.name)
      
      const establishmentData = {
        name: form.name,
        slug: slug,
        address: form.address || null,
        postal_code: form.postal_code || null,
        city: form.city || null,
        phone: form.phone || null,
        email: form.email || null,
        vat_number: form.vat_number || null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        is_active: form.is_active,
      }

      if (editingEstablishment) {
        const { error } = await supabase
          .from('establishments')
          .update(establishmentData)
          .eq('id', editingEstablishment.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('establishments')
          .insert(establishmentData)
        
        if (error) throw error
      }
      
      setShowModal(false)
      loadEstablishments()
    } catch (error: any) {
      console.error('Erreur:', error)
      setFormError(error.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(establishment: Establishment) {
    const { error } = await supabase
      .from('establishments')
      .update({ is_active: !establishment.is_active })
      .eq('id', establishment.id)
    
    if (!error) loadEstablishments()
  }

  async function deleteEstablishment(establishment: Establishment) {
    if (!confirm(`Supprimer "${establishment.name}" ? Cette action est irréversible.`)) return
    
    const { error } = await supabase
      .from('establishments')
      .delete()
      .eq('id', establishment.id)
    
    if (!error) loadEstablishments()
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Établissements</h1>
          <p className="text-gray-500">Gérez vos points de vente</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2"
        >
          ➕ Nouvel établissement
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
          Chargement...
        </div>
      ) : establishments.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">🏪</span>
          <p className="text-gray-500 mb-4">Aucun établissement</p>
          <button onClick={() => openModal()} className="text-orange-500 font-medium hover:underline">
            Créer votre premier établissement
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {establishments.map(establishment => (
            <div
              key={establishment.id}
              className={`bg-white rounded-2xl p-6 border-2 ${
                establishment.is_active ? 'border-gray-100' : 'border-gray-100 opacity-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center text-3xl">
                    🏪
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">{establishment.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        establishment.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {establishment.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                    <p className="text-gray-500 text-sm">
                      {establishment.address && `${establishment.address}, `}
                      {establishment.postal_code} {establishment.city}
                    </p>
                    <p className="text-gray-400 text-xs mt-1">
                      /order/{establishment.slug}
                      {establishment.latitude && establishment.longitude && (
                        <span className="ml-2 text-green-600">📍 GPS OK</span>
                      )}
                      {(!establishment.latitude || !establishment.longitude) && (
                        <span className="ml-2 text-orange-500">⚠️ GPS manquant</span>
                      )}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleActive(establishment)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      establishment.is_active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {establishment.is_active ? 'Actif' : 'Inactif'}
                  </button>
                  <button
                    onClick={() => openModal(establishment)}
                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => deleteEstablishment(establishment)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingEstablishment ? 'Modifier l\'établissement' : 'Nouvel établissement'}
              </h2>
            </div>
            
            <form onSubmit={saveEstablishment} className="p-6 space-y-6">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                  {formError}
                </div>
              )}
              
              {/* Informations générales */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                  📋 Informations générales
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-xs ${form.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {form.is_active ? 'Actif' : 'Inactif'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✏️
                  </button>
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value, slug: generateSlug(e.target.value) })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="MDjambo Jurbise"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Slug (URL)</label>
                    <div className="flex items-center">
                      <span className="text-gray-400 mr-1">/order/</span>
                      <input
                        type="text"
                        value={form.slug}
                        onChange={e => setForm({ ...form, slug: e.target.value })}
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="jurbise"
                      />
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Adresse</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={e => setForm({ ...form, address: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Rue de Ghlin 2"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Code postal</label>
                    <input
                      type="text"
                      value={form.postal_code}
                      onChange={e => setForm({ ...form, postal_code: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="7050"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ville</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={e => setForm({ ...form, city: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Jurbise"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="+32 497753554"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="contact@mdjambo.be"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Numéro de TVA</label>
                  <input
                    type="text"
                    value={form.vat_number}
                    onChange={e => setForm({ ...form, vat_number: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="BE 1009.237.290"
                  />
                </div>
              </div>
              
              {/* Coordonnées GPS */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                  📍 Coordonnées GPS (obligatoire pour la livraison)
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Latitude</label>
                    <input
                      type="text"
                      value={form.latitude}
                      onChange={e => setForm({ ...form, latitude: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="50.4547"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Longitude</label>
                    <input
                      type="text"
                      value={form.longitude}
                      onChange={e => setForm({ ...form, longitude: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="3.9047"
                    />
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={geocodeAddress}
                  disabled={geocoding || !form.address || !form.postal_code || !form.city}
                  className="w-full bg-blue-500 text-white font-semibold py-3 rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {geocoding ? (
                    <>⏳ Recherche en cours...</>
                  ) : (
                    <>📍 Géolocaliser automatiquement</>
                  )}
                </button>
                
                <p className="text-xs text-gray-500">
                  💡 Les coordonnées GPS sont utilisées pour calculer les distances de livraison.
                  Cliquez sur "Géolocaliser" pour remplir automatiquement à partir de l'adresse.
                </p>
              </div>
              
              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold text-gray-700 hover:bg-gray-50"
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
    </div>
  )
}