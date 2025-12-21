'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Establishment = {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  vat_number: string | null
  latitude: number | null
  longitude: number | null
  pickup_enabled: boolean
  delivery_enabled: boolean
  online_payment_only: boolean
}

type DeliveryZone = {
  id: string
  name: string
  min_minutes: number
  max_minutes: number
  delivery_fee: number
  is_active: boolean
  display_order: number
}

export default function SettingsPage() {
  const [establishment, setEstablishment] = useState<Establishment | null>(null)
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'delivery' | 'zones'>('general')
  
  // Form établissement
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    vat_number: '',
    latitude: '',
    longitude: '',
    pickup_enabled: true,
    delivery_enabled: false,
    online_payment_only: false,
  })

  // Form nouvelle zone
  const [showZoneModal, setShowZoneModal] = useState(false)
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null)
  const [zoneForm, setZoneForm] = useState({
    name: '',
    min_minutes: 0,
    max_minutes: 15,
    delivery_fee: 2.50,
    is_active: true,
  })

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    
    // Charger l'établissement
    const { data: estData } = await supabase
      .from('establishments')
      .select('*')
      .eq('id', establishmentId)
      .single()
    
    if (estData) {
      setEstablishment(estData)
      setForm({
        name: estData.name || '',
        address: estData.address || '',
        phone: estData.phone || '',
        email: estData.email || '',
        vat_number: estData.vat_number || '',
        latitude: estData.latitude?.toString() || '',
        longitude: estData.longitude?.toString() || '',
        pickup_enabled: estData.pickup_enabled ?? true,
        delivery_enabled: estData.delivery_enabled ?? false,
        online_payment_only: estData.online_payment_only ?? false,
      })
    }

    // Charger les zones
    const { data: zonesData } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('establishment_id', establishmentId)
      .order('max_minutes')
    
    setZones(zonesData || [])
    setLoading(false)
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    
    const { error } = await supabase
      .from('establishments')
      .update({
        name: form.name,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        vat_number: form.vat_number || null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        pickup_enabled: form.pickup_enabled,
        delivery_enabled: form.delivery_enabled,
        online_payment_only: form.online_payment_only,
      })
      .eq('id', establishmentId)
    
    if (error) {
      console.error('Erreur:', error)
      alert('Erreur lors de la sauvegarde')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    
    setSaving(false)
  }

  function openZoneModal(zone?: DeliveryZone) {
    if (zone) {
      setEditingZone(zone)
      setZoneForm({
        name: zone.name,
        min_minutes: zone.min_minutes || 0,
        max_minutes: zone.max_minutes,
        delivery_fee: zone.delivery_fee,
        is_active: zone.is_active,
      })
    } else {
      setEditingZone(null)
      setZoneForm({
        name: '',
        min_minutes: 0,
        max_minutes: 15,
        delivery_fee: 2.50,
        is_active: true,
      })
    }
    setShowZoneModal(true)
  }

  async function saveZone(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      if (editingZone) {
        const { error } = await supabase
          .from('delivery_zones')
          .update({
            name: zoneForm.name,
            min_minutes: zoneForm.min_minutes,
            max_minutes: zoneForm.max_minutes,
            delivery_fee: zoneForm.delivery_fee,
            is_active: zoneForm.is_active,
          })
          .eq('id', editingZone.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('delivery_zones')
          .insert({
            establishment_id: establishmentId,
            name: zoneForm.name,
            min_minutes: zoneForm.min_minutes,
            max_minutes: zoneForm.max_minutes,
            delivery_fee: zoneForm.delivery_fee,
            is_active: zoneForm.is_active,
          })
        
        if (error) throw error
      }

      setShowZoneModal(false)
      loadData()
    } catch (error: any) {
      console.error('Erreur:', error)
      alert('Erreur: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteZone(zone: DeliveryZone) {
    if (!confirm(`Supprimer la zone "${zone.name}" ?`)) return

    const { error } = await supabase
      .from('delivery_zones')
      .delete()
      .eq('id', zone.id)

    if (!error) loadData()
  }

  async function toggleZoneActive(zone: DeliveryZone) {
    const { error } = await supabase
      .from('delivery_zones')
      .update({ is_active: !zone.is_active })
      .eq('id', zone.id)

    if (!error) loadData()
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
          Chargement...
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500">Configuration de l'établissement</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'general'
              ? 'bg-orange-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          🏪 Général
        </button>
        <button
          onClick={() => setActiveTab('delivery')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'delivery'
              ? 'bg-orange-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          🚗 Livraison
        </button>
        <button
          onClick={() => setActiveTab('zones')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'zones'
              ? 'bg-orange-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          📍 Zones ({zones.length})
        </button>
      </div>

      {/* Tab: Général */}
      {activeTab === 'general' && (
        <div className="bg-white rounded-2xl p-8 max-w-2xl">
          <h2 className="text-xl font-bold text-gray-900 mb-6">
            🏪 Informations établissement
          </h2>
          
          <form onSubmit={saveSettings} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom de l'établissement *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Adresse
              </label>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Rue de Mons 123, 7050 Jurbise"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                onChange={e => setForm({ ...form, vat_number: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="BE 0123.456.789"
              />
            </div>

            <div className="pt-4 flex items-center gap-4">
              <button
                type="submit"
                disabled={saving}
                className="bg-orange-500 text-white font-semibold px-8 py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer'}
              </button>
              {saved && (
                <span className="text-green-600 font-medium">✅ Sauvegardé !</span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Tab: Livraison */}
      {activeTab === 'delivery' && (
        <div className="bg-white rounded-2xl p-8 max-w-2xl">
          <h2 className="text-xl font-bold text-gray-900 mb-6">
            🚗 Configuration livraison
          </h2>
          
          <form onSubmit={saveSettings} className="space-y-6">
            {/* Coordonnées GPS */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <h3 className="font-bold text-blue-800 mb-2">📍 Coordonnées GPS</h3>
              <p className="text-sm text-blue-700 mb-4">
                Nécessaires pour calculer les distances de livraison
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Latitude
                  </label>
                  <input
                    type="text"
                    value={form.latitude}
                    onChange={e => setForm({ ...form, latitude: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="50.4867"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Longitude
                  </label>
                  <input
                    type="text"
                    value={form.longitude}
                    onChange={e => setForm({ ...form, longitude: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="3.9167"
                  />
                </div>
              </div>
              <p className="text-xs text-blue-600 mt-2">
                💡 Trouve les coordonnées sur Google Maps (clic droit → coordonnées)
              </p>
            </div>

            {/* Options */}
            <div className="space-y-4">
              <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={form.pickup_enabled}
                  onChange={e => setForm({ ...form, pickup_enabled: e.target.checked })}
                  className="w-5 h-5 rounded text-orange-500"
                />
                <div>
                  <span className="font-medium">🥡 Click & Collect activé</span>
                  <p className="text-xs text-gray-500">Les clients peuvent commander et retirer sur place</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={form.delivery_enabled}
                  onChange={e => setForm({ ...form, delivery_enabled: e.target.checked })}
                  className="w-5 h-5 rounded text-orange-500"
                />
                <div>
                  <span className="font-medium">🚗 Livraison activée</span>
                  <p className="text-xs text-gray-500">Les clients peuvent se faire livrer</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={form.online_payment_only}
                  onChange={e => setForm({ ...form, online_payment_only: e.target.checked })}
                  className="w-5 h-5 rounded text-orange-500"
                />
                <div>
                  <span className="font-medium">💳 Paiement en ligne uniquement</span>
                  <p className="text-xs text-gray-500">Pas de paiement à la livraison/retrait</p>
                </div>
              </label>
            </div>

            <div className="pt-4 flex items-center gap-4">
              <button
                type="submit"
                disabled={saving}
                className="bg-orange-500 text-white font-semibold px-8 py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer'}
              </button>
              {saved && (
                <span className="text-green-600 font-medium">✅ Sauvegardé !</span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Tab: Zones */}
      {activeTab === 'zones' && (
        <div className="max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">📍 Zones de livraison</h2>
              <p className="text-gray-500 text-sm">Définissez vos zones et tarifs de livraison</p>
            </div>
            <button
              onClick={() => openZoneModal()}
              className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600"
            >
              ➕ Nouvelle zone
            </button>
          </div>

          {zones.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center">
              <span className="text-5xl block mb-4">📍</span>
              <p className="text-gray-500 mb-4">Aucune zone de livraison configurée</p>
              <button
                onClick={() => openZoneModal()}
                className="text-orange-500 font-medium hover:underline"
              >
                Créer votre première zone
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {zones.map(zone => (
                <div
                  key={zone.id}
                  className={`bg-white rounded-2xl p-6 border-2 ${
                    zone.is_active ? 'border-green-200' : 'border-gray-200 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-lg">{zone.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          zone.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {zone.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-gray-600">
                        <span>⏱️ {zone.min_minutes}-{zone.max_minutes} min</span>
                        <span>💶 {Number(zone.delivery_fee).toFixed(2)}€</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleZoneActive(zone)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium ${
                          zone.is_active
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {zone.is_active ? '⏸️' : '▶️'}
                      </button>
                      <button
                        onClick={() => openZoneModal(zone)}
                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => deleteZone(zone)}
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

          {/* Info */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="font-bold text-blue-800 mb-2">💡 Comment ça marche ?</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Le temps de trajet est estimé à partir de la distance (30 km/h en moyenne)</li>
              <li>• Une adresse dans la zone "0-15 min" paiera les frais de cette zone</li>
              <li>• Une adresse au-delà de toutes les zones = pas de livraison possible</li>
            </ul>
          </div>
        </div>
      )}

      {/* Modal Zone */}
      {showZoneModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingZone ? 'Modifier la zone' : 'Nouvelle zone'}
            </h2>
            
            <form onSubmit={saveZone} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
                <input
                  type="text"
                  value={zoneForm.name}
                  onChange={e => setZoneForm({ ...zoneForm, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Zone proche, Zone éloignée..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Temps min (minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={zoneForm.min_minutes}
                    onChange={e => setZoneForm({ ...zoneForm, min_minutes: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Temps max (minutes) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={zoneForm.max_minutes}
                    onChange={e => setZoneForm({ ...zoneForm, max_minutes: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frais de livraison (€) *
                </label>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  value={zoneForm.delivery_fee}
                  onChange={e => setZoneForm({ ...zoneForm, delivery_fee: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={zoneForm.is_active}
                  onChange={e => setZoneForm({ ...zoneForm, is_active: e.target.checked })}
                  className="w-5 h-5 rounded text-orange-500"
                />
                <span className="font-medium">✅ Zone active</span>
              </label>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowZoneModal(false)}
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
