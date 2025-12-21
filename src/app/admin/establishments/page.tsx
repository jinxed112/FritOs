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
  delivery_enabled: boolean
  pickup_enabled: boolean
  online_payment_only: boolean
  is_active: boolean
}

export default function EstablishmentsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Establishment | null>(null)
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
    delivery_enabled: true,
    pickup_enabled: true,
    online_payment_only: true,
    is_active: true,
  })

  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('establishments')
      .select('*')
      .order('name')

    if (!error && data) {
      setEstablishments(data)
    }
    setLoading(false)
  }

  function openModal(establishment?: Establishment) {
    if (establishment) {
      setEditing(establishment)
      setForm({
        name: establishment.name,
        slug: establishment.slug,
        address: establishment.address || '',
        postal_code: establishment.postal_code || '',
        city: establishment.city || '',
        phone: establishment.phone || '',
        email: establishment.email || '',
        vat_number: establishment.vat_number || '',
        latitude: establishment.latitude?.toString() || '',
        longitude: establishment.longitude?.toString() || '',
        delivery_enabled: establishment.delivery_enabled,
        pickup_enabled: establishment.pickup_enabled,
        online_payment_only: establishment.online_payment_only,
        is_active: establishment.is_active,
      })
    } else {
      setEditing(null)
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
        delivery_enabled: true,
        pickup_enabled: true,
        online_payment_only: true,
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
      const fullAddress = `${form.address}, ${form.postal_code} ${form.city}, Belgium`
      const response = await fetch(
        `https://api.openrouteservice.org/geocode/search?api_key=${process.env.NEXT_PUBLIC_OPENROUTE_API_KEY}&text=${encodeURIComponent(fullAddress)}&boundary.country=BE&size=1`
      )

      const data = await response.json()

      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].geometry.coordinates
        setForm({
          ...form,
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6),
        })
      } else {
        setFormError('Adresse non trouvée. Vérifiez et réessayez.')
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

    if (!form.latitude || !form.longitude) {
      setFormError('Les coordonnées GPS sont obligatoires pour le calcul de livraison')
      return
    }

    setSaving(true)

    try {
      const data = {
        name: form.name,
        slug: form.slug || generateSlug(form.name),
        address: form.address || null,
        postal_code: form.postal_code || null,
        city: form.city || null,
        phone: form.phone || null,
        email: form.email || null,
        vat_number: form.vat_number || null,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        delivery_enabled: form.delivery_enabled,
        pickup_enabled: form.pickup_enabled,
        online_payment_only: form.online_payment_only,
        is_active: form.is_active,
      }

      if (editing) {
        const { error } = await supabase
          .from('establishments')
          .update(data)
          .eq('id', editing.id)

        if (error) throw error
      } else {
        // Créer aussi les configs par défaut
        const { data: newEst, error } = await supabase
          .from('establishments')
          .insert(data)
          .select()
          .single()

        if (error) throw error

        // Créer les configs par défaut
        await Promise.all([
          supabase.from('loyalty_config').insert({ establishment_id: newEst.id }),
          supabase.from('time_slots_config').insert({ establishment_id: newEst.id }),
          supabase.from('delivery_config').insert({ establishment_id: newEst.id }),
          // Zones de livraison par défaut
          supabase.from('delivery_zones').insert([
            { establishment_id: newEst.id, min_minutes: 0, max_minutes: 4, delivery_fee: 2.00, display_order: 1 },
            { establishment_id: newEst.id, min_minutes: 4, max_minutes: 10, delivery_fee: 3.00, display_order: 2 },
            { establishment_id: newEst.id, min_minutes: 10, max_minutes: 15, delivery_fee: 4.00, display_order: 3 },
          ]),
        ])
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

  async function toggleActive(est: Establishment) {
    const { error } = await supabase
      .from('establishments')
      .update({ is_active: !est.is_active })
      .eq('id', est.id)

    if (!error) loadData()
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
          <p className="text-gray-500">Aucun établissement</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {establishments.map((est) => (
            <div
              key={est.id}
              className={`bg-white rounded-2xl p-6 border border-gray-100 ${
                !est.is_active ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center text-3xl">
                    🏪
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold">{est.name}</h3>
                      <span className="text-sm bg-gray-100 px-2 py-0.5 rounded font-mono">
                        /{est.slug}
                      </span>
                    </div>
                    <p className="text-gray-500">
                      {est.address}, {est.postal_code} {est.city}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      {est.pickup_enabled && (
                        <span className="flex items-center gap-1 text-green-600">
                          <span>🥡</span> Click & Collect
                        </span>
                      )}
                      {est.delivery_enabled && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <span>🚗</span> Livraison
                        </span>
                      )}
                      {est.latitude && est.longitude && (
                        <span className="flex items-center gap-1 text-gray-400">
                          <span>📍</span> GPS OK
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleActive(est)}
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      est.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {est.is_active ? 'Actif' : 'Inactif'}
                  </button>
                  <button
                    onClick={() => openModal(est)}
                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                  >
                    ✏️
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
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900">
                {editing ? 'Modifier l\'établissement' : 'Nouvel établissement'}
              </h2>
            </div>

            <form onSubmit={saveEstablishment} className="p-6 space-y-6">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                  {formError}
                </div>
              )}

              {/* Infos de base */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                  <span>📋</span> Informations générales
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nom *
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => {
                        setForm({
                          ...form,
                          name: e.target.value,
                          slug: form.slug || generateSlug(e.target.value),
                        })
                      }}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="MDjambo Jurbise"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Slug (URL)
                    </label>
                    <div className="flex items-center">
                      <span className="text-gray-400 mr-1">/order/</span>
                      <input
                        type="text"
                        value={form.slug}
                        onChange={(e) =>
                          setForm({ ...form, slug: e.target.value.toLowerCase() })
                        }
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                        placeholder="jurbise"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Adresse
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Rue de Ghlin 2"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Code postal
                    </label>
                    <input
                      type="text"
                      value={form.postal_code}
                      onChange={(e) =>
                        setForm({ ...form, postal_code: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="7050"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ville
                    </label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Jurbise"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="+32 65 00 00 00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="contact@mdjambo.be"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Numéro de TVA
                  </label>
                  <input
                    type="text"
                    value={form.vat_number}
                    onChange={(e) =>
                      setForm({ ...form, vat_number: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="BE 0123.456.789"
                  />
                </div>
              </div>

              {/* GPS */}
              <div className="space-y-4 p-4 bg-blue-50 rounded-xl">
                <h3 className="font-semibold text-blue-800 flex items-center gap-2">
                  <span>📍</span> Coordonnées GPS (obligatoire pour la livraison)
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Latitude
                    </label>
                    <input
                      type="text"
                      value={form.latitude}
                      onChange={(e) =>
                        setForm({ ...form, latitude: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                      placeholder="50.4833"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Longitude
                    </label>
                    <input
                      type="text"
                      value={form.longitude}
                      onChange={(e) =>
                        setForm({ ...form, longitude: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                      placeholder="3.9167"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={geocodeAddress}
                  disabled={geocoding}
                  className="w-full bg-blue-500 text-white font-semibold py-3 rounded-xl hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {geocoding ? (
                    <>⏳ Géolocalisation...</>
                  ) : (
                    <>🔍 Géolocaliser automatiquement</>
                  )}
                </button>
              </div>

              {/* Options */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                  <span>⚙️</span> Options de commande
                </h3>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={form.pickup_enabled}
                      onChange={(e) =>
                        setForm({ ...form, pickup_enabled: e.target.checked })
                      }
                      className="w-5 h-5 rounded text-orange-500"
                    />
                    <div>
                      <span className="font-medium">🥡 Click & Collect</span>
                      <p className="text-xs text-gray-500">
                        Permettre les commandes à emporter
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={form.delivery_enabled}
                      onChange={(e) =>
                        setForm({ ...form, delivery_enabled: e.target.checked })
                      }
                      className="w-5 h-5 rounded text-orange-500"
                    />
                    <div>
                      <span className="font-medium">🚗 Livraison</span>
                      <p className="text-xs text-gray-500">
                        Permettre les livraisons à domicile
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={form.online_payment_only}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          online_payment_only: e.target.checked,
                        })
                      }
                      className="w-5 h-5 rounded text-orange-500"
                    />
                    <div>
                      <span className="font-medium">💳 Paiement en ligne uniquement</span>
                      <p className="text-xs text-gray-500">
                        Désactiver = permettre paiement sur place
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) =>
                        setForm({ ...form, is_active: e.target.checked })
                      }
                      className="w-5 h-5 rounded text-orange-500"
                    />
                    <div>
                      <span className="font-medium">✅ Établissement actif</span>
                      <p className="text-xs text-gray-500">
                        Visible sur le site et accepte les commandes
                      </p>
                    </div>
                  </label>
                </div>
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
