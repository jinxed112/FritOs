'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type DeliveryZone = {
  id: string
  name: string
  postal_codes: string[]
  delivery_fee: number
  min_order_amount: number | null
  is_active: boolean
}

type DeliveryConfig = {
  id: string
  establishment_id: string
  is_enabled: boolean
  max_distance_km: number
  min_order_amount: number
  base_delivery_fee: number
  fee_per_km: number
  free_delivery_threshold: number | null
  estimated_time_minutes: number
}

type Establishment = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  delivery_enabled: boolean
}

export default function DeliverySettingsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>('')
  const [config, setConfig] = useState<DeliveryConfig | null>(null)
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [showZoneModal, setShowZoneModal] = useState(false)
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null)
  const [zoneForm, setZoneForm] = useState({ 
    name: '', 
    postal_codes: '', 
    delivery_fee: 2.50,
    min_order_amount: 15
  })

  const [testAddress, setTestAddress] = useState('')
  const [testResult, setTestResult] = useState<{ distance: number; fee: number; deliverable: boolean } | null>(null)
  const [testing, setTesting] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadEstablishments() }, [])
  useEffect(() => { if (selectedEstablishment) { loadConfig(); loadZones() } }, [selectedEstablishment])

  async function loadEstablishments() {
    const { data } = await supabase
      .from('establishments')
      .select('id, name, latitude, longitude, delivery_enabled')
      .eq('is_active', true)
      .order('name')
    
    if (data && data.length > 0) { 
      setEstablishments(data)
      setSelectedEstablishment(data[0].id) 
    }
    setLoading(false)
  }

  async function loadConfig() {
    const { data, error } = await supabase
      .from('delivery_config')
      .select('*')
      .eq('establishment_id', selectedEstablishment)
      .single()
    
    if (error && error.code === 'PGRST116') {
      // Pas de config, créer avec valeurs par défaut
      const { data: newConfig, error: insertError } = await supabase
        .from('delivery_config')
        .insert({ 
          establishment_id: selectedEstablishment,
          is_enabled: false,
          max_distance_km: 15,
          min_order_amount: 15,
          base_delivery_fee: 2.50,
          fee_per_km: 0.50,
          estimated_time_minutes: 30
        })
        .select()
        .single()
      
      if (insertError) {
        console.error('Erreur création config:', insertError)
      } else {
        setConfig(newConfig)
      }
    } else if (data) { 
      setConfig(data) 
    }
  }

  async function loadZones() {
    const { data } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('establishment_id', selectedEstablishment)
      .order('name')
    
    setZones(data || [])
  }

  async function saveConfig() {
    if (!config) return
    setSaving(true)
    setSaved(false)
    
    const { error } = await supabase
      .from('delivery_config')
      .update({
        is_enabled: config.is_enabled,
        max_distance_km: config.max_distance_km,
        min_order_amount: config.min_order_amount,
        base_delivery_fee: config.base_delivery_fee,
        fee_per_km: config.fee_per_km,
        free_delivery_threshold: config.free_delivery_threshold,
        estimated_time_minutes: config.estimated_time_minutes,
        updated_at: new Date().toISOString()
      })
      .eq('id', config.id)
    
    if (error) {
      console.error('Erreur sauvegarde:', error)
      alert('Erreur: ' + error.message)
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
        postal_codes: zone.postal_codes?.join(', ') || '',
        delivery_fee: zone.delivery_fee,
        min_order_amount: zone.min_order_amount || 15
      }) 
    } else { 
      setEditingZone(null)
      setZoneForm({ 
        name: '',
        postal_codes: '',
        delivery_fee: 2.50,
        min_order_amount: 15
      }) 
    }
    setShowZoneModal(true)
  }

  async function saveZone(e: React.FormEvent) {
    e.preventDefault()
    
    const postalCodesArray = zoneForm.postal_codes
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
    
    if (editingZone) { 
      await supabase
        .from('delivery_zones')
        .update({ 
          name: zoneForm.name,
          postal_codes: postalCodesArray,
          delivery_fee: zoneForm.delivery_fee,
          min_order_amount: zoneForm.min_order_amount
        })
        .eq('id', editingZone.id) 
    } else { 
      await supabase
        .from('delivery_zones')
        .insert({ 
          establishment_id: selectedEstablishment, 
          name: zoneForm.name,
          postal_codes: postalCodesArray,
          delivery_fee: zoneForm.delivery_fee,
          min_order_amount: zoneForm.min_order_amount
        }) 
    }
    setShowZoneModal(false)
    loadZones()
  }

  async function deleteZone(zone: DeliveryZone) {
    if (!confirm(`Supprimer la zone "${zone.name}" ?`)) return
    await supabase.from('delivery_zones').delete().eq('id', zone.id)
    loadZones()
  }

  async function toggleZoneActive(zone: DeliveryZone) {
    await supabase.from('delivery_zones').update({ is_active: !zone.is_active }).eq('id', zone.id)
    loadZones()
  }

  async function testDeliveryAddress() {
    if (!testAddress.trim()) return
    setTesting(true)
    setTestResult(null)
    
    try {
      // Extraire le code postal de l'adresse
      const postalMatch = testAddress.match(/\b(\d{4})\b/)
      const postalCode = postalMatch ? postalMatch[1] : null
      
      if (postalCode) {
        // Chercher si le code postal est dans une zone
        const matchingZone = zones.find(z => 
          z.is_active && z.postal_codes?.includes(postalCode)
        )
        
        if (matchingZone) {
          setTestResult({
            distance: 0,
            fee: matchingZone.delivery_fee,
            deliverable: true
          })
        } else {
          setTestResult({
            distance: 0,
            fee: 0,
            deliverable: false
          })
        }
      } else {
        alert('Impossible de trouver le code postal dans l\'adresse')
      }
    } catch (error) {
      console.error('Erreur test:', error)
      alert('Erreur lors du test')
    } finally {
      setTesting(false)
    }
  }

  const currentEst = establishments.find(e => e.id === selectedEstablishment)

  if (loading) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Livraison</h1>
          <p className="text-gray-500">Configurez les zones et frais de livraison</p>
        </div>
        {establishments.length > 1 && (
          <select
            value={selectedEstablishment}
            onChange={(e) => setSelectedEstablishment(e.target.value)}
            className="px-4 py-2 rounded-xl border border-gray-200"
          >
            {establishments.map((est) => (
              <option key={est.id} value={est.id}>{est.name}</option>
            ))}
          </select>
        )}
      </div>

      {config && (
        <div className="space-y-6">
          {/* Paramètres généraux */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>⚙️</span> Paramètres généraux
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Distance maximum (km)
                </label>
                <input 
                  type="number" 
                  step="0.5"
                  value={config.max_distance_km} 
                  onChange={e => setConfig({ ...config, max_distance_km: parseFloat(e.target.value) || 15 })} 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Commande minimum (€)
                </label>
                <input 
                  type="number" 
                  step="0.5" 
                  value={config.min_order_amount} 
                  onChange={e => setConfig({ ...config, min_order_amount: parseFloat(e.target.value) || 0 })} 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frais de base (€)
                </label>
                <input 
                  type="number" 
                  step="0.5" 
                  value={config.base_delivery_fee} 
                  onChange={e => setConfig({ ...config, base_delivery_fee: parseFloat(e.target.value) || 0 })} 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frais par km (€)
                </label>
                <input 
                  type="number" 
                  step="0.1" 
                  value={config.fee_per_km} 
                  onChange={e => setConfig({ ...config, fee_per_km: parseFloat(e.target.value) || 0 })} 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Livraison gratuite à partir de (€)
                </label>
                <input 
                  type="number" 
                  step="0.5" 
                  value={config.free_delivery_threshold || ''} 
                  onChange={e => setConfig({ ...config, free_delivery_threshold: e.target.value ? parseFloat(e.target.value) : null })} 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" 
                  placeholder="—"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Temps estimé (min)
                </label>
                <input 
                  type="number" 
                  value={config.estimated_time_minutes} 
                  onChange={e => setConfig({ ...config, estimated_time_minutes: parseInt(e.target.value) || 30 })} 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" 
                />
              </div>
            </div>
            
            <div className="mt-6 flex items-center gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.is_enabled}
                  onChange={e => setConfig({ ...config, is_enabled: e.target.checked })}
                  className="w-5 h-5 rounded text-orange-500"
                />
                <span className="font-medium">Livraison activée</span>
              </label>
              
              <div className="flex-1"></div>
              
              <button 
                onClick={saveConfig} 
                disabled={saving} 
                className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer'}
              </button>
              {saved && <span className="text-green-600 font-medium">✅ Sauvegardé !</span>}
            </div>
          </div>

          {/* Zones par code postal */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span>📍</span> Zones de livraison (par code postal)
              </h2>
              <button 
                onClick={() => openZoneModal()} 
                className="bg-orange-500 text-white font-semibold px-4 py-2 rounded-xl hover:bg-orange-600"
              >
                + Ajouter
              </button>
            </div>
            
            {zones.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <span className="text-4xl block mb-2">📍</span>
                Aucune zone configurée
              </div>
            ) : (
              <div className="space-y-3">
                {zones.map(zone => (
                  <div 
                    key={zone.id} 
                    className={`p-4 rounded-xl border flex items-center justify-between ${
                      zone.is_active ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50 opacity-60'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg">{zone.name}</span>
                        <span className="bg-orange-500 text-white px-3 py-1 rounded-lg font-bold">
                          {zone.delivery_fee.toFixed(2)} €
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Codes postaux: {zone.postal_codes?.join(', ') || 'Aucun'}
                      </p>
                      {zone.min_order_amount && (
                        <p className="text-sm text-gray-400">
                          Min. commande: {zone.min_order_amount} €
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => toggleZoneActive(zone)} 
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          zone.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {zone.is_active ? 'Actif' : 'Inactif'}
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
                ))}
              </div>
            )}
          </div>

          {/* Test adresse */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>🧪</span> Tester une adresse
            </h2>
            <div className="flex gap-4">
              <input 
                type="text" 
                value={testAddress} 
                onChange={e => setTestAddress(e.target.value)} 
                placeholder="Ex: Rue de Mons 123, 7000 Mons" 
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" 
              />
              <button 
                onClick={testDeliveryAddress} 
                disabled={testing || !testAddress.trim()} 
                className="bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-600 disabled:opacity-50"
              >
                {testing ? '⏳...' : '🔍 Tester'}
              </button>
            </div>
            
            {testResult && (
              <div className={`mt-4 p-4 rounded-xl ${
                testResult.deliverable 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center gap-6">
                  <span className="text-4xl">{testResult.deliverable ? '✅' : '❌'}</span>
                  <div>
                    <p className={`font-bold text-lg ${
                      testResult.deliverable ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {testResult.deliverable ? 'Adresse livrable !' : 'Adresse hors zone'}
                    </p>
                    {testResult.deliverable && (
                      <p className="text-orange-600 font-medium">
                        Frais de livraison : {testResult.fee.toFixed(2)} €
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Zone */}
      {showZoneModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold">{editingZone ? 'Modifier' : 'Nouvelle'} zone</h2>
            </div>
            <form onSubmit={saveZone} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom de la zone
                </label>
                <input 
                  type="text" 
                  value={zoneForm.name} 
                  onChange={e => setZoneForm({ ...zoneForm, name: e.target.value })} 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200" 
                  placeholder="Ex: Jurbise centre"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Codes postaux (séparés par des virgules)
                </label>
                <input 
                  type="text" 
                  value={zoneForm.postal_codes} 
                  onChange={e => setZoneForm({ ...zoneForm, postal_codes: e.target.value })} 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200" 
                  placeholder="Ex: 7050, 7060, 7070"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Frais de livraison (€)
                  </label>
                  <input 
                    type="number" 
                    step="0.5" 
                    value={zoneForm.delivery_fee} 
                    onChange={e => setZoneForm({ ...zoneForm, delivery_fee: parseFloat(e.target.value) || 0 })} 
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" 
                    min="0" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Commande min. (€)
                  </label>
                  <input 
                    type="number" 
                    step="0.5" 
                    value={zoneForm.min_order_amount} 
                    onChange={e => setZoneForm({ ...zoneForm, min_order_amount: parseFloat(e.target.value) || 0 })} 
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" 
                    min="0" 
                  />
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowZoneModal(false)} 
                  className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
                >
                  Annuler
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600"
                >
                  {editingZone ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
