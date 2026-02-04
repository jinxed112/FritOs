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
  slot_type: 'pickup' | 'delivery'
  slot_duration_minutes: number
  min_preparation_minutes: number
  max_orders_per_slot: number
  weekly_schedule: WeeklySchedule
  is_active: boolean
}

type DeliveryConfig = {
  id: string
  establishment_id: string
  is_enabled: boolean
  min_order_amount: number
  free_delivery_threshold: number | null
  max_delivery_minutes: number
  additional_time_minutes: number
}

type DeliveryZone = {
  id: string
  establishment_id: string
  name: string
  min_minutes: number
  max_minutes: number
  delivery_fee: number
  is_active: boolean
  display_order: number
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

const DEFAULT_PICKUP_SCHEDULE: WeeklySchedule = {
  '0': { enabled: true, slots: [{ open: '18:00', close: '21:30' }] },
  '1': { enabled: true, slots: [{ open: '17:30', close: '21:00' }] },
  '2': { enabled: true, slots: [{ open: '17:30', close: '21:00' }] },
  '3': { enabled: true, slots: [{ open: '17:30', close: '21:00' }] },
  '4': { enabled: true, slots: [{ open: '17:30', close: '21:00' }] },
  '5': { enabled: true, slots: [{ open: '17:30', close: '22:00' }] },
  '6': { enabled: true, slots: [{ open: '17:30', close: '22:00' }] },
}

const DEFAULT_DELIVERY_SCHEDULE: WeeklySchedule = {
  '0': { enabled: true, slots: [{ open: '18:00', close: '21:00' }] },
  '1': { enabled: true, slots: [{ open: '18:00', close: '20:30' }] },
  '2': { enabled: true, slots: [{ open: '18:00', close: '20:30' }] },
  '3': { enabled: true, slots: [{ open: '18:00', close: '20:30' }] },
  '4': { enabled: true, slots: [{ open: '18:00', close: '20:30' }] },
  '5': { enabled: true, slots: [{ open: '18:00', close: '21:30' }] },
  '6': { enabled: true, slots: [{ open: '18:00', close: '21:30' }] },
}

const SLOT_TYPES = [
  { key: 'pickup', label: '🛒 Click & Collect', description: 'Retrait sur place' },
  { key: 'delivery', label: '🚗 Livraison', description: 'Livraison à domicile' },
] as const

export default function TimeSlotsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>('')
  const [selectedSlotType, setSelectedSlotType] = useState<'pickup' | 'delivery'>('pickup')
  const [configs, setConfigs] = useState<{ pickup: TimeSlotsConfig | null; delivery: TimeSlotsConfig | null }>({
    pickup: null,
    delivery: null,
  })

  // Delivery config & zones
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig | null>(null)
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([])
  const [showZoneModal, setShowZoneModal] = useState(false)
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null)
  const [zoneForm, setZoneForm] = useState({
    name: '',
    min_minutes: 0,
    max_minutes: 10,
    delivery_fee: 2.50,
  })

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

  // Config active selon le type sélectionné
  const config = configs[selectedSlotType]

  useEffect(() => {
    loadEstablishments()
  }, [])

  useEffect(() => {
    if (selectedEstablishment) {
      loadAllConfigs()
      loadDeliveryConfig()
      loadDeliveryZones()
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

  async function loadAllConfigs() {
    const { data } = await supabase
      .from('time_slots_config')
      .select('*')
      .eq('establishment_id', selectedEstablishment)
      .not('weekly_schedule', 'is', null)

    const newConfigs: { pickup: TimeSlotsConfig | null; delivery: TimeSlotsConfig | null } = {
      pickup: null,
      delivery: null,
    }

    if (data) {
      for (const row of data) {
        const slotType = row.slot_type as 'pickup' | 'delivery'
        if (slotType === 'pickup' || slotType === 'delivery') {
          newConfigs[slotType] = {
            id: row.id,
            establishment_id: row.establishment_id,
            slot_type: slotType,
            slot_duration_minutes: row.slot_duration_minutes || row.slot_duration || 15,
            min_preparation_minutes: row.min_preparation_minutes || 30,
            max_orders_per_slot: row.max_orders_per_slot || 5,
            weekly_schedule: row.weekly_schedule,
            is_active: row.is_active !== false,
          }
        }
      }
    }

    if (!newConfigs.pickup) {
      newConfigs.pickup = {
        id: '',
        establishment_id: selectedEstablishment,
        slot_type: 'pickup',
        slot_duration_minutes: 15,
        min_preparation_minutes: 30,
        max_orders_per_slot: 5,
        weekly_schedule: DEFAULT_PICKUP_SCHEDULE,
        is_active: true,
      }
    }

    if (!newConfigs.delivery) {
      newConfigs.delivery = {
        id: '',
        establishment_id: selectedEstablishment,
        slot_type: 'delivery',
        slot_duration_minutes: 15,
        min_preparation_minutes: 45,
        max_orders_per_slot: 3,
        weekly_schedule: DEFAULT_DELIVERY_SCHEDULE,
        is_active: true,
      }
    }

    setConfigs(newConfigs)
  }

  async function loadDeliveryConfig() {
    const { data } = await supabase
      .from('delivery_config')
      .select('*')
      .eq('establishment_id', selectedEstablishment)
      .limit(1)
      .single()

    if (data) {
      setDeliveryConfig({
        id: data.id,
        establishment_id: data.establishment_id,
        is_enabled: data.is_enabled ?? false,
        min_order_amount: parseFloat(data.min_order_amount) || 15,
        free_delivery_threshold: data.free_delivery_threshold ? parseFloat(data.free_delivery_threshold) : null,
        max_delivery_minutes: data.max_delivery_minutes || 15,
        additional_time_minutes: data.additional_time_minutes || 15,
      })
    } else {
      setDeliveryConfig({
        id: '',
        establishment_id: selectedEstablishment,
        is_enabled: false,
        min_order_amount: 15,
        free_delivery_threshold: null,
        max_delivery_minutes: 15,
        additional_time_minutes: 15,
      })
    }
  }

  async function loadDeliveryZones() {
    const { data } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('establishment_id', selectedEstablishment)
      .order('display_order')

    setDeliveryZones(data || [])
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

  // ===================== SAVE =====================

  async function saveConfig() {
    if (!config) return

    setSaving(true)
    setSaved(false)

    try {
      if (config.id) {
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
        const { data, error } = await supabase
          .from('time_slots_config')
          .insert({
            establishment_id: selectedEstablishment,
            slot_type: selectedSlotType,
            day_of_week: 0,
            start_time: '00:00:00',
            end_time: '23:59:00',
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

        setConfigs(prev => ({
          ...prev,
          [selectedSlotType]: { ...config, id: data.id }
        }))
      }

      // Si on est sur l'onglet delivery, sauvegarder aussi la config livraison
      if (selectedSlotType === 'delivery' && deliveryConfig) {
        await saveDeliveryConfig()
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error: any) {
      console.error('Erreur sauvegarde:', error)
      alert('Erreur: ' + error.message)
    }

    setSaving(false)
  }

  async function saveDeliveryConfig() {
    if (!deliveryConfig) return

    try {
      if (deliveryConfig.id) {
        const { error } = await supabase
          .from('delivery_config')
          .update({
            is_enabled: deliveryConfig.is_enabled,
            min_order_amount: deliveryConfig.min_order_amount,
            free_delivery_threshold: deliveryConfig.free_delivery_threshold,
            max_delivery_minutes: deliveryConfig.max_delivery_minutes,
            additional_time_minutes: deliveryConfig.additional_time_minutes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', deliveryConfig.id)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('delivery_config')
          .insert({
            establishment_id: selectedEstablishment,
            is_enabled: deliveryConfig.is_enabled,
            min_order_amount: deliveryConfig.min_order_amount,
            free_delivery_threshold: deliveryConfig.free_delivery_threshold,
            max_delivery_minutes: deliveryConfig.max_delivery_minutes,
            additional_time_minutes: deliveryConfig.additional_time_minutes,
          })
          .select()
          .single()

        if (error) throw error
        setDeliveryConfig({ ...deliveryConfig, id: data.id })
      }
    } catch (error: any) {
      console.error('Erreur sauvegarde config livraison:', error)
      throw error
    }
  }

  // ===================== ZONES =====================

  function openAddZone() {
    setEditingZone(null)
    // Auto-calculer min_minutes basé sur la dernière zone
    const lastZone = deliveryZones[deliveryZones.length - 1]
    setZoneForm({
      name: `Zone ${deliveryZones.length + 1}`,
      min_minutes: lastZone ? lastZone.max_minutes : 0,
      max_minutes: lastZone ? lastZone.max_minutes + 5 : 10,
      delivery_fee: lastZone ? parseFloat((lastZone.delivery_fee + 0.50).toFixed(2)) : 2.50,
    })
    setShowZoneModal(true)
  }

  function openEditZone(zone: DeliveryZone) {
    setEditingZone(zone)
    setZoneForm({
      name: zone.name,
      min_minutes: zone.min_minutes,
      max_minutes: zone.max_minutes,
      delivery_fee: zone.delivery_fee,
    })
    setShowZoneModal(true)
  }

  async function saveZone(e: React.FormEvent) {
    e.preventDefault()

    try {
      if (editingZone) {
        const { error } = await supabase
          .from('delivery_zones')
          .update({
            name: zoneForm.name,
            min_minutes: zoneForm.min_minutes,
            max_minutes: zoneForm.max_minutes,
            delivery_fee: zoneForm.delivery_fee,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingZone.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('delivery_zones')
          .insert({
            establishment_id: selectedEstablishment,
            name: zoneForm.name,
            min_minutes: zoneForm.min_minutes,
            max_minutes: zoneForm.max_minutes,
            delivery_fee: zoneForm.delivery_fee,
            display_order: deliveryZones.length,
          })

        if (error) throw error
      }

      setShowZoneModal(false)
      loadDeliveryZones()
    } catch (error: any) {
      alert('Erreur: ' + error.message)
    }
  }

  async function deleteZone(id: string) {
    if (!confirm('Supprimer cette zone ?')) return

    await supabase.from('delivery_zones').delete().eq('id', id)
    loadDeliveryZones()
  }

  async function toggleZone(zone: DeliveryZone) {
    await supabase
      .from('delivery_zones')
      .update({ is_active: !zone.is_active })
      .eq('id', zone.id)
    loadDeliveryZones()
  }

  // ===================== CONFIG HELPERS =====================

  function updateConfig(updates: Partial<TimeSlotsConfig>) {
    if (!config) return

    setConfigs(prev => ({
      ...prev,
      [selectedSlotType]: { ...config, ...updates }
    }))
  }

  function updateDaySchedule(dayKey: string, updates: Partial<DaySchedule>) {
    if (!config) return

    const newSchedule = {
      ...config.weekly_schedule,
      [dayKey]: {
        ...config.weekly_schedule[dayKey],
        ...updates,
      },
    }

    updateConfig({ weekly_schedule: newSchedule })
  }

  function addSlot(dayKey: string) {
    if (!config) return
    const daySchedule = config.weekly_schedule[dayKey]
    const newSlots = [...(daySchedule?.slots || []), { open: '17:30', close: '21:00' }]
    updateDaySchedule(dayKey, { slots: newSlots })
  }

  function removeSlot(dayKey: string, index: number) {
    if (!config) return
    const daySchedule = config.weekly_schedule[dayKey]
    const newSlots = daySchedule.slots.filter((_, i) => i !== index)
    updateDaySchedule(dayKey, { slots: newSlots })
  }

  function updateSlot(dayKey: string, index: number, updates: Partial<TimeSlot>) {
    if (!config) return
    const daySchedule = config.weekly_schedule[dayKey]
    const newSlots = daySchedule.slots.map((slot, i) =>
      i === index ? { ...slot, ...updates } : slot
    )
    updateDaySchedule(dayKey, { slots: newSlots })
  }

  function copyFromOther() {
    const otherType = selectedSlotType === 'pickup' ? 'delivery' : 'pickup'
    const otherConfig = configs[otherType]

    if (otherConfig && config) {
      updateConfig({
        weekly_schedule: { ...otherConfig.weekly_schedule },
        slot_duration_minutes: otherConfig.slot_duration_minutes,
      })
    }
  }

  // ===================== OVERRIDES =====================

  async function addOverride(e: React.FormEvent) {
    e.preventDefault()

    const { error } = await supabase.from('time_slot_overrides').insert({
      establishment_id: selectedEstablishment,
      date: overrideForm.date,
      override_type: overrideForm.type,
      custom_slots: overrideForm.type === 'custom' ? overrideForm.slots : null,
      max_orders: overrideForm.type === 'reduced' ? overrideForm.maxOrders : null,
      reason: overrideForm.reason || null,
    })

    if (error) {
      alert('Erreur: ' + error.message)
      return
    }

    setShowOverrideModal(false)
    setOverrideForm({
      date: '',
      type: 'closed',
      reason: '',
      maxOrders: 3,
      slots: [{ open: '11:30', close: '21:00' }],
    })
    loadOverrides()
  }

  async function deleteOverride(id: string) {
    if (!confirm('Supprimer cette exception ?')) return
    await supabase.from('time_slot_overrides').delete().eq('id', id)
    loadOverrides()
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-BE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  }

  // ===================== RENDER =====================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">⏰ Configuration des créneaux</h1>
          <p className="text-gray-500 mt-1">
            Paramétrez les créneaux Click & Collect et Livraison
          </p>
        </div>
      </div>

      {/* Sélecteur d'établissement */}
      {establishments.length > 1 && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Établissement
          </label>
          <select
            value={selectedEstablishment}
            onChange={(e) => setSelectedEstablishment(e.target.value)}
            className="w-full md:w-64 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {establishments.map((est) => (
              <option key={est.id} value={est.id}>
                {est.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {config && (
        <div className="space-y-6">
          {/* Onglets Pickup / Delivery */}
          <div className="bg-white rounded-2xl p-2 border border-gray-100 flex gap-2">
            {SLOT_TYPES.map((type) => {
              const typeConfig = configs[type.key]
              return (
                <button
                  key={type.key}
                  onClick={() => setSelectedSlotType(type.key)}
                  className={`flex-1 px-6 py-4 rounded-xl font-semibold transition-all relative ${
                    selectedSlotType === type.key
                      ? 'bg-orange-500 text-white shadow-lg'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="block text-lg">{type.label}</span>
                  <span className={`block text-sm mt-1 ${
                    selectedSlotType === type.key ? 'text-orange-100' : 'text-gray-400'
                  }`}>
                    {type.description}
                  </span>
                  {/* Badge actif/inactif */}
                  {typeConfig && (
                    <span className={`absolute top-2 right-3 text-xs px-2 py-0.5 rounded-full ${
                      typeConfig.is_active
                        ? selectedSlotType === type.key ? 'bg-green-400 text-white' : 'bg-green-100 text-green-700'
                        : selectedSlotType === type.key ? 'bg-red-400 text-white' : 'bg-red-100 text-red-700'
                    }`}>
                      {typeConfig.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Status actif/inactif */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {selectedSlotType === 'pickup' ? '🛒 Click & Collect' : '🚗 Livraison'}
                </h2>
                <p className="text-gray-500 text-sm">
                  {config.is_active ? 'Les commandes sont acceptées' : 'Les commandes sont désactivées'}
                </p>
              </div>
              <button
                onClick={() => updateConfig({ is_active: !config.is_active })}
                className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                  config.is_active
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {config.is_active ? '✓ Actif' : 'Inactif'}
              </button>
            </div>
          </div>

          {/* ============ DELIVERY CONFIG SECTION ============ */}
          {selectedSlotType === 'delivery' && deliveryConfig && (
            <>
              {/* Config livraison */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <span>💰</span> Paramètres livraison
                </h2>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Commande minimum (€)
                    </label>
                    <input
                      type="number"
                      value={deliveryConfig.min_order_amount}
                      onChange={(e) =>
                        setDeliveryConfig({
                          ...deliveryConfig,
                          min_order_amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      min="0"
                      step="0.50"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Montant minimum pour pouvoir se faire livrer
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Livraison gratuite dès (€)
                    </label>
                    <input
                      type="number"
                      value={deliveryConfig.free_delivery_threshold ?? ''}
                      onChange={(e) =>
                        setDeliveryConfig({
                          ...deliveryConfig,
                          free_delivery_threshold: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      min="0"
                      step="1"
                      placeholder="Laisser vide pour désactiver"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Frais de livraison offerts au-dessus de ce montant
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Rayon max (minutes)
                    </label>
                    <input
                      type="number"
                      value={deliveryConfig.max_delivery_minutes}
                      onChange={(e) =>
                        setDeliveryConfig({
                          ...deliveryConfig,
                          max_delivery_minutes: parseInt(e.target.value) || 15,
                        })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      min="5"
                      max="60"
                      step="5"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Temps de trajet max accepté
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Temps additionnel (min)
                    </label>
                    <input
                      type="number"
                      value={deliveryConfig.additional_time_minutes}
                      onChange={(e) =>
                        setDeliveryConfig({
                          ...deliveryConfig,
                          additional_time_minutes: parseInt(e.target.value) || 15,
                        })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      min="0"
                      max="60"
                      step="5"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Temps ajouté au créneau pour la livraison
                    </p>
                  </div>
                </div>
              </div>

              {/* Zones de livraison */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <span>📍</span> Zones de livraison
                  </h2>
                  <button
                    onClick={openAddZone}
                    className="bg-orange-500 text-white font-medium px-4 py-2 rounded-xl hover:bg-orange-600"
                  >
                    + Ajouter une zone
                  </button>
                </div>

                {deliveryZones.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">
                    Aucune zone de livraison configurée
                  </p>
                ) : (
                  <div className="space-y-3">
                    {deliveryZones.map((zone) => (
                      <div
                        key={zone.id}
                        className={`p-4 rounded-xl border-2 flex items-center justify-between transition-colors ${
                          zone.is_active
                            ? 'border-green-200 bg-green-50/50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-6">
                          <button
                            onClick={() => toggleZone(zone)}
                            className={`w-12 h-7 rounded-full transition-colors relative ${
                              zone.is_active ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${
                                zone.is_active ? 'right-1' : 'left-1'
                              }`}
                            />
                          </button>
                          <div>
                            <p className="font-semibold text-gray-900">{zone.name}</p>
                            <p className="text-sm text-gray-500">
                              {zone.min_minutes} - {zone.max_minutes} min de trajet
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xl font-bold text-orange-500">
                            {zone.delivery_fee.toFixed(2)}€
                          </span>
                          <button
                            onClick={() => openEditZone(zone)}
                            className="text-gray-400 hover:text-blue-500 p-2"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteZone(zone.id)}
                            className="text-gray-400 hover:text-red-500 p-2"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Résumé des zones */}
                {deliveryZones.length > 0 && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                    <p className="text-sm text-blue-700">
                      <strong>💡 Résumé :</strong>{' '}
                      {deliveryZones.filter(z => z.is_active).length} zone(s) active(s),{' '}
                      frais de{' '}
                      {Math.min(...deliveryZones.filter(z => z.is_active).map(z => z.delivery_fee)).toFixed(2)}€{' '}
                      à{' '}
                      {Math.max(...deliveryZones.filter(z => z.is_active).map(z => z.delivery_fee)).toFixed(2)}€
                      {deliveryConfig.free_delivery_threshold && (
                        <> — Gratuit dès {deliveryConfig.free_delivery_threshold}€ de commande</>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ============ CRENEAUX CONFIG ============ */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span>⚙️</span> Paramètres des créneaux {selectedSlotType === 'pickup' ? 'Click & Collect' : 'Livraison'}
              </h2>
              <button
                onClick={copyFromOther}
                className="text-sm text-orange-500 hover:text-orange-600 font-medium"
              >
                📋 Copier depuis {selectedSlotType === 'pickup' ? 'Livraison' : 'Click & Collect'}
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Durée d'un créneau (minutes)
                </label>
                <input
                  type="number"
                  value={config.slot_duration_minutes}
                  onChange={(e) =>
                    updateConfig({
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
                    updateConfig({
                      min_preparation_minutes: parseInt(e.target.value) || 30,
                    })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  min="10"
                  max="120"
                  step="5"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Premier créneau = maintenant + ce temps
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
                    updateConfig({
                      max_orders_per_slot: parseInt(e.target.value) || 5,
                    })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  min="1"
                  max="50"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {selectedSlotType === 'delivery'
                    ? 'Limité par le nombre de livreurs'
                    : 'Capacité de préparation'}
                </p>
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
                        ? 'border-orange-200 bg-orange-50/50'
                        : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() =>
                            updateDaySchedule(day.key, {
                              enabled: !daySchedule.enabled,
                            })
                          }
                          className={`w-12 h-7 rounded-full transition-colors relative ${
                            daySchedule.enabled ? 'bg-orange-500' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${
                              daySchedule.enabled ? 'right-1' : 'left-1'
                            }`}
                          />
                        </button>
                        <span
                          className={`font-semibold ${
                            daySchedule.enabled ? 'text-gray-900' : 'text-gray-400'
                          }`}
                        >
                          {day.label}
                        </span>
                      </div>

                      {daySchedule.enabled && (
                        <button
                          onClick={() => addSlot(day.key)}
                          className="text-orange-500 hover:text-orange-600 text-sm font-medium"
                        >
                          + Ajouter une plage
                        </button>
                      )}
                    </div>

                    {daySchedule.enabled && daySchedule.slots.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {daySchedule.slots.map((slot, index) => (
                          <div key={index} className="flex items-center gap-3">
                            <input
                              type="time"
                              value={slot.open}
                              onChange={(e) =>
                                updateSlot(day.key, index, { open: e.target.value })
                              }
                              className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                            <span className="text-gray-400">→</span>
                            <input
                              type="time"
                              value={slot.close}
                              onChange={(e) =>
                                updateSlot(day.key, index, { close: e.target.value })
                              }
                              className="px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                            {daySchedule.slots.length > 1 && (
                              <button
                                onClick={() => removeSlot(day.key, index)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bouton Sauvegarder */}
          <div className="flex items-center gap-4">
            <button
              onClick={saveConfig}
              disabled={saving}
              className="bg-orange-500 text-white font-bold px-8 py-4 rounded-xl hover:bg-orange-600 disabled:opacity-50 shadow-lg"
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

      {/* Modal Zone de livraison */}
      {showZoneModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold">
                {editingZone ? 'Modifier la zone' : 'Ajouter une zone de livraison'}
              </h2>
            </div>

            <form onSubmit={saveZone} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom de la zone *
                </label>
                <input
                  type="text"
                  value={zoneForm.name}
                  onChange={(e) =>
                    setZoneForm({ ...zoneForm, name: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                  placeholder="Ex: Zone 1 (proche)"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Temps min (minutes)
                  </label>
                  <input
                    type="number"
                    value={zoneForm.min_minutes}
                    onChange={(e) =>
                      setZoneForm({ ...zoneForm, min_minutes: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Temps max (minutes)
                  </label>
                  <input
                    type="number"
                    value={zoneForm.max_minutes}
                    onChange={(e) =>
                      setZoneForm({ ...zoneForm, max_minutes: parseInt(e.target.value) || 10 })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                  value={zoneForm.delivery_fee}
                  onChange={(e) =>
                    setZoneForm({ ...zoneForm, delivery_fee: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  min="0"
                  step="0.50"
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
