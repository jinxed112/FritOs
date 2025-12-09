'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Establishment = {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  vat_number: string | null
  logo_url: string | null
}

export default function SettingsPage() {
  const [establishment, setEstablishment] = useState<Establishment | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    vat_number: '',
  })

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadEstablishment()
  }, [])

  async function loadEstablishment() {
    setLoading(true)
    
    const { data, error } = await supabase
      .from('establishments')
      .select('*')
      .eq('id', establishmentId)
      .single()
    
    if (!error && data) {
      setEstablishment(data)
      setForm({
        name: data.name || '',
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        vat_number: data.vat_number || '',
      })
    }
    
    setLoading(false)
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    
    const { error } = await supabase
      .from('establishments')
      .update({
        name: form.name,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        vat_number: form.vat_number || null,
      })
      .eq('id', establishmentId)
    
    if (error) {
      console.error('Erreur:', error)
      alert('Erreur lors de la sauvegarde')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    
    setSaving(false)
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500">Configuration de l'établissement</p>
      </div>

      {/* Formulaire */}
      <div className="bg-white rounded-2xl p-8 max-w-2xl">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          🏪 Informations établissement
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          Ces informations apparaissent sur les tickets de caisse
        </p>
        
        <form onSubmit={saveSettings} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nom de l'établissement *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="MDjambo Jurbise"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Adresse
            </label>
            <input
              type="text"
              value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Rue de Mons 123, 7050 Jurbise"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Téléphone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="+32 65 00 00 00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="contact@mdjambo.be"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Numéro de TVA
            </label>
            <input
              type="text"
              value={form.vat_number}
              onChange={e => setForm({ ...form, vat_number: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="BE 0123.456.789"
            />
          </div>

          <div className="pt-4 flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-orange-500 text-white font-semibold px-8 py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer'}
            </button>
            
            {saved && (
              <span className="text-green-600 font-medium flex items-center gap-2">
                ✅ Sauvegardé !
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Aperçu ticket */}
      <div className="bg-white rounded-2xl p-8 max-w-2xl mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          🧾 Aperçu en-tête ticket
        </h2>
        
        <div className="bg-gray-100 rounded-xl p-6 font-mono text-center text-sm">
          <p className="font-bold text-lg">{form.name || 'Nom établissement'}</p>
          {form.address && <p className="text-gray-600">{form.address}</p>}
          {form.phone && <p className="text-gray-600">{form.phone}</p>}
          {form.vat_number && <p className="text-gray-600">TVA: {form.vat_number}</p>}
        </div>
      </div>
    </div>
  )
}
