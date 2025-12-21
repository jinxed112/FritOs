'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type DeliveryZone = {
  id: string
  min_minutes: number
  max_minutes: number
  delivery_fee: number
  is_active: boolean
  display_order: number
}

type DeliveryConfig = {
  id: string
  establishment_id: string
  max_delivery_minutes: number
  min_order_amount: number
  free_delivery_threshold: number | null
  additional_delivery_minutes: number
  is_active: boolean
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
  const [zoneForm, setZoneForm] = useState({ min_minutes: 0, max_minutes: 5, delivery_fee: 2 })

  const [testAddress, setTestAddress] = useState('')
  const [testResult, setTestResult] = useState<{ duration: number; distance: number; fee: number | null; deliverable: boolean } | null>(null)
  const [testing, setTesting] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadEstablishments() }, [])
  useEffect(() => { if (selectedEstablishment) { loadConfig(); loadZones() } }, [selectedEstablishment])

  async function loadEstablishments() {
    const { data } = await supabase.from('establishments').select('id, name, latitude, longitude, delivery_enabled').eq('is_active', true).order('name')
    if (data && data.length > 0) { setEstablishments(data); setSelectedEstablishment(data[0].id) }
    setLoading(false)
  }

  async function loadConfig() {
    const { data, error } = await supabase.from('delivery_config').select('*').eq('establishment_id', selectedEstablishment).single()
    if (error && error.code === 'PGRST116') {
      const { data: newConfig } = await supabase.from('delivery_config').insert({ establishment_id: selectedEstablishment, max_delivery_minutes: 15, min_order_amount: 15 }).select().single()
      setConfig(newConfig)
    } else if (data) { setConfig(data) }
  }

  async function loadZones() {
    const { data } = await supabase.from('delivery_zones').select('*').eq('establishment_id', selectedEstablishment).order('display_order')
    setZones(data || [])
  }

  async function saveConfig() {
    if (!config) return
    setSaving(true); setSaved(false)
    const { error } = await supabase.from('delivery_config').update({
      max_delivery_minutes: config.max_delivery_minutes, min_order_amount: config.min_order_amount,
      free_delivery_threshold: config.free_delivery_threshold, additional_delivery_minutes: config.additional_delivery_minutes,
      is_active: config.is_active, updated_at: new Date().toISOString()
    }).eq('id', config.id)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
    setSaving(false)
  }

  function openZoneModal(zone?: DeliveryZone) {
    if (zone) { setEditingZone(zone); setZoneForm({ min_minutes: zone.min_minutes, max_minutes: zone.max_minutes, delivery_fee: zone.delivery_fee }) }
    else { setEditingZone(null); const lastZone = zones[zones.length - 1]; setZoneForm({ min_minutes: lastZone?.max_minutes || 0, max_minutes: (lastZone?.max_minutes || 0) + 5, delivery_fee: (lastZone?.delivery_fee || 1) + 1 }) }
    setShowZoneModal(true)
  }

  async function saveZone(e: React.FormEvent) {
    e.preventDefault()
    if (editingZone) { await supabase.from('delivery_zones').update({ min_minutes: zoneForm.min_minutes, max_minutes: zoneForm.max_minutes, delivery_fee: zoneForm.delivery_fee }).eq('id', editingZone.id) }
    else { await supabase.from('delivery_zones').insert({ establishment_id: selectedEstablishment, min_minutes: zoneForm.min_minutes, max_minutes: zoneForm.max_minutes, delivery_fee: zoneForm.delivery_fee, display_order: zones.length + 1 }) }
    setShowZoneModal(false); loadZones()
  }

  async function deleteZone(zone: DeliveryZone) {
    if (!confirm(`Supprimer la zone ${zone.min_minutes}-${zone.max_minutes} min ?`)) return
    await supabase.from('delivery_zones').delete().eq('id', zone.id); loadZones()
  }

  async function toggleZoneActive(zone: DeliveryZone) {
    await supabase.from('delivery_zones').update({ is_active: !zone.is_active }).eq('id', zone.id); loadZones()
  }

  async function testDeliveryAddress() {
    if (!testAddress.trim()) return
    const est = establishments.find(e => e.id === selectedEstablishment)
    if (!est?.latitude || !est?.longitude) { alert('Coordonnées GPS manquantes'); return }
    setTesting(true); setTestResult(null)
    try {
      const geoResponse = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${process.env.NEXT_PUBLIC_OPENROUTE_API_KEY}&text=${encodeURIComponent(testAddress)}&boundary.country=BE&size=1`)
      const geoData = await geoResponse.json()
      if (!geoData.features?.length) { alert('Adresse non trouvée'); setTesting(false); return }
      const [destLng, destLat] = geoData.features[0].geometry.coordinates
      const routeResponse = await fetch(`https://api.openrouteservice.org/v2/directions/driving-car?api_key=${process.env.NEXT_PUBLIC_OPENROUTE_API_KEY}&start=${est.longitude},${est.latitude}&end=${destLng},${destLat}`)
      const routeData = await routeResponse.json()
      if (!routeData.features?.length) { alert('Impossible de calculer l\'itinéraire'); setTesting(false); return }
      const duration = Math.round(routeData.features[0].properties.segments[0].duration / 60)
      const distance = Math.round(routeData.features[0].properties.segments[0].distance / 1000 * 10) / 10
      const zone = zones.find(z => z.is_active && duration >= z.min_minutes && duration < z.max_minutes)
      const deliverable = config ? duration <= config.max_delivery_minutes : false
      setTestResult({ duration, distance, fee: zone?.delivery_fee || null, deliverable })
    } catch (error) { console.error('Erreur test:', error); alert('Erreur lors du test') }
    finally { setTesting(false) }
  }

  const currentEst = establishments.find(e => e.id === selectedEstablishment)

  if (loading) return <div className="p-8"><div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div></div>

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Livraison</h1>
          <p className="text-gray-500">Configurez les zones et frais de livraison</p>
        </div>
        {establishments.length > 1 && (
          <select value={selectedEstablishment} onChange={e => setSelectedEstablishment(e.target.value)} className="px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
            {establishments.map(est => <option key={est.id} value={est.id}>{est.name}</option>)}
          </select>
        )}
      </div>

      {currentEst && (!currentEst.latitude || !currentEst.longitude) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-medium text-yellow-800">Coordonnées GPS manquantes</p>
            <p className="text-sm text-yellow-700">Configurez les coordonnées GPS dans <a href="/admin/establishments" className="underline">Établissements</a></p>
          </div>
        </div>
      )}

      {config && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><span>⚙️</span> Paramètres généraux</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Distance maximum</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={config.max_delivery_minutes} onChange={e => setConfig({ ...config, max_delivery_minutes: parseInt(e.target.value) || 15 })} className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" min="5" max="60" />
                  <span className="text-gray-500">minutes de trajet</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Commande minimum</label>
                <div className="flex items-center gap-2">
                  <input type="number" step="0.5" value={config.min_order_amount} onChange={e => setConfig({ ...config, min_order_amount: parseFloat(e.target.value) || 0 })} className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" min="0" />
                  <span className="text-gray-500">€</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Livraison gratuite à partir de</label>
                <div className="flex items-center gap-2">
                  <input type="number" step="0.5" value={config.free_delivery_threshold || ''} onChange={e => setConfig({ ...config, free_delivery_threshold: e.target.value ? parseFloat(e.target.value) : null })} className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="—" />
                  <span className="text-gray-500">€</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Temps additionnel livraison</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={config.additional_delivery_minutes} onChange={e => setConfig({ ...config, additional_delivery_minutes: parseInt(e.target.value) || 0 })} className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  <span className="text-gray-500">minutes</span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-4">
              <button onClick={saveConfig} disabled={saving} className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50">{saving ? '⏳...' : '💾 Enregistrer'}</button>
              {saved && <span className="text-green-600 font-medium">✅ Sauvegardé !</span>}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><span>📍</span> Zones de tarification</h2>
              <button onClick={() => openZoneModal()} className="bg-orange-500 text-white font-semibold px-4 py-2 rounded-xl hover:bg-orange-600">+ Ajouter</button>
            </div>
            {zones.length === 0 ? (
              <div className="text-center py-8 text-gray-400"><span className="text-4xl block mb-2">📍</span>Aucune zone configurée</div>
            ) : (
              <div className="space-y-3">
                {zones.map(zone => (
                  <div key={zone.id} className={`p-4 rounded-xl border flex items-center justify-between ${zone.is_active ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                    <div className="flex items-center gap-4">
                      <div className="bg-white px-4 py-2 rounded-lg shadow-sm"><span className="font-bold text-lg">{zone.min_minutes} - {zone.max_minutes} min</span></div>
                      <span className="text-2xl">→</span>
                      <div className="bg-orange-500 text-white px-4 py-2 rounded-lg"><span className="font-bold text-lg">{zone.delivery_fee.toFixed(2)} €</span></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleZoneActive(zone)} className={`px-3 py-1 rounded-full text-sm font-medium ${zone.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{zone.is_active ? 'Actif' : 'Inactif'}</button>
                      <button onClick={() => openZoneModal(zone)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg">✏️</button>
                      <button onClick={() => deleteZone(zone)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><span>🧪</span> Tester une adresse</h2>
            <div className="flex gap-4">
              <input type="text" value={testAddress} onChange={e => setTestAddress(e.target.value)} placeholder="Ex: Rue de Mons 123, 7000 Mons" className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500" />
              <button onClick={testDeliveryAddress} disabled={testing || !testAddress.trim()} className="bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-600 disabled:opacity-50">{testing ? '⏳...' : '🔍 Tester'}</button>
            </div>
            {testResult && (
              <div className={`mt-4 p-4 rounded-xl ${testResult.deliverable ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-center gap-6">
                  <span className="text-4xl">{testResult.deliverable ? '✅' : '❌'}</span>
                  <div>
                    <p className={`font-bold text-lg ${testResult.deliverable ? 'text-green-700' : 'text-red-700'}`}>{testResult.deliverable ? 'Adresse livrable !' : 'Adresse hors zone'}</p>
                    <p className="text-gray-600">Distance : {testResult.distance} km • Temps : {testResult.duration} min</p>
                    {testResult.fee !== null && <p className="text-orange-600 font-medium">Frais : {testResult.fee.toFixed(2)} €</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showZoneModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100"><h2 className="text-2xl font-bold">{editingZone ? 'Modifier' : 'Nouvelle'} zone</h2></div>
            <form onSubmit={saveZone} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">De (minutes)</label>
                  <input type="number" value={zoneForm.min_minutes} onChange={e => setZoneForm({ ...zoneForm, min_minutes: parseInt(e.target.value) || 0 })} className="w-full px-4 py-3 rounded-xl border border-gray-200" min="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">À (minutes)</label>
                  <input type="number" value={zoneForm.max_minutes} onChange={e => setZoneForm({ ...zoneForm, max_minutes: parseInt(e.target.value) || 0 })} className="w-full px-4 py-3 rounded-xl border border-gray-200" min="1" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Frais de livraison (€)</label>
                <input type="number" step="0.5" value={zoneForm.delivery_fee} onChange={e => setZoneForm({ ...zoneForm, delivery_fee: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-3 rounded-xl border border-gray-200" min="0" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowZoneModal(false)} className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold">Annuler</button>
                <button type="submit" className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600">{editingZone ? 'Modifier' : 'Ajouter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
