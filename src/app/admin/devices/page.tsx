'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Device = {
  id: string
  device_code: string
  name: string
  device_type: 'kiosk' | 'kds' | 'counter'
  establishment_id: string
  is_active: boolean
  last_seen: string | null
  viva_terminal_id: string | null
  config: any
}

type Establishment = {
  id: string
  name: string
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>('')
  
  const [form, setForm] = useState({
    device_code: '',
    name: '',
    device_type: 'kiosk' as 'kiosk' | 'kds' | 'counter',
    establishment_id: '',
    is_active: true,
    viva_terminal_id: '',
  })
  
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const supabase = createClient()

  useEffect(() => {
    loadEstablishments()
  }, [])

  useEffect(() => {
    if (selectedEstablishment) {
      loadDevices()
    }
  }, [selectedEstablishment])

  async function loadEstablishments() {
    const { data, error } = await supabase
      .from('establishments')
      .select('id, name')
      .order('name')
    
    if (!error && data) {
      setEstablishments(data)
      if (data.length > 0) {
        setSelectedEstablishment(data[0].id)
      }
    }
    setLoading(false)
  }

  async function loadDevices() {
    if (!selectedEstablishment) return
    
    setLoading(true)
    
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .eq('establishment_id', selectedEstablishment)
      .order('device_code')
    
    if (error) {
      console.error('Erreur:', error)
    } else {
      setDevices(data || [])
    }
    
    setLoading(false)
  }

  function openModal(device?: Device) {
    if (device) {
      setEditingDevice(device)
      setForm({
        device_code: device.device_code,
        name: device.name,
        device_type: device.device_type,
        establishment_id: device.establishment_id,
        is_active: device.is_active,
        viva_terminal_id: device.viva_terminal_id || '',
      })
    } else {
      setEditingDevice(null)
      setForm({
        device_code: '',
        name: '',
        device_type: 'kiosk',
        establishment_id: selectedEstablishment,
        is_active: true,
        viva_terminal_id: '',
      })
    }
    setFormError('')
    setShowModal(true)
  }

  async function saveDevice(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    
    if (!form.device_code.trim() || !form.name.trim()) {
      setFormError('Code et nom sont obligatoires')
      return
    }
    
    setSaving(true)
    
    try {
      if (editingDevice) {
        const { error } = await supabase
          .from('devices')
          .update({
            device_code: form.device_code.toUpperCase(),
            name: form.name,
            device_type: form.device_type,
            establishment_id: form.establishment_id,
            is_active: form.is_active,
            viva_terminal_id: form.viva_terminal_id || null,
          })
          .eq('id', editingDevice.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('devices')
          .insert({
            device_code: form.device_code.toUpperCase(),
            name: form.name,
            device_type: form.device_type,
            establishment_id: form.establishment_id,
            is_active: form.is_active,
            viva_terminal_id: form.viva_terminal_id || null,
          })
        
        if (error) throw error
      }
      
      setShowModal(false)
      loadDevices()
    } catch (error: any) {
      console.error('Erreur:', error)
      setFormError(error.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function deleteDevice(device: Device) {
    if (!confirm(`Supprimer le device "${device.name}" ?`)) return
    
    const { error } = await supabase
      .from('devices')
      .delete()
      .eq('id', device.id)
    
    if (!error) loadDevices()
  }

  async function toggleDeviceActive(device: Device) {
    const { error } = await supabase
      .from('devices')
      .update({ is_active: !device.is_active })
      .eq('id', device.id)
    
    if (!error) loadDevices()
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Jamais'
    const date = new Date(dateStr)
    return date.toLocaleString('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getDeviceTypeIcon(type: string): string {
    switch (type) {
      case 'kiosk': return '🖥️'
      case 'kds': return '👨‍🍳'
      case 'counter': return '📋'
      default: return '📱'
    }
  }

  function getDeviceTypeLabel(type: string): string {
    switch (type) {
      case 'kiosk': return 'Borne'
      case 'kds': return 'KDS'
      case 'counter': return 'Caisse'
      default: return type
    }
  }

  function getDeviceUrl(device: Device): string {
    switch (device.device_type) {
      case 'kiosk': return `/kiosk/${device.device_code}`
      case 'kds': return '/kitchen'
      case 'counter': return '/counter'
      default: return '#'
    }
  }

  if (loading && establishments.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl block mb-4 animate-pulse">📱</span>
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📱 Gestion des Devices</h1>
            <p className="text-gray-500 mt-1">
              Configurez vos bornes, écrans cuisine et caisses
            </p>
          </div>
          <button
            onClick={() => openModal()}
            className="bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors flex items-center gap-2"
          >
            ➕ Nouveau device
          </button>
        </div>

        {/* Establishment selector */}
        <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">Établissement</label>
          <select
            value={selectedEstablishment}
            onChange={(e) => setSelectedEstablishment(e.target.value)}
            className="w-full md:w-auto px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {establishments.map(est => (
              <option key={est.id} value={est.id}>{est.name}</option>
            ))}
          </select>
        </div>

        {/* Info box - Comment utiliser */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
          <h3 className="font-semibold text-blue-800 mb-2">💡 Comment utiliser les devices ?</h3>
          <p className="text-blue-700 text-sm">
            Tous les devices utilisent le même compte de connexion. Sur la tablette/borne :<br/>
            1. Allez sur <code className="bg-blue-100 px-1 rounded">/device</code><br/>
            2. Connectez-vous avec <strong>device@fritos.be</strong> / <strong>112000</strong><br/>
            3. Sélectionnez le device à utiliser
          </p>
        </div>

        {/* Devices list */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Chargement...</div>
        ) : devices.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <span className="text-6xl block mb-4">📱</span>
            <p className="text-gray-500 text-lg mb-4">Aucun device configuré</p>
            <button
              onClick={() => openModal()}
              className="bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600"
            >
              Créer le premier device
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {devices.map(device => (
              <div
                key={device.id}
                className={`bg-white rounded-2xl p-5 shadow-sm border-2 transition-all ${
                  device.is_active ? 'border-transparent hover:border-orange-200' : 'border-gray-200 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{getDeviceTypeIcon(device.device_type)}</span>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">{device.name}</h3>
                      <p className="text-gray-500 font-mono text-sm">{device.device_code}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    device.is_active 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {device.is_active ? '✓ Actif' : 'Inactif'}
                  </span>
                </div>

                <div className="space-y-2 mb-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Type</span>
                    <span className="font-medium">{getDeviceTypeLabel(device.device_type)}</span>
                  </div>
                  {device.viva_terminal_id && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Terminal Viva</span>
                      <span className="font-mono text-xs">{device.viva_terminal_id}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Dernière activité</span>
                    <span className="text-xs">{formatDate(device.last_seen)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => toggleDeviceActive(device)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      device.is_active
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {device.is_active ? '⏸️ Désactiver' : '▶️ Activer'}
                  </button>
                  <button
                    onClick={() => openModal(device)}
                    className="flex-1 bg-orange-100 text-orange-700 py-2 rounded-lg text-sm font-medium hover:bg-orange-200"
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => deleteDevice(device)}
                    className="px-3 bg-red-100 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-200"
                  >
                    🗑️
                  </button>
                </div>

                {/* Quick access link */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <a
                    href={getDeviceUrl(device)}
                    target="_blank"
                    className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                  >
                    🔗 {getDeviceUrl(device)}
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Create/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingDevice ? '✏️ Modifier le device' : '➕ Nouveau device'}
            </h2>
            
            {formError && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl mb-4">
                {formError}
              </div>
            )}
            
            <form onSubmit={saveDevice} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Code Device *</label>
                <input
                  type="text"
                  value={form.device_code}
                  onChange={e => setForm({ ...form, device_code: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono uppercase"
                  placeholder="BORBO01, KITBO01..."
                  required
                />
                <p className="text-xs text-gray-400 mt-1">Code unique, ex: BORJU01 (Borne Jurbise 01)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Borne entrée, KDS Cuisine..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Établissement</label>
                <select
                  value={form.establishment_id}
                  onChange={e => setForm({ ...form, establishment_id: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {establishments.map(est => (
                    <option key={est.id} value={est.id}>{est.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                <select
                  value={form.device_type}
                  onChange={e => setForm({ ...form, device_type: e.target.value as any })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="kiosk">🖥️ Borne de commande</option>
                  <option value="kds">👨‍🍳 KDS Cuisine</option>
                  <option value="counter">📋 Caisse / Comptoir</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  💳 Terminal Viva ID
                </label>
                <input
                  type="text"
                  value={form.viva_terminal_id}
                  onChange={e => setForm({ ...form, viva_terminal_id: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  placeholder="16000123..."
                />
                <p className="text-xs text-gray-400 mt-1">Identifiant virtuel du terminal Viva Wallet (pour les bornes)</p>
              </div>

              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm({ ...form, is_active: e.target.checked })}
                  className="w-5 h-5 rounded text-orange-500"
                />
                <span className="font-medium">✅ Device actif</span>
              </label>

              <div className="flex gap-3 pt-4">
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