'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type LoyaltyConfig = {
  id: string
  establishment_id: string
  points_per_euro: number
  points_value_euros: number
  min_points_redeem: number
  max_points_per_order: number | null
  points_expiry_months: number | null
  points_on_total: boolean
  points_awarded_on: string
  is_active: boolean
}

type Establishment = {
  id: string
  name: string
}

export default function LoyaltySettingsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>('')
  const [config, setConfig] = useState<LoyaltyConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadEstablishments()
  }, [])

  useEffect(() => {
    if (selectedEstablishment) {
      loadConfig()
    }
  }, [selectedEstablishment])

  async function loadEstablishments() {
    const { data } = await supabase
      .from('establishments')
      .select('id, name')
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
      .from('loyalty_config')
      .select('*')
      .eq('establishment_id', selectedEstablishment)
      .single()

    if (error && error.code === 'PGRST116') {
      // Créer config par défaut
      const { data: newConfig } = await supabase
        .from('loyalty_config')
        .insert({
          establishment_id: selectedEstablishment,
          points_per_euro: 1,
          points_value_euros: 0.02,
          min_points_redeem: 50,
          points_expiry_months: 12,
        })
        .select()
        .single()
      setConfig(newConfig)
    } else if (data) {
      setConfig(data)
    }
  }

  async function saveConfig() {
    if (!config) return

    setSaving(true)
    setSaved(false)

    const { error } = await supabase
      .from('loyalty_config')
      .update({
        points_per_euro: config.points_per_euro,
        points_value_euros: config.points_value_euros,
        min_points_redeem: config.min_points_redeem,
        max_points_per_order: config.max_points_per_order,
        points_expiry_months: config.points_expiry_months,
        points_on_total: config.points_on_total,
        points_awarded_on: config.points_awarded_on,
        is_active: config.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', config.id)

    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }

    setSaving(false)
  }

  // Calculs pour les exemples
  const exampleSpend = 25
  const pointsEarned = config ? Math.floor(exampleSpend * config.points_per_euro) : 0
  const euroValue = config ? (100 * config.points_value_euros).toFixed(2) : '0'
  const percentReturn = config ? (config.points_per_euro * config.points_value_euros * 100).toFixed(1) : '0'

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Programme de fidélité</h1>
          <p className="text-gray-500">Configurez le système de points</p>
        </div>

        {establishments.length > 1 && (
          <select
            value={selectedEstablishment}
            onChange={(e) => setSelectedEstablishment(e.target.value)}
            className="px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {establishments.map((est) => (
              <option key={est.id} value={est.id}>
                {est.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {config && (
        <div className="space-y-6">
          {/* Activer/Désactiver */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Programme actif</h2>
                <p className="text-gray-500">
                  Les clients peuvent accumuler et utiliser leurs points
                </p>
              </div>
              <div
                className={`w-14 h-8 rounded-full p-1 transition-colors ${
                  config.is_active ? 'bg-green-500' : 'bg-gray-300'
                }`}
                onClick={() => setConfig({ ...config, is_active: !config.is_active })}
              >
                <div
                  className={`w-6 h-6 rounded-full bg-white shadow transition-transform ${
                    config.is_active ? 'translate-x-6' : ''
                  }`}
                />
              </div>
            </label>
          </div>

          {/* Accumulation des points */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>⭐</span> Accumulation des points
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Points gagnés par euro dépensé
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">1€ =</span>
                  <input
                    type="number"
                    step="0.1"
                    value={config.points_per_euro}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        points_per_euro: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    min="0"
                  />
                  <span className="text-gray-500">point(s)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Calculer sur
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={config.points_on_total}
                      onChange={() => setConfig({ ...config, points_on_total: true })}
                      className="w-4 h-4"
                    />
                    <span>Total TTC</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!config.points_on_total}
                      onChange={() => setConfig({ ...config, points_on_total: false })}
                      className="w-4 h-4"
                    />
                    <span>Total HT</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Points crédités
                </label>
                <select
                  value={config.points_awarded_on}
                  onChange={(e) =>
                    setConfig({ ...config, points_awarded_on: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="completed">Après retrait/livraison</option>
                  <option value="payment">Dès le paiement</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  "Après retrait" évite de créditer les commandes annulées
                </p>
              </div>
            </div>
          </div>

          {/* Utilisation des points */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>🎁</span> Utilisation des points
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valeur d'un point
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">1 point =</span>
                  <input
                    type="number"
                    step="0.001"
                    value={config.points_value_euros}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        points_value_euros: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    min="0"
                  />
                  <span className="text-gray-500">€</span>
                </div>
                <p className="text-sm text-orange-600 mt-2">
                  → 100 points = {euroValue}€ de réduction
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum de points pour utiliser
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config.min_points_redeem}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        min_points_redeem: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    min="0"
                  />
                  <span className="text-gray-500">points</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum de points par commande
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config.max_points_per_order || ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        max_points_per_order: e.target.value
                          ? parseInt(e.target.value)
                          : null,
                      })
                    }
                    className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    min="0"
                    placeholder="∞"
                  />
                  <span className="text-gray-500">points (vide = illimité)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expiration des points
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config.points_expiry_months || ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        points_expiry_months: e.target.value
                          ? parseInt(e.target.value)
                          : null,
                      })
                    }
                    className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    min="0"
                    placeholder="∞"
                  />
                  <span className="text-gray-500">mois d'inactivité (vide = jamais)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Exemple / Simulation */}
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span>🧮</span> Simulation
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white/20 rounded-xl p-4">
                <p className="text-orange-100 text-sm mb-1">Commande de {exampleSpend}€</p>
                <p className="text-3xl font-bold">+{pointsEarned} points</p>
              </div>

              <div className="bg-white/20 rounded-xl p-4">
                <p className="text-orange-100 text-sm mb-1">100 points valent</p>
                <p className="text-3xl font-bold">{euroValue}€</p>
              </div>

              <div className="bg-white/20 rounded-xl p-4">
                <p className="text-orange-100 text-sm mb-1">Retour client</p>
                <p className="text-3xl font-bold">{percentReturn}%</p>
              </div>
            </div>

            <div className="mt-4 bg-white/10 rounded-xl p-4">
              <p className="text-sm">
                <strong>Exemple :</strong> Un client qui dépense {exampleSpend}€ gagne{' '}
                {pointsEarned} points. S'il accumule 100 points, il peut les échanger contre{' '}
                {euroValue}€ de réduction. Cela représente un retour de {percentReturn}%
                sur ses achats.
              </p>
            </div>
          </div>

          {/* Bouton sauvegarder */}
          <div className="flex items-center gap-4">
            <button
              onClick={saveConfig}
              disabled={saving}
              className="bg-orange-500 text-white font-semibold px-8 py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer les modifications'}
            </button>

            {saved && (
              <span className="text-green-600 font-medium flex items-center gap-2">
                ✅ Sauvegardé !
              </span>
            )}
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="font-medium text-blue-800 mb-2">💡 Conseils</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>
                • Un retour de 2-3% est standard dans la restauration
              </li>
              <li>
                • 1€ = 1 point et 100 points = 2€ donne un retour de 2%
              </li>
              <li>
                • L'expiration encourage les clients à revenir régulièrement
              </li>
              <li>
                • Le minimum de points évite les micro-réductions
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
