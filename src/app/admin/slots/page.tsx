'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type SlotConfig = {
  id: string
  slot_duration_min: number
  slot_duration_max: number
  auto_adapt: boolean
  threshold_low: number
  threshold_high: number
  max_orders_per_slot: number
  min_advance_minutes: number
  max_advance_hours: number
  buffer_minutes: number
}

type KitchenStatus = {
  currentPrepTime: number
  queueSize: number
  scheduledOrders: {
    id: string
    order_number: string
    scheduled_slot_start: string
    kitchen_launch_at: string
    order_type: string
    minutesUntilLaunch: number | null
    shouldLaunchNow: boolean
  }[]
}

export default function SlotsConfigPage() {
  const [config, setConfig] = useState<SlotConfig | null>(null)
  const [kitchenStatus, setKitchenStatus] = useState<KitchenStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadConfig()
    loadKitchenStatus()
    
    // Refresh kitchen status every 30 seconds
    const interval = setInterval(loadKitchenStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadConfig() {
    const { data, error } = await supabase
      .from('slot_config')
      .select('*')
      .eq('establishment_id', establishmentId)
      .single()

    if (data) {
      setConfig(data)
    } else {
      // Créer config par défaut
      const { data: newConfig } = await supabase
        .from('slot_config')
        .insert({ establishment_id: establishmentId })
        .select()
        .single()
      
      setConfig(newConfig)
    }
    
    setLoading(false)
  }

  async function loadKitchenStatus() {
    try {
      const response = await fetch(`/api/kitchen/recalculate?establishmentId=${establishmentId}`)
      const data = await response.json()
      setKitchenStatus(data)
    } catch (error) {
      console.error('Error loading kitchen status:', error)
    }
  }

  async function saveConfig() {
    if (!config) return
    
    setSaving(true)
    setSaved(false)

    const { error } = await supabase
      .from('slot_config')
      .update({
        slot_duration_min: config.slot_duration_min,
        slot_duration_max: config.slot_duration_max,
        auto_adapt: config.auto_adapt,
        threshold_low: config.threshold_low,
        threshold_high: config.threshold_high,
        max_orders_per_slot: config.max_orders_per_slot,
        min_advance_minutes: config.min_advance_minutes,
        max_advance_hours: config.max_advance_hours,
        buffer_minutes: config.buffer_minutes,
      })
      .eq('id', config.id)

    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    
    setSaving(false)
  }

  async function triggerRecalculate() {
    try {
      const response = await fetch('/api/kitchen/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establishmentId }),
      })
      const data = await response.json()
      alert(`Recalcul effectué!\n- Temps prépa actuel: ${data.currentPrepTime} min\n- Commandes mises à jour: ${data.ordersUpdated}\n- Commandes lancées: ${data.ordersLaunched}`)
      loadKitchenStatus()
    } catch (error) {
      alert('Erreur lors du recalcul')
    }
  }

  if (loading || !config) {
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
        <h1 className="text-3xl font-bold text-gray-900">Configuration des créneaux</h1>
        <p className="text-gray-500">Paramétrez les créneaux Click & Collect et Livraison</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Configuration */}
        <div className="space-y-6">
          {/* Durée des créneaux */}
          <div className="bg-white rounded-2xl p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">⏱️ Durée des créneaux</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum (période calme)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config.slot_duration_min}
                    onChange={e => setConfig({ ...config, slot_duration_min: parseInt(e.target.value) || 15 })}
                    className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    min={5}
                    max={60}
                  />
                  <span className="text-gray-500">min</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum (période rush)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config.slot_duration_max}
                    onChange={e => setConfig({ ...config, slot_duration_max: parseInt(e.target.value) || 30 })}
                    className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    min={10}
                    max={60}
                  />
                  <span className="text-gray-500">min</span>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={config.auto_adapt}
                onChange={e => setConfig({ ...config, auto_adapt: e.target.checked })}
                className="w-5 h-5 rounded text-orange-500"
              />
              <div>
                <span className="font-medium">🧠 Adaptation automatique</span>
                <p className="text-sm text-gray-500">
                  Ajuster la durée des créneaux selon l'affluence
                </p>
              </div>
            </label>
          </div>

          {/* Seuils d'affluence */}
          {config.auto_adapt && (
            <div className="bg-white rounded-2xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">📊 Seuils d'affluence</h2>
              <p className="text-gray-500 text-sm mb-4">
                Définissez les seuils de commandes par heure pour adapter la durée des créneaux
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Seuil bas (créneaux courts)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">&lt;</span>
                    <input
                      type="number"
                      value={config.threshold_low}
                      onChange={e => setConfig({ ...config, threshold_low: parseInt(e.target.value) || 5 })}
                      className="w-20 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      min={1}
                    />
                    <span className="text-gray-500">cmd/h</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Seuil haut (créneaux longs)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">&gt;</span>
                    <input
                      type="number"
                      value={config.threshold_high}
                      onChange={e => setConfig({ ...config, threshold_high: parseInt(e.target.value) || 10 })}
                      className="w-20 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      min={1}
                    />
                    <span className="text-gray-500">cmd/h</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                <p className="text-sm text-blue-700">
                  <strong>Exemple :</strong><br/>
                  • &lt; {config.threshold_low} cmd/h → créneaux de {config.slot_duration_min} min<br/>
                  • &gt; {config.threshold_high} cmd/h → créneaux de {config.slot_duration_max} min<br/>
                  • Entre les deux → interpolation linéaire
                </p>
              </div>
            </div>
          )}

          {/* Limites */}
          <div className="bg-white rounded-2xl p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">🚫 Limites</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max commandes par créneau
                </label>
                <input
                  type="number"
                  value={config.max_orders_per_slot}
                  onChange={e => setConfig({ ...config, max_orders_per_slot: parseInt(e.target.value) || 8 })}
                  className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  min={1}
                  max={50}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Temps minimum avant 1er créneau
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={config.min_advance_minutes}
                      onChange={e => setConfig({ ...config, min_advance_minutes: parseInt(e.target.value) || 15 })}
                      className="w-20 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      min={5}
                    />
                    <span className="text-gray-500">min</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Réservation max à l'avance
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={config.max_advance_hours}
                      onChange={e => setConfig({ ...config, max_advance_hours: parseInt(e.target.value) || 4 })}
                      className="w-20 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      min={1}
                      max={24}
                    />
                    <span className="text-gray-500">heures</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Marge de sécurité (buffer)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config.buffer_minutes}
                    onChange={e => setConfig({ ...config, buffer_minutes: parseInt(e.target.value) || 5 })}
                    className="w-20 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    min={0}
                    max={30}
                  />
                  <span className="text-gray-500">min</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Temps ajouté entre fin préparation et début du créneau
                </p>
              </div>
            </div>
          </div>

          {/* Bouton sauvegarder */}
          <button
            onClick={saveConfig}
            disabled={saving}
            className="w-full bg-orange-500 text-white font-semibold py-4 rounded-xl hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? '⏳ Sauvegarde...' : saved ? '✅ Sauvegardé !' : '💾 Enregistrer'}
          </button>
        </div>

        {/* Status temps réel */}
        <div className="space-y-6">
          {/* Temps prépa actuel */}
          <div className="bg-white rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">🔴 Temps réel cuisine</h2>
              <button
                onClick={loadKitchenStatus}
                className="text-gray-400 hover:text-gray-600"
              >
                🔄
              </button>
            </div>
            
            {kitchenStatus ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-orange-50 rounded-xl p-4 text-center">
                  <p className="text-4xl font-bold text-orange-500">
                    {kitchenStatus.currentPrepTime}
                  </p>
                  <p className="text-gray-600">min prépa moyenne</p>
                </div>
                
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-4xl font-bold text-blue-500">
                    {kitchenStatus.queueSize}
                  </p>
                  <p className="text-gray-600">en file d'attente</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-center py-4">Chargement...</p>
            )}
          </div>

          {/* Commandes programmées */}
          <div className="bg-white rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">📅 Commandes programmées</h2>
              <button
                onClick={triggerRecalculate}
                className="bg-blue-100 text-blue-600 px-3 py-1 rounded-lg text-sm font-medium hover:bg-blue-200"
              >
                🧠 Recalculer
              </button>
            </div>
            
            {kitchenStatus?.scheduledOrders?.length ? (
              <div className="space-y-3">
                {kitchenStatus.scheduledOrders.map(order => (
                  <div
                    key={order.id}
                    className={`p-4 rounded-xl border-2 ${
                      order.shouldLaunchNow 
                        ? 'border-red-500 bg-red-50' 
                        : 'border-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold">#{order.order_number}</span>
                        <span className="ml-2 text-sm text-gray-500">
                          {order.order_type === 'delivery' ? '🚗' : '📦'}
                        </span>
                      </div>
                      
                      {order.shouldLaunchNow ? (
                        <span className="bg-red-500 text-white px-2 py-1 rounded text-sm font-bold animate-pulse">
                          🔥 LANCER !
                        </span>
                      ) : order.minutesUntilLaunch !== null ? (
                        <span className="text-gray-500 text-sm">
                          Dans {order.minutesUntilLaunch} min
                        </span>
                      ) : null}
                    </div>
                    
                    <div className="text-sm text-gray-500 mt-1">
                      Créneau: {new Date(order.scheduled_slot_start).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                      {order.kitchen_launch_at && (
                        <span className="ml-2">
                          → Cuisine: {new Date(order.kitchen_launch_at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">
                Aucune commande programmée
              </p>
            )}
          </div>

          {/* Aide */}
          <div className="bg-yellow-50 rounded-2xl p-6 border border-yellow-200">
            <h3 className="font-bold text-yellow-800 mb-2">💡 Comment ça marche ?</h3>
            <ol className="text-sm text-yellow-700 space-y-2">
              <li><strong>1.</strong> Le client choisit un créneau (ex: 19h30-20h00)</li>
              <li><strong>2.</strong> Le système calcule: créneau - temps trajet - temps prépa = heure lancement</li>
              <li><strong>3.</strong> Le temps prépa est calculé en temps réel selon la charge cuisine</li>
              <li><strong>4.</strong> Quand l'heure de lancement arrive, le ticket remonte en priorité sur le KDS</li>
              <li><strong>5.</strong> Si la cuisine ralentit/accélère, les heures sont recalculées</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
