'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type TimeSlot = {
  open: string
  close: string
}

type DaySchedule = {
  enabled: boolean
  slots: TimeSlot[]
}

type WeeklySchedule = {
  [key: string]: DaySchedule
}

type TimeSlotsConfig = {
  id: string
  establishment_id: string
  slot_duration_minutes: number
  min_preparation_minutes: number
  max_orders_per_slot: number
  weekly_schedule: WeeklySchedule
  is_active: boolean
}

type Override = {
  id: string
  date: string
  override_type: 'closed' | 'custom' | 'reduced'
  custom_slots: TimeSlot[] | null
  max_orders: number | null
  reason: string | null
}

type Establishment = {
  id: string
  name: string
}

const DAYS = [
  { key: '1', label: 'Lundi', short: 'Lun' },
  { key: '2', label: 'Mardi', short: 'Mar' },
  { key: '3', label: 'Mercredi', short: 'Mer' },
  { key: '4', label: 'Jeudi', short: 'Jeu' },
  { key: '5', label: 'Vendredi', short: 'Ven' },
  { key: '6', label: 'Samedi', short: 'Sam' },
  { key: '0', label: 'Dimanche', short: 'Dim' },
]

const DEFAULT_SCHEDULE: WeeklySchedule = {
  '0': { enabled: false, slots: [] },
  '1': { enabled: true, slots: [{ open: '11:30', close: '14:00' }, { open: '17:30', close: '21:00' }] },
  '2': { enabled: true, slots: [{ open: '11:30', close: '14:00' }, { open: '17:30', close: '21:00' }] },
  '3': { enabled: true, slots: [{ open: '11:30', close: '14:00' }, { open: '17:30', close: '21:00' }] },
  '4': { enabled: true, slots: [{ open: '11:30', close: '14:00' }, { open: '17:30', close: '21:00' }] },
  '5': { enabled: true, slots: [{ open: '11:30', close: '14:00' }, { open: '17:30', close: '22:00' }] },
  '6': { enabled: true, slots: [{ open: '11:30', close: '14:00' }, { open: '17:30', close: '22:00' }] },
}

