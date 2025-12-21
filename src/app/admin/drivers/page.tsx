'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Driver = {
  id: string
  establishment_id: string
  name: string
  phone: string | null
  email: string | null
  pin_code: string | null
  is_active: boolean
  is_available: boolean
  total_deliveries: number
  current_latitude: number | null
  current_longitude: number | null
  last_location_at: string | null
}

type Establishment = {
  id: string
  name: string
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    pin_code: '',
    is_active: true,
  })

  const supabase = createClient()

  useEffect(() => {
    loadEstablishments()
  }, [])

  useEffect(() => {
    if (selectedEstablishment) {
      loadDrivers()
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

  async function loadDrivers() {
    setLoading(true)
    const { data } = await supabase
      .from('delivery_drivers')
      .select('*')
      .eq('establishment_id', selectedEstablishment)
      .order('name')

    setDrivers(data || [])
    setLoading(false)
  }

  function generatePinCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  function openModal(driver?: Driver) {
    if (driver) {
      setEditing(driver)
      setForm({
        name: driver.name,
        phone: driver.phone || '',
        email: driver.email || '',
        pin_code: driver.pin_code || '',
        is_active: driver.is_active,
      })
    } else {
      setEditing(null)
      setForm({
        name: '',
        phone: '',
        email: '',
        pin_code: generatePinCode(),
        is_active: true,
      })
    }
    setFormError('')
    setShowModal(true)
  }

  async function saveDriver(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (!form.name.trim()) {
      setFormError('Le nom est obligatoire')
      return
    }

    setSaving(true)

    try {
      const data = {
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        pin_code: form.pin_code || null,
        is_active: form.is_active,
      }

      if (editing) {
        const { error } = await supabase
          .from('delivery_drivers')
          .update(data)
          .eq('id', editing.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('delivery_drivers')
          .insert({
            ...data,
            establishment_id: selectedEstablishment,
          })

        if (error) throw error
      }

      setShowModal(false)
      loadDrivers()
    } catch (error: any) {
      setFormError(error.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAvailable(driver: Driver) {
    await supabase
      .from('delivery_drivers')
      .update({ is_available: !driver.is_available })
      .eq('id', driver.id)
    loadDrivers()
  }

  async function toggleActive(driver: Driver) {
    await supabase
      .from('delivery_drivers')
      .update({ is_active: !driver.is_active })
      .eq('id', driver.id)
    loadDrivers()
  }

  async function deleteDriver(driver: Driver) {
    if (!confirm(`Supprimer le livreur "${driver.name}" ?`)) return

    await supabase.from('delivery_drivers').delete().eq('id', driver.id)
    loadDrivers()
  }

  function getLocationAge(updatedAt: string | null): string {
    if (!updatedAt) return 'Jamais'
    const diff = Date.now() - new Date(updatedAt).getTime()
    const minutes = Math.floor(diff / 1000 / 60)
    if (minutes < 1) return 'À l\'instant'
    if (minutes < 60) return `Il y a ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `Il y a ${hours}h`
    return 'Plus de 24h'
  }

  if (loading && establishments.length === 0) {
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
          <h1 className="text-3xl font-bold text-gray-900">Livreurs</h1>
          <p className="text-gray-500">Gérez votre équipe de livraison</p>
        </div>

        <div className="flex items-center gap-4">
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

          <button
            onClick={() => openModal()}
            className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 transition-colors"
          >
            ➕ Nouveau livreur
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <p className="text-gray-500 text-sm">Total livreurs</p>
          <p className="text-3xl font-bold text-gray-900">
            {drivers.filter((d) => d.is_active).length}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <p className="text-gray-500 text-sm">En service</p>
          <p className="text-3xl font-bold text-green-600">
            {drivers.filter((d) => d.is_active && d.is_available).length}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <p className="text-gray-500 text-sm">Livraisons totales</p>
          <p className="text-3xl font-bold text-orange-500">
            {drivers.reduce((sum, d) => sum + d.total_deliveries, 0)}
          </p>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
          Chargement...
        </div>
      ) : drivers.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">🛵</span>
          <p className="text-gray-500 mb-4">Aucun livreur configuré</p>
          <button
            onClick={() => openModal()}
            className="text-orange-500 font-medium hover:underline"
          >
            Ajouter votre premier livreur
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {drivers.map((driver) => (
            <div
              key={driver.id}
              className={`bg-white rounded-2xl p-6 border border-gray-100 ${
                !driver.is_active ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${
                      driver.is_available && driver.is_active
                        ? 'bg-green-100'
                        : 'bg-gray-100'
                    }`}
                  >
                    🛵
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold">{driver.name}</h3>
                      {driver.is_available && driver.is_active && (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
                          En service
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 flex flex-wrap gap-4 mt-1">
                      {driver.phone && (
                        <span className="flex items-center gap-1">
                          📱 {driver.phone}
                        </span>
                      )}
                      {driver.email && (
                        <span className="flex items-center gap-1">
                          ✉️ {driver.email}
                        </span>
                      )}
                      {driver.pin_code && (
                        <span className="flex items-center gap-1 font-mono">
                          🔑 {driver.pin_code}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400 mt-1 flex gap-4">
                      <span>{driver.total_deliveries} livraisons</span>
                      {driver.current_latitude && (
                        <span>
                          📍 Position: {getLocationAge(driver.last_location_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {driver.is_active && (
                    <button
                      onClick={() => toggleAvailable(driver)}
                      className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                        driver.is_available
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {driver.is_available ? '🟢 En service' : '⚪ Hors service'}
                    </button>
                  )}
                  <button
                    onClick={() => openModal(driver)}
                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => toggleActive(driver)}
                    className={`p-2 rounded-lg ${
                      driver.is_active
                        ? 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50'
                        : 'text-yellow-500 hover:bg-yellow-50'
                    }`}
                    title={driver.is_active ? 'Désactiver' : 'Activer'}
                  >
                    {driver.is_active ? '🔒' : '🔓'}
                  </button>
                  <button
                    onClick={() => deleteDriver(driver)}
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

      {/* Info PWA */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-800 mb-2">📱 Application Livreur</h3>
        <p className="text-sm text-blue-700">
          Les livreurs peuvent accéder à leur interface via{' '}
          <code className="bg-blue-100 px-1 rounded">/driver</code> et se connecter
          avec leur code PIN. L'application permet de voir les commandes à livrer,
          naviguer vers les adresses et mettre à jour le statut en temps réel.
        </p>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold">
                {editing ? 'Modifier le livreur' : 'Nouveau livreur'}
              </h2>
            </div>

            <form onSubmit={saveDriver} className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Jean Dupont"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="+32 470 00 00 00"
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
                  placeholder="jean@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Code PIN (pour l'app livreur)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.pin_code}
                    onChange={(e) =>
                      setForm({ ...form, pin_code: e.target.value.replace(/\D/g, '').slice(0, 6) })
                    }
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-center text-xl tracking-widest"
                    placeholder="123456"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, pin_code: generatePinCode() })}
                    className="px-4 py-3 bg-gray-100 rounded-xl hover:bg-gray-200"
                  >
                    🎲
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-5 h-5 rounded text-orange-500"
                />
                <span className="font-medium">Livreur actif</span>
              </label>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
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
