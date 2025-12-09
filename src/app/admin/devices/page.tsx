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
  last_seen_at: string | null
  viva_terminal_id: string | null
  config: any
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  
  const [form, setForm] = useState({
    device_code: '',
    name: '',
    device_type: 'kiosk' as 'kiosk' | 'kds' | 'counter',
    is_active: true,
    viva_terminal_id: '',
  })
  
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadDevices()
  }, [])

  async function loadDevices() {
    setLoading(true)
    
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .eq('establishment_id', establishmentId)
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
        is_active: device.is_active,
        viva_terminal_id: device.viva_terminal_id || '',
      })
    } else {
      setEditingDevice(null)
      setForm({
        device_code: '',
        name: '',
        device_type: 'kiosk',
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
            device_code: form.device_code,
            name: form.name,
            device_type: form.device_type,
            is_active: form.is_active,
            viva_terminal_id: form.viva_terminal_id || null,
          })
          .eq('id', editingDevice.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('devices')
          .insert({
            establishment_id: establishmentId,
            device_code: form.device_code,
            name: form.name,
            device_type: form.device_type,
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

  function getDeviceTypeLabel(type: string) {
    switch (type) {
      case 'kiosk': return '🖥️ Borne'
      case 'kds': return '👨‍🍳 KDS'
      case 'counter': return '📋 Caisse'
      default: return type
    }
  }

  function getStatusBadge(device: Device) {
    if (!device.is_active) {
      return <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-500">Inactif</span>
    }
    
    if (device.last_seen_at) {
      const lastSeen = new Date(device.last_seen_at)
      const diff = Date.now() - lastSeen.getTime()
      const minutes = Math.floor(diff / 1000 / 60)
      
      if (minutes < 5) {
        return <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">🟢 En ligne</span>
      } else if (minutes < 60) {
        return <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-700">🟡 {minutes} min</span>
      }
    }
    
    return <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-500">⚪ Hors ligne</span>
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Devices</h1>
          <p className="text-gray-500">{devices.length} appareil(s) configuré(s)</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2"
        >
          ➕ Nouveau device
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div>
      ) : devices.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">📱</span>
          <p className="text-gray-500">Aucun device configuré</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {devices.map(device => (
            <div
              key={device.id}
              className={`bg-white rounded-2xl p-6 border-2 ${
                device.is_active ? 'border-gray-100' : 'border-gray-100 opacity-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-4xl">
                    {device.device_type === 'kiosk' ? '🖥️' : device.device_type === 'kds' ? '👨‍🍳' : '📋'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{device.name}</span>
                      <span className="bg-gray-100 px-2 py-0.5 rounded font-mono text-sm">{device.device_code}</span>
                      {getStatusBadge(device)}
                    </div>
                    <div className="text-gray-500 text-sm mt-1">
                      {getDeviceTypeLabel(device.device_type)}
                      {device.viva_terminal_id && (
                        <span className="ml-3 text-blue-600">
                          💳 Terminal: {device.viva_terminal_id}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openModal(device)}
                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => deleteDevice(device)}
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

      {/* Aide */}
      <div className="mt-8 bg-blue-50 rounded-xl p-6">
        <h3 className="font-bold text-blue-800 mb-2">💡 Configuration des terminaux de paiement</h3>
        <p className="text-blue-700 text-sm">
          Pour associer un terminal Viva Wallet à une borne, ajoutez l'<strong>Identifiant virtuel</strong> du terminal 
          (visible dans l'app Viva.com Terminal sur le smartphone) dans le champ "Terminal Viva ID".
        </p>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingDevice ? 'Modifier le device' : 'Nouveau device'}
            </h2>
            
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
                {formError}
              </div>
            )}
            
            <form onSubmit={saveDevice} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Code device *</label>
                <input
                  type="text"
                  value={form.device_code}
                  onChange={e => setForm({ ...form, device_code: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  placeholder="BORJU01, KITJU01..."
                  required
                />
                <p className="text-xs text-gray-400 mt-1">BOR=Borne, KIT=Cuisine, CAS=Caisse + JU=Jurbise + 01</p>
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
                <p className="text-xs text-gray-400 mt-1">Identifiant virtuel du terminal Viva Wallet associé</p>
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
