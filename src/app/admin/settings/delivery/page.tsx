'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type DeliveryZone = {
  id: string
  name: string
  min_minutes: number
  max_minutes: number
  delivery_fee: number
  is_active: boolean
  display_order: number
}

type DeliveryConfig = {
  id: string
  establishment_id: string
  is_enabled: boolean
  max_delivery_minutes: number
  min_order_amount: number
  base_delivery_fee: number
  fee_per_km: number
  free_delivery_threshold: number | null
  additional_time_minutes: number
}

type Establishment = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
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
    min_minutes: 0, 
    max_minutes: 10,
    delivery_fee: 2.50
  })

  const [testAddress, setTestAddress] = useState('')
  const [testResult, setTestResult] = useState<{ 
    duration: number
    distance: number
    fee: number | null
    deliverable: boolean 
    zoneName?: string
  } | null>(null)
  const [testing, setTesting] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadEstablishments() }, [])
  useEffect(() => { if (selectedEstablishment) { loadConfig(); loadZones() } }, [selectedEstablishment])

  async function loadEstablishments() {
    const { data } = await supabase
      .from('establishments')
      .select('id, name, latitude, longitude')
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
          max_delivery_minutes: 20,
          min_order_amount: 15,
          base_delivery_fee: 2.50,
          fee_per_km: 0.50,
          additional_time_minutes: 15
        })
        .select()
        .single()
      
      if (!insertError && newConfig) {
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
      .order('display_order')
    
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
        max_delivery_minutes: config.max_delivery_minutes,
        min_order_amount: config.min_order_amount,
        base_delivery_fee: config.base_delivery_fee,
        fee_per_km: config.fee_per_km,
        free_delivery_threshold: config.free_delivery_threshold,
        additional_time_minutes: config.additional_time_minutes,
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
        min_minutes: zone.min_minutes,
        max_minutes: zone.max_minutes,
        delivery_fee: zone.delivery_fee
      }) 
    } else { 
      setEditingZone(null)
      // Suggérer les valeurs suivantes
      const lastZone = zones[zones.length - 1]
      setZoneForm({ 
        name: `Zone ${zones.length + 1}`,
        min_minutes: lastZone?.max_minutes || 0,
        max_minutes: (lastZone?.max_minutes || 0) + 5,
        delivery_fee: (lastZone?.delivery_fee || 2) + 0.50
      }) 
    }
    setShowZoneModal(true)
  }

  async function saveZone(e: React.FormEvent) {
    e.preventDefault()
    
    if (editingZone) { 
      await supabase
        .from('delivery_zones')
        .update({ 
          name: zoneForm.name,
          min_minutes: zoneForm.min_minutes,
          max_minutes: zoneForm.max_minutes,
          delivery_fee: zoneForm.delivery_fee,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingZone.id) 
    } else { 
      await supabase
        .from('delivery_zones')
        .insert({ 
          establishment_id: selectedEstablishment, 
          name: zoneForm.name,
          min_minutes: zoneForm.min_minutes,
          max_minutes: zoneForm.max_minutes,
          delivery_fee: zoneForm.delivery_fee,
          display_order: zones.length + 1
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
    
    const est = establishments.find(e => e.id === selectedEstablishment)
    if (!est?.latitude || !est?.longitude) {
      alert('Coordonnées GPS manquantes pour cet établissement. Configurez-les dans Paramètres → Établissements.')
      return
    }
    
    setTesting(true)
    setTestResult(null)
    
    try {
      // 1. Géocoder l'adresse
      const geoResponse = await fetch(
        `https://api.openrouteservice.org/geocode/search?api_key=${process.env.NEXT_PUBLIC_OPENROUTE_API_KEY}&text=${encodeURIComponent(testAddress)}&boundary.country=BE&size=1`
      )
      const geoData = await geoResponse.json()
      
      if (!geoData.features?.length) {
        alert('Adresse non trouvée. Essayez avec plus de détails.')
        setTesting(false)
        return
      }
      
      const [destLng, destLat] = geoData.features[0].geometry.coordinates
      
      // 2. Calculer l'itinéraire
      const routeResponse = await fetch(
        `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${process.env.NEXT_PUBLIC_OPENROUTE_API_KEY}&start=${est.longitude},${est.latitude}&end=${destLng},${destLat}`
      )
      const routeData = await routeResponse.json()
      
      if (!routeData.features?.length) {
        alert('Impossible de calculer l\'itinéraire.')
        setTesting(false)
        return
      }
      
      const duration = Math.round(routeData.features[0].properties.segments[0].duration / 60)
      const distance = Math.round(routeData.features[0].properties.segments[0].distance / 1000 * 10) / 10
      
      // 3. Trouver la zone correspondante
      const matchingZone = zones.find(z => 
        z.is_active && duration >= z.min_minutes && duration < z.max_minutes
      )
      
      const deliverable = config ? duration <= config.max_delivery_minutes : false
      
      setTestResult({ 
        duration, 
        distance, 
        fee: matchingZone?.delivery_fee || null, 
        deliverable,
        zoneName: matchingZone?.name
      })
      
    } catch (error) {
      console.error('Erreur test:', error)
      alert('Erreur lors du test. Vérifiez la clé API OpenRouteService.')
    } finally {
      setTesting(false)
    }
  }

  const currentEst = establishments.find(e => e.id === selectedEstablishment)
  const hasGPS = currentEst?.latitude && currentEst?.longitude

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

      {/* Alerte GPS manquant */}
      {!hasGPS && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-center gap-4">
          <span className="text-3xl">⚠️</span>
          <div>
            <p className="font-medium text-yellow-800">Coordonnées GPS manquantes</p>
            <p className="text-sm text-yellow-700">
              Configurez la latitude et longitude dans{' '}
              <a href="/admin/settings/establishments" className="underline font-medium">
                Paramètres → Établissements
              </a>
            </p>
          </div>
        </div>
      )}

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
                  Temps de trajet maximum
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    value={config.max_delivery_minutes} 
                    onChange={e => setConfig({ ...config, max_delivery_minutes: parseInt(e.target.value) || 20 })} 
                    className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" 
                    min="5"
                    max="60"
                  />
                  <span className="text-gray-500">minutes</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Commande minimum
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    step="0.5" 
                    value={config.min_order_amount} 
                    onChange={e => setConfig({ ...config, min_order_amount: parseFloat(e.target.value) || 0 })} 
                    className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" 
                    min="0"
                  />
                  <span className="text-gray-500">€</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Livraison gratuite à partir de
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    step="0.5" 
                    value={config.free_delivery_threshold || ''} 
                    onChange={e => setConfig({ ...config, free_delivery_threshold: e.target.value ? parseFloat(e.target.value) : null })} 
                    className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" 
                    placeholder="—"
                  />
                  <span className="text-gray-500">€</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Temps de préparation additionnel
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    value={config.additional_time_minutes || 15} 
                    onChange={e => setConfig({ ...config, additional_time_minutes: parseInt(e.target.value) || 15 })} 
                    className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" 
                    min="0"
                  />
                  <span className="text-gray-500">minutes</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Ajouté au créneau de livraison</p>
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

          {/* Zones par temps de trajet */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span>🚗</span> Zones de tarification (par temps de trajet)
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Définissez les frais selon le temps de trajet en voiture
                </p>
              </div>
              <button 
                onClick={() => openZoneModal()} 
                className="bg-orange-500 text-white font-semibold px-4 py-2 rounded-xl hover:bg-orange-600"
              >
                + Ajouter
              </button>
            </div>
            
            {zones.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <span className="text-4xl block mb-2">🚗</span>
                <p>Aucune zone configurée</p>
                <p className="text-sm mt-2">Ex: 0-5 min = 2€, 5-10 min = 3€, 10-15 min = 4€</p>
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
                    <div className="flex items-center gap-4">
                      <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
                        <span className="font-bold text-lg">
                          {zone.min_minutes} - {zone.max_minutes} min
                        </span>
                      </div>
                      <span className="text-2xl">→</span>
                      <div className="bg-orange-500 text-white px-4 py-2 rounded-lg">
                        <span className="font-bold text-lg">{zone.delivery_fee.toFixed(2)} €</span>
                      </div>
                      {zone.name && (
                        <span className="text-gray-500 text-sm">({zone.name})</span>
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
            
            {/* Aide */}
            <div className="mt-4 p-4 bg-blue-50 rounded-xl">
              <p className="text-sm text-blue-800">
                💡 <strong>Comment ça marche :</strong> Quand un client entre son adresse, 
                le système calcule le temps de trajet en voiture depuis votre établissement 
                et applique les frais correspondants.
              </p>
            </div>
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
                onKeyDown={e => e.key === 'Enter' && testDeliveryAddress()}
              />
              <button 
                onClick={testDeliveryAddress} 
                disabled={testing || !testAddress.trim() || !hasGPS} 
                className="bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-600 disabled:opacity-50"
              >
                {testing ? '⏳ Calcul...' : '🔍 Tester'}
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
                    <p className="text-gray-600">
                      Distance : {testResult.distance} km • Temps : <strong>{testResult.duration} min</strong>
                    </p>
                    {testResult.deliverable && testResult.fee !== null && (
                      <p className="text-orange-600 font-medium">
                        Frais : {testResult.fee.toFixed(2)} € {testResult.zoneName && `(${testResult.zoneName})`}
                      </p>
                    )}
                    {testResult.deliverable && testResult.fee === null && (
                      <p className="text-yellow-600">
                        ⚠️ Aucune zone ne couvre ce temps de trajet. Ajoutez une zone {testResult.duration}+ min.
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
                  Nom de la zone (optionnel)
                </label>
                <input 
                  type="text" 
                  value={zoneForm.name} 
                  onChange={e => setZoneForm({ ...zoneForm, name: e.target.value })} 
                  className="w-full px-4 py-3 rounded-xl border border-gray-200" 
                  placeholder="Ex: Zone proche, Zone moyenne..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    De (minutes)
                  </label>
                  <input 
                    type="number" 
                    value={zoneForm.min_minutes} 
                    onChange={e => setZoneForm({ ...zoneForm, min_minutes: parseInt(e.target.value) || 0 })} 
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" 
                    min="0" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    À (minutes)
                  </label>
                  <input 
                    type="number" 
                    value={zoneForm.max_minutes} 
                    onChange={e => setZoneForm({ ...zoneForm, max_minutes: parseInt(e.target.value) || 0 })} 
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" 
                    min="1" 
                  />
                </div>
              </div>
              
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
