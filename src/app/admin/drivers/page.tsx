'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Driver = {
  id: string
  name: string
  phone: string
  email: string | null
  pin_code: string
  status: 'offline' | 'available' | 'delivering'
  is_active: boolean
  created_at: string
  // Stats
  total_deliveries?: number
  avg_rating?: number
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)
  
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    pin_code: '',
    is_active: true,
  })
  
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadDrivers()
    
    // Refresh toutes les 30 secondes pour voir le statut en temps réel
    const interval = setInterval(loadDrivers, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadDrivers() {
    setLoading(true)
    
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('establishment_id', establishmentId)
      .order('name')
    
    if (error) {
      console.error('Erreur:', error)
    } else {
      setDrivers(data || [])
    }
    
    setLoading(false)
  }

  function generatePIN(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  function openModal(driver?: Driver) {
    if (driver) {
      setEditingDriver(driver)
      setForm({
        name: driver.name,
        phone: driver.phone,
        email: driver.email || '',
        pin_code: driver.pin_code,
        is_active: driver.is_active,
      })
    } else {
      setEditingDriver(null)
      setForm({
        name: '',
        phone: '',
        email: '',
        pin_code: generatePIN(),
        is_active: true,
      })
    }
    setFormError('')
    setShowModal(true)
  }

  async function saveDriver(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    
    if (!form.name.trim() || !form.phone.trim()) {
      setFormError('Nom et téléphone sont obligatoires')
      return
    }
    
    if (form.pin_code.length !== 6 || !/^\d+$/.test(form.pin_code)) {
      setFormError('Le code PIN doit contenir 6 chiffres')
      return
    }
    
    setSaving(true)
    
    try {
      if (editingDriver) {
        const { error } = await supabase
          .from('drivers')
          .update({
            name: form.name,
            phone: form.phone,
            email: form.email || null,
            pin_code: form.pin_code,
            is_active: form.is_active,
          })
          .eq('id', editingDriver.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('drivers')
          .insert({
            establishment_id: establishmentId,
            name: form.name,
            phone: form.phone,
            email: form.email || null,
            pin_code: form.pin_code,
            is_active: form.is_active,
            status: 'offline',
          })
        
        if (error) throw error
      }
      
      setShowModal(false)
      loadDrivers()
    } catch (error: any) {
      console.error('Erreur:', error)
      if (error.message?.includes('unique')) {
        setFormError('Ce code PIN est déjà utilisé')
      } else {
        setFormError(error.message || 'Erreur lors de la sauvegarde')
      }
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(driver: Driver) {
    const { error } = await supabase
      .from('drivers')
      .update({ is_active: !driver.is_active })
      .eq('id', driver.id)
    
    if (!error) loadDrivers()
  }

  async function deleteDriver(driver: Driver) {
    if (!confirm(`Supprimer le livreur "${driver.name}" ?`)) return
    
    const { error } = await supabase
      .from('drivers')
      .delete()
      .eq('id', driver.id)
    
    if (!error) loadDrivers()
  }

  function getStatusBadge(status: string, isActive: boolean) {
    if (!isActive) {
      return <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-500">Inactif</span>
    }
    
    switch (status) {
      case 'available':
        return <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">🟢 Disponible</span>
      case 'delivering':
        return <span className="px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-700">🛵 En livraison</span>
      default:
        return <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-500">⚪ Hors ligne</span>
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Livreurs</h1>
          <p className="text-gray-500">{drivers.filter(d => d.is_active).length} livreur(s) actif(s)</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2"
        >
          ➕ Nouveau livreur
        </button>
      </div>

      {/* Stats en temps réel */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-6">
          <p className="text-4xl font-bold text-green-500">
            {drivers.filter(d => d.status === 'available' && d.is_active).length}
          </p>
          <p className="text-gray-500">Disponibles</p>
        </div>
        <div className="bg-white rounded-2xl p-6">
          <p className="text-4xl font-bold text-orange-500">
            {drivers.filter(d => d.status === 'delivering').length}
          </p>
          <p className="text-gray-500">En livraison</p>
        </div>
        <div className="bg-white rounded-2xl p-6">
          <p className="text-4xl font-bold text-gray-400">
            {drivers.filter(d => d.status === 'offline' || !d.is_active).length}
          </p>
          <p className="text-gray-500">Hors ligne</p>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div>
      ) : drivers.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4">🛵</span>
          <p className="text-gray-500 mb-4">Aucun livreur configuré</p>
          <button onClick={() => openModal()} className="text-orange-500 font-medium hover:underline">
            Ajouter votre premier livreur
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {drivers.map(driver => (
            <div
              key={driver.id}
              className={`bg-white rounded-2xl p-6 border-2 ${
                driver.is_active ? 'border-gray-100' : 'border-gray-100 opacity-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center text-2xl">
                    🛵
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{driver.name}</span>
                      {getStatusBadge(driver.status, driver.is_active)}
                    </div>
                    <div className="text-gray-500 text-sm mt-1 flex items-center gap-4">
                      <span>📞 {driver.phone}</span>
                      {driver.email && <span>✉️ {driver.email}</span>}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  {/* Code PIN (visible pour l'admin) */}
                  <div className="bg-gray-100 px-4 py-2 rounded-xl">
                    <p className="text-xs text-gray-500">Code PIN</p>
                    <p className="font-mono font-bold text-lg">{driver.pin_code}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleActive(driver)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium ${
                        driver.is_active 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {driver.is_active ? '✅ Actif' : '⏸️ Inactif'}
                    </button>
                    <button
                      onClick={() => openModal(driver)}
                      className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                    >
                      ✏️
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
            </div>
          ))}
        </div>
      )}

      {/* Aide */}
      <div className="mt-8 bg-blue-50 rounded-xl p-6">
        <h3 className="font-bold text-blue-800 mb-2">💡 Application Livreur</h3>
        <p className="text-blue-700 text-sm mb-3">
          Les livreurs accèdent à l'application sur <strong>/driver</strong> avec leur code PIN à 6 chiffres.
        </p>
        <p className="text-blue-600 text-sm">
          L'app leur permet de voir les livraisons disponibles, créer leurs tournées, et utiliser le GPS pour naviguer.
        </p>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingDriver ? 'Modifier le livreur' : 'Nouveau livreur'}
            </h2>
            
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
                {formError}
              </div>
            )}
            
            <form onSubmit={saveDriver} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Jean Dupont"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="+32 470 00 00 00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email (optionnel)</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="jean@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Code PIN (6 chiffres) *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.pin_code}
                    onChange={e => setForm({ ...form, pin_code: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-xl tracking-widest"
                    placeholder="123456"
                    maxLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, pin_code: generatePIN() })}
                    className="px-4 py-3 bg-gray-100 rounded-xl hover:bg-gray-200 text-sm"
                  >
                    🎲 Générer
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Ce code permet au livreur de se connecter à l'application
                </p>
              </div>

              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm({ ...form, is_active: e.target.checked })}
                  className="w-5 h-5 rounded text-orange-500"
                />
                <span className="font-medium">✅ Livreur actif</span>
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
