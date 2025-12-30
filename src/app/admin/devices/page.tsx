'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type DeviceSession = {
  id: string
  created_at: string
  last_used_at: string
  user_agent: string | null
  ip_address: string | null
  is_valid: boolean
}

type Device = {
  id: string
  device_code: string
  name: string
  device_type: 'kiosk' | 'kds' | 'counter'
  establishment_id: string
  is_active: boolean
  last_seen: string | null
  viva_terminal_id: string | null
  access_pin: string | null
  pin_created_at: string | null
  config: any
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  
  // Sessions modal
  const [showSessionsModal, setShowSessionsModal] = useState(false)
  const [sessionsDevice, setSessionsDevice] = useState<Device | null>(null)
  const [sessions, setSessions] = useState<DeviceSession[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  
  // PIN visibility
  const [visiblePins, setVisiblePins] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  
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
        // Générer un PIN pour le nouveau device
        const newPin = String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
        
        const { error } = await supabase
          .from('devices')
          .insert({
            establishment_id: establishmentId,
            device_code: form.device_code,
            name: form.name,
            device_type: form.device_type,
            is_active: form.is_active,
            viva_terminal_id: form.viva_terminal_id || null,
            access_pin: newPin,
            pin_created_at: new Date().toISOString(),
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

  async function regeneratePin(device: Device) {
    if (!confirm(`Régénérer le PIN de "${device.name}" ?\n\nCela déconnectera tous les appareils utilisant ce device.`)) return
    
    // Utiliser la fonction SQL
    const { data, error } = await supabase.rpc('regenerate_device_pin', {
      p_device_id: device.id
    })
    
    if (error) {
      console.error('Erreur:', error)
      alert('Erreur lors de la régénération du PIN')
    } else {
      alert(`Nouveau PIN : ${data}`)
      loadDevices()
    }
  }

  function togglePinVisibility(deviceId: string) {
    const newSet = new Set(visiblePins)
    if (newSet.has(deviceId)) {
      newSet.delete(deviceId)
    } else {
      newSet.add(deviceId)
    }
    setVisiblePins(newSet)
  }

  function getDeviceUrl(device: Device): string {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const path = device.device_type === 'kiosk' ? 'kiosk' : device.device_type === 'kds' ? 'kitchen' : 'counter'
    return `${baseUrl}/${path}/${device.device_code}`
  }

  async function copyDeviceUrl(device: Device) {
    const url = getDeviceUrl(device)
    await navigator.clipboard.writeText(url)
    setCopiedId(device.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function openSessionsModal(device: Device) {
    setSessionsDevice(device)
    setShowSessionsModal(true)
    setLoadingSessions(true)
    
    const { data, error } = await supabase
      .from('device_sessions')
      .select('*')
      .eq('device_id', device.id)
      .eq('is_valid', true)
      .order('last_used_at', { ascending: false })
    
    if (!error) {
      setSessions(data || [])
    }
    
    setLoadingSessions(false)
  }

  async function revokeSession(sessionId: string) {
    await supabase
      .from('device_sessions')
      .update({ is_valid: false })
      .eq('id', sessionId)
    
    setSessions(sessions.filter(s => s.id !== sessionId))
  }

  async function revokeAllSessions(deviceId: string) {
    if (!confirm('Révoquer toutes les sessions ? Tous les appareils seront déconnectés.')) return
    
    await supabase
      .from('device_sessions')
      .update({ is_valid: false })
      .eq('device_id', deviceId)
    
    setSessions([])
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
    
    if (device.last_seen) {
      const lastSeen = new Date(device.last_seen)
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

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
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
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="text-4xl">
                    {device.device_type === 'kiosk' ? '🖥️' : device.device_type === 'kds' ? '👨‍🍳' : '📋'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-lg">{device.name}</span>
                      <span className="bg-gray-100 px-2 py-0.5 rounded font-mono text-sm">{device.device_code}</span>
                      {getStatusBadge(device)}
                    </div>
                    <div className="text-gray-500 text-sm">
                      {getDeviceTypeLabel(device.device_type)}
                      {device.viva_terminal_id && (
                        <span className="ml-3 text-blue-600">
                          💳 Terminal: {device.viva_terminal_id}
                        </span>
                      )}
                    </div>
                    
                    {/* PIN et URL */}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {/* PIN */}
                      <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-gray-500 text-sm">PIN:</span>
                        <span className="font-mono font-bold">
                          {visiblePins.has(device.id) ? device.access_pin : '••••••'}
                        </span>
                        <button
                          onClick={() => togglePinVisibility(device.id)}
                          className="text-gray-400 hover:text-gray-600"
                          title={visiblePins.has(device.id) ? 'Masquer' : 'Afficher'}
                        >
                          {visiblePins.has(device.id) ? '🙈' : '👁️'}
                        </button>
                        <button
                          onClick={() => regeneratePin(device)}
                          className="text-gray-400 hover:text-orange-500"
                          title="Régénérer le PIN"
                        >
                          🔄
                        </button>
                      </div>
                      
                      {/* URL */}
                      <button
                        onClick={() => copyDeviceUrl(device)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                          copiedId === device.id 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                        }`}
                      >
                        <span className="text-sm font-mono truncate max-w-[200px]">
                          /{device.device_type === 'kiosk' ? 'kiosk' : device.device_type === 'kds' ? 'kitchen' : 'counter'}/{device.device_code}
                        </span>
                        {copiedId === device.id ? '✓' : '📋'}
                      </button>
                      
                      {/* Sessions */}
                      <button
                        onClick={() => openSessionsModal(device)}
                        className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm"
                      >
                        🔌 Sessions
                      </button>
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
      <div className="mt-8 space-y-4">
        <div className="bg-blue-50 rounded-xl p-6">
          <h3 className="font-bold text-blue-800 mb-2">🔐 Authentification des devices</h3>
          <p className="text-blue-700 text-sm mb-2">
            Chaque device a un <strong>code unique</strong> et un <strong>PIN à 6 chiffres</strong>.
          </p>
          <ul className="text-blue-700 text-sm list-disc list-inside space-y-1">
            <li>L'URL du device contient le code (ex: /kiosk/BORJU01)</li>
            <li>Au premier accès, l'employé entre le PIN une seule fois</li>
            <li>Un cookie sécurisé garde la session active (1 an)</li>
            <li>Régénérer le PIN déconnecte tous les appareils</li>
          </ul>
        </div>
        
        <div className="bg-orange-50 rounded-xl p-6">
          <h3 className="font-bold text-orange-800 mb-2">💳 Configuration des terminaux de paiement</h3>
          <p className="text-orange-700 text-sm">
            Pour associer un terminal Viva Wallet à une borne, ajoutez l'<strong>Identifiant virtuel</strong> du terminal 
            (visible dans l'app Viva.com Terminal sur le smartphone) dans le champ "Terminal Viva ID".
          </p>
        </div>
      </div>

      {/* Modal Edit/Create */}
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

      {/* Modal Sessions */}
      {showSessionsModal && sessionsDevice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Sessions - {sessionsDevice.name}
              </h2>
              <button
                onClick={() => setShowSessionsModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>
            
            {loadingSessions ? (
              <div className="text-center py-8 text-gray-400">Chargement...</div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-4xl block mb-2">🔌</span>
                <p className="text-gray-500">Aucune session active</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
                  {sessions.map(session => (
                    <div key={session.id} className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-gray-500">
                            Dernière activité : {formatDate(session.last_used_at)}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Créée le {formatDate(session.created_at)}
                          </p>
                          {session.ip_address && (
                            <p className="text-xs text-gray-400">
                              IP : {session.ip_address}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => revokeSession(session.id)}
                          className="text-red-500 hover:text-red-700 text-sm font-medium"
                        >
                          Révoquer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                
                <button
                  onClick={() => revokeAllSessions(sessionsDevice.id)}
                  className="w-full bg-red-100 text-red-700 font-semibold py-3 rounded-xl hover:bg-red-200"
                >
                  🚫 Révoquer toutes les sessions
                </button>
              </>
            )}
            
            <button
              onClick={() => setShowSessionsModal(false)}
              className="w-full mt-4 px-6 py-3 rounded-xl border border-gray-200 font-semibold text-gray-700 hover:bg-gray-50"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