export default function TimeSlotsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>('')
  const [config, setConfig] = useState<TimeSlotsConfig | null>(null)
  const [overrides, setOverrides] = useState<Override[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Override modal
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [overrideForm, setOverrideForm] = useState({
    date: '',
    type: 'closed' as 'closed' | 'custom' | 'reduced',
    reason: '',
    maxOrders: 3,
    slots: [{ open: '11:30', close: '21:00' }] as TimeSlot[],
  })

  const supabase = createClient()

  useEffect(() => {
    loadEstablishments()
  }, [])

  useEffect(() => {
    if (selectedEstablishment) {
      loadConfig()
      loadOverrides()
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
    // Chercher une config avec weekly_schedule (nouvelle structure)
    const { data, error } = await supabase
      .from('time_slots_config')
      .select('*')
      .eq('establishment_id', selectedEstablishment)
      .not('weekly_schedule', 'is', null)
      .limit(1)

    if (data && data.length > 0) {
      // Config trouvée avec weekly_schedule
      const row = data[0]
      setConfig({
        id: row.id,
        establishment_id: row.establishment_id,
        slot_duration_minutes: row.slot_duration_minutes || row.slot_duration || 15,
        min_preparation_minutes: row.min_preparation_minutes || 30,
        max_orders_per_slot: row.max_orders_per_slot || 5,
        weekly_schedule: row.weekly_schedule || DEFAULT_SCHEDULE,
        is_active: row.is_active !== false,
      })
    } else {
      // Pas de config avec weekly_schedule, créer une config par défaut en mémoire
      // L'ID sera créé lors du premier save
      setConfig({
        id: '',
        establishment_id: selectedEstablishment,
        slot_duration_minutes: 15,
        min_preparation_minutes: 30,
        max_orders_per_slot: 5,
        weekly_schedule: DEFAULT_SCHEDULE,
        is_active: true,
      })
    }
  }

  async function loadOverrides() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('time_slot_overrides')
      .select('*')
      .eq('establishment_id', selectedEstablishment)
      .gte('date', today)
      .order('date')

    setOverrides((data || []).map(o => ({
      id: o.id,
      date: o.date,
      override_type: o.override_type,
      custom_slots: o.custom_slots,
      max_orders: o.max_orders,
      reason: o.reason,
    })))
  }

  async function saveConfig() {
    if (!config) return

    setSaving(true)
    setSaved(false)

    try {
      if (config.id) {
        // Update existing
        const { error } = await supabase
          .from('time_slots_config')
          .update({
            slot_duration_minutes: config.slot_duration_minutes,
            slot_duration: config.slot_duration_minutes,
            min_preparation_minutes: config.min_preparation_minutes,
            max_orders_per_slot: config.max_orders_per_slot,
            weekly_schedule: config.weekly_schedule,
            is_active: config.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id)

        if (error) throw error
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('time_slots_config')
          .insert({
            establishment_id: selectedEstablishment,
            slot_type: 'online',
            day_of_week: 0,
            start_time: '00:00',
            end_time: '23:59',
            slot_duration: config.slot_duration_minutes,
            slot_duration_minutes: config.slot_duration_minutes,
            min_preparation_minutes: config.min_preparation_minutes,
            max_orders_per_slot: config.max_orders_per_slot,
            weekly_schedule: config.weekly_schedule,
            is_active: config.is_active,
          })
          .select()
          .single()

        if (error) throw error
        setConfig({ ...config, id: data.id })
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error: any) {
      console.error('Erreur sauvegarde:', error)
      alert('Erreur: ' + error.message)
    }

    setSaving(false)
  }

  function updateDaySchedule(dayKey: string, updates: Partial<DaySchedule>) {
    if (!config) return

    setConfig({
      ...config,
      weekly_schedule: {
        ...config.weekly_schedule,
        [dayKey]: {
          ...config.weekly_schedule[dayKey],
          ...updates,
        },
      },
    })
  }

  function addSlot(dayKey: string) {
    if (!config) return

    const currentSlots = config.weekly_schedule[dayKey]?.slots || []
    updateDaySchedule(dayKey, {
      slots: [...currentSlots, { open: '12:00', close: '14:00' }],
    })
  }

  function removeSlot(dayKey: string, index: number) {
    if (!config) return

    const currentSlots = config.weekly_schedule[dayKey]?.slots || []
    updateDaySchedule(dayKey, {
      slots: currentSlots.filter((_, i) => i !== index),
    })
  }

  function updateSlot(dayKey: string, index: number, field: 'open' | 'close', value: string) {
    if (!config) return

    const currentSlots = [...(config.weekly_schedule[dayKey]?.slots || [])]
    currentSlots[index] = { ...currentSlots[index], [field]: value }
    updateDaySchedule(dayKey, { slots: currentSlots })
  }

  async function addOverride(e: React.FormEvent) {
    e.preventDefault()

    const { error } = await supabase.from('time_slot_overrides').insert({
      establishment_id: selectedEstablishment,
      date: overrideForm.date,
      override_type: overrideForm.type,
      reason: overrideForm.reason || null,
      max_orders: overrideForm.type === 'reduced' ? overrideForm.maxOrders : null,
      custom_slots: overrideForm.type === 'custom' ? overrideForm.slots : null,
    })

    if (!error) {
      setShowOverrideModal(false)
      loadOverrides()
      setOverrideForm({
        date: '',
        type: 'closed',
        reason: '',
        maxOrders: 3,
        slots: [{ open: '11:30', close: '21:00' }],
      })
    } else {
      alert('Erreur: ' + error.message)
    }
  }

  async function deleteOverride(id: string) {
    await supabase.from('time_slot_overrides').delete().eq('id', id)
    loadOverrides()
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-BE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Créneaux horaires</h1>
          <p className="text-gray-500">Configurez les horaires de commande en ligne</p>
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
          {/* Config générale */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>⚙️</span> Configuration générale
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Durée d'un créneau (minutes)
                </label>
                <input
                  type="number"
                  value={config.slot_duration_minutes}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      slot_duration_minutes: parseInt(e.target.value) || 15,
                    })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  min="5"
                  max="60"
                  step="5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Temps de préparation min. (minutes)
                </label>
                <input
                  type="number"
                  value={config.min_preparation_minutes}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      min_preparation_minutes: parseInt(e.target.value) || 30,
                    })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  min="10"
                  max="120"
                  step="5"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Premier créneau disponible = maintenant + ce temps
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max commandes par créneau
                </label>
                <input
                  type="number"
                  value={config.max_orders_per_slot}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      max_orders_per_slot: parseInt(e.target.value) || 5,
                    })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  min="1"
                  max="50"
                />
              </div>
            </div>
          </div>

          {/* Horaires par jour */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>📅</span> Horaires hebdomadaires
            </h2>

            <div className="space-y-4">
              {DAYS.map((day) => {
                const daySchedule = config.weekly_schedule[day.key] || {
                  enabled: false,
                  slots: [],
                }

                return (
                  <div
                    key={day.key}
                    className={`p-4 rounded-xl border-2 transition-colors ${
                      daySchedule.enabled
                        ? 'border-green-200 bg-green-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={daySchedule.enabled}
                          onChange={(e) =>
                            updateDaySchedule(day.key, { enabled: e.target.checked })
                          }
                          className="w-5 h-5 rounded text-green-500"
                        />
                        <span className="font-bold text-gray-900">{day.label}</span>
                      </label>

                      {daySchedule.enabled && (
                        <button
                          onClick={() => addSlot(day.key)}
                          className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-lg hover:bg-green-200"
                        >
                          + Ajouter un créneau
                        </button>
                      )}
                    </div>

                    {daySchedule.enabled && (
                      <div className="space-y-2">
                        {daySchedule.slots.length === 0 ? (
                          <p className="text-gray-400 text-sm">
                            Aucun créneau - cliquez sur "+ Ajouter un créneau"
                          </p>
                        ) : (
                          daySchedule.slots.map((slot, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-3 bg-white p-3 rounded-lg"
                            >
                              <input
                                type="time"
                                value={slot.open}
                                onChange={(e) =>
                                  updateSlot(day.key, index, 'open', e.target.value)
                                }
                                className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                              <span className="text-gray-400">→</span>
                              <input
                                type="time"
                                value={slot.close}
                                onChange={(e) =>
                                  updateSlot(day.key, index, 'close', e.target.value)
                                }
                                className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                              <button
                                onClick={() => removeSlot(day.key, index)}
                                className="text-red-400 hover:text-red-600 p-2"
                              >
                                🗑️
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Save button */}
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

          {/* Exceptions */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span>🚫</span> Exceptions (jours fériés, fermetures)
              </h2>
              <button
                onClick={() => setShowOverrideModal(true)}
                className="bg-gray-100 text-gray-700 font-medium px-4 py-2 rounded-xl hover:bg-gray-200"
              >
                + Ajouter une exception
              </button>
            </div>

            {overrides.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                Aucune exception programmée
              </p>
            ) : (
              <div className="space-y-3">
                {overrides.map((override) => (
                  <div
                    key={override.id}
                    className={`p-4 rounded-xl flex items-center justify-between ${
                      override.override_type === 'closed'
                        ? 'bg-red-50 border border-red-200'
                        : override.override_type === 'reduced'
                        ? 'bg-yellow-50 border border-yellow-200'
                        : 'bg-blue-50 border border-blue-200'
                    }`}
                  >
                    <div>
                      <p className="font-medium">{formatDate(override.date)}</p>
                      <p className="text-sm text-gray-500">
                        {override.override_type === 'closed' && '🚫 Fermé'}
                        {override.override_type === 'reduced' &&
                          `⚠️ Capacité réduite (${override.max_orders} max/créneau)`}
                        {override.override_type === 'custom' && '📅 Horaires spéciaux'}
                        {override.reason && ` - ${override.reason}`}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteOverride(override.id)}
                      className="text-gray-400 hover:text-red-500 p-2"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Exception */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold">Ajouter une exception</h2>
            </div>

            <form onSubmit={addOverride} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date *
                </label>
                <input
                  type="date"
                  value={overrideForm.date}
                  onChange={(e) =>
                    setOverrideForm({ ...overrideForm, date: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type d'exception
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                    <input
                      type="radio"
                      name="overrideType"
                      checked={overrideForm.type === 'closed'}
                      onChange={() =>
                        setOverrideForm({ ...overrideForm, type: 'closed' })
                      }
                      className="w-4 h-4"
                    />
                    <span>🚫 Fermé</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                    <input
                      type="radio"
                      name="overrideType"
                      checked={overrideForm.type === 'reduced'}
                      onChange={() =>
                        setOverrideForm({ ...overrideForm, type: 'reduced' })
                      }
                      className="w-4 h-4"
                    />
                    <span>⚠️ Capacité réduite</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                    <input
                      type="radio"
                      name="overrideType"
                      checked={overrideForm.type === 'custom'}
                      onChange={() =>
                        setOverrideForm({ ...overrideForm, type: 'custom' })
                      }
                      className="w-4 h-4"
                    />
                    <span>📅 Horaires spéciaux</span>
                  </label>
                </div>
              </div>

              {overrideForm.type === 'reduced' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max commandes par créneau
                  </label>
                  <input
                    type="number"
                    value={overrideForm.maxOrders}
                    onChange={(e) =>
                      setOverrideForm({
                        ...overrideForm,
                        maxOrders: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    min="1"
                  />
                </div>
              )}

              {overrideForm.type === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Horaires
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={overrideForm.slots[0]?.open || '11:30'}
                      onChange={(e) =>
                        setOverrideForm({
                          ...overrideForm,
                          slots: [{ ...overrideForm.slots[0], open: e.target.value }],
                        })
                      }
                      className="px-3 py-2 rounded-lg border border-gray-200"
                    />
                    <span>→</span>
                    <input
                      type="time"
                      value={overrideForm.slots[0]?.close || '21:00'}
                      onChange={(e) =>
                        setOverrideForm({
                          ...overrideForm,
                          slots: [{ ...overrideForm.slots[0], close: e.target.value }],
                        })
                      }
                      className="px-3 py-2 rounded-lg border border-gray-200"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Raison (optionnel)
                </label>
                <input
                  type="text"
                  value={overrideForm.reason}
                  onChange={(e) =>
                    setOverrideForm({ ...overrideForm, reason: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ex: Jour férié, congés..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600"
                >
                  Ajouter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
